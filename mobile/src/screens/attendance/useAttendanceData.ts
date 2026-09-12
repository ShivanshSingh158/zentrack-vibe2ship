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

// ── Module-level session guards: avoid repeating expensive checks across tab switches ──
let globalAttendanceMigratedUid = '';
let globalAttendanceDeduplicatedUid = '';

export function useAttendanceData() {
  const { user } = useCoreData();
  const academic = useAcademicData();
  const { attendance: subjects, attendanceLogs: logs, holidays = [], ensureSubscribed } = academic;

  useEffect(() => {
    // Defer Firestore subscription until after the tab-switch animation completes.
    const handle = InteractionManager.runAfterInteractions(() => {
      ensureSubscribed?.();
    });
    return () => handle.cancel();
  }, [ensureSubscribed]);

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

  // ── Schema Migration (Guarded & Deferred) ──────────────────────────────────
  const hasMigratedRef = useRef(false);
  useEffect(() => {
    if (!user || subjects.length === 0 || hasMigratedRef.current || globalAttendanceMigratedUid === user.uid) return;
    hasMigratedRef.current = true;
    globalAttendanceMigratedUid = user.uid;
    InteractionManager.runAfterInteractions(() => {
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
    });
  }, [user?.uid, subjects]);

  // ── Automatic Attendance Deduplication & Reconciliation Routine ────────────
  // Eliminates duplicate logs created by legacy concurrent writes and recalculates
  // exact subject counters (classesAttended/classesTotal/labsAttended/labsTotal).
  // Uses only hasDeduplicatedRef (component-scoped) instead of a module-level UID guard.
  // The module-level guard would survive tab switches and app resumes, meaning duplicates
  // created AFTER the first mount would never be cleaned up until force-kill + restart.
  const hasDeduplicatedRef = useRef(false);
  useEffect(() => {
    if (!user || subjects.length === 0 || !logs || logs.length === 0 || hasDeduplicatedRef.current) return;
    hasDeduplicatedRef.current = true;

    InteractionManager.runAfterInteractions(async () => {
      try {
        const nonExtraLogs = logs.filter(l => !l.isExtra);
        const groups: Record<string, any[]> = {};

        for (let i = 0; i < nonExtraLogs.length; i++) {
          const l = nonExtraLogs[i];
          const key = `${l.subjectId || l.subjectName}_${(l.date || '').slice(0, 10)}_${l.type === 'lab' ? 'lab' : 'class'}_${l.idx ?? 0}`;
          if (!groups[key]) groups[key] = [];
          groups[key].push(l);
        }

        const duplicateLogIdsToDelete: string[] = [];
        let foundDuplicates = false;

        Object.values(groups).forEach(group => {
          if (group.length > 1) {
            foundDuplicates = true;
            // Sort newest first
            group.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
            // Keep index 0 (newest), mark older duplicates for deletion
            for (let i = 1; i < group.length; i++) {
              duplicateLogIdsToDelete.push(group[i].id);
            }
          }
        });

        // If duplicate logs exist, delete ONLY the duplicate log documents.
        // CRITICAL: Never overwrite subject aggregate counts (classesAttended/classesTotal etc.)
        // from log counts. This would destroy mid-semester baselines where a student entered
        // starting counts (e.g. 35 attended / 40 total) without individual past log entries.
        if (duplicateLogIdsToDelete.length > 0) {
          const batch = writeBatch(db);
          duplicateLogIdsToDelete.forEach(id => {
            batch.delete(doc(db, COLLECTION.ATTENDANCE_LOGS, id));
            academic.optimisticRemoveAttendanceLog?.(id);
          });

          await batch.commit();
        }
      } catch (err) {
        handleSyncError(err);
      }
    });
  }, [user?.uid, subjects, logs, academic]);

  // ── Derived values ─────────────────────────────────────────────────────────
  // ── logsBySubjectId — indexed map (strictly deduplicated, sorted newest first) ──
  const logsBySubjectId = useMemo(() => {
    const map: Record<string, any[]> = {};
    if (!logs || logs.length === 0) return map;

    // Single upfront sort by timestamp descending
    const sorted = logs.length > 1
      ? [...logs].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
      : logs;

    const seenPerSubject: Record<string, Set<string>> = {};

    for (let i = 0; i < sorted.length; i++) {
      const log = sorted[i];
      const key1 = log.subjectId;
      const key2 = log.subjectName;

      const addToBucket = (subjKey: string) => {
        if (!map[subjKey]) {
          map[subjKey] = [];
          seenPerSubject[subjKey] = new Set<string>();
        }
        if (log.isExtra) {
          map[subjKey].push(log);
        } else {
          const slotKey = `${(log.date || '').slice(0, 10)}_${log.type === 'lab' ? 'lab' : 'class'}_${log.idx ?? 0}`;
          if (!seenPerSubject[subjKey].has(slotKey)) {
            seenPerSubject[subjKey].add(slotKey);
            map[subjKey].push(log);
          }
        }
      };

      if (key1) addToBucket(key1);
      if (key2 && key2 !== key1) addToBucket(key2);
    }
    return map;
  }, [logs]);

  const subjectsRef = useRef(subjects);
  subjectsRef.current = subjects;

  const selectedDayOfWeek = useMemo(() => new Date(selectedDate + 'T00:00:00').getDay().toString(), [selectedDate]);
  const isSelectedHoliday = useMemo(() => holidays.includes(selectedDate), [holidays, selectedDate]);
  const today             = useMemo(() => getLocalDateString(new Date()), []);
  const weekDates         = useMemo(() => getWeekDates(selectedDate), [selectedDate]);

  // ── Stable Timetable Fingerprint ──
  // Decouples session rendering from mutable attendance counters (attended/total)
  const timetableFingerprint = useMemo(() => {
    return subjects.map(s => `${s.id}:${s.name}:${JSON.stringify(s.schedule || {})}`).join('|');
  }, [subjects]);

  const todayScheduledSubjects = useMemo(() => {
    const currentSubjects = subjectsRef.current;
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

    for (let i = 0; i < currentSubjects.length; i++) {
      const s = currentSubjects[i];
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
  }, [timetableFingerprint, selectedDayOfWeek, selectedDate]);

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
      existingLogId?: string; isExtra?: boolean;
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

    // Fix #15 (part 2): Include extra class logs for the selected date.
    // Extra classes added via "Extra class +" were invisible in the daily list
    // because the FlatList only rendered timetable-scheduled slots.
    if (logs && logs.length > 0) {
      const cleanSelDate = (selectedDate || '').slice(0, 10);
      const extraLogs = logs.filter(l =>
        l.isExtra &&
        (l.date || '').slice(0, 10) === cleanSelDate
      );
      extraLogs.forEach((l, eIdx) => {
        const subject = subjects.find(s => s.id === l.subjectId || s.name === l.subjectName);
        if (subject) {
          const isLab = l.type === 'lab';
          sessions.push({
            id: `${subject.id!}-extra-${isLab ? 'lab' : 'class'}-${eIdx}`,
            subject,
            type: isLab ? 'lab' : 'class',
            idx: -1,          // sentinel: extra class — no timetable slot
            existingLogId: l.id, // store log ID so renderItem can find this log directly
            timeMins: l.timestamp ? new Date(l.timestamp).getHours() * 60 + new Date(l.timestamp).getMinutes() : 9999,
            timeStr: `Extra ${isLab ? 'Lab' : 'Class'}`,
            isExtra: true,
          });
        }
      });
    }

    return sessions.sort((a, b) => a.timeMins - b.timeMins);
  }, [todayScheduledSubjects, selectedDayOfWeek, selectedDate, isSelectedHoliday, logs, subjects]);

  const [isUnloggedOpen, setIsUnloggedOpen] = useState(false);

  // ── Unlogged Past Classes & Labs (Optimized On-Demand Calculation) ───────────
  // When the drawer is closed: calculates pure integer count in <0.1ms without object allocations or sorting.
  // When the drawer is open: builds and sorts the full pending session list.
  const { unloggedCount, unloggedSessions } = useMemo(() => {
    if (!subjects || subjects.length === 0) return { unloggedCount: 0, unloggedSessions: [] };

    // Pre-index all existing non-extra logs into a Set: `${subjIdentifier}_${dateStr}_${type}_${idx}`
    const loggedSlotSet = new Set<string>();
    if (logs && logs.length > 0) {
      for (let i = 0; i < logs.length; i++) {
        const l = logs[i];
        if (l.isExtra) continue;
        const d = (l.date || '').slice(0, 10);
        const t = l.type === 'lab' ? 'lab' : 'class';
        const idx = l.idx ?? 0;
        if (l.subjectId) {
          loggedSlotSet.add(`${l.subjectId}_${d}_${t}_${idx}`);
        }
        if (l.subjectName) {
          loggedSlotSet.add(`${l.subjectName}_${d}_${t}_${idx}`);
        }
      }
    }

    const holidaySet = new Set(holidays);
    const todayDate = new Date();
    let count = 0;
    const list: Array<{
      id: string;
      subject: AttendanceSubject;
      date: string;
      type: 'class' | 'lab';
      idx: number;
      timeMins: number;
      timeStr: string;
    }> = [];

    // Scan past 30 days (offset 1 = yesterday back to 30 days ago)
    for (let offset = 1; offset <= 30; offset++) {
      const pastDate = new Date(todayDate.getTime() - offset * 86400000);
      const dateStr = getLocalDateString(pastDate);

      // Skip dates explicitly marked as holidays (O(1))
      if (holidaySet.has(dateStr)) continue;

      const dayOfWeekNum = pastDate.getDay();
      const dayOfWeekStr = dayOfWeekNum.toString();
      const dayName = DAY_NAMES[dayOfWeekNum];
      const dayNameLower = dayName.toLowerCase();

      for (let sIdx = 0; sIdx < subjects.length; sIdx++) {
        const subject = subjects[sIdx];
        if (!subject.id) continue;

        // Fix #14: Don't scan dates before the subject was created/enrolled.
        // Without this, a student adding a new subject today would see 30 days of
        // phantom unlogged sessions for a class they just enrolled in.
        // Use lastUpdated as a proxy for creation date. If it's not set, we can't
        // bound and must include all 30 days (legacy subjects without timestamps).
        const subjectCreatedMs = subject.lastUpdated;
        if (subjectCreatedMs) {
          const subjectCreatedDate = new Date(subjectCreatedMs);
          subjectCreatedDate.setHours(0, 0, 0, 0);
          if (pastDate < subjectCreatedDate) continue;
        }

        const sch =
          subject.schedule?.[dayOfWeekStr] ||
          subject.schedule?.[dayOfWeekNum] ||
          subject.schedule?.[dayName] ||
          subject.schedule?.[dayNameLower];

        if (!sch) continue;

        const classCount = sch.classes?.length || sch.classCount || 0;
        const labCount   = sch.labs?.length   || sch.labCount   || 0;

        // Check Classes with O(1) Set lookup
        for (let i = 0; i < classCount; i++) {
          const hasLog =
            loggedSlotSet.has(`${subject.id}_${dateStr}_class_${i}`) ||
            (subject.name ? loggedSlotSet.has(`${subject.name}_${dateStr}_class_${i}`) : false);

          if (!hasLog) {
            count++;
            if (isUnloggedOpen) {
              const session = sch.classes?.[i];
              const timeStr = session?.time ? [session.time, session.room].filter(Boolean).join(' • ') : `Class #${i + 1}`;
              list.push({
                id: `${subject.id}-unlogged-class-${i}-${dateStr}`,
                subject,
                date: dateStr,
                type: 'class',
                idx: i,
                timeMins: parseTimeToMinutes(session?.time),
                timeStr,
              });
            }
          }
        }

        // Check Labs with O(1) Set lookup
        for (let i = 0; i < labCount; i++) {
          const hasLog =
            loggedSlotSet.has(`${subject.id}_${dateStr}_lab_${i}`) ||
            (subject.name ? loggedSlotSet.has(`${subject.name}_${dateStr}_lab_${i}`) : false);

          if (!hasLog) {
            count++;
            if (isUnloggedOpen) {
              const session = sch.labs?.[i];
              const timeStr = session?.time ? [session.time, session.room].filter(Boolean).join(' • ') : `Lab #${i + 1}`;
              list.push({
                id: `${subject.id}-unlogged-lab-${i}-${dateStr}`,
                subject,
                date: dateStr,
                type: 'lab',
                idx: i,
                timeMins: parseTimeToMinutes(session?.time),
                timeStr,
              });
            }
          }
        }
      }
    }

    if (isUnloggedOpen && list.length > 0) {
      list.sort((a, b) => {
        if (a.date !== b.date) {
          return b.date.localeCompare(a.date);
        }
        return a.timeMins - b.timeMins;
      });
    }

    return { unloggedCount: count, unloggedSessions: list };
  }, [subjects, holidays, logs, isUnloggedOpen]);

  // ── Selected Date Logs Map for instant O(1) slot resolution in renderItem ──
  const selectedDateLogsBySlot = useMemo(() => {
    const map = new Map<string, any>();
    if (!logs || logs.length === 0) return map;
    const cleanSelDate = (selectedDate || '').slice(0, 10);

    for (let i = 0; i < logs.length; i++) {
      const l = logs[i];
      if ((l.date || '').slice(0, 10) !== cleanSelDate) continue;
      const type = l.type === 'lab' ? 'lab' : 'class';
      if (l.isExtra) {
        // Extra class logs are keyed by their own ID so renderItem can find them
        // directly via session.existingLogId
        if (l.id) map.set(l.id, l);
        continue;
      }
      const idx = l.idx ?? 0;
      if (l.subjectId) {
        map.set(`${l.subjectId}_${type}_${idx}`, l);
      }
      if (l.subjectName) {
        map.set(`${l.subjectName}_${type}_${idx}`, l);
      }
    }
    return map;
  }, [logs, selectedDate]);

  const { globalAttended, globalTotal, globalPct, globalSafe } = useMemo(() => {
    const attended = subjects.reduce((s, x) => s + (x.classesAttended || 0) + (x.labsAttended || 0), 0);
    const total    = subjects.reduce((s, x) => s + (x.classesTotal   || 0) + (x.labsTotal    || 0), 0);
    const pct      = total === 0 ? null : (attended / total) * 100;
    const safe     = pct !== null ? pct >= 75 : true;
    return { globalAttended: attended, globalTotal: total, globalPct: pct, globalSafe: safe };
  }, [subjects]);

  return {
    user, subjects,
    logs, holidays, logsBySubjectId, selectedDateLogsBySlot,
    selectedDate, setSelectedDate,
    showDatePicker, setShowDatePicker,
    isTimetableOpen, setIsTimetableOpen,
    showClassNotifModal, setShowClassNotifModal,
    selectedHistorySubject, setSelectedHistorySubject,
    isExtraOpen, setIsExtraOpen,
    isUnloggedOpen, setIsUnloggedOpen,
    unloggedSessions,
    unloggedCount,
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
