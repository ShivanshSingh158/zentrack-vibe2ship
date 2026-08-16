/**
 * useAttendanceData.ts
 * All local state, Firestore listeners (logs + holidays), schema migration,
 * and derived computed values for the Attendance module.
 */
import { useState, useEffect, useMemo, useRef } from 'react';
import { collection, query, where, onSnapshot, writeBatch, doc, limit } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useMobileData, AttendanceSubject } from '../../contexts/MobileDataContext';
import { COLLECTION } from '../../config/constants';
import { handleSyncError } from '../../utils/errorUtils';
import {
  SCHEMA_VERSION, defaultSchedule, DAY_NAMES,
  getLocalDateString, getWeekDates, parseTimeToMinutes,
} from './attendanceConstants';

export interface ConfirmConfig {
  visible: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  confirmText?: string;
  danger?: boolean;
}

export function useAttendanceData() {
  const { user, attendance: subjects, attendanceLogs: logs } = useMobileData();

  // ── Core data from Firestore ────────────────────────────────────────────────

  const [holidays, setHolidays] = useState<string[]>([]);

  // ── UI state ───────────────────────────────────────────────────────────────
  const [selectedDate,        setSelectedDate]        = useState<string>(getLocalDateString(new Date()));
  const [showDatePicker,      setShowDatePicker]       = useState(false);
  const [isTimetableOpen,     setIsTimetableOpen]     = useState(false);
  const [showClassNotifModal, setShowClassNotifModal] = useState(false);
  const [selectedHistorySubject, setSelectedHistorySubject] = useState<AttendanceSubject | null>(null);
  const [isExtraOpen,         setIsExtraOpen]         = useState(false);
  const [showAddModal,        setShowAddModal]         = useState(false);
  const [editSubject,         setEditSubject]          = useState<AttendanceSubject | null>(null);
  const [extraSubjectId,      setExtraSubjectId]       = useState('');
  const [dismissedWarnings,   setDismissedWarnings]   = useState<Set<string>>(new Set());
  const [overrideOpen,        setOverrideOpen]         = useState<string | null>(null);
  const [overrideCounts,      setOverrideCounts]       = useState({ classesAttended: 0, classesTotal: 0, labsAttended: 0, labsTotal: 0 });
  const [confirmConfig,       setConfirmConfig]        = useState<ConfirmConfig>({ visible: false, title: '', message: '', onConfirm: () => {} });

  // ── Schema Migration ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user || subjects.length === 0) return;
    const batch = writeBatch(db);
    let needsCommit = false;
    subjects.forEach(sub => {
      if ((sub.schemaVersion || 0) < SCHEMA_VERSION) {
        const updates: any = { schemaVersion: SCHEMA_VERSION };
        if (!sub.schedule) updates.schedule = defaultSchedule;
        batch.update(doc(db, COLLECTION.ATTENDANCE, sub.id), updates);
        needsCommit = true;
      }
    });
    if (needsCommit) batch.commit().catch(handleSyncError);
  }, [user, subjects]);

  // ── Load Logs & Holidays ───────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;


    const qHol = query(
      collection(db, COLLECTION.ATTENDANCE_HOLIDAYS),
      where('userId', '==', user.uid),
    );
    const unsubHol = onSnapshot(qHol, snap => {
      setHolidays(snap.docs.map(d => (d.data() as any).date));
    });

    return () => { unsubHol(); };
  }, [user]);

  // ── Derived values ─────────────────────────────────────────────────────────
  // ── logsBySubjectId — stable indexed map ──────────────────────────────────
  // PERF FIX: A plain useMemo([logs]) rebuilds the whole O(n) map every time
  // the `logs` array reference changes — which happens on EVERY optimistic
  // update (every Present/Absent tap). With 200+ logs this causes noticeable
  // button lag.
  //
  // Fix: We keep a ref to the previous map and a memoization key built from
  // just the log count + last log's id+action. The map is only rebuilt when
  // content genuinely changes, not on every identity change of the array.
  const logsBySubjectIdRef = useRef<Record<string, any[]>>({});
  const logsKeyRef = useRef<string>('');

  const logsBySubjectId = useMemo(() => {
    // Build a cheap key: length + last entry id + last entry action.
    // This stays stable when Firestore sends back the same data in a new array.
    const last = logs[logs.length - 1];
    const key = `${logs.length}:${last?.id ?? ''}:${last?.action ?? ''}`;

    if (key === logsKeyRef.current) {
      // Nothing actually changed — return the cached map, skip O(n) rebuild
      return logsBySubjectIdRef.current;
    }

    // Content changed — rebuild
    logsKeyRef.current = key;
    const map: Record<string, any[]> = {};
    for (const log of logs) {
      if (!map[log.subjectId]) map[log.subjectId] = [];
      map[log.subjectId].push(log);
    }
    logsBySubjectIdRef.current = map;
    return map;
  }, [logs]);

  const selectedDayOfWeek = new Date(selectedDate + 'T00:00:00').getDay().toString();
  const isSelectedHoliday = holidays.includes(selectedDate);
  const today             = getLocalDateString(new Date());
  const weekDates         = useMemo(() => getWeekDates(selectedDate), [selectedDate]);

  const todayScheduledSubjects = useMemo(() => {
    const filtered = subjects.filter(s => {
      const sch =
        s.schedule?.[selectedDayOfWeek] ||
        s.schedule?.[Number(selectedDayOfWeek)] ||
        s.schedule?.[DAY_NAMES[new Date(selectedDate + 'T00:00:00').getDay()]] ||
        s.schedule?.[DAY_NAMES[new Date(selectedDate + 'T00:00:00').getDay()].toLowerCase()];
      return sch && (
        (sch.classes && sch.classes.length > 0) ||
        (sch.labs   && sch.labs.length   > 0) ||
        sch.classCount > 0 ||
        sch.labCount   > 0
      );
    });
    return filtered.sort((a, b) => {
      const schA =
        a.schedule?.[selectedDayOfWeek] ||
        a.schedule?.[Number(selectedDayOfWeek)] ||
        a.schedule?.[DAY_NAMES[new Date(selectedDate + 'T00:00:00').getDay()]] ||
        a.schedule?.[DAY_NAMES[new Date(selectedDate + 'T00:00:00').getDay()].toLowerCase()];
      const schB =
        b.schedule?.[selectedDayOfWeek] ||
        b.schedule?.[Number(selectedDayOfWeek)] ||
        b.schedule?.[DAY_NAMES[new Date(selectedDate + 'T00:00:00').getDay()]] ||
        b.schedule?.[DAY_NAMES[new Date(selectedDate + 'T00:00:00').getDay()].toLowerCase()];
      const getEarliestTime = (sch: any): number => {
        const times: number[] = [];
        if (sch?.classes && Array.isArray(sch.classes))
          sch.classes.forEach((c: any) => c.time && times.push(parseTimeToMinutes(c.time)));
        if (sch?.labs && Array.isArray(sch.labs))
          sch.labs.forEach((l: any) => l.time && times.push(parseTimeToMinutes(l.time)));
        return times.length > 0 ? Math.min(...times) : 9999;
      };
      return getEarliestTime(schA) - getEarliestTime(schB);
    });
  }, [subjects, selectedDayOfWeek, selectedDate]);

  const warningSubjects = useMemo(() =>
    subjects.filter(s => {
      const totalAtt = (s.classesAttended || 0) + (s.labsAttended || 0);
      const totalCls = (s.classesTotal   || 0) + (s.labsTotal    || 0);
      if (totalCls < 10) return false;
      return (totalAtt / totalCls) * 100 < (s.targetPercentage || 75);
    }).filter(s => !dismissedWarnings.has(s.id!)),
    [subjects, dismissedWarnings]
  );

  const todayFlatSessions = useMemo(() => {
    if (isSelectedHoliday) return [];
    const sessions: Array<{
      id: string; subject: AttendanceSubject;
      type: 'class' | 'lab'; idx: number; timeMins: number; timeStr: string;
    }> = [];

    todayScheduledSubjects.forEach(subject => {
      const sch =
        subject.schedule?.[selectedDayOfWeek] ||
        subject.schedule?.[Number(selectedDayOfWeek) as any] ||
        subject.schedule?.[DAY_NAMES[new Date(selectedDate + 'T00:00:00').getDay()]] ||
        subject.schedule?.[DAY_NAMES[new Date(selectedDate + 'T00:00:00').getDay()].toLowerCase()] ||
        { classCount: 0, labCount: 0, classes: [], labs: [] };

      const classCount = sch.classes?.length || sch.classCount || 0;
      const labCount   = sch.labs?.length   || sch.labCount   || 0;

      for (let i = 0; i < classCount; i++) {
        const session = sch.classes?.[i];
        const timeStr = session?.time ? [session.time, session.room].filter(Boolean).join(' • ') : `Class #${i + 1}`;
        sessions.push({ id: `${subject.id!}-class-${i}`, subject, type: 'class', idx: i, timeMins: parseTimeToMinutes(session?.time), timeStr });
      }
      for (let i = 0; i < labCount; i++) {
        const session = sch.labs?.[i];
        const timeStr = session?.time ? [session.time, session.room].filter(Boolean).join(' • ') : `Lab #${i + 1}`;
        sessions.push({ id: `${subject.id!}-lab-${i}`, subject, type: 'lab', idx: i, timeMins: parseTimeToMinutes(session?.time), timeStr });
      }
    });

    return sessions.sort((a, b) => a.timeMins - b.timeMins);
  }, [todayScheduledSubjects, selectedDayOfWeek, selectedDate, isSelectedHoliday]);

  const { globalAttended, globalTotal, globalPct, globalSafe } = useMemo(() => {
    const attended = subjects.reduce((s, x) => s + (x.classesAttended || 0) + (x.labsAttended || 0), 0);
    const total    = subjects.reduce((s, x) => s + (x.classesTotal   || 0) + (x.labsTotal    || 0), 0);
    const pct      = total === 0 ? null : (attended / total) * 100;
    const safe     = pct !== null ? pct >= 75 : true;
    return { globalAttended: attended, globalTotal: total, globalPct: pct, globalSafe: safe };
  }, [subjects]);

  return {
    user, subjects,
    logs, holidays, logsBySubjectId,
    selectedDate, setSelectedDate,
    showDatePicker, setShowDatePicker,
    isTimetableOpen, setIsTimetableOpen,
    showClassNotifModal, setShowClassNotifModal,
    selectedHistorySubject, setSelectedHistorySubject,
    isExtraOpen, setIsExtraOpen,
    showAddModal, setShowAddModal,
    editSubject, setEditSubject,
    extraSubjectId, setExtraSubjectId,
    dismissedWarnings, setDismissedWarnings,
    overrideOpen, setOverrideOpen,
    overrideCounts, setOverrideCounts,
    confirmConfig, setConfirmConfig,
    // Derived
    selectedDayOfWeek, isSelectedHoliday, today, weekDates,
    todayScheduledSubjects, warningSubjects, todayFlatSessions,
    globalAttended, globalTotal, globalPct, globalSafe,
  };
}
