/**
 * useGymLog — ZenTrack Mobile
 * Connects the GymScreen to Firestore via MobileDataContext.
 */

import { useState, useEffect } from 'react';
import { collection, doc, setDoc, updateDoc, serverTimestamp, deleteField } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useMobileData } from '../contexts/MobileDataContext';
import { GYM_PLAN, WEEKDAY_TO_PLAN } from '../data/gymPlan';
import { GymDayLog, GymExerciseLog, GymSet, GymCardioLog } from '../types/gym.types';
import * as Notifications from 'expo-notifications';
import * as Haptics from 'expo-haptics';

let currentRestTimerNotifId: string | null = null;

export function todayStr() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

export function dateStrOffset(offsetDays: number, fromStr?: string) {
  const d = fromStr ? new Date(fromStr) : new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

export function planDayIndexForDate(dateStr: string) {
  const dayOfWeek = new Date(dateStr).getDay();
  return WEEKDAY_TO_PLAN[dayOfWeek] || 7;
}

export function useGymLog(dateStr: string) {
  const { gymLogs, user, userGymPlan } = useMobileData();
  const [log, setLog] = useState<GymDayLog | null>(null);

  useEffect(() => {
    if (!user) return;
    const existing = gymLogs.find(l => l.date === dateStr);
    
    if (existing) {
      const planIdx = planDayIndexForDate(dateStr);
      const planDay = userGymPlan?.customDays?.[planIdx] || GYM_PLAN.find(d => d.dayIndex === planIdx);
      const patchedExercises = (existing.exercises || []).map(ex => {
        if (!ex.videoId && planDay) {
          const planEx = planDay.exercises.find(pe => pe.id === ex.exerciseId || pe.name === ex.name);
          if (planEx && planEx.videoId) {
            return { ...ex, videoId: planEx.videoId };
          }
        }
        return ex;
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
    } else {
      // Create template from plan if doesn't exist in memory
      const planIdx = planDayIndexForDate(dateStr);
      const planDay = userGymPlan?.customDays?.[planIdx] || GYM_PLAN.find(d => d.dayIndex === planIdx);
      
      const newLog: GymDayLog = {
        userId: user.uid,
        date: dateStr,
        dayPlanIndex: planIdx,
        exercises: planDay && !planDay.isRest ? planDay.exercises.map(e => ({
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
        })) : [],
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
  }, [gymLogs, dateStr, user, userGymPlan]);

  // Compute planDay dynamically for the export
  const planIdx = planDayIndexForDate(dateStr);
  const planDay = userGymPlan?.customDays?.[planIdx] || GYM_PLAN.find(d => d.dayIndex === planIdx);

  const saveLog = async (updatedLog: GymDayLog) => {
    if (!user) return;
    setLog(updatedLog);
    try {
      const logId = updatedLog.id || `${user.uid}_${updatedLog.date}`;
      const docRef = doc(db, 'gymLogs', logId);
      
      // Deep sanitize helper: removes undefined from nested objects/arrays
      const deepSanitize = (obj: any): any => {
        if (obj === null) return null;
        if (Array.isArray(obj)) return obj.map(deepSanitize);
        if (typeof obj === 'object') {
          const newObj: any = {};
          for (const key in obj) {
            if (obj[key] !== undefined) {
              newObj[key] = deepSanitize(obj[key]);
            }
          }
          return newObj;
        }
        return obj;
      };

      // Sanitize object for Firestore: top-level undefined -> deleteField, nested undefined -> strip
      const sanitizedLog: any = { id: logId };
      Object.keys(updatedLog).forEach(key => {
        if ((updatedLog as any)[key] === undefined) {
          sanitizedLog[key] = deleteField();
        } else {
          sanitizedLog[key] = deepSanitize((updatedLog as any)[key]);
        }
      });
      
      const netState = await import('@react-native-community/netinfo').then(m => m.default.fetch());
      if (!netState.isConnected) {
        const { queueGymLogOffline } = await import('../services/offlineSync');
        await queueGymLogOffline(updatedLog);
        return;
      }
      
      await setDoc(docRef, sanitizedLog, { merge: true });
    } catch (e) {
      console.error('[Gym] Save error', e);
    }
  };

  const updateSet = (exerciseIndex: number, setIndex: number, set: GymSet) => {
    if (!log) return;
    const updated = { ...log, exercises: [...log.exercises] };
    const ex = { ...updated.exercises[exerciseIndex], setsLog: [...updated.exercises[exerciseIndex].setsLog] };
    ex.setsLog[setIndex] = set;
    updated.exercises[exerciseIndex] = ex;
    updated.updatedAt = Date.now();
    saveLog(updated);
  };

  const toggleSetComplete = (exerciseIndex: number, setIndex: number) => {
    if (!log) return;
    const updated = { ...log, exercises: [...log.exercises] };
    const ex = { ...updated.exercises[exerciseIndex], setsLog: [...updated.exercises[exerciseIndex].setsLog] };
    ex.setsLog[setIndex] = { ...ex.setsLog[setIndex], completed: !ex.setsLog[setIndex].completed };
    updated.exercises[exerciseIndex] = ex;
    updated.updatedAt = Date.now();
    saveLog(updated);
  };

  const deleteExercise = (exerciseIndex: number) => {
    if (!log) return;
    const updated = { ...log, exercises: [...log.exercises] };
    updated.exercises.splice(exerciseIndex, 1);
    updated.updatedAt = Date.now();
    saveLog(updated);
  };

  const addExercise = (exercise: GymExerciseLog) => {
    if (!log) return;
    const updated = { ...log, exercises: [...log.exercises] };
    updated.exercises.push(exercise);
    updated.updatedAt = Date.now();
    saveLog(updated);
  };

  const addSet = (exerciseIndex: number) => {
    if (!log) return;
    const updated = { ...log, exercises: [...log.exercises] };
    const ex = { ...updated.exercises[exerciseIndex], setsLog: [...updated.exercises[exerciseIndex].setsLog] };
    const newSetNumber = ex.setsLog.length > 0 ? ex.setsLog[ex.setsLog.length - 1].setNumber + 1 : 1;
    ex.setsLog.push({
      setNumber: newSetNumber,
      reps: null,
      weight: null,
      completed: false,
    });
    updated.exercises[exerciseIndex] = ex;
    updated.updatedAt = Date.now();
    saveLog(updated);
  };

  const addCardio = (type: string) => {
    if (!log) return;
    const updated = { ...log, cardio: log.cardio ? [...log.cardio] : [] };
    updated.cardio.push({
      id: `cardio_${Date.now()}`,
      type,
      durationMinutes: null,
      distanceKm: null,
      speedKmh: null,
      incline: null,
      calories: null,
      completed: false,
    });
    updated.updatedAt = Date.now();
    saveLog(updated);
  };

  const updateCardio = (cardioId: string, updates: Partial<GymCardioLog>) => {
    if (!log || !log.cardio) return;
    const updated = { ...log };
    if (!updated.cardio) return;
    const index = updated.cardio.findIndex(c => c.id === cardioId);
    if (index > -1) {
      updated.cardio[index] = { ...updated.cardio[index], ...updates };
      updated.updatedAt = Date.now();
      saveLog(updated);
    }
  };

  const removeSet = (exerciseIndex: number, setIndex: number) => {
    if (!log) return;
    const updated = { ...log, exercises: [...log.exercises] };
    const ex = { ...updated.exercises[exerciseIndex], setsLog: [...updated.exercises[exerciseIndex].setsLog] };
    ex.setsLog.splice(setIndex, 1);
    // Re-index remaining sets
    ex.setsLog.forEach((s, idx) => s.setNumber = idx + 1);
    updated.exercises[exerciseIndex] = ex;
    updated.updatedAt = Date.now();
    saveLog(updated);
  };

  const updateExercise = (exerciseIndex: number, updatedExercise: GymExerciseLog) => {
    if (!log) return;
    const updated = { ...log, exercises: [...log.exercises] };
    updated.exercises[exerciseIndex] = updatedExercise;
    updated.updatedAt = Date.now();
    saveLog(updated);
  };


  const logSetAndStartTimer = async (
    exerciseIndex: number, 
    updatedExercise: GymExerciseLog, 
    durationSecs: number, 
    exerciseName?: string
  ) => {
    if (!log) return;
    const updated = { ...log, exercises: [...log.exercises] };
    updated.exercises[exerciseIndex] = updatedExercise;
    updated.restTimerStartTime = Date.now();
    updated.restTimerDurationSecs = durationSecs;
    updated.restTimerExerciseName = exerciseName;
    updated.updatedAt = Date.now();
    
    saveLog(updated);

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
  };

  const swapExercise = (exerciseIndex: number, newName: string, newVideoId?: string) => {
    if (!log) return;
    const updated = { ...log, exercises: [...log.exercises] };
    const ex = { ...updated.exercises[exerciseIndex] };
    ex.name = newName;
    if (newVideoId !== undefined) {
      ex.videoId = newVideoId;
    }
    updated.exercises[exerciseIndex] = ex;
    updated.updatedAt = Date.now();
    saveLog(updated);
  };

  const makeSwapPermanent = async (origName: string, newName: string, newVideoId?: string) => {
    if (!user || !userGymPlan) return;
    
    const newPlan = JSON.parse(JSON.stringify(userGymPlan));
    if (!newPlan.customDays) newPlan.customDays = JSON.parse(JSON.stringify(GYM_PLAN));
    
    let changed = false;
    newPlan.customDays.forEach((day: any) => {
      if (day.exercises) {
        day.exercises.forEach((ex: any) => {
          if (ex.name === origName) {
            ex.name = newName;
            if (newVideoId !== undefined) ex.videoId = newVideoId;
            changed = true;
          }
        });
      }
    });

    if (changed) {
      const docRef = doc(db, 'gymPlans', user.uid);
      await setDoc(docRef, newPlan, { merge: true });
    }
  };

  const startWorkout = () => {
    if (!log) return;
    saveLog({ ...log, workoutStartTime: Date.now(), updatedAt: Date.now() });
  };

  const endWorkout = async () => {
    if (!log || !log.workoutStartTime) return;
    const duration = Math.round((Date.now() - log.workoutStartTime) / 60000);
    saveLog({ 
      ...log, 
      workoutStartTime: undefined, 
      workoutDurationMinutes: duration, 
      restTimerStartTime: undefined,
      restTimerDurationSecs: undefined,
      restTimerExerciseName: undefined,
      updatedAt: Date.now() 
    });

    if (currentRestTimerNotifId) {
      await Notifications.cancelScheduledNotificationAsync(currentRestTimerNotifId);
      currentRestTimerNotifId = null;
    }
  };

  const resumeWorkout = () => {
    if (!log) return;
    const pastDurationMs = (log.workoutDurationMinutes || 0) * 60000;
    saveLog({ 
      ...log, 
      workoutStartTime: Date.now() - pastDurationMs,
      workoutDurationMinutes: undefined,
      updatedAt: Date.now() 
    });
  };

  const startRestTimer = async (durationSecs: number, exerciseName?: string) => {
    if (!log) return;
    saveLog({
      ...log,
      restTimerStartTime: Date.now(),
      restTimerDurationSecs: durationSecs,
      restTimerExerciseName: exerciseName,
      updatedAt: Date.now()
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
  };

  const clearRestTimer = async () => {
    if (!log) return;
    saveLog({
      ...log,
      restTimerStartTime: undefined,
      restTimerDurationSecs: undefined,
      restTimerExerciseName: undefined,
      updatedAt: Date.now()
    });
    
    if (currentRestTimerNotifId) {
      await Notifications.cancelScheduledNotificationAsync(currentRestTimerNotifId);
      currentRestTimerNotifId = null;
    }
  };

  const updateRestTimerDuration = async (deltaSecs: number) => {
    if (!log || !log.restTimerDurationSecs) return;
    const newDuration = Math.max(0, log.restTimerDurationSecs + deltaSecs);
    saveLog({
      ...log,
      restTimerDurationSecs: newDuration,
      updatedAt: Date.now()
    });
    
    if (currentRestTimerNotifId && log.restTimerStartTime) {
      await Notifications.cancelScheduledNotificationAsync(currentRestTimerNotifId);
      currentRestTimerNotifId = await Notifications.scheduleNotificationAsync({
        content: { title: 'Rest is over! ⏱️', body: 'Time for your next set.', sound: 'default' },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(log.restTimerStartTime + newDuration * 1000) } as any
      });
    }
  };

  const [restTimerRemaining, setRestTimerRemaining] = useState(0);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (log?.restTimerStartTime && log?.restTimerDurationSecs) {
      const updateTimer = () => {
        const elapsed = Math.floor((Date.now() - log.restTimerStartTime!) / 1000);
        const remaining = Math.max(0, log.restTimerDurationSecs! - elapsed);
        setRestTimerRemaining(remaining);
        if (remaining <= 0) {
          clearInterval(interval);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          // Automatically clear from DB when finished so it doesn't stay stuck forever
          clearRestTimer();
        }
      };
      updateTimer();
      interval = setInterval(updateTimer, 1000);
    } else {
      setRestTimerRemaining(0);
    }
    return () => clearInterval(interval);
  }, [log?.restTimerStartTime, log?.restTimerDurationSecs]);

  return { 
    log, updateSet, toggleSetComplete, deleteExercise, updateExercise, addExercise, 
    addSet, removeSet, addCardio, updateCardio, startWorkout, endWorkout, resumeWorkout,
    startRestTimer, clearRestTimer, updateRestTimerDuration, restTimerRemaining, restTimerInitial: log?.restTimerDurationSecs || 0, saveLog, planDay,
    swapExercise, makeSwapPermanent, logSetAndStartTimer
  };
}
