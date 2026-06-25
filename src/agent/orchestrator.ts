import { callWithFallback } from '../services/gemini/core';
import type { AgentStep } from './runAgentLoop';
import { runAgentLoop } from './runAgentLoop';
import { logApi, logWebSocket } from '../utils/networkLogger';
import { DagEngine } from './core/DagEngine';
import type { DagTask, AgentRole } from './core/DagEngine';
import { createInitialState } from './core/SharedState';

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
  Deploy: QA only (synthesize from context)

LEVEL_2 (Single Action — 1-2 agents): One clear action to perform.
  Examples: "Schedule a 2-hour block tomorrow", "Create a task for X", "Send me a reminder", "Create a meeting for 3pm", "Find my project file in Drive"
  Deploy: (SCHEDULER or COMMS or MEET or DRIVE or PLANNER) → QA

LEVEL_3 (Multi-Step — 3-5 agents): Multiple coordinated actions needed.
  Examples: "I missed a deadline. Help me recover.", "Analyze my week and reschedule", "Read my emails and create tasks", "Create a team meeting and email everyone the link", "Plan a project to build an MVP"
  Deploy: SEARCH + DATA (parallel) → COMMS or SCHEDULER or MEET or EXECUTOR → QA

LEVEL_4 (Emergency Orchestration — full fleet): Complex, cross-system synthesis.
  Examples: "I have 3 overdue tasks, a meeting in 1 hour, and an angry email from my manager", "Do a full triage of everything"
  Deploy: SEARCH + DATA + MONITOR (parallel) → COMMS → SCHEDULER → DRIVE → DOCS → QA

LEVEL_5 (Proactive Discovery): Scan for hidden commitments.
  Examples: "Check my inbox for any deadlines I missed", "Find any ghost tasks in my emails"
  Deploy: GHOST_DETECTOR → QA

## STEP 2 — MAP THE DAG
Dependency Rules:
- SEARCH and DATA can ALWAYS run in parallel (no dependencies between them)
- MONITOR can run in parallel with SEARCH and DATA
- COMMS always depends on SEARCH (needs email context before drafting)
- SCHEDULER always depends on DATA (needs analysis before booking)
- MEET can run independently for simple "create a meeting" tasks
- MEET depends on SCHEDULER if it needs to find a free slot first
- PLANNER breaks down large goals into tasks — runs independently or depends on DATA for context
- DRIVE can run independently unless it needs SEARCH context
- DOCS depends on SEARCH and DATA (needs raw data before writing)
- EXECUTOR runs after any required context agents (SEARCH, DATA)
- GHOST_DETECTOR runs independently — no dependencies needed
- QA ALWAYS runs LAST with ALL other task IDs in its dependencies array
- For LEVEL_1: single QA task only, no sub-agents needed

## Agent Responsibilities (choose EXACTLY the right agent):
- MEET: Google Meet creation, joining meetings, inviting attendees
- DRIVE: finding files in Google Drive, opening files, listing recent files
- COMMS: all Gmail (read, send, reply, archive)
- SCHEDULER: all Google Calendar operations (view, block, delete, reschedule)
- PLANNER: decompose large goals into task lists, create project plans
- MONITOR: assess task risk, send proactive alerts and reminders
- GHOST_DETECTOR: scan inbox and calendar for unlogged deadlines
- EXECUTOR: cross-system multi-action execution (email + doc + meeting in one flow)
- DATA: analysis-only, never modifies data
- SEARCH: read-only intelligence gathering across tasks and calendar
- DOCS: create and write Google Docs and generate scripts
- QA: final synthesis and mission report

## STEP 3 — OUTPUT VALID JSON ONLY (no markdown, no explanation)
{
  "hardnessLevel": "LEVEL_3",
  "rationale": "User needs cross-system recovery plan involving calendar and email",
  "tasks": [
    {"id": "t1", "assignedAgent": "SEARCH", "instruction": "Get all overdue and today tasks. Find free slots tomorrow.", "dependencies": []},
    {"id": "t2", "assignedAgent": "DATA", "instruction": "Analyze task priority and completion risk.", "dependencies": []},
    {"id": "t3", "assignedAgent": "SCHEDULER", "instruction": "Block 2h recovery time for the most critical overdue task.", "dependencies": ["t2"]},
    {"id": "t4", "assignedAgent": "QA", "instruction": "Synthesize a mission report from all agent findings.", "dependencies": ["t1","t2","t3"]}
  ]
}

