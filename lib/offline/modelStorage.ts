/**
 * Model-file storage on IndexedDB (never localStorage for binaries).
 * Ready for Phase-2 language packs; small, dependency-free, lazy.
 */

const DB_NAME = 'mothertongue-models';
const STORE = 'files';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('indexeddb-unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('indexeddb-open-failed'));
  });
}

function tx(db: IDBDatabase, mode: IDBTransactionMode): IDBObjectStore {
  return db.transaction(STORE, mode).objectStore(STORE);
}

export async function storeModelFile(key: string, blob: Blob): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const req = tx(db, 'readwrite').put(blob, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error ?? new Error('store-failed'));
    });
  } finally {
    db.close();
  }
}

export async function getModelFile(key: string): Promise<Blob | null> {
  const db = await openDb();
  try {
    return await new Promise<Blob | null>((resolve, reject) => {
      const req = tx(db, 'readonly').get(key);
      req.onsuccess = () => resolve((req.result as Blob | undefined) ?? null);
      req.onerror = () => reject(req.error ?? new Error('read-failed'));
    });
  } finally {
    db.close();
  }
}

export async function deleteModelFile(key: string): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const req = tx(db, 'readwrite').delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error ?? new Error('delete-failed'));
    });
  } finally {
    db.close();
  }
}

export async function listModelFiles(): Promise<string[]> {
  const db = await openDb();
  try {
    return await new Promise<string[]>((resolve, reject) => {
      const req = tx(db, 'readonly').getAllKeys();
      req.onsuccess = () => resolve((req.result as string[]) ?? []);
      req.onerror = () => reject(req.error ?? new Error('list-failed'));
    });
  } finally {
    db.close();
  }
}

export async function storageEstimate(): Promise<{ quota?: number; usage?: number }> {
  try {
    if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
      const { quota, usage } = await navigator.storage.estimate();
      return { quota, usage };
    }
  } catch {
    /* ignore */
  }
  return {};
}
