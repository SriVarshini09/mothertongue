import type { TextChunk } from '@/types/document';

/**
 * Document chunking. Splits on section/paragraph boundaries first,
 * then sentences — never mid-word. Output carries stable order so
 * translation can reassemble deterministically.
 */
export function chunkDocument(text: string, limit = 8000): TextChunk[] {
  if (text.length <= limit) return [{ id: 'chunk-1', order: 1, text }];
  const raw: string[] = [];
  let current = '';
  const paragraphs = text.split(/(\n\s*\n)/);
  for (const paragraph of paragraphs) {
    if (!paragraph) continue;
    if ((current + paragraph).length <= limit) {
      current += paragraph;
      continue;
    }
    if (current.trim()) {
      raw.push(current);
      current = '';
    }
    if (paragraph.length <= limit) {
      current = paragraph;
      continue;
    }
    const sentences = paragraph.match(/[^.!?。！？\n]+[.!?。！？]?[\s]*/gu) ?? [paragraph];
    for (const sentence of sentences) {
      if ((current + sentence).length > limit && current.trim()) {
        raw.push(current);
        current = '';
      }
      if (sentence.length > limit) {
        if (current) {
          raw.push(current);
          current = '';
        }
        for (let i = 0; i < sentence.length; i += limit) {
          raw.push(sentence.slice(i, i + limit));
        }
      } else {
        current += sentence;
      }
    }
  }
  if (current.trim()) raw.push(current);
  return raw
    .filter((c) => c.trim().length > 0)
    .map((c, i) => ({ id: `chunk-${i + 1}`, order: i + 1, text: c }));
}

/** TTS-safe chunks (~3500 chars) on sentence boundaries, order-preserved. */
export function chunkForSpeechSegments(text: string, limit = 3500): TextChunk[] {
  if (text.length <= limit) return [{ id: 'speech-1', order: 1, text }];
  const raw: string[] = [];
  let current = '';
  const sentences = text.match(/[^.!?。！？\n]+[.!?。！？]?[\s]*/gu) ?? [text];
  for (const sentence of sentences) {
    if ((current + sentence).length > limit && current.trim()) {
      raw.push(current.trim());
      current = '';
    }
    if (sentence.length > limit) {
      if (current.trim()) {
        raw.push(current.trim());
        current = '';
      }
      const words = sentence.split(/(\s+)/);
      let buf = '';
      for (const w of words) {
        if ((buf + w).length > limit && buf.trim()) {
          raw.push(buf.trim());
          buf = '';
        }
        buf += w;
      }
      if (buf.trim()) raw.push(buf.trim());
    } else {
      current += sentence;
    }
  }
  if (current.trim()) raw.push(current.trim());
  return raw.map((c, i) => ({ id: `speech-${i + 1}`, order: i + 1, text: c }));
}
