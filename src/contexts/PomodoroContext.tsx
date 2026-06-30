import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import type { ReactNode } from 'react';
import { playPopSound } from '../utils/sound';
import { toast } from 'sonner';
import {
  collection, query, where, getDocs, addDoc, updateDoc,
  doc, getDoc,
} from 'firebase/firestore';
import { db, auth } from '../services/firebase';
import { getLocalDateString } from '../utils/dateUtils';
import { sendSystemNotification } from '../utils/notifications';
import { sendPushNotification } from '../services/fcm';


interface PomodoroState {
  taskId: string | null;
  taskText: string;
  timeLeft: number;
  isRunning: boolean;
  learningTopicId?: string | null;
  learningSubTaskId?: string | null;
  ambientSound: 'none' | 'rain' | 'soft-rain' | 'forest' | 'waves';
}

interface PomodoroContextType {
  state: PomodoroState;
  startTimer: (taskId: string, taskText: string, learningTopicId?: string, learningSubTaskId?: string, durationMinutes?: number) => void;
  pauseTimer: () => void;
  resumeTimer: () => void;
  resetTimer: () => void;
  dismissTimer: () => void;
  formatTime: (seconds: number) => string;
  focusMode: boolean;
  toggleFocusMode: () => void;
  setAmbientSound: (sound: 'none' | 'rain' | 'soft-rain' | 'forest' | 'waves') => void;
  setDuration: (minutes: number) => void;
}

const STORAGE_KEY     = 'cc_pomodoro';
const DEFAULT_DURATION = 25 * 60;

const defaultState: PomodoroState = {
  taskId:           null,
  taskText:         '',
  timeLeft:         DEFAULT_DURATION,
  isRunning:        false,
  learningTopicId:  null,
  learningSubTaskId:null,
  ambientSound:     'none',
};

const PomodoroContext = createContext<PomodoroContextType | null>(null);

export const usePomodoroContext = () => {
  const ctx = useContext(PomodoroContext);
  if (!ctx) throw new Error('usePomodoroContext must be used within PomodoroProvider');
  return ctx;
};

