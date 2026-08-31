/**
 * orchestrator.ts — ZenTrack Mobile AI Orchestrator — SARA Engine v2
 *
 * Architecture (Direct Gemini — no backend server required):
 *   Mobile → callProxy() → generativelanguage.googleapis.com (direct, 9-key rotation)
 *
 * SARA Engine v2 Capabilities Wired Here:
 *   Cap 1 — CMG: buildMemorySummary() injected into every system prompt
 *   Cap 2 — IRCI: classifyIntent() + buildSelectiveContext() replaces full data dump
 *   Cap 4 — Reasoning Transparency: richer onStep calls with reasoning_step type
 *   Cap 6 — Voice Mode: isVoiceMode flag for sentence-level TTS streaming
 *   Cap 7 — BFE: getSaraToneDirective() injected into persona section
 *
 * Response pattern: [[ACTION:{...}]] JSON blocks for write operations.
 * The UI extracts these, shows a confirmation card, and writes to Firestore on confirm.
 *
 * Navigation: [NAVIGATE:ScreenName] appended to SPOKEN_SUMMARY for screen transitions.
 */

import { callProxy, streamProxy, parseProxyResponse } from '../services/geminiProxy';
import { parseActionFromText } from './saraAgent';
import { auth } from '../services/firebase';
import {
  buildMemorySummary,
  getFingerprint,
  getSaraToneDirective,
  getSaraResponseStyle,
  extractAndStore,
  updateFingerprint,
} from '../services/saraMemory';
import {
  classifyIntent,
  buildSelectiveContext,
  domainToReasoningLabel,
  AppContext, // import from intentClassifier to avoid circular deps
} from './intentClassifier';

// Re-export AppContext for backward compatibility with SaraScreen and other callers
export type { AppContext };

// ─── Context builders (compact — keep payload small) ─────────────────────────

function summarizeTasks(tasks: any[] = []) {
  return tasks.slice(0, 40).map(t => ({
    id: t.id, title: t.title, status: t.status,
    priority: t.priority, date: t.date, timeSlot: t.timeSlot,
  }));
}

function summarizeHabits(habits: any[] = [], logs: any[] = []) {
  const today = new Date().toISOString().split('T')[0];
  return habits.slice(0, 20).map(h => ({
    id: h.id, name: h.name, streak: h.streak,
    doneToday: logs.some(l => l.habitId === h.id && l.date === today),
  }));
}

function summarizeAttendance(subjects: any[] = []) {
  return subjects.slice(0, 15).map(s => ({
    id: s.id, name: s.name,
    attended: s.classesAttended, total: s.classesTotal,
    pct: s.classesTotal > 0 ? Math.round((s.classesAttended / s.classesTotal) * 100) : 0,
  }));
}

// ─── Full System Prompt Builder (fallback for complex queries) ────────────────

// FIX (Risk 3): _promptCache is a module-level variable that persists across user
// sessions in the same app process. Without a UID guard, User A's task/habit/gym
// summaries could leak into User B's first SARA query on a shared device.
// Fix: (1) embed userId in the cache entry, (2) export clearOrchestratorCache() to
// be called from performSignOut(), so cache is explicitly wiped on every logout.
let _promptCache: { prompt: string; hash: string; builtAt: number; userId: string } | null = null;

/**
 * Clears the orchestrator's in-memory prompt cache.
 * MUST be called on user sign-out to prevent cross-user data bleed.
 */
export function clearOrchestratorCache(): void {
  _promptCache = null;
}

function _buildPromptFingerprint(ctx: AppContext): string {
  return [
    (ctx.tasks || []).length,
    (ctx.habits || []).length,
    (ctx.habitLogs || []).length,
    (ctx.gymLogs || []).length,
    (ctx.attendance || []).length,
    (ctx.assignments || []).length,
    new Date().toISOString().slice(0, 10)
  ].join('|');
}

