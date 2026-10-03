/** Shared document pipeline types. Maps to the Home page state:
 *  sourceType <- active tab, originalText <- sourceText,
 *  translatedText <- translated, audioUrl <- audioUrl. */

export type SourceType = 'text' | 'camera' | 'image' | 'pdf' | 'txt';

export type DocumentState = {
  sourceType: SourceType;
  originalText: string;
  extractedText?: string;
  sourceLanguage?: string;
  targetLanguage: string;
  translatedText?: string;
  audioUrl?: string;
};

export type PageText = {
  page: number;
  text: string;
};

export type PdfExtraction = {
  pages: PageText[];
  pageCount: number;
  filename: string;
};

export type TextChunk = {
  id: string;
  order: number;
  text: string;
};
