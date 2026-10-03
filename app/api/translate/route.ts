import { NextResponse } from 'next/server';
import { z } from 'zod';
import { classifyServiceError, getOpenAI } from '@/lib/ai/client';
import { translateText } from '@/lib/ai/translator';
import { translateSchema } from '@/lib/validation/requests';
import { describeError, logStage } from '@/lib/log';
import { protectApiRequest } from '@/lib/rateLimit';

export async function POST(request: Request) {
  const limited = await protectApiRequest(request, 'translate', 30, 60_000, 512 * 1024);
  if (limited) return limited;
  try {
    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json({ error: 'Please send a valid JSON request.' }, { status: 400 });
    }
    const body = translateSchema.parse(rawBody);
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