function buildSystemPrompt(
  ctx: AppContext,
  toneDirective: string,
  responseStyle: string,
  memorySummary: string,
  personaContext: string = '',
  history: { role: string; text?: string; content?: string }[] = []
): string {
  // O6 FIX: Cache the system prompt with a 30-second TTL based on data fingerprint
  // to avoid serializing 500+ tasks/logs on every chat message.
  // Note: session awareness and proactive scan are NOT cached (they're dynamic per-turn).
  const currentUserId = auth.currentUser?.uid || '';
  const hash = _buildPromptFingerprint(ctx) + '|' + (memorySummary?.length || 0);
  let basePrompt: string;

  if (
    _promptCache &&
    _promptCache.hash === hash &&
    _promptCache.userId === currentUserId &&
    Date.now() - _promptCache.builtAt < 30000
  ) {
    basePrompt = _promptCache.prompt;
  } else {
    const now = new Date();
    const todayISO = now.toISOString().split('T')[0];
    const tomorrowISO = new Date(now.getTime() + 86_400_000).toISOString().split('T')[0];

    const tasksSummary = summarizeTasks(ctx.tasks);
    const habitsSummary = summarizeHabits(ctx.habits, ctx.habitLogs);
    const attendanceSummary = summarizeAttendance(ctx.attendance);
    const pendingTasks = tasksSummary.filter(t => t.status !== 'completed');
    const completedToday = (ctx.tasks || [])
      .filter(t => t.status === 'completed' && t.completedAt?.startsWith?.(todayISO))
      .map(t => ({ id: t.id, title: t.title }));
    const upcomingEvents = (ctx.customEvents || [])
      .filter(e => e.date >= todayISO).slice(0, 10)
      .map(e => ({ title: e.title, date: e.date, type: e.type, time: e.startTime }));
    const recentNotes = (ctx.notes || []).slice(0, 8)
      .map(n => ({ id: n.id, title: n.title, preview: n.content?.slice(0, 100) }));
    const activeGoals = (ctx.goals || [])
      .filter((g: any) => g.status === 'active').slice(0, 8)
      .map((g: any) => ({ id: g.id, title: g.title, progress: g.progress }));
    const pendingAssignments = (ctx.assignments || [])
      .filter((a: any) => a.status !== 'submitted' && a.status !== 'graded').slice(0, 10)
      .map((a: any) => ({ id: a.id, title: a.title, subject: a.subjectName, due: a.dueDate }));
    const learningTopics = (ctx.learningTopics || []).slice(0, 8)
      .map((t: any) => ({ id: t.id, title: t.title, tasks: t.subTasks?.length }));
    const recentJobs = (ctx.jobs || []).slice(0, 8)
      .map((j: any) => ({ company: j.company, role: j.role, status: j.status }));
    const todayWater = (ctx.waterLogs || [])
      .filter((w: any) => w.date === todayISO).reduce((s: number, w: any) => s + (w.amountMl || 0), 0);
    const lastSleep = (ctx.sleepLogs || []).slice(-1)[0];

    basePrompt = `You are Sara — a high-signal, zero-fluff AI advisor built into ZenTrack. You think like a first-principles operator, not a wellness app. You call things out directly, respect the user's intelligence, and never waste their time with filler or false reassurance. Your job is clarity and execution, not validation.

${toneDirective}
${responseStyle}

TODAY: ${((d) => { const days=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"]; const mos=["January","February","March","April","May","June","July","August","September","October","November","December"]; return days[d.getDay()] + ", " + String(d.getDate()).padStart(2,"0") + " " + mos[d.getMonth()] + " " + d.getFullYear(); })(now)}
TIME: ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
TOMORROW: ${tomorrowISO}

${memorySummary ? `\n${memorySummary}\n` : ''}

${personaContext ? `\n${personaContext}\n` : ''}

═══ FULL APP CONTEXT ═══

📋 TASKS (${pendingTasks.length} pending, ${completedToday.length} done today):
PENDING: ${JSON.stringify(pendingTasks.slice(0, 20))}
DONE TODAY: ${JSON.stringify(completedToday.slice(0, 10))}

✅ HABITS (${habitsSummary.length} tracked):
${JSON.stringify(habitsSummary)}

📅 UPCOMING EVENTS (${upcomingEvents.length}):
${JSON.stringify(upcomingEvents)}

📝 RECENT NOTES:
${JSON.stringify(recentNotes)}

🎯 ACTIVE GOALS:
${JSON.stringify(activeGoals)}

📚 ATTENDANCE:
${JSON.stringify(attendanceSummary)}

📌 PENDING ASSIGNMENTS:
${JSON.stringify(pendingAssignments)}

🧠 LEARNING TOPICS:
${JSON.stringify(learningTopics)}

💼 RECENT JOBS:
${JSON.stringify(recentJobs)}

💧 Water today: ${todayWater}ml | 😴 Last sleep: ${lastSleep ? `${lastSleep.hours}h on ${lastSleep.date}` : 'no data'}

${ctx.notifSettingsSummary ? `${ctx.notifSettingsSummary}\n` : ''}
${buildActionRules(tomorrowISO, todayISO)}`;

    _promptCache = { prompt: basePrompt, hash, builtAt: Date.now(), userId: currentUserId };
  }

  // Session awareness and proactive scan are ALWAYS freshly computed (not cached)
  const sessionBlock = buildSessionAwareness(history);
  const now2 = new Date();
  const tomorrowISO2 = new Date(now2.getTime() + 86_400_000).toISOString().split('T')[0];
  const proactiveScan = buildProactiveScan(ctx);

  const dynamicSuffix = [
    sessionBlock ? `\n${sessionBlock}` : '',
    proactiveScan ? `\n${proactiveScan}` : '',
  ].filter(Boolean).join('\n');

  return dynamicSuffix ? basePrompt.replace(buildActionRules(tomorrowISO2, _buildTodayISO()), `\n${dynamicSuffix}\n${buildActionRules(tomorrowISO2, _buildTodayISO())}`) : basePrompt;
}

function _buildTodayISO(): string {
  return new Date().toISOString().split('T')[0];
}

// ─── Selective System Prompt Builder (IRCI — Capability 2) ───────────────────

function buildSelectiveSystemPrompt(
  ctx: AppContext,
  selectiveContext: string,
  toneDirective: string,
  responseStyle: string,
  memorySummary: string,
  personaContext: string = '',
  history: { role: string; text?: string; content?: string }[] = []
): string {
  const now = new Date();
  const todayISO = now.toISOString().split('T')[0];
  const tomorrowISO = new Date(now.getTime() + 86_400_000).toISOString().split('T')[0];

  const sessionBlock = buildSessionAwareness(history);
  const proactiveScan = buildProactiveScan(ctx);

  return `You are Sara — a high-signal, zero-fluff AI advisor built into ZenTrack. You think like a first-principles operator, not a wellness app.

${toneDirective}
${responseStyle}

TODAY: ${((d) => { const days=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"]; const mos=["January","February","March","April","May","June","July","August","September","October","November","December"]; return days[d.getDay()] + ", " + String(d.getDate()).padStart(2,"0") + " " + mos[d.getMonth()] + " " + d.getFullYear(); })(now)}
TIME: ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
TOMORROW: ${tomorrowISO}

${memorySummary ? `\n${memorySummary}\n` : ''}

${personaContext ? `\n${personaContext}\n` : ''}

${sessionBlock ? `\n${sessionBlock}\n` : ''}

${proactiveScan ? `\n${proactiveScan}\n` : ''}

═══ RELEVANT APP CONTEXT (IRCI-filtered) ═══
${selectiveContext}

${ctx.notifSettingsSummary ? `\n${ctx.notifSettingsSummary}\n` : ''}
${buildActionRules(tomorrowISO, todayISO)}`;
}

