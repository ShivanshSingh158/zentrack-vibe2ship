/**
 * orchestrator.ts — ZenTrack Mobile AI Orchestrator
 *
 * Architecture (Direct Gemini — no backend server required):
 *   Mobile → callProxy() → generativelanguage.googleapis.com (direct, 9-key rotation)
 *
 * This replaces the old Socket.IO → Render backend bridge.
 * Sara now runs entirely on-device logic + direct Gemini API.
 *
 * Response pattern: [[ACTION:{...}]] JSON blocks for write operations.
 * The UI extracts these, shows a confirmation card, and writes to Firestore on confirm.
 *
 * Navigation: [NAVIGATE:ScreenName] appended to SPOKEN_SUMMARY for screen transitions.
 */

import { callProxy, parseProxyResponse } from '../services/geminiProxy';
import { parseActionFromText } from './saraAgent';
import { auth } from '../services/firebase';

// ─── AppContext ───────────────────────────────────────────────────────────────

export interface AppContext {
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
  googleAccessToken?: string;
  userId?: string;
}

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

// ─── System Prompt Builder ────────────────────────────────────────────────────

function buildSystemPrompt(ctx: AppContext): string {
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

  return `You are Sara, the warm, witty, and highly capable AI assistant inside ZenTrack. You manage the user's entire life — tasks, notes, habits, attendance, goals, calendar, assignments, gym, learning, and jobs.

TODAY: ${now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
TIME: ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
TOMORROW: ${tomorrowISO}

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

═══ RESPONSE RULES ═══

1. FULL READ ACCESS. NEVER say "I can't access your data". Read from context above.
2. For WRITE operations, embed exactly ONE action block: [[ACTION:{"type":"...","field":"value"}]]
3. Place the action block ANYWHERE — the UI shows a confirmation card before saving.
4. After text, append [SUGGEST: action 1 | action 2] with 2 relevant follow-ups.
5. For navigation requests, append [NAVIGATE:ScreenName] at end. Screens: Gym, Tasks, Habits, Calendar, Goals, Notes, Analytics, Attendance, Focus, Settings.
6. Tone: warm, direct, concise. Occasionally witty. Never verbose.

═══ DATE RULES ═══
"tomorrow" = ${tomorrowISO} | "morning" = 09:00 | "noon" = 12:00 | "afternoon" = 15:00 | "evening" = 18:00 | "night" = 21:00
Always use YYYY-MM-DD for dates, HH:MM for times.

═══ ACTION TYPES ═══

CREATE TASK:
[[ACTION:{"type":"createTask","title":"Buy milk","dueDate":"${tomorrowISO}","dueTime":"18:00","priority":"medium"}]]
priority: "low" | "medium" | "high" — dueTime is OPTIONAL.

DELETE TASK:
[[ACTION:{"type":"deleteTask","taskId":"TASK_ID_FROM_CONTEXT","taskTitle":"Task Title"}]]

COMPLETE TASK:
[[ACTION:{"type":"completeTask","taskId":"TASK_ID_FROM_CONTEXT","taskTitle":"Task Title"}]]

UPDATE TASK:
[[ACTION:{"type":"updateTask","taskId":"TASK_ID_FROM_CONTEXT","taskTitle":"Task Title","newDate":"YYYY-MM-DD","newTime":"14:00","newPriority":"high"}]]

CREATE NOTE:
[[ACTION:{"type":"createNote","title":"Note Title","content":"Note content"}]]

LOG HABIT:
[[ACTION:{"type":"logHabit","habitId":"HABIT_ID_FROM_CONTEXT","habitName":"Habit Name"}]]

MARK ATTENDANCE:
[[ACTION:{"type":"markAttendance","subjectId":"SUBJECT_ID_FROM_CONTEXT","subjectName":"Subject Name","status":"present","date":"${todayISO}"}]]

ADD CALENDAR EVENT:
[[ACTION:{"type":"addCalendarEvent","title":"Event Title","date":"${tomorrowISO}","startTime":"14:00","type":"todo"}]]

═══ RULES ═══
- For deleteTask/completeTask/logHabit/markAttendance: ALWAYS use IDs from context — never fabricate IDs.
- If task/habit/subject isn't in context, say so and ask for clarification.
- Only 1 action block per response.
- If user asks to create multiple tasks, do the most important one and tell them to ask again for the rest.`;
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
  history: { role: string; content: string }[] = []
): Promise<string> {

  // Notify UI that Sara is thinking with context-aware text
  const thinkingText = getDynamicThinkingText(instruction);
  onStep({ type: 'thinking', title: thinkingText });

  const systemPrompt = buildSystemPrompt(appContext);

  // Build conversation contents from history
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
      systemInstruction: systemPrompt,
      generationConfig: { temperature: 0.7, maxOutputTokens: 8192 },
    });

    const { text } = parseProxyResponse(data);
    const rawText = text || "I'm here — what's on your mind?";

    // Parse action block
    const { cleanText: textAfterAction, action } = parseActionFromText(rawText);
    const { cleanText: finalText, suggestions } = parseSuggestions(textAfterAction);

    if (action) {
      // Emit a proposed_action step so SaraScreen can show confirmation card
      onStep({
        type: 'proposed_action',
        actionType: action.type,
        action,
        title: finalText,
        suggestions,
      });
      return finalText || rawText;
    }

    onStep({ type: 'answer', title: finalText || rawText, suggestions });
    return finalText || rawText;

  } catch (err: any) {
    console.error('[Orchestrator] Gemini call failed:', err.message);
    const errMsg = `Sorry, I ran into an issue: ${err.message}. Please try again.`;
    onStep({ type: 'answer', title: errMsg });
    return errMsg;
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
