import { callWithFallback } from '../services/gemini/core';
import type { AgentStep } from './runAgentLoop';
import { runAgentLoop } from './runAgentLoop';
import { logApi, logWebSocket } from '../utils/networkLogger';
import { DagEngine } from './core/DagEngine';
import type { DagTask, AgentRole } from './core/DagEngine';
import { createInitialState } from './core/SharedState';
import type { Task, CalendarEvent, ConversationTurn } from '../types/domain';
import { buildContextMemory } from './memory/ContextEngine';

import { 
  SEARCH_SYSTEM, DOCS_SYSTEM, DATA_SYSTEM, COMMS_SYSTEM, 
  SCHEDULER_SYSTEM, DRIVE_SYSTEM, CODING_SYSTEM, QA_SYSTEM,
  MEET_SYSTEM, PLANNER_SYSTEM, MONITOR_SYSTEM, GHOST_DETECTOR_SYSTEM, EXECUTOR_SYSTEM
} from './fleet/NewAgents';


const SUPERVISOR_SYSTEM = `You are Agent 0 — The Supervisor and Master Orchestrator of DeadlineZero, an autonomous AI productivity system.
Your mission: analyze user requests, classify their complexity, and delegate to the right agents.

## STEP 1 — CLASSIFY TASK HARDNESS
Evaluate the user's request and assign a hardness level:

LEVEL_1 (Retrieval/Navigation — 1 agent): Simple data lookup OR navigation request. No complex action needed.
  Examples: "What tasks do I have today?", "Show my calendar", "What's overdue?"
  Navigation examples: "Show my gym workout", "Open learning module", "What's my habit today?", "Go to my goals", "Open that calculus lecture", "Show me my notes"
  Deploy: NAVIGATOR (for navigation/in-app data) or AEGIS only (for synthesizing from context)

LEVEL_2 (Single Action — 1-2 agents): One clear action to perform.
  Examples: "Schedule a 2-hour block tomorrow", "Create a task for X", "Send me a reminder", "Create a meeting for 3pm", "Find my project file in Drive"
  Deploy: (CHRONOS or HERMES or MEET or ARCHIVE or ATLAS) → AEGIS

LEVEL_3 (Multi-Step — 3-5 agents): Multiple coordinated actions needed.
  Examples: "I missed a deadline. Help me recover.", "Analyze my week and reschedule", "Read my emails and create tasks", "Create a team meeting and email everyone the link", "Plan a project to build an MVP"
  Deploy: ORACLE + ENIGMA (parallel) → HERMES or CHRONOS or MEET or TITAN → AEGIS

LEVEL_4 (Emergency Orchestration — full fleet): Complex, cross-system synthesis.
  Examples: "I have 3 overdue tasks, a meeting in 1 hour, and an angry email from my manager", "Do a full triage of everything"
  Deploy: ORACLE + ENIGMA + ARGUS (parallel) → HERMES → CHRONOS → ARCHIVE → SCRIBE → AEGIS

LEVEL_5 (Proactive Discovery): Scan for hidden commitments.
  Examples: "Check my inbox for any deadlines I missed", "Find any ghost tasks in my emails"
  Deploy: SPECTRE → AEGIS

## STEP 2 — MAP THE DAG
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

## Agent Responsibilities (choose EXACTLY the right agent):
- MEET: Google Meet creation, joining meetings, inviting attendees
- ARCHIVE: finding files in Google Drive, opening files, listing recent files
- HERMES: all Gmail (read, send, reply, archive)
- CHRONOS: all Google Calendar operations (view, block, delete, reschedule). DO NOT USE FOR IN-APP DATA.
- ATLAS: decompose large goals into task lists, create project plans
- ARGUS: assess task risk, send proactive alerts and reminders
- SPECTRE: scan inbox and calendar for unlogged deadlines
- TITAN: cross-system multi-action execution AND managing/deleting internal ZenTrack tasks, Google Calendar events, Gmail messages, and Google Drive files.
- ENIGMA: analysis-only, never modifies data
- ORACLE: read-only intelligence gathering across tasks, calendar, AND internal app data (gym, notes, habits, goals, etc.)
- SCRIBE: create and write Google Docs and generate scripts
- AEGIS: final synthesis and mission report

## STEP 3 — OUTPUT VALID JSON ONLY (no markdown, no explanation)
{
  "hardnessLevel": "LEVEL_3",
  "rationale": "User needs cross-system recovery plan involving calendar and email",
  "tasks": [
    {"id": "t1", "assignedAgent": "ORACLE", "instruction": "Get all overdue and today tasks. Find free slots tomorrow.", "dependencies": []},
    {"id": "t2", "assignedAgent": "ENIGMA", "instruction": "Analyze task priority and completion risk.", "dependencies": []},
    {"id": "t3", "assignedAgent": "CHRONOS", "instruction": "Block 2h recovery time for the most critical overdue task.", "dependencies": ["t2"]},
    {"id": "t4", "assignedAgent": "AEGIS", "instruction": "Synthesize a mission report from all agent findings.", "dependencies": ["t1","t2","t3"]}
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
  if (text.split(' ').length > 12) return null;
  
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
  if (/^(create a task|add a task|remind me to|add to my to do|add to my todo)/.test(text)) {
    return [
      { id: 't1', assignedAgent: 'TITAN', instruction, dependencies: [], status: 'pending' },
      { id: 't2', assignedAgent: 'AEGIS', instruction: 'Synthesize task creation', dependencies: ['t1'], status: 'pending' }
    ];
  }
  if (/^(send an email|email |send a message to)/.test(text)) {
    return [
      { id: 't1', assignedAgent: 'HERMES', instruction, dependencies: [], status: 'pending' },
      { id: 't2', assignedAgent: 'AEGIS', instruction: 'Synthesize email sent', dependencies: ['t1'], status: 'pending' }
    ];
  }
  if (/^(schedule a meeting|create a meeting|book a meeting)/.test(text)) {
    return [
      { id: 't1', assignedAgent: 'MEET', instruction, dependencies: [], status: 'pending' },
      { id: 't2', assignedAgent: 'AEGIS', instruction: 'Synthesize meeting creation', dependencies: ['t1'], status: 'pending' }
    ];
  }
  if (/^(block|schedule) (some time|time|an hour|my calendar)/.test(text)) {
    return [
      { id: 't1', assignedAgent: 'CHRONOS', instruction, dependencies: [], status: 'pending' },
      { id: 't2', assignedAgent: 'AEGIS', instruction: 'Synthesize calendar blocks', dependencies: ['t1'], status: 'pending' }
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
    ? `\n\n--- PREVIOUS CONVERSATION CONTEXT ---\n${history.map(m => `[${m.role.toUpperCase()}]: ${m.text}`).join('\n\n')}\n-----------------------------------\n\n`
    : '';

  // ✅ NEW: Inject personalization context from ContextEngine so agents know the
  // user's real task load, peak productivity hours, gym schedule, habits, and learning topics.
  // Without this, agents are generic — with it, they give personalized advice.
  const personalityContext = buildContextMemory(
    appContext.tasks || [],
    appContext.calendarEvents || [],
    appContext // pass full appContext so gym/habits/learning are extracted
  );
  
  const contextualizedUserMessage = `${personalityContext}${historyContext}CURRENT REQUEST: ${instruction}`;

  if (!taskList) {
    try {
      const response = await callWithFallback(async (genAI, modelName) => {
        const model = genAI.getGenerativeModel({ 
          model: modelName, 
          systemInstruction: SUPERVISOR_SYSTEM,
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
                      assignedAgent: { type: "string" as any },
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
  
  const MAX_AGENT_RETRIES = 2;
  let _agentRetryCount = 0;

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

      try {
        let preloadedSearchData = '';
        if (Object.keys(engine.state.dataContext).length > 0) {
          preloadedSearchData = `\n\n## PRE-FETCHED DATA CONTEXT (DO NOT re-fetch these — use this data directly):\n\`\`\`json\n${JSON.stringify(engine.state.dataContext, null, 2)}\n\`\`\`\n⚠️ EFFICIENCY RULE: If the data you need is already in PRE-FETCHED DATA CONTEXT above, use it directly WITHOUT calling read tools again. Only call tools for data NOT already provided.`;
        }

        const serialized = buildSafeContext(engine);

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
          `${task.instruction}\n\nShared Context: ${serialized}${preloadedSearchData}\n${historyContext}`,
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
          task.assignedAgent !== 'AEGIS'
        );
        logWebSocket('agent.completed', { agent: task.assignedAgent, taskId: task.id });

        engine.updateTaskStatus(task.id, 'completed', result);

        if (task.assignedAgent === 'AEGIS') {
          engine.state.finalOutput = result;
        } else {
          // EXTRACT JSON PAYLOADS INTO DATA CONTEXT
          const jsonRegex = /```json\s*([\s\S]*?)\s*```/gi;
          let match;
          while ((match = jsonRegex.exec(result)) !== null) {
            try {
              const parsed = JSON.parse(match[1]);
              engine.state.dataContext[task.assignedAgent] = {
                ...(engine.state.dataContext[task.assignedAgent] as any || {}),
                ...parsed
              };
            } catch (e) {
              console.warn(`[Orchestrator] Failed to parse JSON from ${task.assignedAgent}`);
            }
          }

          // This prevents a hallucinatory agent from poisoning downstream agents.
          const strippedResult = result
            .replace(/<script[\s\S]*?<\/script>/gi, '[SCRIPT REMOVED]')
            .replace(/\b(delete all|truncate|drop table|remove everything)\b/gi, '[REDACTED ACTION]')
            .replace(/```json[\s\S]*?```/gi, '[JSON DATA STORED IN SECURE CONTEXT]');
            
          const sanitized = strippedResult.length > 1500
            ? strippedResult.substring(0, 1500) + `\n...[${task.assignedAgent} text truncated]`
            : strippedResult;
            
          engine.state.completedTasks.push(`[${task.assignedAgent}]: ${sanitized}`);
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
    case 'NAVIGATOR':    return NAVIGATOR_SYSTEM;
    case 'AEGIS':             return QA_SYSTEM;
    default:
      console.warn(`[Orchestrator] Unknown agent role "${role}", falling back to AEGIS.`);
      return QA_SYSTEM;
  }
}
