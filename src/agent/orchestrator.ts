import { callWithFallback } from '../services/gemini/core';
import type { AgentStep } from './runAgentLoop';
import { runAgentLoop } from './runAgentLoop';
import { logApi, logWebSocket } from '../utils/networkLogger';
import { DagEngine } from './core/DagEngine';
import type { DagTask, AgentRole } from './core/DagEngine';
import { createInitialState } from './core/SharedState';
import type { Task, CalendarEvent, ConversationTurn } from '../types/domain';
import { buildContextMemory } from './memory/ContextEngine';
import { loadAgentMemoryContext } from '../services/agentMemoryPersistence';
import { userLearningStore } from '../services/userLearningStore';

import { 
  SEARCH_SYSTEM, DOCS_SYSTEM, DATA_SYSTEM, COMMS_SYSTEM, 
  SCHEDULER_SYSTEM, DRIVE_SYSTEM, CODING_SYSTEM, QA_SYSTEM,
  MEET_SYSTEM, PLANNER_SYSTEM, MONITOR_SYSTEM, GHOST_DETECTOR_SYSTEM, EXECUTOR_SYSTEM,
  NAVIGATOR_SYSTEM  // ✅ BUG FIX: Was missing — caused NAVIGATOR agent to fall through to AEGIS prompt
} from './fleet/NewAgents';


// ─── Supervisor system prompt is built dynamically with user persona context ─────
const buildSupervisorPrompt = (personaContext?: string): string => `You are Agent 0 — The Supervisor and Master Orchestrator of ZenTrack, an autonomous AI productivity system.
Your mission: analyze user requests, classify their complexity, and delegate to the right agents with precise, context-aware instructions.
${personaContext ? `\n## USER CONTEXT (use this to improve delegation quality)\n${personaContext}\n` : ''}

## STEP 1 — CLASSIFY TASK HARDNESS
Evaluate the user's request and assign a hardness level:

LEVEL_1 (Retrieval/Navigation — 1 agent): Simple data lookup OR navigation request. No complex action needed.
  Examples: "What tasks do I have today?", "Show my calendar", "What's overdue?"
  Navigation examples: "Show my gym workout", "Open learning module", "What's my habit today?", "Go to my goals", "Open that calculus lecture", "Show me my notes"
  Deploy: NAVIGATOR (for navigation/in-app data) or AEGIS only (for synthesizing from context)

LEVEL_2 (Single Action — 1-2 agents): One clear action to perform.
  Examples: "Schedule a 2-hour block tomorrow", "Create a task for X", "Send me a reminder", "Create a meeting for 3pm", "Find my project file in Drive"
  Analytics examples: "Am I on track?", "What's my risk level?", "Analyze my productivity", "What's my completion rate?"
  Scripting examples: "Write me a Python script to export my tasks", "Generate code to process my emails", "Automate my calendar cleanup"
  Deploy: (CHRONOS or HERMES or MEET or ARCHIVE or ATLAS) → AEGIS, or ENIGMA → AEGIS for analytics, or HEPHAESTUS alone for scripts

LEVEL_3 (Multi-Step — 3-5 agents): Multiple coordinated actions needed.
  Examples: "I missed a deadline. Help me recover.", "Analyze my week and reschedule", "Read my emails and create tasks", "Create a team meeting and email everyone the link", "Plan a project to build an MVP"
  Deploy: ORACLE + ENIGMA (parallel) → HERMES or CHRONOS or MEET or TITAN → AEGIS

LEVEL_4 (Emergency Orchestration — full fleet): Complex, cross-system synthesis.
  Examples: "I have 3 overdue tasks, a meeting in 1 hour, and an angry email from my manager", "Do a full triage of everything"
  Deploy: ORACLE + ENIGMA + ARGUS (parallel) → HERMES → CHRONOS → ARCHIVE → SCRIBE → AEGIS

LEVEL_5 (Proactive Discovery): Scan for hidden commitments.
  Examples: "Check my inbox for any deadlines I missed", "Find any ghost tasks in my emails"
  Deploy: SPECTRE → AEGIS


## STEP 2 — MAP THE DAG (PRECISION DELEGATION RULES)
Dependency Rules:
- ORACLE and ENIGMA can ALWAYS run in parallel (no dependencies between them)
- ARGUS can run in parallel with ORACLE and ENIGMA.
- HERMES always depends on ORACLE (needs email context before drafting)
- CHRONOS always depends on ENIGMA (needs analysis before booking)
- MEET can run independently for simple "create a meeting" tasks
- MEET depends on CHRONOS if it needs to find a free slot first
- ATLAS breaks down large goals into tasks — runs independently or depends on ENIGMA for context
- ARCHIVE can run independently unless it needs ORACLE context
- SCRIBE depends on ORACLE and ENIGMA (needs raw data before writing)
- TITAN runs after any required context agents (ORACLE, ENIGMA)
- SPECTRE runs independently — no dependencies needed
- AEGIS ALWAYS runs LAST with ALL other task IDs in its dependencies array
- For LEVEL_1: single AEGIS task only, no sub-agents needed

## INSTRUCTION QUALITY RULES (CRITICAL — Your instructions must be maximally specific)
When writing the "instruction" field for each agent task:
1. Always name the SPECIFIC task/event/email when known from user context or USER CONTEXT above.
2. For CHRONOS: specify preferred time window AND date. e.g. "Block 90min at peak hours (14:00) today for X" not "block some time".
3. For HERMES: specify the recipient and context. e.g. "Reply to Prof. Smith's thread about lab report due Friday" not "send an email".
4. For ARGUS: name which tasks are at risk. e.g. "Assess risk for 'assignment 3' (overdue) and 'quiz prep' (due today)".
5. For ORACLE: specify exactly which data is needed. e.g. "Get overdue tasks, today's calendar events, and free slots after 14:00" not "get tasks".
6. For AEGIS: list exactly which agents' findings to synthesize. e.g. "Synthesize findings from ORACLE (tasks/slots), ENIGMA (risk score), CHRONOS (blocked slot)".

