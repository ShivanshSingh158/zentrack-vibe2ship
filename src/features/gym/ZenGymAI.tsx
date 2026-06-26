import {
  useState, useEffect, useRef, useCallback, useMemo,
} from 'react';
import { createPortal } from 'react-dom';
import {
  MessageSquare, X, Send, Target, RefreshCw, User,
  Dumbbell, ChevronUp, ChevronDown, Zap, Apple,
  AlertTriangle, TrendingUp, Calendar, Sparkles,
} from 'lucide-react';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { startGymAIChat, startGymAIOAuthChat } from '../../services/gemini';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import type {
  GymDayLog, GymProfile, WeightTarget,
} from '../../types/gym.types';
import { GymChatUI } from './GymChatUI';
import { GymWorkoutSummary } from './GymWorkoutSummary';

/** Format kg to max 1 decimal, no trailing zeros */
export const fmtKg = (v: number | null | undefined): string => {
  if (v == null || isNaN(v)) return '—';
  return parseFloat(v.toFixed(1)).toString();
};

// ── Constants ──────────────────────────────────────────────────────────────────

const SESSION_KEY_PREFIX = 'zenGymAI_';
const CONTEXT_TTL_MS = 15 * 60 * 1000;
const HISTORY_KEY = (uid: string) => `${SESSION_KEY_PREFIX}${uid}_msgs`;
const CONTEXT_KEY = (uid: string) => `${SESSION_KEY_PREFIX}${uid}_ctx`;
const CONTEXT_TS_KEY = (uid: string) => `${SESSION_KEY_PREFIX}${uid}_ts`;
const STATS_HASH_KEY = (uid: string) => `${SESSION_KEY_PREFIX}${uid}_hash`;
const STATS_KEY = (uid: string) => `${SESSION_KEY_PREFIX}${uid}_stats`;

// ── OAuth token reader (shared with Lecture Chat) ──────────────────────────────
const getLectureChatOAuthToken = (): string | null => {
  try {
    const expiry = Number(sessionStorage.getItem('zen_gemini_oauth_expiry') || '0');
    if (Date.now() > expiry) return null;
    return sessionStorage.getItem('zen_gemini_oauth_token');
  } catch { return null; }
};

// ── Types ──────────────────────────────────────────────────────────────────────

type SessionMode = 'idle' | 'active' | 'complete';
type TabId = 'chat' | 'targets' | 'profile';

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  title: string;
  ts: number;
  model?: string;
}

