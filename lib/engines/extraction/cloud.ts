import type {
  ExtractionEngine,
  ImageExtractionResult,
  PdfExtractionResult,
} from './types';

/** Cloud extractor: thin client over the existing /api/extract/* routes. */
export class CloudExtractionEngine implements ExtractionEngine {
  readonly kind = 'cloud' as const;

  async extractImages(files: File[], _opts?: { sourceLanguage?: string }): Promise<ImageExtractionResult> {
    void _opts;
    const body = new FormData();
    files.forEach((f) => body.append('images', f, f.name));
    const res = await fetch('/api/extract/image', { method: 'POST', body });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      throw new Error(
        typeof data.error === 'string' ? data.error : "We couldn't read this image clearly."
      );
    }
    return {
      text: typeof data.text === 'string' ? data.text : '',
      warnings: Array.isArray(data.warnings) ? (data.warnings as string[]) : [],
      engine: 'cloud',
    };
  }

  async pdfInfo(file: File): Promise<{ pageCount: number; filename: string }> {
    const body = new FormData();
    body.append('file', file, file.name);
    const res = await fetch('/api/extract/pdf-info', { method: 'POST', body });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      throw new Error(
        typeof data.error === 'string' ? data.error : 'We could not read this PDF.'
      );
    }
    return {
      pageCount: typeof data.pageCount === 'number' ? data.pageCount : 0,
      filename: typeof data.filename === 'string' ? data.filename : file.name,
    };
  }

  async extractPdfPages(file: File, from: string, to: string): Promise<PdfExtractionResult> {
    const body = new FormData();
    body.append('file', file, file.name);
    body.append('from', from);
    body.append('to', to);
    const res = await fetch('/api/extract/pdf', { method: 'POST', body });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      throw new Error(
        typeof data.error === 'string' ? data.error : 'We could not read this PDF.'
      );
    }
    return {
      text: typeof data.text === 'string' ? data.text : '',
      pages: typeof data.pages === 'string' ? data.pages : `${from}–${to}`,
      pageCount: typeof data.pageCount === 'number' ? data.pageCount : 0,
      filename: typeof data.filename === 'string' ? data.filename : file.name,
      engine: 'cloud',
    };
  }
}
