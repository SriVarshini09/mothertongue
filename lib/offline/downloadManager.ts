import { deleteModelFile, getModelFile, listModelFiles, storeModelFile } from './modelStorage';
import {
  PACK_DEFS,
  clearRuntimePackVerification,
  findStoredPackReceipt,
  packReceiptKey,
  setPackStatus,
} from './languagePacks';
import { sha256Hex } from './integrity';
import { primeOfflineRuntimeAssets } from './runtimeAssets';
import {
  modelFileKey,
  offlineUrlKey,
  partialModelFileKey,
  partialModelMetaKey,
} from './storageKeys';

export { sha256Hex } from './integrity';

/**
 * Language-pack download manager.
 *
 * Two sinks:
 * - files with `cacheApi` priming prefer the browser Cache API under the
 *   exact request URL the runtime will fetch (e.g. the transformers.js
 *   'transformers-cache'). Oversized entries fall back to IndexedDB with a
 *   URL mapping so the service worker can still serve them offline.
 * - other files land in IndexedDB via modelStorage.
 *
 * Streaming progress, cancellation, resumable Range requests, SHA-256
 * verification, versioning, skip-if-present (shared base models download
 * once), shared-pack removal, and incomplete-download recovery.
 */

export type PackManifestFile = {
  url: string;
  sha256: string;
  bytes: number;
  cacheApi?: { cache: string; request: string };
};
export type PackManifest = {
  id: string;
  version: string;
  files: PackManifestFile[];
};

export type DownloadProgress = {
  loadedBytes: number;
  totalBytes: number;
  percent: number;
};

const MAX_MANIFEST_FILES = 256;

export function validateManifest(raw: unknown): PackManifest | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const m = raw as Record<string, unknown>;
  if (
    typeof m.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/i.test(m.id)
    || typeof m.version !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,31}$/i.test(m.version)
  ) return null;
  if (!Array.isArray(m.files) || m.files.length === 0 || m.files.length > MAX_MANIFEST_FILES) return null;
  const urls = new Set<string>();
  let totalBytes = 0;
  for (const f of m.files) {
    const file = f as Record<string, unknown>;
    if (typeof file.url !== 'string' || !/^https:\/\//.test(file.url)) return null;
    if (urls.has(file.url)) return null;
    urls.add(file.url);
    if (typeof file.sha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(file.sha256)) return null;
    if (typeof file.bytes !== 'number' || !Number.isSafeInteger(file.bytes) || file.bytes <= 0) return null;
    totalBytes += file.bytes;
    if (!Number.isSafeInteger(totalBytes)) return null;
    if (file.cacheApi !== undefined) {
      const c = file.cacheApi as Record<string, unknown>;
      if (typeof c !== 'object' || c === null) return null;
      if (typeof c.cache !== 'string' || typeof c.request !== 'string') return null;
      if (!c.request.startsWith('https://')) return null;
      if (c.request !== file.url) return null;
    }
  }
  return m as PackManifest;
}

export function progressPercent(loaded: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((loaded / total) * 100));
}

function verificationKey(manifest: PackManifest, index: number): string {
  return `verified/${manifest.id}/${manifest.version}/${index}`;
}

const PARTIAL_CHUNK_BYTES = 4 * 1024 * 1024;

type PartialFile = {
  chunks: Blob[];
  received: number;
  nextChunk: number;
};

function partialPrefix(manifest: PackManifest, index: number): string {
  return `partial/${manifest.id}/${manifest.version}/${index}/`;
}

async function clearPartial(manifest: PackManifest, index: number): Promise<void> {
  const prefix = partialPrefix(manifest, index);
  const keys = await listModelFiles();
  for (const key of keys) {
    if (key.startsWith(prefix) || key === partialModelMetaKey(manifest.id, manifest.version, index)) {
      await deleteModelFile(key);
    }
  }
}

