import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FileText, Mail, Calendar, Check, AlertTriangle, Activity, 
  Map, SortAsc, Terminal, UserCheck, Repeat, Search, BrainCircuit, Loader2, ArrowRight,
  HardDrive, ShieldCheck, Send, Mic, MicOff, X, Zap, Video, ExternalLink
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { orchestrateAgent } from '../../agent/orchestrator';
import { useGlobalData } from '../../contexts/GlobalDataContext';
import { getUrgencyLevel, getCountdownText } from '../../hooks/useDeadlineWatcher';
import { isSignedInToGoogle, wasEverConnectedToGoogle, getTokenTimeRemaining, initGoogleCalendar } from '../../services/googleCalendar';
import { isPersonalGeminiTokenExpired, wasEverConnectedToPersonalGemini, requestGeminiToken } from '../../services/userGeminiAuth';
import { getLocalDateString } from '../../utils/dateUtils';
import { toast } from 'sonner';
import { useUrgencyState } from '../../hooks/useUrgencyState';
import { useProactiveAgent } from '../../hooks/useProactiveAgent';
import { getKeyStatus } from '../../services/userGeminiAuth';

const parseMissionActions = (report: string) => {
  if (!report) return { meetLinks: [], docLinks: [] };
  const meetLinks = Array.from(new Set(report.match(/https:\/\/meet\.google\.com\/[a-z0-9-]+/g) || []));
  const docLinks = Array.from(new Set(report.match(/https:\/\/docs\.google\.com\/[^\s)\]]+/g) || []));
  return { meetLinks, docLinks };
};

const AGENT_DETAILS: Record<string, {
  title: string;
  tagline: string;
  color: string;
  secondaryColor: string;
  description: string;
  image: string;
  icon: string;
  depicts: string[];
}> = {
  ORCHESTRATOR: {
    title: 'Cognitive Mastermind',
    tagline: 'Orchestrating workflow, task allocation & DAG routing',
    color: '#a78bfa',
    secondaryColor: '#ec4899',
    description: 'Manages agent task routing, parses request syntax, and synthesizes overall execution pipelines.',
    image: '/agents/orchestrator.png',
    icon: '🧠',
    depicts: ['DAG Routing', 'Task Parser', 'Fleet Supervisor']
  },
  SEARCH: {
    title: 'Neural Recon Sentry',
    tagline: 'Google search, information aggregation & fact verification',
    color: '#fbbf24',
    secondaryColor: '#f97316',
    description: 'Scours the web using Google APIs to gather real-time data, verify facts, and retrieve external documents.',
    image: '/agents/search.png',
    icon: '🔍',
    depicts: ['Google Search API', 'Web Scraping', 'Fact Verification']
  },
  DOCS: {
    title: 'Synthesis Engine',
    tagline: 'Document analysis, markdown compiler & layout architect',
    color: '#06b6d4',
    secondaryColor: '#3b82f6',
    description: 'Generates reports, parses document structures, reads PDF/DOCX contents, and compiles output markdown.',
    image: '/agents/docs.png',
    icon: '📄',
    depicts: ['Markdown Compiler', 'Report Synthesizer', 'Layout Architect']
  },
  DATA: {
    title: 'Quantum Analytics Unit',
    tagline: 'Data processing, math operations & chart design',
    color: '#34d399',
    secondaryColor: '#10b981',
    description: 'Computes formulas, extracts tables, plots charts, and performs numerical analysis on workspaces.',
    image: '/agents/data.png',
    icon: '📊',
    depicts: ['Math Processor', 'Table Extractor', 'Stats Analyzer']
  },
  COMMS: {
    title: 'Holographic Comms Terminal',
    tagline: 'Gmail management, mail drafting & reply optimization',
    color: '#f472b6',
    secondaryColor: '#8b5cf6',
    description: 'Accesses Gmail accounts, drafts messages, checks notifications, and formats clean emails.',
    image: '/agents/comms.png',
    icon: '✉️',
    depicts: ['Gmail Inbox', 'Draft Composer', 'Reply Optimizer']
  },
  SCHEDULER: {
    title: 'Chronos Coordinator',
    tagline: 'Calendar orchestration, meeting books & time slot checks',
    color: '#60a5fa',
    secondaryColor: '#6366f1',
    description: 'Queries Google Calendar, books events, resolves schedule conflicts, and notifies deadlines.',
    image: '/agents/scheduler.png',
    icon: '📅',
    depicts: ['Calendar Queries', 'Conflict Solver', 'Event Booking']
  },
  DRIVE: {
    title: 'Aether Storage Sentry',
    tagline: 'Google Drive explorer, folder compiler & file tracker',
    color: '#3b82f6',
    secondaryColor: '#1d4ed8',
    description: 'Navigates and searches Google Drive structures, tracks folders, downloads files, and uploads results.',
    image: '/agents/drive.png',
    icon: '💽',
    depicts: ['Cloud Explorer', 'Folder Compiler', 'File Downloader']
  },
  CODING: {
    title: 'Nexus Compiler Node',
    tagline: 'Code generation, execution, script builder & debugger',
    color: '#22c55e',
    secondaryColor: '#16a34a',
    description: 'Writes system scripts, debugs codebase structures, executes runtime scripts, and runs checks.',
    image: '/agents/coding.png',
    icon: '💻',
    depicts: ['Compiler Core', 'Code Generator', 'Script Executor']
  },
  QA: {
    title: 'Sentinel Guard Protocol',
    tagline: 'System code checker, security auditor & log validator',
    color: '#10b981',
    secondaryColor: '#06b6d4',
    description: 'Performs security audits, runs typechecks, validates inputs/outputs, and logs workflow errors.',
    image: '/agents/qa.png',
    icon: '🛡️',
    depicts: ['Security Auditor', 'Typecheck Sentry', 'Log Validator']
  },
  PLANNER: {
    title: 'Strategic Architect',
    tagline: 'Goal decomposition, milestone mapping & project scaffolding',
    color: '#f59e0b',
    secondaryColor: '#d97706',
    description: 'Breaks complex goals into milestones and actionable tasks. Injects tasks into ZenTrack and blocks calendar time for critical milestones.',
    image: '/agents/planner.png',
    icon: '🗺️',
    depicts: ['Goal Decomposer', 'Milestone Mapper', 'Task Injector']
  },
  MONITOR: {
    title: 'Risk Sentinel',
    tagline: 'Deadline drift detection, risk scoring & proactive alerts',
    color: '#ef4444',
    secondaryColor: '#dc2626',
    description: 'Continuously assesses task risk, sends proactive alerts, auto-reschedules low-priority items during emergencies, and scans email for deadline changes.',
    image: '/agents/monitor.png',
    icon: '🚨',
    depicts: ['Risk Assessor', 'Alert Dispatcher', 'Auto-Rescheduler']
  },
  GHOST_DETECTOR: {
    title: 'Ghost Deadline Finder',
    tagline: 'Hidden commitment discovery, inbox scanning & deadline extraction',
    color: '#8b5cf6',
    secondaryColor: '#7c3aed',
    description: 'Scans emails and calendar descriptions for hidden deadlines never explicitly logged — surfaces ghost tasks before they become missed commitments.',
    image: '/agents/ghost.png',
    icon: '👻',
    depicts: ['Inbox Scanner', 'Deadline Extractor', 'Ghost Task Creator']
  },
  EXECUTOR: {
    title: 'Hyper Action Engine',
    tagline: 'Cross-system execution, multi-action chaining & delegation hub',
    color: '#22d3ee',
    secondaryColor: '#0891b2',
    description: 'The most action-oriented agent. Chains email, docs, meetings, and tasks in a single autonomous workflow. Delegates recursively to specialist sub-agents.',
    image: '/agents/executor.png',
    icon: '⚡',
    depicts: ['Action Chainer', 'Delegation Hub', 'Workflow Automator']
  }
};

