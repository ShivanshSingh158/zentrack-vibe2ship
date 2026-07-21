import { useState, useEffect, useRef, useCallback } from 'react';
import { InteractionManager } from 'react-native';
import { collection, doc, setDoc, updateDoc, serverTimestamp, deleteField } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useMobileData } from '../contexts/MobileDataContext';
import { GYM_PLAN, WEEKDAY_TO_PLAN } from '../data/gymPlan';
import { GymDayLog, GymExerciseLog, GymSet, GymCardioLog } from '../types/gym.types';
import * as Notifications from 'expo-notifications';
import * as Haptics from 'expo-haptics';
import { COLLECTION } from '../config/constants';
import { deepSanitize } from '../utils/firebaseUtils';
import AsyncStorage from '@react-native-async-storage/async-storage';


let currentRestTimerNotifId: string | null = null;

// AsyncStorage key for the gym log daily cache
const gymLogCacheKey = (dateStr: string) => `@zentrack_gymlog_${dateStr}`;

// Saves a gym log snapshot to local cache for instant offline/cold-start reads
async function writeGymLogCache(dateStr: string, log: GymDayLog) {
  try {
    await AsyncStorage.setItem(gymLogCacheKey(dateStr), JSON.stringify(log));
  } catch (_) { /* silent */ }
}

async function readGymLogCache(dateStr: string): Promise<GymDayLog | null> {
  try {
    const raw = await AsyncStorage.getItem(gymLogCacheKey(dateStr));
    return raw ? (JSON.parse(raw) as GymDayLog) : null;
  } catch (_) { return null; }
}

