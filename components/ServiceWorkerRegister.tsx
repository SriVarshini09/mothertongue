'use client';

import { useEffect } from 'react';

/** Registers the offline app-shell service worker (PWA). Silent failure. */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        await navigator.serviceWorker.ready;
        const urls = Array.from(document.querySelectorAll('script[src], link[href]'))
          .map((node) => (node instanceof HTMLScriptElement ? node.src : (node as HTMLLinkElement).href))
          .filter((url) => {
            try {
              const parsed = new URL(url, window.location.href);
              return parsed.origin === window.location.origin && !parsed.pathname.startsWith('/api/');
            } catch {
              return false;
            }
          });
        registration.active?.postMessage({ type: 'PRECACHE_URLS', urls });
      } catch {
        /* offline shell unavailable — app still works online */
      }
    };
    void register();
  }, []);
  return null;
}
