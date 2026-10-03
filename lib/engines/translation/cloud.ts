import type { TranslationEngine, TranslationResult } from './types';

/** Cloud translator: thin client over the existing POST /api/translate. */
export class CloudTranslationEngine implements TranslationEngine {
  readonly kind = 'cloud' as const;

  async translate(input: {
    text: string;
    sourceLanguage?: string;
    targetLanguage: string;
  }): Promise<TranslationResult> {
    const res = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: input.text, targetLanguage: input.targetLanguage }),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      throw new Error(
        typeof data.error === 'string' ? data.error : 'Something went wrong while translating.'
      );
    }
    return {
      translatedText: typeof data.translatedText === 'string' ? data.translatedText : '',
      sourceLanguage: typeof data.sourceLanguage === 'string' ? data.sourceLanguage : 'Auto-detected',
      targetLanguage: input.targetLanguage,
      engine: 'cloud',
    };
  }
}