interface GymStats {
  totalWorkouts: number;
  totalVolume: number;
  totalCardioMinutes: number;
  avgCompletion: number;
  streak: number;
  stallAlerts: { exerciseName: string; message: string }[];
  exerciseStats: Array<{
    name: string; muscle?: string; sessions: number;
    maxWeight: number; recentWeights: Array<{ date: string; weight: number }>;
    lastDate: string;
  }>;
  logs: GymDayLog[];
  dowMuscleMap: Record<number, string[]>;
  anomalies: string[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function genId() { return Math.random().toString(36).slice(2); }

function hashStats(s: GymStats): string {
  return `${s.totalWorkouts}|${s.totalVolume}|${s.streak}|${s.avgCompletion.toFixed(0)}`;
}

function buildContextString(stats: GymStats, profile: GymProfile | null): string {
  const lines: string[] = [];

  // ── Profile ──────────────────────────────────────────────────────────────
  if (profile) {
    lines.push(`=== ATHLETE PROFILE ===`);
    if (profile.bodyweightKg) lines.push(`Body weight: ${profile.bodyweightKg}kg`);
    if (profile.heightCm) lines.push(`Height: ${profile.heightCm}cm`);
    if (profile.ageYears) lines.push(`Age: ${profile.ageYears}`);
    if (profile.trainingExperienceMonths) {
      const exp = profile.trainingExperienceMonths;
      const label = exp < 3 ? 'beginner (<3m)' : exp < 6 ? 'novice (3–6m)' : exp < 12 ? 'intermediate (6–12m)' : exp < 24 ? 'experienced (1–2yr)' : 'advanced (2yr+)';
      lines.push(`Training experience: ${label} (${exp} months)`);
    }
    lines.push(`Primary goal: ${profile.primaryGoal}`);
    if (profile.targetBodyweightKg) lines.push(`Target Bodyweight: ${profile.targetBodyweightKg}kg`);
    if (profile.targetTimelineWeeks) lines.push(`Target Timeline: ${profile.targetTimelineWeeks} weeks`);
    if (profile.bodyweightKg && profile.heightCm) {
      const bmi = (profile.bodyweightKg / Math.pow(profile.heightCm / 100, 2)).toFixed(1);
      lines.push(`BMI: ${bmi}`);
    }
    if (profile.currentMesocycleWeek && profile.totalMesocycleWeeks) {
      lines.push(`Periodization Phase: Week ${profile.currentMesocycleWeek} of ${profile.totalMesocycleWeeks}`);
    }
    lines.push('');
  }

  // ── 30-Day Overview ──────────────────────────────────────────────────────
  let daysLogging = 30;
  if (stats.logs.length > 0) {
    const oldestLog = stats.logs[stats.logs.length - 1];
    const diffTime = Math.abs(new Date().getTime() - new Date(oldestLog.date).getTime());
    daysLogging = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
  }

  lines.push(`=== 30-DAY TRAINING SUMMARY ===`);
  if (daysLogging < 30) {
    lines.push(`[CRITICAL: The user has ONLY been using this app for ${daysLogging} days! Their total volume and workouts reflect ${daysLogging} days, NOT 30 days. DO NOT tell them they are inconsistent over the last month, they just started!]`);
  }
  lines.push(`Total sessions logged: ${stats.totalWorkouts}`);
  lines.push(`Current consecutive streak: ${stats.streak} days`);
  lines.push(`Average session completion rate: ${stats.avgCompletion.toFixed(1)}%`);
  lines.push(`Total lifting volume: ${stats.totalVolume.toLocaleString()}kg (weight × reps across all sets)`);
  lines.push(`Total cardio: ${stats.totalCardioMinutes} minutes`);
  if (stats.totalWorkouts > 0) {
    lines.push(`Average volume per session: ${Math.round(stats.totalVolume / stats.totalWorkouts).toLocaleString()}kg`);
  }
  lines.push('');

  // ── Stall Alerts & Anomalies ─────────────────────────────────────────────
  if (stats.stallAlerts.length > 0) {
    lines.push(`=== ⚠️ STALL ALERTS (same weight 3+ consecutive sessions) ===`);
    stats.stallAlerts.forEach(a => lines.push(`  - ${a.exerciseName}: ${a.message}`));
    lines.push('');
  }
  if (stats.anomalies.length > 0) {
    lines.push(`=== 📉 WEIGHT ANOMALIES (Sudden drops in performance) ===`);
    stats.anomalies.forEach(a => lines.push(`  - ${a}`));
    lines.push('');
  }

  // ── Day of Week Muscle Map ───────────────────────────────────────────────
  lines.push(`=== TYPICAL WEEKLY SCHEDULE (Based on last 30 days) ===`);
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  days.forEach((day, idx) => {
    const muscles = stats.dowMuscleMap[idx] || [];
    lines.push(`  - ${day}: ${muscles.length > 0 ? muscles.join(', ') : 'Rest'}`);
  });
  lines.push('');

  // ── Exercise-Level Progression Detail ────────────────────────────────────
  if (stats.exerciseStats.length > 0) {
    lines.push(`=== EXERCISE PROGRESSION LOG (most frequent first) ===`);
    stats.exerciseStats.slice(0, 20).forEach(ex => {
      const sorted = [...ex.recentWeights].sort((a, b) => a.date.localeCompare(b.date));
      const oldest = sorted[0]?.weight ?? null;
      const newest = sorted[sorted.length - 1]?.weight ?? null;
      const progressionKg = oldest != null && newest != null ? (newest - oldest) : null;
      const progressionStr = progressionKg != null
        ? progressionKg > 0 ? `📈 +${progressionKg}kg over ${sorted.length} logged sessions`
        : progressionKg < 0 ? `📉 ${progressionKg}kg (regression)`
        : `→ Stable at ${newest}kg`
        : '';

      const history = sorted.map(w => `${w.date.slice(5)}: ${w.weight}kg`).join(' → ');
      lines.push(`
[${ex.name}] (${ex.muscle ?? 'unknown muscle'})`);
      lines.push(`  Sessions: ${ex.sessions} | All-time max: ${ex.maxWeight}kg | Last trained: ${ex.lastDate}`);
      lines.push(`  Weight history: ${history}`);
      if (progressionStr) lines.push(`  Progression: ${progressionStr}`);
    });
    lines.push('');
  }

  // ── Last 5 Sessions Detail ────────────────────────────────────────────────
  const recentSessions = stats.logs.slice(0, 5);
  if (recentSessions.length > 0) {
    lines.push(`=== LAST ${recentSessions.length} SESSIONS (FULL SET-LEVEL ENIGMA) ===`);
    recentSessions.forEach(log => {
      const completedSets = log.exercises?.reduce((s, e) => s + e.setsLog.filter(set => set.completed).length, 0) ?? 0;
      const totalSets = log.exercises?.reduce((s, e) => s + e.setsLog.length, 0) ?? 0;
      const duration = log.workoutDurationMinutes ? ` | Duration: ${log.workoutDurationMinutes}min` : '';
      lines.push(`\n📅 ${log.date} — ${completedSets}/${totalSets} sets${duration}`);
      log.exercises?.forEach(ex => {
        const completedSetData = ex.setsLog
          .filter(s => s.completed)
          .map(s => `${s.reps ?? '?'}×${s.weight ?? '?'}kg`)
          .join(', ');
        if (completedSetData) {
          lines.push(`  • ${ex.name}: ${completedSetData}`);
        }
      });
    });
    lines.push('');
  }

  return lines.join('\n');
}

function buildStats(logs: GymDayLog[]): GymStats {
  const sorted = [...logs].sort((a, b) => b.date.localeCompare(a.date));
  const dateSet = new Set(sorted.map(l => l.date));
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 30; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (dateSet.has(ds)) { streak++; } else if (i > 0) break;
  }
  let totalVolume = 0, totalCardioMinutes = 0, totalCompletion = 0, workoutCount = 0;
  const exerciseMap: Record<string, { name: string; muscle?: string; sessions: number; maxWeight: number; weightHistory: Array<{ date: string; weight: number }>; lastDate: string; }> = {};
  for (const log of sorted) {
    if (!(log.exercises?.length > 0)) continue;
    workoutCount++;
    for (const c of log.cardio ?? []) { if (c.completed && c.durationMinutes) totalCardioMinutes += c.durationMinutes; }
    for (const ex of log.exercises ?? []) {
      const completedSets = ex.setsLog?.filter(s => s.completed) ?? [];
      if (completedSets.length === 0) continue;
      const maxW = completedSets.reduce((m, s) => Math.max(m, s.weight ?? 0), 0);
      totalVolume += completedSets.reduce((s, set) => s + (set.weight ?? 0) * (set.reps ?? 0), 0);
      if (!exerciseMap[ex.name]) exerciseMap[ex.name] = { name: ex.name, muscle: ex.muscle, sessions: 0, maxWeight: 0, weightHistory: [], lastDate: '' };
      const e = exerciseMap[ex.name];
      e.sessions++;
      e.maxWeight = Math.max(e.maxWeight, maxW);
      if (maxW > 0 && e.weightHistory.length < 8) e.weightHistory.push({ date: log.date, weight: maxW });
      if (!e.lastDate || log.date > e.lastDate) e.lastDate = log.date;
    }
    const total = log.exercises.reduce((s, e) => s + e.setsLog.length, 0);
    const done = log.exercises.reduce((s, e) => s + e.setsLog.filter(set => set.completed).length, 0);
    if (total > 0) totalCompletion += (done / total) * 100;
  }
  const stallAlerts: { exerciseName: string; message: string }[] = [];
  const anomalies: string[] = [];
  for (const ex of Object.values(exerciseMap)) {
    const recent = ex.weightHistory.slice(-3);
    if (recent.length >= 3 && new Set(recent.map(w => w.weight)).size === 1) {
      stallAlerts.push({ exerciseName: ex.name, message: `Stuck at ${recent[0].weight}kg for ${recent.length}+ sessions` });
    }
    // Anomaly detection: weight dropped by > 15% from max
    if (recent.length >= 1) {
      const lastW = recent[recent.length - 1].weight;
      if (lastW > 0 && ex.maxWeight > 0 && lastW < ex.maxWeight * 0.85) {
        anomalies.push(`${ex.name}: lifted ${lastW}kg last session, which is down ${Math.round((1 - lastW / ex.maxWeight) * 100)}% from all-time max (${ex.maxWeight}kg)`);
      }
    }
  }

  const dowMuscleMap: Record<number, string[]> = {};
  for (const log of sorted) {
    const dow = new Date(log.date + 'T12:00:00').getDay();
    if (!dowMuscleMap[dow]) dowMuscleMap[dow] = [];
    log.exercises?.forEach(ex => {
      if (ex.muscle && !dowMuscleMap[dow].includes(ex.muscle)) dowMuscleMap[dow].push(ex.muscle);
    });
  }

  const exerciseStats = Object.values(exerciseMap).sort((a, b) => b.sessions - a.sessions).map(e => ({ name: e.name, muscle: e.muscle, sessions: e.sessions, maxWeight: e.maxWeight, recentWeights: e.weightHistory, lastDate: e.lastDate }));
  return { totalWorkouts: workoutCount, totalVolume, totalCardioMinutes, avgCompletion: workoutCount > 0 ? totalCompletion / workoutCount : 0, streak, stallAlerts, exerciseStats, logs: sorted, dowMuscleMap, anomalies };
}

function buildWeightTargets(exercises: GymDayLog['exercises'], stats: GymStats): WeightTarget[] {
  return exercises.map(ex => {
    const stat = stats.exerciseStats.find(s => s.name === ex.name);
    if (!stat || stat.sessions === 0) return { exerciseName: ex.name, exerciseId: ex.exerciseId, muscle: ex.muscle, lastDate: null, lastMaxWeight: null, lastReps: null, recommendedWeight: null, trend: 'new', confidence: 'low' };
    const sorted = stat.recentWeights.sort((a, b) => b.date.localeCompare(a.date));
    const lastW = sorted[0]?.weight ?? null;
    const prevW = sorted[1]?.weight ?? null;
    const lastDate = sorted[0]?.date ?? null;
    let trend: WeightTarget['trend'] = 'maintain', rec = lastW, confidence: WeightTarget['confidence'] = 'medium';
    if (lastW != null && prevW != null) {
      if (lastW > prevW) { trend = 'up'; rec = lastW + 2.5; confidence = 'high'; }
      else if (lastW === prevW) { trend = 'up'; rec = lastW + 2.5; confidence = 'medium'; }
      else { trend = 'maintain'; rec = lastW; confidence = 'medium'; }
    } else if (lastW != null) { trend = 'up'; rec = lastW + 2.5; confidence = 'low'; }
    if (rec != null) rec = Math.round(rec * 2) / 2;
    return { exerciseName: ex.name, exerciseId: ex.exerciseId, muscle: ex.muscle, lastDate, lastMaxWeight: lastW, lastReps: null, recommendedWeight: rec, trend, confidence };
  });
}

function buildOpeningPrompt(mode: SessionMode, todayLog: GymDayLog | null, stats: GymStats): string {
  const doneSets = todayLog?.exercises?.reduce((s, e) => s + e.setsLog.filter(set => set.completed).length, 0) ?? 0;
  const totalSets = todayLog?.exercises?.reduce((s, e) => s + e.setsLog.length, 0) ?? 0;
  const nextEx = todayLog?.exercises?.find(e => e.setsLog.some(s => !s.completed) && !e.skipped);

  // Build today's exercise targets string
  const todayTargets = todayLog?.exercises?.slice(0, 5).map(ex => {
    const stat = stats.exerciseStats.find(s => s.name === ex.name);
    const lastW = stat?.recentWeights.sort((a,b) => b.date.localeCompare(a.date))[0]?.weight;
    return lastW ? `${ex.name} (last: ${lastW}kg)` : ex.name;
  }).join(', ') ?? '';

  const stallStr = stats.stallAlerts.length > 0
    ? ` STALL ALERTS: ${stats.stallAlerts.slice(0, 2).map(a => `${a.exerciseName} ${a.message}`).join('; ')}.`
    : '';

  if (mode === 'complete') {
    const totalVolToday = todayLog?.exercises?.reduce((s, e) =>
      s + e.setsLog.filter(set => set.completed).reduce((sv, set) => sv + (set.weight ?? 0) * (set.reps ?? 0), 0), 0) ?? 0;
    return `Workout DONE. ${doneSets} sets, ~${Math.round(totalVolToday).toLocaleString()}kg volume. Today I trained: ${todayLog?.exercises?.filter(e=>e.setsLog.some(s=>s.completed)).map(e=>e.name).join(', ') || 'various exercises'}. Give me: (1) exact post-workout nutrition macros based on my bodyweight and goal, (2) recovery priority for tonight, (3) the single most important thing to improve next session based on today's data.`;
  }
  if (mode === 'active') {
    const lastWeight = nextEx ? stats.exerciseStats.find(s => s.name === nextEx.name)?.recentWeights.sort((a,b)=>b.date.localeCompare(a.date))[0]?.weight : null;
    return `Mid-workout: ${doneSets}/${totalSets} sets done. Up next: ${nextEx?.name ?? 'last exercise'}${lastWeight ? ` (last session: ${lastWeight}kg)` : ''}. Give me: (1) exact target weight and reps for this set, (2) one key technique cue, (3) rest time recommendation.`;
  }

  // Idle — pre-workout
  const firstEx = todayLog?.exercises?.[0];
  const firstExStat = firstEx ? stats.exerciseStats.find(s => s.name === firstEx.name) : null;
  const firstExLastW = firstExStat?.recentWeights.sort((a,b)=>b.date.localeCompare(a.date))[0]?.weight;
  return `Pre-workout briefing. Today's plan: ${todayTargets || 'no exercises loaded yet'}.${stallStr} In 3 bullet points: (1) Opening warm-up weight for ${firstEx?.name ?? 'first exercise'}${firstExLastW ? ` — last session was ${firstExLastW}kg` : ''}, (2) the highest-priority lift to push hardest today based on my 30-day data, (3) one thing to watch out for in today's session.`;
}

// ── Quick Prompts ──────────────────────────────────────────────────────────────



// ── Component ──────────────────────────────────────────────────────────────────

interface ZenGymAIProps {
  userId: string | null;
  todayLog: GymDayLog | null;
  profile: GymProfile | null;
  onStatsLoaded?: (stats: GymStats) => void;
}

export const ZenGymAI = ({ userId, todayLog, profile, onStatsLoaded }: ZenGymAIProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('chat');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingContext, setIsLoadingContext] = useState(false);
  const [stats, setStats] = useState<GymStats | null>(null);
  const [showQuickPrompts, setShowQuickPrompts] = useState(true);
  const [usingOAuth, setUsingOAuth] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const chatSessionRef = useRef<any>(null);
  const statsRef = useRef<GymStats | null>(null);
  statsRef.current = stats;

