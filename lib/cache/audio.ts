import { SPEECH_MODEL, SPEECH_VOICE } from '@/lib/ai/speech';

/**
 * Session audio cache. Key covers translatedText + language + voice +
 * model. The delivery profile is a deterministic function of (text,
 * language), so it needs no separate key component — identical inputs
 * always yield identical styles and identical audio.
 */

export type AudioCacheKeyInput = {
  translatedText: string;
  language: string;
};

export async function audioCacheKey({ translatedText, language }: AudioCacheKeyInput): Promise<string> {
  const material = [translatedText, language, SPEECH_VOICE, SPEECH_MODEL].join('\u0000');
  if (typeof crypto !== 'undefined' && 'subtle' in crypto) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(material));
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Non-secure contexts fallback (deterministic, non-crypto).
  let hash = 0;
  for (let i = 0; i < material.length; i++) {
    hash = (hash * 31 + material.charCodeAt(i)) | 0;
  }
  return `fallback-${(hash >>> 0).toString(16)}`;
}

const MAX_ENTRIES = 5;
const urls = new Map<string, string>();

export function getCachedAudioUrl(key: string): string | undefined {
  return urls.get(key);
}

/** Stores an object URL; evicts the oldest entry (revoking it) past the cap. */
export function setCachedAudioUrl(key: string, url: string): void {
  if (urls.has(key)) {
    const old = urls.get(key);
    if (old && old !== url) URL.revokeObjectURL(old);
    urls.delete(key);
  }
  urls.set(key, url);
  while (urls.size > MAX_ENTRIES) {
    const oldest = urls.keys().next();
    if (oldest.done) break;
    const evicted = urls.get(oldest.value);
    if (evicted) URL.revokeObjectURL(evicted);
    urls.delete(oldest.value);
  }
}

/** Remove a URL from the cache before revoking it. Prevents stale revoked URLs. */
export function releaseCachedAudioUrl(url: string): void {
  for (const [key, cached] of urls) {
    if (cached === url) urls.delete(key);
  }
  URL.revokeObjectURL(url);
}

export function clearAudioCache(): void {
  urls.forEach((url) => URL.revokeObjectURL(url));
  urls.clear();
}
