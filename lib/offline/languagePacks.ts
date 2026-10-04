import { deviceVoicesFor } from '@/lib/engines/speech/local';
import { NLLB_LANGUAGE_CATALOG } from './nllbLanguages';
import { tesseractSupports } from './tesseractLocal';
import { getModelFile } from './modelStorage';
import { sha256Hex } from './integrity';
import { verifyOfflineRuntimeAssets } from './runtimeAssets';
import { modelFileKey, offlineUrlKey } from './storageKeys';

/**
 * Offline language-pack registry. The translation pack is shared: one
 * verified NLLB download unlocks the whole product-facing catalog. Per-
 * language definitions remain useful for native labels, speech, and OCR.
 *
 * Honest capability states:
 * - translation packs with a manifest download for real; all catalog entries
 *   currently point at the same verified NLLB base.
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
  popular?: boolean;
  languageCode: string;
  bcp47: string[];
  version: string;
  /** The verified manifest used by this language's shared translation pack. */
  manifestUrl?: string;
  manifestId?: string;
  translation: 'coming-soon' | 'downloadable';
  ocr: 'online-only' | 'printed-offline';
};

const NLLB_MANIFEST_URL = '/offline-packs/nllb-base-v1.json';
const NLLB_MANIFEST_ID = 'nllb-base';
const NLLB_VERSION = 'v1';
const LEGACY_IDS: Record<string, string> = { Telugu: 'te', Tamil: 'ta', Hindi: 'hi' };
const BCP47_OVERRIDES: Record<string, string[]> = {
  Telugu: ['te-IN', 'te'], Tamil: ['ta-IN', 'ta'], Hindi: ['hi-IN', 'hi'], Kannada: ['kn-IN', 'kn'],
  Malayalam: ['ml-IN', 'ml'], Bengali: ['bn-IN', 'bn'], Marathi: ['mr-IN', 'mr'], Gujarati: ['gu-IN', 'gu'],
  Punjabi: ['pa-IN', 'pa'], Urdu: ['ur-IN', 'ur'], Odia: ['or-IN', 'or'], Assamese: ['as-IN', 'as'],
  Sanskrit: ['sa-IN', 'sa'], Nepali: ['ne-NP', 'ne'], Maithili: ['mai', 'mai'], Bhojpuri: ['bho', 'bho'],
  Kashmiri: ['ks-Arab', 'ks'], Santali: ['sat', 'sat'], Sinhala: ['si-LK', 'si'], English: ['en-US', 'en-GB', 'en'],
  Spanish: ['es-ES', 'es'], French: ['fr-FR', 'fr'], German: ['de-DE', 'de'], Italian: ['it-IT', 'it'],
  Portuguese: ['pt-PT', 'pt-BR', 'pt'], Dutch: ['nl-NL', 'nl'], Greek: ['el-GR', 'el'], Catalan: ['ca-ES', 'ca'],
  Basque: ['eu-ES', 'eu'], Welsh: ['cy-GB', 'cy'], Irish: ['ga-IE', 'ga'], Albanian: ['sq-AL', 'sq'],
  Romanian: ['ro-RO', 'ro'], Polish: ['pl-PL', 'pl'], Czech: ['cs-CZ', 'cs'], Slovak: ['sk-SK', 'sk'],
  Hungarian: ['hu-HU', 'hu'], Bulgarian: ['bg-BG', 'bg'], Serbian: ['sr-RS', 'sr'], Croatian: ['hr-HR', 'hr'],
  Slovenian: ['sl-SI', 'sl'], Macedonian: ['mk-MK', 'mk'], Russian: ['ru-RU', 'ru'], Ukrainian: ['uk-UA', 'uk'],
  Lithuanian: ['lt-LT', 'lt'], Latvian: ['lv-LV', 'lv'], Estonian: ['et-EE', 'et'], Finnish: ['fi-FI', 'fi'],
  Swedish: ['sv-SE', 'sv'], Norwegian: ['nb-NO', 'no'], Danish: ['da-DK', 'da'], Arabic: ['ar-SA', 'ar'],
  Persian: ['fa-IR', 'fa'], Pashto: ['ps-AF', 'ps'], 'Kurdish (Kurmanji)': ['ku', 'ku'], Kazakh: ['kk-KZ', 'kk'],
  Uzbek: ['uz-UZ', 'uz'], Kyrgyz: ['ky-KG', 'ky'], Tajik: ['tg-TJ', 'tg'], Mongolian: ['mn-MN', 'mn'],
  Uyghur: ['ug-CN', 'ug'], Turkish: ['tr-TR', 'tr'], Azerbaijani: ['az-AZ', 'az'], Georgian: ['ka-GE', 'ka'],
  Armenian: ['hy-AM', 'hy'], Hebrew: ['he-IL', 'he'], 'Chinese (Simplified)': ['zh-CN', 'zh'],
  'Chinese (Traditional)': ['zh-TW', 'zh'], 'Chinese (Cantonese)': ['zh-HK', 'zh'], Japanese: ['ja-JP', 'ja'],
  Korean: ['ko-KR', 'ko'], Vietnamese: ['vi-VN', 'vi'], Thai: ['th-TH', 'th'], Lao: ['lo-LA', 'lo'],
  Khmer: ['km-KH', 'km'], Burmese: ['my-MM', 'my'], Indonesian: ['id-ID', 'id'], Malay: ['ms-MY', 'ms'],
  Tagalog: ['fil-PH', 'tl', 'fil'], Cebuano: ['ceb', 'ceb'], Javanese: ['jv', 'jv'], Sundanese: ['su', 'su'],
  Amharic: ['am-ET', 'am'], Swahili: ['sw-KE', 'sw'], Hausa: ['ha-NG', 'ha'], Yoruba: ['yo-NG', 'yo'],
  Igbo: ['ig-NG', 'ig'], Zulu: ['zu-ZA', 'zu'], Xhosa: ['xh-ZA', 'xh'], Shona: ['sn-ZW', 'sn'],
  Afrikaans: ['af-ZA', 'af'], Somali: ['so-SO', 'so'], Oromo: ['om-ET', 'om'], Akan: ['ak-GH', 'ak'],
  Ewe: ['ee-GH', 'ee'], Wolof: ['wo-SN', 'wo'], 'Haitian Creole': ['ht-HT', 'ht'], Quechua: ['qu', 'qu'],
  Guarani: ['gn-PY', 'gn'], Esperanto: ['eo', 'eo'],
};

