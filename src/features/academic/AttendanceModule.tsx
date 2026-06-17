import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  collection, query, where, onSnapshot, addDoc, updateDoc,
  doc, writeBatch, limit as firestoreLimit, getDocs,
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import type { User } from 'firebase/auth';
import { db, auth } from '../../services/firebase';
import {
  Check, X, RotateCcw, Edit2, GraduationCap, Plus, History,
  PieChart, Calendar, Settings, Palmtree, AlertTriangle, Download,
  RefreshCw, ChevronDown, ChevronUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { playPopSound } from '../../utils/sound';
import { getLocalDateString, formatDisplayDate } from '../../utils/dateUtils';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { PieChart as RechartsPieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

// ── Schema Version (migration guard — prevents re-running migration on every load) ──
const SCHEMA_VERSION = 1;

// ── Types ──────────────────────────────────────────────────────────────────────

export interface AttendanceSubject {
  id?: string;
  userId: string;
  name: string;
  classesAttended: number;
  classesTotal: number;
  labsAttended: number;
  labsTotal: number;
  targetPercentage: number;
  order: number;
  schedule: Record<string, { classCount: number; labCount: number }>;
  schemaVersion?: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const defaultSchedule: Record<string, { classCount: number; labCount: number }> = {
  '0': { classCount: 0, labCount: 0 },
  '1': { classCount: 1, labCount: 0 },
  '2': { classCount: 1, labCount: 0 },
  '3': { classCount: 1, labCount: 0 },
  '4': { classCount: 1, labCount: 0 },
  '5': { classCount: 1, labCount: 0 },
  '6': { classCount: 0, labCount: 0 },
};

const DAY_NAMES  = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT  = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function getWeekDates(dateStr: string): string[] {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay();
  return Array.from({ length: 7 }, (_, i) => {
    const dt = new Date(d);
    dt.setDate(d.getDate() - day + i);
    return getLocalDateString(dt);
  });
}

const calculateStatus = (attended: number, total: number, target: number) => {
  attended = attended || 0;
  total    = total    || 0;
  target   = target   || 75;
  if (total === 0) return { pct: 100, safe: true, bunkInfo: 'No classes yet', urgency: 'safe' as const };
  const pct   = (attended / total) * 100;
  const safe  = pct >= target;
  const nearEdge = pct >= target - 5 && pct < target;
  let bunkInfo = '';
  let urgency: 'safe' | 'warning' | 'danger' = 'safe';
  if (safe) {
    const safeToMiss = Math.floor((attended * 100 / target) - total);
    if (safeToMiss > 0) {
      bunkInfo = `✓ Can skip ${safeToMiss} more class${safeToMiss > 1 ? 'es' : ''}`;
      urgency  = nearEdge ? 'warning' : 'safe';
    } else {
      bunkInfo = '⚠️ On the edge — 0 skips left';
      urgency  = 'warning';
    }
  } else {
    const needToAttend = Math.ceil((target * total - 100 * attended) / (100 - target));
    bunkInfo = `⚠️ Attend next ${needToAttend} to reach ${target}%`;
    urgency  = 'danger';
  }
  return { pct, safe, bunkInfo, urgency };
};

const getProgressColor = (urgency: string) =>
  urgency === 'danger' ? '#ef4444' : urgency === 'warning' ? '#f59e0b' : '#10b981';

// ── Main Component ─────────────────────────────────────────────────────────────

export const AttendanceModule = () => {
  const [user, setUser]         = useState<User | null>(null);
  const [subjects, setSubjects] = useState<AttendanceSubject[]>([]);
  const [logs, setLogs]         = useState<any[]>([]);
  const [holidays, setHolidays] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [selectedDate, setSelectedDate] = useState<string>(getLocalDateString(new Date()));
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [editName, setEditName]     = useState('');
  const [isTimetableModalOpen, setIsTimetableModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen]     = useState(false);
  const [isExtraOpen, setIsExtraOpen]                   = useState(false);
  const [confirmDeleteId, setConfirmDeleteId]           = useState<string | null>(null);
  const [confirmResetSemester, setConfirmResetSemester] = useState(false);
  const [dismissedWarnings, setDismissedWarnings]       = useState<Set<string>>(new Set());
  const [extraSubjectId, setExtraSubjectId]             = useState('');
  const [overrideOpen, setOverrideOpen]                 = useState<string | null>(null);
  const [overrideCounts, setOverrideCounts]             = useState({ classesAttended: 0, classesTotal: 0, labsAttended: 0, labsTotal: 0 });

  // Debounce refs for schedule table — prevents Firestore write on every keypress
  const scheduleDebounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // ── Auth ──
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  // ── Subjects (with schemaVersion migration guard) ──
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'attendance_subjects'), where('userId', '==', user.uid));
    const unsub = onSnapshot(q, async (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as AttendanceSubject));
      const batch = writeBatch(db);
      let needsCommit = false;
      data.forEach(sub => {
        // Only migrate subjects that have not yet been marked with current schemaVersion
        if ((sub.schemaVersion || 0) < SCHEMA_VERSION) {
          const updates: Record<string, any> = { schemaVersion: SCHEMA_VERSION };
          if (!sub.schedule) updates.schedule = defaultSchedule;
          batch.update(doc(db, 'attendance_subjects', sub.id!), updates);
          needsCommit = true;
        }
      });
      if (needsCommit) await batch.commit();
      data.sort((a, b) => (a.order || 0) - (b.order || 0));
      setSubjects(data);
      setIsLoading(false);
    }, (err) => {
      console.error('Subjects listener error:', err);
      toast.error('Failed to load subjects');
      setIsLoading(false);
    });
    return () => unsub();
  }, [user]);

  // ── Logs — limited to 300 (full semester is ~150–200 max) ──
  useEffect(() => {
    if (!user) return;
    const qLogs = query(
      collection(db, 'attendance_logs'),
      where('userId', '==', user.uid),
      firestoreLimit(300),
    );
    const unsub = onSnapshot(qLogs, (snap) => {
      const allLogs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      allLogs.sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0));
      setLogs(allLogs);
    }, (err) => {
      console.error('Logs listener error:', err);
      toast.error('Failed to load attendance logs');
    });
    return () => unsub();
  }, [user]);

  // ── Holidays ──
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'attendance_holidays'), where('userId', '==', user.uid));
    const unsub = onSnapshot(q, (snap) => {
      setHolidays(snap.docs.map(d => (d.data() as any).date as string));
    });
    return () => unsub();
  }, [user]);

  // ── Memoized log index — O(1) per-subject lookups instead of 3 × .filter() per card ──
  const logsBySubjectId = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const log of logs) {
      if (!map[log.subjectId]) map[log.subjectId] = [];
      map[log.subjectId].push(log);
    }
    return map;
  }, [logs]);

  // ── Derived State ──
  const selectedDayOfWeek  = new Date(selectedDate + 'T00:00:00').getDay().toString();
  const isSelectedHoliday  = holidays.includes(selectedDate);
  const today              = getLocalDateString(new Date());
  const weekDates          = useMemo(() => getWeekDates(selectedDate), [selectedDate]);

  const todayScheduledSubjects = useMemo(() =>
    subjects.filter(s => {
      const sch = s.schedule?.[selectedDayOfWeek];
      return sch && (sch.classCount > 0 || sch.labCount > 0);
    }),
    [subjects, selectedDayOfWeek],
  );



  const warningSubjects = useMemo(() =>
    subjects.filter(s => {
      const totalAtt = (s.classesAttended || 0) + (s.labsAttended || 0);
      const totalCls = (s.classesTotal || 0) + (s.labsTotal || 0);
      if (totalCls === 0) return false;
      return (totalAtt / totalCls) * 100 < (s.targetPercentage || 75);
    }).filter(s => !dismissedWarnings.has(s.id!)),
    [subjects, dismissedWarnings],
  );

  const globalAttended = subjects.reduce((s, x) => s + (x.classesAttended || 0) + (x.labsAttended || 0), 0);
  const globalTotal    = subjects.reduce((s, x) => s + (x.classesTotal    || 0) + (x.labsTotal    || 0), 0);
  const globalPct      = globalTotal === 0 ? 100 : (globalAttended / globalTotal) * 100;
  const globalSafe     = globalPct >= 75;
  const chartData      = [
    { name: 'Attended', value: globalAttended,                          color: '#10b981' },
    { name: 'Missed',   value: Math.max(0, globalTotal - globalAttended), color: '#ef4444' },
  ];

  // ── Handlers ──

  const handleAddSubject = async () => {
    if (!user) { toast.error('Not logged in'); return; }
    try {
      await addDoc(collection(db, 'attendance_subjects'), {
        userId: user.uid, name: 'New Subject',
        classesAttended: 0, classesTotal: 0, labsAttended: 0, labsTotal: 0,
        targetPercentage: 75, order: subjects.length + 1,
        schedule: defaultSchedule, schemaVersion: SCHEMA_VERSION,
      });
      toast.success('Subject added!');
    } catch (err: any) { toast.error(`Failed: ${err.message}`); }
  };

  const handleDeleteSubject = async (id: string) => {
    if (!user) return;
    try {
      const subjectLogs = logs.filter(l => l.subjectId === id);
      const batch = writeBatch(db);
      subjectLogs.forEach(l => batch.delete(doc(db, 'attendance_logs', l.id)));
      batch.delete(doc(db, 'attendance_subjects', id));
      await batch.commit();
      toast.success('Subject and logs deleted');
    } catch (err: any) { toast.error(`Failed: ${err.message}`); }
  };

  const saveSubjectName = async (id: string) => {
    if (!editName.trim()) { setEditingId(null); return; }
    try {
      await updateDoc(doc(db, 'attendance_subjects', id), { name: editName.trim() });
      setEditingId(null);
      toast.success('Name updated!');
    } catch (err: any) { toast.error(`Failed: ${err.message}`); }
  };

  const handleLog = async (
    subject: AttendanceSubject,
    type: 'class' | 'lab',
    action: 'attended' | 'missed',
    logDate: string = selectedDate,
    isExtra = false,
  ) => {
    if (!user || !subject.id) return;
    const attendedKey = type === 'class' ? 'classesAttended' : 'labsAttended';
    const totalKey    = type === 'class' ? 'classesTotal'    : 'labsTotal';
    const newAttended = (subject[attendedKey] || 0) + (action === 'attended' ? 1 : 0);
    const newTotal    = (subject[totalKey]    || 0) + 1;
    try {
      playPopSound();
      const batch = writeBatch(db);
      batch.update(doc(db, 'attendance_subjects', subject.id), { [attendedKey]: newAttended, [totalKey]: newTotal });
      const logRef = doc(collection(db, 'attendance_logs'));
      batch.set(logRef, {
        userId: user.uid, subjectId: subject.id, subjectName: subject.name,
        type, action, date: logDate, isExtra, timestamp: Date.now(),
      });
      await batch.commit();
      toast.success(`${action === 'attended' ? '✓ Attended' : '✗ Missed'} — ${subject.name}`);
    } catch (err: any) { toast.error(`Failed to log: ${err.message}`); }
  };

  const handleUndo = async (logId: string) => {
    if (!user) return;
    const logToUndo = logs.find(l => l.id === logId);
    if (!logToUndo) { toast.error('Log entry not found.'); return; }
    const subject = subjects.find(s => s.id === logToUndo.subjectId);
    if (!subject) { toast.error('Subject was deleted.'); return; }
    const type        = logToUndo.type || 'class';
    const attendedKey = type === 'class' ? 'classesAttended' : 'labsAttended';
    const totalKey    = type === 'class' ? 'classesTotal'    : 'labsTotal';
    const newAttended = Math.max(0, (subject[attendedKey] || 0) - (logToUndo.action === 'attended' ? 1 : 0));
    const newTotal    = Math.max(0, (subject[totalKey]    || 0) - 1);
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'attendance_subjects', subject.id!), { [attendedKey]: newAttended, [totalKey]: newTotal });
      batch.delete(doc(db, 'attendance_logs', logId));
      await batch.commit();
      toast.success(`Undone — reverted for ${subject.name}`);
    } catch (err: any) { toast.error(`Undo failed: ${err.message}`); }
  };

  // Debounced — prevents Firestore write on every keypress in schedule table
  const handleUpdateSchedule = useCallback((subId: string, dayIdx: string, field: 'classCount' | 'labCount', value: number) => {
    const key = `${subId}-${dayIdx}-${field}`;
    clearTimeout(scheduleDebounceRef.current[key]);
    scheduleDebounceRef.current[key] = setTimeout(async () => {
      const sub = subjects.find(s => s.id === subId);
      if (!sub) return;
      const newSchedule = { ...sub.schedule };
      if (!newSchedule[dayIdx]) newSchedule[dayIdx] = { classCount: 0, labCount: 0 };
      newSchedule[dayIdx] = { ...newSchedule[dayIdx], [field]: Math.max(0, value) };
      try {
        await updateDoc(doc(db, 'attendance_subjects', subId), { schedule: newSchedule });
      } catch (err: any) { toast.error(`Schedule update failed: ${err.message}`); }
    }, 500);
  }, [subjects]);

  const handleToggleHoliday = async () => {
    if (!user) return;
    try {
      if (isSelectedHoliday) {
        const q    = query(collection(db, 'attendance_holidays'), where('userId', '==', user.uid), where('date', '==', selectedDate));
        const snap = await getDocs(q);
        const batch = writeBatch(db);
        snap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
        toast.success('Holiday removed');
      } else {
        await addDoc(collection(db, 'attendance_holidays'), { userId: user.uid, date: selectedDate });
        toast.success('Marked as holiday 🌴');
      }
    } catch { toast.error('Failed to update holiday'); }
  };

  const handleExportCSV = () => {
    const rows = [['Date', 'Subject', 'Type', 'Action', 'Extra', 'Time']];
    [...logs]
      .sort((a: any, b: any) => (a.timestamp || 0) - (b.timestamp || 0))
      .forEach((log: any) => {
        rows.push([
          log.date || '', log.subjectName || '', log.type || 'class',
          log.action || '', log.isExtra ? 'Yes' : 'No',
          log.timestamp ? new Date(log.timestamp).toLocaleTimeString() : '',
        ]);
      });
    const csv  = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `attendance_${getLocalDateString(new Date())}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exported!');
  };

  const handleResetSemester = async () => {
    if (!user) return;
    try {
      const batch = writeBatch(db);
      subjects.forEach(s => {
        if (s.id) batch.update(doc(db, 'attendance_subjects', s.id), { classesAttended: 0, classesTotal: 0, labsAttended: 0, labsTotal: 0 });
      });
      logs.forEach(l => batch.delete(doc(db, 'attendance_logs', l.id)));
      await batch.commit();
      toast.success('Semester reset! All counts cleared.');
      setConfirmResetSemester(false);
    } catch (err: any) { toast.error(`Reset failed: ${err.message}`); }
  };

  const handleApplyOverride = async (subId: string) => {
    try {
      await updateDoc(doc(db, 'attendance_subjects', subId), {
        classesAttended: Math.max(0, overrideCounts.classesAttended),
        classesTotal:    Math.max(0, overrideCounts.classesTotal),
        labsAttended:    Math.max(0, overrideCounts.labsAttended),
        labsTotal:       Math.max(0, overrideCounts.labsTotal),
      });
      toast.success('Counts corrected!');
      setOverrideOpen(null);
    } catch (err: any) { toast.error(`Failed: ${err.message}`); }
  };

  // ── Loading State ──
  if (isLoading) return <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Loading Attendance Data...</div>;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="page-pad">

      {/* ── Header ── */}
      <div className="page-header" style={{ marginBottom: '0.75rem' }}>
        <div className="page-header-info">
          <h1><GraduationCap size={22} className="icon-blue" /> Attendance Tracker</h1>
          <p className="subtitle att-desktop-only" style={{ display: 'flex' }}>Log classes · Track progress · Stay above target.</p>
        </div>
        <div className="page-header-actions att-header-actions">
          <div className="date-picker-wrap">
            <Calendar size={14} style={{ color: 'var(--text-muted)' }} />
            <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} />
          </div>
          <button
            className={`btn-secondary att-header-btn${isSelectedHoliday ? ' active' : ''}`}
            onClick={handleToggleHoliday}
            style={{ color: isSelectedHoliday ? '#10b981' : undefined }}
            title={isSelectedHoliday ? 'Remove holiday' : 'Mark as holiday'}
          >
            <Palmtree size={14} />
            <span className="att-btn-label">{isSelectedHoliday ? 'Holiday ✓' : 'Holiday'}</span>
          </button>
          <button
            className={`btn-secondary att-header-btn${isExtraOpen ? ' active' : ''}`}
            onClick={() => setIsExtraOpen(o => !o)}
            title="Log extra/makeup class"
          >
            <Plus size={14} />
            <span className="att-btn-label">Extra</span>
          </button>
          <button className="btn-secondary att-header-btn" onClick={() => setIsHistoryModalOpen(true)} title="Log history">
            <History size={14} />
            <span className="att-btn-label">History</span>
          </button>
          <button className="btn-secondary att-header-btn" onClick={() => setIsTimetableModalOpen(true)} title="Timetable settings">
            <Settings size={14} />
            <span className="att-btn-label">Timetable</span>
          </button>
        </div>
      </div>

      {/* ── Extra Class Inline Dropdown ── */}
      {isExtraOpen && (
        <div className="att-extra-dropdown">
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              value={extraSubjectId}
              onChange={e => setExtraSubjectId(e.target.value)}
              style={{ flex: 1, minWidth: '140px', padding: '0.38rem 0.5rem', borderRadius: '8px', border: '1px solid var(--border-subtle)', background: 'var(--bg-base)', color: 'var(--text-primary)', fontSize: '0.82rem' }}
            >
              <option value="">Select Subject...</option>
              {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            {(['class', 'lab'] as const).map(t =>
              (['attended', 'missed'] as const).map(a => {
                const sub = subjects.find(s => s.id === extraSubjectId);
                return (
                  <button key={`${t}-${a}`}
                    className="btn-secondary"
                    disabled={!extraSubjectId}
                    onClick={() => { if (sub) { handleLog(sub, t, a, selectedDate, true); setExtraSubjectId(''); setIsExtraOpen(false); } else toast.error('Select a subject first'); }}
                    style={{ fontSize: '0.78rem', padding: '0.32rem 0.6rem', color: a === 'attended' ? '#10b981' : '#ef4444', border: `1px solid ${a === 'attended' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`, opacity: extraSubjectId ? 1 : 0.5, display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                  >
                    {a === 'attended' ? <Check size={12} /> : <X size={12} />} {t === 'class' ? 'Class' : 'Lab'}
                  </button>
                );
              })
            )}
            <button onClick={() => { setIsExtraOpen(false); setExtraSubjectId(''); }} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.2rem', display: 'flex' }}><X size={14} /></button>
          </div>
        </div>
      )}

      {/* ── Warning Alerts Banner ── */}
      {warningSubjects.length > 0 && (
        <div className="att-warning-banner">
          <AlertTriangle size={16} style={{ flexShrink: 0, color: '#f59e0b', marginTop: '0.1rem' }} />
          <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: '0.35rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.6)', fontWeight: 600, flexShrink: 0 }}>Low Attendance:</span>
            {warningSubjects.map(s => {
              const totalAtt = (s.classesAttended || 0) + (s.labsAttended || 0);
              const totalCls = (s.classesTotal    || 0) + (s.labsTotal    || 0);
              const pct      = totalCls > 0 ? Math.round((totalAtt / totalCls) * 100) : 0;
              const need     = Math.ceil((s.targetPercentage * totalCls - 100 * totalAtt) / (100 - s.targetPercentage));
              return (
                <span key={s.id} style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '6px', padding: '0.15rem 0.6rem', fontSize: '0.75rem', color: '#fca5a5' }}>
                  <strong>{s.name}</strong> {pct}% — {need} more to recover
                </span>
              );
            })}
          </div>
          <button onClick={() => setDismissedWarnings(new Set(warningSubjects.map(s => s.id!)))}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', padding: '0.1rem', flexShrink: 0 }}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── Week Strip ── */}
      <div className="att-week-strip">
        {weekDates.map((date, i) => {
          const daySubjScheduled = subjects.filter(s => {
            const sch = s.schedule?.[i.toString()];
            return sch && (sch.classCount > 0 || sch.labCount > 0);
          });
          const totalSessions = daySubjScheduled.reduce((sum, s) => {
            const sch = s.schedule?.[i.toString()];
            return sum + (sch?.classCount || 0) + (sch?.labCount || 0);
          }, 0);
          const dayLogs   = logs.filter(l => l.date === date && !l.isExtra);
          const isHol     = holidays.includes(date);
          const isToday   = date === today;
          const isSel     = date === selectedDate;
          const allLogged = totalSessions > 0 && dayLogs.length >= totalSessions;
          return (
            <button
              key={date}
              onClick={() => setSelectedDate(date)}
              className="att-week-pill"
              style={{
                background: isSel ? 'var(--accent-primary)' : isToday ? 'rgba(99,102,241,0.12)' : 'var(--bg-surface)',
                border: `1px solid ${isSel ? 'var(--accent-primary)' : isToday ? 'rgba(99,102,241,0.35)' : 'var(--border-subtle)'}`,
                color: isSel ? '#fff' : 'var(--text-primary)',
                borderRadius: '10px', padding: '0.45rem 0.4rem', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.1rem',
                minWidth: '42px', flex: 1, transition: 'all 0.15s ease',
              }}
            >
              <span style={{ fontSize: '0.6rem', fontWeight: 600, opacity: 0.7 }}>{DAY_SHORT[i]}</span>
              <span style={{ fontSize: '0.72rem', fontWeight: 700 }}>
                {isHol ? '🌴' : allLogged ? '✓' : totalSessions > 0 ? totalSessions : '·'}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Top Row: Overview only ── */}
      <div className="att-overview-desktop" style={{ marginBottom: '1.25rem' }}>
        <div className="panel panel-green attendance-summary-panel">
          <div className="panel-body" style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
            <div style={{ flex: 1 }}>
              <h2 className="overview-title" style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '0.35rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <PieChart size={15} /> <span>Semester Overview</span>
              </h2>
              <div className="global-pct" style={{ fontSize: '2.6rem', fontFamily: 'var(--font-display)', fontWeight: 700, color: globalSafe ? '#10b981' : '#ef4444', lineHeight: 1 }}>
                {Math.round(globalPct)}%
              </div>
              <div className="global-total" style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                {globalAttended} / {globalTotal} attended
              </div>
              <div style={{ marginTop: '0.45rem', height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: '2px', width: `${Math.min(100, globalPct)}%`, background: globalSafe ? '#10b981' : '#ef4444', transition: 'width 0.5s ease' }} />
              </div>
            </div>
            <div className="pie-chart-container" style={{ width: '100px', height: '100px' }}>
              {globalTotal > 0 && (
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsPieChart>
                    <Pie data={chartData} innerRadius={32} outerRadius={44} paddingAngle={4} dataKey="value" stroke="none">
                      {chartData.map((entry, idx) => <Cell key={`cell-${idx}`} fill={entry.color} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '8px' }} />
                  </RechartsPieChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile-only slim stats bar */}
      <div className="att-mobile-stats">
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.6rem', color: globalSafe ? '#10b981' : '#ef4444', lineHeight: 1 }}>
          {Math.round(globalPct)}%
        </div>
        <div style={{ height: '4px', flex: 1, borderRadius: '2px', background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
          <div style={{ height: '100%', borderRadius: '2px', width: `${Math.min(100, globalPct)}%`, background: globalSafe ? '#10b981' : '#ef4444', transition: 'width 0.5s ease' }} />
        </div>
        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
          {globalAttended}/{globalTotal}
        </div>
      </div>

      {/* ── Daily Schedule ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '1.05rem', fontWeight: 600 }}>
          Schedule — {formatDisplayDate(selectedDate)}
        </h2>
        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', background: 'var(--bg-surface)', padding: '0.18rem 0.6rem', borderRadius: '999px' }}>
          {DAY_NAMES[parseInt(selectedDayOfWeek)]}
        </div>
      </div>

      {isSelectedHoliday ? (
        <div style={{ padding: '3rem 2rem', background: 'rgba(16,185,129,0.05)', border: '1px dashed rgba(16,185,129,0.3)', borderRadius: 'var(--radius-lg)', textAlign: 'center' }}>
          <Palmtree size={44} style={{ color: '#10b981', margin: '0 auto 0.85rem', opacity: 0.85 }} />
          <h3 style={{ fontSize: '1.15rem', fontWeight: 600, marginBottom: '0.4rem' }}>Holiday / Leave</h3>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>This day is marked as a holiday.</p>
          <button className="btn-secondary" onClick={handleToggleHoliday} style={{ color: '#ef4444' }}>Remove Holiday Mark</button>
        </div>
      ) : todayScheduledSubjects.length === 0 ? (
        <div style={{ padding: '3rem 2rem', background: 'rgba(16,185,129,0.05)', border: '1px dashed rgba(16,185,129,0.3)', borderRadius: 'var(--radius-lg)', textAlign: 'center' }}>
          <Palmtree size={44} style={{ color: '#10b981', margin: '0 auto 0.85rem', opacity: 0.85 }} />
          <h3 style={{ fontSize: '1.15rem', fontWeight: 600, marginBottom: '0.4rem' }}>No classes scheduled!</h3>
          <p style={{ color: 'var(--text-muted)' }}>Enjoy your free time. Set up your timetable to see classes here.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: '1.25rem' }}>
          {todayScheduledSubjects.map(subject => {
            const sch             = subject.schedule[selectedDayOfWeek];
            const subLogs         = logsBySubjectId[subject.id!] || [];
            const classLogsToday  = subLogs.filter(l => l.date === selectedDate && !l.isExtra && (l.type === 'class' || !l.type)).sort((a: any, b: any) => a.timestamp - b.timestamp);
            const labLogsToday    = subLogs.filter(l => l.date === selectedDate && !l.isExtra && l.type === 'lab').sort((a: any, b: any) => a.timestamp - b.timestamp);
            const recentLogs      = subLogs.slice(0, 5);
            const classStatus     = calculateStatus(subject.classesAttended, subject.classesTotal, subject.targetPercentage);
            const labStatus       = calculateStatus(subject.labsAttended,    subject.labsTotal,    subject.targetPercentage);
            const totalSessions   = (sch?.classCount || 0) + (sch?.labCount || 0);
            const totalLogged     = classLogsToday.length + labLogsToday.length;
            const isDoneForToday  = totalSessions > 0 && totalLogged >= totalSessions;

            // Desktop projection (uses a rough 12-week estimate for remaining semester)
            const totalAtt       = (subject.classesAttended || 0) + (subject.labsAttended || 0);
            const totalCls       = (subject.classesTotal    || 0) + (subject.labsTotal    || 0);
            const sessPerWeek    = Object.values(subject.schedule || {}).reduce((s, d) => s + d.classCount + d.labCount, 0);
            const weeksLeft      = 12;
            const remaining      = sessPerWeek * weeksLeft;
            const bestCase       = totalCls + remaining > 0 ? Math.round(((totalAtt + remaining) / (totalCls + remaining)) * 100) : 0;
            const worstCase      = totalCls + remaining > 0 ? Math.round((totalAtt / (totalCls + remaining)) * 100) : 0;
            const target         = subject.targetPercentage || 75;

            return (
              <div key={subject.id} style={{
                background: 'var(--bg-surface)',
                border: `1px solid ${isDoneForToday ? 'rgba(16,185,129,0.35)' : 'var(--border-subtle)'}`,
                borderRadius: 'var(--radius-lg)', overflow: 'hidden', display: 'flex', flexDirection: 'column',
                boxShadow: isDoneForToday ? '0 0 0 1px rgba(16,185,129,0.12)' : 'none',
                transition: 'border-color 0.3s, box-shadow 0.3s',
              }}>
                {/* Card Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.7rem 1rem', borderBottom: '1px solid var(--border-subtle)', background: isDoneForToday ? 'rgba(16,185,129,0.05)' : 'rgba(0,0,0,0.1)' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.97rem' }}>{subject.name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                    {isDoneForToday && (
                      <span style={{ fontSize: '0.67rem', fontWeight: 700, background: 'rgba(16,185,129,0.15)', color: '#10b981', padding: '0.12rem 0.45rem', borderRadius: '5px', border: '1px solid rgba(16,185,129,0.3)' }}>✓ Done today</span>
                    )}
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Target: {target}%</span>
                  </div>
                </div>

                {/* Classes Section */}
                {sch.classCount > 0 && (
                  <div style={{ padding: '0.7rem 1rem', display: 'flex', flexWrap: 'wrap', gap: '0.85rem', alignItems: 'flex-start', borderBottom: '1px solid var(--border-subtle)' }}>
                    <div style={{ flex: '1 1 105px' }}>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginBottom: '0.1rem' }}>Classes ({sch.classCount})</div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.35rem' }}>
                        <span style={{ fontSize: '1.25rem', fontFamily: 'var(--font-display)', fontWeight: 700, color: classStatus.safe ? '#10b981' : '#ef4444' }}>{Math.round(classStatus.pct)}%</span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>({subject.classesAttended || 0}/{subject.classesTotal || 0})</span>
                      </div>
                      <div style={{ margin: '0.28rem 0', height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', borderRadius: '2px', width: `${Math.min(100, classStatus.pct)}%`, background: getProgressColor(classStatus.urgency), transition: 'width 0.5s ease' }} />
                      </div>
                      <div style={{ fontSize: '0.66rem', fontWeight: 500, color: getProgressColor(classStatus.urgency) }}>{classStatus.bunkInfo}</div>
                    </div>
                    <div style={{ flex: '2 1 190px', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                      {Array.from({ length: sch.classCount }).map((_, idx) => {
                        const logForSession = classLogsToday[idx];
                        return (
                          <div key={`class-${idx}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-base)', padding: '0.38rem 0.55rem', borderRadius: 'var(--radius-md)', flexWrap: 'wrap', gap: '0.35rem' }}>
                            <span style={{ fontSize: '0.78rem', fontWeight: 500 }}>Class {idx + 1}</span>
                            {logForSession ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <span style={{ fontSize: '0.72rem', color: logForSession.action === 'attended' ? '#10b981' : '#ef4444', fontWeight: 600 }}>{logForSession.action === 'attended' ? '✓ Attended' : '✗ Missed'}</span>
                                <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{new Date(logForSession.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                <button onClick={() => handleUndo(logForSession.id)} className="btn-secondary" style={{ padding: '0.1rem 0.25rem', fontSize: '0.65rem', display: 'flex', alignItems: 'center', gap: '0.15rem' }}><RotateCcw size={9} /> Undo</button>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', gap: '0.3rem' }}>
                                <button onClick={() => handleLog(subject, 'class', 'attended')} className="btn-secondary btn-sm btn-success-outline" style={{ padding: '0.22rem 0.45rem', fontSize: '0.72rem' }}><Check size={11} /> Attended</button>
                                <button onClick={() => handleLog(subject, 'class', 'missed')}   className="btn-secondary btn-sm btn-danger-outline"  style={{ padding: '0.22rem 0.45rem', fontSize: '0.72rem' }}><X     size={11} /> Missed</button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Labs Section */}
                {sch.labCount > 0 && (
                  <div style={{ padding: '0.7rem 1rem', display: 'flex', flexWrap: 'wrap', gap: '0.85rem', alignItems: 'flex-start', borderBottom: '1px solid var(--border-subtle)' }}>
                    <div style={{ flex: '1 1 105px' }}>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginBottom: '0.1rem' }}>Labs ({sch.labCount})</div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.35rem' }}>
                        <span style={{ fontSize: '1.25rem', fontFamily: 'var(--font-display)', fontWeight: 700, color: labStatus.safe ? '#10b981' : '#ef4444' }}>{Math.round(labStatus.pct)}%</span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>({subject.labsAttended || 0}/{subject.labsTotal || 0})</span>
                      </div>
                      <div style={{ margin: '0.28rem 0', height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', borderRadius: '2px', width: `${Math.min(100, labStatus.pct)}%`, background: getProgressColor(labStatus.urgency), transition: 'width 0.5s ease' }} />
                      </div>
                      <div style={{ fontSize: '0.66rem', fontWeight: 500, color: getProgressColor(labStatus.urgency) }}>{labStatus.bunkInfo}</div>
                    </div>
                    <div style={{ flex: '2 1 190px', display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                      {Array.from({ length: sch.labCount }).map((_, idx) => {
                        const logForSession = labLogsToday[idx];
                        return (
                          <div key={`lab-${idx}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-base)', padding: '0.38rem 0.55rem', borderRadius: 'var(--radius-md)', flexWrap: 'wrap', gap: '0.35rem' }}>
                            <span style={{ fontSize: '0.78rem', fontWeight: 500 }}>Lab {idx + 1}</span>
                            {logForSession ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                <span style={{ fontSize: '0.72rem', color: logForSession.action === 'attended' ? '#10b981' : '#ef4444', fontWeight: 600 }}>{logForSession.action === 'attended' ? '✓ Attended' : '✗ Missed'}</span>
                                <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>{new Date(logForSession.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                <button onClick={() => handleUndo(logForSession.id)} className="btn-secondary" style={{ padding: '0.1rem 0.25rem', fontSize: '0.65rem', display: 'flex', alignItems: 'center', gap: '0.15rem' }}><RotateCcw size={9} /> Undo</button>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', gap: '0.3rem' }}>
                                <button onClick={() => handleLog(subject, 'lab', 'attended')} className="btn-secondary btn-sm btn-success-outline" style={{ padding: '0.22rem 0.45rem', fontSize: '0.72rem' }}><Check size={11} /> Attended</button>
                                <button onClick={() => handleLog(subject, 'lab', 'missed')}   className="btn-secondary btn-sm btn-danger-outline"  style={{ padding: '0.22rem 0.45rem', fontSize: '0.72rem' }}><X     size={11} /> Missed</button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Desktop-only Semester Projection */}
                <div className="att-desktop-only" style={{ padding: '0.45rem 1rem', background: 'rgba(0,0,0,0.06)', borderBottom: '1px solid var(--border-subtle)', fontSize: '0.68rem', color: 'var(--text-muted)', display: 'flex', gap: '1.25rem' }}>
                  <span>📈 Attend all: <strong style={{ color: bestCase  >= target ? '#10b981' : '#ef4444' }}>{bestCase}%</strong></span>
                  <span>📉 Miss all:   <strong style={{ color: worstCase >= target ? '#10b981' : '#ef4444' }}>{worstCase}%</strong></span>
                  <span style={{ opacity: 0.5 }}>~{weeksLeft} wks left</span>
                </div>

                {/* Recent Logs */}
                <div style={{ padding: '0.6rem 1rem', background: 'rgba(0,0,0,0.05)' }}>
                  <div style={{ fontSize: '0.67rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.35rem', letterSpacing: '0.04em' }}>RECENT</div>
                  {recentLogs.length === 0 ? (
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No logs yet.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.28rem' }}>
                      {recentLogs.map(log => (
                        <div key={`recent-${log.id}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.7rem' }}>
                          <span style={{ color: log.action === 'attended' ? '#10b981' : '#ef4444' }}>
                            {log.action === 'attended' ? '✓' : '✗'} {log.type || 'class'}{log.isExtra ? ' (Extra)' : ''}
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <span style={{ color: 'var(--text-muted)' }}>{formatDisplayDate(log.date)}</span>
                            <button onClick={() => handleUndo(log.id)} className="btn-icon" style={{ padding: '0.08rem' }}><RotateCcw size={9} /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Timetable Modal ── */}
      {isTimetableModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0.5rem' }}>
          <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: '900px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Modal Header */}
            <div style={{ padding: '1.2rem 1.5rem', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ fontSize: '1.15rem', fontWeight: 600 }}>Configure Timetable & Subjects</h2>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Schedule changes auto-save with a short delay.</p>
              </div>
              <div style={{ display: 'flex', gap: '0.6rem' }}>
                <button className="btn-primary" onClick={handleAddSubject}><Plus size={14} /> Add Subject</button>
                <button className="btn-icon" onClick={() => setIsTimetableModalOpen(false)}><X size={19} /></button>
              </div>
            </div>

            {/* Modal Body */}
            <div style={{ overflowY: 'auto', flex: 1, padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {subjects.map(subject => (
                <div key={subject.id} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '0.9rem' }}>
                  {/* Subject Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem', flexWrap: 'wrap', gap: '0.6rem' }}>
                    {editingId === subject.id ? (
                      <input autoFocus type="text" value={editName} onChange={e => setEditName(e.target.value)}
                        onBlur={() => saveSubjectName(subject.id!)} onKeyDown={e => e.key === 'Enter' && saveSubjectName(subject.id!)}
                        className="todo-input" style={{ flex: 1, minWidth: '180px', padding: '0.28rem 0.5rem' }} />
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontWeight: 600, fontSize: '0.97rem', color: 'var(--accent-primary)', flex: 1 }}>
                        {subject.name}
                        <button onClick={() => { setEditingId(subject.id!); setEditName(subject.name); }} className="btn-icon" style={{ opacity: 0.5 }}><Edit2 size={13} /></button>
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                        <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Target %</label>
                        <input type="number" value={subject.targetPercentage}
                          onChange={async (e) => {
                            const val = Math.max(0, Math.min(100, parseInt(e.target.value) || 0));
                            await updateDoc(doc(db, 'attendance_subjects', subject.id!), { targetPercentage: val });
                          }}
                          style={{ width: '55px', padding: '0.22rem', borderRadius: '4px', border: '1px solid var(--border-subtle)', background: 'var(--bg-base)', color: 'var(--text-primary)', textAlign: 'center' }} />
                      </div>
                      <button className="btn-secondary" style={{ fontSize: '0.75rem', color: '#818cf8', padding: '0.25rem 0.6rem' }}
                        onClick={() => {
                          if (overrideOpen === subject.id) { setOverrideOpen(null); return; }
                          setOverrideOpen(subject.id!);
                          setOverrideCounts({ classesAttended: subject.classesAttended || 0, classesTotal: subject.classesTotal || 0, labsAttended: subject.labsAttended || 0, labsTotal: subject.labsTotal || 0 });
                        }}>
                        {overrideOpen === subject.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />} Fix Counts
                      </button>
                      <button className="btn-icon danger" onClick={() => setConfirmDeleteId(subject.id!)}><X size={15} /></button>
                    </div>
                  </div>

                  {/* Manual Override Panel */}
                  {overrideOpen === subject.id && (
                    <div style={{ marginBottom: '0.85rem', padding: '0.7rem', background: 'rgba(129,140,248,0.06)', border: '1px solid rgba(129,140,248,0.2)', borderRadius: '10px', display: 'flex', flexWrap: 'wrap', gap: '0.65rem', alignItems: 'flex-end' }}>
                      {[
                        { label: 'Classes Attended', key: 'classesAttended' as const },
                        { label: 'Classes Total',    key: 'classesTotal'    as const },
                        { label: 'Labs Attended',    key: 'labsAttended'    as const },
                        { label: 'Labs Total',       key: 'labsTotal'       as const },
                      ].map(({ label, key }) => (
                        <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                          <label style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{label}</label>
                          <input type="number" value={overrideCounts[key]} min={0}
                            onChange={e => setOverrideCounts(p => ({ ...p, [key]: parseInt(e.target.value) || 0 }))}
                            style={{ width: '76px', padding: '0.28rem', borderRadius: '6px', border: '1px solid var(--border-subtle)', background: 'var(--bg-base)', color: 'var(--text-primary)', textAlign: 'center' }} />
                        </div>
                      ))}
                      <button className="btn-primary" style={{ fontSize: '0.8rem', padding: '0.38rem 0.9rem' }} onClick={() => handleApplyOverride(subject.id!)}>Apply Override</button>
                    </div>
                  )}

                  {/* Schedule Table (no Start Times row) */}
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', minWidth: '480px', borderCollapse: 'collapse', textAlign: 'center' }}>
                      <thead>
                        <tr>
                          <th style={{ padding: '0.35rem 0.5rem', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', fontWeight: 500, textAlign: 'left', fontSize: '0.82rem' }}>Type</th>
                          {DAY_NAMES.map(day => (
                            <th key={day} style={{ padding: '0.35rem', borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', fontWeight: 500, fontSize: '0.78rem' }}>{day.substring(0, 3)}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(['classCount', 'labCount'] as const).map(field => (
                          <tr key={field}>
                            <td style={{ padding: '0.35rem 0.5rem', fontWeight: 600, textAlign: 'left', fontSize: '0.82rem' }}>{field === 'classCount' ? 'Classes' : 'Labs'}</td>
                            {Object.keys(defaultSchedule).map(dayIdx => (
                              <td key={dayIdx} style={{ padding: '0.35rem' }}>
                                <input type="number" min="0" max="10"
                                  defaultValue={subject.schedule?.[dayIdx]?.[field] || 0}
                                  onChange={e => handleUpdateSchedule(subject.id!, dayIdx, field, parseInt(e.target.value) || 0)}
                                  style={{ width: '44px', padding: '0.22rem', textAlign: 'center', borderRadius: '4px', border: '1px solid var(--border-subtle)', background: 'var(--bg-base)', color: 'var(--text-primary)', fontSize: '0.82rem' }} />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>

            {/* Modal Footer */}
            <div style={{ padding: '0.9rem 1.5rem', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', background: 'var(--bg-base)' }}>
              <button className="btn-secondary" style={{ color: '#10b981', fontSize: '0.82rem' }} onClick={handleExportCSV}>
                <Download size={14} /> Export CSV
              </button>
              <button className="btn-secondary" style={{ color: '#ef4444', fontSize: '0.82rem' }} onClick={() => setConfirmResetSemester(true)}>
                <RefreshCw size={14} /> Reset Semester
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Full History Modal ── */}
      {isHistoryModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0.5rem' }}>
          <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: '580px', maxHeight: '88vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '1.2rem 1.5rem', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '1.05rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}><History size={17} /> Full Log History ({logs.length})</h2>
              <button className="btn-icon" onClick={() => setIsHistoryModalOpen(false)}><X size={19} /></button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1, padding: '0.85rem' }}>
              {logs.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2.5rem' }}>No logs yet.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                  {logs.map(log => (
                    <div key={log.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-surface)', padding: '0.55rem 0.85rem', borderRadius: '10px', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <div>
                        <div style={{ fontSize: '0.82rem', fontWeight: 500 }}>
                          <span style={{ color: log.action === 'attended' ? '#10b981' : '#ef4444' }}>{log.action === 'attended' ? '✓ Attended' : '✗ Missed'}</span>
                          {log.isExtra ? ' (Extra) ' : ' '}{log.type || 'class'} · <strong>{log.subjectName}</strong>
                        </div>
                        <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                          {formatDisplayDate(log.date)} · {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                      <button className="btn-secondary btn-xs" onClick={() => handleUndo(log.id)} style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}><RotateCcw size={10} /> Undo</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm Dialogs ── */}
      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Delete Subject"
        message="Delete this subject and all its logs? This cannot be undone."
        confirmLabel="Delete"
        danger
        onConfirm={() => { if (confirmDeleteId) handleDeleteSubject(confirmDeleteId); setConfirmDeleteId(null); }}
        onCancel={() => setConfirmDeleteId(null)}
      />
      <ConfirmDialog
        open={confirmResetSemester}
        title="Reset Semester"
        message="This will permanently delete ALL attendance logs and reset all subject counts to 0. This CANNOT be undone."
        confirmLabel="Reset Everything"
        danger
        onConfirm={handleResetSemester}
        onCancel={() => setConfirmResetSemester(false)}
      />
    </div>
  );
};
