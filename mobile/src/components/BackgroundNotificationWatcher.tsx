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
  const isFirstNotifMount = useRef(true);

  useEffect(() => {
    // Skip the very first effect invocation (mount-time deps change burst)
    if (isFirstNotifMount.current) {
      isFirstNotifMount.current = false;
      return;
    }
    if (notifTimerRef.current) clearTimeout(notifTimerRef.current);
    notifTimerRef.current = setTimeout(() => {
      InteractionManager.runAfterInteractions(() => {
        requestAnimationFrame(() => {
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
      });
    }, 8000); // 8s debounce window absorbs burst writes and runs strictly off-interaction

    return () => {
      if (notifTimerRef.current) clearTimeout(notifTimerRef.current);
    };
  }, [
    core.tasks, planner.customEvents, wellness.gymLogs, academic.attendance,
    academic.attendanceLogs, core.habitLogs, core.allHabits, academic.assignments,
    wellness.waterLogs, wellness.sleepLogs, wellness.userGymPlan,
  ]);

  return null;
}