export const PACK_DEFS: LanguagePackDef[] = NLLB_LANGUAGE_CATALOG.map((language) => ({
  id: LEGACY_IDS[language.name] ?? `nllb-${language.code.toLowerCase()}`,
  language: language.name,
  native: language.native,
  popular: language.popular,
  languageCode: language.code,
  bcp47: BCP47_OVERRIDES[language.name] ?? [language.code.slice(0, 3)],
  version: NLLB_VERSION,
  manifestUrl: NLLB_MANIFEST_URL,
  manifestId: NLLB_MANIFEST_ID,
  translation: 'downloadable' as const,
  ocr: tesseractSupports(language.name) ? 'printed-offline' as const : 'online-only' as const,
}));

const STATUS_KEY = 'mothertongue-pack-status-v1';
const runtimeVerifiedPacks = new Set<string>();

export function packReceiptKey(manifestUrl: string): string {
  return `receipt-by-manifest/${encodeURIComponent(manifestUrl)}`;
}

/** Read the shared receipt, with a migration fallback for pre-shared packs. */
export async function findStoredPackReceipt(language: string): Promise<Blob | null> {
  const def = PACK_DEFS.find((p) => p.language === language);
  if (!def?.manifestUrl) return null;
  const shared = await getModelFile(packReceiptKey(def.manifestUrl));
  if (shared) return shared;
  for (const sibling of PACK_DEFS) {
    if (sibling.manifestUrl !== def.manifestUrl) continue;
    const legacy = await getModelFile(`receipt-by-language/${sibling.language}`);
    if (legacy) return legacy;
  }
  return null;
}

export function clearRuntimePackVerification(): void {
  runtimeVerifiedPacks.clear();
}

type StoredStatus = Record<string, 'not-downloaded' | 'downloading' | 'ready' | 'error'>;