export function HomeDashboard() {
  const [time, setTime] = useState('');
  const { tasks, pomodoroSessions, isGoogleConnected, connectGoogle, calendarEvents } = useGlobalData();
  const [agentStatus, setAgentStatus] = useState('System idle. Monitoring datastreams...');
  const [commandInput, setCommandInput] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [agentResult, setAgentResult] = useState<string | null>(null);
  const [agentHistory, setAgentHistory] = useState<{role: string, text: string}[]>([]);
  const [isReportExpanded, setIsReportExpanded] = useState(false);
  const [isMobile, setIsMobile] = useState(() => 
    typeof window !== 'undefined' && window.innerWidth < 640
  );
  const [missionComplete, setMissionComplete] = useState(false);
  const [missionSummary, setMissionSummary] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');

  // Shutter Capsule door state machine
  const [displayAgent, setDisplayAgent] = useState<string | null>(null);
  const [doorsOpen, setDoorsOpen] = useState(false);
  const [isShaking, setIsShaking] = useState(false);

  useEffect(() => {
    if (!doorsOpen) {
      // Trigger a mechanical slam shake when the doors finish closing (around 400ms)
      const t = setTimeout(() => {
        setIsShaking(true);
        const t2 = setTimeout(() => setIsShaking(false), 400);
        return () => clearTimeout(t2);
      }, 400);
      return () => clearTimeout(t);
    }
  }, [doorsOpen]);

  useEffect(() => {
    if (isExecuting && activeAgent) {
      if (activeAgent !== displayAgent) {
        setDoorsOpen(false);
        const t = setTimeout(() => {
          setDisplayAgent(activeAgent);
          setDoorsOpen(true);
        }, 400);
        return () => clearTimeout(t);
      } else {
        setDoorsOpen(true);
      }
    } else {
      setDoorsOpen(false);
      const t = setTimeout(() => {
        setDisplayAgent(null);
      }, 400);
      return () => clearTimeout(t);
    }
  }, [activeAgent, isExecuting, displayAgent]);

  const displayAgentDetails = displayAgent ? AGENT_DETAILS[displayAgent] : null;

  // Get active agent details, default to Orchestrator if none set (but executing)
  const activeAgentKey = activeAgent || 'ORCHESTRATOR';
  const activeDetails = AGENT_DETAILS[activeAgentKey] || AGENT_DETAILS.ORCHESTRATOR;

  // Compute pipeline step status based on current active agent and status string
  const currentStep = useMemo(() => {
    if (!isExecuting) return 0;
    if (activeAgent === 'ORCHESTRATOR') {
      if (agentStatus.toLowerCase().includes('initial') || agentStatus.toLowerCase().includes('route')) {
        return 1; // ROUTING
      }
      return 2; // THINKING
    }
    if (activeAgent === 'QA') {
      return 4; // QA/VERIFYING
    }
    return 3; // EXECUTING
  }, [isExecuting, activeAgent, agentStatus]);

  const pipelineSteps = useMemo(() => [
    { id: 1, name: 'Routing', status: currentStep === 1 ? 'active' : currentStep > 1 ? 'completed' : 'pending' },
    { id: 2, name: 'Reasoning', status: currentStep === 2 ? 'active' : currentStep > 2 ? 'completed' : 'pending' },
    { id: 3, name: 'Execution', status: currentStep === 3 ? 'active' : currentStep > 3 ? 'completed' : 'pending' },
    { id: 4, name: 'Verification', status: currentStep === 4 ? 'active' : currentStep > 4 ? 'completed' : 'pending' }
  ], [currentStep]);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 640);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // ── Urgency Color System — morphs entire app palette ──
  const urgencyState = useUrgencyState(tasks);

  // ── Proactive Agent — auto-fires on overdue/urgent detection ──
  useProactiveAgent(tasks, calendarEvents, setIsExecuting);

  // ── Listen for proactive briefing results + autonomous action events ──
  useEffect(() => {
    const handleProactiveBriefing = (e: any) => {
      setAgentResult(e.detail?.report || null);
      // If this was an autonomous action report, also set missionComplete
      if (e.detail?.isActionReport) {
        setMissionComplete(true);
        setMissionSummary(e.detail?.report || '');
      }
    };

    // show-proactive-report: open the mission report overlay
    const handleShowReport = () => {
      const pending = sessionStorage.getItem('pending_proactive_briefing');
      if (pending && !agentResult) setAgentResult(pending);
      // Scroll window to top to reveal the overlay
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    // ghost-scan-complete: ghost deadlines were auto-found and tasks created
    const handleGhostScanComplete = (e: any) => {
      const { count } = e.detail || {};
      const label = count ? `${count} hidden deadline${count !== 1 ? 's' : ''}` : 'Hidden deadlines';
      toast.success('👻 Ghost Scan Complete', {
        description: `${label} found in your inbox and added to ZenTrack automatically.`,
        duration: 9000,
        action: { label: 'View Tasks', onClick: () => window.location.hash = '#/todo' }
      });
      // Surface the ghost scan report in the mission report overlay
      if (e.detail?.result) {
        setAgentResult(e.detail.result);
        setMissionComplete(true);
        setMissionSummary(e.detail.result);
      }
    };

    // guardian-autonomous-corrector: useDeadlineWatcher found tasks within 3h
    // — now triggers real autonomous execution instead of just logging
    const handleGuardianCorrector = (e: any) => {
      const taskTitle = e.detail?.title || 'a task';
      const recoveryPrompt = `GUARDIAN_AUTONOMOUS_CORRECTOR: The task "${taskTitle}" is due within 3 hours and has not been completed. Take autonomous action: ` +
        `1. Send an urgent push notification to the user. ` +
        `2. Check calendar for any conflicting events in the next 3 hours using list_calendar_events. ` +
        `3. If there is a conflicting low-priority event, reschedule it using auto_reschedule. ` +
        `4. Send a final reminder 30 minutes before deadline using send_reminder. ` +
        `Report everything you did.`;
      
      // Only fire if not already executing to avoid conflicts
      if (!isExecuting) {
        handleExecuteCommand(recoveryPrompt);
      }
    };

    window.addEventListener('proactive-briefing', handleProactiveBriefing);
    window.addEventListener('show-proactive-report', handleShowReport);
    window.addEventListener('ghost-scan-complete', handleGhostScanComplete);
    window.addEventListener('guardian-autonomous-corrector', handleGuardianCorrector);

    // Read and clear any pending voice command reports from session storage
    const pending = sessionStorage.getItem('pending_proactive_briefing');
    if (pending) {
      setAgentResult(pending);
      sessionStorage.removeItem('pending_proactive_briefing');
    }

    return () => {
      window.removeEventListener('proactive-briefing', handleProactiveBriefing);
      window.removeEventListener('show-proactive-report', handleShowReport);
      window.removeEventListener('ghost-scan-complete', handleGhostScanComplete);
      window.removeEventListener('guardian-autonomous-corrector', handleGuardianCorrector);
    };
  }, [isExecuting, agentResult]);

  // ── Best-in-class Voice Engine ───────────────────────────────────────────
  // Uses continuous mode + silence-detection timer instead of one-shot recognition.
  // The agent fires only after the user truly stops talking (1.8s silence),
  // not at every natural mid-sentence pause.
  // ─────────────────────────────────────────────────────────────────────────
  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  const recognition = useMemo(() => {
    if (!SpeechRecognition) return null;
    const r = new SpeechRecognition();
    r.continuous    = true;  // Never stop on natural pauses
    r.interimResults = true;  // Stream live transcript while speaking
    r.lang = 'en-US';
    return r;
  }, [SpeechRecognition]);

  // Refs — needed inside event handler closures to avoid stale state
  const commandInputRef  = React.useRef('');
  const silenceTimerRef  = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const silenceStartRef  = React.useRef<number>(0);
  const [silencePercent, setSilencePercent] = React.useState(0); // 0..100 countdown
  const silenceAnimRef   = React.useRef<ReturnType<typeof setInterval> | null>(null);

  const SILENCE_THRESHOLD_MS = 1800; // submit after 1.8s of no new words

  useEffect(() => { commandInputRef.current = commandInput; }, [commandInput]);

  // Animate the silence countdown ring
  const startSilenceCountdown = () => {
    silenceStartRef.current = Date.now();
    setSilencePercent(0);
    if (silenceAnimRef.current) clearInterval(silenceAnimRef.current);
    silenceAnimRef.current = setInterval(() => {
      const elapsed = Date.now() - silenceStartRef.current;
      const pct = Math.min(100, (elapsed / SILENCE_THRESHOLD_MS) * 100);
      setSilencePercent(pct);
      if (pct >= 100 && silenceAnimRef.current) {
        clearInterval(silenceAnimRef.current);
        silenceAnimRef.current = null;
      }
    }, 50);
  };

  const cancelSilenceCountdown = () => {
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null; }
    if (silenceAnimRef.current) { clearInterval(silenceAnimRef.current); silenceAnimRef.current = null; }
    setSilencePercent(0);
  };

  // Fire submit after silence — called by the timer
  const submitAfterSilence = React.useCallback(() => {
    const captured = commandInputRef.current.trim();
    if (!captured) return;
    recognition?.stop(); // Stop recognition cleanly first
    setIsListening(false);
    setInterimTranscript('');
    cancelSilenceCountdown();
    setTimeout(() => handleExecuteCommand(captured), 80);
  }, [recognition]);

  useEffect(() => {
    if (!recognition) return;

    recognition.onresult = (event: any) => {
      let interim = '';
      let finalChunk = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalChunk += event.results[i][0].transcript;
        } else {
          interim += event.results[i][0].transcript;
        }
      }

      setInterimTranscript(interim);

      if (finalChunk) {
        setCommandInput(prev => prev ? prev + ' ' + finalChunk.trim() : finalChunk.trim());
      }

      // Every new word resets the silence timer — user is still talking
      cancelSilenceCountdown();
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

      silenceTimerRef.current = setTimeout(() => {
        // 1.8 seconds of silence → user done speaking → submit
        submitAfterSilence();
      }, SILENCE_THRESHOLD_MS);
      startSilenceCountdown();
    };

    recognition.onerror = (event: any) => {
      // 'no-speech' is normal — don't treat it as failure, just keep waiting
      if (event.error === 'no-speech') return;
      console.error('[Voice] Recognition error:', event.error);
      setIsListening(false);
      setInterimTranscript('');
      cancelSilenceCountdown();
    };

    // continuous:true — onend only fires if we explicitly stop or browser cuts us
    // If user spoke something, submit it; if they just stopped without speaking, do nothing
    recognition.onend = () => {
      cancelSilenceCountdown();
      setInterimTranscript('');
      const captured = commandInputRef.current.trim();
      // Only auto-submit from onend if the silence timer didn't already handle it
      if (captured && isListening) {
        setIsListening(false);
        setTimeout(() => handleExecuteCommand(captured), 80);
      } else {
        setIsListening(false);
      }
    };
  }, [recognition, submitAfterSilence, isListening]);

  const toggleListening = () => {
    if (!recognition) {
      toast.error('Voice input is not supported in this browser. Try Chrome.');
      return;
    }
    if (isListening) {
      // User manually stopped — submit whatever was captured so far
      recognition.stop();
      cancelSilenceCountdown();
      setIsListening(false);
      const captured = commandInputRef.current.trim();
      if (captured) setTimeout(() => handleExecuteCommand(captured), 80);
    } else {
      setCommandInput(''); // Clear previous input when starting fresh voice session
      try {
        recognition.start();
        setIsListening(true);
        toast.info('🎙️ Listening... speak naturally. I\'ll send when you stop.', { duration: 3000 });
      } catch (e: any) {
        // Already running — stop and restart
        try { recognition.stop(); } catch {} 
        setTimeout(() => { try { recognition.start(); setIsListening(true); } catch {} }, 300);
      }
    }
  };


  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      setTime(now.toLocaleTimeString('en-US', { hour12: false }));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleConnectWorkspace = async () => {
    setIsConnecting(true);
    try {
      await connectGoogle();
      toast.success('Google Workspace integrated successfully');
    } catch (err: any) {
      toast.error('Google Workspace integration failed: ' + err.message);
    } finally {
      setIsConnecting(false);
    }
  };

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const handleAgentLog = (e: any) => {
      const type = e.detail?.type;
      const text = e.detail?.title || e.detail?.message;
      if (type === 'answer' && text) {
        setMissionComplete(true);
        setMissionSummary(text); // Show full report — content area scrolls
      }
      if (text) {
        setAgentStatus(text);
        if (text.match(/\[([A-Z_]+)\]/)) {
           const match = text.match(/\[([A-Z_]+)\]/);
           if (match) setActiveAgent(match[1]);
        } else if (text.toLowerCase().includes('orchestrator')) {
           setActiveAgent('ORCHESTRATOR');
        } else if (text.includes('Routed to:')) {
           const match = text.match(/Routed to:\s*([A-Z_]+)/);
           if (match) setActiveAgent(match[1]);
        }
        
        clearTimeout(timeout);
        timeout = setTimeout(() => {
          setActiveAgent(null);
          setAgentStatus('System idle. Monitoring datastreams...');
        }, 15000);
      }
    };
    
    const handleClearMemory = () => {
      setAgentHistory([]);
    };

    const handleShortcut = (e: Event) => {
      const { prompt } = (e as CustomEvent).detail || {};
      if (prompt && typeof prompt === 'string') {
        // Small delay so FAB close animation finishes before agent UI opens
        setTimeout(() => handleExecuteCommand(prompt), 120);
      }
    };

    window.addEventListener('agent-log', handleAgentLog);
    window.addEventListener('agent-clear-memory', handleClearMemory);
    window.addEventListener('agent-shortcut', handleShortcut);
    return () => {
      window.removeEventListener('agent-log', handleAgentLog);
      window.removeEventListener('agent-clear-memory', handleClearMemory);
      window.removeEventListener('agent-shortcut', handleShortcut);
      clearTimeout(timeout);
    };
  }, []);

  const handleExecuteCommand = async (overridePrompt?: string | any) => {
    const prompt = typeof overridePrompt === 'string' ? overridePrompt : commandInput;
    if (!prompt.trim() || isExecuting) return;
    setCommandInput('');
    setIsExecuting(true);
    setAgentStatus('ORCHESTRATOR initializing DAG workflow...');
    setActiveAgent('ORCHESTRATOR');
    
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';
    
    try {
      setAgentResult(null);
      setMissionComplete(false);

      // --- SMART WORKSPACE AUTO-SIGN-IN ---
      // Detect if the prompt requires Google Workspace (Gmail, Calendar, Drive, etc.)
      // If so, and the user isn't connected, automatically open sign-in right now.
      // We do this INSIDE the user gesture (button click) so popups are never blocked.
      const WORKSPACE_KEYWORDS = [
        'email', 'gmail', 'mail', 'inbox', 'draft', 'reply', 'send email',
        'calendar', 'schedule', 'meeting', 'event', 'book', 'reschedule',
        'drive', 'docs', 'document', 'spreadsheet', 'sheet', 'slides',
        'meet', 'video call', 'google meet',
        'check my', 'read my', 'show my', 'summarise my', 'summarize my',
      ];
      const promptLower = prompt.toLowerCase();
      const needsWorkspace = WORKSPACE_KEYWORDS.some(kw => promptLower.includes(kw));

      if (needsWorkspace && !isSignedInToGoogle()) {
        setAgentStatus('🔐 This task needs Google Workspace — connecting...');
        try {
          await initGoogleCalendar();
          await connectGoogle();
          // Notify badge to refresh its state immediately
          window.dispatchEvent(new Event('google-token-refreshed'));
          setAgentStatus('✅ Google Workspace connected! Starting task...');
        } catch (err: any) {
          const msg = String(err?.message || '').toLowerCase();
          if (!msg.includes('cancelled') && !msg.includes('popup-closed')) {
            // Non-cancel error — warn but continue (agent will surface a clearer error)
            console.warn('[AutoLogin] Workspace sign-in failed:', err);
          } else {
            // User dismissed the popup — abort the task cleanly
            setAgentStatus('Sign-in cancelled. Connect your Google Workspace to use this task.');
            setIsExecuting(false);
            setActiveAgent(null);
            return;
          }
        }
      } else {
        // Token exists — check if it's about to expire and proactively refresh
        const timeRemaining = getTokenTimeRemaining();
        if (wasEverConnectedToGoogle() && (!isSignedInToGoogle() || (timeRemaining > 0 && timeRemaining < 10 * 60 * 1000))) {
          setAgentStatus('Refreshing Google Workspace connection...');
          try {
            await connectGoogle();
            window.dispatchEvent(new Event('google-token-refreshed'));
          } catch (err) {
            console.warn('Auto-refresh failed. Continuing anyway.', err);
          }
        }
      }

      // Auto-refresh the Personal Gemini OAuth key if it expired
      if (isPersonalGeminiTokenExpired() && wasEverConnectedToPersonalGemini()) {
        setAgentStatus('Refreshing Personal Gemini AI token...');
        try {
          await requestGeminiToken();
        } catch (err) {
          console.warn('Auto-login failed for Personal Gemini AI key.', err);
        }
      }

      const result = await orchestrateAgent(
        prompt,
        tasks,
        calendarEvents,
        apiKey,
        (step) => {
          // agent-log event is already dispatched inside orchestrator/runAgentLoop
        },
        agentHistory
      );
      
      // Cap history at last 5 turns (10 entries) to prevent context window bloat
      setAgentHistory(prev => [
        ...prev, 
        { role: 'user', text: prompt }, 
        { role: 'model', text: result }
      ].slice(-10));
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

  // ── Emergency Recovery — LEVEL_4 full fleet activation ──
  const handleEmergencyRecovery = () => {
    const today = getLocalDateString(new Date());
    const overdueTasks = tasks.filter(t => t.status !== 'completed' && t.date && t.date < today);
    const todayTasks = tasks.filter(t => t.status !== 'completed' && t.date === today);
    const emergencyPrompt = `EMERGENCY RECOVERY PROTOCOL ACTIVATED. ` +
      `I have ${overdueTasks.length} overdue task(s) and ${todayTasks.length} task(s) due today. ` +
      `Deploy the full agent fleet: analyze my situation, identify the most critical items, ` +
      `check my calendar for free slots today, draft any needed apology or status emails, ` +
      `block emergency time for the top 2 priorities, and give me a complete recovery plan.`;
    handleExecuteCommand(emergencyPrompt);
  };

  // ── Ghost Detector — scan inbox for hidden deadlines ──
  const handleGhostDetector = () => {
    handleExecuteCommand(
      `GHOST DETECTION PROTOCOL: Scan my email inbox for any hidden deadlines, untracked commitments, ` +
      `or urgent requests I haven't logged yet. Look for phrases like "by Friday", "due date", "ASAP", ` +
      `"please submit by", "following up". For each ghost deadline found, create a task in ZenTrack and alert me.`
    );
  };

  // ── Monitor Risk Check — full risk assessment ──
  const handleMonitorRisk = () => {
    handleExecuteCommand(
      `RISK ASSESSMENT PROTOCOL: Run a full risk analysis on all my tasks. ` +
      `Score each task as CRITICAL/HIGH/MEDIUM/LOW. Check my calendar for meeting conflicts. ` +
      `Send me a prioritized alert for anything CRITICAL or HIGH risk. ` +
      `Auto-reschedule any LOW priority tasks that are blocking my day.`
    );
  };

  const todayStr = getLocalDateString(new Date());

  const todayTasks = useMemo(() => tasks.filter(t => t.date === todayStr || !t.date), [tasks, todayStr]);
  const activeTasks = todayTasks.filter(t => t.status !== 'completed');
  const completedTodayCount = todayTasks.filter(t => t.status === 'completed').length;
  
  const highPriorityActive = activeTasks.filter(t => t.priority === 'high');
  
  // Sort tasks for Urgency Matrix
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

  // ROI Analysis
  const overdueCount = activeTasks.filter(t => getUrgencyLevel(t.date) === 'overdue').length;
  
  // Pomodoro hours calculation
  const todaySessions = pomodoroSessions.filter(s => {
      if(s.startTime) return new Date(s.startTime).toLocaleDateString('en-CA') === todayStr;
      if(s.date) return s.date === todayStr;
      if(s.createdAt) return new Date(s.createdAt).toLocaleDateString('en-CA') === todayStr;
      return false;
  });
  let totalPomodoroMinutes = 0;
  todaySessions.forEach(s => {
      totalPomodoroMinutes += (s.durationMinutes || s.duration || s.minutes || 25);
  });
  const hoursSaved = (totalPomodoroMinutes / 60).toFixed(1);

  return (
    <div className="agent-dashboard">
      <div className="dashboard-grid">
        
        {/* LEFT COLUMN - Active Deployment */}
        <div className="active-deployment-card">
          <div className="card-header">
            <div>
              <h2 className="card-title">Active Deployment</h2>
              <p className="card-subtitle">{highPriorityActive.length} Autonomous Agents engaged in "Current Sprint"</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              {/* Dynamic Urgency Banner */}
              <div className={`urgency-banner ${urgencyState.replace('state-', '')}`}>
                {urgencyState === 'state-critical' && <><AlertTriangle size={12} /> CRITICAL</>}
                {urgencyState === 'state-active' && <><Activity size={12} /> ACTIVE</>}
                {urgencyState === 'state-calm' && <><Check size={12} /> FLOW STATE</>}
              </div>
              {/* Emergency Recovery Button — always visible, style changes by urgency */}
              <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={handleEmergencyRecovery}
                disabled={isExecuting}
                title="Activate full fleet emergency recovery"
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.35rem',
                  background: urgencyState === 'state-critical'
                    ? '#DC2626'
                    : urgencyState === 'state-active'
                    ? '#EA580C'
                    : 'rgba(139,92,246,0.2)',
                  border: urgencyState === 'state-calm' ? '1px solid rgba(139,92,246,0.4)' : 'none',
                  borderRadius: '8px',
                  padding: '0.4rem 0.75rem',
                  color: urgencyState === 'state-calm' ? '#c4b5fd' : '#fff',
                  fontSize: '0.7rem', fontWeight: 700,
                  cursor: isExecuting ? 'not-allowed' : 'pointer',
                  letterSpacing: '0.06em',
                  boxShadow: 'none',
                  opacity: isExecuting ? 0.6 : 1,
                  transition: 'all 0.3s ease',
                }}
              >
                {isExecuting 
                  ? <><Loader2 size={12} className="spin" /> Agents Working...</>
                  : <><Zap size={12} /> {urgencyState === 'state-calm' ? 'AI Assist' : '⚡ Get AI Help'}</>
                }
              </motion.button>
            </div>
          </div>
          
          <div className="quantum-deck-container">
            {/* Embedded styles for our Quantum Deck to make sure it's 100% self-contained and gorgeous */}
            <style>{`
              .quantum-deck-container {
                width: 100%;
                min-height: 380px;
                display: flex;
                flex-direction: column;
                justify-content: space-between;
                align-items: center;
                background: rgba(10, 10, 16, 0.45);
                border: 1px solid rgba(255, 255, 255, 0.05);
                border-radius: 20px;
                padding: 1.5rem;
                position: relative;
                overflow: hidden;
                box-shadow: inset 0 0 30px rgba(124, 58, 237, 0.03), 0 10px 40px rgba(0, 0, 0, 0.4);
                backdrop-filter: blur(16px);
                -webkit-backdrop-filter: blur(16px);
                margin: 1.5rem 0;
              }

              /* Scanning line scan effect */
              .quantum-deck-container::after {
                content: '';
                position: absolute;
                top: 0; left: 0; right: 0; bottom: 0;
                background: linear-gradient(180deg, transparent, rgba(139, 92, 246, 0.06), transparent);
                height: 100%;
                width: 100%;
                animation: scanline 6s infinite linear;
                pointer-events: none;
                z-index: 2;
              }

              @keyframes scanline {
                0% { transform: translateY(-100%); }
                100% { transform: translateY(100%); }
              }

              /* Quantum Chamber - Idle State */
              .quantum-idle-chamber {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                flex: 1;
                width: 100%;
                position: relative;
                gap: 1.5rem;
              }

              .quantum-core-reactor {
                position: relative;
                width: 140px;
                height: 140px;
                display: flex;
                align-items: center;
                justify-content: center;
              }

              .quantum-reactor-ring {
                position: absolute;
                border-radius: 50%;
                border: 1px dashed rgba(167, 139, 250, 0.35);
                animation: reactor-rotate 15s linear infinite;
              }

              .quantum-reactor-ring.ring-1 { width: 140px; height: 140px; border-style: dotted; animation-duration: 25s; }
              .quantum-reactor-ring.ring-2 { width: 110px; height: 110px; border-color: rgba(6, 182, 212, 0.4); animation-direction: reverse; animation-duration: 18s; }
              .quantum-reactor-ring.ring-3 { width: 80px; height: 80px; border-style: double; border-width: 2px; border-color: rgba(167, 139, 250, 0.6); animation-duration: 10s; }

              .quantum-reactor-orb {
                width: 50px;
                height: 50px;
                border-radius: 50%;
                background: radial-gradient(circle, rgba(167, 139, 250, 0.9) 0%, rgba(124, 58, 237, 0.4) 60%, rgba(99, 102, 241, 0) 100%);
                box-shadow: 0 0 35px rgba(167, 139, 250, 0.8), inset 0 0 10px rgba(255, 255, 255, 0.5);
                animation: reactor-breath 3s ease-in-out infinite;
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 5;
              }

              @keyframes reactor-rotate {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
              }

              @keyframes reactor-breath {
                0%, 100% { transform: scale(1); filter: brightness(1) drop-shadow(0 0 15px rgba(167, 139, 250, 0.6)); }
                50% { transform: scale(1.1); filter: brightness(1.2) drop-shadow(0 0 30px rgba(167, 139, 250, 0.9)); }
              }

              .quantum-idle-text {
                text-align: center;
                z-index: 5;
              }

              .quantum-idle-title {
                font-family: var(--font-display, 'Outfit', sans-serif);
                font-size: 0.85rem;
                font-weight: 800;
                letter-spacing: 0.15em;
                color: #e4e4e7;
                text-transform: uppercase;
                text-shadow: 0 0 10px rgba(255, 255, 255, 0.1);
              }

              .quantum-idle-subtitle {
                font-size: 0.68rem;
                color: #71717a;
                margin-top: 0.25rem;
                letter-spacing: 0.05em;
              }

              /* Sleek Quantum Dock */
              .quantum-console-dock {
                display: flex;
                justify-content: center;
                gap: 0.6rem;
                width: 100%;
                padding-top: 1rem;
                border-top: 1px solid rgba(255, 255, 255, 0.04);
                z-index: 5;
              }

              .quantum-dock-item {
                position: relative;
                width: 32px;
                height: 32px;
                border-radius: 50%;
                background: rgba(20, 20, 30, 0.9);
                border: 1px solid rgba(255, 255, 255, 0.08);
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
              }

              .quantum-dock-img {
                width: 100%;
                height: 100%;
                border-radius: 50%;
                object-fit: cover;
                filter: grayscale(1) opacity(0.4);
                transition: all 0.3s ease;
              }

              .quantum-dock-item:hover {
                transform: scale(1.25) translateY(-3px);
                border-color: var(--hover-color, #c084fc);
                box-shadow: 0 0 15px var(--hover-shadow, rgba(192, 132, 252, 0.4));
              }

              .quantum-dock-item:hover .quantum-dock-img {
                filter: grayscale(0) opacity(1);
              }

              /* Capsule door styling */
              .quantum-capsule {
                position: relative;
                width: 100%;
                height: 200px;
                background: rgba(5, 5, 10, 0.65);
                border: 1px solid rgba(255, 255, 255, 0.05);
                border-radius: 16px;
                overflow: hidden;
                box-shadow: inset 0 0 25px rgba(0, 0, 0, 0.9);
                display: flex;
                margin-bottom: 0.5rem;
              }

              .capsule-chamber {
                width: 100%;
                height: 100%;
                display: flex;
                position: relative;
                z-index: 1;
              }

              .chamber-content {
                display: flex;
                width: 100%;
                height: 100%;
                padding: 1.2rem;
                gap: 1.5rem;
                align-items: center;
              }

              .chamber-left {
                flex: 0 0 110px;
                height: 110px;
              }

              .chamber-viewport {
                width: 100%;
                height: 100%;
                border-radius: 12px;
                border: 2px solid var(--agent-color, #c084fc);
                box-shadow: 0 0 20px var(--agent-shadow, rgba(192, 132, 252, 0.2));
                overflow: hidden;
                position: relative;
              }

              .chamber-avatar {
                width: 100%;
                height: 100%;
                object-fit: cover;
                animation: avatar-breath 4s ease-in-out infinite;
                z-index: 1;
                position: relative;
              }

              @keyframes avatar-breath {
                0%, 100% { transform: scale(1); filter: brightness(1); }
                50% { transform: scale(1.04); filter: brightness(1.1); }
              }

              /* Spinning Diagnostic Rings inside viewport */
              .hud-reticle-circle {
                position: absolute;
                top: 5%; left: 5%; right: 5%; bottom: 5%;
                border: 1px dashed var(--agent-color, #c084fc);
                border-radius: 50%;
                opacity: 0.25;
                pointer-events: none;
                z-index: 2;
              }
              .hud-reticle-circle.ring-slow {
                animation: reactor-rotate 25s linear infinite;
              }
              .hud-reticle-circle.ring-fast {
                top: 15%; left: 15%; right: 15%; bottom: 15%;
                border-style: dotted;
                border-color: var(--agent-color, #c084fc);
                animation: reactor-rotate 12s linear infinite reverse;
                opacity: 0.45;
              }
              .hud-reticle-corners {
                position: absolute;
                inset: 8px;
                pointer-events: none;
                z-index: 2;
              }
              .hud-reticle-corners::before, .hud-reticle-corners::after {
                content: '';
                position: absolute;
                width: 8px;
                height: 8px;
                border-color: var(--agent-color, #c084fc);
                border-style: solid;
                opacity: 0.7;
              }
              .hud-reticle-corners::before {
                top: 0; left: 0;
                border-width: 1.5px 0 0 1.5px;
              }
              .hud-reticle-corners::after {
                bottom: 0; right: 0;
                border-width: 0 1.5px 1.5px 0;
              }

              .hud-overlay-scanner {
                position: absolute;
                inset: 0;
                border: 1px solid rgba(255, 255, 255, 0.05);
                pointer-events: none;
                z-index: 3;
              }
              .hud-overlay-scanner::before {
                content: '';
                position: absolute;
                top: 5%; left: 5%; right: 5%; bottom: 5%;
                border: 1px solid rgba(255, 255, 255, 0.03);
                border-radius: 50%;
                animation: reactor-rotate 20s linear infinite;
              }
              .hud-overlay-scanner::after {
                content: '';
                position: absolute;
                top: 0; left: 0; right: 0;
                height: 2px;
                background: var(--agent-color, #c084fc);
                box-shadow: 0 0 8px var(--agent-color, #c084fc);
                animation: scanner-sweep 2.2s linear infinite;
              }

              @keyframes scanner-sweep {
                0% { top: 0%; opacity: 0; }
                10% { opacity: 1; }
                90% { opacity: 1; }
                100% { top: 100%; opacity: 0; }
              }

              .chamber-right {
                flex: 1;
                display: flex;
                flex-direction: column;
                justify-content: center;
                gap: 0.35rem;
                min-width: 0;
              }

              .chamber-metrics-header {
                display: flex;
                flex-direction: column;
                gap: 0.1rem;
              }

              .chamber-agent-title {
                font-family: var(--font-display, 'Outfit', sans-serif);
                font-size: 0.95rem;
                font-weight: 800;
                color: #fff;
                display: flex;
                align-items: center;
                gap: 0.4rem;
                text-transform: uppercase;
                letter-spacing: 0.05em;
              }

              .chamber-agent-tagline {
                font-size: 0.65rem;
                color: var(--agent-color, #c084fc);
                font-weight: 600;
                letter-spacing: 0.03em;
                text-transform: uppercase;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
              }

              .chamber-description {
                font-size: 0.72rem;
                color: #a1a1aa;
                line-height: 1.4;
                background: rgba(255,255,255,0.02);
                border: 1px solid rgba(255,255,255,0.04);
                padding: 0.45rem 0.7rem;
                border-radius: 8px;
              }

              /* Depicts badges styling */
              .chamber-depicts-container {
                display: flex;
                flex-direction: column;
                gap: 0.25rem;
                margin-top: 0.1rem;
              }
              .depicts-title {
                font-family: var(--font-mono, monospace);
                font-size: 0.55rem;
                font-weight: 700;
                color: #52525b;
                text-transform: uppercase;
                letter-spacing: 0.06em;
              }
              .depicts-grid {
                display: flex;
                flex-wrap: wrap;
                gap: 0.35rem;
              }
              .depicts-badge {
                display: inline-flex;
                align-items: center;
                gap: 0.25rem;
                padding: 0.15rem 0.4rem;
                background: rgba(255, 255, 255, 0.02);
                border: 1px solid rgba(255, 255, 255, 0.04);
                border-radius: 4px;
                font-size: 0.58rem;
                font-family: var(--font-display, 'Outfit', sans-serif);
                font-weight: 600;
                color: #d4d4d8;
                transition: all 0.3s;
              }
              .depicts-badge:hover {
                border-color: var(--agent-color, #c084fc);
                background: rgba(167, 139, 250, 0.04);
                transform: translateY(-1px);
              }
              .depicts-badge-dot {
                width: 4px;
                height: 4px;
                border-radius: 50%;
                background: var(--agent-color, #c084fc);
                box-shadow: 0 0 6px var(--agent-color, #c084fc);
              }

              /* Quantum Stasis Force Field Overlay */
              .stasis-force-field {
                position: absolute;
                inset: 0;
                background: radial-gradient(circle at center, rgba(12, 10, 24, 0.98) 0%, rgba(5, 5, 8, 0.99) 100%);
                border: 1px solid rgba(255, 255, 255, 0.08);
                z-index: 10;
                display: flex;
                align-items: center;
                justify-content: center;
                overflow: hidden;
                transition: all 0.5s cubic-bezier(0.25, 1, 0.5, 1);
                pointer-events: none;
              }

              .stasis-force-field.active {
                opacity: 1;
                transform: scale(1);
                filter: blur(0px);
                pointer-events: auto;
              }

              /* Dissolve transition: expands, blurs, and fades out */
              .stasis-force-field.dissolved {
                opacity: 0;
                transform: scale(1.08);
                filter: blur(12px) contrast(1.5);
                clip-path: circle(0% at 50% 50%);
                transition: 
                  opacity 0.4s ease-out, 
                  transform 0.45s cubic-bezier(0.25, 1, 0.5, 1), 
                  filter 0.4s ease-out,
                  clip-path 0.5s cubic-bezier(0.76, 0, 0.24, 1);
              }

              /* Shockwave when shield snaps shut */
              .stasis-force-field.shield-shockwave {
                animation: shield-snap 0.4s ease-out;
              }

              @keyframes shield-snap {
                0% { 
                  box-shadow: 0 0 0px transparent, inset 0 0 0px transparent;
                  filter: brightness(2);
                }
                10% {
                  box-shadow: 0 0 50px var(--agent-color, #c084fc), inset 0 0 30px var(--agent-color, #c084fc);
                }
                100% {
                  box-shadow: 0 0 0px transparent, inset 0 0 0px transparent;
                  filter: brightness(1);
                }
              }

              /* Shield Grid and Scanner */
              .shield-grid {
                position: absolute;
                inset: 0;
                background-image: 
                  radial-gradient(var(--agent-color, #c084fc) 1px, transparent 1px);
                background-size: 15px 15px;
                opacity: 0.15;
                z-index: 1;
              }

              .shield-scanner {
                position: absolute;
                inset: 0;
                background: linear-gradient(
                  180deg, 
                  transparent 0%, 
                  rgba(255, 255, 255, 0.05) 45%, 
                  var(--agent-color, #c084fc) 50%, 
                  rgba(255, 255, 255, 0.05) 55%, 
                  transparent 100%
                );
                height: 10%;
                opacity: 0.35;
                animation: scanner-sweep 5s linear infinite;
                z-index: 2;
                pointer-events: none;
              }

              @keyframes scanner-sweep {
                0% { top: -10%; }
                100% { top: 110%; }
              }

              .shield-energy-ripples {
                position: absolute;
                inset: 0;
                background: 
                  radial-gradient(circle at 30% 20%, rgba(139, 92, 246, 0.08) 0%, transparent 40%),
                  radial-gradient(circle at 70% 80%, rgba(236, 72, 153, 0.08) 0%, transparent 40%),
                  radial-gradient(circle at 50% 50%, rgba(192, 132, 252, 0.03) 0%, transparent 60%);
                animation: energy-pulse 6s ease-in-out infinite alternate;
                z-index: 1;
              }

              @keyframes energy-pulse {
                0% { opacity: 0.7; transform: scale(1); }
                100% { opacity: 1; transform: scale(1.05); }
              }

              /* Center reactor portal key */
              .shield-center-core {
                position: relative;
                width: 140px;
                height: 140px;
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 5;
              }

              .core-orbit {
                position: absolute;
                border-radius: 50%;
                border: 1px solid rgba(255, 255, 255, 0.08);
              }

              .core-orbit.ring-1 {
                width: 130px;
                height: 130px;
                border-color: rgba(255, 255, 255, 0.05);
                border-top: 1.5px dashed var(--agent-color, #c084fc);
                animation: spin-slow 12s linear infinite;
              }

              .core-orbit.ring-2 {
                width: 100px;
                height: 100px;
                border-color: rgba(255, 255, 255, 0.05);
                border-bottom: 2px solid var(--agent-color, #c084fc);
                animation: spin-reverse 8s linear infinite;
              }

              .core-orbit.ring-3 {
                width: 70px;
                height: 70px;
                border-color: rgba(255, 255, 255, 0.05);
                border-left: 1.5px dashed rgba(255, 255, 255, 0.2);
                animation: spin-slow 6s linear infinite;
              }

              .core-power-node {
                position: relative;
                width: 40px;
                height: 40px;
                border-radius: 50%;
                background: radial-gradient(circle, var(--agent-color, #c084fc) 20%, #0c0c16 80%);
                border: 1.5px solid var(--agent-color, #c084fc);
                box-shadow: 
                  0 0 20px var(--agent-shadow, rgba(192, 132, 252, 0.45)),
                  inset 0 0 10px var(--agent-color, #c084fc);
                animation: core-glow 2s infinite alternate ease-in-out;
              }

              @keyframes core-glow {
                0% { transform: scale(0.9); opacity: 0.7; box-shadow: 0 0 10px var(--agent-shadow, rgba(192, 132, 252, 0.25)), inset 0 0 5px var(--agent-color, #c084fc); }
                100% { transform: scale(1.05); opacity: 1; box-shadow: 0 0 25px var(--agent-shadow, rgba(192, 132, 252, 0.55)), inset 0 0 12px var(--agent-color, #c084fc); }
              }

              .core-lock-status {
                position: absolute;
                bottom: -25px;
                font-family: var(--font-mono, monospace);
                font-size: 0.52rem;
                font-weight: 700;
                color: #e4e4e7;
                letter-spacing: 0.1em;
                background: rgba(0, 0, 0, 0.6);
                padding: 2px 8px;
                border-radius: 4px;
                border: 1px solid rgba(255, 255, 255, 0.05);
                white-space: nowrap;
                box-shadow: 0 2px 10px rgba(0,0,0,0.5);
              }

              /* HUD panels left & right */
              .shield-hud-panel {
                position: absolute;
                top: 50%;
                transform: translateY(-50%);
                background: rgba(5, 5, 8, 0.7);
                border: 1px solid rgba(255, 255, 255, 0.04);
                padding: 10px 14px;
                border-radius: 8px;
                font-family: var(--font-mono, monospace);
                width: 140px;
                display: flex;
                flex-direction: column;
                gap: 4px;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
                z-index: 4;
              }

              .shield-hud-panel.panel-left {
                left: 20px;
              }

              .shield-hud-panel.panel-right {
                right: 20px;
              }

              .hud-header {
                font-size: 0.54rem;
                color: var(--agent-color, #c084fc);
                font-weight: 700;
                letter-spacing: 0.05em;
                margin-bottom: 2px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.08);
                padding-bottom: 2px;
              }

              .hud-metric-row {
                display: flex;
                justify-content: space-between;
                font-size: 0.48rem;
                letter-spacing: 0.02em;
              }

              .metric-label {
                color: #71717a;
              }

              .metric-val {
                color: #a1a1aa;
                font-weight: 700;
              }

              /* HUD Corners */
              .shield-corner {
                position: absolute;
                width: 12px;
                height: 12px;
                border: 1.5px solid rgba(255, 255, 255, 0.15);
                z-index: 3;
                pointer-events: none;
              }
              .shield-corner.top-left { top: 12px; left: 12px; border-right: none; border-bottom: none; }
              .shield-corner.top-right { top: 12px; right: 12px; border-left: none; border-bottom: none; }
              .shield-corner.bottom-left { bottom: 12px; left: 12px; border-right: none; border-top: none; }
              .shield-corner.bottom-right { bottom: 12px; right: 12px; border-left: none; border-top: none; }


              /* Sirens / Warning beacons and Screen shake */
              .quantum-capsule.capsule-active {
                border-color: var(--agent-color, #c084fc);
                box-shadow: inset 0 0 25px rgba(0, 0, 0, 0.9), 0 0 15px var(--agent-shadow, rgba(192, 132, 252, 0.25));
                animation: capsule-alert 1.5s infinite alternate ease-in-out;
              }

              @keyframes capsule-alert {
                0% { border-color: rgba(255, 255, 255, 0.05); }
                100% { border-color: var(--agent-color, #c084fc); }
              }

              .capsule-warning-beacon {
                position: absolute;
                top: 8px;
                right: 12px;
                display: flex;
                align-items: center;
                gap: 5px;
                font-family: var(--font-mono, monospace);
                font-size: 0.52rem;
                font-weight: 700;
                color: #f59e0b;
                z-index: 15;
                background: rgba(0,0,0,0.7);
                padding: 2px 6px;
                border-radius: 4px;
                border: 1px solid rgba(245, 158, 11, 0.3);
                opacity: 0;
                transition: opacity 0.3s;
              }

              .quantum-capsule.capsule-active .capsule-warning-beacon {
                opacity: 1;
              }

              .beacon-dot {
                width: 6px;
                height: 6px;
                border-radius: 50%;
                background: #f59e0b;
                box-shadow: 0 0 8px #f59e0b;
                animation: beacon-blink 0.5s infinite alternate steps(2);
              }

              @keyframes beacon-blink {
                0% { opacity: 0.2; }
                100% { opacity: 1; }
              }

              /* Shake impact */
              .capsule-shudder {
                animation: slam-shake 0.35s cubic-bezier(.36,.07,.19,.97) both;
                transform: translate3d(0, 0, 0);
              }

              @keyframes slam-shake {
                10%, 90% { transform: translate3d(-1.5px, 0, 0); }
                20%, 80% { transform: translate3d(3px, 0, 0); }
                30%, 50%, 70% { transform: translate3d(-4.5px, 0, 0); }
                40%, 60% { transform: translate3d(4.5px, 0, 0); }
              }

              /* HUD Terminal logs */
              .hud-terminal-console {
                flex: 1;
                background: rgba(0, 0, 0, 0.45);
                border: 1px solid rgba(255, 255, 255, 0.05);
                border-radius: 8px;
                padding: 0.5rem 0.75rem;
                margin: 0.4rem 0;
                font-family: var(--font-mono, 'JetBrains Mono', monospace);
                font-size: 0.68rem;
                color: #22c55e;
                overflow-y: auto;
                line-height: 1.4;
                text-shadow: 0 0 4px rgba(34, 197, 94, 0.2);
                position: relative;
              }

              .hud-console-cursor {
                display: inline-block;
                width: 6px;
                height: 10px;
                background: #22c55e;
                margin-left: 2px;
                animation: cursor-blink 0.8s steps(2) infinite;
              }

              @keyframes cursor-blink {
                0%, 100% { opacity: 0; }
                50% { opacity: 1; }
              }

              .hud-footer-row {
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 1rem;
              }

              /* Quantum Waveform Frequency Visualizer */
              .quantum-waves {
                display: flex;
                align-items: flex-end;
                gap: 2px;
                height: 16px;
              }

              .quantum-wave-bar {
                width: 2px;
                height: 100%;
                background: var(--agent-color, #c084fc);
                border-radius: 1px;
                animation: wave-bounce 0.8s ease-in-out infinite alternate;
              }

              .quantum-wave-bar:nth-child(2) { animation-delay: 0.15s; animation-duration: 0.6s; }
              .quantum-wave-bar:nth-child(3) { animation-delay: 0.3s; animation-duration: 1s; }
              .quantum-wave-bar:nth-child(4) { animation-delay: 0.05s; animation-duration: 0.7s; }
              .quantum-wave-bar:nth-child(5) { animation-delay: 0.25s; animation-duration: 0.9s; }
              .quantum-wave-bar:nth-child(6) { animation-delay: 0.1s; animation-duration: 0.5s; }
              .quantum-wave-bar:nth-child(7) { animation-delay: 0.4s; animation-duration: 0.8s; }

              @keyframes wave-bounce {
                0% { height: 2px; }
                100% { height: 16px; }
              }

              /* Dynamic Pipeline Nodes */
              .quantum-pipeline {
                display: flex;
                gap: 0.5rem;
              }

              .pipeline-step {
                display: flex;
                align-items: center;
                gap: 0.25rem;
                font-size: 0.55rem;
                font-weight: 700;
                letter-spacing: 0.05em;
                color: #71717a;
                text-transform: uppercase;
              }

              .pipeline-indicator {
                width: 6px;
                height: 6px;
                border-radius: 50%;
                background: #27272a;
                border: 1px solid rgba(255, 255, 255, 0.04);
                transition: all 0.3s;
              }

              .pipeline-step.completed {
                color: #10b981;
              }
              .pipeline-step.completed .pipeline-indicator {
                background: #10b981;
                box-shadow: 0 0 6px rgba(16, 185, 129, 0.6);
              }

              .pipeline-step.active {
                color: var(--agent-color, #c084fc);
              }
              .pipeline-step.active .pipeline-indicator {
                background: var(--agent-color, #c084fc);
                box-shadow: 0 0 8px var(--agent-shadow, rgba(192, 132, 252, 0.6));
                animation: cyber-pulse-purple 1.5s infinite ease-in-out;
              }

              /* Hover Tooltip/Detail Card for Dock Items */
              .dock-tooltip {
                position: absolute;
                bottom: 45px;
                left: 50%;
                transform: translateX(-50%) translateY(10px);
                background: rgba(10, 10, 15, 0.95);
                border: 1px solid rgba(255, 255, 255, 0.1);
                box-shadow: 0 8px 30px rgba(0, 0, 0, 0.6), 0 0 15px rgba(167, 139, 250, 0.1);
                border-radius: 10px;
                padding: 0.5rem 0.75rem;
                width: 170px;
                text-align: center;
                pointer-events: none;
                opacity: 0;
                transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.2);
                z-index: 20;
                backdrop-filter: blur(8px);
              }

              .quantum-dock-item:hover .dock-tooltip {
                opacity: 1;
                transform: translateX(-50%) translateY(0);
              }

              .tooltip-title {
                font-family: var(--font-display, 'Outfit', sans-serif);
                font-size: 0.68rem;
                font-weight: 800;
                color: #ffffff;
                text-transform: uppercase;
                margin-bottom: 0.15rem;
              }

              .tooltip-desc {
                font-size: 0.58rem;
                color: #a1a1aa;
                line-height: 1.3;
              }

              /* Responsive tweaks for Quantum Deck */
              @media (max-width: 640px) {
                .quantum-deck-container {
                  min-height: 320px;
                  padding: 1rem;
                }
                .quantum-active-hud {
                  flex-direction: column;
                  gap: 1rem;
                  height: auto;
                }
                .hud-viewport-panel {
                  flex: 0 0 90px;
                  width: 90px;
                  height: 90px;
                }
                .hud-metrics-panel {
                  height: auto;
                  width: 100%;
                  gap: 0.5rem;
                }
                .hud-terminal-console {
                  min-height: 50px;
                }
                .quantum-console-dock {
                  flex-wrap: wrap;
                  justify-content: center;
                  gap: 0.4rem;
                }
              }
            `}</style>

            {/* Quantum mechanical capsule interface */}
            <div className={`quantum-capsule ${isShaking ? 'capsule-shudder' : ''} ${isExecuting ? 'capsule-active' : ''}`} style={{
              '--agent-color': displayAgentDetails?.color || 'rgba(167, 139, 250, 0.5)',
              '--agent-shadow': (displayAgentDetails?.secondaryColor || '#a855f7') + '40'
            } as any}>
              
              {/* Flashing Warning Beacon */}
              <div className="capsule-warning-beacon">
                <span className="beacon-dot" />
                <span>FLEET_ACTIVE</span>
              </div>

              {/* Inner Chamber */}
              <div className="capsule-chamber">
                {displayAgentDetails ? (
                  <div className="chamber-content">
                    <div className="chamber-left">
                      <div className="chamber-viewport">
                        {/* Concentric spinning diagnostic reticles */}
                        <div className="hud-reticle-circle ring-slow" />
                        <div className="hud-reticle-circle ring-fast" />
                        <div className="hud-reticle-corners" />

                        <img 
                          src={displayAgentDetails.image} 
                          alt={displayAgentDetails.title} 
                          className="chamber-avatar hologram-glow" 
                        />
                        <div className="hud-overlay-scanner" />
                      </div>
                    </div>
                    <div className="chamber-right">
                      <div className="chamber-metrics-header">
                        <div className="chamber-agent-title">
                          <span>{displayAgentDetails.icon}</span>
                          <span>{displayAgentDetails.title}</span>
                        </div>
                        <div className="chamber-agent-tagline">{displayAgentDetails.tagline}</div>
                      </div>
                      <div className="chamber-description">
                        {displayAgentDetails.description}
                      </div>

                      {/* Depicted Capabilities section */}
                      <div className="chamber-depicts-container">
                        <div className="depicts-title">Depicted Capabilities //</div>
                        <div className="depicts-grid">
                          {displayAgentDetails.depicts.map((dep, idx) => (
                            <div key={idx} className="depicts-badge">
                              <span className="depicts-badge-dot" />
                              <span>{dep}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  // Idle core inside chamber when closed or waiting
                  <div className="quantum-idle-chamber">
                    <div className="quantum-core-reactor">
                      <div className="quantum-reactor-ring ring-1" />
                      <div className="quantum-reactor-ring ring-2" />
                      <div className="quantum-reactor-ring ring-3" />
                      <div className="quantum-reactor-orb" />
                    </div>
                    <div className="quantum-idle-text">
                      <div className="quantum-idle-title">Zenith OS Operational</div>
                      <div className="quantum-idle-subtitle">Chamber locked · Awaiting dispatch command</div>
                    </div>
                  </div>
                )}
              </div>

              {/* Quantum Stasis Force Field Overlay */}
              <div className={`stasis-force-field ${doorsOpen ? 'dissolved' : 'active'} ${isShaking ? 'shield-shockwave' : ''}`}>
                <div className="shield-grid" />
                <div className="shield-scanner" />
                <div className="shield-energy-ripples" />
                
                <div className="shield-corner top-left" />
                <div className="shield-corner top-right" />
                <div className="shield-corner bottom-left" />
                <div className="shield-corner bottom-right" />
                
                <div className="shield-center-core">
                  <div className="core-orbit ring-1" />
                  <div className="core-orbit ring-2" />
                  <div className="core-orbit ring-3" />
                  <div className="core-power-node" />
                  <div className="core-lock-status">STASIS // SECURED</div>
                </div>

                <div className="shield-hud-panel panel-left">
                  <div className="hud-header">SYS_CONTAINMENT //</div>
                  <div className="hud-metric-row">
                    <span className="metric-label">TEMP:</span>
                    <span className="metric-val">0.04 K</span>
                  </div>
                  <div className="hud-metric-row">
                    <span className="metric-label">SHLD:</span>
                    <span className="metric-val">100%</span>
                  </div>
                  <div className="hud-metric-row">
                    <span className="metric-label">PRSS:</span>
                    <span className="metric-val">0.00 kPa</span>
                  </div>
                </div>

                <div className="shield-hud-panel panel-right">
                  <div className="hud-header">QUANTUM_DECK //</div>
                  <div className="hud-metric-row">
                    <span className="metric-label">VOLT:</span>
                    <span className="metric-val">NOMINAL</span>
                  </div>
                  <div className="hud-metric-row">
                    <span className="metric-label">SYNC:</span>
                    <span className="metric-val">STABLE</span>
                  </div>
                  <div className="hud-metric-row">
                    <span className="metric-label">GRID:</span>
                    <span className="metric-val">SECURE</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Terminal monitor area, always visible below capsule to trace agent work logs */}
            <div className="quantum-monitor-row" style={{
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
              margin: '1rem 0 0.5rem 0',
              '--agent-color': activeDetails.color,
              '--agent-shadow': activeDetails.secondaryColor + '40'
            } as any}>
              <div className="hud-terminal-console" style={{ width: '100%', minHeight: '60px', margin: 0 }}>
                <span style={{ color: '#71717a' }}>&gt;_ [SYS_PROMPT]:</span> {agentStatus}
                <span className="hud-console-cursor" />
              </div>

              <div className="hud-footer-row" style={{ width: '100%', marginTop: '0.2rem' }}>
                {/* Pulsing Quantum Waveform */}
                <div className="quantum-waves">
                  <div className="quantum-wave-bar" style={{ animationPlayState: isExecuting ? 'running' : 'paused' }} />
                  <div className="quantum-wave-bar" style={{ animationPlayState: isExecuting ? 'running' : 'paused' }} />
                  <div className="quantum-wave-bar" style={{ animationPlayState: isExecuting ? 'running' : 'paused' }} />
                  <div className="quantum-wave-bar" style={{ animationPlayState: isExecuting ? 'running' : 'paused' }} />
                  <div className="quantum-wave-bar" style={{ animationPlayState: isExecuting ? 'running' : 'paused' }} />
                  <div className="quantum-wave-bar" style={{ animationPlayState: isExecuting ? 'running' : 'paused' }} />
                  <div className="quantum-wave-bar" style={{ animationPlayState: isExecuting ? 'running' : 'paused' }} />
                </div>

                {/* Step Pipeline Progress */}
                <div className="quantum-pipeline">
                  {pipelineSteps.map(step => (
                    <div key={step.id} className={`pipeline-step ${step.status}`}>
                      <div className="pipeline-indicator" />
                      <span>{step.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Bottom Dock showing all agents always (clickable/hoverable) */}
            <div className="quantum-console-dock">
              {Object.entries(AGENT_DETAILS).map(([key, value]) => {
                const isThisAgentActive = activeAgent === key;
                return (
                  <button
                    key={key}
                    onClick={() => {
                      // Pre-populate input when clicking an idle agent icon to guide user
                      if (!isExecuting) {
                        const inputPlaceholderMap: Record<string, string> = {
                          ORCHESTRATOR: 'Draft a project summary plan',
                          SEARCH: 'Search the web for the latest tech trends in AI',
                          DOCS: 'Analyze file forensic_audit_report.md and extract key details',
                          DATA: 'Run analysis on task statistics',
                          COMMS: 'Check my workspace email inbox and summarize unread mail',
                          SCHEDULER: 'Find a time slot and schedule a meeting with team next week',
                          DRIVE: 'Show my latest files in Google Drive',
                          CODING: 'Create a typescript utility to format currency values',
                          QA: 'Run audit checks on the workspace code changes',
                          PLANNER: 'Break down my goal to build a portfolio website into tasks',
                          MONITOR: 'Run a full risk check on all my overdue and today tasks',
                          GHOST_DETECTOR: 'Scan my inbox for any hidden deadlines I missed',
                          EXECUTOR: 'Send a status update email to my team, block 2h focus time and create a follow-up task',
                        };
                        setCommandInput(inputPlaceholderMap[key] || '');
                        toast.info(`Configured input for ${key} Agent`);
                      }
                    }}
                    className="quantum-dock-item"
                    style={{
                      '--hover-color': value.color,
                      '--hover-shadow': value.secondaryColor + '60',
                      border: isThisAgentActive ? `2px solid ${value.color}` : undefined,
                      transform: isThisAgentActive ? 'scale(1.2) translateY(-2px)' : undefined,
                      boxShadow: isThisAgentActive ? `0 0 15px ${value.color}` : undefined,
                      zIndex: isThisAgentActive ? 10 : undefined,
                    } as any}
                  >
                    <img 
                      src={value.image} 
                      alt={value.title} 
                      className="quantum-dock-img"
                      style={{
                        filter: isThisAgentActive || !isExecuting ? 'grayscale(0) opacity(1)' : undefined
                      }}
                    />
                    
                    {/* Tooltip on hover */}
                    <div className="dock-tooltip">
                      <div className="tooltip-title" style={{ color: value.color }}>{key}</div>
                      <div className="tooltip-desc">{value.description}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
            
            {/* Mission Report Backdrop & Overlay in Portal */}
            {typeof window !== 'undefined' && typeof document !== 'undefined' && createPortal(
              <>
                {/* Mission Report Backdrop */}
                <AnimatePresence>
                  {agentResult && (
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="mission-backdrop"
                      onClick={() => setAgentResult(null)}
                    />
                  )}
                </AnimatePresence>

                {/* Mission Report Overlay */}
                <AnimatePresence>
                  {agentResult && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, x: "-50%", y: "-50%" }}
                      animate={{ opacity: 1, scale: 1, x: "-50%", y: "-50%" }}
                      exit={{ opacity: 0, scale: 0.95, x: "-50%", y: "-50%" }}
                      className={`mission-report-overlay ${isReportExpanded ? 'expanded' : ''}`}
                    >
                      <div className="mission-report-header">
                        <div className="mission-report-title">
                          <BrainCircuit size={18} className="text-purple-400" />
                          <span>Mission Report</span>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button className="mission-report-action" onClick={() => setIsReportExpanded(!isReportExpanded)} title={isReportExpanded ? "Collapse" : "Expand"}>
                            <Zap size={16} />
                          </button>
                          <button className="mission-report-action" onClick={() => setAgentResult(null)}>
                            <X size={16} />
                          </button>
                        </div>
                      </div>
                      <div className="mission-report-content markdown-body" data-lenis-prevent="true">
                        {missionComplete && (
                          <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '1.25rem', borderRadius: '12px', marginBottom: '1.5rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#10b981', fontWeight: 700, fontSize: '1.1rem', marginBottom: '0.5rem' }}>
                              <Check size={20} /> MISSION COMPLETE
                            </div>
                          </div>
                        )}
                        {/* Full agent result rendered as rich markdown */}
                        {agentResult && (
                          <div style={{ color: '#e4e4e7', fontSize: '0.92rem', lineHeight: 1.7, marginBottom: '1.5rem' }}>
                            <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{agentResult}</ReactMarkdown>
                          </div>
                        )}
                        {(() => {
                          const { meetLinks, docLinks } = parseMissionActions(agentResult || '');
                          if (meetLinks.length === 0 && docLinks.length === 0) return null;
                          return (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.5rem' }}>
                              {meetLinks.map(link => (
                                <a key={link} href={link} target="_blank" rel="noopener noreferrer" 
                                   style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.6rem 1rem', background: '#2563eb', color: 'white', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600, textDecoration: 'none', transition: 'all 0.2s', boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)' }}>
                                  <Video size={16} /> Join Meeting
                                </a>
                              ))}
                              {docLinks.map(link => (
                                <a key={link} href={link} target="_blank" rel="noopener noreferrer" 
                                   style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.6rem 1rem', background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600, textDecoration: 'none', transition: 'all 0.2s' }}>
                                  <FileText size={16} /> Open Document
                                </a>
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                      <div className="mission-report-footer">
                        <input
                          type="text"
                          value={commandInput}
                          onChange={e => setCommandInput(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') handleExecuteCommand(); }}
                          disabled={isExecuting}
                          placeholder="Assign a follow-up task..."
                          className="agent-command-input focus:outline-none focus:ring-0"
                        />
                        <button 
                          className="execute-command-btn" 
                          onClick={handleExecuteCommand}
                          disabled={isExecuting || !commandInput.trim()}
                        >
                          {isExecuting ? <Loader2 size={16} className="spin" /> : <Send size={16} />}
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </>,
              document.body
            )}


          
          <div className="status-bar" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '1.2rem', background: 'rgba(5, 5, 10, 0.6)' }}>
            {/* Status row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div className="status-text" style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span className={`status-dot ${isExecuting ? 'pulsing' : ''}`} style={{ background: isExecuting ? '#a855f7' : '#ef4444' }}></span>
                {agentStatus}
              </div>
              {/* Agent quick-fire buttons */}
              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent('agent-shortcut', {
                    detail: { prompt: 'Run a full MONITOR risk assessment: score all overdue and high-priority tasks, check my calendar for conflicts, send me a notification with the top 3 critical items.' }
                  }))}
                  disabled={isExecuting}
                  title="MONITOR — Run Risk Assessment"
                  style={{
                    background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)',
                    borderRadius: '8px', padding: '0.3rem 0.6rem', color: '#f87171',
                    fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: '0.3rem',
                    opacity: isExecuting ? 0.4 : 1, transition: 'all 0.2s'
                  }}
                >
                  <span>🛡️</span> Risk
                </button>
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent('agent-shortcut', {
                    detail: { prompt: 'GHOST DEADLINE DISCOVERY: Scan my Gmail inbox for any hidden deadlines, commitments, or tasks I may have missed. Look for phrases like "by Friday", "due date", "ASAP", "please submit". Create a ZenTrack task for each ghost deadline you find.' }
                  }))}
                  disabled={isExecuting}
                  title="GHOST DETECTOR — Scan Inbox for Hidden Deadlines"
                  style={{
                    background: 'rgba(6,182,212,0.12)', border: '1px solid rgba(6,182,212,0.3)',
                    borderRadius: '8px', padding: '0.3rem 0.6rem', color: '#22d3ee',
                    fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: '0.3rem',
                    opacity: isExecuting ? 0.4 : 1, transition: 'all 0.2s'
                  }}
                >
                  <span>👻</span> Ghost
                </button>
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent('agent-shortcut', {
                    detail: { prompt: 'Generate a Python script that exports all my current ZenTrack tasks to a CSV file with columns: title, priority, status, due_date. Include sample data in comments and instructions to run.' }
                  }))}
                  disabled={isExecuting}
                  title="CODING Agent — Generate Script"
                  style={{
                    background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.3)',
                    borderRadius: '8px', padding: '0.3rem 0.6rem', color: '#34d399',
                    fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: '0.3rem',
                    opacity: isExecuting ? 0.4 : 1, transition: 'all 0.2s'
                  }}
                >
                  <span>⚙️</span> Script
                </button>
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent('agent-terminal-toggle'))}
                  title="Toggle Agent Terminal Log"
                  style={{
                    background: 'rgba(168,85,247,0.12)', border: '1px solid rgba(168,85,247,0.25)',
                    borderRadius: '8px', padding: '0.3rem 0.5rem', color: '#a78bfa',
                    fontSize: '0.72rem', cursor: 'pointer', display: 'flex', alignItems: 'center',
                    transition: 'all 0.2s'
                  }}
                >
                  <span style={{ fontFamily: 'monospace' }}>&gt;_</span>
                </button>
              </div>
            </div>

            <div className="command-bar-container" style={{ position: 'relative' }}>
              <AnimatePresence>
                {isListening && (
                  <motion.div
                    initial={{ opacity: 0, y: 14, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 14, scale: 0.97 }}
                    transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                    style={{
                      position: 'absolute',
                      bottom: 'calc(100% + 12px)',
                      left: 0,
                      right: 0,
                      background: silencePercent > 80
                        ? 'rgba(16, 185, 129, 0.95)'
                        : 'rgba(109, 40, 217, 0.96)',
                      backdropFilter: 'blur(12px)',
                      padding: '0.75rem 1rem',
                      borderRadius: '14px',
                      color: '#fff',
                      fontSize: '0.88rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      boxShadow: silencePercent > 80
                        ? '0 4px 24px rgba(16,185,129,0.45)'
                        : '0 4px 24px rgba(139, 92, 246, 0.45)',
                      zIndex: 20,
                      pointerEvents: 'none',
                      border: '1px solid rgba(255,255,255,0.18)',
                      transition: 'background 0.3s ease, box-shadow 0.3s ease',
                    }}
                  >
                    {/* Silence countdown ring */}
                    <div style={{ position: 'relative', width: 28, height: 28, flexShrink: 0 }}>
                      <svg width="28" height="28" viewBox="0 0 28 28" style={{ transform: 'rotate(-90deg)' }}>
                        <circle cx="14" cy="14" r="11" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2.5" />
                        <circle
                          cx="14" cy="14" r="11"
                          fill="none"
                          stroke={silencePercent > 80 ? '#6ee7b7' : '#c4b5fd'}
                          strokeWidth="2.5"
                          strokeDasharray={`${2 * Math.PI * 11}`}
                          strokeDashoffset={`${2 * Math.PI * 11 * (1 - silencePercent / 100)}`}
                          strokeLinecap="round"
                          style={{ transition: 'stroke-dashoffset 0.05s linear, stroke 0.3s ease' }}
                        />
                      </svg>
                      {/* Mic pulse dot in center */}
                      <div style={{
                        position: 'absolute', top: '50%', left: '50%',
                        transform: 'translate(-50%,-50%)',
                        width: 8, height: 8, borderRadius: '50%',
                        background: silencePercent > 80 ? '#10b981' : '#a78bfa',
                        animation: silencePercent > 0 && silencePercent < 80 ? 'none' : 'pulse 0.8s infinite alternate',
                        transition: 'background 0.3s ease',
                      }} />
                    </div>

                    {/* Live voice bars */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                      {[0.4, 0.7, 1, 0.65, 0.45].map((h, i) => (
                        <div key={i} style={{
                          width: 3,
                          borderRadius: 2,
                          background: 'rgba(255,255,255,0.7)',
                          height: silencePercent > 5 ? `${4 + h * 10}px` : '4px',
                          animation: silencePercent > 5 && silencePercent < 80
                            ? `voiceBar ${0.4 + i * 0.12}s ease-in-out infinite alternate`
                            : 'none',
                          transition: 'height 0.2s ease',
                        }} />
                      ))}
                    </div>

                    {/* Transcript text */}
                    <span style={{ fontStyle: 'italic', flex: 1, lineHeight: 1.4, fontSize: '0.86rem' }}>
                      {silencePercent > 80
                        ? '⚡ Sending to agents...'
                        : interimTranscript
                          ? `"${commandInput ? commandInput + ' ' : ''}${interimTranscript}"`
                          : commandInput
                          ? `"${commandInput}" ✓`
                          : 'Listening... speak naturally'
                      }
                    </span>

                    {/* Hint text */}
                    {silencePercent > 0 && silencePercent <= 80 && (
                      <span style={{ fontSize: '0.72rem', opacity: 0.7, flexShrink: 0 }}>
                        sending in {((1 - silencePercent / 100) * 1.8).toFixed(1)}s
                      </span>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Always-listening visual pulse ring around mic when active */}
              {isListening && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  style={{
                    position: 'absolute',
                    right: 44,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: 40, height: 40,
                    borderRadius: '50%',
                    border: `2px solid ${silencePercent > 80 ? '#10b981' : '#a78bfa'}`,
                    animation: 'ping 1.5s cubic-bezier(0,0,0.2,1) infinite',
                    pointerEvents: 'none',
                    zIndex: 5,
                  }}
                />
              )}

              <input
                type="text"
                value={commandInput}
                onChange={e => setCommandInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleExecuteCommand(); }}
                disabled={isExecuting}
                placeholder={isListening
                  ? 'Listening... speak naturally, I\'ll auto-send when you stop'
                  : "Assign a task to the Fleet... e.g. 'Read my latest emails and summarize'"}
                className="agent-command-input focus:outline-none focus:ring-0 focus:border-transparent"
                style={{ borderColor: isListening ? (silencePercent > 80 ? '#10b981' : '#a78bfa') : undefined, transition: 'border-color 0.3s ease' }}
              />
              <div className="command-bar-actions">
                {/* Mic button with active state ring */}
                <div style={{ position: 'relative' }}>
                  <button
                    className={`voice-command-btn ${isListening ? 'listening' : ''}`}
                    onClick={toggleListening}
                    disabled={isExecuting}
                    title={isListening ? 'Stop & submit what you said' : 'Start voice command (auto-sends after 1.8s silence)'}
                    style={{
                      background: isListening
                        ? silencePercent > 80 ? 'rgba(16,185,129,0.25)' : 'rgba(139,92,246,0.25)'
                        : undefined,
                      boxShadow: isListening
                        ? `0 0 0 2px ${silencePercent > 80 ? '#10b981' : '#a78bfa'}`
                        : undefined,
                      transition: 'all 0.3s ease',
                    }}
                  >
                    {isListening ? <MicOff size={16} /> : <Mic size={16} />}
                  </button>
                </div>
                <button
                  className="execute-command-btn"
                  onClick={handleExecuteCommand}
                  disabled={isExecuting || !commandInput.trim()}
                >
                  {isExecuting ? <Loader2 size={16} className="spin" /> : <Send size={16} />}
                </button>
              </div>
            </div>
          </div>
          
          <div className="bottom-indicator"></div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="right-column">
          
          {/* URGENCY MATRIX */}
          <div className="urgency-matrix">
            <h3 className="section-label">URGENCY MATRIX</h3>
            
            {matrixTasks.length === 0 ? (
               <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                 No urgent tasks pending.
               </div>
            ) : (
              matrixTasks.map(task => {
                const uLevel = getUrgencyLevel(task.date);
                const isImmediate = uLevel === 'overdue' || uLevel === 'critical' || task.priority === 'high';
                return (
                  <div key={task.id} className={`urgency-card ${isImmediate ? 'immediate' : 'flow'}`}>
                    <div className="urgency-header">
                      <span className={`urgency-type ${isImmediate ? 'immediate-text' : 'flow-text'}`}>
                        {isImmediate ? 'IMMEDIATE' : 'FLOW'}
                      </span>
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
              <div className="bandwidth-text">Daily Bandwidth Capacity: {bandwidthPercent}%</div>
            </div>
          </div>
        </div>

      </div>

      {/* BOTTOM ROW 1 - Fleet Telemetry */}
      <div className="bottom-row">
        <div className="roi-card">
          <div className="roi-ring-container" style={{ position: 'relative' }}>
            <svg viewBox="0 0 36 36" className="circular-chart">
              <path className="circle-bg"
                d="M18 2.0845
                  a 15.9155 15.9155 0 0 1 0 31.831
                  a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              <path className="circle"
                strokeDasharray={`${bandwidthPercent}, 100`}
                d="M18 2.0845
                  a 15.9155 15.9155 0 0 1 0 31.831
                  a 15.9155 15.9155 0 0 1 0 -31.831"
              />
            </svg>
            <div className="ring-text" style={{ fontSize: '0.75rem', marginTop: '2px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f0f0f3', lineHeight: 1 }}>{bandwidthPercent}%</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.45rem', letterSpacing: '0.15em', marginTop: '2px' }}>CAPACITY</div>
            </div>
          </div>
          
          <div className="roi-content">
            <h3 className="section-label">FLEET TELEMETRY & SYSTEM HEALTH</h3>
            {urgencyState === 'state-critical' ? (
                <div className="roi-status" style={{color: '#ef4444'}}>Threat Level: <span style={{color: '#ef4444'}}>CRITICAL</span></div>
            ) : urgencyState === 'state-active' ? (
                <div className="roi-status" style={{color: '#f97316'}}>System State: <span style={{color: '#f97316'}}>ELEVATED</span></div>
            ) : (
                <div className="roi-status">System State: <span className="highlight-green">OPTIMAL</span></div>
            )}
            
            <div className="roi-stats" style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
              <span className="stat-pill" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', border: getKeyStatus().hasPersonalKey ? '1px solid rgba(0,191,165,0.3)' : '1px solid rgba(255,255,255,0.1)' }}>
                <BrainCircuit size={13} style={{ color: getKeyStatus().hasPersonalKey ? '#00BFA5' : '#a1a1aa' }} />
                {getKeyStatus().hasPersonalKey ? 'Pro Neural Link' : 'Shared API Pool'}
              </span>
              <span className="stat-pill" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Activity size={13} style={{ color: '#8b5cf6' }} />
                {completedTodayCount} Operations Executed
              </span>
              <span className="stat-pill" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Zap size={13} style={{ color: '#eab308' }} />
                +{hoursSaved}h Deep Focus
              </span>
            </div>

            {/* ── Autonomous Quick-Fire Agent Buttons ── */}
            <div style={{ display: 'flex', gap: '0.6rem', marginTop: '1rem', flexWrap: 'wrap' }}>
              <motion.button
                whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                onClick={handleGhostDetector}
                disabled={isExecuting}
                title="Scan inbox for hidden deadlines"
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.4rem',
                  background: 'linear-gradient(135deg, rgba(139,92,246,0.2), rgba(124,58,237,0.1))',
                  border: '1px solid rgba(139,92,246,0.4)', borderRadius: '8px',
                  padding: '0.45rem 0.9rem', color: '#c4b5fd', fontSize: '0.72rem',
                  fontWeight: 700, cursor: isExecuting ? 'not-allowed' : 'pointer',
                  letterSpacing: '0.04em', opacity: isExecuting ? 0.5 : 1,
                  transition: 'all 0.2s', backdropFilter: 'blur(4px)'
                }}
              >
                <Search size={12} /> 👻 Scan Ghost Deadlines
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                onClick={handleMonitorRisk}
                disabled={isExecuting}
                title="Run full risk assessment on all tasks"
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.4rem',
                  background: 'linear-gradient(135deg, rgba(239,68,68,0.2), rgba(220,38,38,0.1))',
                  border: '1px solid rgba(239,68,68,0.4)', borderRadius: '8px',
                  padding: '0.45rem 0.9rem', color: '#fca5a5', fontSize: '0.72rem',
                  fontWeight: 700, cursor: isExecuting ? 'not-allowed' : 'pointer',
                  letterSpacing: '0.04em', opacity: isExecuting ? 0.5 : 1,
                  transition: 'all 0.2s', backdropFilter: 'blur(4px)'
                }}
              >
                <AlertTriangle size={12} /> 🚨 Risk Assessment
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                onClick={() => handleExecuteCommand('PLANNER MODE: Help me break down my highest priority task into a clear action plan with milestones, create subtasks in ZenTrack, and block calendar time for the most critical milestone.')}
                disabled={isExecuting}
                title="Strategic project planner"
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.4rem',
                  background: 'linear-gradient(135deg, rgba(245,158,11,0.2), rgba(217,119,6,0.1))',
                  border: '1px solid rgba(245,158,11,0.4)', borderRadius: '8px',
                  padding: '0.45rem 0.9rem', color: '#fde68a', fontSize: '0.72rem',
                  fontWeight: 700, cursor: isExecuting ? 'not-allowed' : 'pointer',
                  letterSpacing: '0.04em', opacity: isExecuting ? 0.5 : 1,
                  transition: 'all 0.2s', backdropFilter: 'blur(4px)'
                }}
              >
                <Map size={12} /> 🗺️ Plan Project
              </motion.button>
            </div>
          </div>
        </div>
      </div>

      {/* BOTTOM ROW 2 - Workspace Integrated */}
      <div className="bottom-row">
        <div className="workspace-card" style={{ padding: isGoogleConnected ? '1.5rem 2rem' : '1.5rem', transition: 'all 0.3s ease' }}>
          
          <div className="app-icons" style={{ gap: '0.75rem', display: 'flex', flexWrap: 'wrap' }}>
            <img src="https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/google-drive.png" alt="Google Drive" width="32" height="32" style={{ filter: isGoogleConnected ? 'none' : 'grayscale(100%) opacity(0.5)', transition: 'all 0.3s' }} />
            <img src="https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/gmail.png" alt="Gmail" width="32" height="32" style={{ filter: isGoogleConnected ? 'none' : 'grayscale(100%) opacity(0.5)', transition: 'all 0.3s' }} />
            <img src="https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/google-calendar.png" alt="Google Calendar" width="32" height="32" style={{ filter: isGoogleConnected ? 'none' : 'grayscale(100%) opacity(0.5)', transition: 'all 0.3s' }} />
            <img src="https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/google-docs.png" alt="Google Docs" width="32" height="32" style={{ filter: isGoogleConnected ? 'none' : 'grayscale(100%) opacity(0.5)', transition: 'all 0.3s' }} />
            <img src="https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/google-sheets.png" alt="Google Sheets" width="32" height="32" style={{ filter: isGoogleConnected ? 'none' : 'grayscale(100%) opacity(0.5)', transition: 'all 0.3s' }} />
            <img src="https://cdn.jsdelivr.net/gh/walkxcode/dashboard-icons/png/google-meet.png" alt="Google Meet" width="32" height="32" style={{ filter: isGoogleConnected ? 'none' : 'grayscale(100%) opacity(0.5)', transition: 'all 0.3s' }} />
          </div>
          
          <div className="workspace-content" style={{ marginLeft: '1rem', flex: 1 }}>
            <h3 className="section-label">GOOGLE WORKSPACE</h3>
            {isGoogleConnected ? (
              <div className="workspace-status" style={{ color: '#2dd4bf', fontWeight: 500 }}>
                Data Synced with AI Fleet
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400, marginTop: '2px' }}>
                  Drive, Mail, Calendar, Docs & More
                </div>
              </div>
            ) : (
              <div className="workspace-status" style={{ fontSize: '0.9rem' }}>Connect to enable automated workflows</div>
            )}
          </div>
          
          {isGoogleConnected ? (
            <>
              <div className="system-time" style={{ marginLeft: 'auto' }}>
                <h3 className="section-label" style={{ textAlign: 'right' }}>SYSTEM TIME</h3>
                <div className="time-display">{time || '00:00:00'}</div>
              </div>
              <button className="confirm-btn" style={{ background: 'rgba(45, 212, 191, 0.2)', color: '#2dd4bf', boxShadow: 'none' }}>
                <Check size={28} />
              </button>
            </>
          ) : (
            <button 
              onClick={handleConnectWorkspace}
              disabled={isConnecting}
              style={{
                marginLeft: 'auto',
                background: 'linear-gradient(135deg, #4285F4, #34A853, #FBBC05, #EA4335)',
                border: 'none',
                padding: '0.75rem 1.5rem',
                borderRadius: '8px',
                color: '#fff',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                boxShadow: '0 4px 15px rgba(66, 133, 244, 0.3)',
                opacity: isConnecting ? 0.7 : 1
              }}
            >
              {isConnecting ? <Loader2 size={18} className="spin" /> : 'Sign in with Google'}
              {!isConnecting && <ArrowRight size={18} />}
            </button>
          )}
          
          {isGoogleConnected && <div className="bottom-indicator"></div>}
        </div>
      </div>
      
    </div>
  );
}
