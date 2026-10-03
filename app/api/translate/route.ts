import { NextResponse } from 'next/server';
import { z } from 'zod';
import { classifyServiceError, getOpenAI } from '@/lib/ai/client';
import { translateText } from '@/lib/ai/translator';
import { translateSchema } from '@/lib/validation/requests';
import { describeError, logStage } from '@/lib/log';

export async function POST(request: Request) {
  try {
    const body = translateSchema.parse(await request.json());
    logStage('translate.start', {
      chars: body.text.length,
      targetLanguage: body.targetLanguage,
    });
    const started = Date.now();
    const result = await translateText(getOpenAI(), body);
    if (!result.translatedText) {
      return NextResponse.json({ error: 'Translation failed. Try again.' }, { status: 500 });
    }
    logStage('translate.success', {
      chars: body.text.length,
      outChars: result.translatedText.length,
      targetLanguage: body.targetLanguage,
      ms: Date.now() - started,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Please provide text and choose a language.' }, { status: 400 });
    }
    logStage('translate.error', { reason: describeError(error) });
    const serviceError = classifyServiceError(error, 'Translation');
    return NextResponse.json(
      { error: serviceError ?? 'Translation failed. Try again.' },
      { status: 500 }
    );
  }
}
