/**
 * useWidgetSync.tsx — Synchronizes app state to the Android Home Screen Widget
 */

import { useEffect, useRef } from 'react';
import { InteractionManager, Platform } from 'react-native';
import { 
  buildTodayAgendaData, 
  saveCachedWidgetData, 
  updateTodayAgendaWidget 
} from '../services/widgetSyncService';
import type { Task, AttendanceSubject, AttendanceLog } from '../contexts/MobileDataContext';

interface UseWidgetSyncParams {
  tasks?: Task[];
  subjects?: AttendanceSubject[];
  attendanceLogs?: AttendanceLog[];
  zenScore?: number;
}

export function useWidgetSync({
  tasks = [],
  subjects = [],
  attendanceLogs = [],
  zenScore = 85,
}: UseWidgetSyncParams) {
  const debounceTimer = useRef<any>(null);

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    debounceTimer.current = setTimeout(() => {
      InteractionManager.runAfterInteractions(async () => {
        try {
          const data = buildTodayAgendaData({
            tasks,
            subjects,
            attendanceLogs,
            zenScore,
          });
          await saveCachedWidgetData(data);
          await updateTodayAgendaWidget(data);
        } catch (e) {
          console.warn('[useWidgetSync] Error syncing widget:', e);
        }
      });
    }, 1200);

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [tasks, subjects, attendanceLogs, zenScore]);
}
