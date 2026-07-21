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

let _promptCache: { prompt: string; hash: string; builtAt: number } | null = null;

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

function buildSystemPrompt(ctx: AppContext, toneDirective: string, responseStyle: string, memorySummary: string): string {
  // O6 FIX: Cache the system prompt with a 30-second TTL based on data fingerprint
  // to avoid serializing 500+ tasks/logs on every chat message.
  const hash = _buildPromptFingerprint(ctx) + '|' + (memorySummary?.length || 0);
  if (_promptCache && _promptCache.hash === hash && Date.now() - _promptCache.builtAt < 30000) {
    return _promptCache.prompt;
  }

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

  const prompt = `You are Sara, the warm, witty, and highly capable AI assistant inside ZenTrack. You manage the user's entire life — tasks, notes, habits, attendance, goals, calendar, assignments, gym, learning, and jobs.

${toneDirective}
${responseStyle}

TODAY: ${now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
TIME: ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
TOMORROW: ${tomorrowISO}

${memorySummary ? `\n${memorySummary}\n` : ''}

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

${buildActionRules(tomorrowISO, todayISO)}`;

  _promptCache = { prompt, hash, builtAt: Date.now() };
  return prompt;
}

// ─── Selective System Prompt Builder (IRCI — Capability 2) ───────────────────

function buildSelectiveSystemPrompt(
  ctx: AppContext,
  selectiveContext: string,
  toneDirective: string,
  responseStyle: string,
  memorySummary: string,
): string {
  const now = new Date();
  const todayISO = now.toISOString().split('T')[0];
  const tomorrowISO = new Date(now.getTime() + 86_400_000).toISOString().split('T')[0];

  return `You are Sara, the warm, witty, and highly capable AI assistant inside ZenTrack.

${toneDirective}
${responseStyle}

TODAY: ${now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
TIME: ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
TOMORROW: ${tomorrowISO}

${memorySummary ? `\n${memorySummary}\n` : ''}

═══ RELEVANT APP CONTEXT (IRCI-filtered) ═══
${selectiveContext}

${buildActionRules(tomorrowISO, todayISO)}`;
}

function buildActionRules(tomorrowISO: string, todayISO: string): string {
  return `═══ RESPONSE RULES ═══

1. FULL READ ACCESS. NEVER say "I can't access your data". Read from context above.
2. For simple chat or a SINGLE action, just respond conversationally and optionally embed exactly ONE action block: [[ACTION:{"type":"...","field":"value"}]]
3. SUPERVISOR MODE: If the user's request requires MULTIPLE actions, or searching the WEB, you MUST break it down into a Directed Acyclic Graph (DAG) of tasks. 
4. Output the DAG as a single JSON block: [[DAG:[{"id":"1","type":"search_web","description":"..."},{"id":"2","type":"create_task","description":"...","dependsOn":["1"]}]]]
5. After text, append [SUGGEST: action 1 | action 2] with 2 relevant follow-ups.
6. For navigation requests, append [NAVIGATE:ScreenName] at end. Screens: Gym, Tasks, Habits, Calendar, Goals, Notes, Analytics, Attendance, Focus, Settings.
7. Tone: warm, direct, concise. Occasionally witty. Never verbose.

═══ DATE RULES ═══
"tomorrow" = ${tomorrowISO} | "morning" = 09:00 | "noon" = 12:00 | "afternoon" = 15:00 | "evening" = 18:00 | "night" = 21:00
Always use YYYY-MM-DD for dates, HH:MM for times.

═══ FAST SINGLE ACTION TYPES ═══
CREATE TASK: [[ACTION:{"type":"createTask","title":"...","dueDate":"${tomorrowISO}","dueTime":"18:00","priority":"medium"}]]
DELETE TASK: [[ACTION:{"type":"deleteTask","taskId":"ID","taskTitle":"..."}]]
COMPLETE TASK: [[ACTION:{"type":"completeTask","taskId":"ID","taskTitle":"..."}]]
UPDATE TASK: [[ACTION:{"type":"updateTask","taskId":"ID","taskTitle":"...","newDate":"YYYY-MM-DD"}]]
CREATE NOTE: [[ACTION:{"type":"createNote","title":"...","content":"..."}]]
LOG HABIT: [[ACTION:{"type":"logHabit","habitId":"ID","habitName":"..."}]]
MARK ATTENDANCE: [[ACTION:{"type":"markAttendance","subjectId":"ID","subjectName":"...","status":"present","date":"${todayISO}"}]]
ADD CALENDAR EVENT: [[ACTION:{"type":"addCalendarEvent","title":"...","date":"${tomorrowISO}","startTime":"14:00","type":"todo"}]]
DELETE CALENDAR EVENT: [[ACTION:{"type":"deleteCalendarEvent","eventId":"ID"}]]
CREATE HABIT: [[ACTION:{"type":"createHabit","name":"...","emoji":"💧","frequency":"daily","color":"#007AFF"}]]
CREATE SUBJECT: [[ACTION:{"type":"createSubject","name":"...","code":"...","targetPercentage":75,"schedule":[{"day":"Monday","time":"10:00 AM","type":"class","room":"101"}]}]]

═══ DAG NODE TYPES (MULTI-STEP ONLY) ═══
search_web: For searching the live internet. Use this to find current events, facts, weather, etc.
create_task / delete_task / complete_task: For task management.
create_note: For taking notes.
log_habit / create_habit: For habit tracking.
mark_attendance / create_subject: For academic attendance.
add_calendar_event / delete_calendar_event: For scheduling.

═══ RULES ═══
- For delete/complete operations, ALWAYS use IDs from context.
- If using DAG, you can execute up to 4 tasks in parallel by excluding 'dependsOn'.
- Only 1 [[DAG:...]] OR 1 [[ACTION:...]] block per response.`;
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

  // ── Cap 1: Load CMG memory summary (async, from cache) ──────────────────
  let memorySummaryText = appContext.memorySummary || '';
  if (userId && !memorySummaryText) {
    try {
      memorySummaryText = await buildMemorySummary(userId);
    } catch (e) {
      // Non-critical — continue without memory
    }
  }

  // ── Cap 7: Load BFE fingerprint for tone + context ───────────────────────
  let toneDirective = 'Tone: balanced, warm, helpful.';
  let responseStyle = 'Format: 1-3 sentences max. Concise.';
  try {
    if (userId) {
      const fingerprint = await getFingerprint(userId);
      toneDirective = getSaraToneDirective(fingerprint);
      responseStyle = getSaraResponseStyle(fingerprint);

      // Cap 4: Reasoning step — fingerprint loaded
      onStep({
        type: 'reasoning_step',
        title: `🎭 Tone adapted: ${fingerprint.streakPersonality}`,
      });
    }
  } catch (e) {
    // Non-critical
  }

  // ── Cap 2: IRCI — classify intent + build selective context ─────────────
  let systemPrompt: string;
  try {
    const fingerprint = userId ? await getFingerprint(userId).catch(() => null) : null;
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
      );
      console.log(`[IRCI] Selective mode: domains=${intentProfile.primaryDomains.join(',')}, confidence=${intentProfile.confidence.toFixed(2)}`);
    } else {
      // Fallback: full context for complex/ambiguous queries
      systemPrompt = buildSystemPrompt(appContext, toneDirective, responseStyle, memorySummaryText);
      console.log(`[IRCI] Full context mode: confidence=${intentProfile.confidence.toFixed(2)}`);
    }
  } catch (e) {
    // Fallback to full prompt on any IRCI error
    systemPrompt = buildSystemPrompt(appContext, toneDirective, responseStyle, memorySummaryText);
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
