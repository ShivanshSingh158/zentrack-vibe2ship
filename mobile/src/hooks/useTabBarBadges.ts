import { useMemo } from 'react';
import { useMobileData } from '../contexts/MobileDataContext';

export function useTabBarBadges() {
  const { tasks } = useMobileData();

  return useMemo(() => {
    // Create a local today string safely (YYYY-MM-DD)
    const tzOffset = (new Date()).getTimezoneOffset() * 60000;
    const localISOTime = (new Date(Date.now() - tzOffset)).toISOString().slice(0, 10);

    const badges: Record<string, number> = {};

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
      badges.Tasks = pendingTasks;
    }

    return badges;
  }, [tasks]);
}
