/**
 * saraAgent.ts — ZenTrack Mobile AI Brain
 *
 * Sara has FULL READ access to ALL app data:
 * tasks, habits, habitLogs, notes, goals, gymLogs,
 * attendance, assignments, customEvents, learningTopics,
 * jobs, weeklyReviews, waterLogs, sleepLogs
 *
 * Write operations use JSON action blocks embedded in the response:
 *   [[ACTION:{"type":"createTask","title":"...","dueDate":"2026-07-14","priority":"medium"}]]
 *
 * The UI extracts this, shows a confirmation card, user approves → Firestore write.
 * This is 100% APK-compatible — no function_declarations / tools parameter needed.
 */

import { callProxy, parseProxyResponse } from '../services/geminiProxy';

// ─── Memory Compression ──────────────────────────────────────────────────────

/**
 * Compress a long conversation history (>20 msgs) into a ≤200-word summary.
 * Called from SaraScreen when history.length > 20 after each completed response.
 * Stored in AsyncStorage under 'sara_memory_summary'.
 */
export async function compressMemoryToSummary(
  history: { role: string; text?: string; content?: string }[]
): Promise<string> {
  const historyText = history
    .map(m => `${m.role === 'user' ? 'User' : 'Sara'}: ${m.text || m.content || ''}`)
    .join('\n');

  const prompt = `You are summarizing a conversation between a college student and Sara (their AI assistant) for long-term memory storage.

Conversation:
${historyText}

Create a concise memory summary (max 200 words) capturing:
- Key decisions made or tasks created
- Personal preferences expressed (time preferences, study habits, goals)
- Ongoing concerns or recurring topics
- Context needed to continue naturally in future conversations

Write in third person ("The user..."). Be specific, not generic.`;

  const data = await callProxy({
    model: 'gemini-2.5-flash',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 400 },
  });

  const { text } = parseProxyResponse(data);
  return text.trim().slice(0, 1200); // Cap at ~200 words
}

// ─── Action types ────────────────────────────────────────────────────────────

export type SaraActionType =
  | 'createTask'
  | 'deleteTask'
  | 'completeTask'
  | 'updateTask'
  | 'createNote'
  | 'logHabit'
  | 'markAttendance'
  | 'addCalendarEvent';

export type GymActionType =
  | 'addExerciseToWorkout'
  | 'removeExercise'
  | 'generateWorkoutPlan'
  | 'importMultiDayPlan'
  | 'addExerciseToPlanDay'
  | 'swapExercise'
  | 'logWorkoutSet'
  | 'autoregulateDeload';

export interface AgentAction {
  type: SaraActionType | GymActionType;
  [key: string]: any;
}

// ─── Parse [[ACTION:{...}]] from model response ───────────────────────────────

export function parseActionFromText(text: string): {
  cleanText: string;
  action: AgentAction | null;
} {
  const match = text.match(/\[\[ACTION:([\s\S]*?)\]\]/);
  if (!match) return { cleanText: text.trim(), action: null };

  try {
    const action: AgentAction = JSON.parse(match[1].trim());
    const cleanText = text.replace(match[0], '').trim();
    return { cleanText, action };
  } catch {
    const cleanText = text.replace(match[0], '').trim();
    return { cleanText, action: null };
  }
}

// ── Parse [[OPTIONS:[...]]] from model response ───────────────────────────────
// Used for interactive preference questions. Options render as tappable chips.
export function parseOptionsFromText(text: string): {
  cleanText: string;
  options: string[];
} {
  const match = text.match(/\[\[OPTIONS:(\[[\s\S]*?\])\]\]/);
  if (!match) return { cleanText: text.trim(), options: [] };
  try {
    const options: string[] = JSON.parse(match[1]);
    const cleanText = text.replace(match[0], '').trim();
    return { cleanText, options: Array.isArray(options) ? options : [] };
  } catch {
    return { cleanText: text.replace(match[0], '').trim(), options: [] };
  }
}

// ─── Parse [SUGGEST: ...] from text ─────────────────────────────────────────

function parseSuggestions(text: string): { cleanText: string; suggestions: string[] } {
  const match = text.match(/\[SUGGEST:(.*?)\]/i);
  if (!match) return { cleanText: text.trim(), suggestions: [] };
  const suggestions = match[1].split('|').map((s) => s.trim()).filter(Boolean);
  const cleanText = text.replace(match[0], '').trim();
  return { cleanText, suggestions };
}

// ─── Context builder helpers ──────────────────────────────────────────────────

function summarizeTasks(tasks: any[] = []) {
  return tasks.map(t => ({
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    date: t.date,
    timeSlot: t.timeSlot,
    subject: t.subject,
  }));
}

function summarizeHabits(habits: any[] = [], logs: any[] = []) {
  const today = new Date().toISOString().split('T')[0];
  return habits.slice(0, 20).map(h => ({
    id: h.id,
    name: h.name,
    streak: h.streak,
    doneToday: logs.some(l => l.habitId === h.id && l.date === today),
  }));
}

function summarizeAttendance(subjects: any[] = []) {
  return subjects.slice(0, 15).map(s => ({
    id: s.id,
    name: s.name,
    attended: s.classesAttended,
    total: s.classesTotal,
    pct: s.classesTotal > 0 ? Math.round((s.classesAttended / s.classesTotal) * 100) : 0,
    target: s.targetPercentage,
  }));
}

// ─── Sara Chat ───────────────────────────────────────────────────────────────

