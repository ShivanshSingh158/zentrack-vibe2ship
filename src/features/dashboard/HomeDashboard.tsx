import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { 
  AlertTriangle, Activity, Map, Search, BrainCircuit, Zap, Check 
} from 'lucide-react';

// Core Services & Context
import { useGlobalData } from '../../contexts/GlobalDataContext';
import { orchestrateAgent } from '../../agent/orchestrator';
import { getUrgencyLevel, getCountdownText } from '../../hooks/useDeadlineWatcher';
import { getLocalDateString } from '../../utils/dateUtils';
import { toast } from 'sonner';

// Authentication
import { isSignedInToGoogle, wasEverConnectedToGoogle, getTokenTimeRemaining, initGoogleCalendar } from '../../services/googleCalendar';
import { isPersonalGeminiTokenExpired, wasEverConnectedToPersonalGemini, requestGeminiToken, getKeyStatus } from '../../services/userGeminiAuth';

// State & Hooks
import { useUrgencyState } from '../../hooks/useUrgencyState';
import { useProactiveAgent } from '../../hooks/useProactiveAgent';
import { agentMemoryStore } from '../../agent/core/agentMemoryStore';
import { useAgentVoice } from '../../hooks/useAgentVoice';

// Subcomponents
import { AgentShutter } from './AgentShutter';
import { AgentCommandBar } from './AgentCommandBar';
import { MissionReport } from './MissionReport';
import { AGENT_DETAILS } from '../../agent/fleet/agentDetails';