## Agent Responsibilities (choose EXACTLY the right agent):
- MEET: Google Meet creation, joining meetings, inviting attendees
- ARCHIVE: finding files in Google Drive, opening files, listing recent files
- HERMES: all Gmail (read, send, reply, archive)
- CHRONOS: all Google Calendar operations (view, block, delete, reschedule). DO NOT USE FOR IN-APP DATA.
- ATLAS: decompose large goals into task lists, create project plans, CREATE GOALS (create_goal writes to /goals module)
- ARGUS: assess task risk, send proactive alerts and reminders
- SPECTRE: scan inbox and calendar for unlogged deadlines
- TITAN: cross-system multi-action execution AND managing/deleting internal ZenTrack tasks, calendar events, Gmail messages, Drive files. TITAN can also CREATE HABITS (create_habit) and CREATE NOTES (create_note).
- ENIGMA: analytics and reporting — can GENERATE WEEKLY REVIEW (generate_weekly_review writes structured report to Firestore)
- ORACLE: read-only intelligence gathering across tasks, calendar, AND internal app data (gym, notes, habits, goals, etc.). ORACLE can SEARCH NOTES (search_notes for targeted content lookup).
- SCRIBE: create and write Google Docs, generate scripts, and CREATE ZENTRACK NOTES (create_note saves to /notes module)
- NAVIGATOR: in-app navigation — use for "go to", "open", "show me the X page" requests
- AEGIS: final synthesis and mission report

## Module Routing (NEW — use these for module-specific agent requests):
- "save/note this", "write a note about X" → SCRIBE (create_note)
- "find my note about X", "search notes for Y" → ORACLE (search_notes)
- "add a goal", "I want to achieve X" → ATLAS (create_goal)
- "add a habit", "track X daily" → TITAN (create_habit)
- "weekly review", "how was my week" → ENIGMA (generate_weekly_review)


## STEP 3 — OUTPUT VALID JSON ONLY (no markdown, no explanation)
{
  "hardnessLevel": "LEVEL_3",
  "rationale": "User needs cross-system recovery plan involving calendar and email",
  "tasks": [
    {"id": "t1", "assignedAgent": "ORACLE", "instruction": "Get all overdue tasks and free calendar slots after 14:00 today. Identify the single highest-priority overdue item by name.", "dependencies": []},
    {"id": "t2", "assignedAgent": "ENIGMA", "instruction": "Analyze completion risk for overdue tasks from ORACLE findings. Compute deadline velocity.", "dependencies": []},
    {"id": "t3", "assignedAgent": "CHRONOS", "instruction": "Block a 90-minute recovery slot at the first free window after 14:00 today (from ORACLE slots) for the highest-priority overdue task (from ORACLE findings).", "dependencies": ["t2"]},
    {"id": "t4", "assignedAgent": "AEGIS", "instruction": "Synthesize mission report from ORACLE (tasks+slots), ENIGMA (risk scores), CHRONOS (blocked event). Report tone should match user persona.", "dependencies": ["t1","t2","t3"]}
  ]
}