async function readPartial(
  manifest: PackManifest,
  index: number,
  expectedBytes: number
): Promise<PartialFile> {
  const metaFile = await getModelFile(partialModelMetaKey(manifest.id, manifest.version, index));
  if (!metaFile) return { chunks: [], received: 0, nextChunk: 0 };
  try {
    const meta = JSON.parse(await metaFile.text()) as { received?: unknown; nextChunk?: unknown };
    if (
      typeof meta.received !== 'number' || !Number.isSafeInteger(meta.received)
      || meta.received < 0 || meta.received > expectedBytes
      || typeof meta.nextChunk !== 'number' || !Number.isSafeInteger(meta.nextChunk) || meta.nextChunk < 0
    ) throw new Error('partial-meta-invalid');
    const receivedFromMeta = meta.received;
    const nextChunkFromMeta = meta.nextChunk;
    const chunks: Blob[] = [];
    let received = 0;
    for (let chunk = 0; chunk < nextChunkFromMeta; chunk += 1) {
      const value = await getModelFile(partialModelFileKey(manifest.id, manifest.version, index, chunk));
      if (!value || value.size <= 0) throw new Error('partial-chunk-missing');
      chunks.push(value);
      received += value.size;
    }
    if (received !== receivedFromMeta) throw new Error('partial-size-mismatch');
    return { chunks, received, nextChunk: nextChunkFromMeta };
  } catch {
    await clearPartial(manifest, index);
    return { chunks: [], received: 0, nextChunk: 0 };
  }
}

async function storePartialMeta(manifest: PackManifest, index: number, received: number, nextChunk: number): Promise<void> {
  await storeModelFile(
    partialModelMetaKey(manifest.id, manifest.version, index),
    new Blob([JSON.stringify({ received, nextChunk })], { type: 'application/json' })
  );
}

async function fallbackStoredBlob(file: PackManifestFile): Promise<Blob | null> {
  if (!file.cacheApi) return null;
  const mapping = await getModelFile(offlineUrlKey(file.cacheApi.request));
  if (!mapping) return null;
  const parsed = JSON.parse(await mapping.text()) as { key?: unknown };
  return typeof parsed.key === 'string' ? getModelFile(parsed.key) : null;
}

async function storedBlob(file: PackManifestFile, manifest: PackManifest, index: number): Promise<Blob | null> {
  if (file.cacheApi && typeof caches !== 'undefined') {
    const response = await (await caches.open(file.cacheApi.cache)).match(file.cacheApi.request);
    if (response) return response.blob();
    return fallbackStoredBlob(file);
  }
  return getModelFile(modelFileKey(manifest.id, manifest.version, index));
}

async function isStored(file: PackManifestFile, manifest: PackManifest, index: number): Promise<boolean> {
  try {
    const receipt = await getModelFile(verificationKey(manifest, index));
    if (receipt) {
      const verified = JSON.parse(await receipt.text()) as { sha256?: unknown; bytes?: unknown };
      if (verified.sha256 === file.sha256 && verified.bytes === file.bytes) {
        const blob = await storedBlob(file, manifest, index);
        return blob != null && blob.size === file.bytes;
      }
    }
    const blob = await storedBlob(file, manifest, index);
    if (!blob || blob.size !== file.bytes || (await sha256Hex(blob)).toLowerCase() !== file.sha256.toLowerCase()) {
      return false;
    }
    await storeModelFile(
      verificationKey(manifest, index),
      new Blob([JSON.stringify({ sha256: file.sha256, bytes: file.bytes })], { type: 'application/json' })
    );
    return true;
  } catch {
    return false;
  }
}

async function persistVerified(
  manifest: PackManifest,
  index: number,
  file: PackManifestFile,
  blob: Blob
): Promise<void> {
  if (file.cacheApi && typeof caches !== 'undefined') {
    try {
      const cache = await caches.open(file.cacheApi.cache);
      await cache.put(
        file.cacheApi.request,
        new Response(blob, { headers: { 'Content-Type': 'application/octet-stream' } })
      );
    } catch {
      // Chromium can reject very large Cache API entries. Keep the verified
      // bytes in IndexedDB and map the exact runtime URL to that blob instead.
      try {
        await (await caches.open(file.cacheApi.cache)).delete(file.cacheApi.request);
      } catch {
        /* ignore partial-cache cleanup errors */
      }
      const key = modelFileKey(manifest.id, manifest.version, index);
      await storeModelFile(key, blob);
      await storeModelFile(
        offlineUrlKey(file.cacheApi.request),
        new Blob([JSON.stringify({ key })], { type: 'application/json' })
      );
    }
  } else {
    await storeModelFile(modelFileKey(manifest.id, manifest.version, index), blob);
  }
  await storeModelFile(
    verificationKey(manifest, index),
    new Blob([JSON.stringify({ sha256: file.sha256, bytes: file.bytes })], { type: 'application/json' })
  );
}