function buildActionRules(tomorrowISO: string, todayISO: string): string {
  const day2ISO = new Date(new Date(tomorrowISO).getTime() + 86_400_000).toISOString().split('T')[0];
  const day3ISO = new Date(new Date(tomorrowISO).getTime() + 2 * 86_400_000).toISOString().split('T')[0];
  const day4ISO = new Date(new Date(tomorrowISO).getTime() + 3 * 86_400_000).toISOString().split('T')[0];

  return `═══ RESPONSE RULES ═══

1. FULL READ ACCESS. NEVER say "I can't access your data". Read from context above.

2. SINGLE ACTION (use ONLY when request is for exactly 1 item):
   Embed ONE action block in your text: [[ACTION:{"type":"...","field":"value"}]]

3. ⚡ BULK / MULTI ACTION — CRITICAL RULE:
   If the user's message contains ANY of these signals → you MUST use DAG (NEVER chain single ACTIONs):
   • 2 or more items, names, or subjects mentioned
   • A number word ("five tasks", "3 events", "two habits")
   • Multiple dates or time slots in the same request
   • Words like "each", "every", "all of them", "these", "both", "for the week"
   • A list separated by commas, "and", or line breaks
   • Searching the web AND doing something with the result

   BULK EXAMPLES — these ALL require DAG:
   ✗ WRONG (will fail): [[ACTION:...]] for each item one by one
   ✓ RIGHT: [[DAG:[{"id":"1","type":"create_task","title":"Task A","dueDate":"${tomorrowISO}"},{"id":"2","type":"create_task","title":"Task B","dueDate":"${day2ISO}"},{"id":"3","type":"create_task","title":"Task C","dueDate":"${day3ISO}"}]]]

   "Create 5 tasks for 5 different days" → DAG with 5 create_task nodes (parallel, no dependsOn)
   "Schedule 3 study sessions next week" → DAG with 3 add_calendar_event nodes
   "Log all my morning habits" → DAG with one log_habit node per habit
   "Add math, physics, and chemistry as subjects" → DAG with 3 create_subject nodes
   "Mark me present for all today's classes" → DAG with one mark_attendance node per subject
   "Create tasks for gym, study, and revision" → DAG with 3 create_task nodes
   "Add 5 tasks: [Task A for Monday], [Task B for Tuesday], ..." → DAG with 5 parallel nodes

4. DAG FORMAT (for multi-step and bulk operations):
   [[DAG:[{"id":"1","type":"create_task","title":"...","dueDate":"YYYY-MM-DD","dueTime":"HH:MM","priority":"medium"},{"id":"2","type":"create_task","title":"...","dueDate":"YYYY-MM-DD"}]]]
   Parallel nodes: omit "dependsOn". Sequential: add "dependsOn":["prevId"].
   You can run up to 8 nodes total in one DAG (4 truly parallel).

5. After text, append [SUGGEST: action 1 | action 2] with 2 relevant follow-ups.

6. For navigation requests, append [NAVIGATE:ScreenName]. Screens: Gym, Tasks, Habits, Calendar, Goals, Notes, Analytics, Attendance, Focus, Settings.

7. Tone: blunt, honest, zero sugarcoating. One sharp sentence beats three soft ones. Occasionally flip the question back at them.

═══ DATE RULES ═══
"tomorrow" = ${tomorrowISO} | "morning" = 09:00 | "noon" = 12:00 | "afternoon" = 15:00 | "evening" = 18:00 | "night" = 21:00
Always use YYYY-MM-DD for dates, HH:MM for times.
Day sequence from today: today=${todayISO}, tomorrow=${tomorrowISO}, day3=${day2ISO}, day4=${day3ISO}, day5=${day4ISO}

═══ SINGLE ACTION TYPES (one item only) ═══
CREATE TASK:    [[ACTION:{"type":"createTask","title":"...","dueDate":"${tomorrowISO}","dueTime":"18:00","priority":"medium"}]]
DELETE TASK:    [[ACTION:{"type":"deleteTask","taskId":"ID","taskTitle":"..."}]]
COMPLETE TASK:  [[ACTION:{"type":"completeTask","taskId":"ID","taskTitle":"..."}]]
UPDATE TASK:    [[ACTION:{"type":"updateTask","taskId":"ID","taskTitle":"...","newDate":"YYYY-MM-DD"}]]
CREATE NOTE:    [[ACTION:{"type":"createNote","title":"...","content":"..."}]]
LOG HABIT:      [[ACTION:{"type":"logHabit","habitId":"ID","habitName":"..."}]]
MARK ATTEND.:   [[ACTION:{"type":"markAttendance","subjectId":"ID","subjectName":"...","status":"present","date":"${todayISO}"}]]
ADD EVENT:      [[ACTION:{"type":"addCalendarEvent","title":"...","date":"${tomorrowISO}","startTime":"14:00","type":"todo"}]]
DELETE EVENT:   [[ACTION:{"type":"deleteCalendarEvent","eventId":"ID"}]]
CREATE HABIT:   [[ACTION:{"type":"createHabit","name":"...","emoji":"💧","frequency":"daily","color":"#007AFF"}]]
CREATE SUBJECT: [[ACTION:{"type":"createSubject","name":"...","code":"...","targetPercentage":75,"schedule":[{"day":"Monday","time":"10:00 AM","type":"class","room":"101"}]}]]
WEEKLY REVIEW:  [[ACTION:{"type":"createWeeklyReview","weekStart":"YYYY-MM-DD","weekEnd":"YYYY-MM-DD","wentWell":"...","toImprove":"...","nextWeekPriorities":"...","gratitude":"..."}]]
NOTIF SETTING:  [[ACTION:{"type":"updateNotificationSetting","settingKey":"morning_brief_time","value":"08:30","settingLabel":"Set Morning Briefing to 8:30 AM"}]]
(settingKey: "morning_brief_time", "overdue_nudge_time", "habit_streak_time", "quiet_start", "quiet_end", "quiet_hours", "task_buffer", "mod_tasks", "mod_habits", "mod_gym", "mod_attendance", "mod_assignments", "morning_brief", "overdue_nudge", "habit_streak_risk", "attendance_warning", "gym_notification_time", "gym_notification_enabled")

═══ DAG NODE TYPE REFERENCE ═══
create_task       — fields: title, dueDate (YYYY-MM-DD), dueTime (HH:MM), priority (low/medium/high)
delete_task       — fields: taskId, taskTitle
complete_task     — fields: taskId, taskTitle
create_note       — fields: title, content
log_habit         — fields: habitId, habitName
create_habit      — fields: name, emoji, frequency (daily/weekly)
mark_attendance   — fields: subjectId, subjectName, status (present/absent), date
create_subject    — fields: name, code, targetPercentage, schedule[]
add_calendar_event — fields: title, date, startTime, type (todo/exam/gcal)
delete_calendar_event — fields: eventId
search_web        — fields: description (query)

═══ HARD RULES ═══
- For delete/complete: ALWAYS use IDs from the app context above.
- Only 1 [[DAG:...]] OR 1 [[ACTION:...]] block per response. Never both.
- When user lists items (even implicitly), ALWAYS use DAG — never apologize or ask one at a time.`;
}

