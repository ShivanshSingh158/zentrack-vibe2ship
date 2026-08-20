import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  collection, query, where, onSnapshot, addDoc, updateDoc,
  doc, writeBatch, deleteDoc, getDocs
} from 'firebase/firestore';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { db, auth } from '../../services/firebase';
import {
  GraduationCap, Check, X, RotateCcw, Plus, Calendar,
  Settings, Download, Trash2, Edit2, AlertTriangle, Sparkles,
  ChevronRight, RefreshCw, Layers, School, Clock, CheckCircle2,
  CalendarDays, Flame, AlertCircle, FileText, Palmtree, MoreVertical
} from 'lucide-react';
import { toast } from 'sonner';
import { playPopSound } from '../../utils/sound';
import { getLocalDateString, formatDisplayDate } from '../../utils/dateUtils';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';

// ── Constants & Helpers ──
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
}

const defaultSchedule: Record<string, { classCount: number; labCount: number }> = {
  '0': { classCount: 0, labCount: 0 },
  '1': { classCount: 1, labCount: 0 },
  '2': { classCount: 1, labCount: 0 },
  '3': { classCount: 1, labCount: 0 },
  '4': { classCount: 1, labCount: 0 },
  '5': { classCount: 1, labCount: 0 },
  '6': { classCount: 0, labCount: 0 },
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getWeekDates(dateStr: string): string[] {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay();
  return Array.from({ length: 7 }, (_, i) => {
    const dt = new Date(d);
    dt.setDate(d.getDate() - day + i);
    return getLocalDateString(dt);
  });
}

// Bunk Math Calculator
export function calculateBunkMath(attended: number, total: number, target = 75) {
  if (total === 0) return { status: 'safe' as const, count: 0, text: 'No classes yet', urgency: 'safe' as const };
  const pct = (attended / total) * 100;

  if (pct >= target) {
    const safeToMiss = Math.floor((attended * 100 / target) - total);
    if (safeToMiss > 0) {
      return {
        status: 'safe' as const,
        count: safeToMiss,
        text: `✓ Can miss ${safeToMiss} more ${safeToMiss === 1 ? 'class' : 'classes'}`,
        urgency: 'safe' as const,
      };
    }
    return {
      status: 'warning' as const,
      count: 0,
      text: '⚠️ 0 misses left — attend next class',
      urgency: 'warning' as const,
    };
  } else {
    const needed = Math.ceil((target * total - 100 * attended) / (100 - target));
    return {
      status: 'danger' as const,
      count: needed,
      text: `⚠️ Attend ${needed} more ${needed === 1 ? 'class' : 'classes'} to reach ${target}%`,
      urgency: 'danger' as const,
    };
  }
}

export const AttendanceModule = () => {
  const [user, setUser] = useState<User | null>(null);
  const [subjects, setSubjects] = useState<AttendanceSubject[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [holidays, setHolidays] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [selectedDate, setSelectedDate] = useState<string>(getLocalDateString(new Date()));
  const [isTimetableModalOpen, setIsTimetableModalOpen] = useState(false);
  const [selectedHistorySubject, setSelectedHistorySubject] = useState<AttendanceSubject | null>(null);
  const [isExtraOpen, setIsExtraOpen] = useState(false);
  const [extraSubjectId, setExtraSubjectId] = useState('');
  const [overrideSubject, setOverrideSubject] = useState<AttendanceSubject | null>(null);
  const [overrideCounts, setOverrideCounts] = useState({ classesAttended: 0, classesTotal: 0, labsAttended: 0, labsTotal: 0 });
  const [editSubjectModal, setEditSubjectModal] = useState<{ isOpen: boolean; subject: AttendanceSubject | null }>({ isOpen: false, subject: null });
  const [subjectForm, setSubjectForm] = useState({ name: '', targetPercentage: 75 });
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [dismissedWarnings, setDismissedWarnings] = useState<Set<string>>(new Set());

  // Listen to Auth & Firestore Subscriptions
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        setSubjects([]);
        setLogs([]);
        setHolidays([]);
        setIsLoading(false);
      }
    });
    return () => unsubAuth();
  }, []);

  useEffect(() => {
    if (!user) return;
    setIsLoading(true);

    const subQ = query(collection(db, 'attendance_subjects'), where('userId', '==', user.uid));
    const unsubSub = onSnapshot(subQ, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as AttendanceSubject[];
      data.sort((a, b) => (a.order || 0) - (b.order || 0));
      setSubjects(data);
      setIsLoading(false);
    });

    const logQ = query(collection(db, 'attendance_logs'), where('userId', '==', user.uid));
    const unsubLog = onSnapshot(logQ, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setLogs(data);
    });

    const holQ = query(collection(db, 'attendance_holidays'), where('userId', '==', user.uid));
    const unsubHol = onSnapshot(holQ, (snap) => {
      const data = snap.docs.map(d => d.data().date);
      setHolidays(data);
    });

    return () => {
      unsubSub();
      unsubLog();
      unsubHol();
    };
  }, [user]);

  // Derived Data
  const selectedDayOfWeek = String(new Date(selectedDate + 'T00:00:00').getDay());
  const isSelectedHoliday = holidays.includes(selectedDate);
  const weekDates = useMemo(() => getWeekDates(selectedDate), [selectedDate]);
  const todayStr = getLocalDateString(new Date());

  const handleShiftWeek = (direction: -1 | 1) => {
    const current = new Date(selectedDate + 'T00:00:00');
    current.setDate(current.getDate() + direction * 7);
    setSelectedDate(getLocalDateString(current));
  };

  const getClassCountForDay = useCallback((dayIndex: number) => {
    const dayKey = String(dayIndex);
    let count = 0;
    for (const s of subjects) {
      const daySched = s.schedule?.[dayKey] || defaultSchedule[dayKey];
      count += (daySched?.classCount || 0) + (daySched?.labCount || 0);
    }
    return count;
  }, [subjects]);

  const weekRangeLabel = useMemo(() => {
    if (weekDates.length < 7) return '';
    const start = new Date(weekDates[0] + 'T00:00:00');
    const end = new Date(weekDates[6] + 'T00:00:00');
    const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    return `${startStr} – ${endStr}`;
  }, [weekDates]);

  // Group logs by subject
  const logsBySubjectId = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const l of logs) {
      if (!map[l.subjectId]) map[l.subjectId] = [];
      map[l.subjectId].push(l);
    }
    return map;
  }, [logs]);

  // Semester Global Totals
  const { globalAttended, globalTotal, globalPct } = useMemo(() => {
    let attended = 0;
    let total = 0;
    for (const s of subjects) {
      attended += (s.classesAttended || 0) + (s.labsAttended || 0);
      total += (s.classesTotal || 0) + (s.labsTotal || 0);
    }
    const pct = total > 0 ? Math.round((attended / total) * 100) : null;
    return { globalAttended: attended, globalTotal: total, globalPct: pct };
  }, [subjects]);

  // Today's Scheduled Sessions
  const todaySessions = useMemo(() => {
    const sessions: Array<{
      id: string;
      subject: AttendanceSubject;
      type: 'class' | 'lab';
      idx: number;
      timeStr: string;
    }> = [];

    for (const s of subjects) {
      const daySched = s.schedule?.[selectedDayOfWeek] || defaultSchedule[selectedDayOfWeek];
      const classCount = daySched?.classCount || 0;
      const labCount = daySched?.labCount || 0;

      for (let i = 0; i < classCount; i++) {
        sessions.push({
          id: `${s.id}-class-${i}`,
          subject: s,
          type: 'class',
          idx: i,
          timeStr: `${9 + sessions.length}:00 AM - ${10 + sessions.length}:00 AM`,
        });
      }

      for (let i = 0; i < labCount; i++) {
        sessions.push({
          id: `${s.id}-lab-${i}`,
          subject: s,
          type: 'lab',
          idx: i,
          timeStr: `${10 + sessions.length}:15 AM - ${12 + sessions.length}:15 PM`,
        });
      }
    }
    return sessions;
  }, [subjects, selectedDayOfWeek]);

  // At-Risk Warning Subjects
  const warningSubjects = useMemo(() => {
    return subjects.filter(s => {
      const att = (s.classesAttended || 0) + (s.labsAttended || 0);
      const tot = (s.classesTotal || 0) + (s.labsTotal || 0);
      const target = s.targetPercentage || 75;
      const pct = tot > 0 ? (att / tot) * 100 : 100;
      return pct < target && !dismissedWarnings.has(s.id!);
    });
  }, [subjects, dismissedWarnings]);

  // ── Handlers ──
  const handleLogSession = async (
    subject: AttendanceSubject,
    type: 'class' | 'lab',
    action: 'attended' | 'missed' | 'cancelled',
    date = selectedDate,
    isExtra = false
  ) => {
    if (!user) return;
    try {
      playPopSound();

      // 1. Add Log
      await addDoc(collection(db, 'attendance_logs'), {
        userId: user.uid,
        subjectId: subject.id,
        subjectName: subject.name,
        type,
        action,
        date,
        isExtra,
        timestamp: Date.now(),
      });

      // 2. Update Subject Totals (if not cancelled)
      if (action !== 'cancelled') {
        const isAttended = action === 'attended';
        const subRef = doc(db, 'attendance_subjects', subject.id!);

        if (type === 'class') {
          await updateDoc(subRef, {
            classesTotal: (subject.classesTotal || 0) + 1,
            classesAttended: (subject.classesAttended || 0) + (isAttended ? 1 : 0),
          });
        } else {
          await updateDoc(subRef, {
            labsTotal: (subject.labsTotal || 0) + 1,
            labsAttended: (subject.labsAttended || 0) + (isAttended ? 1 : 0),
          });
        }
      }

      toast.success(`Marked ${subject.name} as ${action}`);
    } catch (err) {
      console.error(err);
      toast.error('Failed to log attendance');
    }
  };

  const handleUndoLog = async (logId: string) => {
    if (!user) return;
    try {
      const targetLog = logs.find(l => l.id === logId);
      if (!targetLog) return;

      const subject = subjects.find(s => s.id === targetLog.subjectId);
      if (subject && targetLog.action !== 'cancelled') {
        const subRef = doc(db, 'attendance_subjects', subject.id!);
        const isAtt = targetLog.action === 'attended';

        if (targetLog.type === 'lab') {
          await updateDoc(subRef, {
            labsTotal: Math.max(0, (subject.labsTotal || 0) - 1),
            labsAttended: Math.max(0, (subject.labsAttended || 0) - (isAtt ? 1 : 0)),
          });
        } else {
          await updateDoc(subRef, {
            classesTotal: Math.max(0, (subject.classesTotal || 0) - 1),
            classesAttended: Math.max(0, (subject.classesAttended || 0) - (isAtt ? 1 : 0)),
          });
        }
      }

      await deleteDoc(doc(db, 'attendance_logs', logId));
      toast.success('Undid attendance record');
    } catch (err) {
      console.error(err);
      toast.error('Failed to undo');
    }
  };

  const handleToggleHoliday = async () => {
    if (!user) return;
    try {
      if (isSelectedHoliday) {
        const q = query(collection(db, 'attendance_holidays'), where('userId', '==', user.uid), where('date', '==', selectedDate));
        const snap = await getDocs(q);
        const batch = writeBatch(db);
        snap.forEach(d => batch.delete(d.ref));
        await batch.commit();
        toast.success(`Removed holiday for ${formatDisplayDate(selectedDate)}`);
      } else {
        await addDoc(collection(db, 'attendance_holidays'), {
          userId: user.uid,
          date: selectedDate,
          createdAt: Date.now(),
        });
        toast.success(`Marked ${formatDisplayDate(selectedDate)} as Holiday 🌴`);
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to toggle holiday');
    }
  };

  const handleSaveSubject = async () => {
    if (!user || !subjectForm.name.trim()) return;
    try {
      if (editSubjectModal.subject?.id) {
        await updateDoc(doc(db, 'attendance_subjects', editSubjectModal.subject.id), {
          name: subjectForm.name.trim(),
          targetPercentage: Number(subjectForm.targetPercentage) || 75,
        });
        toast.success('Subject updated');
      } else {
        await addDoc(collection(db, 'attendance_subjects'), {
          userId: user.uid,
          name: subjectForm.name.trim(),
          classesAttended: 0,
          classesTotal: 0,
          labsAttended: 0,
          labsTotal: 0,
          targetPercentage: Number(subjectForm.targetPercentage) || 75,
          order: subjects.length,
          schedule: defaultSchedule,
        });
        toast.success('Subject created');
      }
      setEditSubjectModal({ isOpen: false, subject: null });
    } catch (err) {
      console.error(err);
      toast.error('Failed to save subject');
    }
  };

  const handleApplyOverride = async () => {
    if (!overrideSubject?.id) return;
    try {
      await updateDoc(doc(db, 'attendance_subjects', overrideSubject.id), {
        classesAttended: Number(overrideCounts.classesAttended) || 0,
        classesTotal: Number(overrideCounts.classesTotal) || 0,
        labsAttended: Number(overrideCounts.labsAttended) || 0,
        labsTotal: Number(overrideCounts.labsTotal) || 0,
      });
      toast.success(`Updated counts for ${overrideSubject.name}`);
      setOverrideSubject(null);
    } catch (err) {
      console.error(err);
      toast.error('Failed to update counts');
    }
  };

  const handleExportCSV = () => {
    let csv = 'Subject,Class Attended,Class Total,Lab Attended,Lab Total,Overall %\n';
    for (const s of subjects) {
      const att = (s.classesAttended || 0) + (s.labsAttended || 0);
      const tot = (s.classesTotal || 0) + (s.labsTotal || 0);
      const pct = tot > 0 ? Math.round((att / tot) * 100) : 100;
      csv += `"${s.name}",${s.classesAttended || 0},${s.classesTotal || 0},${s.labsAttended || 0},${s.labsTotal || 0},${pct}%\n`;
    }
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance_report_${getLocalDateString(new Date())}.csv`;
    a.click();
    toast.success('Exported attendance CSV report');
  };

  return (
    <div className="att-module-root">
      {/* ── TOP HERO HEADER BAR ── */}
      <div className="att-header-bar">
        <div className="att-header-left">
          <h1 className="att-hero-title">Class Attendance & Timetable</h1>
          <span className="att-stats-subtitle">
            {globalPct !== null ? `${globalPct}% overall` : 'No classes'} · {globalAttended}/{globalTotal} attended
          </span>
        </div>

        <div className="att-header-actions">
          {/* Date Picker Button */}
          <button
            type="button"
            className="att-action-pill-btn"
            onClick={() => setSelectedDate(todayStr)}
          >
            <Calendar size={14} />
            <span>{selectedDate === todayStr ? 'Today' : formatDisplayDate(selectedDate)}</span>
          </button>

          {/* Holiday Toggle */}
          <button
            type="button"
            className={`att-action-pill-btn ${isSelectedHoliday ? 'active-holiday' : ''}`}
            onClick={handleToggleHoliday}
          >
            <span>🌴</span>
            <span>{isSelectedHoliday ? 'Holiday (Off)' : 'Mark Holiday'}</span>
          </button>

          {/* Timetable Setup */}
          <button
            type="button"
            className="att-action-pill-btn"
            onClick={() => setIsTimetableModalOpen(true)}
          >
            <Settings size={14} />
            <span>Setup Timetable</span>
          </button>

          {/* Export CSV */}
          <button
            type="button"
            className="att-action-pill-btn"
            onClick={handleExportCSV}
          >
            <Download size={14} />
            <span>Export</span>
          </button>

          {/* Extra Class Solid CTA */}
          <button
            type="button"
            className="att-primary-add-btn"
            onClick={() => {
              if (subjects.length > 0) {
                setExtraSubjectId(subjects[0].id!);
                setIsExtraOpen(true);
              } else {
                toast.info('Please add subjects first');
              }
            }}
          >
            <Plus size={15} strokeWidth={2.5} />
            <span>Extra Class</span>
          </button>
        </div>
      </div>

      {/* ── SEMESTER OVERVIEW & AT-RISK WARNING ROW ── */}
      <div className="att-overview-row">
        {/* Meter Card */}
        <div className="att-overview-card">
          <div className="att-overview-top">
            <h3 className="att-overview-title">Semester Overview</h3>
            <span className="att-overview-stat-text">{globalAttended}/{globalTotal} total classes</span>
          </div>

          <div className="att-overview-meter-box">
            <span className="att-overview-big-pct" style={{
              color: globalPct !== null ? (globalPct >= 75 ? '#5eda9e' : (globalPct >= 70 ? '#fbbf24' : '#ff6961')) : '#8e8e93'
            }}>
              {globalPct !== null ? `${globalPct}%` : '--%'}
            </span>

            <div className="att-progress-track">
              <div
                className={`att-progress-fill ${globalPct !== null ? (globalPct >= 75 ? 'safe' : (globalPct >= 70 ? 'warning' : 'danger')) : ''}`}
                style={{
                  width: `${Math.min(100, globalPct || 0)}%`,
                }}
              />
            </div>
          </div>
        </div>

        {/* At-Risk Warning Card */}
        {warningSubjects.length > 0 ? (
          <div className="att-warning-card">
            <div className="att-warning-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <AlertTriangle size={16} />
                <span>Low Attendance Warning ({warningSubjects.length})</span>
              </div>
              <button
                type="button"
                className="att-card-action-btn"
                onClick={() => setDismissedWarnings(new Set(warningSubjects.map(s => s.id!)))}
              >
                Dismiss
              </button>
            </div>

            <div className="att-warning-list">
              {warningSubjects.map(s => {
                const att = (s.classesAttended || 0) + (s.labsAttended || 0);
                const tot = (s.classesTotal || 0) + (s.labsTotal || 0);
                const pct = tot > 0 ? Math.round((att / tot) * 100) : 0;
                const bunk = calculateBunkMath(att, tot, s.targetPercentage || 75);

                return (
                  <div key={s.id} className="att-warning-item">
                    • <strong>{s.name}</strong>: {pct}% — {bunk.text}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="att-overview-card" style={{ justifyContent: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', color: '#5eda9e' }}>
              <CheckCircle2 size={20} />
              <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>All subjects meet the target percentage!</span>
            </div>
          </div>
        )}
      </div>

      {/* ── 7-DAY HORIZONTAL WEEK NAVIGATION & STRIP ── */}
      <div>
        <div className="att-week-nav-bar">
          <div className="att-week-range-label">
            <CalendarDays size={16} color="#a599ff" />
            <span>{weekRangeLabel}</span>
          </div>

          <div className="att-week-nav-controls">
            <button
              type="button"
              className="att-week-nav-btn"
              onClick={() => handleShiftWeek(-1)}
              title="Previous Week"
            >
              ‹ Prev
            </button>
            <button
              type="button"
              className="att-week-nav-btn"
              onClick={() => setSelectedDate(todayStr)}
              style={selectedDate === todayStr ? { borderColor: 'rgba(165,153,255,0.4)', color: '#a599ff', background: 'rgba(165,153,255,0.1)' } : {}}
            >
              This Week
            </button>
            <button
              type="button"
              className="att-week-nav-btn"
              onClick={() => handleShiftWeek(1)}
              title="Next Week"
            >
              Next ›
            </button>
          </div>
        </div>

        <div className="att-week-strip">
          {weekDates.map(dateStr => {
            const d = new Date(dateStr + 'T00:00:00');
            const dayOfWeek = d.getDay();
            const dayName = DAY_SHORT[dayOfWeek];
            const dayNum = d.getDate();
            const isSelected = dateStr === selectedDate;
            const isToday = dateStr === todayStr;
            const isHol = holidays.includes(dateStr);
            const classCount = getClassCountForDay(dayOfWeek);

            return (
              <div
                key={dateStr}
                className={`att-day-card ${isSelected ? 'active-day' : ''} ${isToday ? 'is-today' : ''}`}
                onClick={() => setSelectedDate(dateStr)}
              >
                <span className="att-day-name">{dayName}</span>
                <span className="att-day-number">{dayNum}</span>
                <span className={`att-day-badge ${isToday ? 'today-pill' : isHol ? 'holiday-pill' : ''}`}>
                  {isHol ? '🌴 Off' : isToday ? (classCount > 0 ? `${classCount} Classes` : 'Today') : (classCount > 0 ? `${classCount} Classes` : 'Off')}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── TODAY'S SCHEDULED SESSIONS ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <div className="att-section-header">
          <h3 className="att-section-title">
            {selectedDate === todayStr ? "Today's Schedule" : `Schedule for ${formatDisplayDate(selectedDate)}`}
          </h3>
        </div>

        {isSelectedHoliday ? (
          <div className="notes-empty-state">
            <span style={{ fontSize: '2.5rem' }}>🌴</span>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: '#fff', margin: 0 }}>Holiday</h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--att-text-tertiary)', margin: 0 }}>
              Enjoy your day off! No classes scheduled for this date.
            </p>
          </div>
        ) : todaySessions.length === 0 ? (
          <div className="notes-empty-state">
            <CheckCircle2 size={32} color="var(--att-accent-purple)" />
            <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: '#fff', margin: 0 }}>No classes scheduled</h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--att-text-tertiary)', margin: 0 }}>
              No lectures or labs assigned to this day in your timetable.
            </p>
          </div>
        ) : (
          <div className="att-sessions-list">
            {todaySessions.map(session => {
              const { subject, type, idx } = session;
              const subLogs = logsBySubjectId[subject.id!] || [];
              let matchingLog = null;
              let matchIdx = 0;

              for (const l of subLogs) {
                if (l.date === selectedDate && !l.isExtra && (type === 'lab' ? l.type === 'lab' : (l.type === 'class' || !l.type))) {
                  if (matchIdx === idx) {
                    matchingLog = l;
                    break;
                  }
                  matchIdx++;
                }
              }

              return (
                <div key={session.id} className="att-session-row">
                  <div className="att-session-left">
                    <div className={`att-session-icon-box ${type}`}>
                      {type === 'lab' ? <Layers size={18} /> : <School size={18} />}
                    </div>

                    <div className="att-session-info">
                      <span className="att-session-name">{subject.name}</span>
                      <div className="att-session-meta">
                        <span className={`att-type-tag ${type}`}>{type}</span>
                        <span>•</span>
                        <span>{session.timeStr}</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="att-session-actions">
                    {matchingLog ? (
                      <button
                        type="button"
                        className={`att-log-btn undo ${matchingLog.action}`}
                        onClick={() => handleUndoLog(matchingLog.id)}
                      >
                        <span>
                          {matchingLog.action === 'attended' ? '✓ Present' : matchingLog.action === 'missed' ? '✗ Absent' : 'Cancelled'}
                        </span>
                        <RotateCcw size={12} />
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="att-log-btn present"
                          onClick={() => handleLogSession(subject, type, 'attended')}
                        >
                          <Check size={13} strokeWidth={2.5} />
                          <span>Present</span>
                        </button>

                        <button
                          type="button"
                          className="att-log-btn absent"
                          onClick={() => handleLogSession(subject, type, 'missed')}
                        >
                          <X size={13} strokeWidth={2.5} />
                          <span>Absent</span>
                        </button>

                        <button
                          type="button"
                          className="att-log-btn cancelled"
                          onClick={() => handleLogSession(subject, type, 'cancelled')}
                          title="Class Cancelled"
                        >
                          <X size={14} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── SUBJECT BREAKDOWN GRID ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
        <div className="att-section-header">
          <h3 className="att-section-title">Subject Breakdown & Bunk Budget</h3>
          <button
            type="button"
            className="att-card-action-btn"
            onClick={() => {
              setSubjectForm({ name: '', targetPercentage: 75 });
              setEditSubjectModal({ isOpen: true, subject: null });
            }}
          >
            <Plus size={13} /> Add Subject
          </button>
        </div>

        {subjects.length === 0 ? (
          <div className="notes-empty-state">
            <GraduationCap size={32} color="var(--att-accent-purple)" />
            <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: '#fff', margin: 0 }}>No subjects configured</h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--att-text-tertiary)', margin: 0 }}>
              Add your courses and timetable to start tracking attendance and bunk budgets.
            </p>
            <button
              type="button"
              className="att-primary-add-btn"
              onClick={() => {
                setSubjectForm({ name: '', targetPercentage: 75 });
                setEditSubjectModal({ isOpen: true, subject: null });
              }}
              style={{ marginTop: '0.5rem' }}
            >
              <Plus size={14} strokeWidth={2.5} />
              <span>Add First Subject</span>
            </button>
          </div>
        ) : (
          <div className="att-subjects-grid">
            {subjects.map(subject => {
              const att = (subject.classesAttended || 0) + (subject.labsAttended || 0);
              const tot = (subject.classesTotal || 0) + (subject.labsTotal || 0);
              const totalPct = tot > 0 ? Math.round((att / tot) * 100) : 100;
              const bunk = calculateBunkMath(att, tot, subject.targetPercentage || 75);

              const clsPct = (subject.classesTotal || 0) > 0
                ? Math.round(((subject.classesAttended || 0) / subject.classesTotal) * 100)
                : 100;
              const labPct = (subject.labsTotal || 0) > 0
                ? Math.round(((subject.labsAttended || 0) / subject.labsTotal) * 100)
                : 100;

              const target = subject.targetPercentage || 75;
              const clsStatus = clsPct >= target ? 'safe' : (clsPct >= target - 5 ? 'warning' : 'danger');
              const labStatus = labPct >= target ? 'safe' : (labPct >= target - 5 ? 'warning' : 'danger');
              const clsColor = clsStatus === 'safe' ? '#5eda9e' : (clsStatus === 'warning' ? '#fbbf24' : '#ff6961');
              const labColor = labStatus === 'safe' ? '#5eda9e' : (labStatus === 'warning' ? '#fbbf24' : '#ff6961');

              return (
                <div key={subject.id} className="att-subject-card">
                  <div className="att-subject-card-top">
                    <h4 className="att-subject-name">{subject.name}</h4>
                    <span className="att-subject-total-pct" style={{
                      color: totalPct >= target ? '#5eda9e' : (totalPct >= target - 5 ? '#fbbf24' : '#ff6961')
                    }}>
                      {tot > 0 ? `${totalPct}%` : '--%'}
                    </span>
                  </div>

                  {/* Dual Class & Lab Bars (Green / Red Mobile Parity) */}
                  <div className="att-subject-bars">
                    {/* Class Progress */}
                    <div className="att-sub-bar-row">
                      <span className="att-sub-bar-tag" style={{ background: `${clsColor}18`, color: clsColor, border: `1px solid ${clsColor}35` }}>CLASS</span>
                      <div className="att-progress-track">
                        <div className={`att-progress-fill ${clsStatus}`} style={{ width: `${Math.min(100, clsPct)}%` }} />
                      </div>
                      <span className="att-sub-bar-count">{subject.classesAttended || 0}/{subject.classesTotal || 0}</span>
                    </div>

                    {/* Lab Progress */}
                    {(subject.labsTotal || 0) > 0 && (
                      <div className="att-sub-bar-row">
                        <span className="att-sub-bar-tag" style={{ background: `${labColor}18`, color: labColor, border: `1px solid ${labColor}35` }}>LAB</span>
                        <div className="att-progress-track">
                          <div className={`att-progress-fill ${labStatus}`} style={{ width: `${Math.min(100, labPct)}%` }} />
                        </div>
                        <span className="att-sub-bar-count">{subject.labsAttended || 0}/{subject.labsTotal || 0}</span>
                      </div>
                    )}
                  </div>

                  {/* Bunk Budget Pill */}
                  <div className={`att-bunk-badge ${bunk.status}`}>
                    {bunk.text}
                  </div>

                  {/* Card Footer */}
                  <div className="att-subject-card-footer">
                    <button
                      type="button"
                      className="att-card-action-btn"
                      onClick={() => setSelectedHistorySubject(subject)}
                    >
                      <FileText size={12} />
                      <span>History</span>
                    </button>

                    <button
                      type="button"
                      className="att-card-action-btn"
                      onClick={() => {
                        setOverrideCounts({
                          classesAttended: subject.classesAttended || 0,
                          classesTotal: subject.classesTotal || 0,
                          labsAttended: subject.labsAttended || 0,
                          labsTotal: subject.labsTotal || 0,
                        });
                        setOverrideSubject(subject);
                      }}
                    >
                      <Settings size={12} />
                      <span>Override</span>
                    </button>

                    <button
                      type="button"
                      className="att-card-action-btn"
                      onClick={() => {
                        setSubjectForm({ name: subject.name, targetPercentage: subject.targetPercentage || 75 });
                        setEditSubjectModal({ isOpen: true, subject });
                      }}
                    >
                      <Edit2 size={12} />
                      <span>Edit</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── TIMETABLE SETUP STUDIO MODAL ── */}
      {isTimetableModalOpen && (
        <div className="notes-modal-overlay" onClick={() => setIsTimetableModalOpen(false)}>
          <div
            className="notes-modal-content"
            style={{ maxWidth: '780px', maxHeight: '85vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="notes-modal-header">
              <h3 className="notes-modal-title">Weekly Timetable Setup</h3>
              <button type="button" className="notes-modal-close-btn" onClick={() => setIsTimetableModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <p style={{ fontSize: '0.8rem', color: 'var(--att-text-tertiary)', margin: 0 }}>
                Configure the number of classes and labs for each day of the week (Mon–Sat).
              </p>

              {subjects.map(sub => (
                <div
                  key={sub.id}
                  style={{
                    background: 'var(--att-bg-surface-elevated)',
                    border: '1px solid var(--att-border-subtle)',
                    borderRadius: 12,
                    padding: '0.85rem'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.65rem' }}>
                    <span style={{ fontWeight: 600, color: '#ffffff' }}>{sub.name}</span>
                    <button
                      type="button"
                      className="att-card-action-btn"
                      style={{ color: 'var(--att-accent-rose)' }}
                      onClick={() => setDeleteConfirmId(sub.id!)}
                    >
                      <Trash2 size={13} />
                      <span>Delete</span>
                    </button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '0.45rem' }}>
                    {['1', '2', '3', '4', '5', '6'].map(dayKey => {
                      const daySched = sub.schedule?.[dayKey] || { classCount: 0, labCount: 0 };
                      return (
                        <div
                          key={dayKey}
                          style={{
                            background: 'var(--att-bg-surface)',
                            border: '1px solid var(--att-border-subtle)',
                            borderRadius: 8,
                            padding: '0.45rem',
                            textAlign: 'center'
                          }}
                        >
                          <div style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--att-text-tertiary)', marginBottom: '0.3rem' }}>
                            {DAY_SHORT[Number(dayKey)]}
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                            <label style={{ fontSize: '0.65rem', color: '#a599ff' }}>
                              Class:
                              <input
                                type="number"
                                min="0"
                                max="5"
                                value={daySched.classCount || 0}
                                onChange={async (e) => {
                                  const val = parseInt(e.target.value, 10) || 0;
                                  const updated = {
                                    ...sub.schedule,
                                    [dayKey]: { ...daySched, classCount: val }
                                  };
                                  await updateDoc(doc(db, 'attendance_subjects', sub.id!), { schedule: updated });
                                }}
                                style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--att-border-subtle)', color: '#fff', borderRadius: 4, textAlign: 'center', padding: '2px 0' }}
                              />
                            </label>

                            <label style={{ fontSize: '0.65rem', color: '#38bdf8' }}>
                              Lab:
                              <input
                                type="number"
                                min="0"
                                max="3"
                                value={daySched.labCount || 0}
                                onChange={async (e) => {
                                  const val = parseInt(e.target.value, 10) || 0;
                                  const updated = {
                                    ...sub.schedule,
                                    [dayKey]: { ...daySched, labCount: val }
                                  };
                                  await updateDoc(doc(db, 'attendance_subjects', sub.id!), { schedule: updated });
                                }}
                                style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid var(--att-border-subtle)', color: '#fff', borderRadius: 4, textAlign: 'center', padding: '2px 0' }}
                              />
                            </label>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="notes-modal-footer">
              <button
                type="button"
                className="att-primary-add-btn"
                onClick={() => setIsTimetableModalOpen(false)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── SUBJECT HISTORY MODAL ── */}
      {selectedHistorySubject && (
        <div className="notes-modal-overlay" onClick={() => setSelectedHistorySubject(null)}>
          <div
            className="notes-modal-content"
            style={{ maxWidth: '580px', maxHeight: '80vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="notes-modal-header">
              <h3 className="notes-modal-title">{selectedHistorySubject.name} Log History</h3>
              <button type="button" className="notes-modal-close-btn" onClick={() => setSelectedHistorySubject(null)}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {(logsBySubjectId[selectedHistorySubject.id!] || []).length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--att-text-tertiary)', fontSize: '0.85rem' }}>
                  No attendance logs recorded for this subject yet.
                </div>
              ) : (
                logsBySubjectId[selectedHistorySubject.id!].map(l => (
                  <div
                    key={l.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: 'var(--att-bg-surface-elevated)',
                      border: '1px solid var(--att-border-subtle)',
                      borderRadius: 10,
                      padding: '0.65rem 0.85rem'
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                      <span style={{
                        fontSize: '0.85rem',
                        fontWeight: 600,
                        color: l.action === 'attended' ? '#5eda9e' : l.action === 'missed' ? '#ff6961' : '#8e8e93'
                      }}>
                        {l.action === 'attended' ? '✓ Attended' : l.action === 'missed' ? '✗ Missed' : 'Cancelled'} {l.isExtra ? '(Extra)' : ''} {l.type || 'class'}
                      </span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--att-text-tertiary)' }}>
                        {formatDisplayDate(l.date)} • {new Date(l.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <button
                      type="button"
                      className="att-log-btn undo"
                      onClick={() => handleUndoLog(l.id)}
                    >
                      <RotateCcw size={12} />
                      <span>Undo</span>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── EXTRA CLASS MODAL ── */}
      {isExtraOpen && (
        <div className="notes-modal-overlay" onClick={() => setIsExtraOpen(false)}>
          <div className="notes-modal-content" onClick={e => e.stopPropagation()}>
            <div className="notes-modal-header">
              <h3 className="notes-modal-title">Log Extra Session</h3>
              <button type="button" className="notes-modal-close-btn" onClick={() => setIsExtraOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <label style={{ fontSize: '0.78rem', color: 'var(--att-text-tertiary)', fontWeight: 600 }}>
                SELECT SUBJECT
                <select
                  value={extraSubjectId}
                  onChange={e => setExtraSubjectId(e.target.value)}
                  className="notes-search-bar"
                  style={{ width: '100%', marginTop: '0.35rem', color: '#fff', borderRadius: 8 }}
                >
                  {subjects.map(s => (
                    <option key={s.id} value={s.id} style={{ background: '#141416' }}>{s.name}</option>
                  ))}
                </select>
              </label>

              {/* Class & Lab Buttons */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.35rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#a599ff' }}>Extra Lecture</span>
                  <div style={{ display: 'flex', gap: '0.45rem' }}>
                    <button
                      type="button"
                      className="att-log-btn present"
                      onClick={() => {
                        const targetSub = subjects.find(s => s.id === extraSubjectId);
                        if (targetSub) handleLogSession(targetSub, 'class', 'attended', selectedDate, true);
                        setIsExtraOpen(false);
                      }}
                    >
                      Present
                    </button>
                    <button
                      type="button"
                      className="att-log-btn absent"
                      onClick={() => {
                        const targetSub = subjects.find(s => s.id === extraSubjectId);
                        if (targetSub) handleLogSession(targetSub, 'class', 'missed', selectedDate, true);
                        setIsExtraOpen(false);
                      }}
                    >
                      Absent
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#38bdf8' }}>Extra Practical / Lab</span>
                  <div style={{ display: 'flex', gap: '0.45rem' }}>
                    <button
                      type="button"
                      className="att-log-btn present"
                      onClick={() => {
                        const targetSub = subjects.find(s => s.id === extraSubjectId);
                        if (targetSub) handleLogSession(targetSub, 'lab', 'attended', selectedDate, true);
                        setIsExtraOpen(false);
                      }}
                    >
                      Present
                    </button>
                    <button
                      type="button"
                      className="att-log-btn absent"
                      onClick={() => {
                        const targetSub = subjects.find(s => s.id === extraSubjectId);
                        if (targetSub) handleLogSession(targetSub, 'lab', 'missed', selectedDate, true);
                        setIsExtraOpen(false);
                      }}
                    >
                      Absent
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MANUAL OVERRIDE MODAL ── */}
      {overrideSubject && (
        <div className="notes-modal-overlay" onClick={() => setOverrideSubject(null)}>
          <div className="notes-modal-content" onClick={e => e.stopPropagation()}>
            <div className="notes-modal-header">
              <h3 className="notes-modal-title">Manual Count Override ({overrideSubject.name})</h3>
              <button type="button" className="notes-modal-close-btn" onClick={() => setOverrideSubject(null)}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <label style={{ fontSize: '0.75rem', color: 'var(--att-text-tertiary)' }}>
                Classes Attended:
                <input
                  type="number"
                  min="0"
                  className="notes-search-bar notes-search-input"
                  style={{ width: '100%', borderRadius: 8, marginTop: '0.25rem' }}
                  value={overrideCounts.classesAttended}
                  onChange={e => setOverrideCounts({ ...overrideCounts, classesAttended: parseInt(e.target.value, 10) || 0 })}
                />
              </label>

              <label style={{ fontSize: '0.75rem', color: 'var(--att-text-tertiary)' }}>
                Classes Total:
                <input
                  type="number"
                  min="0"
                  className="notes-search-bar notes-search-input"
                  style={{ width: '100%', borderRadius: 8, marginTop: '0.25rem' }}
                  value={overrideCounts.classesTotal}
                  onChange={e => setOverrideCounts({ ...overrideCounts, classesTotal: parseInt(e.target.value, 10) || 0 })}
                />
              </label>

              <label style={{ fontSize: '0.75rem', color: 'var(--att-text-tertiary)' }}>
                Labs Attended:
                <input
                  type="number"
                  min="0"
                  className="notes-search-bar notes-search-input"
                  style={{ width: '100%', borderRadius: 8, marginTop: '0.25rem' }}
                  value={overrideCounts.labsAttended}
                  onChange={e => setOverrideCounts({ ...overrideCounts, labsAttended: parseInt(e.target.value, 10) || 0 })}
                />
              </label>

              <label style={{ fontSize: '0.75rem', color: 'var(--att-text-tertiary)' }}>
                Labs Total:
                <input
                  type="number"
                  min="0"
                  className="notes-search-bar notes-search-input"
                  style={{ width: '100%', borderRadius: 8, marginTop: '0.25rem' }}
                  value={overrideCounts.labsTotal}
                  onChange={e => setOverrideCounts({ ...overrideCounts, labsTotal: parseInt(e.target.value, 10) || 0 })}
                />
              </label>
            </div>

            <div className="notes-modal-footer">
              <button type="button" className="att-action-pill-btn" onClick={() => setOverrideSubject(null)}>
                Cancel
              </button>
              <button type="button" className="att-primary-add-btn" onClick={handleApplyOverride}>
                Save Counts
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── ADD/EDIT SUBJECT MODAL ── */}
      {editSubjectModal.isOpen && (
        <div className="notes-modal-overlay" onClick={() => setEditSubjectModal({ isOpen: false, subject: null })}>
          <div className="notes-modal-content" onClick={e => e.stopPropagation()}>
            <div className="notes-modal-header">
              <h3 className="notes-modal-title">{editSubjectModal.subject ? 'Edit Subject' : 'Add Subject'}</h3>
              <button type="button" className="notes-modal-close-btn" onClick={() => setEditSubjectModal({ isOpen: false, subject: null })}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <label style={{ fontSize: '0.75rem', color: 'var(--att-text-tertiary)' }}>
                Subject Name:
                <input
                  type="text"
                  placeholder="e.g. Distributed Systems"
                  className="notes-search-bar notes-search-input"
                  style={{ width: '100%', borderRadius: 8, marginTop: '0.25rem' }}
                  value={subjectForm.name}
                  onChange={e => setSubjectForm({ ...subjectForm, name: e.target.value })}
                  autoFocus
                />
              </label>

              <label style={{ fontSize: '0.75rem', color: 'var(--att-text-tertiary)' }}>
                Target Attendance Percentage: ({subjectForm.targetPercentage}%)
                <input
                  type="range"
                  min="50"
                  max="95"
                  step="5"
                  value={subjectForm.targetPercentage}
                  onChange={e => setSubjectForm({ ...subjectForm, targetPercentage: parseInt(e.target.value, 10) })}
                  style={{ width: '100%', accentColor: 'var(--att-accent-purple)', marginTop: '0.35rem' }}
                />
              </label>
            </div>

            <div className="notes-modal-footer">
              <button type="button" className="att-action-pill-btn" onClick={() => setEditSubjectModal({ isOpen: false, subject: null })}>
                Cancel
              </button>
              <button type="button" className="att-primary-add-btn" onClick={handleSaveSubject}>
                Save Subject
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── DELETE CONFIRM DIALOG ── */}
      <ConfirmDialog
        isOpen={!!deleteConfirmId}
        title="Delete Subject"
        message="Are you sure you want to delete this subject and its timetable schedule?"
        confirmText="Delete"
        cancelText="Cancel"
        type="danger"
        onConfirm={async () => {
          if (deleteConfirmId) {
            await deleteDoc(doc(db, 'attendance_subjects', deleteConfirmId));
            toast.success('Subject deleted');
            setDeleteConfirmId(null);
          }
        }}
        onCancel={() => setDeleteConfirmId(null)}
      />
    </div>
  );
};
