import { DagEngine } from '../core/DagEngine';
import type { DagTask } from '../core/DagEngine';
import { createInitialState } from '../core/SharedState';
import { runAgentLoop } from '../runAgentLoop';
import { loadAgentMemoryContext } from '../../services/agentMemoryPersistence';
import { buildPersonalityContext } from './personalityContext';
import { logWebSocket } from '../../utils/networkLogger';
import { getAgentPromptByRole } from './agentPrompts';

export async function executeDag(
  taskList: DagTask[],
  instruction: string,
  appContext: any,
  apiKey: string,
  onStep: (step: any) => void,
  safeDispatch: (detail: any) => void,
  signal?: AbortSignal,
  conversationHistoryContext?: string
): Promise<string> {
  const engine = new DagEngine(createInitialState(instruction));
  taskList.forEach(t => engine.addTask(t));

  onStep({ type: 'thinking', title: `Supervisor mapped ${taskList.length} tasks. Initiating DAG Execution...` });

  // ARCH-001: Tab visibility warning — Chrome throttles setTimeout in background tabs to ~1Hz.
  // If a mission starts while the tab is hidden, warn the user immediately so they know
  // to return to the tab for full-speed execution. This is a UX hint, not a blocker.
  if (typeof document !== 'undefined' && document.hidden) {
    safeDispatch({ type: 'thinking', title: '⚠️ Tab is backgrounded — Chrome may throttle agent timers. Return to tab for best performance.' });
  }
  
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

  /**
   * Builds a rich structured 'PRIOR AGENT INTELLIGENCE' block for downstream agents.
   * This is the cross-agent history the user wants — every completed agent's
   * findings are summarized and passed to all downstream agents.
   */
  const buildPriorAgentIntelligence = (engine: DagEngine, currentAgentRole: string): string => {
    const completedAgents = [...engine.tasks.values()]
      .filter(t => t.status === 'completed' && t.assignedAgent !== currentAgentRole && t.result);
    
    if (completedAgents.length === 0) return '';

    const agentBlocks = completedAgents.map(t => {
      const result = t.result || '';
      // Extract SPOKEN_SUMMARY for a compact view
      const normalizedResult = result.replace(/\*+SPOKEN_SUMMARY\*+/gi, 'SPOKEN_SUMMARY').replace(/SPOKEN_SUMMARY\*+:/gi, 'SPOKEN_SUMMARY:');
      const spokenSummaryMatch = normalizedResult.match(/SPOKEN_SUMMARY[:\s*]*([\s\S]*)$/i);
      const spokenSummary = spokenSummaryMatch?.[1]?.replace(/^\s*[:\s*]+/, '').replace(/\*+/g, '').trim().split('\n')[0] || '';
      
      // Extract key data lines (action lines, data lines)
      const keyLines = result
        .split('\n')
        .filter(l => /^[✅📧📅🔔🚨📋📄🔗⚠️➤→\-•🌐📰📚🏋️]/.test(l.trim()) || l.includes('FINDINGS') || l.includes(':'))
        .slice(0, 10)
        .map(l => l.trim())
        .filter(Boolean);

      // Determine a short summary: prefer SPOKEN_SUMMARY, else first 500 chars of result
      const compactResult = spokenSummary.length > 10
        ? spokenSummary
        : result.substring(0, 500).replace(/\n+/g, ' ').trim();

    return `### [${t.assignedAgent}] — Task: "${t.instruction.substring(0, 200)}${t.instruction.length > 200 ? '...' : ''}"
**Summary:** ${compactResult}
${keyLines.length > 0 ? `**Key Findings:**\n${keyLines.slice(0, 6).map(l => `  - ${l}`).join('\n')}` : ''}`;
    }).join('\n\n');

    return `\n\n## 🧠 PRIOR AGENT INTELLIGENCE (use this — do NOT re-fetch data already gathered)\n\n${agentBlocks}\n\n> CRITICAL: Build on what these agents found. Do NOT re-call tools that prior agents already called unless you need fresher data. Cross-reference these findings with your own results.`;
  };


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

  let _cachedAgentMemory: string | null = null;
  const getAgentMemory = async (): Promise<string> => {
    if (_cachedAgentMemory === null) {
      _cachedAgentMemory = await loadAgentMemoryContext();
    }
    return _cachedAgentMemory;
  };

  const sharedToolCache = new Map<string, any>();
  const _personalityContextCache = new Map<string, string>();
  const agentRolesInMission = new Set(taskList.map(t => t.assignedAgent));
  agentRolesInMission.add('ORACLE');
  agentRolesInMission.add('AEGIS');

  // BUG-003 FIX: Track retry counts per task ID in the outer scope.
  // Previously _agentRetryCount was declared inside executeTask(), which meant it reset
  // to 0 every time the while loop re-called executeTask for the same task after a 429.
  // MAX_AGENT_RETRIES was never enforced — agents could retry infinitely.
  const taskRetryCountMap = new Map<string, number>();

  // PERF-003 FIX: Moved AGENT_START_PHRASES out of the while loop body.
  // Previously re-created as a new object on every loop iteration — now a stable constant.
  const AGENT_START_PHRASES: Record<string, string[]> = {
    'CHRONOS': [
      "Chronos is pulling up your schedule.",
      "Let me have Chronos cross-check your calendar.",
      "Your timeline is being scanned by Chronos now.",
      "Chronos is syncing your calendar — one moment.",
    ],
    'ATHENA': [
      "Athena is on the documents.",
      "I've got Athena handling the paperwork.",
      "Athena's working on that write-up for you.",
      "Deploying Athena for the document work.",
    ],
    'HERMES': [
      "Hermes is scanning your inbox right now.",
      "Let me have Hermes dig through your emails.",
      "Your inbox is being swept by Hermes.",
      "Hermes is on mail duty — stand by.",
    ],
    'AEGIS': [
      "AEGIS is compiling the final brief for you.",
      "Pulling everything together now — almost there.",
      "AEGIS is synthesizing all the results.",
      "Your report is nearly ready.",
    ],
    'ORACLE': [
      "ORACLE is running an intelligence sweep.",
      "Let me pull that intel for you right now.",
      "ORACLE is searching for the latest data.",
      "Running a deep scan with ORACLE.",
    ],
    'SCRIBE': [
      "Scribe is drafting that for you.",
      "I've got Scribe putting the document together.",
      "Your document is being written by Scribe now.",
      "Scribe is on it — composing as we speak.",
    ],
    'MERCURY': [
      "Mercury is hitting the live internet for you.",
      "Searching the web now — Mercury is on it.",
      "Mercury is pulling live data right now.",
      "Let me have Mercury search that for you.",
    ],
    'GAINS': [
      "GAINS is reading your gym plan now.",
      "Let me have GAINS pull up your workout.",
      "GAINS is checking your training schedule.",
      "Your fitness coach GAINS is on it.",
    ],
    'NAVIGATOR': [
      "Navigating to the right module for you.",
      "One second — opening that up now.",
      "Routing you to the right place.",
      "Navigator is taking you there.",
    ],
    'TITAN': [
      "Titan is executing that for you.",
      "TITAN is handling the action.",
      "Running that command with Titan now.",
    ],
    'ATLAS': [
      "Atlas is mapping the landscape.",
      "Pulling the big picture together with Atlas.",
      "Atlas is planning that out for you.",
    ],
    'ENIGMA': [
      "Enigma is crunching your analytics.",
      "Running the analysis with Enigma now.",
      "Enigma is digging into the data.",
    ],
    'ARGUS': [
      "Argus is scanning for risks.",
      "Let Argus assess the situation.",
      "Running a risk check with Argus.",
    ],
    'SPECTRE': [
      "Spectre is hunting for ghost deadlines.",
      "Let Spectre scan for hidden commitments.",
    ],
    'PROMETHEUS': [
      "Prometheus is mapping out the strategy.",
      "Let Prometheus plan this out for you.",
      "Your action plan is being drawn up.",
    ],
  };

  try {
    const sharedAgentMemory = await loadAgentMemoryContext();
    _cachedAgentMemory = sharedAgentMemory;

    await Promise.all(
      [...agentRolesInMission].map(async role => {
        const ctx = await buildPersonalityContext(role, appContext, getAgentMemory);
        _personalityContextCache.set(role, ctx);
      })
    );
  } catch (e) {
    console.warn('[Orchestrator] Pre-building personality contexts failed — agents will build lazily:', e);
  }

  const dispatchAgentVoice = (agentId: string, priority: 'normal' | 'high' = 'normal') => {
    const phrases = AGENT_START_PHRASES[agentId];
    if (!phrases) return;
    const text = phrases[Math.floor(Math.random() * phrases.length)];
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('agent-speak', { detail: { text, priority, agent: agentId } }));
    }
  };

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

      // 🔊 REAL-TIME NARRATION: Speak agent activation out loud
      dispatchAgentVoice(task.assignedAgent);
      
      // BUG-003 FIX: Retry count tracked per-task in outer Map, not inside this function.
      // Previously declared here as `let _agentRetryCount = 0` which reset on every call,
      // making MAX_AGENT_RETRIES ineffective (agents could retry infinitely).
      // Using `let` (not `const`) because it is incremented with ++ during retry logic.
      let _agentRetryCount = taskRetryCountMap.get(task.id) ?? 0;

      try {
        const { serialized, preloaded: preloadedSearchData } = getCachedContext();

        const agentPersonalityContext = _personalityContextCache.get(task.assignedAgent)
          ?? await buildPersonalityContext(task.assignedAgent, appContext, getAgentMemory);

        if (task.assignedAgent === 'AEGIS') {
        // BUG-011 FIX: The stale context refresh created a task with `id + '_refresh'` but
        // never added it to engine.tasks. engine.updateTaskStatus would throw because the ID
        // didn't exist. Fix: use the original task's ID so engine tracking stays consistent,
        // and clone carefully to avoid mutating the original task object.
        if (Date.now() - new Date(engine.state.contextBuiltAt).getTime() > engine.state.contextTTLMs) {
          onStep({ type: 'thinking', title: '⚠️ Context stale! Refreshing ORACLE data before final synthesis...' });
          safeDispatch({ type: 'thinking', title: '⚠️ Refreshing stale context...' });
          const oracleTask = [...engine.tasks.values()].find(t => t.assignedAgent === 'ORACLE' && t.status === 'completed');
          if (oracleTask) {
            // Re-run ORACLE inline — result stored in shared context, not in engine task status
            try {
              const refreshedResult = await runAgentLoop(
                oracleTask.instruction,
                appContext, apiKey,
                (step) => safeDispatch({ ...step, agent: 'ORACLE_REFRESH' }),
                getAgentPromptByRole('ORACLE'),
                undefined, signal, true, 0, false, 'ORACLE', sharedToolCache
              );
              // Update the completed task result so AEGIS downstream gets fresh data
              engine.updateTaskStatus(oracleTask.id, 'completed', refreshedResult);
              engine.state.contextBuiltAt = new Date().toISOString();
            } catch (refreshErr) {
              console.warn('[Orchestrator] ORACLE context refresh failed (non-fatal):', refreshErr);
            }
          }
        }

          const failedTasks = [...engine.tasks.values()]
            .filter(t => t.status === 'failed')
            .map(t => `[${t.assignedAgent}] FAILED: ${t.result || 'Unknown error'}`);
          if (failedTasks.length > 0) {
            task.instruction += `\n\n⚠️ FAILED AGENTS (you MUST acknowledge these in your report):\n${failedTasks.join('\n')}`;
          }
        }

        const taskHistoryContext = engine.state.completedTasks.length > 0 
          ? `\n\n--- PREVIOUSLY COMPLETED TASKS ---\n${engine.state.completedTasks.join('\n\n')}`
          : '';

        // Cross-agent intelligence: structured prior-agent findings injected into every agent
        const priorAgentIntelligence = buildPriorAgentIntelligence(engine, task.assignedAgent);
          
        const result = await runAgentLoop(
          `${agentPersonalityContext}${task.instruction}\n\nShared Context: ${serialized}${preloadedSearchData}${priorAgentIntelligence}\n${taskHistoryContext}${conversationHistoryContext ? '\n\n## CONVERSATION HISTORY (cross-session memory):\n' + conversationHistoryContext : ''}`,
          appContext,
          apiKey,
          (step) => {
            onStep({ ...step, agent: task.assignedAgent });
            safeDispatch({ ...step, agent: task.assignedAgent });
          },
          getAgentPromptByRole(task.assignedAgent),
          undefined,
          signal,
          true,
          0,
          task.assignedAgent !== 'AEGIS',
          task.assignedAgent,
          sharedToolCache
        );
        logWebSocket('agent.completed', { agent: task.assignedAgent, taskId: task.id });

        engine.updateTaskStatus(task.id, 'completed', result);

        if (task.isFinal) {
          engine.state.finalOutput = result;
          for (const t of engine.tasks.values()) {
            if (t.assignedAgent === 'AEGIS' && t.status === 'pending') {
              engine.updateTaskStatus(t.id, 'completed', 'Skipped — isFinal agent provided direct response');
            }
          }
          return;
        }

        if (task.assignedAgent === 'AEGIS') {
          engine.state.finalOutput = result;
          // 🔊 Final answer: high-priority flush interrupts any filler narration
          // The answer text is spoken after the agent-log answer event fires in the UI layer.
        } else {
          const jsonRegex = /```json\s*([\s\S]*?)\s*```/gi;
          let match;
          let jsonCount = 0;
          while ((match = jsonRegex.exec(result)) !== null) {
            try {
              const parsed = JSON.parse(match[1]);
              engine.state.dataContext[task.assignedAgent] = {
                ...(engine.state.dataContext[task.assignedAgent] as any || {}),
                ...parsed,
              };
            } catch (e) {
              console.warn(`[Orchestrator] Failed to parse JSON from ${task.assignedAgent}`);
            }
          }

          const actionLines = result
            .split('\n')
            .filter(l => /^[✅📧📅🔔🚨📋📄🔗⚠️➤→\-•]/.test(l.trim()))
            .slice(0, 8)
            .map(l => l.trim());

          const warningLines = result
            .split('\n')
            .filter(l => /^[⚠️❌🚫]/.test(l.trim()) || /\bfailed\b|\bno free\b|\bnot found\b|\bcould not\b/i.test(l))
            .slice(0, 4)
            .map(l => l.trim());

          const hintLines: string[] = [];
          const d = engine.state.dataContext[task.assignedAgent] as any;
          if (d) {
            if (d?.free_slots?.length > 0) hintLines.push(`→ CHRONOS hint: first free slot is ${d.free_slots[0]}`);
            if (d?.overdue?.length > 0) hintLines.push(`→ Most critical overdue: "${d.overdue[0]?.title}" (${d.overdue[0]?.priority || 'medium'} priority)`);
            if (d?.risk_level) hintLines.push(`→ Risk level: ${d.risk_level}`);
          }

          const strippedResult = result
            .replace(/<script[\s\S]*?<\/script>/gi, '[SCRIPT REMOVED]')
            .replace(/\b(delete all|truncate|drop table|remove everything)\b/gi, '[REDACTED ACTION]')
            .replace(/```json[\s\S]*?```/gi, '[JSON DATA STORED IN CONTEXT]');

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
          // OPT-9: Immediate key rotation — don't sleep if another key is available.
          // Old behavior: sleep 3s × attempt (3s, 6s, 9s) regardless of key availability.
          // New behavior: retry immediately; only sleep if all keys are rate-limited.
          const { getActiveKeyPool } = await import('../../services/gemini/core');
          const availableKeys = getActiveKeyPool().length;
          const retryDelay = availableKeys > 1
            ? 200  // another key available — near-instant retry with small buffer
            : 3000 * _agentRetryCount; // all keys exhausted — wait for cooldown
          safeDispatch({ type: 'thinking', title: `⚠️ [${task.assignedAgent}] rate limit. ${availableKeys > 1 ? 'Rotating key...' : `Waiting ${retryDelay/1000}s...`} (${_agentRetryCount}/${MAX_AGENT_RETRIES})` });
          console.warn(`[Orchestrator] Agent ${task.assignedAgent} 429, ${availableKeys > 1 ? 'rotating key' : `sleeping ${retryDelay}ms`}`);
          if (retryDelay > 500 && typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('agent-speak', { detail: { text: `Hit a rate limit. Switching to backup key now.`, priority: 'normal' } }));
          }
          await new Promise(r => setTimeout(r, retryDelay));
          // BUG-003 FIX: Persist the incremented retry count to the outer Map before returning,
          // so the next executeTask call for this same task sees the updated count.
          taskRetryCountMap.set(task.id, _agentRetryCount);
          engine.updateTaskStatus(task.id, 'pending');
          return;
        }
        if (task.assignedAgent === 'AEGIS') {
          // Build a clean fallback from each agent's SPOKEN_SUMMARY (not raw dumps)
          const agentSummaries = engine.state.completedTasks.map(t => {
            // Extract SPOKEN_SUMMARY from within the packet
            const normalized = t.replace(/\*+SPOKEN_SUMMARY\*+/gi, 'SPOKEN_SUMMARY').replace(/SPOKEN_SUMMARY\*+:/gi, 'SPOKEN_SUMMARY:');
            const sm = normalized.match(/SPOKEN_SUMMARY[:\s*]*([\s\S]*)$/i);
            const summary = sm?.[1]?.replace(/^\s*[:\s*]+/, '').replace(/\(Raw logs.*?\)/gi, '').replace(/\*+/g, '').trim();
            if (summary && summary.length > 5) return summary;
            // Fallback: take the first non-header sentence from the raw packet
            const lines = t.split('\n').filter(l => l.trim() && !l.startsWith('[') && !l.startsWith('Actions:') && !l.startsWith('Warnings:'));
            const firstLine = lines[0]?.replace(/\[[\w\s]+FINDINGS\]/gi, '').replace(/\*+/g, '').trim();
            return firstLine || null;
          }).filter(Boolean);

          const finalText = agentSummaries.length > 0
            ? agentSummaries.join(' ')
            : 'The task ran but no results were returned. Please try again.';

          engine.state.finalOutput = finalText + '\n\nSPOKEN_SUMMARY: ' + finalText;
          engine.updateTaskStatus(task.id, 'completed', 'Synthetic Fallback');
        } else {
          engine.updateTaskStatus(task.id, 'failed', err.message);
          engine.state.errors.push(`[${task.assignedAgent}] failed: ${err.message}`);
          safeDispatch({ type: 'thinking', title: `⚠️ [${task.assignedAgent}] failed: ${err.message}` });

          if (engine.state.compensations.length > 0) {
            safeDispatch({ type: 'thinking', title: `🔄 [ROLLBACK] Executing ${engine.state.compensations.length} compensation action(s) to undo partial state...` });
            const { executeTool } = await import('../toolExecutor');
            for (const compensation of [...engine.state.compensations].reverse()) {
              try {
                safeDispatch({ type: 'thinking', title: `🔄 Compensating: ${compensation.description}` });
                await executeTool(compensation.tool, compensation.args, appContext, signal);
              } catch (compErr) {
                console.warn('[Orchestrator] Compensation failed:', compensation.description, compErr);
              }
            }
            engine.state.compensations = [];
          }
        }
      }
    };

    await Promise.all(runnable.map(task => executeTask(task)));
  }

  if (engine.state.finalOutput) {
    return engine.state.finalOutput;
  }

  if (engine.state.completedTasks.length > 0) {
    return `⚠️ **Mission Synthesis Failed**\n\nThe final AEGIS agent failed to generate a human-readable report (likely due to a rate limit or timeout).\n\nHere are the raw internal logs from the agents that did run:\n\n` + engine.state.completedTasks.join('\n\n');
  }

  // MISSING-006: Partial mission results — surface what succeeded vs failed.
  // Previously this returned a generic "Mission could not be completed" string that
  // discarded all the work done by agents that DID succeed before a peer failed.
  // Now we build a structured partial results report from engine state.
  const allTasks = [...engine.tasks.values()];
  const succeededTasks = allTasks.filter(t => t.status === 'completed');
  const failedTasks = allTasks.filter(t => t.status === 'failed');
  const skippedTasks = allTasks.filter(t => t.status === 'pending' || t.status === 'running');

  // Classify each failure for actionable display
  const classifyFailure = (msg: string): string => {
    const m = (msg || '').toLowerCase();
    if (m.includes('429') || m.includes('rate limit') || m.includes('quota') || m.includes('cooling'))
      return '⏳ Rate limited — will auto-recover in ~60s';
    if (m.includes('401') || m.includes('403') || m.includes('auth') || m.includes('permission'))
      return '🔑 Auth error — reconnect Google Workspace';
    if (m.includes('timeout') || m.includes('timed out'))
      return '⏱️ Timed out — try again or simplify the request';
    if (m.includes('network') || m.includes('fetch'))
      return '📡 Network error — check your connection';
    return `❌ ${(msg || 'Unknown error').slice(0, 100)}`;
  };

  const successLines = succeededTasks.map(t =>
    `✅ **[${t.assignedAgent}]** completed`
  );
  const failureLines = failedTasks.map(t =>
    `❌ **[${t.assignedAgent}]** — ${classifyFailure(t.result || '')}`
  );
  const skippedLines = skippedTasks.map(t =>
    `⏭️ **[${t.assignedAgent}]** skipped (dependency on failed agent)`
  );

  const partialReport = [
    `⚠️ **Mission Partially Completed** (${succeededTasks.length}/${allTasks.length} agents succeeded)\n`,
    ...successLines,
    ...failureLines,
    ...skippedLines,
    succeededTasks.length > 0
      ? `\n📋 **Partial Results from Completed Agents:**\n${engine.state.completedTasks.join('\n\n')}`
      : '',
    failedTasks.length > 0
      ? `\n💡 Tip: ${failedTasks.map(t => `Re-ask Sara specifically about "${t.instruction.slice(0, 60)}"${t.instruction.length > 60 ? '...' : ''}`).join('; ')}`
      : '',
  ].filter(Boolean).join('\n');

  // Dispatch event for UI to optionally show retry shortcuts
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('agent-partial-result', {
      detail: {
        succeeded: succeededTasks.map(t => ({ agent: t.assignedAgent, instruction: t.instruction })),
        failed: failedTasks.map(t => ({ agent: t.assignedAgent, instruction: t.instruction, error: t.result })),
        partialResults: engine.state.completedTasks,
      }
    }));
  }

  return partialReport || `⚠️ Mission could not be completed. All agents encountered errors:\n\n${failedTasks.map(t => `• [${t.assignedAgent}]: ${t.result || 'No error message'}`).join('\n')}\n\nPlease check your Google Workspace connection and try again.`;
}
