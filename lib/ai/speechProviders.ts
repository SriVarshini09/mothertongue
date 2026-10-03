import type OpenAI from 'openai';
import type { DeliveryProfile } from '@/types/speech';
import { chunkForSpeechSegments } from '@/lib/documents/chunk';
import { generateSpeech } from '@/lib/ai/speech';

/**
 * Speech provider orchestration.
 *
 * - openai (default): gpt-4o-mini-tts, all languages.
 * - sarvam (bulbul:v3, mp3 codec): expressive voices for supported
 *   Indic languages + English. Requires SARVAM_API_KEY and
 *   SPEECH_PROVIDER=sarvam. Anything unsupported falls back to OpenAI
 *   per request, so speech never breaks.
 *
 * Both paths speak the EXACT provided text; only delivery varies.
 * Provider mapping is deterministic per (env, language), which keeps the
 * client audio cache (keyed on text+language+voice+model) valid.
 */

export type SpeechProviderId = 'openai' | 'sarvam';

export const SARVAM_MODEL = 'bulbul:v3';
export const SARVAM_MAX_CHARS = 2400;

const SARVAM_CODES: Record<string, string> = {
  Telugu: 'te-IN',
  Tamil: 'ta-IN',
  Hindi: 'hi-IN',
  Kannada: 'kn-IN',
  Malayalam: 'ml-IN',
  Bengali: 'bn-IN',
  Marathi: 'mr-IN',
  Gujarati: 'gu-IN',
  Punjabi: 'pa-IN',
  English: 'en-IN',
};

const PACE_MAP: Record<DeliveryProfile['pace'], number> = {
  slow: 0.85,
  'slightly-slow': 0.9,
  medium: 1.0,
  'slightly-fast': 1.1,
};

function requestedProvider(): SpeechProviderId {
  return process.env.SPEECH_PROVIDER === 'sarvam' ? 'sarvam' : 'openai';
}

export function sarvamSupports(language: string): boolean {
  return Boolean(process.env.SARVAM_API_KEY && SARVAM_CODES[language]);
}

/** Resolve the provider for one request, with safe fallbacks. */
export function selectSpeechProvider(language: string): {
  provider: SpeechProviderId;
  sarvamCode: string | null;
} {
  if (requestedProvider() === 'sarvam' && sarvamSupports(language)) {
    return { provider: 'sarvam', sarvamCode: SARVAM_CODES[language] };
  }
  return { provider: 'openai', sarvamCode: null };
}

function sarvamTemperature(expressiveness: number): number {
  // DeliveryProfile restrains to 0.15-0.65; map onto bulbul:v3's
  // temperature (0.01-2.0) conservatively to avoid artifacts.
  return Math.min(1.0, Math.max(0.1, 0.2 + expressiveness * 0.8));
}

async function generateSarvamSpeech(args: {
  text: string;
  languageCode: string;
  profile: DeliveryProfile;
}): Promise<Uint8Array<ArrayBuffer>> {
  const key = process.env.SARVAM_API_KEY;
  if (!key) throw new Error('SARVAM_API_KEY is not configured');
  // bulbul:v3 caps a single text at 2500 chars; split on sentences,
  // synthesize in one array call, concatenate the MP3 segments.
  const pieces = chunkForSpeechSegments(args.text, SARVAM_MAX_CHARS).map((c) => c.text);
  const speaker = process.env.SPEECH_SPEAKER?.trim().toLowerCase() || 'shubh';
  const res = await fetch('https://api.sarvam.ai/text-to-speech', {
    method: 'POST',
    headers: { 'api-subscription-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: pieces.length === 1 ? pieces[0] : pieces,
      language_code: args.languageCode,
      speaker,
      pace: PACE_MAP[args.profile.pace] ?? 1.0,
      model: SARVAM_MODEL,
      output_audio_codec: 'mp3',
      temperature: sarvamTemperature(args.profile.expressiveness),
    }),
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(`sarvam-http-${res.status}`);
  const audios = body.audios;
  if (!Array.isArray(audios) || audios.length === 0 || audios.some((a) => typeof a !== 'string')) {
    throw new Error('sarvam-empty-audio');
  }
  const buffers = (audios as string[]).map((b64) => Buffer.from(b64, 'base64'));
  const total = buffers.reduce((n, b) => n + b.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const b of buffers) {
    merged.set(b, offset);
    offset += b.length;
  }
  return merged as Uint8Array<ArrayBuffer>;
}

export async function synthesizeSpeech(
  openai: OpenAI,
  args: { text: string; language: string; profile: DeliveryProfile }
): Promise<{ audio: Uint8Array<ArrayBuffer>; provider: SpeechProviderId; contentType: string }> {
  const { provider, sarvamCode } = selectSpeechProvider(args.language);
  if (provider === 'sarvam' && sarvamCode) {
    try {
      const audio = await generateSarvamSpeech({
        text: args.text,
        languageCode: sarvamCode,
        profile: args.profile,
      });
      return { audio, provider, contentType: 'audio/mpeg' };
    } catch {
      // A single provider must never break speech: fall through to OpenAI.
    }
  }
  const audio = await generateSpeech(openai, { text: args.text, ttsInstructions: args.profile.ttsInstructions });
  return { audio, provider: 'openai', contentType: 'audio/mpeg' };
}