export async function processSaraChat(
  instruction: string,
  history: { role: string; content: string }[] = [],
  contextData: {
    tasks?: any[];
    habits?: any[];
    habitLogs?: any[];
    notes?: any[];
    goals?: any[];
    gymLogs?: any[];
    attendance?: any[];
    assignments?: any[];
    customEvents?: any[];
    learningTopics?: any[];
    jobs?: any[];
    weeklyReviews?: any[];
    waterLogs?: any[];
    sleepLogs?: any[];
    notifSettingsSummary?: string;
  } = {}
): Promise<{
  type: 'text' | 'function_call';
  text: string;
  rawText?: string;
  name?: string;
  args?: any;
  suggestions?: string[];
}> {
  const now = new Date();
  const todayISO = now.toISOString().split('T')[0];
  const tomorrowISO = new Date(now.getTime() + 86400000).toISOString().split('T')[0];

  // ── Build compact context summaries ─────────────────────────────────────
  const tasksSummary = summarizeTasks(contextData.tasks);
  const pendingTasks = tasksSummary.filter(t => t.status !== 'completed').sort((a, b) => {
    // Sort so tasks with dates (especially upcoming) are prioritized over past or undated tasks
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return a.date.localeCompare(b.date);
  });
  const habitsSummary = summarizeHabits(contextData.habits, contextData.habitLogs);
  const attendanceSummary = summarizeAttendance(contextData.attendance);
  const completedTasksToday = (contextData.tasks || [])
    .filter(t => t.status === 'completed' && t.completedAt?.startsWith?.(todayISO))
    .map(t => ({ id: t.id, title: t.title, timeSlot: t.timeSlot }));
  const completedToday = completedTasksToday.length;
  const upcomingEvents = (contextData.customEvents || [])
    .filter(e => e.date >= todayISO)
    .slice(0, 10)
    .map(e => ({ title: e.title, date: e.date, type: e.type, time: e.startTime }));
  const recentNotes = (contextData.notes || []).slice(0, 8)
    .map(n => ({ id: n.id, title: n.title, preview: n.content?.slice(0, 100) }));
  const activeGoals = (contextData.goals || [])
    .filter(g => g.status === 'active').slice(0, 8)
    .map(g => ({ id: g.id, title: g.title, progress: g.progress }));
  const pendingAssignments = (contextData.assignments || [])
    .filter(a => a.status !== 'submitted' && a.status !== 'graded').slice(0, 10)
    .map(a => ({ id: a.id, title: a.title, subject: a.subjectName, due: a.dueDate, status: a.status }));
  const learningTopics = (contextData.learningTopics || []).slice(0, 8)
    .map(t => ({ id: t.id, title: t.title, tasks: t.subTasks?.length }));
  const recentJobs = (contextData.jobs || []).slice(0, 8)
    .map(j => ({ company: j.company, role: j.role, status: j.status, date: j.dateApplied }));

  // Water/sleep (today)
  const todayWater = (contextData.waterLogs || [])
    .filter(w => w.date === todayISO).reduce((sum, w) => sum + (w.amountMl || 0), 0);
  const lastSleep = (contextData.sleepLogs || []).slice(-1)[0];

  const systemPrompt = `You are Sara, the warm, witty, and highly capable AI assistant inside ZenTrack. You manage the user's entire life — tasks, notes, habits, attendance, goals, calendar, assignments, gym, learning, jobs, health, and app settings.

TODAY: ${((d) => { const days=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"]; const mos=["January","February","March","April","May","June","July","August","September","October","November","December"]; return days[d.getDay()] + ", " + String(d.getDate()).padStart(2,"0") + " " + mos[d.getMonth()] + " " + d.getFullYear(); })(now)}
TIME: ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
TOMORROW: ${tomorrowISO}

═══ FULL APP CONTEXT (READ ACCESS) ═══

📋 TASKS (${pendingTasks.length} pending, ${completedToday} completed today):
PENDING: ${JSON.stringify(pendingTasks.slice(0, 40))}
COMPLETED TODAY: ${JSON.stringify(completedTasksToday.slice(0, 10))}

✅ HABITS (${habitsSummary.length} tracked):
${JSON.stringify(habitsSummary)}

📅 UPCOMING EVENTS (${upcomingEvents.length}):
${JSON.stringify(upcomingEvents)}

📝 NOTES (${(contextData.notes || []).length} total, recent):
${JSON.stringify(recentNotes)}

🎯 ACTIVE GOALS:
${JSON.stringify(activeGoals)}

📚 ATTENDANCE (subjects):
${JSON.stringify(attendanceSummary)}

📌 PENDING ASSIGNMENTS:
${JSON.stringify(pendingAssignments)}

🧠 LEARNING TOPICS:
${JSON.stringify(learningTopics)}

💼 RECENT JOBS:
${JSON.stringify(recentJobs)}

💧 Water today: ${todayWater}ml
😴 Last sleep: ${lastSleep ? `${lastSleep.hours}h on ${lastSleep.date}` : 'no data'}

${contextData.notifSettingsSummary ? `\n${contextData.notifSettingsSummary}\n` : ''}

═══ HOW TO RESPOND ═══

1. You have FULL READ ACCESS. NEVER say "I can't access your data". Read from the context above and answer directly.
2. SINGLE ACTION: For one write operation, embed: [[ACTION:{"type":"...","field":"value"}]]
3. BATCH ACTIONS: If user asks to create MULTIPLE items (e.g. "add 3 tasks", "create tasks for this week"), use: [[BATCH_ACTIONS:[{"type":"createTask","title":"...","label":"Create task: ...","icon":"checkmark-circle-outline","dueDate":"YYYY-MM-DD","priority":"medium"},{...}]]]
   - Each action in the array MUST include a "label" (human-readable description shown to user) and "icon" (ionicon name).
   - The UI shows all actions with checkboxes — user selects which to confirm.
4. NEVER use both [[ACTION]] and [[BATCH_ACTIONS]] in the same response.
5. The user MUST confirm before anything is saved to the database.
6. After every text response, append [SUGGEST: action 1 | action 2] with 2 relevant follow-up suggestions.
7. Tone: warm, direct, concise. Occasionally witty. Never verbose.

═══ DATE & TIME RULES ═══
- "tomorrow" = ${tomorrowISO}
- "next Monday" = calculate from ${todayISO}
- "morning" = 09:00, "noon" = 12:00, "afternoon" = 15:00, "evening" = 18:00, "night" = 21:00
- Always use YYYY-MM-DD for dates, HH:MM for times

═══ ACTION TYPES ═══

CREATE TASK:
[[ACTION:{"type":"createTask","title":"Buy milk","dueDate":"${tomorrowISO}","dueTime":"18:00","priority":"medium"}]]
priority: "low" | "medium" | "high"
dueTime is OPTIONAL — omit if user doesn't mention a time.

DELETE TASK:
[[ACTION:{"type":"deleteTask","taskId":"TASK_ID_FROM_CONTEXT","taskTitle":"Task Title"}]]
Always confirm the exact taskId from the tasks list above.

COMPLETE TASK:
[[ACTION:{"type":"completeTask","taskId":"TASK_ID_FROM_CONTEXT","taskTitle":"Task Title"}]]

UPDATE TASK:
[[ACTION:{"type":"updateTask","taskId":"TASK_ID_FROM_CONTEXT","taskTitle":"Task Title","newDate":"YYYY-MM-DD","newTime":"14:00","newPriority":"high"}]]
Include only the fields you wish to update (newDate, newTime, newPriority, newTitle).

CREATE NOTE:
[[ACTION:{"type":"createNote","title":"Note Title","content":"Note content goes here"}]]

LOG HABIT:
[[ACTION:{"type":"logHabit","habitId":"HABIT_ID_FROM_CONTEXT","habitName":"Habit Name"}]]
Only log habits that exist in the habits list above.

MARK ATTENDANCE:
[[ACTION:{"type":"markAttendance","subjectId":"SUBJECT_ID_FROM_CONTEXT","subjectName":"Subject Name","status":"present","date":"${todayISO}"}]]
status: "present" | "absent"

ADD CALENDAR EVENT:
[[ACTION:{"type":"addCalendarEvent","title":"Event Title","date":"${tomorrowISO}","startTime":"14:00","type":"todo"}]]
type: "todo" | "exam" | "assignment_due" | "holiday"

UPDATE NOTIFICATION SETTING:
[[ACTION:{"type":"updateNotificationSetting","settingKey":"morning_brief_time","value":"08:30","settingLabel":"Set Morning Briefing to 8:30 AM"}]]
settingKey values: "morning_brief_time", "overdue_nudge_time", "habit_streak_time", "quiet_start", "quiet_end", "quiet_hours", "task_buffer", "mod_tasks", "mod_habits", "mod_gym", "mod_attendance", "mod_assignments", "morning_brief", "overdue_nudge", "habit_streak_risk", "attendance_warning", "gym_notification_time", "gym_notification_enabled"
value: HH:MM string (e.g. "08:30") or boolean (true/false) or string minutes ("30").

═══ RULES ═══
- For deleteTask/completeTask/logHabit/markAttendance: ALWAYS use the IDs from the context above, never make up IDs.
- If a task/habit/subject isn't in the context, say so and ask for clarification.
- Only 1 action block per response (either [[ACTION]] or [[BATCH_ACTIONS]]).`;

  // Inject memory summary if available (passed via contextData)
  const systemWithMemory = (contextData as any).memorySummary
    ? systemPrompt + `\n\n═══ SARA MEMORY (from previous sessions) ═══\n${(contextData as any).memorySummary}`
    : systemPrompt;

  // Build conversation contents (history = previous turns only, current added below)
  const contents: any[] = [];
  for (const msg of history.slice(-12)) {
    contents.push({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }],
    });
  }
  contents.push({ role: 'user', parts: [{ text: instruction }] });

  try {
    const data = await callProxy({
      model: 'gemini-2.5-flash',
      contents,
      systemInstruction: systemWithMemory,
      generationConfig: { temperature: 0.7, maxOutputTokens: 8192 },
    });

    const { text } = parseProxyResponse(data);
    const rawText = text || "I'm here — what's on your mind?";

    const { cleanText: textAfterAction, action } = parseActionFromText(rawText);
    const { cleanText: finalText, suggestions } = parseSuggestions(textAfterAction);

    if (action) {
      return { type: 'function_call', name: action.type, args: action, text: finalText, rawText, suggestions };
    }

    return { type: 'text', text: finalText || rawText, rawText, suggestions };
  } catch (err: any) {
    console.error('[SaraAgent] Error:', err.message);
    throw err;
  }
}

