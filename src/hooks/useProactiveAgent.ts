import { useEffect, useRef } from 'react';
import { orchestrateAgent } from '../agent/orchestrator';
import { getLocalDateString } from '../utils/dateUtils';
import { toast } from 'sonner';

const PROACTIVE_THROTTLE_MS = 60 * 60 * 1000;   // 1 hour between emergency action runs
const GHOST_THROTTLE_MS     = 24 * 60 * 60 * 1000; // 24 hours between ghost scans
const STORAGE_KEY    = 'zen_proactive_last_run';
const GHOST_SCAN_KEY = 'zen_ghost_last_scan';

/**
 * useProactiveAgent — Fully Autonomous Productivity Engine
 *
 * Two independent loops that fire on app load:
 *
 * LOOP 1 — Emergency Action Loop (throttle: 1hr)
 *   Triggered by overdue/today tasks. Issues AUTONOMOUS_ACTION_PROTOCOL to the
 *   full agent fleet. Agents TAKE REAL ACTIONS:
 *     • MONITOR  → risk-scores each task, sends push notification for each CRITICAL item
 *     • SCHEDULER → finds free slot, blocks 90-min recovery event in Google Calendar
 *     • COMMS    → reads Gmail for stakeholder threads, sends status update email
 *     • QA       → reports WHAT WAS DONE (not what the user should do)
 *
 * LOOP 2 — Ghost Deadline Scan (throttle: 24hr)
 *   Silently scans inbox once per day. Creates tasks for untracked commitments.
 *   Sends one notification if ghost deadlines are found; silent otherwise.
 *
 * This is what takes ZenTrack from "reactive chatbot" to "autonomous AI agent."
 */