async function deleteStoredArtifact(file: PackManifestFile, manifest: PackManifest, index: number): Promise<void> {
  if (file.cacheApi && typeof caches !== 'undefined') {
    await (await caches.open(file.cacheApi.cache)).delete(file.cacheApi.request);
    await deleteModelFile(offlineUrlKey(file.cacheApi.request));
  }
  await deleteModelFile(modelFileKey(manifest.id, manifest.version, index));
}

async function fetchManifest(manifestUrl: string, signal?: AbortSignal): Promise<PackManifest> {
  const res = await fetch(manifestUrl, { cache: 'no-store', signal });
  if (!res.ok) throw new Error(`manifest-http-${res.status}`);
  const manifest = validateManifest(await res.json());
  if (!manifest) throw new Error('manifest-invalid');
  return manifest;
}

export async function downloadPack(args: {
  language: string;
  manifestUrl: string;
  expectedVersion: string;
  expectedManifestId?: string;
  onProgress?: (p: DownloadProgress) => void;
  signal?: AbortSignal;
}): Promise<void> {
  setPackStatus(args.language, 'downloading');
  try {
    const manifest = await fetchManifest(args.manifestUrl, args.signal);
    if (
      manifest.version !== args.expectedVersion
      || (args.expectedManifestId && manifest.id !== args.expectedManifestId)
    ) throw new Error('manifest-version-mismatch');
    const totalBytes = manifest.files.reduce((n, f) => n + f.bytes, 0);
    let loadedBytes = 0;
    for (const [index, file] of manifest.files.entries()) {
      if (await isStored(file, manifest, index)) {
        loadedBytes += file.bytes;
        args.onProgress?.({ loadedBytes, totalBytes, percent: progressPercent(loadedBytes, totalBytes) });
        continue;
      }
      let partial = await readPartial(manifest, index, file.bytes);
      const fileStartLoaded = loadedBytes;
      if (partial.received === file.bytes) {
        const completeBlob = new Blob(partial.chunks as BlobPart[]);
        if ((await sha256Hex(completeBlob)).toLowerCase() === file.sha256.toLowerCase()) {
          await persistVerified(manifest, index, file, completeBlob);
          await clearPartial(manifest, index);
          loadedBytes += file.bytes;
          args.onProgress?.({ loadedBytes, totalBytes, percent: progressPercent(loadedBytes, totalBytes) });
          continue;
        }
        await clearPartial(manifest, index);
        partial = { chunks: [], received: 0, nextChunk: 0 };
      }

      loadedBytes += partial.received;
      args.onProgress?.({ loadedBytes, totalBytes, percent: progressPercent(loadedBytes, totalBytes) });
      let nextChunk = partial.nextChunk;
      let pendingParts: Uint8Array[] = [];
      let pendingBytes = 0;
      let fileReceived = partial.received;
      const flushPending = async (): Promise<void> => {
        if (pendingBytes === 0) return;
        const chunk = new Blob(pendingParts as BlobPart[]);
        await storeModelFile(partialModelFileKey(manifest.id, manifest.version, index, nextChunk), chunk);
        nextChunk += 1;
        fileReceived += chunk.size;
        await storePartialMeta(manifest, index, fileReceived, nextChunk);
        loadedBytes += chunk.size;
        pendingParts = [];
        pendingBytes = 0;
      };

      try {
        const headers: HeadersInit | undefined = partial.received > 0
          ? { Range: `bytes=${partial.received}-` }
          : undefined;
        const res = await fetch(file.url, { signal: args.signal, headers });
        if (!res.ok || !res.body) throw new Error(`file-http-${res.status}`);
        if (partial.received > 0 && res.status === 200) {
          // Some origins ignore Range. Restart this file safely instead of
          // appending a duplicate full response to the saved prefix.
          await clearPartial(manifest, index);
          loadedBytes = fileStartLoaded;
          partial = { chunks: [], received: 0, nextChunk: 0 };
          nextChunk = 0;
          fileReceived = 0;
        } else if (res.status !== 200 && res.status !== 206) {
          throw new Error(`file-http-${res.status}`);
        } else if (res.status === 206) {
          const range = res.headers.get('content-range');
          const expectedStart = partial.received;
          if (!range || !range.startsWith(`bytes ${expectedStart}-`)) {
            throw new Error('resume-range-mismatch');
          }
        }
        const reader = res.body.getReader();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value) continue;
          pendingParts.push(new Uint8Array(value));
          pendingBytes += value.length;
          const totalReceived = fileReceived + pendingBytes;
          if (totalReceived > file.bytes) {
            try {
              await reader.cancel();
            } catch {
              /* ignore cancellation errors while rejecting the oversized file */
            }
            await clearPartial(manifest, index);
            throw new Error('file-size-mismatch');
          }
          if (pendingBytes >= PARTIAL_CHUNK_BYTES) await flushPending();
          args.onProgress?.({
            loadedBytes: loadedBytes + pendingBytes,
            totalBytes,
            percent: progressPercent(loadedBytes + pendingBytes, totalBytes),
          });
        }
        await flushPending();
      } catch (err) {
        // Preserve the last in-memory tail before surfacing cancellation or a
        // network error. The next attempt resumes at the persisted boundary.
        try {
          await flushPending();
        } catch {
          /* preserve the original download error */
        }
        throw err;
      }

      if (fileReceived !== file.bytes) {
        throw new Error('file-size-mismatch');
      }
      const chunks = await readPartial(manifest, index, file.bytes);
      const blob = new Blob(chunks.chunks as BlobPart[]);
      if ((await sha256Hex(blob)).toLowerCase() !== file.sha256.toLowerCase()) {
        await clearPartial(manifest, index);
        throw new Error('checksum-mismatch');
      }
      await persistVerified(manifest, index, file, blob);
      await clearPartial(manifest, index);
    }
    await primeOfflineRuntimeAssets(args.signal);
    const { preloadOfflineRuntime } = await import('./nllbClient');
    await preloadOfflineRuntime();
    // Do not mark the pack ready unless its durable receipt is also stored.
    await storeModelFile(
      packReceiptKey(args.manifestUrl),
      new Blob([JSON.stringify(manifest)], { type: 'application/json' })
    );
    setPackStatus(args.language, 'ready');
  } catch (err) {
    // Completed files and partial chunks are verified/persisted independently,
    // so retries can skip or resume them instead of restarting the 1 GB pack.
    if (err instanceof Error && err.name === 'AbortError') {
      setPackStatus(args.language, 'not-downloaded');
      throw new Error('download-cancelled');
    }
    setPackStatus(args.language, 'error');
    throw err instanceof Error ? err : new Error('download-failed');
  }
}

