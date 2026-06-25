import { useEffect, useRef } from 'react';
import { orchestrateAgent } from '../agent/orchestrator';
import { getLocalDateString } from '../utils/dateUtils';
import { toast } from 'sonner';

const PROACTIVE_THROTTLE_MS = 60 * 60 * 1000; // 1 hour between proactive checks
const STORAGE_KEY = 'zen_proactive_last_run';

/**
 * useProactiveAgent — The "Last-Minute Life Saver" core hook.
 *
 * Runs automatically on app load. If overdue or today-due tasks are detected,
 * it fires the full Orchestrator autonomously to generate a priority briefing
 * WITHOUT the user needing to ask.
 *
 * This is what takes the app from "reactive chatbot" to "proactive AI agent."
 */
export const useProactiveAgent = (
  tasks: any[], 
  calendarEvents: any[], 
  setIsExecuting?: (b: boolean) => void
) => {
  const hasRun = useRef(false);

  useEffect(() => {
    // Don't run until tasks have loaded
    if (!tasks || tasks.length === 0) return;
    // Only run once per component mount
    if (hasRun.current) return;
    hasRun.current = true;

    const runProactiveCheck = async () => {
      // Throttle: don't spam the API
      const lastRun = parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10);
      if (Date.now() - lastRun < PROACTIVE_THROTTLE_MS) return;

      const today = getLocalDateString(new Date());
      const overdueTasks = tasks.filter(
        t => t.status !== 'completed' && t.date && t.date < today
      );
      const todayTasks = tasks.filter(
        t => t.status !== 'completed' && t.date === today
      );

      // Only trigger if there's something actually urgent
      if (overdueTasks.length === 0 && todayTasks.length === 0) return;

      localStorage.setItem(STORAGE_KEY, Date.now().toString());

      if (setIsExecuting) setIsExecuting(true);

      // Announce proactive activation in the terminal
      window.dispatchEvent(new CustomEvent('agent-log', {
        detail: {
          type: 'thinking',
          title: `🚨 Proactive Agent activated — ${overdueTasks.length} overdue, ${todayTasks.length} due today detected`
        }
      }));

      const currentTime = new Date().toISOString();
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const temporalContext = `[TEMPORAL CONTEXT: Current Time is ${currentTime}, Timezone is ${timezone}. Use this to calculate exact hours remaining for today's deadlines.]\n\n`;

      const prompt = overdueTasks.length > 0
        ? `${temporalContext}PROACTIVE BRIEFING REQUIRED: The user has ${overdueTasks.length} overdue task(s) and ${todayTasks.length} task(s) due today. ` +
          `Analyze their full situation, identify the most critical item, and create an immediate action plan. ` +
          `Check calendar for free slots. Prepare a concise morning briefing they can act on immediately.`
        : `${temporalContext}MORNING BRIEFING: The user has ${todayTasks.length} task(s) due today. ` +
          `Analyze their workload, check available time slots, and give them a clear priority order for today.`;

      try {
        const apiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || '';
        const result = await orchestrateAgent(prompt, tasks, calendarEvents, apiKey, () => {});

        // Store result so HomeDashboard can display it
        window.dispatchEvent(new CustomEvent('proactive-briefing', {
          detail: { report: result, overdueCount: overdueTasks.length, todayCount: todayTasks.length }
        }));

        // Send SMS briefing if there are overdue tasks using Twilio API
        if (overdueTasks.length > 0) {
          try {
            await fetch('/api/send-sms', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                message: `🚨 Zen AI Alert: You have ${overdueTasks.length} overdue task(s)! A morning recovery block is scheduled. Plan: ${result.slice(0, 120)}...` 
              })
            });
          } catch (smsErr) {
            console.warn('[Twilio] Failed to send proactive SMS:', smsErr);
          }
        }

        // Show toast notification
        const severity = overdueTasks.length > 0 ? 'error' : 'warning';
        if (severity === 'error') {
          toast.error('⚠️ Deadline Alert', {
            description: `${overdueTasks.length} overdue task${overdueTasks.length > 1 ? 's' : ''}. Zen AI briefing ready.`,
            duration: 8000,
            action: { label: 'View Report', onClick: () => window.dispatchEvent(new CustomEvent('show-proactive-report')) }
          });
        } else {
          toast.info('🧠 Morning Briefing Ready', {
            description: `${todayTasks.length} task${todayTasks.length > 1 ? 's' : ''} due today. Zen AI has your plan.`,
            duration: 6000,
            action: { label: 'View Plan', onClick: () => window.dispatchEvent(new CustomEvent('show-proactive-report')) }
          });
        }
      } catch (err) {
        console.warn('[ProactiveAgent] Briefing failed silently:', err);
      } finally {
        if (setIsExecuting) setIsExecuting(false);
      }
    };

    // Small delay so the app finishes rendering before firing
    const timer = setTimeout(runProactiveCheck, 3000);
    return () => clearTimeout(timer);
  }, [tasks, calendarEvents, setIsExecuting]);
};
