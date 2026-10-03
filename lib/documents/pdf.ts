import type { PageText, PdfExtraction } from '@/types/document';

type PdfPageData = {
  getTextContent: (opts?: object) => Promise<{ items: Array<{ str?: string; transform?: number[] }> }>;
};

function pageToText(pageData: PdfPageData): Promise<string> {
  return pageData
    .getTextContent({ normalizeWhitespace: true, disableCombineTextItems: false })
    .then((content) => {
      let lastY: number | undefined;
      let text = '';
      for (const item of content.items) {
        const y = item.transform?.[5];
        if (lastY === undefined || (y !== undefined && Math.abs(y - lastY) < 2)) {
          text += item.str ?? '';
        } else {
          text += '\n' + (item.str ?? '');
        }
        if (y !== undefined) lastY = y;
      }
      return text;
    });
}

function toParseableBytes(buffer: Buffer): Uint8Array {
  // pdf-parse's bundled pdf.js misreads Node Buffers on modern runtimes
  // ("bad XRef entry"); a plain Uint8Array parses reliably.
  if (buffer.byteOffset === 0 && buffer.buffer.byteLength === buffer.byteLength) {
    return new Uint8Array(buffer.buffer);
  }
  return new Uint8Array(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
}

/**
 * TEXT-BASED PDF path: native text extraction, no AI involved.
 * Collects per-page text in order; only the selected range is returned.
 */
export async function extractPdfPages(
  buffer: Buffer,
  from: number,
  to: number
): Promise<PdfExtraction> {
  const pdfParse = (await import('pdf-parse')).default;
  const pageTexts: string[] = [];
  const parsed = await pdfParse(toParseableBytes(buffer) as unknown as Buffer, {
    pagerender: async (pageData: PdfPageData) => {
      const text = await pageToText(pageData);
      pageTexts.push(text);
      return text;
    },
  });
  const pageCount: number = parsed.numpages ?? pageTexts.length;
  const pages: PageText[] = pageTexts
    .slice(from - 1, to)
    .map((text, i) => ({ page: from + i, text: text.trim() }));
  return { pages, pageCount, filename: '' };
}

/** Page count only — used to validate ranges before extraction. */
export async function getPdfPageCount(buffer: Buffer): Promise<number> {
  const pdfParse = (await import('pdf-parse')).default;
  const parsed = await pdfParse(toParseableBytes(buffer) as unknown as Buffer, {
    pagerender: () => Promise.resolve(''),
    max: 1,
  });
  return parsed.numpages ?? 0;
}

/**
 * Heuristic for scanned/image-only PDFs: almost no selectable characters
 * on the selected pages. Those need page-as-image vision OCR, which the
 * MVP deliberately does not run server-side — callers should guide the
 * user to photograph the pages instead.
 */
export function isScannedSelection(pages: PageText[]): boolean {
  const chars = pages
    .map((p) => p.text)
    .join('')
    .replace(/\s/g, '').length;
  return chars < 40;
}
