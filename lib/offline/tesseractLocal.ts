/**
 * Printed-text offline OCR via Tesseract.js (lazy; terminated after use).
 * Works offline after first use: engine core + traineddata are cached by
 * tesseract.js (IndexedDB). Honest scope: printed text. Handwriting needs
 * cloud vision — callers must say so instead of pretending otherwise.
 */

export const TESSERACT_LANGS: Record<string, string> = {
  Telugu: 'tel',
  Tamil: 'tam',
  Hindi: 'hin',
  Kannada: 'kan',
  Malayalam: 'mal',
  Bengali: 'ben',
  Marathi: 'mar',
  Gujarati: 'guj',
  Punjabi: 'pan',
  English: 'eng',
};

export function tesseractSupports(language: string): boolean {
  return Boolean(TESSERACT_LANGS[language]);
}

/** Extract printed text from an image Blob/File. Throws friendly errors. */
export async function ocrPrintedText(image: Blob, sourceLanguage: string): Promise<string> {
  const code = TESSERACT_LANGS[sourceLanguage];
  if (!code) throw new Error(`ocr-language-unsupported: ${sourceLanguage}`);
  const { createWorker } = await import('tesseract.js');
  const worker: Awaited<ReturnType<typeof createWorker>> | null = await createWorker(
    code === 'eng' ? ['eng'] : ['eng', code]
  ).catch(() => null);
  if (!worker) throw new Error('ocr-failed');
  try {
    const { data } = await worker.recognize(image);
    const text = (data.text ?? '').trim();
    if (!text) throw new Error('ocr-empty');
    return text;
  } catch (err) {
    if (err instanceof Error && (err.message.startsWith('ocr-') || err.message.startsWith('ocr_'))) throw err;
    throw new Error('ocr-failed');
  } finally {
    try {
      await worker.terminate();
    } catch {
      /* ignore */
    }
  }
}
