import { NextResponse } from 'next/server';
import { sanitizeFilename } from '@/lib/validation';
import { getPdfPageCount } from '@/lib/documents/pdf';
import { checkPdfFile } from '@/lib/validation/requests';
import { describeError, logStage } from '@/lib/log';
import { protectApiRequest } from '@/lib/rateLimit';
import { MAX_PDF_BYTES } from '@/lib/validation';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const limited = await protectApiRequest(request, 'extract-pdf-info', 20, 60_000, MAX_PDF_BYTES + 1024 * 1024);
  if (limited) return limited;
  try {
    const form = await request.formData();
    const file = form.get('file');
    const fileError = checkPdfFile(file);
    if (fileError || !(file instanceof File)) {
      return NextResponse.json({ error: fileError ?? 'Choose a PDF up to 25 MB.' }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const pageCount = await getPdfPageCount(buffer);
    return NextResponse.json({
      pageCount,
      filename: sanitizeFilename(file.name),
    });
  } catch (error) {
    logStage('extract.error', { source: 'pdf-info', reason: describeError(error) });
    return NextResponse.json({ error: 'We could not read this PDF. Try another file.' }, { status: 500 });
  }
}
