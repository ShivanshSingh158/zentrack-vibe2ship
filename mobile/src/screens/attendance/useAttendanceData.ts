/**
 * useAttendanceData.ts
 * All local state, Firestore listeners (logs + holidays), schema migration,
 * and derived computed values for the Attendance module.
 */
import { useState, useEffect, useMemo, useRef } from 'react';
import { InteractionManager } from 'react-native';
import { collection, query, where, onSnapshot, writeBatch, doc, limit } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useAcademicData } from '../../contexts/domains/AcademicContext';
import { useCoreData } from '../../contexts/domains/CoreDataContext';
import type { AttendanceSubject } from '../../contexts/MobileDataContext';
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
  const { user } = useCoreData();
  const { attendance: subjects, attendanceLogs: logs, ensureSubscribed } = useAcademicData();

  useEffect(() => {
    // Defer Firestore subscription until after the tab-switch animation completes.
    // Opening 5 listeners simultaneously on the JS thread during the transition
    // causes a 1-2s freeze. InteractionManager releases the animation first, then subscribes.
    const handle = InteractionManager.runAfterInteractions(() => {
      ensureSubscribed?.();
    });
    return () => handle.cancel();
  }, [ensureSubscribed]);

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
  }, [user?.uid, subjects]);

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
  }, [user?.uid]);

  // ── Derived values ─────────────────────────────────────────────────────────
  // ── logsBySubjectId — indexed map (indexed by both subjectId & subjectName, sorted newest first) ──
  const logsBySubjectId = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (let i = 0; i < logs.length; i++) {
      const log = logs[i];
      const key1 = log.subjectId;
      const key2 = log.subjectName;
      if (key1) {
        if (!map[key1]) map[key1] = [];
        map[key1].push(log);
      }
      if (key2 && key2 !== key1) {
        if (!map[key2]) map[key2] = [];
        map[key2].push(log);
      }
    }
    // Ensure logs within each bucket are sorted with newest timestamp first
    Object.keys(map).forEach(k => {
      map[k].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    });
    return map;
  }, [logs]);

  const selectedDayOfWeek = new Date(selectedDate + 'T00:00:00').getDay().toString();
  const isSelectedHoliday = holidays.includes(selectedDate);
  const today             = getLocalDateString(new Date());
  const weekDates         = useMemo(() => getWeekDates(selectedDate), [selectedDate]);

  const todayScheduledSubjects = useMemo(() => {
    const dayOfWeekNum = new Date(selectedDate + 'T00:00:00').getDay();
    const dayName = DAY_NAMES[dayOfWeekNum];
    const dayNameLower = dayName.toLowerCase();

    const getEarliestTime = (sch: any): number => {
      let earliest = 9999;
      if (sch?.classes && Array.isArray(sch.classes)) {
        for (let i = 0; i < sch.classes.length; i++) {
          const t = sch.classes[i]?.time;
          if (t) {
            const m = parseTimeToMinutes(t);
            if (m < earliest) earliest = m;
          }
        }
      }
      if (sch?.labs && Array.isArray(sch.labs)) {
        for (let i = 0; i < sch.labs.length; i++) {
          const t = sch.labs[i]?.time;
          if (t) {
            const m = parseTimeToMinutes(t);
            if (m < earliest) earliest = m;
          }
        }
      }
      return earliest;
    };

    const list: Array<{ subject: AttendanceSubject; earliestTime: number }> = [];

    for (let i = 0; i < subjects.length; i++) {
      const s = subjects[i];
      const sch =
        s.schedule?.[selectedDayOfWeek] ||
        s.schedule?.[dayOfWeekNum] ||
        s.schedule?.[dayName] ||
        s.schedule?.[dayNameLower];

      if (sch && (
        (sch.classes && sch.classes.length > 0) ||
        (sch.labs && sch.labs.length > 0) ||
        sch.classCount > 0 ||
        sch.labCount > 0
      )) {
        list.push({
          subject: s,
          earliestTime: getEarliestTime(sch),
        });
      }
    }

    list.sort((a, b) => a.earliestTime - b.earliestTime);
    return list.map(item => item.subject);
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
