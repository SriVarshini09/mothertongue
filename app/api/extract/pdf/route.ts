import { NextResponse } from 'next/server';
import { sanitizeFilename } from '@/lib/validation';
import { extractPdfPages, getPdfPageCount, isScannedSelection } from '@/lib/documents/pdf';
import { normalizeExtractedText } from '@/lib/documents/normalize';
import { checkPdfFile, checkPdfRange, pdfRangeSchema } from '@/lib/validation/requests';
import { describeError, logStage } from '@/lib/log';
import { protectApiRequest } from '@/lib/rateLimit';
import { MAX_PDF_BYTES } from '@/lib/validation';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  const limited = await protectApiRequest(request, 'extract-pdf', 10, 60_000, MAX_PDF_BYTES + 1024 * 1024);
  if (limited) return limited;
  try {
    const form = await request.formData();
    const file = form.get('file');
    const fileError = checkPdfFile(file);
    if (fileError || !(file instanceof File)) {
      return NextResponse.json({ error: fileError ?? 'Choose a PDF up to 25 MB.' }, { status: 400 });
    }
    const parsedRange = pdfRangeSchema.safeParse({ from: form.get('from'), to: form.get('to') });
    if (!parsedRange.success) {
      return NextResponse.json({ error: 'Choose a valid page range.' }, { status: 400 });
    }
    const { from, to } = parsedRange.data;
    const buffer = Buffer.from(await file.arrayBuffer());
    // Page count first so ranges validate against the real document.
    const pageCount = await getPdfPageCount(buffer).catch(() => 0);
    const rangeError = checkPdfRange(from, to, pageCount || Number.MAX_SAFE_INTEGER);
    if (pageCount === 0 || rangeError) {
      return NextResponse.json(
        {
          error:
            pageCount === 0
              ? 'We could not read this PDF. Try another file.'
              : rangeError,
        },
        { status: 400 }
      );
    }
    logStage('extract.start', { source: 'pdf', filename: sanitizeFilename(file.name), from, to });
    const started = Date.now();
    const { pages } = await extractPdfPages(buffer, from, to);
    if (isScannedSelection(pages)) {
      // Scanned path: page-as-image vision OCR is out of scope for the MVP
      // server (no rasterization infra) — guide the user to photograph pages.
      return NextResponse.json(
        { error: 'This PDF looks scanned or image-based. Please upload clear photos of the pages instead.' },
        { status: 422 }
      );
    }
    const text = normalizeExtractedText(pages.map((p) => p.text).join('\n\n'));
    logStage('extract.success', {
      source: 'pdf',
      pages: pages.length,
      chars: text.length,
      ms: Date.now() - started,
    });
    // Contract kept for the existing frontend: joined text + range label.
    // Ordered per-page data is available internally via extractPdfPages.
    return NextResponse.json({
      text,
      pages: `${from}–${to}`,
      pageCount,
      filename: sanitizeFilename(file.name),
    });
  } catch (error) {
    logStage('extract.error', { source: 'pdf', reason: describeError(error) });
    return NextResponse.json({ error: 'We could not read this PDF. Try another file.' }, { status: 500 });
  }
}
