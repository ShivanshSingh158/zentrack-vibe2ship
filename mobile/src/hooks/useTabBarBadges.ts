import { useMemo, useRef } from 'react';
import { useCoreData } from '../contexts/domains/CoreDataContext';

/**
 * useTabBarBadges — Stable badge counts for the bottom tab bar.
 * Reads precomputed todayPendingTaskCount from CoreDataContext in O(1) time.
 * Zero intervals, zero AppState listeners, zero redundant array scans.
 */
export function useTabBarBadges(): Record<string, number> {
  const { todayPendingTaskCount } = useCoreData();
  const prevBadgesRef = useRef<Record<string, number>>({});

  return useMemo(() => {
    const count = todayPendingTaskCount ?? 0;
    const prev = prevBadgesRef.current;
    if ((prev.Tasks || 0) === count) {
      return prev;
    }

    const newBadges: Record<string, number> = {};
    if (count > 0) {
      newBadges.Tasks = count;
    }
    prevBadgesRef.current = newBadges;
    return newBadges;
  }, [todayPendingTaskCount]);
}
