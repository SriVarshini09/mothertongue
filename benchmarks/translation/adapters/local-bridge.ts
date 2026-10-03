import { spawn, type ChildProcess } from 'node:child_process';
import * as path from 'node:path';

/**
 * Persistent JSON-lines bridge to a Python HF worker.
 * The model loads ONCE; each case is one stdin line, one stdout line.
 * Lazy: nothing spawns unless the adapter is actually selected.
 */
export class LocalModelBridge {
  private child: ChildProcess | null = null;
  private pending = new Map<string, { resolve: (v: string) => void; reject: (e: Error) => void }>();
  private seq = 0;
  private buffer = '';

  constructor(
    private script: string,
    private modelId: string,
    private extraEnv: Record<string, string> = {}
  ) {}

  private start(): void {
    if (this.child) return;
    const scriptPath = path.join(__dirname, this.script);
    this.child = spawn('python', [scriptPath, '--model', this.modelId], {
      env: { ...process.env, ...this.extraEnv, PYTHONIOENCODING: 'utf-8' },
      stdio: ['pipe', 'pipe', 'inherit'],
    });
    this.child.stdout?.on('data', (chunk: Buffer) => {
      this.buffer += chunk.toString('utf-8');
      const lines = this.buffer.split('\n');
      this.buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line) as { id?: string; text?: string; error?: string };
          if (msg.id && this.pending.has(msg.id)) {
            const { resolve, reject } = this.pending.get(msg.id)!;
            this.pending.delete(msg.id);
            if (typeof msg.text === 'string') resolve(msg.text);
            else reject(new Error(msg.error || 'worker-error'));
          }
        } catch {
          /* ignore malformed worker lines */
        }
      }
    });
    this.child.on('error', (err) => {
      for (const { reject } of this.pending.values()) reject(err);
      this.pending.clear();
      this.child = null;
    });
  }

  static probe(): { ok: boolean; reason?: string } {
    try {
      const out = require('node:child_process').execSync('python --version', {
        encoding: 'utf-8',
        timeout: 15000,
      }) as string;
      if (!/python 3/i.test(out)) return { ok: false, reason: 'python3 not found' };
      return { ok: true };
    } catch {
      return { ok: false, reason: 'python3 not found' };
    }
  }

  async translate(
    text: string,
    targetCode: string,
    timeoutMs = 180000
  ): Promise<string> {
    this.start();
    if (!this.child?.stdin) throw new Error('worker-spawn-failed');
    const id = `r${++this.seq}`;
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('worker-timeout'));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      this.child!.stdin!.write(JSON.stringify({ id, text, tgt: targetCode }) + '\n');
    });
  }

  stop(): void {
    try {
      this.child?.stdin?.end();
      this.child?.kill();
    } catch {
      /* ignore */
    }
    this.child = null;
  }
}
