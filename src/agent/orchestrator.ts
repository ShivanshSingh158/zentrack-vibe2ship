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

LEVEL_1 (Retrieval — 1 agent): Simple data lookup. No action needed.
  Examples: "What tasks do I have today?", "Show my calendar", "What's overdue?"
  Deploy: AEGIS only (synthesize from context)

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
- CHRONOS: all Google Calendar operations (view, block, delete, reschedule)
- ATLAS: decompose large goals into task lists, create project plans
- ARGUS: assess task risk, send proactive alerts and reminders
- SPECTRE: scan inbox and calendar for unlogged deadlines
- TITAN: cross-system multi-action execution (email + doc + meeting in one flow)
- ENIGMA: analysis-only, never modifies data
- ORACLE: read-only intelligence gathering across tasks and calendar
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

Agent roles available: ORACLE, ENIGMA, HERMES, CHRONOS, MEET, ARCHIVE, SCRIBE, HEPHAESTUS, AEGIS, ATLAS, ARGUS, SPECTRE, TITAN
CRITICAL: Output ONLY the JSON. No other text. No markdown code blocks.`;


// ─── Exported: allows toolExecutor's delegate_task to resolve a system prompt ──
export function getAgentPromptByRole(role: string): string {
  return getAgentPrompt(role as AgentRole);
}

// ─── Safe window dispatch ─────────────────────────────────────────────────────
const safeDispatch = (detail: any) => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('agent-log', { detail }));
  }
};

export const orchestrateAgent = async (
  userMessage: string,
  userTodos: Task[],
  calendarEvents: CalendarEvent[],
  apiKey: string,
  onStep: (step: AgentStep) => void,
  agentHistory: ConversationTurn[] = [],
  signal?: AbortSignal
): Promise<string> => {

  onStep({ type: 'thinking', title: 'Supervisor (Agent 0) mapping workflow DAG...' });
  safeDispatch({ type: 'thinking', title: 'Supervisor mapping DAG...' });
  logApi('POST', '/api/v1/agent/supervisor', { userMessage }, 'pending');

  let taskList: DagTask[] = [];
  
  const historyContext = agentHistory.length > 0 
    ? `\n\n--- PREVIOUS CONVERSATION CONTEXT ---\n${agentHistory.map(m => `[${m.role.toUpperCase()}]: ${m.text}`).join('\n\n')}\n-----------------------------------\n\n`
    : '';

  // ✅ NEW: Inject personalization context from ContextEngine so agents know the
  // user's real task load, peak productivity hours, and calendar patterns.
  // Without this, agents are generic — with it, they give personalized advice.
  const personalityContext = buildContextMemory(userTodos, calendarEvents);
  
  const contextualizedUserMessage = `${personalityContext}${historyContext}CURRENT REQUEST: ${userMessage}`;

  try {
    const response = await callWithFallback(async (genAI, modelName) => {
      const model = genAI.getGenerativeModel({ model: modelName, systemInstruction: SUPERVISOR_SYSTEM });
      return await model.generateContent(contextualizedUserMessage);
    });
    
    let text = response.response.text().trim();
    
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (jsonMatch) {
      text = jsonMatch[1].trim();
    } else {
      const firstBrace = text.indexOf('{');
      const lastBrace = text.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        text = text.slice(firstBrace, lastBrace + 1);
      }
    }
    
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
      };
      const upper = role.toUpperCase();
      return (map[upper] || upper) as AgentRole;
    };

    taskList = parsed.tasks.map((t: any) => ({
      ...t,
      assignedAgent: normalizeAgentRole(t.assignedAgent),
      status: 'pending'
    }));
  } catch (err) {
    console.error("Supervisor DAG mapping failed:", err);
    taskList = [{
      id: 'fallback_1',
      assignedAgent: 'AEGIS',
      instruction: userMessage,
      dependencies: [],
      status: 'pending'
    }];
  }

  const engine = new DagEngine(createInitialState(userMessage));
  taskList.forEach(t => engine.addTask(t));

  onStep({ type: 'thinking', title: `Supervisor mapped ${taskList.length} tasks. Initiating DAG Execution...` });
  
  // Track total tasks to determine if stagger is needed
  const totalTasks = taskList.length;

  // ── Smart Context Trimmer ──────────────────────────────────────────────────
  // ✅ FIXED: The old .substring(0,8000) could cut JSON mid-character, creating
  // malformed context that breaks downstream agents. This trimmer instead removes
  // the oldest completedTask entries one by one until the string fits safely.
  const buildSafeContext = (engine: DagEngine): string => {
    const allCompleted = engine.state.completedTasks;
    let trimCount = 0;
    while (trimCount <= allCompleted.length) {
      const slice = trimCount > 0 ? allCompleted.slice(trimCount) : allCompleted;
      const built = `
