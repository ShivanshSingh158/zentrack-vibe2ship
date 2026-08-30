/**
 * PomodoroContext.tsx — ZenTrack Mobile
 *
 * Ultra-Resilient, Database-Backed Pomodoro Engine:
 * - Monotonic timestamp math (`targetEndTime = now + duration`) ensures 100% accuracy
 *   across backgrounding, device sleep, force-kills, and app restarts.
 * - Dual L1/L2 persistence: Instant local cache via AsyncStorage (`@zentrack_active_pomodoro_v1`)
 *   and cloud sync with Firestore (`user_pomodoro_state/{userId}`).
 * - Instant Boot Auto-Pop: If a timer is running when the app opens, automatically
 *   surfaces the Pomodoro screen right after home screen boot.
 * - Global Floating Pill support for non-intrusive background tracking.
 */
import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { AppState, AppStateStatus, Platform, Vibration } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, setDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';

import { db, auth } from '../services/firebase';
import { safeWrite } from '../utils/safeWrite';
import { awardXP } from '../services/xpSystem';
import { feedback } from '../utils/haptics';
import { COLLECTION } from '../config/constants';
import {
  PomodoroMode,
  PomodoroConfig,
  DEFAULT_CONFIG,
} from '../components/Tasks/pomodoroTimeMath';

const STORAGE_KEY_POMODORO = '@zentrack_active_pomodoro_v2';
const STORAGE_KEY_POMO_TODAY = '@zentrack_pomodoro_completed_today_v2';

export interface ActivePomodoroState {
  status: 'idle' | 'running' | 'paused';
  mode: PomodoroMode;
  timeLeft: number;
  totalDuration: number;
  startTime: number | null;
  targetEndTime: number | null;
  pausedAt: number | null;
  sessionCount: number;
  completedToday: number;
  linkedTaskId: string | null;
  linkedTaskTitle: string | null;
  updatedAt: number;
}

export interface PomodoroContextType {
  status: 'idle' | 'running' | 'paused';
  mode: PomodoroMode;
  timeLeft: number;
  totalDuration: number;
  sessionCount: number;
  completedToday: number;
  linkedTaskId: string | null;
  config: PomodoroConfig;
  isSheetOpen: boolean;
  setIsSheetOpen: (open: boolean) => void;
  startTimer: () => void;
  pauseTimer: () => void;
  toggleTimer: () => void;
  resetTimer: () => void;
  skipSession: () => void;
  extendTime: (seconds?: number) => void;
  switchMode: (newMode: PomodoroMode) => void;
  setConfig: React.Dispatch<React.SetStateAction<PomodoroConfig>>;
  setLinkedTask: (taskId: string | null, taskTitle?: string | null, customDurationSecs?: number) => void;
  unlinkTask: () => void;
  openPomodoro: (taskId?: string) => void;
  closePomodoro: () => void;
}

const PomodoroContext = createContext<PomodoroContextType | null>(null);

export function usePomodoro(): PomodoroContextType {
  const ctx = useContext(PomodoroContext);
  if (!ctx) {
    throw new Error('usePomodoro must be used within a PomodoroProvider');
  }
  return ctx;
}

