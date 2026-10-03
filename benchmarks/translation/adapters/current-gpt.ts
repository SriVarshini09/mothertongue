import { getOpenAI } from '@/lib/ai/client';
import { translateText } from '@/lib/ai/translator';
import type { TranslationAdapter } from './types';

/**
 * CURRENT GPT PIPELINE — calls the exact production translation service
 * (same prompt, same verifier, same chunking). No benchmark-specific prompt.
 */
export const currentGptAdapter: TranslationAdapter = {
  id: 'current-gpt',
  label: 'Current GPT pipeline (gpt-4o-mini)',
  supportedLanguages: [
    'Telugu', 'Tamil', 'Hindi', 'Kannada', 'Malayalam',
    'Japanese', 'Korean', 'Spanish',
  ],
  isAvailable() {
    if (!process.env.OPENAI_API_KEY) {
      return { available: false, reason: 'OPENAI_API_KEY is not set' };
    }
    return { available: true };
  },
  async translate(source: string, targetLanguage: string) {
    const started = Date.now();
    const result = await translateText(getOpenAI(), { text: source, targetLanguage });
    if (!result.translatedText) throw new Error('empty translation');
    return { translation: result.translatedText, latencyMs: Date.now() - started };
  },
};
