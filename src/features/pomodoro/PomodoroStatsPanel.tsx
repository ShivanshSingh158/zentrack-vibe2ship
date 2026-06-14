import { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../../services/firebase';
import { getLocalDateString } from '../../utils/dateUtils';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Timer, TrendingUp, Target, Flame, BarChart2 } from 'lucide-react';

interface PomodoroSession {
  id: string;
  date: string;
  timestamp: number;
  taskId: string | null;
  taskText: string;
  durationMinutes: number;
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * PomodoroStatsPanel — reads from the `pomodoro_sessions` collection that
 * PomodoroContext writes to on every completed session.
 * Shows: sessions today, this week, top tasks, avg length, daily bar chart.
 */
export const PomodoroStatsPanel = () => {
  const [sessions, setSessions] = useState<PomodoroSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) { setIsLoading(false); return; }

    // Last 28 days window — enough for weekly trends without over-fetching
    const since = Date.now() - 28 * 24 * 60 * 60 * 1000;
    const q = query(
      collection(db, 'pomodoro_sessions'),
      where('userId', '==', user.uid),
      where('timestamp', '>=', since)
    );

    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as PomodoroSession));
      data.sort((a, b) => b.timestamp - a.timestamp);
      setSessions(data);
      setIsLoading(false);
    }, () => setIsLoading(false));

    return () => unsub();
  }, []);

  const todayStr = getLocalDateString(new Date());

  const stats = useMemo(() => {
    const todaySessions  = sessions.filter(s => s.date === todayStr);
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - 6);
    const weekStartStr = getLocalDateString(weekStart);
    const weekSessions  = sessions.filter(s => s.date >= weekStartStr);

    const totalMinsToday = todaySessions.reduce((a, s) => a + (s.durationMinutes || 25), 0);
    const totalMinsWeek  = weekSessions.reduce((a, s)  => a + (s.durationMinutes || 25), 0);

    // Task frequency this week
    const taskFreq: Record<string, number> = {};
    weekSessions.forEach(s => {
      const key = s.taskText || 'Focus Session';
      taskFreq[key] = (taskFreq[key] || 0) + 1;
    });
    const topTasks = Object.entries(taskFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    const avgMins = weekSessions.length > 0
      ? Math.round(totalMinsWeek / weekSessions.length)
      : 0;

    // Daily chart — last 7 days
    const chartData = Array.from({ length: 7 }).map((_, i) => {
      const d = new Date(now);
      d.setDate(now.getDate() - (6 - i));
      const dateStr = getLocalDateString(d);
      const daySessions = sessions.filter(s => s.date === dateStr);
      return {
        day: DAY_LABELS[d.getDay()],
        sessions: daySessions.length,
        minutes: daySessions.reduce((a, s) => a + (s.durationMinutes || 25), 0),
      };
    });

    return { todaySessions, weekSessions, totalMinsToday, totalMinsWeek, topTasks, avgMins, chartData };
  }, [sessions, todayStr]);

  if (isLoading) {
    return (
      <div style={{ padding: '1rem', color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center' }}>
        Loading stats...
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div style={{
        padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)',
        border: '1px dashed var(--border-subtle)', borderRadius: 'var(--radius-md)',
        marginTop: '0.75rem',
      }}>
        <Timer size={32} style={{ margin: '0 auto 0.75rem', opacity: 0.3, display: 'block' }} />
        <p style={{ fontSize: '0.85rem' }}>Complete your first Pomodoro session to see stats here.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '0.75rem' }}>

      {/* KPI Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '0.6rem' }}>
        {[
          {
            icon: <Flame size={14} style={{ color: '#f59e0b' }} />,
            label: 'Today',
            value: stats.todaySessions.length,
            sub: `${stats.totalMinsToday} min`,
          },
          {
            icon: <BarChart2 size={14} style={{ color: '#6366f1' }} />,
            label: 'This Week',
            value: stats.weekSessions.length,
            sub: `${Math.round(stats.totalMinsWeek / 60 * 10) / 10}h focus`,
          },
          {
            icon: <Timer size={14} style={{ color: '#10b981' }} />,
            label: 'Avg Length',
            value: `${stats.avgMins}m`,
            sub: 'per session',
          },
          {
            icon: <Target size={14} style={{ color: '#ec4899' }} />,
            label: 'Top Task',
            value: stats.topTasks[0]?.[0]?.slice(0, 12) || '—',
            sub: stats.topTasks[0] ? `${stats.topTasks[0][1]}× this week` : 'none yet',
          },
        ].map(card => (
          <div key={card.label} style={{
            background: 'var(--bg-base)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '0.65rem 0.75rem',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.3rem' }}>
              {card.icon}
              <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {card.label}
              </span>
            </div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>
              {card.value}
            </div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>{card.sub}</div>
          </div>
        ))}
      </div>

      {/* Daily Bar Chart */}
      <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '0.85rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.75rem', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
          <TrendingUp size={13} /> Sessions — Last 7 Days
        </div>
        <ResponsiveContainer width="100%" height={90}>
          <BarChart data={stats.chartData} margin={{ top: 0, right: 0, left: -30, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis dataKey="day" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} allowDecimals={false} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '8px', fontSize: '0.78rem' }}
              formatter={(v: any) => [`${v} sessions`, 'Focus']}
            />
            <Bar dataKey="sessions" fill="#6366f1" radius={[3, 3, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Top Tasks */}
      {stats.topTasks.length > 0 && (
        <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '0.85rem' }}>
          <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.6rem' }}>
            🏆 Top Focus Tasks — This Week
          </div>
          {stats.topTasks.map(([task, count], i) => (
            <div key={task} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.45rem' }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: ['#f59e0b','#6366f1','#10b981'][i], width: '16px', textAlign: 'center' }}>
                {['🥇','🥈','🥉'][i]}
              </span>
              <div style={{ flex: 1, fontSize: '0.8rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {task}
              </div>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', flexShrink: 0 }}>{count}×</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
