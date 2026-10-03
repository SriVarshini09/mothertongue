import type { EngineKind } from '../capabilities';

export type TranslationResult = {
  translatedText: string;
  sourceLanguage: string;
  targetLanguage: string;
  engine: EngineKind;
};

export interface TranslationEngine {
  readonly kind: EngineKind;
  translate(input: {
    text: string;
    sourceLanguage?: string;
    targetLanguage: string;
  }): Promise<TranslationResult>;
}
