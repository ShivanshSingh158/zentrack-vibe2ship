import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  AlertTriangle, Activity, Map, Search, BrainCircuit, Zap, Check, Trash2, CheckCircle, Key, Cloud, Server
} from 'lucide-react';
import { db } from '../../services/firebase';
import { doc, updateDoc, deleteDoc } from 'firebase/firestore';

// Core Services & Context
import { useGlobalData } from '../../contexts/GlobalDataContext';
import { orchestrateAgent } from '../../agent/orchestrator';
import { tryAcquireLock, releaseLock } from '../../agent/orchestrationLock'; // ✅ U7

import { getUrgencyLevel, getCountdownText } from '../../hooks/useDeadlineWatcher';
import { getLocalDateString } from '../../utils/dateUtils';
import { toast } from 'sonner';

// Authentication
import { isSignedInToGoogle, wasEverConnectedToGoogle, getTokenTimeRemaining, initGoogleCalendar } from '../../services/googleCalendar';
import { isPersonalGeminiTokenExpired, wasEverConnectedToPersonalGemini, requestGeminiToken, getKeyStatus } from '../../services/userGeminiAuth';

// State & Hooks
import { useUrgencyState } from '../../hooks/useUrgencyState';
import { useProactiveAgent } from '../../hooks/useProactiveAgent';
import { agentMemoryStore } from '../../stores/agentMemoryStore';
import { useAgentVoice } from '../../hooks/useAgentVoice';

import { useApiQuota, apiQuotaStore } from '../../stores/apiQuotaStore';

// Subcomponents
import { AgentShutter } from './AgentShutter';
import { AgentCommandBar } from './AgentCommandBar';
import { AGENT_DETAILS } from '../../agent/fleet/agentDetails';
import { missionReportStore } from '../../stores/missionReportStore';
// GAP-5 + GAP-6 + ART-6: New proactive UI components
import { SnoozeInterventionDialog } from './SnoozeInterventionDialog';
import { ConflictCard } from './ConflictCard';
import { PanicModeWarRoom } from './PanicModeWarRoom';
import { FocusLockOverlay } from './FocusLockOverlay';