// ─── Session Awareness: What Sara did earlier in this conversation ───────────

/**
 * Scans the last 6 history turns for action patterns (ACTION/DAG blocks)
 * and builds a compact "What I did this session" summary injected into
 * every system prompt so Sara never forgets earlier actions in the same chat.
 */
function buildSessionAwareness(history: { role: string; text?: string; content?: string }[]): string {
  if (!history || history.length === 0) return '';

  const recent = history.slice(-12); // last 6 user+model pairs
  const sessionActions: string[] = [];
  const sessionFacts: string[] = [];

  for (const msg of recent) {
    const text = msg.text || msg.content || '';
    if (!text) continue;

    if (msg.role === 'model' || msg.role === 'assistant') {
      // Extract ACTION blocks
      const actionMatches = [...text.matchAll(/\[\[ACTION:\{([^\]]+)\}\]\]/g)];
      for (const m of actionMatches) {
        try {
          const action = JSON.parse('{' + m[1] + '}');
          if (action.type === 'createTask') sessionActions.push(`✓ Created task: "${action.title}" on ${action.dueDate || 'unspecified date'}`);
          else if (action.type === 'deleteTask') sessionActions.push(`✓ Deleted task: "${action.taskTitle}"`);
          else if (action.type === 'completeTask') sessionActions.push(`✓ Completed task: "${action.taskTitle}"`);
          else if (action.type === 'createNote') sessionActions.push(`✓ Created note: "${action.title}"`);
          else if (action.type === 'logHabit') sessionActions.push(`✓ Logged habit: "${action.habitName}"`);
          else if (action.type === 'addCalendarEvent') sessionActions.push(`✓ Added event: "${action.title}" on ${action.date}`);
          else if (action.type === 'createHabit') sessionActions.push(`✓ Created habit: "${action.name}"`);
          else if (action.type === 'markAttendance') sessionActions.push(`✓ Marked ${action.subjectName}: ${action.status}`);
          else if (action.type === 'createSubject') sessionActions.push(`✓ Created subject: "${action.name}"`);
        } catch (e) { /* skip malformed */ }
      }

      // Extract DAG summaries
      const dagMatch = text.match(/\[\[DAG:\s*(\[.*?\])\s*\]\]/is);
      if (dagMatch) {
        try {
          const dag: any[] = JSON.parse(dagMatch[1]);
          const dagDesc = dag.map(n => n.title || n.description || n.type).filter(Boolean).join(', ');
          if (dagDesc) sessionActions.push(`✓ Batch executed: ${dagDesc}`);
        } catch (e) { /* skip */ }
      }

      // Extract plain conversation facts (short model messages without actions)
      if (!actionMatches.length && !dagMatch && text.length > 20 && text.length < 300) {
        const clean = text.replace(/\[SUGGEST:[^\]]*\]/g, '').replace(/\[NAVIGATE:[^\]]*\]/g, '').trim();
        if (clean.length > 20) sessionFacts.push(clean.slice(0, 150));
      }
    }
  }

  if (sessionActions.length === 0 && sessionFacts.length === 0) return '';

  let awareness = '═══ THIS SESSION — WHAT I ALREADY DID ═══\n';
  if (sessionActions.length > 0) {
    awareness += 'Actions confirmed this conversation:\n';
    awareness += sessionActions.slice(-8).map(a => `  ${a}`).join('\n') + '\n';
    awareness += 'IMPORTANT: Do NOT duplicate any of the above. If asked what you did, refer to this list.\n';
  }
  if (sessionFacts.length > 0) {
    awareness += 'Recent context from this chat:\n';
    awareness += sessionFacts.slice(-3).map(f => `  "${f}"`).join('\n') + '\n';
  }
  return awareness;
}

// ─── Proactive App Scan: Cross-module state of the user's world ───────────────

/**
 * Runs a full cross-module analysis on every call and surfaces a
 * "Current State of Your World" block at the top of the system prompt.
 * This gives Sara immediate awareness of the user's most pressing needs
 * without waiting for the user to ask.
 */
