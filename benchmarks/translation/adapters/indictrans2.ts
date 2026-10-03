import { LocalModelBridge } from './local-bridge';
import type { TranslationAdapter } from './types';

/**
 * INDIC TRANS 2 (AI4Bharat) — local Hugging Face inference.
 * English -> Indic only (official en-indic checkpoint); other targets
 * report unsupported. Model loads lazily once, only when selected.
 * Correct FLORES codes; preprocessing isolated in indictrans2.py.
 */

const FLORES: Record<string, string> = {
  Telugu: 'tel_Telu',
  Tamil: 'tam_Taml',
  Hindi: 'hin_Deva',
  Kannada: 'kan_Knda',
  Malayalam: 'mal_Mlym',
};

const MODEL_ID =
  process.env.INDICTRANS2_MODEL || 'ai4bharat/indictrans2-en-indic-1B';

let bridge: LocalModelBridge | null = null;

export const indictrans2Adapter: TranslationAdapter = {
  id: 'indictrans2',
  label: `IndicTrans2 (${MODEL_ID})`,
  supportedLanguages: Object.keys(FLORES),
  isAvailable() {
    const probe = LocalModelBridge.probe();
    if (!probe.ok) {
      return { available: false, reason: `local inference unavailable: ${probe.reason}` };
    }
    // All official IndicTrans2 checkpoints are auth-gated on Hugging Face:
    // use requires an HF_TOKEN whose account accepted the model license.
    if (!process.env.HF_TOKEN) {
      return {
        available: false,
        reason:
          'auth-gated checkpoint: set HF_TOKEN (account must accept the IndicTrans2 license)',
      };
    }
    return { available: true };
  },
  async translate(source: string, targetLanguage: string) {
    const code = FLORES[targetLanguage];
    if (!code) throw new Error('unsupported-language');
    const extra: Record<string, string> = {
      // Beams=1 keeps CPU-bound local inference feasible; documented in the report.
      IT2_BEAMS: process.env.IT2_BEAMS ?? '1',
    };
    if (process.env.HF_TOKEN) extra.HF_TOKEN = process.env.HF_TOKEN;
    bridge ??= new LocalModelBridge('indictrans2.py', MODEL_ID, extra);
    const started = Date.now();
    try {
      const text = await bridge.translate(source, code);
      if (!text.trim()) throw new Error('empty translation');
      return { translation: text.trim(), latencyMs: Date.now() - started };
    } catch (err) {
      bridge?.stop();
      bridge = null;
      throw err;
    }
  },
};

export function stopIndicTrans2(): void {
  bridge?.stop();
  bridge = null;
}