  const sessionMode = useMemo<SessionMode>(() => {
    if (!todayLog?.exercises?.length) return 'idle';
    const totalSets = todayLog.exercises.reduce((s, e) => s + e.setsLog.length, 0);
    const doneSets = todayLog.exercises.reduce((s, e) => s + e.setsLog.filter(set => set.completed).length, 0);
    if (totalSets === 0) return 'idle';
    if (doneSets === totalSets) return 'complete';
    if (doneSets > 0) return 'active';
    return 'idle';
  }, [todayLog]);

  // ── Context loader ─────────────────────────────────────────────────────────

  const loadContext = useCallback(async (force = false) => {
    if (!userId) return null;
    if (!force) {
      const ts = Number(sessionStorage.getItem(CONTEXT_TS_KEY(userId)) || 0);
      const ctx = sessionStorage.getItem(CONTEXT_KEY(userId));
      const savedStatsStr = sessionStorage.getItem(STATS_KEY(userId));
      if (ctx && savedStatsStr && Date.now() - ts < CONTEXT_TTL_MS) {
        try {
          const parsedStats = JSON.parse(savedStatsStr);
          statsRef.current = parsedStats;
          setStats(parsedStats);
          if (onStatsLoaded) onStatsLoaded(parsedStats);
          return { contextString: ctx, stats: parsedStats };
        } catch { /* parse failed */ }
      }
    }
    setIsLoadingContext(true);
    try {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const cutoff = `${thirtyDaysAgo.getFullYear()}-${String(thirtyDaysAgo.getMonth() + 1).padStart(2, '0')}-${String(thirtyDaysAgo.getDate()).padStart(2, '0')}`;
      let logs: GymDayLog[] = [];
      try {
        const q = query(collection(db, 'gymLogs'), where('userId', '==', userId), where('date', '>=', cutoff), orderBy('date', 'desc'), limit(35));
        const snap = await getDocs(q);
        snap.forEach(d => logs.push(d.data() as GymDayLog));
      } catch {
        const q = query(collection(db, 'gymLogs'), where('userId', '==', userId));
        const snap = await getDocs(q);
        snap.forEach(d => logs.push(d.data() as GymDayLog));
        logs = logs.filter(l => l.date >= cutoff);
      }
      const computedStats = buildStats(logs);
      setStats(computedStats);
      if (onStatsLoaded) onStatsLoaded(computedStats);
      const ctxString = buildContextString(computedStats, profile);
      try {
        sessionStorage.setItem(CONTEXT_KEY(userId), ctxString);
        sessionStorage.setItem(CONTEXT_TS_KEY(userId), String(Date.now()));
        sessionStorage.setItem(STATS_HASH_KEY(userId), hashStats(computedStats));
        sessionStorage.setItem(STATS_KEY(userId), JSON.stringify(computedStats));
      } catch { /* storage full */ }
      return { contextString: ctxString, stats: computedStats };
    } catch (e) {
      console.error('[ZenGymAI] context load error:', e);
      return null;
    } finally {
      setIsLoadingContext(false);
    }
  }, [userId, profile]);

