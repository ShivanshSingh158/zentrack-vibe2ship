/**
 * useAttendanceFirestore.ts
 * All Firestore write handlers for the Attendance module:
 * handleLog, handleUndo, handleToggleHoliday, handleDeleteSubject,
 * handleApplyOverride, handleResetSemester.
 */
import React, { useRef, useCallback, useMemo } from 'react';
import { Alert, InteractionManager } from 'react-native';
import {
  collection, query, where, addDoc, updateDoc, doc,
  writeBatch, getDocs,
} from 'firebase/firestore';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { db } from '../../services/firebase';
import { AttendanceSubject } from '../../contexts/MobileDataContext';
import { COLLECTION } from '../../config/constants';
import { handleSyncError } from '../../utils/errorUtils';
import { safeWrite } from '../../utils/safeWrite';
import { queueWrite } from '../../services/offlineSync';
import { DAY_NAMES, getScheduledAttendanceLogDocId } from './attendanceConstants';
import { awardXP } from '../../services/xpSystem';
import { buildTodayAgendaData, saveCachedWidgetData, updateTodayAgendaWidget, getCachedWidgetData } from '../../services/widgetSyncService';
import { readAcademicCache } from '../../utils/domainCache';
import { formatLocalDateStr } from '../../utils/dateUtils';
import { readCoreCacheMulti } from '../../utils/coreCache';
import { cancelClassNotificationsImmediately, clearScheduleCache } from '../../services/notifications';

// Set the notification handler once at module level (previously in AttendanceScreen top-level)
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

interface FirestoreActionsParams {
  user: any;
  subjects: AttendanceSubject[];
  logs: any[];
  selectedDate: string;
  logsBySubjectId: Record<string, any[]>;
  overrideCounts: { classesAttended: number; classesTotal: number; labsAttended: number; labsTotal: number };
  setOverrideOpen: (id: string | null) => void;
  setConfirmConfig: (config: any) => void;
  optimisticUpdateAttendance: (subjectId: string, partial: Partial<AttendanceSubject>) => void;
  optimisticAddAttendanceLog: (log: any) => void;
  optimisticUpdateAttendanceLog?: (logId: string, partial: any) => void;
  optimisticRemoveAttendanceLog: (logId: string) => void;
  optimisticDeleteSubject?: (subjectId: string) => void;
  optimisticToggleHoliday?: (dateStr: string, isHoliday: boolean) => void;
}

