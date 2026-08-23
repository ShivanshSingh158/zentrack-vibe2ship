import React, { useState, useEffect, useMemo, useRef } from 'react';
import { db } from '../../services/firebase';
import { doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { useGlobalData } from '../../contexts/GlobalDataContext';
import { orchestrateAgent } from '../../agent/orchestrator';
import { tryAcquireLock, releaseLock } from '../../agent/orchestrationLock';
import { getLocalDateString } from '../../utils/dateUtils';
import { calculateAppStreak } from '../../utils/streakUtils';
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
import { motion, AnimatePresence } from 'framer-motion';
import { auth } from '../../services/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { getLevel, LEVEL_TITLES } from '../../services/xpSystem';

// ── Widgets ────────────────────────────────────────────────────────────────────
import { OverviewWidget } from './widgets/OverviewWidget';
import { AgendaWebWidget } from './widgets/AgendaWebWidget';
import { HabitsWebWidget } from './widgets/HabitsWebWidget';
import { WellnessRecallWidget } from './widgets/WellnessRecallWidget';
import { AcademicWebWidget } from './widgets/AcademicWebWidget';

// ── THE PREMIUM SARA INTERFACE ─────────────────────────────────────────────────
import { SaraInterface } from '../../components/SaraInterface';
import { AgentDataStream } from '../../components/AgentDataStream';
import { AgentApprovalToastListener } from '../../components/AgentApprovalToast';
import { AgentHistoryPanel } from '../../components/AgentHistoryPanel';

// ── Motivational quotes ────────────────────────────────────────────────────────
const QUOTES = [
  { text: 'Discipline is choosing between what you want now and what you want most.', author: 'Abraham Lincoln' },
  { text: 'The secret of getting ahead is getting started.', author: 'Mark Twain' },
  { text: 'Focus on being productive instead of busy.', author: 'Tim Ferriss' },
  { text: 'It always seems impossible until it\'s done.', author: 'Nelson Mandela' },
  { text: 'The only way to do great work is to love what you do.', author: 'Steve Jobs' },
  { text: 'Action is the foundational key to all success.', author: 'Pablo Picasso' },
];

function getTimeGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Morning';
  if (h < 17) return 'Afternoon';
  return 'Evening';
}

