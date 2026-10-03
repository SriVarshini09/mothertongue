import { deleteModelFile, getModelFile, storeModelFile } from './modelStorage';
import { PACK_DEFS, getPackStatus, setPackStatus } from './languagePacks';

/**
 * Language-pack download manager.
 *
 * Two sinks:
 * - files with `cacheApi` priming go straight into the browser Cache API
 *   under the exact request URL the runtime will fetch (e.g. the
 *   transformers.js 'transformers-cache'). No double storage.
 * - other files land in IndexedDB via modelStorage.
 *
 * Streaming progress, cancellation, SHA-256 verification, versioning,
 * skip-if-present (shared base models download once), shared-file-aware
 * removal, incomplete-download cleanup.
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

export function validateManifest(raw: unknown): PackManifest | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const m = raw as Record<string, unknown>;
  if (typeof m.id !== 'string' || typeof m.version !== 'string') return null;
  if (!Array.isArray(m.files) || m.files.length === 0) return null;
  for (const f of m.files) {
    const file = f as Record<string, unknown>;
    if (typeof file.url !== 'string' || !/^https:\/\//.test(file.url)) return null;
    if (typeof file.sha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(file.sha256)) return null;
    if (typeof file.bytes !== 'number' || file.bytes <= 0) return null;
    if (file.cacheApi !== undefined) {
      const c = file.cacheApi as Record<string, unknown>;
      if (typeof c !== 'object' || c === null) return null;
      if (typeof c.cache !== 'string' || typeof c.request !== 'string') return null;
      if (!c.request.startsWith('https://')) return null;
    }
  }
  return m as PackManifest;
}

export async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function progressPercent(loaded: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((loaded / total) * 100));
}

function idbKey(manifest: PackManifest, index: number): string {
  return `${manifest.id}/${manifest.version}/${index}`;
}

async function isStored(file: PackManifestFile, manifest: PackManifest, index: number): Promise<boolean> {
  try {
    if (file.cacheApi && typeof caches !== 'undefined') {
      const cache = await caches.open(file.cacheApi.cache);
      return (await cache.match(file.cacheApi.request)) != null;
    }
    return (await getModelFile(idbKey(manifest, index))) != null;
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
    const cache = await caches.open(file.cacheApi.cache);
    await cache.put(
      file.cacheApi.request,
      new Response(blob, { headers: { 'Content-Type': 'application/octet-stream' } })
    );
    return;
  }
  await storeModelFile(idbKey(manifest, index), blob);
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
  onProgress?: (p: DownloadProgress) => void;
  signal?: AbortSignal;
}): Promise<void> {
  setPackStatus(args.language, 'downloading');
  const storedKeys: Array<{ manifest: PackManifest; index: number }> = [];
  try {
    const manifest = await fetchManifest(args.manifestUrl, args.signal);
    if (manifest.version !== args.expectedVersion) throw new Error('manifest-version-mismatch');
    const totalBytes = manifest.files.reduce((n, f) => n + f.bytes, 0);
    let loadedBytes = 0;
    for (const [index, file] of manifest.files.entries()) {
      if (await isStored(file, manifest, index)) {
        loadedBytes += file.bytes;
        args.onProgress?.({ loadedBytes, totalBytes, percent: progressPercent(loadedBytes, totalBytes) });
        continue;
      }
      const res = await fetch(file.url, { signal: args.signal });
      if (!res.ok || !res.body) throw new Error(`file-http-${res.status}`);
      const reader = res.body.getReader();
      const parts: Uint8Array[] = [];
      let received = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          parts.push(value);
          received += value.length;
          args.onProgress?.({
            loadedBytes: loadedBytes + received,
            totalBytes,
            percent: progressPercent(loadedBytes + received, totalBytes),
          });
        }
      }
      const blob = new Blob(parts as BlobPart[]);
      if ((await sha256Hex(blob)).toLowerCase() !== file.sha256.toLowerCase()) {
        throw new Error('checksum-mismatch');
      }
      await persistVerified(manifest, index, file, blob);
      storedKeys.push({ manifest, index });
      loadedBytes += received;
    }
    setPackStatus(args.language, 'ready');
    try {
      // Receipt enables offline removal and re-verification later.
      await storeModelFile(
        `receipt-by-language/${args.language}`,
        new Blob([JSON.stringify(manifest)], { type: 'application/json' })
      );
    } catch {
      /* non-fatal */
    }
  } catch (err) {
    // Cleanup files stored in THIS run; never leave corrupt packs behind.
    for (const { manifest, index } of storedKeys) {
      try {
        const file = manifest.files[index];
        if (file.cacheApi && typeof caches !== 'undefined') {
          await (await caches.open(file.cacheApi.cache)).delete(file.cacheApi.request);
        } else {
          await deleteModelFile(idbKey(manifest, index));
        }
      } catch {
        /* ignore */
      }
    }
    if (err instanceof Error && err.name === 'AbortError') {
      setPackStatus(args.language, 'not-downloaded');
      throw new Error('download-cancelled');
    }
    setPackStatus(args.language, 'error');
    throw err instanceof Error ? err : new Error('download-failed');
  }
}

/**
 * Remove a language pack. Files shared with other READY packs using the
 * same manifest are kept; only unreferenced files are deleted.
 */
export async function removePack(language: string): Promise<void> {
  const def = PACK_DEFS.find((p) => p.language === language);
  if (!def?.manifestUrl) {
    setPackStatus(language, 'not-downloaded');
    return;
  }
  let manifest: PackManifest | null = null;
  try {
    const receipt = await getModelFile(`receipt-by-language/${language}`);
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
    const siblingRefs = new Set<string>();
    for (const other of PACK_DEFS) {
      if (other.language === language || other.manifestUrl !== def.manifestUrl) continue;
      if (getPackStatus(other.language, 'translation') !== 'ready') continue;
      manifest.files.forEach((_, i) => siblingRefs.add(`${manifest!.id}/${manifest!.version}/${i}`));
    }
    for (const [index, file] of manifest.files.entries()) {
      const ref = `${manifest.id}/${manifest.version}/${index}`;
      if (siblingRefs.has(ref)) continue;
      try {
        if (file.cacheApi && typeof caches !== 'undefined') {
          await (await caches.open(file.cacheApi.cache)).delete(file.cacheApi.request);
        } else {
          await deleteModelFile(ref);
        }
      } catch {
        /* ignore */
      }
    }
  }
  setPackStatus(language, 'not-downloaded');
}