export function useAttendanceFirestore({
  user, subjects, logs, selectedDate,
  logsBySubjectId, overrideCounts,
  setOverrideOpen, setConfirmConfig,
  optimisticUpdateAttendance, optimisticAddAttendanceLog, optimisticUpdateAttendanceLog, optimisticRemoveAttendanceLog,
  optimisticDeleteSubject, optimisticToggleHoliday,
}: FirestoreActionsParams) {

  // Mutable refs to keep callback references permanently stable across renders
  const userRef = useRef(user);
  userRef.current = user;
  const subjectsRef = useRef(subjects);
  subjectsRef.current = subjects;
  const logsRef = useRef(logs);
  logsRef.current = logs;
  const selectedDateRef = useRef(selectedDate);
  selectedDateRef.current = selectedDate;
  const logsBySubjectIdRef = useRef(logsBySubjectId);
  logsBySubjectIdRef.current = logsBySubjectId;
  const overrideCountsRef = useRef(overrideCounts);
  overrideCountsRef.current = overrideCounts;

  // ── Core log action ────────────────────────────────────────────────────────
  const handleLog = useCallback(async (
    subjectInput: AttendanceSubject,
    type: 'class' | 'lab',
    action: 'attended' | 'missed' | 'cancelled',
    existingLogId?: string,
    sessionIdx: number = 0,
    logDate?: string,
    isExtra = false,
  ) => {
    const currentUser = userRef.current;
    const currentSubjects = subjectsRef.current;
    const currentLogs = logsRef.current;
    const currentSelectedDate = selectedDateRef.current;

    if (!currentUser || (!subjectInput.id && !subjectInput.name)) return;
    // Always get the freshest subject state from the domain context
    const subject = currentSubjects.find(s => (subjectInput.id && s.id === subjectInput.id) || s.name === subjectInput.name) || subjectInput;
    const attendedKey = type === 'class' ? 'classesAttended' : 'labsAttended';
    const totalKey    = type === 'class' ? 'classesTotal'    : 'labsTotal';
    const cleanLogDate = (logDate || currentSelectedDate || '').slice(0, 10);

    // Guard: never log attendance for future dates.
    // Students can navigate to future dates to view their timetable, but
    // tapping Present/Absent on a future date silently aborts here.
    const todayStr = new Date().toISOString().split('T')[0];
    if (cleanLogDate > todayStr) return;

    // Deterministic unique ID for scheduled non-extra sessions
    const deterministicId = !isExtra && subject.id && currentUser?.uid
      ? getScheduledAttendanceLogDocId(currentUser.uid, subject.id, cleanLogDate, type, sessionIdx)
      : undefined;

    // Check if we are updating an existing log — first try explicit ID, then deterministic ID, then memory match.
    // For extra classes with an existingLogId (tapping Present/Absent on an existing extra class row),
    // we DO match the existing log to update its action.
    // Only skip matching when isExtra=true AND no existingLogId — those come from the "+ Extra class"
    // modal and are truly new independent logs (so repeated taps increment the count).
    let existingLog = existingLogId
      ? currentLogs.find(l => l.id === existingLogId)
      : isExtra
        ? null  // new extra class from modal — always creates a brand-new log
        : (deterministicId ? currentLogs.find(l => l.id === deterministicId) : null) ||
          currentLogs.find(l =>
            (l.subjectId === subject.id || l.subjectId === subject.name || l.subjectName === subject.name) &&
            (type === 'lab' ? l.type === 'lab' : (l.type === 'class' || !l.type)) &&
            (l.date || '').slice(0, 10) === cleanLogDate &&
            !l.isExtra &&
            // Exact session slot match
            (l.idx === sessionIdx || (l.idx === undefined && sessionIdx === 0))
          );

    // Fallback: Check academicCache if in-memory currentLogs was slightly delayed
    if (!existingLog && !isExtra) {
      try {
        const cache = await readAcademicCache();
        const cacheLog = (cache.attendanceLogs || []).find(l =>
          l.id === deterministicId ||
          (
            (l.subjectId === subject.id || l.subjectId === subject.name || l.subjectName === subject.name) &&
            (type === 'lab' ? l.type === 'lab' : (l.type === 'class' || !l.type)) &&
            (l.date || '').slice(0, 10) === cleanLogDate &&
            !l.isExtra &&
            (l.idx === sessionIdx || (l.idx === undefined && sessionIdx === 0))
          )
        );
        if (cacheLog) {
          existingLog = cacheLog;
        }
      } catch {}
    }

    // Find any duplicate/stale logs for this exact same scheduled slot to clean them up simultaneously.
    // Never deduplicate extra logs — each extra class is intentionally independent.
    const duplicateLogsToDelete = !isExtra
      ? currentLogs.filter(l =>
          (!existingLog || l.id !== existingLog.id) &&
          (deterministicId ? l.id !== deterministicId : true) &&
          (l.subjectId === subject.id || l.subjectId === subject.name || l.subjectName === subject.name) &&
          (type === 'lab' ? l.type === 'lab' : (l.type === 'class' || !l.type)) &&
          (l.date || '').slice(0, 10) === cleanLogDate &&
          !l.isExtra &&
          (l.idx === sessionIdx || (l.idx === undefined && sessionIdx === 0))
        )
      : [];

    let newAttended: number;
    let newTotal: number;

    if (existingLog) {
      if (existingLog.action === action && duplicateLogsToDelete.length === 0) return;

      const oldAction = existingLog.action;
      const oldAttContribution = oldAction === 'attended' ? 1 : 0;
      const newAttContribution = action === 'attended' ? 1 : 0;
      const attDelta = newAttContribution - oldAttContribution;

      const oldTotContribution = oldAction === 'cancelled' ? 0 : 1;
      const newTotContribution = action === 'cancelled' ? 0 : 1;
      const totDelta = newTotContribution - oldTotContribution;

      newAttended = Math.max(0, (subject[attendedKey as keyof AttendanceSubject] as number || 0) + attDelta);
      newTotal    = Math.max(0, (subject[totalKey    as keyof AttendanceSubject] as number || 0) + totDelta);
    } else {
      newAttended = (subject[attendedKey as keyof AttendanceSubject] as number || 0) + (action === 'attended' ? 1 : 0);
      newTotal    = (subject[totalKey    as keyof AttendanceSubject] as number || 0) + (action === 'cancelled' ? 0 : 1);
    }

    const subjectUpdates = { [attendedKey]: newAttended, [totalKey]: newTotal, lastUpdated: Date.now() };

    try {
      const targetDocId = existingLog?.id || deterministicId || doc(collection(db, COLLECTION.ATTENDANCE_LOGS)).id;
      const targetLog = {
        id: targetDocId,
        userId: user.uid,
        subjectId: subject.id,
        subjectName: subject.name,
        type,
        action,
        date: cleanLogDate,
        isExtra,
        timestamp: Date.now(),
        idx: sessionIdx,
      };

      if (existingLog) {
        // Optimistically update UI
        optimisticUpdateAttendance(subject.id, subjectUpdates);
        if (optimisticUpdateAttendanceLog) {
          optimisticUpdateAttendanceLog(existingLog.id, { action, timestamp: Date.now() });
        }
        duplicateLogsToDelete.forEach(dup => optimisticRemoveAttendanceLog(dup.id));

        if (action === 'attended' && existingLog.action !== 'attended') {
          awardXP('ATTENDANCE_LOG').catch(() => {});
        }

        // WhatsApp Pattern: direct online write + offline queue fallback
        safeWrite(
          async () => {
            const batch = writeBatch(db);
            batch.update(doc(db, COLLECTION.ATTENDANCE, subject.id!), subjectUpdates);
            batch.set(doc(db, COLLECTION.ATTENDANCE_LOGS, existingLog.id), { action, timestamp: Date.now() }, { merge: true });
            duplicateLogsToDelete.forEach(dup => {
              batch.delete(doc(db, COLLECTION.ATTENDANCE_LOGS, dup.id));
            });
            await batch.commit();
          },
          COLLECTION.ATTENDANCE,
          'update',
          subjectUpdates,
          subject.id
        ).then(async (online) => {
          if (!online) {
            await queueWrite(COLLECTION.ATTENDANCE_LOGS, 'update', { action, timestamp: Date.now() }, existingLog.id);
          }
        }).catch(handleSyncError);
      } else {
        // Optimistically update UI
        optimisticUpdateAttendance(subject.id, subjectUpdates);
        optimisticAddAttendanceLog(targetLog);
        duplicateLogsToDelete.forEach(dup => optimisticRemoveAttendanceLog(dup.id));

        if (action === 'attended') {
          awardXP('ATTENDANCE_LOG').catch(() => {});
        }

        // WhatsApp Pattern: direct online write + offline queue fallback
        safeWrite(
          async () => {
            const batch = writeBatch(db);
            batch.update(doc(db, COLLECTION.ATTENDANCE, subject.id!), subjectUpdates);
            batch.set(doc(db, COLLECTION.ATTENDANCE_LOGS, targetDocId), targetLog, { merge: true });
            duplicateLogsToDelete.forEach(dup => {
              batch.delete(doc(db, COLLECTION.ATTENDANCE_LOGS, dup.id));
            });
            await batch.commit();
          },
          COLLECTION.ATTENDANCE,
          'update',
          subjectUpdates,
          subject.id
        ).then(async (online) => {
          if (!online) {
            await queueWrite(COLLECTION.ATTENDANCE_LOGS, 'set', targetLog, targetDocId);
          }
        }).catch(handleSyncError);
      }

      // Immediately cancel any pending scheduled OS notifications (60m, 30m, checkpoint, post-log)
      // for this class/lab session so they don't fire after user has marked it.
      // NOTE: We do NOT call clearScheduleCache() here — doing so triggers a reschedule before
      // Firestore confirms the new attendance log, which would re-add the just-cancelled
      // notifications. The BackgroundNotificationWatcher will pick up the attendanceLogs change
      // (via Firestore snapshot ~1-2s later) and run a full reschedule that properly skips
      // all marked sessions via the sessionLog guard in Section 10.
      cancelClassNotificationsImmediately(subject.id!, subject.name, cleanLogDate, sessionIdx).catch(() => {});

      // Sync to Android widget immediately if logging today's session
      const nowStr = formatLocalDateStr(new Date());
      if (cleanLogDate === nowStr) {
        InteractionManager.runAfterInteractions(async () => {
          try {
            const academicCache = await readAcademicCache();
            const cachedWidget = await getCachedWidgetData();
            const currentLogs = academicCache.attendanceLogs || logs;
            const updatedLogs = [
              targetLog,
              ...currentLogs.filter(l => l.id !== targetDocId)
            ];
            const widgetData = buildTodayAgendaData({
              tasks: (cachedWidget?.tasks?.map(t => ({
                id: t.id,
                title: t.title,
                timeSlot: t.timeSlot,
                status: t.status,
                priority: t.priority,
              })) as any) || [],
              subjects: academicCache.attendance || subjects,
              attendanceLogs: updatedLogs,
              holidays: academicCache.holidays || [],
              zenScore: cachedWidget?.zenScore ?? 85,
            });
            await saveCachedWidgetData(widgetData);
            await updateTodayAgendaWidget(widgetData);
          } catch {}
        });
      }

      // Compute accurate combined before/after percentages for the threshold alert.
      // Use the already-correct per-type newAttended/newTotal (calculated above) and combine
      // with the OTHER type's unchanged values from the subject doc.
      const isClassType    = type === 'class';
      const oldCombinedAtt = (subject.classesAttended || 0) + (subject.labsAttended || 0);
      const oldCombinedTot = (subject.classesTotal    || 0) + (subject.labsTotal    || 0);
      const oldPct         = oldCombinedTot === 0 ? 100 : (oldCombinedAtt / oldCombinedTot) * 100;
      const newCombinedAtt = isClassType
        ? newAttended + (subject.labsAttended || 0)
        : (subject.classesAttended || 0) + newAttended;
      const newCombinedTot = isClassType
        ? newTotal + (subject.labsTotal || 0)
        : (subject.classesTotal || 0) + newTotal;
      const newPct         = newCombinedTot === 0 ? 100 : (newCombinedAtt / newCombinedTot) * 100;

      const targetPct = subject.targetPercentage || 75;
      if (oldPct >= targetPct && newPct < targetPct) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Attendance Alert! ⚠️',
            body: `${subject.name} has dropped to ${newPct.toFixed(1)}% (below your ${targetPct}% target).`,
            sound: true,
          },
          trigger: null,
        });
      }
    } catch (err) { Alert.alert('Error', 'Failed to log attendance'); }
  }, [optimisticUpdateAttendance, optimisticAddAttendanceLog, optimisticUpdateAttendanceLog, optimisticRemoveAttendanceLog]);

  // ── Undo last log ──────────────────────────────────────────────────────────
  const handleUndo = useCallback(async (logId: string) => {
    const currentUser = userRef.current;
    const currentLogs = logsRef.current;
    const currentSubjects = subjectsRef.current;

    if (!currentUser) return;
    const logToUndo = currentLogs.find(l => l.id === logId);
    if (!logToUndo) return;
    const subject = currentSubjects.find(s => s.id === logToUndo.subjectId || s.name === logToUndo.subjectName || s.name === logToUndo.subjectId);
    if (!subject) { Alert.alert('Error', 'Subject deleted.'); return; }

    const type        = logToUndo.type || 'class';
    const attendedKey = type === 'class' ? 'classesAttended' : 'labsAttended';
    const totalKey    = type === 'class' ? 'classesTotal'    : 'labsTotal';

    // CRITICAL: Use delta subtraction instead of log re-counting.
    // The old approach scanned remaining logs and set totals = logCount, which
    // destroyed mid-semester baselines (student entered 35/40 starting counts
    // without individual past logs — one undo would reset to remaining log count).
    // Delta approach: subtract only the contribution of the removed log.
    const undoAction = logToUndo.action;
    const attDelta = undoAction === 'attended' ? -1 : 0;
    const totDelta = undoAction === 'cancelled' ? 0 : -1; // cancelled logs don't count toward total

    const newAttended = Math.max(0, (subject[attendedKey as keyof AttendanceSubject] as number || 0) + attDelta);
    const newTotal    = Math.max(0, (subject[totalKey    as keyof AttendanceSubject] as number || 0) + totDelta);
    const subjectUpdates = { [attendedKey]: newAttended, [totalKey]: newTotal, lastUpdated: Date.now() };

    try {
      // Optimistically update UI
      optimisticUpdateAttendance(subject.id, subjectUpdates);
      optimisticRemoveAttendanceLog(logId);

      safeWrite(
        async () => {
          const batch = writeBatch(db);
          batch.update(doc(db, COLLECTION.ATTENDANCE, subject.id!), subjectUpdates);
          batch.delete(doc(db, COLLECTION.ATTENDANCE_LOGS, logId));
          await batch.commit();
        },
        COLLECTION.ATTENDANCE,
        'update',
        subjectUpdates,
        subject.id
      ).then(async (online) => {
        if (!online) {
          await queueWrite(COLLECTION.ATTENDANCE_LOGS, 'delete', null, logId);
        }
      }).catch(handleSyncError);

      // NOTE: We do NOT call clearScheduleCache() here — the Firestore snapshot that removes
      // the log will update attendanceLogs, change the fingerprint, and trigger a proper
      // reschedule automatically via BackgroundNotificationWatcher.
    } catch (err) { Alert.alert('Error', 'Failed to undo attendance log'); }
  }, [optimisticUpdateAttendance, optimisticRemoveAttendanceLog]);

  // ── Holiday toggle ─────────────────────────────────────────────────────────
  const handleToggleHoliday = useCallback(async (isSelectedHoliday: boolean) => {
    const currentUser = userRef.current;
    const currentSelectedDate = selectedDateRef.current;
    const currentSubjects = subjectsRef.current;
    const currentLogsBySubjectId = logsBySubjectIdRef.current;
    const currentLogs = logsRef.current;

    if (!currentUser) return;
    try {
      optimisticToggleHoliday?.(currentSelectedDate, !isSelectedHoliday);

      if (isSelectedHoliday) {
        // Turning OFF holiday — delete the holiday doc AND any ghost cancelled logs
        // that were created when the holiday was toggled ON.
        const q = query(
          collection(db, COLLECTION.ATTENDANCE_HOLIDAYS),
          where('userId', '==', currentUser.uid),
          where('date', '==', currentSelectedDate),
        );
        const snap  = await getDocs(q);
        const batch = writeBatch(db);
        snap.docs.forEach(d => batch.delete(d.ref));

        // Fix #4: Also delete cancelled logs created by the holiday toggle.
        // Without this, turning holiday OFF left ghost cancelled logs behind,
        // permanently marking classes as cancelled even though the holiday was removed.
        const cancelledLogsForDate = currentLogs.filter(l =>
          l.action === 'cancelled' &&
          !l.isExtra &&
          (l.date || '').slice(0, 10) === currentSelectedDate
        );
        cancelledLogsForDate.forEach(l => {
          batch.delete(doc(db, COLLECTION.ATTENDANCE_LOGS, l.id));
          optimisticRemoveAttendanceLog(l.id);
        });

        await batch.commit();
      } else {
        const batch = writeBatch(db);
        const holidayDocRef = doc(collection(db, COLLECTION.ATTENDANCE_HOLIDAYS));
        batch.set(holidayDocRef, { userId: currentUser.uid, date: currentSelectedDate });

        const dayKey = new Date(currentSelectedDate + 'T00:00:00').getDay().toString();

        currentSubjects.forEach(subject => {
          const sch =
            subject.schedule?.[dayKey] ||
            subject.schedule?.[Number(dayKey) as any] ||
            subject.schedule?.[DAY_NAMES[new Date(currentSelectedDate + 'T00:00:00').getDay()]] ||
            subject.schedule?.[DAY_NAMES[new Date(currentSelectedDate + 'T00:00:00').getDay()].toLowerCase()];
          if (!sch) return;

          const subLogs  = (currentLogsBySubjectId[subject.id!] || []).filter((l: any) => l.date === currentSelectedDate && !l.isExtra);
          const classLogs = subLogs.filter((l: any) => l.type === 'class' || !l.type);
          const labLogs   = subLogs.filter((l: any) => l.type === 'lab');
          const classCount = sch.classes?.length || sch.classCount || 0;
          const labCount   = sch.labs?.length   || sch.labCount   || 0;

          const createCancelLog = (type: 'class' | 'lab', idx: number) => {
            const logId = getScheduledAttendanceLogDocId(currentUser.uid, subject.id!, currentSelectedDate, type, idx);
            const logRef = doc(db, COLLECTION.ATTENDANCE_LOGS, logId);
            const newLog = {
              id: logId,
              userId: currentUser.uid,
              subjectId: subject.id,
              subjectName: subject.name,
              type,
              action: 'cancelled',
              date: currentSelectedDate,
              isExtra: false,
              timestamp: Date.now(),
              idx,
            };
            optimisticAddAttendanceLog(newLog);
            batch.set(logRef, newLog, { merge: true });
          };

          for (let i = 0; i < classCount; i++) {
            if (!classLogs.some((l: any) => l.idx === i || (l.idx === undefined && i === 0))) {
              createCancelLog('class', i);
            }
          }
          for (let i = 0; i < labCount; i++) {
            if (!labLogs.some((l: any) => l.idx === i || (l.idx === undefined && i === 0))) {
              createCancelLog('lab', i);
            }
          }
        });

        await batch.commit();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      // Sync to Android widget immediately if toggling today's holiday
      const nowStr = formatLocalDateStr(new Date());
      const cleanSelected = (currentSelectedDate || '').trim().slice(0, 10);
      if (cleanSelected === nowStr) {
        InteractionManager.runAfterInteractions(async () => {
          try {
            const academicCache = await readAcademicCache();
            const coreCache = await readCoreCacheMulti();
            const cachedWidget = await getCachedWidgetData();
            const existingHolidays = (academicCache.holidays || []).map(h => typeof h === 'string' ? h.trim().slice(0, 10) : (h as any)?.date?.trim()?.slice(0, 10)).filter(Boolean);
            const updatedHolidays = !isSelectedHoliday
              ? [...new Set([...existingHolidays, cleanSelected])]
              : existingHolidays.filter(h => h !== cleanSelected);

            const widgetData = buildTodayAgendaData({
              tasks: coreCache.tasks || [],
              subjects: academicCache.attendance || currentSubjects,
              attendanceLogs: academicCache.attendanceLogs || currentLogs,
              holidays: updatedHolidays,
              zenScore: cachedWidget?.zenScore ?? 85,
            });
            await saveCachedWidgetData(widgetData);
            await updateTodayAgendaWidget(widgetData);
          } catch {}
        });
      }
    } catch (err) { console.error(err); }
  }, [optimisticToggleHoliday, optimisticAddAttendanceLog]);

  // ── Delete subject ─────────────────────────────────────────────────────────
  const handleDeleteSubject = useCallback((id: string, name: string) => {
    const currentUser = userRef.current;
    const currentLogs = logsRef.current;

    if (!currentUser) return;
    setConfirmConfig({
      visible: true,
      title: 'Delete Subject',
      message: `Are you sure you want to delete ${name}?`,
      confirmText: 'Delete',
      danger: true,
      onConfirm: async () => {
        optimisticDeleteSubject?.(id);
        const subjectLogs = currentLogs.filter(l => l.subjectId === id);
        const batch       = writeBatch(db);
        subjectLogs.forEach(l => batch.delete(doc(db, COLLECTION.ATTENDANCE_LOGS, l.id)));
        batch.delete(doc(db, COLLECTION.ATTENDANCE, id));
        batch.commit().catch(e => console.log('Delete issue:', e));
        setConfirmConfig((p: any) => ({ ...p, visible: false }));
      },
    });
  }, [optimisticDeleteSubject, setConfirmConfig]);

  const handleApplyOverride = useCallback(async (subId: string) => {
    const currentCounts = overrideCountsRef.current;
    // Fix #3: Immediately sync React state so the UI reflects the override.
    // Without this, the override only goes to Firestore but the AcademicContext
    // snapshot merger (localSum > freshSum guard) rejects the update if the
    // new counts are lower than the current optimistic state.
    optimisticUpdateAttendance(subId, currentCounts);
    await safeWrite(
      () => updateDoc(doc(db, COLLECTION.ATTENDANCE, subId), currentCounts),
      COLLECTION.ATTENDANCE,
      'update',
      currentCounts,
      subId
    );
    setOverrideOpen(null);
  }, [setOverrideOpen, optimisticUpdateAttendance]);

  // ── Reset semester ─────────────────────────────────────────────────────────
  const handleResetSemester = useCallback(() => {
    const currentUser = userRef.current;
    const currentSubjects = subjectsRef.current;

    if (!currentUser) return;
    setConfirmConfig({
      visible: true,
      title: 'Reset Semester',
      message: 'This will permanently delete ALL attendance logs and reset all subject counts to 0. This CANNOT be undone.',
      confirmText: 'Reset Everything',
      danger: true,
      onConfirm: async () => {
        try {
          // Optimistically clear UI IMMEDIATELY — don't wait for Firestore batch.
          // Without this the user sees stale non-zero counters for 1-5 seconds after reset.
          const zeroUpdate = { classesAttended: 0, classesTotal: 0, labsAttended: 0, labsTotal: 0 };
          currentSubjects.forEach(s => {
            optimisticUpdateAttendance(s.id!, zeroUpdate);
          });
          const currentLogs = logsRef.current;
          currentLogs.forEach(l => {
            if (l.id) optimisticRemoveAttendanceLog(l.id);
          });

          const batch    = writeBatch(db);
          const logsSnap = await getDocs(query(
            collection(db, COLLECTION.ATTENDANCE_LOGS),
            where('userId', '==', currentUser.uid),
          ));
          logsSnap.docs.forEach(d => batch.delete(d.ref));
          currentSubjects.forEach(s => {
            batch.update(doc(db, COLLECTION.ATTENDANCE, s.id!), zeroUpdate);
          });
          batch.commit().catch(handleSyncError);
          setConfirmConfig((p: any) => ({ ...p, visible: false }));
        } catch (err) { console.error(err); }
      },
    });
  }, [setConfirmConfig, optimisticUpdateAttendance, optimisticRemoveAttendanceLog]);

  return useMemo(() => ({
    handleLog,
    handleUndo,
    handleToggleHoliday,
    handleDeleteSubject,
    handleApplyOverride,
    handleResetSemester,
  }), [handleLog, handleUndo, handleToggleHoliday, handleDeleteSubject, handleApplyOverride, handleResetSemester]);
}
