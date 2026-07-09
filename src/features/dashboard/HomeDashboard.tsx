import React, { useState, useEffect, useMemo, useRef } from 'react';
import { db } from '../../services/firebase';
import { doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { useGlobalData } from '../../contexts/GlobalDataContext';
import { orchestrateAgent } from '../../agent/orchestrator';
import { tryAcquireLock, releaseLock } from '../../agent/orchestrationLock';
import { getLocalDateString } from '../../utils/dateUtils';
import { toast } from 'sonner';
import { isSignedInToGoogle, initGoogleCalendar } from '../../services/googleCalendar';
import { isPersonalGeminiTokenExpired, wasEverConnectedToPersonalGemini, requestGeminiToken } from '../../services/userGeminiAuth';
import { useUrgencyState } from '../../hooks/useUrgencyState';
import { useProactiveAgent } from '../../hooks/useProactiveAgent';
import { agentMemoryStore } from '../../stores/agentMemoryStore';
import { useAgentVoice } from '../../hooks/useAgentVoice';
import { useVoice } from '../../contexts/VoiceContext';
import { AGENT_DETAILS } from '../../agent/fleet/agentDetails';
import { missionReportStore } from '../../stores/missionReportStore';
import { SnoozeInterventionDialog } from './SnoozeInterventionDialog';
import { PanicModeWarRoom } from './PanicModeWarRoom';
import { FocusLockOverlay } from './FocusLockOverlay';
import { classifyAgentError } from '../../utils/errorClassifier';

// ── THE PREMIUM SARA INTERFACE ─────────────────────────────────────────────────
import { SaraInterface } from '../../components/SaraInterface';
import { AgentDataStream } from '../../components/AgentDataStream';
import { AgentApprovalToastListener } from '../../components/AgentApprovalToast';
import { AgentHistoryPanel } from '../../components/AgentHistoryPanel';

export function HomeDashboard() {
  const globalData = useGlobalData();
  const { tasks } = globalData;

  const [commandInput, setCommandInput] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [panicActive, setPanicActive] = useState(false);
  const [agentStatus, setAgentStatus] = useState('Pantheon idle. Scrying datastreams...');

  const proactiveReportRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const agentHistory = React.useSyncExternalStore(agentMemoryStore.subscribe, agentMemoryStore.getSnapshot);

  // Proactive monitoring
  useProactiveAgent(globalData, setIsExecuting);

  // Voice
  const { isListening, interimTranscript, silencePercent, toggleListening } = useAgentVoice({
    commandInput,
    setCommandInput,
    onCommand: (text) => handleExecuteCommand(text),
  });

  // Event listeners — agent logs, shortcuts, panic mode
  useEffect(() => {
    const onAgentLog = (e: any) => {
      const type = e.detail?.type;
      const text = e.detail?.title || e.detail?.message;
      if (!text) return;
      if (type === 'answer') return;
      setAgentStatus(text);
      const match = text.match(/\[([A-Z_]+)\]/) || text.match(/Routed to:\s*([A-Z_]+)/);
      if (match && AGENT_DETAILS[match[1]]) setActiveAgent(match[1]);
      else if (text.toLowerCase().includes('orchestrator')) setActiveAgent('ATHENA');
    };
    const onShortcut = (e: Event) => {
      const { prompt, history } = (e as CustomEvent).detail || {};
      if (typeof prompt === 'string') handleExecuteCommand(prompt, history);
    };
    const onProactive = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d?.report) proactiveReportRef.current = d.report;
    };
    const onPanic = () => setPanicActive(true);

    window.addEventListener('agent-log', onAgentLog as EventListener);
    window.addEventListener('agent-shortcut', onShortcut);
    window.addEventListener('proactive-briefing', onProactive);
    window.addEventListener('zen-panic-mode', onPanic);
    return () => {
      window.removeEventListener('agent-log', onAgentLog as EventListener);
      window.removeEventListener('agent-shortcut', onShortcut);
      window.removeEventListener('proactive-briefing', onProactive);
      window.removeEventListener('zen-panic-mode', onPanic);
    };
  }, []);

  useEffect(() => {
    if (!isExecuting) {
      const t = setTimeout(() => setActiveAgent(null), 5000);
      return () => clearTimeout(t);
    }
  }, [isExecuting]);

  const handleExecuteCommand = async (
    overridePrompt?: string,
    // FIX: Accept voice conversation history so multi-turn context ("check mails" →
    // "which type?" → "just unread") reaches orchestrateAgent and the intent classifier.
    voiceHistory?: Array<{ role: 'user' | 'model'; text: string }>
  ) => {
    const prompt = typeof overridePrompt === 'string' ? overridePrompt : commandInput;
    if (!prompt.trim() || isExecuting) return;

    if (!tryAcquireLock('user', abortControllerRef.current as any)) return;

    setIsExecuting(true);
    agentMemoryStore.appendMessage({ role: 'user', title: prompt });
    setCommandInput('');
    setAgentStatus('ATHENA initializing DAG workflow...');
    setActiveAgent('ATHENA');

    window.dispatchEvent(new Event('agent-executing'));
    window.dispatchEvent(new Event('agent-terminal-open'));

    try {
      abortControllerRef.current = new AbortController();
      const signal = abortControllerRef.current.signal;

      const WORKSPACE_KW = ['email', 'gmail', 'mail', 'calendar', 'schedule', 'meeting', 'drive', 'docs', 'meet'];
      if (WORKSPACE_KW.some(kw => prompt.toLowerCase().includes(kw)) && !isSignedInToGoogle()) {
        try {
          await initGoogleCalendar();
          await globalData.connectGoogle();
          window.dispatchEvent(new Event('google-token-refreshed'));
        } catch (err: any) {
          if (err?.message?.toLowerCase().includes('cancelled') || err?.message?.toLowerCase().includes('popup-closed')) {
            setIsExecuting(false); setActiveAgent(null); return;
          }
        }
      }

      if (isPersonalGeminiTokenExpired() && wasEverConnectedToPersonalGemini()) {
        try { await requestGeminiToken(); } catch {}
      }

      // Prefer voice conversation history (live multi-turn context) over the
      // agentMemoryStore history (which is UI-level and doesn't carry clarification context).
      const historyForAgent = voiceHistory && voiceHistory.length > 0
        ? voiceHistory
        : agentHistory.map(h => ({ role: (h.role === 'user' ? 'user' : 'model') as 'user' | 'model', text: h.title }));

      // MISSING-002: Global 3-minute mission timeout.
      // Per-agent timeouts (20s–2min) exist in runAgentLoop but a 4-agent DAG could
      // still stall forever if tasks deadlock in 'running' state. This outer timeout
      // is the last-resort safety net for the entire mission.
      const MISSION_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes

      // Compose user-cancel signal with timeout signal.
      // AbortSignal.any() is Chrome 116+; fall back to manual timeout chain.
      let compositeSignal: AbortSignal;
      const timeoutController = new AbortController();
      const timeoutTimer = setTimeout(() => {
        timeoutController.abort(new Error('Mission timed out after 3 minutes'));
      }, MISSION_TIMEOUT_MS);

      if (typeof AbortSignal.any === 'function') {
        compositeSignal = AbortSignal.any([signal, timeoutController.signal]);
      } else {
        // Manual composition: abort timeoutController when user cancels
        signal.addEventListener('abort', () => timeoutController.abort(), { once: true });
        compositeSignal = timeoutController.signal;
      }

      const result = await orchestrateAgent(
        prompt, globalData, '',
        (step) => {
          window.dispatchEvent(new CustomEvent('agent-log', { detail: { ...step, source: 'user' } }));
        },
        historyForAgent,
        compositeSignal
      );

      clearTimeout(timeoutTimer);

      agentMemoryStore.appendMessage({ role: 'agent', title: result });
      missionReportStore.addReport(result);
      setAgentStatus('Mission accomplished.');
      setActiveAgent(null);
    } catch (err: any) {
      // MISSING-003: Classify the error into a user-friendly, actionable category.
      // Previously all errors surfaced as raw error strings the user couldn't interpret.
      const classified = classifyAgentError(err);
      setAgentStatus(`${classified.icon} ${classified.userMessage}`);

      if (classified.actionLabel && classified.actionEvent) {
        // Show an actionable toast with a button the user can click
        toast.error(`${classified.icon} ${classified.userMessage}`, {
          duration: 8000,
          action: {
            label: classified.actionLabel,
            onClick: () => window.dispatchEvent(new Event(classified.actionEvent!)),
          },
        });
      } else {
        toast.error(`${classified.icon} ${classified.userMessage}`, { duration: 6000 });
      }
    } finally {
      setIsExecuting(false);
      setActiveAgent(null);
      releaseLock('user');
      window.dispatchEvent(new Event('agent-complete'));
    }
  };

  // ── Render: The premium SaraInterface IS the home page ────────────────────
  return (
    <>
      <FocusLockOverlay />
      <AgentApprovalToastListener />
      <AgentHistoryPanel />
      {panicActive && (
        <PanicModeWarRoom
          onExit={() => setPanicActive(false)}
          onAgentCommand={handleExecuteCommand}
        />
      )}
      <SnoozeInterventionDialog onAgentCommand={handleExecuteCommand} />
      <AgentDataStream />

      {/* S.A.R.A. OS is the home page — no close button action */}
      <SaraInterface onClose={() => {}} isHomePage onCommand={handleExecuteCommand} />
    </>
  );
}
