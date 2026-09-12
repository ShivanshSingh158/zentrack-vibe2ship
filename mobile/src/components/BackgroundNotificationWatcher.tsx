import React, { useEffect, useRef } from 'react';
import { InteractionManager } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCoreData } from '../contexts/domains/CoreDataContext';
import { useWellnessData } from '../contexts/domains/WellnessContext';
import { useAcademicData } from '../contexts/domains/AcademicContext';
import { usePlannerData } from '../contexts/domains/PlannerContext';
import { scheduleAllNotifications } from '../services/notifications';

/**
 * BackgroundNotificationWatcher
 *
 * Dedicated, unmounted background worker that debounces and schedules local notifications
 * across all domain slices without wrapping or re-rendering any UI components.
 *
 * WORKOUT SUPPRESSION: While an active (non-completed) gym session is in progress,
 * notification scheduling is suppressed entirely. Every set logged triggers a Firestore
 * update → context re-render → debounce → schedule. This would cancel all OS alarms
 * and rebuild them dozens of times per workout. The guard prevents this flood.
 */
export function BackgroundNotificationWatcher() {
  const core = useCoreData();
  const wellness = useWellnessData();
  const academic = useAcademicData();
  const planner = usePlannerData();

  const notifTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interactionHandleRef = useRef<any>(null);
  const isInitialBootRef = useRef(true);

  useEffect(() => {
    if (notifTimerRef.current) clearTimeout(notifTimerRef.current);
    if (interactionHandleRef.current) interactionHandleRef.current.cancel();

    // On cold boot, delay notification rescheduling by 4 seconds to allow initial UI paint,
    // animations, and multi-domain Firestore snapshots to settle before running the heavy scheduler.
    // Subsequent updates use a snappy 600ms debounce.
    const delay = isInitialBootRef.current ? 4000 : 600;

    notifTimerRef.current = setTimeout(() => {
      isInitialBootRef.current = false;
      interactionHandleRef.current = InteractionManager.runAfterInteractions(async () => {
        interactionHandleRef.current = null;

        // ── Active Workout Guard ────────────────────────────────────────────
        // If the user is actively logging a workout, do NOT reschedule notifications.
        // Logging a single set causes gymLogs to update → this watcher fires → all
        // scheduled notifications get cancelled and rebuilt. Suppressing during active
        // sessions eliminates the entire notification storm without losing any reminders.
        try {
          const activeStateRaw = await AsyncStorage.getItem('@zentrack_active_workout_state');
          if (activeStateRaw) {
            const activeState = JSON.parse(activeStateRaw);
            if (activeState && !activeState.completed) {
              console.log('[Notifications] Active workout in progress — skipping reschedule to prevent notification flood.');
              return;
            }
          }
        } catch {
          // AsyncStorage read failure: proceed with scheduling (safe default)
        }

        scheduleAllNotifications({
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
        }).catch(console.warn);
      });
    }, delay);

    return () => {
      if (notifTimerRef.current) clearTimeout(notifTimerRef.current);
      if (interactionHandleRef.current) interactionHandleRef.current.cancel();
    };
  }, [
    core.tasks, planner.customEvents, wellness.gymLogs, academic.attendance,
    academic.attendanceLogs, core.habitLogs, core.allHabits, academic.assignments,
    wellness.waterLogs, wellness.sleepLogs, wellness.userGymPlan,
  ]);

  return null;
}
