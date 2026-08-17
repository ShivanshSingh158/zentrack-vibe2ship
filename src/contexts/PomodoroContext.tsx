import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import type { ReactNode } from 'react';
import { playPopSound } from '../utils/sound';
import { toast } from 'sonner';
import {
  collection, query, where, getDocs, addDoc, updateDoc,
  doc, getDoc, setDoc, onSnapshot
} from 'firebase/firestore';
import { db, auth } from '../services/firebase';
import { getLocalDateString } from '../utils/dateUtils';
import { sendSystemNotification } from '../utils/notifications';


interface PomodoroState {
  taskId: string | null;
  taskText: string;
  timeLeft: number;
  isRunning: boolean;
  learningTopicId?: string | null;
  learningSubTaskId?: string | null;
  ambientSound: 'none' | 'rain' | 'soft-rain' | 'forest' | 'waves';
  targetEndTime?: number | null;
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
  setFocusMode: (mode: boolean) => void;
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
        // Don't auto-resume locally — let DB hydrate it if it's still running
        return { ...defaultState, ...parsed, isRunning: false, targetEndTime: null };
      }
    } catch { /* ignore corrupt storage */ }
    return defaultState;
  });

  const timerRef   = useRef<number | null>(null);
  // Track elapsed minutes in a ref to avoid stale closure issues in callbacks
  const elapsedRef = useRef<number>(0);
  // Track session wall-clock start so elapsed is computed from real time (not DEFAULT_DURATION)
  const sessionStartTimeRef = useRef<number>(0);

  const saveState = useCallback((newState: PomodoroState) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newState));
    const user = auth.currentUser;
    if (user) {
      setDoc(doc(db, 'active_timers', user.uid), newState, { merge: true }).catch(() => {});
    }
  }, []);

  // ── Sync with DB for background and cross-device catchup ─────────────────
  useEffect(() => {
    const unsubAuth = auth.onAuthStateChanged(user => {
      if (!user) return;
      const unsubSnap = onSnapshot(doc(db, 'active_timers', user.uid), (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data() as PomodoroState;
          setState(prev => {
            // Only update if there is a real meaningful change from the cloud
            if (
              prev.taskId !== data.taskId || 
              prev.isRunning !== data.isRunning || 
              prev.targetEndTime !== data.targetEndTime ||
              prev.ambientSound !== data.ambientSound
            ) {
              return { ...prev, ...data };
            }
            return prev;
          });
        }
      });
      return () => unsubSnap();
    });
    return () => unsubAuth();
  }, []);

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

      elapsedRef.current = 0;
      sessionStartTimeRef.current = 0;
      setState(prev => {
        const newState = { ...prev, isRunning: false, targetEndTime: null };
        saveState(newState);
        return newState;
      });
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
      const targetEndTime = state.targetEndTime || (Date.now() + (state.timeLeft * 1000));

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
  }, [state.isRunning, state.targetEndTime]);


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
      const newState = {
        taskId,
        taskText,
        timeLeft:          duration,
        isRunning:         true,
        learningTopicId:   learningTopicId  || null,
        learningSubTaskId: learningSubTaskId || null,
        ambientSound:      prev.ambientSound,
        targetEndTime:     Date.now() + (duration * 1000),
      };
      saveState(newState);
      return newState;
    });
    setFocusMode(true);
    toast.success(`Focus timer started for "${taskText}"`);
  }, [saveState]);

  const pauseTimer  = useCallback(() => {
    setState(prev => {
      const newState = { ...prev, isRunning: false, targetEndTime: null };
      saveState(newState);
      return newState;
    });
  }, [saveState]);
  
  const resumeTimer = useCallback(() => {
    setState(prev => {
      if (prev.timeLeft > 0) {
        const newState = { ...prev, isRunning: true, targetEndTime: Date.now() + (prev.timeLeft * 1000) };
        saveState(newState);
        return newState;
      }
      return prev;
    });
  }, [saveState]);

  const resetTimer = useCallback(() => {
    elapsedRef.current = 0;
    setState(prev => {
      const newState = { ...prev, timeLeft: DEFAULT_DURATION, isRunning: false, targetEndTime: null };
      saveState(newState);
      return newState;
    });
  }, [saveState]);

  const dismissTimer = useCallback(() => {
    if (elapsedRef.current >= 1) {
      syncTimeToLearning(state.learningTopicId, state.learningSubTaskId, elapsedRef.current);
    }
    elapsedRef.current = 0;
    setState(prev => {
      const newState = { ...defaultState, ambientSound: prev.ambientSound };
      saveState(newState);
      return newState;
    });
  }, [state.learningTopicId, state.learningSubTaskId, saveState]);

  const formatTime = useCallback((seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }, []);

  const [focusMode, setFocusMode] = useState(false);
  const toggleFocusMode = useCallback(() => setFocusMode(prev => !prev), []);

  const setAmbientSound = useCallback((sound: 'none' | 'rain' | 'soft-rain' | 'forest' | 'waves') => {
    setState(prev => {
      const newState = { ...prev, ambientSound: sound };
      saveState(newState);
      return newState;
    });
  }, [saveState]);

  const setDuration = useCallback((minutes: number) => {
    setState(prev => {
      const duration = Math.max(1, minutes) * 60;
      const newState = {
        ...prev,
        timeLeft: duration,
        targetEndTime: prev.isRunning ? Date.now() + (duration * 1000) : null
      };
      saveState(newState);
      return newState;
    });
  }, [saveState]);

  return (
    <PomodoroContext.Provider value={{
      state, startTimer, pauseTimer, resumeTimer, resetTimer,
      dismissTimer, formatTime, focusMode, setFocusMode, toggleFocusMode,
      setAmbientSound, setDuration,
    }}>
      {children}
    </PomodoroContext.Provider>
  );
};