export const PomodoroProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<PomodoroState>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Don't auto-resume — user must manually restart after page reload
        return { ...defaultState, ...parsed, isRunning: false };
      }
    } catch { /* ignore corrupt storage */ }
    return defaultState;
  });

  const timerRef   = useRef<number | null>(null);
  // Track elapsed minutes in a ref to avoid stale closure issues in callbacks
  const elapsedRef = useRef<number>(0);
  // Track session wall-clock start so elapsed is computed from real time (not DEFAULT_DURATION)
  const sessionStartTimeRef = useRef<number>(0);


  // Persist to localStorage on every state change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  // ── Sync Pomodoro completion to Daily Log ─────────────────────────────────
  const syncPomodoroToDailyLog = async () => {
    const user = auth.currentUser;
    if (!user) return;
    const todayStr = getLocalDateString(new Date());
    try {
      const q = query(
        collection(db, 'daily_logs'),
        where('userId', '==', user.uid),
        where('date',   '==', todayStr)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        const docSnap = snap.docs[0];
        const data    = docSnap.data();
        const currentHours = parseFloat(data.productiveHours || '0');
        await updateDoc(doc(db, 'daily_logs', docSnap.id), {
          productiveHours: (currentHours + 0.5).toString(),
        });
      } else {
        await addDoc(collection(db, 'daily_logs'), {
          userId:           user.uid,
          date:             todayStr,
          productiveHours:  '0.5',
          waterIntakeLiters:0,
          mood:             0,
          sleepTime:        '',
          wakeUpTime:       '',
          updatedAt:        Date.now(),
        });
      }

      // Also log the individual session with the ACTUAL elapsed time, not a hardcoded value
      const durationMinutes = elapsedRef.current > 0 ? elapsedRef.current : 25;
      await addDoc(collection(db, 'pomodoro_sessions'), {
        userId: user.uid,
        date: todayStr,
        timestamp: Date.now(),
        taskId: state.taskId || null,
        taskText: state.taskText || 'Focus Session',
        durationMinutes,
      });

      toast.success('+0.5h synced to Daily Log!');
    } catch (error) {
      console.error('Failed to sync Pomodoro:', error);
    }
  };

  /** Log elapsed minutes to a learning topic/subtask in Firestore.
   *  Uses getDoc (direct read) instead of getDocs (full collection scan). */
  const syncTimeToLearning = async (
    topicId: string | null | undefined,
    subTaskId: string | null | undefined,
    minutes: number
  ) => {
    const user = auth.currentUser;
    if (!user || !topicId || minutes < 1) return;
    try {
      const topicRef  = doc(db, 'learning_topics', topicId);
      const topicSnap = await getDoc(topicRef);          // O(1) — single doc read
      if (!topicSnap.exists()) return;

      const topicData = topicSnap.data();
      const updates: Record<string, any> = {
        timeSpentMinutes: (topicData.timeSpentMinutes || 0) + minutes,
        lastStudiedAt:    Date.now(),
      };

      if (subTaskId) {
        const updatedSubTasks = (topicData.subTasks || []).map((st: any) =>
          st.id === subTaskId
            ? { ...st, timeSpentMinutes: (st.timeSpentMinutes || 0) + minutes }
            : st
        );
        updates.subTasks = updatedSubTasks;
      }

      await updateDoc(topicRef, updates);
    } catch (error) {
      console.error('Failed to sync time to learning topic:', error);
    }
  };

  // ── Timer finish ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (state.isRunning && state.timeLeft === 0) {
      playPopSound();
      sendSystemNotification('Focus Session Complete!', {
        body: `Great job focusing on "${state.taskText}". Time to take a break! 🎉`,
      });
      toast.success(`Pomodoro complete! "“${state.taskText}” — take a break 🎉`);
      syncPomodoroToDailyLog();
      // Use the actual elapsed minutes (tracked by elapsedRef) — not hardcoded 25
      const elapsed = elapsedRef.current > 0 ? elapsedRef.current : Math.round((sessionStartTimeRef.current > 0 ? (Date.now() - sessionStartTimeRef.current) / 60000 : 25));
      syncTimeToLearning(state.learningTopicId, state.learningSubTaskId, elapsed);

      // ── FCM Push Notification ───────────────────────────────────────────────────
      const user = auth.currentUser;
      if (user) {
        sendPushNotification({
          userIds: [user.uid],
          title: '✅ Pomodoro Complete!',
          body: `“${state.taskText}” — ${elapsed} min focused. Take a well-earned break.`,
          tag: 'pomodoro-done',
          url: '/',
        }).catch(() => { /* non-critical */ });
      }

      elapsedRef.current = 0;
      sessionStartTimeRef.current = 0;
      setState(prev => ({ ...prev, isRunning: false }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.isRunning, state.timeLeft]);


  // ── Timer tick ─────────────────────────────────────────────────────────────────────
  // Always clear the previous interval before starting a new one to prevent
  // double-tick after pause → resume.
  useEffect(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (state.isRunning && state.timeLeft > 0) {
      // Snapshot session start time and compute target end time
      if (sessionStartTimeRef.current === 0) {
        sessionStartTimeRef.current = Date.now();
      }
      
      // Calculate the exact time this timer should hit 0, based on the *current* timeLeft.
      // E.g. if we have 300 seconds left, target time is Date.now() + 300000
      const targetEndTime = Date.now() + (state.timeLeft * 1000);

      timerRef.current = window.setInterval(() => {
        setState(prev => {
          // Calculate precise time left using Date.now() to prevent drift when tab is backgrounded
          const exactTimeLeft = Math.max(0, Math.ceil((targetEndTime - Date.now()) / 1000));
          
          // Track elapsed as minutes counted up
          elapsedRef.current = Math.floor((Date.now() - sessionStartTimeRef.current) / 60000);
          return { ...prev, timeLeft: exactTimeLeft };
        });
      }, 1000);
    } else if (!state.isRunning) {
      sessionStartTimeRef.current = 0;
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [state.isRunning]);


  // ── Actions ───────────────────────────────────────────────────────────────
  const startTimer = useCallback((
    taskId: string,
    taskText: string,
    learningTopicId?: string,
    learningSubTaskId?: string,
    durationMinutes?: number
  ) => {
    elapsedRef.current = 0;
    setState(prev => {
      // If resuming the same paused task, keep remaining time
      const duration =
        prev.taskId === taskId && prev.timeLeft > 0
          ? prev.timeLeft
          : (durationMinutes ? durationMinutes * 60 : DEFAULT_DURATION);
      return {
        taskId,
        taskText,
        timeLeft:          duration,
        isRunning:         true,
        learningTopicId:   learningTopicId  || null,
        learningSubTaskId: learningSubTaskId || null,
        ambientSound:      prev.ambientSound,
      };
    });
  }, []);

  const pauseTimer  = useCallback(() => setState(prev => ({ ...prev, isRunning: false })), []);
  const resumeTimer = useCallback(() => {
    setState(prev => prev.timeLeft > 0 ? { ...prev, isRunning: true } : prev);
  }, []);

  const resetTimer = useCallback(() => {
    elapsedRef.current = 0;
    setState(prev => ({ ...prev, timeLeft: DEFAULT_DURATION, isRunning: false }));
  }, []);

  const dismissTimer = useCallback(() => {
    if (elapsedRef.current >= 1) {
      syncTimeToLearning(state.learningTopicId, state.learningSubTaskId, elapsedRef.current);
    }
    elapsedRef.current = 0;
    setState(prev => ({ ...defaultState, ambientSound: prev.ambientSound }));
    localStorage.removeItem(STORAGE_KEY);
  }, [state.learningTopicId, state.learningSubTaskId]);

  const formatTime = useCallback((seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }, []);

  const [focusMode, setFocusMode] = useState(false);
  const toggleFocusMode = useCallback(() => setFocusMode(prev => !prev), []);

  const setAmbientSound = useCallback((sound: 'none' | 'rain' | 'soft-rain' | 'forest' | 'waves') => {
    setState(prev => ({ ...prev, ambientSound: sound }));
  }, []);

  const setDuration = useCallback((minutes: number) => {
    setState(prev => ({ ...prev, timeLeft: Math.max(1, minutes) * 60 }));
  }, []);

  return (
    <PomodoroContext.Provider value={{
      state, startTimer, pauseTimer, resumeTimer, resetTimer,
      dismissTimer, formatTime, focusMode, toggleFocusMode,
      setAmbientSound, setDuration,
    }}>
      {children}
    </PomodoroContext.Provider>
  );
};
