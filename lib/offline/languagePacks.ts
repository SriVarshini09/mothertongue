import { deviceVoicesFor } from '@/lib/engines/speech/local';

/**
 * Offline language-pack registry. Phase 1 covers Telugu/Tamil/Hindi and is
 * extensible by adding definitions — no per-language UI logic needed.
 *
 * Honest capability states:
 * - translation packs with manifests (Te/Ta/Hi share the verified NLLB
 *   base) download for real; languages without manifests report
 *   'coming-soon' and the UI offers no fake download button.
 * - speech uses on-device voices; readiness is detected live, never assumed.
 * - OCR is on-device printed text (Tesseract) for packs marked
 *   'printed-offline'; handwriting stays cloud-only.
 */

export type PackCapabilityState =
  | 'ready'
  | 'not-downloaded'
  | 'downloading'
  | 'error'
  | 'coming-soon'
  | 'device-ready'
  | 'device-missing'
  | 'online-only';

export type LanguagePackDef = {
  id: string;
  language: string;
  native: string;
  languageCode: string;
  bcp47: string[];
  version: string;
  /** Undefined until a real Phase-2 model manifest ships (no invented sizes). */
  manifestUrl?: string;
  translation: 'coming-soon' | 'downloadable';
  ocr: 'online-only' | 'printed-offline';
};

export const PACK_DEFS: LanguagePackDef[] = [
  { id: 'te', language: 'Telugu', native: 'తెలుగు', languageCode: 'tel_Telu', bcp47: ['te-IN', 'te'], version: 'v1', manifestUrl: '/offline-packs/nllb-base-v1.json', translation: 'downloadable', ocr: 'printed-offline' },
  { id: 'ta', language: 'Tamil', native: 'தமிழ்', languageCode: 'tam_Taml', bcp47: ['ta-IN', 'ta'], version: 'v1', manifestUrl: '/offline-packs/nllb-base-v1.json', translation: 'downloadable', ocr: 'printed-offline' },
  { id: 'hi', language: 'Hindi', native: 'हिन्दी', languageCode: 'hin_Deva', bcp47: ['hi-IN', 'hi'], version: 'v1', manifestUrl: '/offline-packs/nllb-base-v1.json', translation: 'downloadable', ocr: 'printed-offline' },
  { id: 'kn', language: 'Kannada', native: 'ಕನ್ನಡ', languageCode: 'kan_Knda', bcp47: ['kn-IN', 'kn'], version: 'v1', translation: 'coming-soon', ocr: 'online-only' },
  { id: 'ml', language: 'Malayalam', native: 'മലയാളം', languageCode: 'mal_Mlym', bcp47: ['ml-IN', 'ml'], version: 'v1', translation: 'coming-soon', ocr: 'online-only' },
  { id: 'bn', language: 'Bengali', native: 'বাংলা', languageCode: 'ben_Beng', bcp47: ['bn-IN', 'bn'], version: 'v1', translation: 'coming-soon', ocr: 'online-only' },
  { id: 'mr', language: 'Marathi', native: 'मराठी', languageCode: 'mar_Deva', bcp47: ['mr-IN', 'mr'], version: 'v1', translation: 'coming-soon', ocr: 'online-only' },
  { id: 'ja', language: 'Japanese', native: '日本語', languageCode: 'jpn_Jpan', bcp47: ['ja-JP', 'ja'], version: 'v1', translation: 'coming-soon', ocr: 'online-only' },
  { id: 'ko', language: 'Korean', native: '한국어', languageCode: 'kor_Hang', bcp47: ['ko-KR', 'ko'], version: 'v1', translation: 'coming-soon', ocr: 'online-only' },
  { id: 'es', language: 'Spanish', native: 'Español', languageCode: 'spa_Latn', bcp47: ['es-ES', 'es'], version: 'v1', translation: 'coming-soon', ocr: 'online-only' },
];

const STATUS_KEY = 'mothertongue-pack-status-v1';

type StoredStatus = Record<string, 'not-downloaded' | 'downloading' | 'ready' | 'error'>;

function readStored(): StoredStatus {
  try {
    return JSON.parse(localStorage.getItem(STATUS_KEY) || '{}') as StoredStatus;
  } catch {
    return {};
  }
}

export function getPackStatus(
  language: string,
  capability: 'translation'
): 'ready' | 'not-downloaded' | 'downloading' | 'error' | 'coming-soon' {
  const def = PACK_DEFS.find((p) => p.language === language);
  if (!def || def.translation === 'coming-soon' || !def.manifestUrl) return 'coming-soon';
  return readStored()[def.id] ?? 'not-downloaded';
}

export function setPackStatus(language: string, status: 'not-downloaded' | 'downloading' | 'ready' | 'error'): void {
  const def = PACK_DEFS.find((p) => p.language === language);
  if (!def) return;
  try {
    const all = readStored();
    all[def.id] = status;
    localStorage.setItem(STATUS_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

export type PackCapabilitySummary = {
  def: LanguagePackDef;
  translation: PackCapabilityState;
  /** Best matching on-device voice, if any. */
  speechVoice: { name: string; lang: string } | null;
  speech: 'device-ready' | 'device-missing';
  ocr: 'online-only' | 'printed-offline';
};

/** Live capability summary for the settings UI. No assumed readiness. */
export function packCapabilities(): PackCapabilitySummary[] {
  return PACK_DEFS.map((def) => {
    const voices = deviceVoicesFor(def.language);
    return {
      def,
      translation: def.translation === 'coming-soon' || !def.manifestUrl ? 'coming-soon' : (readStored()[def.id] ?? 'not-downloaded'),
      speechVoice: voices[0] ?? null,
      speech: voices.length > 0 ? 'device-ready' : 'device-missing',
      ocr: def.ocr,
    };
  });
}
