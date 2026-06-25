import { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { useGlobalData } from '../../contexts/GlobalDataContext';
import { BarChart3, TrendingUp, Dumbbell, Book, Flame, Wifi, WifiOff, CheckCircle, Clock } from 'lucide-react';
import { getLocalDateString } from '../../utils/dateUtils';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, RadarChart, Radar, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis, Legend,
} from 'recharts';
import { AIInsightsPanel } from '../learning/AIInsightsPanel';
import { ErrorBoundary } from '../../components/ErrorBoundary';

// Lazy-load WeeklyReviewModule so its init (Gemini keys, Firebase, etc.)
// never crashes the 30-day Analytics tab even if Weekly Review fails to load.
const WeeklyReviewModule = lazy(() =>
  import('../review/WeeklyReviewModule').then(m => ({ default: m.WeeklyReviewModule }))
);

// ─── Safe number helpers ───────────────────────────────────────────────────────
/** Converts any value to a finite number, defaulting to `fallback` (0) on bad input */
const safeNum = (v: any, fallback = 0): number => {
  const n = Number(v);
  return isFinite(n) ? n : fallback;
};

/** Clamps a value between min and max */
const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);

// ─── Date helpers ─────────────────────────────────────────────────────────────
function getLast30Days(): string[] {
  const days: string[] = [];
  const today = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push(getLocalDateString(d));
  }
  return days;
}

/**
 * Convert a YYYY-MM-DD string to a short label like "16 Jun".
 * Parses the string manually to avoid timezone shifts (new Date('2026-01-01')
 * is UTC midnight which can roll back a day in UTC+5:30).
 */
