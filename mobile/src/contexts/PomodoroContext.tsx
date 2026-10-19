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
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

import { db, auth } from '../services/firebase';
import { safeWrite } from '../utils/safeWrite';
import { awardXP } from '../services/xpSystem';
import { feedback } from '../utils/haptics';
import { COLLECTION } from '../config/constants';
import { formatLocalDateStr } from '../utils/dateUtils';
import {
  PomodoroMode,
  PomodoroConfig,
  DEFAULT_CONFIG,
} from '../components/Tasks/pomodoroTimeMath';

const STORAGE_KEY_POMODORO = '@zentrack_active_pomodoro_v2';
const STORAGE_KEY_POMO_TODAY = '@zentrack_pomodoro_completed_today_v2';
const STORAGE_KEY_POMO_KEEP_AWAKE = '@zentrack_pomodoro_keep_awake';
const POMODORO_KEEP_AWAKE_TAG = 'ZenTrackPomodoroKeepAwake';

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
  totalSecondsToday: number;
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
  switchMode: (newMode: PomodoroMode, customDuration?: number) => void;
  setConfig: React.Dispatch<React.SetStateAction<PomodoroConfig>>;
  setLinkedTask: (taskId: string | null, taskTitle?: string | null, customDurationSecs?: number) => void;
  unlinkTask: () => void;
  openPomodoro: (taskId?: string, taskTitle?: string, durationMinutes?: number) => void;
  startTaskPomodoro: (taskId: string, taskTitle?: string, durationMinutes?: number) => void;
  closePomodoro: () => void;
  keepAwakeEnabled: boolean;
  toggleKeepAwake: () => void;
  setKeepAwakeEnabled: (enabled: boolean) => void;
}

export interface PomodoroActionsType {
  startTimer: () => void;
  pauseTimer: () => void;
  toggleTimer: () => void;
  resetTimer: () => void;
  skipSession: () => void;
  extendTime: (seconds?: number) => void;
  switchMode: (newMode: PomodoroMode, customDuration?: number) => void;
  setConfig: React.Dispatch<React.SetStateAction<PomodoroConfig>>;
  setLinkedTask: (taskId: string | null, taskTitle?: string | null, customDurationSecs?: number) => void;
  unlinkTask: () => void;
  openPomodoro: (taskId?: string, taskTitle?: string, durationMinutes?: number) => void;
  startTaskPomodoro: (taskId: string, taskTitle?: string, durationMinutes?: number) => void;
  closePomodoro: () => void;
  setIsSheetOpen: (open: boolean) => void;
  toggleKeepAwake: () => void;
  setKeepAwakeEnabled: (enabled: boolean) => void;
}

export interface PomodoroActiveTaskType {
  linkedTaskId: string | null;
  isPomodoroRunning: boolean;
}

const PomodoroContext = createContext<PomodoroContextType | null>(null);
const PomodoroActionsContext = createContext<PomodoroActionsType | null>(null);
const PomodoroActiveTaskContext = createContext<PomodoroActiveTaskType>({
  linkedTaskId: null,
  isPomodoroRunning: false,
});

export function usePomodoro(): PomodoroContextType {
  const ctx = useContext(PomodoroContext);
  if (!ctx) {
    throw new Error('usePomodoro must be used within a PomodoroProvider');
  }
  return ctx;
}

export function usePomodoroActions(): PomodoroActionsType {
  const ctx = useContext(PomodoroActionsContext);
  if (!ctx) {
    throw new Error('usePomodoroActions must be used within a PomodoroProvider');
  }
  return ctx;
}

