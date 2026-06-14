/**
 * ZenGymAI.tsx — Expert AI Personal Trainer & Nutritionist
 *
 * Features:
 * - 30-day gym log context (not just 7 days)
 * - REAL-TIME today's session context — updates as user logs sets/cardio
 * - Full chat session via shared RobustChatSession from gemini.ts
 * - Chat persistence in sessionStorage (survives route changes)
 * - PR detection with celebration in opening message
 * - 6 rich quick prompts: meal plan, training program, overload, coaching, deload, muscle balance
 * - Adaptive layout: side panel on desktop (≥769px), bottom sheet on mobile
 * - Markdown rendering for structured plans
 * - Live stats bar showing today's progress in real time
 */

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { startGymAIChat, RobustChatSession } from '../../services/gemini';
import {
  X, Send, Loader2, Sparkles, ChevronDown,
  Dumbbell, TrendingUp, Zap, RotateCcw, Apple, Calendar, Activity, Flame,
  RefreshCw, Brain
} from 'lucide-react';
import type { GymDayLog } from '../../types/gym.types';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: 'user' | 'ai';
  text: string;
  timestamp: number;
}

interface WorkoutStats {
  logs: GymDayLog[];
  totalWorkouts: number;
  totalSets: number;
  totalReps: number;
  totalVolume: number;
  totalCardioMinutes: number;
  totalCardioKm: number;
  topMuscles: string[];
  exerciseStats: { name: string; maxWeight: number; totalReps: number; sessions: number; recentWeights: number[] }[];
  personalRecords: { name: string; weight: number; date: string }[];
  avgCompletion: number;
  restDays: number;
  consecutiveWorkoutDays: number;
}

// ── Today's live session stats (computed from live todayLog) ──────────────────
interface TodayLiveStats {
  doneSets: number;
  totalSets: number;
  completedExercises: number;
  totalExercises: number;
  pct: number;
  volume: number; // kg lifted today
  cardioDone: boolean;
  cardioMinutes: number;
  cardioKm: number;
}

function buildTodayStats(todayLog: GymDayLog | null): TodayLiveStats {
  if (!todayLog) {
    return { doneSets: 0, totalSets: 0, completedExercises: 0, totalExercises: 0, pct: 0, volume: 0, cardioDone: false, cardioMinutes: 0, cardioKm: 0 };
  }
  let doneSets = 0, totalSets = 0, volume = 0, completedExercises = 0;
  for (const ex of todayLog.exercises || []) {
    for (const s of ex.setsLog) {
      totalSets++;
      if (s.completed) {
        doneSets++;
        volume += (s.reps || 0) * (s.weight || 0);
      }
    }
    if (ex.setsLog.length > 0 && ex.setsLog.every(s => s.completed)) completedExercises++;
  }
  const totalExercises = todayLog.exercises?.length || 0;
  const pct = totalSets > 0 ? Math.round((doneSets / totalSets) * 100) : 0;

  // Cardio: treadmill
  const treadmill = (todayLog.cardio || []).find(c => c.id === 'permanent_treadmill' && c.completed && (c.durationMinutes || 0) > 0);
  const otherCardio = (todayLog.cardio || []).filter(c => c.id !== 'permanent_treadmill' && c.completed && (c.durationMinutes || 0) > 0);
  const allCardio = treadmill ? [treadmill, ...otherCardio] : otherCardio;
  const cardioMinutes = allCardio.reduce((a, c) => a + (c.durationMinutes || 0), 0);
  const cardioKm = allCardio.reduce((a, c) => a + (c.distanceKm || 0), 0);
  const cardioDone = allCardio.length > 0;

  return { doneSets, totalSets, completedExercises, totalExercises, pct, volume: Math.round(volume), cardioDone, cardioMinutes, cardioKm: Math.round(cardioKm * 10) / 10 };
}

const SESSION_KEY = 'zenGymAI_messages';
const SESSION_VERSION = 'v5'; // bumped: real-time today sync
const SESSION_VER_KEY = 'zenGymAI_version';
const SESSION_STATS_KEY = 'zenGymAI_stats_hash';

const statsHash = (s: WorkoutStats | null): string => {
  if (!s) return '';
  return `${s.totalWorkouts}|${s.totalCardioMinutes}|${s.totalVolume}|${s.avgCompletion}`;
};

