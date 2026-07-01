import { TOOL_DECLARATIONS, TOOL_NAMES } from './toolDeclarations';
import type { ToolResult } from './toolExecutor';
import { executeTool } from './toolExecutor';
import { callWithFallback, callWithFallbackUnthrottled } from '../services/gemini/core';
import type { Task, CalendarEvent } from '../types/domain';

// Z5 FIX: The AGENT_SYSTEM default prompt was a 5-line minimal stub that fired in
// unexpected bypass scenarios (no systemInstruction provided). The misleading stub
// made debugging very difficult when it appeared in logs. Replaced with a clear,
// self-identifying fallback that explicitly states it's the default/fallback mode.
const AGENT_SYSTEM = `You are Zen Agent — the ZenTrack autonomous AI assistant running in DIRECT mode.
You have access to real tools for tasks, calendar, email, notes, goals, and habits.
When the user asks you to do something: ALWAYS use the available tools to actually do it.
Never just describe what you would do — use the tools and DO IT.
You are operating WITHOUT a specialized role assignment (this is the generic fallback mode).
After completing all actions, respond clearly explaining what you did and the results.`;


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
  // ⚠️ DEPRECATED: apiKey is no longer used — all calls route through callWithFallback()
  // which reads from the server proxy or the runtime key pool. Kept for API compatibility.
  _apiKey: string = '',
  onStep: (step: AgentStep) => void,
  systemInstruction?: string,
  modelOverride?: string,
  signal?: AbortSignal,
  isSubAgent?: boolean,
  depth: number = 0,
  forceToolCallFirstIteration: boolean = false,
  // ✅ BUG-R3 FIX: agentRole used to filter tool declarations to only what this agent needs
  agentRole?: string,
  // ✅ BUG-R2 FIX: sharedToolCache shared across all agents in a mission
  sharedToolCache?: Map<string, any>
): Promise<string> {
  const effectiveSystem = systemInstruction || AGENT_SYSTEM;
  const contents: Array<{ role: string; parts: Array<{ text?: string; functionResponse?: unknown }> }> = [{ role: 'user', parts: [{ text: userMessage }] }];
  let finalAnswer = '';
  const MAX_ITERATIONS = 6; // Reduced from 10 — agent looping 10+ times is likely stuck
  let emptyResponseCount = 0; // Guard: break if AI returns nothing for 2+ consecutive turns

  // ✅ BUG-R3 FIX: Per-agent tool whitelist.
  // Previously ALL 35+ tool declarations were sent to every agent (~22KB extra per call).
  // NAVIGATOR needs 3 tools. HERMES needs 7. Sending all 35 causes cross-domain hallucinations.
  // Savings: 70-80% reduction in tool-schema token overhead.
  const AGENT_TOOL_WHITELIST: Record<string, string[]> = {
    NAVIGATOR: ['navigate_to_module', 'open_gym_workout', 'query_internal_app_data'],
    HERMES:   ['read_gmail', 'send_gmail', 'reply_gmail', 'archive_gmail', 'draft_email',
               'send_notification', 'connect_google_workspace', 'delegate_task',
               // ✅ PART 4/6: Thread summarization, triage, deadline negotiation
               'get_email_thread', 'smart_email_triage', 'deadline_negotiator'],
    CHRONOS:  ['get_free_calendar_slots', 'list_calendar_events', 'schedule_task_in_calendar',
               'block_calendar', 'delete_calendar_events', 'auto_reschedule', 'create_google_meet',
               'update_calendar_event', 'connect_google_workspace', 'delegate_task',
               // ✅ PART 6: Chronos can also focus-lock and rebuild the day
               'focus_lock', 'rebuild_day'],
    ORACLE:   ['get_tasks', 'search_tasks', 'list_calendar_events', 'get_free_calendar_slots',
               'read_gmail', 'query_internal_app_data', 'connect_google_workspace',
               // ✅ PART 4: Oracle is the data intelligence agent — gets bunk calc, day review, meeting prep
               'calculate_bunk_capacity', 'get_email_thread', 'get_day_review', 'get_meeting_prep_brief', 'plan_study_schedule',
               // ✅ New: ORACLE can search notes for intelligence gathering
               'search_notes'],

    ARGUS:    ['get_tasks', 'search_tasks', 'get_free_calendar_slots', 'list_calendar_events',
               'send_notification', 'send_reminder', 'auto_reschedule', 'read_gmail', 'connect_google_workspace',
               // ✅ PART 6: ARGUS triggers panic mode in emergency recovery
               'panic_mode'],
    SPECTRE:  ['read_gmail', 'list_calendar_events', 'get_tasks', 'create_task', 'send_notification', 'connect_google_workspace'],
    TITAN:    ['send_gmail', 'reply_gmail', 'draft_email', 'create_google_doc', 'write_google_doc',
               'create_google_meet', 'create_task', 'schedule_task_in_calendar', 'send_notification',
               'notify_accountability_partner', 'connect_google_workspace', 'delegate_task',
               // ✅ PART 6: TITAN executes panic mode, focus lock, day rebuild
               'panic_mode', 'focus_lock', 'rebuild_day', 'deadline_negotiator',
               // ✅ New: TITAN is the executor — it can create habits and notes as part of multi-step plans
               'create_habit', 'create_note'],

    ARCHIVE:  ['list_drive_files', 'search_drive_files', 'create_google_doc', 'read_google_doc', 'send_notification', 'connect_google_workspace', 'delegate_task'],
    MEET:     ['create_google_meet', 'list_calendar_events', 'update_calendar_event', 'delete_calendar_event', 'send_gmail', 'connect_google_workspace', 'delegate_task', 'get_meeting_prep_brief'],
    SCRIBE:   ['create_google_doc', 'write_google_doc', 'read_google_doc', 'list_drive_files', 'send_notification', 'connect_google_workspace', 'delegate_task',
               // ✅ New: SCRIBE can create ZenTrack notes and search existing notes for context
               'create_note', 'search_notes'],
    ENIGMA:   ['get_tasks', 'query_internal_app_data', 'list_calendar_events', 'read_gmail', 'send_notification', 'connect_google_workspace',
               // ✅ New: ENIGMA drives the Weekly Review and can search notes for analytics context
               'generate_weekly_review', 'search_notes'],
    ATLAS:    ['get_tasks', 'create_task', 'update_task', 'schedule_task_in_calendar', 'send_notification', 'delegate_task', 'connect_google_workspace', 'plan_study_schedule', 'calculate_bunk_capacity',
               // ✅ New: ATLAS creates actual goals (not just tasks) — closes the Goals blindspot
               'create_goal'],
    HEPHAESTUS: ['create_google_doc', 'write_google_doc', 'send_notification', 'delegate_task', 'connect_google_workspace'],

    // ✅ ISSUE-R1 FIX: AEGIS is a SYNTHESIS agent — it should never write tasks or send emails.
    // Previously AEGIS: TOOL_NAMES (~22KB of schema, 40+ tools) caused it to call create_task
    // and send_gmail during final synthesis steps. Now restricted to read-only + notify only.
    AEGIS: [
      'get_tasks', 'query_internal_app_data', 'list_calendar_events',
      'send_notification', 'get_day_review', 'get_meeting_prep_brief',
    ],
  };

  // ✅ BUG-R6 FIX: Extended read-only tools cache set to include new read-only tools.
  const READ_ONLY_TOOLS = new Set([
    'get_tasks', 'search_tasks', 'list_calendar_events', 'get_free_calendar_slots',
    'read_gmail', 'query_internal_app_data', 'list_drive_files', 'get_notes', 'read_google_doc',
    // ✅ New read-only analytical tools — safe to cache
    'calculate_bunk_capacity', 'get_email_thread', 'get_day_review', 'get_meeting_prep_brief', 'smart_email_triage',
    // ✅ New: search_notes is read-only — safe to cache (notes content doesn't change mid-mission)
    'search_notes',
  ]);


  // ✅ BUG-R2 FIX: Use sharedToolCache if provided (cross-agent cache), otherwise create local one
  const toolCache = sharedToolCache ?? new Map<string, ToolResult>();
  let connectWorkspaceCalledThisSession = false; // prevent connect retry storm

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    if (signal?.aborted) {
      return "Agent Loop Aborted: User cancelled execution.";
    }
    let response;
    let hasLoggedThinking = false;
    try {
      // ✅ ISSUE-R3 FIX: Only use unthrottled caller for deeply nested sub-agents (depth >= 2).
      // Previously ALL sub-agents bypassed the semaphore, meaning a TITAN->HERMES->CHRONOS
      // delegation chain fired 3 API calls with zero throttling, bursting the quota limit.
      // Depth 0-1 (direct orchestrator calls and first-level delegates) go through the semaphore.
      const caller = (isSubAgent && depth >= 2) ? callWithFallbackUnthrottled : callWithFallback;
      response = await caller(async (genAI, modelName) => {
        const activeModel = modelOverride || modelName;
        if (!hasLoggedThinking) {
          onStep({ type: 'thinking', title: `Zen AI is thinking... (${activeModel})` });
          hasLoggedThinking = true;
        }

        // ✅ BUG-R3: Filter to only the tools this agent role needs
        const agentAllowedNames = agentRole ? (AGENT_TOOL_WHITELIST[agentRole] ?? TOOL_NAMES) : TOOL_NAMES;
        // Also strip delegate_task for sub-agents at depth >= 2 to prevent infinite recursion
        const effectiveNames = depth >= 2
          ? agentAllowedNames.filter(n => n !== 'delegate_task')
          : agentAllowedNames;
        const filteredDeclarations = TOOL_DECLARATIONS.filter(t => effectiveNames.includes(t.name));
        const filteredNames = effectiveNames;
          
        const model = genAI.getGenerativeModel({
          model: activeModel,
          systemInstruction: effectiveSystem,
          tools: [{ functionDeclarations: filteredDeclarations }],
        });

        // ✅ INEFFICIENCY-3 FIX: Per-role timeouts. Navigation and simple creates need 20s max,
        // not 2 minutes. Users staring at a frozen spinner for 120s on "go to calendar" is unacceptable.
        const agentTimeoutMs =
          agentRole === 'NAVIGATOR' ? 20_000 :
          (agentRole === 'TITAN' && i === 0) ? 25_000 :
          (agentRole === 'HERMES' || agentRole === 'ORACLE') ? 60_000 :
          120_000; // default for complex multi-step agents

        const timeoutPromise = new Promise<any>((_, reject) => {
          setTimeout(() => reject(new Error(`Timeout: Gemini API took longer than ${agentTimeoutMs/1000}s to respond.`)), agentTimeoutMs);
        });
        
        return await Promise.race([
          model.generateContent(
            {
              contents,
              // —— Anti-Hallucination Guard ————————————————————————————————————
              // toolConfig restricts the model to ONLY call functions in our declared
              // whitelist. The Gemini API rejects any function call not in this list,
              // eliminating wasted 2-4 second retry cycles from hallucinated tool names.
              toolConfig: {
                // ✅ ISSUE-R2 FIX: ORACLE should NOT be forced into ANY mode on iteration 0.
                // ORACLE often needs one reasoning turn to decide which data sources to pull.
                // Forcing ANY caused it to blindly call the wrong tool first then correct itself
                // in a second iteration, wasting an API call. Now only non-ORACLE agents get
                // the forceToolCallFirstIteration treatment (CHRONOS, TITAN, HERMES benefit from it).
                functionCallingConfig: (forceToolCallFirstIteration && i === 0 && filteredNames.length > 0 && agentRole !== 'ORACLE')
                  ? { mode: 'ANY' as any, allowedFunctionNames: filteredNames }
                  : { mode: 'AUTO' as any },
              },
            },
            { requestOptions: { timeout: agentTimeoutMs, signal } }
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

        // ✅ BUG FIX: Sort keys before stringifying — JSON.stringify({b:1,a:2}) ≠ JSON.stringify({a:2,b:1})
        // This caused false cache misses when the same call came in with different argument ordering.
        const sortedArgs = args ? Object.fromEntries(Object.entries(args).sort(([a], [b]) => a.localeCompare(b))) : {};
        const argsKey = JSON.stringify(sortedArgs);
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

        // ✅ FIX: Short-circuit on repeated auth/tool failures (DEDUCTION 2.3)
        // If the same tool fails twice with the same error, stop retrying immediately
        // Prevents 18 failed Gmail API calls when auth is broken (6 loops × 3 calls)
        if (!result.success && result.message) {
          const failKey = `fail:${name}:${result.message.substring(0, 60)}`;
          const prevFailCount = (toolCache.get(failKey) as any)?.count || 0;
          if (prevFailCount >= 1) {
            // 2nd failure with same error — stop the loop
            finalAnswer = `⚠️ ${name} failed repeatedly: ${result.message}. Stopping to avoid wasted calls.`;
            onStep({ type: 'thinking', title: `[Short-circuit] ${name} failed twice — stopping` });
          } else {
            toolCache.set(failKey, { count: prevFailCount + 1 });
          }
        }

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

      // Check if short-circuit was triggered by any tool failure
      if (finalAnswer) break;

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
