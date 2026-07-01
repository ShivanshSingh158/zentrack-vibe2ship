import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  AlertTriangle, Activity, Map, Search, BrainCircuit, Zap, Check, Trash2, CheckCircle, Key, Cloud, Server, Target
} from 'lucide-react';
import { db, auth } from '../../services/firebase';
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
    
    const apiKey = ''; // Keys moved server-side — see api/gemini-proxy.js
    
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
    <div className="main-content">
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

      {/* ── Aurora Dark Dashboard ── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
        style={{ padding: '2rem 0', display: 'flex', flexDirection: 'column', gap: '3rem' }}
      >
        
        {/* 1. & 2. Header Row: Greeting + Stats */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '2rem' }}>
          
          {/* Greeting */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            style={{ flex: '1 1 auto' }}
          >
            <h1 className="greeting-title" style={{ fontFamily: "'Instrument Serif', serif", fontSize: 'clamp(2rem, 4vw, 3rem)', fontWeight: 400, color: 'white', letterSpacing: '-0.02em', marginBottom: '0.5rem' }}>
              Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, {auth.currentUser?.displayName?.split(' ')[0] || 'User'}
            </h1>
            <p style={{ fontSize: '0.95rem', color: 'rgba(255,255,255,0.45)', fontFamily: "'Inter', sans-serif" }}>
              You have {activeTasks.length} tasks due today and {globalData.habits?.filter((h: any) => !h.completedDates?.includes(todayStr)).length || 0} habits to complete
            </p>
          </motion.div>

          {/* Compact Stat Cards */}
          <motion.div
            className="dashboard-stats-strip"
            initial="hidden"
            animate="visible"
            variants={{ hidden: {}, visible: { transition: { staggerChildren: 0.08, delayChildren: 0.2 } } }}
            style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}
          >
            {/* Stat: Tasks */}
            <motion.div
              variants={{ hidden: { opacity: 0, y: 20, scale: 0.95 }, visible: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 300, damping: 24 } } }}
              whileHover={{ y: -4, scale: 1.02, boxShadow: '0 12px 40px rgba(167,139,250,0.2)', transition: { duration: 0.2 } }}
              style={{ background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: '1rem', padding: '1rem 1.5rem', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: '1rem', minWidth: '160px', cursor: 'default' }}
            >
              <Check size={20} color="#a78bfa" />
              <div>
                <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: '2.5rem', fontWeight: 400, color: 'white', lineHeight: 1 }}>{activeTasks.length}</div>
                <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.4)', marginTop: '0.25rem' }}>Tasks</div>
              </div>
            </motion.div>
            
            {/* Stat: Habits */}
            <motion.div
              variants={{ hidden: { opacity: 0, y: 20, scale: 0.95 }, visible: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 300, damping: 24 } } }}
              whileHover={{ y: -4, scale: 1.02, boxShadow: '0 12px 40px rgba(52,211,153,0.15)', transition: { duration: 0.2 } }}
              style={{ background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: '1rem', padding: '1rem 1.5rem', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: '1rem', minWidth: '160px', cursor: 'default' }}
            >
              <Activity size={20} color="#34d399" />
              <div>
                <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: '2.5rem', fontWeight: 400, color: 'white', lineHeight: 1 }}>{globalData.habits?.filter((h: any) => !h.completedDates?.includes(todayStr)).length || 0}</div>
                <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.4)', marginTop: '0.25rem' }}>Habits</div>
              </div>
            </motion.div>

            {/* Stat: Focus */}
            <motion.div
              variants={{ hidden: { opacity: 0, y: 20, scale: 0.95 }, visible: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 300, damping: 24 } } }}
              whileHover={{ y: -4, scale: 1.02, boxShadow: '0 12px 40px rgba(96,165,250,0.15)', transition: { duration: 0.2 } }}
              style={{ background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: '1rem', padding: '1rem 1.5rem', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: '1rem', minWidth: '160px', cursor: 'default' }}
            >
              <Target size={20} color="#60a5fa" />
              <div>
                <div style={{ fontFamily: "'Instrument Serif', serif", fontSize: '2.5rem', fontWeight: 400, color: 'white', lineHeight: 1 }}>{totalPomodoroMinutes}</div>
                <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.4)', marginTop: '0.25rem' }}>Focus Min</div>
              </div>
            </motion.div>
          </motion.div>
        </div>

        {/* 3. & 4. Split Layout (Agent Console & Schedule) */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
          style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start', flexWrap: 'wrap' }}
        >
          
          {/* Left Column: Agent Console (70%) */}
          <motion.div
            className="card agent-shutter-container"
            whileHover={{ boxShadow: '0 8px 40px rgba(167,139,250,0.12)' }}
            style={{ flex: '7 1 700px', padding: 0, overflow: 'hidden' }}
          >
            <AgentShutter
              activeAgent={activeAgent}
              isExecuting={isExecuting}
              agentStatus={agentStatus}
              pipelineSteps={pipelineSteps}
              onAgentDockClick={setActiveAgent}
            />
            <div style={{ padding: '0 1.5rem 1.5rem 1.5rem' }}>
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
              {agentResult && (
                <div style={{ marginTop: '1rem', padding: '1.5rem', background: 'rgba(0,0,0,0.2)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--color-text-1)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <CheckCircle size={18} color="var(--color-cyan)" /> Mission Report
                  </h3>
                  <div style={{ color: 'var(--color-text-2)', fontSize: '0.95rem', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                    {typeof agentResult === 'string' ? agentResult : JSON.stringify(agentResult, null, 2)}
                  </div>
                  {missionComplete && (
                    <button onClick={() => { setAgentResult(null); setMissionComplete(false); }} className="btn-secondary" style={{ marginTop: '1rem' }}>
                      Dismiss
                    </button>
                  )}
                </div>
              )}
            </div>
          </motion.div>

          {/* Right Column: Today's Schedule (30%) */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5, delay: 0.45, ease: [0.16, 1, 0.3, 1] }}
            whileHover={{ boxShadow: '0 8px 32px rgba(96,165,250,0.08)' }}
            style={{ flex: '3 1 300px', background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '1rem', padding: '1.25rem' }}
          >
            <h2 style={{ fontFamily: "'Instrument Serif', serif", fontSize: '1.2rem', fontWeight: 400, color: 'white', marginBottom: '1.5rem' }}>Today's Schedule</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {sortedByUrgency.length > 0 ? sortedByUrgency.map(task => {
                const uLevel = getUrgencyLevel(task.date);
                const isHighPriority = uLevel === 'critical' || uLevel === 'overdue' || task.priority === 'high';
                return (
                  <div key={task.id} style={{ 
                    display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', 
                    background: 'rgba(255,255,255,0.02)', borderRadius: '12px',
                    borderLeft: `4px solid ${isHighPriority ? 'var(--color-red)' : 'var(--color-cyan)'}`,
                    transition: 'background 0.2s', cursor: 'default'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'}
                  >
                    <div style={{ flex: 1 }}>
                      <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--color-text-1)', marginBottom: '0.2rem' }}>{task.title || task.text}</h3>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span className={`badge ${isHighPriority ? 'badge-red' : 'badge-cyan'}`}>
                          {getCountdownText(task.date) || 'Due Today'}
                        </span>
                        {task.priority === 'high' && <span className="badge badge-amber">High Priority</span>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button onClick={(e) => handleCompleteTask(e, task.id)} className="btn-icon" title="Complete Task">
                        <CheckCircle size={20} />
                      </button>
                      <button onClick={(e) => handleDeleteTask(e, task.id)} className="btn-icon danger" title="Delete Task">
                        <Trash2 size={20} />
                      </button>
                    </div>
                  </div>
                );
              }) : (
                <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--color-text-2)', background: 'rgba(255,255,255,0.02)', borderRadius: '12px' }}>
                  <CheckCircle size={48} style={{ opacity: 0.5, margin: '0 auto 1rem' }} />
                  <p style={{ fontSize: '1.1rem' }}>Your schedule is clear for today. Great job!</p>
                </div>
              )}
            </div>
          </motion.div>

        </motion.div>

      </motion.div>
    </div>
  );
}
