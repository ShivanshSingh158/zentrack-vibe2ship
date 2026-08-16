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
import { DAY_NAMES } from './attendanceConstants';

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
  optimisticRemoveAttendanceLog: (logId: string) => void;
}

export function useAttendanceFirestore({
  user, subjects, logs, selectedDate,
  logsBySubjectId, overrideCounts,
  setOverrideOpen, setConfirmConfig,
  optimisticUpdateAttendance, optimisticAddAttendanceLog, optimisticRemoveAttendanceLog,
}: FirestoreActionsParams) {

  // ── Core log action ────────────────────────────────────────────────────────
  const handleLog = async (
    subject: AttendanceSubject,
    type: 'class' | 'lab',
    action: 'attended' | 'missed' | 'cancelled',
    logDate = selectedDate,
    isExtra = false,
  ) => {
    if (!user || !subject.id) return;
    const attendedKey = type === 'class' ? 'classesAttended' : 'labsAttended';
    const totalKey    = type === 'class' ? 'classesTotal'    : 'labsTotal';
    const newAttended = (subject[attendedKey as keyof AttendanceSubject] as number || 0) + (action === 'attended' ? 1 : 0);
    const newTotal    = (subject[totalKey    as keyof AttendanceSubject] as number || 0) + (action === 'cancelled' ? 0 : 1);
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, COLLECTION.ATTENDANCE, subject.id), { [attendedKey]: newAttended, [totalKey]: newTotal });
      const logRef = doc(collection(db, COLLECTION.ATTENDANCE_LOGS));
      const newLog = {
        id: logRef.id,
        userId: user.uid, subjectId: subject.id, subjectName: subject.name,
        type, action, date: logDate, isExtra, timestamp: Date.now(),
      };
      
      // Optimistically update UI
      optimisticUpdateAttendance(subject.id, { [attendedKey]: newAttended, [totalKey]: newTotal });
      optimisticAddAttendanceLog(newLog);

      batch.set(logRef, newLog);
      batch.commit().catch(handleSyncError);

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
    const subject = subjects.find(s => s.id === logToUndo.subjectId);
    if (!subject) { Alert.alert('Error', 'Subject deleted.'); return; }

    const type        = logToUndo.type || 'class';
    const attendedKey = type === 'class' ? 'classesAttended' : 'labsAttended';
    const totalKey    = type === 'class' ? 'classesTotal'    : 'labsTotal';
    const newAttended = Math.max(0, (subject[attendedKey as keyof AttendanceSubject] as number || 0) - (logToUndo.action === 'attended' ? 1 : 0));
    const newTotal    = Math.max(0, (subject[totalKey    as keyof AttendanceSubject] as number || 0) - (logToUndo.action === 'cancelled' ? 0 : 1));

    try {
      const batch = writeBatch(db);
      batch.update(doc(db, COLLECTION.ATTENDANCE, subject.id), { [attendedKey]: newAttended, [totalKey]: newTotal });
      batch.delete(doc(db, COLLECTION.ATTENDANCE_LOGS, logId));
      
      // Optimistically update UI
      optimisticUpdateAttendance(subject.id, { [attendedKey]: newAttended, [totalKey]: newTotal });
      optimisticRemoveAttendanceLog(logId);

      batch.commit().catch(handleSyncError);
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

          const createCancelLog = (type: 'class' | 'lab') => {
            const logRef = doc(collection(db, COLLECTION.ATTENDANCE_LOGS));
            const newLog = {
              id: logRef.id,
              userId: user.uid,
              subjectId: subject.id,
              subjectName: subject.name,
              type,
              action: 'cancelled',
              date: selectedDate,
              isExtra: false,
              timestamp: Date.now(),
            };
            optimisticAddAttendanceLog(newLog);
            batch.set(logRef, newLog);
          };

          for (let i = 0; i < classCount; i++) {
            if (!classLogs[i]) createCancelLog('class');
          }
          for (let i = 0; i < labCount; i++) {
            if (!labLogs[i]) createCancelLog('lab');
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
        const subjectLogs = logs.filter(l => l.subjectId === id);
        const batch       = writeBatch(db);
        subjectLogs.forEach(l => batch.delete(doc(db, COLLECTION.ATTENDANCE_LOGS, l.id)));
        batch.delete(doc(db, COLLECTION.ATTENDANCE, id));
        batch.commit().catch(e => console.log('Delete issue:', e));
        setConfirmConfig((p: any) => ({ ...p, visible: false }));
      },
    });
  };

  // ── Manual override ────────────────────────────────────────────────────────
  const handleApplyOverride = async (subId: string) => {
    try {
      await updateDoc(doc(db, COLLECTION.ATTENDANCE, subId), overrideCounts);
      setOverrideOpen(null);
    } catch (err) { console.error(err); }
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