function buildProactiveScan(ctx: AppContext): string {
  const now = new Date();
  const todayISO = now.toISOString().split('T')[0];
  const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const threeDaysLater = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const lines: string[] = [];

  // 📋 Tasks
  const allTasks = ctx.tasks || [];
  const overdue = allTasks.filter(t => t.status !== 'completed' && t.date && t.date < todayISO);
  const dueToday = allTasks.filter(t => t.status !== 'completed' && t.date === todayISO);
  const pending = allTasks.filter(t => t.status !== 'completed');
  const highPriority = pending.filter(t => t.priority === 'P1' || t.priority === 'high');

  if (overdue.length > 0) lines.push(`⚠️ OVERDUE: ${overdue.length} task(s) past deadline — "${overdue.slice(0,2).map(t=>t.title).join('", "')}"`);
  if (dueToday.length > 0) lines.push(`📋 DUE TODAY: ${dueToday.length} task(s) — "${dueToday.slice(0,2).map(t=>t.title).join('", "')}"`);
  if (highPriority.length > 0) lines.push(`🔴 HIGH PRIORITY: ${highPriority.length} urgent task(s) pending`);

  // ✅ Habits
  const habits = ctx.habits || [];
  const habitLogs = ctx.habitLogs || [];
  const unloggedToday = habits.filter(h => !habitLogs.some(l => l.habitId === h.id && l.date === todayISO));
  const atRiskHabits = habits.filter(h => (h.streak || 0) > 2);

  if (unloggedToday.length > 0) lines.push(`✅ HABITS: ${unloggedToday.length} not yet logged today — "${unloggedToday.slice(0,2).map(h=>h.name).join('", "')}"`);

  // 📚 Attendance
  const attendance = ctx.attendance || [];
  const atRiskSubjects = attendance.filter(s => s.classesTotal > 0 && (s.classesAttended / s.classesTotal) < 0.75);
  const criticalSubjects = attendance.filter(s => s.classesTotal > 0 && (s.classesAttended / s.classesTotal) < 0.65);

  if (criticalSubjects.length > 0) lines.push(`🚨 CRITICAL ATTENDANCE: ${criticalSubjects.map(s => `${s.name} (${Math.round(s.classesAttended/s.classesTotal*100)}%)`).join(', ')}`);
  else if (atRiskSubjects.length > 0) lines.push(`⚠️ AT-RISK ATTENDANCE: ${atRiskSubjects.map(s => `${s.name} (${Math.round(s.classesAttended/s.classesTotal*100)}%)`).join(', ')}`);

  // 📌 Assignments
  const assignments = ctx.assignments || [];
  const urgentAssignments = assignments.filter(a => a.status !== 'submitted' && a.status !== 'graded' && a.dueDate >= todayISO && a.dueDate <= threeDaysLater);
  if (urgentAssignments.length > 0) lines.push(`📌 URGENT ASSIGNMENTS: "${urgentAssignments.map(a=>a.title).slice(0,2).join('", "')}" due within 3 days`);

  // 📅 Events
  const events = ctx.customEvents || [];
  const upcomingExams = events.filter(e => e.type === 'exam' && e.date >= todayISO && e.date <= sevenDaysLater);
  if (upcomingExams.length > 0) lines.push(`🎓 EXAM INCOMING: "${upcomingExams.map(e=>e.title).join('", "')}" within 7 days`);

  // 🏋️ Gym
  const gymLogs = ctx.gymLogs || [];
  const todayGym = gymLogs.find(g => g.date === todayISO);
  const recentGym = gymLogs.filter(g => {
    const d = new Date(g.date);
    return d >= new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
  });
  if (!todayGym && now.getHours() >= 10) lines.push(`💪 GYM: No session logged today`);

  // 🎯 Goals
  const goals = ctx.goals || [];
  const stalledGoals = goals.filter(g => g.status === 'active' && (g.progress || 0) < 20);
  if (stalledGoals.length > 0) lines.push(`🎯 STALLED GOALS: ${stalledGoals.length} goal(s) under 20% progress`);

  // 💼 Jobs
  const jobs = ctx.jobs || [];
  const activeApplications = jobs.filter(j => j.status === 'interviewing' || j.status === 'applied');
  if (activeApplications.length > 0) lines.push(`💼 ACTIVE APPLICATIONS: ${activeApplications.length} in pipeline`);

  if (lines.length === 0) return '';

  return `═══ PROACTIVE SCAN — CURRENT STATE OF YOUR WORLD ═══\n${lines.join('\n')}\nUSE THIS: Surface the most critical item proactively if the user seems unsure what to do.`;
}

// ─── Parse [SUGGEST: ...] ─────────────────────────────────────────────────────


function buildCrossModuleInsights(ctx: AppContext): string {
  const now = new Date();
  const todayISO = now.toISOString().slice(0, 10);
  const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  
  const urgentExams = (ctx.customEvents || []).filter(e => e.type === 'exam' && e.date >= todayISO && e.date <= sevenDaysLater);
  const urgentDeadlines = (ctx.assignments || []).filter(a => (a.dueDate || '') >= todayISO && (a.dueDate || '') <= sevenDaysLater && a.status !== 'submitted' && a.status !== 'graded');
  
  if (urgentExams.length === 0 && urgentDeadlines.length === 0) return '';
  
  let insight = `\nSARA_CROSS_REF: Upcoming critical deadline detected.\n`;
  if (urgentExams.length > 0) {
    const exam = urgentExams[0];
    insight += `- Exam: ${exam.title} on ${exam.date}\n`;
    const attendanceMatch = (ctx.attendance || []).find(s => s.name.toLowerCase().includes(exam.title.toLowerCase()) || exam.title.toLowerCase().includes(s.name.toLowerCase()));
    if (attendanceMatch) {
      const pct = attendanceMatch.classesTotal > 0 ? Math.round((attendanceMatch.classesAttended / attendanceMatch.classesTotal) * 100) : 0;
      insight += `- Attendance: ${attendanceMatch.name} at ${pct}% (${pct < 75 ? 'AT RISK' : 'Safe'})\n`;
    }
    const relatedTasks = (ctx.tasks || []).filter(t => t.title.toLowerCase().includes('revise') || t.title.toLowerCase().includes(exam.title.toLowerCase()));
    insight += `- Tasks: ${relatedTasks.length} revision tasks found.\n`;
  }
  
  if (urgentDeadlines.length > 0) {
    insight += `- Assignment: ${urgentDeadlines[0].title} due ${urgentDeadlines[0].dueDate}\n`;
  }
  
  insight += `SARA_RECOMMENDATION: Proactively offer to create a revision plan, block study time, and alert if attendance is at risk.\n`;
  return insight;
}

