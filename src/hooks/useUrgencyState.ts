import { useEffect, useMemo } from 'react';
import { getLocalDateString } from '../utils/dateUtils';

export type UrgencyState = 'state-calm' | 'state-active' | 'state-critical';

/**
 * Computes the global urgency state from the user's task list
 * and applies it as a class on :root, morphing the entire app's color palette.
 *
 * - state-critical: Any overdue tasks (Crimson / Magenta)
 * - state-active:   Tasks due today (Sunset Orange / Mango)
 * - state-calm:     No urgent deadlines (Bioluminescent Cyan)
 */
export const useUrgencyState = (tasks: any[]): UrgencyState => {
  const urgencyState = useMemo<UrgencyState>(() => {
    if (!tasks || tasks.length === 0) return 'state-calm';

    const today = getLocalDateString(new Date());

    const hasOverdue = tasks.some(
      t => t.status !== 'completed' && t.date && t.date < today
    );
    if (hasOverdue) return 'state-critical';

    const hasUrgentToday = tasks.some(
      t => t.status !== 'completed' && t.date === today
    );
    if (hasUrgentToday) return 'state-active';

    return 'state-calm';
  }, [tasks]);

  useEffect(() => {
    const root = document.documentElement;
    // Remove previous urgency states
    root.classList.remove('state-calm', 'state-active', 'state-critical');
    root.classList.add(urgencyState);

    return () => {
      root.classList.remove('state-calm', 'state-active', 'state-critical');
    };
  }, [urgencyState]);

  return urgencyState;
};
