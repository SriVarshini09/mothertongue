import type { DeviceSpeechEngine as DeviceSpeechEngineContract, DeviceVoiceInfo } from './types';
import { classifyDelivery } from '@/lib/offline/deliveryHeuristics';
import { NLLB_LANGUAGE_CATALOG } from '@/lib/offline/nllbLanguages';

/** BCP-47 tags tried per MotherTongue language, best first. */
const VOICE_TAGS: Record<string, string[]> = {
  Telugu: ['te-IN', 'te'],
  Tamil: ['ta-IN', 'ta'],
  Hindi: ['hi-IN', 'hi'],
  Kannada: ['kn-IN', 'kn'],
  Malayalam: ['ml-IN', 'ml'],
  Bengali: ['bn-IN', 'bn'],
  Marathi: ['mr-IN', 'mr'],
  Gujarati: ['gu-IN', 'gu'],
  Punjabi: ['pa-IN', 'pa'],
  Urdu: ['ur-IN', 'ur'],
  Chinese: ['zh-CN', 'zh'],
  Japanese: ['ja-JP', 'ja'],
  Korean: ['ko-KR', 'ko'],
  Spanish: ['es-ES', 'es'],
  French: ['fr-FR', 'fr'],
  German: ['de-DE', 'de'],
  Arabic: ['ar-SA', 'ar'],
  Portuguese: ['pt-PT', 'pt'],
  English: ['en-US', 'en-GB', 'en'],
};

/** Common ISO 639-3 to BCP-47 aliases used by browser speech voices. */
const NLLB_VOICE_ALIASES: Record<string, string[]> = {
  ace: ['ace'], acm: ['ar'], acq: ['ar'], aeb: ['ar'], ajp: ['ar'], apc: ['ar'], arb: ['ar'], ars: ['ar'], ary: ['ar'], arz: ['ar'],
  afr: ['af'], aka: ['ak'], amh: ['am'], asm: ['as'], ast: ['ast'], awa: ['awa'], ayr: ['ay'], azb: ['az'], azj: ['az'],
  bak: ['ba'], bam: ['bm'], ban: ['ban'], bel: ['be'], bem: ['bem'], ben: ['bn'], bho: ['bho'], bjn: ['bjn'], bod: ['bo'], bos: ['bs'], bug: ['bug'],
  ceb: ['ceb'], ces: ['cs'], cjk: ['cjk'], ckb: ['ku'], crh: ['crh'], cym: ['cy'], dan: ['da'], deu: ['de'], dik: ['dik'], dyu: ['dyu'], dzo: ['dz'],
  ell: ['el'], eng: ['en-US', 'en-GB', 'en'], epo: ['eo'], est: ['et'], eus: ['eu'], ewe: ['ee'], fao: ['fo'], pes: ['fa'], fij: ['fj'], fin: ['fi'], fon: ['fon'], fra: ['fr'], fur: ['fur'], fuv: ['ff'],
  gla: ['gd'], gle: ['ga'], glg: ['gl'], grn: ['gn'], guj: ['gu'], hat: ['ht'], hau: ['ha'], heb: ['he'], hin: ['hi'], hne: ['hne'], hrv: ['hr'], hun: ['hu'], hye: ['hy'],
  ibo: ['ig'], ilo: ['ilo'], ind: ['id'], isl: ['is'], ita: ['it'], jav: ['jv'], jpn: ['ja'], kab: ['kab'], kac: ['kac'], kam: ['kam'], kan: ['kn'], kas: ['ks'], kat: ['ka'], knc: ['kr'], kaz: ['kk'], kbp: ['kbp'], kea: ['kea'], khm: ['km'], kik: ['ki'], kin: ['rw'], kir: ['ky'], kmb: ['kmb'], kon: ['kg'], kor: ['ko'], kmr: ['ku'], lao: ['lo'], lvs: ['lv'], lij: ['lij'], lim: ['li'], lin: ['ln'], lit: ['lt'], lmo: ['lmo'], ltg: ['ltg'], ltz: ['lb'], lua: ['lua'], lug: ['lg'], luo: ['luo'], lus: ['lus'], mag: ['mag'], mai: ['mai'], mal: ['ml'], mar: ['mr'], min: ['min'], mkd: ['mk'], plt: ['mg'], mlt: ['mt'], mni: ['mni'], khk: ['mn'], mos: ['mos'], mri: ['mi'], zsm: ['ms'], mya: ['my'], nld: ['nl'], nno: ['nn'], nob: ['nb'], npi: ['ne'], nso: ['nso'], nus: ['nus'], nya: ['ny'], oci: ['oc'], gaz: ['om'], ory: ['or'], pag: ['pag'], pan: ['pa'], pap: ['pap'], pol: ['pl'], por: ['pt'], prs: ['fa'], pbt: ['ps'], quy: ['qu'], ron: ['ro'], run: ['rn'], rus: ['ru'], sag: ['sg'], san: ['sa'], sat: ['sat'], scn: ['scn'], shn: ['shn'], sin: ['si'], slk: ['sk'], slv: ['sl'], smo: ['sm'], sna: ['sn'], snd: ['sd'], som: ['so'], sot: ['st'], spa: ['es'], als: ['sq'], srd: ['sc'], srp: ['sr'], ssw: ['ss'], sun: ['su'], swe: ['sv'], swh: ['sw'], szl: ['szl'], tam: ['ta'], tat: ['tt'], tel: ['te'], tgk: ['tg'], tgl: ['fil', 'tl'], tha: ['th'], tir: ['ti'], taq: ['taq'], tpi: ['tpi'], tsn: ['tn'], tso: ['ts'], tuk: ['tk'], tum: ['tum'], tur: ['tr'], twi: ['tw'], tzm: ['tzm'], uig: ['ug'], ukr: ['uk'], umb: ['umb'], urd: ['ur'], uzn: ['uz'], vec: ['vec'], vie: ['vi'], war: ['war'], wol: ['wo'], xho: ['xh'], ydd: ['yi'], yor: ['yo'], yue: ['yue', 'zh'], zho: ['zh'], zul: ['zu'],
};