## Original Request
${engine.state.originalPrompt}

## Recent Task Summaries
${slice.map(t => t.substring(0, 800)).join('\n\n')}

## Recent Errors
${engine.state.errors.slice(-3).join('\n')}
${trimCount > 0 ? '\n> [!NOTE]\n> Note: earlier research context was optimized for token efficiency. Key findings were preserved.\n' : ''}      `.trim();
      if (built.length <= 8000) return built;
      trimCount++;
    }
    // Absolute fallback: just the original prompt
    return `## Original Request\n${engine.state.originalPrompt.substring(0, 4000)}\n\n> [!NOTE]\n> Note: earlier research context was optimized for token efficiency. Key findings were preserved.`;
  };
  
  while (!engine.isComplete()) {
    if (signal?.aborted) {
      throw new Error("Mission aborted by user.");
    }
    const runnable = engine.getRunnableTasks();
    if (runnable.length === 0 && !engine.isComplete()) {
      // Deadlock: some tasks are still pending but can't run (broken dependencies)
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
        const agentSystemPrompt = getAgentPrompt(task.assignedAgent);

        // Build context payload using safe trimmer
        const searchOutput = engine.state.completedTasks.find(t => t.startsWith('[ORACLE]:'));
        let preloadedSearchData = '';
        if (searchOutput) {
          const jsonMatch = searchOutput.match(/```json([\s\S]*?)```/);
          if (jsonMatch) {
            preloadedSearchData = `\n\n## PRE-FETCHED ENIGMA (DO NOT re-fetch these — use this data directly):\n\`\`\`json${jsonMatch[1]}\`\`\`\n⚠️ EFFICIENCY RULE: If the data you need (tasks, calendar slots, events) is already in PRE-FETCHED ENIGMA above, use it directly WITHOUT calling get_tasks, list_calendar_events, or get_free_calendar_slots again. Only call tools for data NOT already provided.`;
          }
        }

        // ✅ Use safe context builder instead of .substring(0,8000)
        const serialized = buildSafeContext(engine);

        // Inject failed-agent context into AEGIS
        if (task.assignedAgent === 'AEGIS') {
          // Check for Context Staleness
          if (Date.now() - new Date(engine.state.contextBuiltAt).getTime() > engine.state.contextTTLMs) {
            onStep({ type: 'thinking', title: '⚠️ Context stale! Refreshing ORACLE data before final synthesis...' });
            safeDispatch({ type: 'thinking', title: '⚠️ Refreshing stale context...' });
            const searchTask = [...engine.tasks.values()].find(t => t.assignedAgent === 'ORACLE');
            if (searchTask) {
              await executeTask(searchTask);
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

        const result = await runAgentLoop(
          `${task.instruction}\n\nShared Context: ${serialized}${preloadedSearchData}\n${historyContext}`,
          userTodos,
          calendarEvents,
          apiKey,
          onStep,
          agentSystemPrompt,
          undefined,
          signal
        );

        engine.updateTaskStatus(task.id, 'completed', result);
        logWebSocket('agent.completed', { agent: task.assignedAgent, taskId: task.id });

        if (task.assignedAgent === 'AEGIS') {
          engine.state.finalOutput = result;
        } else {
          // ✅ Enhanced sanitization: strip scripts, confabulated delete commands,
          // and excessive length before injecting into shared state.
          // This prevents a hallucinatory agent from poisoning downstream agents.
          const strippedResult = result
            .replace(/<script[\s\S]*?<\/script>/gi, '[SCRIPT REMOVED]')
            .replace(/\b(delete all|truncate|drop table|remove everything)\b/gi, '[REDACTED ACTION]');
          const sanitized = strippedResult.length > 1500
            ? strippedResult.substring(0, 1500) + `\n...[${task.assignedAgent} output truncated]`
            : strippedResult.replace(/```json[\s\S]*?```/g, '[JSON block]');
          engine.state.completedTasks.push(`[${task.assignedAgent}]: ${sanitized}`);
        }
      } catch (e: any) {
        const isTransient = e.message?.includes('429') || e.message?.includes('503') ||
                            e.message?.includes('rate') || e.message?.includes('overload') ||
                            e.message?.includes('cooling');
        if (isTransient && _agentRetryCount < MAX_AGENT_RETRIES) {
          _agentRetryCount++;
          const retryDelay = 3000 * _agentRetryCount; // 3s, 6s on consecutive retries
          safeDispatch({ type: 'thinking', title: `⚠️ [${task.assignedAgent}] transient error. Retrying in ${retryDelay/1000}s... (${_agentRetryCount}/${MAX_AGENT_RETRIES})` });
          console.warn(`[Orchestrator] Agent ${task.assignedAgent} transient failure, retrying ${_agentRetryCount}/${MAX_AGENT_RETRIES}:`, e.message);
          await new Promise(r => setTimeout(r, retryDelay));
          // Reset task to pending so it can be picked up again
          engine.updateTaskStatus(task.id, 'pending');
          return; // Return without marking failed — loop will re-pick it
        }
        engine.updateTaskStatus(task.id, 'failed', e.message);
        engine.state.errors.push(`[${task.assignedAgent}] failed: ${e.message}`);
        safeDispatch({ type: 'thinking', title: `⚠️ [${task.assignedAgent}] failed: ${e.message}` });
      }
    };

    const MAX_AGENT_RETRIES = 2; // Each agent gets up to 2 self-healing retries on transient errors
    let _agentRetryCount = 0;

    // ✅ FIXED: Run agents SEQUENTIALLY (MAX_CONCURRENT=1 for LEVEL_3, 2 for LEVEL_4)
    // Parallel execution is the root cause of the thundering herd. Sequential with
    // good caching is more reliable and nearly as fast when keys have quota limits.
    const MAX_CONCURRENT = totalTasks > 5 ? 2 : 1;
    const STAGGER_DELAY = 0; // No need for artificial stagger when running sequentially

    const activePromises = new Set<Promise<void>>();

    for (const task of runnable) {
      if (activePromises.size >= MAX_CONCURRENT) {
        await Promise.race(activePromises);
      }

      const p = executeTask(task).finally(() => {
        activePromises.delete(p);
      });
      activePromises.add(p);

      // Small gap between agent starts to stagger their initial API calls
      if (activePromises.size > 0 && MAX_CONCURRENT > 1) {
        await new Promise(r => setTimeout(r, 1500));
      }
    }

    await Promise.all(activePromises);
  }

  // Robust terminal state: never return empty string
  if (engine.state.finalOutput) {
    return engine.state.finalOutput;
  }

  if (engine.state.completedTasks.length > 0) {
    return engine.state.completedTasks.join('\n\n');
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
    case 'AEGIS':             return QA_SYSTEM;
    default:
      console.warn(`[Orchestrator] Unknown agent role "${role}", falling back to AEGIS.`);
      return QA_SYSTEM;
  }
}