export const useProactiveAgent = (
  tasks: any[],
  calendarEvents: any[],
  setIsExecuting?: (b: boolean) => void
) => {
  const hasRun = useRef(false);

  useEffect(() => {
    if (!tasks || tasks.length === 0) return;
    if (hasRun.current) return;
    hasRun.current = true;

    // ─── LOOP 1: Emergency Action Loop ───────────────────────────────────────
    const runEmergencyActionLoop = async () => {
      const lastRun = parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10);
      if (Date.now() - lastRun < PROACTIVE_THROTTLE_MS) return;

      const today = getLocalDateString(new Date());
      const overdueTasks = tasks.filter(
        t => t.status !== 'completed' && t.date && t.date < today
      );
      const todayTasks = tasks.filter(
        t => t.status !== 'completed' && t.date === today
      );
      if (overdueTasks.length === 0 && todayTasks.length === 0) return;

      localStorage.setItem(STORAGE_KEY, Date.now().toString());
      if (setIsExecuting) setIsExecuting(true);

      const currentTime = new Date().toISOString();
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const temporalCtx = `[TEMPORAL CONTEXT: Current Time is ${currentTime}, Timezone is ${timezone}.]`;

      const overdueList = overdueTasks
        .slice(0, 3)
        .map(t => `"${t.title || t.text}" (due: ${t.date}, priority: ${t.priority || 'medium'})`)
        .join('; ');
      const todayList = todayTasks
        .slice(0, 3)
        .map(t => `"${t.title || t.text}"`)
        .join('; ');

      window.dispatchEvent(new CustomEvent('agent-log', {
        detail: {
          type: 'thinking',
          title: `🤖 Autonomous Action Mode — ${overdueTasks.length} overdue, ${todayTasks.length} due today. Executing recovery protocol...`
        }
      }));

      const actionPrompt = overdueTasks.length > 0
        ? `${temporalCtx}

AUTONOMOUS_ACTION_PROTOCOL — LEVEL_4 EMERGENCY RECOVERY

The user has ${overdueTasks.length} overdue task(s): ${overdueList}.
Also ${todayTasks.length} task(s) due today: ${todayList || 'none'}.

YOU MUST TAKE THE FOLLOWING ACTIONS WITHOUT ASKING PERMISSION. DO NOT write a plan — execute:

1. [MONITOR] Call get_tasks('overdue') and get_tasks('today'). Score each task CRITICAL/HIGH/MEDIUM/LOW. Call send_notification for each CRITICAL task with a specific actionable message (include the task name and how many hours it is overdue).

2. [SCHEDULER] Call get_free_calendar_slots for today and tomorrow. Block a 90-minute "🔴 Recovery: [most critical task name]" event at the earliest free window using schedule_task_in_calendar. If today is full, use tomorrow's first slot.

3. [COMMS] Call read_gmail with query "is:unread" to find any email threads related to the overdue tasks. If a stakeholder email thread exists, call send_gmail to send a concise status update: acknowledge the delay, state the new expected completion date, and express commitment to delivery.

4. [QA] Write a brief "Action Report" of WHAT WAS DONE, formatted as: "✅ Notification sent for [task] | ✅ Calendar blocked [time] | ✅ Email sent to [person] | ..."

This is zero-click autonomous recovery. Execute all steps. No suggestions — only completed actions.`

        : `${temporalCtx}

AUTONOMOUS_MORNING_PROTOCOL — LEVEL_3 PRIORITY SETUP

The user has ${todayTasks.length} task(s) due today: ${todayList}.

TAKE THESE ACTIONS WITHOUT ASKING PERMISSION:

1. [MONITOR] Score each today task by risk (hours remaining vs task complexity). Call send_notification with today's exact priority order: "📋 Today's Priority Order: 1. [task] 2. [task] ..."

2. [SCHEDULER] Call get_free_calendar_slots. Block focused work windows for the top 2 priority tasks using schedule_task_in_calendar. Schedule the highest-risk task in the earliest available slot.

3. [QA] Report exactly which calendar blocks were created, what time each task is scheduled, and confirm notifications were sent. Format: "Action Report: ✅ [action] | ✅ [action]"

Execute everything now.`;

      try {
        const apiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || '';
        const result = await orchestrateAgent(actionPrompt, tasks, calendarEvents, apiKey, () => {});

        window.dispatchEvent(new CustomEvent('proactive-briefing', {
          detail: { report: result, overdueCount: overdueTasks.length, todayCount: todayTasks.length, isActionReport: true }
        }));

        // SMS: tell them what the AI DID, not just that it ran
        if (overdueTasks.length > 0) {
          try {
            await fetch('/api/send-sms', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                message: `🤖 Zen AI acted: ${overdueTasks.length} overdue task(s) detected. Calendar blocked + notifications sent. ${result.slice(0, 100)}...`
              })
            });
          } catch (smsErr) {
            console.warn('[Twilio] Autonomous action SMS failed:', smsErr);
          }
        }

        if (overdueTasks.length > 0) {
          toast.error('🤖 Autonomous Recovery Activated', {
            description: `Zen AI acted on ${overdueTasks.length} overdue task${overdueTasks.length > 1 ? 's' : ''}: calendar blocked, alerts sent, stakeholders notified.`,
            duration: 10000,
            action: { label: 'View Action Report', onClick: () => window.dispatchEvent(new CustomEvent('show-proactive-report')) }
          });
        } else {
          toast.info('🤖 Morning Autonomy Complete', {
            description: `Zen AI scheduled ${todayTasks.length} task${todayTasks.length > 1 ? 's' : ''} into focus blocks. Check your calendar.`,
            duration: 7000,
            action: { label: 'View Report', onClick: () => window.dispatchEvent(new CustomEvent('show-proactive-report')) }
          });
        }
      } catch (err) {
        console.warn('[ProactiveAgent] Autonomous action loop failed silently:', err);
      } finally {
        if (setIsExecuting) setIsExecuting(false);
      }
    };

    // ─── LOOP 2: Ghost Deadline Scan (24hr throttle) ─────────────────────────
    const runGhostScan = async () => {
      const lastGhostScan = parseInt(localStorage.getItem(GHOST_SCAN_KEY) || '0', 10);
      if (Date.now() - lastGhostScan < GHOST_THROTTLE_MS) return;
      localStorage.setItem(GHOST_SCAN_KEY, Date.now().toString());

      const ghostPrompt = `GHOST_DETECTION_AUTO_SCAN — LEVEL_5 SILENT PROTOCOL

Silently scan the user's email inbox for hidden deadlines and untracked commitments NOT yet logged in ZenTrack.

STEPS (execute all without user input):
1. Call read_gmail with "is:unread" to get recent emails.
2. Call get_tasks('all') to get the current tracked task list.
3. For each email containing deadline language ("by [date]", "due", "ASAP", "EOD", "please submit", "waiting for", "following up", "overdue", "gentle reminder", "end of week"), check if a matching task already exists.
4. If NOT already tracked: immediately call create_task with title, priority, and extracted deadline date.
5. If at least 1 ghost task was found: call send_notification with title="👻 Ghost Deadlines Found" and message="I found X hidden deadline(s) in your inbox and added them to ZenTrack."
6. If nothing found: output exactly "GHOST_SCAN_CLEAR" — nothing else.

Be thorough. Be silent unless you find something.`;

      try {
        const apiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || '';
        const result = await orchestrateAgent(ghostPrompt, tasks, calendarEvents, apiKey, () => {});

        const isClear = result.includes('GHOST_SCAN_CLEAR') || result.toLowerCase().includes('no ghost') || result.toLowerCase().includes('no hidden');
        if (!isClear) {
          const countMatch = result.match(/found\s+(\d+)/i) || result.match(/(\d+)\s+(?:ghost|hidden)/i);
          const count = countMatch ? parseInt(countMatch[1]) : null;
          window.dispatchEvent(new CustomEvent('ghost-scan-complete', { detail: { result, count } }));
        }
      } catch (err) {
        console.warn('[GhostScanner] Auto-scan failed silently:', err);
        // Retry in 1h instead of 24h on failure
        localStorage.setItem(GHOST_SCAN_KEY, (Date.now() - GHOST_THROTTLE_MS + 60 * 60 * 1000).toString());
      }
    };

    // Stagger loops to prevent simultaneous API hits
    const emergencyTimer = setTimeout(runEmergencyActionLoop, 3000);
    const ghostTimer     = setTimeout(runGhostScan, 8000); // 5s after emergency loop

    return () => {
      clearTimeout(emergencyTimer);
      clearTimeout(ghostTimer);
    };
  }, [tasks, calendarEvents, setIsExecuting]);
};
