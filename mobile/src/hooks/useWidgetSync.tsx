/**
 * useWidgetSync.tsx — Synchronizes app state to the Android Home Screen Widget
 * Performance optimized with fast structural fingerprint hashing to eliminate redundant syncs.
 */

import { useEffect, useRef } from 'react';
import { InteractionManager, Platform } from 'react-native';
import { 
  buildTodayAgendaData, 
  saveCachedWidgetData, 
  updateTodayAgendaWidget,
  buildLiveWorkoutWidgetData,
  saveCachedLiveWorkoutData,
  updateLiveWorkoutWidget,
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
  gymLogs?: any[];
  userGymPlan?: any;
}

export function useWidgetSync({
  tasks = [],
  subjects = [],
  attendanceLogs = [],
  holidays = [],
  zenScore = 85,
  streak = 0,
  gymLogs = [],
  userGymPlan = null,
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

    const todayGym = (gymLogs || []).find((g: any) => (g.date || '').slice(0, 10) === dateStr);
    const planFingerprint = userGymPlan ? `${userGymPlan.splitName || ''}_${userGymPlan.updatedAt || 0}` : 'no_plan';

    const completedSetsCount = todayGym
      ? (todayGym.exercises || []).reduce(
          (sum: number, ex: any) => sum + ((ex.setsLog || []).filter((s: any) => s.completed).length),
          0
        )
      : 0;
    const gymFingerprint = todayGym
      ? `${todayGym.completed ? '1' : '0'}_${todayGym.workoutStartTime || 0}_${todayGym.workoutDurationMinutes || 0}_${(todayGym.exercises || []).length}_${completedSetsCount}_${todayGym.updatedAt || 0}`
      : 'no_gym';
    const taskFp = tasks
      .map(t => `${t.id}:${t.status}:${t.date || ''}:${t.timeSlot || ''}:${t.title || ''}`)
      .join(',');

    // Fast O(1) shallow fingerprint tracking task states, today's log actions, holiday state, zenScore, streak, and gym state
    const currentFingerprint = `${tasks.length}_${taskFp}_${subjects.length}_${todayLogs}_${isHoliday ? '1' : '0'}_${Math.round(zenScore)}_${Math.round(streak)}_${gymFingerprint}_${planFingerprint}`;
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
          const agendaData = buildTodayAgendaData({
            tasks,
            subjects,
            attendanceLogs,
            holidays,
            zenScore,
            streak,
          });
          await saveCachedWidgetData(agendaData);
          await updateTodayAgendaWidget(agendaData);

          const workoutData = buildLiveWorkoutWidgetData({
            todayStr: dateStr,
            gymLogs,
            userGymPlan,
          });
          await saveCachedLiveWorkoutData(workoutData);
          await updateLiveWorkoutWidget(workoutData);
        } catch (e) {
        }
      });
    }, 2000); // 2s debounce to preserve UI thread during rapid interactions

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [tasks, subjects, attendanceLogs, holidays, zenScore, streak, gymLogs, userGymPlan]);
}
