import { NextResponse } from 'next/server';
import { z } from 'zod';
import { classifyServiceError, getOpenAI } from '@/lib/ai/client';
import { analyzeDeliveryProfile, defaultDeliveryProfile } from '@/lib/ai/speechStyle';
import {
  selectSpeechProvider,
  SpeechProviderUnavailableError,
  synthesizeSpeech,
} from '@/lib/ai/speechProviders';
import { speechSchema } from '@/lib/validation/requests';
import { describeError, logStage } from '@/lib/log';
import { protectApiRequest } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  const limited = await protectApiRequest(request, 'speech', 20, 60_000, 64 * 1024);
  if (limited) return limited;
  try {
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json({ error: 'Please send a valid JSON request.' }, { status: 400 });
    }
    const { text, language, emotion } = speechSchema.parse(rawBody);
    const selected = selectSpeechProvider(language);
    // Sarvam-supported languages can run with only SARVAM_API_KEY. OpenAI is
    // still used for delivery analysis when available, but it is optional on
    // the direct Sarvam path.
    const openai = selected.provider === 'openai' || process.env.OPENAI_API_KEY ? getOpenAI() : null;
    // Delivery analysis reads a sample to choose HOW to speak.
    // The TTS call below always receives the exact, unmodified text.
    logStage('speechStyle.start', { chars: text.length, language, emotion });
    const profile = openai
      ? await analyzeDeliveryProfile(openai, text, language, emotion)
      : defaultDeliveryProfile(language, emotion);
    logStage('speechStyle.success', {
      contentType: profile.contentType,
      pace: profile.pace,
      energy: profile.energy,
      expressiveness: profile.expressiveness,
      emotion,
    });
    logStage('tts.start', { chars: text.length, language });
    const started = Date.now();
    const { audio, provider, contentType } = await synthesizeSpeech(openai, {
      text,
      language,
      profile,
    });
    logStage('tts.success', {
      chars: text.length,
      bytes: audio.length,
      ms: Date.now() - started,
      provider,
    });
    return new Response(audio, {
      headers: { 'Content-Type': contentType, 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Text is too long to prepare as one audio segment.' },
        { status: 400 }
      );
    }
    logStage('tts.error', { reason: describeError(error) });
    const serviceError = classifyServiceError(error, 'Speech');
    const providerError = error instanceof SpeechProviderUnavailableError ? error.message : null;
    return NextResponse.json(
      { error: serviceError ?? providerError ?? "Couldn't create audio. Try again." },
      { status: 500 }
    );
  }
}
