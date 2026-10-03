import { EngineUnavailableError } from '../capabilities';
import type { TranslationEngine, TranslationResult } from './types';
import { getPackStatus } from '@/lib/offline/languagePacks';

/**
 * Local translator: on-device NLLB (transformers.js, Web Worker) using the
 * downloaded language pack. Zero network once the pack is stored.
 */
export class LocalTranslationEngine implements TranslationEngine {
  readonly kind = 'local' as const;

  async translate(input: {
    text: string;
    sourceLanguage?: string;
    targetLanguage: string;
  }): Promise<TranslationResult> {
    const status = getPackStatus(input.targetLanguage, 'translation');
    if (status !== 'ready') {
      throw new EngineUnavailableError(
        'translation',
        'local',
        `${input.targetLanguage} isn't available offline yet.`
      );
    }
    const { translateOffline } = await import('@/lib/offline/nllbClient');
    const translatedText = await translateOffline(input.text, input.targetLanguage);
    return {
      translatedText,
      sourceLanguage: input.sourceLanguage ?? 'Auto-detected',
      targetLanguage: input.targetLanguage,
      engine: 'local',
    };
  }
}
