/// <reference types="vite/client" />
import React, { useState, useEffect, useRef } from 'react';
import { Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// ── Build timestamp baked in at compile time by vite.config.ts define ─────────
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
    // Clear all SW caches so stale chunks are evicted
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map(c => caches.delete(c)));
    // Unregister existing SWs so the fresh one installs cleanly
    const regs = await navigator.serviceWorker?.getRegistrations() ?? [];
    await Promise.all(regs.map(r => r.unregister()));
  } catch { /* ignore — reload will still work */ }
  window.location.reload();
}

export const UpdatePrompt: React.FC = () => {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [applying, setApplying] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Persistent seen-version guard ────────────────────────────────────────
  // Stores the server version we've already shown the banner for.
  // Survives page refresh so the banner never re-appears for the same version.
  const SEEN_KEY = 'zen_seen_v';
  const getSeenVersion = () => parseInt(localStorage.getItem(SEEN_KEY) || '0', 10);
  const markSeen = (v: number) => localStorage.setItem(SEEN_KEY, String(v));

  useEffect(() => {
    const check = async () => {
      const serverV = await fetchServerVersion();
      if (
        serverV !== null &&          // fetch succeeded
        serverV > CURRENT_BUILD &&   // server is actually newer than running bundle
        serverV !== getSeenVersion() // we haven't already dismissed this exact version
      ) {
        markSeen(serverV);           // mark immediately — refresh will never re-show this
        setUpdateAvailable(true);
        // Auto-expand after a brief pause so user notices it
        setTimeout(() => setIsExpanded(true), 600);
        // Stop polling — no need to keep checking
        if (intervalRef.current) clearInterval(intervalRef.current);
      }
    };

    // First check after 5 seconds (let page settle)
    const initialTimer = setTimeout(check, 5000);

    // Then poll every 30 seconds
    intervalRef.current = setInterval(check, 30_000);

    return () => {
      clearTimeout(initialTimer);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const handleInstall = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (applying) return;
    setApplying(true);
    // Stop polling — we're about to reload
    if (intervalRef.current) clearInterval(intervalRef.current);
    await applyUpdate();
  };

  return (
    <AnimatePresence>
      {updateAvailable && (
        <div
          style={{
            position: 'fixed',
            top: '20px',
            left: 0,
            right: 0,
            zIndex: 999999,
            display: 'flex',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <motion.div
            onMouseEnter={() => setIsExpanded(true)}
            onMouseLeave={() => !applying && setIsExpanded(false)}
            onClick={() => setIsExpanded(true)}
            initial={{ y: -120, opacity: 0, scale: 0.85 }}
            animate={{
              y: 0,
              opacity: 1,
              scale: 1,
              width: isExpanded ? 340 : 210,
              height: isExpanded ? (applying ? 76 : 148) : 48,
              borderRadius: isExpanded ? 28 : 40,
            }}
            exit={{ y: -120, opacity: 0, scale: 0.85 }}
            transition={{ type: 'spring', stiffness: 420, damping: 28 }}
            style={{
              background: 'rgba(8, 6, 16, 0.92)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              border: '1px solid rgba(168, 85, 247, 0.5)',
              boxShadow: isExpanded
                ? '0 24px 48px rgba(0,0,0,0.8), 0 0 40px rgba(168,85,247,0.25)'
                : '0 8px 24px rgba(0,0,0,0.6), 0 0 20px rgba(168,85,247,0.4)',
              pointerEvents: 'auto',
              cursor: isExpanded ? 'default' : 'pointer',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              position: 'relative',
            }}
          >
            {/* Animated conic gradient border glow */}
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, ease: 'linear', duration: applying ? 1.2 : 5 }}
              style={{
                position: 'absolute',
                inset: '-180px',
                background: 'conic-gradient(from 0deg, transparent 60%, #a855f7 75%, #ec4899 85%, #f97316 92%, transparent)',
                opacity: isExpanded ? 0.12 : 0.25,
                zIndex: 0,
                pointerEvents: 'none',
              }}
            />

            {/* Pill / collapsed state */}
            <div
              style={{
                height: '48px',
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                zIndex: 1,
                padding: '0 16px',
                flexShrink: 0,
              }}
            >
              {/* Logo spinner */}
              <motion.div
                animate={{ rotate: applying ? 360 : 0 }}
                transition={applying ? { repeat: Infinity, ease: 'linear', duration: 0.7 } : {}}
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  overflow: 'hidden',
                  flexShrink: 0,
                }}
              >
                <img
                  src="/logo.png"
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover', mixBlendMode: 'screen' }}
                />
              </motion.div>

              <AnimatePresence mode="wait">
                <motion.span
                  key={applying ? 'applying' : isExpanded ? 'expanded' : 'pill'}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.15 }}
                  style={{
                    color: '#fff',
                    fontWeight: 700,
                    fontSize: isExpanded ? '1rem' : '0.9rem',
                    whiteSpace: 'nowrap',
                    letterSpacing: '-0.01em',
                  }}
                >
                  {applying ? 'Restarting…' : isExpanded ? '✨ New Zentrack' : '⚡ Update Ready'}
                </motion.span>
              </AnimatePresence>
            </div>

            {/* Expanded content */}
            <AnimatePresence>
              {isExpanded && !applying && (
                <motion.div
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.18 }}
                  style={{
                    width: '100%',
                    padding: '0 18px 18px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '10px',
                    zIndex: 1,
                  }}
                >
                  <p
                    style={{
                      color: 'rgba(161,161,170,0.9)',
                      fontSize: '0.8rem',
                      textAlign: 'center',
                      margin: 0,
                      lineHeight: 1.5,
                    }}
                  >
                    A fresh update is ready. Install instantly — no data lost.
                  </p>

                  <button
                    onClick={handleInstall}
                    style={{
                      width: '100%',
                      padding: '9px 16px',
                      borderRadius: '18px',
                      background: 'linear-gradient(135deg, #7c3aed, #a855f7, #ec4899)',
                      border: 'none',
                      color: '#fff',
                      fontSize: '0.9rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '7px',
                      boxShadow: '0 6px 20px rgba(168,85,247,0.45)',
                      transition: 'transform 0.1s, box-shadow 0.1s',
                      WebkitTapHighlightColor: 'transparent',
                    }}
                    onMouseDown={e => { e.currentTarget.style.transform = 'scale(0.96)'; }}
                    onMouseUp={e => { e.currentTarget.style.transform = 'scale(1)'; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
                    onTouchStart={e => { e.currentTarget.style.transform = 'scale(0.96)'; }}
                    onTouchEnd={e => { e.currentTarget.style.transform = 'scale(1)'; }}
                  >
                    <Zap size={15} fill="currentColor" />
                    Install Now
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
