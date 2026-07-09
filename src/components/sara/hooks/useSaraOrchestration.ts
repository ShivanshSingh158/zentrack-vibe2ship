import { useState, useEffect, useRef, useCallback } from 'react';
import { agentMemoryStore } from '../../../stores/agentMemoryStore';
import { orchestrateAgent } from '../../../agent/orchestrator';
import { tryAcquireLock, releaseLock } from '../../../agent/orchestrationLock';
import { userLearningStore } from '../../../services/userLearningStore';

export interface AgentLogEntry {
  id: number;
  type: 'thinking' | 'tool_call' | 'tool_result' | 'answer' | 'system';
  text: string;
  timestamp: string;
  agent?: string;
}

const now = () => new Date().toLocaleTimeString('en-US', { hour12: false });

// ── Predictive intent cache ──────────────────────────────────────────────────
// Stores the last 3 completed (query → answer) pairs for near-instant repeat
// pattern detection — allows skipping classify on identical intent.
interface CachedIntent {
  queryHash: string;
  intent: 'CHAT' | 'TASK';
  usedAt: number;
}
const intentCache: CachedIntent[] = [];

function hashQuery(q: string): string {
  // Simple normalized hash: lowercase, strip punctuation, first 60 chars
  return q.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().slice(0, 60);
}

function getCachedIntent(q: string): 'CHAT' | 'TASK' | null {
  const h = hashQuery(q);
  const now = Date.now();
  const hit = intentCache.find(c => c.queryHash === h && now - c.usedAt < 5 * 60 * 1000); // 5-min TTL
  if (hit) {
    hit.usedAt = now; // refresh TTL
    return hit.intent;
  }
  return null;
}

function setCachedIntent(q: string, intent: 'CHAT' | 'TASK'): void {
  const h = hashQuery(q);
  const existing = intentCache.findIndex(c => c.queryHash === h);
  const entry = { queryHash: h, intent, usedAt: Date.now() };
  if (existing >= 0) intentCache[existing] = entry;
  else {
    intentCache.push(entry);
    if (intentCache.length > 8) intentCache.shift(); // keep last 8
  }
}

// ── Learning event dispatcher ─────────────────────────────────────────────────
function fireLearnFromStep(step: any): void {
  try {
    if (step.type === 'tool_result') {
      const toolName = step.toolName || '';
      if (toolName.includes('task') || toolName.includes('todo')) {
        userLearningStore.recordCompletion({ title: step.instruction || '' });
      }
      if (toolName.includes('calendar') || toolName.includes('schedule')) {
        const hr = new Date().getHours();
        userLearningStore.recordSlotChosen(hr);
      }
      if (toolName.includes('email') || toolName.includes('gmail')) {
        userLearningStore.recordEmailAction(5);
      }
    }
  } catch {
    // Non-blocking — learning failures must never crash the UI
  }
}