export const PomodoroProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [config, setConfig] = useState<PomodoroConfig>(DEFAULT_CONFIG);
  const [mode, setMode] = useState<PomodoroMode>('focus');
  const [status, setStatus] = useState<'idle' | 'running' | 'paused'>('idle');
  const [timeLeft, setTimeLeft] = useState<number>(DEFAULT_CONFIG.focus);
  const [totalDuration, setTotalDuration] = useState<number>(DEFAULT_CONFIG.focus);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [targetEndTime, setTargetEndTime] = useState<number | null>(null);
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  const [sessionCount, setSessionCount] = useState<number>(0);
  const [completedToday, setCompletedToday] = useState<number>(0);
  const [linkedTaskId, setLinkedTaskId] = useState<string | null>(null);
  const [linkedTaskTitle, setLinkedTaskTitle] = useState<string | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState<boolean>(false);

  const isInitializedRef = useRef<boolean>(false);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Sync state to local AsyncStorage & Firestore
  const persistState = useCallback(async (statePayload: Partial<ActivePomodoroState>) => {
    try {
      const now = Date.now();
      const currentFullState: ActivePomodoroState = {
        status,
        mode,
        timeLeft,
        totalDuration,
        startTime,
        targetEndTime,
        pausedAt,
        sessionCount,
        completedToday,
        linkedTaskId,
        linkedTaskTitle,
        updatedAt: now,
        ...statePayload,
      };

      await AsyncStorage.setItem(STORAGE_KEY_POMODORO, JSON.stringify(currentFullState));

      const uid = auth.currentUser?.uid;
      if (uid) {
        const firestorePayload = {
          userId: uid,
          status: currentFullState.status,
          mode: currentFullState.mode,
          timeLeft: currentFullState.timeLeft,
          totalDuration: currentFullState.totalDuration,
          startTime: currentFullState.startTime,
          targetEndTime: currentFullState.targetEndTime,
          pausedAt: currentFullState.pausedAt,
          sessionCount: currentFullState.sessionCount,
          completedToday: currentFullState.completedToday,
          linkedTaskId: currentFullState.linkedTaskId,
          linkedTaskTitle: currentFullState.linkedTaskTitle,
          updatedAt: serverTimestamp(),
        };

        safeWrite(
          () => setDoc(doc(db, 'user_pomodoro_state', uid), firestorePayload, { merge: true }),
          'user_pomodoro_state',
          'set',
          firestorePayload,
          uid,
        ).catch(() => {});
      }
    } catch (e) {
      console.warn('[PomodoroContext] Error persisting state:', e);
    }
  }, [status, mode, timeLeft, totalDuration, startTime, targetEndTime, pausedAt, sessionCount, completedToday, linkedTaskId, linkedTaskTitle]);

  // Session completion handler
  const handleSessionComplete = useCallback(async (completedMode: PomodoroMode) => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    if (Platform.OS === 'android') Vibration.vibrate([0, 300, 200, 300]);
    feedback.success();

    const uid = auth.currentUser?.uid;

    if (completedMode === 'focus') {
      const newSessionCount = sessionCount + 1;
      const newCompletedToday = completedToday + 1;
      setSessionCount(newSessionCount);
      setCompletedToday(newCompletedToday);

      // Persist completed count for today
      AsyncStorage.setItem(STORAGE_KEY_POMO_TODAY, JSON.stringify({
        date: new Date().toISOString().slice(0, 10),
        count: newCompletedToday,
      })).catch(() => {});

      // Record session in Firestore
      if (uid) {
        try {
          await addDoc(collection(db, COLLECTION.POMODORO_SESSIONS || 'pomodoro_sessions'), {
            userId: uid,
            startTime: serverTimestamp(),
            duration: totalDuration,
            taskId: linkedTaskId ?? null,
            mode: 'focus',
          });
          await awardXP('POMODORO_SESSION');
        } catch { /* non-blocking */ }
      }

      // Transition to next break mode
      const nextMode = newSessionCount % config.sessionsUntilLong === 0 ? 'longBreak' : 'shortBreak';
      const nextDuration = config[nextMode];
      setMode(nextMode);
      setTimeLeft(nextDuration);
      setTotalDuration(nextDuration);
      setStatus('idle');
      setStartTime(null);
      setTargetEndTime(null);
      setPausedAt(null);

      persistState({
        status: 'idle',
        mode: nextMode,
        timeLeft: nextDuration,
        totalDuration: nextDuration,
        startTime: null,
        targetEndTime: null,
        pausedAt: null,
        sessionCount: newSessionCount,
        completedToday: newCompletedToday,
      });
    } else {
      // Break finished -> back to focus mode
      const nextDuration = config.focus;
      setMode('focus');
      setTimeLeft(nextDuration);
      setTotalDuration(nextDuration);
      setStatus('idle');
      setStartTime(null);
      setTargetEndTime(null);
      setPausedAt(null);

      persistState({
        status: 'idle',
        mode: 'focus',
        timeLeft: nextDuration,
        totalDuration: nextDuration,
        startTime: null,
        targetEndTime: null,
        pausedAt: null,
      });
    }
  }, [sessionCount, completedToday, totalDuration, linkedTaskId, config, persistState]);

  // High-accuracy timer tick loop
  useEffect(() => {
    if (status === 'running' && targetEndTime) {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);

      timerIntervalRef.current = setInterval(() => {
        const now = Date.now();
        const remaining = Math.max(0, Math.round((targetEndTime - now) / 1000));
        setTimeLeft(remaining);

        if (remaining <= 0) {
          if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
          timerIntervalRef.current = null;
          handleSessionComplete(mode);
        }
      }, 1000);
    } else {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    }

    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    };
  }, [status, targetEndTime, mode, handleSessionComplete]);

  // Reconcile timer on boot & foreground transitions
  const reconcileActiveTimer = useCallback(async () => {
    try {
      const todayStr = new Date().toISOString().slice(0, 10);
      const savedToday = await AsyncStorage.getItem(STORAGE_KEY_POMO_TODAY);
      if (savedToday) {
        try {
          const parsedToday = JSON.parse(savedToday);
          if (parsedToday.date === todayStr && typeof parsedToday.count === 'number') {
            setCompletedToday(parsedToday.count);
          }
        } catch {}
      }

      const raw = await AsyncStorage.getItem(STORAGE_KEY_POMODORO);
      if (!raw) return;

      const savedState: ActivePomodoroState = JSON.parse(raw);
      if (!savedState) return;

      setMode(savedState.mode || 'focus');
      setSessionCount(savedState.sessionCount || 0);
      if (savedState.linkedTaskId) setLinkedTaskId(savedState.linkedTaskId);
      if (savedState.linkedTaskTitle) setLinkedTaskTitle(savedState.linkedTaskTitle);

      const now = Date.now();

      if (savedState.status === 'running' && savedState.targetEndTime) {
        if (now >= savedState.targetEndTime) {
          // Timer completed while app was closed/backgrounded!
          setTimeLeft(0);
          setTotalDuration(savedState.totalDuration || config[savedState.mode || 'focus']);
          handleSessionComplete(savedState.mode || 'focus');
        } else {
          // Timer is STILL RUNNING! Resume instantly from exact remaining seconds
          const remaining = Math.max(0, Math.round((savedState.targetEndTime - now) / 1000));
          setTimeLeft(remaining);
          setTotalDuration(savedState.totalDuration || config[savedState.mode || 'focus']);
          setStartTime(savedState.startTime);
          setTargetEndTime(savedState.targetEndTime);
          setStatus('running');

          // REQUIREMENT: If timer is running when app opens, pop up immediately to screen!
          setIsSheetOpen(true);
        }
      } else if (savedState.status === 'paused') {
        setStatus('paused');
        setTimeLeft(savedState.timeLeft || config[savedState.mode || 'focus']);
        setTotalDuration(savedState.totalDuration || config[savedState.mode || 'focus']);
        setPausedAt(savedState.pausedAt);
      }
    } catch (e) {
      console.warn('[PomodoroContext] reconcileActiveTimer error:', e);
    }
  }, [config, handleSessionComplete]);

  // Initial boot load
  useEffect(() => {
    if (!isInitializedRef.current) {
      isInitializedRef.current = true;
      reconcileActiveTimer();
    }
  }, [reconcileActiveTimer]);

  // AppState listener for instant catch-up when coming from background
  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        reconcileActiveTimer();
      }
    };

    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => sub.remove();
  }, [reconcileActiveTimer]);

  // ── Actions ─────────────────────────────────────────────────────────────────

  const startTimer = useCallback(() => {
    feedback.commit();
    const now = Date.now();
    const duration = timeLeft > 0 ? timeLeft : config[mode];
    const newTargetEndTime = now + duration * 1000;

    setStatus('running');
    setStartTime(now);
    setTargetEndTime(newTargetEndTime);
    setTotalDuration(config[mode]);
    setPausedAt(null);

    persistState({
      status: 'running',
      mode,
      timeLeft: duration,
      totalDuration: config[mode],
      startTime: now,
      targetEndTime: newTargetEndTime,
      pausedAt: null,
      sessionCount,
      completedToday,
      linkedTaskId,
      linkedTaskTitle,
    });
  }, [timeLeft, config, mode, sessionCount, completedToday, linkedTaskId, linkedTaskTitle, persistState]);

  const pauseTimer = useCallback(() => {
    feedback.tap();
    const now = Date.now();
    const remaining = targetEndTime ? Math.max(0, Math.round((targetEndTime - now) / 1000)) : timeLeft;

    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    setStatus('paused');
    setTimeLeft(remaining);
    setPausedAt(now);
    setTargetEndTime(null);

    persistState({
      status: 'paused',
      timeLeft: remaining,
      pausedAt: now,
      targetEndTime: null,
    });
  }, [targetEndTime, timeLeft, persistState]);

  const toggleTimer = useCallback(() => {
    if (status === 'running') {
      pauseTimer();
    } else {
      startTimer();
    }
  }, [status, startTimer, pauseTimer]);

  const resetTimer = useCallback(() => {
    feedback.tap();
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    const defaultDuration = config[mode];
    setStatus('idle');
    setTimeLeft(defaultDuration);
    setTotalDuration(defaultDuration);
    setStartTime(null);
    setTargetEndTime(null);
    setPausedAt(null);

    persistState({
      status: 'idle',
      timeLeft: defaultDuration,
      totalDuration: defaultDuration,
      startTime: null,
      targetEndTime: null,
      pausedAt: null,
    });
  }, [config, mode, persistState]);

  const skipSession = useCallback(() => {
    feedback.tap();
    handleSessionComplete(mode);
  }, [mode, handleSessionComplete]);

  const extendTime = useCallback((seconds: number = 300) => {
    feedback.tap();
    setTimeLeft(prev => {
      const next = prev + seconds;
      if (status === 'running' && targetEndTime) {
        const newTarget = targetEndTime + seconds * 1000;
        setTargetEndTime(newTarget);
        persistState({ timeLeft: next, targetEndTime: newTarget });
      } else {
        persistState({ timeLeft: next });
      }
      return next;
    });
  }, [status, targetEndTime, persistState]);

  const switchMode = useCallback((newMode: PomodoroMode) => {
    feedback.tap();
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    const duration = config[newMode];
    setStatus('idle');
    setMode(newMode);
    setTimeLeft(duration);
    setTotalDuration(duration);
    setStartTime(null);
    setTargetEndTime(null);
    setPausedAt(null);

    persistState({
      status: 'idle',
      mode: newMode,
      timeLeft: duration,
      totalDuration: duration,
      startTime: null,
      targetEndTime: null,
      pausedAt: null,
    });
  }, [config, persistState]);

  const setLinkedTask = useCallback((taskId: string | null, taskTitle?: string | null, customDurationSecs?: number) => {
    setLinkedTaskId(taskId);
    setLinkedTaskTitle(taskTitle || null);

    if (taskId && customDurationSecs && customDurationSecs > 0) {
      setConfig(prev => ({ ...prev, focus: customDurationSecs }));
      if (mode === 'focus' && status === 'idle') {
        setTimeLeft(customDurationSecs);
        setTotalDuration(customDurationSecs);
      }
    }

    persistState({
      linkedTaskId: taskId,
      linkedTaskTitle: taskTitle || null,
    });
  }, [mode, status, persistState]);

  const unlinkTask = useCallback(() => {
    setLinkedTaskId(null);
    setLinkedTaskTitle(null);
    feedback.tap();
    setConfig(prev => ({ ...prev, focus: DEFAULT_CONFIG.focus }));

    if (mode === 'focus' && status === 'idle') {
      setTimeLeft(DEFAULT_CONFIG.focus);
      setTotalDuration(DEFAULT_CONFIG.focus);
    }

    persistState({
      linkedTaskId: null,
      linkedTaskTitle: null,
    });
  }, [mode, status, persistState]);

  const openPomodoro = useCallback((taskId?: string) => {
    if (taskId) {
      setLinkedTaskId(taskId);
    }
    setIsSheetOpen(true);
  }, []);

  const closePomodoro = useCallback(() => {
    setIsSheetOpen(false);
  }, []);

  const contextValue = useMemo<PomodoroContextType>(() => ({
    status,
    mode,
    timeLeft,
    totalDuration,
    sessionCount,
    completedToday,
    linkedTaskId,
    config,
    isSheetOpen,
    setIsSheetOpen,
    startTimer,
    pauseTimer,
    toggleTimer,
    resetTimer,
    skipSession,
    extendTime,
    switchMode,
    setConfig,
    setLinkedTask,
    unlinkTask,
    openPomodoro,
    closePomodoro,
  }), [
    status,
    mode,
    timeLeft,
    totalDuration,
    sessionCount,
    completedToday,
    linkedTaskId,
    config,
    isSheetOpen,
    startTimer,
    pauseTimer,
    toggleTimer,
    resetTimer,
    skipSession,
    extendTime,
    switchMode,
    setLinkedTask,
    unlinkTask,
    openPomodoro,
    closePomodoro,
  ]);

  return (
    <PomodoroContext.Provider value={contextValue}>
      {children}
    </PomodoroContext.Provider>
  );
};
