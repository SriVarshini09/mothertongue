import { chunkForSpeech } from '@/lib/chunks';
import { audioCacheKey, getCachedAudioUrl, setCachedAudioUrl } from '@/lib/cache/audio';
import type { CloudSpeechEngine as CloudSpeechEngineContract, CloudAudioResult } from './types';

/** Cloud speech: chunked POST /api/speech merged into one session blob. */
export class CloudSpeechEngine implements CloudSpeechEngineContract {
  readonly kind = 'cloud' as const;

  async synthesize(input: {
    text: string;
    language: string;
    onProgress?: (done: number, total: number) => void;
    beforeChunk?: () => Promise<void>;
  }): Promise<CloudAudioResult> {
    const chunks = chunkForSpeech(input.text, 3500);
    if (chunks.length > 8) {
      throw new Error('This translation is quite long for audio. Try a shorter passage for listening.');
    }
    const key = await audioCacheKey({ translatedText: input.text, language: input.language });
    const hit = getCachedAudioUrl(key);
    if (hit) return { url: hit, engine: 'cloud' };
    const buffers: ArrayBuffer[] = [];
    for (let i = 0; i < chunks.length; i++) {
      input.onProgress?.(i, chunks.length);
      await input.beforeChunk?.();
      const res = await fetch('/api/speech', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: chunks[i], language: input.language }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        throw new Error(typeof data.error === 'string' ? data.error : 'We could not prepare the audio.');
      }
      buffers.push(await res.arrayBuffer());
    }
    input.onProgress?.(chunks.length, chunks.length);
    let total = 0;
    buffers.forEach((b) => (total += b.byteLength));
    const merged = new Uint8Array(total);
    let offset = 0;
    buffers.forEach((b) => {
      merged.set(new Uint8Array(b), offset);
      offset += b.byteLength;
    });
    const blob = new Blob([merged.buffer as ArrayBuffer], { type: 'audio/mpeg' });
    const url = URL.createObjectURL(blob);
    setCachedAudioUrl(key, url);
    return { url, engine: 'cloud' };
  }
}
