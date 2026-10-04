/// <reference types="vite/client" />
import React, { useEffect, useRef } from 'react';

// Build timestamp baked in at compile time by vite.config.ts define
declare const __APP_BUILD_TIME__: number;
const CURRENT_BUILD = __APP_BUILD_TIME__;

async function fetchServerVersion(): Promise<number | null> {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache, no-store' },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return typeof json.v === 'number' ? json.v : null;
  } catch {
    return null;
  }
}

async function applyUpdate() {
  try {
    const regs = await navigator.serviceWorker?.getRegistrations() ?? [];
    const waitingReg = regs.find(r => r.waiting);
    if (waitingReg) {
      waitingReg.waiting!.postMessage({ type: 'SKIP_WAITING' });
    }
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(resolve, 3000);
      navigator.serviceWorker?.addEventListener('controllerchange', () => {
        clearTimeout(timeout);
        resolve();
      }, { once: true });
      if (!waitingReg) { clearTimeout(timeout); resolve(); }
    });
    try {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(c => caches.delete(c)));
    } catch { /* non-fatal */ }
  } catch { /* ignore */ }
  window.location.reload();
}

// Module-level singleton guard
let _updateCheckerMounted = false;

/**
 * SilentAutoUpdater — renders nothing.
 * Polls /version.json every 30s. When a newer build is detected,
 * silently applies the update and reloads. No UI, no banner.
 */
export const UpdatePrompt: React.FC = () => {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (_updateCheckerMounted) return;
    _updateCheckerMounted = true;

    const SEEN_KEY = 'zen_seen_v';
    const getSeenVersion = () => parseInt(localStorage.getItem(SEEN_KEY) || '0', 10);
    const markSeen = (v: number) => localStorage.setItem(SEEN_KEY, String(v));

    const check = async () => {
      const serverV = await fetchServerVersion();
      if (serverV !== null && serverV > CURRENT_BUILD && serverV !== getSeenVersion()) {
        markSeen(serverV);
        if (intervalRef.current) clearInterval(intervalRef.current);
        applyUpdate();
      }
    };

    const initialTimer = setTimeout(check, 5000);
    intervalRef.current = setInterval(check, 30_000);

    return () => {
      _updateCheckerMounted = false;
      clearTimeout(initialTimer);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return null;
};
