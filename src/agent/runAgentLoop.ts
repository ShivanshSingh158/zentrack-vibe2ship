import { TOOL_DECLARATIONS } from './toolDeclarations';
import type { ToolResult } from './toolExecutor';
import { executeTool } from './toolExecutor';
import { callWithFallback, callWithFallbackUnthrottled } from '../services/gemini/core';
import type { Task, CalendarEvent } from '../types/domain';

const AGENT_SYSTEM = `You are Zen Agent — an autonomous AI assistant with real tools.
You can read tasks, create tasks, schedule calendar blocks, and send reminders.
When the user asks you to do something: ALWAYS use the available tools to actually do it.
Never just describe what you would do — use the tools and DO IT.
After you've taken all needed actions, respond naturally explaining what you did.`;

export type AgentStep = 
  | { type: 'thinking'; title: string }
  | { type: 'tool_call'; toolName: string; args: Record<string, unknown> }
  | { type: 'tool_result'; toolName: string; result: ToolResult }
  | { type: 'answer'; title: string };

// Safe event dispatch — works in both browser and server contexts
const safeDispatch = (detail: object) => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('agent-log', { detail }));
  }
};

export const runAgentLoop = async (
  userMessage: string,
  userTodos: Task[],
  calendarEvents: CalendarEvent[],
  apiKey: string,
  onStep: (step: AgentStep) => void,
  systemInstruction?: string,
  modelOverride?: string,
  signal?: AbortSignal,
  isSubAgent?: boolean
): Promise<string> => {


  const effectiveSystem = systemInstruction || AGENT_SYSTEM;
  const contents: any[] = [{ role: 'user', parts: [{ text: userMessage }] }];
  let finalAnswer = '';
  const MAX_ITERATIONS = 6; // Reduced from 10 — agent looping 10+ times is likely stuck
  let emptyResponseCount = 0; // Guard: break if AI returns nothing for 2+ consecutive turns

  // ── Per-session tool cache ───────────────────────────────────────────────
  // Read-only tools are cached for this agent loop duration.
  // Same tool + same args = instant cache hit, no redundant API calls.
  const READ_ONLY_TOOLS = new Set([
    'get_tasks', 'list_calendar_events', 'get_free_calendar_slots', 'read_gmail'
  ]);
  const toolCache = new Map<string, any>(); // key: "toolName:argsHash" → result
  let connectWorkspaceCalledThisSession = false; // prevent connect retry storm

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    if (signal?.aborted) {
      return "Agent Loop Aborted: User cancelled execution.";
    }
    let response;
    try {
      const caller = isSubAgent ? callWithFallbackUnthrottled : callWithFallback;
      response = await caller(async (genAI, modelName) => {
        const activeModel = modelOverride || modelName;
        onStep({ type: 'thinking', title: `Zen AI is thinking... (${activeModel})` });
        safeDispatch({ type: 'thinking', title: `Zen AI is thinking... (${activeModel})` });

        const model = genAI.getGenerativeModel({
          model: activeModel,
          systemInstruction: effectiveSystem,
          tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
        });
        return await model.generateContent({ contents });
      });
    } catch (err: any) {
      const friendlyError = err.message || 'Unknown error occurred.';
      safeDispatch({ type: 'answer', title: `⚠️ ${friendlyError}` });
      return `Agent Loop Failed: ${friendlyError}`;
    }

    const candidate = response.response.candidates?.[0];
    if (!candidate) break;

    const parts = candidate.content.parts;
    
    // Check if AI wants to call a function
    const functionCallPart = parts.find((p: any) => !!p.functionCall);
    if (functionCallPart && functionCallPart.functionCall) {
      const name = functionCallPart.functionCall.name;
      const args = functionCallPart.functionCall.args as any;
      onStep({ type: 'tool_call', toolName: name, args });
      safeDispatch({ type: 'tool_call', toolName: name, args });

      // ── Deduplication guards ─────────────────────────────────────────────
      // 1. connect_google_workspace: only call once per session — subsequent
      //    calls return a cached success to prevent retry storms.
      if (name === 'connect_google_workspace') {
        if (connectWorkspaceCalledThisSession) {
          const cachedConnect = { success: true, data: {}, message: 'Google Workspace already connected this session.' };
          onStep({ type: 'tool_result', toolName: name, result: cachedConnect });
          safeDispatch({ type: 'tool_result', toolName: name, result: cachedConnect });
          contents.push({ role: 'model', parts: candidate.content.parts });
          contents.push({ role: 'function', parts: [{ functionResponse: { name, response: { result: cachedConnect.data, message: cachedConnect.message } } }] });
          continue;
        }
        connectWorkspaceCalledThisSession = true;
      }

      // 2. Read-only tools: cache by tool name + args fingerprint.
      //    Duplicate call within same agent loop → instant cache hit.
      const argsKey = JSON.stringify(args ?? {});
      const cacheKey = `${name}:${argsKey}`;
      if (READ_ONLY_TOOLS.has(name) && toolCache.has(cacheKey)) {
        const cached = toolCache.get(cacheKey);
        safeDispatch({ type: 'thinking', title: `[Cache hit] ${name} — reusing previous result` });
        onStep({ type: 'tool_result', toolName: name, result: cached });
        safeDispatch({ type: 'tool_result', toolName: name, result: cached });
        contents.push({ role: 'model', parts: candidate.content.parts });
        contents.push({ role: 'function', parts: [{ functionResponse: { name, response: { result: cached.data, message: cached.message } } }] });
        continue;
      }

      // Execute the real tool
      const result = await executeTool(name, args, userTodos, calendarEvents, signal);
      onStep({ type: 'tool_result', toolName: name, result });
      safeDispatch({ type: 'tool_result', toolName: name, result });

      // Store in cache if it's a read-only tool
      if (READ_ONLY_TOOLS.has(name)) {
        toolCache.set(cacheKey, result);
      }

      
      // Add AI's function call + our result to the conversation
      contents.push({ role: 'model', parts: candidate.content.parts });
      contents.push({
        role: 'function',
        parts: [{ functionResponse: { name, response: { result: result.data, message: result.message } } }]
      });
      continue; // loop again — AI may call more tools
    }

    // No function call → AI has a text response → done
    const textPart = parts.find((p: any) => !!p.text);
    if (textPart && textPart.text) {
      finalAnswer = textPart.text;
      onStep({ type: 'answer', title: finalAnswer });
      safeDispatch({ type: 'answer', title: finalAnswer });
      break;
    }

    // ✅ Empty response guard: AI returned neither a function call nor any text.
    // This is a silent loop — break early to prevent wasting API quota.
    emptyResponseCount++;
    if (emptyResponseCount >= 2) {
      console.warn('[ZenAgent] AI returned empty response twice in a row. Breaking loop.');
      finalAnswer = '[Agent completed without producing a final response. The task may have been partially executed. Check your data.]';
      safeDispatch({ type: 'answer', title: finalAnswer });
      break;
    }
    break;
  }

  return finalAnswer;
};
