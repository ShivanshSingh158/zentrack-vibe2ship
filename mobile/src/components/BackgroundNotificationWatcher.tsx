import React, { useEffect, useRef } from 'react';
import { InteractionManager } from 'react-native';
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
      interactionHandleRef.current = InteractionManager.runAfterInteractions(() => {
        interactionHandleRef.current = null;
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