  const todayContextString = useMemo(() => {
    if (!todayLog) return '';
    const doneSets = todayLog.exercises.reduce((s, e) => s + e.setsLog.filter(set => set.completed).length, 0);
    const totalSets = todayLog.exercises.reduce((s, e) => s + e.setsLog.length, 0);
    const completedExercises = todayLog.exercises.filter(e => e.setsLog.every(s => s.completed) && !e.skipped);
    const lines = [
      `\n=== TODAY'S SESSION (${todayLog.date}) — LIVE ENIGMA ===`,
      `Mode: ${sessionMode.toUpperCase()}`,
      `Progress: ${doneSets}/${totalSets} sets`,
      `Completed exercises: ${completedExercises.map(e => e.name).join(', ') || 'none yet'}`,
    ];

    lines.push(`Current exercises and sets logged so far today:`);
    todayLog.exercises.forEach(ex => {
        if (ex.skipped) {
           lines.push(`- ${ex.name} (SKIPPED)`);
           return;
        }
        const setsStr = ex.setsLog.map((s, i) => `Set ${i+1}: ${s.weight ?? '?'}kg x ${s.reps ?? '?'} reps ${s.completed ? '(DONE)' : '(PENDING)'}`).join(', ');
        lines.push(`- ${ex.name}: ${setsStr}`);
    });

    const treadmill = todayLog.cardio?.find(c => c.id === 'permanent_treadmill');
    if (treadmill?.completed && (treadmill.durationMinutes || 0) > 0) {
      lines.push(`Cardio: Treadmill ${treadmill.durationMinutes}min${treadmill.distanceKm ? ` / ${treadmill.distanceKm}km` : ''}`);
    }
    return lines.join('\n');
  }, [todayLog, sessionMode]);

