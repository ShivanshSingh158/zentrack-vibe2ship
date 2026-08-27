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
  CalendarDays, Flame, AlertCircle, FileText, Palmtree, MoreVertical,
  ShieldCheck, BookOpen, FlaskConical
} from 'lucide-react';
import { toast } from 'sonner';
import { playPopSound } from '../../utils/sound';
import { getLocalDateString, formatDisplayDate } from '../../utils/dateUtils';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { awardXP } from '../../services/xpSystem';
import { TimetableModal } from './TimetableModal';
import { AddSubjectModal } from './AddSubjectModal';

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
  schedule: Record<string, any>;
  schemaVersion?: number;
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

export function parseTimeToMinutes(timeStr: string | undefined): number {
  if (!timeStr) return 999;
  const upper = timeStr.trim().toUpperCase();
  const isPM = upper.includes('PM');
  const isAM = upper.includes('AM');
  const cleaned = upper.replace(/[APM\s]+$/i, '').trim();
  const parts = cleaned.split(':');
  let h = parseInt(parts[0], 10) || 0;
  const m = parts.length >= 2 ? (parseInt(parts[1], 10) || 0) : 0;
  if (isPM || isAM) {
    if (isPM && h !== 12) h += 12;
    if (isAM && h === 12) h = 0;
  }
  return h * 60 + m;
}

