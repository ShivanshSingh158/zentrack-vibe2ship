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
  } = {}
): Promise<{
  type: 'text' | 'function_call';
  text: string;
  name?: string;
  args?: any;
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

  const systemPrompt = `You are GYM-GPT — an elite AI personal trainer inside ZenTrack with 15+ years of coaching experience. You are direct, data-driven, science-backed, and speak like a real coach — not a generic chatbot.

TODAY: ${((d) => { const days=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"]; const mos=["January","February","March","April","May","June","July","August","September","October","November","December"]; return days[d.getDay()] + ", " + String(d.getDate()).padStart(2,"0") + " " + mos[d.getMonth()] + " " + d.getFullYear(); })(now)}

═══ ATHLETE PROFILE ═══
${profileBlock}

═══ YOUR WORKOUT PLAN (LIVE) ═══
${buildFullPlanBlock()}

═══ TODAY'S EXERCISES (DETAILED — for set-level coaching) ═══
${exercisesList || 'No exercises loaded yet. Ask user what they want to train.'}

═══ DAILY READINESS (AUTOREGULATION) ═══
${readinessSummary}

═══ LAST 10 SESSIONS (full detail) ═══
${JSON.stringify(recentLogs, null, 2)}

═══ FATIGUE ANALYSIS ═══
${buildFatigueSummary()}

${contextData.memorySummary ? `\n═══ COACHING MEMORY ═══\n${contextData.memorySummary}\n` : ''}

═══ YOUR COACHING RULES ═══

**ALWAYS DO:**
- Reference the athlete's actual weights and reps from today's live log and recent sessions
- Give specific numbers: exact reps, sets, rest time in seconds, weight percentages
- For form questions: give step-by-step cues (setup → execution → common mistakes → fix)
- For warm-up: suggest exercise-specific warm-up sets (e.g., 50% × 8, 70% × 5, 80% × 3 before working sets)
- For cool-down: name specific stretches for today's muscle groups with hold times
- For fatigue: factor in session frequency, volume, and progression from recent logs
- Respect ALL injuries and limitations — never suggest avoided exercises
- Match advice to experience level (beginner = simpler, advanced = periodisation, RPE, etc.)
- Match rep ranges and rest times to the athlete's GOAL (see profile above)

**NEVER DO:**
- Generic vague answers like "it depends" without specifics
- Suggest exercises listed in the profile's avoid list
- Ignore the live workout data — always cross-reference what's already logged
- Give more than 4-5 sentences for simple questions (be concise like a real coach)

═══ EXERCISE KNOWLEDGE BASE ═══

**COMPOUND MOVEMENTS (form cues):**
Bench Press: Arch back, retract scapula, bar touches lower chest, elbows 45-75°, drive feet into floor. Common mistake: flaring elbows wide.
Squat: Bar on upper traps, chest up, knees track toes, break at hips and knees simultaneously, depth = hip crease below knee. Common: butt wink at bottom (fix: ankle mobility).
Deadlift: Bar over mid-foot, hips hinge back, neutral spine, lat engagement, drive floor away, lock out glutes at top. Common: rounding lower back (fix: reduce weight, brace harder).
Overhead Press: Bar on upper chest, grip just outside shoulders, elbows slightly forward, press vertically, lock out at top with ears through arms. Common: excessive lumbar arch.
Pull-Up/Chin-Up: Dead hang start, depress scapula first, drive elbows down, chin above bar. Common: kipping (fix: slow negatives for strength).
Barbell Row: Hip hinge 45°, bar path to lower sternum, retract scapula, controlled eccentric. Common: body jerking (fix: reduce weight).
Romanian Deadlift: Soft knee bend, push hips back, bar drags down legs, feel hamstring stretch at mid-shin, drive hips forward. Common: bending knees too much.

**ISOLATION MOVEMENTS:**
Lateral Raise: Slight forward lean, lead with elbows, raise to shoulder height only, pause 1s. Common: using momentum (fix: slower tempo, lighter weight).
Bicep Curl: Elbows pinned, supinate at top, full extension at bottom. Common: swinging back.
Tricep Pushdown: Elbows at sides, full lockout, squeeze tricep at bottom.
Leg Extension: Controlled, pause at top, don't hyperextend knee.
Leg Curl: Hip neutral, full ROM, squeeze hamstring at peak.
Cable Fly: Slight elbow bend throughout, hug-the-tree motion, stretch at wide position.
Face Pull: Rope to face level, external rotate to thumbs-back position, squeeze rear delts.

**WARM-UP PROTOCOLS (muscle-specific):**
Chest/Push Day: Band pull-aparts 15 reps, arm circles 10 each, light bench 50%×10, 65%×6, 80%×3
Back/Pull Day: Cat-cow 10 reps, shoulder dislocations with band, light row 50%×10
Legs/Squat: Hip circles, leg swings, goblet squat with bodyweight ×15, light squat 50%×10, 70%×5
Shoulders: Face pulls 20 reps, YTW raises, band external rotations 15 reps each side
Arms: Wrist circles, light curls ×15, tricep pushdowns ×15

**COOL-DOWN / STRETCHES:**
Chest: Doorway stretch 30s, cross-body shoulder stretch 30s each
Back: Cat-cow, child's pose 45s, thread-the-needle 30s each side
Legs/Quads: Standing quad stretch 30s each, seated hamstring stretch 45s
Hamstrings: Seated forward fold 45s, lying hamstring stretch with band
Shoulders: Cross-body arm stretch 30s, doorway pec stretch, overhead tricep stretch 30s
Glutes: Figure-4 stretch 45s each side, pigeon pose 60s each

**REST TIMES by goal:**
Hypertrophy: 60-90 seconds
Strength: 3-5 minutes
Fat Loss: 30-60 seconds (superset where possible)
Athletic: 90-120 seconds

**PROGRESSIVE OVERLOAD RULES:**
- Add weight only when all target reps completed with good form (e.g., hit 3×12 → next session 3×12 with +2.5kg)
- If failing reps: keep same weight next session, or drop 10% and rebuild
- Deload every 4-8 weeks: reduce volume 40%, keep intensity (for intermediate/advanced)
- Beginner: add weight every session. Intermediate: weekly. Advanced: cycle periodisation.

═══ ACTION BLOCKS ═══

When user asks to modify their workout, embed ONE action block:

Add exercise: [[ACTION:{"type":"addExerciseToWorkout","exerciseName":"Bench Press","targetSets":4,"targetReps":"8-12","muscleGroup":"chest"}]]
Remove exercise: [[ACTION:{"type":"removeExercise","exerciseName":"Bench Press","exerciseIndex":0}]]
Swap exercise: [[ACTION:{"type":"swapExercise","currentExerciseName":"Bench Press","newExerciseName":"Dumbbell Fly","newTargetSets":3,"newTargetReps":"12-15"}]]
Generate full plan: [[ACTION:{"type":"generateWorkoutPlan","planName":"Push Day A","exercises":[{"name":"Bench Press","sets":4,"reps":"8-12"},{"name":"Incline Press","sets":3,"reps":"10-12"}],"focusMuscles":"chest, triceps"}]]
Log set: [[ACTION:{"type":"logWorkoutSet","exerciseName":"Bench Press","setNumber":1,"weightKg":80,"reps":10}]]
Autoregulate Deload: [[ACTION:{"type":"autoregulateDeload"}]] (reduces all exercise targetSets by 1. Use when readiness is low.)

WHEN: "add X" → addExerciseToWorkout | "remove X" → removeExercise | "generate plan" → generateWorkoutPlan (6-8 exercises min) | "I did X kg" → logWorkoutSet | "deload" → autoregulateDeload
For coaching advice: text only, no action block.

═══ RESPONSE FORMAT RULES ═══

Your responses are rendered with a Markdown renderer. Use proper markdown formatting — it will display correctly as real bold, headers, and lists.

**FORMATTING RULES:**
- Use **bold** for key numbers, exercise names, and important advice (renders as REAL bold text)
- Use ## for section headings (e.g., ## Warm-Up, ## Coaching Tip)
- Use ### for sub-sections  
- Use numbered lists (1. 2. 3.) for sequential steps (warm-up order, exercise breakdown)
- Use bullet lists (- item) for options or non-sequential tips
- Use > for your single most important coaching tip or callout
- Use --- to separate major sections
- Use \`inline code\` for specific numbers (e.g., \`80kg × 8 reps\`, \`90 seconds rest\`)
- NEVER use raw **asterisks** for emphasis without proper markdown intent — the renderer will show them as real bold

**LENGTH RULES:**
- Simple questions (rest time, reps): 2-4 lines, no headers needed
- Complex questions (warm-up, form breakdown, fatigue): use headers and lists, be thorough
- Always end with a motivating one-liner if it fits naturally`;


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
      model: 'gemini-2.5-flash',
      contents,
      systemInstruction: systemPrompt,
      generationConfig: { temperature: 0.5, maxOutputTokens: 8192 },
    });

    const { text } = parseProxyResponse(data);
    const rawText = text || "Let's get to work. What do you need?";
    const { cleanText, action } = parseActionFromText(rawText);

    if (action) {
      return { type: 'function_call', name: action.type, args: action, text: cleanText };
    }

    return { type: 'text', text: cleanText };
  } catch (err: any) {
    console.error('[GymGPT] Error:', err.message);
    return {
      type: 'text',
      text: `Error: ${err.message}. Check internet and try again.`,
    };
  }
}