// ── Date helpers — ALL use LOCAL date components, not UTC ────────────────────
// Using `toISOString()` or `new Date(dateStr).getDay()` silently uses UTC,
// which in IST (UTC+5:30) gives the previous day after midnight → wrong plan day.
export function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function dateStrOffset(offsetDays: number, fromStr?: string) {
  let d: Date;
  if (fromStr) {
    // Parse as local components to avoid UTC midnight → previous day in UTC+ zones
    const [y, mo, day] = fromStr.split('-').map(Number);
    d = new Date(y, mo - 1, day);
  } else {
    d = new Date();
  }
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function planDayIndexForDate(dateStr: string) {
  // FIX: parse dateStr as LOCAL components — new Date('YYYY-MM-DD') treats it
  // as UTC midnight, which in UTC+5:30 is actually 11:30 PM the day before.
  const [y, m, d] = dateStr.split('-').map(Number);
  const dayOfWeek = new Date(y, m - 1, d).getDay(); // local time → correct day
  return WEEKDAY_TO_PLAN[dayOfWeek] ?? 7;
}

export function getCustomPlanDay(customDays: any, planIdx: number) {
  if (!customDays) return null;
  if (Array.isArray(customDays)) {
    return customDays.find(d => d && d.dayIndex === planIdx);
  }
  return customDays[planIdx];
}

export function useGymLog(dateStr: string) {
  const { gymLogs, gymLogsReady, gymEnsureSubscribed, user, userGymPlan } = useMobileData();

  useEffect(() => {
    gymEnsureSubscribed?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [log, setLog] = useState<GymDayLog | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const logRef = useRef<GymDayLog | null>(null);
  // Tracks the most recent local write timestamp so we can skip stale Firestore snapshots
  const localWriteAtRef = useRef<number>(0);

  useEffect(() => {
    logRef.current = log;
  }, [log]);

  // ── AsyncStorage cache-first load ─────────────────────────────────────────
  // Runs once per dateStr change. Populates the log from local cache INSTANTLY
  // so the screen renders before Firestore has even responded.
  useEffect(() => {
    let cancelled = false;
    readGymLogCache(dateStr).then(cached => {
      if (cancelled || !cached) return;
      // Only use cache if Firestore hasn't already populated (prevent stale overwrite)
      setLog(prev => {
        if (prev !== null) return prev; // Firestore beat us — keep fresher data
        return cached;
      });
    });
    return () => { cancelled = true; };
  }, [dateStr]);

  const hasInitialised = useRef(false);
  const prevDateStrRef = useRef<string | null>(null);

  useEffect(() => {
    if (prevDateStrRef.current !== null && prevDateStrRef.current !== dateStr) {
      setLog(null);
      logRef.current = null;
      localWriteAtRef.current = 0;
      hasInitialised.current = false;
    }
    prevDateStrRef.current = dateStr;

    if (!user) return;
    if (!gymLogsReady) return;

    const existing = gymLogs.find(l => l.date === dateStr);

    if (existing) {
      // FIX (Bug 2): Firestore returns updatedAt as a Timestamp object (with .toMillis()),
      // while local updatedAt is Date.now() (a number). Comparing them directly is always
      // wrong — normalize both to milliseconds first.
      const existingTs: number =
        typeof existing.updatedAt === 'number'
          ? existing.updatedAt
          : (existing.updatedAt as any)?.toMillis?.() ?? 0;
      const localTs: number = logRef.current?.updatedAt ?? 0;
      if (logRef.current && existingTs <= localTs) {
        return; // Firestore snapshot is older than local state — skip
      }

      const planIdx = planDayIndexForDate(dateStr);
      const planDay = getCustomPlanDay(userGymPlan?.customDays, planIdx) || GYM_PLAN.find(d => d.dayIndex === planIdx);

      const patchedExercises = (existing.exercises || []).map((ex, idx) => {
        const patched = { ...ex, _idx: idx };
        if (!patched.videoId && planDay) {
          const planEx = planDay.exercises.find((pe: any) => pe.id === ex.exerciseId || pe.name === ex.name);
          if (planEx?.videoId) {
            return { ...patched, videoId: planEx.videoId };
          }
        }
        return patched;
      });

      let patchedLog = { ...existing, exercises: patchedExercises } as GymDayLog;
      if (!patchedLog.cardio || patchedLog.cardio.length === 0) {
        patchedLog.cardio = [{
          id: 'cardio_treadmill',
          type: 'Treadmill',
          durationMinutes: null,
          distanceKm: null,
          speedKmh: null,
          incline: null,
          calories: null,
          completed: false,
          isPermanent: true,
        }];
      }
      setLog(patchedLog);
    } else if (gymLogsReady) {
      // FIX (Bug 3): hasInitialised ref was assigned but never read as a guard.
      // Without this check, every Firestore snapshot that finds no log for today
      // (e.g. a snapshot triggered by a different date's write) replaces the
      // user's in-progress workout with a blank template — exercises disappear!
      if (hasInitialised.current) return;
      hasInitialised.current = true;
      const planIdx = planDayIndexForDate(dateStr);
      const planDay = getCustomPlanDay(userGymPlan?.customDays, planIdx) || GYM_PLAN.find(d => d.dayIndex === planIdx);

      const getLastSessionSets = (exerciseId: string, exerciseName: string) => {
        const sorted = [...gymLogs].sort((a, b) =>
          (b.date || '').localeCompare(a.date || '')
        );
        for (const pastLog of sorted) {
          if (pastLog.date === dateStr) continue;
          const match = (pastLog.exercises || []).find(
            (ex: any) => ex.exerciseId === exerciseId || ex.name === exerciseName
          );
          if (match?.setsLog?.length > 0) {
            return match.setsLog as { reps: number | null; weight: number | null; completed: boolean }[];
          }
        }
        return null;
      };

      const newLog: GymDayLog = {
        userId: user.uid,
        date: dateStr,
        dayPlanIndex: planIdx,
        exercises: planDay && !planDay.isRest ? planDay.exercises.map((e: any, idx: number) => {
          const lastSets = getLastSessionSets(e.id, e.name);
          return {
            _idx: idx,
            exerciseId: e.id,
            name: e.name,
            targetSets: e.targetSets,
            targetReps: e.targetReps,
            muscle: e.muscle,
            videoId: e.videoId,
            restTimeSecs: e.restTimeSecs,
            lastSessionSets: lastSets ?? undefined,
            setsLog: Array.from({ length: e.targetSets }, (_, i) => ({
              setNumber: i + 1,
              reps: lastSets?.[i]?.reps ?? null,
              weight: lastSets?.[i]?.weight ?? null,
              completed: false,
            })),
          };
        }) : [],
        cardio: [{
          id: 'cardio_treadmill',
          type: 'Treadmill',
          durationMinutes: null,
          distanceKm: null,
          speedKmh: null,
          incline: null,
          calories: null,
          completed: false,
          isPermanent: true,
        }],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setLog(newLog);
    }
  }, [gymLogsReady, gymLogs, dateStr, user?.uid, reloadKey]);



  // Only trigger a Firestore re-init if the local log is absent (null)
  // Calling this on every tab focus was the biggest source of inter-module lag
  const reloadFromFirestore = useCallback(() => {
    if (logRef.current === null) {
      setReloadKey(k => k + 1);
    }
  }, []);

  const planIdx = planDayIndexForDate(dateStr);
  const planDay = getCustomPlanDay(userGymPlan?.customDays, planIdx) || GYM_PLAN.find(d => d.dayIndex === planIdx);

  const saveLog = useCallback((updatedLog: GymDayLog) => {
    if (!user) return;
    const logId = updatedLog.id || `${user.uid}_${updatedLog.date}`;
    const writeAt = Date.now();
    localWriteAtRef.current = writeAt;

    // ── Write cache immediately (sync, ~0ms) so the UI always has fresh data ──
    writeGymLogCache(updatedLog.date, updatedLog);

    // ── Defer Firestore write until after animations complete ──────────────────
    // InteractionManager.runAfterInteractions guarantees this won't block any
    // navigation transition or spring animation currently in flight.
    InteractionManager.runAfterInteractions(() => {
      (async () => {
        try {
          const docRef = doc(db, COLLECTION.GYM_LOGS, logId);
          const sanitizedLog: any = { id: logId };
          Object.keys(updatedLog).forEach(key => {
            if (key === '_idx') return;
            if ((updatedLog as any)[key] === undefined) {
              sanitizedLog[key] = deleteField();
            } else {
              sanitizedLog[key] = deepSanitize((updatedLog as any)[key]);
            }
          });
          await setDoc(docRef, sanitizedLog, { merge: true });
        } catch (e) {
          console.error('[Gym] Save error', e);
        }
      })();
    });
  }, [user]);

  const updateSet = useCallback((exerciseIndex: number, setIndex: number, set: GymSet) => {
    setLog(prev => {
      if (!prev) return prev;
      const exercises = prev.exercises.map((ex, i) => {
        if (i !== exerciseIndex) return ex;
        const setsLog = ex.setsLog.map((s, si) => si === setIndex ? set : s);
        return { ...ex, setsLog };
      });
      const updated = { ...prev, exercises, updatedAt: Date.now() };
      saveLog(updated);
      return updated;
    });
  }, [saveLog]);

  const toggleSetComplete = useCallback((exerciseIndex: number, setIndex: number) => {
    setLog(prev => {
      if (!prev) return prev;
      const exercises = prev.exercises.map((ex, i) => {
        if (i !== exerciseIndex) return ex;
        const setsLog = ex.setsLog.map((s, si) =>
          si === setIndex ? { ...s, completed: !s.completed } : s
        );
        return { ...ex, setsLog };
      });
      const updated = { ...prev, exercises, updatedAt: Date.now() };
      saveLog(updated);
      return updated;
    });
  }, [saveLog]);

  const deleteExercise = useCallback((exerciseIndex: number) => {
    setLog(prev => {
      if (!prev) return prev;
      const exercises = prev.exercises.filter((_, i) => i !== exerciseIndex)
        .map((ex, i) => ({ ...ex, _idx: i }));
      const updated = { ...prev, exercises, updatedAt: Date.now() };
      saveLog(updated);
      return updated;
    });
  }, [saveLog]);

  const addExercise = useCallback((exercise: GymExerciseLog) => {
    setLog(prev => {
      if (!prev) return prev;
      const idx = prev.exercises.length;
      const exercises = [...prev.exercises, { ...exercise, _idx: idx }];
      const updated = { ...prev, exercises, updatedAt: Date.now() };
      saveLog(updated);
      return updated;
    });
  }, [saveLog]);

  const addSet = useCallback((exerciseIndex: number) => {
    setLog(prev => {
      if (!prev) return prev;
      const exercises = prev.exercises.map((ex, i) => {
        if (i !== exerciseIndex) return ex;
        const newSetNumber = ex.setsLog.length > 0 ? ex.setsLog[ex.setsLog.length - 1].setNumber + 1 : 1;
        return {
          ...ex,
          setsLog: [...ex.setsLog, { setNumber: newSetNumber, reps: null, weight: null, completed: false }]
        };
      });
      const updated = { ...prev, exercises, updatedAt: Date.now() };
      saveLog(updated);
      return updated;
    });
  }, [saveLog]);

  const removeSet = useCallback((exerciseIndex: number, setIndex: number) => {
    setLog(prev => {
      if (!prev) return prev;
      const exercises = prev.exercises.map((ex, i) => {
        if (i !== exerciseIndex) return ex;
        const setsLog = ex.setsLog
          .filter((_, si) => si !== setIndex)
          .map((s, si) => ({ ...s, setNumber: si + 1 }));
        return { ...ex, setsLog };
      });
      const updated = { ...prev, exercises, updatedAt: Date.now() };
      saveLog(updated);
      return updated;
    });
  }, [saveLog]);

  const addCardio = useCallback((type: string) => {
    setLog(prev => {
      if (!prev) return prev;
      const cardio = [...(prev.cardio || []), {
        id: `cardio_${Date.now()}`,
        type,
        durationMinutes: null,
        distanceKm: null,
        speedKmh: null,
        incline: null,
        calories: null,
        completed: false,
      }];
      const updated = { ...prev, cardio, updatedAt: Date.now() };
      saveLog(updated);
      return updated;
    });
  }, [saveLog]);

  const updateCardio = useCallback((cardioId: string, updates: Partial<GymCardioLog>) => {
    setLog(prev => {
      if (!prev?.cardio) return prev;
      const cardio = prev.cardio.map(c => c.id === cardioId ? { ...c, ...updates } : c);
      const updated = { ...prev, cardio, updatedAt: Date.now() };
      saveLog(updated);
      return updated;
    });
  }, [saveLog]);

  const updateExercise = useCallback((exerciseIndex: number, updatedExercise: GymExerciseLog) => {
    setLog(prev => {
      if (!prev) return prev;
      if (exerciseIndex < 0 || exerciseIndex >= prev.exercises.length) {
        console.warn('[Gym] updateExercise: invalid index', exerciseIndex);
        return prev;
      }
      const exercises = prev.exercises.map((ex, i) =>
        i === exerciseIndex ? { ...updatedExercise, _idx: i } : ex
      );
      const updated = { ...prev, exercises, updatedAt: Date.now() };
      saveLog(updated);
      return updated;
    });
  }, [saveLog]);

  const logSetAndStartTimer = useCallback(async (
    exerciseIndex: number,
    updatedExercise: GymExerciseLog,
    durationSecs: number,
    exerciseName?: string
  ) => {
    setLog(prev => {
      if (!prev) return prev;
      const exercises = prev.exercises.map((ex, i) =>
        i === exerciseIndex ? { ...updatedExercise, _idx: i } : ex
      );
      const updated = {
        ...prev,
        exercises,
        restTimerStartTime: Date.now(),
        restTimerDurationSecs: durationSecs,
        restTimerExerciseName: exerciseName,
        updatedAt: Date.now(),
      };
      saveLog(updated);
      return updated;
    });

    if (currentRestTimerNotifId) {
      await Notifications.cancelScheduledNotificationAsync(currentRestTimerNotifId);
    }
    currentRestTimerNotifId = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Rest is over! ⏱️',
        body: `Time for your next set of ${exerciseName || 'your workout'}. Let's go!`,
        sound: 'default'
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(Date.now() + durationSecs * 1000)
      } as any
    });
  }, [saveLog]);

  const swapExercise = useCallback((exerciseIndex: number, newName: string, newVideoId?: string) => {
    setLog(prev => {
      if (!prev) return prev;
      const exercises = prev.exercises.map((ex, i) => {
        if (i !== exerciseIndex) return ex;
        return { ...ex, name: newName, ...(newVideoId !== undefined ? { videoId: newVideoId } : {}) };
      });
      const updated = { ...prev, exercises, updatedAt: Date.now() };
      saveLog(updated);
      return updated;
    });
  }, [saveLog]);

  const makeSwapPermanent = useCallback(async (origName: string, newName: string, newVideoId?: string) => {
    if (!user || !userGymPlan) return;

    const newPlan = JSON.parse(JSON.stringify(userGymPlan));
    
    // Convert array to record if it was corrupted
    let currentCustomDays = newPlan.customDays || {};
    if (Array.isArray(currentCustomDays)) {
      const fixed: any = {};
      currentCustomDays.forEach(d => { if (d && d.dayIndex) fixed[d.dayIndex] = d; });
      currentCustomDays = fixed;
    }

    let changed = false;

    GYM_PLAN.forEach(day => {
      const dayIndex = day.dayIndex;
      const targetDay = currentCustomDays[dayIndex] || JSON.parse(JSON.stringify(day));
      if (targetDay.exercises) {
        targetDay.exercises.forEach((ex: any) => {
          if (ex.name === origName) {
            ex.name = newName;
            if (newVideoId !== undefined) ex.videoId = newVideoId;
            changed = true;
            currentCustomDays[dayIndex] = targetDay;
          }
        });
      }
    });

    if (changed) {
      newPlan.customDays = currentCustomDays;
      const docRef = doc(db, COLLECTION.USER_GYM_PLANS, user.uid);
      await setDoc(docRef, newPlan, { merge: true });
    }
  }, [user, userGymPlan]);

  const startWorkout = useCallback(() => {
    setLog(prev => {
      if (!prev) return prev;
      const updated = { ...prev, workoutStartTime: Date.now(), updatedAt: Date.now() };
      saveLog(updated);
      return updated;
    });
  }, [saveLog]);

  const endWorkout = useCallback(async () => {
    setLog(prev => {
      if (!prev?.workoutStartTime) return prev;
      const duration = Math.round((Date.now() - prev.workoutStartTime) / 60000);
      const startD = new Date(prev.workoutStartTime);
      const endD = new Date();
      const startTimeStr = `${startD.getHours().toString().padStart(2, '0')}:${startD.getMinutes().toString().padStart(2, '0')}`;
      const endTimeStr = `${endD.getHours().toString().padStart(2, '0')}:${endD.getMinutes().toString().padStart(2, '0')}`;

      const updated = {
        ...prev,
        workoutStartTime: undefined,
        workoutDurationMinutes: duration,
        startTime: prev.startTime || startTimeStr,
        endTime: prev.endTime || endTimeStr,
        restTimerStartTime: undefined,
        restTimerDurationSecs: undefined,
        restTimerExerciseName: undefined,
        updatedAt: Date.now()
      };
      saveLog(updated);
      return updated;
    });

    if (currentRestTimerNotifId) {
      await Notifications.cancelScheduledNotificationAsync(currentRestTimerNotifId);
      currentRestTimerNotifId = null;
    }
  }, [saveLog]);

  const resumeWorkout = useCallback(() => {
    setLog(prev => {
      if (!prev) return prev;
      const pastDurationMs = (prev.workoutDurationMinutes || 0) * 60000;
      const updated = {
        ...prev,
        workoutStartTime: Date.now() - pastDurationMs,
        workoutDurationMinutes: undefined,
        updatedAt: Date.now()
      };
      saveLog(updated);
      return updated;
    });
  }, [saveLog]);

  const startRestTimer = useCallback(async (durationSecs: number, exerciseName?: string) => {
    setLog(prev => {
      if (!prev) return prev;
      const updated = {
        ...prev,
        restTimerStartTime: Date.now(),
        restTimerDurationSecs: durationSecs,
        restTimerExerciseName: exerciseName,
        updatedAt: Date.now()
      };
      saveLog(updated);
      return updated;
    });

    if (currentRestTimerNotifId) {
      await Notifications.cancelScheduledNotificationAsync(currentRestTimerNotifId);
    }
    currentRestTimerNotifId = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Rest is over! ⏱️',
        body: `Time for your next set of ${exerciseName || 'your workout'}. Let's go!`,
        sound: 'default'
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(Date.now() + durationSecs * 1000)
      } as any
    });
  }, [saveLog]);

  const clearRestTimer = useCallback(async () => {
    setLog(prev => {
      if (!prev) return prev;
      const updated = {
        ...prev,
        restTimerStartTime: undefined,
        restTimerDurationSecs: undefined,
        restTimerExerciseName: undefined,
        updatedAt: Date.now()
      };
      saveLog(updated);
      return updated;
    });

    if (currentRestTimerNotifId) {
      await Notifications.cancelScheduledNotificationAsync(currentRestTimerNotifId);
      currentRestTimerNotifId = null;
    }
  }, [saveLog]);

  const updateRestTimerDuration = useCallback(async (deltaSecs: number) => {
    setLog(prev => {
      if (!prev?.restTimerDurationSecs) return prev;
      const newDuration = Math.max(0, prev.restTimerDurationSecs + deltaSecs);
      const updated = { ...prev, restTimerDurationSecs: newDuration, updatedAt: Date.now() };
      saveLog(updated);
      return updated;
    });

    if (currentRestTimerNotifId && logRef.current?.restTimerStartTime) {
      const newDuration = Math.max(0, (logRef.current.restTimerDurationSecs || 0) + deltaSecs);
      await Notifications.cancelScheduledNotificationAsync(currentRestTimerNotifId);
      currentRestTimerNotifId = await Notifications.scheduleNotificationAsync({
        content: { title: 'Rest is over! ⏱️', body: 'Time for your next set.', sound: 'default' },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(logRef.current.restTimerStartTime + newDuration * 1000)
        } as any
      });
    }
  }, [saveLog]);

  return {
    log,
    updateSet,
    toggleSetComplete,
    deleteExercise,
    updateExercise,
    addExercise,
    addSet,
    removeSet,
    addCardio,
    updateCardio,
    startWorkout,
    endWorkout,
    resumeWorkout,
    startRestTimer,
    clearRestTimer,
    updateRestTimerDuration,
    restTimerStartTime: log?.restTimerStartTime,
    restTimerDurationSecs: log?.restTimerDurationSecs,
    restTimerInitial: log?.restTimerDurationSecs || 0,
    saveLog,
    planDay,
    swapExercise,
    makeSwapPermanent,
    logSetAndStartTimer,
    reloadFromFirestore,
  };
}
