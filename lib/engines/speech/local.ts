import type { DeviceSpeechEngine as DeviceSpeechEngineContract, DeviceVoiceInfo } from './types';
import { classifyDelivery } from '@/lib/offline/deliveryHeuristics';

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

function synth(): SpeechSynthesis | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  return window.speechSynthesis;
}

export function deviceVoicesFor(language: string): DeviceVoiceInfo[] {
  const s = synth();
  if (!s) return [];
  const tags = VOICE_TAGS[language] ?? [];
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
