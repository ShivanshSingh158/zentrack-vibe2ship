import { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, addDoc, deleteDoc, doc } from 'firebase/firestore';
import { db, auth } from '../../services/firebase';
import { getLocalDateString, formatDisplayDate } from '../../utils/dateUtils';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Briefcase, ListTodo, Target, X, Plus, GraduationCap, AlertTriangle, Palmtree, FileText, Clock, ExternalLink, Link2, Link2Off } from 'lucide-react';
import { toast } from 'sonner';
import {
  initGoogleCalendar, isSignedInToGoogle, signInWithGoogle, signOutGoogle,
  addEventToGoogleCalendar,
} from '../../services/googleCalendar';

const GC_CLIENT_CONFIGURED = !!import.meta.env.VITE_GOOGLE_CALENDAR_CLIENT_ID &&
  import.meta.env.VITE_GOOGLE_CALENDAR_CLIENT_ID !== 'YOUR_GOOGLE_OAUTH_CLIENT_ID_HERE';


interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  type: 'todo' | 'job' | 'goal' | 'exam' | 'assignment_due' | 'holiday' | 'viva' | 'submission';
  isCompleted?: boolean;
  sourceCollection?: string;
  sourceId?: string;
}

const EVENT_COLORS: Record<string, { color: string; bg: string; label: string; icon: string }> = {
  exam: { color: '#ef4444', bg: 'rgba(239,68,68,0.1)', label: 'Exam', icon: '📝' },
  assignment_due: { color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)', label: 'Assignment', icon: '📋' },
  holiday: { color: '#10b981', bg: 'rgba(16,185,129,0.1)', label: 'Holiday', icon: '🌴' },
  viva: { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', label: 'Viva', icon: '🎤' },
  submission: { color: '#3b82f6', bg: 'rgba(59,130,246,0.1)', label: 'Submission', icon: '📤' },
  todo: { color: '#7c3aed', bg: 'rgba(124,58,237,0.1)', label: 'Task', icon: '✅' },
  job: { color: '#fbbf24', bg: 'rgba(251,191,36,0.1)', label: 'Interview', icon: '💼' },
  goal: { color: '#ec4899', bg: 'rgba(236,72,153,0.1)', label: 'Deadline', icon: '🎯' },
};

export const CalendarModule = () => {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [customEvents, setCustomEvents] = useState<CalendarEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<'month' | 'week' | 'day'>('month');
  const [hideCompleted, setHideCompleted] = useState(false);
  const [selectedDayStr, setSelectedDayStr] = useState<string | null>(null);
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventType, setNewEventType] = useState<string>('exam');

  // ── Google Calendar state ─────────────────────────────────────────────────────────────
  const [gcConnected, setGcConnected] = useState(false);
  const [gcLoading, setGcLoading] = useState(false);
  const [exportingId, setExportingId] = useState<string | null>(null);

  // Check if already signed in on mount
  useEffect(() => {
    if (GC_CLIENT_CONFIGURED) {
      initGoogleCalendar().then(() => setGcConnected(isSignedInToGoogle()));
    }
  }, []);

  const handleGoogleConnect = async () => {
    setGcLoading(true);
    try {
      const ok = await initGoogleCalendar();
      if (!ok) { toast.error('Google Calendar is not configured. Add VITE_GOOGLE_CALENDAR_CLIENT_ID to .env'); return; }
      await signInWithGoogle();
      setGcConnected(true);
      toast.success('Connected to Google Calendar!');
    } catch (err: any) {
      toast.error('Google sign-in failed: ' + (err?.message || 'cancelled'));
    } finally { setGcLoading(false); }
  };

  const handleGoogleDisconnect = () => {
    signOutGoogle();
    setGcConnected(false);
    toast.info('Disconnected from Google Calendar');
  };

  const handleExportEvent = async (ev: CalendarEvent) => {
    if (!gcConnected) {
      await handleGoogleConnect();
      if (!isSignedInToGoogle()) return;
    }
    setExportingId(ev.id);
    try {
      await addEventToGoogleCalendar({
        title: ev.title,
        date: ev.date,
        type: ev.type,
        description: `ZenTrack event: ${ev.title} (${EVENT_COLORS[ev.type]?.label || ev.type})`,
      });
      toast.success(`"${ev.title}" added to Google Calendar!`);
    } catch (err: any) {
      toast.error('Export failed: ' + (err?.message || 'unknown error'));
    } finally { setExportingId(null); }
  };
  // ──────────────────────────────────────────────────────────────────────


  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;
    setIsLoading(true);

    let todosEvents: CalendarEvent[] = [];
    let jobsEvents: CalendarEvent[] = [];
    let goalsEvents: CalendarEvent[] = [];
    let assignmentEvents: CalendarEvent[] = [];

    const updateEvents = () => {
      setEvents([...todosEvents, ...jobsEvents, ...goalsEvents, ...assignmentEvents]);
      setIsLoading(false);
    };

    const unsubTodos = onSnapshot(query(collection(db, 'todos'), where('userId', '==', user.uid)), (snap) => {
      todosEvents = [];
      snap.forEach(d => {
        const data = d.data();
        if (data.date) todosEvents.push({ id: `todo_${d.id}`, title: data.text, date: data.date, type: 'todo', isCompleted: data.isCompleted });
      });
      updateEvents();
    });

    const unsubJobs = onSnapshot(query(collection(db, 'job_applications'), where('userId', '==', user.uid)), (snap) => {
      jobsEvents = [];
      snap.forEach(d => {
        const data = d.data();
        if (data.interviewDate) jobsEvents.push({ id: `job_${d.id}`, title: `Interview: ${data.company}`, date: data.interviewDate, type: 'job' });
      });
      updateEvents();
    });

    const unsubGoals = onSnapshot(query(collection(db, 'goals'), where('userId', '==', user.uid), where('status', '==', 'active')), (snap) => {
      goalsEvents = [];
      snap.forEach(d => {
        const data = d.data();
        if (data.deadline) goalsEvents.push({ id: `goal_${d.id}`, title: `Deadline: ${data.title}`, date: data.deadline, type: 'goal' });
      });
      updateEvents();
    });

    const unsubAssignments = onSnapshot(query(collection(db, 'assignments'), where('userId', '==', user.uid)), (snap) => {
      assignmentEvents = [];
      snap.forEach(d => {
        const data = d.data();
        if (data.dueDate) assignmentEvents.push({
          id: `assign_${d.id}`, title: `${data.subjectName}: ${data.title}`, date: data.dueDate,
          type: 'assignment_due', isCompleted: data.status === 'submitted' || data.status === 'graded'
        });
      });
      updateEvents();
    });

    // Custom calendar events (exams, holidays, vivas)
    const unsubCustom = onSnapshot(query(collection(db, 'calendar_events'), where('userId', '==', user.uid)), (snap) => {
      setCustomEvents(snap.docs.map(d => ({ id: d.id, ...d.data() } as CalendarEvent)));
    });

    return () => { unsubTodos(); unsubJobs(); unsubGoals(); unsubAssignments(); unsubCustom(); };
  }, [currentDate]);

  const allEvents = useMemo(() => {
    const combined = [...events, ...customEvents];
    return hideCompleted ? combined.filter(e => !e.isCompleted) : combined;
  }, [events, customEvents, hideCompleted]);

  // Upcoming exams countdown
  const upcomingExams = useMemo(() => {
    const todayStr = getLocalDateString(new Date());
    return [...events, ...customEvents]
      .filter(e => (e.type === 'exam' || e.type === 'viva') && e.date >= todayStr)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 3)
      .map(e => {
        const today = new Date(todayStr + 'T00:00:00');
        const examDate = new Date(e.date + 'T00:00:00');
        const daysLeft = Math.ceil((examDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        return { ...e, daysLeft };
      });
  }, [events, customEvents]);

  const handleAddEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEventTitle.trim() || !selectedDayStr) return;
    const user = auth.currentUser;
    if (!user) return;

    try {
      if (newEventType === 'todo') {
        await addDoc(collection(db, 'todos'), { userId: user.uid, text: newEventTitle.trim(), date: selectedDayStr, isCompleted: false, priority: 'medium', createdAt: Date.now() });
      } else {
        await addDoc(collection(db, 'calendar_events'), {
          userId: user.uid, title: newEventTitle.trim(), date: selectedDayStr, type: newEventType
        });
      }
      setNewEventTitle('');
      toast.success('Added!');
    } catch (err) { toast.error('Failed to add'); }
  };

  const handleDeleteCustomEvent = async (id: string) => {
    try {
      if (id.startsWith('todo_')) {
        await deleteDoc(doc(db, 'todos', id.replace('todo_', '')));
      } else {
        await deleteDoc(doc(db, 'calendar_events', id));
      }
      toast.success('Deleted');
    } catch {
      toast.error('Failed to delete');
    }
  };

  const handlePrev = () => {
    const d = new Date(currentDate);
    if (viewMode === 'month') d.setMonth(d.getMonth() - 1);
    if (viewMode === 'week') d.setDate(d.getDate() - 7);
    if (viewMode === 'day') d.setDate(d.getDate() - 1);
    setCurrentDate(d);
  };

  const handleNext = () => {
    const d = new Date(currentDate);
    if (viewMode === 'month') d.setMonth(d.getMonth() + 1);
    if (viewMode === 'week') d.setDate(d.getDate() + 7);
    if (viewMode === 'day') d.setDate(d.getDate() + 1);
    setCurrentDate(d);
  };

  const renderMonthView = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    const days = [];
    const todayStr = getLocalDateString(new Date());

    for (let i = 0; i < firstDay; i++) {
      days.push(<div key={`pad-${i}`} style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)' }} />);
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = getLocalDateString(new Date(year, month, d));
      const dayEvents = allEvents.filter(e => e.date === dateStr);
      const isToday = dateStr === todayStr;
      const isSelected = dateStr === selectedDayStr;

      days.push(
        <div key={d} onClick={() => setSelectedDayStr(p => p === dateStr ? null : dateStr)} style={{
          background: isSelected ? 'rgba(99, 102, 241, 0.1)' : isToday ? 'var(--bg-surface-active)' : 'var(--bg-surface)',
          border: isSelected ? '1px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
          padding: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem', cursor: 'pointer', transition: 'all 0.2s', minHeight: 0
        }}>
          <div style={{ fontWeight: isToday || isSelected ? 700 : 500, color: isSelected || isToday ? 'var(--accent-primary)' : 'var(--text-primary)', marginBottom: '0.25rem' }}>{d}</div>
          <div style={{ flex: 1, overflow: 'hidden' }} className="cal-day-events">
            {dayEvents.slice(0, 4).map(ev => {
              const cfg = EVENT_COLORS[ev.type] || EVENT_COLORS.todo;
              return (
                <div key={ev.id} title={ev.title} className="cal-event-pill" style={{
                  fontSize: '0.7rem', padding: '0.15rem 0.35rem', borderRadius: '3px',
                  background: cfg.bg, color: ev.isCompleted ? 'var(--text-muted)' : cfg.color,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: '2px',
                  textDecoration: ev.isCompleted ? 'line-through' : 'none'
                }}>
                  <span>{cfg.icon} {ev.title}</span>
                </div>
              );
            })}
            {dayEvents.length > 4 && <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>+{dayEvents.length - 4} more</div>}
          </div>
        </div>
      );
    }
    return days;
  };

  const renderWeekView = () => {
    const day = currentDate.getDay();
    const startOfWeek = new Date(currentDate); startOfWeek.setDate(currentDate.getDate() - day);
    const days = [];
    const todayStr = getLocalDateString(new Date());

    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek); d.setDate(d.getDate() + i);
      const dateStr = getLocalDateString(d);
      const dayEvents = allEvents.filter(e => e.date === dateStr);
      const isToday = dateStr === todayStr;
      const isSelected = dateStr === selectedDayStr;

      days.push(
        <div key={i} onClick={() => setSelectedDayStr(p => p === dateStr ? null : dateStr)} style={{
          background: isSelected ? 'rgba(99, 102, 241, 0.1)' : isToday ? 'var(--bg-surface-active)' : 'var(--bg-surface)',
          border: isSelected ? '1px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
          padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem', cursor: 'pointer', transition: 'all 0.2s'
        }}>
          <div style={{ fontWeight: isToday || isSelected ? 700 : 500, color: isSelected || isToday ? 'var(--accent-primary)' : 'var(--text-secondary)', textAlign: 'center', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border-subtle)' }}>
            {d.toLocaleDateString('en-US', { weekday: 'short' })} {d.getDate()}
          </div>
          {dayEvents.map(ev => {
            const cfg = EVENT_COLORS[ev.type] || EVENT_COLORS.todo;
            return (
              <div key={ev.id} title={ev.title} style={{
                fontSize: '0.8rem', padding: '0.4rem', borderRadius: '4px', background: 'rgba(255,255,255,0.02)',
                borderLeft: `3px solid ${cfg.color}`, color: ev.isCompleted ? 'var(--text-muted)' : 'var(--text-primary)',
                textDecoration: ev.isCompleted ? 'line-through' : 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
              }}>
                {cfg.icon} {ev.title}
              </div>
            );
          })}
        </div>
      );
    }
    return days;
  };

  const renderDayView = () => {
    const dateStr = getLocalDateString(currentDate);
    const dayEvents = allEvents.filter(e => e.date === dateStr);
    return (
      <div style={{ gridColumn: '1 / -1', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', minHeight: '400px', padding: '2.5rem', borderRadius: 'var(--radius-lg)' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 600, marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <CalendarIcon size={24} style={{ color: 'var(--accent-primary)' }} />
          {currentDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
        </h2>
        {dayEvents.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', background: 'var(--bg-base)', borderRadius: 'var(--radius-md)', border: '1px dashed var(--border-subtle)' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: '1rem' }}>No events scheduled.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {dayEvents.map(ev => {
              const cfg = EVENT_COLORS[ev.type] || EVENT_COLORS.todo;
              return (
                <div key={ev.id} style={{
                  display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem 1.25rem', borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderLeft: `4px solid ${cfg.color}`,
                  textDecoration: ev.isCompleted ? 'line-through' : 'none', color: ev.isCompleted ? 'var(--text-muted)' : 'var(--text-primary)'
                }}>
                  <span style={{ fontSize: '1.5rem' }}>{cfg.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 500 }}>{ev.title}</div>
                    <div style={{ fontSize: '0.75rem', color: cfg.color, fontWeight: 600, textTransform: 'uppercase' }}>{cfg.label}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  let headerLabel = `${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
  if (viewMode === 'week') {
    const day = currentDate.getDay();
    const sow = new Date(currentDate); sow.setDate(currentDate.getDate() - day);
    const eow = new Date(sow); eow.setDate(sow.getDate() + 6);
    headerLabel = `${sow.toLocaleDateString(undefined, {month:'short', day:'numeric'})} - ${eow.toLocaleDateString(undefined, {month:'short', day:'numeric'})}, ${currentDate.getFullYear()}`;
  } else if (viewMode === 'day') {
    headerLabel = currentDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }

  if (isLoading) return <div style={{ padding: '2rem' }}>Loading Calendar...</div>;

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      <style>{`
        @keyframes slideInRight { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes slideInUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
        .cal-backdrop { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 199; }
        @media (max-width: 640px) {
          .cal-header-row { flex-direction: column !important; align-items: flex-start !important; }
          .cal-nav-row { width: 100%; justify-content: space-between !important; margin-top: 0.5rem; }
          .cal-legend { display: none !important; }
          .cal-exam-cards { flex-direction: column !important; }
          .cal-exam-card { min-width: 0 !important; flex: none !important; width: 100% !important; }
          .cal-main-pad { padding: 0.75rem !important; }
          .cal-side-panel {
            position: fixed !important; bottom: 0 !important; left: 0 !important; right: 0 !important;
            top: auto !important; width: 100% !important; max-height: 65vh !important;
            border-left: none !important; border-top: 1px solid var(--border-subtle) !important;
            border-radius: 16px 16px 0 0 !important; z-index: 200 !important;
            animation: slideInUp 0.3s ease-out !important;
          }
          .cal-backdrop { display: block !important; }
          .cal-day-cell { padding: 0.25rem !important; min-height: 60px !important; }
          .cal-day-events { display: flex !important; flex-direction: row !important; flex-wrap: wrap !important; gap: 2px !important; }
          .cal-event-pill { width: 6px !important; height: 6px !important; border-radius: 50% !important; padding: 0 !important; background: var(--accent-primary); border: none !important; margin-bottom: 0 !important; }
          .cal-event-pill > span { display: none !important; }
        }
      `}</style>
      <div className="cal-main-pad" style={{ flex: 1, padding: '1rem 2rem', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

        {/* Exam Countdown */}
        {upcomingExams.length > 0 && (
          <div className="cal-exam-cards" style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
            {upcomingExams.map(exam => (
              <div key={exam.id} className="cal-exam-card" style={{
                background: exam.daysLeft <= 3 ? 'rgba(239,68,68,0.08)' : exam.daysLeft <= 7 ? 'rgba(245,158,11,0.08)' : 'var(--bg-surface)',
                border: `1px solid ${exam.daysLeft <= 3 ? 'rgba(239,68,68,0.3)' : exam.daysLeft <= 7 ? 'rgba(245,158,11,0.3)' : 'var(--border-subtle)'}`,
                padding: '1rem 1.25rem', borderRadius: 'var(--radius-lg)', display: 'flex', alignItems: 'center', gap: '1rem', flex: '1', minWidth: '220px'
              }}>
                <div style={{
                  width: '48px', height: '48px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: exam.daysLeft <= 3 ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
                  fontSize: '1.5rem', fontWeight: 800, fontFamily: 'var(--font-display)',
                  color: exam.daysLeft <= 3 ? '#ef4444' : '#f59e0b'
                }}>
                  {exam.daysLeft}
                </div>
                <div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{exam.title}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{formatDisplayDate(exam.date)} • {exam.daysLeft === 0 ? 'Today!' : exam.daysLeft === 1 ? 'Tomorrow' : `${exam.daysLeft} days left`}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Google Calendar Setup Banner ───────────────── */}
        {!GC_CLIENT_CONFIGURED && (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem', padding: '0.65rem 0.9rem', background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 'var(--radius-md)', marginBottom: '1rem' }}>
            <AlertTriangle size={14} style={{ color: '#6366f1', flexShrink: 0, marginTop: '2px' }} />
            <p style={{ fontSize: '0.75rem', color: 'rgba(99,102,241,0.9)', margin: 0, lineHeight: 1.5 }}>
              <strong>Google Calendar sync not configured.</strong> Add <code>VITE_GOOGLE_CALENDAR_CLIENT_ID</code> to your <code>.env</code> file.
              {' '}<a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer" style={{ color: '#6366f1' }}>Get Client ID →</a>
            </p>
          </div>
        )}

        {/* Header */}
        <div className="cal-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CalendarIcon size={24} style={{ color: 'var(--accent-primary)' }} /> Calendar
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {/* Google Calendar connect/disconnect button */}
            {GC_CLIENT_CONFIGURED && (
              gcConnected ? (
                <button
                  onClick={handleGoogleDisconnect}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.35rem 0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(16,185,129,0.3)', background: 'rgba(16,185,129,0.08)', color: '#10b981', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 }}
                  title="Disconnect Google Calendar"
                >
                  <Link2 size={13} /> GCal ✓
                </button>
              ) : (
                <button
                  onClick={handleGoogleConnect}
                  disabled={gcLoading}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.35rem 0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(99,102,241,0.3)', background: 'rgba(99,102,241,0.08)', color: '#6366f1', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, opacity: gcLoading ? 0.7 : 1 }}
                  title="Connect Google Calendar"
                >
                  <Link2Off size={13} /> {gcLoading ? 'Connecting...' : 'Connect Google Cal'}
                </button>
              )
            )}

            <div style={{ display: 'flex', background: 'var(--bg-surface)', padding: '0.25rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
              {(['month', 'week', 'day'] as const).map(mode => (
                <button key={mode} className="btn-icon" onClick={() => setViewMode(mode)} style={{
                  background: viewMode === mode ? 'var(--bg-surface-active)' : 'transparent',
                  color: viewMode === mode ? 'var(--accent-primary)' : 'var(--text-muted)',
                  fontSize: '0.8rem', padding: '0.2rem 0.5rem', textTransform: 'capitalize'
                }}>{mode}</button>
              ))}
            </div>
            <div className="cal-nav-row" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <button className="btn-icon" onClick={handlePrev}><ChevronLeft size={20} /></button>
              <span style={{ fontSize: '1.1rem', fontWeight: 600, minWidth: '180px', textAlign: 'center' }}>{headerLabel}</span>
              <button className="btn-icon" onClick={handleNext}><ChevronRight size={20} /></button>
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="cal-legend" style={{ display: 'flex', gap: '1rem', marginBottom: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.8rem', flexWrap: 'wrap' }}>
            {Object.entries(EVENT_COLORS).map(([key, cfg]) => (
              <span key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: cfg.color }}>
                {cfg.icon} {cfg.label}
              </span>
            ))}
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)', cursor: 'pointer', marginLeft: 'auto' }}>
            <input type="checkbox" checked={hideCompleted} onChange={e => setHideCompleted(e.target.checked)} />
            Hide Completed
          </label>
        </div>

        {/* Calendar Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: viewMode === 'day' ? '1fr' : 'repeat(7, 1fr)', gridAutoRows: viewMode !== 'day' ? '1fr' : 'auto', gap: '1px', background: 'var(--border-subtle)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', flex: 1, minHeight: 0 }}>
          {viewMode !== 'day' && ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} style={{ background: 'var(--bg-surface)', padding: '0.5rem', textAlign: 'center', fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{day}</div>
          ))}
          {viewMode === 'month' && renderMonthView()}
          {viewMode === 'week' && renderWeekView()}
          {viewMode === 'day' && renderDayView()}
        </div>
      </div>

      {/* Side Panel */}
      {selectedDayStr && viewMode !== 'day' && (
        <>
          <div className="cal-backdrop" onClick={() => setSelectedDayStr(null)} />
          <div className="cal-side-panel" style={{ width: '350px', background: 'var(--bg-surface)', borderLeft: '1px solid var(--border-subtle)', padding: '1.5rem', display: 'flex', flexDirection: 'column', animation: 'slideInRight 0.3s ease-out' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Agenda</h2>
            <button className="btn-icon" onClick={() => setSelectedDayStr(null)}><X size={18} /></button>
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
            {new Date(selectedDayStr + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>

          {/* Quick Add */}
          <form onSubmit={handleAddEvent} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '2rem', background: 'var(--bg-base)', padding: '1rem', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Plus size={16} /> Quick Add</div>
            <select value={newEventType} onChange={e => setNewEventType(e.target.value)} className="todo-input" style={{ width: '100%', padding: '0.5rem', fontSize: '0.85rem' }}>
              <option value="exam">📝 Exam</option>
              <option value="viva">🎤 Viva</option>
              <option value="submission">📤 Submission</option>
              <option value="holiday">🌴 Holiday</option>
              <option value="todo">✅ Task</option>
            </select>
            <input type="text" value={newEventTitle} onChange={e => setNewEventTitle(e.target.value)} placeholder="Event title..." className="todo-input" style={{ width: '100%', padding: '0.5rem', fontSize: '0.85rem' }} />
            <button type="submit" className="btn-primary" style={{ padding: '0.5rem', fontSize: '0.85rem', justifyContent: 'center', width: '100%' }} disabled={!newEventTitle.trim()}>
              Add Event
            </button>
          </form>

          {/* Events list */}
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {allEvents.filter(e => e.date === selectedDayStr).length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', textAlign: 'center', marginTop: '2rem' }}>No events.</div>
            ) : (
              allEvents.filter(e => e.date === selectedDayStr).map(ev => {
                const cfg = EVENT_COLORS[ev.type] || EVENT_COLORS.todo;
                return (
                  <div key={ev.id} style={{
                    display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderLeft: `3px solid ${cfg.color}`,
                    textDecoration: ev.isCompleted ? 'line-through' : 'none'
                  }}>
                    <span>{cfg.icon}</span>
                    <div style={{ flex: 1, fontSize: '0.85rem' }}>{ev.title}</div>
                    {/* Export to Google Calendar */}
                    {GC_CLIENT_CONFIGURED && !ev.isCompleted && (
                      <button
                        className="btn-icon"
                        onClick={() => handleExportEvent(ev)}
                        disabled={exportingId === ev.id}
                        title="Add to Google Calendar"
                        style={{ color: '#6366f1', opacity: exportingId === ev.id ? 0.5 : 1 }}
                      >
                        {exportingId === ev.id ? <Clock size={13} /> : <ExternalLink size={13} />}
                      </button>
                    )}
                    {ev.id && !ev.id.startsWith('job_') && !ev.id.startsWith('goal_') && !ev.id.startsWith('assign_') && (
                      <button className="btn-icon danger" onClick={() => handleDeleteCustomEvent(ev.id)} style={{ padding: '0.15rem' }} title="Delete event"><X size={14} /></button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
        </>
      )}
    </div>
  );
};
