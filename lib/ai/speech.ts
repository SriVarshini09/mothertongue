import type OpenAI from 'openai';

export const SPEECH_MODEL = 'gpt-4o-mini-tts';
export const SPEECH_VOICE = 'coral';

/**
 * TTS service. ONE job: speak the exact provided text.
 * `text` must be the canonical translatedText — this service never
 * rewrites, paraphrases, or otherwise alters wording. Only the delivery
 * instructions vary.
 */
export async function generateSpeech(
  openai: OpenAI,
  args: { text: string; ttsInstructions: string }
): Promise<Uint8Array<ArrayBuffer>> {
  const speech = await openai.audio.speech.create({
    model: SPEECH_MODEL,
    voice: SPEECH_VOICE,
    input: args.text,
    instructions: args.ttsInstructions,
  });
  return new Uint8Array(await speech.arrayBuffer());
}