export function HomeDashboard() {
  const globalData = useGlobalData();
  const { tasks, habits, allHabits, habitLogs, attendanceSubjects, waterLogs, waterGoalMl, xpState, userXP, gymLogs, learningTopics } = globalData;

  const [commandInput, setCommandInput] = useState('');
  const [isExecuting, setIsExecuting] = useState(false);
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [panicActive, setPanicActive] = useState(false);
  const [agentStatus, setAgentStatus] = useState('Pantheon idle. Scrying datastreams...');
  const [saraOpen, setSaraOpen] = useState(false);
  const [userName, setUserName] = useState('');
  const [quoteIdx] = useState(() => Math.floor(Math.random() * QUOTES.length));
  const [timeGreeting, setTimeGreeting] = useState(getTimeGreeting());

  const proactiveReportRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const agentHistory = React.useSyncExternalStore(agentMemoryStore.subscribe, agentMemoryStore.getSnapshot);

  // User display name
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user?.displayName) setUserName(user.displayName.split(' ')[0]);
    });
    return () => unsub();
  }, []);

  // Time greeting refresh
  useEffect(() => {
    const t = setInterval(() => setTimeGreeting(getTimeGreeting()), 60_000);
    return () => clearInterval(t);
  }, []);

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

      const historyForAgent = voiceHistory && voiceHistory.length > 0
        ? voiceHistory
        : agentHistory.map(h => ({ role: (h.role === 'user' ? 'user' : 'model') as 'user' | 'model', text: h.title }));

      const MISSION_TIMEOUT_MS = 3 * 60 * 1000;
      let compositeSignal: AbortSignal;
      const timeoutController = new AbortController();
      const timeoutTimer = setTimeout(() => {
        timeoutController.abort(new Error('Mission timed out after 3 minutes'));
      }, MISSION_TIMEOUT_MS);

      if (typeof AbortSignal.any === 'function') {
        compositeSignal = AbortSignal.any([signal, timeoutController.signal]);
      } else {
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
      const classified = classifyAgentError(err);
      setAgentStatus(`${classified.icon} ${classified.userMessage}`);

      if (classified.actionLabel && classified.actionEvent) {
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

  // ── Dashboard Data ─────────────────────────────────────────────────────────
  const todayStr = getLocalDateString(new Date());
  const nowDate = new Date();

  const { tasksCompleted, tasksTotal, habitsCompleted, waterCompletedMl } = useMemo(() => {
    let done = 0; let total = 0;
    for (const t of tasks) {
      if (t.date === todayStr) { total++; if (t.status === 'completed') done++; }
    }
    const logMap = new Map<string, number>();
    for (const l of habitLogs) {
      if (l.date === todayStr) logMap.set(l.habitId, (logMap.get(l.habitId) || 0) + (l.count ?? 1));
    }
    let hDone = 0;
    for (const h of allHabits) {
      if ((logMap.get(h.id) || 0) >= (h.targetCount || 1)) hDone++;
    }
    let waterMl = 0;
    for (const w of waterLogs || []) {
      if (w.date === todayStr) waterMl += w.amountMl;
    }
    return { tasksCompleted: done, tasksTotal: total, habitsCompleted: hDone, waterCompletedMl: waterMl };
  }, [tasks, allHabits, habitLogs, waterLogs, todayStr]);

  const overallAttendancePct = useMemo(() => {
    if (!attendanceSubjects?.length) return 0;
    const totals = attendanceSubjects.reduce(
      (acc, s) => ({ att: acc.att + (s.classesAttended || 0), tot: acc.tot + (s.classesTotal || 0) }),
      { att: 0, tot: 0 }
    );
    return totals.tot > 0 ? Math.round((totals.att / totals.tot) * 100) : 0;
  }, [attendanceSubjects]);

  const levelInfo = useMemo(() => {
    const state = xpState || getLevel(userXP || 0);
    const nextTitle = LEVEL_TITLES[(state.level ?? 0) + 1] ?? 'Apex';
    return {
      label: state.title ?? 'Seeker',
      xp: state.xp ?? 0,
      nextXP: state.nextThreshold ?? 1000,
      progress: state.progress ?? 0,
      nextLabel: nextTitle,
    };
  }, [xpState, userXP]);

  const appStreak = useMemo(() => {
    return calculateAppStreak(tasks, gymLogs, habitLogs, learningTopics);
  }, [tasks, gymLogs, habitLogs, learningTopics]);

  const [bannerMsg, setBannerMsg] = useState('');
  const [bannerVisible, setBannerVisible] = useState(false);
  useEffect(() => {
    const handler = (e: Event) => {
      const msg = (e as CustomEvent).detail?.message || (e as CustomEvent).detail?.report || '';
      if (msg) { setBannerMsg(msg); setBannerVisible(true); }
    };
    window.addEventListener('proactive-briefing', handler);
    return () => window.removeEventListener('proactive-briefing', handler);
  }, []);

  const quote = QUOTES[quoteIdx % QUOTES.length];

  const handleAddWater = async (ml: number) => {
    try {
      const { addDoc, collection, serverTimestamp } = await import('firebase/firestore');
      const { db: firestoreDb } = await import('../../services/firebase');
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      await addDoc(collection(firestoreDb, 'water_logs'), {
        userId: uid,
        date: todayStr,
        amountMl: ml,
        createdAt: serverTimestamp(),
      });
    } catch (e) {
      console.error('[HomeDashboard] addWater error:', e);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
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

      {/* ── SARA Interface as modal overlay (opened via SARA AI button) ── */}
      <AnimatePresence>
        {saraOpen && (
          <motion.div
            key="sara-overlay"
            className="sara-overlay-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
          >
            <SaraInterface onClose={() => setSaraOpen(false)} onCommand={handleExecuteCommand} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── MAIN MOBILE-TWIN DASHBOARD ── */}
      <div className="hd-root">

        {/* ─── GREETING HEADER ─────────────────────────────────────────── */}
        <motion.div
          className="hd-header"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
        >
          <div className="hd-greeting">
            <h1 className="hd-greeting-title">
              <span className="hd-greeting-good">Good</span>
              <span className="hd-greeting-time">&nbsp;{timeGreeting}</span>
              {userName && <span className="hd-greeting-name">, {userName}</span>}
            </h1>
            <p className="hd-greeting-sub">
              {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              <span className="hd-date-dot" />
              {new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })} IST
            </p>
          </div>

          <div className="hd-header-actions">
            {/* Streak pill */}
            <div className="hd-streak-pill">
              <span>🔥</span>
              <span className="hd-streak-text">{appStreak} {appStreak === 1 ? 'Day' : 'Days'}</span>
            </div>
          </div>
        </motion.div>

        {/* ─── SARA PROACTIVE HUD BANNER ─────────────────────────────────── */}
        <AnimatePresence>
          {bannerVisible && bannerMsg && (
            <motion.div
              className="hd-hud-banner"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
            >
              <div className="hd-hud-left">
                <div className="hd-hud-icon-circle">⚡</div>
                <p className="hd-hud-text">
                  <span className="hd-hud-badge">SARA</span>
                  {bannerMsg.slice(0, 140)}{bannerMsg.length > 140 ? '…' : ''}
                </p>
              </div>
              <div className="hd-hud-right">
                <button className="hd-hud-ask-btn" onClick={() => setSaraOpen(true)}>Ask SARA ↗</button>
                <button className="hd-hud-dismiss" onClick={() => setBannerVisible(false)} aria-label="Dismiss">✕</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ─── 3-COLUMN BENTO GRID ────────────────────────────────────────── */}
        <div className="hd-bento-grid">

          {/* ── COLUMN 1: Overview + Academic ── */}
          <div className="hd-col">
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.35 }}>
              <OverviewWidget
                habitsCompleted={habitsCompleted}
                habitsTotal={allHabits.length}
                tasksCompleted={tasksCompleted}
                tasksTotal={tasksTotal}
                waterCompletedMl={waterCompletedMl}
                waterGoalMl={waterGoalMl || 3000}
                overallAttendancePct={overallAttendancePct}
                levelLabel={levelInfo.label}
                levelXP={levelInfo.xp}
                levelNextXP={levelInfo.nextXP}
                levelProgress={levelInfo.progress}
                levelNextLabel={levelInfo.nextLabel}
              />
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.35 }}>
              <AcademicWebWidget attendanceSubjects={attendanceSubjects || []} />
            </motion.div>
          </div>

          {/* ── COLUMN 2: Today's Agenda ── */}
          <div className="hd-col hd-col--stretch">
            <motion.div
              className="hd-col-full"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15, duration: 0.35 }}
            >
              <AgendaWebWidget
                tasks={tasks}
                attendanceSubjects={attendanceSubjects || []}
                todayStr={todayStr}
                nowDate={nowDate}
                onAddTask={(text) => handleExecuteCommand(`Create a task for today: ${text}`)}
              />
            </motion.div>
          </div>

          {/* ── COLUMN 3: Daily Habits + Wellness & Recall ── */}
          <div className="hd-col">
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.35 }}>
              <HabitsWebWidget
                habits={allHabits}
                habitLogs={habitLogs}
                todayStr={todayStr}
              />
            </motion.div>
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28, duration: 0.35 }}>
              <WellnessRecallWidget
                waterCompletedMl={waterCompletedMl}
                waterGoalMl={waterGoalMl || 3000}
                onAddWater={handleAddWater}
                dueFlashcardsCount={0}
                onReviewFlashcards={() => {}}
                quote={quote}
              />
            </motion.div>
          </div>

        </div>
      </div>
    </>
  );
}
