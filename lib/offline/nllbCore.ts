/**
 * NLLB local translation core (shared by worker and main-thread fallback).
 * transformers.js is dynamically imported so neither the server bundle nor
 * the initial client bundle pays for it. WebGPU preferred, WASM fallback.
 * FLORES codes throughout; model files come from the downloaded pack.
 */

export const NLLB_MODEL_ID = 'Xenova/nllb-200-distilled-600M';
// 'q8' maps to the *_quantized.onnx weights (~870MB total). NOTE: the older
// value 'quantized' is not a valid v4 dtype and silently falls back to fp32
// (~3.4GB) — verified against the loader's suffix mapping.
export const NLLB_DTYPE = 'q8';

export const NLLB_FLORES: Record<string, string> = {
  Telugu: 'tel_Telu',
  Tamil: 'tam_Taml',
  Hindi: 'hin_Deva',
  Kannada: 'kan_Knda',
  Malayalam: 'mal_Mlym',
  Bengali: 'ben_Beng',
  Marathi: 'mar_Deva',
  Japanese: 'jpn_Jpan',
  Korean: 'kor_Hang',
  Chinese: 'zho_Hans',
  Spanish: 'spa_Latn',
  English: 'eng_Latn',
};

type Translator = (
  text: string,
  options: { src_lang: string; tgt_lang: string }
) => Promise<Array<{ translation_text?: string }> | { translation_text?: string }>;

let pipelinePromise: Promise<Translator> | null = null;
let activeDevice: 'webgpu' | 'wasm' = 'wasm';

async function loadPipeline(): Promise<Translator> {
  if (!pipelinePromise) {
    pipelinePromise = (async () => {
      const { pipeline } = await import('@huggingface/transformers');
      try {
        const pipe = (await pipeline('translation', NLLB_MODEL_ID, {
          dtype: NLLB_DTYPE,
          device: 'webgpu',
        })) as unknown as Translator;
        activeDevice = 'webgpu';
        return pipe;
      } catch {
        const pipe = (await pipeline('translation', NLLB_MODEL_ID, {
          dtype: NLLB_DTYPE,
        })) as unknown as Translator;
        activeDevice = 'wasm';
        return pipe;
      }
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

/** Capability probe: WebGPU present, else WASM (always available). */
export function nllbBackend(): 'webgpu' | 'wasm' {
  if (typeof navigator !== 'undefined' && 'gpu' in navigator && navigator.gpu) return 'webgpu';
  return 'wasm';
}

export function nllbSupports(language: string): boolean {
  return Boolean(NLLB_FLORES[language]);
}

export async function nllbTranslate(
  text: string,
  targetLanguage: string,
  sourceLanguage = 'English'
): Promise<string> {
  const tgt = NLLB_FLORES[targetLanguage];
  const src = NLLB_FLORES[sourceLanguage] ?? 'eng_Latn';
  if (!tgt) throw new Error(`nllb-unsupported-language: ${targetLanguage}`);
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