const initSession = (): ChatMessage[] => {
  try {
    const storedVer = sessionStorage.getItem(SESSION_VER_KEY);
    if (storedVer !== SESSION_VERSION) {
      sessionStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem(SESSION_STATS_KEY);
      sessionStorage.setItem(SESSION_VER_KEY, SESSION_VERSION);
      return [];
    }
    const saved = sessionStorage.getItem(SESSION_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch { return []; }
};

// ── Data Fetching ─────────────────────────────────────────────────────────────

async function fetch30DayLogs(userId: string): Promise<GymDayLog[]> {
  const dates = new Set<string>();
  for (let i = 0; i < 30; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  try {
    const q = query(collection(db, 'gymLogs'), where('userId', '==', userId));
    const snap = await getDocs(q);
    const logs: GymDayLog[] = [];
    snap.forEach(doc => {
      const data = doc.data() as GymDayLog;
      if (dates.has(data.date)) logs.push(data);
    });
    return logs.sort((a, b) => a.date.localeCompare(b.date));
  } catch (e) {
    console.warn('[ZenGymAI] Could not fetch logs:', e);
    return [];
  }
}

function buildStats(logs: GymDayLog[]): WorkoutStats {
  let totalSets = 0, totalReps = 0, totalVolume = 0;
  let totalCardioMinutes = 0, totalCardioKm = 0;
  let totalCompletion = 0, workoutDays = 0, restDays = 0;

  const muscleCount: Record<string, number> = {};
  const exerciseMap: Record<string, { maxWeight: number; totalReps: number; sessions: number; recentWeights: number[] }> = {};
  const prMap: Record<string, { weight: number; date: string }> = {};

  const sortedDates = [...logs].sort((a, b) => b.date.localeCompare(a.date));
  let consecutiveWorkoutDays = 0;
  for (const log of sortedDates) {
    if (log.exercises && log.exercises.length > 0) consecutiveWorkoutDays++;
    else break;
  }

  for (const log of logs) {
    const hasExercises = log.exercises && log.exercises.length > 0;
    if (!hasExercises) { restDays++; continue; }
    workoutDays++;

    let daySets = 0, doneSets = 0;
    for (const ex of log.exercises) {
      if (ex.muscle) muscleCount[ex.muscle] = (muscleCount[ex.muscle] || 0) + 1;
      if (!exerciseMap[ex.name]) exerciseMap[ex.name] = { maxWeight: 0, totalReps: 0, sessions: 0, recentWeights: [] };
      exerciseMap[ex.name].sessions++;

      for (const s of ex.setsLog) {
        daySets++;
        if (s.completed) {
          doneSets++;
          totalSets++;
          const reps = s.reps || 0;
          const kg = s.weight || 0;
          totalReps += reps;
          totalVolume += reps * kg;
          if (kg > exerciseMap[ex.name].maxWeight) {
            exerciseMap[ex.name].maxWeight = kg;
            if (!prMap[ex.name] || kg > prMap[ex.name].weight) {
              prMap[ex.name] = { weight: kg, date: log.date };
            }
          }
          exerciseMap[ex.name].totalReps += reps;
          if (kg > 0 && exerciseMap[ex.name].recentWeights.length < 5) {
            exerciseMap[ex.name].recentWeights.push(kg);
          }
        }
      }
    }
    if (daySets > 0) totalCompletion += Math.round((doneSets / daySets) * 100);

    for (const c of log.cardio || []) {
      const isBuggyDefault = c.id === 'permanent_treadmill' && c.durationMinutes === 60 && c.distanceKm === 4 && c.speedKmh === 4;
      if (c.completed && (c.durationMinutes || 0) > 0 && !isBuggyDefault) {
        totalCardioMinutes += c.durationMinutes || 0;
        totalCardioKm += c.distanceKm || 0;
      }
    }
  }

  const topMuscles = Object.entries(muscleCount).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([m]) => m);
  const exerciseStats = Object.entries(exerciseMap).map(([name, stats]) => ({ name, ...stats })).sort((a, b) => b.totalReps - a.totalReps).slice(0, 8);
  const personalRecords = Object.entries(prMap).map(([name, pr]) => ({ name, ...pr })).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);

  return {
    logs,
    totalWorkouts: workoutDays,
    totalSets,
    totalReps,
    totalVolume: Math.round(totalVolume),
    totalCardioMinutes,
    totalCardioKm: Math.round(totalCardioKm * 10) / 10,
    topMuscles,
    exerciseStats,
    personalRecords,
    avgCompletion: workoutDays > 0 ? Math.round(totalCompletion / workoutDays) : 0,
    restDays,
    consecutiveWorkoutDays,
  };
}

function buildContext(stats: WorkoutStats, todayLog: GymDayLog | null): string {
  const lines: string[] = [];
  lines.push('=== 30-DAY TRAINING SUMMARY ===');
  lines.push(`Training days: ${stats.totalWorkouts} | Rest days: ${stats.restDays}`);
  lines.push(`Consecutive workout days (from today): ${stats.consecutiveWorkoutDays}`);
  lines.push(`Total sets: ${stats.totalSets} | Total reps: ${stats.totalReps}`);
  lines.push(`Total volume lifted: ${stats.totalVolume} kg`);
  lines.push(`Average session completion: ${stats.avgCompletion}%`);
  if (stats.totalCardioMinutes > 0) {
    lines.push(`Cardio: ${stats.totalCardioMinutes} mins | ${stats.totalCardioKm} km`);
  } else {
    lines.push('Cardio: No completed cardio sessions logged');
  }

  if (stats.topMuscles.length > 0) {
    lines.push(`\nMost trained muscles: ${stats.topMuscles.join(', ')}`);
  }

  if (stats.exerciseStats.length > 0) {
    lines.push('\n=== EXERCISE PERFORMANCE ===');
    for (const ex of stats.exerciseStats) {
      lines.push(`${ex.name}: ${ex.sessions} sessions | ${ex.totalReps} total reps | max weight ${ex.maxWeight}kg`);
      if (ex.recentWeights.length > 1) {
        lines.push(`  Recent weights: ${ex.recentWeights.join('→')}kg`);
      }
    }
  }

  if (stats.personalRecords.length > 0) {
    lines.push('\n=== PERSONAL RECORDS (this month) ===');
    for (const pr of stats.personalRecords) {
      lines.push(`${pr.name}: ${pr.weight}kg on ${pr.date}`);
    }
  }

  // Today's live session — always injected fresh
  lines.push(buildTodayContext(todayLog));

  // Recent workout history (last 7 days detailed)
  const recent = stats.logs.slice(-7);
  if (recent.length > 0) {
    lines.push('\n=== LAST 7 DAYS DETAIL ===');
    for (const log of recent) {
      const hasEx = log.exercises && log.exercises.length > 0;
      if (!hasEx) { lines.push(`${log.date}: Rest day`); continue; }
      const muscles = [...new Set(log.exercises.map(e => e.muscle).filter(Boolean))];
      const completedSets = log.exercises.flatMap(e => e.setsLog.filter(s => s.completed)).length;
      const totalSets = log.exercises.flatMap(e => e.setsLog).length;
      lines.push(`${log.date}: ${muscles.join('+')} | ${completedSets}/${totalSets} sets`);
    }
  }

  return lines.join('\n');
}

/** Build just the today's session section — called independently for live updates */
function buildTodayContext(todayLog: GymDayLog | null): string {
  if (!todayLog || todayLog.exercises.length === 0) {
    return "\n=== TODAY'S SESSION ===\nNo exercises logged yet today.";
  }
  const lines: string[] = [];
  lines.push("\n=== TODAY'S SESSION (LIVE — REAL TIME) ===");
  for (const ex of todayLog.exercises) {
    const done = Array.isArray(ex.setsLog) ? ex.setsLog.filter(s => s && s.completed) : [];
    const weights = done.map(s => Number(s.weight) || 0).filter(w => w > 0);
    const reps = done.map(s => s.reps).filter(Boolean);
    const maxW = weights.length > 0 ? Math.max(...weights) : 0;
    lines.push(`${ex.name} (${ex.muscle || '?'}): ${done.length}/${Array.isArray(ex.setsLog) ? ex.setsLog.length : 0} sets done | max ${maxW}kg | reps: ${reps.join(', ') || 'none yet'}`);
  }

  // Cardio
  const cardioEntries = (todayLog.cardio || []).filter(c => (c.durationMinutes || 0) > 0 || c.completed);
  for (const c of cardioEntries) {
    const status = c.completed ? 'DONE' : 'IN PROGRESS';
    const details = [
      c.durationMinutes ? `${c.durationMinutes}min` : null,
      c.distanceKm ? `${c.distanceKm}km` : null,
      c.speedKmh ? `${c.speedKmh}km/h` : null,
    ].filter(Boolean).join(' | ');
    lines.push(`${c.type}: ${status}${details ? ` — ${details}` : ''}`);
  }

  return lines.join('\n');
}

// ── Quick Prompts ─────────────────────────────────────────────────────────────

const QUICK_PROMPTS = [
  {
    icon: Apple,
    label: 'Meal Plan',
    prompt: 'Create a personalized daily meal plan for me based on my training volume and frequency. Include protein targets (g/kg), caloric estimate, meal timing around workouts, and 3 simple meal ideas for each meal.',
    color: '#10b981',
  },
  {
    icon: Calendar,
    label: 'Training Program',
    prompt: 'Build me a structured 4-week progressive training program based on my current workout data, muscle weaknesses, and volume. Include specific exercises, sets, reps, and weekly progression.',
    color: '#a855f7',
  },
  {
    icon: TrendingUp,
    label: 'Overload Check',
    prompt: 'Review my weights across all exercises over the past month. Where am I progressing well? Where am I stalling? Give me exact weight targets to hit next session for each exercise.',
    color: '#3b82f6',
  },
  {
    icon: Flame,
    label: "Today's Coaching",
    prompt: "Coach me through today's session. Based on my recent performance and recovery, what should my weight targets be for each exercise? What RPE should I aim for?",
    color: '#f59e0b',
  },
  {
    icon: Zap,
    label: 'Deload Check',
    prompt: 'Analyze my training fatigue signals from the past 4 weeks. Do I need a deload? If yes, design a full deload week for me with reduced volume/intensity.',
    color: '#ef4444',
  },
  {
    icon: Activity,
    label: 'Muscle Balance',
    prompt: 'Analyze my muscle group training frequency and volume distribution. Identify imbalances or underworked muscles. What should I add or rebalance in my program?',
    color: '#06b6d4',
  },
];

// ── Simple Markdown Renderer ──────────────────────────────────────────────────

function renderMarkdown(text: string): React.ReactNode {
  const lines = text.split('\n');
  return lines.map((line, i) => {
    const boldProcessed = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    if (line.startsWith('## ')) {
      return <div key={i} style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--accent-secondary)', marginTop: '0.75rem', marginBottom: '0.25rem' }}>{line.slice(3)}</div>;
    }
    if (line.startsWith('# ')) {
      return <div key={i} style={{ fontWeight: 700, fontSize: '1rem', color: '#fff', marginTop: '0.5rem', marginBottom: '0.25rem' }}>{line.slice(2)}</div>;
    }
    if (line.startsWith('• ') || line.startsWith('- ')) {
      return <div key={i} style={{ paddingLeft: '1rem', marginBottom: '0.15rem', position: 'relative' }}>
        <span style={{ position: 'absolute', left: '0.25rem' }}>•</span>
        <span dangerouslySetInnerHTML={{ __html: boldProcessed.slice(2) }} />
      </div>;
    }
    if (line.trim() === '') {
      return <div key={i} style={{ height: '0.4rem' }} />;
    }
    return <div key={i} style={{ marginBottom: '0.1rem' }} dangerouslySetInnerHTML={{ __html: boldProcessed }} />;
  });
}

