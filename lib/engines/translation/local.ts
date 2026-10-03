import { EngineUnavailableError } from '../capabilities';
import type { TranslationEngine, TranslationResult } from './types';
import { getPackStatus, verifyStoredPack } from '@/lib/offline/languagePacks';
import { nllbSupports } from '@/lib/offline/nllbCore';

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
    const sourceLanguage = input.sourceLanguage?.trim();
    if (!sourceLanguage || /^auto[- ]?detect/i.test(sourceLanguage)) {
      throw new EngineUnavailableError(
        'translation',
        'local',
        'Choose the source language before using offline translation.'
      );
    }
    if (!nllbSupports(sourceLanguage)) {
      throw new EngineUnavailableError(
        'translation',
        'local',
        `${sourceLanguage} is not supported by the installed offline translation model.`
      );
    }
    if (!(await verifyStoredPack(input.targetLanguage))) {
      throw new EngineUnavailableError(
        'translation',
        'local',
        `${input.targetLanguage} offline files are missing. Download the language pack again.`
      );
    }
    const { translateOffline } = await import('@/lib/offline/nllbClient');
    const translatedText = await translateOffline(input.text, input.targetLanguage, sourceLanguage);
    return {
      translatedText,
      sourceLanguage,
      targetLanguage: input.targetLanguage,
      engine: 'local',
    };
  }
}
