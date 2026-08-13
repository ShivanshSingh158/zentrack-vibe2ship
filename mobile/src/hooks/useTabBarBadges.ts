import { useMemo } from 'react';
import { useMobileData } from '../contexts/MobileDataContext';

export function useTabBarBadges() {
  const { tasks, assignments } = useMobileData();

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

    // --- Assignments Badge ---
    // Count assignments that are not submitted and due within 72 hours
    let urgentAssignments = 0;
    const now = Date.now();
    const msIn72h = 72 * 60 * 60 * 1000;
    
    (assignments || []).forEach(assignment => {
      if (assignment.status === 'not_started' || assignment.status === 'in_progress') {
        if (assignment.dueDate) {
          const dueDate = new Date(assignment.dueDate).getTime();
          // due in next 72 hours, or up to 24h overdue
          if (dueDate >= now - (24 * 60 * 60 * 1000) && dueDate <= now + msIn72h) {
             urgentAssignments++;
          }
        }
      }
    });
    
    if (urgentAssignments > 0) {
      badges.Assignments = urgentAssignments;
    }

    return badges;
  }, [tasks, assignments]);
}
