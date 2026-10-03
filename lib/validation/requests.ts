import { z } from 'zod';
import {
  IMAGE_MIME_TYPES,
  MAX_IMAGES,
  MAX_IMAGE_BYTES,
  MAX_PDF_BYTES,
  MAX_PDF_PAGES_PER_REQUEST,
  MAX_TEXT_CHARS,
} from '@/lib/validation';

/** File checks. Each returns a friendly message or null when valid. */

export function checkImageFiles(files: File[]): string | null {
  if (files.length === 0 || files.length > MAX_IMAGES) {
    return 'Add between 1 and 10 images.';
  }
  for (const file of files) {
    if (!IMAGE_MIME_TYPES.has(file.type) || file.size === 0 || file.size > MAX_IMAGE_BYTES) {
      return 'Use PNG, JPG, or WEBP images up to 10 MB each.';
    }
  }
  return null;
}

export function checkPdfFile(file: unknown): string | null {
  if (!(file instanceof File) || file.type !== 'application/pdf') {
    return "This file type isn't supported yet. Try PDF, JPG, PNG, WEBP, or TXT.";
  }
  if (file.size === 0 || file.size > MAX_PDF_BYTES) {
    return 'Choose a PDF up to 25 MB.';
  }
  return null;
}

export function checkPdfRange(from: number, to: number, pageCount: number): string | null {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from) {
    return 'Choose a valid page range.';
  }
  if (to - from + 1 > MAX_PDF_PAGES_PER_REQUEST) {
    return `Choose up to ${MAX_PDF_PAGES_PER_REQUEST} pages at a time.`;
  }
  if (to > pageCount) {
    return `Choose a valid range within ${pageCount} pages (up to 20 pages at a time).`;
  }
  return null;
}

/** Request-shape schemas (server-side, never trust the browser). */

export const translateSchema = z.object({
  text: z.string().trim().min(1).max(MAX_TEXT_CHARS),
  targetLanguage: z.string().trim().min(2).max(80),
});

export const speechSchema = z.object({
  text: z.string().trim().min(1).max(4000),
  language: z.string().trim().min(2).max(80),
});

export const pdfRangeSchema = z.object({
  from: z.coerce.number().int().min(1),
  to: z.coerce.number().int().min(1),
});