type PackStatus = StoredStatus[string];

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
  const stored = readStored();
  const siblingStatuses = PACK_DEFS
    .filter((p) => p.manifestUrl === def.manifestUrl)
    .map((p) => stored[p.id])
    .filter((status): status is PackStatus => Boolean(status));
  if (siblingStatuses.includes('ready')) return 'ready';
  if (siblingStatuses.includes('downloading')) return 'downloading';
  if (siblingStatuses.includes('error')) return 'error';
  return 'not-downloaded';
}

export function setPackStatus(language: string, status: 'not-downloaded' | 'downloading' | 'ready' | 'error'): void {
  const def = PACK_DEFS.find((p) => p.language === language);
  if (!def) return;
  try {
    const all = readStored();
    for (const sibling of PACK_DEFS) {
      if (sibling.manifestUrl === def.manifestUrl) all[sibling.id] = status;
    }
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
      translation: def.translation === 'coming-soon' || !def.manifestUrl ? 'coming-soon' : getPackStatus(def.language, 'translation'),
      speechVoice: voices[0] ?? null,
      speech: voices.length > 0 ? 'device-ready' : 'device-missing',
      ocr: def.ocr,
    };
  });
}

async function storedCacheApiBlob(file: { cacheApi?: { cache: string; request: string } }): Promise<Blob | null> {
  if (!file.cacheApi) return null;
  if (typeof caches !== 'undefined') {
    const response = await (await caches.open(file.cacheApi.cache)).match(file.cacheApi.request);
    if (response) return response.blob();
  }
  const mapping = await getModelFile(offlineUrlKey(file.cacheApi.request));
  if (!mapping) return null;
  const parsed = JSON.parse(await mapping.text()) as { key?: unknown };
  return typeof parsed.key === 'string' ? getModelFile(parsed.key) : null;
}

/** Verify receipts, sizes, and each pack's hashes before offline inference. */
export async function verifyStoredPack(language: string): Promise<boolean> {
  const def = PACK_DEFS.find((p) => p.language === language);
  if (!def?.manifestUrl || getPackStatus(language, 'translation') !== 'ready') return false;
  try {
    if (!(await verifyOfflineRuntimeAssets())) {
      setPackStatus(language, 'not-downloaded');
      return false;
    }
    const receipt = await findStoredPackReceipt(language);
    if (!receipt) return false;
    const manifest = JSON.parse(await receipt.text()) as {
      id?: unknown;
      version?: unknown;
      files?: Array<{ sha256?: unknown; bytes?: unknown; cacheApi?: { cache: string; request: string } }>;
    };
    if (
      typeof manifest.id !== 'string' || typeof manifest.version !== 'string'
      || manifest.id !== def.manifestId || manifest.version !== def.version || !Array.isArray(manifest.files)
    ) {
      setPackStatus(language, 'not-downloaded');
      return false;
    }
    const runtimeKey = `${manifest.id}:${manifest.version}`;
    const needsDeepHash = !runtimeVerifiedPacks.has(runtimeKey);
    for (const [index, file] of manifest.files.entries()) {
      const verification = await getModelFile(`verified/${manifest.id}/${manifest.version}/${index}`);
      if (!verification) {
        setPackStatus(language, 'not-downloaded');
        return false;
      }
      const verified = JSON.parse(await verification.text()) as { sha256?: unknown; bytes?: unknown };
      if (verified.sha256 !== file.sha256 || verified.bytes !== file.bytes) {
        setPackStatus(language, 'not-downloaded');
        return false;
      }
      const blob = file.cacheApi
        ? await storedCacheApiBlob(file)
        : await getModelFile(modelFileKey(manifest.id, manifest.version, index));
      if (!blob || blob.size !== file.bytes) {
        setPackStatus(language, 'not-downloaded');
        runtimeVerifiedPacks.delete(runtimeKey);
        return false;
      }
      if (needsDeepHash && (await sha256Hex(blob)).toLowerCase() !== String(file.sha256).toLowerCase()) {
        setPackStatus(language, 'not-downloaded');
        runtimeVerifiedPacks.delete(runtimeKey);
        return false;
      }
    }
    runtimeVerifiedPacks.add(runtimeKey);
    return true;
  } catch {
    setPackStatus(language, 'not-downloaded');
    return false;
  }
}
