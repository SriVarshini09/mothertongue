import { sha256Hex } from './integrity';

/** The ONNX Runtime WASM files used by Transformers.js in the browser. */
export const OFFLINE_RUNTIME_ASSETS = [
  {
    url: '/onnxruntime/ort-wasm-simd-threaded.asyncify.mjs',
    bytes: 53_057,
    sha256: '0966b6105cd936744498aa60df7a22cbd47af3374dbc64a9ab561c08a71e3611',
  },
  {
    url: '/onnxruntime/ort-wasm-simd-threaded.asyncify.wasm',
    bytes: 26_861_777,
    sha256: '49871f5a4409519797e127440868a6d1923339d9185907f301a5b2a1d90af082',
  },
] as const;

const RUNTIME_CACHE = 'transformers-cache';

async function cachedRuntimeAsset(asset: (typeof OFFLINE_RUNTIME_ASSETS)[number]): Promise<Blob | null> {
  if (typeof caches === 'undefined') return null;
  const response = await (await caches.open(RUNTIME_CACHE)).match(asset.url);
  if (!response) return null;
  const blob = await response.blob();
  return blob.size === asset.bytes && (await sha256Hex(blob)).toLowerCase() === asset.sha256 ? blob : null;
}

export async function verifyOfflineRuntimeAssets(): Promise<boolean> {
  try {
    for (const asset of OFFLINE_RUNTIME_ASSETS) {
      if (!(await cachedRuntimeAsset(asset))) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** Download and verify the local runtime assets before declaring a pack ready. */
export async function primeOfflineRuntimeAssets(signal?: AbortSignal): Promise<void> {
  if (typeof caches === 'undefined') throw new Error('offline-runtime-cache-unavailable');
  const cache = await caches.open(RUNTIME_CACHE);
  for (const asset of OFFLINE_RUNTIME_ASSETS) {
    if (await cachedRuntimeAsset(asset)) continue;
    await cache.delete(asset.url);
    const response = await fetch(asset.url, { cache: 'no-store', signal });
    if (!response.ok) throw new Error(`offline-runtime-http-${response.status}`);
    const blob = await response.blob();
    if (blob.size !== asset.bytes || (await sha256Hex(blob)).toLowerCase() !== asset.sha256) {
      throw new Error('offline-runtime-integrity-mismatch');
    }
    await cache.put(asset.url, new Response(blob, { headers: { 'Content-Type': 'application/octet-stream' } }));
  }
}