export function parseDagFromText(text: string): { cleanText: string; dag: any[] | null } {
  const match = text.match(/\[\[DAG:\s*(\[.*?\])\s*\]\]/is);
  if (!match) return { cleanText: text.trim(), dag: null };
  try {
    const dag = JSON.parse(match[1]);
    return { cleanText: text.replace(match[0], '').trim(), dag };
  } catch (e) {
    console.error('[Orchestrator] Failed to parse DAG:', e);
    return { cleanText: text.trim(), dag: null };
  }
}

// ─── Parse [SUGGEST: ...] ─────────────────────────────────────────────────────

function parseSuggestions(text: string): { cleanText: string; suggestions: string[] } {
  const match = text.match(/\[SUGGEST:(.*?)\]/i);
  if (!match) return { cleanText: text.trim(), suggestions: [] };
  const suggestions = match[1].split('|').map(s => s.trim()).filter(Boolean);
  return { cleanText: text.replace(match[0], '').trim(), suggestions };
}

// ─── Dynamic Thinking Text ────────────────────────────────────────────────────

function getDynamicThinkingText(instruction: string): string {
  const lower = instruction.toLowerCase();
  
  if (lower.includes('learn') || lower.includes('explain') || lower.includes('topic')) {
    return '🧠 Synthesizing knowledge base...';
  }
  if (lower.includes('assignment') || lower.includes('due') || lower.includes('grade')) {
    return '📚 Scanning academic records...';
  }
  if (lower.includes('plan') || lower.includes('schedule') || lower.includes('day')) {
    return '⏱️ Structuring your timeline...';
  }
  if (lower.includes('task') || lower.includes('todo')) {
    return '📋 Processing task matrix...';
  }
  if (lower.includes('habit') || lower.includes('streak')) {
    return '🔥 Analyzing consistency patterns...';
  }
  if (lower.includes('gym') || lower.includes('workout') || lower.includes('exercise')) {
    return '💪 Calibrating physical protocols...';
  }
  if (lower.includes('job') || lower.includes('career') || lower.includes('interview')) {
    return '💼 Accessing career trajectory...';
  }
  if (lower.includes('goal') || lower.includes('objective')) {
    return '🎯 Aligning strategic objectives...';
  }
  
  const fallbacks = [
    '🧠 Sara is analyzing...',
    '⚡ Processing neural pathways...',
    '✨ Decoding intent...',
    '🌌 Connecting the dots...',
    '🔍 Scanning ZenTrack databanks...'
  ];
  return fallbacks[Math.floor(Math.random() * fallbacks.length)];
}

// ─── Main Orchestrator ────────────────────────────────────────────────────────

