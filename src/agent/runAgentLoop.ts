import { TOOL_DECLARATIONS, TOOL_NAMES } from './toolDeclarations';
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

export async function runAgentLoop(
  userMessage: string,
  appContext: any,
  apiKey: string,
  onStep: (step: AgentStep) => void,
  systemInstruction?: string,
  modelOverride?: string,
  signal?: AbortSignal,
  isSubAgent?: boolean,
  depth: number = 0,
  forceToolCallFirstIteration: boolean = false
): Promise<string> {
  const effectiveSystem = systemInstruction || AGENT_SYSTEM;
  const contents: Array<{ role: string; parts: Array<{ text?: string; functionResponse?: unknown }> }> = [{ role: 'user', parts: [{ text: userMessage }] }];
  let finalAnswer = '';
  const MAX_ITERATIONS = 6; // Reduced from 10 — agent looping 10+ times is likely stuck
  let emptyResponseCount = 0; // Guard: break if AI returns nothing for 2+ consecutive turns

  // ── Per-session tool cache ───────────────────────────────────────────────
  // Read-only tools are cached for this agent loop duration.
  // Same tool + same args = instant cache hit, no redundant API calls.
  const READ_ONLY_TOOLS = new Set([
    'get_tasks', 'list_calendar_events', 'get_free_calendar_slots', 'read_gmail'
  ]);
  const toolCache = new Map<string, ToolResult>(); // key: "toolName:argsHash" → result
  let connectWorkspaceCalledThisSession = false; // prevent connect retry storm

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    if (signal?.aborted) {
      return "Agent Loop Aborted: User cancelled execution.";
    }
    let response;
    let hasLoggedThinking = false;
    try {
      const caller = isSubAgent ? callWithFallbackUnthrottled : callWithFallback;
      response = await caller(async (genAI, modelName) => {
        const activeModel = modelOverride || modelName;
        if (!hasLoggedThinking) {
          onStep({ type: 'thinking', title: `Zen AI is thinking... (${activeModel})` });
          hasLoggedThinking = true;
        }

        const filteredDeclarations = depth >= 2
          ? TOOL_DECLARATIONS.filter(t => t.name !== 'delegate_task')
          : TOOL_DECLARATIONS;
        const filteredNames = depth >= 2
          ? TOOL_NAMES.filter(n => n !== 'delegate_task')
          : TOOL_NAMES;
          
        const model = genAI.getGenerativeModel({
          model: activeModel,
          systemInstruction: effectiveSystem,
          tools: [{ functionDeclarations: filteredDeclarations }],
        });
        
        const timeoutPromise = new Promise<any>((_, reject) => {
          setTimeout(() => reject(new Error('Timeout: Gemini API took longer than 120 seconds to respond.')), 120000);
        });
        
        return await Promise.race([
          model.generateContent(
            {
              contents,
              // ── Anti-Hallucination Guard ────────────────────────────────────────
              // toolConfig restricts the model to ONLY call functions in our declared
              // whitelist. The Gemini API rejects any function call not in this list,
              // eliminating wasted 2-4 second retry cycles from hallucinated tool names.
              toolConfig: {
                functionCallingConfig: (forceToolCallFirstIteration && i === 0 && filteredNames.length > 0)
                  ? { mode: 'ANY' as any, allowedFunctionNames: filteredNames }
                  : { mode: 'AUTO' as any },
              },
            },
            { requestOptions: { timeout: 120000, signal } }
          ),
          timeoutPromise
        ]);
      }, signal);
    } catch (err: unknown) {
      const friendlyError = (err as { message?: string }).message || 'Unknown error occurred.';
      onStep({ type: 'answer', title: `⚠️ ${friendlyError}` });
      return `Agent Loop Failed: ${friendlyError}`;
    }

    const candidate = response.response.candidates?.[0];
    if (!candidate) break;

    const parts = candidate.content.parts;
    
    // Check if AI wants to call functions
    const functionCallParts = parts.filter((p: { functionCall?: unknown }) => !!p.functionCall);
    if (functionCallParts.length > 0) {
      // Execute all tool calls concurrently
      const results = await Promise.all(functionCallParts.map(async (part: any) => {
        const name = part.functionCall.name;
        const args = part.functionCall.args as Record<string, unknown>;
        
        onStep({ type: 'tool_call', toolName: name, args });

        // ── Deduplication guards ─────────────────────────────────────────────
        if (name === 'connect_google_workspace') {
          if (connectWorkspaceCalledThisSession) {
            const cachedConnect = { success: true, data: {}, message: 'Google Workspace already connected this session.' };
            onStep({ type: 'tool_result', toolName: name, result: cachedConnect });
            return { name, result: cachedConnect };
          }
          connectWorkspaceCalledThisSession = true;
        }

        const argsKey = JSON.stringify(args ?? {});
        const cacheKey = `${name}:${argsKey}`;
        if (READ_ONLY_TOOLS.has(name) && toolCache.has(cacheKey)) {
          const cached = toolCache.get(cacheKey)!;
          onStep({ type: 'thinking', title: `[Cache hit] ${name} — reusing previous result` });
          onStep({ type: 'tool_result', toolName: name, result: cached });
          return { name, result: cached };
        }

        // Execute the real tool
        const result = await executeTool(name, args, appContext, signal, depth);
        onStep({ type: 'tool_result', toolName: name, result });

        if (READ_ONLY_TOOLS.has(name)) {
          toolCache.set(cacheKey, result);
        } else if (result.success) {
          // Invalidate cache for write operations
          if (name.includes('task')) {
            for (const k of toolCache.keys()) {
              if (k.startsWith('get_tasks:')) toolCache.delete(k);
            }
          }
          if (name.includes('calendar') || name.includes('meet')) {
            for (const k of toolCache.keys()) {
              if (k.startsWith('list_calendar_events:') || k.startsWith('get_free_calendar_slots:')) {
                toolCache.delete(k);
              }
            }
          }
          if (name.includes('gmail') || name.includes('email')) {
            for (const k of toolCache.keys()) {
              if (k.startsWith('read_gmail:')) toolCache.delete(k);
            }
          }
        }

        return { name, result };
      }));

      // Add AI's function calls + our results to the conversation
      // CRITICAL FIX: Gemini API throws 400 Bad Request if a text part is empty.
      // Often the model returns [{ text: "" }, { functionCall: ... }]. We must strip empty text parts.
      const safeParts = candidate.content.parts.filter((p: any) => !('text' in p) || (typeof p.text === 'string' && p.text.trim() !== ''));
      contents.push({ role: 'model', parts: safeParts.length > 0 ? safeParts : candidate.content.parts });
      
      const functionResponseParts = results.map(({ name, result }) => ({
        functionResponse: { name, response: { result: result.data, message: result.message } }
      }));
      contents.push({ role: 'function', parts: functionResponseParts });
      
      continue; // loop again — AI may call more tools
    }

    // No function call → AI has a text response → done
    const textPart = parts.find((p: { functionCall?: unknown; text?: string }) => !!p.text);
    if (textPart && textPart.text) {
      finalAnswer = textPart.text;
      onStep({ type: 'answer', title: finalAnswer });
      break;
    }

    // ✅ Empty response guard: AI returned neither a function call nor any text.
    // This is a silent loop — break early to prevent wasting API quota.
    emptyResponseCount++;
    if (emptyResponseCount >= 2) {
      console.warn('[ZenAgent] AI returned empty response twice in a row. Breaking loop.');
      finalAnswer = '[Agent completed without producing a final response. The task may have been partially executed. Check your data.]';
      onStep({ type: 'answer', title: finalAnswer });
      break;
    }
    break;
  }

  return finalAnswer;
};
