import { useState, useEffect, useMemo } from 'react';
import { useGlobalData } from '../../contexts/GlobalDataContext';
import { BarChart3, TrendingUp, Dumbbell, Book, Flame, Wifi, WifiOff, CheckCircle, Clock } from 'lucide-react';
import { getLocalDateString } from '../../utils/dateUtils';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Legend } from 'recharts';
import { AIInsightsPanel } from '../learning/AIInsightsPanel';
import { WeeklyReviewModule } from '../review/WeeklyReviewModule';
import { ErrorBoundary } from '../../components/ErrorBoundary';

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

function getWeekLabel(date: string): string {
  const d = new Date(date);
  return `${d.getDate()} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]}`;
}

const StatCard = ({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: string | number; sub?: string; color: string }) => (
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

export const AnalyticsModule = () => {
  const {
    todos: todoData,
    dailyLogs: logData,
    habitLogs: rawHabitLogs,
    gymLogs: gymData,
    attendanceSubjects,
    pomodoroSessions,
    isLoading
  } = useGlobalData();

  const [activeTab, setActiveTab] = useState<'30day' | 'weekly'>('30day');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const last30 = useMemo(() => getLast30Days(), []);
  
  const habitLogs = useMemo(() => {
    return rawHabitLogs.filter((data: any) => data.date && data.date >= last30[0]);
  }, [rawHabitLogs, last30]);

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
  }, [isLoading, logData.length, todoData.length]);

  // 1. Task Metrics
  const todoMetrics = useMemo(() => {
    const total = todoData.length;
    const completed = todoData.filter(t => t.isCompleted).length;
    const rate = total > 0 ? Math.round((completed / total) * 100) : 0;
    const daily = last30.map(date => {
      const dayTodos = todoData.filter(t => t.date === date);
      const done = dayTodos.filter(t => t.isCompleted).length;
      return { date: getWeekLabel(date), total: dayTodos.length, completed: done };
    });
    return { total, completed, rate, daily };
  }, [todoData, last30]);

  // 2. Gym Progression (Big 3)
  const gymProgressionMetrics = useMemo(() => {
    const chartData = last30.map(date => ({
      date: getWeekLabel(date),
      bench: null as number | null,
      squat: null as number | null,
      deadlift: null as number | null,
      rawDate: date
    }));

    let lastBench = 0, lastSquat = 0, lastDeadlift = 0;
    // Guard: gymData may contain docs with missing/malformed date fields
    const safeGymData = Array.isArray(gymData) ? gymData.filter(g => g && typeof g.date === 'string') : [];
    const sortedGym = [...safeGymData].sort((a, b) => {
      const ta = new Date(a.date).getTime();
      const tb = new Date(b.date).getTime();
      return (isNaN(ta) ? 0 : ta) - (isNaN(tb) ? 0 : tb);
    });
    
    sortedGym.forEach(log => {
      if (log.date < last30[0]) return;
      const idx = chartData.findIndex(d => d.rawDate === log.date);
      if (idx !== -1) {
        const exercises = Array.isArray(log.exercises) ? log.exercises : [];
        exercises.forEach((ex: any) => {
          if (!ex || typeof ex.name !== 'string') return;
          const name = ex.name.toLowerCase();
          // ── CRITICAL FIX: setsLog may be undefined/object, not array ──────
          const safeLog = Array.isArray(ex.setsLog) ? ex.setsLog : [];
          const weights = safeLog.map((s: any) => (s && typeof s === 'object' ? Number(s.weight) || 0 : 0));
          const maxWeight = weights.length > 0 ? Math.max(...weights) : 0;
          if (maxWeight > 0) {
            if (name.includes('bench')) chartData[idx].bench = Math.max(chartData[idx].bench || 0, maxWeight);
            if (name.includes('squat')) chartData[idx].squat = Math.max(chartData[idx].squat || 0, maxWeight);
            if (name.includes('deadlift')) chartData[idx].deadlift = Math.max(chartData[idx].deadlift || 0, maxWeight);
          }
        });
      }
    });

    // Carry over values for continuous lines
    chartData.forEach(d => {
      if (d.bench !== null) lastBench = d.bench; else if (lastBench > 0) d.bench = lastBench;
      if (d.squat !== null) lastSquat = d.squat; else if (lastSquat > 0) d.squat = lastSquat;
      if (d.deadlift !== null) lastDeadlift = d.deadlift; else if (lastDeadlift > 0) d.deadlift = lastDeadlift;
    });

    return chartData;
  }, [gymData, last30]);

  // 3. Attendance Radar
  const attendanceRadarData = useMemo(() => {
    return attendanceSubjects.map(sub => {
      const total = sub.classesAttended + sub.classesMissed;
      const rate = total > 0 ? Math.round((sub.classesAttended / total) * 100) : 0;
      return {
        subject: sub.name.substring(0, 12) + (sub.name.length > 12 ? '...' : ''),
        attendance: rate,
        fullMark: 100,
      };
    });
  }, [attendanceSubjects]);

  // 4. Habit Heatmap
  const habitHeatmapData = useMemo(() => {
    const counts: Record<string, number> = {};
    habitLogs.forEach(log => {
      counts[log.date] = (counts[log.date] || 0) + 1;
    });
    return last30.map(date => ({
      date: getWeekLabel(date),
      fullDate: date,
      count: counts[date] || 0,
    }));
  }, [habitLogs, last30]);

  const habitMetrics = useMemo(() => ({
    totalChecked: habitLogs.length,
    daysWithActivity: new Set(habitLogs.map(l => l.date)).size,
  }), [habitLogs]);

  // 5. Pomodoro Time-of-Day Distribution
  const pomodoroHeatmapMetrics = useMemo(() => {
    // Array representing 24 hours of the day
    const hours = Array.from({ length: 24 }, (_, i) => ({
      hour: `${i.toString().padStart(2, '0')}:00`,
      minutes: 0,
    }));

    // Guard: pomodoroSessions may be undefined/null during initial load
    const safeSessions = Array.isArray(pomodoroSessions) ? pomodoroSessions : [];
    safeSessions.forEach(session => {
      if (session && session.timestamp) {
        // Only include last 30 days
        const limitDate = new Date();
        limitDate.setDate(limitDate.getDate() - 30);
        if (session.timestamp < limitDate.getTime()) return;

        const date = new Date(session.timestamp);
        const hour = date.getHours(); // 0 to 23
        hours[hour].minutes += (session.durationMinutes || 25);
      }
    });

    return hours;
  }, [pomodoroSessions]);

  // AI Summary Data
  const aiUserData = useMemo(() => ({
    todos: todoData,
    habits: habitLogs,
    attendance: attendanceSubjects,
    gym: gymData,
    summary: {
      completedTasks: todoMetrics.completed,
      habitDays: habitMetrics.daysWithActivity,
    }
  }), [todoData, habitLogs, attendanceSubjects, gymData, todoMetrics, habitMetrics]);

  const tooltipStyle = { background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '8px', color: 'var(--text-primary)' };

  if (isLoading) {
    return (
      <div className="learning-container">
        <div className="learning-header">
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}><BarChart3 size={24} className="logo-icon" /> Analytics</h1>
        </div>
        <div className="skeleton" style={{ height: '200px', borderRadius: 'var(--radius-lg)', marginTop: '1rem' }} />
      </div>
    );
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', gap: '0.5rem', padding: '0.75rem 1.5rem', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', flexShrink: 0, zIndex: 10 }}>
        <button
          onClick={() => setActiveTab('30day')}
          style={{ padding: '0.5rem 1rem', borderRadius: 'var(--radius-md)', fontSize: '0.9rem', fontWeight: 600, background: activeTab === '30day' ? 'var(--accent-primary)' : 'transparent', color: activeTab === '30day' ? '#fff' : 'var(--text-secondary)', border: activeTab === '30day' ? '1px solid var(--accent-primary)' : '1px solid transparent', transition: 'all 0.15s', cursor: 'pointer' }}
        >
          30-Day Overview
        </button>
        <button
          onClick={() => setActiveTab('weekly')}
          style={{ padding: '0.5rem 1rem', borderRadius: 'var(--radius-md)', fontSize: '0.9rem', fontWeight: 600, background: activeTab === 'weekly' ? 'var(--accent-primary)' : 'transparent', color: activeTab === 'weekly' ? '#fff' : 'var(--text-secondary)', border: activeTab === 'weekly' ? '1px solid var(--accent-primary)' : '1px solid transparent', transition: 'all 0.15s', cursor: 'pointer' }}
        >
          Weekly Review
        </button>
      </div>

      {activeTab === 'weekly' ? (
        <ErrorBoundary name="Weekly Review">
          <WeeklyReviewModule />
        </ErrorBoundary>
      ) : (
        <div className="learning-container">
          <div className="learning-header">
            <div style={{ flex: 1 }}>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <BarChart3 size={24} className="logo-icon" /> Analytics &amp; Insights
              </h1>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.25rem' }}>Live 30-day overview tailored to your core metrics.</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: isOnline ? '#10b981' : '#ef4444' }}>
              {isOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
              <span>{isOnline ? 'Live Sync' : 'Offline'}</span>
              {isOnline && <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', animation: 'pulse 2s infinite' }} />}
              {lastUpdated && <span style={{ color: 'var(--text-muted)', marginLeft: '0.25rem' }}>· {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.75rem', maxWidth: '100%' }}>
            <StatCard icon={<CheckCircle size={22} />} label="Tasks Completed" value={todoMetrics.completed} sub={`${todoMetrics.rate}% completion rate`} color="#7c3aed" />
            <StatCard icon={<Flame size={22} />} label="Habit Check-ins" value={habitMetrics.totalChecked} sub={`${habitMetrics.daysWithActivity} active days`} color="#ef4444" />
            <StatCard icon={<Dumbbell size={22} />} label="Gym Trend" value="Active" sub="Tracking Big 3 Lifts" color="#f97316" />
            <StatCard icon={<Book size={22} />} label="Attendance" value={`${attendanceSubjects.length} Subj`} sub="Tracking health" color="#14b8a6" />
          </div>

          <div style={{ marginTop: '1rem' }}>
            <AIInsightsPanel userData={aiUserData} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 400px), 1fr))', gap: '1.25rem', marginTop: '1rem' }}>
            
            {/* 1. Habit Heatmap */}
            <div className="topic-card" style={{ padding: '1.5rem', gridColumn: '1 / -1' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
                <Flame size={18} /> Habit Consistency (Last 30 Days)
              </h3>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {habitHeatmapData.map((d, i) => (
                  <div key={i} title={`${d.fullDate}: ${d.count} habits`} style={{
                    width: '24px', height: '24px', borderRadius: '4px',
                    background: d.count === 0 ? 'var(--bg-surface-hover)' : `rgba(16, 185, 129, ${Math.min(0.2 + d.count * 0.2, 1)})`,
                    border: '1px solid rgba(255,255,255,0.05)',
                    transition: 'all 0.2s', cursor: 'pointer'
                  }} />
                ))}
              </div>
            </div>

            {/* 2. Gym Strength Progression */}
            <div className="topic-card" style={{ padding: '1.5rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
                <Dumbbell size={18} /> Strength Progression (Max kg)
              </h3>
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={gymProgressionMetrics} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} interval={4} />
                  <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Line type="monotone" dataKey="bench" stroke="#3b82f6" strokeWidth={3} name="Bench Press" dot={{ r: 3 }} activeDot={{ r: 6 }} connectNulls />
                  <Line type="monotone" dataKey="squat" stroke="#ef4444" strokeWidth={3} name="Squat" dot={{ r: 3 }} activeDot={{ r: 6 }} connectNulls />
                  <Line type="monotone" dataKey="deadlift" stroke="#10b981" strokeWidth={3} name="Deadlift" dot={{ r: 3 }} activeDot={{ r: 6 }} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* 3. Attendance Radar */}
            <div className="topic-card" style={{ padding: '1.5rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
                <Book size={18} /> Subject Attendance Health (%)
              </h3>
              {attendanceRadarData.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <RadarChart cx="50%" cy="50%" outerRadius="70%" data={attendanceRadarData}>
                    <PolarGrid stroke="var(--border-subtle)" />
                    <PolarAngleAxis dataKey="subject" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                    <Radar name="Attendance %" dataKey="attendance" stroke="#a855f7" fill="#a855f7" fillOpacity={0.5} />
                    <Tooltip contentStyle={tooltipStyle} />
                  </RadarChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ height: '260px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                  No attendance data available.
                </div>
              )}
            </div>

            {/* 4. Task Completion (Core retained) */}
            <div className="topic-card" style={{ padding: '1.5rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
                <TrendingUp size={18} /> Task Completion Trend
              </h3>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={todoMetrics.daily} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} interval={4} />
                  <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="completed" fill="#7c3aed" radius={[4, 4, 0, 0]} name="Completed Tasks" />
                  <Bar dataKey="total" fill="rgba(124,58,237,0.2)" radius={[4, 4, 0, 0]} name="Total Added" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* 5. Deep Work Time-of-Day Distribution */}
            <div className="topic-card" style={{ padding: '1.5rem', gridColumn: '1 / -1' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-primary)' }}>
                <Clock size={18} /> Deep Work Time-of-Day Heatmap
              </h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '1rem' }}>Total focus minutes grouped by hour over the last 30 days.</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={pomodoroHeatmapMetrics} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <XAxis dataKey="hour" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} interval={2} />
                  <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
                  <Bar dataKey="minutes" fill="#ec4899" radius={[4, 4, 0, 0]} name="Focus Minutes" />
                </BarChart>
              </ResponsiveContainer>
            </div>

          </div>
        </div>
      )}
    </div>
  );
};
