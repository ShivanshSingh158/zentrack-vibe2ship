import React, { useState, useMemo, lazy, Suspense } from 'react';
import { useGlobalData } from '../../contexts/GlobalDataContext';
import {
  BarChart3, TrendingUp, TrendingDown, Dumbbell, Flame,
  CheckCircle, Clock, Sparkles, Calendar, Zap,
  School, Activity, ShieldCheck, AlertTriangle, BatteryCharging,
  Layers, ArrowUpRight, Plus, RefreshCw, Loader2, BrainCircuit
} from 'lucide-react';
import { getLocalDateString } from '../../utils/dateUtils';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  AreaChart, Area, CartesianGrid
} from 'recharts';
import { AIInsightsPanel } from '../learning/AIInsightsPanel';
import { ErrorBoundary } from '../../components/ErrorBoundary';

// Lazy-load WeeklyReviewModule
const WeeklyReviewModule = lazy(() =>
  import('../review/WeeklyReviewModule').then(m => ({ default: m.WeeklyReviewModule }))
);

type Period = '7d' | '30d' | '90d';
const PERIOD_DAYS: Record<Period, number> = { '7d': 7, '30d': 30, '90d': 90 };

// ── Mobile-Parity Safe Date String Extractor ──
function parseDateString(val: any): string {
  if (!val) return '';
  if (typeof val === 'string') {
    if (val.length >= 10 && val.includes('-')) {
      return val.slice(0, 10);
    }
    try {
      const d = new Date(val);
      if (!isNaN(d.getTime())) return getLocalDateString(d);
    } catch {}
    return val.slice(0, 10);
  }
  if (typeof val === 'number') {
    try {
      return getLocalDateString(new Date(val));
    } catch {
      return '';
    }
  }
  if (val && typeof val.toDate === 'function') {
    try {
      return getLocalDateString(val.toDate());
    } catch {
      return '';
    }
  }
  if (val && typeof val.seconds === 'number') {
    try {
      return getLocalDateString(new Date(val.seconds * 1000));
    } catch {
      return '';
    }
  }
  if (val instanceof Date) {
    try {
      return getLocalDateString(val);
    } catch {
      return '';
    }
  }
  return '';
}

// Helper: Days ago date string
function daysAgoStr(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return getLocalDateString(d);
}

// ── Mobile-Parity Streak Engine (with Sunday Rest Day Immunity) ──
function calculateMobileAppStreak(
  tasks: any[],
  gymLogs: any[],
  habitLogs: any[],
  learningTopics: any[]
): number {
  let current = 0;
  for (let i = 0; i < 365; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dStr = getLocalDateString(d);
    const dayOfWeek = d.getDay();
    const isSunday = dayOfWeek === 0;

    const hasTask = tasks.some(t => {
      const taskDate = parseDateString(t.completedAt || t.date);
      return taskDate === dStr && t.status === 'completed';
    });

    const hasGym = gymLogs.some(g => parseDateString(g.date) === dStr);
    const hasHabit = habitLogs.some(l => parseDateString(l.date) === dStr);
    const hasLearning = learningTopics.some(t =>
      (t.subTasks || []).some((s: any) => s.isCompleted && parseDateString(s.completedDate || s.date) === dStr)
    );

    const hadAnyActivity = hasTask || hasGym || hasHabit || hasLearning;

    if (hadAnyActivity) {
      current++;
    } else if (isSunday) {
      // 🏖️ SUNDAY REST DAY IMMUNITY: Sunday inactivity does not break streak
      continue;
    } else if (i > 0) {
      // If past weekday was inactive, streak breaks
      break;
    }
  }
  return current;
}

// ── Mobile-Parity Longest Streak Engine (with Sunday Bridge) ──
function calculateMobileLongestStreak(
  tasks: any[],
  gymLogs: any[],
  habitLogs: any[],
  learningTopics: any[]
): number {
  const activeDatesSet = new Set<string>();

  tasks.forEach(t => {
    if (t.status === 'completed') {
      const d = parseDateString(t.completedAt || t.date);
      if (d) activeDatesSet.add(d);
    }
  });
  gymLogs.forEach(g => {
    const d = parseDateString(g.date);
    if (d) activeDatesSet.add(d);
  });
  habitLogs.forEach(h => {
    const d = parseDateString(h.date);
    if (d) activeDatesSet.add(d);
  });
  learningTopics.forEach(t => {
    t.subTasks?.forEach((s: any) => {
      if (s.isCompleted) {
        const d = parseDateString(s.completedDate || s.date);
        if (d) activeDatesSet.add(d);
      }
    });
  });

  const sortedDates = Array.from(activeDatesSet).sort();
  if (sortedDates.length === 0) return 0;

  let maxStreak = 1;
  let currentRun = 1;

  for (let i = 1; i < sortedDates.length; i++) {
    const prev = new Date(sortedDates[i - 1] + 'T00:00:00');
    const curr = new Date(sortedDates[i] + 'T00:00:00');
    const diffDays = Math.round((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      currentRun++;
      if (currentRun > maxStreak) maxStreak = currentRun;
    } else if (diffDays === 2 && prev.getDay() === 6 && curr.getDay() === 1) {
      // 🏖️ Saturday to Monday bridge preserves streak!
      currentRun++;
      if (currentRun > maxStreak) maxStreak = currentRun;
    } else if (diffDays > 1) {
      currentRun = 1;
    }
  }

  return maxStreak;
}

// ── Precision Delta Badge Component ──
const DeltaBadge = ({ cur, prev, unit = '', color = '' }: { cur: number; prev: number; unit?: string; color?: string }) => {
  if (prev === 0 && cur === 0) {
    return <span className="analytics-delta-pill neutral">0%</span>;
  }
  const diff = cur - prev;
  const pct = prev > 0 ? Math.round((diff / prev) * 100) : (cur > 0 ? 100 : 0);
  const up = diff >= 0;

  let pillClass = up ? 'positive' : 'negative';
  if (color === 'amber') pillClass = 'amber';
  if (color === 'cyan') pillClass = 'cyan';

  return (
    <span className={`analytics-delta-pill ${pillClass}`}>
      {up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
      {up ? '+' : ''}{pct}%{unit ? ` ${unit}` : ''}
    </span>
  );
};

// ── Custom Dark Obsidian Recharts Tooltip ──
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="analytics-custom-tooltip">
      <div className="analytics-tooltip-date">{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} className="analytics-tooltip-row">
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span className="analytics-tooltip-dot" style={{ background: p.color || '#a599ff' }} />
            <span style={{ color: 'var(--text-secondary)' }}>{p.name}:</span>
          </div>
          <span style={{ fontWeight: 700, color: '#ffffff' }}>
            {typeof p.value === 'number' ? p.value.toLocaleString() : p.value}
          </span>
        </div>
      ))}
    </div>
  );
};