  const initChatSession = useCallback(async (contextString: string, existingHistory?: any[]) => {
    const formatRule = `\n\nCRITICAL FORMATTING RULE: You must always structure your responses clearly using markdown, bullet points, and double newlines for paragraph breaks. Avoid giant walls of text and never put everything on a single line. Make the text highly readable and structured.`;
    const fullContext = contextString + todayContextString + formatRule;
    const oauthToken = getLectureChatOAuthToken();
    if (oauthToken) {
      // Use personal Google account OAuth token — own quota pool
      chatSessionRef.current = startGymAIOAuthChat(fullContext, oauthToken, existingHistory || []);
      setUsingOAuth(true);
    } else {
      // Fall back to shared API key
      chatSessionRef.current = startGymAIChat(fullContext, existingHistory || []);
      setUsingOAuth(false);
    }
  }, [todayContextString]);

  // ── Open panel ─────────────────────────────────────────────────────────────

  const openPanel = useCallback(async () => {
    setIsOpen(true);
    if (!userId) return;
    try {
      const saved = sessionStorage.getItem(HISTORY_KEY(userId));
      if (saved) {
        const parsed: ChatMessage[] = JSON.parse(saved);
        setMessages(parsed);
        const ctx = sessionStorage.getItem(CONTEXT_KEY(userId)) || '';
        if (ctx && parsed.length > 0) {
          const geminiHistory = parsed.slice(0, -1).map(m => ({ role: m.role, parts: [{ text: m.text }] }));
          await initChatSession(ctx, geminiHistory);
          return;
        }
      }
    } catch { /* ignore */ }

    const result = await loadContext();
    if (!result) {
      setIsLoading(false);
      const emptyStats: GymStats = { totalWorkouts: 0, totalVolume: 0, totalCardioMinutes: 0, avgCompletion: 0, streak: 0, stallAlerts: [], exerciseStats: [], logs: [], dowMuscleMap: {}, anomalies: [] };
      setStats(emptyStats);
      setMessages([{ id: genId(), role: 'model', title: 'I had trouble loading your data. I can still chat but insights will be limited to this session!', ts: Date.now() }]);
      return;
    }

    const { contextString, stats: freshStats } = result;
    if (!contextString) return;
    await initChatSession(contextString);

    const fallbackStats: GymStats = { totalWorkouts: 0, totalVolume: 0, totalCardioMinutes: 0, avgCompletion: 0, streak: 0, stallAlerts: [], exerciseStats: [], logs: [], dowMuscleMap: {}, anomalies: [] };
    const activeStats = freshStats ?? stats ?? fallbackStats;

    // ── Sunday weekly debrief auto-trigger ────────────────────────────────────
    const todayDOW = new Date().getDay(); // 0 = Sunday
    const sundayReportKey = `zenGymAI_lastSundayReport_${userId}`;
    const lastSundayReport = sessionStorage.getItem(sundayReportKey);
    const todayStr = new Date().toDateString();
    let opening: string;
    if (todayDOW === 0 && lastSundayReport !== todayStr && activeStats.totalWorkouts > 0) {
      sessionStorage.setItem(sundayReportKey, todayStr);
      const muscleVolume = activeStats.exerciseStats
        .map((e: typeof activeStats.exerciseStats[number]) => `${e.muscle || 'unknown'}: ${e.sessions} sessions`)
        .join(', ');
      opening = `Today is Sunday — give me my complete weekly training debrief. Use my actual data:\n• Volume by muscle group this week (from my logs)\n• Which muscle I undertrained or skipped entirely\n• My best performance of the week (exercise + exact numbers)\n• Recovery quality score 1–10 based on rest day gaps between sessions\n• One specific thing to change or prioritize next week\nBe brutally honest and cite specific numbers from my logs. Here's my muscle data: ${muscleVolume}`;
    } else {
      opening = buildOpeningPrompt(sessionMode, todayLog, activeStats);
    }
    // ── End Sunday debrief ────────────────────────────────────────────────────

    setIsLoading(true);
    try {
      const aiMsgId = genId();
      setMessages([{ id: aiMsgId, role: 'model', title: '', ts: Date.now() }]);
      let finalModel = '';
      const res = await chatSessionRef.current.sendMessageStream(opening, (title: string) => {
        setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, text } : m));
      });
      finalModel = res.model || '';
      setMessages(prev => {
        const nextMsgs = prev.map(m => m.id === aiMsgId ? { ...m, title: res.text || res.text, model: finalModel } : m);
        if (userId) saveMessages(nextMsgs, userId);
        return nextMsgs;
      });
    } catch {
      setMessages([]);
      toast.error('AI is warming up — try again in a moment');
    } finally {
      setIsLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, sessionMode, todayLog, loadContext, initChatSession]);

  // ── Send message ───────────────────────────────────────────────────────────

  const send = useCallback(async (textOverride?: string) => {
    const text = (textOverride || input).trim();
    if (!text || isLoading) return;
    setInput('');
    const userMsg: ChatMessage = { id: genId(), role: 'user', text, ts: Date.now() };
    const next = [...messages, userMsg];
    setMessages(next);
    if (!chatSessionRef.current) { toast.error('AI not ready — please try reopening'); return; }
    setIsLoading(true);
    try {
      const formatReminder = `\n\n(Remember to use proper markdown formatting, bullet points, and newlines for readability. Do not put everything on one line.)`;
      const msgWithContext = todayContextString ? `[LIVE WORKOUT STATE:${todayContextString}]\n\nUser: ${text}${formatReminder}` : `${text}${formatReminder}`;
      const aiMsgId = genId();
      setMessages(prev => [...prev, { id: aiMsgId, role: 'model', title: '', ts: Date.now() }]);
      let finalModel = '';
      
      const res = await chatSessionRef.current.sendMessageStream(msgWithContext, (textChunk: string) => {
        setMessages(prev => prev.map(m => m.id === aiMsgId ? { ...m, title: textChunk } : m));
      });
      finalModel = res.model || '';
      
      setMessages(prev => {
        const nextMsgs = prev.map(m => m.id === aiMsgId ? { ...m, title: res.text || res.text, model: finalModel } : m);
        if (userId) saveMessages(nextMsgs, userId);
        return nextMsgs;
      });
    } catch (e: any) {
      setMessages(prev => [...prev, { id: genId(), role: 'model', title: `Sorry, something went wrong. ${e?.message || 'Please try again.'}`, ts: Date.now() }]);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, messages, todayContextString, userId]);

  const forceRefresh = useCallback(async () => {
    if (!userId) return;
    [CONTEXT_KEY, CONTEXT_TS_KEY, STATS_HASH_KEY, STATS_KEY, HISTORY_KEY].forEach(k => sessionStorage.removeItem(k(userId)));
    setMessages([]);
    chatSessionRef.current = null;
    toast.info('Refreshing AI context…');
    await openPanel();
  }, [userId, openPanel]);

  // ── Effects ────────────────────────────────────────────────────────────────

  // Scroll to bottom of chat
  useEffect(() => {
    if (isOpen && chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [messages, isOpen]);

  // Focus input
  useEffect(() => {
    if (isOpen && activeTab === 'chat' && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen, activeTab]);

  // iOS-compatible body scroll lock
  useEffect(() => {
    if (!isOpen) return;
    const scrollY = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      document.body.style.overflow = '';
      window.scrollTo(0, scrollY);
    };
  }, [isOpen]);

  // ── Helpers ────────────────────────────────────────────────────────────────

  function saveMessages(msgs: ChatMessage[], uid: string) {
    try { sessionStorage.setItem(HISTORY_KEY(uid), JSON.stringify(msgs.slice(-30))); } catch { /* storage full */ }
  }

  const modeBadge = {
    idle: { label: 'Planning Mode', color: '#a855f7', bg: 'rgba(124,58,237,0.12)' },
    active: { label: 'Active Session', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)' },
    complete: { label: 'Workout Done', color: '#1db954', bg: 'rgba(29,185,84,0.12)' },
  }[sessionMode];

  const stallAlerts = stats?.stallAlerts || [];

  const currentTargets = useMemo(() => {
    if (!todayLog?.exercises) return [];
    if (!stats) {
      return todayLog.exercises.map(ex => ({
        exerciseName: ex.name, exerciseId: ex.exerciseId, muscle: ex.muscle,
        lastDate: null, lastMaxWeight: null, lastReps: null,
        recommendedWeight: null, trend: 'new' as const, confidence: 'low' as const,
      }));
    }
    return buildWeightTargets(todayLog.exercises, stats);
  }, [todayLog?.exercises, stats]);

  const headerStatus = (() => {
    if (isLoadingContext) return { dot: '#a855f7', title: 'Loading your data…', pulse: true };
    if (stats) return { dot: '#1db954', title: `${stats.totalWorkouts} sessions · ${stats.streak} day streak`, pulse: false };
    return { dot: '#f59e0b', title: 'Ready — limited history', pulse: false };
  })();

  // ── Render ─────────────────────────────────────────────────────────────────

  return createPortal(
    <>
      {/* Floating AI button */}
      <button
        id="zenGymAI-toggle"
        onClick={() => { if (!isOpen) openPanel(); else setIsOpen(false); }}
        style={{
          position: 'fixed',
          bottom: 'calc(4.8rem + env(safe-area-inset-bottom, 0px))',
          right: '1rem',
          width: '54px', height: '54px', borderRadius: '50%',
          background: 'linear-gradient(135deg,#7c3aed,#a855f7)',
          border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 24px rgba(124,58,237,0.55), 0 0 0 3px rgba(124,58,237,0.15)',
          zIndex: 9900, transition: 'all 0.2s',
          animation: isOpen ? 'none' : 'aiPulse 3s ease-in-out infinite',
          touchAction: 'manipulation',
        }}
      >
        {isOpen ? <X size={22} color="#fff" /> : <MessageSquare size={22} color="#fff" />}
      </button>

      {/* Stall alert badge */}
      {!isOpen && stallAlerts.length > 0 && (
        <div style={{
          position: 'fixed',
          bottom: `calc(4.8rem + 48px + env(safe-area-inset-bottom, 0px))`,
          right: '0.75rem',
          width: '18px', height: '18px', borderRadius: '50%',
          background: '#f59e0b', border: '2px solid #000',
          zIndex: 9901, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.58rem', fontWeight: 800, color: '#000',
        }}>
          {stallAlerts.length}
        </div>
      )}

      {/* Backdrop */}
      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          onTouchStart={e => e.preventDefault()}
          onTouchMove={e => e.preventDefault()}
          style={{
            position: 'fixed', inset: 0, zIndex: 9940,
            background: 'rgba(0,0,0,0.55)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            animation: 'fadeIn 0.2s ease',
            touchAction: 'none',
          }}
        />
      )}

      {/* AI Panel — bottom sheet */}
      {isOpen && (
        <div
          id="zenGymAI-panel"
          onTouchMove={e => e.stopPropagation()}
          style={{
            position: 'fixed',
            bottom: 0, left: 0, right: 0,
            height: '78vh',
            maxHeight: '640px',
            zIndex: 9950,
            display: 'flex',
            flexDirection: 'column',
            background: 'rgba(9,7,18,0.98)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            borderRadius: '20px 20px 0 0',
            border: '1px solid rgba(124,58,237,0.2)',
            borderBottom: 'none',
            boxShadow: '0 -8px 40px rgba(0,0,0,0.6)',
            animation: 'panelSlideUp 0.28s cubic-bezier(0.34,1.2,0.64,1)',
            overflow: 'hidden',
          }}
        >
          {/* Drag handle */}
          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '0.6rem', flexShrink: 0 }}>
            <div style={{ width: '36px', height: '4px', borderRadius: '99px', background: 'rgba(255,255,255,0.15)' }} />
          </div>

          {/* Header */}
          <div style={{ padding: '0.6rem 1rem 0', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', marginBottom: '0.6rem' }}>
              <div style={{ width: '34px', height: '34px', borderRadius: '10px', background: 'linear-gradient(135deg,#7c3aed,#a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Dumbbell size={16} color="#fff" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.92rem', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  ZenGym AI
                  <span style={{ fontSize: '0.6rem', padding: '0.08rem 0.4rem', borderRadius: '99px', background: modeBadge.bg, color: modeBadge.color, fontWeight: 700 }}>
                    {modeBadge.label}
                  </span>
                </div>
                <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.38)', display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.08rem', flexWrap: 'wrap' }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: headerStatus.dot, display: 'inline-block', flexShrink: 0, animation: headerStatus.pulse ? 'pulse 1s ease-in-out infinite' : 'none' }} />
                  {headerStatus.text}
                  {isOpen && (
                    <span style={{
                      marginLeft: '0.2rem', fontSize: '0.55rem', padding: '0.05rem 0.35rem',
                      borderRadius: '99px', fontWeight: 700,
                      background: usingOAuth ? 'rgba(16,185,129,0.15)' : 'rgba(99,102,241,0.12)',
                      color: usingOAuth ? '#34d399' : '#818cf8',
                      border: `1px solid ${usingOAuth ? 'rgba(16,185,129,0.3)' : 'rgba(99,102,241,0.25)'}`,
                    }}>
                      {usingOAuth ? '🔒 Your Account' : '🔑 Shared Key'}
                    </span>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.3rem' }}>
                <button onClick={forceRefresh} title="Refresh AI data" style={{ padding: '0.4rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                  <RefreshCw size={13} />
                </button>
                <button onClick={() => setIsOpen(false)} style={{ padding: '0.4rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                  <X size={13} />
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '0.5rem' }}>
              {([
                { id: 'chat' as TabId, icon: <MessageSquare size={12} />, label: 'Chat' },
                { id: 'targets' as TabId, icon: <Target size={12} />, label: "Today's Targets" },
                { id: 'profile' as TabId, icon: <User size={12} />, label: 'Profile' },
              ] as const).map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    padding: '0.35rem 0.75rem', borderRadius: '10px',
                    border: `1px solid ${activeTab === tab.id ? 'rgba(124,58,237,0.4)' : 'rgba(255,255,255,0.08)'}`,
                    background: activeTab === tab.id ? 'rgba(124,58,237,0.15)' : 'rgba(255,255,255,0.04)',
                    color: activeTab === tab.id ? '#a855f7' : 'rgba(255,255,255,0.4)',
                    cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600,
                    display: 'flex', alignItems: 'center', gap: '0.3rem', minHeight: '34px',
                  }}
                >
                  {tab.icon} {tab.label}
                </button>
              ))}
            </div>

            {stallAlerts.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.4rem', padding: '0.4rem 0.6rem', borderRadius: '10px', background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)', marginBottom: '0.5rem' }}>
                <AlertTriangle size={12} style={{ color: '#f59e0b', flexShrink: 0, marginTop: '0.05rem' }} />
                <div style={{ fontSize: '0.68rem', color: '#f59e0b', lineHeight: 1.5 }}>
                  <strong>Stall Detected:</strong> {stallAlerts[0].exerciseName}
                  {stallAlerts.length > 1 && ` (+${stallAlerts.length - 1} more)`}
                </div>
              </div>
            )}

            <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', marginLeft: '-1rem', marginRight: '-1rem' }} />
          </div>

          {/* ── CHAT TAB ──────────────────────────────────────────────── */}
          {activeTab === 'chat' && (
            <GymChatUI
              messages={messages}
              isLoading={isLoading}
              isLoadingContext={isLoadingContext}
              input={input}
              setInput={setInput}
              send={send}
              showQuickPrompts={showQuickPrompts}
              setShowQuickPrompts={setShowQuickPrompts}
              profile={profile}
              chatRef={chatRef}
              inputRef={inputRef}
            />
          )}

          {/* ── TARGETS TAB ─────────────────────────────────────────────── */}
          {activeTab === 'targets' && (
            <GymWorkoutSummary
              stats={stats}
              todayLog={todayLog}
              currentTargets={currentTargets}
              sessionMode={sessionMode}
              profile={profile}
              setActiveTab={setActiveTab}
              send={send}
            />
          )}

          {/* ── PROFILE TAB ───────────────────────────────────────────── */}
          {activeTab === 'profile' && (
            <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {!profile ? (
                <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'rgba(255,255,255,0.4)', fontSize: '0.82rem' }}>
                  <User size={32} style={{ opacity: 0.3, margin: '0 auto 0.5rem', display: 'block' }} />
                  Your Gym Profile isn't set up yet.<br />Go to the main Gym tab to configure it.
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', padding: '0.8rem', background: 'rgba(255,255,255,0.03)', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'linear-gradient(135deg,#7c3aed,#a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <User size={24} color="#fff" />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '1rem', fontWeight: 700, color: '#fff' }}>Athlete Profile</div>
                      <div style={{ fontSize: '0.7rem', color: '#a855f7', fontWeight: 600, marginTop: '0.1rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {profile.primaryGoal}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                    <div style={{ padding: '0.6rem 0.8rem', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.2rem' }}>Bodyweight</div>
                      <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#fff' }}>{profile.bodyweightKg ? `${profile.bodyweightKg}kg` : '—'}</div>
                    </div>
                    <div style={{ padding: '0.6rem 0.8rem', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.2rem' }}>Height</div>
                      <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#fff' }}>{profile.heightCm ? `${profile.heightCm}cm` : '—'}</div>
                    </div>
                    <div style={{ padding: '0.6rem 0.8rem', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.2rem' }}>Age</div>
                      <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#fff' }}>{profile.ageYears ? `${profile.ageYears} yrs` : '—'}</div>
                    </div>
                    <div style={{ padding: '0.6rem 0.8rem', borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                      <div style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.2rem' }}>Experience</div>
                      <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#fff' }}>{profile.trainingExperienceMonths ? `${profile.trainingExperienceMonths} mo` : '—'}</div>
                    </div>
                  </div>

                  {(profile.targetBodyweightKg || profile.targetTimelineWeeks) && (
                    <div style={{ padding: '0.7rem 0.9rem', borderRadius: '12px', background: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontSize: '0.55rem', color: '#c4b5fd', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.2rem' }}>Target Goal</div>
                        <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#fff' }}>
                          {profile.targetBodyweightKg ? `${profile.targetBodyweightKg}kg` : '—'}
                        </div>
                      </div>
                      {profile.targetTimelineWeeks && (
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: '0.55rem', color: '#c4b5fd', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.2rem' }}>Timeline</div>
                          <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#fff' }}>{profile.targetTimelineWeeks} wks</div>
                        </div>
                      )}
                    </div>
                  )}

                  <button onClick={() => { setActiveTab('chat'); send("Based on my athlete profile and goal, how should I adjust my training volume and frequency?"); }}
                    style={{ marginTop: '0.25rem', padding: '0.65rem', borderRadius: '12px', background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.3)', color: '#c4b5fd', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', transition: 'all 0.2s' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(124,58,237,0.2)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(124,58,237,0.1)'; }}
                  >
                    <Sparkles size={13} /> Analyze my profile
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}

      <style>{`
        @keyframes aiPulse {
          0%, 100% { box-shadow: 0 4px 24px rgba(124,58,237,0.5); }
          50% { box-shadow: 0 4px 32px rgba(124,58,237,0.75), 0 0 0 8px rgba(124,58,237,0.12); }
        }
        @keyframes panelSlideUp {
          from { opacity:0; transform:translateY(32px); }
          to { opacity:1; transform:translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes bounce {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
      `}</style>
    </>,
    document.body,
  );
};