export function HomeDashboard() {
  const [time, setTime] = useState('');
  const globalData = useGlobalData();
  const { tasks, pomodoroSessions, isGoogleConnected, connectGoogle } = globalData;

  const [agentStatus, setAgentStatus] = useState('Pantheon idle. Scrying datastreams...');
  const [commandInput, setCommandInput] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  
  // Results & UI State
  const [agentResult, setAgentResult] = useState<string | null>(null);
  const [missionComplete, setMissionComplete] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [proactiveReport, setProactiveReport] = useState<string | null>(null);
  // ART-6: Panic Mode War Room state
  const [panicActive, setPanicActive] = useState(false);
  
  // Use a ref so the event listener doesn't need to re-bind on state changes
  const proactiveReportRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const nextMission = useMemo(() => {
    const today = getLocalDateString();
    const pending = tasks.filter((t: any) => 
      (t.status === 'pending' || t.status === 'in_progress') && 
      (t.date && t.date <= today) // Strictly requires a date (today or overdue)
    );
    const highPri = pending.find((t: any) => t.priority === 'high');
    return highPri || pending[0] || null;
  }, [tasks]);

  const agentHistory = React.useSyncExternalStore(agentMemoryStore.subscribe, agentMemoryStore.getSnapshot);
  const urgencyState = useUrgencyState(tasks);

  const handleCompleteTask = async (e: React.MouseEvent, taskId: string) => {
    e.stopPropagation();
    try {
      await updateDoc(doc(db, 'todos', taskId), { status: 'completed' });
      toast.success('Task marked as complete!');
    } catch (err) {
      toast.error('Failed to complete task');
    }
  };

  const handleDeleteTask = async (e: React.MouseEvent, taskId: string) => {
    e.stopPropagation();
    try {
      await deleteDoc(doc(db, 'todos', taskId));
      toast.success('Task permanently deleted');
    } catch (err) {
      toast.error('Failed to delete task');
    }
  };

  // Proactive monitoring
  useProactiveAgent(globalData, setIsExecuting);

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
    const handleAgentLog = (e: any) => {
      const type = e.detail?.type;
      const text = e.detail?.title || e.detail?.message;
      
      if (type === 'answer' && text) {
        setMissionComplete(true);
        return; // Don't set agentStatus to the raw markdown response
      }
      
      if (text) {
        setAgentStatus(text);
        const match = text.match(/\[([A-Z_]+)\]/) || text.match(/Routed to:\s*([A-Z_]+)/);
        if (match && AGENT_DETAILS[match[1]]) {
          setActiveAgent(match[1]);
        } else if (text.toLowerCase().includes('orchestrator')) {
          setActiveAgent('ATHENA');
        }
      }
    };

    const handleShortcut = (e: Event) => {
      const { prompt } = (e as CustomEvent).detail || {};
      if (typeof prompt === 'string') handleExecuteCommand(prompt);
    };

    const handleProactiveBriefing = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && detail.report) {
        setProactiveReport(detail.report);
        proactiveReportRef.current = detail.report;
        if (detail.fromVoice) {
          setAgentResult(detail.report);
          setMissionComplete(true);
        }
      }
    };

    const handleShowProactiveReport = () => {
      if (proactiveReportRef.current) {
        setAgentResult(proactiveReportRef.current);
        setMissionComplete(true);
      }
    };

    // ART-6: Listen for zen-panic-mode event from toolExecutor panic_mode tool
    const handlePanicMode = () => setPanicActive(true);

    window.addEventListener('agent-log', handleAgentLog as EventListener);
    window.addEventListener('agent-shortcut', handleShortcut);
    window.addEventListener('proactive-briefing', handleProactiveBriefing);
    window.addEventListener('show-proactive-report', handleShowProactiveReport);
    window.addEventListener('zen-panic-mode', handlePanicMode);
    return () => {
      window.removeEventListener('agent-log', handleAgentLog as EventListener);
      window.removeEventListener('agent-shortcut', handleShortcut);
      window.removeEventListener('proactive-briefing', handleProactiveBriefing);
      window.removeEventListener('show-proactive-report', handleShowProactiveReport);
      window.removeEventListener('zen-panic-mode', handlePanicMode);
    };
  }, []);

  // Smoothly transition to idle state when execution finishes
  useEffect(() => {
    let idleTimeout: ReturnType<typeof setTimeout>;
    if (!isExecuting) {
      idleTimeout = setTimeout(() => {
        setActiveAgent(null);
        setAgentStatus('Pantheon idle. Scrying datastreams...');
      }, 5000);
    }
    return () => clearTimeout(idleTimeout);
  }, [isExecuting]);

  // ── Core Execution Logic ──
  const handleStopAgent = () => {
    // Fire global event so autonomous background agents can catch it and abort too
    window.dispatchEvent(new Event('agent-stop'));
    
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

    // ✅ U7 FIX: Acquire global orchestration lock before starting.
    // If a proactive loop is running, tryAcquireLock('user') will preempt it (abort it)
    // so the user command always wins. If another user command is running (isExecuting guard
    // above would catch it, but lock is a defense-in-depth).
    const abortControllerForProactive = abortControllerRef.current || undefined;
    if (!tryAcquireLock('user', abortControllerForProactive as any)) {
      // This should not happen due to isExecuting guard, but log defensively
      console.warn('[HomeDashboard] Could not acquire orchestration lock — another user command is already running.');
      return;
    }

    setIsExecuting(true);
    agentMemoryStore.appendMessage({ role: 'user', title: prompt });
    setCommandInput('');
    setAgentStatus('ATHENA initializing DAG workflow...');
    setActiveAgent('ATHENA');

    
    // Notify global components that execution is starting
    window.dispatchEvent(new Event('agent-executing'));
    
    // Automatically pop open the developer terminal so the user can see the logs
    window.dispatchEvent(new Event('agent-terminal-open'));
    
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
          await globalData.connectGoogle();
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
      }

      if (isPersonalGeminiTokenExpired() && wasEverConnectedToPersonalGemini()) {
        try { await requestGeminiToken(); } catch (err) { console.warn('Auto-login failed for Personal Gemini key.', err); }
      }

      const result = await orchestrateAgent(
        prompt,
        globalData, 
        apiKey,
        () => {}, // Logs handled by global event listener
        agentHistory.map(h => ({ role: h.role === 'user' ? 'user' : 'model', text: h.title })),
        signal
      );
      
      agentMemoryStore.appendMessage({ role: 'agent', title: result });
      
      // Save to persistent archive
      missionReportStore.addReport(result);
      
      // Open the global Mission Report with the result
      window.dispatchEvent(new CustomEvent('show-mission-report', { detail: { result } }));
      
      setAgentStatus('Mission accomplished.');
      setActiveAgent(null);
    } catch (err: any) {
      setAgentStatus(`Error: ${err.message}`);
      toast.error('Workflow failed: ' + err.message);
    } finally {
      setIsExecuting(false);
      setActiveAgent(null);
      releaseLock('user'); // ✅ U7: always release on exit
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
  const apiQuotaPercent = useApiQuota();
  const apiQuotaColor = apiQuotaPercent > 70 ? '#34d399' : apiQuotaPercent > 30 ? '#facc15' : '#f87171';

  const totalPomodoroMinutes = pomodoroSessions
    .filter(s => s.startTime ? new Date(s.startTime).toLocaleDateString('en-CA') === todayStr : s.date === todayStr)
    .reduce((total, s) => total + (s.durationMinutes || s.duration || s.minutes || 25), 0);
  const hoursSaved = (totalPomodoroMinutes / 60).toFixed(1);

  return (
    <div className="agent-dashboard">
      {/* ART-6: Focus Lock persistent top banner */}
      <FocusLockOverlay />

      {/* ART-6: Panic Mode War Room — triggered by zen-panic-mode event or urgency */}
      {panicActive && (
        <PanicModeWarRoom
          onExit={() => setPanicActive(false)}
          onAgentCommand={handleExecuteCommand}
        />
      )}

      {/* GAP-5: Snooze Intervention Dialog — triggered by zen-snooze-intervention event */}
      <SnoozeInterventionDialog onAgentCommand={handleExecuteCommand} />
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
          
          {/* GAP-6: Cross-Module Conflict Card — zero LLM cost, pure event-driven */}
          <ConflictCard onAgentCommand={handleExecuteCommand} />

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
                  <div key={task.id} className={`urgency-card ${isImmediate ? 'immediate' : 'flow'}`} style={{ position: 'relative', overflow: 'hidden' }}>
                    <div className="urgency-header">
                      <span className={`urgency-type ${isImmediate ? 'immediate-text' : 'flow-text'}`}>{isImmediate ? 'IMMEDIATE' : 'FLOW'}</span>
                      <span className="urgency-time">{getCountdownText(task.date) || 'Today'}</span>
                    </div>
                    <div className="urgency-title">{task.title || task.text}</div>
                    
                    {/* Quick Actions Hover Overlay */}
                    <div style={{
                      position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)',
                      display: 'flex', gap: '0.5rem', background: 'rgba(0,0,0,0.6)', padding: '0.25rem', borderRadius: '8px', backdropFilter: 'blur(4px)'
                    }}>
                      <button onClick={(e) => handleCompleteTask(e, task.id)} style={{ background: 'transparent', border: 'none', color: '#10b981', cursor: 'pointer', padding: '4px' }} title="Complete Task">
                        <CheckCircle size={16} />
                      </button>
                      <button onClick={(e) => handleDeleteTask(e, task.id)} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }} title="Delete Task">
                        <Trash2 size={16} />
                      </button>
                    </div>
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
                <path className="circle" stroke={apiQuotaColor} strokeDasharray={`${apiQuotaPercent}, 100`} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" style={{ transition: 'stroke-dasharray 0.5s ease, stroke 0.5s ease' }} />
              </svg>
              <div className="ring-text" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '-7px' }}>
                <div style={{ fontSize: '0.85rem', fontWeight: 800, color: apiQuotaColor, lineHeight: 1, transition: 'color 0.5s ease' }}>{apiQuotaPercent}%</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.38rem', letterSpacing: '0.05em', marginTop: '2px', fontWeight: 600 }}>API QUOTA</div>
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
                <span className="stat-pill" title="Number of fallback API keys loaded" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <Key size={13} style={{ color: '#00BFA5' }} />
                  {apiQuotaStore.getKeyCount()} Fallback Keys
                </span>
                {globalData.isGoogleConnected ? (
                  <span className="stat-pill" title="Google Workspace sync status" style={{ 
                    display: 'flex', alignItems: 'center', gap: '0.4rem', 
                    border: '1px solid rgba(16, 185, 129, 0.5)', 
                    background: 'rgba(16, 185, 129, 0.1)',
                    color: '#10b981',
                    boxShadow: '0 0 10px rgba(16, 185, 129, 0.4)',
                    animation: 'pulse-glow 2s infinite'
                  }}>
                    <Cloud size={13} style={{ color: '#10b981' }} />
                    Workspace Connected
                  </span>
                ) : (
                  <span className="stat-pill" title="Google Workspace sync status" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', border: '1px solid rgba(239, 68, 68, 0.2)', background: 'rgba(239, 68, 68, 0.05)', color: '#ef4444' }}>
                    <Cloud size={13} style={{ color: '#ef4444' }} />
                    Workspace Offline
                  </span>
                )}
                <span className="stat-pill" title="AI Model in use" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', border: '1px solid rgba(255,255,255,0.1)' }}>
                  <Server size={13} style={{ color: '#a855f7' }} />
                  Gemini Fleet Active
                </span>
              </div>
            </div>
          </div>

          {/* ACTIVE MISSION */}
          <div className="workspace-card" style={{ padding: '1.2rem', transition: 'all 0.3s ease', border: '1px solid rgba(168,85,247,0.3)', background: 'rgba(168,85,247,0.03)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyItems: 'space-between', width: '100%' }}>
                <h3 className="section-label" style={{ margin: 0, color: '#a855f7' }}>ACTIVE DIRECTIVE</h3>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span className={`status-dot ${nextMission ? 'pulsing' : ''}`} style={{ background: nextMission ? '#a855f7' : '#71717a', width: 6, height: 6 }} />
                  <span style={{ fontSize: '0.6rem', fontFamily: 'monospace', color: nextMission ? '#d8b4fe' : '#71717a' }}>{nextMission ? 'ENGAGED' : 'STANDBY'}</span>
                </div>
              </div>
              <div className="workspace-content" style={{ margin: 0 }}>
                {nextMission ? (
                  <div className="workspace-status" style={{ color: '#fff', fontWeight: 500, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <CheckCircle size={14} style={{ color: nextMission.priority === 'high' ? '#ef4444' : '#a855f7' }} />
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{nextMission.title || nextMission.text}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', opacity: 0.8 }}>
                      <button 
                        onClick={(e) => handleCompleteTask(e, nextMission.id)}
                        style={{ background: 'none', border: 'none', color: '#10b981', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        title="Mark Complete"
                      >
                        <Check size={16} />
                      </button>
                      <button 
                        onClick={(e) => handleDeleteTask(e, nextMission.id)}
                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        title="Delete Directive"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="workspace-status" style={{ fontSize: '0.85rem', color: '#a1a1aa' }}>All systems nominal. Awaiting next command.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
