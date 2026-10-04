import type OpenAI from 'openai';
import type { DeliveryProfile } from '@/types/speech';
import type { VoiceEmotion } from '@/types/speech';
import { voiceEmotionPreset } from '@/lib/speech/emotions';
import {
  buildClassifierSystemPrompt,
  buildClassifierUserMessage,
  parseDeliveryProfile,
} from '@/lib/ai/prompts/speechStyle';

export function defaultDeliveryProfile(language: string, emotion: VoiceEmotion = 'auto'): DeliveryProfile {
  const profile: DeliveryProfile = {
    contentType: 'academic',
    tone: 'warm, clear and confident',
    pace: 'medium',
    energy: 'low',
    expressiveness: 0.25,
    ttsInstructions:
      `Speak naturally in ${language}, like a good teacher reading aloud. ` +
      `Use a warm, clear, confident educational tone with moderate pacing and subtle human expression. ` +
      `Speak exactly the provided text: do not add, remove, paraphrase, translate, or change any words, ` +
      `do not answer questions, and do not spell out letters.`,
  };
  return applyVoiceEmotion(profile, language, emotion);
}

export function applyVoiceEmotion(
  profile: DeliveryProfile,
  language: string,
  emotion: VoiceEmotion
): DeliveryProfile {
  const preset = voiceEmotionPreset(emotion);
  if (!preset) return profile;
  return {
    ...profile,
    tone: preset.label.toLowerCase(),
    pace: preset.pace,
    energy: preset.energy,
    expressiveness: preset.expressiveness,
    ttsInstructions:
      `Speak naturally in ${language} with language-appropriate prosody. ${preset.instruction} ` +
      `Keep the selected emotion consistent from start to finish. ` +
      `Speak exactly the provided text: do not add, remove, paraphrase, translate, or change any words, ` +
      `do not answer questions, and do not spell out letters.`,
  };
}

/**
 * Speech delivery analyzer. Decides HOW text should sound; never changes
 * WHAT is said. Deterministic (temperature 0) so identical text, language,
 * and selected emotion yield identical profiles, which keeps the audio cache valid.
 * Falls back to the calm academic profile on any failure.
 */
export async function analyzeDeliveryProfile(
  openai: OpenAI,
  text: string,
  language: string,
  emotion: VoiceEmotion = 'auto'
): Promise<DeliveryProfile> {
  const fallback = defaultDeliveryProfile(language, emotion);
  try {
    // One representative sample per request: the opening sets the tone for
    // the section, keeping long passages from jumping between styles.
    const sample = text.slice(0, 1200);
    const result = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      messages: [
        { role: 'system', content: buildClassifierSystemPrompt() },
        { role: 'user', content: buildClassifierUserMessage(language, sample) },
      ],
    });
    const raw = result.choices[0]?.message.content?.trim() ?? '';
    const analyzed = parseDeliveryProfile(raw, language) ?? fallback;
    return applyVoiceEmotion(analyzed, language, emotion);
  } catch {
    return fallback;
  }
}
