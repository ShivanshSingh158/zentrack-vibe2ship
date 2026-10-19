import React, { useEffect, useRef, useState } from 'react';
import { InteractionManager, AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCoreData } from '../contexts/domains/CoreDataContext';
import { useWellnessData } from '../contexts/domains/WellnessContext';
import { useAcademicData } from '../contexts/domains/AcademicContext';
import { usePlannerData } from '../contexts/domains/PlannerContext';
import { scheduleAllNotifications } from '../services/notifications';

// ─── Active-Workout Detection ─────────────────────────────────────────────────
// We must NEVER run scheduleAllNotifications() while a workout is in progress.
// scheduleAllNotifications() cancels ALL scheduled notifications then reschedules
// them — this wipes the rest-timer notification mid-set, causing the "notification
// fires immediately" bug. We read the flag synchronously from an in-module ref
// to avoid any async I/O on the hot set-logging path.
let _isWorkoutActive = false;
export function setActiveWorkoutFlag(active: boolean) {
  _isWorkoutActive = active;
}

export function BackgroundNotificationWatcher() {
  const core = useCoreData();
  const wellness = useWellnessData();
  const academic = useAcademicData();
  const planner = usePlannerData();

  const notifTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interactionHandleRef = useRef<{ cancel: () => void } | null>(null);
  const isInitialBootRef = useRef(true);
  const prevWaterCountRef = useRef<number>(wellness.waterLogs?.length ?? 0);
  const [triggerTick, setTriggerTick] = useState(0);

  // Keep a live ref to all domain state so scheduling never re-triggers on every tap
  const dataRef = useRef({
    user: core.user,
    tasks: core.tasks,
    customEvents: planner.customEvents,
    gymLogs: wellness.gymLogs,
    attendance: academic.attendance,
    attendanceLogs: academic.attendanceLogs,
    habitLogs: core.habitLogs,
    allHabits: core.allHabits,
    assignments: academic.assignments,
    waterLogs: wellness.waterLogs,
    sleepLogs: wellness.sleepLogs,
    userGymPlan: wellness.userGymPlan,
    holidays: academic.holidays,
  });

  dataRef.current = {
    user: core.user,
    tasks: core.tasks,
    customEvents: planner.customEvents,
    gymLogs: wellness.gymLogs,
    attendance: academic.attendance,
    attendanceLogs: academic.attendanceLogs,
    habitLogs: core.habitLogs,
    allHabits: core.allHabits,
    assignments: academic.assignments,
    waterLogs: wellness.waterLogs,
    sleepLogs: wellness.sleepLogs,
    userGymPlan: wellness.userGymPlan,
    holidays: academic.holidays,
  };

  // Water log change trigger (fast update so hydration reminders stay in sync)
  useEffect(() => {
    const currentWaterCount = wellness.waterLogs?.length ?? 0;
    if (currentWaterCount !== prevWaterCountRef.current) {
      prevWaterCountRef.current = currentWaterCount;
      if (!isInitialBootRef.current) {
        setTriggerTick(t => t + 1);
      }
    }
  }, [wellness.waterLogs?.length]);

  // Event listeners for workout complete and explicit reschedule
  useEffect(() => {
    const { DeviceEventEmitter } = require('react-native');
    const subWorkout = DeviceEventEmitter.addListener('gym_workout_completed', () => {
      _isWorkoutActive = false;
      setTriggerTick(t => t + 1);
    });
    const subReschedule = DeviceEventEmitter.addListener('reschedule_notifications', () => {
      setTriggerTick(t => t + 1);
    });
    return () => {
      subWorkout.remove();
      subReschedule.remove();
    };
  }, []);

  // AppState change: arm alarms when backgrounding
  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'background' || nextState === 'inactive') {
        setTriggerTick(t => t + 1);
      }
    });
    return () => sub.remove();
  }, []);

  // Scheduling execution effect
  useEffect(() => {
    const data = dataRef.current;
    if (!data.user) return;
    if (notifTimerRef.current) clearTimeout(notifTimerRef.current);
    if (interactionHandleRef.current) interactionHandleRef.current.cancel();

    const delay = isInitialBootRef.current ? 4000 : 300;

    notifTimerRef.current = setTimeout(() => {
      isInitialBootRef.current = false;
      interactionHandleRef.current = InteractionManager.runAfterInteractions(async () => {
        interactionHandleRef.current = null;

        if (_isWorkoutActive) {
          console.log('[BackgroundNotif] Active workout in progress (in-memory flag) — skipping reschedule.');
          return;
        }

        try {
          const activeStateRaw = await AsyncStorage.getItem('@zentrack_active_workout_state');
          if (activeStateRaw) {
            const activeState = JSON.parse(activeStateRaw);
            const startedAt =
              activeState?.workoutStartTime ||
              activeState?.startedAt ||
              activeState?.updatedAt ||
              0;
            const isFresh = startedAt > 0 && Date.now() - startedAt < 3 * 60 * 60 * 1000;
            if (activeState && !activeState.completed && isFresh) {
              console.log('[BackgroundNotif] Active workout in progress (AsyncStorage) — skipping reschedule.');
              return;
            } else if (activeState && !activeState.completed && !isFresh) {
              await AsyncStorage.removeItem('@zentrack_active_workout_state').catch(() => {});
            }
          }
        } catch {}

        const latest = dataRef.current;
        scheduleAllNotifications({
          tasks: latest.tasks,
          customEvents: latest.customEvents,
          gymLogs: latest.gymLogs,
          attendance: latest.attendance,
          attendanceLogs: latest.attendanceLogs,
          habitLogs: latest.habitLogs,
          allHabits: latest.allHabits,
          assignments: latest.assignments,
          waterLogs: latest.waterLogs,
          sleepLogs: latest.sleepLogs,
          userGymPlan: latest.userGymPlan,
          holidays: latest.holidays,
        }).catch(console.warn);
      });
    }, delay);

    return () => {
      if (notifTimerRef.current) clearTimeout(notifTimerRef.current);
      if (interactionHandleRef.current) interactionHandleRef.current.cancel();
    };
  }, [core.user?.uid, triggerTick]);

  return null;
}