// ─── GYM-GPT Chat ────────────────────────────────────────────────────────────

export async function processGymChat(
  instruction: string,
  history: { role: string; content: string }[] = [],
  contextData: {
    gymLogs?: any[];
    goals?: any[];
    exercises?: any[];
    workoutDayName?: string;
    userId?: string;
    tasks?: any[]
    habits?: any[];
    notes?: any[];
    googleAccessToken?: string;
    memorySummary?: string;
    waterLogs?: any[];
    sleepLogs?: any[];
    /** User's full custom gym plan document (customDays keyed by dayIndex 1-7) */
    userGymPlan?: { customDays?: Record<number, any> } | null;
    /** Today's resolved plan day (already custom-plan-aware from useGymLog) */
    gymPlanDay?: any | null;
    /** Athlete profile from useGymProfile hook */
    gymProfile?: {
      heightCm?: number | null;
      weightKg?: number | null;
      age?: number | null;
      gender?: string | null;
      goal?: string | null;
      experience?: string | null;
      equipment?: string | null;
      daysPerWeek?: number | null;
      limitations?: string;
      exercisesToAvoid?: string;
      notes?: string;
    } | null;
    /** Persistent user training preferences (split, exercises/day, etc.) */
    gymPreferences?: {
      preferredSplit?: string | null;       // e.g. 'PPL', 'Upper/Lower', 'Arnold', 'Full Body', 'Bro Split'
      exercisesPerDay?: number | null;      // e.g. 4, 5, 6
      preferredFocus?: string | null;       // e.g. 'hypertrophy', 'strength', 'fat loss'
      trainingDaysPerWeek?: number | null;  // e.g. 4, 5, 6
      otherNotes?: string | null;           // free-form user preference note
    } | null;
  } = {},
  preferredModel?: string
): Promise<{
  type: 'text' | 'function_call';
  text: string;
  name?: string;
  args?: any;
  options?: string[];
}> {
  const now = new Date();
  // FIX: Use local date (not toISOString which is UTC — wrong in IST after midnight)
  const todayY = now.getFullYear();
  const todayMo = String(now.getMonth() + 1).padStart(2, '0');
  const todayDa = String(now.getDate()).padStart(2, '0');
  const todayStr = `${todayY}-${todayMo}-${todayDa}`;
  const todayDayOfWeek = now.getDay(); // 0=Sun..6=Sat

  // ── Today's exercise list (detailed) ────────────────────────────────────────
  const exercisesList = (contextData.exercises || [])
    .map((ex: any, i: number) => {
      const setsLogged = (ex.setsLog || []).filter((s: any) => s.completed);
      const logDetail = setsLogged.length > 0
        ? ` | Done: ${setsLogged.map((s: any) => `${s.weight ?? '?'}kg×${s.reps ?? '?'}`).join(', ')}`
        : '';
      return `[${i}] ${ex.name} (${ex.muscle || 'N/A'}) — Target: ${ex.targetSets}×${ex.targetReps}${logDetail}`;
    })
    .join('\n');

  // ── Last 10 sessions with FULL setsLog ──────────────────────────────────────
  const recentLogs = (contextData.gymLogs || [])
    .filter((l: any) => l.date <= todayStr && (l.exercises?.length > 0))
    .sort((a: any, b: any) => b.date.localeCompare(a.date))
    .slice(0, 10)
    .map((log: any) => ({
      date: log.date,
      durationMin: log.workoutDurationMinutes || null,
      exercises: (log.exercises || []).map((ex: any) => ({
        name: ex.name,
        muscle: ex.muscle,
        sets: (ex.setsLog || [])
          .filter((s: any) => s.completed)
          .map((s: any) => ({ reps: s.reps, weight: s.weight })),
      })),
    }));

  // ── Build fatigue heuristic (volume load delta) ──────────────────────────────
  const buildFatigueSummary = (): string => {
    if (recentLogs.length < 2) return 'Not enough data for fatigue calculation.';
    const volumes = recentLogs.slice(0, 5).map(log => {
      let vol = 0;
      log.exercises.forEach((ex: any) => {
        ex.sets.forEach((s: any) => { vol += (s.weight || 0) * (s.reps || 0); });
      });
      return vol;
    });
    const avg5 = volumes.slice(0, 5).reduce((a, b) => a + b, 0) / Math.min(5, volumes.length);
    const last = volumes[0] || 0;
    const trend = last > avg5 * 1.15 ? 'volume spiked (fatigue risk)' :
      last < avg5 * 0.85 ? 'volume dropped (possibly deloading or low motivation)' :
        'volume consistent';
    const sessionFreq = recentLogs.slice(0, 7).length;
    return `Last session volume: ${Math.round(last)}kg-total. 5-session avg: ${Math.round(avg5)}kg. Trend: ${trend}. Sessions in last 7 entries: ${sessionFreq}.`;
  };

  // ── Daily Readiness Calculation ───────────────────────────────────────────────
  const todayWater = (contextData.waterLogs || [])
    .filter(w => w.date === todayStr).reduce((sum, w) => sum + (w.amountMl || 0), 0);
  const lastSleep = (contextData.sleepLogs || []).slice(-1)[0];
  
  const readinessSummary = `Water today: ${todayWater}ml. Sleep: ${lastSleep ? `${lastSleep.hours}h on ${lastSleep.date}` : 'No recent sleep data'}. ${lastSleep && lastSleep.hours < 6 ? 'CRITICAL: Severe sleep deficit detected. CNS is vulnerable. You must strongly recommend an autoregulated deload.' : lastSleep && lastSleep.hours >= 8 ? 'OPTIMAL: High readiness detected. Great day to push for PRs.' : ''}`;

  // ── Profile string ───────────────────────────────────────────────────────────
  const p = contextData.gymProfile;
  const goalMap: Record<string, string> = {
    hypertrophy: 'Muscle Hypertrophy (size, 8-15 rep range, moderate rest 60-90s)',
    strength: 'Maximal Strength (1-5 rep range, heavy compound focus, long rest 3-5min)',
    fat_loss: 'Fat Loss + Muscle Retention (circuit-style, supersets, short rest 30-60s)',
    athletic: 'Athletic Performance (power, explosiveness, compound + plyometrics)',
  };
  const profileBlock = p ? [
    p.weightKg ? `Bodyweight: ${p.weightKg}kg` : '',
    p.heightCm ? `Height: ${p.heightCm}cm` : '',
    p.age ? `Age: ${p.age} years` : '',
    p.gender ? `Gender: ${p.gender}` : '',
    p.goal ? `GOAL: ${goalMap[p.goal] || p.goal}` : '',
    p.experience ? `Experience Level: ${p.experience}` : '',
    p.equipment ? `Equipment: ${p.equipment}` : '',
    p.daysPerWeek ? `Training Days/Week: ${p.daysPerWeek}` : '',
    p.limitations ? `⚠️ INJURIES/LIMITATIONS: ${p.limitations}` : '',
    p.exercisesToAvoid ? `🚫 EXERCISES TO AVOID: ${p.exercisesToAvoid}` : '',
    p.notes ? `Preferences: ${p.notes}` : '',
  ].filter(Boolean).join('\n') : 'No profile set — encourage user to fill their profile.';

  // ── Full Plan Block: real custom plan, full week view ────────────────────────
  // Replaces hardcoded GYM_PLAN references so Gym GPT sees the user's actual split.
  const buildFullPlanBlock = (): string => {
    const { GYM_PLAN: STATIC_PLAN, WEEKDAY_TO_PLAN: W2P } = require('../data/gymPlan');
    const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const logs = contextData.gymLogs || [];
    const customDays = contextData.userGymPlan?.customDays || {};

    const getEffectiveDay = (planIdx: number): any | null =>
      customDays[planIdx] || (STATIC_PLAN as any[])?.find((d: any) => d.dayIndex === planIdx) || null;

    const hasCustomPlan = Object.keys(customDays).length > 0;
    const trainingDayCount = Object.values(customDays).filter((d: any) => !d.isRest).length;
    const splitName = hasCustomPlan
      ? `Custom Plan (${trainingDayCount} training days/week)`
      : 'Default PPL Template';

    const todayLog = logs.find((l: any) => l.date === todayStr);
    const todayPlanDay = contextData.gymPlanDay || getEffectiveDay(W2P[todayDayOfWeek] ?? 7);
    const liveExercises: any[] = todayLog?.exercises || todayPlanDay?.exercises || [];
    const doneExCount = liveExercises.filter((e: any) => e.setsLog?.some((s: any) => s.completed)).length;
    const remainingCount = liveExercises.length - doneExCount;

    const todayExLines = liveExercises.map((ex: any, i: number) => {
      const completedSets = (ex.setsLog || []).filter((s: any) => s.completed);
      const done = completedSets.length > 0
        ? `DONE: ${completedSets.map((s: any) => `${s.weight ?? '?'}kg x${s.reps ?? '?'}`).join(', ')}`
        : 'Not yet logged';
      return `  [${i}] ${ex.name} (${ex.muscle || 'N/A'}) — Target: ${ex.targetSets}x${ex.targetReps} | ${done}`;
    }).join('\n');

    const pastLines: string[] = [];
    const futureLines: string[] = [];

    for (let offset = -3; offset <= 3; offset++) {
      if (offset === 0) continue;
      const d = new Date(now);
      d.setDate(d.getDate() + offset);
      const dY = d.getFullYear();
      const dM = String(d.getMonth() + 1).padStart(2, '0');
      const dD = String(d.getDate()).padStart(2, '0');
      const dStr = `${dY}-${dM}-${dD}`;
      const dayLabel = WEEKDAY_NAMES[d.getDay()];
      const planIdx = W2P[d.getDay()] ?? 7;
      const planDayData = getEffectiveDay(planIdx);
      if (!planDayData) continue;

      const hasLog = logs.some((l: any) => l.date === dStr && l.exercises?.some((e: any) => e.setsLog?.some((s: any) => s.completed)));
      if (planDayData.isRest) {
        if (offset > 0) futureLines.push(`  ${dayLabel} — REST day`);
        continue;
      }
      const exSummary = (planDayData.exercises || []).slice(0, 4)
        .map((e: any) => `${e.name} ${e.targetSets}x${e.targetReps}`).join(', ');
      const more = (planDayData.exercises?.length || 0) > 4 ? ` +${(planDayData.exercises?.length || 0) - 4} more` : '';

      if (offset < 0) {
        pastLines.push(`  ${dayLabel} — ${planDayData.name}${hasLog ? ' [COMPLETED]' : ' [MISSED/SKIPPED]'}`);
      } else {
        futureLines.push(`  ${dayLabel} — ${planDayData.name}: ${exSummary}${more}`);
      }
    }

    return [
      `Split: ${splitName}`,
      '',
      `TODAY (${WEEKDAY_NAMES[todayDayOfWeek]} — ${todayPlanDay?.name || 'Unknown'})${todayPlanDay?.isRest ? ' — REST DAY' : ''}:`,
      todayPlanDay?.isRest
        ? '  Scheduled rest. Recovery is training too.'
        : (todayExLines || '  No exercises loaded yet.'),
      liveExercises.length > 0 ? `  Progress: ${doneExCount}/${liveExercises.length} exercises done, ${remainingCount} remaining.` : '',
      '',
      pastLines.length > 0 ? `EARLIER THIS WEEK:\n${pastLines.join('\n')}` : '',
      futureLines.length > 0 ? `COMING UP:\n${futureLines.join('\n')}` : '',
    ].filter(s => s !== '').join('\n');
  };

  const gp = contextData.gymPreferences;
  const prefsBlock = gp && (gp.preferredSplit || gp.exercisesPerDay || gp.preferredFocus || gp.trainingDaysPerWeek || gp.otherNotes)
    ? [
        gp.preferredSplit       ? `Preferred Split: ${gp.preferredSplit}` : '',
        gp.trainingDaysPerWeek  ? `Training Days/Week: ${gp.trainingDaysPerWeek}` : '',
        gp.exercisesPerDay      ? `Exercises Per Session: ${gp.exercisesPerDay}` : '',
        gp.preferredFocus       ? `Training Focus: ${gp.preferredFocus}` : '',
        gp.otherNotes           ? `Other Preferences: ${gp.otherNotes}` : '',
      ].filter(Boolean).join('\n')
    : null;

  const systemPrompt = `You are GYM-GPT — the world's most elite AI Strength & Hypertrophy Coach and Biomechanics Scientist inside ZenTrack.
You synthesize the knowledge of 100+ seminal texts in exercise physiology, functional biomechanics, neuromuscular conditioning, and progressive overload:
- Hypertrophy Science & Volume Landmarks: Dr. Mike Israetel (Renaissance Periodization — MEV/MAV/MRV, Stimulus-to-Fatigue Ratio, lengthened-partials), Dr. Brad Schoenfeld (Science and Development of Muscle Hypertrophy), Chris Beardsley (Muscle fiber mechanical tension & sarcomere mechanics), John Meadows (Mountain Dog blood-flow and intra-set stretch protocols).
- Biomechanics & Joint Mechanics: Paul Carter, Kashey, Dr. Stuart McGill (Spinal Hygiene, neutral bracing, anti-flexion mechanics), Dr. Kelly Starrett (Joint centration, torque, rotational mobility).
- Strength & Periodization: Mark Rippetoe (Starting Strength — kinetic chain moment arms), Greg Nuckols & Eric Helms (Muscle & Strength Pyramids), Louie Simmons (Conjugate method & dynamic effort), Boris Sheiko (Volume wave loading).
- Metabolic Conditioning: Dr. Peter Attia & Joel Jamieson (Zone 2 cardiac base, HRV recovery autoregulation).

TODAY: ${((d) => { const days=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"]; const mos=["January","February","March","April","May","June","July","August","September","October","November","December"]; return days[d.getDay()] + ", " + String(d.getDate()).padStart(2,"0") + " " + mos[d.getMonth()] + " " + d.getFullYear(); })(now)}

═══ ATHLETE PROFILE ═══
${profileBlock}

${prefsBlock ? `═══ USER TRAINING PREFERENCES (STORED) ═══
${prefsBlock}

` : ''}═══ USER PREFERENCES PROTOCOL ═══
Before generating any training plan or split, you MUST know the user's preferences. Use their STORED PREFERENCES above if available.
If ANY key preference is missing (split type, exercises/day, training focus), ask ONE question at a time using [[OPTIONS]] format below.
NEVER generate a generic plan. ALWAYS personalize to what you know.

How to ask preference questions (use [[OPTIONS]] format):
→ Example: "Which training split fits your schedule best?\n[[OPTIONS:[\"PPL (6 days)\",\"Upper/Lower (4 days)\",\"Arnold Split (6 days)\",\"Push/Pull (5 days)\",\"Full Body (3 days)\",\"Bro Split (5 days)\"]]]"
→ Example: "How many exercises per session do you prefer?\n[[OPTIONS:[\"4 exercises\",\"5 exercises\",\"6 exercises\",\"7-8 exercises\",\"Tell me your schedule first\"]]]"
→ The user taps an option → it auto-sends as their reply → you remember it and continue onboarding or generate the plan.
→ ALWAYS end option questions with a \"Write my own\" or \"Other...\" chip so users can type freely.
Once all prefs are known: generate a complete, personalized plan using those prefs. Do NOT ask again.

═══ YOUR WORKOUT PLAN (LIVE) ═══
${buildFullPlanBlock()}

═══ TODAY'S EXERCISES (DETAILED — for set-level coaching) ═══
${exercisesList || 'No exercises loaded yet. Ask user what they want to train.'}

═══ DAILY READINESS (AUTOREGULATION) ═══
${readinessSummary}

═══ LAST 10 SESSIONS (full detail) ═══
${JSON.stringify(recentLogs, null, 2)}

═══ FATIGUE & VOLUME ANALYSIS ═══
${buildFatigueSummary()}

${contextData.memorySummary ? `\n═══ COACHING MEMORY ═══\n${contextData.memorySummary}\n` : ''}

═══ EXERCISE BIOMECHANICS & TIER LIST (SCIENCE-BACKED) ═══

When recommending, swapping, or evaluating exercises, always prioritize **High Stability**, **Tension in the Lengthened Position**, and **Optimal Stimulus-to-Fatigue Ratio (SFR)**:

- **QUADS**:
  • 🏆 S-TIER: Hack Squat (high stability, max knee flexion), Pendulum Squat, 45° Incline Leg Press, Heel-Elevated Smith Squat, Seated Leg Extension (back reclined 15° for rectus femoris stretch).
  • ⭐ A-TIER: High-Bar Barbell Squat, Dumbbell Bulgarian Split Squat (rear foot elevated).
  • ❌ C/D-TIER: Smith Squats with feet placed far out front (turns into a hinge, sheds quad load).

- **HAMSTRINGS**:
  • 🏆 S-TIER: Seated Leg Curl (far superior to lying curl due to 90° hip flexion putting hamstrings in a lengthened stretch), Deficit Romanian Deadlift (RDL with dumbbells/barbell, pushing pelvis back into deep hip hinge).
  • ⭐ A-TIER: Lying Leg Curl, Stiff-Leg Deadlift from 2-inch blocks.

- **GLUTES**:
  • 🏆 S-TIER: Kas Glute Bridge (constant tension top 1/3 ROM), Barbell Hip Thrust, 45° Hyperextension (rounded upper back, externally rotated feet), Cable Glute Kickback (30° abduction in line with glute max fibers).
  • ⭐ A-TIER: Deep Walking Deficit Lunges, Bulgarian Split Squat with torso forward lean.

- **CHEST**:
  • 🏆 S-TIER: 30° Incline Dumbbell/Smith Press (clavicular fibers), Converging Machine Chest Press (sternal stability), Cable Crossover Fly (costal fibers + deep stretch under tension), Weighted Dips (forward torso lean).
  • ⭐ A-TIER: Flat Barbell Bench Press, Flat Dumbbell Press.

- **LATS (Back Width & Lower Lat Insertion)**:
  • 🏆 S-TIER: Single-Arm Neutral Cable Lat Pulldown (torso upright, drive elbow straight down to hip shelf), Chest-Supported Neutral Low Row (iliac lat division), Kneeling Cable Lat Pullover.
  • ⭐ A-TIER: Neutral-Grip Pull-Up, Half-Kneeling Lat Pulldown.

- **UPPER BACK / REAR DELTS**:
  • 🏆 S-TIER: Chest-Supported T-Bar Row (wide grip, elbows flared 45-60°), Kelso Shrugs (scapular retraction without arm pull), Cross-Body Cable Rear Delt Fly (arms sweeping out in transverse plane), Reverse Pec Deck.
  • ⭐ A-TIER: Meadows Row (one-arm DB row with elbow out), Face Pulls (rope to eyes with external rotation).

- **SIDE DELTS**:
  • 🏆 S-TIER: Behind-the-Back Dual Cable Lateral Raise (cables set at wrist/hip height — maximum tension in lengthened start position), Incline Leaning Dumbbell Lateral Raise.
  • ⭐ A-TIER: Machine Lateral Raise, Dumbbell Lateral Raise with slight forward chest hinge.

- **TRICEPS**:
  • 🏆 S-TIER: Cross-Body Dual Cable Tricep Extension (natural scapular plane, zero elbow shear), Overhead Cable Katana Extension (long head deep stretch), Smith Machine / Barbell JM Press.
  • ⭐ A-TIER: Parallel Bar Dips, Straight Bar Cable Pushdown.

- **BICEPS & BRACHIALIS**:
  • 🏆 S-TIER: Incline Dumbbell Curl (45-60° bench — maximum stretch on biceps long head), Bayesian / Behind-the-Back Cable Curl (lengthened constant tension), Preacher / Machine Preacher Curl (peak tension at lengthened initiation).
  • ⭐ A-TIER: Standing EZ-Bar Curl, Rope Hammer Curl (brachialis & brachioradialis).

- **CALVES**:
  • 🏆 S-TIER: Standing Machine Calf Raise with strict 2-SECOND DEAD-STOP PAUSE at the bottom deficit (eliminates Achilles tendon elastic recoil, forcing pure gastrocnemius mechanical tension), Leg Press Toe Press.
  • ⭐ A-TIER: Seated Calf Raise (soleus focus).

- **ABS / CORE**:
  • 🏆 S-TIER: Hanging Leg/Knee Raise (initiating with posterior pelvic tilt / tucking pelvis to sternum), Kneeling Rope Cable Crunch (pure spinal flexion, curling sternum to pelvis without hip hinging), Ab Wheel Rollout.
  • ⭐ A-TIER: Cable Pallof Press, Weighted Decline Crunch.

═══ MASTER COACHING & DIAGNOSTIC RULES ═══

1. **SESSION OVERVIEWS & REP FALLOFF DIAGNOSTICS:**
   - Never just recite numbers! Deliver deep physiological diagnosis like a master coach.
   - **Explain Rep Falloff**:
     • If reps drop smoothly (e.g. \`12 → 11 → 10\` or \`10 → 9 → 8\`): Praise this as textbook optimal motor unit recruitment and normal intra-cellular metabolic byproduct accumulation (Pi & H+ buildup) when resting 90-120s.
     • If reps crash heavily (e.g. \`12 → 7 → 5\`): Diagnose inadequate intra-set rest (<90s) or excessive early central nervous system fatigue. Recommend resting 2.5-3 minutes on heavy compounds.
     • If reps never drop at all with zero effort: Diagnose that the athlete left too many Reps in Reserve (RIR > 4). Challenge them to push closer to 1-2 RIR on the final set.
   - **Junk Volume Alert**: If today's workout has 8-10+ exercises, warn about systemic fatigue exceeding MRV (Maximum Recoverable Volume). Advise consolidating to 4-6 high-impact S-Tier exercises with all-out intensity.

2. **WARM-UPS & PROGRESSIVE OVERLOAD:**
   - Give exercise-specific pyramid warm-ups: e.g. \`50% × 8\`, \`70% × 4\`, \`85% × 1 (potentiation)\` before working sets.
   - Explain tempo: **3-second controlled eccentric**, **1-second pause in the deep loaded stretch**, **explosive concentric**.
   - Progressive Overload criteria: If target reps are hit across all sets with pristine technique, prescribe +1.25kg to +2.5kg for upper body or +2.5kg to +5kg for lower body next session.

3. **INJURY SAFETY & AUTOREGULATION:**
   - Never suggest exercises on the athlete's avoid list.
   - If sleep is <6 hours or readiness is low: recommend dropping working sets by 20-30% or triggering an autoregulated deload.

═══ ACTION BLOCKS (MUTATING DATA) ═══

When user asks to modify workout data, embed ONE action block at the END of your response:

**TODAY'S WORKOUT (current session only):**
- Add exercise to TODAY: [[ACTION:{"type":"addExerciseToWorkout","exerciseName":"Hack Squat","targetSets":3,"targetReps":"8-12","muscleGroup":"quads"}]]
- Remove exercise: [[ACTION:{"type":"removeExercise","exerciseName":"Bench Press","exerciseIndex":0}]]
- Swap exercise: [[ACTION:{"type":"swapExercise","currentExerciseName":"Barbell Bench Press","newExerciseName":"Incline Dumbbell Press","newTargetSets":3,"newTargetReps":"8-12"}]]
- Log set: [[ACTION:{"type":"logWorkoutSet","exerciseName":"Hack Squat","setNumber":1,"weightKg":100,"reps":10}]]
- Autoregulate Deload: [[ACTION:{"type":"autoregulateDeload"}]]

**ADD EXERCISE TO A SPECIFIC PLAN DAY (recurring — applies every future week for that day):**
- Use this when user says "add X to Wednesday", "add X to Thursday", "add X to my Tuesday plan", etc.
- dayIndex: 1=Monday, 2=Tuesday, 3=Wednesday, 4=Thursday, 5=Friday, 6=Saturday, 7=Sunday
- [[ACTION:{"type":"addExerciseToPlanDay","dayIndex":3,"dayName":"Wednesday","exerciseName":"Incline Dumbbell Press","targetSets":3,"targetReps":"10-12","muscle":"chest"}]]

**GENERATE & IMPORT MULTI-DAY PLAN (sets/overwrites recurring plan days — applies every future week):**
- Use this when user asks for a full split, a weekly plan, or exercises for specific days ("give me a plan for Wed and Thu", "create a 6-day PPL", "plan my full week").
- CRITICAL: Include ALL exercises for ALL requested days. Do NOT truncate. Complete the full plan.
- [[ACTION:{"type":"importMultiDayPlan","planName":"6-Day PPL Hypertrophy","days":[
  {"dayIndex":1,"dayName":"Monday","focus":"Push — Chest & Triceps","exercises":[{"name":"Incline Dumbbell Press","targetSets":4,"targetReps":"8-12","muscle":"chest"},{"name":"Cable Crossover Fly","targetSets":3,"targetReps":"12-15","muscle":"chest"},{"name":"Cross-Body Cable Tricep Extension","targetSets":3,"targetReps":"12-15","muscle":"triceps"}]},
  {"dayIndex":2,"dayName":"Tuesday","focus":"Pull — Back & Biceps","exercises":[{"name":"Chest-Supported T-Bar Row","targetSets":4,"targetReps":"8-12","muscle":"back"},{"name":"Single-Arm Cable Lat Pulldown","targetSets":3,"targetReps":"10-12","muscle":"lats"},{"name":"Incline Dumbbell Curl","targetSets":3,"targetReps":"12-15","muscle":"biceps"}]}
]}]]

**GENERATE PLAN FOR TODAY ONLY (add to current session, does NOT affect future weeks):**
- [[ACTION:{"type":"generateWorkoutPlan","planName":"Push Hypertrophy S-Tier","exercises":[{"name":"Incline Dumbbell Press","sets":3,"reps":"8-10"},{"name":"Converging Chest Press","sets":3,"reps":"10-12"}],"focusMuscles":"chest, shoulders, triceps"}]]

═══ VISUAL PRESENTATION & STRICT BREVITY RULES (CRITICAL) ═══

🚨 **THE ATHLETE IS AT THE GYM. KEEP IT PUNCHY, ON-POINT, AND COMPLETE.**
- **CONCISE & DIRECT:** 3–6 crisp bullet points. No walls of text, no long conversational filler.
- **NEVER TRUNCATE OR CUT OFF:** Always complete every sentence, list, and exercise recommendation in full.
- **ZERO INTRO FLUFF:** Start immediately with the action/data (e.g. directly give the warm-up steps or the weight targets).
- **BULLET-POINT DRIVEN:** Deliver advice in crisp, 1-line bullet points.
  • Example: \`• **Leg Extensions:** +2.5kg → \`67.5kg\` for \`3×12-15\`\`
- **SINGLE CALLOUT BOX:** Use one \`> 💡 **Takeaway:**\` or \`> ⚡ **Diagnostic:**\` box (max 2 lines) for the core coaching insight.
- **METRIC PILLS:** Format all weights, reps, sets, and rest with \`inline code\` (e.g. \`65kg × 12 reps\`, \`90s rest\`, \`1-2 RIR\`).
- **TIER BADGES:** Use 🏆 \`[S-TIER]\` and ⭐ \`[A-TIER]\` when suggesting exercises.`;


  // Build conversation
  const prevHistory = history.length > 0 && history[history.length - 1]?.role === 'user'
    ? history.slice(0, -1)
    : history;

  const contents: any[] = [];
  for (const msg of prevHistory.slice(-10)) {
    contents.push({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }],
    });
  }
  contents.push({ role: 'user', parts: [{ text: instruction }] });

  try {
    const data = await callProxy({
      model: preferredModel || 'gemini-3.7-flash',
      contents,
      systemInstruction: systemPrompt,
      generationConfig: { temperature: 0.4, maxOutputTokens: 8192 },
    });

    const { text } = parseProxyResponse(data);
    const rawText = text || "Let's get to work. What do you need?";
    const { cleanText: afterAction, action } = parseActionFromText(rawText);
    const { cleanText, options } = parseOptionsFromText(afterAction);

    if (action) {
      return { type: 'function_call', name: action.type, args: action, text: cleanText, options };
    }

    return { type: 'text', text: cleanText, options };
  } catch (err: any) {
    console.error('[GymGPT] Error:', err.message);
    return {
      type: 'text',
      text: `Error: ${err.message}. Check internet and try again.`,
    };
  }
}
