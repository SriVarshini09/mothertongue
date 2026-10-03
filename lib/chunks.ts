/**
 * Pure text-chunking helpers safe to import in client and server.
 * Backed by lib/documents/chunk.ts (order-preserving chunk objects).
 */
import { chunkDocument, chunkForSpeechSegments } from '@/lib/documents/chunk';

export function chunkText(text: string, limit = 8000): string[] {
  return chunkDocument(text, limit).map((c) => c.text);
}

export function chunkForSpeech(text: string, limit = 3500): string[] {
  return chunkForSpeechSegments(text, limit).map((c) => c.text);
}

export { chunkDocument, chunkForSpeechSegments };
