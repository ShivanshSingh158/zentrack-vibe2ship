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
  | 'logWorkoutSet';

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

  const systemPrompt = `You are Sara, the warm, witty, and highly capable AI assistant inside ZenTrack. You manage the user's entire life — tasks, notes, habits, attendance, goals, calendar, assignments, gym, learning, jobs, and health.

TODAY: ${now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
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
    tasks?: any[];
    habits?: any[];
    notes?: any[];
    googleAccessToken?: string;
    memorySummary?: string;
  } = {}
): Promise<{
  type: 'text' | 'function_call';
  text: string;
  name?: string;
  args?: any;
}> {
  const now = new Date();
  const exercisesList = (contextData.exercises || [])
    .map((ex: any, i: number) => `[${i}] ${ex.name} — ${ex.targetSets}×${ex.targetReps}`)
    .join('\n');

  const recentLogs = (contextData.gymLogs || []).slice(0, 5).map((log: any) => ({
    date: log.date,
    exercises: (log.exercises || []).map((e: any) => `${e.name}: ${(e.setsLog || []).length} sets`),
  }));

  const systemPrompt = `You are GYM-GPT, an elite AI coach inside ZenTrack's gym module. You are direct, science-backed, and motivating.

Today: ${now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
Workout: ${contextData.workoutDayName || "Today's Session"}

CURRENT WORKOUT EXERCISES:
${exercisesList || 'No exercises loaded yet.'}

RECENT GYM HISTORY:
${JSON.stringify(recentLogs)}

USER GOALS: ${JSON.stringify((contextData.goals || []).slice(0, 5))}

${contextData.memorySummary ? `\n═══ GYM MEMORY (from previous sessions) ═══\n${contextData.memorySummary}\n` : ''}

When the user asks you to perform an action on their workout, include an action block:
[[ACTION:{...}]]

The user will confirm before anything changes. After the action block, write 1 short motivating line.

ACTION TYPES:
- Add exercise: [[ACTION:{"type":"addExerciseToWorkout","exerciseName":"Bench Press","targetSets":4,"targetReps":"8-12","muscleGroup":"chest"}]]
- Remove exercise: [[ACTION:{"type":"removeExercise","exerciseName":"Bench Press","exerciseIndex":0}]]
- Swap exercise: [[ACTION:{"type":"swapExercise","currentExerciseName":"Bench Press","newExerciseName":"Dumbbell Fly","newTargetSets":3,"newTargetReps":"12-15"}]]
- Generate full plan: [[ACTION:{"type":"generateWorkoutPlan","planName":"Push Day A","exercises":[{"name":"Bench Press","sets":4,"reps":"8-12"},{"name":"Incline Press","sets":3,"reps":"10-12"}],"focusMuscles":"chest, triceps"}]]
- Log set: [[ACTION:{"type":"logWorkoutSet","exerciseName":"Bench Press","setNumber":1,"weightKg":80,"reps":10}]]

WHEN: "add X" → addExerciseToWorkout | "remove X" → removeExercise | "generate plan" → generateWorkoutPlan (6-8 exercises min) | "I did X kg" → logWorkoutSet
For advice (form, rest time, nutrition): text only, no action block.
Keep answers to 2-4 sentences. Use numbers. Be direct.`;

  // Build conversation — gymModal passes historyRef which already includes current user message
  // Remove the last user entry (current message) so we don't duplicate it
  const prevHistory = history.length > 0 && history[history.length - 1]?.role === 'user'
    ? history.slice(0, -1)
    : history;

  const contents: any[] = [];
  for (const msg of prevHistory.slice(-8)) {
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