export function usePomodoroActiveTask(): PomodoroActiveTaskType {
  return useContext(PomodoroActiveTaskContext);
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
  const [totalSecondsToday, setTotalSecondsToday] = useState<number>(0);
  const [linkedTaskId, setLinkedTaskId] = useState<string | null>(null);
  const [linkedTaskTitle, setLinkedTaskTitle] = useState<string | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState<boolean>(false);
  const [keepAwakeEnabled, setKeepAwakeEnabledState] = useState<boolean>(true);

  // Load saved keep-awake preference (defaults to true)
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY_POMO_KEEP_AWAKE).then(saved => {
      if (saved !== null) {
        try {
          setKeepAwakeEnabledState(JSON.parse(saved));
        } catch {}
      }
    }).catch(() => {});
  }, []);

  const setKeepAwakeEnabled = useCallback((enabled: boolean) => {
    setKeepAwakeEnabledState(enabled);
    AsyncStorage.setItem(STORAGE_KEY_POMO_KEEP_AWAKE, JSON.stringify(enabled)).catch(() => {});
  }, []);

  const toggleKeepAwake = useCallback(() => {
    feedback.tap();
    setKeepAwakeEnabledState(prev => {
      const next = !prev;
      AsyncStorage.setItem(STORAGE_KEY_POMO_KEEP_AWAKE, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  // Screen Keep-Awake Engine: Screen never sleeps when timer sheet is open OR timer is actively running
  useEffect(() => {
    const shouldKeepAwake = keepAwakeEnabled && (isSheetOpen || status === 'running');
    if (shouldKeepAwake) {
      activateKeepAwakeAsync(POMODORO_KEEP_AWAKE_TAG).catch(() => {});
    } else {
      deactivateKeepAwake(POMODORO_KEEP_AWAKE_TAG).catch(() => {});
    }

    return () => {
      deactivateKeepAwake(POMODORO_KEEP_AWAKE_TAG).catch(() => {});
    };
  }, [keepAwakeEnabled, isSheetOpen, status]);

  const isInitializedRef = useRef<boolean>(false);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Live state snapshot ref so persistState & handleSessionComplete have stable
  // references and NEVER tear down setInterval or AppState listeners on every 1s tick.
  const stateRef = useRef({
    status,
    mode,
    timeLeft,
    totalDuration,
    startTime,
    targetEndTime,
    pausedAt,
    sessionCount,
    completedToday,
    totalSecondsToday,
    linkedTaskId,
    linkedTaskTitle,
    config,
  });

  stateRef.current = {
    status,
    mode,
    timeLeft,
    totalDuration,
    startTime,
    targetEndTime,
    pausedAt,
    sessionCount,
    completedToday,
    totalSecondsToday,
    linkedTaskId,
    linkedTaskTitle,
    config,
  };

  const persistState = useCallback(async (statePayload: Partial<ActivePomodoroState>) => {
    try {
      const s = stateRef.current;
      const now = Date.now();
      const currentFullState: ActivePomodoroState = {
        status: s.status,
        mode: s.mode,
        timeLeft: s.timeLeft,
        totalDuration: s.totalDuration,
        startTime: s.startTime,
        targetEndTime: s.targetEndTime,
        pausedAt: s.pausedAt,
        sessionCount: s.sessionCount,
        completedToday: s.completedToday,
        linkedTaskId: s.linkedTaskId,
        linkedTaskTitle: s.linkedTaskTitle,
        updatedAt: now,
        ...statePayload,
      };
      await AsyncStorage.setItem(STORAGE_KEY_POMODORO, JSON.stringify(currentFullState));
    } catch (e) {
      console.warn('[PomodoroContext] Error persisting state to local cache:', e);
    }
  }, []);

  const handleSessionComplete = useCallback(async (_completedMode?: PomodoroMode) => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (Platform.OS === 'android') Vibration.vibrate([0, 300, 200, 300]);
    feedback.success();

    const s = stateRef.current;
    const completedMode = _completedMode || s.mode;
    const isFocus = completedMode === 'focus';
    const uid = auth.currentUser?.uid;

    let newSessionCount = s.sessionCount;
    let newCompletedToday = s.completedToday;
    let newTotalSecondsToday = s.totalSecondsToday;

    if (isFocus) {
      newSessionCount = s.sessionCount + 1;
      newCompletedToday = s.completedToday + 1;
      const sessionSecs = s.totalDuration > 0 ? s.totalDuration : s.config.focus;
      newTotalSecondsToday = s.totalSecondsToday + sessionSecs;

      setSessionCount(newSessionCount);
      setCompletedToday(newCompletedToday);
      setTotalSecondsToday(newTotalSecondsToday);

      AsyncStorage.setItem(STORAGE_KEY_POMO_TODAY, JSON.stringify({
        date: formatLocalDateStr(new Date()),
        count: newCompletedToday,
        totalSeconds: newTotalSecondsToday,
      })).catch(() => {});

      if (uid) {
        try {
          await addDoc(collection(db, COLLECTION.POMODORO_SESSIONS || 'pomodoro_sessions'), {
            userId: uid,
            startTime: serverTimestamp(),
            duration: sessionSecs,
            taskId: s.linkedTaskId ?? null,
            mode: 'focus',
          });
          await awardXP('POMODORO_SESSION');
        } catch { /* non-blocking */ }
      }
    }

    let nextMode: PomodoroMode = 'focus';
    if (isFocus) {
      nextMode = (newSessionCount % 4 === 0) ? 'longBreak' : 'shortBreak';
    } else {
      nextMode = 'focus';
    }
    const nextDuration = s.config[nextMode];

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
  }, [persistState]);

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
          handleSessionComplete(stateRef.current.mode);
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
  }, [status, targetEndTime, handleSessionComplete]);

  const reconcileActiveTimer = useCallback(async () => {
    try {
      const s = stateRef.current;
      const todayStr = formatLocalDateStr(new Date());
      const savedToday = await AsyncStorage.getItem(STORAGE_KEY_POMO_TODAY);
      if (savedToday) {
        try {
          const parsedToday = JSON.parse(savedToday);
          if (parsedToday.date === todayStr) {
            if (typeof parsedToday.count === 'number') {
              setCompletedToday(parsedToday.count);
            }
            if (typeof parsedToday.totalSeconds === 'number') {
              setTotalSecondsToday(parsedToday.totalSeconds);
            } else if (typeof parsedToday.count === 'number') {
              setTotalSecondsToday(parsedToday.count * (s.config.focus || 1500));
            }
          } else {
            setCompletedToday(0);
            setTotalSecondsToday(0);
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
          setTimeLeft(0);
          setTotalDuration(savedState.totalDuration || s.config[savedState.mode || 'focus']);
          handleSessionComplete(savedState.mode || 'focus');
        } else {
          const remaining = Math.max(0, Math.round((savedState.targetEndTime - now) / 1000));
          setTimeLeft(remaining);
          setTotalDuration(savedState.totalDuration || s.config[savedState.mode || 'focus']);
          setStartTime(savedState.startTime);
          setTargetEndTime(savedState.targetEndTime);
          setStatus('running');
          setIsSheetOpen(true);
        }
      } else if (savedState.status === 'paused') {
        setStatus('paused');
        setTimeLeft(savedState.timeLeft || s.config[savedState.mode || 'focus']);
        setTotalDuration(savedState.totalDuration || s.config[savedState.mode || 'focus']);
        setPausedAt(savedState.pausedAt);
      }
    } catch (e) {
      console.warn('[PomodoroContext] reconcileActiveTimer error:', e);
    }
  }, [handleSessionComplete]);

  useEffect(() => {
    if (!isInitializedRef.current) {
      isInitializedRef.current = true;
      reconcileActiveTimer();
    }
  }, [reconcileActiveTimer]);

  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        if (stateRef.current.status === 'running') {
          reconcileActiveTimer();
        }
      }
    };
    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => sub.remove();
  }, [reconcileActiveTimer]);

  const startTimer = useCallback(() => {
    feedback.commit();
    const s = stateRef.current;
    const now = Date.now();
    const duration = s.timeLeft > 0 ? s.timeLeft : s.config[s.mode];
    const newTargetEndTime = now + duration * 1000;
    setStatus('running');
    setStartTime(now);
    setTargetEndTime(newTargetEndTime);
    setTotalDuration(s.config[s.mode]);
    setPausedAt(null);
    persistState({
      status: 'running',
      mode: s.mode,
      timeLeft: duration,
      totalDuration: s.config[s.mode],
      startTime: now,
      targetEndTime: newTargetEndTime,
      pausedAt: null,
      sessionCount: s.sessionCount,
      completedToday: s.completedToday,
      linkedTaskId: s.linkedTaskId,
      linkedTaskTitle: s.linkedTaskTitle,
    });
  }, [persistState]);

  const pauseTimer = useCallback(() => {
    feedback.tap();
    const s = stateRef.current;
    const now = Date.now();
    const remaining = s.targetEndTime ? Math.max(0, Math.round((s.targetEndTime - now) / 1000)) : s.timeLeft;
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
  }, [persistState]);

  const toggleTimer = useCallback(() => {
    if (stateRef.current.status === 'running') {
      pauseTimer();
    } else {
      startTimer();
    }
  }, [startTimer, pauseTimer]);

  const resetTimer = useCallback(() => {
    feedback.tap();
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    const s = stateRef.current;
    const defaultDuration = s.config[s.mode];
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
  }, [persistState]);

  const skipSession = useCallback(() => {
    feedback.tap();
    handleSessionComplete(stateRef.current.mode);
  }, [handleSessionComplete]);

  const extendTime = useCallback((seconds: number = 300) => {
    feedback.tap();
    const s = stateRef.current;
    const next = s.timeLeft + seconds;
    setTimeLeft(next);
    if (s.status === 'running' && s.targetEndTime) {
      const newTarget = s.targetEndTime + seconds * 1000;
      setTargetEndTime(newTarget);
      persistState({ timeLeft: next, targetEndTime: newTarget });
    } else {
      persistState({ timeLeft: next });
    }
  }, [persistState]);

  const switchMode = useCallback((newMode: PomodoroMode, customDuration?: number) => {
    feedback.tap();
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    const s = stateRef.current;
    const duration = customDuration && customDuration > 0 ? customDuration : s.config[newMode];
    if (customDuration && customDuration > 0) {
      setConfig(prev => ({ ...prev, [newMode]: customDuration }));
    }
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
  }, [persistState]);

  const setLinkedTask = useCallback((taskId: string | null, taskTitle?: string | null, customDurationSecs?: number) => {
    const s = stateRef.current;
    setLinkedTaskId(taskId);
    setLinkedTaskTitle(taskTitle || null);
    if (taskId && customDurationSecs && customDurationSecs > 0) {
      setConfig(prev => ({ ...prev, focus: customDurationSecs }));
      if (s.mode === 'focus' && s.status === 'idle') {
        setTimeLeft(customDurationSecs);
        setTotalDuration(customDurationSecs);
      }
    }
    persistState({
      linkedTaskId: taskId,
      linkedTaskTitle: taskTitle || null,
    });
  }, [persistState]);

  const unlinkTask = useCallback(() => {
    const s = stateRef.current;
    setLinkedTaskId(null);
    setLinkedTaskTitle(null);
    feedback.tap();
    setConfig(prev => ({ ...prev, focus: DEFAULT_CONFIG.focus }));
    if (s.mode === 'focus' && s.status === 'idle') {
      setTimeLeft(DEFAULT_CONFIG.focus);
      setTotalDuration(DEFAULT_CONFIG.focus);
    }
    persistState({
      linkedTaskId: null,
      linkedTaskTitle: null,
    });
  }, [persistState]);

  const openPomodoro = useCallback((taskId?: string, taskTitle?: string, durationMinutes?: number) => {
    if (taskId) {
      setLinkedTaskId(taskId);
      if (taskTitle) setLinkedTaskTitle(taskTitle);
      if (durationMinutes && durationMinutes > 0) {
        const durSecs = durationMinutes * 60;
        setConfig(prev => ({ ...prev, focus: durSecs }));
        if (stateRef.current.status === 'idle') {
          setTimeLeft(durSecs);
          setTotalDuration(durSecs);
        }
      }
    }
    setIsSheetOpen(true);
  }, []);

  const startTaskPomodoro = useCallback((taskId: string, taskTitle?: string, durationMinutes?: number) => {
    feedback.success();
    const s = stateRef.current;
    const durSecs = (durationMinutes && durationMinutes > 0 ? durationMinutes : 25) * 60;

    // If timer is already running for this exact task, just open sheet
    if (s.status === 'running' && s.linkedTaskId === taskId) {
      setIsSheetOpen(true);
      return;
    }

    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    const now = Date.now();
    const newTargetEndTime = now + durSecs * 1000;

    setLinkedTaskId(taskId);
    setLinkedTaskTitle(taskTitle || null);
    setConfig(prev => ({ ...prev, focus: durSecs }));
    setMode('focus');
    setStatus('running');
    setTimeLeft(durSecs);
    setTotalDuration(durSecs);
    setStartTime(now);
    setTargetEndTime(newTargetEndTime);
    setPausedAt(null);
    setIsSheetOpen(true);

    persistState({
      status: 'running',
      mode: 'focus',
      timeLeft: durSecs,
      totalDuration: durSecs,
      startTime: now,
      targetEndTime: newTargetEndTime,
      pausedAt: null,
      sessionCount: s.sessionCount,
      completedToday: s.completedToday,
      linkedTaskId: taskId,
      linkedTaskTitle: taskTitle || null,
    });
  }, [persistState]);

  const closePomodoro = useCallback(() => {
    setIsSheetOpen(false);
  }, []);

  const actionsValue = useMemo<PomodoroActionsType>(() => ({
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
    startTaskPomodoro,
    closePomodoro,
    setIsSheetOpen,
    toggleKeepAwake,
    setKeepAwakeEnabled,
  }), [
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
    startTaskPomodoro,
    closePomodoro,
    toggleKeepAwake,
    setKeepAwakeEnabled,
  ]);

  const activeTaskValue = useMemo<PomodoroActiveTaskType>(() => ({
    linkedTaskId,
    isPomodoroRunning: status === 'running',
  }), [linkedTaskId, status]);

  const contextValue = useMemo<PomodoroContextType>(() => ({
    status,
    mode,
    timeLeft,
    totalDuration,
    sessionCount,
    completedToday,
    totalSecondsToday,
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
    startTaskPomodoro,
    closePomodoro,
    keepAwakeEnabled,
    toggleKeepAwake,
    setKeepAwakeEnabled,
  }), [
    status,
    mode,
    timeLeft,
    totalDuration,
    sessionCount,
    completedToday,
    totalSecondsToday,
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
    startTaskPomodoro,
    closePomodoro,
    keepAwakeEnabled,
    toggleKeepAwake,
    setKeepAwakeEnabled,
  ]);

  return (
    <PomodoroActionsContext.Provider value={actionsValue}>
      <PomodoroActiveTaskContext.Provider value={activeTaskValue}>
        <PomodoroContext.Provider value={contextValue}>
          {children}
        </PomodoroContext.Provider>
      </PomodoroActiveTaskContext.Provider>
    </PomodoroActionsContext.Provider>
  );
};