/**
 * Return the best browser speech tags for a catalog language. The explicit
 * map wins for product-critical languages; the NLLB code fallback means a
 * newly added catalog entry can still discover an installed voice without a
 * second registry edit.
 */
export function speechTagsFor(language: string): string[] {
  if (VOICE_TAGS[language]) return VOICE_TAGS[language];
  const catalogEntry = NLLB_LANGUAGE_CATALOG.find((entry) => entry.name === language);
  if (!catalogEntry) return [];
  const languageCode = catalogEntry.code.split('_')[0];
  return [...(NLLB_VOICE_ALIASES[languageCode] ?? []), languageCode];
}

function synth(): SpeechSynthesis | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  return window.speechSynthesis;
}

export function deviceVoicesFor(language: string): DeviceVoiceInfo[] {
  const s = synth();
  if (!s) return [];
  const tags = speechTagsFor(language);
  const voices = s.getVoices();
  const scored = voices.map((v) => {
    const lang = (v.lang || '').toLowerCase();
    let score = -1;
    tags.forEach((t, i) => {
      const tl = t.toLowerCase();
      if (lang === tl) score = Math.max(score, 100 - i);
      else if (lang.startsWith(tl.split('-')[0]) && tl.includes('-')) score = Math.max(score, 10 - i);
      else if (lang.startsWith(tl)) score = Math.max(score, 10 - i);
    });
    return { voice: v, score };
  });
  return scored
    .filter((s) => s.score >= 0)
    .sort((a, b) => b.score - a.score || Number(b.voice.localService) - Number(a.voice.localService))
    .map((s) => ({ name: s.voice.name, lang: s.voice.lang, localService: s.voice.localService }));
}

/**
 * Device speech engine: uses the OS/browser speechSynthesis voices.
 * Zero network. Speaks the exact translated text — wording never changes.
 */
export class DeviceSpeechEngine implements DeviceSpeechEngineContract {
  readonly kind = 'local' as const;
  private current: SpeechSynthesisUtterance | null = null;

  supported(): boolean {
    return synth() !== null;
  }

  voicesFor(language: string): DeviceVoiceInfo[] {
    return deviceVoicesFor(language);
  }

  speak(input: {
    text: string;
    language: string;
    rate?: number;
    pitch?: number;
    onEnd?: () => void;
    onError?: (message: string) => void;
  }): void {
    const s = synth();
    if (!s) {
      input.onError?.("Speech isn't supported in this browser.");
      return;
    }
    s.cancel();
    const style = classifyDelivery(input.text);
    const utter = new SpeechSynthesisUtterance(input.text);
    const [voice] = deviceVoicesFor(input.language);
    if (voice) {
      const match = s.getVoices().find((v) => v.name === voice.name && v.lang === voice.lang);
      if (match) utter.voice = match;
      utter.lang = voice.lang;
    }
    utter.rate = input.rate ?? style.rate;
    utter.pitch = input.pitch ?? 1;
    utter.onend = () => {
      this.current = null;
      input.onEnd?.();
    };
    utter.onerror = () => {
      this.current = null;
      input.onError?.('Device speech was interrupted.');
    };
    this.current = utter;
    s.speak(utter);
  }

  pause(): void {
    synth()?.pause();
  }

  resume(): void {
    synth()?.resume();
  }

  stop(): void {
    this.current = null;
    synth()?.cancel();
  }

  speaking(): boolean {
    return synth()?.speaking ?? false;
  }

  paused(): boolean {
    return synth()?.paused ?? false;
  }
}
