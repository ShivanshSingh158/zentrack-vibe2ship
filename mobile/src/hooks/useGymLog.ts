import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { InteractionManager } from 'react-native';
import { collection, doc, setDoc, updateDoc, serverTimestamp, deleteField } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useWellnessData } from '../contexts/domains/WellnessContext';
import { useCoreData } from '../contexts/domains/CoreDataContext';
import { GYM_PLAN, GYM_PLAN_ARNOLD, WEEKDAY_TO_PLAN } from '../data/gymPlan';
import { GymDayLog, GymExerciseLog, GymSet, GymCardioLog, GymPlanDay } from '../types/gym.types';

function debounce<T extends (...args: any[]) => any>(fn: T, ms: number) {
  let timer: any;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
import * as Notifications from 'expo-notifications';
import * as Haptics from 'expo-haptics';
import { COLLECTION } from '../config/constants';
import { deepSanitize } from '../utils/firebaseUtils';
import { awardXP } from '../services/xpSystem';
import { getPreviousExerciseSession, buildExerciseHistoryIndex, normalizeExerciseKey } from '../utils/gymUtils';


let currentRestTimerNotifId: string | null = null;

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
    return customDays.find(d => d && (d.dayIndex === planIdx || Number(d.dayIndex) === Number(planIdx))) || null;
  }
  return customDays[planIdx] || customDays[String(planIdx)] || null;
}

export function resolvePlanDay(userGymPlan: any, planIdx: number): GymPlanDay {
  const rawCustom = getCustomPlanDay(userGymPlan?.customDays, planIdx);
  const customHasExercises = rawCustom && Array.isArray(rawCustom.exercises) && rawCustom.exercises.length > 0;
  if (rawCustom && (rawCustom.isRest || customHasExercises)) {
    return rawCustom;
  }
  return GYM_PLAN.find((d: GymPlanDay) => d.dayIndex === planIdx) || GYM_PLAN_ARNOLD.find((d: GymPlanDay) => d.dayIndex === planIdx) || GYM_PLAN[0];
}

