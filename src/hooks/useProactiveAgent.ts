import { useEffect, useRef } from 'react';
import { orchestrateAgent } from '../agent/orchestrator';
import { getLocalDateString } from '../utils/dateUtils';
import { toast } from 'sonner';
import { agentMemoryStore } from '../stores/agentMemoryStore';

const PROACTIVE_THROTTLE_MS = 60 * 60 * 1000;   // 1 hour between emergency action runs
const GHOST_THROTTLE_MS     = 24 * 60 * 60 * 1000; // 24 hours between ghost scans
const STORAGE_KEY    = 'zen_proactive_last_run';
const GHOST_SCAN_KEY = 'zen_ghost_last_scan';

// ── Global guard: prevents simultaneous orchestrations ──────────────────────────────
// Both the emergency loop and ghost scan spawn full orchestrations (3-5 agents each).
// If both run simultaneously on page load, we get a 6-10 agent burst that exhausts
// all 8 API keys at once. This flag ensures only ONE loop runs at a time.
let _isProactiveRunning = false;

/**
 * useProactiveAgent — Fully Autonomous Productivity Engine
 *
 * Two independent loops that fire on app load:
 *
 * LOOP 1 — Emergency Action Loop (throttle: 1hr)
 *   Triggered by overdue/today tasks. Issues AUTONOMOUS_ACTION_PROTOCOL to the
 *   full agent fleet. Agents TAKE REAL ACTIONS:
 *     • ARGUS  → risk-scores each task, sends push notification for each CRITICAL item
 *     • CHRONOS → finds free slot, blocks 90-min recovery event in Google Calendar
 *     • HERMES    → reads Gmail for stakeholder threads, sends status update email
 *     • AEGIS       → reports WHAT WAS DONE (not what the user should do)
 *
 * LOOP 2 — Ghost Deadline Scan (throttle: 24hr)
 *   Silently scans inbox once per day. Creates tasks for untracked commitments.
 *   Sends one notification if ghost deadlines are found; silent otherwise.
 *
 * This is what takes ZenTrack from "reactive chatbot" to "autonomous AI agent."
 */