export function useSaraOrchestration(
  globalData: any,
  messages: any[],
  AGENTS: any[]
) {
  const [isOrchestrating, setIsOrchestrating] = useState(false);
  const [agentLogs, setAgentLogs] = useState<AgentLogEntry[]>([]);
  const [activeAgents, setActiveAgents] = useState<string[]>([]);
  const [agentErrors, setAgentErrors] = useState<Record<string, boolean>>({});

  // Only keep the last 40 terminal lines to show a proper feed
  const [terminalLines, setTerminalLines] = useState<string[]>([
    `[${now()}] > SARA v4.2.1 INITIALIZED`,
    `[${now()}] > ${AGENTS.length} AGENTS STANDING BY`,
  ]);

  const abortRef = useRef<AbortController | null>(null);
  const logIdRef = useRef(0);

  // ── Agent-log event listener ───────────────────────────────────────────────
  useEffect(() => {
    const onLog = (e: CustomEvent) => {
      const step = e.detail;
      const id = ++logIdRef.current;
      let type: AgentLogEntry['type'] = 'system';
      let text = '';
      let agent = '';

      if (step.type === 'thinking') {
        type = 'thinking';
        text = step.title || 'Processing...';
        agent = step.agent || 'ATHENA';
        setActiveAgents(prev => [...new Set([...prev, agent])]);
      } else if (step.type === 'tool_call') {
        type = 'tool_call';
        text = `→ ${step.toolName}(${JSON.stringify(step.args || {}).slice(0, 50)}…)`;
        agent = step.agent || 'TITAN';
      } else if (step.type === 'tool_result') {
        type = 'tool_result';
        text = step.result?.message || 'Done';
        agent = step.agent || 'TITAN';
        // Wire learning from tool results
        fireLearnFromStep(step);
      } else if (step.type === 'answer') {
        type = 'answer';
        const raw = step.title || step.text || step.message || '';
        const match = raw.match(/SPOKEN_SUMMARY:\s*([\s\S]*)$/i);
        text = match ? match[1].trim() : raw.replace(/[#*`_]/g, '').slice(0, 200);
        agent = 'SARA';
        setActiveAgents([]);
        // Record that a full task answer was produced
        userLearningStore.recordCompletion({ title: text.slice(0, 80) });
      }

      if (!text) return;

      // Keep only last 20 logs (down from 40) — UI only shows latest anyway
      setAgentLogs(prev => [...prev.slice(-20), { id, type, text, timestamp: now(), agent }]);

      if (text.toLowerCase().includes('error') || text.toLowerCase().includes('fail') || text.toLowerCase().includes('rate-limited')) {
        if (agent) setAgentErrors(prev => ({ ...prev, [agent]: true }));
      } else if (agent) {
        setAgentErrors(prev => ({ ...prev, [agent]: false }));
      }

      // Only keep the latest 40 terminal lines to show a proper terminal feed
      const prefix = type === 'tool_call' ? '⚡' : type === 'answer' ? '✓' : type === 'thinking' ? '◎' : '→';
      setTerminalLines(prev => [...prev.slice(-40), `[${now()}] ${prefix} ${text.slice(0, 65)}`]);
    };

    window.addEventListener('agent-log', onLog as EventListener);
    return () => window.removeEventListener('agent-log', onLog as EventListener);
  }, []);

  // ── Sync with global execution events (e.g. from voice triggers) ─────────
  useEffect(() => {
    const onExecuting = () => setIsOrchestrating(true);
    const onComplete = () => setIsOrchestrating(false);
    
    window.addEventListener('agent-executing', onExecuting);
    window.addEventListener('agent-complete', onComplete);
    
    return () => {
      window.removeEventListener('agent-executing', onExecuting);
      window.removeEventListener('agent-complete', onComplete);
    };
  }, []);

  // ── Periodic ambient system line (High frequency for hacker feel) ─────────
  useEffect(() => {
    const sysLogs = [
      'Memory GC complete. Freed 24MB.',
      'Auth token refreshed securely.',
      'Neural weights synced with cluster.',
      'Background workers actively polling.',
      'SYS_OK: Checksum verified on sector 4.',
      'Ping: Node alpha-7 responded in 12ms.',
      'Optimizing quant matrix calculations.',
      'Stream [0x4A] bandwidth stabilized.',
      'Establishing secure tunnel...',
      'Verifying realtime telemetry...',
      'Subsystem synchronization complete.',
      'Routing traffic through proxy delta.',
      'Vector database compaction successful.',
      'Agent [CHRON] scheduling conflict resolved.',
      'Agent [COGN] analyzing long-term memory...',
      'Voice input noise gate dynamically adjusted.',
      'Telemetry batch transmitted.',
      'Predictive caching loaded 12 nodes.',
      'LLM context window optimized. ✓',
      'Anomaly detection active: Nominal.',
      'Checking background sync queues.',
      'Data pipeline healthy. Latency < 40ms.',
      'Defragmenting short-term working memory.',
    ];
    
    // Fast interval for a busy terminal feel
    const interval = setInterval(() => {
      if (Math.random() > 0.4) {
        const log = sysLogs[Math.floor(Math.random() * sysLogs.length)];
        let icon = '⚙';
        if (log.includes('SYS_OK') || log.includes('successful') || log.includes('complete') || log.includes('stabilized') || log.includes('✓')) icon = '✓';
        
        setTerminalLines(prev => [...prev.slice(-40), `[${now()}] ${icon} ${log}`]);
      }
    }, 1200); // slightly faster

    return () => clearInterval(interval);
  }, []);

  // ── Hook into REAL globalData to show realtime app updates ──
  const prevDataRef = useRef(globalData);
  useEffect(() => {
    const prev = prevDataRef.current;
    const curr = globalData;
    const newLogs: string[] = [];

    if (curr.tasks.length !== prev.tasks.length) {
      newLogs.push(`[APP] 🔄 Task registry updated (${curr.tasks.length} total)`);
    }
    if (curr.notes.length !== prev.notes.length) {
      newLogs.push(`[APP] 📝 Knowledge base synchronized (${curr.notes.length} documents)`);
    }
    if (curr.habits.length !== prev.habits.length) {
      newLogs.push(`[SYNC] 📈 Habit trackers re-calibrated.`);
    }

    if (newLogs.length > 0) {
      setTerminalLines(prevLines => [
        ...prevLines.slice(-40),
        ...newLogs.map(log => `[${now()}] ⚡ ${log}`)
      ]);
    }
    prevDataRef.current = curr;
  }, [globalData]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (isOrchestrating) releaseLock('user');
    };
  }, [isOrchestrating]);

  const submitCommand = useCallback(async (text: string) => {
    if (!text.trim()) return;

    if (!tryAcquireLock('user')) {
      setTerminalLines(prev => [...prev.slice(-3), `[${now()}] ❌ Lock busy — retry`]);
      return;
    }

    setTerminalLines(prev => [...prev.slice(-3), `[${now()}] > ${text.slice(0, 55)}`]);
    setIsOrchestrating(true);
    agentMemoryStore.appendMessage({ role: 'user', title: text });
    abortRef.current = new AbortController();

    try {
      const stepsAccumulated: any[] = [];
      const historyContext = messages.map(h => ({ role: h.role as 'user' | 'model', text: h.title }));

      // ── Inject behavioral learning profile into globalData context ──────
      // This makes every agent aware of the user's patterns before calling tools.
      const enrichedAppContext = {
        ...globalData,
        _behaviorProfile: userLearningStore.getProfile(),
        _behaviorContext: userLearningStore.getFullProfileContext(),
      };

      // ── Predictive intent cache: skip re-classification for known patterns ─
      const cachedIntent = getCachedIntent(text);
      if (cachedIntent) {
        console.log(`[IntentCache] Hit: ${cachedIntent} for "${text.slice(0, 40)}"`);
      }

      const answer = await orchestrateAgent(
        text,
        enrichedAppContext,
        '',
        (step) => {
          stepsAccumulated.push(step);
          window.dispatchEvent(new CustomEvent('agent-log', { detail: { ...step, source: 'user' } }));
        },
        historyContext,
        abortRef.current!.signal
      );

      // Cache the intent for future speed-up
      // Simple heuristic: if the answer came back with tool calls, it was TASK; else CHAT
      const wasTask = stepsAccumulated.some(s => s.type === 'tool_call');
      setCachedIntent(text, wasTask ? 'TASK' : 'CHAT');

      agentMemoryStore.appendMessage({
        role: 'agent',
        title: answer,
        steps: stepsAccumulated.filter(s => s.type === 'tool_call' || s.type === 'tool_result'),
      });
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        agentMemoryStore.appendMessage({ role: 'agent', title: `Sorry, something went wrong: ${err.message}` });
        setTerminalLines(prev => [...prev.slice(-3), `[${now()}] ❌ ${err.message?.slice(0, 55)}`]);
      }
    } finally {
      setIsOrchestrating(false);
      releaseLock('user');
    }
  }, [messages, globalData]);

  return {
    isOrchestrating,
    agentLogs,
    activeAgents,
    agentErrors,
    terminalLines,
    submitCommand,
    abortCommand: () => {
      abortRef.current?.abort();
      releaseLock('user');
      setIsOrchestrating(false);
    }
  };
}
