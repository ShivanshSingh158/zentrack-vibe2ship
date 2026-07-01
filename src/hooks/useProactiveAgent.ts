import { useEffect } from 'react';
import { orchestrateAgent } from '../agent/orchestrator';
import { getLocalDateString } from '../utils/dateUtils';
import { toast } from 'sonner';
import { agentMemoryStore } from '../stores/agentMemoryStore';
import { isSignedInToGoogle } from '../services/googleCalendar';
import { runPatternEngine, formatProfileForAgent, loadBehaviorProfile } from '../services/patternEngine';
import { userLearningStore } from '../services/userLearningStore';
import { detectConflicts, createDebouncedDetector } from '../services/conflictDetector';
import { recordSnoozeIntervention, recordAgentAction } from '../services/agentMemoryPersistence';
// ✅ U7 FIX: Import shared orchestration lock so proactive loops compete correctly
// with user commands from HomeDashboard and ZenAgentPanel.
import { tryAcquireLock, releaseLock } from '../agent/orchestrationLock';
// ✅ U5 FIX: Import shared briefing keys for deduplication
import { BRIEFING_CONTENT_KEY, BRIEFING_GENERATED_AT_KEY, BRIEFING_TTL_MS } from '../components/overlays/DailyBriefingOverlay';


const PROACTIVE_THROTTLE_MS = 60 * 60 * 1000;   // 1 hour between emergency action runs
const GHOST_THROTTLE_MS     = 24 * 60 * 60 * 1000; // 24 hours between ghost scans
const STORAGE_KEY    = 'zen_proactive_last_run';
const GHOST_SCAN_KEY = 'zen_ghost_last_scan';

/**
 * Returns the correct time-of-day session label and emoji based on the user's
 * REAL local clock hour, so notifications and prompts are always accurate.
 *   00-04 → 🌙 Night
 *   05-11 → 🌅 Morning
 *   12-17 → ☀️ Afternoon
 *   18-20 → 🌆 Evening
 *   21-23 → 🌙 Night
 */
function getTimeOfDay(): { label: string; emoji: string; period: 'morning' | 'afternoon' | 'evening' | 'night' } {
  const hour = new Date().getHours();
  if (hour >= 5  && hour < 12) return { label: 'Morning',   emoji: '🌅', period: 'morning'   };
  if (hour >= 12 && hour < 18) return { label: 'Afternoon', emoji: '☀️',  period: 'afternoon' };
  if (hour >= 18 && hour < 21) return { label: 'Evening',   emoji: '🌆', period: 'evening'   };
  return                               { label: 'Night',     emoji: '🌙', period: 'night'     };
}

