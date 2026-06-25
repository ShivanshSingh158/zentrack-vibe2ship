import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { toast } from 'sonner';
import { useGlobalData } from '../contexts/GlobalDataContext';

export const useContextReminders = () => {
  const location = useLocation();
  const { tasks, gymLogs } = useGlobalData();
  const hasShownGymReminder = useRef(false);
  const hasShownTodoReminder = useRef(false);

  useEffect(() => {
    // We delay the toast slightly so it appears after the page loads
    const timer = setTimeout(() => {
      const path = location.pathname;
      const now = new Date();

      if (path === '/gym') {
        const gymLoggedToday = gymLogs.some((l: any) => new Date(l.date).toDateString() === now.toDateString());
        if (!gymLoggedToday && !hasShownGymReminder.current) {
          toast.message('Zen AI Reminder 🧠', {
            description: "Don't forget to take your pre-workout! Let's crush today's session.",
            duration: 6000,
          });
          hasShownGymReminder.current = true;
        }
      }

      if (path === '/todo' || path === '/tasks') {
        const overdueTodos = tasks.filter(t => t.isOverdue && t.status !== 'completed');
        if (overdueTodos.length > 3 && !hasShownTodoReminder.current) {
          toast.message('Zen AI Reminder 🧠', {
            description: `You have ${overdueTodos.length} overdue tasks! Focus mode is highly recommended.`,
            duration: 6000,
          });
          hasShownTodoReminder.current = true;
        } else if (tasks.filter(t => t.status !== 'completed').length === 0 && tasks.length > 0) {
          // If they just opened the todo page and have 0 pending tasks
           toast.success("You've cleared all your tasks for today! Take a break.");
        }
      }
      
    }, 1000);

    return () => clearTimeout(timer);
  }, [location.pathname, tasks, gymLogs]);
};