function getWeekLabel(dateStr: string): string {
  if (!dateStr || typeof dateStr !== 'string') return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const [, m, d] = parts;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const monthIdx = parseInt(m, 10) - 1;
  if (monthIdx < 0 || monthIdx > 11) return dateStr;
  return `${parseInt(d, 10)} ${months[monthIdx]}`;
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
const StatCard = ({
  icon, label, value, sub, color,
}: {
  icon: React.ReactNode; label: string; value: string | number; sub?: string; color: string;
}) => (
  <div style={{
    background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
    borderRadius: 'var(--radius-md)', padding: '0.85rem 1rem',
    display: 'flex', alignItems: 'center', gap: '0.75rem', transition: 'all 0.2s',
  }}>
    <div style={{ width: '36px', height: '36px', borderRadius: 'var(--radius-sm)', background: `${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', color, flexShrink: 0 }}>
      {icon}
    </div>
    <div style={{ overflow: 'hidden' }}>
      <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.2rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
      {sub && <div style={{ fontSize: '0.65rem', color, marginTop: '0.1rem', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>}
    </div>
  </div>
);

// ─── Chart fallback (shown when a chart fails to render) ──────────────────────
const ChartFallback = ({ name }: { name: string }) => (
  <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', flexDirection: 'column', gap: '0.5rem' }}>
    <span>⚠️</span>
    <span>{name} chart could not render.</span>
  </div>
);

// ─── Tooltip style ─────────────────────────────────────────────────────────────
const TOOLTIP_STYLE = {
  background: 'var(--bg-surface)',
  border: '1px solid var(--border-subtle)',
  borderRadius: '8px',
  color: 'var(--text-primary)',
};

// ─── Main Module ──────────────────────────────────────────────────────────────
// Wrap the entire module in an ErrorBoundary at the export level so that ANY crash
// (hooks, Recharts internals, etc.) is caught here — never reaches App.tsx's boundary.
export const AnalyticsModule = () => (
  <ErrorBoundary name="Analytics">
    <AnalyticsModuleInner />
  </ErrorBoundary>
);

const AnalyticsModuleInner = () => {
  const {
    tasks: todoData,
    dailyLogs: logData,
    habitLogs: rawHabitLogs,
    gymLogs: gymData,
    attendanceSubjects,
    pomodoroSessions,
    isLoading,
  } = useGlobalData();

  const [activeTab, setActiveTab] = useState<'30day' | 'weekly'>('30day');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const last30 = useMemo(() => getLast30Days(), []);

  // Guard: ensure rawHabitLogs is always an array with valid date fields
  const habitLogs = useMemo(() => {
    if (!Array.isArray(rawHabitLogs)) return [];
    return rawHabitLogs.filter((data: any) => data && typeof data.date === 'string' && data.date >= last30[0]);
  }, [rawHabitLogs, last30]);

  // Guard: ensure todoData is always a valid array
  const safeTodos = useMemo(() => (Array.isArray(todoData) ? todoData : []), [todoData]);
  // Guard: ensure attendanceSubjects is always a valid array
  const safeAttendance = useMemo(() => (Array.isArray(attendanceSubjects) ? attendanceSubjects : []), [attendanceSubjects]);
  // Guard: ensure pomodoroSessions is always a valid array
  const safePomodoroSessions = useMemo(() => (Array.isArray(pomodoroSessions) ? pomodoroSessions : []), [pomodoroSessions]);
  // Guard: ensure gymData is always a valid array
  const safeGymData = useMemo(() => (Array.isArray(gymData) ? gymData.filter(g => g && typeof g.date === 'string') : []), [gymData]);
  const safeDailyLogs = useMemo(() => (Array.isArray(logData) ? logData : []), [logData]);

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    if (!isLoading) setLastUpdated(new Date());
  }, [isLoading, logData?.length, safeTodos.length]);

  // ── 1. Task Metrics ────────────────────────────────────────────────────────
  const todoMetrics = useMemo(() => {
    try {
      const total = safeTodos.length;
      const completed = safeTodos.filter(t => t?.status === 'completed').length;
      const rate = total > 0 ? clamp(Math.round((completed / total) * 100), 0, 100) : 0;
      const daily = last30.map(date => {
        const dayTodos = safeTodos.filter(t => t?.date === date);
        const done = dayTodos.filter(t => t?.status === 'completed').length;
        return { date: getWeekLabel(date), total: dayTodos.length, completed: done };
      });
      return { total, completed, rate, daily };
    } catch {
      console.error('[Analytics] todoMetrics error:', e);
      return { total: 0, completed: 0, rate: 0, daily: last30.map(d => ({ date: getWeekLabel(d), total: 0, completed: 0 })) };
    }
  }, [safeTodos, last30]);

  // ── Week-over-Week Metrics ────────────────────────────────────────────────
  const weekOverWeekMetrics = useMemo(() => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const msPerDay = 24 * 60 * 60 * 1000;
      
      const getRangeCount = (dataList: any[], dateField: string, filterFn: (d: any) => boolean) => {
        let thisWeek = 0, lastWeek = 0;
        dataList.forEach(d => {
          if (!d || typeof d[dateField] !== 'string') return;
          const dt = new Date(d[dateField] + 'T00:00:00');
          if (isNaN(dt.getTime())) return;
          const diffDays = Math.floor((today.getTime() - dt.getTime()) / msPerDay);
          if (diffDays >= 0 && diffDays < 7 && filterFn(d)) thisWeek++;
          else if (diffDays >= 7 && diffDays < 14 && filterFn(d)) lastWeek++;
        });
        return { thisWeek, lastWeek, diff: thisWeek - lastWeek };
      };

      const tasks = getRangeCount(safeTodos, 'date', d => d.status === 'completed');
      const habits = getRangeCount(habitLogs, 'date', () => true);
      const gym = getRangeCount(safeGymData, 'date', () => true);

      return { tasks, habits, gym };
    } catch {
      console.error('[Analytics] weekOverWeekMetrics error:', e);
      return { 
        tasks: { thisWeek: 0, lastWeek: 0, diff: 0 }, 
        habits: { thisWeek: 0, lastWeek: 0, diff: 0 }, 
        gym: { thisWeek: 0, lastWeek: 0, diff: 0 } 
      };
    }
  }, [safeTodos, habitLogs, safeGymData]);

  // ── 2. Gym Strength Progression ───────────────────────────────────────────
  const gymProgressionMetrics = useMemo(() => {
    try {
      // Use undefined instead of null — Recharts handles undefined better with connectNulls
      // null values cause internal minified-function errors in Recharts' domain calculator
      const chartData = last30.map(date => ({
        date: getWeekLabel(date),
        bench: undefined as number | undefined,
        squat: undefined as number | undefined,
        deadlift: undefined as number | undefined,
        rawDate: date,
      }));

      let lastBench = 0, lastSquat = 0, lastDeadlift = 0;

      const sortedGym = [...safeGymData].sort((a, b) => {
        const ta = new Date(a.date + 'T00:00:00').getTime();
        const tb = new Date(b.date + 'T00:00:00').getTime();
        return (isNaN(ta) ? 0 : ta) - (isNaN(tb) ? 0 : tb);
      });

      sortedGym.forEach(log => {
        if (!log || !log.date || log.date < last30[0]) return;
        const idx = chartData.findIndex(d => d.rawDate === log.date);
        if (idx === -1) return;

        const exercises = Array.isArray(log.exercises) ? log.exercises : [];
        exercises.forEach((ex: any) => {
          if (!ex || typeof ex.name !== 'string') return;
          const name = ex.name.toLowerCase();
          const safeLog = Array.isArray(ex.setsLog) ? ex.setsLog : [];
          const weights = safeLog
            .map((s: any) => safeNum(s?.weight))
            .filter((w: number) => w > 0 && isFinite(w));
          const maxWeight = weights.length > 0 ? Math.max(...weights) : 0;
          if (maxWeight > 0 && isFinite(maxWeight)) {
            if (name.includes('bench') || name.includes('chest press') || name.includes('barbell press') || name.includes('db press') || name.includes('dumbbell press') || name.includes('fly')) chartData[idx].bench = Math.max(chartData[idx].bench ?? 0, maxWeight);
            if (name.includes('squat') || name.includes('leg press') || name.includes('hack')) chartData[idx].squat = Math.max(chartData[idx].squat ?? 0, maxWeight);
            if (name.includes('deadlift') || name.includes('rdl') || name.includes('romanian') || name.includes('good morning')) chartData[idx].deadlift = Math.max(chartData[idx].deadlift ?? 0, maxWeight);
          }
        });
      });

      // Carry last-known value forward for continuous lines
      chartData.forEach(d => {
        if (d.bench !== undefined) lastBench = d.bench; else if (lastBench > 0) d.bench = lastBench;
        if (d.squat !== undefined) lastSquat = d.squat; else if (lastSquat > 0) d.squat = lastSquat;
        if (d.deadlift !== undefined) lastDeadlift = d.deadlift; else if (lastDeadlift > 0) d.deadlift = lastDeadlift;
      });

      return chartData;
    } catch {
      console.error('[Analytics] gymProgressionMetrics error:', e);
      return last30.map(d => ({ date: getWeekLabel(d), bench: undefined, squat: undefined, deadlift: undefined, rawDate: d }));
    }
  }, [safeGymData, last30]);

  // ── 3. Attendance Radar ───────────────────────────────────────────────────
  const attendanceRadarData = useMemo(() => {
    try {
      return safeAttendance
        .filter(sub => sub && typeof sub.name === 'string')
        .map(sub => {
          const attended = safeNum(sub.classesAttended);
          const missed = safeNum(sub.classesMissed);
          const total = attended + missed;
          const rate = total > 0 ? clamp(Math.round((attended / total) * 100), 0, 100) : 0;
          return {
            subject: String(sub.name).substring(0, 12) + (String(sub.name).length > 12 ? '…' : ''),
            attendance: rate,
            fullMark: 100,
          };
        });
    } catch (e) {
      console.error('[Analytics] attendanceRadarData error:', e);
      return [];
    }
  }, [safeAttendance]);

  // ── 4. Habit Heatmap ──────────────────────────────────────────────────────
  const habitHeatmapData = useMemo(() => {
    try {
      const counts: Record<string, number> = {};
      habitLogs.forEach(log => {
        if (log?.date && typeof log.date === 'string') {
          counts[log.date] = (counts[log.date] || 0) + 1;
        }
      });
      return last30.map(date => ({
        date: getWeekLabel(date),
        fullDate: date,
        count: safeNum(counts[date]),
      }));
    } catch (e) {
      console.error('[Analytics] habitHeatmapData error:', e);
      return last30.map(d => ({ date: getWeekLabel(d), fullDate: d, count: 0 }));
    }
  }, [habitLogs, last30]);

  const habitMetrics = useMemo(() => {
    try {
      return {
        totalChecked: habitLogs.length,
        daysWithActivity: new Set(habitLogs.map(l => l.date).filter(Boolean)).size,
      };
    } catch (e) {
      return { totalChecked: 0, daysWithActivity: 0 };
    }
  }, [habitLogs]);

  // ── Learning Progress ─────────────────────────────────────────────────────
  const learningChartData = useMemo(() => {
    try {
      return last30.map(date => {
        const dLog = safeDailyLogs.find(l => l.date === date);
        const watchSeconds = safeNum(dLog?.daily_watch_seconds);
        return {
          date: getWeekLabel(date),
          watchMinutes: Math.round(watchSeconds / 60),
        };
      });
    } catch (e) {
      console.error('[Analytics] learningChartData error:', e);
      return last30.map(d => ({ date: getWeekLabel(d), watchMinutes: 0 }));
    }
  }, [safeDailyLogs, last30]);

  // ── 5. Pomodoro Time-of-Day Distribution ──────────────────────────────────
  const pomodoroHeatmapMetrics = useMemo(() => {
    try {
      const hours = Array.from({ length: 24 }, (_, i) => ({
        hour: `${String(i).padStart(2, '0')}:00`,
        minutes: 0,
      }));

      const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;

      safePomodoroSessions.forEach(session => {
        if (!session) return;
        // Handle both plain numbers and Firestore Timestamp objects
        const rawTs = session.timestamp;
        const ts: number = rawTs && typeof rawTs === 'object' && 'toMillis' in rawTs
          ? (rawTs as any).toMillis()
          : safeNum(rawTs);

        if (ts < cutoff) return;

        const date = new Date(ts);
        if (isNaN(date.getTime())) return;

        const hour = date.getHours(); // 0 to 23
        if (hour >= 0 && hour < 24) {
          hours[hour].minutes += safeNum(session.durationMinutes, 25);
        }
      });

      return hours;
    } catch (e) {
      console.error('[Analytics] pomodoroHeatmapMetrics error:', e);
      return Array.from({ length: 24 }, (_, i) => ({ hour: `${String(i).padStart(2, '0')}:00`, minutes: 0 }));
    }
  }, [safePomodoroSessions]);

  // ── AI Summary Data ───────────────────────────────────────────────────────
  const aiUserData = useMemo(() => ({
    tasks: safeTodos,
    habits: habitLogs,
    attendance: safeAttendance,
    gym: safeGymData,
    summary: {
      completedTasks: todoMetrics.completed,
      habitDays: habitMetrics.daysWithActivity,
    },
  }), [safeTodos, habitLogs, safeAttendance, safeGymData, todoMetrics, habitMetrics]);

  // ── Loading State ─────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="learning-container">
        <div className="learning-header">
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <BarChart3 size={24} className="logo-icon" /> Analytics
          </h1>
        </div>
        <div className="skeleton" style={{ height: '200px', borderRadius: 'var(--radius-lg)', marginTop: '1rem' }} />
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Tab bar */}
        <div style={{ display: 'flex', gap: '0.5rem', padding: '0.75rem 1.5rem', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', flexShrink: 0, zIndex: 10 }}>
          {(['30day', 'weekly'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '0.5rem 1rem', borderRadius: 'var(--radius-md)', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer',
                background: activeTab === tab ? 'var(--accent-primary)' : 'transparent',
                color: activeTab === tab ? '#fff' : 'var(--text-secondary)',
                border: activeTab === tab ? '1px solid var(--accent-primary)' : '1px solid transparent',
                transition: 'all 0.15s',
              }}
            >
              {tab === '30day' ? '30-Day Overview' : 'Weekly Review'}
            </button>
          ))}
        </div>

        {activeTab === 'weekly' ? (
          <ErrorBoundary name="Weekly Review">
            <Suspense fallback={
              <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className="skeleton" style={{ height: '120px', borderRadius: 'var(--radius-lg)' }} />
                <div className="skeleton" style={{ height: '180px', borderRadius: 'var(--radius-lg)' }} />
              </div>
            }>
              <WeeklyReviewModule />
            </Suspense>
          </ErrorBoundary>
        ) : (
          <div className="learning-container">
            {/* Header */}
            <div className="learning-header">
              <div style={{ flex: 1 }}>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <BarChart3 size={24} className="logo-icon" /> Analytics &amp; Insights
                </h1>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
                  Live 30-day overview tailored to your core metrics.
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: isOnline ? '#10b981' : '#ef4444' }}>
                {isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
                <span>{isOnline ? 'Live Sync' : 'Offline'}</span>
                {isOnline && <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', animation: 'pulse 2s infinite' }} />}
                {lastUpdated && (
                  <span style={{ color: 'var(--text-muted)', marginLeft: '0.25rem' }}>
                    · {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
            </div>

            {/* Stat Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.75rem', maxWidth: '100%' }}>
              <StatCard icon={<CheckCircle size={22} />} label="Tasks Completed" value={todoMetrics.completed} sub={`${todoMetrics.rate}% completion rate`} color="#7c3aed" />
              <StatCard icon={<Flame size={22} />} label="Habit Check-ins" value={habitMetrics.totalChecked} sub={`${habitMetrics.daysWithActivity} active days`} color="#ef4444" />
              <StatCard icon={<Dumbbell size={22} />} label="Gym Trend" value={`${safeGymData.filter((d: any) => d.date >= last30[0]).length} Sessions`} sub={`${weekOverWeekMetrics.gym.diff > 0 ? '+' : ''}${weekOverWeekMetrics.gym.diff} this week`} color="#f97316" />
              <StatCard icon={<Book size={22} />} label="Attendance" value={`${safeAttendance.length} Subj`} sub="Tracking health" color="#14b8a6" />
            </div>

            {/* Week-over-Week Comparison */}
            <div style={{ marginTop: '1.25rem', marginBottom: '0.5rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
                <TrendingUp size={18} /> Week-over-Week Comparison
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
                {[
                  { label: 'Tasks Completed', icon: <CheckCircle size={16} />, color: '#7c3aed', data: weekOverWeekMetrics.tasks },
                  { label: 'Habits Logged', icon: <Flame size={16} />, color: '#ef4444', data: weekOverWeekMetrics.habits },
                  { label: 'Gym Sessions', icon: <Dumbbell size={16} />, color: '#f97316', data: weekOverWeekMetrics.gym },
                ].map(metric => (
                  <div key={metric.label} style={{ padding: '0.8rem', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <div style={{ color: metric.color, display: 'flex' }}>{metric.icon}</div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{metric.label}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                      <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>{metric.data.thisWeek}</div>
                      <div style={{ fontSize: '0.7rem', fontWeight: 600, color: metric.data.diff > 0 ? '#10b981' : metric.data.diff < 0 ? '#ef4444' : 'var(--text-muted)' }}>
                        {metric.data.diff > 0 ? `+${metric.data.diff}` : metric.data.diff < 0 ? metric.data.diff : 'same'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* AI Insights */}
            <div style={{ marginTop: '1rem' }}>
              <ErrorBoundary name="AI Insights">
                <AIInsightsPanel userData={aiUserData} />
              </ErrorBoundary>
            </div>

            {/* Charts Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 400px), 1fr))', gap: '1.25rem', marginTop: '1rem' }}>

              {/* 1. Habit Heatmap */}
              <div className="topic-card" style={{ padding: '1.5rem', gridColumn: '1 / -1' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
                  <Flame size={18} /> Habit Consistency (Last 30 Days)
                </h3>
                <ErrorBoundary name="Habit Heatmap">
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {habitHeatmapData.map((d, i) => (
                      <div
                        key={i}
                        title={`${d.fullDate}: ${d.count} habit${d.count !== 1 ? 's' : ''}`}
                        style={{
                          width: '24px', height: '24px', borderRadius: '4px',
                          background: d.count === 0
                            ? 'var(--bg-surface-hover)'
                            : `rgba(16, 185, 129, ${Math.min(0.2 + d.count * 0.2, 1)})`,
                          border: '1px solid rgba(255,255,255,0.05)',
                          transition: 'all 0.2s', cursor: 'pointer',
                        }}
                      />
                    ))}
                  </div>
                </ErrorBoundary>
              </div>

              {/* 2. Gym Strength Progression */}
              <div className="topic-card" style={{ padding: '1.5rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
                  <Dumbbell size={18} /> Strength Progression (Max kg)
                </h3>
                <ErrorBoundary name="Gym Chart" fallback={<ChartFallback name="Gym Strength" />}>
                  {gymProgressionMetrics.some(d => d.bench !== undefined || d.squat !== undefined || d.deadlift !== undefined) ? (
                    <ResponsiveContainer width="100%" height={260}>
                      <LineChart data={gymProgressionMetrics.map(d => ({ ...d, bench: d.bench ?? 0, squat: d.squat ?? 0, deadlift: d.deadlift ?? 0 }))} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                        <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} interval={4} />
                        <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} allowDecimals={false} domain={[0, 'auto']} />
                        <Tooltip contentStyle={TOOLTIP_STYLE} />
                        <Legend wrapperStyle={{ fontSize: '12px' }} />
                        <Line type="monotone" dataKey="bench" stroke="#3b82f6" strokeWidth={3} name="Bench Press" dot={{ r: 3 }} activeDot={{ r: 6 }} connectNulls />
                        <Line type="monotone" dataKey="squat" stroke="#ef4444" strokeWidth={3} name="Squat" dot={{ r: 3 }} activeDot={{ r: 6 }} connectNulls />
                        <Line type="monotone" dataKey="deadlift" stroke="#10b981" strokeWidth={3} name="Deadlift" dot={{ r: 3 }} activeDot={{ r: 6 }} connectNulls />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div style={{ height: '260px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                      No gym data recorded in the last 30 days.
                    </div>
                  )}
                </ErrorBoundary>
              </div>

              {/* 3. Learning Progress */}
              <div className="topic-card" style={{ padding: '1.5rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
                  <Book size={18} /> Learning (Video Minutes)
                </h3>
                <ErrorBoundary name="Learning Chart" fallback={<ChartFallback name="Learning Progress" />}>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={learningChartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                      <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} interval={4} />
                      <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={{ color: '#3b82f6' }} />
                      <Bar dataKey="watchMinutes" name="Minutes Watched" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </ErrorBoundary>
              </div>

              {/* 4. Attendance Radar */}
              <div className="topic-card" style={{ padding: '1.5rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
                  <Book size={18} /> Subject Attendance Health (%)
                </h3>
                {attendanceRadarData.length > 2 ? (
                  <ErrorBoundary name="Attendance Radar" fallback={<ChartFallback name="Attendance Radar" />}>
                    <ResponsiveContainer width="100%" height={260}>
                      <RadarChart cx="50%" cy="50%" outerRadius="70%" data={attendanceRadarData}>
                        <PolarGrid stroke="var(--border-subtle)" />
                        <PolarAngleAxis dataKey="subject" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                        <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                        <Radar name="Attendance %" dataKey="attendance" stroke="#a855f7" fill="#a855f7" fillOpacity={0.5} />
                        <Tooltip contentStyle={TOOLTIP_STYLE} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </ErrorBoundary>
                ) : attendanceRadarData.length > 0 ? (
                  // Bar chart fallback when <3 subjects (RadarChart needs ≥3 points)
                  <ErrorBoundary name="Attendance Bar" fallback={<ChartFallback name="Attendance" />}>
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={attendanceRadarData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                        <XAxis dataKey="subject" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                        <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} domain={[0, 100]} />
                        <Tooltip contentStyle={TOOLTIP_STYLE} />
                        <Bar dataKey="attendance" fill="#a855f7" radius={[4, 4, 0, 0]} name="Attendance %" />
                      </BarChart>
                    </ResponsiveContainer>
                  </ErrorBoundary>
                ) : (
                  <div style={{ height: '260px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                    No attendance data available.
                  </div>
                )}
              </div>

              {/* 4. Task Completion Trend */}
              <div className="topic-card" style={{ padding: '1.5rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
                  <TrendingUp size={18} /> Task Completion Trend
                </h3>
                <ErrorBoundary name="Task Chart" fallback={<ChartFallback name="Task Completion" />}>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={todoMetrics.daily} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                      <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} interval={4} />
                      <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} allowDecimals={false} domain={[0, 'auto']} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} />
                      <Bar dataKey="completed" fill="#7c3aed" radius={[4, 4, 0, 0]} name="Completed Tasks" />
                      <Bar dataKey="total" fill="rgba(124,58,237,0.2)" radius={[4, 4, 0, 0]} name="Total Added" />
                    </BarChart>
                  </ResponsiveContainer>
                </ErrorBoundary>
              </div>

              {/* 5. Deep Work Time-of-Day Heatmap */}
              <div className="topic-card" style={{ padding: '1.5rem', gridColumn: '1 / -1' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
                  <Clock size={18} /> Deep Work Time-of-Day Heatmap
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '1rem' }}>
                  Total focus minutes grouped by hour over the last 30 days.
                </p>
                <ErrorBoundary name="Focus Chart" fallback={<ChartFallback name="Deep Work" />}>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={pomodoroHeatmapMetrics} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                      <XAxis dataKey="hour" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} interval={2} />
                      <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} allowDecimals={false} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                      <Bar dataKey="minutes" fill="#ec4899" radius={[4, 4, 0, 0]} name="Focus Minutes" />
                    </BarChart>
                  </ResponsiveContainer>
                </ErrorBoundary>
              </div>

            </div>
          </div>
        )}
      </div>
  );
};
