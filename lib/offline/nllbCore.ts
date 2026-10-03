/**
 * NLLB local translation core (shared by worker and main-thread fallback).
 * transformers.js is dynamically imported so neither the server bundle nor
 * the initial client bundle pays for it. The shipped offline runtime uses
 * the verified WASM provider for consistent browser support.
 * FLORES codes throughout; model files come from the downloaded pack.
 */
import { NLLB_FLORES } from './nllbLanguages';

export { NLLB_FLORES } from './nllbLanguages';

export const NLLB_MODEL_ID = 'Xenova/nllb-200-distilled-600M';
// 'q8' maps to the *_quantized.onnx weights (~870MB total). NOTE: the older
// value 'quantized' is not a valid v4 dtype and silently falls back to fp32
// (~3.4GB) — verified against the loader's suffix mapping.
export const NLLB_DTYPE = 'q8';

type Translator = (
  text: string,
  options: { src_lang: string; tgt_lang: string }
) => Promise<Array<{ translation_text?: string }> | { translation_text?: string }>;

let pipelinePromise: Promise<Translator> | null = null;
let activeDevice: 'webgpu' | 'wasm' = 'wasm';

async function loadPipeline(): Promise<Translator> {
  if (!pipelinePromise) {
    pipelinePromise = (async () => {
      const { env, pipeline } = await import('@huggingface/transformers');
      if (typeof location !== 'undefined' && env.backends.onnx?.wasm) {
        const base = new URL('/onnxruntime/', location.origin).href;
        env.backends.onnx.wasm.wasmPaths = {
          mjs: `${base}ort-wasm-simd-threaded.asyncify.mjs`,
          wasm: `${base}ort-wasm-simd-threaded.asyncify.wasm`,
        };
        env.useWasmCache = true;
      }
      const pipe = (await pipeline('translation', NLLB_MODEL_ID, {
        dtype: NLLB_DTYPE,
        device: 'wasm',
      })) as unknown as Translator;
      activeDevice = 'wasm';
      return pipe;
    })().catch((err) => {
      pipelinePromise = null;
      throw err;
    });
  }
  return pipelinePromise;
}

export function nllbDevice(): 'webgpu' | 'wasm' {
  return activeDevice;
}

/** The bundled offline backend is WASM for deterministic browser support. */
export function nllbBackend(): 'wasm' {
  return 'wasm';
}

export function nllbSupports(language: string): boolean {
  return Boolean(NLLB_FLORES[language]);
}

export async function nllbTranslate(
  text: string,
  targetLanguage: string,
  sourceLanguage = 'Auto-detect'
): Promise<string> {
  const tgt = NLLB_FLORES[targetLanguage];
  const src = NLLB_FLORES[sourceLanguage];
  if (!tgt) throw new Error(`nllb-unsupported-language: ${targetLanguage}`);
  if (!src) throw new Error('nllb-source-language-required');
  const translator = await loadPipeline();
  const out = await translator(text, { src_lang: src, tgt_lang: tgt });
  const str = (Array.isArray(out) ? out[0]?.translation_text : out.translation_text) ?? '';
  if (!str.trim()) throw new Error('nllb-empty-output');
  return str.trim();
}

/** Release the pipeline (frees hundreds of MB). */
export function releaseNllb(): void {
  pipelinePromise = null;
  if (typeof globalThis !== 'undefined' && 'gc' in globalThis) {
    try {
      (globalThis as { gc?: () => void }).gc?.();
    } catch {
      /* ignore */
    }
  }
}
