import { callWithFallback, SAFETY_SETTINGS } from '../services/gemini/core';
import { logApi } from '../utils/networkLogger';
import type { DagTask, AgentRole } from './core/DagEngine';
import { userLearningStore } from '../services/userLearningStore';
import { missionCache, computeDataVersion } from '../services/MissionCache';
import { requireGoogleAuth } from './tools/shared';

import { buildSupervisorPrompt } from './orchestration/supervisorPrompt';
import { fastRouter } from './orchestration/fastRouter';
import { classifyIntent } from './orchestration/intentClassifier';
import { executeDag } from './orchestration/dagExecutor';
export { getAgentPromptByRole } from './orchestration/agentPrompts';

const safeDispatch = (detail: Record<string, any>) => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('agent-log', { detail }));
  }
};

// ── Agent role normalizer ───────────────────────────────────────────────────
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

export async function orchestrateAgent(
  instruction: string,
  appContext: any,
  apiKey: string,
  onStep: (step: any) => void,
  history: Array<{role: 'user'|'model', text: string}> = [],
  signal?: AbortSignal
): Promise<string> {

  // ── ARCH-004: Shallow-clone + freeze appContext ─────────────────────────────
  // appContext is built from React state in HomeDashboard and passed through the
  // entire agent pipeline. Every tool executor and every runAgentLoop call receives
  // the SAME object reference. Without this guard, any tool could write:
  //   appContext.tasks = []  → all downstream agents see empty task list
  // We shallow-clone first (spread) to avoid freezing the original React state
  // object (which may have internal Proxy descriptors that freeze poorly).
  // Object.freeze is SHALLOW — nested arrays/objects remain mutable. This catches
  // all root-level mutations (the most common accidental corruption pattern) at
  // near-zero cost.
  const frozenContext = Object.freeze({ ...appContext });

  // ── OPT-6: Check mission cache FIRST ───────────────────────────────────────
  // If this exact query was answered <30s ago with the same data state, return it instantly.
  const dataVersion = computeDataVersion(frozenContext);
  const cached = missionCache.get(instruction, dataVersion);
  if (cached) {
    onStep({ type: 'answer', title: cached });
    return cached;
  }

  // FIX: Format history with explicit [USER]/[SARA] labels so the intent classifier
  // and all agents can unambiguously identify which turns are user vs assistant.
  // The old format used role.toUpperCase() which is less clear for LLM parsing.
  const historyContext = history.length > 0
    ? history.slice(-10).map(m =>
        `[${m.role === 'user' ? 'USER' : 'SARA'}]: ${m.text}`
      ).join('\n')
    : '';

  // ── OPT-1: fastRouter FIRST — skip ALL Gemini calls if pattern matches ──────
  // fastRouter is pure regex, 0ms. If it matches, we bypass both intentClassifier
  // AND the supervisorPrompt, saving ~650ms on ~60% of common queries.
  const fastDag = fastRouter(instruction);

  if (fastDag) {
    // ── ARCH-005: Google token pre-flight for fast-routed DAGs ─────────────
    const GOOGLE_AUTH_AGENTS = new Set(['HERMES', 'CHRONOS', 'MEET', 'ARCHIVE', 'SCRIBE']);
    const needsGoogleAuth = fastDag.some(t => GOOGLE_AUTH_AGENTS.has(t.assignedAgent));
    if (needsGoogleAuth) {
      const authError = await requireGoogleAuth(signal);
      if (authError) {
        onStep({ type: 'answer', title: authError.message });
        return authError.message;
      }
    }
    onStep({ type: 'thinking', title: `⚡ Fast-routed: ${instruction.slice(0, 50)}` });
    safeDispatch({ type: 'thinking', title: '⚡ Fast-routing (no Gemini classify needed)...' });
    const result = await executeDag(fastDag, instruction, frozenContext, apiKey, onStep, safeDispatch, signal, historyContext);
    // Cache write-safe results (read-only fast routes are safe to cache)
    const isReadOnly = fastDag.every(t => ['ORACLE', 'NAVIGATOR', 'ENIGMA', 'AEGIS', 'CHRONOS'].includes(t.assignedAgent));
    if (isReadOnly) missionCache.set(instruction, dataVersion, result);
    return result;
  }

  // ── OPT-2: Intent classify + Supervisor DAG mapping in PARALLEL ─────────────
  // Previously these were sequential: classify first (~150ms), then supervisor (~500ms).
  // Now they race simultaneously. Total overhead = max(classify, supervisor) instead of sum.
  // For CHITCHAT: supervisor result is discarded (classify wins and returns early).
  // For ACTIONABLE: both complete, supervisor DAG is used immediately.

  userLearningStore.initialize(frozenContext).catch(() => {});

  const supervisorPersonaHint = (() => {
    const p = userLearningStore.getProfile();
    return `User persona: ${p.userPersona.toUpperCase()}. Peak hours: ${p.actualPeakHours.slice(0,3).map(h=>`${h}:00`).join(', ')}. Avg completion ratio: ${p.avgCompletionRatio}x. Avoidance topics: ${p.snoozePatternTopics.slice(0,3).join(', ')||'none'}.`;
  })();

  // BUG-010 FIX: Conversation history was concatenated raw into the prompt string.
  // If user messages contained backticks, curly braces, or unescaped quotes, the supervisor's
  // responseMimeType="application/json" structured output could fail to parse.
  // We now sanitize the history block before embedding it, replacing problematic characters.
  const safeHistoryContext = historyContext
    ? historyContext
        .replace(/`/g, "'")           // backticks → single quotes (safe in JSON strings)
        .replace(/\{/g, '(')          // curly brace open → paren
        .replace(/\}/g, ')')          // curly brace close → paren
        .replace(/"/g, "'")           // double quotes → single quotes
    : '';
  const contextualizedUserMessage = `${safeHistoryContext}CURRENT REQUEST: ${instruction}`;

  logApi('POST', '/api/v1/agent/supervisor', { userMessage: instruction }, 'pending');

  // ── Fire both classify AND supervisor in parallel ────────────────────────────
  let taskList: DagTask[] | null = null;
  let intentData: { intent: string; response: string } | null = null;

  try {
    const [intentResult, supervisorResult] = await Promise.allSettled([
      // Classify intent
      classifyIntent(instruction, historyContext, onStep, safeDispatch),

      // Supervisor DAG mapping (runs simultaneously — doesn't wait for classify)
      callWithFallback(async (genAI, modelName) => {
        const model = genAI.getGenerativeModel({
          model: modelName,
          safetySettings: SAFETY_SETTINGS,
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
                      assignedAgent: {
                        type: "string" as any,
                        enum: ["ORACLE","ENIGMA","HERMES","CHRONOS","MEET","ARCHIVE","SCRIBE","HEPHAESTUS","AEGIS","ATLAS","ARGUS","SPECTRE","TITAN","NAVIGATOR","MERCURY","GAINS"]
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
      }),
    ]);

    // Resolve intent classification
    if (intentResult.status === 'fulfilled') {
      intentData = intentResult.value;
    }

    // ── CHITCHAT: Short-circuit — supervisor DAG result is discarded ───────────
    if (intentData && (intentData.intent === 'CHITCHAT' || intentData.intent === 'CLARIFICATION_REQUIRED')) {
      onStep({ type: 'answer', title: intentData.response, isClarification: intentData.intent === 'CLARIFICATION_REQUIRED' });
      return intentData.response;
    }

    if (intentData) {
      onStep({ type: 'thinking', title: `[Intent: ACTIONABLE] ${intentData.response}` });
    }

    // ── ACTIONABLE: Use the supervisor DAG (already computed in parallel) ─────
    if (supervisorResult.status === 'fulfilled') {
      const text = supervisorResult.value.response.text();
      const parsed = JSON.parse(text);
      taskList = parsed.tasks.map((t: any) => ({
        ...t,
        assignedAgent: normalizeAgentRole(t.assignedAgent),
        status: 'pending',
      }));

      // FIX: Ensure there is always a final output generator
      if (taskList!.length === 1 && taskList![0].assignedAgent !== 'AEGIS') {
        // Single-agent shortcuts (e.g. ORACLE_DAILY_BRIEF) should be their own final output
        taskList![0].isFinal = true;
      } else if (!taskList!.some((t: any) => t.assignedAgent === 'AEGIS' || t.isFinal)) {
        // Multi-agent workflows require AEGIS to synthesize
        const allDependencies = new Set(taskList!.flatMap((t: any) => t.dependencies || []));
        const leafNodes = taskList!.filter((t: any) => !allDependencies.has(t.id)).map((t: any) => t.id);
        
        taskList!.push({
          id: 'auto_aegis_synthesis',
          assignedAgent: 'AEGIS',
          instruction: 'Synthesize the findings of the previous agents into a concise, human-readable response. Do not use raw JSON or system logs.',
          dependencies: leafNodes,
          status: 'pending',
        } as any);
      }
    }
  } catch (err) {
    console.error('Parallel classify+supervisor failed:', err);
  }

  // Fallback DAG if supervisor failed
  if (!taskList || taskList.length === 0) {
    taskList = [{
      id: 'fallback_1',
      assignedAgent: 'AEGIS',
      instruction: instruction,
      dependencies: [],
      status: 'pending',
    }];
  }

  // ── ARCH-005: Google Workspace token pre-flight check ───────────────────
  // HERMES, CHRONOS, MEET, ARCHIVE, and SCRIBE all require a valid Google OAuth token.
  // Previously each agent discovered the missing token independently on its first tool call,
  // wasting 3-4 Gemini API calls + agent startup time before the user was told to reconnect.
  // Now we check once before any agent runs. If the token is expired and silent refresh fails,
  // return immediately with a clear reconnect message.
  const GOOGLE_AUTH_AGENTS = new Set(['HERMES', 'CHRONOS', 'MEET', 'ARCHIVE', 'SCRIBE']);
  const needsGoogleAuth = taskList.some(t => GOOGLE_AUTH_AGENTS.has(t.assignedAgent));
  if (needsGoogleAuth) {
    onStep({ type: 'thinking', title: '🔑 Verifying Google Workspace token...' });
    const authError = await requireGoogleAuth(signal);
    if (authError) {
      onStep({ type: 'answer', title: authError.message });
      return authError.message;
    }
  }

  const result = await executeDag(taskList!, instruction, frozenContext, apiKey, onStep, safeDispatch, signal, historyContext);

  // Cache read-only mission results
  const isWriteMission = taskList.some(t => ['TITAN', 'HERMES', 'CHRONOS', 'MEET', 'SCRIBE', 'ATLAS'].includes(t.assignedAgent));
  if (!isWriteMission) {
    missionCache.set(instruction, dataVersion, result);
  } else {
    // Write operations change data — invalidate cache so next read is fresh
    missionCache.invalidate();
  }

  onStep({ type: 'answer', title: result });
  return result;
}
