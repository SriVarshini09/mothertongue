/**
 * NLLB translation Web Worker. Keeps heavy inference off the UI thread.
 * The worker bundle is separate; transformers.js loads only inside it.
 * Falls back to main-thread loading (caller-side) if workers fail.
 */
import { nllbTranslate } from './nllbCore';

type Incoming = {
  type?: 'warm';
  id?: string;
  text?: string;
  targetLanguage?: string;
  sourceLanguage?: string;
};
type Outgoing =
  | { type: 'ready' }
  | { id: string; text: string }
  | { id: string; error: string };

self.onmessage = async (event: MessageEvent<Incoming>) => {
  const { id, text, targetLanguage, sourceLanguage } = event.data ?? {};
  const post = (msg: Outgoing) => (self as unknown as { postMessage: (m: Outgoing) => void }).postMessage(msg);
  try {
    if (event.data?.type === 'warm') {
      await import('@huggingface/transformers');
      post({ type: 'ready' });
      return;
    }
    if (!id || typeof text !== 'string' || !targetLanguage) {
      throw new Error('bad-request');
    }
    const out = await nllbTranslate(text, targetLanguage, sourceLanguage);
    post({ id, text: out });
  } catch (err) {
    post({ id: typeof id === 'string' ? id : '?', error: err instanceof Error ? err.message.slice(0, 200) : 'worker-failed' });
  }
};

export {};