// ── Main Component ────────────────────────────────────────────────────────────

interface ZenGymAIProps {
  userId: string | null;
  todayLog: GymDayLog | null;
}

export const ZenGymAI = ({ userId, todayLog }: ZenGymAIProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(() => initSession());
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingContext, setIsLoadingContext] = useState(false);
  const [stats, setStats] = useState<WorkoutStats | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 769);
  // Live today stats — updated instantly as user logs
  const [todayStats, setTodayStats] = useState<TodayLiveStats>(() => buildTodayStats(todayLog));
  // Track when today data changed while panel was open (to show refresh hint)
  const [todayDataUpdated, setTodayDataUpdated] = useState(false);

  const chatSessionRef = useRef<RobustChatSession | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const contextRef = useRef<string>('');
  const isLoadingContextRef = useRef(false);
  // Keep latest todayLog accessible synchronously without re-triggering effects
  const todayLogRef = useRef<GymDayLog | null>(todayLog);
  const prevTodayHashRef = useRef('');

  // ── Real-time today log sync ───────────────────────────────────────────────
  // This runs EVERY time todayLog changes (user logs a set, treadmill, etc.)
  useEffect(() => {
    todayLogRef.current = todayLog;
    // Recompute today's stats for the UI stats bar
    const live = buildTodayStats(todayLog);
    setTodayStats(live);

    // Compute a hash of today's data to detect meaningful changes
    const newHash = `${live.doneSets}|${live.totalSets}|${live.volume}|${live.cardioMinutes}|${live.cardioKm}`;

    if (prevTodayHashRef.current && newHash !== prevTodayHashRef.current) {
      // Data changed! Update the context string in the ref immediately.
      // The AI will receive this fresh context on the next sendMessage call
      // via an injected system message (see sendMessage).
      if (isOpen && contextRef.current) {
        // Rebuild just the today section and update contextRef
        const todaySection = buildTodayContext(todayLog);
        // Replace the TODAY'S SESSION block in the existing context
        const updatedCtx = contextRef.current.replace(
          /\n=== TODAY'S SESSION[\s\S]*$/,
          todaySection
        );
        contextRef.current = updatedCtx;
        if (!isLoadingContextRef.current) {
          setTodayDataUpdated(true);
        }
      }
    }
    prevTodayHashRef.current = newHash;
  }, [todayLog, isOpen]);

  // Track desktop vs mobile
  useEffect(() => {
    const onResize = () => setIsDesktop(window.innerWidth >= 769);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Persist messages to sessionStorage
  useEffect(() => {
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(messages.slice(-50))); } catch { /* ignore */ }
  }, [messages]);

  // Load 30-day context every time panel opens (always fresh)
  useEffect(() => {
    if (!isOpen || !userId) return;
    if (isLoadingContextRef.current) return;
    isLoadingContextRef.current = true;
    setTodayDataUpdated(false);

    (async () => {
      setIsLoadingContext(true);
      setContextError(null);
      try {
        const logs = await fetch30DayLogs(userId);
        const s = buildStats(logs);
        setStats(s);
        // Always build context with the LATEST todayLog (from ref — not stale closure)
        const context = buildContext(s, todayLogRef.current);
        contextRef.current = context;

        const newHash = statsHash(s);
        const oldHash = sessionStorage.getItem(SESSION_STATS_KEY) || '';
        const statsChanged = newHash !== oldHash;

        const currentMessages = statsChanged ? [] : messages;
        if (statsChanged) {
          setMessages([]);
          sessionStorage.removeItem(SESSION_KEY);
          sessionStorage.setItem(SESSION_STATS_KEY, newHash);
        }

        const existingHistory = currentMessages.length > 0
          ? currentMessages.map(m => ({
            role: m.role === 'user' ? 'user' : 'model',
            parts: [{ text: m.text }],
          }))
          : [];
        chatSessionRef.current = startGymAIChat(context, existingHistory);

        if (currentMessages.length === 0) {
          setIsLoading(true);
          const prText = s.personalRecords.length > 0
            ? `Note: User has ${s.personalRecords.length} personal record(s) this month: ${s.personalRecords.map(p => `${p.name} at ${p.weight}kg`).join(', ')}. Celebrate these first!`
            : '';
          const openingPrompt = `Give me a 3-4 sentence overview of my last 30 days of training. ${prText} Highlight the most important pattern or insight you see. What should I focus on this week?`;
          const response = await chatSessionRef.current.sendMessage(openingPrompt);
          const aiText = response.response.text();
          setMessages([{ role: 'ai', text: aiText, timestamp: Date.now() }]);
          sessionStorage.setItem(SESSION_STATS_KEY, newHash);
          setIsLoading(false);
        }
      } catch (e: any) {
        console.error('[ZenGymAI]', e);
        setContextError(`Could not load data: ${e?.message || 'Check your connection.'}`);
        setIsLoading(false);
      } finally {
        setIsLoadingContext(false);
        isLoadingContextRef.current = false;
      }
    })();
  }, [isOpen, userId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && !isLoadingContext) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen, isLoadingContext]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading || !chatSessionRef.current) return;

    // If today's data was updated since last message, prepend a silent context refresh
    // by injecting the updated today section into the message
    let messageToSend = text.trim();
    if (todayDataUpdated) {
      const todayCtx = buildTodayContext(todayLogRef.current);
      messageToSend = `[CONTEXT UPDATE — my live workout data just changed]\n${todayCtx}\n\n[MY QUESTION]: ${text.trim()}`;
      setTodayDataUpdated(false);
    }

    const userMsg: ChatMessage = { role: 'user', text: text.trim(), timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await chatSessionRef.current.sendMessage(messageToSend);
      const aiText = response.response.text();
      setMessages(prev => [...prev, { role: 'ai', text: aiText, timestamp: Date.now() }]);
    } catch (e: any) {
      setMessages(prev => [...prev, {
        role: 'ai',
        text: `Sorry, I hit an issue: ${e?.message || 'Please try again.'}`,
        timestamp: Date.now(),
      }]);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, todayDataUpdated]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const clearChat = () => {
    setMessages([]);
    setStats(null);
    chatSessionRef.current = null;
    setTodayDataUpdated(false);
    try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
  };

  /** Manually refresh today's context and inject it into the chat */
  const refreshTodayContext = useCallback(async () => {
    if (!chatSessionRef.current || isLoading) return;
    setTodayDataUpdated(false);
    const todayCtx = buildTodayContext(todayLogRef.current);
    const live = buildTodayStats(todayLogRef.current);

    setIsLoading(true);
    const prompt = `Here is my updated live session data:\n${todayCtx}\n\nBased on what I've done so far, give me a quick 2-sentence progress check and tell me what weight I should aim for on my remaining exercises.`;
    const userMsg: ChatMessage = { role: 'user', text: '🔄 Sync latest session data and coach me', timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);

    try {
      const response = await chatSessionRef.current.sendMessage(prompt);
      const aiText = response.response.text();
      setMessages(prev => [...prev, { role: 'ai', text: aiText, timestamp: Date.now() }]);
      // Update stats bar with live today data
      setTodayStats(live);
    } catch (e: any) {
      setMessages(prev => [...prev, { role: 'ai', text: `Sync failed: ${e?.message || 'Try again.'}`, timestamp: Date.now() }]);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading]);

  // Stats bar — 30-day summary
  const statsBar = useMemo(() => {
    if (!stats) return null;
    return (
      <div style={{ display: 'flex', gap: '0.75rem', padding: '0.4rem 1rem', background: 'rgba(124,58,237,0.08)', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: '0.7rem', color: 'var(--text-muted)', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>30d</span>
        <span>🏋️ <strong style={{ color: '#fff' }}>{stats.totalWorkouts}</strong> workouts</span>
        <span>⚡ <strong style={{ color: '#fff' }}>{stats.totalVolume.toLocaleString()}</strong>kg</span>
        <span>✅ <strong style={{ color: '#fff' }}>{stats.avgCompletion}%</strong></span>
        <span>🏃 <strong style={{ color: '#fff' }}>{stats.totalCardioMinutes}</strong>min</span>
        {stats.personalRecords.length > 0 && <span>🏆 <strong style={{ color: '#f59e0b' }}>{stats.personalRecords.length}</strong> PRs</span>}
      </div>
    );
  }, [stats]);

  // Live today stats bar — updates in real time
  const todayBar = useMemo(() => {
    if (!todayStats.totalSets && !todayStats.cardioMinutes) return null;
    const pctColor = todayStats.pct >= 100 ? '#1db954' : todayStats.pct >= 50 ? '#f59e0b' : '#a855f7';
    return (
      <div style={{
        display: 'flex', gap: '0.5rem', padding: '0.4rem 1rem',
        background: 'rgba(29,185,84,0.06)',
        borderBottom: '1px solid rgba(29,185,84,0.12)',
        fontSize: '0.7rem', color: 'var(--text-muted)', flexWrap: 'wrap', alignItems: 'center',
      }}>
        <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>Live</span>
        {/* Progress ring */}
        <span style={{ fontWeight: 700, color: pctColor }}>{todayStats.pct}%</span>
        <span><strong style={{ color: '#fff' }}>{todayStats.doneSets}</strong>/{todayStats.totalSets} sets</span>
        {todayStats.volume > 0 && <span>⚡ <strong style={{ color: '#fff' }}>{todayStats.volume}</strong>kg</span>}
        {todayStats.cardioMinutes > 0 && (
          <span>🏃 <strong style={{ color: '#1db954' }}>{todayStats.cardioMinutes}min</strong>
            {todayStats.cardioKm > 0 && ` · ${todayStats.cardioKm}km`}
          </span>
        )}
        {todayDataUpdated && (
          <button
            onClick={refreshTodayContext}
            disabled={isLoading}
            title="Sync live data to AI"
            style={{
              marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.2rem',
              padding: '0.2rem 0.5rem', borderRadius: '99px',
              background: 'rgba(29,185,84,0.15)', border: '1px solid rgba(29,185,84,0.4)',
              color: '#1db954', cursor: 'pointer', fontSize: '0.65rem', fontWeight: 700,
              animation: 'zenPulse 1.5s ease-in-out infinite',
            }}
          >
            <RefreshCw size={10} /> Sync AI
          </button>
        )}
      </div>
    );
  }, [todayStats, todayDataUpdated, isLoading, refreshTodayContext]);

  // ── Render ──────────────────────────────────────────────────────────────────

  const panelStyle: React.CSSProperties = isDesktop ? {
    position: 'fixed',
    top: 0,
    right: 0,
    bottom: 0,
    width: '420px',
    zIndex: 1100,
    display: 'flex',
    flexDirection: 'column',
    background: 'rgba(10,8,20,0.98)',
    borderLeft: '1px solid rgba(124,58,237,0.25)',
    boxShadow: '-8px 0 40px rgba(124,58,237,0.2)',
    animation: 'slideInFromRight 0.25s var(--ease-out-expo)',
  } : {
    position: 'relative',
    zIndex: 1,
    background: 'rgba(12,10,20,0.97)',
    borderRadius: '24px 24px 0 0',
    border: '1px solid rgba(124,58,237,0.25)',
    borderBottom: 'none',
    height: '82vh',
    maxHeight: '700px',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    boxShadow: '0 -8px 40px rgba(124,58,237,0.2)',
  };

  return createPortal(
    <>
      {/* ── Floating AI Button ── */}
      <button
        id="zen-gym-ai-btn"
        onClick={() => setIsOpen(true)}
        aria-label="Open Zen Gym AI"
        style={{
          position: 'fixed',
          bottom: 'calc(5.5rem + env(safe-area-inset-bottom, 0px))',
          right: '1.25rem',
          zIndex: 200,
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          border: 'none',
          background: 'linear-gradient(135deg, #7c3aed, #a855f7)',
          color: '#fff',
          cursor: 'pointer',
          display: isOpen ? 'none' : 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 20px rgba(124,58,237,0.5), 0 8px 32px rgba(0,0,0,0.3)',
          animation: 'gymAiPulse 3s ease-in-out infinite',
          transition: 'transform 0.15s, box-shadow 0.15s',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        {/* Clean single icon — Dumbbell with AI sparkle accent */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Dumbbell size={22} style={{ color: '#fff', filter: 'drop-shadow(0 0 4px rgba(255,255,255,0.4))' }} />
          <Sparkles size={10} style={{ position: 'absolute', top: -6, right: -8, color: '#fbbf24', filter: 'drop-shadow(0 0 3px rgba(251,191,36,0.8))' }} />
        </div>

        {/* Live session dot — shows when there's active workout data */}
        {todayStats.totalSets > 0 && (
          <span style={{
            position: 'absolute', top: '2px', right: '2px',
            width: '10px', height: '10px', borderRadius: '50%',
            background: todayStats.pct >= 100 ? '#1db954' : '#f59e0b',
            border: '2px solid #7c3aed',
          }} />
        )}
      </button>

      {/* ── Panel / Sheet ── */}
      {isOpen && (
        <div
          style={isDesktop ? {} : {
            position: 'fixed',
            inset: 0,
            zIndex: 1100,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
          }}
          onClick={isDesktop ? undefined : (e => { if (e.target === e.currentTarget) setIsOpen(false); })}
        >
          {/* Backdrop (mobile only) */}
          {!isDesktop && (
            <div
              style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)' }}
              onClick={() => setIsOpen(false)}
            />
          )}

          <div style={panelStyle}>
            {/* ── Header ── */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.7rem',
              padding: '0.85rem 1rem',
              borderBottom: '1px solid rgba(255,255,255,0.07)',
              flexShrink: 0,
              background: 'rgba(124,58,237,0.08)',
            }}>
              <div style={{
                width: '36px', height: '36px', borderRadius: '50%',
                background: 'linear-gradient(135deg,#7c3aed,#a855f7)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Dumbbell size={18} color="#fff" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#fff', lineHeight: 1.2 }}>Zen Gym AI</div>
                <div style={{ fontSize: '0.7rem', color: 'rgba(168,85,247,0.9)' }}>
                  {isLoadingContext ? 'Loading 30-day data...' : stats ? `${stats.totalWorkouts} workouts · 30-day view` : 'Personal Trainer + Nutritionist'}
                </div>
              </div>
              {/* Sync button — always available when panel is open */}
              <button
                onClick={refreshTodayContext}
                disabled={isLoading || isLoadingContext}
                title="Sync live session data to AI"
                style={{
                  background: todayDataUpdated ? 'rgba(29,185,84,0.15)' : 'none',
                  border: todayDataUpdated ? '1px solid rgba(29,185,84,0.4)' : 'none',
                  color: todayDataUpdated ? '#1db954' : 'var(--text-muted)',
                  cursor: 'pointer', padding: '0.3rem', borderRadius: '6px',
                  display: 'flex', alignItems: 'center',
                  animation: todayDataUpdated ? 'zenPulse 1.5s ease-in-out infinite' : 'none',
                }}
              >
                <RefreshCw size={15} />
              </button>
              <button
                onClick={clearChat}
                title="Clear chat"
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.3rem', borderRadius: '6px' }}
              >
                <RotateCcw size={15} />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.3rem', borderRadius: '6px' }}
              >
                {isDesktop ? <X size={18} /> : <ChevronDown size={20} />}
              </button>
            </div>

            {/* 30-day Stats Bar */}
            {statsBar}

            {/* Live Today Bar */}
            {todayBar}

            {/* ── Messages ── */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.85rem', scrollbarWidth: 'none' }}>
              {isLoadingContext && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: '0.75rem', color: 'var(--text-muted)' }}>
                  <Loader2 size={28} style={{ animation: 'spin 1s linear infinite', color: '#a855f7' }} />
                  <span style={{ fontSize: '0.85rem' }}>Loading your 30-day training data…</span>
                </div>
              )}

              {contextError && (
                <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '12px', padding: '0.85rem', fontSize: '0.85rem', color: '#fca5a5' }}>
                  {contextError}
                </div>
              )}

              {!isLoadingContext && messages.map((msg, i) => (
                <div key={i} style={{
                  display: 'flex',
                  justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                }}>
                  <div style={{
                    maxWidth: '88%',
                    padding: '0.65rem 0.9rem',
                    borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '4px 18px 18px 18px',
                    background: msg.role === 'user'
                      ? 'linear-gradient(135deg,#7c3aed,#a855f7)'
                      : 'rgba(255,255,255,0.06)',
                    border: msg.role === 'ai' ? '1px solid rgba(255,255,255,0.08)' : 'none',
                    color: '#fff',
                    fontSize: '0.875rem',
                    lineHeight: 1.55,
                  }}>
                    {msg.role === 'ai' ? renderMarkdown(msg.text) : msg.text}
                  </div>
                </div>
              ))}

              {isLoading && !isLoadingContext && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0' }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'linear-gradient(135deg,#7c3aed,#a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Sparkles size={13} color="#fff" />
                  </div>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {[0, 1, 2].map(j => (
                      <div key={j} style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#a855f7', animation: `bounce 1.2s ${j * 0.2}s ease-in-out infinite` }} />
                    ))}
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* ── Quick Prompts ── */}
            {!isLoadingContext && messages.length <= 1 && (
              <div style={{ padding: '0 0.75rem 0.5rem', display: 'flex', gap: '0.4rem', flexWrap: 'wrap', flexShrink: 0 }}>
                {QUICK_PROMPTS.map(qp => (
                  <button
                    key={qp.label}
                    onClick={() => sendMessage(qp.prompt)}
                    disabled={isLoading || !stats}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.3rem',
                      padding: '0.35rem 0.65rem', borderRadius: '20px',
                      background: `${qp.color}14`, border: `1px solid ${qp.color}35`,
                      color: qp.color, fontSize: '0.72rem', fontWeight: 500,
                      cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap',
                    }}
                  >
                    <qp.icon size={12} />
                    {qp.label}
                  </button>
                ))}
              </div>
            )}

            {/* ── Input ── */}
            <div style={{
              padding: '0.6rem 0.75rem calc(0.6rem + env(safe-area-inset-bottom, 0px))',
              borderTop: '1px solid rgba(255,255,255,0.07)',
              display: 'flex', gap: '0.5rem', alignItems: 'flex-end', flexShrink: 0,
            }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={stats ? 'Ask about training, nutrition, or create a plan…' : 'Loading data…'}
                disabled={isLoading || isLoadingContext || !!contextError}
                rows={1}
                style={{
                  flex: 1, resize: 'none', background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px',
                  padding: '0.55rem 0.75rem', color: '#fff', fontSize: '0.875rem',
                  lineHeight: 1.5, maxHeight: '100px', outline: 'none',
                  fontFamily: 'inherit', WebkitTapHighlightColor: 'transparent',
                }}
                onInput={e => {
                  const t = e.currentTarget;
                  t.style.height = 'auto';
                  t.style.height = Math.min(t.scrollHeight, 100) + 'px';
                }}
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || isLoading || isLoadingContext || !!contextError}
                style={{
                  width: '38px', height: '38px', borderRadius: '12px',
                  background: input.trim() && !isLoading ? 'linear-gradient(135deg,#7c3aed,#a855f7)' : 'rgba(255,255,255,0.08)',
                  border: 'none', color: '#fff', cursor: input.trim() && !isLoading ? 'pointer' : 'not-allowed',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.2s', flexShrink: 0,
                }}
              >
                {isLoading ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={16} />}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes gymAiPulse {
          0%, 100% { box-shadow: 0 4px 20px rgba(124,58,237,0.5), 0 0 0 0 rgba(168,85,247,0.4); }
          50% { box-shadow: 0 4px 28px rgba(124,58,237,0.7), 0 0 0 10px rgba(168,85,247,0); }
        }
        @keyframes slideInFromRight {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        #zen-gym-ai-btn:active { transform: scale(0.88); }
      `}</style>
    </>,
    document.body
  );
};
