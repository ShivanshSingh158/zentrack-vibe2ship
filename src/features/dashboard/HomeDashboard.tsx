/**
 * HomeDashboard — the main landing page of ZenTrack.
 *
 * Data strategy: ALL Firestore data comes from GlobalDataContext (already live-synced).
 * This component opens ZERO additional onSnapshot listeners — no double reads, no billing waste.
 *
 * Sub-components in this file:
 *  - DashboardHero         : greeting, date, streak badge
 *  - StudentWidgets        : attendance / assignments / classes grid
 *  - DailyCommandPanel     : water, habits, sleep log, brain dump, quick-add task
 *  - PomodoroWidget        : focus timer ring
 *  - WeeklyFocusChart      : 7-day productive hours chart
 *  - PriorityTasksList     : draggable unscheduled task list
 */
import { useState, useEffect, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { collection, updateDoc, doc, addDoc, deleteDoc } from 'firebase/firestore';
import { db, auth } from '../../services/firebase';
import { getLocalDateString } from '../../utils/dateUtils';
import { usePomodoroContext } from '../../contexts/PomodoroContext';
import { useGlobalData } from '../../contexts/GlobalDataContext';
import {
  Droplets, Timer, Flame, BarChart2, Maximize2, Plus, X,
  RotateCcw, ClipboardList, Square, AlertTriangle, Calendar,
  ClipboardCheck, Check, Moon, Briefcase, Play,
} from 'lucide-react';
import { toast } from 'sonner';
import { sendPushNotification } from '../../services/fcm';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import type { DropResult } from '@hello-pangea/dnd';
import { TimeboxTimeline } from './TimeboxTimeline';
import { AreaChart, Area, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { PomodoroStatsPanel } from '../pomodoro/PomodoroStatsPanel';

// ─── Types ────────────────────────────────────────────────────────────────────
interface LocalLog {
  waterIntakeLiters: number;
  wakeUpTime: string;
  sleepTime: string;
  extraWorks?: string;
}

// ─── DashboardHero ────────────────────────────────────────────────────────────
const DashboardHero = ({ currentStreak, hasRollovers, pendingTaskCount, todayHabitLogs, habits }: {
  currentStreak: number;
  hasRollovers: boolean;
  pendingTaskCount: number;
  todayHabitLogs: Record<string, boolean>;
  habits: any[];
}) => {
  const hour = new Date().getHours();
  const greetingTime =
    hour >= 5 && hour < 12 ? 'morning' :
    hour >= 12 && hour < 17 ? 'afternoon' :
    hour >= 17 && hour < 22 ? 'evening' : 'night';

  const emoji   = { morning: '☀️', afternoon: '⚡', evening: '🌙', night: '✨' }[greetingTime];
  const glow    = { morning: '#fbbf24', afternoon: '#7c3aed', evening: '#a855f7', night: '#7c3aed' }[greetingTime];
  const gradient = {
    morning:   'linear-gradient(135deg, rgba(251,191,36,0.15) 0%, rgba(249,115,22,0.10) 30%, rgba(124,58,237,0.12) 70%, rgba(168,85,247,0.08) 100%)',
    afternoon: 'linear-gradient(135deg, rgba(124,58,237,0.18) 0%, rgba(168,85,247,0.14) 40%, rgba(124,58,237,0.10) 100%)',
    evening:   'linear-gradient(135deg, rgba(168,85,247,0.18) 0%, rgba(124,58,237,0.14) 40%, rgba(192,132,252,0.08) 100%)',
    night:     'linear-gradient(135deg, rgba(9,9,20,0.6) 0%, rgba(124,58,237,0.14) 50%, rgba(168,85,247,0.10) 100%)',
  }[greetingTime];

  const userName    = auth.currentUser?.displayName?.split(' ')[0] || 'Student';
  const todayName   = new Date().toLocaleDateString('en-US', { weekday: 'long' });
  const todayFull   = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const completedH  = Object.values(todayHabitLogs).filter(Boolean).length;

  return (
    <>
      {hasRollovers && (
        <div style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444', padding: '0.6rem 1rem', borderRadius: 'var(--radius-md)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', fontWeight: 500, border: '1px solid rgba(239,68,68,0.2)' }}>
          <span style={{ fontSize: '1rem' }}>🚨</span> You have overdue tasks! Address them today to keep your momentum.
        </div>
      )}
      <div style={{ position: 'relative', background: gradient, border: '1px solid rgba(124,58,237,0.15)', borderRadius: 'var(--radius-xl)', padding: '1.75rem 2rem', marginBottom: '1.5rem', overflow: 'hidden' }} className="hero-header">
        <div style={{ position: 'absolute', top: '-40px', right: '-40px', width: '180px', height: '180px', borderRadius: '50%', background: `radial-gradient(circle, ${glow}30 0%, transparent 70%)`, pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: '-30px', left: '20%', width: '120px', height: '120px', borderRadius: '50%', background: `radial-gradient(circle, ${glow}18 0%, transparent 70%)`, pointerEvents: 'none' }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.3rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: glow, display: 'inline-block', boxShadow: `0 0 6px ${glow}` }} />
              {todayName} • {todayFull}
            </div>
            <h1 style={{ fontSize: 'clamp(1.5rem, 4vw, 2.2rem)', fontWeight: 800, letterSpacing: '-0.02em', margin: 0, lineHeight: 1.1, fontFamily: 'var(--font-display)' }}>
              Good {greetingTime}, {userName} {emoji}
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', margin: '0.35rem 0 0' }}>
              {pendingTaskCount === 0 ? "You're all caught up today! 🎉" : `${pendingTaskCount} priority task${pendingTaskCount !== 1 ? 's' : ''} waiting`}
            </p>
          </div>

          {currentStreak > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.2rem', background: 'linear-gradient(135deg, rgba(251,146,60,0.15), rgba(249,115,22,0.08))', border: '1px solid rgba(251,146,60,0.3)', borderRadius: 'var(--radius-lg)', padding: '0.65rem 1.1rem', backdropFilter: 'blur(8px)', boxShadow: '0 4px 20px -6px rgba(251,146,60,0.3)', animation: 'pulse 3s ease-in-out infinite' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Flame size={20} style={{ color: '#fb923c', filter: 'drop-shadow(0 0 4px rgba(251,146,60,0.5))' }} />
                <span style={{ fontSize: '1.6rem', fontWeight: 800, color: '#fb923c', fontFamily: 'var(--font-display)', lineHeight: 1 }}>{currentStreak}</span>
              </div>
              <span style={{ fontSize: '0.65rem', color: '#fb923c', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.85 }}>Day Streak</span>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

// ─── StudentWidgets ────────────────────────────────────────────────────────────
const StudentWidgets = ({ attendanceSubjects, assignments }: {
  attendanceSubjects: any[];
  assignments: any[];
}) => {
  const navigate = useNavigate();
  const todayStr = getLocalDateString(new Date());
  const dayOfWeek = new Date().getDay().toString();

  const todayClasses = attendanceSubjects.filter(s => {
    const sch = s.schedule?.[dayOfWeek];
    return sch && (sch.classCount > 0 || sch.labCount > 0);
  });

  const pendingAssignments = assignments.filter(a => a.status !== 'submitted' && a.status !== 'graded');

  const atRiskSubjects = attendanceSubjects.filter(s => {
    const total = (s.classesTotal || 0) + (s.labsTotal || 0);
    if (total === 0) return false;
    const attended = (s.classesAttended || 0) + (s.labsAttended || 0);
    return (attended / total * 100) < 80;
  });

  const hasAttendanceData = attendanceSubjects.some(s => (s.classesTotal || 0) + (s.labsTotal || 0) > 0);

  const classesEmpty     = todayClasses.length === 0;
  const assignmentsEmpty = assignments.length === 0;
  const attendanceEmpty  = !hasAttendanceData;
  const allEmpty = classesEmpty && assignmentsEmpty && attendanceEmpty;

  const widgets = [
    {
      isEmpty: classesEmpty,
      node: (
        <div key="classes" style={{ background: 'var(--bg-surface)', padding: '1.25rem', borderRadius: 'var(--radius-lg)', border: `1px solid ${classesEmpty ? 'var(--border-subtle)' : 'rgba(59,130,246,0.25)'}`, cursor: 'pointer', opacity: classesEmpty ? 0.65 : 1, transition: 'all 0.4s ease' }} onClick={() => navigate('/attendance')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(59,130,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Calendar size={16} style={{ color: '#3b82f6' }} />
            </div>
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Today's Classes</span>
            {classesEmpty && <span style={{ marginLeft: 'auto', fontSize: '0.65rem', background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)', padding: '0.1rem 0.45rem', borderRadius: '9999px' }}>No classes today</span>}
          </div>
          {classesEmpty ? (
            <div style={{ fontSize: '0.85rem', color: '#10b981', fontWeight: 500 }}>🌴 No classes today!</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {todayClasses.slice(0, 4).map(s => {
                const sch = s.schedule[dayOfWeek];
                return (
                  <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                    <span style={{ fontWeight: 500 }}>{s.name}</span>
                    <span style={{ color: 'var(--text-muted)' }}>{sch.classCount}C {sch.labCount > 0 ? `+ ${sch.labCount}L` : ''}</span>
                  </div>
                );
              })}
              {todayClasses.length > 4 && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>+{todayClasses.length - 4} more</div>}
            </div>
          )}
        </div>
      ),
    },
    {
      isEmpty: assignmentsEmpty,
      node: (
        <div key="assignments" style={{ background: 'var(--bg-surface)', padding: '1.25rem', borderRadius: 'var(--radius-lg)', border: `1px solid ${assignmentsEmpty ? 'var(--border-subtle)' : 'rgba(139,92,246,0.25)'}`, cursor: 'pointer', opacity: assignmentsEmpty ? 0.65 : 1, transition: 'all 0.4s ease' }} onClick={() => navigate('/assignments')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(139,92,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ClipboardList size={16} style={{ color: '#8b5cf6' }} />
            </div>
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Assignments</span>
            {assignmentsEmpty && <span style={{ marginLeft: 'auto', fontSize: '0.65rem', background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)', padding: '0.1rem 0.45rem', borderRadius: '9999px' }}>Nothing added yet</span>}
          </div>
          {assignmentsEmpty ? (
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No assignments tracked yet. Tap to add one.</div>
          ) : (
            <div style={{ display: 'flex', gap: '1.5rem' }}>
              {[
                { label: 'Overdue', count: assignments.filter(a => a.dueDate < todayStr && a.status !== 'submitted' && a.status !== 'graded').length, color: '#ef4444' },
                { label: 'Due This Week', count: pendingAssignments.filter(a => { const d = new Date(a.dueDate + 'T00:00:00'); const now = new Date(); now.setHours(0,0,0,0); const diff = (d.getTime() - now.getTime()) / (1000*60*60*24); return diff >= 0 && diff <= 7; }).length, color: '#f59e0b' },
                { label: 'Done', count: assignments.filter(a => a.status === 'submitted' || a.status === 'graded').length, color: '#10b981' },
              ].map(({ label, count, color }) => (
                <div key={label} style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, fontFamily: 'var(--font-display)', color }}>{count}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{label}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      ),
    },
    {
      isEmpty: attendanceEmpty,
      node: (
        <div key="attendance" style={{ background: 'var(--bg-surface)', padding: '1.25rem', borderRadius: 'var(--radius-lg)', border: `1px solid ${attendanceEmpty ? 'var(--border-subtle)' : atRiskSubjects.length > 0 ? 'rgba(239,68,68,0.25)' : 'rgba(16,185,129,0.25)'}`, cursor: 'pointer', opacity: attendanceEmpty ? 0.65 : 1, transition: 'all 0.4s ease' }} onClick={() => navigate('/attendance')}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(16,185,129,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ClipboardCheck size={16} style={{ color: '#10b981' }} />
            </div>
            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>Attendance</span>
            {attendanceEmpty && <span style={{ marginLeft: 'auto', fontSize: '0.65rem', background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)', padding: '0.1rem 0.45rem', borderRadius: '9999px' }}>Not tracked yet</span>}
          </div>
          {attendanceEmpty ? (
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>Start logging attendance to see alerts here.</div>
          ) : atRiskSubjects.length === 0 ? (
            <div style={{ fontSize: '0.85rem', color: '#10b981', fontWeight: 500 }}>✅ All subjects above 80%</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              {atRiskSubjects.slice(0, 3).map(s => {
                const total = (s.classesTotal || 0) + (s.labsTotal || 0);
                const attended = (s.classesAttended || 0) + (s.labsAttended || 0);
                const pct = total > 0 ? Math.round(attended / total * 100) : 100;
                return (
                  <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', alignItems: 'center' }}>
                    <span style={{ fontWeight: 500 }}>{s.name}</span>
                    <span style={{ color: pct < 75 ? '#ef4444' : '#f59e0b', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <AlertTriangle size={12} /> {pct}%
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ),
    },
  ];

  const sorted = [...widgets].sort((a, b) => (a.isEmpty === b.isEmpty ? 0 : a.isEmpty ? 1 : -1));

  if (allEmpty) return null;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
      {sorted.map(w => w.node)}
    </div>
  );
};

// ─── DailyCommandPanel ────────────────────────────────────────────────────────
const DailyCommandPanel = ({ localLog, habits, todayHabitLogs, onUpdate, onToggleHabit }: {
  localLog: LocalLog;
  habits: any[];
  todayHabitLogs: Record<string, boolean>;
  onUpdate: (field: string, value: any) => void;
  onToggleHabit: (habitId: string) => void;
}) => {
  const navigate = useNavigate();
  const [quickExtraWorkText, setQuickExtraWorkText] = useState('');
  const [quickTaskText, setQuickTaskText]   = useState('');
  const [quickTaskPriority, setQuickTaskPriority] = useState<'high'|'medium'|'low'>('high');
  const [quickTaskEstimate, setQuickTaskEstimate] = useState('25');
  const [quickTaskStartTime, setQuickTaskStartTime] = useState('');
  const [quickTaskEndTime, setQuickTaskEndTime]   = useState('');

  // Auto-compute duration from start/end time
  useEffect(() => {
    if (!quickTaskStartTime || !quickTaskEndTime) return;
    const [sh, sm] = quickTaskStartTime.split(':').map(Number);
    const [eh, em] = quickTaskEndTime.split(':').map(Number);
    let dur = (eh * 60 + em) - (sh * 60 + sm);
    if (dur < 0) dur += 24 * 60;
    setQuickTaskEstimate(dur.toString());
  }, [quickTaskStartTime, quickTaskEndTime]);

  const addQuickTask = async () => {
    if (!quickTaskText.trim()) return;
    await addDoc(collection(db, 'todos'), {
      userId: auth.currentUser?.uid,
      text: quickTaskText.trim(),
      isCompleted: false,
      priority: quickTaskPriority,
      isRecurring: false,
      estimatedMinutes: parseInt(quickTaskEstimate) || 25,
      timeSlot: quickTaskStartTime || null,
      subtasks: [],
      createdAt: Date.now(),
      order: Date.now(),
      date: getLocalDateString(new Date()),
    });
    setQuickTaskText('');
    setQuickTaskStartTime('');
    setQuickTaskEndTime('');
    setQuickTaskEstimate('25');
    toast.success(quickTaskStartTime ? 'Task scheduled on timeline!' : 'Task added!');
  };

  const addExtraWork = () => {
    if (!quickExtraWorkText.trim()) return;
    const newExtra = localLog.extraWorks
      ? `${localLog.extraWorks}\n- ${quickExtraWorkText}`
      : `- ${quickExtraWorkText}`;
    onUpdate('extraWorks', newExtra);
    setQuickExtraWorkText('');
  };

  const bentoStyle = (borderColor: string): React.CSSProperties => ({
    background: 'rgba(20,20,25,0.6)',
    backdropFilter: 'blur(12px)',
    borderRadius: '24px',
    border: `1px solid ${borderColor}`,
    padding: '1.25rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.05), 0 8px 32px rgba(0,0,0,0.3)',
    transition: 'transform 0.2s',
    position: 'relative',
    overflow: 'hidden',
  });

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem', gridColumn: '1 / -1' }}>

      {/* Water Intake */}
      <div style={bentoStyle('rgba(59,130,246,0.2)')}
        onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-2px)')}
        onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0)')}>
        <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: '50%', height: '1px', background: 'linear-gradient(90deg, transparent, rgba(59,130,246,0.5), transparent)' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: 'rgba(59,130,246,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Droplets size={16} style={{ color: '#60a5fa' }} />
          </div>
          <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Water Intake</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'baseline' }}>
            <span style={{ fontSize: '2rem', fontWeight: 800, fontFamily: 'var(--font-display)', color: '#60a5fa', textShadow: '0 0 15px rgba(59,130,246,0.4)' }}>{localLog.waterIntakeLiters}</span>
            <span style={{ fontSize: '1rem', fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginLeft: '4px' }}>L</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', background: 'rgba(0,0,0,0.3)', padding: '0.25rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
            {[{ label: '−', onClick: () => onUpdate('waterIntakeLiters', Math.max(0, localLog.waterIntakeLiters - 0.5)), bg: 'transparent', color: '#a1a1aa' },
              { label: '+', onClick: () => onUpdate('waterIntakeLiters', localLog.waterIntakeLiters + 0.5), bg: 'rgba(59,130,246,0.2)', color: '#60a5fa' }
            ].map(({ label, onClick, bg, color }) => (
              <button key={label} onClick={onClick} style={{ width: '32px', height: '32px', borderRadius: '8px', background: bg, border: 'none', color, fontWeight: 700, fontSize: '1.2rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>{label}</button>
            ))}
          </div>
        </div>
        <div style={{ height: '6px', borderRadius: '9999px', background: 'rgba(0,0,0,0.5)', overflow: 'hidden' }}>
          <div style={{ height: '100%', borderRadius: '9999px', background: 'linear-gradient(90deg, #3b82f6, #06b6d4)', width: `${Math.min(100, (localLog.waterIntakeLiters / 3) * 100)}%`, transition: 'width 0.5s cubic-bezier(0.4,0,0.2,1)', boxShadow: '0 0 10px rgba(6,182,212,0.8)' }} />
        </div>
      </div>

      {/* Habit Checklist */}
      <div style={bentoStyle('rgba(245,158,11,0.2)')}
        onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-2px)')}
        onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0)')}>
        <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: '50%', height: '1px', background: 'linear-gradient(90deg, transparent, rgba(245,158,11,0.5), transparent)' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: 'rgba(245,158,11,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Flame size={16} style={{ color: '#fbbf24' }} />
          </div>
          <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Today's Habits</span>
          {habits.length > 0 && (
            <span style={{ marginLeft: 'auto', fontSize: '0.75rem', fontWeight: 800, background: Object.values(todayHabitLogs).filter(Boolean).length === habits.length ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)', color: Object.values(todayHabitLogs).filter(Boolean).length === habits.length ? '#10b981' : '#fbbf24', padding: '2px 8px', borderRadius: '12px' }}>
              {Object.values(todayHabitLogs).filter(Boolean).length}/{habits.length}
            </span>
          )}
        </div>
        {habits.length === 0 ? (
          <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontStyle: 'italic', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            No habits yet. <span style={{ color: '#fbbf24', cursor: 'pointer', marginLeft: '4px', fontWeight: 600 }} onClick={() => navigate('/habits')}>Add one →</span>
          </div>
        ) : (
          <div className="habit-scroll" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '120px', overflowY: 'auto', paddingRight: '4px' }}>
            {habits.map((h: any) => {
              const done = !!todayHabitLogs[h.id];
              return (
                <button key={h.id} onClick={() => onToggleHabit(h.id)} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.5rem 0.75rem', borderRadius: '10px', border: '1px solid', borderColor: done ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.05)', cursor: 'pointer', background: done ? 'rgba(16,185,129,0.1)' : 'rgba(0,0,0,0.3)', transition: 'all 0.2s', textAlign: 'left', width: '100%' }}>
                  <div style={{ width: '18px', height: '18px', borderRadius: '5px', flexShrink: 0, border: done ? 'none' : '2px solid rgba(255,255,255,0.2)', background: done ? '#10b981' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {done && <Check size={12} style={{ color: '#fff' }} />}
                  </div>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: done ? '#10b981' : '#fff', textDecoration: done ? 'line-through' : 'none', opacity: done ? 0.75 : 1 }}>
                    {h.emoji || h.icon || '⚡'} {h.name}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Sleep Log */}
      <div style={bentoStyle('rgba(99,102,241,0.2)')}
        onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-2px)')}
        onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0)')}>
        <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: '50%', height: '1px', background: 'linear-gradient(90deg, transparent, rgba(99,102,241,0.5), transparent)' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: 'rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Moon size={16} style={{ color: '#818cf8' }} />
          </div>
          <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sleep Log</span>
          {localLog.sleepTime && localLog.wakeUpTime && (() => {
            const [sh, sm] = localLog.sleepTime.split(':').map(Number);
            const [wh, wm] = localLog.wakeUpTime.split(':').map(Number);
            let mins = (wh * 60 + wm) - (sh * 60 + sm);
            if (mins <= 0) mins += 24 * 60;
            const hrs = Math.floor(mins / 60);
            const m = mins % 60;
            return (
              <span style={{ marginLeft: 'auto', fontSize: '0.75rem', fontWeight: 800, background: hrs >= 7 ? 'rgba(16,185,129,0.2)' : hrs >= 5 ? 'rgba(245,158,11,0.2)' : 'rgba(239,68,68,0.2)', color: hrs >= 7 ? '#10b981' : hrs >= 5 ? '#fbbf24' : '#ef4444', padding: '2px 8px', borderRadius: '12px' }}>
                {hrs}h {m > 0 ? `${m}m` : ''}
              </span>
            );
          })()}
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flex: 1 }}>
          {[
            { label: 'Slept at', field: 'sleepTime', value: localLog.sleepTime },
            { label: 'Woke at', field: 'wakeUpTime', value: localLog.wakeUpTime },
          ].map(({ label, field, value }, i) => (
            <div key={field} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {i === 1 && <div style={{ width: '1px', height: '40px', background: 'rgba(255,255,255,0.1)', position: 'absolute', left: '50%', top: '50%', transform: 'translateY(-50%)' }} />}
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#a1a1aa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</label>
              <input type="time" value={value} onChange={e => onUpdate(field, e.target.value)} style={{ padding: '0.75rem', borderRadius: '12px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', fontSize: '0.95rem', width: '100%', outline: 'none' }} onFocus={e => (e.currentTarget.style.borderColor = 'rgba(99,102,241,0.5)')} onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)')} />
            </div>
          ))}
        </div>
      </div>

      {/* Brain Dump */}
      <div style={bentoStyle('rgba(16,185,129,0.2)')}
        onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-2px)')}
        onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0)')}>
        <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: '60%', height: '1px', background: 'linear-gradient(90deg, transparent, rgba(16,185,129,0.5), transparent)' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: 'rgba(16,185,129,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ClipboardList size={16} style={{ color: '#10b981' }} />
          </div>
          <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Brain Dump & Extra Works</span>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <input type="text" placeholder="Quick add to Brain Dump..." value={quickExtraWorkText} onChange={e => setQuickExtraWorkText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addExtraWork(); }} style={{ flex: 1, padding: '0.75rem', borderRadius: '12px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', fontSize: '0.9rem', outline: 'none' }} onFocus={e => (e.currentTarget.style.borderColor = 'rgba(16,185,129,0.5)')} onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)')} />
          <button onClick={addExtraWork} style={{ padding: '0.75rem 1rem', borderRadius: '12px', background: 'rgba(16,185,129,0.2)', border: '1px solid rgba(16,185,129,0.4)', color: '#10b981', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Plus size={16} /> Add
          </button>
        </div>
        <textarea placeholder="Or write freely here..." value={localLog.extraWorks || ''} onChange={e => onUpdate('extraWorks', e.target.value)} style={{ width: '100%', minHeight: '80px', padding: '1rem', borderRadius: '16px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', fontSize: '0.95rem', outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }} onFocus={e => (e.currentTarget.style.borderColor = 'rgba(16,185,129,0.5)')} onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)')} />
      </div>

      {/* Quick Add Task */}
      <motion.div style={{ gridColumn: '1 / -1', background: 'rgba(20,20,25,0.6)', backdropFilter: 'blur(12px)', borderRadius: '24px', border: '1px solid rgba(168,85,247,0.2)', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.05), 0 8px 32px rgba(0,0,0,0.3)', position: 'relative', overflow: 'hidden' }} whileHover={{ y: -4, scale: 1.01 }} transition={{ type: 'spring', stiffness: 400, damping: 10 }}>
        <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: '60%', height: '1px', background: 'linear-gradient(90deg, transparent, rgba(168,85,247,0.5), transparent)' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: 'rgba(168,85,247,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Plus size={16} style={{ color: '#c084fc' }} />
          </div>
          <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Quick Add Task</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', background: 'rgba(0,0,0,0.2)', padding: '0.5rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
          <input type="text" placeholder="What needs to get done…" value={quickTaskText} onChange={e => setQuickTaskText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addQuickTask(); }} style={{ flex: 1, padding: '0.6rem 0.8rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', fontSize: '0.95rem', outline: 'none' }} onFocus={e => (e.currentTarget.style.borderColor = 'rgba(168,85,247,0.5)')} onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)')} />
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', overflow: 'hidden' }}>
              <input type="time" value={quickTaskStartTime} onChange={e => setQuickTaskStartTime(e.target.value)} style={{ padding: '0.5rem', background: 'transparent', border: 'none', color: '#fff', outline: 'none', fontSize: '0.85rem', width: '85px' }} title="Start Time" />
              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>-</span>
              <input type="time" value={quickTaskEndTime} onChange={e => setQuickTaskEndTime(e.target.value)} style={{ padding: '0.5rem', background: 'transparent', border: 'none', color: '#fff', outline: 'none', fontSize: '0.85rem', width: '85px' }} title="End Time" />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '0 0.4rem', width: '50px' }}>
              <Timer size={13} color="rgba(255,255,255,0.5)" />
              <input type="number" value={quickTaskEstimate} onChange={e => setQuickTaskEstimate(e.target.value)} min="1" max="480" style={{ width: '100%', padding: '0.5rem 0 0.5rem 0.2rem', background: 'transparent', border: 'none', color: '#fff', fontSize: '0.85rem', outline: 'none' }} title="Duration (minutes)" />
            </div>
            <select value={quickTaskPriority} onChange={e => setQuickTaskPriority(e.target.value as any)} style={{ width: '38px', padding: '0.5rem 0', borderRadius: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', fontSize: '0.9rem', outline: 'none', cursor: 'pointer', appearance: 'none', textAlign: 'center' }}>
              <option value="low">🟢</option>
              <option value="medium">🟡</option>
              <option value="high">🔴</option>
            </select>
            <button id="btn-quick-add-task" onClick={addQuickTask} style={{ marginLeft: 'auto', padding: '0.5rem 1.25rem', borderRadius: '8px', background: 'linear-gradient(135deg, #a855f7, #ec4899)', border: 'none', color: '#fff', fontSize: '0.9rem', fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 15px rgba(168,85,247,0.4)' }}>
              Add
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

// ─── PomodoroWidget ────────────────────────────────────────────────────────────
const PomodoroWidget = () => {
  const { state: pomoState, startTimer, pauseTimer, resumeTimer, resetTimer, formatTime, setDuration, toggleFocusMode } = usePomodoroContext();
  const [showStats, setShowStats] = useState(false);
  return (
    <div className="panel" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="panel-header">
        <h2><Timer size={18} /> Focus Timer</h2>
        <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
          <button
            className="btn-icon"
            onClick={() => setShowStats(s => !s)}
            title={showStats ? 'Show Timer' : 'Show Stats'}
            style={{ fontSize: '0.72rem', padding: '0.25rem 0.5rem', color: showStats ? 'var(--accent-primary)' : 'var(--text-muted)', background: showStats ? 'rgba(99,102,241,0.1)' : 'transparent', borderRadius: 'var(--radius-sm)', border: `1px solid ${showStats ? 'rgba(99,102,241,0.3)' : 'transparent'}` }}
          >
            <BarChart2 size={13} />
          </button>
          <button className="btn-icon" onClick={toggleFocusMode}><Maximize2 size={16} /></button>
        </div>
      </div>
      {showStats ? (
        <div className="panel-body" style={{ overflowY: 'auto' }}>
          <PomodoroStatsPanel />
        </div>
      ) : (
      <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', flex: 1, justifyContent: 'center' }}>
        <div style={{ position: 'relative', width: '180px', height: '180px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', background: 'rgba(15,15,20,0.5)', boxShadow: pomoState.isRunning ? '0 0 40px rgba(168,85,247,0.2), inset 0 0 20px rgba(168,85,247,0.1)' : 'inset 0 0 20px rgba(0,0,0,0.5)', transition: 'all 0.5s ease' }}>
          <svg width="180" height="180" style={{ position: 'absolute', top: 0, left: 0, transform: 'rotate(-90deg)', pointerEvents: 'none' }}>
            <circle cx="90" cy="90" r="86" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="2" />
            <circle cx="90" cy="90" r="86" fill="none" stroke="url(#timerGradient)" strokeWidth="4" strokeDasharray="100 40" style={{ transformOrigin: 'center', animation: pomoState.isRunning ? 'spin 10s linear infinite' : 'none', opacity: pomoState.isRunning ? 1 : 0.3, transition: 'opacity 0.5s ease' }} />
            <defs>
              <linearGradient id="timerGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#a855f7" />
                <stop offset="100%" stopColor="#ec4899" />
              </linearGradient>
            </defs>
          </svg>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', zIndex: 1 }}>
            {!pomoState.isRunning && <button className="btn-icon" onClick={() => setDuration(Math.max(1, Math.floor(pomoState.timeLeft / 60) - 5))} style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-muted)' }}>-</button>}
            <span style={{ fontSize: '3.5rem', fontFamily: 'var(--font-display)', fontWeight: 800, color: pomoState.isRunning ? '#fff' : 'var(--text-muted)', textShadow: pomoState.isRunning ? '0 0 15px rgba(168,85,247,0.5)' : 'none', letterSpacing: '-0.02em', transition: 'all 0.5s ease' }}>{formatTime(pomoState.timeLeft)}</span>
            {!pomoState.isRunning && <button className="btn-icon" onClick={() => setDuration(Math.floor(pomoState.timeLeft / 60) + 5)} style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-muted)' }}>+</button>}
          </div>
        </div>
        <div style={{ fontSize: '0.95rem', color: pomoState.isRunning ? '#fff' : 'var(--text-muted)', fontWeight: pomoState.isRunning ? 600 : 400, textAlign: 'center', maxWidth: '80%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', transition: 'all 0.3s' }}>
          {pomoState.taskText || 'Ready to focus?'}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {pomoState.isRunning ? (
            <button className="btn-secondary" onClick={pauseTimer} style={{ background: 'rgba(255,255,255,0.1)', borderColor: 'rgba(255,255,255,0.2)' }}><Square size={16} /> Pause</button>
          ) : (
            <button className="btn-primary hide-on-mobile" onClick={() => pomoState.timeLeft < 25 * 60 && pomoState.timeLeft > 0 ? resumeTimer() : startTimer('focus', 'Deep Work')} style={{ background: 'linear-gradient(135deg, #a855f7, #ec4899)', border: 'none', boxShadow: '0 4px 15px rgba(168,85,247,0.4)' }}>
              <Play size={16} fill="currentColor" /> {pomoState.timeLeft < 25 * 60 && pomoState.timeLeft > 0 ? 'Resume' : `Start ${Math.floor(pomoState.timeLeft / 60)}m`}
            </button>
          )}
          {pomoState.timeLeft > 0 && !pomoState.isRunning && pomoState.timeLeft < 25 * 60 && (
            <button className="btn-icon" onClick={resetTimer} title="Reset Timer" style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 'var(--radius-sm)', padding: '0.5rem' }}><RotateCcw size={16} /></button>
          )}
        </div>
      </div>
      )}
    </div>
  );
};

// ─── WeeklyFocusChart ─────────────────────────────────────────────────────────
const WeeklyFocusChart = ({ dailyLogs }: { dailyLogs: any[] }) => {
  const data = useMemo(() => {
    const today = new Date(); today.setHours(0,0,0,0);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today); d.setDate(d.getDate() - (6 - i));
      const dStr = getLocalDateString(d);
      const log = dailyLogs.find(l => l.date === dStr);
      return { day: d.toLocaleDateString('en-US', { weekday: 'short' }), hours: log ? parseFloat(log.productiveHours || '0') : 0 };
    });
  }, [dailyLogs]);

  return (
    <div className="panel" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="panel-header">
        <h3><BarChart2 size={16}/> Weekly Focus (Hours)</h3>
      </div>
      <div className="panel-body" style={{ flex: 1, minHeight: '140px', width: '100%' }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="colorHours" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#a855f7" stopOpacity={0.5}/>
                <stop offset="95%" stopColor="#a855f7" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
            <Tooltip cursor={{ stroke: 'rgba(168,85,247,0.2)', strokeWidth: 2 }} contentStyle={{ background: 'rgba(20,20,25,0.9)', backdropFilter: 'blur(10px)', border: '1px solid rgba(168,85,247,0.3)', borderRadius: '12px', color: '#fff', padding: '8px 12px' }} itemStyle={{ color: '#c084fc', fontWeight: 600 }} />
            <Area type="monotone" dataKey="hours" stroke="#a855f7" strokeWidth={3} fillOpacity={1} fill="url(#colorHours)" activeDot={{ r: 6, fill: '#fff', stroke: '#a855f7', strokeWidth: 2 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

// ─── PriorityTasksList ─────────────────────────────────────────────────────────
const PriorityTasksList = ({ tasks, interviews, onToggleTask }: {
  tasks: any[];
  interviews: any[];
  onToggleTask: (id: string) => void;
}) => {
  const unscheduled = tasks.filter(t => !t.timeSlot);
  if (unscheduled.length === 0 && interviews.length === 0) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {unscheduled.length > 0 && (
        <div className="panel">
          <div className="panel-header"><h2>Priority Tasks</h2></div>
          <div className="panel-body">
            <Droppable droppableId="priority-tasks">
              {(provided) => (
                <div ref={provided.innerRef} {...provided.droppableProps} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', paddingRight: '0.5rem' }}>
                  {unscheduled.slice(0, 5).map((t, index) => (
                    <Draggable key={t.id} draggableId={t.id} index={index}>
                      {(provided, snapshot) => (
                        <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps} style={{ ...provided.draggableProps.style, display: 'flex', alignItems: 'center', gap: '0.75rem', background: snapshot.isDragging ? 'var(--bg-surface-active)' : 'rgba(255,255,255,0.02)', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: `1px solid ${snapshot.isDragging ? 'var(--accent-primary)' : 'var(--border-subtle)'}`, boxShadow: snapshot.isDragging ? '0 10px 25px rgba(0,0,0,0.5)' : 'none', opacity: snapshot.isDragging ? 0.9 : 1, overflow: 'hidden' }}>
                          <button className="todo-checkbox" aria-label={`Complete task ${t.text}`} onClick={() => onToggleTask(t.id)} />
                          <span style={{ flex: 1, fontSize: '0.9rem' }}>{t.text}</span>
                          <span style={{ fontSize: '0.75rem', padding: '0.1rem 0.4rem', borderRadius: '4px', background: t.priority === 'high' ? 'rgba(239,68,68,0.2)' : 'var(--bg-surface-active)', color: t.priority === 'high' ? '#ef4444' : 'var(--text-muted)' }}>{t.priority}</span>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </div>
        </div>
      )}

      {interviews.length > 0 && (
        <div style={{ background: 'var(--bg-surface)', padding: '1.5rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)' }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Briefcase size={18} /> Active Interviews
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '300px', overflowY: 'auto', paddingRight: '0.5rem' }}>
            {interviews.map(j => (
              <div key={j.id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', background: 'rgba(255,255,255,0.02)', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#fbbf2420', color: '#fbbf24', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: '0.8rem' }}>
                  {j.company?.charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>{j.company}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{j.role}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── HomeDashboard (orchestrator) ─────────────────────────────────────────────
export const HomeDashboard = () => {
  const dashboardRef = useRef<HTMLDivElement>(null);

  // Throttle mouse tracking with rAF to avoid DOM writes on every pixel
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (rafRef.current) return; // already scheduled
      rafRef.current = requestAnimationFrame(() => {
        if (dashboardRef.current) {
          const rect = dashboardRef.current.getBoundingClientRect();
          dashboardRef.current.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`);
          dashboardRef.current.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`);
        }
        rafRef.current = null;
      });
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // ── All data from GlobalDataContext — ZERO extra Firestore listeners ──────
  const { todos, dailyLogs, habitLogs, habits, jobs, goals, attendanceSubjects, assignments, isLoading } = useGlobalData();

  // ── Daily log local state (for debounced saves) ───────────────────────────
  const [localLog, setLocalLog] = useState<LocalLog>({ waterIntakeLiters: 0, wakeUpTime: '', sleepTime: '' });
  const dbLogRef = useRef<any>(null);
  const initialLoadDone = useRef(false);

  const todayStr = getLocalDateString(new Date());

  // Sync dailyLogs → localLog (initial load only)
  useEffect(() => {
    const todayLog = dailyLogs.find(l => l.date === todayStr);
    dbLogRef.current = todayLog || null;
    if (!initialLoadDone.current) {
      initialLoadDone.current = true;
      if (todayLog) {
        setLocalLog({ waterIntakeLiters: todayLog.waterIntakeLiters || 0, wakeUpTime: todayLog.wakeUpTime || '', sleepTime: todayLog.sleepTime || '', extraWorks: todayLog.extraWorks || '' });
      }
    }
  }, [dailyLogs, todayStr]);

  // Debounced save
  useEffect(() => {
    if (!initialLoadDone.current) return;
    const user = auth.currentUser;
    if (!user) return;
    const dbLog = dbLogRef.current;

    const needsSave =
      localLog.waterIntakeLiters !== (dbLog?.waterIntakeLiters || 0) ||
      localLog.wakeUpTime !== (dbLog?.wakeUpTime || '') ||
      localLog.sleepTime !== (dbLog?.sleepTime || '') ||
      localLog.extraWorks !== (dbLog?.extraWorks || '');

    if (!needsSave) return;

    const timer = setTimeout(async () => {
      // Strip undefined fields — Firestore rejects them
      const payload: Record<string, any> = {
        waterIntakeLiters: localLog.waterIntakeLiters,
        wakeUpTime: localLog.wakeUpTime || '',
        sleepTime: localLog.sleepTime || '',
        updatedAt: Date.now(),
      };
      if (localLog.extraWorks !== undefined) payload.extraWorks = localLog.extraWorks;

      try {
        if (dbLog?.id) {
          await updateDoc(doc(db, 'daily_logs', dbLog.id), payload);
        } else {
          const newDoc = await addDoc(collection(db, 'daily_logs'), { userId: user.uid, date: todayStr, ...payload });
          dbLogRef.current = { id: newDoc.id, ...payload };
        }
      } catch (err) {
        console.error('Save error:', err);
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [localLog]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Push notifications (assignments / follow-ups) ─────────────────────────
  useEffect(() => {
    if (!auth.currentUser || isLoading) return;
    const notifiedKey = `notified_${todayStr}`;
    if (localStorage.getItem(notifiedKey)) return;
    if (assignments.length === 0) return;

    const now = Date.now();
    const dueAssignments = assignments.filter(a => a.dueDate === todayStr && a.status !== 'submitted' && a.status !== 'graded');
    const dueFollowUps = jobs.filter(j => j.followUpDate && j.followUpDate <= now);

    let body = '';
    if (dueAssignments.length > 0) body += `You have ${dueAssignments.length} assignment(s) due today!\n`;
    if (dueFollowUps.length > 0)   body += `You have ${dueFollowUps.length} job follow-up(s) pending!\n`;

    if (body) {
      localStorage.setItem(notifiedKey, 'true');
      sendPushNotification({ userIds: [auth.currentUser.uid], title: 'Zentrack Daily Reminder', body: body.trim() }).catch(console.error);
    }
  }, [assignments, jobs, isLoading, todayStr]);

  // ── Derived data (no extra listeners) ────────────────────────────────────
  const dayOfWeek = new Date().getDay();

  const tasks = useMemo(() => {
    const pScore: Record<string, number> = { high: 3, medium: 2, low: 1 };
    return todos
      .filter(t => !t.isCompleted)
      .sort((a, b) => (pScore[b.priority] || 0) - (pScore[a.priority] || 0) || a.createdAt - b.createdAt);
  }, [todos]);

  const interviews = useMemo(() => jobs.filter(j => j.status === 'interviewing'), [jobs]);

  const todayHabits = useMemo(() => habits.filter(h => !h.isArchived && h.activeDays?.includes(dayOfWeek)), [habits, dayOfWeek]);

  const todayHabitLogs = useMemo(() => {
    const map: Record<string, boolean> = {};
    habitLogs.filter(l => l.date === todayStr && l.completed).forEach(l => { map[l.habitId] = true; });
    return map;
  }, [habitLogs, todayStr]);

  const { currentStreak } = useMemo(() => {
    let streak = 0;
    const today = new Date(); today.setHours(0,0,0,0);
    for (let i = 0; i < 365; i++) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      const log = dailyLogs.find(l => l.date === getLocalDateString(d));
      if (log && (log.mood || parseFloat(log.productiveHours || '0') > 0 || log.waterIntakeLiters > 0)) {
        streak++;
      } else if (i !== 0) {
        break;
      }
    }
    return { currentStreak: streak };
  }, [dailyLogs]);

  const hasRollovers = useMemo(() => tasks.some(t => {
    if (!t.dueDate) return false;
    const due = new Date(t.dueDate); due.setHours(0,0,0,0);
    const today = new Date(); today.setHours(0,0,0,0);
    return due < today;
  }), [tasks]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleUpdateLocal = (field: string, value: any) => setLocalLog(prev => ({ ...prev, [field]: value }));

  const handleToggleTask = async (taskId: string) => {
    try {
      await updateDoc(doc(db, 'todos', taskId), { isCompleted: true });
      import('../../utils/notifications').then(({ sendSystemNotification }) => sendSystemNotification('Task Completed! 🎉', { body: 'Great job completing a priority task!' }, true));
      toast.success('Task completed!');
    } catch (err) { console.error(err); }
  };

  const handleToggleHabit = async (habitId: string) => {
    const user = auth.currentUser;
    if (!user) return;
    try {
      const isCompleted = todayHabitLogs[habitId];
      if (isCompleted) {
        // Log ID is already in habitLogs from GlobalDataContext — delete directly.
        // No extra Firestore query needed.
        const logDoc = habitLogs.find(
          l => l.habitId === habitId && l.date === todayStr && l.completed
        );
        if (logDoc?.id) {
          await deleteDoc(doc(db, 'habit_logs', logDoc.id));
        }
        toast.info('Habit unmarked');
      } else {
        await addDoc(collection(db, 'habit_logs'), { userId: user.uid, habitId, date: todayStr, completed: true });
        import('../../utils/notifications').then(({ sendSystemNotification }) => sendSystemNotification('Habit Completed! 🔥', { body: 'Keep the streak going!' }, true));
        toast.success('Habit completed! 🔥');
      }
    } catch (e) { console.error(e); }
  };

  const onDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result;
    if (!destination || (destination.droppableId === source.droppableId && destination.index === source.index)) return;

    try {
      if (destination.droppableId.startsWith('timeline-')) {
        await updateDoc(doc(db, 'todos', draggableId), { timeSlot: destination.droppableId.replace('timeline-', '') });
        toast.success(`Task scheduled for ${destination.droppableId.replace('timeline-', '')}`);
      } else if (destination.droppableId === 'priority-tasks') {
        await updateDoc(doc(db, 'todos', draggableId), { timeSlot: null });
        toast.success('Task moved back to unscheduled');
      }
    } catch (err) {
      console.error('Drag error:', err);
      toast.error('Failed to update task');
    }
  };

  // ── Quick Note Modal state ────────────────────────────────────────────────
  const [isQuickNoteOpen, setIsQuickNoteOpen] = useState(false);
  const [quickNoteTitle, setQuickNoteTitle]   = useState('');
  const [quickNoteContent, setQuickNoteContent] = useState('');

  if (isLoading) return <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Loading Zentrack...</div>;

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div ref={dashboardRef} className="page-pad" style={{ position: 'relative', width: '100%', minHeight: '100vh' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none', zIndex: 0, background: 'radial-gradient(600px circle at var(--mouse-x, 50%) var(--mouse-y, 50%), rgba(168,85,247,0.04), transparent 40%)', transition: 'background 0.2s ease-out' }} />

        <div style={{ position: 'relative', zIndex: 1 }}>
          <DashboardHero
            currentStreak={currentStreak}
            hasRollovers={hasRollovers}
            pendingTaskCount={tasks.length}
            todayHabitLogs={todayHabitLogs}
            habits={todayHabits}
          />

          <TimeboxTimeline tasks={tasks} />

          <StudentWidgets attendanceSubjects={attendanceSubjects} assignments={assignments} />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: '1.5rem', alignItems: 'start' }}>
            <DailyCommandPanel
              localLog={localLog}
              habits={todayHabits}
              todayHabitLogs={todayHabitLogs}
              onUpdate={handleUpdateLocal}
              onToggleHabit={handleToggleHabit}
            />

            <div className="hide-on-mobile" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', alignItems: 'stretch', gridColumn: '1 / -1' }}>
              <PomodoroWidget />
              <WeeklyFocusChart dailyLogs={dailyLogs} />
            </div>

            <PriorityTasksList tasks={tasks} interviews={interviews} onToggleTask={handleToggleTask} />
          </div>
        </div>

        {isQuickNoteOpen && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setIsQuickNoteOpen(false)}>
            <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', boxShadow: '0 20px 50px rgba(0,0,0,0.8)', padding: '2rem', borderRadius: 'var(--radius-lg)', width: '400px', maxWidth: '90vw' }} onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 600 }}>Quick Note</h3>
                <button className="btn-icon" onClick={() => setIsQuickNoteOpen(false)}><X size={18} /></button>
              </div>
              <input type="text" placeholder="Title" value={quickNoteTitle} onChange={e => setQuickNoteTitle(e.target.value)} className="todo-input" style={{ width: '100%', marginBottom: '1rem' }} />
              <textarea placeholder="Write something..." value={quickNoteContent} onChange={e => setQuickNoteContent(e.target.value)} className="todo-input" style={{ width: '100%', minHeight: '100px', resize: 'vertical', marginBottom: '1rem', fontFamily: 'var(--font-sans)' }} />
              <button className="btn-primary" style={{ width: '100%' }} onClick={async () => {
                if (!quickNoteTitle.trim() && !quickNoteContent.trim()) return;
                await addDoc(collection(db, 'notes'), { userId: auth.currentUser?.uid, title: quickNoteTitle.trim() || 'Untitled Note', content: quickNoteContent.trim(), tags: [], createdAt: Date.now(), updatedAt: Date.now() });
                setQuickNoteTitle(''); setQuickNoteContent(''); setIsQuickNoteOpen(false);
                toast.success('Note saved!');
              }}>Save Note</button>
            </div>
          </div>
        )}
      </div>
    </DragDropContext>
  );
};
