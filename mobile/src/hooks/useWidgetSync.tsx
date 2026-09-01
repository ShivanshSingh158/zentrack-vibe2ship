/**
 * useWidgetSync.tsx — Synchronizes app state to the Android Home Screen Widget
 * Performance optimized with fast structural fingerprint hashing to eliminate redundant syncs.
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
  const lastFingerprintRef = useRef<string>('');

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    // Fast O(1) shallow fingerprint
    const currentFingerprint = `${tasks.length}_${tasks.map(t => `${t.id}:${t.status}`).join(',')}_${subjects.length}_${attendanceLogs.length}_${Math.round(zenScore)}`;
    if (currentFingerprint === lastFingerprintRef.current) {
      return; // Data has not changed; skip 100% of background work
    }
    lastFingerprintRef.current = currentFingerprint;

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
        }
      });
    }, 2000); // 2s debounce to preserve UI thread during rapid interactions

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [tasks, subjects, attendanceLogs, zenScore]);
}