export function HomeDashboard() {
  const [time, setTime] = useState('');
  const { tasks, pomodoroSessions, isGoogleConnected, connectGoogle, calendarEvents } = useGlobalData();
  
  // Agent Execution State
  const [agentStatus, setAgentStatus] = useState('Pantheon idle. Scrying datastreams...');
  const [commandInput, setCommandInput] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  
  // Results & UI State
  const [agentResult, setAgentResult] = useState<string | null>(null);
  const [missionComplete, setMissionComplete] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [proactiveReport, setProactiveReport] = useState<string | null>(null);
  
  // Use a ref so the event listener doesn't need to re-bind on state changes
  const proactiveReportRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const agentHistory = React.useSyncExternalStore(agentMemoryStore.subscribe, agentMemoryStore.getSnapshot);
  const urgencyState = useUrgencyState(tasks);

  // Proactive monitoring
  useProactiveAgent(tasks, calendarEvents, setIsExecuting);

  // ── Execution Pipeline & Routing ──
  const currentStep = useMemo(() => {
    if (!isExecuting) return 0;
    if (activeAgent === 'ATHENA') {
      if (agentStatus.toLowerCase().includes('initial') || agentStatus.toLowerCase().includes('route')) return 1; // Routing
      return 2; // Reasoning
    }
    if (activeAgent === 'AEGIS') return 4; // Verification
    return 3; // Execution
  }, [isExecuting, activeAgent, agentStatus]);

  const pipelineSteps = useMemo(() => [
    { id: 1, name: 'Routing', status: currentStep === 1 ? 'active' : currentStep > 1 ? 'completed' : 'pending' as const },
    { id: 2, name: 'Reasoning', status: currentStep === 2 ? 'active' : currentStep > 2 ? 'completed' : 'pending' as const },
    { id: 3, name: 'Execution', status: currentStep === 3 ? 'active' : currentStep > 3 ? 'completed' : 'pending' as const },
    { id: 4, name: 'Verification', status: currentStep === 4 ? 'active' : currentStep > 4 ? 'completed' : 'pending' as const }
  ], [currentStep]);

  // ── Clock ──
  useEffect(() => {
    const interval = setInterval(() => {
      setTime(new Date().toLocaleTimeString('en-US', { hour12: false }));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // ── Voice Engine Integration ──
  const { isListening, silencePercent, interimTranscript, toggleListening } = useAgentVoice({
    commandInput,
    setCommandInput,
    onCommand: (text) => handleExecuteCommand(text)
  });

  // ── Event Listeners (Agent Logs & Shortcuts) ──
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const handleAgentLog = (e: any) => {
      const type = e.detail?.type;
      const text = e.detail?.title || e.detail?.message;
      
      if (type === 'answer' && text) {
        setMissionComplete(true);
      }
      
      if (text) {
        setAgentStatus(text);
        const match = text.match(/\[([A-Z_]+)\]/) || text.match(/Routed to:\s*([A-Z_]+)/);
        if (match) setActiveAgent(match[1]);
        else if (text.toLowerCase().includes('orchestrator')) setActiveAgent('ATHENA');
        
        clearTimeout(timeout);
        timeout = setTimeout(() => {
          setActiveAgent(null);
          setAgentStatus('Pantheon idle. Scrying datastreams...');
        }, 15000);
      }
    };

    const handleShortcut = (e: Event) => {
      const { prompt } = (e as CustomEvent).detail || {};
      if (typeof prompt === 'string') setTimeout(() => handleExecuteCommand(prompt), 120);
    };

    const handleProactiveBriefing = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && detail.report) {
        setProactiveReport(detail.report);
        proactiveReportRef.current = detail.report;
      }
    };

    const handleShowProactiveReport = () => {
      if (proactiveReportRef.current) {
        setAgentResult(proactiveReportRef.current);
        setMissionComplete(true);
      }
    };

    window.addEventListener('agent-log', handleAgentLog);
    window.addEventListener('agent-shortcut', handleShortcut);
    window.addEventListener('proactive-briefing', handleProactiveBriefing);
    window.addEventListener('show-proactive-report', handleShowProactiveReport);
    return () => {
      window.removeEventListener('agent-log', handleAgentLog);
      window.removeEventListener('agent-shortcut', handleShortcut);
      window.removeEventListener('proactive-briefing', handleProactiveBriefing);
      window.removeEventListener('show-proactive-report', handleShowProactiveReport);
      clearTimeout(timeout);
    };
  }, []);

  // ── Core Execution Logic ──
  const handleStopAgent = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setAgentStatus('Mission aborted by user.');
      setIsExecuting(false);
      setActiveAgent(null);
    }
  };

  const handleClearMemory = () => {
    agentMemoryStore.clear();
    toast.success('Agent memory cleared. Ready for fresh start.');
  };

  const handleExecuteCommand = async (overridePrompt?: string) => {
    const prompt = typeof overridePrompt === 'string' ? overridePrompt : commandInput;
    if (!prompt.trim() || isExecuting) return;
    
    setIsExecuting(true);
    agentMemoryStore.appendMessage({ role: 'user', title: prompt });
    setCommandInput('');
    setAgentStatus('ATHENA initializing DAG workflow...');
    setActiveAgent('ATHENA');
    
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';
    
    try {
      setAgentResult(null);
      setMissionComplete(false);
      abortControllerRef.current = new AbortController();
      const signal = abortControllerRef.current.signal;

      // Smart Workspace Auto Sign-In
      const WORKSPACE_KEYWORDS = ['email', 'gmail', 'mail', 'calendar', 'schedule', 'meeting', 'drive', 'docs', 'meet'];
      const needsWorkspace = WORKSPACE_KEYWORDS.some(kw => prompt.toLowerCase().includes(kw));

      if (needsWorkspace && !isSignedInToGoogle()) {
        setAgentStatus('🔐 This task needs Google Workspace — connecting...');
        try {
          await initGoogleCalendar();
          await connectGoogle();
          window.dispatchEvent(new Event('google-token-refreshed'));
          setAgentStatus('✅ Google Workspace connected! Starting task...');
        } catch (err: any) {
          if (!err?.message?.toLowerCase().includes('cancelled') && !err?.message?.toLowerCase().includes('popup-closed')) {
            console.warn('[AutoLogin] Workspace sign-in failed:', err);
          } else {
            setAgentStatus('Sign-in cancelled. Connect your Google Workspace to use this task.');
            setIsExecuting(false);
            setActiveAgent(null);
            return;
          }
        }
      } else if (wasEverConnectedToGoogle() && (!isSignedInToGoogle() || getTokenTimeRemaining() > 0 && getTokenTimeRemaining() < 600000)) {
        try {
          await connectGoogle();
          window.dispatchEvent(new Event('google-token-refreshed'));
        } catch (err) {
          console.warn('Auto-refresh failed.', err);
        }
      }

      if (isPersonalGeminiTokenExpired() && wasEverConnectedToPersonalGemini()) {
        try { await requestGeminiToken(); } catch (err) { console.warn('Auto-login failed for Personal Gemini key.', err); }
      }

      const result = await orchestrateAgent(
        prompt, tasks, calendarEvents, apiKey,
        () => {}, // Logs handled by global event listener
        agentHistory.map(h => ({ role: h.role === 'user' ? 'user' : 'model', text: h.title })),
        signal
      );
      
      agentMemoryStore.appendMessage({ role: 'agent', title: result });
      setAgentResult(result);
      setAgentStatus('Mission accomplished.');
      setActiveAgent(null);
    } catch (err: any) {
      setAgentStatus(`Error: ${err.message}`);
      toast.error('Workflow failed: ' + err.message);
    } finally {
      setIsExecuting(false);
      setActiveAgent(null);
    }
  };

  // ── Telemetry & Analytics Variables ──
  const todayStr = getLocalDateString(new Date());
  const todayTasks = useMemo(() => tasks.filter(t => t.date === todayStr || !t.date), [tasks, todayStr]);
  const activeTasks = todayTasks.filter(t => t.status !== 'completed');
  const completedTodayCount = todayTasks.filter(t => t.status === 'completed').length;
  
  const highPriorityActive = activeTasks.filter(t => t.priority === 'high');
  const sortedByUrgency = [...activeTasks].sort((a, b) => {
    const getScore = (t: any) => {
       const u = getUrgencyLevel(t.date);
       let score = 0;
       if (u === 'overdue') score += 100;
       if (t.priority === 'high') score += 50;
       if (u === 'critical') score += 25;
       if (u === 'urgent') score += 10;
       return score;
    };
    return getScore(b) - getScore(a);
  });

  const matrixTasks = sortedByUrgency.slice(0, 3);
  const totalToday = todayTasks.length;
  const bandwidthPercent = totalToday === 0 ? 100 : Math.round((completedTodayCount / totalToday) * 100);

  const totalPomodoroMinutes = pomodoroSessions
    .filter(s => s.startTime ? new Date(s.startTime).toLocaleDateString('en-CA') === todayStr : s.date === todayStr)
    .reduce((total, s) => total + (s.durationMinutes || s.duration || s.minutes || 25), 0);
  const hoursSaved = (totalPomodoroMinutes / 60).toFixed(1);

  return (
    <div className="agent-dashboard">
      <div className="dashboard-header-bar">
        <div className="header-left">
          <h1 className="dashboard-main-title">OLYMPUS PROTOCOL</h1>
          <p className="dashboard-main-subtitle">AI Productivity Fleet Core Terminal</p>
        </div>
        <div className="header-right">
          <div className="system-time-display">
            <span className="time-label">SYSTEM CLOCK</span>
            <span className="time-val">{time || '00:00:00'}</span>
          </div>
        </div>
      </div>

      <div className="dashboard-grid">
        
        {/* LEFT COLUMN - Olympus Protocol */}
        <div className={`active-deployment-card ${isExecuting ? 'executing' : ''}`}>
          <div className="card-header">
            <div>
              <h2 className="card-title">Olympus Protocol</h2>
              <p className="card-subtitle">{highPriorityActive.length} Autonomous Agents engaged in "Current Sprint"</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <div className={`urgency-banner ${urgencyState.replace('state-', '')}`}>
                {urgencyState === 'state-critical' && <><AlertTriangle size={12} /> CRITICAL</>}
                {urgencyState === 'state-active' && <><Activity size={12} /> ACTIVE</>}
                {urgencyState === 'state-calm' && <><Check size={12} /> FLOW STATE</>}
              </div>
            </div>
          </div>
          
          <AgentShutter
            activeAgent={activeAgent}
            isExecuting={isExecuting}
            agentStatus={agentStatus}
            pipelineSteps={pipelineSteps}
            onAgentDockClick={(key) => {
              if (!isExecuting) {
                const promptMap: Record<string, string> = {
                  ATHENA: 'Draft a project summary plan',
                  ORACLE: 'Search the web for the latest tech trends in AI',
                  TITAN: 'Send a status update email to my team, block 2h focus time and create a follow-up task',
                };
                setCommandInput(promptMap[key] || `Assign a task to ${key}...`);
                toast.info(`Configured input for ${key} Agent`);
              }
            }}
          />

          <MissionReport 
            agentResult={agentResult}
            missionComplete={missionComplete}
            isExecuting={isExecuting}
            commandInput={commandInput}
            onClose={() => setAgentResult(null)}
            onCommandChange={setCommandInput}
            onFollowUp={() => handleExecuteCommand()}
          />
          
          <div className="status-bar" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '1.2rem', background: 'rgba(5, 5, 10, 0.6)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
               <div className="status-text" style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span className={`status-dot ${isExecuting ? 'pulsing' : ''}`} style={{ background: isExecuting ? '#a855f7' : '#ef4444' }} />
                {agentStatus}
              </div>
            </div>

            <AgentCommandBar 
              isExecuting={isExecuting}
              isListening={isListening}
              silencePercent={silencePercent}
              interimTranscript={interimTranscript}
              commandInput={commandInput}
              setCommandInput={setCommandInput}
              onExecute={() => handleExecuteCommand()}
              onStop={handleStopAgent}
              onClearMemory={handleClearMemory}
              onToggleListen={toggleListening}
              hasHistory={agentHistory.length > 0}
            />
          </div>
          <div className="bottom-indicator"></div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="right-column">
          
          {/* PROPHECY GRID */}
          <div className="urgency-matrix">
            <h3 className="section-label">PROPHECY GRID</h3>
            {matrixTasks.length === 0 ? (
               <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No urgent tasks pending.</div>
            ) : (
              matrixTasks.map(task => {
                const uLevel = getUrgencyLevel(task.date);
                const isImmediate = uLevel === 'overdue' || uLevel === 'critical' || task.priority === 'high';
                return (
                  <div key={task.id} className={`urgency-card ${isImmediate ? 'immediate' : 'flow'}`}>
                    <div className="urgency-header">
                      <span className={`urgency-type ${isImmediate ? 'immediate-text' : 'flow-text'}`}>{isImmediate ? 'IMMEDIATE' : 'FLOW'}</span>
                      <span className="urgency-time">{getCountdownText(task.date) || 'Today'}</span>
                    </div>
                    <div className="urgency-title">{task.title || task.text}</div>
                  </div>
                );
              })
            )}
            <div className="bandwidth-section">
              <div className="bandwidth-bar-bg">
                <div className="bandwidth-bar-fill" style={{ width: `${bandwidthPercent}%` }}></div>
              </div>
              <div className="bandwidth-text">Mortal Bandwidth Capacity: {bandwidthPercent}%</div>
            </div>
          </div>

          {/* DIVINE TELEMETRY & CORE VITALITY */}
          <div className="roi-card">
            <div className="roi-ring-container" style={{ position: 'relative' }}>
              <svg viewBox="0 0 36 36" className="circular-chart">
                <path className="circle-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                <path className="circle" strokeDasharray={`${bandwidthPercent}, 100`} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
              </svg>
              <div className="ring-text" style={{ fontSize: '0.75rem', marginTop: '2px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f0f0f3', lineHeight: 1 }}>{bandwidthPercent}%</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.45rem', letterSpacing: '0.15em', marginTop: '2px' }}>CAPACITY</div>
              </div>
            </div>
            
            <div className="roi-content">
              <h3 className="section-label">DIVINE TELEMETRY & CORE VITALITY</h3>
              <div className="roi-status" style={{color: urgencyState === 'state-critical' ? '#f59e0b' : urgencyState === 'state-active' ? '#f97316' : undefined}}>
                Focus Priority: <span style={{color: urgencyState === 'state-critical' ? '#f59e0b' : urgencyState === 'state-active' ? '#f97316' : undefined}} className={urgencyState === 'state-calm' ? 'highlight-green' : ''}>
                  {urgencyState === 'state-critical' ? 'HIGH' : urgencyState === 'state-active' ? 'ELEVATED' : 'OPTIMAL'}
                </span>
              </div>
              
              <div className="roi-stats" style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
                <span className="stat-pill" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', border: getKeyStatus().hasPersonalKey ? '1px solid rgba(0,191,165,0.3)' : '1px solid rgba(255,255,255,0.1)' }}>
                  <BrainCircuit size={13} style={{ color: getKeyStatus().hasPersonalKey ? '#00BFA5' : '#a1a1aa' }} />
                  {getKeyStatus().hasPersonalKey ? 'Pro Neural Link' : 'Shared API Pool'}
                </span>
                <span className="stat-pill" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Activity size={13} style={{ color: '#06b6d4' }} />
                  {completedTodayCount} Operations
                </span>
                <span className="stat-pill" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <Zap size={13} style={{ color: '#eab308' }} />
                  +{hoursSaved}h Deep Focus
                </span>
              </div>
            </div>
          </div>

          {/* GOOGLE WORKSPACE */}
          <div className="workspace-card" style={{ padding: '1.2rem', transition: 'all 0.3s ease' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyItems: 'space-between', width: '100%' }}>
                <h3 className="section-label" style={{ margin: 0 }}>ORACLE WORKSPACE</h3>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span className={`status-dot ${isGoogleConnected ? 'pulsing' : ''}`} style={{ background: isGoogleConnected ? '#06b6d4' : '#71717a', width: 6, height: 6 }} />
                  <span style={{ fontSize: '0.6rem', fontFamily: 'monospace', color: isGoogleConnected ? '#22d3ee' : '#71717a' }}>{isGoogleConnected ? 'ONLINE' : 'OFFLINE'}</span>
                </div>
              </div>
              <div className="workspace-content" style={{ margin: 0 }}>
                {isGoogleConnected ? (
                  <div className="workspace-status" style={{ color: '#2dd4bf', fontWeight: 500, fontSize: '0.78rem' }}>Active Cyber Link Synced</div>
                ) : (
                  <div className="workspace-status" style={{ fontSize: '0.78rem', color: '#71717a' }}>Link Workspace for automated flows</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
