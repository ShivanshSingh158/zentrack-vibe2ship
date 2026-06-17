import { useState, useEffect, useRef, useCallback } from 'react';

interface RestTimerState {
  timeLeft: number;       // seconds remaining
  totalTime: number;      // original duration
  isRunning: boolean;
  exerciseName: string;
}

export function useRestTimer(onComplete?: () => void) {
  const [state, setState] = useState<RestTimerState>({
    timeLeft: 0, totalTime: 0, isRunning: false, exerciseName: '',
  });
  const intervalRef = useRef<number | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const clearTimer = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  }, []);

  const start = useCallback((seconds: number, exerciseName = '') => {
    clearTimer();
    setState({ timeLeft: seconds, totalTime: seconds, isRunning: true, exerciseName });
    intervalRef.current = window.setInterval(() => {
      setState(prev => {
        if (!prev.isRunning) return prev;
        const next = prev.timeLeft - 1;
        if (next <= 0) {
          clearInterval(intervalRef.current!);
          intervalRef.current = null;
          onCompleteRef.current?.();
          // Vibrate on completion if supported
          if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
          return { ...prev, timeLeft: 0, isRunning: false };
        }
        return { ...prev, timeLeft: next };
      });
    }, 1000);
  }, [clearTimer]);

  const stop = useCallback(() => {
    clearTimer();
    setState(prev => ({ ...prev, isRunning: false, timeLeft: 0, totalTime: 0 }));
  }, [clearTimer]);

  const skip = useCallback(() => {
    clearTimer();
    setState(prev => ({ ...prev, isRunning: false, timeLeft: 0 }));
    onCompleteRef.current?.();
  }, [clearTimer]);

  // Cleanup on unmount
  useEffect(() => () => clearTimer(), [clearTimer]);

  const progress = state.totalTime > 0
    ? (state.totalTime - state.timeLeft) / state.totalTime
    : 0;

  const formatted = () => {
    const m = Math.floor(state.timeLeft / 60);
    const s = state.timeLeft % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  return { ...state, progress, start, stop, skip, formatted };
}
