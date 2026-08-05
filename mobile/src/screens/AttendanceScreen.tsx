/**
 * AttendanceScreen — ZenTrack Mobile
 * Full Schedule-Aware Tracker port of the web AttendanceModule.
 */

import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ScrollView,
  Alert, Modal, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator, Animated
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, writeBatch, limit as firestoreLimit, getDocs } from 'firebase/firestore';
import { formatDateWithDay, formatDateShort, formatDateNumeric } from '../utils/dateUtils';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { db } from '../services/firebase';
import { useMobileData, AttendanceSubject } from '../contexts/MobileDataContext';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS, SHADOW } from '../theme/tokens';
import { calculateBunkMath } from '../utils/academicMath';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Notifications from 'expo-notifications';
import { AddSubjectModal } from '../components/Academic/AddSubjectModal';
import { TimetableModal } from '../components/Academic/TimetableModal';
import ClassNotifSettingsModal from '../components/Academic/ClassNotifSettingsModal';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { callProxy, parseProxyResponse } from '../services/geminiProxy';
import { COLLECTION } from '../config/constants';
import { useTheme } from "../contexts/ThemeContext";
import { useSaraSurface } from '../hooks/useSaraSurface';
import SaraHUDBanner from '../components/SARA/SaraHUDBanner';
import { handleSyncError } from '../utils/errorUtils';


Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// ─── Constants & Helpers ────────────────────────────────────────────────────
const SCHEMA_VERSION = 1;
const defaultSchedule = {
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

function getLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function formatDisplayDate(dateStr: string) {
  if (!dateStr) return '';
  return formatDateWithDay(dateStr);
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
const calculateStatus = (attended: number, total: number, target: number) => {
  attended = attended || 0; total = total || 0; target = target || 75;
  if (total === 0) return { pct: null, safe: true, bunkInfo: 'No classes yet', urgency: 'safe' };
  
  const pct = (attended / total) * 100;
  const safe = pct >= target;
  
  const bunkResult = calculateBunkMath(attended, total, target);
  
  let urgency = 'safe';
  let bunkInfo = '';
  
  if (bunkResult.status === 'safe') {
    urgency = (pct >= target - 5 && pct < target) ? 'warning' : 'safe';
    bunkInfo = `✓ ${bunkResult.message.replace('You can safely bunk', 'Can miss').replace(' and stay above ' + target + '%', '')}`;
  } else if (bunkResult.status === 'warning') {
    urgency = 'warning';
    bunkInfo = '⚠️ On the edge — 0 misses left';
  } else {
    urgency = 'danger';
    bunkInfo = `⚠️ Must attend next ${bunkResult.count} classes`;
  }
  
  return { pct, safe, bunkInfo, urgency };
};
const getProgressColor = (urgency: string) => urgency === 'danger' ? '#ef4444' : urgency === 'warning' ? '#f59e0b' : '#10b981';

/**
 * Converts a time string (12h or 24h) to total minutes from midnight for sorting.
 * Handles: "10:00 AM", "2:00 PM", "10:00", "14:00", "9:00 AM"
 */
function parseTimeToMinutes(timeStr: string | undefined): number {
  if (!timeStr) return 0;
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

// ─── Component ──────────────────────────────────────────────────────────────
export default function AttendanceScreen() {
    const { colors, isDark } = useTheme();
    const styles = makeStyles(colors);
  const { user, attendance: subjects } = useMobileData();

  // Cap 5: PSI surface injection for at-risk subjects
  const psiCtx = React.useMemo(() => ({ attendance: subjects as any[] }), [subjects]);
  const { surfaceMessage, surfaceActionLabel, dismissBanner } = useSaraSurface('AttendanceScreen', psiCtx as any, user?.uid);

  const [logs, setLogs] = useState<any[]>([]);
  const [holidays, setHolidays] = useState<string[]>([]);
  
  const [selectedDate, setSelectedDate] = useState<string>(getLocalDateString(new Date()));
  const [showDatePicker, setShowDatePicker] = useState(false);
  
  // Modals
  const [isTimetableOpen, setIsTimetableOpen] = useState(false);
  const [showClassNotifModal, setShowClassNotifModal] = useState(false);
  const [selectedHistorySubject, setSelectedHistorySubject] = useState<AttendanceSubject | null>(null);
  const [isExtraOpen, setIsExtraOpen] = useState(false);
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [editSubject, setEditSubject] = useState<AttendanceSubject | null>(null);
  
  const [extraSubjectId, setExtraSubjectId] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  
  const [dismissedWarnings, setDismissedWarnings] = useState<Set<string>>(new Set());
  const [overrideOpen, setOverrideOpen] = useState<string | null>(null);
  const [overrideCounts, setOverrideCounts] = useState({ classesAttended: 0, classesTotal: 0, labsAttended: 0, labsTotal: 0 });
  const [confirmConfig, setConfirmConfig] = useState<{ visible: boolean, title: string, message: string, onConfirm: () => void, confirmText?: string, danger?: boolean }>({ visible: false, title: '', message: '', onConfirm: () => {} });

  // ── Schema Migration ──
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

  // ── Load Logs & Holidays ──
  useEffect(() => {
    if (!user) return;
    const qLogs = query(collection(db, COLLECTION.ATTENDANCE_LOGS), where('userId', '==', user.uid), firestoreLimit(300));
    const unsubLogs = onSnapshot(qLogs, (snap) => {
      const allLogs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      allLogs.sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0));
      setLogs(allLogs);
    });
    
    const qHol = query(collection(db, COLLECTION.ATTENDANCE_HOLIDAYS), where('userId', '==', user.uid));
    const unsubHol = onSnapshot(qHol, (snap) => {
      setHolidays(snap.docs.map(d => (d.data() as any).date));
    });
    
    return () => { unsubLogs(); unsubHol(); };
  }, [user]);

  // ── Derived Data ──
  const logsBySubjectId = useMemo(() => {
    const map: Record<string, any[]> = {};
    for (const log of logs) {
      if (!map[log.subjectId]) map[log.subjectId] = [];
      map[log.subjectId].push(log);
    }
    return map;
  }, [logs]);

  const selectedDayOfWeek = new Date(selectedDate + 'T00:00:00').getDay().toString();
  const isSelectedHoliday = holidays.includes(selectedDate);
  const today = getLocalDateString(new Date());
  const weekDates = useMemo(() => getWeekDates(selectedDate), [selectedDate]);

  const todayScheduledSubjects = useMemo(() => {
    const filtered = subjects.filter(s => {
      const sch = s.schedule?.[selectedDayOfWeek] || s.schedule?.[Number(selectedDayOfWeek)] || s.schedule?.[DAY_NAMES[new Date(selectedDate + 'T00:00:00').getDay()]] || s.schedule?.[DAY_NAMES[new Date(selectedDate + 'T00:00:00').getDay()].toLowerCase()];
      return sch && (
        (sch.classes && sch.classes.length > 0) || 
        (sch.labs && sch.labs.length > 0) ||
        sch.classCount > 0 || 
        sch.labCount > 0
      );
    });
    // Sort subjects by their earliest class/lab time for the selected day
    return filtered.sort((a, b) => {
      const schA = a.schedule?.[selectedDayOfWeek] || a.schedule?.[Number(selectedDayOfWeek)] || a.schedule?.[DAY_NAMES[new Date(selectedDate + 'T00:00:00').getDay()]] || a.schedule?.[DAY_NAMES[new Date(selectedDate + 'T00:00:00').getDay()].toLowerCase()];
      const schB = b.schedule?.[selectedDayOfWeek] || b.schedule?.[Number(selectedDayOfWeek)] || b.schedule?.[DAY_NAMES[new Date(selectedDate + 'T00:00:00').getDay()]] || b.schedule?.[DAY_NAMES[new Date(selectedDate + 'T00:00:00').getDay()].toLowerCase()];
      const getEarliestTime = (sch: any): number => {
        const times: number[] = [];
        if (sch?.classes && Array.isArray(sch.classes)) {
          sch.classes.forEach((c: any) => c.time && times.push(parseTimeToMinutes(c.time)));
        }
        if (sch?.labs && Array.isArray(sch.labs)) {
          sch.labs.forEach((l: any) => l.time && times.push(parseTimeToMinutes(l.time)));
        }
        return times.length > 0 ? Math.min(...times) : 9999;
      };
      return getEarliestTime(schA) - getEarliestTime(schB);
    });
  }, [subjects, selectedDayOfWeek, selectedDate]);

  const warningSubjects = useMemo(() => 
    subjects.filter(s => {
      const totalAtt = (s.classesAttended || 0) + (s.labsAttended || 0);
      const totalCls = (s.classesTotal || 0) + (s.labsTotal || 0);
      // Don't warn until at least 10 combined classes+labs are logged
      // (percentage is unreliable with fewer data points)
      if (totalCls < 10) return false;
      return (totalAtt / totalCls) * 100 < (s.targetPercentage || 75);
    }).filter(s => !dismissedWarnings.has(s.id!)),
    [subjects, dismissedWarnings]
  );


  /**
   * Flatten ALL sessions (classes + labs) across ALL subjects for the selected day
   * into one globally time-sorted list. This ensures 10 AM always appears before
   * 12 PM and 2 PM, regardless of which subject they belong to.
   */
  const todayFlatSessions = useMemo(() => {
    if (isSelectedHoliday) return [];
    const sessions: Array<{
      id: string;
      subject: AttendanceSubject;
      type: 'class' | 'lab';
      idx: number;
      timeMins: number;
      timeStr: string;
    }> = [];

    todayScheduledSubjects.forEach(subject => {
      const sch =
        subject.schedule?.[selectedDayOfWeek] ||
        subject.schedule?.[Number(selectedDayOfWeek) as any] ||
        subject.schedule?.[DAY_NAMES[new Date(selectedDate + 'T00:00:00').getDay()]] ||
        subject.schedule?.[DAY_NAMES[new Date(selectedDate + 'T00:00:00').getDay()].toLowerCase()] ||
        { classCount: 0, labCount: 0, classes: [], labs: [] };

      const classCount = sch.classes?.length || sch.classCount || 0;
      const labCount = sch.labs?.length || sch.labCount || 0;

      for (let i = 0; i < classCount; i++) {
        const session = sch.classes?.[i];
        const timeStr = session?.time
          ? [session.time, session.room].filter(Boolean).join(' • ')
          : `Class #${i + 1}`;
        sessions.push({
          id: `${subject.id!}-class-${i}`,
          subject,
          type: 'class',
          idx: i,
          timeMins: parseTimeToMinutes(session?.time),
          timeStr,
        });
      }

      for (let i = 0; i < labCount; i++) {
        const session = sch.labs?.[i];
        const timeStr = session?.time
          ? [session.time, session.room].filter(Boolean).join(' • ')
          : `Lab #${i + 1}`;
        sessions.push({
          id: `${subject.id!}-lab-${i}`,
          subject,
          type: 'lab',
          idx: i,
          timeMins: parseTimeToMinutes(session?.time),
          timeStr,
        });
      }
    });

    return sessions.sort((a, b) => a.timeMins - b.timeMins);
  }, [todayScheduledSubjects, selectedDayOfWeek, selectedDate, isSelectedHoliday]);

  const globalAttended = subjects.reduce((s, x) => s + (x.classesAttended || 0) + (x.labsAttended || 0), 0);
  const globalTotal = subjects.reduce((s, x) => s + (x.classesTotal || 0) + (x.labsTotal || 0), 0);
  const globalPct = globalTotal === 0 ? null : (globalAttended / globalTotal) * 100;
  const globalSafe = globalPct !== null ? globalPct >= 75 : true;

  // ── Actions ──
  const handleAddSubject = () => {
    setEditSubject(null);
    setShowAddModal(true);
  };

  const handleImportTimetable = async () => {
    if (!user) return;
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.8,
        base64: true,
      });

      if (!result.canceled && result.assets[0].base64) {
        setIsImporting(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        
        const prompt = `Extract the class timetable from this image.
Return ONLY a valid JSON array of objects, with NO markdown formatting, NO backticks, NO explanations.
Format:
[
  {
    "name": "Subject Name",
    "targetPercentage": 75,
    "schedule": {
      "1": { "classCount": 1, "labCount": 0, "classes": [{"time": "9:00 AM"}], "labs": [] },
      "2": { "classCount": 0, "labCount": 1, "classes": [], "labs": [{"time": "2:00 PM"}] }
    }
  }
]
Note: schedule keys are 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat.
Guess or summarize subject names logically if they are codes.`;

        const response = await callProxy({
          model: 'gemini-2.5-flash',
          contents: [{
            role: 'user',
            parts: [
              { inlineData: { mimeType: 'image/jpeg', data: result.assets[0].base64 } },
              { text: prompt }
            ]
          }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 8192, responseMimeType: 'application/json' }
        });

        const { text } = parseProxyResponse(response);
        if (!text) throw new Error("Could not parse schedule JSON.");
        
        const parsedSubjects = JSON.parse(text);
        if (!Array.isArray(parsedSubjects) || parsedSubjects.length === 0) throw new Error("No subjects found.");

        const batch = writeBatch(db);
        parsedSubjects.forEach((sub: any) => {
          const docRef = doc(collection(db, COLLECTION.ATTENDANCE));
          batch.set(docRef, {
            ...sub,
            userId: user.uid,
            classesAttended: 0,
            classesTotal: 0,
            labsAttended: 0,
            labsTotal: 0,
            schemaVersion: SCHEMA_VERSION,
          });
        });
        
        await batch.commit();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert("Success", `Imported ${parsedSubjects.length} subjects from timetable.`);
      }
    } catch (e: any) {
      console.warn("Import failed:", e.message);
      Alert.alert("Import Failed", e.message || "Could not read the timetable.");
    } finally {
      setIsImporting(false);
    }
  };

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
        const batch = writeBatch(db);
        subjectLogs.forEach(l => batch.delete(doc(db, COLLECTION.ATTENDANCE_LOGS, l.id)));
        batch.delete(doc(db, COLLECTION.ATTENDANCE, id));
        batch.commit().catch(e => console.log('Delete issue:', e));
        setConfirmConfig(p => ({ ...p, visible: false }));
      }
    });
  };

  const handleToggleHoliday = async () => {
    if (!user) return;
    try {
      if (isSelectedHoliday) {
        // Remove holiday marker
        const q = query(collection(db, COLLECTION.ATTENDANCE_HOLIDAYS), where('userId', '==', user.uid), where('date', '==', selectedDate));
        const snap = await getDocs(q);
        const batch = writeBatch(db);
        snap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
      } else {
        // Mark as holiday AND auto-cancel all unlogged scheduled sessions for the day
        await addDoc(collection(db, COLLECTION.ATTENDANCE_HOLIDAYS), { userId: user.uid, date: selectedDate });

        // Auto-cancel every unlogged session scheduled today
        const dayKey = new Date(selectedDate + 'T00:00:00').getDay().toString();
        const cancelPromises: Promise<any>[] = [];

        subjects.forEach(subject => {
          const sch =
            subject.schedule?.[dayKey] ||
            subject.schedule?.[Number(dayKey) as any] ||
            subject.schedule?.[DAY_NAMES[new Date(selectedDate + 'T00:00:00').getDay()]] ||
            subject.schedule?.[DAY_NAMES[new Date(selectedDate + 'T00:00:00').getDay()].toLowerCase()];
          if (!sch) return;

          const subLogs = (logsBySubjectId[subject.id!] || []).filter((l: any) => l.date === selectedDate && !l.isExtra);
          const classLogs = subLogs.filter((l: any) => l.type === 'class' || !l.type);
          const labLogs = subLogs.filter((l: any) => l.type === 'lab');

          const classCount = sch.classes?.length || sch.classCount || 0;
          const labCount = sch.labs?.length || sch.labCount || 0;

          for (let i = 0; i < classCount; i++) {
            if (!classLogs[i]) {
              cancelPromises.push(handleLog(subject, 'class', 'cancelled', selectedDate));
            }
          }
          for (let i = 0; i < labCount; i++) {
            if (!labLogs[i]) {
              cancelPromises.push(handleLog(subject, 'lab', 'cancelled', selectedDate));
            }
          }
        });

        await Promise.all(cancelPromises);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (err) { console.error(err); }
  };

  const handleLog = async (subject: AttendanceSubject, type: 'class'|'lab', action: 'attended'|'missed'|'cancelled', logDate = selectedDate, isExtra = false) => {
    if (!user || !subject.id) return;
    const attendedKey = type === 'class' ? 'classesAttended' : 'labsAttended';
    const totalKey = type === 'class' ? 'classesTotal' : 'labsTotal';
    const newAttended = (subject[attendedKey as keyof AttendanceSubject] as number || 0) + (action === 'attended' ? 1 : 0);
    const newTotal = (subject[totalKey as keyof AttendanceSubject] as number || 0) + (action === 'cancelled' ? 0 : 1);
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, COLLECTION.ATTENDANCE, subject.id), { [attendedKey]: newAttended, [totalKey]: newTotal });
      const logRef = doc(collection(db, COLLECTION.ATTENDANCE_LOGS));
      batch.set(logRef, {
        userId: user.uid, subjectId: subject.id, subjectName: subject.name,
        type, action, date: logDate, isExtra, timestamp: Date.now(),
      });
      batch.commit().catch(handleSyncError);

      const oldPct = (subject.classesTotal || 0) + (subject.labsTotal || 0) === 0 ? 100 : (((subject.classesAttended || 0) + (subject.labsAttended || 0)) / ((subject.classesTotal || 0) + (subject.labsTotal || 0))) * 100;
      const combinedAttended = (subject.classesAttended || 0) + (subject.labsAttended || 0) + (action === 'attended' ? 1 : 0);
      const combinedTotal = (subject.classesTotal || 0) + (subject.labsTotal || 0) + 1;
      const newPct = (combinedAttended / combinedTotal) * 100;
      
      if (oldPct >= (subject.targetPercentage || 75) && newPct < (subject.targetPercentage || 75)) {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Attendance Alert! ⚠️',
            body: `${subject.name} has dropped to ${newPct.toFixed(1)}% (below your ${subject.targetPercentage}% target).`,
            sound: true,
          },
          trigger: null,
        });
      }

    } catch (err) { Alert.alert('Error', 'Failed to log attendance'); }
  };

  const handleUndo = async (logId: string) => {
    if (!user) return;
    const logToUndo = logs.find(l => l.id === logId);
    if (!logToUndo) return;
    const subject = subjects.find(s => s.id === logToUndo.subjectId);
    if (!subject) { Alert.alert('Error', 'Subject deleted.'); return; }
    
    const type = logToUndo.type || 'class';
    const attendedKey = type === 'class' ? 'classesAttended' : 'labsAttended';
    const totalKey = type === 'class' ? 'classesTotal' : 'labsTotal';
    const newAttended = Math.max(0, (subject[attendedKey as keyof AttendanceSubject] as number || 0) - (logToUndo.action === 'attended' ? 1 : 0));
    const newTotal = Math.max(0, (subject[totalKey as keyof AttendanceSubject] as number || 0) - (logToUndo.action === 'cancelled' ? 0 : 1));
    
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, COLLECTION.ATTENDANCE, subject.id!), { [attendedKey]: newAttended, [totalKey]: newTotal });
      batch.delete(doc(db, COLLECTION.ATTENDANCE_LOGS, logId));
      batch.commit().catch(handleSyncError);
    } catch (err) { Alert.alert('Error', 'Undo failed'); }
  };

  const handleApplyOverride = async (subId: string) => {
    try {
      await updateDoc(doc(db, COLLECTION.ATTENDANCE, subId), overrideCounts);
      setOverrideOpen(null);
    } catch (err) { console.error(err); }
  };

  const handleExportCSV = async () => {
    try {
      // 1. Collect all unique dates from logs + holidays
      const allDatesSet = new Set<string>();
      logs.forEach((l: any) => allDatesSet.add(l.date));
      holidays.forEach((d: string) => allDatesSet.add(d));
      const allDates = Array.from(allDatesSet).sort();

      if (allDates.length === 0 && subjects.length === 0) {
        Alert.alert('Nothing to export', 'No attendance data found yet.');
        return;
      }

      // 2. Index logs: key = date__subjectId__type -> action
      const logIndex: Record<string, string> = {};
      logs.forEach((l: any) => {
        const type = l.type === 'lab' ? 'lab' : 'class';
        const key = `${l.date}__${l.subjectId}__${type}`;
        logIndex[key] = l.action;
      });

      // 3. Cell value helper
      const cellValue = (date: string, subjectId: string, type: 'class' | 'lab'): string => {
        if (holidays.includes(date)) return 'Hol';
        const action = logIndex[`${date}__${subjectId}__${type}`];
        if (!action) return '-';
        if (action === 'attended')  return 'P';
        if (action === 'missed')    return 'A';
        if (action === 'cancelled') return 'Can';
        return action.charAt(0).toUpperCase();
      };

      // 4. Check if subject has labs
      const hasLab = (subj: any): boolean =>
        Object.values(subj.schedule ?? {}).some(
          (sch: any) => (sch?.labs?.length > 0) || (sch?.labCount > 0)
        );

      // 5. Build column definitions
      interface Col { subjectId: string; subjectName: string; type: 'class' | 'lab'; }
      const cols: Col[] = [];
      subjects.forEach((s: any) => {
        cols.push({ subjectId: s.id, subjectName: s.name, type: 'class' });
        if (hasLab(s)) cols.push({ subjectId: s.id, subjectName: s.name, type: 'lab' });
      });

      // 6. Build CSV
      const esc = (v: string) => v.includes(',') ? `"${v}"` : v;
      const rows: string[] = [];
      const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const exportDate = formatDateNumeric(new Date().toISOString().slice(0, 10));

      rows.push(`ZenTrack Attendance Report,Generated: ${exportDate}`);
      rows.push('');
      // Subject name header row
      rows.push(['Date', ...cols.map(c => esc(c.subjectName))].join(','));
      // Class/Lab sub-header row
      rows.push(['', ...cols.map(c => c.type === 'lab' ? 'LAB' : 'CLASS')].join(','));
      rows.push('');

      // Data rows: one per date
      allDates.forEach(date => {
        const [y, mo, dy] = date.split('-');
        const prettyDate = `${dy}-${monthNames[parseInt(mo,10)-1]}-${y}`;
        const cells = cols.map(c => cellValue(date, c.subjectId, c.type));
        rows.push([prettyDate, ...cells].join(','));
      });

      rows.push('');
      rows.push('--- SUMMARY ---');
      subjects.forEach((s: any) => {
        const classAtt = s.classesAttended || 0;
        const classTot = s.classesTotal || 0;
        const labAtt   = s.labsAttended  || 0;
        const labTot   = s.labsTotal     || 0;
        const totalAtt = classAtt + labAtt;
        const totalTot = classTot + labTot;
        const pct = totalTot > 0 ? ((totalAtt / totalTot) * 100).toFixed(1) : '--';
        rows.push(`${esc(s.name)},Classes: ${classAtt}/${classTot},Labs: ${labAtt}/${labTot},Combined: ${totalAtt}/${totalTot},${pct}%`);
      });

      rows.push('');
      rows.push('Legend: P = Present | A = Absent | Can = Cancelled | Hol = Holiday | - = No class');

      const csvContent = rows.join('\n');

      // 7. Write & share
      const filename = `ZenTrack_Attendance_${new Date().toISOString().split('T')[0]}.csv`;
      const fs = FileSystem as any;
      const fileUri = `${fs.cacheDirectory}${filename}`;
      await fs.writeAsStringAsync(fileUri, csvContent, { encoding: fs.EncodingType.UTF8 });

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'text/csv',
          dialogTitle: 'Export Attendance Report',
          UTI: 'public.comma-separated-values-text',
        });
      } else {
        Alert.alert('Error', 'Sharing is not available on this device');
      }
    } catch (err) {
      console.error('[ExportCSV]', err);
      Alert.alert('Error', 'Failed to export attendance data');
    }
  };

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
          const batch = writeBatch(db);
          const logsSnap = await getDocs(query(collection(db, COLLECTION.ATTENDANCE_LOGS), where('userId', '==', user.uid)));
          logsSnap.docs.forEach(d => batch.delete(d.ref));
          subjects.forEach(s => {
            batch.update(doc(db, COLLECTION.ATTENDANCE, s.id!), { classesAttended: 0, classesTotal: 0, labsAttended: 0, labsTotal: 0 });
          });
          batch.commit().catch(handleSyncError);
          setConfirmConfig(p => ({ ...p, visible: false }));
        } catch (err) { console.error(err); }
      }
    });
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {/* Cap 5: PSI surface banner for at-risk subjects */}
      <SaraHUDBanner
        message={surfaceMessage || ''}
        visible={!!surfaceMessage}
        onDismiss={dismissBanner}
        actionLabel={surfaceActionLabel || undefined}
      />
      {/* ── Header Actions ── */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 16 }}>
        <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 26, color: colors.textPrimary }}>Attendance</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TouchableOpacity onPress={() => setShowDatePicker(true)} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center' }}>
            <Ionicons name="calendar-outline" size={16} color={colors.textMuted} />
          </TouchableOpacity>
          {/* Holiday Toggle — fixed icon button, amber when active */}
          <TouchableOpacity
            onPress={handleToggleHoliday}
            style={{
              width: 36, height: 36, borderRadius: 18,
              backgroundColor: isSelectedHoliday ? 'rgba(251,191,36,0.18)' : colors.surface,
              borderWidth: isSelectedHoliday ? 1.5 : 0,
              borderColor: isSelectedHoliday ? '#fbbf24' : 'transparent',
              justifyContent: 'center', alignItems: 'center',
            }}
          >
            <Text style={{ fontSize: 15 }}>🌴</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setShowClassNotifModal(true)} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center' }}>
            <Ionicons name="notifications-outline" size={16} color={colors.accentPrimary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setIsTimetableOpen(true)} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center' }}>
            <Ionicons name="settings-outline" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      </View>
      
      {showDatePicker && (
        <DateTimePicker
          value={new Date(selectedDate + 'T00:00:00')}
          mode="date"
          display="default"
          onChange={(e, date) => {
            setShowDatePicker(false);
            if (date) setSelectedDate(getLocalDateString(date));
          }}
        />
      )}

      <View style={{ flex: 1 }}>
      <FlatList
        data={isSelectedHoliday ? [] : todayFlatSessions}
        keyExtractor={item => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: 120 }}
        ListHeaderComponent={
          <>
            {/* ── Semester Overview ── */}
            <View style={{ paddingHorizontal: 8, marginBottom: 8 }}>
              <View style={{ backgroundColor: colors.surface, borderRadius: 20, padding: 16 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text style={{ fontSize: 13, color: colors.textMuted }}>Semester overview</Text>
                  <Text style={{ fontSize: 12, color: colors.textTertiary }}>{globalAttended}/{globalTotal} classes</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                  <Text style={{ fontSize: 32, fontWeight: '700', color: globalPct !== null ? (globalPct >= 75 ? colors.priorityLow : (globalPct >= 70 ? colors.priorityMed : colors.priorityHigh)) : colors.textMuted }}>
                    {globalPct !== null ? `${Math.round(globalPct)}%` : '--%'}
                  </Text>
                  <View style={{ flex: 1, height: 6, backgroundColor: colors.border, borderRadius: 3, overflow: 'hidden' }}>
                    <View style={{ height: '100%', borderRadius: 3, width: `${Math.min(100, globalPct || 0)}%`, backgroundColor: globalPct !== null ? (globalPct >= 75 ? colors.priorityLow : (globalPct >= 70 ? colors.priorityMed : colors.priorityHigh)) : colors.border }} />
                  </View>
                </View>
              </View>
            </View>

            {/* ── Warnings ── */}
            {warningSubjects.length > 0 && (
              <View style={styles.warningBanner}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="warning" size={16} color="#f59e0b" />
                    <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 12, color: '#fca5a5' }}>Low Attendance</Text>
                  </View>
                  <TouchableOpacity onPress={() => setDismissedWarnings(new Set(warningSubjects.map(s => s.id!)))}>
                    <Ionicons name="close" size={16} color="rgba(255,255,255,0.5)" />
                  </TouchableOpacity>
                </View>
                <View style={{ marginTop: 4, gap: 4 }}>
                  {warningSubjects.map(s => {
                    const att = (s.classesAttended || 0) + (s.labsAttended || 0);
                    const tot = (s.classesTotal || 0) + (s.labsTotal || 0);
                    const pct = tot > 0 ? Math.round((att/tot)*100) : 0;
                    const need = Math.ceil((s.targetPercentage * tot - 100 * att) / (100 - s.targetPercentage));
                    return (
                      <Text key={s.id} style={{ fontSize: 11, color: '#fca5a5' }}>
                        • <Text style={{ fontWeight: 'bold' }}>{s.name}</Text>: {pct}% — attend {need} more to recover
                      </Text>
                    )
                  })}
                </View>
              </View>
            )}

            {/* ── Week Strip ── */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 8, marginBottom: 18 }}>
              {weekDates.map((date, i) => {
                const isHol = holidays.includes(date);
                const isSel = date === selectedDate;
                return (
                  <TouchableOpacity key={date} onPress={() => setSelectedDate(date)} style={[{ alignItems: 'center', paddingVertical: 4, paddingHorizontal: 8 }, isSel && { backgroundColor: colors.accentPrimary, borderRadius: 10 }]}>
                    <Text style={{ fontSize: 11, color: isSel ? '#000000' : colors.textTertiary, marginBottom: 2, fontWeight: isSel ? '600' : '400' }}>{DAY_SHORT[i]}</Text>
                    <Text style={{ fontSize: 13, color: isSel ? '#000000' : colors.textTertiary, fontWeight: isSel ? '600' : '400' }}>{isHol ? '🌴' : date.split('-')[2]}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* ── Daily Schedule ── */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 8, marginBottom: 8 }}>
              <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 11, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1 }}>Today's Classes</Text>
              <TouchableOpacity onPress={() => setIsExtraOpen(true)}>
                <Ionicons name="add" size={20} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
          </>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="calendar-clear-outline" size={48} color={colors.textMuted} />
            <Text style={styles.emptyText}>{isSelectedHoliday ? "It's a Holiday! 🌴" : "No classes scheduled!"}</Text>
            {subjects.length === 0 && (
              <TouchableOpacity onPress={() => setIsTimetableOpen(true)} style={{ marginTop: SPACE.lg, backgroundColor: colors.accentPrimary, paddingHorizontal: SPACE.xl, paddingVertical: SPACE.sm, borderRadius: RADIUS.full, flexDirection: 'row', alignItems: 'center', gap: SPACE.xs }}>
                <Ionicons name="settings-outline" size={16} color="#000" />
                <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.md, color: '#000' }}>Setup Timetable</Text>
              </TouchableOpacity>
            )}
          </View>
        }
        renderItem={({ item: session }) => {
          const { subject, type, idx } = session;
          const subLogs = logsBySubjectId[subject.id!] || [];
          const sessionLogs = subLogs.filter((l: any) =>
            l.date === selectedDate && !l.isExtra &&
            (type === 'lab' ? l.type === 'lab' : (l.type === 'class' || !l.type))
          ).sort((a: any, b: any) => (a.timestamp || 0) - (b.timestamp || 0));
          const log = sessionLogs[idx];
          const isLab = type === 'lab';

          return (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.surface }}>
              {/* Left: subject name + time + type badge */}
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '500' }}>{subject.name}</Text>
                {/* Time + inline badge */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 }}>
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>{session.timeStr}</Text>
                  <View style={{
                    paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4,
                    backgroundColor: isLab ? 'rgba(250,215,161,0.15)' : 'rgba(137,220,235,0.12)',
                  }}>
                    <Text style={{
                      fontSize: 8, fontWeight: '700', letterSpacing: 0.4,
                      color: isLab ? '#FAD7A1' : '#89dceb',
                    }}>{isLab ? 'LAB' : 'CLASS'}</Text>
                  </View>
                </View>
              </View>

              {/* Right: action buttons */}
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {log ? (
                  <TouchableOpacity
                    onPress={() => handleUndo(log.id)}
                    style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#2c2c2e' }}
                  >
                    <Text style={{
                      color: log.action === 'attended' ? colors.priorityLow : (log.action === 'cancelled' ? colors.textMuted : colors.error),
                      fontSize: 12, fontWeight: '600'
                    }}>
                      {log.action === 'attended' ? 'Present' : log.action === 'cancelled' ? 'Cancelled' : 'Absent'} ↩
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <>
                    <TouchableOpacity
                      style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#2c2c2e' }}
                      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); handleLog(subject, type, 'attended'); }}
                    >
                      <Text style={{ color: colors.priorityLow, fontSize: 12, fontWeight: '600' }}>Present</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#2c2c2e' }}
                      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); handleLog(subject, type, 'missed'); }}
                    >
                      <Text style={{ color: colors.error, fontSize: 12, fontWeight: '600' }}>Absent</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: '#2c2c2e', alignItems: 'center', justifyContent: 'center' }}
                      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); handleLog(subject, type, 'cancelled'); }}
                    >
                      <Ionicons name="close" size={18} color={colors.textMuted} />
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </View>
          );
        }}
        ListFooterComponent={
          todayScheduledSubjects.length > 0 && !isSelectedHoliday ? (
            <View style={{ marginTop: 24, marginBottom: 56 }}>
              <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 11, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>By Subject</Text>
              {todayScheduledSubjects.map(subject => {
                const hasLabs = (subject.labsTotal || 0) > 0 || (subject.labsAttended || 0) > 0;
                const hasClasses = (subject.classesTotal || 0) > 0 || (subject.classesAttended || 0) > 0;

                // Class-only stats
                const classStatus = calculateStatus(
                  subject.classesAttended || 0,
                  subject.classesTotal || 0,
                  subject.targetPercentage
                );
                // Lab-only stats
                const labStatus = calculateStatus(
                  subject.labsAttended || 0,
                  subject.labsTotal || 0,
                  subject.targetPercentage
                );
                // Combined (for bunk math and overall)
                const totalAtt = (subject.classesAttended || 0) + (subject.labsAttended || 0);
                const totalCls = (subject.classesTotal || 0) + (subject.labsTotal || 0);
                const combinedStatus = calculateStatus(totalAtt, totalCls, subject.targetPercentage);
                const pColor = getProgressColor(combinedStatus.urgency);

                return (
                  <View key={subject.id}>
                    <TouchableOpacity onPress={() => setSelectedHistorySubject(subject)} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.border }}>
                      {/* Left: name + bunk info */}
                      <View style={{ flex: 1, paddingRight: 8 }}>
                        <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '500' }}>{subject.name}</Text>
                        {/* Separate class/lab attendance rows if both exist */}
                        {hasLabs ? (
                          <View style={{ marginTop: 6, gap: 4 }}>
                            {hasClasses && (
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <View style={{ backgroundColor: 'rgba(165,153,255,0.12)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                                  <Text style={{ color: colors.accentPrimary, fontSize: 11, fontWeight: '600' }}>Class</Text>
                                </View>
                                <Text style={{ color: classStatus.pct !== null ? getProgressColor(classStatus.urgency) : colors.textMuted, fontSize: 12, fontWeight: '600' }}>
                                  {classStatus.pct !== null ? `${Math.round(classStatus.pct)}%` : '--%'}
                                </Text>
                                <Text style={{ color: colors.textTertiary, fontSize: 11 }}>
                                  {subject.classesAttended || 0}/{subject.classesTotal || 0}
                                </Text>
                              </View>
                            )}
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                              <View style={{ backgroundColor: 'rgba(250,215,161,0.15)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                                <Text style={{ color: '#FAD7A1', fontSize: 11, fontWeight: '600' }}>Lab</Text>
                              </View>
                              <Text style={{ color: labStatus.pct !== null ? getProgressColor(labStatus.urgency) : colors.textMuted, fontSize: 12, fontWeight: '600' }}>
                                {labStatus.pct !== null ? `${Math.round(labStatus.pct)}%` : '--%'}
                              </Text>
                              <Text style={{ color: colors.textTertiary, fontSize: 11 }}>
                                {subject.labsAttended || 0}/{subject.labsTotal || 0}
                              </Text>
                            </View>
                          </View>
                        ) : (
                          // No labs — show bunk budget pill
                          (() => {
                            const bunk = calculateBunkMath(
                              subject.classesAttended || 0,
                              subject.classesTotal || 0,
                              subject.targetPercentage || 75
                            );
                            const budgetColor = bunk.status === 'safe' && bunk.count > 0
                              ? '#34C759'
                              : bunk.status === 'warning'
                              ? '#f59e0b'
                              : '#ef4444';
                            const budgetBg = bunk.status === 'safe' && bunk.count > 0
                              ? 'rgba(52,199,89,0.12)'
                              : bunk.status === 'warning'
                              ? 'rgba(245,158,11,0.12)'
                              : 'rgba(239,68,68,0.12)';
                            const budgetLabel = bunk.status === 'safe' && bunk.count > 0
                              ? `✓ Can miss ${bunk.count} more`
                              : bunk.status === 'warning'
                              ? `⚠ 0 misses left`
                              : `↑ Attend ${bunk.count} to recover`;
                            return (
                              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 5, gap: 6 }}>
                                <View style={{ backgroundColor: budgetBg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 }}>
                                  <Text style={{ color: budgetColor, fontSize: 11, fontWeight: '600', letterSpacing: 0.2 }}>{budgetLabel}</Text>
                                </View>
                              </View>
                            );
                          })()
                        )}
                      </View>
                      {/* Right: combined percentage */}
                      <Text style={{ color: pColor, fontSize: 16, fontWeight: '600', marginTop: hasLabs ? 2 : 0 }}>
                        {combinedStatus.pct !== null ? `${Math.round(combinedStatus.pct)}%` : '--%'}
                      </Text>
                    </TouchableOpacity>

                    {/* Inline recovery hint — no formula, no box */}
                    {(() => {
                      const pct = totalCls > 0 ? (totalAtt / totalCls) * 100 : 100;
                      const target = subject.targetPercentage || 75;
                      if (pct < target) {
                        const needed = Math.ceil(((target / 100) * totalCls - totalAtt) / (1 - (target / 100)));
                        return (
                          <Text style={{ color: '#ef4444', fontSize: 11, marginTop: 6, marginBottom: 4, fontFamily: FONT_FAMILY.medium }}>
                            Attend {needed} more {needed === 1 ? 'class' : 'classes'} to reach {target}%
                          </Text>
                        );
                      }
                      return null;
                    })()}
                  </View>
                );

              })}
            </View>
          ) : null
        }
      />
      </View>

      {/* ── Modals ── */}

      {/* Timetable Modal */}
      {/* Timetable Modal */}
      <TimetableModal
        visible={isTimetableOpen}
        onClose={() => setIsTimetableOpen(false)}
        subjects={subjects}
        isImporting={isImporting}
        handleImportTimetable={handleImportTimetable}
        handleAddSubject={handleAddSubject}
        setEditSubject={setEditSubject}
        setShowAddModal={setShowAddModal}
        handleDeleteSubject={handleDeleteSubject}
        handleExportCSV={handleExportCSV}
        handleResetSemester={handleResetSemester}
      />

      {/* History Modal */}
      <Modal visible={!!selectedHistorySubject} animationType="slide">
        <SafeAreaView style={styles.modalRoot}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{selectedHistorySubject?.name} History</Text>
            <TouchableOpacity style={styles.modalHeaderBtn} onPress={() => setSelectedHistorySubject(null)}><Ionicons name="close" size={20} color="#fff" /></TouchableOpacity>
          </View>
          <FlatList
            data={selectedHistorySubject ? logs.filter(l => l.subjectId === selectedHistorySubject.id) : []}
            keyExtractor={l => l.id}
            contentContainerStyle={{ padding: SPACE.md }}
            renderItem={({ item: l }) => (
              <View style={styles.historyCard}>
                <View>
                  <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 14, color: l.action === 'attended' ? '#10b981' : '#ef4444' }}>
                    {l.action === 'attended' ? '✓ Attended' : '✗ Missed'} <Text style={{ color: colors.textPrimary }}>{l.isExtra ? '(Extra) ' : ''}{l.type||'class'}</Text>
                  </Text>
                  <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 4 }}>{formatDisplayDate(l.date)} • {new Date(l.timestamp).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}</Text>
                </View>
                <TouchableOpacity onPress={() => handleUndo(l.id)} style={styles.undoBtn}><Ionicons name="refresh" size={14} color={colors.textPrimary}/></TouchableOpacity>
              </View>
            )}
            ListEmptyComponent={
              <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: SPACE.xl }}>No logs found for this subject.</Text>
            }
          />
        </SafeAreaView>
      </Modal>

      {/* Extra Class Modal */}
      <Modal visible={isExtraOpen} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.overlayBg} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.sheet}>
            {/* Handle bar */}
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.12)', alignSelf: 'center', marginBottom: 20 }} />

            <Text style={styles.sheetTitle}>Log Extra Class</Text>

            {/* Subject selector — vertical full-width pills */}
            <ScrollView style={{ maxHeight: 180, marginBottom: 20 }} showsVerticalScrollIndicator={false}>
              {subjects.map(s => (
                <TouchableOpacity
                  key={s.id}
                  onPress={() => setExtraSubjectId(s.id!)}
                  style={[
                    styles.subjectSelectRow,
                    extraSubjectId === s.id && styles.subjectSelectRowActive,
                  ]}
                >
                  <View style={[styles.subjectSelectDot, extraSubjectId === s.id && { backgroundColor: '#a599ff' }]} />
                  <Text style={[styles.subjectSelectText, extraSubjectId === s.id && { color: '#ffffff' }]}>{s.name}</Text>
                  {extraSubjectId === s.id && <Ionicons name="checkmark" size={14} color="#a599ff" />}
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Action rows — CLASS and LAB */}
            {(['class', 'lab'] as const).map(type => (
              <View key={type} style={styles.extraTypeRow}>
                <Text style={styles.extraTypeLabel}>{type === 'class' ? 'Class' : 'Lab'}</Text>
                <View style={styles.extraTypeActions}>
                  <TouchableOpacity
                    style={[styles.extraActionBtn, styles.extraActionAttended, !extraSubjectId && { opacity: 0.3 }]}
                    disabled={!extraSubjectId}
                    onPress={() => { handleLog(subjects.find(s => s.id === extraSubjectId)!, type, 'attended', selectedDate, true); setIsExtraOpen(false); }}
                  >
                    <Ionicons name="checkmark" size={15} color="#5eda9e" />
                    <Text style={styles.extraActionAttendedText}>Attended</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.extraActionBtn, styles.extraActionMissed, !extraSubjectId && { opacity: 0.3 }]}
                    disabled={!extraSubjectId}
                    onPress={() => { handleLog(subjects.find(s => s.id === extraSubjectId)!, type, 'missed', selectedDate, true); setIsExtraOpen(false); }}
                  >
                    <Ionicons name="close" size={15} color="#ff6961" />
                    <Text style={styles.extraActionMissedText}>Missed</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}

            <TouchableOpacity style={styles.extraCancelBtn} onPress={() => setIsExtraOpen(false)}>
              <Text style={styles.extraCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Custom Confirm Modal */}
      <Modal visible={confirmConfig.visible} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center', padding: SPACE.xl }}>
          <View style={{ backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: SPACE.xl, width: '100%', maxWidth: 400 }}>
            <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 18, color: colors.textPrimary, marginBottom: 8 }}>{confirmConfig.title}</Text>
            <Text style={{ fontSize: 14, color: colors.textMuted, marginBottom: 24, lineHeight: 20 }}>{confirmConfig.message}</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12 }}>
              <TouchableOpacity onPress={() => setConfirmConfig(p => ({ ...p, visible: false }))} style={{ paddingHorizontal: 16, paddingVertical: 10 }}>
                <Text style={{ fontFamily: FONT_FAMILY.bold, color: colors.textMuted }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmConfig.onConfirm} style={{ paddingHorizontal: 16, paddingVertical: 10, backgroundColor: confirmConfig.danger ? '#ef4444' : colors.accentPrimary, borderRadius: 8 }}>
                <Text style={{ fontFamily: FONT_FAMILY.bold, color: confirmConfig.danger ? '#fff' : '#000' }}>{confirmConfig.confirmText || 'Confirm'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      {/* Add Subject Modal */}
      <AddSubjectModal 
        visible={showAddModal} 
        onClose={() => setShowAddModal(false)} 
        existingSubject={editSubject} 
      />

      {/* Class Notification Preferences Modal */}
      <ClassNotifSettingsModal
        visible={showClassNotifModal}
        onClose={() => setShowClassNotifModal(false)}
      />

    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const makeStyles = (colors: any) => StyleSheet.create({
      root: { flex: 1, backgroundColor: colors.background },
      header: { flexDirection: 'row', justifyContent: 'flex-end', padding: SPACE.md, gap: SPACE.sm, borderBottomWidth: 1, borderColor: colors.border },
      headerBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
      headerBtnText: { fontFamily: FONT_FAMILY.bold, fontSize: 12, color: colors.textPrimary },
      
      overviewCard: { marginHorizontal: 0, marginTop: 12, marginBottom: 12, padding: SPACE.lg, backgroundColor: 'rgba(16,185,129,0.05)', borderTopWidth: 1, borderBottomWidth: 1, borderColor: 'rgba(16,185,129,0.2)' },
      overviewTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 14, color: colors.textPrimary },
      overviewStats: { fontFamily: FONT_FAMILY.body, fontSize: 12, color: colors.textMuted },
      overviewPct: { fontFamily: FONT_FAMILY.title, fontSize: 32, fontWeight: 'bold' },
      progressBarBg: { flex: 1, height: 6, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden' },
      progressBarFill: { height: '100%', borderRadius: 3 },
      
      warningBanner: { marginHorizontal: 0, marginBottom: SPACE.sm, padding: SPACE.lg, backgroundColor: 'rgba(239,68,68,0.1)', borderTopWidth: 1, borderBottomWidth: 1, borderColor: 'rgba(239,68,68,0.3)' },
      
      weekStrip: { flexDirection: 'row', paddingHorizontal: 16, gap: 6, marginBottom: SPACE.md },
      weekPill: { flex: 1, paddingVertical: 8, borderRadius: 12, alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
      weekPillActive: { backgroundColor: colors.accentPrimary, borderColor: colors.accentPrimary },
      weekPillToday: { backgroundColor: 'rgba(255,255,255,0.1)', borderColor: 'rgba(255,255,255,0.4)' },
      weekPillDay: { fontSize: 10, color: colors.textMuted, marginBottom: 2, fontWeight: 'bold' },
      weekPillLabel: { fontSize: 12, color: colors.textPrimary, fontWeight: 'bold' },
      
      scheduleHeader: { paddingHorizontal: 16, marginBottom: SPACE.sm },
      scheduleTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 16, color: colors.textPrimary },
      
      list: { paddingHorizontal: 0, paddingBottom: 100 },
      emptyState: { alignItems: 'center', paddingVertical: 60, gap: 12, backgroundColor: 'rgba(16,185,129,0.05)', borderTopWidth: 1, borderBottomWidth: 1, borderColor: 'rgba(16,185,129,0.2)' },
      emptyText: { fontFamily: FONT_FAMILY.bold, fontSize: 16, color: colors.textMuted },
      
      subjectCard: { backgroundColor: colors.surface, borderBottomWidth: 1, borderColor: colors.border, marginBottom: 0, overflow: 'hidden' },
      subjectHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: SPACE.md, backgroundColor: 'rgba(0,0,0,0.1)', borderBottomWidth: 1, borderColor: colors.border },
      subjectName: { fontFamily: FONT_FAMILY.bold, fontSize: 15, color: colors.textPrimary },
      subjectTarget: { fontFamily: FONT_FAMILY.body, fontSize: 11, color: colors.textMuted },
      
      sessionSection: { flexDirection: 'row', padding: SPACE.md },
      sessionInfo: { flex: 1, paddingRight: SPACE.md },
      sessionLabel: { fontSize: 10, color: colors.textMuted, fontWeight: 'bold', marginBottom: 4 },
      sessionPct: { fontFamily: FONT_FAMILY.title, fontSize: 24, fontWeight: 'bold' },
      sessionCounts: { fontSize: 11, color: colors.textMuted },
      sessionUrgency: { fontSize: 10, marginTop: 4, fontWeight: 'bold' },
      sessionList: { flex: 2, gap: 6 },
      logRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.background, padding: 8, borderRadius: 8 },
      logLabel: { fontSize: 12, fontWeight: 'bold', color: colors.textPrimary },
      logStatus: { fontSize: 11, fontWeight: 'bold' },
      undoBtn: { padding: 4, backgroundColor: colors.surface2, borderRadius: 4 },
      actionBtn: { padding: 6, borderRadius: 6, borderWidth: 1, backgroundColor: 'rgba(255,255,255,0.05)' },
      inlineLogBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.full, borderWidth: 1, backgroundColor: 'rgba(255,255,255,0.02)' },

      // Modals
      modalRoot: { flex: 1, backgroundColor: colors.background },
      modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: SPACE.md, borderBottomWidth: 1, borderColor: colors.border },
      modalTitle: { fontFamily: FONT_FAMILY.title, fontSize: 18, color: colors.textPrimary },
      modalHeaderBtn: { padding: 4 },
      
      configCard: { backgroundColor: colors.surface, padding: SPACE.md, borderRadius: RADIUS.md, marginBottom: SPACE.sm, borderWidth: 1, borderColor: colors.border },
      configName: { fontFamily: FONT_FAMILY.bold, fontSize: 16, color: colors.accentPrimary },
      configInputName: { fontFamily: FONT_FAMILY.bold, fontSize: 16, color: colors.accentPrimary, padding: 0, flex: 1, borderBottomWidth: 1, borderColor: colors.border },
      configInputSmall: { width: 40, height: 24, backgroundColor: colors.background, borderRadius: 4, textAlign: 'center', color: colors.textPrimary, borderWidth: 1, borderColor: colors.border, padding: 0 },
      configInputGrid: { width: 28, height: 24, backgroundColor: colors.background, borderRadius: 4, textAlign: 'center', color: colors.textPrimary, borderWidth: 1, borderColor: colors.border, padding: 0 },
      
      historyCard: { backgroundColor: colors.surface, padding: SPACE.md, borderRadius: RADIUS.md, marginBottom: SPACE.sm, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
      
      overlayBg: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.3)' },
      sheet: { backgroundColor: colors.surface, padding: SPACE.xl, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl },
      sheetTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 16, color: colors.textPrimary, textAlign: 'center', marginBottom: SPACE.md },
      chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, marginRight: 8 },
      chipActive: { backgroundColor: colors.accentPrimary, borderColor: colors.accentPrimary },
      chipText: { fontSize: 12, color: colors.textPrimary },
      extraBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.05)' },

      // Extra Class Modal — redesigned
      subjectSelectRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 11,
        paddingHorizontal: 14,
        borderRadius: 12,
        marginBottom: 6,
        backgroundColor: 'rgba(255,255,255,0.04)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.06)',
      },
      subjectSelectRowActive: {
        backgroundColor: 'rgba(165,153,255,0.08)',
        borderColor: 'rgba(165,153,255,0.25)',
      },
      subjectSelectDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: 'rgba(255,255,255,0.2)',
      },
      subjectSelectText: {
        flex: 1,
        fontFamily: FONT_FAMILY.medium,
        fontSize: 14,
        color: '#8e8e93',
      },
      extraTypeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 10,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.06)',
      },
      extraTypeLabel: {
        fontFamily: FONT_FAMILY.bold,
        fontSize: 13,
        color: '#ffffff',
        letterSpacing: 0.3,
      },
      extraTypeActions: {
        flexDirection: 'row',
        gap: 8,
      },
      extraActionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingVertical: 7,
        paddingHorizontal: 14,
        borderRadius: 10,
        borderWidth: 1,
      },
      extraActionAttended: {
        backgroundColor: 'rgba(94,218,158,0.08)',
        borderColor: 'rgba(94,218,158,0.2)',
      },
      extraActionAttendedText: {
        fontFamily: FONT_FAMILY.bold,
        fontSize: 13,
        color: '#5eda9e',
      },
      extraActionMissed: {
        backgroundColor: 'rgba(255,105,97,0.08)',
        borderColor: 'rgba(255,105,97,0.2)',
      },
      extraActionMissedText: {
        fontFamily: FONT_FAMILY.bold,
        fontSize: 13,
        color: '#ff6961',
      },
      extraCancelBtn: {
        marginTop: 16,
        alignItems: 'center',
        paddingVertical: 12,
      },
      extraCancelText: {
        fontFamily: FONT_FAMILY.medium,
        fontSize: 14,
        color: '#636366',
      },
    });