export const AnalyticsModule = () => (
  <ErrorBoundary name="Analytics">
    <AnalyticsModuleInner />
  </ErrorBoundary>
);

const AnalyticsModuleInner = () => {
  const {
    tasks: rawTasks,
    habitLogs: rawHabitLogs,
    gymLogs: rawGymLogs,
    attendanceSubjects,
    attendanceLogs: rawAttendanceLogs,
    learningTopics: rawLearningTopics,
    allHabits = [],
  } = useGlobalData();

  const [period, setPeriod] = useState<Period>('7d');
  const [activeTab, setActiveTab] = useState<'overview' | 'insights' | 'review'>('overview');

  const days = PERIOD_DAYS[period];
  const curStart = daysAgoStr(days - 1);
  const prevStart = daysAgoStr(days * 2 - 1);
  const prevEnd = daysAgoStr(days);

  // Guards for data lists
  const tasks = useMemo(() => Array.isArray(rawTasks) ? rawTasks : [], [rawTasks]);
  const habitLogs = useMemo(() => Array.isArray(rawHabitLogs) ? rawHabitLogs : [], [rawHabitLogs]);
  const gymLogs = useMemo(() => Array.isArray(rawGymLogs) ? rawGymLogs : [], [rawGymLogs]);
  const attendanceLogs = useMemo(() => Array.isArray(rawAttendanceLogs) ? rawAttendanceLogs : [], [rawAttendanceLogs]);
  const learningTopics = useMemo(() => Array.isArray(rawLearningTopics) ? rawLearningTopics : [], [rawLearningTopics]);

  // ── 1. Synced Streaks (Mobile Parity) ──
  const { appStreak, longestStreak } = useMemo(() => {
    const current = calculateMobileAppStreak(tasks, gymLogs, habitLogs, learningTopics);
    const longest = calculateMobileLongestStreak(tasks, gymLogs, habitLogs, learningTopics);
    return { appStreak: current, longestStreak: longest };
  }, [tasks, gymLogs, habitLogs, learningTopics]);

  // ── 2. Core Computed Stats & ZenScore Life Ring Breakdown ──
  const stats = useMemo(() => {
    let curTasks = 0, prevTasks = 0;
    let curFocus = 0, prevFocus = 0;

    for (const t of tasks) {
      if (t.status !== 'completed') continue;
      const d = parseDateString(t.completedAt || t.date);
      if (d >= curStart) {
        curTasks++;
        curFocus += (t.actualMinutes || t.estimatedMinutes || 25);
      } else if (d >= prevStart && d <= prevEnd) {
        prevTasks++;
        prevFocus += (t.actualMinutes || t.estimatedMinutes || 25);
      }
    }

    let curHabits = 0, prevHabits = 0;
    for (const l of habitLogs) {
      const d = parseDateString(l.date);
      if (!d) continue;
      if (d >= curStart) curHabits++;
      else if (d >= prevStart && d <= prevEnd) prevHabits++;
    }

    let curGym = 0, prevGym = 0;
    for (const g of gymLogs) {
      const d = parseDateString(g.date);
      if (!d) continue;
      if (d >= curStart) curGym++;
      else if (d >= prevStart && d <= prevEnd) prevGym++;
    }

    let curAttended = 0, curMissed = 0;
    let prevAttended = 0, prevMissed = 0;
    for (const l of attendanceLogs) {
      const d = parseDateString(l.date);
      if (!d) continue;
      if (d >= curStart) {
        if (l.action === 'attended') curAttended++;
        else if (l.action === 'missed') curMissed++;
      } else if (d >= prevStart && d <= prevEnd) {
        if (l.action === 'attended') prevAttended++;
        else if (l.action === 'missed') prevMissed++;
      }
    }

    const totalAtt = curAttended + curMissed;
    const attendancePct = totalAtt > 0 ? (curAttended / totalAtt) * 100 : 100;

    // Weighted Formula Targets
    const targetTasks = days * 3;
    const targetGym = Math.max(1, Math.round(days * (4 / 7)));
    const targetFocus = days * 30; // 30 mins/day target
    const targetHabits = days * 2;

    const computeBreakdown = (tCount: number, gCount: number, fMins: number, hCount: number, totAtt: number, attPct: number) => {
      const taskScore = Math.min(25, (tCount / targetTasks) * 25);
      const gymScore = targetGym > 0 ? Math.min(30, (gCount / targetGym) * 30) : 30;
      const focusScore = Math.min(25, (fMins / targetFocus) * 25);
      const habitScore = Math.min(20, (hCount / targetHabits) * 20);

      let base = taskScore + gymScore + focusScore + habitScore;
      let attMod = 0;
      if (totAtt > 0) {
        if (attPct >= 90) attMod = 5;
        else if (attPct < 50) attMod = -10;
      }
      const finalScore = Math.max(0, Math.min(100, Math.round(base + attMod)));
      return {
        score: finalScore,
        taskScore: Math.round(taskScore),
        gymScore: Math.round(gymScore),
        focusScore: Math.round(focusScore),
        habitScore: Math.round(habitScore),
        attMod
      };
    };

    const curBreakdown = computeBreakdown(curTasks, curGym, curFocus, curHabits, totalAtt, attendancePct);
    const prevTotalAtt = prevAttended + prevMissed;
    const prevAttendancePct = prevTotalAtt > 0 ? (prevAttended / prevTotalAtt) * 100 : 100;
    const prevBreakdown = computeBreakdown(prevTasks, prevGym, prevFocus, prevHabits, prevTotalAtt, prevAttendancePct);

    return {
      curTasks, prevTasks,
      curGym, prevGym,
      curFocus, prevFocus,
      curHabits, prevHabits,
      curAttended, curMissed,
      attendancePct: Math.round(attendancePct),
      zenScore: curBreakdown.score,
      prevZen: prevBreakdown.score,
      breakdown: curBreakdown,
      targetTasks,
      targetGym,
      targetFocus,
      targetHabits,
    };
  }, [tasks, habitLogs, gymLogs, attendanceLogs, period, curStart, prevStart, prevEnd, days]);

  // ── 3. Task Completion Dual-Bar Chart Data (Current vs Previous) ──
  const taskChartData = useMemo(() => {
    const taskDateCounts = new Map<string, number>();
    for (const t of tasks) {
      if (t.status !== 'completed') continue;
      const d = parseDateString(t.completedAt || t.date);
      if (d) taskDateCounts.set(d, (taskDateCounts.get(d) || 0) + 1);
    }

    const n = Math.min(days, 14);
    const step = days <= 7 ? 1 : days <= 30 ? 2 : 7;
    const result = [];
    for (let i = n - 1; i >= 0; i -= step) {
      const d = daysAgoStr(i);
      const dPrev = daysAgoStr(i + days);
      result.push({
        label: d.slice(5),
        current: taskDateCounts.get(d) || 0,
        previous: taskDateCounts.get(dPrev) || 0,
      });
    }
    return result;
  }, [tasks, days]);

  // ── 4. Habit Consistency Area Chart Data ──
  const habitChartData = useMemo(() => {
    const habitDateCounts = new Map<string, number>();
    for (const l of habitLogs) {
      const d = parseDateString(l.date);
      if (d) habitDateCounts.set(d, (habitDateCounts.get(d) || 0) + 1);
    }

    const activeCount = Math.max(allHabits.filter((h: any) => !h.archived).length, 1);
    const n = Math.min(days, 14);
    const step = days <= 7 ? 1 : days <= 30 ? 2 : 7;
    const result = [];
    for (let i = n - 1; i >= 0; i -= step) {
      const d = daysAgoStr(i);
      const done = habitDateCounts.get(d) || 0;
      const rate = Math.min(100, Math.round((done / activeCount) * 100));
      result.push({
        label: d.slice(5),
        rate,
        completed: done
      });
    }
    return result;
  }, [habitLogs, allHabits, days]);

  // ── 5. Attendance Stacked Bar Chart Data ──
  const attendanceChartData = useMemo(() => {
    const attMap = new Map<string, { attended: number; missed: number }>();
    for (const l of attendanceLogs) {
      const d = parseDateString(l.date);
      if (!d) continue;
      const entry = attMap.get(d) || { attended: 0, missed: 0 };
      if (l.action === 'attended') entry.attended++;
      else if (l.action === 'missed') entry.missed++;
      attMap.set(d, entry);
    }

    const buckets = days <= 7 ? 7 : days <= 30 ? 6 : 8;
    const step = days <= 7 ? 1 : days <= 30 ? 5 : 11;
    const result = [];
    for (let b = buckets - 1; b >= 0; b--) {
      const startDay = b * step + step - 1;
      const endDay = b * step;
      const startStr = daysAgoStr(startDay);
      let attended = 0, missed = 0;
      for (let i = startDay; i >= endDay; i--) {
        const targetDate = daysAgoStr(i);
        const dayCounts = attMap.get(targetDate);
        if (dayCounts) {
          attended += dayCounts.attended;
          missed += dayCounts.missed;
        }
      }
      result.push({
        label: startStr.slice(5),
        attended,
        missed,
      });
    }
    return result;
  }, [attendanceLogs, days]);

  // ── 6. Gym Volume Progression ──
  const gymChartData = useMemo(() => {
    const gymDateMap = new Map<string, any>();
    for (const g of gymLogs) {
      const d = parseDateString(g.date);
      if (d) gymDateMap.set(d, g);
    }

    const n = Math.min(days, 14);
    const step = days <= 7 ? 1 : days <= 30 ? 2 : 7;
    const result = [];

    for (let i = n - 1; i >= 0; i -= step) {
      const d = daysAgoStr(i);
      const log = gymDateMap.get(d);
      let volume = 0;
      let maxWeight = 0;

      if (log?.exercises) {
        for (const ex of log.exercises) {
          const sets = ex.setsLog || ex.sets || [];
          for (const s of sets) {
            if (s.completed || s.weight) {
              const w = Number(s.weight) || 0;
              const r = Number(s.reps) || 0;
              volume += (w * r);
              maxWeight = Math.max(maxWeight, w);
            }
          }
        }
      }

      result.push({
        label: d.slice(5),
        volume: Math.round(volume),
        maxWeight,
      });
    }
    return result;
  }, [gymLogs, days]);

  // ── 7. Deep Focus Time Trend Chart Data ──
  const focusChartData = useMemo(() => {
    const focusMap = new Map<string, number>();
    for (const t of tasks) {
      if (t.status !== 'completed') continue;
      const d = parseDateString(t.completedAt || t.date);
      if (d) {
        const mins = t.actualMinutes || t.estimatedMinutes || 25;
        focusMap.set(d, (focusMap.get(d) || 0) + mins);
      }
    }

    const n = Math.min(days, 14);
    const step = days <= 7 ? 1 : days <= 30 ? 2 : 7;
    const result = [];
    for (let i = n - 1; i >= 0; i -= step) {
      const d = daysAgoStr(i);
      const mins = focusMap.get(d) || 0;
      result.push({
        label: d.slice(5),
        focusHours: Number((mins / 60).toFixed(1)),
        focusMinutes: mins,
      });
    }
    return result;
  }, [tasks, days]);

  // ── 8. 35-Day (5-Week) Multi-Domain Contribution Heatmap Data ──
  const heatmapCells = useMemo(() => {
    const taskDateCounts = new Map<string, number>();
    for (const t of tasks) {
      if (t.status === 'completed') {
        const d = parseDateString(t.completedAt || t.date);
        if (d) taskDateCounts.set(d, (taskDateCounts.get(d) || 0) + 1);
      }
    }

    const gymDateMap = new Map<string, number>();
    for (const g of gymLogs) {
      const d = parseDateString(g.date);
      if (d) gymDateMap.set(d, (gymDateMap.get(d) || 0) + 1);
    }

    const habitDateCounts = new Map<string, number>();
    for (const l of habitLogs) {
      const d = parseDateString(l.date);
      if (d) habitDateCounts.set(d, (habitDateCounts.get(d) || 0) + 1);
    }

    const learningDateCounts = new Map<string, number>();
    for (const t of learningTopics) {
      for (const s of (t.subTasks || [])) {
        if (s.isCompleted) {
          const d = parseDateString(s.completedDate || s.date || t.updatedAt);
          if (d) learningDateCounts.set(d, (learningDateCounts.get(d) || 0) + 1);
        }
      }
    }

    const cells = [];
    for (let i = 34; i >= 0; i--) {
      const dateStr = daysAgoStr(i);
      const tCount = taskDateCounts.get(dateStr) || 0;
      const gCount = gymDateMap.get(dateStr) || 0;
      const hCount = habitDateCounts.get(dateStr) || 0;
      const lCount = learningDateCounts.get(dateStr) || 0;
      const total = tCount + gCount + hCount + lCount;

      let level = 'level-0';
      if (total === 1) level = 'level-1';
      else if (total === 2) level = 'level-2';
      else if (total >= 3) level = 'level-3';

      cells.push({
        date: dateStr,
        displayDate: dateStr.slice(5),
        dayNum: dateStr.slice(8), // e.g. "27"
        total,
        tCount,
        gCount,
        hCount,
        lCount,
        level,
      });
    }
    return cells;
  }, [tasks, gymLogs, habitLogs, learningTopics]);

  // SVG Concentric Ring Math
  const RING_SIZE = 180;
  const RING_R = 72;
  const CIRC = 2 * Math.PI * RING_R;
  const strokeOffset = CIRC - (stats.zenScore / 100) * CIRC;
  const totalHeatmapActions = heatmapCells.reduce((acc, c) => acc + c.total, 0);

  return (
    <div className="analytics-module-root">
      {/* ── TOP HERO HEADER BAR ── */}
      <div className="analytics-header-bar">
        <div className="analytics-header-left">
          <h1 className="analytics-hero-title">
            <Activity size={22} color="#a599ff" />
            Analytics & Telemetry
          </h1>
          <div className="analytics-live-badge">
            <span className="analytics-live-dot" />
            <span>Live Sync</span>
          </div>
        </div>

        <div className="analytics-header-actions">
          {/* Segmented Period Selector */}
          <div className="analytics-period-selector">
            <button
              type="button"
              className={`analytics-period-btn ${period === '7d' ? 'active' : ''}`}
              onClick={() => setPeriod('7d')}
            >
              7D (Week)
            </button>
            <button
              type="button"
              className={`analytics-period-btn ${period === '30d' ? 'active' : ''}`}
              onClick={() => setPeriod('30d')}
            >
              30D (Month)
            </button>
            <button
              type="button"
              className={`analytics-period-btn ${period === '90d' ? 'active' : ''}`}
              onClick={() => setPeriod('90d')}
            >
              90D (Semester)
            </button>
          </div>

          {/* Module View Switcher */}
          <button
            type="button"
            className={`analytics-tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            <BarChart3 size={15} />
            <span>Overview</span>
          </button>

          <button
            type="button"
            className={`analytics-tab-btn ${activeTab === 'insights' ? 'active' : ''}`}
            onClick={() => setActiveTab('insights')}
          >
            <Sparkles size={15} color="#a599ff" />
            <span>S.A.R.A AI Insights</span>
          </button>

          <button
            type="button"
            className={`analytics-tab-btn ${activeTab === 'review' ? 'active' : ''}`}
            onClick={() => setActiveTab('review')}
          >
            <Calendar size={15} />
            <span>Weekly Review</span>
          </button>
        </div>
      </div>

      {activeTab === 'overview' ? (
        <>
          {/* ── ZONE 1: HERO ZEN SCORE & 6 VITALITY KPI TILES (PERFECT 3X2 GRID) ── */}
          <div className="analytics-hero-card">
            {/* ZenScore Concentric Progress Ring */}
            <div className="analytics-ring-box">
              <div className="analytics-ring-svg-container">
                <svg width={RING_SIZE} height={RING_SIZE} style={{ transform: 'rotate(-90deg)' }}>
                  <defs>
                    <linearGradient id="zenRingGrad" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#a599ff" />
                      <stop offset="100%" stopColor="#38bdf8" />
                    </linearGradient>
                  </defs>
                  <circle
                    cx={RING_SIZE / 2}
                    cy={RING_SIZE / 2}
                    r={RING_R}
                    stroke="rgba(255, 255, 255, 0.07)"
                    strokeWidth="12"
                    fill="none"
                  />
                  <circle
                    cx={RING_SIZE / 2}
                    cy={RING_SIZE / 2}
                    r={RING_R}
                    stroke="url(#zenRingGrad)"
                    strokeWidth="12"
                    fill="none"
                    strokeDasharray={CIRC}
                    strokeDashoffset={strokeOffset}
                    strokeLinecap="round"
                    style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(0.16, 1, 0.3, 1)' }}
                  />
                </svg>

                <div className="analytics-ring-inner">
                  <div className="analytics-ring-score">{stats.zenScore}</div>
                  <div className="analytics-ring-label">ZenScore</div>
                  <div className="analytics-ring-delta" style={{ color: stats.zenScore >= stats.prevZen ? '#5eda9e' : '#ff6961' }}>
                    {stats.zenScore >= stats.prevZen ? `+${stats.zenScore - stats.prevZen}` : `${stats.zenScore - stats.prevZen}`} vs prev
                  </div>
                </div>
              </div>

              {/* Domain Weight Breakdown Meter */}
              <div className="analytics-domain-meter">
                <div className="analytics-domain-meter-title">
                  <span>Domain Breakdown</span>
                  <span>100 pts target</span>
                </div>
                <div className="analytics-domain-bars">
                  <div
                    className="analytics-domain-bar-segment"
                    style={{ width: `${stats.breakdown.taskScore}%`, background: '#5eda9e' }}
                    title={`Tasks: ${stats.breakdown.taskScore}/25 pts`}
                  />
                  <div
                    className="analytics-domain-bar-segment"
                    style={{ width: `${stats.breakdown.gymScore}%`, background: '#fbbf24' }}
                    title={`Gym: ${stats.breakdown.gymScore}/30 pts`}
                  />
                  <div
                    className="analytics-domain-bar-segment"
                    style={{ width: `${stats.breakdown.focusScore}%`, background: '#38bdf8' }}
                    title={`Focus: ${stats.breakdown.focusScore}/25 pts`}
                  />
                  <div
                    className="analytics-domain-bar-segment"
                    style={{ width: `${stats.breakdown.habitScore}%`, background: '#a599ff' }}
                    title={`Habits: ${stats.breakdown.habitScore}/20 pts`}
                  />
                </div>
                <div className="analytics-domain-legend">
                  <span className="analytics-domain-pill">
                    <span className="analytics-domain-dot" style={{ background: '#5eda9e' }} /> Tasks (25%)
                  </span>
                  <span className="analytics-domain-pill">
                    <span className="analytics-domain-dot" style={{ background: '#fbbf24' }} /> Gym (30%)
                  </span>
                  <span className="analytics-domain-pill">
                    <span className="analytics-domain-dot" style={{ background: '#38bdf8' }} /> Focus (25%)
                  </span>
                  <span className="analytics-domain-pill">
                    <span className="analytics-domain-dot" style={{ background: '#a599ff' }} /> Habits (20%)
                  </span>
                </div>
              </div>
            </div>

            {/* 6 Precision Vitality Tiles (Structured 3x2 Grid) */}
            <div className="analytics-summary-grid">
              {/* Tile 1: Tasks Completed */}
              <div className="analytics-stat-card card-tasks">
                <div className="analytics-tile-header">
                  <div className="analytics-tile-title-group">
                    <div className="analytics-stat-icon-box" style={{ background: 'rgba(94, 218, 158, 0.14)', color: '#5eda9e', borderColor: 'rgba(94, 218, 158, 0.3)' }}>
                      <CheckCircle size={16} />
                    </div>
                    <div className="analytics-tile-label-box">
                      <span className="analytics-tile-category">Execution</span>
                      <span className="analytics-stat-label">Tasks Done</span>
                    </div>
                  </div>
                  <DeltaBadge cur={stats.curTasks} prev={stats.prevTasks} />
                </div>
                <div className="analytics-tile-value-row">
                  <span className="analytics-stat-val">{stats.curTasks}</span>
                  <span className="analytics-tile-target-pill">/ {stats.targetTasks} target</span>
                </div>
                <div className="analytics-stat-meter-track">
                  <div
                    className="analytics-stat-meter-fill"
                    style={{
                      width: `${Math.min(100, (stats.curTasks / (stats.targetTasks || 1)) * 100)}%`,
                      background: 'linear-gradient(90deg, #5eda9e, #38bdf8)'
                    }}
                  />
                </div>
                <div className="analytics-stat-submeta">
                  <span>Pace</span>
                  <span>{stats.curTasks} completed this {period}</span>
                </div>
              </div>

              {/* Tile 2: Gym Sessions */}
              <div className="analytics-stat-card card-gym">
                <div className="analytics-tile-header">
                  <div className="analytics-tile-title-group">
                    <div className="analytics-stat-icon-box" style={{ background: 'rgba(251, 191, 36, 0.14)', color: '#fbbf24', borderColor: 'rgba(251, 191, 36, 0.3)' }}>
                      <Dumbbell size={16} />
                    </div>
                    <div className="analytics-tile-label-box">
                      <span className="analytics-tile-category">Fitness</span>
                      <span className="analytics-stat-label">Gym Sessions</span>
                    </div>
                  </div>
                  <DeltaBadge cur={stats.curGym} prev={stats.prevGym} color="amber" />
                </div>
                <div className="analytics-tile-value-row">
                  <span className="analytics-stat-val">{stats.curGym}d</span>
                  <span className="analytics-tile-target-pill">/ {stats.targetGym}d goal</span>
                </div>
                <div className="analytics-stat-meter-track">
                  <div
                    className="analytics-stat-meter-fill"
                    style={{
                      width: `${Math.min(100, (stats.curGym / (stats.targetGym || 1)) * 100)}%`,
                      background: 'linear-gradient(90deg, #fbbf24, #f59e0b)'
                    }}
                  />
                </div>
                <div className="analytics-stat-submeta">
                  <span>Cadence</span>
                  <span>{stats.curGym} logged workouts</span>
                </div>
              </div>

              {/* Tile 3: Deep Focus Time */}
              <div className="analytics-stat-card card-focus">
                <div className="analytics-tile-header">
                  <div className="analytics-tile-title-group">
                    <div className="analytics-stat-icon-box" style={{ background: 'rgba(56, 189, 248, 0.14)', color: '#38bdf8', borderColor: 'rgba(56, 189, 248, 0.3)' }}>
                      <Clock size={16} />
                    </div>
                    <div className="analytics-tile-label-box">
                      <span className="analytics-tile-category">Cognitive</span>
                      <span className="analytics-stat-label">Deep Focus</span>
                    </div>
                  </div>
                  <DeltaBadge cur={stats.curFocus} prev={stats.prevFocus} color="cyan" />
                </div>
                <div className="analytics-tile-value-row">
                  <span className="analytics-stat-val">
                    {stats.curFocus >= 60 ? `${(stats.curFocus / 60).toFixed(1)}h` : `${stats.curFocus}m`}
                  </span>
                  <span className="analytics-tile-target-pill">/ {(days * 0.5).toFixed(1)}h pace</span>
                </div>
                <div className="analytics-stat-meter-track">
                  <div
                    className="analytics-stat-meter-fill"
                    style={{
                      width: `${Math.min(100, (stats.curFocus / (stats.targetFocus || 1)) * 100)}%`,
                      background: 'linear-gradient(90deg, #38bdf8, #818cf8)'
                    }}
                  />
                </div>
                <div className="analytics-stat-submeta">
                  <span>Avg Flow</span>
                  <span>{(stats.curFocus / (days || 1)).toFixed(0)}m daily average</span>
                </div>
              </div>

              {/* Tile 4: Active Streak (Mobile Parity) */}
              <div className="analytics-stat-card card-streak">
                <div className="analytics-tile-header">
                  <div className="analytics-tile-title-group">
                    <div className="analytics-stat-icon-box" style={{ background: 'rgba(245, 158, 11, 0.16)', color: '#f59e0b', borderColor: 'rgba(245, 158, 11, 0.35)' }}>
                      <Flame size={16} />
                    </div>
                    <div className="analytics-tile-label-box">
                      <span className="analytics-tile-category">Momentum</span>
                      <span className="analytics-stat-label">Active Streak</span>
                    </div>
                  </div>
                  <span className="analytics-delta-pill streak">🔥 Active</span>
                </div>
                <div className="analytics-tile-value-row">
                  <span className="analytics-stat-val">{appStreak}d</span>
                  <span className="analytics-tile-target-pill">Best: {longestStreak}d</span>
                </div>
                <div className="analytics-stat-meter-track">
                  <div
                    className="analytics-stat-meter-fill"
                    style={{
                      width: `${Math.min(100, (appStreak / 30) * 100)}%`,
                      background: 'linear-gradient(90deg, #f59e0b, #ec4899)'
                    }}
                  />
                </div>
                <div className="analytics-stat-submeta">
                  <span>Protection</span>
                  <span>Sunday Rest Immunity</span>
                </div>
              </div>

              {/* Tile 5: Habits Checked */}
              <div className="analytics-stat-card card-habits">
                <div className="analytics-tile-header">
                  <div className="analytics-tile-title-group">
                    <div className="analytics-stat-icon-box" style={{ background: 'rgba(165, 153, 255, 0.14)', color: '#a599ff', borderColor: 'rgba(165, 153, 255, 0.3)' }}>
                      <Zap size={16} />
                    </div>
                    <div className="analytics-tile-label-box">
                      <span className="analytics-tile-category">Ritual</span>
                      <span className="analytics-stat-label">Habits Checked</span>
                    </div>
                  </div>
                  <DeltaBadge cur={stats.curHabits} prev={stats.prevHabits} />
                </div>
                <div className="analytics-tile-value-row">
                  <span className="analytics-stat-val">{stats.curHabits}</span>
                  <span className="analytics-tile-target-pill">/ {stats.targetHabits} target</span>
                </div>
                <div className="analytics-stat-meter-track">
                  <div
                    className="analytics-stat-meter-fill"
                    style={{
                      width: `${Math.min(100, (stats.curHabits / (stats.targetHabits || 1)) * 100)}%`,
                      background: 'linear-gradient(90deg, #a599ff, #c084fc)'
                    }}
                  />
                </div>
                <div className="analytics-stat-submeta">
                  <span>Consistency</span>
                  <span>{stats.curHabits} active check-ins</span>
                </div>
              </div>

              {/* Tile 6: Semester Attendance */}
              <div className={`analytics-stat-card card-attendance ${stats.attendancePct < 75 ? 'risk' : ''}`}>
                <div className="analytics-tile-header">
                  <div className="analytics-tile-title-group">
                    <div
                      className="analytics-stat-icon-box"
                      style={{
                        background: stats.attendancePct >= 75 ? 'rgba(94, 218, 158, 0.14)' : 'rgba(255, 105, 97, 0.14)',
                        color: stats.attendancePct >= 75 ? '#5eda9e' : '#ff6961',
                        borderColor: stats.attendancePct >= 75 ? 'rgba(94, 218, 158, 0.3)' : 'rgba(255, 105, 97, 0.3)'
                      }}
                    >
                      <School size={16} />
                    </div>
                    <div className="analytics-tile-label-box">
                      <span className="analytics-tile-category">Academic</span>
                      <span className="analytics-stat-label">Attendance</span>
                    </div>
                  </div>
                  <span className={`analytics-delta-pill ${stats.attendancePct >= 75 ? 'positive' : 'negative'}`}>
                    {stats.attendancePct >= 75 ? '🛡️ Safe Zone' : '⚠️ Risk'}
                  </span>
                </div>
                <div className="analytics-tile-value-row">
                  <span className="analytics-stat-val">{stats.attendancePct}%</span>
                  <span className="analytics-tile-target-pill">
                    {stats.curAttended} / {stats.curAttended + stats.curMissed} sessions
                  </span>
                </div>
                <div className="analytics-stat-meter-track">
                  <div
                    className="analytics-stat-meter-fill"
                    style={{
                      width: `${Math.min(100, stats.attendancePct)}%`,
                      background: stats.attendancePct >= 75 ? 'linear-gradient(90deg, #5eda9e, #38bdf8)' : 'linear-gradient(90deg, #ff6961, #f43f5e)'
                    }}
                  />
                </div>
                <div className="analytics-stat-submeta">
                  <span>Threshold</span>
                  <span>75% Minimum Required</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── ZONE 2: 2X3 TELEMETRY GRID (ALL CARDS SAME SIZE & ALIGNED) ── */}
          <div className="analytics-charts-grid">
            {/* Row 1, Card 1: Task Completion Velocity */}
            <div className="analytics-chart-card">
              <div className="analytics-chart-header">
                <div>
                  <h3 className="analytics-chart-title">
                    <CheckCircle size={16} color="#a599ff" />
                    Task Completion Velocity
                  </h3>
                  <div className="analytics-chart-subtitle">Comparing current vs previous {period}</div>
                </div>
                <div className="analytics-chart-legend">
                  <div className="analytics-legend-item">
                    <span className="analytics-legend-dot" style={{ background: '#a599ff' }} />
                    <span>Current</span>
                  </div>
                  <div className="analytics-legend-item">
                    <span className="analytics-legend-dot" style={{ background: 'rgba(165, 153, 255, 0.35)' }} />
                    <span>Previous</span>
                  </div>
                </div>
              </div>

              <div style={{ width: '100%', height: 230 }}>
                <ResponsiveContainer>
                  <BarChart data={taskChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="label" stroke="#8e8e93" fontSize={11} tickLine={false} />
                    <YAxis stroke="#8e8e93" fontSize={11} tickLine={false} allowDecimals={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="current" name="Current" fill="#a599ff" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="previous" name="Previous" fill="rgba(165, 153, 255, 0.35)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Row 1, Card 2: Habit Consistency Flow */}
            <div className="analytics-chart-card">
              <div className="analytics-chart-header">
                <div>
                  <h3 className="analytics-chart-title">
                    <Zap size={16} color="#38bdf8" />
                    Habit Consistency Flow
                  </h3>
                  <div className="analytics-chart-subtitle">% of active habits completed per day</div>
                </div>
                <div className="analytics-chart-legend">
                  <div className="analytics-legend-item">
                    <span className="analytics-legend-dot" style={{ background: '#38bdf8' }} />
                    <span>Completion Rate (%)</span>
                  </div>
                </div>
              </div>

              <div style={{ width: '100%', height: 230 }}>
                <ResponsiveContainer>
                  <AreaChart data={habitChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="habitAreaGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#38bdf8" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="label" stroke="#8e8e93" fontSize={11} tickLine={false} />
                    <YAxis stroke="#8e8e93" fontSize={11} tickLine={false} domain={[0, 100]} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="rate"
                      name="Consistency Rate (%)"
                      stroke="#38bdf8"
                      strokeWidth={2.5}
                      fill="url(#habitAreaGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Row 2, Card 3: Class Attendance Ratio */}
            <div className="analytics-chart-card">
              <div className="analytics-chart-header">
                <div>
                  <h3 className="analytics-chart-title">
                    <School size={16} color="#5eda9e" />
                    Academic Attendance Ratio
                  </h3>
                  <div className="analytics-chart-subtitle">Attended vs missed sessions across interval</div>
                </div>
                <div className="analytics-chart-legend">
                  <div className="analytics-legend-item">
                    <span className="analytics-legend-dot" style={{ background: '#5eda9e' }} />
                    <span>Attended</span>
                  </div>
                  <div className="analytics-legend-item">
                    <span className="analytics-legend-dot" style={{ background: '#ff6961' }} />
                    <span>Missed</span>
                  </div>
                </div>
              </div>

              <div style={{ width: '100%', height: 230 }}>
                <ResponsiveContainer>
                  <BarChart data={attendanceChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="label" stroke="#8e8e93" fontSize={11} tickLine={false} />
                    <YAxis stroke="#8e8e93" fontSize={11} tickLine={false} allowDecimals={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="attended" name="Attended" stackId="a" fill="#5eda9e" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="missed" name="Missed" stackId="a" fill="#ff6961" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Row 2, Card 4: Gym Strength & Volume Progression */}
            <div className="analytics-chart-card">
              <div className="analytics-chart-header">
                <div>
                  <h3 className="analytics-chart-title">
                    <Dumbbell size={16} color="#fbbf24" />
                    Gym Total Volume Progression
                  </h3>
                  <div className="analytics-chart-subtitle">Daily training volume (weight × reps in kg/lbs)</div>
                </div>
                <div className="analytics-chart-legend">
                  <div className="analytics-legend-item">
                    <span className="analytics-legend-dot" style={{ background: '#fbbf24' }} />
                    <span>Workout Volume</span>
                  </div>
                </div>
              </div>

              <div style={{ width: '100%', height: 230 }}>
                <ResponsiveContainer>
                  <BarChart data={gymChartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="label" stroke="#8e8e93" fontSize={11} tickLine={false} />
                    <YAxis stroke="#8e8e93" fontSize={11} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="volume" name="Volume" fill="#fbbf24" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Row 3, Card 5: 35-Day Multi-Domain Contribution Heatmap (Synced with Mobile Data) */}
            <div className="analytics-chart-card">
              <div className="analytics-chart-header">
                <div>
                  <h3 className="analytics-chart-title">
                    <Activity size={16} color="#a599ff" />
                    35-Day Contribution Heatmap
                  </h3>
                  <div className="analytics-chart-subtitle">Density of tasks, gym, habits & learning logged</div>
                </div>
                <span className="analytics-delta-pill streak">
                  🔥 {appStreak}d Streak
                </span>
              </div>

              <div className="analytics-heatmap-container">
                <div className="analytics-heatmap-weekdays">
                  {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((dayLabel, dIdx) => (
                    <span key={dIdx} className="analytics-heatmap-weekday-label">{dayLabel}</span>
                  ))}
                </div>

                <div className="analytics-heatmap-matrix">
                  {heatmapCells.map((cell, idx) => (
                    <div
                      key={idx}
                      className={`analytics-heatmap-tile ${cell.level}`}
                      title={`${cell.date}: ${cell.total} actions logged (${cell.tCount} tasks, ${cell.gCount} gym, ${cell.hCount} habits, ${cell.lCount} learning)`}
                    >
                      <span className="analytics-heatmap-tile-date">{cell.dayNum}</span>
                      {cell.total > 0 && <span className="analytics-heatmap-tile-count">{cell.total}</span>}
                    </div>
                  ))}
                </div>
              </div>

              <div className="analytics-heatmap-footer">
                <span>{totalHeatmapActions} total logged actions</span>
                <div className="analytics-heatmap-legend">
                  <span>Less</span>
                  <span className="analytics-heatmap-key-sq" style={{ background: 'rgba(255,255,255,0.04)' }} />
                  <span className="analytics-heatmap-key-sq" style={{ background: 'rgba(165,153,255,0.22)' }} />
                  <span className="analytics-heatmap-key-sq" style={{ background: 'rgba(165,153,255,0.50)' }} />
                  <span className="analytics-heatmap-key-sq" style={{ background: '#a599ff' }} />
                  <span>More</span>
                </div>
              </div>
            </div>

            {/* Row 3, Card 6: Deep Focus Work Trend */}
            <div className="analytics-chart-card">
              <div className="analytics-chart-header">
                <div>
                  <h3 className="analytics-chart-title">
                    <Clock size={16} color="#38bdf8" />
                    Deep Focus Work Flow
                  </h3>
                  <div className="analytics-chart-subtitle">Daily focused execution hours vs 30m target</div>
                </div>
                <div className="analytics-chart-legend">
                  <div className="analytics-legend-item">
                    <span className="analytics-legend-dot" style={{ background: '#38bdf8' }} />
                    <span>Focus (Hours)</span>
                  </div>
                </div>
              </div>

              <div style={{ width: '100%', height: 230 }}>
                <ResponsiveContainer>
                  <BarChart data={focusChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    <XAxis dataKey="label" stroke="#8e8e93" fontSize={11} tickLine={false} />
                    <YAxis stroke="#8e8e93" fontSize={11} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="focusHours" name="Focus Time (Hours)" fill="#38bdf8" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </>
      ) : activeTab === 'insights' ? (
        /* ── ZONE 4: S.A.R.A PREDICTIVE INTELLIGENCE & AI DIAGNOSTICS (TAB 2) ── */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Predictive Intelligence Telemetry Cards */}
          <div className="analytics-sara-grid">
            {/* Diagnostic 1: Productivity Momentum */}
            <div className="analytics-diagnostics-card highlight">
              <div className="analytics-diagnostics-header">
                <span className="analytics-diagnostics-title">
                  <BrainCircuit size={17} color="#a599ff" />
                  Productivity Momentum
                </span>
                <span className="analytics-delta-pill positive">
                  {stats.zenScore >= 70 ? '⚡ Peak Flow' : stats.zenScore >= 45 ? '⚖️ Stable' : '⚠️ Low Energy'}
                </span>
              </div>
              <div className="analytics-callout-box">
                {stats.zenScore >= 70
                  ? `Your execution velocity is in the top tier this ${period}. Focus volume is averaging ${(stats.curFocus / (days || 1)).toFixed(0)}m daily with a ${appStreak}-day continuous momentum.`
                  : `Focus momentum is pacing at ${(stats.curFocus / (days || 1)).toFixed(0)}m daily. Schedule 1 uninterrupted deep-work block to elevate your score.`}
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                  <span>Burnout Risk Meter</span>
                  <span>{stats.curFocus > 360 ? 'Moderate Load' : 'Safe Velocity'}</span>
                </div>
                <div className="analytics-meter-track">
                  <div
                    className="analytics-meter-fill"
                    style={{
                      width: `${Math.min(100, (stats.curFocus / (days * 60)) * 100)}%`,
                      background: stats.curFocus > 360 ? '#fbbf24' : '#5eda9e'
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Diagnostic 2: GPA & Attendance Forecast */}
            <div className="analytics-diagnostics-card">
              <div className="analytics-diagnostics-header">
                <span className="analytics-diagnostics-title">
                  <School size={17} color="#38bdf8" />
                  SGPA & Attendance Buffer
                </span>
                <span className={`analytics-delta-pill ${stats.attendancePct >= 75 ? 'positive' : 'negative'}`}>
                  {stats.attendancePct}% Rate
                </span>
              </div>
              <div className="analytics-callout-box">
                {stats.attendancePct >= 75
                  ? `Academic standing is protected. You have a safe attendance threshold across all registered subjects with ${stats.curAttended} logged classes.`
                  : `Attendance has dipped below the 75% critical threshold (${stats.attendancePct}%). Attend the next 3 consecutive lectures to restore safe standing.`}
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                  <span>Bunk Safety Buffer</span>
                  <span>{stats.attendancePct >= 85 ? 'High Buffer (+4 classes)' : stats.attendancePct >= 75 ? 'Moderate (+1 class)' : 'Zero Buffer (At Risk)'}</span>
                </div>
                <div className="analytics-meter-track">
                  <div
                    className="analytics-meter-fill"
                    style={{
                      width: `${Math.min(100, stats.attendancePct)}%`,
                      background: stats.attendancePct >= 75 ? '#5eda9e' : '#ff6961'
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Diagnostic 3: Workout Fatigue & Recovery Advisor */}
            <div className="analytics-diagnostics-card">
              <div className="analytics-diagnostics-header">
                <span className="analytics-diagnostics-title">
                  <Dumbbell size={17} color="#fbbf24" />
                  Workout Recovery Advisor
                </span>
                <span className="analytics-delta-pill amber">
                  {stats.curGym} Sessions
                </span>
              </div>
              <div className="analytics-callout-box">
                {stats.curGym >= 4
                  ? `High training frequency detected (${stats.curGym} sessions). Ensure 7–8 hours sleep and adequate hydration to optimize muscular hyper-adaptation.`
                  : stats.curGym >= 1
                  ? `Consistent lifting cadence. You have completed ${stats.curGym} gym sessions this ${period}.`
                  : `No gym sessions logged yet this ${period}. A 30-minute training session today will boost both physical recovery and ZenScore by +15 pts.`}
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                  <span>Weekly Volume Load</span>
                  <span>{stats.curGym >= 4 ? 'Optimal Target Reached' : 'Building Load'}</span>
                </div>
                <div className="analytics-meter-track">
                  <div
                    className="analytics-meter-fill"
                    style={{
                      width: `${Math.min(100, (stats.curGym / 4) * 100)}%`,
                      background: '#fbbf24'
                    }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Deep Gemini AI Pattern Recognition Panel */}
          <AIInsightsPanel userData={{ tasks, habitLogs, gymLogs, attendanceLogs, stats }} />
        </div>
      ) : (
        /* ── ZONE 5: RETROSPECTIVE WEEKLY REVIEW JOURNAL (TAB 3) ── */
        <div style={{ marginTop: '0.5rem' }}>
          <Suspense fallback={<div className="notes-empty-state">Loading Retrospective Journal...</div>}>
            <WeeklyReviewModule />
          </Suspense>
        </div>
      )}
    </div>
  );
};