Agent roles available: SEARCH, DATA, COMMS, SCHEDULER, MEET, DRIVE, DOCS, CODING, QA, PLANNER, MONITOR, GHOST_DETECTOR, EXECUTOR
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
  userTodos: any[],
  calendarEvents: any[],
  apiKey: string,
  onStep: (step: AgentStep) => void,
  agentHistory: { role: string; text: string }[] = []
): Promise<string> => {
  onStep({ type: 'thinking', title: 'Supervisor (Agent 0) mapping workflow DAG...' });
  safeDispatch({ type: 'thinking', title: 'Supervisor mapping DAG...' });
  logApi('POST', '/api/v1/agent/supervisor', { userMessage }, 'pending');

  let taskList: DagTask[] = [];
  
  const historyContext = agentHistory.length > 0 
    ? `\n\n--- PREVIOUS CONVERSATION CONTEXT ---\n${agentHistory.map(m => `[${m.role.toUpperCase()}]: ${m.text}`).join('\n\n')}\n-----------------------------------\n\n`
    : '';
  
  const contextualizedUserMessage = `${historyContext}CURRENT REQUEST: ${userMessage}`;

  try {
    const response = await callWithFallback(async (genAI, modelName) => {
      const model = genAI.getGenerativeModel({ model: modelName, systemInstruction: SUPERVISOR_SYSTEM });
      return await model.generateContent(contextualizedUserMessage);
    });
    
    let text = response.response.text().trim();
    if (text.startsWith('```json')) text = text.slice(7, -3);
    else if (text.startsWith('```')) text = text.slice(3, -3);
    
    const parsed = JSON.parse(text);
    
    const normalizeAgentRole = (role: string): AgentRole => {
      const map: Record<string, AgentRole> = {
        'MEETING': 'MEET', 'MEETINGS': 'MEET',
        'CALENDAR': 'SCHEDULER', 'CAL': 'SCHEDULER',
        'EMAIL': 'COMMS', 'EMAILS': 'COMMS', 'GMAIL': 'COMMS',
        'FILE': 'DRIVE', 'FILES': 'DRIVE', 'STORAGE': 'DRIVE',
        'ANALYSIS': 'DATA', 'ANALYTICS': 'DATA',
        'PLAN': 'PLANNER', 'PLANNING': 'PLANNER',
        'RISK': 'MONITOR', 'MONITORING': 'MONITOR', 'ALERT': 'MONITOR',
        'GHOST': 'GHOST_DETECTOR', 'DETECTOR': 'GHOST_DETECTOR',
        'EXECUTE': 'EXECUTOR', 'ACTION': 'EXECUTOR',
        'DOCUMENT': 'DOCS', 'DOCUMENTS': 'DOCS',
        'CODE': 'CODING', 'SCRIPT': 'CODING',
        'QA_AGENT': 'QA', 'REVIEW': 'QA',
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
      assignedAgent: 'QA',
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
  
  while (!engine.isComplete()) {
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

    // Staggered Concurrency: only delay when truly running multiple concurrent tasks
    const MAX_CONCURRENT = 2;
    const STAGGER_DELAY = totalTasks > 2 ? 2000 : 0; // No stagger for LEVEL_1/simple tasks

    const executeTask = async (task: DagTask) => {
      engine.updateTaskStatus(task.id, 'running');
      onStep({ type: 'thinking', title: `[${task.assignedAgent}] Executing: ${task.instruction}` });
      safeDispatch({ type: 'thinking', title: `[${task.assignedAgent}] Running...` });

      try {
        const agentSystemPrompt = getAgentPrompt(task.assignedAgent);

        // Build context payload for this agent
        // Extract SEARCH's structured JSON block if available so downstream agents
        // don't need to re-fetch the same data via tool calls.
        const searchOutput = engine.state.completedTasks.find(t => t.startsWith('[SEARCH]:'));
        let preloadedSearchData = '';
        if (searchOutput) {
          // Pull out the ```json block from SEARCH output
          const jsonMatch = searchOutput.match(/```json([\s\S]*?)```/);
          if (jsonMatch) {
            preloadedSearchData = `\n\n## PRE-FETCHED DATA (DO NOT re-fetch these — use this data directly):\n\`\`\`json${jsonMatch[1]}\`\`\`\n⚠️ EFFICIENCY RULE: If the data you need (tasks, calendar slots, events) is already in PRE-FETCHED DATA above, use it directly WITHOUT calling get_tasks, list_calendar_events, or get_free_calendar_slots again. Only call tools for data NOT already provided.`;
          }
        }

        const contextPayload = {
          originalPrompt: engine.state.originalPrompt,
          completedTasksSummary: engine.state.completedTasks
            .map(t => t.substring(0, 600))
            .slice(-5)
            .join('\n'),
          errors: engine.state.errors.slice(-3),
        };
        let serialized = JSON.stringify(contextPayload);
        if (serialized.length > 8000) serialized = serialized.substring(0, 8000) + '...[truncated]';

        // Inject failed-agent context into QA
        if (task.assignedAgent === 'QA') {
          // Check for Context Staleness
          if (Date.now() - new Date(engine.state.contextBuiltAt).getTime() > engine.state.contextTTLMs) {
            onStep({ type: 'thinking', title: '⚠️ Context stale! Refreshing SEARCH data before final synthesis...' });
            safeDispatch({ type: 'thinking', title: '⚠️ Refreshing stale context...' });
            const searchTask = [...engine.tasks.values()].find(t => t.assignedAgent === 'SEARCH');
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
          agentSystemPrompt
        );

        engine.updateTaskStatus(task.id, 'completed', result);
        logWebSocket('agent.completed', { agent: task.assignedAgent, taskId: task.id });

        if (task.assignedAgent === 'QA') {
          engine.state.finalOutput = result;
        } else {
          // Sanitize result before injecting into shared state to prevent poisoning
          const sanitized = result.length > 1500
            ? result.substring(0, 1500) + `\n...[${task.assignedAgent} output truncated]`
            : result.replace(/```json[\s\S]*?```/g, '[JSON block]'); // strip raw JSON blobs
          engine.state.completedTasks.push(`[${task.assignedAgent}]: ${sanitized}`);
        }
      } catch (e: any) {
        engine.updateTaskStatus(task.id, 'failed', e.message);
        engine.state.errors.push(`[${task.assignedAgent}] failed: ${e.message}`);
        safeDispatch({ type: 'thinking', title: `⚠️ [${task.assignedAgent}] failed: ${e.message}` });
      }
    };


    const activePromises = new Set<Promise<void>>();

    for (const task of runnable) {
      if (activePromises.size >= MAX_CONCURRENT) {
        await Promise.race(activePromises);
      }

      const p = executeTask(task).finally(() => {
        activePromises.delete(p);
      });
      activePromises.add(p);

      // Jitter delay only when running multiple concurrent tasks
      if (STAGGER_DELAY > 0 && activePromises.size > 0) {
        await new Promise(r => setTimeout(r, STAGGER_DELAY));
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
    case 'SEARCH':         return SEARCH_SYSTEM;
    case 'DOCS':           return DOCS_SYSTEM;
    case 'DATA':           return DATA_SYSTEM;
    case 'COMMS':          return COMMS_SYSTEM;
    case 'SCHEDULER':      return SCHEDULER_SYSTEM;
    case 'DRIVE':          return DRIVE_SYSTEM;
    case 'CODING':         return CODING_SYSTEM;
    case 'MEET':           return MEET_SYSTEM;
    case 'PLANNER':        return PLANNER_SYSTEM;
    case 'MONITOR':        return MONITOR_SYSTEM;
    case 'GHOST_DETECTOR': return GHOST_DETECTOR_SYSTEM;
    case 'EXECUTOR':       return EXECUTOR_SYSTEM;
    case 'QA':             return QA_SYSTEM;
    default:
      console.warn(`[Orchestrator] Unknown agent role "${role}", falling back to QA.`);
      return QA_SYSTEM;
  }
}
