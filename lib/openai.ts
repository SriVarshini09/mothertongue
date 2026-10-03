/**
 * Backed by lib/ai/client.ts. Kept so existing server imports keep working.
 * NEVER import this module (or the `openai` package) from client components.
 */
export { getOpenAI } from '@/lib/ai/client';
export { chunkForSpeech, chunkText } from '@/lib/chunks';
