import type { VoiceEmotion } from '@/types/speech';

export type VoiceEmotionPreset = {
  label: string;
  description: string;
  pace: 'slow' | 'slightly-slow' | 'medium' | 'slightly-fast';
  energy: 'low' | 'medium' | 'high';
  expressiveness: number;
  instruction: string;
  deviceRate: number;
  devicePitch: number;
};

export const VOICE_EMOTION_PRESETS: Record<Exclude<VoiceEmotion, 'auto'>, VoiceEmotionPreset> = {
  warm: {
    label: 'Warm',
    description: 'Friendly and human',
    pace: 'medium',
    energy: 'medium',
    expressiveness: 0.38,
    instruction: 'Use a warm, friendly, patient tone with gentle natural expression.',
    deviceRate: 1,
    devicePitch: 1.02,
  },
  calm: {
    label: 'Calm',
    description: 'Slow and reassuring',
    pace: 'slightly-slow',
    energy: 'low',
    expressiveness: 0.25,
    instruction: 'Use a calm, steady, reassuring tone with relaxed pacing and clear pauses.',
    deviceRate: 0.9,
    devicePitch: 0.94,
  },
  encouraging: {
    label: 'Encouraging',
    description: 'Supportive teacher',
    pace: 'medium',
    energy: 'medium',
    expressiveness: 0.48,
    instruction: 'Use a supportive, optimistic, encouraging tone that helps the listener keep going.',
    deviceRate: 1.02,
    devicePitch: 1.06,
  },
  excited: {
    label: 'Excited',
    description: 'Energetic and bright',
    pace: 'slightly-fast',
    energy: 'high',
    expressiveness: 0.6,
    instruction: 'Use an energetic, bright, genuinely excited tone without shouting or becoming theatrical.',
    deviceRate: 1.08,
    devicePitch: 1.1,
  },
  empathetic: {
    label: 'Empathetic',
    description: 'Gentle and caring',
    pace: 'slightly-slow',
    energy: 'low',
    expressiveness: 0.4,
    instruction: 'Use a gentle, caring, empathetic tone that sounds attentive and emotionally present.',
    deviceRate: 0.92,
    devicePitch: 0.98,
  },
  confident: {
    label: 'Confident',
    description: 'Clear and assured',
    pace: 'medium',
    energy: 'medium',
    expressiveness: 0.35,
    instruction: 'Use a clear, composed, confident tone with decisive phrasing and controlled emphasis.',
    deviceRate: 1.01,
    devicePitch: 0.98,
  },
  storytelling: {
    label: 'Storytelling',
    description: 'Expressive narrator',
    pace: 'slightly-slow',
    energy: 'medium',
    expressiveness: 0.58,
    instruction: 'Use an expressive storyteller tone with varied emphasis, natural pauses, and vivid but controlled delivery.',
    deviceRate: 0.95,
    devicePitch: 1.05,
  },
};

export function voiceEmotionPreset(emotion: VoiceEmotion): VoiceEmotionPreset | null {
  return emotion === 'auto' ? null : VOICE_EMOTION_PRESETS[emotion];
}