/**
 * Remove the shared multilingual pack. The UI presents it through one
 * representative language row, but removing any language's pack removes the
 * complete shared model and resets every sibling status.
 */
export async function removePack(language: string): Promise<void> {
  clearRuntimePackVerification();
  const def = PACK_DEFS.find((p) => p.language === language);
  if (!def?.manifestUrl) {
    setPackStatus(language, 'not-downloaded');
    return;
  }
  let manifest: PackManifest | null = null;
  try {
    const receipt = await findStoredPackReceipt(language);
    if (receipt) manifest = validateManifest(JSON.parse(await receipt.text()));
  } catch {
    /* ignore — fall back to network */
  }
  if (!manifest) {
    try {
      manifest = await fetchManifest(def.manifestUrl);
    } catch {
      manifest = null;
    }
  }
  if (manifest) {
    for (const [index, file] of manifest.files.entries()) {
      try {
        await deleteStoredArtifact(file, manifest, index);
        await deleteModelFile(`verified/${manifest.id}/${manifest.version}/${index}`);
        await clearPartial(manifest, index);
      } catch {
        /* ignore */
      }
    }
  }
  try {
    await deleteModelFile(packReceiptKey(def.manifestUrl));
    for (const sibling of PACK_DEFS) {
      if (sibling.manifestUrl === def.manifestUrl) {
        await deleteModelFile(`receipt-by-language/${sibling.language}`);
      }
    }
  } catch {
    /* ignore */
  }
  setPackStatus(language, 'not-downloaded');
}
