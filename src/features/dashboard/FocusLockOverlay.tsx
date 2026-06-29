/**
 * FocusLockOverlay — ART 6: Focus Lock UI
 *
 * Renders a persistent top banner when a focus lock session is active.
 * Triggered by the `zen-focus-lock` event from toolExecutor's `focus_lock` tool.
 *
 * Features:
 *   - Live countdown timer until lock ends
 *   - Task name display
 *   - "Exit Focus" button that cancels the session
 *   - Subtle animated border on the viewport edge
 *   - Dispatches `zen-focus-unlock` when dismissed
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, Unlock, Timer, Brain } from 'lucide-react';

interface FocusSession {
  active: boolean;
  until: string; // ISO timestamp
  taskName: string;
}

export function FocusLockOverlay() {
  const [session, setSession] = useState<FocusSession | null>(null);
  const [timeLeft, setTimeLeft] = useState('');
  const [progressPct, setProgressPct] = useState(100);
  const startTimeRef = useRef<number>(0);
  const endTimeRef = useRef<number>(0);

  // Listen for focus lock/unlock events
  useEffect(() => {
    const lockHandler = (e: Event) => {
      const detail = (e as CustomEvent).detail as FocusSession;
      if (detail?.active && detail?.until) {
        setSession(detail);
        endTimeRef.current = new Date(detail.until).getTime();
        startTimeRef.current = Date.now();
      }
    };
    const unlockHandler = () => {
      setSession(null);
    };
    window.addEventListener('zen-focus-lock', lockHandler);
    window.addEventListener('zen-focus-unlock', unlockHandler);
    return () => {
      window.removeEventListener('zen-focus-lock', lockHandler);
      window.removeEventListener('zen-focus-unlock', unlockHandler);
    };
  }, []);

  // Countdown timer
  useEffect(() => {
    if (!session) return;
    const tick = () => {
      const now = Date.now();
      const remaining = endTimeRef.current - now;
      const total = endTimeRef.current - startTimeRef.current;

      if (remaining <= 0) {
        setSession(null);
        setTimeLeft('');
        window.dispatchEvent(new CustomEvent('zen-focus-unlock', { detail: { reason: 'expired' } }));
        return;
      }

      const mins = Math.floor(remaining / 60000);
      const secs = Math.floor((remaining % 60000) / 1000);
      setTimeLeft(`${mins}:${secs.toString().padStart(2, '0')}`);
      setProgressPct(Math.max(0, (remaining / total) * 100));
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [session]);

  const exitFocus = useCallback(() => {
    window.dispatchEvent(new CustomEvent('zen-focus-unlock', { detail: { reason: 'user_cancelled' } }));
    setSession(null);
  }, []);

  if (!session) return null;

  // Progress color: green → yellow → red as time runs out
  const progressColor = progressPct > 60
    ? '#10b981'
    : progressPct > 30
    ? '#eab308'
    : '#ef4444';

  return (
    <AnimatePresence>
      <motion.div
        key="focus-lock-overlay"
        initial={{ y: -80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -80, opacity: 0 }}
        transition={{ type: 'spring', damping: 22, stiffness: 280 }}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 99980,
          background: 'linear-gradient(135deg, rgba(5, 25, 10, 0.97), rgba(5, 30, 20, 0.97))',
          borderBottom: `2px solid ${progressColor}`,
          boxShadow: `0 4px 30px ${progressColor}30, 0 0 0 1px ${progressColor}20`,
          padding: '0.65rem 1.25rem',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
        }}
      >
        {/* Lock icon + pulse */}
        <motion.div
          animate={{ opacity: [1, 0.5, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
          style={{ flexShrink: 0, color: progressColor, display: 'flex', alignItems: 'center' }}
        >
          <Lock size={18} />
        </motion.div>

        {/* Task name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 0 }}>
          <Brain size={14} style={{ color: progressColor, flexShrink: 0 }} />
          <span style={{
            fontSize: '0.82rem',
            fontWeight: 600,
            color: '#fff',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            Focus Lock Active: {session.taskName}
          </span>
        </div>

        {/* Progress bar */}
        <div style={{
          flex: 1,
          maxWidth: '160px',
          height: '4px',
          background: 'rgba(255,255,255,0.1)',
          borderRadius: '2px',
          overflow: 'hidden',
        }}>
          <motion.div
            style={{
              height: '100%',
              borderRadius: '2px',
              background: progressColor,
              boxShadow: `0 0 8px ${progressColor}`,
            }}
            animate={{ width: `${progressPct}%` }}
            transition={{ duration: 1, ease: 'linear' }}
          />
        </div>

        {/* Countdown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
          <Timer size={14} style={{ color: progressColor }} />
          <span style={{
            fontFamily: 'monospace',
            fontSize: '0.9rem',
            fontWeight: 700,
            color: progressColor,
            minWidth: '45px',
            textAlign: 'right',
          }}>
            {timeLeft}
          </span>
        </div>

        {/* Exit button */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={exitFocus}
          style={{
            background: 'rgba(255,255,255,0.07)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: '8px',
            color: 'rgba(255,255,255,0.6)',
            fontSize: '0.72rem',
            fontWeight: 600,
            cursor: 'pointer',
            padding: '0.3rem 0.65rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.3rem',
            flexShrink: 0,
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.12)';
            (e.currentTarget as HTMLElement).style.color = '#fff';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.07)';
            (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.6)';
          }}
        >
          <Unlock size={12} />
          Exit Focus
        </motion.button>
      </motion.div>
    </AnimatePresence>
  );
}
