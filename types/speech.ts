/** Speech pipeline contracts. The delivery profile describes HOW the
 *  exact translated text should sound. It never carries rewritten wording. */

export type DeliveryProfile = {
  contentType:
    | 'academic'
    | 'conversation'
    | 'question'
    | 'story'
    | 'warning'
    | 'instruction'
    | 'celebration'
    | 'formal'
    | 'neutral';
  tone: string;
  pace: 'slow' | 'slightly-slow' | 'medium' | 'slightly-fast';
  energy: 'low' | 'medium' | 'high';
  /** 0.0 = neutral, 1.0 = theatrical. Normal content stays 0.15-0.55. */
  expressiveness: number;
  ttsInstructions: string;
};

export const VOICE_EMOTIONS = [
  'auto',
  'warm',
  'calm',
  'encouraging',
  'excited',
  'empathetic',
  'confident',
  'storytelling',
] as const;

export type VoiceEmotion = (typeof VOICE_EMOTIONS)[number];

export type SpeechRequest = {
  /** Must be the exact canonical translatedText. */
  text: string;
  language: string;
  emotion?: VoiceEmotion;
};
