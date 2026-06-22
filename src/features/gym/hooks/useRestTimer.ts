import { useState, useEffect, useCallback, useRef } from 'react';
import type { GymDayLog } from '../../../types/gym.types';

interface RestTimerState {
  timeLeft: number;       // seconds remaining
  totalTime: number;      // original duration
  isRunning: boolean;
  exerciseName: string;
}

export function useRestTimer(log: GymDayLog | null, clearDbTimer: () => void, onComplete?: () => void) {
  const [state, setState] = useState<RestTimerState>({
    timeLeft: 0, totalTime: 0, isRunning: false, exerciseName: '',
  });

  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (!log?.restTimerStartTime || !log?.restTimerDurationSecs) {
      setState({ timeLeft: 0, totalTime: 0, isRunning: false, exerciseName: '' });
      return;
    }

    const { restTimerStartTime, restTimerDurationSecs, restTimerExerciseName } = log;
    
    // Check initial state
    const elapsed = Math.floor((Date.now() - restTimerStartTime) / 1000);
    const remaining = restTimerDurationSecs - elapsed;

    if (remaining <= 0) {
      setState({ timeLeft: 0, totalTime: restTimerDurationSecs, isRunning: false, exerciseName: restTimerExerciseName || '' });
      clearDbTimer();
      onCompleteRef.current?.();
      return;
    }

    setState({
      timeLeft: remaining,
      totalTime: restTimerDurationSecs,
      isRunning: true,
      exerciseName: restTimerExerciseName || '',
    });

    const interval = window.setInterval(() => {
      const e = Math.floor((Date.now() - restTimerStartTime) / 1000);
      const rem = restTimerDurationSecs - e;

      if (rem <= 0) {
        clearInterval(interval);
        setState({ timeLeft: 0, totalTime: restTimerDurationSecs, isRunning: false, exerciseName: restTimerExerciseName || '' });
        clearDbTimer();
        onCompleteRef.current?.();
        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
      } else {
        setState({
          timeLeft: rem,
          totalTime: restTimerDurationSecs,
          isRunning: true,
          exerciseName: restTimerExerciseName || '',
        });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [log?.restTimerStartTime, log?.restTimerDurationSecs, log?.restTimerExerciseName, clearDbTimer]);

  const stop = useCallback(() => {
    clearDbTimer();
  }, [clearDbTimer]);

  const skip = useCallback(() => {
    clearDbTimer();
    onCompleteRef.current?.();
  }, [clearDbTimer]);

  const progress = state.totalTime > 0
    ? (state.totalTime - state.timeLeft) / state.totalTime
    : 0;

  const formatted = () => {
    const m = Math.floor(state.timeLeft / 60);
    const s = state.timeLeft % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  return { ...state, progress, stop, skip, formatted };
}