export function resolveSubjectDaySchedule(
  subject: AttendanceSubject,
  dateOrDayIndex: string | number
): {
  classCount: number;
  labCount: number;
  classes: Array<{ time?: string; room?: string }>;
  labs: Array<{ time?: string; room?: string }>;
} {
  let dayIdx = 0;
  if (typeof dateOrDayIndex === 'number') {
    dayIdx = dateOrDayIndex;
  } else if (dateOrDayIndex.includes('-')) {
    dayIdx = new Date(dateOrDayIndex + 'T00:00:00').getDay();
  } else {
    dayIdx = parseInt(dateOrDayIndex, 10) || 0;
  }

  if (!subject || !subject.schedule) {
    const fallback = defaultSchedule[String(dayIdx)] || { classCount: 0, labCount: 0 };
    return {
      classCount: fallback.classCount || 0,
      labCount: fallback.labCount || 0,
      classes: [],
      labs: []
    };
  }

  const dayName = DAY_NAMES[dayIdx];
  const dayNameLower = dayName.toLowerCase();
  const dayShort = DAY_SHORT[dayIdx];
  const dayShortLower = dayShort.toLowerCase();
  const dayStr = String(dayIdx);

  const sch: any =
    subject.schedule[dayStr] ??
    subject.schedule[dayIdx] ??
    subject.schedule[dayName] ??
    subject.schedule[dayNameLower] ??
    subject.schedule[dayShort] ??
    subject.schedule[dayShortLower] ??
    null;

  if (!sch) {
    return { classCount: 0, labCount: 0, classes: [], labs: [] };
  }

  const rawClasses: any[] = Array.isArray(sch.classes) ? sch.classes : [];
  const rawLabs: any[] = Array.isArray(sch.labs) ? sch.labs : [];

  const classCount = rawClasses.length > 0 ? rawClasses.length : (typeof sch.classCount === 'number' ? sch.classCount : 0);
  const labCount = rawLabs.length > 0 ? rawLabs.length : (typeof sch.labCount === 'number' ? sch.labCount : 0);

  return {
    classCount,
    labCount,
    classes: rawClasses,
    labs: rawLabs
  };
}

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
  const [addEditModal, setAddEditModal] = useState<{ isOpen: boolean; subject: AttendanceSubject | null }>({ isOpen: false, subject: null });
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
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

  // Lock background website scroll when any modal is open
  const isAnyModalOpen =
    isTimetableModalOpen ||
    !!selectedHistorySubject ||
    isExtraOpen ||
    !!overrideSubject ||
    addEditModal.isOpen ||
    isResetConfirmOpen ||
    !!deleteConfirmId;


  useEffect(() => {
    if (isAnyModalOpen) {
      const origOverflow = document.body.style.overflow;
      const origTouch = document.body.style.touchAction;
      document.body.style.overflow = 'hidden';
      document.body.style.touchAction = 'none';
      return () => {
        document.body.style.overflow = origOverflow;
        document.body.style.touchAction = origTouch;
      };
    }
  }, [isAnyModalOpen]);

  const getClassCountForDay = useCallback((dayIndex: number) => {

    let count = 0;
    for (const s of subjects) {
      const daySched = resolveSubjectDaySchedule(s, dayIndex);
      count += daySched.classCount + daySched.labCount;
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

  // Group logs by subject (indexes both subjectId and subjectName for 100% resilient lookup)
  const logsBySubjectId = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const l of logs) {
      if (l.subjectId) {
        if (!map[l.subjectId]) map[l.subjectId] = [];
        map[l.subjectId].push(l);
      }
      if (l.subjectName) {
        if (!map[l.subjectName]) map[l.subjectName] = [];
        map[l.subjectName].push(l);
      }
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

  // Today's Scheduled Sessions — accurately resolved across mobile & web formats
  const todaySessions = useMemo(() => {
    if (isSelectedHoliday) return [];
    const sessions: Array<{
      id: string;
      subject: AttendanceSubject;
      type: 'class' | 'lab';
      idx: number;
      timeMins: number;
      timeStr: string;
    }> = [];

    for (const s of subjects) {
      const daySched = resolveSubjectDaySchedule(s, selectedDate);
      const { classCount, labCount, classes, labs } = daySched;

      for (let i = 0; i < classCount; i++) {
        const item = classes[i];
        const timeStr = item?.time
          ? [item.time, item.room].filter(Boolean).join(' • ')
          : `Class #${i + 1}`;
        sessions.push({
          id: `${s.id}-class-${i}`,
          subject: s,
          type: 'class',
          idx: i,
          timeMins: parseTimeToMinutes(item?.time),
          timeStr,
        });
      }

      for (let i = 0; i < labCount; i++) {
        const item = labs[i];
        const timeStr = item?.time
          ? [item.time, item.room].filter(Boolean).join(' • ')
          : `Lab #${i + 1}`;
        sessions.push({
          id: `${s.id}-lab-${i}`,
          subject: s,
          type: 'lab',
          idx: i,
          timeMins: parseTimeToMinutes(item?.time),
          timeStr,
        });
      }
    }

    return sessions.sort((a, b) => a.timeMins - b.timeMins);
  }, [subjects, selectedDate, isSelectedHoliday]);

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

      if (action === 'attended') {
        awardXP('ATTENDANCE_LOG').then((res) => {
          toast.success(`Attended ${subject.name}! +${res.added} XP 🎓`);
          if (res.leveledUp) {
            toast.success(`🏆 LEVEL UP! You reached ${res.newTitle} (Level ${res.newLevel})!`);
          }
        });
      } else {
        toast.success(`Marked ${subject.name} as ${action}`);
      }
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

  const handleSaveSubjectData = async (subjectData: any) => {
    if (!user) return;
    try {
      if (addEditModal.subject?.id) {
        await updateDoc(doc(db, 'attendance_subjects', addEditModal.subject.id), subjectData);
        toast.success(`Updated ${subjectData.name || 'subject'}`);
      } else {
        await addDoc(collection(db, 'attendance_subjects'), {
          ...subjectData,
          userId: user.uid,
          order: subjects.length,
          schemaVersion: 1,
        });
        toast.success(`Added ${subjectData.name}`);
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to save subject');
      throw err;
    }
  };

  const handleResetSemesterConfirmed = async () => {
    if (!user) return;
    try {
      const batch = writeBatch(db);
      subjects.forEach(s => {
        if (s.id) {
          batch.update(doc(db, 'attendance_subjects', s.id), {
            classesAttended: 0,
            classesTotal: 0,
            labsAttended: 0,
            labsTotal: 0,
          });
        }
      });
      const logQ = query(collection(db, 'attendance_logs'), where('userId', '==', user.uid));
      const logSnap = await getDocs(logQ);
      logSnap.forEach(d => batch.delete(d.ref));

      await batch.commit();
      toast.success('Semester reset: all attendance counts set to zero');
      setIsResetConfirmOpen(false);
    } catch (err) {
      console.error(err);
      toast.error('Failed to reset semester');
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
          <h1 className="att-hero-title">Attendance</h1>
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
            <span>{isSelectedHoliday ? 'Holiday' : 'Holiday'}</span>
          </button>

          {/* Timetable Setup */}
          <button
            type="button"
            className="att-action-pill-btn"
            onClick={() => setIsTimetableModalOpen(true)}
          >
            <Settings size={14} />
            <span>Setup</span>
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
        {/* Semester Overview Meter Card */}
        <div className="att-overview-card">
          <div className="att-overview-top">
            <h3 className="att-overview-title">Semester overview</h3>
            <span className="att-overview-stat-text">{globalAttended}/{globalTotal} classes</span>
          </div>

          <div className="att-overview-meter-row">
            <span className="att-overview-big-pct" style={{
              color: globalPct !== null ? (globalPct >= 75 ? '#5eda9e' : (globalPct >= 70 ? '#ff9f4d' : '#ff6961')) : '#8e8e93'
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

        {/* At-Risk Warning / All Safe Card */}
        {warningSubjects.length > 0 ? (
          <div className="att-warning-card">
            <div className="att-warning-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <AlertTriangle size={15} color="#ff9f4d" />
                <span>Low Attendance</span>
              </div>
              <button
                type="button"
                className="att-card-action-btn"
                onClick={() => setDismissedWarnings(new Set(warningSubjects.map(s => s.id!)))}
                style={{ color: '#fca5a5' }}
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
          <div className="att-overview-card safe-centered">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', color: '#5eda9e' }}>
              <CheckCircle2 size={18} />
              <span style={{ fontSize: '0.86rem', fontWeight: 600 }}>All subjects meet the target percentage!</span>
            </div>
          </div>
        )}
      </div>

      {/* ── 7-DAY HORIZONTAL WEEK NAVIGATION & STRIP ── */}
      <div>
        <div className="att-week-nav-bar">
          <div className="att-week-range-label">
            <CalendarDays size={15} color="#a599ff" />
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
        <div className="att-section-header">
          <h3 className="att-section-title">
            {selectedDate === todayStr ? "Today's Classes" : `Classes for ${formatDisplayDate(selectedDate)}`}
          </h3>
        </div>

        {isSelectedHoliday ? (
          <div className="att-overview-card" style={{ textAlign: 'center', padding: '2rem 1rem', alignItems: 'center' }}>
            <span style={{ fontSize: '2rem' }}>🌴</span>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff', margin: '0.4rem 0 0.2rem 0' }}>Holiday</h3>
            <p style={{ fontSize: '0.78rem', color: '#8e8e93', margin: 0 }}>
              Enjoy your day off! No classes scheduled for this date.
            </p>
          </div>
        ) : todaySessions.length === 0 ? (
          <div className="att-overview-card" style={{ textAlign: 'center', padding: '2rem 1rem', alignItems: 'center' }}>
            <CheckCircle2 size={26} color="#a599ff" />
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#fff', margin: '0.4rem 0 0.2rem 0' }}>All clear!</h3>
            <p style={{ fontSize: '0.78rem', color: '#8e8e93', margin: 0 }}>
              No classes scheduled for this day. Relax or catch up on work.
            </p>
          </div>
        ) : (
          <div className="att-sessions-list">
            {todaySessions.map(session => {
              const { subject, type, idx } = session;
              const subLogs = (subject.id ? logsBySubjectId[subject.id] : null) || logsBySubjectId[subject.name] || [];
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
                      {type === 'lab' ? <FlaskConical size={17} strokeWidth={2.2} /> : <BookOpen size={17} strokeWidth={2.2} />}
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
                        className={`att-undo-pill ${matchingLog.action}`}
                        onClick={() => handleUndoLog(matchingLog.id)}
                        title="Click to Undo Attendance"
                      >
                        <span>
                          {matchingLog.action === 'attended' ? '✓ Present' : matchingLog.action === 'missed' ? '✕ Absent' : '⊘ Cancelled'}
                        </span>
                        <RotateCcw size={12} />
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="att-log-pill present"
                          onClick={() => handleLogSession(subject, type, 'attended')}
                        >
                          <Check size={13} strokeWidth={2.5} />
                          <span>Present</span>
                        </button>

                        <button
                          type="button"
                          className="att-log-pill absent"
                          onClick={() => handleLogSession(subject, type, 'missed')}
                        >
                          <X size={13} strokeWidth={2.5} />
                          <span>Absent</span>
                        </button>

                        <button
                          type="button"
                          className="att-cancel-circle-btn"
                          onClick={() => handleLogSession(subject, type, 'cancelled')}
                          title="Mark Class Cancelled"
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

      {/* ── SUBJECT BREAKDOWN GRID (By Subject) ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', marginTop: '0.4rem' }}>
        <div className="att-section-header">
          <h3 className="att-section-title">By Subject</h3>
          <button
            type="button"
            className="att-card-action-btn"
            onClick={() => setAddEditModal({ isOpen: true, subject: null })}
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
              onClick={() => setAddEditModal({ isOpen: true, subject: null })}
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
                      <span className="att-sub-bar-tag class">CLASS</span>
                      <div className="att-progress-track">
                        <div className={`att-progress-fill ${clsStatus}`} style={{ width: `${Math.min(100, clsPct)}%` }} />
                      </div>
                      <span className="att-sub-bar-count">{subject.classesAttended || 0}/{subject.classesTotal || 0}</span>
                    </div>

                    {/* Lab Progress */}
                    {(subject.labsTotal || 0) > 0 && (
                      <div className="att-sub-bar-row">
                        <span className="att-sub-bar-tag lab">LAB</span>
                        <div className="att-progress-track">
                          <div className={`att-progress-fill ${labStatus}`} style={{ width: `${Math.min(100, labPct)}%` }} />
                        </div>
                        <span className="att-sub-bar-count">{subject.labsAttended || 0}/{subject.labsTotal || 0}</span>
                      </div>
                    )}
                  </div>

                  {/* Bunk Budget Pill */}
                  <div className={`att-bunk-badge ${bunk.status}`}>
                    {bunk.status === 'danger' ? (
                      <AlertCircle size={13} className="att-bunk-icon" />
                    ) : bunk.status === 'warning' ? (
                      <AlertTriangle size={13} className="att-bunk-icon" />
                    ) : (
                      <CheckCircle2 size={13} className="att-bunk-icon" />
                    )}
                    <span>{bunk.text}</span>
                  </div>

                  {/* Card Footer */}
                  <div className="att-subject-card-footer">
                    <button
                      type="button"
                      className="att-card-action-btn"
                      onClick={() => setSelectedHistorySubject(subject)}
                    >
                      <FileText size={13} />
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
                      <Settings size={13} />
                      <span>Override</span>
                    </button>

                    <button
                      type="button"
                      className="att-card-action-btn"
                      onClick={() => setAddEditModal({ isOpen: true, subject })}
                      style={{ marginLeft: 'auto' }}
                    >
                      <Edit2 size={13} />
                      <span>Edit</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── TIMETABLE STUDIO MODAL (MOBILE-TWIN PARITY) ── */}
      <TimetableModal
        isOpen={isTimetableModalOpen}
        onClose={() => setIsTimetableModalOpen(false)}
        subjects={subjects}
        onAddSubject={() => setAddEditModal({ isOpen: true, subject: null })}
        onEditSubject={(subject) => setAddEditModal({ isOpen: true, subject })}
        onDeleteSubject={(id) => setDeleteConfirmId(id)}
        onExportCSV={handleExportCSV}
        onResetSemester={() => setIsResetConfirmOpen(true)}
      />

      {/* ── ADD / EDIT SUBJECT MODAL (CALIBRATION & FULL SCHEDULE) ── */}
      <AddSubjectModal
        isOpen={addEditModal.isOpen}
        onClose={() => setAddEditModal({ isOpen: false, subject: null })}
        existingSubject={addEditModal.subject}
        onSave={handleSaveSubjectData}
      />

      {/* ── SUBJECT HISTORY MODAL ── */}
      {selectedHistorySubject && (
        <div className="att-modal-overlay" onClick={() => setSelectedHistorySubject(null)}>
          <div
            className="att-modal-dialog"
            style={{
              maxWidth: '560px',
              maxHeight: '82vh',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              padding: '1.35rem 1.35rem 1.15rem',
            }}
            onClick={e => e.stopPropagation()}
            onWheel={e => e.stopPropagation()}
          >
            <div className="att-modal-header" style={{ flexShrink: 0, paddingBottom: '0.5rem' }}>
              <h3 className="att-modal-title">{selectedHistorySubject.name} Log History</h3>
              <button type="button" className="att-modal-close-btn" onClick={() => setSelectedHistorySubject(null)}>
                <X size={16} />
              </button>
            </div>

            <div
              className="custom-scrollbar"
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.45rem',
                flex: 1,
                overflowY: 'auto',
                paddingRight: '4px',
                overscrollBehavior: 'contain',
                minHeight: 0,
                marginTop: '0.35rem',
              }}
            >
              {(() => {
                const rawLogs = (selectedHistorySubject.id ? logsBySubjectId[selectedHistorySubject.id] : null) || logsBySubjectId[selectedHistorySubject.name] || [];
                // Sort Newest to Oldest (by date descending, then timestamp descending)
                const histLogs = [...rawLogs].sort((a, b) => {
                  if (b.date !== a.date) {
                    return (b.date || '').localeCompare(a.date || '');
                  }
                  return (b.timestamp || 0) - (a.timestamp || 0);
                });

                if (histLogs.length === 0) {
                  return (
                    <div style={{ textAlign: 'center', padding: '2.5rem 0', color: 'var(--att-text-tertiary)', fontSize: '0.85rem' }}>
                      No attendance logs recorded for this subject yet.
                    </div>
                  );
                }

                return histLogs.map(l => (
                  <div
                    key={l.id}
                    className="att-history-row"
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                      <span style={{
                        fontSize: '0.85rem',
                        fontWeight: 700,
                        color: l.action === 'attended' ? '#5eda9e' : l.action === 'missed' ? '#ff6961' : '#8e8e93'
                      }}>
                        {l.action === 'attended' ? '✓ Attended' : l.action === 'missed' ? '✕ Missed' : '⊘ Cancelled'} {l.isExtra ? '(Extra)' : ''} {l.type || 'class'}
                      </span>
                      <span style={{ fontSize: '0.72rem', color: '#8e8e93', fontWeight: 500 }}>
                        {formatDisplayDate(l.date)} • {new Date(l.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <button
                      type="button"
                      className="att-history-undo-btn"
                      onClick={() => handleUndoLog(l.id)}
                      title="Undo this log"
                    >
                      <RotateCcw size={12} strokeWidth={2.5} />
                      <span>Undo</span>
                    </button>
                  </div>
                ));
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ── EXTRA CLASS MODAL ── */}
      {isExtraOpen && (
        <div className="att-modal-overlay" onClick={() => setIsExtraOpen(false)}>
          <div className="att-modal-dialog" onClick={e => e.stopPropagation()}>
            <div className="att-modal-header">
              <h3 className="att-modal-title">Log Extra Session</h3>
              <button type="button" className="att-modal-close-btn" onClick={() => setIsExtraOpen(false)}>
                <X size={16} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.95rem' }}>
              <label className="att-input-label">
                <span>SELECT SUBJECT</span>
                <select
                  value={extraSubjectId}
                  onChange={e => setExtraSubjectId(e.target.value)}
                  className="att-modal-input"
                >
                  {subjects.map(s => (
                    <option key={s.id} value={s.id} style={{ background: '#141416' }}>{s.name}</option>
                  ))}
                </select>
              </label>

              {/* Class & Lab Buttons */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', marginTop: '0.2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.86rem', fontWeight: 600, color: '#a599ff' }}>Extra Lecture</span>
                  <div style={{ display: 'flex', gap: '0.45rem' }}>
                    <button
                      type="button"
                      className="att-log-pill present"
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
                      className="att-log-pill absent"
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
                  <span style={{ fontSize: '0.86rem', fontWeight: 600, color: '#38bdf8' }}>Extra Practical / Lab</span>
                  <div style={{ display: 'flex', gap: '0.45rem' }}>
                    <button
                      type="button"
                      className="att-log-pill present"
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
                      className="att-log-pill absent"
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
        <div className="att-modal-overlay" onClick={() => setOverrideSubject(null)}>
          <div className="att-modal-dialog" onClick={e => e.stopPropagation()}>
            <div className="att-modal-header">
              <h3 className="att-modal-title">Manual Count Override ({overrideSubject.name})</h3>
              <button type="button" className="att-modal-close-btn" onClick={() => setOverrideSubject(null)}>
                <X size={16} />
              </button>
            </div>

            <div className="att-modal-grid-2">
              <label className="att-input-label">
                <span>Classes Attended:</span>
                <input
                  type="number"
                  min="0"
                  className="att-modal-input"
                  value={overrideCounts.classesAttended}
                  onChange={e => setOverrideCounts({ ...overrideCounts, classesAttended: parseInt(e.target.value, 10) || 0 })}
                />
              </label>

              <label className="att-input-label">
                <span>Classes Total:</span>
                <input
                  type="number"
                  min="0"
                  className="att-modal-input"
                  value={overrideCounts.classesTotal}
                  onChange={e => setOverrideCounts({ ...overrideCounts, classesTotal: parseInt(e.target.value, 10) || 0 })}
                />
              </label>

              <label className="att-input-label">
                <span>Labs Attended:</span>
                <input
                  type="number"
                  min="0"
                  className="att-modal-input"
                  value={overrideCounts.labsAttended}
                  onChange={e => setOverrideCounts({ ...overrideCounts, labsAttended: parseInt(e.target.value, 10) || 0 })}
                />
              </label>

              <label className="att-input-label">
                <span>Labs Total:</span>
                <input
                  type="number"
                  min="0"
                  className="att-modal-input"
                  value={overrideCounts.labsTotal}
                  onChange={e => setOverrideCounts({ ...overrideCounts, labsTotal: parseInt(e.target.value, 10) || 0 })}
                />
              </label>
            </div>

            <div className="att-modal-footer">
              <button type="button" className="att-modal-cancel-btn" onClick={() => setOverrideSubject(null)}>
                Cancel
              </button>
              <button type="button" className="att-modal-save-btn" onClick={handleApplyOverride}>
                Save Counts
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── RESET SEMESTER CONFIRM DIALOG ── */}
      <ConfirmDialog
        isOpen={isResetConfirmOpen}
        title="Reset Entire Semester"
        message="Are you sure you want to reset all attendance counts to 0 and wipe your attendance logs? This action is permanent and cannot be undone."
        confirmText="Reset Everything"
        cancelText="Cancel"
        type="danger"
        onConfirm={handleResetSemesterConfirmed}
        onCancel={() => setIsResetConfirmOpen(false)}
      />

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

