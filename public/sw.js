/* MotherTongue offline shell. App shell only — never caches API
 * responses (no POST caching, no sensitive content). Versioned cache. */
const CACHE = 'mothertongue-shell-v1';
const PRECACHE = ['/', '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png'];

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

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
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
