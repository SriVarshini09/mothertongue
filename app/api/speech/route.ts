import { NextResponse } from 'next/server';
import { z } from 'zod';
import { classifyServiceError, getOpenAI } from '@/lib/ai/client';
import { analyzeDeliveryProfile } from '@/lib/ai/speechStyle';
import { synthesizeSpeech } from '@/lib/ai/speechProviders';
import { speechSchema } from '@/lib/validation/requests';
import { describeError, logStage } from '@/lib/log';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const { text, language } = speechSchema.parse(await request.json());
    const openai = getOpenAI();
    // Delivery analysis reads a sample to choose HOW to speak.
    // The TTS call below always receives the exact, unmodified text.
    logStage('speechStyle.start', { chars: text.length, language });
    const profile = await analyzeDeliveryProfile(openai, text, language);
    logStage('speechStyle.success', {
      contentType: profile.contentType,
      pace: profile.pace,
      energy: profile.energy,
      expressiveness: profile.expressiveness,
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
    return NextResponse.json(
      { error: serviceError ?? "Couldn't create audio. Try again." },
      { status: 500 }
    );
  }
}
