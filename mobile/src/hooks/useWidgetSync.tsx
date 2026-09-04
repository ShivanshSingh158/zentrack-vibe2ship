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
import { formatLocalDateStr } from '../utils/dateUtils';

interface UseWidgetSyncParams {
  tasks?: Task[];
  subjects?: AttendanceSubject[];
  attendanceLogs?: AttendanceLog[];
  holidays?: string[];
  zenScore?: number;
  streak?: number;
}

export function useWidgetSync({
  tasks = [],
  subjects = [],
  attendanceLogs = [],
  holidays = [],
  zenScore = 85,
  streak = 0,
}: UseWidgetSyncParams) {
  const debounceTimer = useRef<any>(null);
  const lastFingerprintRef = useRef<string>('');

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const now = new Date();
    const dateStr = formatLocalDateStr(now);
    const todayLogs = attendanceLogs
      .filter((l) => (l.date || '').slice(0, 10) === dateStr)
      .map((l) => `${l.id || l.subjectId}_${(l as any).idx ?? (l as any).sessionIdx ?? 0}_${l.action}`)
      .sort()
      .join('|');
    const isHoliday = (holidays || []).some(h => (typeof h === 'string' ? h.trim().slice(0, 10) : (h as any)?.date?.trim()?.slice(0, 10)) === dateStr);

    // Fast O(1) shallow fingerprint tracking task states, today's log actions, holiday state, zenScore, and streak
    const currentFingerprint = `${tasks.length}_${tasks.map(t => `${t.id}:${t.status}`).join(',')}_${subjects.length}_${todayLogs}_${isHoliday ? '1' : '0'}_${Math.round(zenScore)}_${Math.round(streak)}`;
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
            holidays,
            zenScore,
            streak,
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
  }, [tasks, subjects, attendanceLogs, holidays, zenScore, streak]);
}
