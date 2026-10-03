'use client';

import { useEffect } from 'react';

/** Registers the offline app-shell service worker (PWA). Silent failure. */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    const register = async () => {
      try {
        await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      } catch {
        /* offline shell unavailable — app still works online */
      }
    };
    void register();
  }, []);
  return null;
}
