import { NextResponse } from 'next/server';
import { classifyServiceError, getOpenAI } from '@/lib/ai/client';
import { extractImageTexts } from '@/lib/ai/extractor';
import { normalizeExtractedText } from '@/lib/documents/normalize';
import { checkImageFiles } from '@/lib/validation/requests';
import { describeError, logStage } from '@/lib/log';
import { protectApiRequest } from '@/lib/rateLimit';
import { MAX_IMAGE_BYTES, MAX_IMAGES } from '@/lib/validation';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  const limited = await protectApiRequest(request, 'extract-image', 10, 60_000, MAX_IMAGES * MAX_IMAGE_BYTES + 1024 * 1024);
  if (limited) return limited;
  try {
    const form = await request.formData();
    let files = form.getAll('images').filter((v): v is File => v instanceof File);
    const single = form.get('image');
    if (files.length === 0 && single instanceof File) files = [single];
    const invalid = checkImageFiles(files);
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

    logStage('extract.start', { source: 'image', images: files.length });
    const started = Date.now();
    const pages = await extractImageTexts(getOpenAI(), files);
    const text = normalizeExtractedText(pages.join('\n\n'));
    if (!text) {
      return NextResponse.json(
        { error: "Couldn't read this image clearly." },
        { status: 422 }
      );
    }
    logStage('extract.success', {
      source: 'image',
      images: files.length,
      chars: text.length,
      ms: Date.now() - started,
    });
    return NextResponse.json({ text, warnings: [] });
  } catch (error) {
    logStage('extract.error', { source: 'image', reason: describeError(error) });
    const serviceError = classifyServiceError(error, 'Image reading');
    return NextResponse.json(
      { error: serviceError ?? "Couldn't read this image clearly." },
      { status: 500 }
    );
  }
}