export function useGymLog(dateStr: string) {
  const { gymLogs, gymLogsReady, ensureSubscribed: gymEnsureSubscribed, userGymPlan, updateMasterPlan, optimisticAddGymLog, optimisticUpdateGymLog } = useWellnessData();
  const { user } = useCoreData();

  useEffect(() => {
    gymEnsureSubscribed?.();
  }, [gymEnsureSubscribed]);

  const debouncedSyncMasterPlan = useRef(
    debounce((newExercises: GymExerciseLog[], planDayIndex: number) => {
      const existingPlan = resolvePlanDay(userGymPlan, planDayIndex);
      updateMasterPlan(planDayIndex, {
        dayIndex: planDayIndex,
        name: existingPlan?.name || `Day ${planDayIndex}`,
        subtitle: existingPlan?.subtitle || '',
        focus: existingPlan?.focus || '',
        exercises: newExercises as any,
        isRest: existingPlan?.isRest || false,
      });
    }, 3500)
  ).current;

  const [log, setLog] = useState<GymDayLog | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const logRef = useRef<GymDayLog | null>(null);
  // Tracks the most recent local write timestamp so we can skip stale Firestore snapshots
  const localWriteAtRef = useRef<number>(0);

  useEffect(() => {
    logRef.current = log;
  }, [log]);

  const prevDateStrRef = useRef<string | null>(null);
  const prevPlanUpdatedRef = useRef<number | null>(null);

  useEffect(() => {
    if (prevDateStrRef.current !== null && prevDateStrRef.current !== dateStr) {
      setLog(null);
      logRef.current = null;
      localWriteAtRef.current = 0;
    }
    prevDateStrRef.current = dateStr;

    const currentPlanUpdatedAt = userGymPlan?.updatedAt ?? 0;
    if (prevPlanUpdatedRef.current !== null && prevPlanUpdatedRef.current !== currentPlanUpdatedAt) {
      const hasLoggedSets = (logRef.current?.exercises || []).some((ex: any) =>
        (ex.setsLog || []).some((s: any) => s.completed || (s.weight != null && Number(s.weight) > 0) || (s.reps != null && Number(s.reps) > 0))
      );
      if (logRef.current && !logRef.current.workoutStartTime && !logRef.current.completed && !hasLoggedSets) {
        setLog(null);
        logRef.current = null;
        localWriteAtRef.current = 0;
      }
    }
    prevPlanUpdatedRef.current = currentPlanUpdatedAt;

    const planIdx = planDayIndexForDate(dateStr);
    const planDay = resolvePlanDay(userGymPlan, planIdx);
    const historyIndex = buildExerciseHistoryIndex(gymLogs, dateStr);

    const existing = (gymLogs || []).find(l => l.date === dateStr);

    if (existing) {
      const existingTs: number =
        typeof existing.updatedAt === 'number'
          ? existing.updatedAt
          : (existing.updatedAt as any)?.toMillis?.() ?? 0;
      const localTs: number = logRef.current?.updatedAt ?? 0;

      // Only skip if: local state is newer AND local exercises have actual weight data
      const localHasWeights = (logRef.current?.exercises || []).some((ex: any) =>
        (ex.setsLog || []).some((s: any) => s.weight !== null && s.weight !== undefined && Number(s.weight) > 0)
      );
      const firestoreHasWeights = (existing.exercises || []).some((ex: any) =>
        (ex.setsLog || []).some((s: any) => s.weight !== null && s.weight !== undefined && Number(s.weight) > 0)
      );

      if (logRef.current && existingTs <= localTs && (logRef.current.exercises?.length ?? 0) > 0 && (localHasWeights || !firestoreHasWeights)) {
        return; // Firestore snapshot is older than local state — skip
      }

      let patchedExercises: GymExerciseLog[] = [];

      if (existing.exercises && existing.exercises.length > 0) {
        patchedExercises = existing.exercises.map((ex, idx) => {
          const prevSession = historyIndex.get(normalizeExerciseKey(ex.name));
          const lastSets = prevSession?.sets || null;
          const lastValidSet = lastSets && lastSets.length > 0 ? lastSets[lastSets.length - 1] : null;

          let patchedVideoId = ex.videoId;
          if (!patchedVideoId && planDay && Array.isArray(planDay.exercises)) {
            const planEx = planDay.exercises.find((pe: any) => pe.id === ex.exerciseId || pe.name === ex.name);
            if (planEx?.videoId) {
              patchedVideoId = planEx.videoId;
            }
          }

          // Pre-fill unlogged set values with last session's exact set data
          const patchedSetsLog = (ex.setsLog || []).map((s: any, sIdx: number) => {
            const lastSet = lastSets?.[sIdx] || lastValidSet;
            const userLoggedWeight = (s.weight !== null && s.weight !== undefined && Number(s.weight) > 0) ? Number(s.weight) : null;
            const finalWeight = userLoggedWeight ?? (lastSet?.weight != null && Number(lastSet.weight) > 0 ? Number(lastSet.weight) : null);

            const userLoggedReps = (s.reps !== null && s.reps !== undefined && Number(s.reps) > 0) ? Number(s.reps) : null;
            const defaultTargetReps = parseInt(String(ex.targetReps || '8-12').split('-')[0], 10) || 8;
            const finalReps = userLoggedReps ?? (lastSet?.reps ? Number(lastSet.reps) : defaultTargetReps);

            return {
              ...s,
              reps: finalReps,
              weight: finalWeight,
            };
          });

          return {
            ...ex,
            _idx: idx,
            videoId: patchedVideoId,
            lastSessionSets: ex.lastSessionSets || lastSets || undefined,
            setsLog: patchedSetsLog,
          };
        });
      } else if (planDay && !planDay.isRest && Array.isArray(planDay.exercises) && planDay.exercises.length > 0) {
        patchedExercises = planDay.exercises.map((e: any, idx: number) => {
          const prevSession = historyIndex.get(normalizeExerciseKey(e.name));
          const lastSets = prevSession?.sets || null;
          const lastValidSet = lastSets && lastSets.length > 0 ? lastSets[lastSets.length - 1] : null;

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
            setsLog: Array.from({ length: e.targetSets }, (_, i) => {
              const lastSet = lastSets?.[i] || lastValidSet;
              const setWeight = (lastSet?.weight != null && Number(lastSet.weight) > 0) ? Number(lastSet.weight) : null;
              const defaultTargetReps = parseInt(String(e.targetReps || '8-12').split('-')[0], 10) || 8;
              return {
                setNumber: i + 1,
                reps: lastSet?.reps ? Number(lastSet.reps) : defaultTargetReps,
                weight: setWeight,
                completed: false,
              };
            }),
          };
        });
      }

      let patchedLog = { 
        ...existing, 
        dayPlanIndex: existing.dayPlanIndex ?? planIdx,
        exercises: patchedExercises 
      } as GymDayLog;
      if (!patchedLog.cardio) {
        patchedLog.cardio = [];
      }
      setLog(patchedLog);
    } else {
      // No existing record in Firestore -> create log from planDay
      const newExercises = (planDay && !planDay.isRest && Array.isArray(planDay.exercises)) ? planDay.exercises.map((e: any, idx: number) => {
        const prevSession = historyIndex.get(normalizeExerciseKey(e.name));
        const lastSets = prevSession?.sets || null;
        const lastValidSet = lastSets && lastSets.length > 0 ? lastSets[lastSets.length - 1] : null;
        const defaultTargetReps = parseInt(String(e.targetReps || '8-12').split('-')[0], 10) || 8;

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
          setsLog: Array.from({ length: e.targetSets }, (_, i) => {
            const lastSet = lastSets?.[i] || lastValidSet;
            const setWeight = (lastSet?.weight != null && Number(lastSet.weight) > 0) ? Number(lastSet.weight) : null;
            return {
              setNumber: i + 1,
              reps: lastSet?.reps ? Number(lastSet.reps) : defaultTargetReps,
              weight: setWeight,
              completed: false,
            };
          }),
        };
      }) : [];

      const newLog: GymDayLog = {
        userId: user?.uid || '',
        date: dateStr,
        dayPlanIndex: planIdx,
        exercises: newExercises,
        cardio: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setLog(newLog);
    }
  }, [gymLogsReady, gymLogs, dateStr, user?.uid, reloadKey, userGymPlan]);



  // Only trigger a Firestore re-init if the local log is absent (null)
  // Calling this on every tab focus was the biggest source of inter-module lag
  const reloadFromFirestore = useCallback(() => {
    if (logRef.current === null) {
      setReloadKey(k => k + 1);
    }
  }, []);

  const planIdx = planDayIndexForDate(dateStr);
  const activePlanIdx = log?.dayPlanIndex ?? planIdx;
  const planDay = resolvePlanDay(userGymPlan, activePlanIdx);

  const saveLog = useCallback((updatedLog: GymDayLog) => {
    if (!user) return;
    const logId = updatedLog.id || `${user.uid}_${updatedLog.date}`;
    const writeAt = Date.now();
    localWriteAtRef.current = writeAt;

    // Schedule optimistic update on next microtask to avoid updating WellnessProvider during ActiveLoggingScreen render
    queueMicrotask(() => {
      if (gymLogs.some(l => l.id === logId || l.date === updatedLog.date)) {
        optimisticUpdateGymLog(logId, updatedLog as any);
      } else {
        optimisticAddGymLog(updatedLog as any);
      }
    });

    // Persist to Firestore
    (async () => {
      try {
        const docRef = doc(db, COLLECTION.GYM_LOGS, logId);
        const sanitizedLog: any = { id: logId };
        Object.keys(updatedLog).forEach(key => {
          if (key === '_idx') return;
          const val = (updatedLog as any)[key];
          if (val === undefined || val === null) {
            sanitizedLog[key] = deleteField();
          } else {
            sanitizedLog[key] = deepSanitize(val);
          }
        });
        if (updatedLog.completed) {
          sanitizedLog.workoutStartTime = deleteField();
          sanitizedLog.restTimerStartTime = deleteField();
          sanitizedLog.restTimerDurationSecs = deleteField();
          sanitizedLog.restTimerExerciseName = deleteField();
        }
        await setDoc(docRef, sanitizedLog, { merge: true });
      } catch (e) {
        console.error('[Gym] Save error', e);
      }
    })();
  }, [user, gymLogs, optimisticAddGymLog, optimisticUpdateGymLog]);

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
      let newlyCompleted = false;
      const exercises = prev.exercises.map((ex, i) => {
        if (i !== exerciseIndex) return ex;
        const setsLog = ex.setsLog.map((s, si) => {
          if (si === setIndex) {
            const nextCompleted = !s.completed;
            if (nextCompleted) newlyCompleted = true;
            return { ...s, completed: nextCompleted };
          }
          return s;
        });
        return { ...ex, setsLog };
      });
      if (newlyCompleted) {
        awardXP('GYM_SET').catch(() => {});
      }
      const updated = { ...prev, exercises, updatedAt: Date.now() };
      saveLog(updated);
      return updated;
    });
  }, [saveLog]);

  const deleteExercise = useCallback((exerciseId: string) => {
    setLog(prev => {
      if (!prev) return prev;
      const exercises = prev.exercises
        .filter(ex => ex.exerciseId !== exerciseId)
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

  const reorderExercise = useCallback((fromIndex: number, toIndex: number) => {
    setLog(prev => {
      if (!prev || fromIndex < 0 || toIndex < 0 || fromIndex >= prev.exercises.length || toIndex >= prev.exercises.length) return prev;
      const exercises = [...prev.exercises];
      const [moved] = exercises.splice(fromIndex, 1);
      exercises.splice(toIndex, 0, moved);
      const reindexed = exercises.map((ex, i) => ({ ...ex, _idx: i }));
      const updated = { ...prev, exercises: reindexed, updatedAt: Date.now() };
      saveLog(updated);
      
      if (updated.dayPlanIndex !== undefined && updated.dayPlanIndex !== null) {
        debouncedSyncMasterPlan(reindexed, updated.dayPlanIndex);
      }
      
      return updated;
    });
  }, [saveLog, debouncedSyncMasterPlan]);

  const reorderExercisesFull = useCallback((newExercisesList: GymExerciseLog[]) => {
    setLog(prev => {
      if (!prev) return prev;
      const reindexed = newExercisesList.map((ex, i) => ({ ...ex, _idx: i }));
      const updated = { ...prev, exercises: reindexed, updatedAt: Date.now() };
      saveLog(updated);
      
      if (updated.dayPlanIndex !== undefined && updated.dayPlanIndex !== null) {
        debouncedSyncMasterPlan(reindexed, updated.dayPlanIndex);
      }
      
      return updated;
    });
  }, [saveLog, debouncedSyncMasterPlan]);

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

  const deleteCardio = useCallback((cardioId: string) => {
    setLog(prev => {
      if (!prev?.cardio) return prev;
      const cardio = prev.cardio.filter(c => c.id !== cardioId);
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
    awardXP('GYM_SET').catch(() => {});
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
      const updated: GymDayLog = {
        ...prev,
        completed: false,
        workoutDurationMinutes: undefined,
        workoutStartTime: Date.now(),
        updatedAt: Date.now(),
      };
      saveLog(updated);
      return updated;
    });
  }, [saveLog]);

  const endWorkout = useCallback(async (_force?: boolean) => {
    awardXP('GYM_SESSION').catch(() => {});
    setLog(prev => {
      if (!prev) return prev;
      const startMs = prev.workoutStartTime || Date.now();
      const elapsedMins = Math.round((Date.now() - startMs) / 60000);
      const duration = Math.max(1, elapsedMins);

      const startD = new Date(startMs);
      const endD = new Date();
      const startTimeStr = `${startD.getHours().toString().padStart(2, '0')}:${startD.getMinutes().toString().padStart(2, '0')}`;
      const endTimeStr = `${endD.getHours().toString().padStart(2, '0')}:${endD.getMinutes().toString().padStart(2, '0')}`;

      const updated: GymDayLog = {
        ...prev,
        completed: true,
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
      const updated: GymDayLog = {
        ...prev,
        completed: false,
        workoutStartTime: prev.workoutStartTime || (Date.now() - pastDurationMs),
        workoutDurationMinutes: undefined,
        updatedAt: Date.now(),
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

  // Takes an ABSOLUTE duration in seconds (not a delta).
  // ActiveLoggingScreen already computes the absolute value (restTimerInitial ± 30)
  // so we must NOT add it on top of the current value.
  const setRestTimerDuration = useCallback(async (absoluteSecs: number) => {
    const newDuration = Math.max(0, absoluteSecs);
    setLog(prev => {
      if (!prev) return prev;
      const updated = { ...prev, restTimerDurationSecs: newDuration, updatedAt: Date.now() };
      saveLog(updated);
      return updated;
    });

    if (currentRestTimerNotifId && logRef.current?.restTimerStartTime) {
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

  const swapDayRoutine = useCallback((targetDayIndex: number) => {
    const targetPlanDay = getCustomPlanDay(userGymPlan?.customDays, targetDayIndex) || GYM_PLAN.find(d => d.dayIndex === targetDayIndex);
    if (!targetPlanDay) return;

    const getLastSessionSets = (exerciseId: string, exerciseName: string) => {
      const sorted = [...gymLogs].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      for (const pastLog of sorted) {
        if (pastLog.date === dateStr) continue;
        const match = (pastLog.exercises || []).find((ex: any) => ex.exerciseId === exerciseId || ex.name === exerciseName);
        if (match?.setsLog?.length > 0) {
          return match.setsLog as { reps: number | null; weight: number | null; completed: boolean }[];
        }
      }
      return null;
    };

    const newExercises = !targetPlanDay.isRest ? targetPlanDay.exercises.map((e: any, idx: number) => {
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
    }) : [];

    setLog(prev => {
      const updated: GymDayLog = {
        ...(prev || { userId: user?.uid || '', date: dateStr, cardio: [], createdAt: Date.now() }),
        dayPlanIndex: targetDayIndex,
        exercises: newExercises,
        updatedAt: Date.now(),
      };
      
      // If we are swapping to a rest day, turn off any active session
      if (targetPlanDay.isRest) {
        updated.workoutStartTime = undefined;
        updated.workoutDurationMinutes = undefined;
        updated.restTimerStartTime = undefined;
        updated.restTimerDurationSecs = undefined;
        updated.restTimerExerciseName = undefined;
      }

      saveLog(updated);
      return updated;
    });
  }, [userGymPlan, gymLogs, dateStr, user?.uid, saveLog]);

  const triggerDeload = useCallback(() => {
    setLog(prev => {
      if (!prev) return prev;
      const exercises = prev.exercises.map(ex => {
        const newTargetSets = Math.max(1, ex.targetSets - 1);
        const cleanedReps = ex.targetReps ? String(ex.targetReps).replace(' (RPE 7)', '') : ex.targetReps;
        
        // Trim setsLog to match new targetSets if we haven't already completed them
        const setsLog = ex.setsLog.slice(0, newTargetSets);
        
        return { ...ex, targetSets: newTargetSets, targetReps: cleanedReps, setsLog };
      });
      const updated = { ...prev, exercises, updatedAt: Date.now() };
      saveLog(updated);
      return updated;
    });
  }, [saveLog]);

  // ── G8: Workout Notes ────────────────────────────────────────────────────────
  const updateNotes = useCallback((text: string) => {
    setLog(prev => {
      if (!prev) return prev;
      const updated = { ...prev, notes: text, updatedAt: Date.now() };
      saveLog(updated);
      return updated;
    });
  }, [saveLog]);

  // ── Force override plan layout when master template changes ────────────────
  const forceOverrideTodayPlan = useCallback((newCustomDays: Record<number, GymPlanDay>) => {
    const hasLoggedSets = (logRef.current?.exercises || []).some((ex: any) =>
      (ex.setsLog || []).some((s: any) => s.completed || (s.weight != null && Number(s.weight) > 0) || (s.reps != null && Number(s.reps) > 0))
    );
    // Never overwrite an already started or completed session
    if (logRef.current?.completed || logRef.current?.workoutStartTime || hasLoggedSets) {
      return;
    }

    const pIdx = planDayIndexForDate(dateStr);
    const targetPlanDay = getCustomPlanDay(newCustomDays, pIdx) || GYM_PLAN.find(d => d.dayIndex === pIdx);
    if (!targetPlanDay) return;

    const isRest = targetPlanDay.isRest === true;
    const newExercises = !isRest ? targetPlanDay.exercises.map((e: any, idx: number) => ({
      _idx: idx,
      exerciseId: e.id,
      name: e.name,
      targetSets: e.targetSets,
      targetReps: e.targetReps,
      muscle: e.muscle,
      videoId: e.videoId,
      restTimeSecs: e.restTimeSecs,
      setsLog: Array.from({ length: e.targetSets }, (_, i) => ({
        setNumber: i + 1,
        reps: null,
        weight: null,
        completed: false,
      })),
    })) : [];

    const updated: GymDayLog = {
      ...(logRef.current || { userId: user?.uid || '', date: dateStr, cardio: [], createdAt: Date.now() }),
      dayPlanIndex: pIdx,
      exercises: newExercises,
      cardio: [],
      workoutStartTime: undefined,
      workoutDurationMinutes: undefined,
      completed: false,
      updatedAt: Date.now(),
    };

    setLog(updated);
    saveLog(updated);
  }, [dateStr, user?.uid, saveLog]);

  return {
    log,
    updateSet,
    toggleSetComplete,
    deleteExercise,
    updateExercise,
    reorderExercise,
    reorderExercisesFull,
    addExercise,
    addSet,
    removeSet,
    addCardio,
    updateCardio,
    deleteCardio,
    startWorkout,
    endWorkout,
    resumeWorkout,
    startRestTimer,
    clearRestTimer,
    setRestTimerDuration,
    restTimerStartTime: log?.restTimerStartTime,
    restTimerDurationSecs: log?.restTimerDurationSecs,
    restTimerInitial: log?.restTimerDurationSecs || 0,
    saveLog,
    planDay,
    swapExercise,
    makeSwapPermanent,
    logSetAndStartTimer,
    reloadFromFirestore,
    swapDayRoutine,
    triggerDeload,
    updateNotes,
    forceOverrideTodayPlan,
  };
}
