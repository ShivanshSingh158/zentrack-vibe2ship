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

// ── THE PREMIUM SARA INTERFACE ─────────────────────────────────────────────────
import { SaraInterface } from '../../components/SaraInterface';

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
      const { prompt } = (e as CustomEvent).detail || {};
      if (typeof prompt === 'string') handleExecuteCommand(prompt);
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

  const handleExecuteCommand = async (overridePrompt?: string) => {
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

      const result = await orchestrateAgent(
        prompt, globalData, '',
        (step) => {
          window.dispatchEvent(new CustomEvent('agent-log', { detail: { ...step, source: 'user' } }));
        },
        agentHistory.map(h => ({ role: h.role === 'user' ? 'user' : 'model', text: h.title })),
        signal
      );

      agentMemoryStore.appendMessage({ role: 'agent', title: result });
      missionReportStore.addReport(result);
      window.dispatchEvent(new CustomEvent('show-mission-report', { detail: { result } }));
      setAgentStatus('Mission accomplished.');
      setActiveAgent(null);
    } catch (err: any) {
      setAgentStatus(`Error: ${err.message}`);
      toast.error('Workflow failed: ' + err.message);
    } finally {
      setIsExecuting(false);
      setActiveAgent(null);
      releaseLock('user');
    }
  };

  // ── Render: The premium SaraInterface IS the home page ────────────────────
  return (
    <>
      <FocusLockOverlay />
      {panicActive && (
        <PanicModeWarRoom
          onExit={() => setPanicActive(false)}
          onAgentCommand={handleExecuteCommand}
        />
      )}
      <SnoozeInterventionDialog onAgentCommand={handleExecuteCommand} />

      {/* S.A.R.A. OS is the home page — no close button action */}
      <SaraInterface onClose={() => {}} isHomePage onCommand={handleExecuteCommand} />
    </>
  );
}
