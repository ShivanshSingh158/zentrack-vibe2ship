import { useState, useEffect, useRef, useCallback } from 'react';

/** Tracks elapsed workout session time.
 *  Starts on first completed set, stops when all sets are done or manually. */
export function useWorkoutTimer() {
  const [elapsedSec, setElapsedSec] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const startedAtRef = useRef<number | null>(null);
  const intervalRef = useRef<number | null>(null);

  const start = useCallback(() => {
    if (isActive) return;
    startedAtRef.current = Date.now() - elapsedSec * 1000;
    setIsActive(true);
  }, [isActive, elapsedSec]);

  const stop = useCallback(() => {
    setIsActive(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
  }, []);

  const reset = useCallback(() => {
    stop();
    setElapsedSec(0);
    startedAtRef.current = null;
  }, [stop]);

  useEffect(() => {
    if (!isActive) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = window.setInterval(() => {
      if (startedAtRef.current) {
        setElapsedSec(Math.floor((Date.now() - startedAtRef.current) / 1000));
      }
    }, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isActive]);

  // Cleanup on unmount
  useEffect(() => {
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  const formatted = () => {
    const h = Math.floor(elapsedSec / 3600);
    const m = Math.floor((elapsedSec % 3600) / 60);
    const s = elapsedSec % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return { elapsedSec, isActive, start, stop, reset, formatted };
}
