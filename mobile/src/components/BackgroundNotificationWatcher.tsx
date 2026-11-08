import React, { useEffect, useRef, useState } from 'react';
import { InteractionManager, AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCoreData } from '../contexts/domains/CoreDataContext';
import { useAcademicData } from '../contexts/domains/AcademicContext';
import { usePlannerData } from '../contexts/domains/PlannerContext';
import { scheduleAllNotifications } from '../services/notifications';

export function BackgroundNotificationWatcher() {
  const core = useCoreData();
  const academic = useAcademicData();
  const planner = usePlannerData();

  const notifTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interactionHandleRef = useRef<{ cancel: () => void } | null>(null);
  const isInitialBootRef = useRef(true);
  const [triggerTick, setTriggerTick] = useState(0);

  // Keep a live ref to all domain state so scheduling never re-triggers on every tap
  const dataRef = useRef({
    user: core.user,
    tasks: core.tasks,
    customEvents: planner.customEvents,
    attendance: academic.attendance,
    attendanceLogs: academic.attendanceLogs,
    holidays: academic.holidays,
  });

  dataRef.current = {
    user: core.user,
    tasks: core.tasks,
    customEvents: planner.customEvents,
    attendance: academic.attendance,
    attendanceLogs: academic.attendanceLogs,
    holidays: academic.holidays,
  };

  // Event listener for explicit reschedule
  useEffect(() => {
    const { DeviceEventEmitter } = require('react-native');
    const subReschedule = DeviceEventEmitter.addListener('reschedule_notifications', () => {
      setTriggerTick(t => t + 1);
    });
    return () => {
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

        const latest = dataRef.current;
        scheduleAllNotifications({
          tasks: latest.tasks,
          customEvents: latest.customEvents,
          attendance: latest.attendance,
          attendanceLogs: latest.attendanceLogs,
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
