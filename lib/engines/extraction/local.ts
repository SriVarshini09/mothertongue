import { EngineUnavailableError } from '../capabilities';
import type {
  ExtractionEngine,
  ImageExtractionResult,
  PdfExtractionResult,
} from './types';
import { normalizeExtractedText } from '@/lib/documents/normalize';

/**
 * Local extraction engine: printed-text OCR via on-device Tesseract.js.
 * Zero network after first use (engine + traineddata cached locally).
 * Handwriting is out of scope offline — callers surface that honestly and
 * the user can always correct text in the review step.
 */
export class LocalExtractionEngine implements ExtractionEngine {
  readonly kind = 'local' as const;

  async extractImages(files: File[], opts?: { sourceLanguage?: string }): Promise<ImageExtractionResult> {
    const { ocrPrintedText } = await import('@/lib/offline/tesseractLocal');
    const language = opts?.sourceLanguage?.trim();
    if (!language || /^auto[- ]?detect/i.test(language)) {
      throw new EngineUnavailableError(
        'extraction',
        'local',
        'Choose the source language before using offline photo reading.'
      );
    }
    try {
      const pages: string[] = [];
      for (const file of files) {
        pages.push(await ocrPrintedText(file, language));
      }
      const text = normalizeExtractedText(pages.join('\n\n'));
      if (!text) {
        throw new EngineUnavailableError(
          'extraction',
          'local',
          "Couldn't read this offline. Handwriting recognition works best online — or type the text manually."
        );
      }
      return { text, warnings: [], engine: 'local' };
    } catch (err) {
      if (err instanceof EngineUnavailableError) throw err;
      throw new EngineUnavailableError(
        'extraction',
        'local',
        "Couldn't read this offline. Handwriting recognition works best online — or type the text manually."
      );
    }
  }

  async pdfInfo(_file: File): Promise<{ pageCount: number; filename: string }> {
    void _file;
    throw new EngineUnavailableError('extraction', 'local', 'PDF reading needs internet in this version.');
  }

  async extractPdfPages(
    _file: File,
    _from: string,
    _to: string
  ): Promise<PdfExtractionResult> {
    void _file;
    void _from;
    void _to;
    throw new EngineUnavailableError('extraction', 'local', 'PDF reading needs internet in this version.');
  }
}