export async function orchestrateAgent(
  instruction: string,
  appContext: AppContext,
  onStep: (step: any) => void,
  history: { role: string; text?: string; content?: string }[] = [],
  isVoiceMode?: boolean,
): Promise<string> {
  const userId = appContext.userId || auth.currentUser?.uid;

  // ── Cap 4: Initial reasoning step — notify UI Sara is working ────────────
  const thinkingText = getDynamicThinkingText(instruction);
  onStep({ type: 'thinking', title: thinkingText });

  // ── Cap 1 & 7: Parallel Pre-Fetch of CMG Memory + BFE Fingerprint ──────────
  const initialMemory = appContext.memorySummary || '';
  const [memorySummaryText, fingerprint] = await Promise.all([
    initialMemory
      ? Promise.resolve(initialMemory)
      : userId
      ? buildMemorySummary(userId).catch(() => '')
      : Promise.resolve(''),
    userId ? getFingerprint(userId).catch(() => null) : Promise.resolve(null),
  ]);

  let toneDirective = `PERSONA & TONE — KUNAL SHAH MINDSET:
You are not a cheerleader. You are a blunt, first-principles thinking advisor who has no time for comfort-zone coddling.
Core traits:
- Speak the truth, even when it stings. Do not sugarcoat.
- Think in systems and incentives. Ask: "why does this actually happen?"
- Respect the user's intelligence. Skip the obvious. Skip the filler.
- If they are slipping, call it out directly. No soft language, no "that's okay".
- Never use motivational-poster language. No "you've got this", no "believe in yourself".
- Be precise. Short. One punch that lands is better than five that tickle.
- Occasionally ask a sharp follow-up question that makes them think differently about their own problem.
- Default to action over analysis. Don't over-explain.
Examples of Kunal Shah style:
  ✓ "You haven't logged gym in 3 days. What's the real reason?"
  ✓ "Overdue tasks don't fix themselves. Pick 2 to close right now."
  ✓ "Your attendance is 61%. That's not bad luck, that's a pattern."
  ✗ "Great question! I'm here to help you..."
  ✗ "Don't worry, you'll catch up!"
  ✗ "Amazing effort, keep it up!"`;
  let responseStyle = 'Format: 1-3 sentences max. Concise.';
  let personaContext = '';

  if (fingerprint) {
    toneDirective = getSaraToneDirective(fingerprint);
    responseStyle = getSaraResponseStyle(fingerprint);
    if (fingerprint.persona) {
      personaContext = `USER PERSONA:\nName: ${fingerprint.persona.name || 'User'}\nDegree/Year: ${fingerprint.persona.degree} (Year ${fingerprint.persona.year})\nStress Level: ${fingerprint.persona.currentStressLevel}\nMotivation: ${fingerprint.persona.motivationStyle}\nPrimary Goal: ${fingerprint.persona.primaryGoal}\nUpcoming Exam: ${fingerprint.persona.examPeriodStart || 'None'}`;
    }

    // Cap 4: Reasoning step — fingerprint loaded
    onStep({
      type: 'reasoning_step',
      title: `🎭 Tone adapted: ${fingerprint.streakPersonality}`,
    });
  }

  // ── Cap 2: IRCI — classify intent + build selective context ─────────────
  let systemPrompt: string;
  try {
    const intentProfile = classifyIntent(instruction, fingerprint);

    // Cap 4: Reasoning steps per detected domain
    for (const domain of intentProfile.primaryDomains) {
      onStep({
        type: 'reasoning_step',
        title: domainToReasoningLabel(domain),
      });
    }

    if (intentProfile.selectiveMode) {
      // IRCI mode: inject only relevant domains (~400 tokens)
      const selectiveContext = buildSelectiveContext(appContext, intentProfile);
      systemPrompt = buildSelectiveSystemPrompt(
        appContext,
        selectiveContext,
        toneDirective,
        responseStyle,
        memorySummaryText,
        personaContext,
        history // ← session awareness
      );
      console.log(`[IRCI] Selective mode: domains=${intentProfile.primaryDomains.join(',')}, confidence=${intentProfile.confidence.toFixed(2)}`);
    } else {
      // Fallback: full context for complex/ambiguous queries
      systemPrompt = buildSystemPrompt(appContext, toneDirective, responseStyle, memorySummaryText, personaContext, history); // ← session awareness
      console.log(`[IRCI] Full context mode: confidence=${intentProfile.confidence.toFixed(2)}`);
    }
  } catch (e) {
    // Fallback to full prompt on any IRCI error
    systemPrompt = buildSystemPrompt(appContext, toneDirective, responseStyle, memorySummaryText, personaContext, history);
  }

  const crossModuleInsights = buildCrossModuleInsights(appContext);
  if (crossModuleInsights) {
    systemPrompt += `\n${crossModuleInsights}`;
    onStep({ type: 'reasoning_step', title: '🔗 Cross-referencing schedule...' });
  }

  // Cap 4: Final reasoning step before Gemini call
  onStep({ type: 'reasoning_step', title: '✍️ Drafting response...' });

  // Build conversation contents from history
  const contents: any[] = [];
  for (const msg of history.slice(-12)) {
    const msgText = msg.text || msg.content || '';
    if (!msgText) continue;
    contents.push({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msgText }],
    });
  }
  contents.push({ role: 'user', parts: [{ text: instruction }] });

  try {
    let rawText = '';

    // ── Cap 6: Sentence-level streaming TTS (voice mode) ──────────────────
    // In voice mode, we start speaking the first sentence as soon as it arrives
    let firstSentenceSpoken = false;
    let sentenceBuffer = '';

    const streamedText = await streamProxy({
      model: 'gemini-2.5-flash',
      contents,
      systemInstruction: systemPrompt,
      generationConfig: { temperature: 0.7, maxOutputTokens: 8192 },
    }, (chunk) => {
      rawText = chunk;
      
      // Parse on the fly: hide DAG blocks from stream
      const { cleanText } = parseDagFromText(rawText);
      const { cleanText: display } = parseSuggestions(cleanText);
      
      onStep({ type: 'stream', text: display || '' });

      // Cap 6: Sentence-level streaming TTS
      // Fire TTS for the first complete sentence in voice mode, don't wait for full response
      if (isVoiceMode && !firstSentenceSpoken && display) {
        const sentenceEndMatch = display.match(/^([^.!?]+[.!?])\s/);
        if (sentenceEndMatch && sentenceEndMatch[1].length > 10) {
          firstSentenceSpoken = true;
          sentenceBuffer = sentenceEndMatch[1];
          // Signal UI to start speaking this sentence immediately
          onStep({ type: 'voice_sentence_ready', sentence: sentenceBuffer });
        }
      }
    });

    rawText = streamedText || "I'm here — what's on your mind?";

    // Parse DAG block
    const { cleanText: textAfterDag, dag } = parseDagFromText(rawText);
    const { cleanText: finalText, suggestions } = parseSuggestions(textAfterDag);

    if (dag && dag.length > 0) {
      onStep({ type: 'thinking', title: 'Executing tasks in parallel...' });
      
      const { executeDag } = require('./dagExecutor');
      const results = await executeDag(dag, appContext, (nodeId: string, status: string) => {
         // optional: UI stream
      });
      
      let searchContext = '';
      const allActions: any[] = [];

      for (const res of results) {
        if (res.result.includes('[[ACTION:')) {
          const match = res.result.match(/\[\[ACTION:(.*?)\]\]/is);
          if (match) {
            try { allActions.push(JSON.parse(match[1])); } catch (e) {}
          }
        } else if (res.result.trim()) {
          searchContext += `\nTask ${res.nodeId} Result: ${res.result}\n`;
        }
      }
      
      let finalOutputText = finalText;

      if (searchContext.trim()) {
         onStep({ type: 'reasoning_step', title: '🔗 Synthesizing results...' });
         const finalResp = await streamProxy({
           model: 'gemini-2.5-flash',
           contents: [...contents, { role: 'model', parts: [{text: rawText}]}, { role: 'user', parts: [{ text: `Here are the results of the tasks you ran:\n${searchContext}\n\nPlease summarize the findings for the user.`}]}],
           generationConfig: { temperature: 0.7 }
         }, (chunk) => {
             const { cleanText: display } = parseSuggestions(chunk);
             onStep({ type: 'stream', text: display || '' });
         });
         
         const { cleanText: synthText, suggestions: synthSuggs } = parseSuggestions(finalResp || 'Done.');
         finalOutputText = synthText;
         onStep({ type: 'answer', title: synthText, suggestions: synthSuggs });
      }

      if (allActions.length > 0) {
          finalOutputText += `\n\n[[BATCH_ACTIONS:${JSON.stringify(allActions)}]]`;
      }
      
      // Cap 1: Extract memory async after DAG completion
      if (userId) {
        extractAndStore(userId, instruction, finalOutputText);
        updateFingerprint(userId, { type: 'sara_interaction', languageCode: 'en-IN' });
      }

      return finalOutputText;
    }

    // If no DAG, fallback to parsing a single ACTION block (fast path)
    const { cleanText: textAfterAction, action } = parseActionFromText(rawText);
    const { cleanText: finalTextFallback, suggestions: actionSuggestions } = parseSuggestions(textAfterAction);

    if (action) {
      onStep({
        type: 'proposed_action',
        actionType: action.type,
        action,
        title: finalTextFallback,
        suggestions: actionSuggestions,
      });

      // Cap 1: Extract memory async
      if (userId) {
        extractAndStore(userId, instruction, finalTextFallback);
        updateFingerprint(userId, { type: 'sara_interaction', languageCode: 'en-IN' });
      }

      return finalTextFallback || rawText;
    }

    onStep({ type: 'answer', title: finalTextFallback || rawText, suggestions: actionSuggestions });

    // Cap 1: Extract memory async after every answer
    if (userId) {
      extractAndStore(userId, instruction, finalTextFallback || rawText);
      updateFingerprint(userId, { type: 'sara_interaction', languageCode: 'en-IN' });
    }

    return finalTextFallback || rawText;

  } catch (err: any) {
    console.error('[Orchestrator] Gemini call failed:', err.message);
    const fallbackMessage = `I couldn't complete that action right now. Here's what I can do instead:
- Check your tasks for today
- Read your upcoming calendar events
- Suggest a gym workout`;
    onStep({ 
      type: 'answer', 
      title: fallbackMessage,
      suggestions: ['Show tasks', 'Show calendar', 'Gym plan']
    });
    return fallbackMessage;
  }
}

