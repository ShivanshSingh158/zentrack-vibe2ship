import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { InteractionManager, DeviceEventEmitter, unstable_batchedUpdates } from 'react-native';
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
import { getPreviousExerciseSession, buildExerciseHistoryIndex, normalizeExerciseKey, resolveExerciseTargetMuscle } from '../utils/gymUtils';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { dismissActiveWorkoutNotification } from '../services/activeWorkoutNotificationService';
import { safeWrite } from '../utils/safeWrite';
import { buildLiveWorkoutWidgetData, saveCachedLiveWorkoutData, updateLiveWorkoutWidget } from '../services/widgetSyncService';
import { setActiveWorkoutFlag } from '../components/BackgroundNotificationWatcher';


let currentRestTimerNotifId: string | null = null;

// Issue 4: Module-scope debounce queue keyed by logId so all useGymLog instances share a single write queue
const globalPendingFirestoreWrites = new Map<string, { log: GymDayLog; timer: ReturnType<typeof setTimeout> | null }>();

async function executeFirestoreLogWrite(logId: string, updatedLog: GymDayLog) {
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
    if (Array.isArray(sanitizedLog.exercises)) {
      sanitizedLog.exercises = sanitizedLog.exercises.map((ex: any) => {
        const cleanEx = { ...ex };
        delete cleanEx._idx;
        delete cleanEx.lastSessionSets;
        return cleanEx;
      });
    }
    if (updatedLog.completed) {
      sanitizedLog.workoutStartTime = deleteField();
      sanitizedLog.restTimerStartTime = deleteField();
      sanitizedLog.restTimerDurationSecs = deleteField();
      sanitizedLog.restTimerExerciseName = deleteField();
    }
    await safeWrite(
      () => setDoc(docRef, sanitizedLog, { merge: true }),
      COLLECTION.GYM_LOGS,
      'set',
      sanitizedLog,
      logId
    );
  } catch (e) {
    console.error('[Gym] Save error', e);
  }
}

export async function flushGlobalPendingFirestoreWrite(targetLogId?: string) {
  if (targetLogId) {
    const entry = globalPendingFirestoreWrites.get(targetLogId);
    if (!entry) return;
    if (entry.timer) clearTimeout(entry.timer);
    globalPendingFirestoreWrites.delete(targetLogId);
    await executeFirestoreLogWrite(targetLogId, entry.log);
  } else {
    const entries = Array.from(globalPendingFirestoreWrites.entries());
    globalPendingFirestoreWrites.clear();
    for (const [id, entry] of entries) {
      if (entry.timer) clearTimeout(entry.timer);
      await executeFirestoreLogWrite(id, entry.log);
    }
  }
}

// ── Re-export date & plan helpers from gymPlan (breaks circular dependency with widgetSyncService) ──
import {
  todayStr,
  dateStrOffset,
  planDayIndexForDate,
  getCustomPlanDay,
  resolvePlanDay,
} from '../data/gymPlan';
export {
  todayStr,
  dateStrOffset,
  planDayIndexForDate,
  getCustomPlanDay,
  resolvePlanDay,
};

