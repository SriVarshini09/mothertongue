import { LocalModelBridge } from './local-bridge';
import type { TranslationAdapter } from './types';

/**
 * NLLB-200 (baseline, not a production recommendation).
 * Local Hugging Face inference, lazy single load, FLORES-200 codes.
 */

const FLORES: Record<string, string> = {
  Telugu: 'tel_Telu',
  Tamil: 'tam_Taml',
  Hindi: 'hin_Deva',
  Kannada: 'kan_Knda',
  Malayalam: 'mal_Mlym',
  Japanese: 'jpn_Jpan',
  Korean: 'kor_Hang',
  Spanish: 'spa_Latn',
};

const MODEL_ID = process.env.NLLB_MODEL || 'facebook/nllb-200-distilled-600M';

let bridge: LocalModelBridge | null = null;

export const nllbAdapter: TranslationAdapter = {
  id: 'nllb',
  label: `NLLB-200 baseline (${MODEL_ID})`,
  supportedLanguages: Object.keys(FLORES),
  isAvailable() {
    const probe = LocalModelBridge.probe();
    if (!probe.ok) {
      return { available: false, reason: `local inference unavailable: ${probe.reason}` };
    }
    return { available: true };
  },
  async translate(source: string, targetLanguage: string) {
    const code = FLORES[targetLanguage];
    if (!code) throw new Error('unsupported-language');
    bridge ??= new LocalModelBridge('nllb.py', MODEL_ID, {
      // Beams=1 keeps CPU-bound local inference feasible; documented in the report.
      NLLB_BEAMS: process.env.NLLB_BEAMS ?? '1',
    });
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

export function stopNllb(): void {
  bridge?.stop();
  bridge = null;
}
