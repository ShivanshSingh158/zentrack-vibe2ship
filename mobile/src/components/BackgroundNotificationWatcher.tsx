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
  const lastResumeAtRef = useRef<number>(Date.now());
  const prevWaterCountRef = useRef<number>(wellness.waterLogs?.length ?? 0);
  const [resumeTick, setResumeTick] = useState(0);

  // ── Gym logs ref: kept up-to-date without triggering re-runs ─────────────
  // PERF FIX: wellness.gymLogs was previously in the effect deps array, causing
  // scheduleAllNotifications() to fire on EVERY set completion. We break the dep
  // chain by keeping gymLogs in a ref — the scheduling effect reads the ref on
  // execution, not at dep-change time.
  const gymLogsRef = useRef(wellness.gymLogs);
  useEffect(() => {
    gymLogsRef.current = wellness.gymLogs;
  }, [wellness.gymLogs]);

  // ── userGymPlan ref — same fix: prevents scheduling on plan updates mid-workout ──
  const userGymPlanRef = useRef(wellness.userGymPlan);
  useEffect(() => {
    userGymPlanRef.current = wellness.userGymPlan;
  }, [wellness.userGymPlan]);

  // ── Scheduling trigger for when workout completes ─────────────────────────
  // When a workout finishes (completed=true), gymLogs changes in a way that SHOULD
  // trigger a reschedule (gym rest-day notification needs updating). We do this
  // by listening for the workout-completed DeviceEventEmitter event, not gymLogs dep.
  const [workoutCompletedTick, setWorkoutCompletedTick] = useState(0);
  useEffect(() => {
    const { DeviceEventEmitter } = require('react-native');
    const sub = DeviceEventEmitter.addListener('gym_workout_completed', () => {
      // Clear the workout flag so the next scheduling run is allowed
      _isWorkoutActive = false;
      setWorkoutCompletedTick(t => t + 1);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        lastResumeAtRef.current = Date.now();
        setResumeTick(t => t + 1);
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!core.user) return;
    if (notifTimerRef.current) clearTimeout(notifTimerRef.current);
    if (interactionHandleRef.current) interactionHandleRef.current.cancel();

    const currentWaterCount = wellness.waterLogs?.length ?? 0;
    const waterChanged = currentWaterCount !== prevWaterCountRef.current;
    prevWaterCountRef.current = currentWaterCount;

    const msSinceResume = Date.now() - lastResumeAtRef.current;
    // Fast 400ms reschedule when water is logged so alarms update before user locks phone
    const delay = isInitialBootRef.current
      ? 4000
      : waterChanged
      ? 400
      : msSinceResume < 4000
      ? 3000
      : 2000;

    notifTimerRef.current = setTimeout(() => {
      isInitialBootRef.current = false;
      interactionHandleRef.current = InteractionManager.runAfterInteractions(async () => {
        interactionHandleRef.current = null;

        // PERF FIX: Block ALL notification rescheduling during an active workout.
        // _isWorkoutActive is set synchronously by useGymLog when a workout starts/ends.
        // We also check AsyncStorage as a secondary safety net for the initial boot path
        // where the flag may not be set yet (e.g. app restarted mid-workout).
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

        scheduleAllNotifications({
          tasks: core.tasks,
          customEvents: planner.customEvents,
          // PERF FIX: Read from ref, not closure — avoids stale capture AND prevents
          // dep-array changes from re-triggering this effect on every set log.
          gymLogs: gymLogsRef.current,
          attendance: academic.attendance,
          attendanceLogs: academic.attendanceLogs,
          habitLogs: core.habitLogs,
          allHabits: core.allHabits,
          assignments: academic.assignments,
          waterLogs: wellness.waterLogs,
          sleepLogs: wellness.sleepLogs,
          userGymPlan: userGymPlanRef.current,
          holidays: academic.holidays,
        }).catch(console.warn);
      });
    }, delay);

    return () => {
      if (notifTimerRef.current) clearTimeout(notifTimerRef.current);
      if (interactionHandleRef.current) interactionHandleRef.current.cancel();
    };
  }, [
    resumeTick,
    workoutCompletedTick,
    // ✅ wellness.gymLogs REMOVED — breaks the set-log → reschedule cascade
    // ✅ wellness.userGymPlan REMOVED — read from ref instead
    core.user?.uid, core.tasks, planner.customEvents, academic.attendance,
    academic.attendanceLogs, core.habitLogs, core.allHabits, academic.assignments,
    wellness.waterLogs, wellness.sleepLogs, academic.holidays,
  ]);

  return null;
}