export function useGymLog(dateStr: string) {
  const { gymLogs, gymLogsReady, ensureSubscribed: gymEnsureSubscribed, userGymPlan, updateMasterPlan, updateFullMasterPlan, optimisticAddGymLog, optimisticUpdateGymLog } = useWellnessData();
  const { user } = useCoreData();

  // ── FIX 1: Ref-based gymLogs access inside saveLog ────────────────────────
  // Keeping gymLogs in saveLog's deps caused a new saveLog reference on EVERY
  // Firestore snapshot, which cascaded to recreate all 10+ useCallbacks that
  // depend on saveLog — triggering a full screen re-render on each snapshot.
  // Using a ref breaks that chain: saveLog always reads the latest gymLogs
  // without becoming a new function reference when the array changes.
  const gymLogsRef = useRef(gymLogs);
  useEffect(() => {
    gymLogsRef.current = gymLogs;
  });

  useEffect(() => {
    gymEnsureSubscribed?.();
  }, [gymEnsureSubscribed]);

  const userGymPlanRef = useRef(userGymPlan);
  const updateMasterPlanRef = useRef(updateMasterPlan);
  useEffect(() => {
    userGymPlanRef.current = userGymPlan;
    updateMasterPlanRef.current = updateMasterPlan;
  });

  const debouncedSyncMasterPlan = useRef(
    debounce((newExercises: GymExerciseLog[], planDayIndex: number) => {
      const existingPlan = resolvePlanDay(userGymPlanRef.current, planDayIndex);
      updateMasterPlanRef.current(planDayIndex, {
        dayIndex: planDayIndex,
        name: existingPlan?.name || `Day ${planDayIndex}`,
        subtitle: existingPlan?.subtitle || '',
        focus: existingPlan?.focus || '',
        exercises: newExercises.map(ex => ({
          id: ex.exerciseId || (ex as any).id || `ex_${normalizeExerciseKey(ex.name)}`,
          name: ex.name,
          targetSets: ex.targetSets,
          targetReps: ex.targetReps,
          muscle: ex.muscle,
          videoId: ex.videoId,
          restTimeSecs: ex.restTimeSecs,
          isCompound: ex.isCompound,
        })) as any,
        isRest: existingPlan?.isRest || false,
      });
    }, 3500)
  ).current;

  const [log, setLog] = useState<GymDayLog | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const logRef = useRef<GymDayLog | null>(null);
  // Tracks the most recent local write timestamp so we can skip stale Firestore snapshots
  const localWriteAtRef = useRef<number>(0);

  const flushPendingFirestoreWrite = useCallback(async () => {
    if (!user) return;
    const logId = logRef.current?.id || `${user.uid}_${dateStr}`;
    await flushGlobalPendingFirestoreWrite(logId);
  }, [user, dateStr]);

  const historyIndex = useMemo(
    () => buildExerciseHistoryIndex(gymLogs, dateStr),
    [gymLogs, dateStr]
  );

  useEffect(() => {
    logRef.current = log;
  }, [log]);

  const prevDateStrRef = useRef<string | null>(null);
  const prevPlanUpdatedRef = useRef<number | null>(null);
  const instanceIdRef = useRef<string>('gym_inst_' + Math.random().toString(36).slice(2));

  useEffect(() => {
    if (prevDateStrRef.current !== null && prevDateStrRef.current !== dateStr) {
      flushPendingFirestoreWrite();
      setLog(null);
      logRef.current = null;
      localWriteAtRef.current = 0;
    }
    prevDateStrRef.current = dateStr;

    // Skip heavy hydration and mapping if we wrote to this document within the last 5000ms
    if (logRef.current && (Date.now() - localWriteAtRef.current) < 5000) {
      return;
    }

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

    const existing = (gymLogs || []).find(l => l.date === dateStr);

    if (existing) {
      const existingTs: number =
        typeof existing.updatedAt === 'number'
          ? existing.updatedAt
          : (existing.updatedAt as any)?.toMillis?.() ?? 0;
      const localTs: number = logRef.current?.updatedAt ?? 0;

      // If local state is already marked completed for today, never let a stale uncompleted snapshot from Firestore revert it
      if (logRef.current?.completed && !existing.completed && dateStr === todayStr()) {
        return;
      }

      // ── FIX 3: Strengthen the local-write guard with a 5000ms grace window.
      // The original guard compared Firestore server timestamps vs local Date.now() timestamps.
      // Server timestamps can differ from client time (clock skew, latency), causing the
      // guard to fail and let the Firestore echo snapshot re-run setLog() right after a write.
      // Grace window: if we wrote within the last 5000ms, always skip Firestore snapshots
      // for this document — our local state is definitively fresher.
      const recentLocalWrite = (Date.now() - localWriteAtRef.current) < 5000;

      // Only skip if: local state is newer AND local exercises have actual weight data
      const localHasWeights = (logRef.current?.exercises || []).some((ex: any) =>
        (ex.setsLog || []).some((s: any) => s.weight !== null && s.weight !== undefined && Number(s.weight) > 0)
      );
      const firestoreHasWeights = (existing.exercises || []).some((ex: any) =>
        (ex.setsLog || []).some((s: any) => s.weight !== null && s.weight !== undefined && Number(s.weight) > 0)
      );

      // ── Secondary guard: if Firestore snapshot has fewer completed sets than local
      // state, it is definitively stale (a server-confirmed echo of an older state).
      // This covers the ~500ms delayed server-confirmation snapshot that arrives after
      // the hasPendingWrites echo is already blocked in WellnessContext.
      const localCompletedCount = (logRef.current?.exercises || []).reduce(
        (sum: number, ex: any) => sum + (ex.setsLog || []).filter((s: any) => s.completed).length, 0
      );
      const firestoreCompletedCount = (existing.exercises || []).reduce(
        (sum: number, ex: any) => sum + (ex.setsLog || []).filter((s: any) => s.completed).length, 0
      );
      const firestoreIsStale = logRef.current !== null && firestoreCompletedCount < localCompletedCount;

      // ── Active workout protection: only block stale Firestore snapshot echoes that are older
      // than our local state or have fewer completed sets than local in-progress workout.
      const isLocalSessionActive = logRef.current !== null && !logRef.current.completed;
      if (isLocalSessionActive && existingTs <= localTs) {
        return;
      }
      if (isLocalSessionActive && firestoreCompletedCount < localCompletedCount) {
        return;
      }

      if (logRef.current && (recentLocalWrite || firestoreIsStale || (existingTs <= localTs && (logRef.current.exercises?.length ?? 0) > 0 && (localHasWeights || !firestoreHasWeights)))) {
        return; // Local write in-flight or Firestore snapshot is older than local state — skip
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

          let patchedMuscle = ex.muscle;
          if (!patchedMuscle || ['general', 'unknown', 'none', 'mixed', 'null', 'undefined'].includes(patchedMuscle.trim().toLowerCase())) {
            patchedMuscle = resolveExerciseTargetMuscle(ex.name, ex.muscle).targetMuscle;
          }

          // Pre-fill unlogged set values with last session's exact set data (Issue 5: preserve explicit 0 weight)
          const patchedSetsLog = (ex.setsLog || []).map((s: any, sIdx: number) => {
            const lastSet = lastSets?.[sIdx] || lastValidSet;
            const hasUserWeight = s.weight !== null && s.weight !== undefined && !isNaN(Number(s.weight));
            const userLoggedWeight = hasUserWeight ? Number(s.weight) : null;
            const finalWeight = userLoggedWeight ?? (lastSet?.weight != null && Number(lastSet.weight) > 0 ? Number(lastSet.weight) : null);

            const hasUserReps = s.reps !== null && s.reps !== undefined && !isNaN(Number(s.reps));
            const userLoggedReps = hasUserReps ? Number(s.reps) : null;
            const defaultTargetReps = parseInt(String(ex.targetReps || '8-12').split(/[-–—]/)[0], 10) || 8;
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
            muscle: patchedMuscle,
            videoId: patchedVideoId,
            lastSessionSets: lastSets || ex.lastSessionSets || undefined,
            setsLog: patchedSetsLog,
          };
        });
      } else if (planDay && !planDay.isRest && Array.isArray(planDay.exercises) && planDay.exercises.length > 0) {
        patchedExercises = planDay.exercises.map((e: any, idx: number) => {
          const prevSession = historyIndex.get(normalizeExerciseKey(e.name));
          const lastSets = prevSession?.sets || null;
          const lastValidSet = lastSets && lastSets.length > 0 ? lastSets[lastSets.length - 1] : null;

          let patchedMuscle = e.muscle;
          if (!patchedMuscle || ['general', 'unknown', 'none', 'mixed', 'null', 'undefined'].includes(patchedMuscle.trim().toLowerCase())) {
            patchedMuscle = resolveExerciseTargetMuscle(e.name, e.muscle).targetMuscle;
          }

          return {
            _idx: idx,
            exerciseId: e.id,
            name: e.name,
            targetSets: e.targetSets,
            targetReps: e.targetReps,
            muscle: patchedMuscle,
            videoId: e.videoId,
            restTimeSecs: e.restTimeSecs,
            lastSessionSets: lastSets ?? undefined,
            setsLog: Array.from({ length: e.targetSets }, (_, i) => {
              const lastSet = lastSets?.[i] || lastValidSet;
              const setWeight = (lastSet?.weight != null && Number(lastSet.weight) > 0) ? Number(lastSet.weight) : null;
              const defaultTargetReps = parseInt(String(e.targetReps || '8-12').split(/[-–—]/)[0], 10) || 8;
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
        const defaultTargetReps = parseInt(String(e.targetReps || '8-12').split(/[-–—]/)[0], 10) || 8;

        let patchedMuscle = e.muscle;
        if (!patchedMuscle || ['general', 'unknown', 'none', 'mixed', 'null', 'undefined'].includes(patchedMuscle.trim().toLowerCase())) {
          patchedMuscle = resolveExerciseTargetMuscle(e.name, e.muscle).targetMuscle;
        }

        return {
          _idx: idx,
          exerciseId: e.id,
          name: e.name,
          targetSets: e.targetSets,
          targetReps: e.targetReps,
          muscle: patchedMuscle,
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

    // Issue 1 & 2: Broadcast local mutation to all mounted useGymLog instances for instant cross-screen sync
    DeviceEventEmitter.emit('gym_log_local_mutation', { date: updatedLog.date, log: updatedLog, senderId: instanceIdRef.current });

    // ── STEP 1: Optimistic update — instant UI, no waiting for Firestore.
    unstable_batchedUpdates(() => {
      if (gymLogsRef.current.some(l => l.id === logId || l.date === updatedLog.date)) {
        optimisticUpdateGymLog(logId, updatedLog as any);
      } else {
        optimisticAddGymLog(updatedLog as any);
      }
    });

    // ── STEP 2: Debounced Firestore write via module-level shared queue (Issue 4) ───
    const existingEntry = globalPendingFirestoreWrites.get(logId);
    if (existingEntry?.timer) {
      clearTimeout(existingEntry.timer);
    }

    if (updatedLog.completed) {
      globalPendingFirestoreWrites.delete(logId);
      executeFirestoreLogWrite(logId, updatedLog);
    } else {
      const timer = setTimeout(() => {
        globalPendingFirestoreWrites.delete(logId);
        executeFirestoreLogWrite(logId, updatedLog);
      }, 1500);
      globalPendingFirestoreWrites.set(logId, { log: updatedLog, timer });
    }
  }, [user, optimisticAddGymLog, optimisticUpdateGymLog]);

  // ── Flush pending Firestore write on unmount ──────────────────────────────
  useEffect(() => {
    return () => {
      flushPendingFirestoreWrite();
    };
  }, [flushPendingFirestoreWrite]);

  // Issue 1 & 2: Listen for local mutations across all sibling screens (ExerciseSwap, ExerciseDetail, CardioLog)
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('gym_log_local_mutation', (event: any) => {
      if (event?.date && event.date !== dateStr) return;
      if (event?.senderId === instanceIdRef.current) return; // Skip self-notification to avoid double-render
      if (event?.log) {
        logRef.current = event.log;
        setLog(event.log);
      }
    });
    return () => sub.remove();
  }, [dateStr]);

  // ── Cross-instance sync: mark log completed when ANY useGymLog calls endWorkout ────
  // GymHomeScreen and ActiveLoggingScreen each mount their own useGymLog instance.
  // When ActiveLoggingScreen's endWorkout() fires, it emits 'gym_workout_completed'.
  // This listener ensures GymHomeScreen's log immediately reflects completed=true,
  // making the banner switch from "IN PROGRESS" to "Workout Completed" instantly.
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('gym_workout_completed', (event: any) => {
      if (event?.date && event.date !== dateStr) return;
      setLog(prev => {
        const base = prev || (gymLogsRef.current || []).find(l => l.date === dateStr);
        if (!base) return prev;
        if (base.completed && !base.workoutStartTime) return prev;
        const updated: GymDayLog = {
          ...base,
          exercises: (base.exercises as any) || [],
          cardio: (base.cardio as any) || [],
          dayPlanIndex: base.dayPlanIndex ?? planIdx,
          createdAt: (base as any)?.createdAt || Date.now(),
          completed: true,
          workoutStartTime: undefined,
          workoutDurationMinutes: event?.duration ?? base.workoutDurationMinutes,
          restTimerStartTime: undefined,
          restTimerDurationSecs: undefined,
          restTimerExerciseName: undefined,
          updatedAt: Date.now(),
        };
        logRef.current = updated;
        return updated;
      });
    });
    return () => sub.remove();
  }, [dateStr]);

  // Autonomous Geofence Departure: if geofence auto-completes workout, update local log immediately
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('gym_workout_auto_finished', (event: any) => {
      if (event?.date && event.date !== dateStr) return;
      setLog(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          completed: true,
          workoutStartTime: undefined,
          workoutDurationMinutes: event?.duration ?? prev.workoutDurationMinutes,
          startTime: prev.startTime || event?.startTime,
          endTime: prev.endTime || event?.endTime,
          restTimerStartTime: undefined,
          restTimerDurationSecs: undefined,
          restTimerExerciseName: undefined,
          updatedAt: Date.now(),
        };
      });
    });
    return () => sub.remove();
  }, [dateStr]);


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
      let patchedMuscle = exercise.muscle;
      if (!patchedMuscle || ['general', 'unknown', 'none', 'mixed', 'null', 'undefined'].includes(patchedMuscle.trim().toLowerCase())) {
        patchedMuscle = resolveExerciseTargetMuscle(exercise.name, exercise.muscle).targetMuscle;
      }
      const exercises = [...prev.exercises, { ...exercise, muscle: patchedMuscle, _idx: idx }];
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
      await Notifications.cancelScheduledNotificationAsync(currentRestTimerNotifId).catch(() => {});
      currentRestTimerNotifId = null;
    }
  }, [saveLog]);

  const swapExercise = useCallback((exerciseIndex: number, newName: string, newVideoId?: string, newMuscle?: string) => {
    setLog(prev => {
      if (!prev) return prev;
      const exercises = prev.exercises.map((ex, i) => {
        if (i !== exerciseIndex) return ex;
        const resolvedMuscle = resolveExerciseTargetMuscle(newName, newMuscle || ex.muscle).targetMuscle;
        return {
          ...ex,
          name: newName,
          muscle: resolvedMuscle,
          ...(newVideoId !== undefined ? { videoId: newVideoId } : {})
        };
      });
      const updated = { ...prev, exercises, updatedAt: Date.now() };
      saveLog(updated);
      return updated;
    });
  }, [saveLog]);

  const makeSwapPermanent = useCallback(async (
    origName: string,
    newName: string,
    newVideoId?: string,
    newMuscle?: string,
    newSets?: number,
    newReps?: string,
    newRestTime?: number
  ) => {
    if (!user || !userGymPlan) return;

    let currentCustomDays: Record<string, any> = { ...(userGymPlan.customDays || {}) };
    if (Array.isArray(currentCustomDays)) {
      const fixed: any = {};
      (currentCustomDays as any[]).forEach(d => { if (d && d.dayIndex) fixed[d.dayIndex] = d; });
      currentCustomDays = fixed;
    }

    let changed = false;
    const basePlan = userGymPlan.templateId === 'arnold' ? GYM_PLAN_ARNOLD : GYM_PLAN;

    basePlan.forEach(day => {
      const dayIndex = day.dayIndex;
      const targetDay = currentCustomDays[dayIndex] ? { ...currentCustomDays[dayIndex] } : { ...day };
      if (targetDay.exercises) {
        let dayExercisesChanged = false;
        const newExercises = targetDay.exercises.map((ex: any) => {
          if (ex.name === origName) {
            dayExercisesChanged = true;
            changed = true;
            return {
              ...ex,
              name: newName,
              muscle: resolveExerciseTargetMuscle(newName, newMuscle || ex.muscle).targetMuscle,
              ...(newVideoId !== undefined ? { videoId: newVideoId } : {}),
              ...(newSets !== undefined ? { targetSets: newSets } : {}),
              ...(newReps !== undefined ? { targetReps: newReps } : {}),
              ...(newRestTime !== undefined ? { restTimeSecs: newRestTime } : {}),
            };
          }
          return ex;
        });
        if (dayExercisesChanged) {
          targetDay.exercises = newExercises;
          currentCustomDays[dayIndex] = targetDay;
        }
      }
    });

    if (changed) {
      await updateFullMasterPlan(currentCustomDays);
      // Redundant safeWrite removed: updateFullMasterPlan already persists to Firestore!
    }
  }, [user, userGymPlan, updateFullMasterPlan]);

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

      // PERF FIX: Tell BackgroundNotificationWatcher to block scheduleAllNotifications()
      // for the duration of this workout. Without this, every set completion triggers a
      // full notification reschedule (cancel all + schedule 50+ alarms) in the background.
      setActiveWorkoutFlag(true);

      try {
        const today = todayStr();
        const widgetData = buildLiveWorkoutWidgetData({
          todayStr: today,
          gymLogs: [updated, ...(gymLogsRef.current || []).filter(l => l.date !== today)],
          userGymPlan,
        });
        saveCachedLiveWorkoutData(widgetData).catch(() => {});
        updateLiveWorkoutWidget(widgetData).catch(() => {});
      } catch {}

      return updated;
    });
  }, [saveLog, userGymPlan]);

  const endWorkout = useCallback(async (_force?: boolean) => {
    awardXP('GYM_SESSION').catch(() => {});
    const currentLog = logRef.current || (gymLogsRef.current || []).find(l => l.date === dateStr);
    const targetDate = currentLog?.date || dateStr;
    const startMs = currentLog?.workoutStartTime || Date.now();
    const elapsedMins = Math.round((Date.now() - startMs) / 60000);
    const duration = Math.max(1, elapsedMins);

    const startD = new Date(startMs);
    const endD = new Date();
    const startTimeStr = `${startD.getHours().toString().padStart(2, '0')}:${startD.getMinutes().toString().padStart(2, '0')}`;
    const endTimeStr = `${endD.getHours().toString().padStart(2, '0')}:${endD.getMinutes().toString().padStart(2, '0')}`;

    const updated: GymDayLog = {
      ...(currentLog || {}),
      id: currentLog?.id || (user ? `${user.uid}_${targetDate}` : undefined),
      userId: user?.uid || currentLog?.userId || '',
      date: targetDate,
      dayPlanIndex: currentLog?.dayPlanIndex ?? planIdx,
      exercises: currentLog?.exercises || [],
      cardio: currentLog?.cardio || [],
      completed: true,
      workoutStartTime: undefined,
      workoutDurationMinutes: duration,
      startTime: currentLog?.startTime || startTimeStr,
      endTime: currentLog?.endTime || endTimeStr,
      restTimerStartTime: undefined,
      restTimerDurationSecs: undefined,
      restTimerExerciseName: undefined,
      createdAt: (currentLog as any)?.createdAt || Date.now(),
      updatedAt: Date.now(),
    };

    // 1. Synchronously update local ref and local state
    logRef.current = updated;
    setLog(updated);

    // 2. Synchronously broadcast workout completion to ALL useGymLog instances (e.g. GymHomeScreen)
    // Synchronous dispatch guarantees every subscriber screen immediately turns off the workout timer.
    DeviceEventEmitter.emit('gym_workout_completed', {
      date: targetDate,
      duration,
    });

    // 3. Synchronously trigger saveLog (which runs immediate optimistic update & immediate Firestore write)
    saveLog(updated);

    // 4. Update widget data
    try {
      const today = todayStr();
      const widgetData = buildLiveWorkoutWidgetData({
        todayStr: today,
        gymLogs: [updated, ...(gymLogsRef.current || []).filter(l => l.date !== today)],
        userGymPlan,
      });
      saveCachedLiveWorkoutData(widgetData).catch(() => {});
      updateLiveWorkoutWidget(widgetData).catch(() => {});
    } catch {}

    // 5. Clean up notifications & local session caches
    if (currentRestTimerNotifId) {
      await Notifications.cancelScheduledNotificationAsync(currentRestTimerNotifId).catch(() => {});
      currentRestTimerNotifId = null;
    }

    const today = todayStr();
    AsyncStorage.removeItem('@zentrack_active_workout_state').catch(() => {});
    AsyncStorage.setItem(`@gym_active_session_${today}`, JSON.stringify({
      date: today,
      completed: true,
      updatedAt: Date.now(),
    })).catch(() => {});
    dismissActiveWorkoutNotification().catch(() => {});

    // PERF FIX: Re-enable scheduling now that workout is done.
    // gym_workout_completed event in BackgroundNotificationWatcher also clears this flag,
    // but we set it here too for the rare case where the event fires before this line runs.
    setActiveWorkoutFlag(false);
  }, [user, dateStr, planIdx, saveLog, userGymPlan]);

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

  const revertWorkout = useCallback(() => {
    setLog(prev => {
      if (!prev) return prev;
      const updated: GymDayLog = {
        ...prev,
        completed: false,
        workoutStartTime: undefined,
        workoutDurationMinutes: undefined,
        startTime: undefined,
        endTime: undefined,
        restTimerStartTime: undefined,
        restTimerDurationSecs: undefined,
        restTimerExerciseName: undefined,
        updatedAt: Date.now(),
      };
      saveLog(updated);

      try {
        const today = todayStr();
        const widgetData = buildLiveWorkoutWidgetData({
          todayStr: today,
          gymLogs: [updated, ...(gymLogsRef.current || []).filter(l => l.date !== today)],
          userGymPlan,
        });
        saveCachedLiveWorkoutData(widgetData).catch(() => {});
        updateLiveWorkoutWidget(widgetData).catch(() => {});
      } catch {}

      return updated;
    });

    if (currentRestTimerNotifId) {
      Notifications.cancelScheduledNotificationAsync(currentRestTimerNotifId).catch(() => {});
      currentRestTimerNotifId = null;
    }

    const today = todayStr();
    AsyncStorage.removeItem('@zentrack_active_workout_state').catch(() => {});
    AsyncStorage.removeItem(`@gym_active_session_${today}`).catch(() => {});
    dismissActiveWorkoutNotification().catch(() => {});
  }, [saveLog, userGymPlan]);

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
      await Notifications.cancelScheduledNotificationAsync(currentRestTimerNotifId).catch(() => {});
      currentRestTimerNotifId = null;
    }
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
      await Notifications.cancelScheduledNotificationAsync(currentRestTimerNotifId).catch(() => {});
      currentRestTimerNotifId = null;
    }
  }, [saveLog]);

  // Takes an ABSOLUTE duration in seconds (not a delta).
  // ActiveLoggingScreen already computes the absolute value (restTimerInitial ± 30)
  // so we must NOT add it on top of the current value.
  const setRestTimerDuration = useCallback(async (absoluteSecs: number) => {
    const newDuration = Math.max(0, absoluteSecs);

    // Update local state without rewriting the entire Firestore log doc on every ±30s tap
    setLog(prev => {
      if (!prev) return prev;
      const updated = { ...prev, restTimerDurationSecs: newDuration, updatedAt: Date.now() };
      logRef.current = updated;
      return updated;
    });

    if (currentRestTimerNotifId) {
      await Notifications.cancelScheduledNotificationAsync(currentRestTimerNotifId).catch(() => {});
      currentRestTimerNotifId = null;
    }
  }, []);

  const swapDayRoutine = useCallback((targetDayIndex: number) => {
    const targetPlanDay = getCustomPlanDay(userGymPlan?.customDays, targetDayIndex) || GYM_PLAN.find(d => d.dayIndex === targetDayIndex);
    if (!targetPlanDay) return;

    const newExercises = !targetPlanDay.isRest ? targetPlanDay.exercises.map((e: any, idx: number) => {
      const prevSession = historyIndex.get(normalizeExerciseKey(e.name));
      const lastSets = prevSession?.sets || null;
      const defaultTargetReps = parseInt(String(e.targetReps || '8-12').split(/[-–—]/)[0], 10) || 8;
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
          reps: lastSets?.[i]?.reps ?? defaultTargetReps,
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
  }, [userGymPlan, historyIndex, dateStr, user?.uid, saveLog]);

  const triggerDeload = useCallback(() => {
    setLog(prev => {
      if (!prev) return prev;
      const exercises = prev.exercises.map(ex => {
        const newTargetSets = Math.max(1, ex.targetSets - 1);
        const cleanedReps = ex.targetReps ? String(ex.targetReps).replace(' (RPE 7)', '') : ex.targetReps;
        
        const warmups = (ex.setsLog || []).filter(s => s.isWarmup);
        const working = (ex.setsLog || []).filter(s => !s.isWarmup);
        const completedWorking = working.filter(s => s.completed);
        const uncompletedWorking = working.filter(s => !s.completed);
        const targetUncompletedCount = Math.max(0, newTargetSets - completedWorking.length);
        const trimmedWorking = [...completedWorking, ...uncompletedWorking.slice(0, targetUncompletedCount)];
        
        const nextSets = [...warmups, ...trimmedWorking].map((s, idx) => ({ ...s, setNumber: idx + 1 }));
        
        return { ...ex, targetSets: newTargetSets, targetReps: cleanedReps, setsLog: nextSets };
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
    const newExercises = !isRest ? targetPlanDay.exercises.map((e: any, idx: number) => {
      const prevSession = historyIndex.get(normalizeExerciseKey(e.name));
      const lastSets = prevSession?.sets || null;
      const lastValidSet = lastSets && lastSets.length > 0 ? lastSets[lastSets.length - 1] : null;
      const defaultTargetReps = parseInt(String(e.targetReps || '8-12').split(/[-–—]/)[0], 10) || 8;

      let patchedMuscle = e.muscle;
      if (!patchedMuscle || ['general', 'unknown', 'none', 'mixed', 'null', 'undefined'].includes(patchedMuscle.trim().toLowerCase())) {
        patchedMuscle = resolveExerciseTargetMuscle(e.name, e.muscle).targetMuscle;
      }

      return {
        _idx: idx,
        exerciseId: e.id,
        name: e.name,
        targetSets: e.targetSets,
        targetReps: e.targetReps,
        muscle: patchedMuscle,
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
  }, [dateStr, user?.uid, saveLog, historyIndex]);

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
    revertWorkout,
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
