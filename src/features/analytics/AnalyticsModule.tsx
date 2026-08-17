import React, { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { useGlobalData } from '../../contexts/GlobalDataContext';
import {
  BarChart3, TrendingUp, TrendingDown, Dumbbell, Book, Flame,
  CheckCircle, Clock, Sparkles, Calendar, Award, Zap,
  ChevronRight, RefreshCw, Layers, School, Activity
} from 'lucide-react';
import { getLocalDateString } from '../../utils/dateUtils';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, AreaChart, Area, CartesianGrid, Legend
} from 'recharts';
import { AIInsightsPanel } from '../learning/AIInsightsPanel';
import { ErrorBoundary } from '../../components/ErrorBoundary';

// Lazy-load WeeklyReviewModule
const WeeklyReviewModule = lazy(() =>
  import('../review/WeeklyReviewModule').then(m => ({ default: m.WeeklyReviewModule }))
);

type Period = '7d' | '30d' | '90d';
const PERIOD_DAYS: Record<Period, number> = { '7d': 7, '30d': 30, '90d': 90 };
const PERIOD_LABELS: Record<Period, string> = { '7d': 'This Week (7D)', '30d': 'This Month (30D)', '90d': 'This Semester (90D)' };

// Helper: Days ago date string
function daysAgoStr(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return getLocalDateString(d);
}