export const useProactiveAgent = (
  globalData: any,
  setIsExecuting?: (b: boolean) => void
) => {
  const { tasks = [] } = globalData || {};
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

      // ✅ GUARD: Do not start if another proactive loop is already running.
      // This prevents the thundering-herd burst caused by emergency + ghost scan
      // both spawning full orchestrations simultaneously on page load.
      if (_isProactiveRunning) {
        console.log('[ProactiveAgent] Skipping emergency loop — another proactive run is already active.');
        return;
      }
      _isProactiveRunning = true;

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
      
      // Auto-open terminal so the user sees the autonomous background work
      window.dispatchEvent(new Event('agent-terminal-open'));

      const actionPrompt = overdueTasks.length > 0
        ? `${temporalCtx}

AUTONOMOUS_ACTION_PROTOCOL — LEVEL_4 EMERGENCY RECOVERY

The user has ${overdueTasks.length} overdue task(s): ${overdueList}.
Also ${todayTasks.length} task(s) due today: ${todayList || 'none'}.

YOU MUST TAKE THE FOLLOWING ACTIONS WITHOUT ASKING PERMISSION. DO NOT write a plan — execute:

1. [ARGUS] Call get_tasks('overdue') and get_tasks('today'). Score each task CRITICAL/HIGH/MEDIUM/LOW. Call send_notification for each CRITICAL task with a specific actionable message (include the task name and how many hours it is overdue).

2. [CHRONOS] Call get_free_calendar_slots for today and tomorrow. Block a 90-minute "🔴 Recovery: [most critical task name]" event at the earliest free window using schedule_task_in_calendar. If today is full, use tomorrow's first slot.

3. [HERMES] Call read_gmail with query "is:unread" to find any email threads related to the overdue tasks. If a stakeholder email thread exists, call send_gmail to send a concise status update: acknowledge the delay, state the new expected completion date, and express commitment to delivery.

4. [AEGIS] Write a brief "Action Report" of WHAT WAS DONE, formatted as: "✅ Notification sent for [task] | ✅ Calendar blocked [time] | ✅ Email sent to [person] | ..."

This is zero-click autonomous recovery. Execute all steps. No suggestions — only completed actions.`

        : `${temporalCtx}

AUTONOMOUS_MORNING_PROTOCOL — LEVEL_3 PRIORITY SETUP

The user has ${todayTasks.length} task(s) due today: ${todayList}.

TAKE THESE ACTIONS WITHOUT ASKING PERMISSION:

1. [ARGUS] Score each today task by risk (hours remaining vs task complexity). Call send_notification with today's exact priority order: "📋 Today's Priority Order: 1. [task] 2. [task] ..."

2. [CHRONOS] Call get_free_calendar_slots. Block focused work windows for the top 2 priority tasks using schedule_task_in_calendar. Schedule the highest-risk task in the earliest available slot.

3. [AEGIS] Report exactly which calendar blocks were created, what time each task is scheduled, and confirm notifications were sent. Format: "Action Report: ✅ [action] | ✅ [action]"

Execute everything now.`;

      const abortController = new AbortController();
      const onStop = () => abortController.abort();
      window.addEventListener('agent-stop', onStop);

      try {
        const apiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || '';
        agentMemoryStore.appendMessage({ role: 'user', title: actionPrompt });
        const result = await orchestrateAgent(actionPrompt, globalData, apiKey, () => {}, [], abortController.signal);
        agentMemoryStore.appendMessage({ role: 'agent', title: result });

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
        window.removeEventListener('agent-stop', onStop);
        if (setIsExecuting) setIsExecuting(false);
        _isProactiveRunning = false; // ✅ Always release the guard
      }
    };

    // ─── LOOP 2: Ghost Deadline Scan (24hr throttle) ─────────────────────────
    const runGhostScan = async () => {
      const lastGhostScan = parseInt(localStorage.getItem(GHOST_SCAN_KEY) || '0', 10);
      if (Date.now() - lastGhostScan < GHOST_THROTTLE_MS) return;

      // ✅ GUARD: Do not start ghost scan if emergency loop is running.
      // Ghost scan spawns a full orchestration (SPECTRE agent + AEGIS),
      // which would compete with the emergency loop for the same API keys.
      if (_isProactiveRunning) {
        console.log('[GhostScanner] Skipping ghost scan — emergency loop is still active.');
        // Retry in 2 minutes instead of wasting the 24h window
        localStorage.setItem(GHOST_SCAN_KEY, (Date.now() - GHOST_THROTTLE_MS + 2 * 60 * 1000).toString());
        return;
      }
      _isProactiveRunning = true;

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

      const abortController = new AbortController();
      const onStop = () => abortController.abort();
      window.addEventListener('agent-stop', onStop);

      try {
        const apiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || '';
        agentMemoryStore.appendMessage({ role: 'user', title: ghostPrompt });
        const result = await orchestrateAgent(ghostPrompt, globalData, apiKey, () => {}, [], abortController.signal);
        agentMemoryStore.appendMessage({ role: 'agent', title: result });

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
      } finally {
        window.removeEventListener('agent-stop', onStop);
        _isProactiveRunning = false; // ✅ Always release the guard
      }
    };

    // ── Stagger loops to prevent simultaneous API hits ──────────────────────────────
    // Emergency loop: fires 3s after app load.
    // Ghost scan: fires 90s after load — well after emergency loop completes.
    // This prevents the 6-10 agent thundering herd on page load that was
    // previously caused by both loops starting within 5s of each other.
    const emergencyTimer = setTimeout(runEmergencyActionLoop, 3000);
    const ghostTimer     = setTimeout(runGhostScan, 90_000); // 90s after emergency loop

    return () => {
      clearTimeout(emergencyTimer);
      clearTimeout(ghostTimer);
    };
  }, [globalData, tasks, setIsExecuting]);
};
