import { useState, useEffect, useMemo, useRef } from 'react';
import { AppState } from 'react-native';
import { useCoreData } from '../contexts/domains/CoreDataContext';
import { formatLocalDateStr } from '../utils/dateUtils';

/**
 * useTabBarBadges — Stable badge counts for the bottom tab bar.
 *
 * PERF FIX (Issue I): Previously returned a new badges object on EVERY task snapshot,
 * even when the pending task count didn't change. This caused TelegramTabBar to
 * re-render on every Firestore tasks snapshot (~5ms wasted per snapshot).
 *
 * Fix: Compare new badge counts against previous. Only return a new object reference
 * when the actual values change. React.memo + useCallback in the tab bar then
 * correctly skips the re-render when nothing changed.
 */
export function useTabBarBadges() {
  const { tasks } = useCoreData();
  const prevBadgesRef = useRef<Record<string, number>>({});
  const [todayStr, setTodayStr] = useState(() => formatLocalDateStr(new Date()));

  useEffect(() => {
    const checkDate = () => {
      const nowStr = formatLocalDateStr(new Date());
      setTodayStr(prev => (prev !== nowStr ? nowStr : prev));
    };
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkDate();
    });
    const interval = setInterval(checkDate, 60000);
    return () => {
      sub.remove();
      clearInterval(interval);
    };
  }, []);

  return useMemo(() => {
    const localISOTime = todayStr;
    let pendingTasks = 0;
    const len = tasks?.length ?? 0;

    for (let i = 0; i < len; i++) {
      const task = tasks[i];
      if (task.status === 'pending' && task.date === localISOTime) {
        pendingTasks++;
      }
    }

    const prev = prevBadgesRef.current;
    const prevCount = prev.Tasks || 0;

    if (prevCount === pendingTasks) {
      return prev;
    }

    const newBadges: Record<string, number> = {};
    if (pendingTasks > 0) {
      newBadges.Tasks = pendingTasks;
    }
    prevBadgesRef.current = newBadges;
    return newBadges;
  }, [tasks, todayStr]);
}
