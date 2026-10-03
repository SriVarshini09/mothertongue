/**
 * Superseded by lib/ai/speechStyle.ts (DeliveryProfile).
 * Kept as a compatibility shim; new code should import the ai service.
 */
import type { DeliveryProfile } from '@/types/speech';
import {
  analyzeDeliveryProfile,
  defaultDeliveryProfile,
} from '@/lib/ai/speechStyle';
import type OpenAI from 'openai';

export type SpeechStyle = DeliveryProfile & { category: string };

export async function analyzeSpeechStyle(
  openai: OpenAI,
  text: string,
  language: string
): Promise<SpeechStyle> {
  const profile = await analyzeDeliveryProfile(openai, text, language);
  return { ...profile, category: profile.contentType };
}

export function defaultStyle(language: string): SpeechStyle {
  const profile = defaultDeliveryProfile(language);
  return { ...profile, category: profile.contentType };
}
