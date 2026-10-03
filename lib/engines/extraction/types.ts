import type { EngineKind } from '../capabilities';

export type ImageExtractionResult = {
  text: string;
  warnings: string[];
  engine: EngineKind;
};

export type PdfExtractionResult = {
  text: string;
  pages: string;
  pageCount: number;
  filename: string;
  engine: EngineKind;
};

export interface ExtractionEngine {
  readonly kind: EngineKind;
  extractImages(files: File[], opts?: { sourceLanguage?: string }): Promise<ImageExtractionResult>;
  pdfInfo(file: File): Promise<{ pageCount: number; filename: string }>;
  extractPdfPages(file: File, from: string, to: string): Promise<PdfExtractionResult>;
}
