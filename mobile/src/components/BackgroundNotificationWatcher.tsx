import React, { useEffect, useRef, useState } from 'react';
import { InteractionManager, AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCoreData } from '../contexts/domains/CoreDataContext';
import { useWellnessData } from '../contexts/domains/WellnessContext';
import { useAcademicData } from '../contexts/domains/AcademicContext';
import { usePlannerData } from '../contexts/domains/PlannerContext';
import { scheduleAllNotifications } from '../services/notifications';

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
              return;
            } else if (activeState && !activeState.completed && !isFresh) {
              await AsyncStorage.removeItem('@zentrack_active_workout_state').catch(() => {});
            }
          }
        } catch {}

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
    core.user?.uid, core.tasks, planner.customEvents, wellness.gymLogs, academic.attendance,
    academic.attendanceLogs, core.habitLogs, core.allHabits, academic.assignments,
    wellness.waterLogs, wellness.sleepLogs, wellness.userGymPlan, academic.holidays,
  ]);

  return null;
}
