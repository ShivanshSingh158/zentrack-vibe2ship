import { useMemo, useRef } from 'react';
import { useCoreData } from '../contexts/domains/CoreDataContext';

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

  return useMemo(() => {
    // Create a local today string safely (YYYY-MM-DD)
    const tzOffset = (new Date()).getTimezoneOffset() * 60000;
    const localISOTime = (new Date(Date.now() - tzOffset)).toISOString().slice(0, 10);

    const newBadges: Record<string, number> = {};

    // --- Tasks Badge ---
    // Count pending tasks that are scheduled for today or are overdue.
    let pendingTasks = 0;
    (tasks || []).forEach(task => {
      if (task.status === 'pending' && task.date) {
        if (task.date <= localISOTime) {
          pendingTasks++;
        }
      }
    });

    if (pendingTasks > 0) {
      newBadges.Tasks = pendingTasks;
    }

    // Stable reference: only produce a new object if values actually changed.
    // This prevents TelegramTabBar from re-rendering on every task snapshot
    // when the pending count is identical (e.g. user adds a future-dated task).
    const prev = prevBadgesRef.current;
    const prevKeys = Object.keys(prev);
    const newKeys = Object.keys(newBadges);
    const changed =
      prevKeys.length !== newKeys.length ||
      newKeys.some(k => prev[k] !== newBadges[k]);

    if (changed) {
      prevBadgesRef.current = newBadges;
    }

    return prevBadgesRef.current;
  }, [tasks]);
}
