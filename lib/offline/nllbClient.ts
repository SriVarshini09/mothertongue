import { nllbSupports, nllbTranslate } from './nllbCore';

/**
 * Browser NLLB translation client: Web Worker first (UI stays responsive),
 * main-thread fallback if workers are unavailable. One worker per session;
 * call release() when switching languages under memory pressure.
 */

type Pending = { resolve: (v: string) => void; reject: (e: Error) => void };

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<string, Pending>();
let warmResolve: (() => void) | null = null;
let warmReject: ((error: Error) => void) | null = null;
let warmPromise: Promise<void> | null = null;

function getWorker(): Worker | null {
  if (worker) return worker;
  try {
    if (typeof Worker === 'undefined') return null;
    const w = new Worker(new URL('./nllb.worker.ts', import.meta.url));
    w.onmessage = (event: MessageEvent<{ type?: string; id?: string; text?: string; error?: string }>) => {
      if (event.data?.type === 'ready') {
        warmResolve?.();
        warmResolve = null;
        warmReject = null;
        return;
      }
      const { id, text, error } = event.data ?? {};
      if (!id || !pending.has(id)) return;
      const { resolve, reject } = pending.get(id)!;
      pending.delete(id);
      if (typeof text === 'string') resolve(text);
      else reject(new Error(error || 'worker-error'));
    };
    w.onerror = () => {
      warmReject?.(new Error('worker-warmup-failed'));
      warmResolve = null;
      warmReject = null;
      for (const { reject } of pending.values()) reject(new Error('worker-error'));
      pending.clear();
      try {
        w.terminate();
      } catch {
        /* ignore */
      }
      if (worker === w) worker = null;
    };
    worker = w;
    return w;
  } catch {
    return null;
  }
}

function callWorker(
  text: string,
  targetLanguage: string,
  timeoutMs: number,
  sourceLanguage: string
): Promise<string> {
  const w = getWorker();
  if (!w) return Promise.reject(new Error('worker-unavailable'));
  const id = `nllb-${++seq}`;
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('worker-timeout'));
    }, timeoutMs);
    pending.set(id, {
      resolve: (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      reject: (e) => {
        clearTimeout(timer);
        reject(e);
      },
    });
    w.postMessage({ id, text, targetLanguage, sourceLanguage });
  });
}

export async function translateOffline(
  text: string,
  targetLanguage: string,
  sourceLanguage: string,
  opts: { timeoutMs?: number } = {}
): Promise<string> {
  if (!nllbSupports(targetLanguage)) throw new Error(`nllb-unsupported-language: ${targetLanguage}`);
  const timeoutMs = opts.timeoutMs ?? 180000;
  try {
    return await callWorker(text, targetLanguage, timeoutMs, sourceLanguage);
  } catch {
    // Worker failed (unsupported env, OOM, timeout): one main-thread attempt.
    return nllbTranslate(text, targetLanguage, sourceLanguage);
  }
}

/** Load the offline client, worker, and Transformers.js chunks while online. */
export async function preloadOfflineRuntime(): Promise<void> {
  const w = getWorker();
  if (!w) {
    await import('@huggingface/transformers');
    return;
  }
  if (!warmPromise) {
    warmPromise = new Promise<void>((resolve, reject) => {
      warmResolve = resolve;
      warmReject = reject;
    }).catch((error) => {
      warmPromise = null;
      throw error;
    });
    w.postMessage({ type: 'warm' });
  }
  await warmPromise;
}

export function releaseOfflineTranslator(): void {
  try {
    worker?.terminate();
  } catch {
    /* ignore */
  }
  worker = null;
  pending.clear();
  warmResolve = null;
  warmReject = null;
  warmPromise = null;
}
