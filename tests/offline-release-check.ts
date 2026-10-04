import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { NLLB_DTYPE, NLLB_MODEL_ID } from '@/lib/offline/nllbCore';
import { validateManifest } from '@/lib/offline/downloadManager';
import { NLLB_LANGUAGE_CATALOG, NLLB_OFFICIAL_LANGUAGE_COUNT } from '@/lib/offline/nllbLanguages';
import { PACK_DEFS } from '@/lib/offline/languagePacks';

const root = process.cwd();
const read = (relativePath: string) => readFileSync(path.join(root, relativePath), 'utf8');

const manifestRaw = JSON.parse(read('public/offline-packs/nllb-base-v1.json')) as Record<string, unknown>;
const manifest = validateManifest(manifestRaw);
assert.ok(manifest, 'offline manifest must pass runtime validation');
assert.equal(manifest.id, 'nllb-base');
assert.equal(manifest.version, 'v1');
assert.equal(manifestRaw.model, NLLB_MODEL_ID);
assert.equal(manifestRaw.dtype, NLLB_DTYPE);
assert.ok(manifest.files.every((file) => file.cacheApi?.request === file.url), 'runtime URLs must be exact');
assert.equal(new Set(manifest.files.map((file) => file.url)).size, manifest.files.length);
assert.ok(manifest.files.reduce((total, file) => total + file.bytes, 0) > 900_000_000);

const runtimeMjs = path.join(root, 'public/onnxruntime/ort-wasm-simd-threaded.asyncify.mjs');
const runtimeWasm = path.join(root, 'public/onnxruntime/ort-wasm-simd-threaded.asyncify.wasm');
assert.ok(existsSync(runtimeMjs) && statSync(runtimeMjs).size > 10_000, 'bundled ONNX runtime module is missing');
assert.ok(existsSync(runtimeWasm) && statSync(runtimeWasm).size > 1_000_000, 'bundled ONNX runtime WASM is missing');

const pwa = JSON.parse(read('public/manifest.json')) as { start_url?: string; scope?: string; icons?: unknown[] };
assert.equal(pwa.start_url, '/');
assert.equal(pwa.scope, '/');
assert.ok(Array.isArray(pwa.icons) && pwa.icons.length >= 2);
for (const icon of ['/icons/icon-192.png', '/icons/icon-512.png', '/icons/icon-maskable-512.png']) {
  assert.ok(existsSync(path.join(root, 'public', icon.slice(1))), `${icon} is missing`);
}

const worker = read('public/sw.js');
assert.match(worker, /url\.pathname\.startsWith\('\/api\/'\)/, 'service worker must bypass API routes');
assert.match(worker, /transformers-cache/, 'service worker must serve the model cache');
assert.match(worker, /offline-url\//, 'service worker must support IndexedDB model fallback');

assert.equal(NLLB_LANGUAGE_CATALOG.length, NLLB_OFFICIAL_LANGUAGE_COUNT, 'offline catalog count drifted');
assert.equal(NLLB_LANGUAGE_CATALOG.length, 202, 'official NLLB catalog should contain 202 entries');
assert.equal(new Set(NLLB_LANGUAGE_CATALOG.map((language) => language.code)).size, NLLB_LANGUAGE_CATALOG.length);
assert.equal(new Set(PACK_DEFS.map((def) => def.id)).size, PACK_DEFS.length);
assert.ok(PACK_DEFS.every((def) => def.translation === 'downloadable' && def.manifestId === manifest.id));
assert.equal(new Set(PACK_DEFS.map((def) => def.manifestUrl)).size, 1);

console.log(`PASS offline release assets (${NLLB_LANGUAGE_CATALOG.length} languages, ${manifest.files.length} manifest files)`);
console.log('PASS PWA shell, API bypass, runtime assets, and shared-pack invariants');
console.log('OFFLINE_RELEASE_CHECK_OK');