/**
 * Disconnect stub — kept for API compatibility with any callers
 * that previously called disconnectSocket() on sign-out.
 * No-op now that we use direct HTTP calls (no persistent connection).
 */
export function disconnectSocket() {
  // No-op: direct Gemini calls have no persistent connection to close.
}

/**
 * Generate a personalized initial greeting using the persona card.
 */
export async function generateInitialGreeting(appContext: AppContext): Promise<string> {
  const userId = appContext.userId || auth.currentUser?.uid;
  let toneDirective = '';
  let responseStyle = '';
  let personaContext = '';
  let memorySummaryText = appContext.memorySummary || '';
  
  if (userId) {
    try {
      const [fetchedMemory, fingerprint] = await Promise.all([
        memorySummaryText ? Promise.resolve(memorySummaryText) : buildMemorySummary(userId).catch(() => ''),
        getFingerprint(userId).catch(() => null),
      ]);
      memorySummaryText = fetchedMemory;
      if (fingerprint) {
        toneDirective = getSaraToneDirective(fingerprint);
        responseStyle = getSaraResponseStyle(fingerprint);
        if (fingerprint.persona) {
          personaContext = `USER PERSONA:\nName: ${fingerprint.persona.name || 'User'}\nDegree/Year: ${fingerprint.persona.degree} (Year ${fingerprint.persona.year})\nStress Level: ${fingerprint.persona.currentStressLevel}\nMotivation: ${fingerprint.persona.motivationStyle}\nPrimary Goal: ${fingerprint.persona.primaryGoal}\nUpcoming Exam: ${fingerprint.persona.examPeriodStart || 'None'}`;
        }
      }
    } catch (e) {}
  }

  const systemPrompt = buildSystemPrompt(appContext, toneDirective, responseStyle, memorySummaryText, personaContext) 
    + `\n\nCRITICAL INSTRUCTION: Generate a session-opening line (1-2 sentences MAX). Rules:
- Do NOT say "Hi", "Hello", "Hey", "Good morning", or any pleasantry.
- DO NOT ask "how are you" or "what's on your mind".
- Scan the user's data right now. Find the single most critical signal (overdue task, attendance risk, missed habit streak, upcoming exam, stalled goal).
- Open with that signal directly. Be blunt. No softening.
- If nothing is critical, ask ONE sharp first-principles question about their goals or priorities.
- Example outputs:
  "3 tasks are overdue. Which one is the real priority, and which one is procrastination?"
  "Your physics attendance is at 61%. That's not a scheduling issue, that's a decision issue."
  "You haven't hit the gym in 4 days. What's actually stopping you?"
  "What's the one thing that, if done today, makes everything else easier?"
- NEVER generate JSON, DAG blocks, or action cards in this greeting.`;

  try {
    const data = await callProxy({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: "Start." }] }],
      systemInstruction: systemPrompt,
      generationConfig: { temperature: 0.8, maxOutputTokens: 80 }
    });
    return data?.candidates?.[0]?.content?.parts?.[0]?.text || "What do you need to get done?";
  } catch (e) {
    return "What do you need to get done?";
  }
}

