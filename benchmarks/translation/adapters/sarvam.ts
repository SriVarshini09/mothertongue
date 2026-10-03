import type { TranslationAdapter } from './types';

/**
 * SARVAM TRANSLATE — official API only (https://api.sarvam.ai/translate).
 * Skips gracefully when SARVAM_API_KEY is missing. Sarvam covers
 * English<->Indic only, so other target languages report unsupported.
 */

const SARVAM_CODES: Record<string, string> = {
  Telugu: 'te-IN',
  Tamil: 'ta-IN',
  Hindi: 'hi-IN',
  Kannada: 'kn-IN',
  Malayalam: 'ml-IN',
};

export const sarvamAdapter: TranslationAdapter = {
  id: 'sarvam',
  label: 'Sarvam Translate (mayura:v1)',
  supportedLanguages: Object.keys(SARVAM_CODES),
  isAvailable() {
    if (!process.env.SARVAM_API_KEY) {
      return { available: false, reason: 'SARVAM_API_KEY is not set' };
    }
    return { available: true };
  },
  async translate(source: string, targetLanguage: string) {
    const key = process.env.SARVAM_API_KEY;
    if (!key) throw new Error('missing-key');
    const target = SARVAM_CODES[targetLanguage];
    if (!target) throw new Error('unsupported-language');
    const started = Date.now();
    const res = await fetch('https://api.sarvam.ai/translate', {
      method: 'POST',
      headers: { 'api-subscription-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: source,
        source_language_code: 'en-IN',
        target_language_code: target,
        model: 'mayura:v1',
        mode: 'formal',
        output_script: 'fully-native',
      }),
    });
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) throw new Error(`http-${res.status}`);
    const out = body.translated_text;
    if (typeof out !== 'string' || !out.trim()) throw new Error('empty translation');
    return { translation: out.trim(), latencyMs: Date.now() - started };
  },
};
