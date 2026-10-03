/* MotherTongue offline shell. App shell only — never caches API
 * responses (no POST caching, no sensitive content). Versioned cache. */
const CACHE = 'mothertongue-shell-v2';
const MODEL_HOSTS = new Set(['huggingface.co', 'cdn-lfs.huggingface.co']);
const PRECACHE = ['/', '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png'];
const MODEL_DB = 'mothertongue-models';
const MODEL_STORE = 'files';

function openModelDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(MODEL_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(MODEL_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('model-db-open-failed'));
  });
}

async function readModelFile(key) {
  const db = await openModelDb();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction(MODEL_STORE, 'readonly').objectStore(MODEL_STORE).get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error('model-read-failed'));
    });
  } finally {
    db.close();
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
      .catch(() => undefined)
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
      .catch(() => undefined)
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'PRECACHE_URLS' || !Array.isArray(event.data.urls)) return;
  const urls = event.data.urls.filter((value) => {
    if (typeof value !== 'string') return false;
    try {
      const url = new URL(value, self.location.origin);
      return url.origin === self.location.origin && !url.pathname.startsWith('/api/');
    } catch {
      return false;
    }
  });
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      await Promise.all(
        urls.map(async (url) => {
          try {
            const response = await fetch(url, { credentials: 'same-origin' });
            if (response.ok) await cache.put(url, response);
          } catch {
            /* One optional asset must not prevent the rest of the shell caching. */
          }
        })
      );
    })
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    if (MODEL_HOSTS.has(url.hostname)) {
      event.respondWith(
        (async () => {
          try {
            const cache = await caches.open('transformers-cache');
            const hit = await cache.match(request);
            if (hit) return hit;
          } catch {
            /* fall through to the IndexedDB-backed model store */
          }
          try {
            const mapping = await readModelFile(`offline-url/${request.url}`);
            if (mapping) {
              const { key } = JSON.parse(await mapping.text());
              if (typeof key === 'string') {
                const blob = await readModelFile(key);
                if (blob) {
                  return new Response(blob, {
                    headers: { 'Content-Type': 'application/octet-stream' },
                  });
                }
              }
            }
          } catch {
            /* fall through to the network */
          }
          return fetch(request);
        })()
      );
      return;
    }
    // Fonts/CDN: stale-while-revalidate, never blocking.
    if (url.hostname.includes('fonts.g')) {
      event.respondWith(
        caches.open(CACHE).then(async (cache) => {
          const hit = await cache.match(request);
          const net = fetch(request)
            .then((res) => {
              if (res.ok) cache.put(request, res.clone());
              return res;
            })
            .catch(() => undefined);
          return hit || net || Response.error();
        })
      );
    }
    return;
  }
  if (url.pathname.startsWith('/api/')) return; // network only, never cached
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => {
              if (res.ok) cache.put(request, copy);
            });
            return res;
          })
      )
    );
    return;
  }
  // Navigations + shell: network first, cached app shell fallback offline.
  event.respondWith(
    fetch(request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => {
          if (res.ok) cache.put(request, copy);
        });
        return res;
      })
      .catch(() =>
        caches.match(request).then((hit) => hit || caches.match('/'))
      )
  );
});
