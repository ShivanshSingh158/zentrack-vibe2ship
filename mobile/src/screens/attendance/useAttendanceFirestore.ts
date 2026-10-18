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
  writeBatch, getDocs, increment,
} from 'firebase/firestore';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { db, auth } from '../../services/firebase';
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
import { cancelClassNotificationsImmediately, cancelAllClassNotificationsForDate, clearScheduleCache } from '../../services/notifications';

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
  setConfirmConfig: (config: any) => void;
  optimisticUpdateAttendance: (subjectId: string, partial: Partial<AttendanceSubject>) => void;
  optimisticAddAttendanceLog: (log: any) => void;
  optimisticUpdateAttendanceLog?: (logId: string, partial: any) => void;
  optimisticRemoveAttendanceLog: (logId: string) => void;
  optimisticDeleteSubject?: (subjectId: string) => void;
  optimisticToggleHoliday?: (dateStr: string, isHoliday: boolean) => void;
  optimisticClearAttendanceLogs?: (subjectId?: string) => void;
}

export function useAttendanceFirestore({
  user, subjects, logs, selectedDate,
  logsBySubjectId,
  setConfirmConfig,
  optimisticUpdateAttendance, optimisticAddAttendanceLog, optimisticUpdateAttendanceLog, optimisticRemoveAttendanceLog,
  optimisticDeleteSubject, optimisticToggleHoliday, optimisticClearAttendanceLogs,
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
    const uid = currentUser?.uid || user?.uid || auth.currentUser?.uid;

    if (!uid || (!subjectInput.id && !subjectInput.name)) return;
    // Always get the freshest subject state from the domain context
    const subject = currentSubjects.find(s => (subjectInput.id && s.id === subjectInput.id) || s.name === subjectInput.name) || subjectInput;
    const subjectId = subject.id || subjectInput.id;
    if (!subjectId) return;

    const attendedKey = type === 'class' ? 'classesAttended' : 'labsAttended';
    const totalKey    = type === 'class' ? 'classesTotal'    : 'labsTotal';
    const cleanLogDate = (logDate || currentSelectedDate || '').slice(0, 10);

    // Guard: never log attendance for future dates.
    // Students can navigate to future dates to view their timetable, but
    // tapping Present/Absent on a future date silently aborts here.
    const todayStr = formatLocalDateStr(new Date());
    if (cleanLogDate > todayStr) return;

    // Deterministic unique ID for scheduled non-extra sessions
    const deterministicId = !isExtra && subjectId && uid
      ? getScheduledAttendanceLogDocId(uid, subjectId, cleanLogDate, type, sessionIdx)
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
    let attDelta = 0;
    let totDelta = 0;

    if (existingLog) {
      if (existingLog.action === action && duplicateLogsToDelete.length === 0) return;

      const oldAction = existingLog.action;
      const oldAttContribution = oldAction === 'attended' ? 1 : 0;
      const newAttContribution = action === 'attended' ? 1 : 0;
      attDelta = newAttContribution - oldAttContribution;

      const oldTotContribution = oldAction === 'cancelled' ? 0 : 1;
      const newTotContribution = action === 'cancelled' ? 0 : 1;
      totDelta = newTotContribution - oldTotContribution;

      newAttended = Math.max(0, (subject[attendedKey as keyof AttendanceSubject] as number || 0) + attDelta);
      newTotal    = Math.max(0, (subject[totalKey    as keyof AttendanceSubject] as number || 0) + totDelta);
    } else {
      attDelta = action === 'attended' ? 1 : 0;
      totDelta = action === 'cancelled' ? 0 : 1;
      newAttended = (subject[attendedKey as keyof AttendanceSubject] as number || 0) + attDelta;
      newTotal    = (subject[totalKey    as keyof AttendanceSubject] as number || 0) + totDelta;
    }

    const subjectUpdates = { [attendedKey]: newAttended, [totalKey]: newTotal, lastUpdated: Date.now() };

    const atomicOnlineSubjectUpdates: Record<string, any> = { lastUpdated: Date.now() };
    const atomicOfflineSubjectUpdates: Record<string, any> = { lastUpdated: Date.now() };
    if (attDelta !== 0) {
      atomicOnlineSubjectUpdates[attendedKey] = increment(attDelta);
      atomicOfflineSubjectUpdates[attendedKey] = { __zentrackIncrement: attDelta };
    }
    if (totDelta !== 0) {
      atomicOnlineSubjectUpdates[totalKey] = increment(totDelta);
      atomicOfflineSubjectUpdates[totalKey] = { __zentrackIncrement: totDelta };
    }

    try {
      const targetDocId = existingLog?.id || deterministicId || doc(collection(db, COLLECTION.ATTENDANCE_LOGS)).id;
      const targetLog = {
        id: targetDocId,
        userId: uid,
        subjectId,
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
        optimisticUpdateAttendance(subjectId, subjectUpdates);
        if (optimisticUpdateAttendanceLog) {
          optimisticUpdateAttendanceLog(existingLog.id, { action, timestamp: Date.now() });
        }
        duplicateLogsToDelete.forEach(dup => optimisticRemoveAttendanceLog(dup.id));

        if (action === 'attended' && existingLog.action !== 'attended') {
          awardXP('ATTENDANCE_LOG').catch(() => {});
        }

        // WhatsApp Pattern: direct online write with atomic increment + offline queue fallback
        safeWrite(
          async () => {
            const batch = writeBatch(db);
            batch.set(doc(db, COLLECTION.ATTENDANCE, subjectId), atomicOnlineSubjectUpdates, { merge: true });
            batch.set(doc(db, COLLECTION.ATTENDANCE_LOGS, existingLog.id), { action, timestamp: Date.now() }, { merge: true });
            duplicateLogsToDelete.forEach(dup => {
              batch.delete(doc(db, COLLECTION.ATTENDANCE_LOGS, dup.id));
            });
            await batch.commit();
          },
          COLLECTION.ATTENDANCE,
          'update',
          atomicOfflineSubjectUpdates,
          subjectId
        ).then(async (online) => {
          if (!online) {
            await queueWrite(COLLECTION.ATTENDANCE_LOGS, 'update', { action, timestamp: Date.now() }, existingLog.id);
          }
        }).catch(handleSyncError);
      } else {
        // Optimistically update UI
        optimisticUpdateAttendance(subjectId, subjectUpdates);
        optimisticAddAttendanceLog(targetLog);
        duplicateLogsToDelete.forEach(dup => optimisticRemoveAttendanceLog(dup.id));

        if (action === 'attended') {
          awardXP('ATTENDANCE_LOG').catch(() => {});
        }

        // WhatsApp Pattern: direct online write with atomic increment + offline queue fallback
        safeWrite(
          async () => {
            const batch = writeBatch(db);
            batch.set(doc(db, COLLECTION.ATTENDANCE, subjectId), atomicOnlineSubjectUpdates, { merge: true });
            batch.set(doc(db, COLLECTION.ATTENDANCE_LOGS, targetDocId), targetLog, { merge: true });
            duplicateLogsToDelete.forEach(dup => {
              batch.delete(doc(db, COLLECTION.ATTENDANCE_LOGS, dup.id));
            });
            await batch.commit();
          },
          COLLECTION.ATTENDANCE,
          'update',
          atomicOfflineSubjectUpdates,
          subjectId
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
      cancelClassNotificationsImmediately(subjectId, subject.name, cleanLogDate, sessionIdx).catch(() => {});

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
        Notifications.scheduleNotificationAsync({
          content: {
            title: 'Attendance Alert! ⚠️',
            body: `${subject.name} has dropped to ${newPct.toFixed(1)}% (below your ${targetPct}% target).`,
            sound: true,
          },
          trigger: null,
        }).catch(() => {});
      }
    } catch (err) {
      console.error('[handleLog Error]:', err);
      Alert.alert('Error', 'Failed to log attendance');
    }
  }, [optimisticUpdateAttendance, optimisticAddAttendanceLog, optimisticUpdateAttendanceLog, optimisticRemoveAttendanceLog]);

  // ── Undo last log ──────────────────────────────────────────────────────────
  const handleUndo = useCallback(async (logId: string) => {
    const currentUser = userRef.current;
    const currentLogs = logsRef.current;
    const currentSubjects = subjectsRef.current;
    const uid = currentUser?.uid || user?.uid || auth.currentUser?.uid;

    if (!uid) return;
    const logToUndo = currentLogs.find(l => l.id === logId);
    if (!logToUndo) return;
    const subject = currentSubjects.find(s => s.id === logToUndo.subjectId || s.name === logToUndo.subjectName || s.name === logToUndo.subjectId);
    if (!subject) { Alert.alert('Error', 'Subject deleted.'); return; }
    const subjectId = subject.id || logToUndo.subjectId;
    if (!subjectId) return;

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

    const atomicOnlineSubjectUpdates: Record<string, any> = { lastUpdated: Date.now() };
    const atomicOfflineSubjectUpdates: Record<string, any> = { lastUpdated: Date.now() };
    if (attDelta !== 0) {
      atomicOnlineSubjectUpdates[attendedKey] = increment(attDelta);
      atomicOfflineSubjectUpdates[attendedKey] = { __zentrackIncrement: attDelta };
    }
    if (totDelta !== 0) {
      atomicOnlineSubjectUpdates[totalKey] = increment(totDelta);
      atomicOfflineSubjectUpdates[totalKey] = { __zentrackIncrement: totDelta };
    }

    try {
      // Optimistically update UI
      optimisticUpdateAttendance(subjectId, subjectUpdates);
      optimisticRemoveAttendanceLog(logId);

      safeWrite(
        async () => {
          const batch = writeBatch(db);
          batch.set(doc(db, COLLECTION.ATTENDANCE, subjectId), atomicOnlineSubjectUpdates, { merge: true });
          batch.delete(doc(db, COLLECTION.ATTENDANCE_LOGS, logId));
          await batch.commit();
        },
        COLLECTION.ATTENDANCE,
        'update',
        atomicOfflineSubjectUpdates,
        subjectId
      ).then(async (online) => {
        if (!online) {
          await queueWrite(COLLECTION.ATTENDANCE_LOGS, 'delete', null, logId);
        }
      }).catch(handleSyncError);

      // NOTE: We do NOT call clearScheduleCache() here — the Firestore snapshot that removes
      // the log will update attendanceLogs, change the fingerprint, and trigger a proper
      // reschedule automatically via BackgroundNotificationWatcher.
    } catch (err) {
      console.error('[handleUndo Error]:', err);
      Alert.alert('Error', 'Failed to undo attendance log');
    }
  }, [optimisticUpdateAttendance, optimisticRemoveAttendanceLog]);

  // ── Holiday toggle ─────────────────────────────────────────────────────────
  const handleToggleHoliday = useCallback(async (isSelectedHoliday: boolean) => {
    const currentUser = userRef.current;
    const currentSelectedDate = selectedDateRef.current;
    const currentSubjects = subjectsRef.current;
    const currentLogsBySubjectId = logsBySubjectIdRef.current;
    const currentLogs = logsRef.current;

    if (!currentUser) return;
    const cleanDate = (currentSelectedDate || '').trim().slice(0, 10);
    const deterministicHolidayId = `${currentUser.uid}_${cleanDate}`;

    try {
      optimisticToggleHoliday?.(cleanDate, !isSelectedHoliday);

      if (isSelectedHoliday) {
        // 1. Delete deterministic holiday doc + any legacy random-ID holiday docs for this date
        await safeWrite(
          async () => {
            const batch = writeBatch(db);
            batch.delete(doc(db, COLLECTION.ATTENDANCE_HOLIDAYS, deterministicHolidayId));
            const q = query(
              collection(db, COLLECTION.ATTENDANCE_HOLIDAYS),
              where('userId', '==', currentUser.uid),
              where('date', '==', cleanDate),
            );
            const snap = await getDocs(q).catch(() => null);
            snap?.docs.forEach(d => batch.delete(d.ref));
            await batch.commit();
          },
          COLLECTION.ATTENDANCE_HOLIDAYS,
          'delete',
          null,
          deterministicHolidayId
        ).catch(handleSyncError);

        // 2. Remove auto-cancelled logs for this date both optimistically and via safeWrite
        const cancelledLogsForDate = currentLogs.filter(l =>
          l.action === 'cancelled' &&
          !l.isExtra &&
          (l.date || '').slice(0, 10) === cleanDate
        );
        for (const l of cancelledLogsForDate) {
          if (!l.id) continue;
          optimisticRemoveAttendanceLog(l.id);
          safeWrite(
            async () => {
              const b = writeBatch(db);
              b.delete(doc(db, COLLECTION.ATTENDANCE_LOGS, l.id));
              await b.commit();
            },
            COLLECTION.ATTENDANCE_LOGS,
            'delete',
            null,
            l.id
          ).catch(handleSyncError);
        }

        clearScheduleCache();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        cancelAllClassNotificationsForDate(cleanDate).catch(() => {});
        clearScheduleCache();

        const holidayPayload = { id: deterministicHolidayId, userId: currentUser.uid, date: cleanDate };
        await safeWrite(
          async () => {
            const b = writeBatch(db);
            b.set(doc(db, COLLECTION.ATTENDANCE_HOLIDAYS, deterministicHolidayId), holidayPayload, { merge: true });
            await b.commit();
          },
          COLLECTION.ATTENDANCE_HOLIDAYS,
          'set',
          holidayPayload,
          deterministicHolidayId
        ).catch(handleSyncError);

        const dayOfWeekNum = new Date(cleanDate + 'T00:00:00').getDay();
        const dayKey = dayOfWeekNum.toString();

        // Revert counters for pre-existing attended/missed logs for this date
        const existingLogsForDate = currentLogs.filter(l => (l.date || '').slice(0, 10) === cleanDate && !l.isExtra);
        const subjectDeltas: Record<string, { classesAttended: number; classesTotal: number; labsAttended: number; labsTotal: number }> = {};

        for (const l of existingLogsForDate) {
          if (!l.subjectId || l.action === 'cancelled') continue;
          if (!subjectDeltas[l.subjectId]) {
            subjectDeltas[l.subjectId] = { classesAttended: 0, classesTotal: 0, labsAttended: 0, labsTotal: 0 };
          }
          const isLab = l.type === 'lab';
          if (l.action === 'attended') {
            if (isLab) {
              subjectDeltas[l.subjectId].labsAttended -= 1;
              subjectDeltas[l.subjectId].labsTotal -= 1;
            } else {
              subjectDeltas[l.subjectId].classesAttended -= 1;
              subjectDeltas[l.subjectId].classesTotal -= 1;
            }
          } else if (l.action === 'missed') {
            if (isLab) {
              subjectDeltas[l.subjectId].labsTotal -= 1;
            } else {
              subjectDeltas[l.subjectId].classesTotal -= 1;
            }
          }
        }

        for (const [subId, deltas] of Object.entries(subjectDeltas)) {
          const sub = currentSubjects.find(s => s.id === subId);
          if (!sub) continue;
          const updatedSubject = {
            classesAttended: Math.max(0, (sub.classesAttended || 0) + deltas.classesAttended),
            classesTotal: Math.max(0, (sub.classesTotal || 0) + deltas.classesTotal),
            labsAttended: Math.max(0, (sub.labsAttended || 0) + deltas.labsAttended),
            labsTotal: Math.max(0, (sub.labsTotal || 0) + deltas.labsTotal),
            lastUpdated: Date.now(),
          };
          optimisticUpdateAttendance(subId, updatedSubject);
          safeWrite(
            async () => {
              const b = writeBatch(db);
              b.set(doc(db, COLLECTION.ATTENDANCE, subId), updatedSubject, { merge: true });
              await b.commit();
            },
            COLLECTION.ATTENDANCE,
            'update',
            updatedSubject,
            subId
          ).catch(handleSyncError);
        }

        currentSubjects.forEach(subject => {
          const sch =
            subject.schedule?.[dayKey] ||
            subject.schedule?.[dayOfWeekNum as any] ||
            subject.schedule?.[DAY_NAMES[dayOfWeekNum]] ||
            subject.schedule?.[DAY_NAMES[dayOfWeekNum].toLowerCase()];
          if (!sch) return;

          const subLogs   = (currentLogsBySubjectId[subject.id!] || []).filter((l: any) => (l.date || '').slice(0, 10) === cleanDate && !l.isExtra);
          const classLogs = subLogs.filter((l: any) => l.type === 'class' || !l.type);
          const labLogs   = subLogs.filter((l: any) => l.type === 'lab');
          const classCount = sch.classes?.length || sch.classCount || 0;
          const labCount   = sch.labs?.length   || sch.labCount   || 0;

          const createCancelLog = (type: 'class' | 'lab', idx: number) => {
            const logId = getScheduledAttendanceLogDocId(currentUser.uid, subject.id!, cleanDate, type, idx);
            const newLog = {
              id: logId,
              userId: currentUser.uid,
              subjectId: subject.id,
              subjectName: subject.name,
              type,
              action: 'cancelled' as const,
              date: cleanDate,
              isExtra: false,
              timestamp: Date.now(),
              idx,
            };
            optimisticAddAttendanceLog(newLog);
            safeWrite(
              async () => {
                const b = writeBatch(db);
                b.set(doc(db, COLLECTION.ATTENDANCE_LOGS, logId), newLog, { merge: true });
                await b.commit();
              },
              COLLECTION.ATTENDANCE_LOGS,
              'set',
              newLog,
              logId
            ).catch(handleSyncError);
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

        clearScheduleCache();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      const nowStr = formatLocalDateStr(new Date());
      if (cleanDate === nowStr) {
        InteractionManager.runAfterInteractions(async () => {
          try {
            const academicCache = await readAcademicCache();
            const coreCache = await readCoreCacheMulti();
            const cachedWidget = await getCachedWidgetData();
            const existingHolidays = (academicCache.holidays || []).map(h => typeof h === 'string' ? h.trim().slice(0, 10) : (h as any)?.date?.trim()?.slice(0, 10)).filter(Boolean);
            const updatedHolidays = !isSelectedHoliday
              ? [...new Set([...existingHolidays, cleanDate])]
              : existingHolidays.filter(h => h !== cleanDate);

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
    } catch (err) {
      console.error(err);
    }
  }, [optimisticToggleHoliday, optimisticAddAttendanceLog, optimisticRemoveAttendanceLog]);

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
        optimisticClearAttendanceLogs?.(id);

        safeWrite(
          async () => {
            const b = writeBatch(db);
            b.delete(doc(db, COLLECTION.ATTENDANCE, id));
            await b.commit();
          },
          COLLECTION.ATTENDANCE,
          'delete',
          null,
          id
        ).catch(handleSyncError);

        const subjectLogs = currentLogs.filter(l => l.subjectId === id || l.subjectName === name);
        for (let i = 0; i < subjectLogs.length; i += 400) {
          const chunk = subjectLogs.slice(i, i + 400);
          safeWrite(
            async () => {
              const b = writeBatch(db);
              chunk.forEach(l => {
                if (l.id) b.delete(doc(db, COLLECTION.ATTENDANCE_LOGS, l.id));
              });
              await b.commit();
            },
            COLLECTION.ATTENDANCE_LOGS,
            'delete',
            null,
            chunk[0]?.id || id
          ).catch(handleSyncError);
        }

        setConfirmConfig((p: any) => ({ ...p, visible: false }));
      },
    });
  }, [optimisticDeleteSubject, optimisticClearAttendanceLogs, setConfirmConfig]);

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
          const zeroUpdate = {
            classesAttended: 0,
            classesTotal: 0,
            labsAttended: 0,
            labsTotal: 0,
            lastUpdated: Date.now(),
          };
          optimisticClearAttendanceLogs?.();
          currentSubjects.forEach(s => {
            if (!s.id) return;
            optimisticUpdateAttendance(s.id, zeroUpdate);
          });

          for (let i = 0; i < currentSubjects.length; i += 400) {
            const chunk = currentSubjects.slice(i, i + 400);
            safeWrite(
              async () => {
                const b = writeBatch(db);
                chunk.forEach(s => {
                  if (s.id) b.set(doc(db, COLLECTION.ATTENDANCE, s.id), zeroUpdate, { merge: true });
                });
                await b.commit();
              },
              COLLECTION.ATTENDANCE,
              'update',
              zeroUpdate,
              chunk[0]?.id || 'reset_subjects'
            ).catch(handleSyncError);
          }

          const currentLogs = logsRef.current;
          for (let i = 0; i < currentLogs.length; i += 400) {
            const chunk = currentLogs.slice(i, i + 400);
            safeWrite(
              async () => {
                const b = writeBatch(db);
                chunk.forEach(l => {
                  if (l.id) b.delete(doc(db, COLLECTION.ATTENDANCE_LOGS, l.id));
                });
                await b.commit();
              },
              COLLECTION.ATTENDANCE_LOGS,
              'delete',
              null,
              chunk[0]?.id || 'reset_logs'
            ).catch(handleSyncError);
          }

          setConfirmConfig((p: any) => ({ ...p, visible: false }));
        } catch (err) {
          console.error(err);
        }
      },
    });
  }, [setConfirmConfig, optimisticUpdateAttendance, optimisticClearAttendanceLogs]);

  return useMemo(() => ({
    handleLog,
    handleUndo,
    handleToggleHoliday,
    handleDeleteSubject,
    handleResetSemester,
  }), [handleLog, handleUndo, handleToggleHoliday, handleDeleteSubject, handleResetSemester]);
}