// ── Delta Badge Component ──
const DeltaBadge = ({ cur, prev, unit = '' }: { cur: number; prev: number; unit?: string }) => {
  if (prev === 0 && cur === 0) {
    return <span className="analytics-delta-pill neutral">0%</span>;
  }
  const diff = cur - prev;
  const pct = prev > 0 ? Math.round((diff / prev) * 100) : (cur > 0 ? 100 : 0);
  const up = diff >= 0;

  return (
    <span className={`analytics-delta-pill ${up ? 'positive' : 'negative'}`}>
      {up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
      {up ? '+' : ''}{pct}%{unit ? ` ${unit}` : ''}
    </span>
  );
};

// ── Custom Dark Recharts Tooltip ──
const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload || !payload.length) return null;
  return (
    <div style={{
      background: 'rgba(20, 20, 22, 0.95)',
      border: '1px solid #242428',
      borderRadius: '8px',
      padding: '0.55rem 0.75rem',
      boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
      fontSize: '0.76rem',
      color: '#ffffff'
    }}>
      <div style={{ fontWeight: 600, marginBottom: '0.3rem', color: '#a599ff' }}>{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: p.color || '#fff' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: p.color || '#fff' }} />
          <span>{p.name}:</span>
          <span style={{ fontWeight: 700 }}>{p.value}</span>
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
    allHabits = [],
    isLoading,
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

  // ── 1. Core Computed Stats & ZenScore (Mobile Math Formula Parity) ──
  const stats = useMemo(() => {
    let curTasks = 0, prevTasks = 0;
    let curFocus = 0, prevFocus = 0;

    for (const t of tasks) {
      if (t.status !== 'completed') continue;
      const d = (t.completedAt || t.date || '').slice(0, 10);
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
      if (!l.date) continue;
      if (l.date >= curStart) curHabits++;
      else if (l.date >= prevStart && l.date <= prevEnd) prevHabits++;
    }

    let curGym = 0, prevGym = 0;
    for (const g of gymLogs) {
      if (!g.date) continue;
      if (g.date >= curStart) curGym++;
      else if (g.date >= prevStart && g.date <= prevEnd) prevGym++;
    }

    let curAttended = 0, curMissed = 0;
    let prevAttended = 0, prevMissed = 0;
    for (const l of attendanceLogs) {
      if (!l.date) continue;
      if (l.date >= curStart) {
        if (l.action === 'attended') curAttended++;
        else if (l.action === 'missed') curMissed++;
      } else if (l.date >= prevStart && l.date <= prevEnd) {
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

    const calcScore = (tCount: number, gCount: number, fMins: number, hCount: number, totAtt: number, attPct: number) => {
      const tScore = Math.min(25, (tCount / targetTasks) * 25);
      const gScore = targetGym > 0 ? Math.min(30, (gCount / targetGym) * 30) : 30;
      const fScore = Math.min(25, (fMins / targetFocus) * 25);
      const hScore = Math.min(20, (hCount / targetHabits) * 20);

      let base = tScore + gScore + fScore + hScore;
      let attMod = 0;
      if (totAtt > 0) {
        if (attPct >= 90) attMod = 5;
        else if (attPct < 50) attMod = -10;
      }
      return Math.max(0, Math.min(100, Math.round(base + attMod)));
    };

    const zenScore = calcScore(curTasks, curGym, curFocus, curHabits, totalAtt, attendancePct);
    const prevTotalAtt = prevAttended + prevMissed;
    const prevAttendancePct = prevTotalAtt > 0 ? (prevAttended / prevTotalAtt) * 100 : 100;
    const prevZen = calcScore(prevTasks, prevGym, prevFocus, prevHabits, prevTotalAtt, prevAttendancePct);

    // Best streak lookup in last 90 days
    const activeDates = new Set<string>();
    for (const t of tasks) {
      if (t.status === 'completed' && t.completedAt) activeDates.add(t.completedAt.slice(0, 10));
    }
    for (const g of gymLogs) { if (g.date) activeDates.add(g.date); }
    for (const l of habitLogs) { if (l.date) activeDates.add(l.date); }

    let best = 0, run = 0;
    for (let i = 0; i < 90; i++) {
      const d = daysAgoStr(i);
      if (activeDates.has(d)) {
        run++;
        best = Math.max(best, run);
      } else {
        run = 0;
      }
    }

    return {
      curTasks, prevTasks,
      curGym, prevGym,
      curFocus, prevFocus,
      curHabits, prevHabits,
      curAttended, curMissed,
      attendancePct: Math.round(attendancePct),
      zenScore, prevZen,
      bestStreak: best
    };
  }, [tasks, habitLogs, gymLogs, attendanceLogs, period, curStart, prevStart, prevEnd, days]);

  // ── 2. Task Completion Dual-Bar Chart Data (This vs Prev) ──
  const taskChartData = useMemo(() => {
    const taskDateCounts = new Map<string, number>();
    for (const t of tasks) {
      if (t.status !== 'completed') continue;
      const d = (t.completedAt || t.date || '').slice(0, 10);
      if (d) taskDateCounts.set(d, (taskDateCounts.get(d) || 0) + 1);
    }

    const n = Math.min(days, 14);
    const step = days <= 7 ? 1 : days <= 30 ? 2 : 7;
    const result = [];
    for (let i = n - 1; i >= 0; i -= step) {
      const d = daysAgoStr(i);
      const dPrev = daysAgoStr(i + days);
      result.push({
        label: d.slice(5), // "MM-DD"
        current: taskDateCounts.get(d) || 0,
        previous: taskDateCounts.get(dPrev) || 0,
      });
    }
    return result;
  }, [tasks, days]);

  // ── 3. Habit Consistency Area Chart Data ──
  const habitChartData = useMemo(() => {
    const habitDateCounts = new Map<string, number>();
    for (const l of habitLogs) {
      if (l.date) habitDateCounts.set(l.date, (habitDateCounts.get(l.date) || 0) + 1);
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

  // ── 4. Attendance Stacked Bar Chart Data ──
  const attendanceChartData = useMemo(() => {
    const attMap = new Map<string, { attended: number; missed: number }>();
    for (const l of attendanceLogs) {
      if (!l.date) continue;
      const entry = attMap.get(l.date) || { attended: 0, missed: 0 };
      if (l.action === 'attended') entry.attended++;
      else if (l.action === 'missed') entry.missed++;
      attMap.set(l.date, entry);
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

  // ── 5. Gym Volume & Big 3 Strength Progression ──
  const gymChartData = useMemo(() => {
    const gymDateMap = new Map<string, any>();
    for (const g of gymLogs) {
      if (g.date) gymDateMap.set(g.date, g);
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

  // ── 6. 35-Day (5-Week) Contribution Heatmap Data ──
  const heatmapCells = useMemo(() => {
    const taskDateCounts = new Map<string, number>();
    for (const t of tasks) {
      if (t.status === 'completed' && t.completedAt) {
        const d = t.completedAt.slice(0, 10);
        taskDateCounts.set(d, (taskDateCounts.get(d) || 0) + 1);
      }
    }
    const gymDateMap = new Set<string>();
    for (const g of gymLogs) { if (g.date) gymDateMap.add(g.date); }
    const habitDateCounts = new Map<string, number>();
    for (const l of habitLogs) {
      if (l.date) habitDateCounts.set(l.date, (habitDateCounts.get(l.date) || 0) + 1);
    }

    const cells = [];
    for (let i = 34; i >= 0; i--) {
      const dateStr = daysAgoStr(i);
      const tCount = taskDateCounts.get(dateStr) || 0;
      const gCount = gymDateMap.has(dateStr) ? 1 : 0;
      const hCount = (habitDateCounts.get(dateStr) || 0) > 0 ? 1 : 0;
      const total = tCount + gCount + hCount;

      let level = 'level-0';
      if (total === 1) level = 'level-1';
      else if (total === 2) level = 'level-2';
      else if (total >= 3) level = 'level-3';

      cells.push({
        date: dateStr,
        displayDate: dateStr.slice(5),
        total,
        tCount,
        gCount,
        level,
      });
    }
    return cells;
  }, [tasks, gymLogs, habitLogs]);

  // SVG Ring Math
  const RING_SIZE = 180;
  const RING_R = 70;
  const CIRC = 2 * Math.PI * RING_R;
  const strokeOffset = CIRC - (stats.zenScore / 100) * CIRC;

  return (
    <div className="analytics-module-root">
      {/* ── TOP HERO HEADER BAR ── */}
      <div className="analytics-header-bar">
        <div className="analytics-header-left">
          <h1 className="analytics-hero-title">Productivity Analytics & ZenScore</h1>
          <div className="analytics-live-badge">
            <span className="analytics-live-dot" />
            <span>Live Sync</span>
          </div>
        </div>

        <div className="analytics-header-actions">
          {/* Period Selector (7D / 30D / 90D) */}
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

          {/* Module Sub-tabs */}
          <button
            type="button"
            className={`analytics-tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            <Activity size={14} />
            <span>Overview</span>
          </button>

          <button
            type="button"
            className={`analytics-tab-btn ${activeTab === 'insights' ? 'active' : ''}`}
            onClick={() => setActiveTab('insights')}
          >
            <Sparkles size={14} color="#a599ff" />
            <span>AI Insights</span>
          </button>

          <button
            type="button"
            className={`analytics-tab-btn ${activeTab === 'review' ? 'active' : ''}`}
            onClick={() => setActiveTab('review')}
          >
            <Calendar size={14} />
            <span>Weekly Review</span>
          </button>
        </div>
      </div>

      {activeTab === 'overview' ? (
        <>
          {/* ── HERO ZEN SCORE & DELTA SECTION ── */}
          <div className="analytics-hero-card">
            {/* ZenScore Progress Ring */}
            <div className="analytics-ring-box">
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
                <div className="analytics-ring-delta">
                  {stats.zenScore >= stats.prevZen ? `+${stats.zenScore - stats.prevZen}` : `${stats.zenScore - stats.prevZen}`} vs prev
                </div>
              </div>
            </div>

            {/* 6 Summary Stat Cards Grid */}
            <div className="analytics-summary-grid">
              {/* Tasks Done */}
              <div className="analytics-stat-card">
                <div className="analytics-stat-card-top">
                  <div className="analytics-stat-icon-box" style={{ background: 'rgba(94, 218, 158, 0.12)', color: '#5eda9e' }}>
                    <CheckCircle size={16} />
                  </div>
                  <DeltaBadge cur={stats.curTasks} prev={stats.prevTasks} />
                </div>
                <div className="analytics-stat-val">{stats.curTasks}</div>
                <div className="analytics-stat-label">Tasks Completed</div>
              </div>

              {/* Gym Sessions */}
              <div className="analytics-stat-card">
                <div className="analytics-stat-card-top">
                  <div className="analytics-stat-icon-box" style={{ background: 'rgba(165, 153, 255, 0.12)', color: '#a599ff' }}>
                    <Dumbbell size={16} />
                  </div>
                  <DeltaBadge cur={stats.curGym} prev={stats.prevGym} />
                </div>
                <div className="analytics-stat-val">{stats.curGym}d</div>
                <div className="analytics-stat-label">Gym Sessions</div>
              </div>

              {/* Focus Time */}
              <div className="analytics-stat-card">
                <div className="analytics-stat-card-top">
                  <div className="analytics-stat-icon-box" style={{ background: 'rgba(56, 189, 248, 0.12)', color: '#38bdf8' }}>
                    <Clock size={16} />
                  </div>
                  <DeltaBadge cur={stats.curFocus} prev={stats.prevFocus} />
                </div>
                <div className="analytics-stat-val">
                  {stats.curFocus >= 60 ? `${(stats.curFocus / 60).toFixed(1)}h` : `${stats.curFocus}m`}
                </div>
                <div className="analytics-stat-label">Focus Time</div>
              </div>

              {/* Best Streak */}
              <div className="analytics-stat-card">
                <div className="analytics-stat-card-top">
                  <div className="analytics-stat-icon-box" style={{ background: 'rgba(251, 191, 36, 0.12)', color: '#fbbf24' }}>
                    <Flame size={16} />
                  </div>
                  <span className="analytics-delta-pill positive">🔥 High</span>
                </div>
                <div className="analytics-stat-val">{stats.bestStreak}d</div>
                <div className="analytics-stat-label">Best Streak</div>
              </div>

              {/* Habits Completed */}
              <div className="analytics-stat-card">
                <div className="analytics-stat-card-top">
                  <div className="analytics-stat-icon-box" style={{ background: 'rgba(165, 153, 255, 0.12)', color: '#a599ff' }}>
                    <Zap size={16} />
                  </div>
                  <DeltaBadge cur={stats.curHabits} prev={stats.prevHabits} />
                </div>
                <div className="analytics-stat-val">{stats.curHabits}</div>
                <div className="analytics-stat-label">Habits Checked</div>
              </div>

              {/* Classes Attended */}
              <div className="analytics-stat-card">
                <div className="analytics-stat-card-top">
                  <div className="analytics-stat-icon-box" style={{ background: 'rgba(56, 189, 248, 0.12)', color: '#38bdf8' }}>
                    <School size={16} />
                  </div>
                  <span className="analytics-delta-pill neutral">{stats.attendancePct}%</span>
                </div>
                <div className="analytics-stat-val">{stats.curAttended}</div>
                <div className="analytics-stat-label">Classes Attended</div>
              </div>
            </div>
          </div>

          {/* ── CHARTS 2X2 GRID ── */}
          <div className="analytics-charts-grid">
            {/* Chart 1: Task Completion (This vs Prev) */}
            <div className="analytics-chart-card">
              <div className="analytics-chart-header">
                <div>
                  <h3 className="analytics-chart-title">Task Completion Trend</h3>
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
                    <Bar dataKey="current" name="Current Period" fill="#a599ff" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="previous" name="Previous Period" fill="rgba(165, 153, 255, 0.35)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Chart 2: Habit Consistency (%) */}
            <div className="analytics-chart-card">
              <div className="analytics-chart-header">
                <div>
                  <h3 className="analytics-chart-title">Habit Consistency</h3>
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
                        <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#38bdf8" stopOpacity={0} />
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

            {/* Chart 3: Attendance Ratio Stacked Bars */}
            <div className="analytics-chart-card">
              <div className="analytics-chart-header">
                <div>
                  <h3 className="analytics-chart-title">Class Attendance Ratio</h3>
                  <div className="analytics-chart-subtitle">Attended vs missed classes across interval</div>
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

            {/* Chart 4: Gym Strength & Volume */}
            <div className="analytics-chart-card">
              <div className="analytics-chart-header">
                <div>
                  <h3 className="analytics-chart-title">Gym Total Volume Progression</h3>
                  <div className="analytics-chart-subtitle">Total workout volume (weight × reps in kg/lbs)</div>
                </div>
                <div className="analytics-chart-legend">
                  <div className="analytics-legend-item">
                    <span className="analytics-legend-dot" style={{ background: '#fbbf24' }} />
                    <span>Volume</span>
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
                    <Bar dataKey="volume" name="Workout Volume" fill="#fbbf24" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* ── 35-DAY ACTIVITY HEATMAP ── */}
          <div className="analytics-heatmap-card">
            <div className="analytics-chart-header">
              <div>
                <h3 className="analytics-chart-title">35-Day Productivity Contribution Heatmap</h3>
                <div className="analytics-chart-subtitle">Density of completed tasks, gym logs, and habit streaks</div>
              </div>
            </div>

            <div className="analytics-heatmap-grid">
              {heatmapCells.map((cell, idx) => (
                <div
                  key={idx}
                  className={`analytics-heatmap-cell ${cell.level}`}
                  title={`${cell.date}: ${cell.total} actions logged (${cell.tCount} tasks, ${cell.gCount} gym)`}
                >
                  <span className="analytics-heatmap-date">{cell.displayDate}</span>
                  {cell.total > 0 && <span className="analytics-heatmap-count">{cell.total}</span>}
                </div>
              ))}
            </div>

            <div className="analytics-heatmap-footer">
              <span>{heatmapCells.reduce((acc, c) => acc + c.total, 0)} total logged actions across 35 days</span>
              <div className="analytics-heatmap-legend">
                <span>Less</span>
                <span className="analytics-heatmap-key-sq" style={{ background: 'rgba(255,255,255,0.05)' }} />
                <span className="analytics-heatmap-key-sq" style={{ background: 'rgba(165,153,255,0.22)' }} />
                <span className="analytics-heatmap-key-sq" style={{ background: 'rgba(165,153,255,0.5)' }} />
                <span className="analytics-heatmap-key-sq" style={{ background: '#a599ff' }} />
                <span>More</span>
              </div>
            </div>
          </div>
        </>
      ) : activeTab === 'insights' ? (
        <div style={{ marginTop: '0.5rem' }}>
          <AIInsightsPanel />
        </div>
      ) : (
        <div style={{ marginTop: '0.5rem' }}>
          <Suspense fallback={<div className="notes-empty-state">Loading Weekly Review...</div>}>
            <WeeklyReviewModule />
          </Suspense>
        </div>
      )}
    </div>
  );
};
