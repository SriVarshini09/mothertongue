'use client';

/**
 * Connectivity: browser signals plus lightweight same-origin reachability.
 * navigator.onLine alone never proves internet — verify before trusting it.
 * States: online | offline | unknown (SSR / undetectable).
 */

import { useEffect, useState } from 'react';

export type ConnectivityState = 'online' | 'offline' | 'unknown';

export function initialConnectivity(): ConnectivityState {
  if (typeof navigator === 'undefined') return 'unknown';
  return navigator.onLine ? 'online' : 'offline';
}

let lastProbe: { at: number; online: boolean } | null = null;
const PROBE_TTL_MS = 60_000;

export function invalidateReachabilityProbe(): void {
  lastProbe = null;
}

/** Same-origin probe (never caches, 6s timeout). Result cached 60s. */
export async function checkReachability(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  const now = Date.now();
  if (lastProbe && now - lastProbe.at < PROBE_TTL_MS) return lastProbe.online;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const ctrl = new AbortController();
    timer = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch('/api/health', {
      method: 'GET',
      cache: 'no-store',
      signal: ctrl.signal,
    });
    lastProbe = { at: now, online: res.ok };
    return res.ok;
  } catch {
    lastProbe = { at: now, online: false };
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function subscribeConnectivity(listener: (s: ConnectivityState) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onOnline = () => {
    invalidateReachabilityProbe();
    listener('online');
  };
  const onOffline = () => {
    lastProbe = { at: Date.now(), online: false };
    listener('offline');
  };
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  return () => {
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
  };
}

export function useConnectivity(): ConnectivityState {
  // Always start at 'unknown' so the first client render matches the
  // server HTML exactly (avoids React hydration mismatch); the real
  // value syncs immediately after mount.
  const [state, setState] = useState<ConnectivityState>('unknown');
  useEffect(() => {
    setState(initialConnectivity());
    return subscribeConnectivity(setState);
  }, []);
  return state;
}