// ✅ U7 FIX: _isProactiveRunning is KEPT as a guard between proactive loops themselves
// (e.g., prevent ghost scan starting while morning briefing runs).
// The shared orchestrationLock handles competition with USER commands.
// This two-level guard prevents BOTH proactive-vs-proactive AND proactive-vs-user races.
let _isProactiveRunning = false;
// ✅ BUG-C4 FIX: Move hasRun to MODULE scope (not inside the hook as a useRef).
// When hasRun is a useRef, it is tied to the component instance. On every
// globalData reference change (which happens on every Firestore onSnapshot—
// multiple times per task status change), React re-runs the useEffect and
// resets hasRun.current = false in the closure, re-triggering the entire
// emergency loop. Module-scope guarantees a single guard per browser session.
let _proactiveHasRun = false;


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

  // ✅ BUG-C4 FIX: Compute a stable task-IDs hash as the effect dependency.
  // Using the raw `tasks` array or `globalData` object causes the effect to
  // re-fire on every Firestore update (even just status changes), which can
  // reset the proactive loops multiple times per minute.
  // A sorted comma-joined ID string only changes when tasks are ADDED/REMOVED,
  // not when their content changes — preventing timer reset storms.
  const taskIdsHash = tasks.map((t: any) => t.id).sort().join(',');

  useEffect(() => {
    if (!tasks || tasks.length === 0) return;
    // ✅ BUG-C4: Use module-level guard instead of useRef
    if (_proactiveHasRun) return;
    _proactiveHasRun = true;

    // ⚡ STEP 0: Initialize the UserLearningStore IMMEDIATELY (before any agent runs).
    // This loads the behavior profile from localStorage cache (<1ms) and then
    // merges with Firestore in the background. All agent calls after this point
    // will get persona-aware behavioral directives.
    userLearningStore.initialize(globalData).catch(() => {});
    console.log('[LearningStore] Initialized with persona:', userLearningStore.getProfile().userPersona);

    // ─── LOOP 1: Tiered Emergency Action Loop (GAP-2 FIX) ────────────────────
    // Escalation ladder prevents burning L3 quota on low-stakes situations:
    //   L1 — 1 overdue low/medium task   → single ARGUS call (1 LLM)
    //   L2 — high-priority overdue <4h   → ARGUS + CHRONOS (2 LLM calls)
    //   L3 — high-priority overdue ≥4h OR 3+ overdue → full fleet (existing)
    const runEmergencyActionLoop = async () => {
      const lastRun = parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10);
      if (Date.now() - lastRun < PROACTIVE_THROTTLE_MS) return;

      const today = getLocalDateString(new Date());
      const nowMs = Date.now();
      const overdueTasks = tasks.filter(
        (t: any) => t.status !== 'completed' && t.date && t.date < today
      );
      const todayTasks = tasks.filter(
        (t: any) => t.status !== 'completed' && t.date === today
      );
      if (overdueTasks.length === 0 && todayTasks.length === 0) return;

      if (_isProactiveRunning) {
        console.log('[ProactiveAgent] Skipping emergency loop — another proactive run is already active.');
        return;
      }
      // ✅ U7: Try to acquire the global orchestration lock before starting
      if (!tryAcquireLock('proactive')) {
        console.log('[ProactiveAgent] Emergency loop skipped — user command is running.');
        return;
      }
      _isProactiveRunning = true;


      localStorage.setItem(STORAGE_KEY, Date.now().toString());
      if (setIsExecuting) setIsExecuting(true);

      const currentTime = new Date().toISOString();
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const temporalCtx = `[TEMPORAL CONTEXT: Current Time is ${currentTime}, Timezone is ${timezone}.]`;

      // ── Determine escalation tier ─────────────────────────────────────────
      const highPriorityOverdue = overdueTasks.filter((t: any) => t.priority === 'high');
      const mostCriticalOverdue = highPriorityOverdue[0] || overdueTasks[0];
      const hoursOverdue = mostCriticalOverdue?.date
        ? (nowMs - new Date(mostCriticalOverdue.date + 'T23:59:00').getTime()) / 3_600_000
        : 0;

      // L3: high-priority overdue >4h OR 3+ overdue tasks → full 5-agent mission
      const isL3 = (highPriorityOverdue.length > 0 && hoursOverdue > 4) || overdueTasks.length >= 3;
      // L2: high-priority overdue ≤4h OR 1-2 overdue tasks → ARGUS + CHRONOS only
      const isL2 = !isL3 && (highPriorityOverdue.length > 0 || overdueTasks.length >= 1);
      // L1: low/medium priority, 1 overdue task → single ARGUS notification only
      // L0: nothing overdue, only today tasks → handled by morning protocol below

      const tier = isL3 ? 'L3' : isL2 ? 'L2' : 'L1';
      const overdueList = overdueTasks
        .slice(0, 3)
        .map((t: any) => `"${t.title || t.text}" (due: ${t.date}, priority: ${t.priority || 'medium'})`)
        .join('; ');
      const todayList = todayTasks
        .slice(0, 3)
        .map((t: any) => `"${t.title || t.text}"`)
        .join('; ');

      window.dispatchEvent(new CustomEvent('agent-log', {
        detail: {
          type: 'thinking',
          title: `🤖 ${tier} Escalation — ${overdueTasks.length} overdue, ${todayTasks.length} due today. Running ${tier === 'L3' ? 'full fleet' : tier === 'L2' ? 'ARGUS+CHRONOS' : 'ARGUS only'}...`
        }
      }));

      // Only open terminal for L2+ (L1 is background-quiet)
      if (tier !== 'L1') window.dispatchEvent(new Event('agent-terminal-open'));

      // ── Build tier-appropriate prompt ─────────────────────────────────────
      let actionPrompt: string;

      if (overdueTasks.length === 0) {
        // Today tasks only — time-aware protocol
        const tod = getTimeOfDay();
        actionPrompt = `${temporalCtx}

AUTONOMOUS_${tod.label.toUpperCase()}_PROTOCOL — LEVEL_2 PRIORITY SETUP
Current session: ${tod.emoji} ${tod.label} (local time: ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })})

The user has ${todayTasks.length} task(s) due today: ${todayList}.

TAKE THESE ACTIONS WITHOUT ASKING PERMISSION:

1. [ARGUS] Score each today task by risk (hours remaining vs task complexity). Call send_notification with today's exact priority order: "📋 ${tod.emoji} ${tod.label} Priority Order: 1. [task] 2. [task] ..."

2. [CHRONOS] Call get_free_calendar_slots. Block focused work windows for the top 2 priority tasks using schedule_task_in_calendar. Schedule the highest-risk task in the earliest available slot. Respect that it is currently ${tod.period} — don't schedule work in past time slots.

3. [AEGIS] Report exactly which calendar blocks were created, what time each task is scheduled, and confirm notifications were sent. Format: "${tod.emoji} ${tod.label} Action Report: ✅ [action] | ✅ [action]"

Execute everything now.`;

      } else if (tier === 'L1') {
        // L1: lightweight — just an ARGUS notification. Single LLM call, no calendar work.
        actionPrompt = `${temporalCtx}

AUTONOMOUS_NUDGE_PROTOCOL — LEVEL_1 GENTLE REMINDER

The user has ${overdueTasks.length} overdue task(s): ${overdueList}.

SINGLE ACTION: Call send_notification with title="⏰ Overdue Task Reminder" and body="\"${overdueTasks[0]?.title || overdueTasks[0]?.text}\" is overdue since ${overdueTasks[0]?.date}. Tap to open ZenTrack and complete it."

That is the only action required. No calendar blocks, no emails. Just the notification.`;

      } else if (tier === 'L2') {
        // L2: ARGUS risk score + CHRONOS calendar block. No HERMES email.
        actionPrompt = `${temporalCtx}

AUTONOMOUS_ACTION_PROTOCOL — LEVEL_2 PRIORITY RECOVERY

The user has ${overdueTasks.length} overdue task(s): ${overdueList}.

EXECUTE THESE 2 ACTIONS ONLY (no emails, no stakeholder outreach):

1. [ARGUS] Call get_tasks('overdue'). Score each task CRITICAL/HIGH/MEDIUM. Call send_notification for the highest-priority task with: "🚨 [task name] is overdue by ${Math.round(hoursOverdue)}h. Priority: ${mostCriticalOverdue?.priority || 'high'}."

2. [CHRONOS] Call get_free_calendar_slots for today. Block a 90-minute "🔴 Recovery: ${mostCriticalOverdue?.title || mostCriticalOverdue?.text || 'Top task'}" at the earliest free window using schedule_task_in_calendar.

Output: "✅ [what was notified] | ✅ [what was blocked]" — no other text.`;

      } else {
        // L3: Full fleet — existing behavior (ARGUS + CHRONOS + HERMES)
        actionPrompt = `${temporalCtx}

AUTONOMOUS_ACTION_PROTOCOL — LEVEL_3 EMERGENCY RECOVERY

The user has ${overdueTasks.length} overdue task(s): ${overdueList}.
Also ${todayTasks.length} task(s) due today: ${todayList || 'none'}.

YOU MUST TAKE THE FOLLOWING ACTIONS WITHOUT ASKING PERMISSION. DO NOT write a plan — execute:

1. [ARGUS] Call get_tasks('overdue') and get_tasks('today'). Score each task CRITICAL/HIGH/MEDIUM/LOW. Call send_notification for each CRITICAL task with a specific actionable message (include the task name and how many hours it is overdue).

2. [CHRONOS] Call get_free_calendar_slots for today and tomorrow. Block a 90-minute "🔴 Recovery: [most critical task name]" event at the earliest free window using schedule_task_in_calendar. If today is full, use tomorrow's first slot.

3. [AEGIS] Write a brief "Action Report" of WHAT WAS DONE, formatted as: "✅ Notification sent for [task] | ✅ Calendar blocked [time]"

This is zero-click autonomous recovery. Execute all steps. No suggestions — only completed actions.`;
      }

      const abortController = new AbortController();
      const onStop = () => abortController.abort();
      window.addEventListener('agent-stop', onStop);

      try {
        const apiKey = ''; // Keys moved server-side — see api/gemini-proxy.js
        agentMemoryStore.appendMessage({ role: 'user', title: actionPrompt });
        const proactiveOnStep = (step: any) => {
          window.dispatchEvent(new CustomEvent('agent-log', {
            detail: { ...step, isProactive: true, title: step.title ? `[${tier}] ${step.title}` : undefined }
          }));
        };
        const result = await orchestrateAgent(actionPrompt, globalData, apiKey, proactiveOnStep, [], abortController.signal);
        agentMemoryStore.appendMessage({ role: 'agent', title: result });

        window.dispatchEvent(new CustomEvent('proactive-briefing', {
          detail: { report: result, overdueCount: overdueTasks.length, todayCount: todayTasks.length, isActionReport: true, tier }
        }));

        if (overdueTasks.length > 0) {
          const toastFn = tier === 'L3' ? toast.error : tier === 'L2' ? toast.warning : toast.info;
          toastFn(tier === 'L3' ? '🤖 Emergency Recovery Activated' : tier === 'L2' ? '🤖 Priority Recovery Running' : '🤖 Task Reminder Sent', {
            description: tier === 'L3'
              ? `Full fleet acting on ${overdueTasks.length} overdue tasks: calendar blocked, stakeholders notified.`
              : tier === 'L2'
              ? `ARGUS + CHRONOS acting on "${mostCriticalOverdue?.title || mostCriticalOverdue?.text}".`
              : `Nudge sent for "${overdueTasks[0]?.title || overdueTasks[0]?.text}".`,
            duration: tier === 'L3' ? 10000 : 7000,
            action: { label: 'View Report', onClick: () => window.dispatchEvent(new CustomEvent('show-proactive-report', { detail: { report: result } })) }
          });
        } else {
          const tod = getTimeOfDay();
          toast.info(`🤖 ${tod.emoji} ${tod.label} Autonomy Complete`, {
            description: `Zen AI scheduled ${todayTasks.length} task${todayTasks.length > 1 ? 's' : ''} into focus blocks. Check your calendar.`,
            duration: 7000,
            action: { label: 'View Report', onClick: () => window.dispatchEvent(new CustomEvent('show-proactive-report', { detail: { report: result } })) }
          });
        }
      } catch (err) {
        console.warn('[ProactiveAgent] Autonomous action loop failed silently:', err);
      } finally {
        window.removeEventListener('agent-stop', onStop);
        if (setIsExecuting) setIsExecuting(false);
        _isProactiveRunning = false;
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
      const apiKey = ''; // Keys moved server-side — see api/gemini-proxy.js
      // ✅ FIX: Inject already-scanned email IDs into the ghost prompt so SPECTRE skips them
      // Without this, the same unread email gets processed every 24h → duplicate tasks after 7 days
      // ✅ MED-3 FIX: Purge scanned IDs older than 30 days to keep the list lean.
      // Previously entries never expired, bloating the ghost prompt after months of use.
      const GHOST_ID_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
      const now30 = Date.now();
      let scannedEntries: Array<{ id: string; scannedAt: number }> = [];
      try {
        const raw = localStorage.getItem('zen_ghost_scanned_ids') || '[]';
        const parsed = JSON.parse(raw);
        // Support both old format (plain string array) and new format (objects with timestamps)
        scannedEntries = Array.isArray(parsed)
          ? parsed.map((x: any) => typeof x === 'string' ? { id: x, scannedAt: now30 } : x)
          : [];
      } catch { scannedEntries = []; }
      // Purge expired entries
      scannedEntries = scannedEntries.filter(e => now30 - e.scannedAt < GHOST_ID_TTL_MS);
      const scannedIds = scannedEntries.slice(-200).map(e => e.id);
      const scannedNote = scannedIds.length > 0
        ? `\n\nIMPORTANT: The following email message IDs have ALREADY been processed. DO NOT create tasks for these — they are previously scanned:\n${scannedIds.join(', ')}\nFor any NEW tasks you create, also tell me the email message ID in your response prefixed with "EMAIL_ID:".`
        : '';

      agentMemoryStore.appendMessage({ role: 'user', title: ghostPrompt });
      const ghostOnStep = (step: any) => {
        window.dispatchEvent(new CustomEvent('agent-log', {
          detail: { ...step, isProactive: true, title: step.title ? `[GHOST] ${step.title}` : undefined }
        }));
      };
      const result = await orchestrateAgent(ghostPrompt + scannedNote, globalData, apiKey, ghostOnStep, [], abortController.signal);

      // Extract and store any new email IDs that were processed (with timestamp)
      const newIdMatches = result.match(/EMAIL_ID:\s*([\w-]+)/g) || [];
      if (newIdMatches.length > 0) {
        const newIds = newIdMatches.map(m => m.replace('EMAIL_ID:', '').trim());
        const newEntries = newIds.map(id => ({ id, scannedAt: now30 }));
        const existingIds = new Set(scannedEntries.map(e => e.id));
        const merged = [...scannedEntries, ...newEntries.filter(e => !existingIds.has(e.id))];
        localStorage.setItem('zen_ghost_scanned_ids', JSON.stringify(merged));
      }
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

    // ✅ FIX: Add 1-minute lightweight deadline watchdog — fires every minute, zero LLM cost
    // This catches deadlines even if the user has the app open and the proactive throttle is still active.
    let lastWatchdogAlert = 0;
    const watchdog = setInterval(() => {
      const now = Date.now();

      // ── Deadline watchdog ──────────────────────────────────────────────────
      const upcoming = tasks.filter((t: any) => {
        if (t.status === 'completed') return false;
        if (!t.date) return false;
        const hoursUntil = (new Date(t.date + 'T23:59:59').getTime() - now) / 3_600_000;
        return hoursUntil > 0 && hoursUntil <= 2;
      });
      if (upcoming.length > 0 && now - lastWatchdogAlert > 60_000) {
        const task = upcoming[0];
        toast.warning(`⏰ Deadline in under 2 hours!`, {
          description: `"${task.title || task.text}" is due very soon.`,
          duration: 8000,
        });
        lastWatchdogAlert = now;
      }

      // ── Assignment reminder chain watchdog ────────────────────────────────
      // Fires T-1day, T-8h, T-2h push notifications for assignments created via create_assignment.
      try {
        const remindersRaw = localStorage.getItem('zen_assignment_reminders') || '[]';
        const reminders: any[] = JSON.parse(remindersRaw);
        const fired: any[] = [];
        const remaining: any[] = [];
        for (const r of reminders) {
          if (r.fireAt <= now && now - r.fireAt < 5 * 60_000) { // fire if within 5min window
            toast.warning(r.message, { duration: 12000 });
            window.dispatchEvent(new CustomEvent('agent-log', {
              detail: { type: 'thinking', title: `[REMINDER] ${r.message}`, isProactive: true }
            }));
            fired.push(r);
          } else if (r.fireAt > now) {
            remaining.push(r); // keep future reminders
          }
          // expired reminders (fireAt < now - 5min) are silently discarded
        }
        if (fired.length > 0 || fired.length !== reminders.length) {
          localStorage.setItem('zen_assignment_reminders', JSON.stringify(remaining));
        }
      } catch (_) {}

    }, 60_000); // every minute, zero LLM, zero API cost

    // ── Morning Briefing: 7:30am – 9:00am daily ─────────────────────────────
    // ✅ U5 FIX: DailyBriefingOverlay is the PRIMARY authority for briefing generation.
    // runMorningBriefing now checks the shared dedup key first. If DailyBriefingOverlay
    // already generated content today, this function reuses it and skips the LLM call.
    const MORNING_BRIEF_KEY = 'zen_morning_brief_last';
    const runMorningBriefing = async () => {
      if (!isSignedInToGoogle()) return;
      const lastBrief = parseInt(localStorage.getItem(MORNING_BRIEF_KEY) || '0', 10);
      if (Date.now() - lastBrief < 20 * 60 * 60 * 1000) return;
      const hour = new Date().getHours();
      if (hour < 7 || hour >= 9) return;
      if (new Date().getMinutes() < 30 && hour === 7) return;
      if (_isProactiveRunning) return;

      // ✅ U5: Check if DailyBriefingOverlay already generated briefing content today
      const briefingGeneratedAt = parseInt(localStorage.getItem(BRIEFING_GENERATED_AT_KEY) || '0', 10);
      const existingContent = localStorage.getItem(BRIEFING_CONTENT_KEY);
      if (existingContent && Date.now() - briefingGeneratedAt < BRIEFING_TTL_MS) {
        console.log('[MorningBriefing] DailyBriefingOverlay already ran today — reusing cached content, skipping LLM call.');
        localStorage.setItem(MORNING_BRIEF_KEY, Date.now().toString());
        // Emit as proactive-briefing so HomeDashboard can display it if needed
        try {
          const parsed = JSON.parse(existingContent);
          const msg = `☀️ Morning briefing (cached from overlay):

**${parsed.greeting || 'Good morning!'}**

${parsed.message || ''}

_"${parsed.quote || ''}_"`;
          window.dispatchEvent(new CustomEvent('proactive-briefing', { detail: { report: msg, type: 'morning' } }));
        } catch (_) {}
        return;
      }

      // No cached content — generate via orchestrateAgent
      if (!tryAcquireLock('proactive')) return; // ✅ U7
      _isProactiveRunning = true;
      localStorage.setItem(MORNING_BRIEF_KEY, Date.now().toString());
      try {
        const apiKey = ''; // Keys moved server-side — see api/gemini-proxy.js
        const briefPrompt = `MORNING_BRIEFING_PROTOCOL — Generate today's personalized morning briefing.
Call get_tasks('dashboard') to get today's tasks and overdue items.
Call get_day_review to get yesterday's completion score.
Output a clean morning brief:
📅 TODAY'S AGENDA: [top 3 tasks by priority]
📊 YESTERDAY: [Day Score]% completion
⚠️ OVERDUE: [count] items need attention
💡 RECOMMENDATION: [one specific action to start the day]
Keep it under 200 words. Be direct.`;
        const briefOnStep = (step: any) => window.dispatchEvent(new CustomEvent('agent-log', { detail: { ...step, isProactive: true, title: step.title ? `[MORNING] ${step.title}` : undefined } }));
        const result = await orchestrateAgent(briefPrompt, globalData, apiKey, briefOnStep, [], new AbortController().signal);
        toast.info('☀️ Morning Briefing Ready', {
          description: 'Your AI assistant has prepared your daily briefing.',
          duration: 10000,
          action: { label: 'View', onClick: () => window.dispatchEvent(new CustomEvent('show-proactive-report', { detail: { report: result } })) }
        });
        window.dispatchEvent(new CustomEvent('proactive-briefing', { detail: { report: result, type: 'morning' } }));
      } catch (e) { console.warn('[MorningBriefing] Failed:', e); }
      finally { _isProactiveRunning = false; releaseLock('proactive'); } // ✅ U7
    };


    // ── End-of-Day Review: 5:30pm – 7:00pm daily ────────────────────────────
    const EOD_KEY = 'zen_eod_review_last';
    const runEodReview = async () => {
      if (!isSignedInToGoogle()) return;
      const lastEod = parseInt(localStorage.getItem(EOD_KEY) || '0', 10);
      if (Date.now() - lastEod < 20 * 60 * 60 * 1000) return;
      const hour = new Date().getHours();
      if (hour < 17 || hour >= 19) return; // 5pm-7pm window
      if (_isProactiveRunning) return;
      localStorage.setItem(EOD_KEY, Date.now().toString());
      _isProactiveRunning = true;
      try {
        const apiKey = ''; // Keys moved server-side — see api/gemini-proxy.js
        const eodPrompt = `END_OF_DAY_REVIEW_PROTOCOL — Generate today's end-of-day review.
Call get_day_review to get Day Score and completion stats.
Call get_tasks('dashboard') to find tomorrow's priority tasks.
Output a structured EOD review:
[Day Score emoji] DAY SCORE: X% — [one-line assessment]
✅ Completed: X/Y tasks
📅 Meetings: X held
⏭️ Tomorrow's Focus: [top 3 tasks]
💬 One coaching insight based on today's performance.
Keep it under 150 words. Be honest.`;
        const eodOnStep = (step: any) => window.dispatchEvent(new CustomEvent('agent-log', { detail: { ...step, isProactive: true, title: step.title ? `[EOD] ${step.title}` : undefined } }));
        const result = await orchestrateAgent(eodPrompt, globalData, apiKey, eodOnStep, [], new AbortController().signal);
        toast.info('🌙 End-of-Day Review Ready', {
          description: 'Your Day Score is ready. See how you did today.',
          duration: 12000,
          action: { label: 'View Review', onClick: () => window.dispatchEvent(new CustomEvent('show-proactive-report', { detail: { report: result } })) }
        });
        window.dispatchEvent(new CustomEvent('proactive-briefing', {
          detail: { report: result, type: 'emergency' }
        }));
      } catch (e) { console.warn('[EmergencyLoop] Failed:', e); }
      finally {
        _isProactiveRunning = false;
        releaseLock('proactive'); // ✅ U7: release global lock
        if (setIsExecuting) setIsExecuting(false);
      }
    };

    // ── Meeting Prep Brief: 30 min before any calendar event ─────────────────
    const MEETING_PREP_KEY = 'zen_meeting_prep_fired';
    const runMeetingPrepCheck = async () => {
      if (!isSignedInToGoogle()) return;
      if (_isProactiveRunning) return;
      const events: any[] = globalData?.calendarEvents || [];
      if (!events.length) return;
      const now = Date.now();
      const firedIds: string[] = JSON.parse(localStorage.getItem(MEETING_PREP_KEY) || '[]');
      // Find events starting in 25-35 minutes (30min window ± 5min)
      const upcoming = events.filter((e: any) => {
        if (!e.startDateTime && !e.start) return false;
        const startMs = new Date(e.startDateTime || e.start).getTime();
        const minsUntil = (startMs - now) / 60_000;
        const eventId = e.id || e.eventId || e.summary;
        return minsUntil >= 25 && minsUntil <= 35 && !firedIds.includes(eventId);
      });
      if (!upcoming.length) return;
      const nextEvent = upcoming[0];
      const eventId = nextEvent.id || nextEvent.eventId || nextEvent.summary;
      // Mark as fired immediately (prevent double-trigger within the 10min window)
      const updatedFired = [...firedIds.slice(-50), eventId];
      localStorage.setItem(MEETING_PREP_KEY, JSON.stringify(updatedFired));
      _isProactiveRunning = true;
      try {
        const apiKey = ''; // Keys moved server-side — see api/gemini-proxy.js
        const prepPrompt = `MEETING_PREP_PROTOCOL — Meeting "${nextEvent.summary || 'Upcoming Meeting'}" starts in 30 minutes.
Call get_meeting_prep_brief with eventTitle="${nextEvent.summary}" to surface attendees and open items.
Call get_email_thread for the primary attendee if known (use query="from:[attendee email]").
Write a concise Meeting Prep Brief:
📋 MEETING: "${nextEvent.summary}"
👥 ATTENDEES: [list]
📌 OPEN ITEMS: [any tasks tagged to attendees]
📧 RECENT CONTEXT: [key points from email thread]
💡 SUGGESTED AGENDA: [2-3 bullet points]
Keep it under 200 words.`;
        const prepOnStep = (step: any) => window.dispatchEvent(new CustomEvent('agent-log', { detail: { ...step, isProactive: true, title: step.title ? `[MEETING PREP] ${step.title}` : undefined } }));
        const result = await orchestrateAgent(prepPrompt, globalData, apiKey, prepOnStep, [], new AbortController().signal);
        toast.info(`📋 Meeting Prep: "${nextEvent.summary}"`, {
          description: 'Your AI has prepared a brief for your upcoming meeting.',
          duration: 15000,
          action: { label: 'View Brief', onClick: () => window.dispatchEvent(new CustomEvent('show-proactive-report', { detail: { report: result, type: 'meeting-prep' } })) }
        });
      } catch (e) { console.warn('[MeetingPrep] Failed:', e); }
      finally { _isProactiveRunning = false; }
    };

    // ✅ FIX: Emergency loop only fires if Google is connected (prevents spurious auth failures)
    const runWithGoogleGuard = async () => {
      if (!isSignedInToGoogle()) {
        console.log('[ProactiveAgent] Skipping Google orchestration — not connected to Google.');
        // Still run watchdog for local-only deadline alerts
        return;
      }
      await runEmergencyActionLoop();
    };

    // ── GAP-5: Snooze Intervention — detect repeated avoidance ─────────────────
    // When snoozeCount >= 3, the user is avoiding the task. The agent intervenes
    // with 3 concrete resolution options instead of just re-scheduling.
    const SNOOZE_INTERVENTION_KEY = 'zen_snooze_intervention_fired';
    const runSnoozeInterventionCheck = () => {
      const firedIds: string[] = JSON.parse(localStorage.getItem(SNOOZE_INTERVENTION_KEY) || '[]');
      const highSnoozeTasks = tasks.filter(
        (t: any) => (t.snoozeCount || 0) >= 3 && t.status !== 'completed' && !firedIds.includes(t.id)
      );
      if (highSnoozeTasks.length === 0) return;
      const task = highSnoozeTasks[0]; // one at a time to avoid alert spam
      // Record to memory so the agent doesn't re-trigger
      recordSnoozeIntervention(task.title || task.text, task.snoozeCount || 3);
      // Mark as fired so we don't re-show
      const updatedFired = [...firedIds.slice(-20), task.id];
      localStorage.setItem(SNOOZE_INTERVENTION_KEY, JSON.stringify(updatedFired));
      // Fire UI intervention event
      window.dispatchEvent(new CustomEvent('zen-snooze-intervention', {
        detail: {
          taskId: task.id,
          taskTitle: task.title || task.text,
          snoozeCount: task.snoozeCount || 3,
          options: [
            { id: 'breakdown', label: '🔨 Break it into 3 smaller subtasks', action: 'break_into_subtasks' },
            { id: 'extension', label: '📧 Email supervisor/stakeholder for extension', action: 'draft_extension_email' },
            { id: 'delete',    label: '🗑️ This task is no longer relevant — delete it', action: 'delete_task' },
          ]
        }
      }));
      // Also show a toast so the user notices even if not looking at the dashboard
      toast.warning(`🔄 You've snoozed "${task.title || task.text}" ${task.snoozeCount}x`, {
        description: 'Your AI detected a procrastination loop. Choose a resolution.',
        duration: 15000,
        action: { label: 'Resolve', onClick: () => window.dispatchEvent(new CustomEvent('show-snooze-intervention', { detail: { taskId: task.id } })) }
      });
    };

    // ── GAP-6: ConflictDetector — cross-module intelligence ────────────────────
    // Runs every 30s (debounced), detects conflicts across tasks+calendar+habits+gym+attendance.
    // Zero LLM cost. Dispatches window events to dashboard conflict card.
    const onConflictsDetected = (conflicts: any[]) => {
      window.dispatchEvent(new CustomEvent('conflicts-detected', { detail: { conflicts } }));
      // Surface most critical conflict as a toast
      const critical = conflicts.find(c => c.severity === 'critical');
      const warning  = conflicts.find(c => c.severity === 'warning');
      const notable  = critical || warning;
      if (notable) {
        const toastFn = critical ? toast.error : toast.warning;
        toastFn(notable.title, {
          description: notable.suggestion,
          duration: 12000,
          action: notable.autoFixable
            ? { label: 'Auto-fix', onClick: () => window.dispatchEvent(new CustomEvent('conflict-auto-fix', { detail: { conflict: notable } })) }
            : { label: 'View', onClick: () => window.dispatchEvent(new CustomEvent('show-conflicts')) }
        });
      }
    };
    // Run immediately then debounce on subsequent calls
    const conflictDetectorFn = createDebouncedDetector(onConflictsDetected, 30_000);
    conflictDetectorFn(globalData); // first run on mount

    // ── GAP-4: PatternEngine — weekly behavioral learning ───────────────────────
    // Derives peak hours, completion ratio, low-activity days from real data.
    // Stored in Firestore user_profiles/{userId}. Read by CHRONOS + ARGUS.
    const PATTERN_ENGINE_KEY = 'zen_pattern_engine_last';
    const runPatternEngineIfDue = async () => {
      const lastRun = parseInt(localStorage.getItem(PATTERN_ENGINE_KEY) || '0', 10);
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      if (Date.now() - lastRun < sevenDays) return; // weekly cadence
      localStorage.setItem(PATTERN_ENGINE_KEY, Date.now().toString());
      try {
        const profileContext = await runPatternEngine(globalData);
        // Re-initialize learning store with the freshly derived profile so
        // agents in this session immediately use the updated behavioral data.
        await userLearningStore.initialize(globalData);
        recordAgentAction('PatternEngine ran: behavioral profile updated');
        // Dispatch for CHRONOS/ARGUS to pick up via window context
        window.dispatchEvent(new CustomEvent('behavior-profile-updated', { detail: { context: profileContext } }));
        console.log('[PatternEngine] Weekly profile update complete. Persona:', userLearningStore.getProfile().userPersona);
      } catch (e) {
        console.warn('[PatternEngine] Weekly run failed (non-blocking):', e);
      }
    };

    // ╀─ Stagger loops to prevent simultaneous API hits ────────────────────────────────────────────────────────
    // Emergency loop: fires 3s after app load.
    // Ghost scan: fires 90s after load — well after emergency loop completes.
    // Morning/EOD/Meeting-prep: checked every 5 minutes via a lightweight clock.
    const emergencyTimer = setTimeout(runWithGoogleGuard, 3000);
    const ghostTimer     = setTimeout(runGhostScan, 90_000);
    // ✅ BUG-H4 FIX: Run all three time-triggered loops concurrently with Promise.allSettled.
    // Previously they were awaited sequentially: if runMorningBriefing() hung due to a rate
    // limit or network error, runEodReview and runMeetingPrepCheck never ran that tick.
    // Promise.allSettled guarantees all three are attempted independently every 5 minutes.
    const proactiveClock = setInterval(() => {
      Promise.allSettled([
        runMorningBriefing().catch(() => {}),
        runEodReview().catch(() => {}),
        runMeetingPrepCheck().catch(() => {}),
      ]);
    }, 5 * 60_000);
    // Also run once immediately in case app opens during the time window
    setTimeout(() => {
      Promise.allSettled([
        runMorningBriefing().catch(() => {}),
        runEodReview().catch(() => {}),
        runMeetingPrepCheck().catch(() => {}),
      ]);
    }, 10_000);

    // GAP-4: Pattern engine — run after 5s delay (non-blocking, low priority)
    setTimeout(() => { runPatternEngineIfDue().catch(() => {}); }, 5_000);
    // GAP-5: Snooze intervention — run 15s after mount (let tasks load first)
    setTimeout(() => { runSnoozeInterventionCheck(); }, 15_000);

    return () => {
      clearTimeout(emergencyTimer);
      clearTimeout(ghostTimer);
      clearInterval(watchdog);
      clearInterval(proactiveClock);
      // Flush any pending learning store writes on unmount (page close / nav)
      userLearningStore.flush().catch(() => {});
    };
  // ✅ BUG-C4: Use taskIdsHash (stable string) instead of globalData/tasks (live object refs).
  // This ensures the effect only re-fires when tasks are structurally added/removed,
  // NOT on every Firestore status update (which was causing multiple timer resets per minute).
  }, [taskIdsHash]); // eslint-disable-line react-hooks/exhaustive-deps
};
