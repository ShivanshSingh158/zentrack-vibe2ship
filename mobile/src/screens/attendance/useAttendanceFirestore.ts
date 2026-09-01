/**
 * useAttendanceFirestore.ts
 * All Firestore write handlers for the Attendance module:
 * handleLog, handleUndo, handleToggleHoliday, handleDeleteSubject,
 * handleApplyOverride, handleResetSemester.
 */
import { Alert } from 'react-native';
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
}

export function useAttendanceFirestore({
  user, subjects, logs, selectedDate,
  logsBySubjectId, overrideCounts,
  setOverrideOpen, setConfirmConfig,
  optimisticUpdateAttendance, optimisticAddAttendanceLog, optimisticUpdateAttendanceLog, optimisticRemoveAttendanceLog,
  optimisticDeleteSubject,
}: FirestoreActionsParams) {

  // ── Core log action ────────────────────────────────────────────────────────
  const handleLog = async (
    subjectInput: AttendanceSubject,
    type: 'class' | 'lab',
    action: 'attended' | 'missed' | 'cancelled',
    existingLogId?: string,
    sessionIdx: number = 0,
    logDate = selectedDate,
    isExtra = false,
  ) => {
    if (!user || (!subjectInput.id && !subjectInput.name)) return;
    // Always get the freshest subject state from the domain context
    const subject = subjects.find(s => (subjectInput.id && s.id === subjectInput.id) || s.name === subjectInput.name) || subjectInput;
    const attendedKey = type === 'class' ? 'classesAttended' : 'labsAttended';
    const totalKey    = type === 'class' ? 'classesTotal'    : 'labsTotal';
    const cleanLogDate = (logDate || selectedDate || '').slice(0, 10);

    // Deterministic unique ID for scheduled non-extra sessions
    const deterministicId = !isExtra && subject.id && user?.uid
      ? getScheduledAttendanceLogDocId(user.uid, subject.id, cleanLogDate, type, sessionIdx)
      : undefined;

    // Check if we are updating an existing log — first try explicit ID, then deterministic ID, then memory match
    const existingLog = existingLogId
      ? logs.find(l => l.id === existingLogId)
      : (deterministicId ? logs.find(l => l.id === deterministicId) : null) ||
        logs.find(l =>
          (l.subjectId === subject.id || l.subjectId === subject.name || l.subjectName === subject.name) &&
          (type === 'lab' ? l.type === 'lab' : (l.type === 'class' || !l.type)) &&
          (l.date || '').slice(0, 10) === cleanLogDate &&
          (!isExtra ? !l.isExtra : l.isExtra) &&
          // Exact session slot match
          (l.idx === sessionIdx || (l.idx === undefined && sessionIdx === 0))
        );

    // Find any duplicate/stale logs for this exact same slot to clean them up simultaneously
    const duplicateLogsToDelete = !isExtra
      ? logs.filter(l =>
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

    const subjectUpdates = { [attendedKey]: newAttended, [totalKey]: newTotal };

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

      const oldPct         = (subject.classesTotal || 0) + (subject.labsTotal || 0) === 0
        ? 100
        : (((subject.classesAttended || 0) + (subject.labsAttended || 0)) / ((subject.classesTotal || 0) + (subject.labsTotal || 0))) * 100;
      const combinedAtt    = (subject.classesAttended || 0) + (subject.labsAttended || 0) + (action === 'attended' ? 1 : 0);
      const combinedTot    = (subject.classesTotal    || 0) + (subject.labsTotal    || 0) + (action === 'cancelled' ? 0 : 1);
      const newPct         = combinedTot === 0 ? 100 : (combinedAtt / combinedTot) * 100;

      const targetPct = subject.targetPercentage || 75;
      if (oldPct >= targetPct && newPct < targetPct && action !== 'cancelled') {
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
  };

  // ── Undo last log ──────────────────────────────────────────────────────────
  const handleUndo = async (logId: string) => {
    if (!user) return;
    const logToUndo = logs.find(l => l.id === logId);
    if (!logToUndo) return;
    const subject = subjects.find(s => s.id === logToUndo.subjectId || s.name === logToUndo.subjectName || s.name === logToUndo.subjectId);
    if (!subject) { Alert.alert('Error', 'Subject deleted.'); return; }

    const type        = logToUndo.type || 'class';
    const attendedKey = type === 'class' ? 'classesAttended' : 'labsAttended';
    const totalKey    = type === 'class' ? 'classesTotal'    : 'labsTotal';
    const newAttended = Math.max(0, (subject[attendedKey as keyof AttendanceSubject] as number || 0) - (logToUndo.action === 'attended' ? 1 : 0));
    const newTotal    = Math.max(0, (subject[totalKey    as keyof AttendanceSubject] as number || 0) - (logToUndo.action === 'cancelled' ? 0 : 1));
    const subjectUpdates = { [attendedKey]: newAttended, [totalKey]: newTotal };

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
    } catch (err) { Alert.alert('Error', 'Failed to undo attendance log'); }
  };

  // ── Holiday toggle ─────────────────────────────────────────────────────────
  const handleToggleHoliday = async (isSelectedHoliday: boolean) => {
    if (!user) return;
    try {
      if (isSelectedHoliday) {
        const q = query(
          collection(db, COLLECTION.ATTENDANCE_HOLIDAYS),
          where('userId', '==', user.uid),
          where('date', '==', selectedDate),
        );
        const snap  = await getDocs(q);
        const batch = writeBatch(db);
        snap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
      } else {
        const batch = writeBatch(db);
        const holidayDocRef = doc(collection(db, COLLECTION.ATTENDANCE_HOLIDAYS));
        batch.set(holidayDocRef, { userId: user.uid, date: selectedDate });

        const dayKey = new Date(selectedDate + 'T00:00:00').getDay().toString();

        subjects.forEach(subject => {
          const sch =
            subject.schedule?.[dayKey] ||
            subject.schedule?.[Number(dayKey) as any] ||
            subject.schedule?.[DAY_NAMES[new Date(selectedDate + 'T00:00:00').getDay()]] ||
            subject.schedule?.[DAY_NAMES[new Date(selectedDate + 'T00:00:00').getDay()].toLowerCase()];
          if (!sch) return;

          const subLogs  = (logsBySubjectId[subject.id!] || []).filter((l: any) => l.date === selectedDate && !l.isExtra);
          const classLogs = subLogs.filter((l: any) => l.type === 'class' || !l.type);
          const labLogs   = subLogs.filter((l: any) => l.type === 'lab');
          const classCount = sch.classes?.length || sch.classCount || 0;
          const labCount   = sch.labs?.length   || sch.labCount   || 0;

          const createCancelLog = (type: 'class' | 'lab', idx: number) => {
            const logId = getScheduledAttendanceLogDocId(user.uid, subject.id!, selectedDate, type, idx);
            const logRef = doc(db, COLLECTION.ATTENDANCE_LOGS, logId);
            const newLog = {
              id: logId,
              userId: user.uid,
              subjectId: subject.id,
              subjectName: subject.name,
              type,
              action: 'cancelled',
              date: selectedDate,
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
    } catch (err) { console.error(err); }
  };

  // ── Delete subject ─────────────────────────────────────────────────────────
  const handleDeleteSubject = (id: string, name: string) => {
    if (!user) return;
    setConfirmConfig({
      visible: true,
      title: 'Delete Subject',
      message: `Are you sure you want to delete ${name}?`,
      confirmText: 'Delete',
      danger: true,
      onConfirm: async () => {
        optimisticDeleteSubject?.(id);
        const subjectLogs = logs.filter(l => l.subjectId === id);
        const batch       = writeBatch(db);
        subjectLogs.forEach(l => batch.delete(doc(db, COLLECTION.ATTENDANCE_LOGS, l.id)));
        batch.delete(doc(db, COLLECTION.ATTENDANCE, id));
        batch.commit().catch(e => console.log('Delete issue:', e));
        setConfirmConfig((p: any) => ({ ...p, visible: false }));
      },
    });
  };

  const handleApplyOverride = async (subId: string) => {
    await safeWrite(
      () => updateDoc(doc(db, COLLECTION.ATTENDANCE, subId), overrideCounts),
      COLLECTION.ATTENDANCE,
      'update',
      overrideCounts,
      subId
    );
    setOverrideOpen(null);
  };



  // ── Reset semester ─────────────────────────────────────────────────────────
  const handleResetSemester = () => {
    if (!user) return;
    setConfirmConfig({
      visible: true,
      title: 'Reset Semester',
      message: 'This will permanently delete ALL attendance logs and reset all subject counts to 0. This CANNOT be undone.',
      confirmText: 'Reset Everything',
      danger: true,
      onConfirm: async () => {
        try {
          const batch    = writeBatch(db);
          const logsSnap = await getDocs(query(
            collection(db, COLLECTION.ATTENDANCE_LOGS),
            where('userId', '==', user.uid),
          ));
          logsSnap.docs.forEach(d => batch.delete(d.ref));
          subjects.forEach(s => {
            batch.update(doc(db, COLLECTION.ATTENDANCE, s.id!), { classesAttended: 0, classesTotal: 0, labsAttended: 0, labsTotal: 0 });
          });
          batch.commit().catch(handleSyncError);
          setConfirmConfig((p: any) => ({ ...p, visible: false }));
        } catch (err) { console.error(err); }
      },
    });
  };

  return { handleLog, handleUndo, handleToggleHoliday, handleDeleteSubject, handleApplyOverride, handleResetSemester };
}