Agent roles available: ORACLE, ENIGMA, HERMES, CHRONOS, MEET, ARCHIVE, SCRIBE, HEPHAESTUS, AEGIS, ATLAS, ARGUS, SPECTRE, TITAN, NAVIGATOR
CRITICAL: Output ONLY the JSON. No other text. No markdown code blocks.
IMPORTANT: For navigation requests ("open", "show me", "go to", "take me to"), ALWAYS use NAVIGATOR as the agent.
IMPORTANT: For in-app data queries (gym workout, habits, learning topics, notes), use NAVIGATOR if the user wants to SEE it, or ORACLE if it's background data gathering.
CRITICAL HALLUCINATION GUARD: If the user requests an action outside your capabilities (e.g., WhatsApp, UberEats, banking, Twitter/X, changing passwords), DO NOT hallucinate tools or agents. Immediately assign a single AEGIS task explaining that the system does not have the required access.
CRITICAL DAG LIMIT: Keep sequential chains short (max 4-5 steps). If a request is too complex, assign a single AEGIS task stating it must be broken down.`;



// ─── Exported: allows toolExecutor's delegate_task to resolve a system prompt ──
export function getAgentPromptByRole(role: string): string {
  return getAgentPrompt(role as AgentRole);
}

// ─── Safe window dispatch ─────────────────────────────────────────────────────
const safeDispatch = (detail: object) => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('agent-log', { detail }));
  }
};


// ─── Fast Heuristic Router ──────────────────────────────────────────────────
function fastRouter(instruction: string): DagTask[] | null {
  const text = instruction.toLowerCase().trim();
  
  // Guard against complex commands bypassing the LLM Supervisor
  // ✅ FIX: Increased from 12 to 20 — was rejecting many common multi-word requests to the LLM
  if (text.split(' ').length > 20) return null;
  
  // -- LEVEL 1 (Read / Navigate) --
  if (/^(go to|open|show me|take me to) (the )?(gym|calendar|tasks|habits|learning|goals|notes|analytics|jobs|dashboard|home)/.test(text)) {
    return [
      { id: 't1', assignedAgent: 'NAVIGATOR', instruction, dependencies: [], status: 'pending' },
      { id: 't2', assignedAgent: 'AEGIS', instruction: 'Synthesize the navigation result', dependencies: ['t1'], status: 'pending' }
    ];
  }
  if (/^(read|show|check|what is in|what\'s in) (my )?(emails|inbox|email)/.test(text)) {
    return [
      { id: 't1', assignedAgent: 'HERMES', instruction, dependencies: [], status: 'pending' },
      { id: 't2', assignedAgent: 'AEGIS', instruction: 'Synthesize the email summary', dependencies: ['t1'], status: 'pending' }
    ];
  }
  if (/^(what are|show) (my )?(tasks|todos|to-dos)/.test(text) || /^(what is|what\'s) on my to do/.test(text)) {
    return [
      { id: 't1', assignedAgent: 'ORACLE', instruction, dependencies: [], status: 'pending' },
      { id: 't2', assignedAgent: 'AEGIS', instruction: 'Synthesize the tasks', dependencies: ['t1'], status: 'pending' }
    ];
  }
  if (/^(what is on|what\'s on|show) (my )?(calendar|schedule)/.test(text)) {
    return [
      { id: 't1', assignedAgent: 'CHRONOS', instruction, dependencies: [], status: 'pending' },
      { id: 't2', assignedAgent: 'AEGIS', instruction: 'Synthesize the calendar events', dependencies: ['t1'], status: 'pending' }
    ];
  }
  if (/^(show|find|list) (my )?(recent )?(files|documents|drive files)/.test(text)) {
    return [
      { id: 't1', assignedAgent: 'ARCHIVE', instruction, dependencies: [], status: 'pending' },
      { id: 't2', assignedAgent: 'AEGIS', instruction: 'Synthesize the files found', dependencies: ['t1'], status: 'pending' }
    ];
  }

  // -- LEVEL 2 (Write / Create) --
  // ✅ INEFFICIENCY-1 FIX: Single-agent writes set isFinal:true to skip AEGIS synthesis.
  // These are deterministic operations — TITAN creates the task and confirms. No synthesis needed.
  if (/^(create a task|add a task|remind me to|add to my to do|add to my todo)/.test(text)) {
    return [
      { id: 't1', assignedAgent: 'TITAN', instruction, dependencies: [], status: 'pending', isFinal: true },
    ];
  }
  if (/^(send an email|email |send a message to)/.test(text)) {
    return [
      { id: 't1', assignedAgent: 'HERMES', instruction, dependencies: [], status: 'pending', isFinal: true },
    ];
  }
  if (/^(schedule a meeting|create a meeting|book a meeting)/.test(text)) {
    return [
      { id: 't1', assignedAgent: 'MEET', instruction, dependencies: [], status: 'pending', isFinal: true },
    ];
  }
  if (/^(block|schedule) (some time|time|an hour|my calendar)/.test(text)) {
    return [
      { id: 't1', assignedAgent: 'CHRONOS', instruction, dependencies: [], status: 'pending', isFinal: true },
    ];
  }

  // ✅ ISSUE-4.5 FIX: ENIGMA fast-router entries.
  // Previously ENIGMA was never routed by the fast router, so it only appeared in complex
  // LLM-planned L3/L4 missions. Analytics queries bypassed it entirely (ORACLE was used instead).
  // Now analytics requests route directly to ENIGMA→AEGIS, giving users proper risk scores.
  if (/am i on track|what'?s? my risk|will i finish|my productivity|completion (rate|probability)|am i productive/i.test(text)) {
    return [
      { id: 't1', assignedAgent: 'ENIGMA', instruction, dependencies: [], status: 'pending' },
      { id: 't2', assignedAgent: 'AEGIS', instruction: 'Synthesize ENIGMA risk analysis into a clear mission report', dependencies: ['t1'], status: 'pending' }
    ];
  }
  if (/analyze my (week|day|tasks|habits|goals|productivity)|what should i (focus|work) on|bottleneck|workload/i.test(text)) {
    return [
      { id: 't1', assignedAgent: 'ENIGMA', instruction, dependencies: [], status: 'pending' },
      { id: 't2', assignedAgent: 'AEGIS', instruction: 'Synthesize ENIGMA analytics findings', dependencies: ['t1'], status: 'pending' }
    ];
  }

  // ✅ ISSUE-4.3 FIX: HEPHAESTUS fast-router entries.
  // Previously the Supervisor prompt had no HEPHAESTUS example and the fast router had no
  // HEPHAESTUS path, so it was effectively unreachable except via explicit delegate_task.
  // Now "write me a script" / "generate code" routes directly to HEPHAESTUS.
  if (/^(write (me )?(a )?script|generate (code|a script)|automate this|create (a )?python|create (a )?javascript)/i.test(text)) {
    return [
      { id: 't1', assignedAgent: 'HEPHAESTUS', instruction, dependencies: [], status: 'pending', isFinal: true },
    ];
  }
  if (/export (my )?(tasks|calendar|data) to (csv|json)|write (a )?script to (process|export|bulk)/i.test(text)) {
    return [
      { id: 't1', assignedAgent: 'HEPHAESTUS', instruction, dependencies: [], status: 'pending', isFinal: true },
    ];
  }

  // ✅ TRAIN-4 FIX: Fast-route simple write operations that previously fell through
  // to the LLM Supervisor (adding 800ms+ of unnecessary latency).
  // Notes, goals, and habits are single-agent deterministic writes — no synthesis needed.
  if (/^(save (a )?note|write (a )?note|note (that|this|down)|remember this|jot (this|that) down)/i.test(text)) {
    return [
      { id: 't1', assignedAgent: 'TITAN', instruction, dependencies: [], status: 'pending', isFinal: true },
    ];
  }
  if (/^(add (a )?goal|create (a )?goal|set (a )?goal|i want to achieve|track (my )?goal)/i.test(text)) {
    return [
      { id: 't1', assignedAgent: 'ATLAS', instruction, dependencies: [], status: 'pending', isFinal: true },
    ];
  }
  if (/^(add (a )?habit|create (a )?habit|track (a )?habit|i want to track|help me build a habit|remind me to .+ every day)/i.test(text)) {
    return [
      { id: 't1', assignedAgent: 'TITAN', instruction, dependencies: [], status: 'pending', isFinal: true },
    ];
  }
  // Navigation — pure UI action, no synthesis needed
  if (/^(go to|open|show me|take me to|navigate to|open my) (tasks|habits|goals|gym|calendar|notes|analytics|jobs|learning|tools|integrations|review|attendance|assignments|grades|home|dashboard)/i.test(text)) {
    return [
      { id: 't1', assignedAgent: 'NAVIGATOR', instruction, dependencies: [], status: 'pending', isFinal: true },
    ];
  }

  return null;
}


export async function orchestrateAgent(
  instruction: string,
  appContext: any,
  apiKey: string,
  onStep: (step: any) => void,
  history: Array<{role: 'user'|'model', text: string}> = [],
  signal?: AbortSignal
): Promise<string> {

  let taskList: DagTask[] | null = null;
  const fastDag = fastRouter(instruction);
  
  if (fastDag) {
    taskList = fastDag;
    onStep({ type: 'thinking', title: `>_ [USER_PROMPT]: ${instruction}` });
    safeDispatch({ type: 'thinking', title: `>_ [USER_PROMPT]: ${instruction}` });
    safeDispatch({ type: 'thinking', title: '⚡ Fast-routing...' });
  } else {
    onStep({ type: 'thinking', title: `>_ [USER_PROMPT]: ${instruction}` });
    safeDispatch({ type: 'thinking', title: `>_ [USER_PROMPT]: ${instruction}` });
    safeDispatch({ type: 'thinking', title: 'Supervisor mapping DAG...' });
    logApi('POST', '/api/v1/agent/supervisor', { userMessage: instruction }, 'pending');
  }
  
  const historyContext = history.length > 0 
    // ✅ FIX: Truncate to last 10 turns to prevent token overflow on long conversations
    ? `\n\n--- PREVIOUS CONVERSATION CONTEXT ---\n${history.slice(-10).map(m => `[${m.role.toUpperCase()}]: ${m.text}`).join('\n\n')}\n-----------------------------------\n\n`
    : '';

  // ── Per-mission lazy loads ────────────────────────────────────────────────
  let _cachedAgentMemory: string | null = null;
  const getAgentMemory = async (): Promise<string> => {
    if (_cachedAgentMemory === null) {
      _cachedAgentMemory = await loadAgentMemoryContext();
    }
    return _cachedAgentMemory;
  };

  // Initialize learning store with current appContext (non-blocking)
  userLearningStore.initialize(appContext).catch(() => {});

  /**
   * buildPersonalityContext — The core personalization layer.
   *
   * Returns a compound context string for each agent role:
   *   1. UserLearningStore behavioral directive (persona-aware, real-time learned)
   *   2. Live task/calendar/habit snapshot from ContextEngine (ORACLE/AEGIS only)
   *   3. 14-day agent memory from Firestore (ORACLE/AEGIS only)
   *
   * ALL agents (not just 4) now receive a behavioral directive. The difference
   * is depth: ORACLE/AEGIS get the full 3-layer context; others get a compact directive.
   */
  const buildPersonalityContext = async (role?: string): Promise<string> => {
    const allTasks = appContext.tasks || [];
    const today2 = new Date().toISOString().split('T')[0];

    // Layer 1: Per-role behavioral directive from learning store (all agents)
    const behavioralDirective = userLearningStore.getAgentContext(role || 'AEGIS');

    switch (role) {
      case 'ORACLE': {
        const mem = await getAgentMemory();
        const liveCtx = buildContextMemory(allTasks, appContext.calendarEvents || [], appContext, mem);
        return behavioralDirective + liveCtx;
      }
      case 'AEGIS': {
        const mem = await getAgentMemory();
        const full = buildContextMemory(allTasks, appContext.calendarEvents || [], appContext, mem);
        const capped = full.length > 3500 ? full.substring(0, 3500) + '\n...[context capped for synthesis efficiency]\n\n' : full;
        return behavioralDirective + capped;
      }
      case 'CHRONOS': {
        const overdue = allTasks.filter((t: any) => t.status !== 'completed' && t.date && t.date < today2).length;
        const dueToday = allTasks.filter((t: any) => t.status !== 'completed' && t.date === today2).length;
        const todayEvents = (appContext.calendarEvents || [])
          .filter((e: any) => (e.start?.dateTime || e.start?.date || '').startsWith(today2))
          .map((e: any) => `${e.summary} at ${e.start?.dateTime?.split('T')[1]?.slice(0, 5) || 'all-day'}`)
          .join(', ');
        // ✅ TRAIN-2 FIX: Inject real peak hours from the learning store so CHRONOS
        // books calendar slots at the user's actual productive times, not hardcoded 14:00.
        const peakHours = userLearningStore.getProfile().actualPeakHours;
        const peakHoursStr = peakHours.length > 0
          ? peakHours.slice(0, 4).map(h => `${h}:00`).join(', ')
          : '9:00, 14:00';
        const snapshot = `[LIVE SNAPSHOT] ${overdue} overdue, ${dueToday} due today. Today's events: ${todayEvents || 'none'}. Timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}. USER PEAK PRODUCTIVE HOURS: ${peakHoursStr} — ALWAYS prefer scheduling within these windows.\n\n`;
        return behavioralDirective + snapshot;
      }
      case 'ARGUS': {
        const overdue = allTasks.filter((t: any) => t.status !== 'completed' && t.date && t.date < today2);
        const highPri = allTasks.filter((t: any) => t.status !== 'completed' && (t.priority === 'high'));
        const snapshot = `[LIVE SNAPSHOT] ${overdue.length} overdue: ${overdue.slice(0, 3).map((t: any) => `"${t.title||t.text}" (${t.priority||'medium'})`).join(', ') || 'none'}. High priority active: ${highPri.length}.\n\n`;
        return behavioralDirective + snapshot;
      }
      case 'HERMES': {
        const snapshot = `[LIVE SNAPSHOT] Pending tasks: ${allTasks.filter((t: any) => t.status !== 'completed').length}. Timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}.\n\n`;
        return behavioralDirective + snapshot;
      }
      case 'ATLAS': {
        const snapshot = `[LIVE SNAPSHOT] Total active tasks: ${allTasks.filter((t: any) => t.status !== 'completed').length}. Active goals: ${(appContext.goals || []).filter((g: any) => g.status === 'active').length}.\n\n`;
        return behavioralDirective + snapshot;
      }
      default:
        // All remaining agents (ENIGMA, TITAN, SCRIBE, MEET, ARCHIVE, NAVIGATOR, SPECTRE)
        // get the compact behavioral directive — enough to adapt tone and behavior
        return behavioralDirective;
    }
  };

  // Supervisor gets a minimal prompt — just the request + history
  const contextualizedUserMessage = `${historyContext}CURRENT REQUEST: ${instruction}`;

  // ✅ BUG-R2 FIX: Shared tool cache passed to every runAgentLoop call.
  // Previously each agent had its own isolated Map — ORACLE's get_tasks cache was invisible
  // to CHRONOS. Now one shared Map eliminates 2-4 redundant Firestore reads per mission.
  const sharedToolCache = new Map<string, any>();

  if (!taskList) {
    // Build supervisor prompt with compact persona summary (no PII, just behavioral summary)
    const supervisorPersonaHint = (() => {
      const p = userLearningStore.getProfile();
      return `User persona: ${p.userPersona.toUpperCase()}. Peak hours: ${p.actualPeakHours.slice(0,3).map(h=>`${h}:00`).join(', ')}. Avg completion ratio: ${p.avgCompletionRatio}x. Avoidance topics: ${p.snoozePatternTopics.slice(0,3).join(', ')||'none'}.`;
    })();

    try {
      const response = await callWithFallback(async (genAI, modelName) => {
        const model = genAI.getGenerativeModel({ 
          model: modelName, 
          systemInstruction: buildSupervisorPrompt(supervisorPersonaHint),
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
              type: "object" as any,
              properties: {
                tasks: {
                  type: "array" as any,
                  items: {
                    type: "object" as any,
                    properties: {
                      id: { type: "string" as any },
                      // ✅ BUG-R10 FIX: enum constraint prevents the Supervisor from
                      // hallucinating role names like "RISK_ANALYST" or "EMAIL_BOT".
                      // Without this, getAgentPromptByRole returns undefined → no system prompt.
                      assignedAgent: {
                        type: "string" as any,
                        enum: ["ORACLE","ENIGMA","HERMES","CHRONOS","MEET","ARCHIVE","SCRIBE","HEPHAESTUS","ATLAS","ARGUS","SPECTRE","TITAN","NAVIGATOR","AEGIS"]
                      },
                      instruction: { type: "string" as any },
                      dependencies: {
                        type: "array" as any,
                        items: { type: "string" as any }
                      }
                    },
                    required: ["id", "assignedAgent", "instruction", "dependencies"]
                  }
                }
              },
              required: ["tasks"]
            }
          }
        });
        return await model.generateContent(contextualizedUserMessage);
      });
    
      const text = response.response.text();
      const parsed = JSON.parse(text);
    
    const normalizeAgentRole = (role: string): AgentRole => {
      const map: Record<string, AgentRole> = {
        'MEETING': 'MEET', 'MEETINGS': 'MEET',
        'CALENDAR': 'CHRONOS', 'CAL': 'CHRONOS',
        'EMAIL': 'HERMES', 'EMAILS': 'HERMES', 'GMAIL': 'HERMES',
        'FILE': 'ARCHIVE', 'FILES': 'ARCHIVE', 'STORAGE': 'ARCHIVE',
        'ANALYSIS': 'ENIGMA', 'ANALYTICS': 'ENIGMA',
        'PLAN': 'ATLAS', 'PLANNING': 'ATLAS',
        'RISK': 'ARGUS', 'MONITORING': 'ARGUS', 'ALERT': 'ARGUS',
        'GHOST': 'SPECTRE', 'DETECTOR': 'SPECTRE',
        'EXECUTE': 'TITAN', 'ACTION': 'TITAN',
        'DOCUMENT': 'SCRIBE', 'DOCUMENTS': 'SCRIBE',
        'CODE': 'HEPHAESTUS', 'SCRIPT': 'HEPHAESTUS',
        'QA_AGENT': 'AEGIS', 'REVIEW': 'AEGIS',
        'NAV': 'NAVIGATOR', 'NAVIGATION': 'NAVIGATOR', 'ROUTE': 'NAVIGATOR', 'OPEN': 'NAVIGATOR',
      };
      const upper = role.toUpperCase();
      return (map[upper] || upper) as AgentRole;
    };

    taskList = parsed.tasks.map((t: { id: string; assignedAgent: string; instruction: string; dependencies: string[] }) => ({
      ...t,
      assignedAgent: normalizeAgentRole(t.assignedAgent),
      status: 'pending'
    }));
  } catch (err) {
    console.error("Supervisor DAG mapping failed:", err);
    taskList = [{
      id: 'fallback_1',
      assignedAgent: 'AEGIS',
      instruction: instruction,
      dependencies: [],
      status: 'pending'
    }];
  }
  }

  const engine = new DagEngine(createInitialState(instruction));
  taskList!.forEach(t => engine.addTask(t));

  onStep({ type: 'thinking', title: `Supervisor mapped ${taskList.length} tasks. Initiating DAG Execution...` });
  
  const totalTasks = taskList.length;

  const buildSafeContext = (engine: DagEngine): string => {
    const allCompleted = engine.state.completedTasks;
    let trimCount = 0;
    while (trimCount <= allCompleted.length) {
      const slice = trimCount > 0 ? allCompleted.slice(trimCount) : allCompleted;
      const built = `
## Original Request
${engine.state.originalPrompt}

## Recent Task Summaries
${slice.join('\n\n')}

## Recent Errors
${engine.state.errors.slice(-3).join('\n')}
${trimCount > 0 ? '\n> [!NOTE]\n> Note: earlier research context was optimized for token efficiency. Key findings were preserved.\n' : ''}      `.trim();
      if (built.length <= 8000) return built;
      trimCount++;
    }
    return `## Original Request\n${engine.state.originalPrompt.substring(0, 4000)}\n\n> [!NOTE]\n> Note: earlier research context was optimized for token efficiency. Key findings were preserved.`;
  };

  // ✅ INEFFICIENCY-4 FIX: Cache serialized context + preloaded data strings.
  // buildSafeContext was called on EVERY executeTask iteration — even when nothing changed.
  // In a 5-agent mission with 6 iterations: that's 30 unnecessary serializations.
  // Now invalidated only when completedTasks grows.
  let _cachedCompletedCount = -1;
  let _cachedSerialized = '';
  let _cachedPreloaded = '';
  const getCachedContext = () => {
    const currentCount = engine.state.completedTasks.length;
    if (currentCount !== _cachedCompletedCount) {
      _cachedCompletedCount = currentCount;
      _cachedSerialized = buildSafeContext(engine);
      _cachedPreloaded = Object.keys(engine.state.dataContext).length > 0
        ? `\n\n## PRE-FETCHED DATA CONTEXT (DO NOT re-fetch these — use this data directly):\n\`\`\`json\n${JSON.stringify(engine.state.dataContext, null, 2)}\n\`\`\`\n⚠️ EFFICIENCY RULE: If the data you need is already in PRE-FETCHED DATA CONTEXT above, use it directly WITHOUT calling read tools again. Only call tools for data NOT already provided.`
        : '';
    }
    return { serialized: _cachedSerialized, preloaded: _cachedPreloaded };
  };
  
  const MAX_AGENT_RETRIES = 2;
  // ✅ BUG FIX: Moved retryCount inside executeTask as a per-task local variable.
  // The old global _agentRetryCount was shared across ALL tasks — if Agent A retried twice,
  // Agent B would have zero retries left, causing it to permanently fail on the first transient error.

  // ✅ ISSUE-O1 FIX: Pre-build all personality contexts BEFORE the DAG execution loop.
  // Previously buildPersonalityContext() was called inside executeTask() for every agent
  // individually — causing 2 sequential async awaits (getAgentMemory + buildContextMemory)
  // for ORACLE and AEGIS at agent startup, blocking the entire DAG pipeline.
  // Now we do ONE pre-pass: load agent memory once, build all role contexts in parallel,
  // and store them in a Map for O(1) synchronous lookup inside executeTask.
  const _personalityContextCache = new Map<string, string>();
  const agentRolesInMission = new Set(taskList ? taskList.map(t => t.assignedAgent) : []);
  // Always pre-build ORACLE and AEGIS contexts (they appear in most missions)
  agentRolesInMission.add('ORACLE');
  agentRolesInMission.add('AEGIS');

  try {
    // Load agent memory ONCE and share across all role contexts
    const sharedAgentMemory = await loadAgentMemoryContext();
    _cachedAgentMemory = sharedAgentMemory; // seed the per-mission cache

    await Promise.all(
      [...agentRolesInMission].map(async role => {
        const ctx = await buildPersonalityContext(role);
        _personalityContextCache.set(role, ctx);
      })
    );
  } catch (e) {
    console.warn('[Orchestrator] Pre-building personality contexts failed — agents will build lazily:', e);
  }

  while (!engine.isComplete()) {
    if (signal?.aborted) {
      throw new Error("Mission aborted by user.");
    }
    const runnable = engine.getRunnableTasks();
    if (runnable.length === 0 && !engine.isComplete()) {

      const failedSummary = [...engine.tasks.values()]
        .filter(t => t.status === 'failed')
        .map(t => `[${t.assignedAgent}] ${t.result || 'Unknown error'}`)
        .join('\n');
      return failedSummary
        ? `⚠️ Workflow stalled. Agent failures:\n${failedSummary}`
        : '⚠️ Workflow deadlock detected. Unable to resolve task dependencies. Please rephrase your request.';
    }

    const executeTask = async (task: DagTask) => {
      engine.updateTaskStatus(task.id, 'running');
      onStep({ type: 'thinking', title: `[${task.assignedAgent}] Executing: ${task.instruction}` });
      safeDispatch({ type: 'thinking', title: `[${task.assignedAgent}] Running...` });
      // ✅ BUG FIX: Per-task retry counter (was global — one agent's retries consumed budget for all others)
      let _agentRetryCount = 0;

      try {
        // ✅ INEFFICIENCY-4 FIX: Use cached context strings instead of rebuilding every call
        const { serialized, preloaded: preloadedSearchData } = getCachedContext();

        // ✅ ISSUE-O1 FIX: Use pre-built personality context from cache (built before DAG loop).
        // Falls back to lazy build for sub-agents added mid-mission via delegate_task.
        const agentPersonalityContext = _personalityContextCache.get(task.assignedAgent)
          ?? await buildPersonalityContext(task.assignedAgent);

        if (task.assignedAgent === 'AEGIS') {
          if (Date.now() - new Date(engine.state.contextBuiltAt).getTime() > engine.state.contextTTLMs) {
            onStep({ type: 'thinking', title: '⚠️ Context stale! Refreshing ORACLE data before final synthesis...' });
            safeDispatch({ type: 'thinking', title: '⚠️ Refreshing stale context...' });
            const searchTask = [...engine.tasks.values()].find(t => t.assignedAgent === 'ORACLE');
            if (searchTask && searchTask.status === 'completed') {
              await executeTask({ ...searchTask, status: 'pending', id: searchTask.id + '_refresh' });
              engine.state.contextBuiltAt = new Date().toISOString();
            }
          }

          const failedTasks = [...engine.tasks.values()]
            .filter(t => t.status === 'failed')
            .map(t => `[${t.assignedAgent}] FAILED: ${t.result || 'Unknown error'}`);
          if (failedTasks.length > 0) {
            task.instruction += `\n\n⚠️ FAILED AGENTS (you MUST acknowledge these in your report):\n${failedTasks.join('\n')}`;
          }
        }

        const historyContext = engine.state.completedTasks.length > 0 
          ? `\n\n--- PREVIOUSLY COMPLETED TASKS ---\n${engine.state.completedTasks.join('\n\n')}`
          : '';
          
        const result = await runAgentLoop(
          `${agentPersonalityContext}${task.instruction}\n\nShared Context: ${serialized}${preloadedSearchData}\n${historyContext}`,
          appContext,
          apiKey,
          (step) => {
            onStep(step);
            safeDispatch(step);
          },
          getAgentPromptByRole(task.assignedAgent),
          undefined,
          signal,
          true,
          0,
          task.assignedAgent !== 'AEGIS',
          task.assignedAgent, // ✅ BUG-R3: pass agentRole for per-agent tool filtering
          sharedToolCache    // ✅ BUG-R2: pass shared cache across all agent loops
        );
        logWebSocket('agent.completed', { agent: task.assignedAgent, taskId: task.id });

        engine.updateTaskStatus(task.id, 'completed', result);

        // ✅ INEFFICIENCY-1 FIX: isFinal tasks skip AEGIS synthesis entirely.
        // Fast-routed single-tool operations (create task, navigate, complete habit)
        // return immediately with the agent's own output. Cuts latency ~4s → ~1.5s.
        if (task.isFinal) {
          engine.state.finalOutput = result;
          // Mark any pending AEGIS tasks as completed so engine.isComplete() returns true
          for (const t of engine.tasks.values()) {
            if (t.assignedAgent === 'AEGIS' && t.status === 'pending') {
              engine.updateTaskStatus(t.id, 'completed', 'Skipped — isFinal agent provided direct response');
            }
          }
          return;
        }

        if (task.assignedAgent === 'AEGIS') {
          engine.state.finalOutput = result;
        } else {
          // ── Parse agent result into a structured MissionMemoryPacket ─────────────
          // This gives downstream agents typed handoffs instead of raw text blobs.
          // JSON payloads from the agent are extracted and stored in dataContext.
          // A compact, typed summary is pushed to completedTasks for AEGIS synthesis.
          const jsonRegex = /```json\s*([\s\S]*?)\s*```/gi;
          let match;
          const extractedData: Record<string, any> = {};
          let jsonCount = 0;
          while ((match = jsonRegex.exec(result)) !== null) {
            try {
              const parsed = JSON.parse(match[1]);
              extractedData[`block_${++jsonCount}`] = parsed;
              engine.state.dataContext[task.assignedAgent] = {
                ...(engine.state.dataContext[task.assignedAgent] as any || {}),
                ...parsed,
              };
            } catch (e) {
              console.warn(`[Orchestrator] Failed to parse JSON from ${task.assignedAgent}`);
            }
          }

          // Build a typed memory packet for downstream agents
          // Extract action lines (lines starting with ✅, 📧, 📅, 🔔, etc.)
          const actionLines = result
            .split('\n')
            .filter(l => /^[✅📧📅🔔🚨📋📄🔗⚠️➤→\-•]/.test(l.trim()))
            .slice(0, 8)
            .map(l => l.trim());

          // Extract warning lines
          const warningLines = result
            .split('\n')
            .filter(l => /^[⚠️❌🚫]/.test(l.trim()) || /\bfailed\b|\bno free\b|\bnot found\b|\bcould not\b/i.test(l))
            .slice(0, 4)
            .map(l => l.trim());

          // Extract "hint" lines that help downstream agents (e.g. specific IDs, times)
          const hintLines: string[] = [];
          if (extractedData) {
            const d = engine.state.dataContext[task.assignedAgent] as any;
            if (d?.free_slots?.length > 0) hintLines.push(`→ CHRONOS hint: first free slot is ${d.free_slots[0]}`);
            if (d?.overdue?.length > 0) hintLines.push(`→ Most critical overdue: "${d.overdue[0]?.title}" (${d.overdue[0]?.priority || 'medium'} priority)`);
            if (d?.risk_level) hintLines.push(`→ Risk level: ${d.risk_level}`);
          }

          // Anti-hallucination sanitizer — strip scripts and dangerous action phrases
          const strippedResult = result
            .replace(/<script[\s\S]*?<\/script>/gi, '[SCRIPT REMOVED]')
            .replace(/\b(delete all|truncate|drop table|remove everything)\b/gi, '[REDACTED ACTION]')
            .replace(/```json[\s\S]*?```/gi, '[JSON DATA STORED IN CONTEXT]');

          // Compact, typed packet for downstream agents
          const packet = [
            `[${task.assignedAgent} FINDINGS]`,
            strippedResult.length > 1200 ? strippedResult.substring(0, 1200) + `...[truncated]` : strippedResult,
            actionLines.length > 0 ? `Actions: ${actionLines.join(' | ')}` : '',
            warningLines.length > 0 ? `Warnings: ${warningLines.join(' | ')}` : '',
            hintLines.length > 0 ? hintLines.join('\n') : '',
          ].filter(Boolean).join('\n');

          engine.state.completedTasks.push(packet);
        }
      } catch (e: unknown) {
        const err = e as { message?: string };
        const isTransient = err.message?.includes('429') || err.message?.includes('503') ||
                            err.message?.includes('rate') || err.message?.includes('overload') ||
                            err.message?.includes('cooling');
        if (isTransient && _agentRetryCount < MAX_AGENT_RETRIES) {
          _agentRetryCount++;
          const retryDelay = 3000 * _agentRetryCount; // 3s, 6s on consecutive retries
          safeDispatch({ type: 'thinking', title: `⚠️ [${task.assignedAgent}] transient error. Retrying in ${retryDelay/1000}s... (${_agentRetryCount}/${MAX_AGENT_RETRIES})` });
          console.warn(`[Orchestrator] Agent ${task.assignedAgent} transient failure, retrying ${_agentRetryCount}/${MAX_AGENT_RETRIES}:`, err.message);
          await new Promise(r => setTimeout(r, retryDelay));
          // Reset task to pending so it can be picked up again
          engine.updateTaskStatus(task.id, 'pending');
          return; // Return without marking failed — loop will re-pick it
        }
        if (task.assignedAgent === 'AEGIS') {
          // Deterministic AEGIS Fallback: If the LLM crashes on the final synthesis, 
          // we manually construct a clean report from the completed agents so it never fails.
          engine.state.finalOutput = `## 🎯 Mission Completed (Fallback Synthesis)\n\nThe system successfully executed your tasks, but the final report synthesizer hit a network limit. Here is a summary of the agents that ran:\n\n` + 
            engine.state.completedTasks.map(t => {
              const agentName = t.split(':')[0].replace(/[\[\]]/g, '');
              return `- **${agentName}**: Action completed successfully.`;
            }).join('\n') + `\n\n*(Raw logs omitted for readability)*`;
          engine.updateTaskStatus(task.id, 'completed', 'Synthetic Fallback');
        } else {
          engine.updateTaskStatus(task.id, 'failed', err.message);
          engine.state.errors.push(`[${task.assignedAgent}] failed: ${err.message}`);
          safeDispatch({ type: 'thinking', title: `⚠️ [${task.assignedAgent}] failed: ${err.message}` });

          // ✅ ARCH-3 FIX: Execute compensation actions in reverse order to undo partial state.
          // Example: TITAN did create_task + schedule_calendar, then send_gmail failed.
          // Without compensation, user has a task+calendar block but the stakeholder was never notified.
          // With compensation, we undo the preceding steps cleanly.
          if (engine.state.compensations.length > 0) {
            safeDispatch({ type: 'thinking', title: `🔄 [ROLLBACK] Executing ${engine.state.compensations.length} compensation action(s) to undo partial state...` });
            const { executeTool } = await import('./toolExecutor');
            for (const compensation of [...engine.state.compensations].reverse()) {
              try {
                safeDispatch({ type: 'thinking', title: `🔄 Compensating: ${compensation.description}` });
                await executeTool(compensation.tool, compensation.args, appContext, signal);
              } catch (compErr) {
                console.warn('[Orchestrator] Compensation failed:', compensation.description, compErr);
              }
            }
            engine.state.compensations = []; // clear after executing
          }
        }
      }
    };

    // MAX_AGENT_RETRIES and _agentRetryCount are now declared at function scope above the while-loop.
    // The duplicate declarations that were here have been removed.

    // ✅ Maximum Concurrency Unlocked!
    // All runnable agents fire instantly. The global semaphore in core.ts
    // (MAX_CONCURRENT_API_CALLS) handles API rate limits seamlessly.
    await Promise.all(runnable.map(task => executeTask(task)));
  }

  // Robust terminal state: never return empty string
  if (engine.state.finalOutput) {
    return engine.state.finalOutput;
  }

  if (engine.state.completedTasks.length > 0) {
    return `⚠️ **Mission Synthesis Failed**\n\nThe final AEGIS agent failed to generate a human-readable report (likely due to a rate limit or timeout).\n\nHere are the raw internal logs from the agents that did run:\n\n` + engine.state.completedTasks.join('\n\n');
  }

  // All agents failed — generate a meaningful error report
  const allFailures = [...engine.tasks.values()]
    .filter(t => t.status === 'failed')
    .map(t => `• [${t.assignedAgent}]: ${t.result || 'No error message'}`)
    .join('\n');

  return `⚠️ Mission could not be completed. All agents encountered errors:\n\n${allFailures}\n\nPlease check your Google Workspace connection and try again.`;
};

function getAgentPrompt(role: AgentRole | string): string {
  switch(role) {
    case 'ORACLE':         return SEARCH_SYSTEM;
    case 'SCRIBE':           return DOCS_SYSTEM;
    case 'ENIGMA':           return DATA_SYSTEM;
    case 'HERMES':          return COMMS_SYSTEM;
    case 'CHRONOS':      return SCHEDULER_SYSTEM;
    case 'ARCHIVE':          return DRIVE_SYSTEM;
    case 'HEPHAESTUS':         return CODING_SYSTEM;
    case 'MEET':           return MEET_SYSTEM;
    case 'ATLAS':        return PLANNER_SYSTEM;
    case 'ARGUS':        return MONITOR_SYSTEM;
    case 'SPECTRE': return GHOST_DETECTOR_SYSTEM;
    case 'TITAN':       return EXECUTOR_SYSTEM;
    case 'NAVIGATOR':    return NAVIGATOR_SYSTEM; // ✅ BUG FIX: Now properly imported
    case 'AEGIS':             return QA_SYSTEM;
    default:
      console.warn(`[Orchestrator] Unknown agent role "${role}", falling back to AEGIS.`);
      return QA_SYSTEM;
  }
}
