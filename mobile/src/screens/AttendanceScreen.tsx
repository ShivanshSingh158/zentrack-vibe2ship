/**
 * AttendanceScreen — ZenTrack Mobile
 * Full Schedule-Aware Tracker port of the web AttendanceModule.
 */

import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ScrollView,
  Alert, Modal, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, writeBatch, limit as firestoreLimit, getDocs } from 'firebase/firestore';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { db } from '../services/firebase';
import { useMobileData, AttendanceSubject } from '../contexts/MobileDataContext';
import { COLORS, FONT_FAMILY, FONT_SIZE, SPACE, RADIUS, SHADOW } from '../theme/tokens';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Notifications from 'expo-notifications';
import { AddSubjectModal } from '../components/Academic/AddSubjectModal';
import * as Haptics from 'expo-haptics';

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
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
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
  const nearEdge = pct >= target - 5 && pct < target;
  let bunkInfo = '';
  let urgency = 'safe';
  if (safe) {
    const safeToMiss = Math.floor((attended * 100 / target) - total);
    if (safeToMiss > 0) {
      bunkInfo = `✓ Can miss ${safeToMiss} more classes`;
      urgency = nearEdge ? 'warning' : 'safe';
    } else {
      bunkInfo = '⚠️ On the edge — 0 misses left';
      urgency = 'warning';
    }
  } else {
    const needToAttend = Math.ceil((target * total - 100 * attended) / (100 - target));
    bunkInfo = `⚠️ Must attend next ${needToAttend} classes`;
    urgency = 'danger';
  }
  return { pct, safe, bunkInfo, urgency };
};
const getProgressColor = (urgency: string) => urgency === 'danger' ? '#ef4444' : urgency === 'warning' ? '#f59e0b' : '#10b981';

// ─── Component ──────────────────────────────────────────────────────────────
export default function AttendanceScreen() {
  const { user, attendance: subjects } = useMobileData();
  const [logs, setLogs] = useState<any[]>([]);
  const [holidays, setHolidays] = useState<string[]>([]);
  
  const [selectedDate, setSelectedDate] = useState<string>(getLocalDateString(new Date()));
  const [showDatePicker, setShowDatePicker] = useState(false);
  
  // Modals
  const [isTimetableOpen, setIsTimetableOpen] = useState(false);
  const [selectedHistorySubject, setSelectedHistorySubject] = useState<AttendanceSubject | null>(null);
  const [isExtraOpen, setIsExtraOpen] = useState(false);
  
  const [showAddModal, setShowAddModal] = useState(false);
  const [editSubject, setEditSubject] = useState<AttendanceSubject | null>(null);
  
  const [extraSubjectId, setExtraSubjectId] = useState('');
  
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
        batch.update(doc(db, 'attendance_subjects', sub.id), updates);
        needsCommit = true;
      }
    });
    if (needsCommit) batch.commit().catch(console.error);
  }, [user, subjects]);

  // ── Load Logs & Holidays ──
  useEffect(() => {
    if (!user) return;
    const qLogs = query(collection(db, 'attendance_logs'), where('userId', '==', user.uid), firestoreLimit(300));
    const unsubLogs = onSnapshot(qLogs, (snap) => {
      const allLogs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      allLogs.sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0));
      setLogs(allLogs);
    });
    
    const qHol = query(collection(db, 'attendance_holidays'), where('userId', '==', user.uid));
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

  const todayScheduledSubjects = useMemo(() => 
    subjects.filter(s => {
      const sch = s.schedule?.[selectedDayOfWeek] || s.schedule?.[Number(selectedDayOfWeek)] || s.schedule?.[DAY_NAMES[new Date(selectedDate + 'T00:00:00').getDay()]] || s.schedule?.[DAY_NAMES[new Date(selectedDate + 'T00:00:00').getDay()].toLowerCase()];
      return sch && (
        (sch.classes && sch.classes.length > 0) || 
        (sch.labs && sch.labs.length > 0) ||
        sch.classCount > 0 || 
        sch.labCount > 0
      );
    }), [subjects, selectedDayOfWeek]
  );

  const warningSubjects = useMemo(() => 
    subjects.filter(s => {
      const totalAtt = (s.classesAttended || 0) + (s.labsAttended || 0);
      const totalCls = (s.classesTotal || 0) + (s.labsTotal || 0);
      if (totalCls === 0) return false;
      return (totalAtt / totalCls) * 100 < (s.targetPercentage || 75);
    }).filter(s => !dismissedWarnings.has(s.id!)),
    [subjects, dismissedWarnings]
  );

  const globalAttended = subjects.reduce((s, x) => s + (x.classesAttended || 0) + (x.labsAttended || 0), 0);
  const globalTotal = subjects.reduce((s, x) => s + (x.classesTotal || 0) + (x.labsTotal || 0), 0);
  const globalPct = globalTotal === 0 ? null : (globalAttended / globalTotal) * 100;
  const globalSafe = globalPct !== null ? globalPct >= 75 : true;

  // ── Actions ──
  const handleAddSubject = () => {
    setEditSubject(null);
    setShowAddModal(true);
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
        subjectLogs.forEach(l => batch.delete(doc(db, 'attendance_logs', l.id)));
        batch.delete(doc(db, 'attendance_subjects', id));
        batch.commit().catch(e => console.log('Delete issue:', e));
        setConfirmConfig(p => ({ ...p, visible: false }));
      }
    });
  };

  const handleToggleHoliday = async () => {
    if (!user) return;
    try {
      if (isSelectedHoliday) {
        const q = query(collection(db, 'attendance_holidays'), where('userId', '==', user.uid), where('date', '==', selectedDate));
        // We still need to await getDocs to know what to delete, but it's fast
        const snap = await getDocs(q);
        const batch = writeBatch(db);
        snap.docs.forEach(d => batch.delete(d.ref));
        batch.commit().catch(console.error);
      } else {
        addDoc(collection(db, 'attendance_holidays'), { userId: user.uid, date: selectedDate }).catch(console.error);
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
      batch.update(doc(db, 'attendance_subjects', subject.id), { [attendedKey]: newAttended, [totalKey]: newTotal });
      const logRef = doc(collection(db, 'attendance_logs'));
      batch.set(logRef, {
        userId: user.uid, subjectId: subject.id, subjectName: subject.name,
        type, action, date: logDate, isExtra, timestamp: Date.now(),
      });
      batch.commit().catch(console.error);

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
      batch.update(doc(db, 'attendance_subjects', subject.id!), { [attendedKey]: newAttended, [totalKey]: newTotal });
      batch.delete(doc(db, 'attendance_logs', logId));
      batch.commit().catch(console.error);
    } catch (err) { Alert.alert('Error', 'Undo failed'); }
  };

  const handleApplyOverride = async (subId: string) => {
    try {
      await updateDoc(doc(db, 'attendance_subjects', subId), overrideCounts);
      setOverrideOpen(null);
    } catch (err) { console.error(err); }
  };

  const handleExportCSV = async () => {
    try {
      let csv = 'Date,Type,Subject,Action\n';
      logs.forEach(l => {
        csv += `${l.date},${l.type||'class'},${l.subjectName},${l.action}\n`;
      });
      const filename = `attendance_export_${new Date().toISOString().split('T')[0]}.csv`;
      const fs = FileSystem as any;
      const fileUri = `${fs.cacheDirectory}${filename}`;
      await fs.writeAsStringAsync(fileUri, csv, { encoding: fs.EncodingType.UTF8 });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri);
      } else {
        Alert.alert('Error', 'Sharing is not available on this device');
      }
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'Failed to export CSV');
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
          const logsSnap = await getDocs(query(collection(db, 'attendance_logs'), where('userId', '==', user.uid)));
          logsSnap.docs.forEach(d => batch.delete(d.ref));
          subjects.forEach(s => {
            batch.update(doc(db, 'attendance_subjects', s.id!), { classesAttended: 0, classesTotal: 0, labsAttended: 0, labsTotal: 0 });
          });
          batch.commit().catch(console.error);
          setConfirmConfig(p => ({ ...p, visible: false }));
        } catch (err) { console.error(err); }
      }
    });
  };

  return (
    <SafeAreaView style={styles.root}>
      {/* ── Header Actions ── */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 16 }}>
        <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 26, color: COLORS.textPrimary }}>Attendance</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TouchableOpacity onPress={() => setShowDatePicker(true)} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.surface, justifyContent: 'center', alignItems: 'center' }}>
            <Ionicons name="calendar-outline" size={16} color={COLORS.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setIsTimetableOpen(true)} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.surface, justifyContent: 'center', alignItems: 'center' }}>
            <Ionicons name="settings-outline" size={16} color={COLORS.textMuted} />
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

      {/* ── Semester Overview ── */}
      <View style={{ backgroundColor: COLORS.surface, borderRadius: 20, padding: 16, marginHorizontal: 8, marginBottom: 18 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <Text style={{ fontSize: 13, color: COLORS.textMuted }}>Semester overview</Text>
          <Text style={{ fontSize: 12, color: COLORS.textTertiary }}>{globalAttended}/{globalTotal} classes</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <Text style={{ fontSize: 32, fontWeight: '700', color: globalPct !== null ? (globalPct >= 75 ? COLORS.priorityLow : (globalPct >= 70 ? COLORS.priorityMed : COLORS.priorityHigh)) : COLORS.textMuted }}>
            {globalPct !== null ? `${Math.round(globalPct)}%` : '--%'}
          </Text>
          <View style={{ flex: 1, height: 6, backgroundColor: COLORS.border, borderRadius: 3, overflow: 'hidden' }}>
            <View style={{ height: '100%', borderRadius: 3, width: `${Math.min(100, globalPct || 0)}%`, backgroundColor: globalPct !== null ? (globalPct >= 75 ? COLORS.priorityLow : (globalPct >= 70 ? COLORS.priorityMed : COLORS.priorityHigh)) : COLORS.border }} />
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
            <TouchableOpacity key={date} onPress={() => setSelectedDate(date)} style={[{ alignItems: 'center', paddingVertical: 4, paddingHorizontal: 8 }, isSel && { backgroundColor: COLORS.accentPrimary, borderRadius: 10 }]}>
              <Text style={{ fontSize: 11, color: isSel ? '#000000' : COLORS.textTertiary, marginBottom: 2, fontWeight: isSel ? '600' : '400' }}>{DAY_SHORT[i]}</Text>
              <Text style={{ fontSize: 13, color: isSel ? '#000000' : COLORS.textTertiary, fontWeight: isSel ? '600' : '400' }}>{isHol ? '🌴' : date.split('-')[2]}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Daily Schedule ── */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, marginBottom: 8 }}>
        <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 11, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 1 }}>Today's Classes</Text>
        <TouchableOpacity onPress={() => setIsExtraOpen(true)}>
          <Ionicons name="add" size={20} color={COLORS.textPrimary} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={isSelectedHoliday ? [] : todayScheduledSubjects}
        keyExtractor={s => s.id!}
        contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: 100 }}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="calendar-clear-outline" size={48} color={COLORS.textMuted} />
            <Text style={styles.emptyText}>{isSelectedHoliday ? "It's a Holiday! 🌴" : "No classes scheduled!"}</Text>
            {subjects.length === 0 && (
              <TouchableOpacity onPress={() => setIsTimetableOpen(true)} style={{ marginTop: SPACE.lg, backgroundColor: COLORS.accentPrimary, paddingHorizontal: SPACE.xl, paddingVertical: SPACE.sm, borderRadius: RADIUS.full, flexDirection: 'row', alignItems: 'center', gap: SPACE.xs }}>
                <Ionicons name="settings-outline" size={16} color="#000" />
                <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.md, color: '#000' }}>Setup Timetable</Text>
              </TouchableOpacity>
            )}
          </View>
        }
        renderItem={({ item: subject }) => {
          const sch = subject.schedule?.[selectedDayOfWeek] || subject.schedule?.[Number(selectedDayOfWeek)] || subject.schedule?.[DAY_NAMES[new Date(selectedDate + 'T00:00:00').getDay()]] || subject.schedule?.[DAY_NAMES[new Date(selectedDate + 'T00:00:00').getDay()].toLowerCase()] || { classCount: 0, labCount: 0, classes: [], labs: [] };
          const subLogs = logsBySubjectId[subject.id!] || [];
          const classLogs = subLogs.filter(l => l.date === selectedDate && !l.isExtra && (l.type === 'class' || !l.type));
          const labLogs = subLogs.filter(l => l.date === selectedDate && !l.isExtra && l.type === 'lab');

          const renderSessionRow = (type: 'class' | 'lab', idx: number, log: any) => {
            const sessionsArray = type === 'class' ? sch.classes : sch.labs;
            const session = sessionsArray && sessionsArray[idx] ? sessionsArray[idx] : null;
            let timeStr = type === 'class' ? 'Class' : 'Lab';
            if ((sch.classCount || 0) + (sch.labCount || 0) > 1) timeStr += ` #${idx + 1}`;
            if (session && (session.time || session.room)) {
              timeStr = [session.time, session.room].filter(Boolean).join(', ');
            }

            return (
              <View key={`${type}-${idx}`} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: COLORS.surface }}>
                <View>
                  <Text style={{ color: COLORS.textPrimary, fontSize: 15, fontWeight: '500' }}>{subject.name}</Text>
                  <Text style={{ color: COLORS.textMuted, fontSize: 12, marginTop: 4 }}>{timeStr}</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  {log ? (
                    <TouchableOpacity onPress={() => handleUndo(log.id)} style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#2c2c2e' }}>
                      <Text style={{ color: log.action === 'attended' ? COLORS.priorityLow : (log.action === 'cancelled' ? COLORS.textMuted : COLORS.error), fontSize: 12, fontWeight: '600' }}>{log.action === 'attended' ? 'Present' : (log.action === 'cancelled' ? 'Cancelled' : 'Absent')} (Undo)</Text>
                    </TouchableOpacity>
                  ) : (
                    <>
                      <TouchableOpacity style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#2c2c2e' }} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); handleLog(subject, type, 'attended'); }}>
                        <Text style={{ color: COLORS.priorityLow, fontSize: 12, fontWeight: '600' }}>Present</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#2c2c2e' }} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); handleLog(subject, type, 'missed'); }}>
                        <Text style={{ color: COLORS.error, fontSize: 12, fontWeight: '600' }}>Absent</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: '#2c2c2e', alignItems: 'center', justifyContent: 'center' }} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); handleLog(subject, type, 'cancelled'); }}>
                        <Ionicons name="close" size={18} color={COLORS.textMuted} />
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              </View>
            );
          };

          return (
            <View>
              {Array.from({ length: sch.classes?.length || sch.classCount || 0 }).map((_, idx) => renderSessionRow('class', idx, classLogs[idx]))}
              {Array.from({ length: sch.labs?.length || sch.labCount || 0 }).map((_, idx) => renderSessionRow('lab', idx, labLogs[idx]))}
            </View>
          );
        }}
        ListFooterComponent={
          todayScheduledSubjects.length > 0 && !isSelectedHoliday ? (
            <View style={{ marginTop: 24, marginBottom: 56 }}>
              <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 11, color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>By Subject</Text>
              {todayScheduledSubjects.map(subject => {
                const totalAtt = (subject.classesAttended || 0) + (subject.labsAttended || 0);
                const totalCls = (subject.classesTotal || 0) + (subject.labsTotal || 0);
                const status = calculateStatus(totalAtt, totalCls, subject.targetPercentage);
                const pColor = getProgressColor(status.urgency);

                return (
                  <TouchableOpacity key={subject.id} onPress={() => setSelectedHistorySubject(subject)} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: COLORS.border }}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={{ color: COLORS.textPrimary, fontSize: 15, fontWeight: '500' }}>{subject.name}</Text>
                      <Text style={{ color: pColor, fontSize: 12, marginTop: 6 }}>{status.bunkInfo.replace('✓ ', '').replace('⚠️ ', '')}</Text>
                    </View>
                    <Text style={{ color: pColor, fontSize: 16, fontWeight: '600' }}>{status.pct !== null ? `${Math.round(status.pct)}%` : '--%'}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : null
        }
      />

      {/* ── Modals ── */}

      {/* Timetable Modal */}
      <Modal visible={isTimetableOpen} animationType="slide">
        <SafeAreaView style={styles.modalRoot}>
          <View style={{ padding: SPACE.xl, borderBottomWidth: 1, borderColor: COLORS.border }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flex: 1, paddingRight: SPACE.md }}>
                <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 20, color: COLORS.textPrimary }}>Timetable</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: SPACE.sm, alignItems: 'center' }}>
                <TouchableOpacity onPress={handleAddSubject} style={{ backgroundColor: COLORS.accentPrimary, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Ionicons name="add" size={16} color="#000" />
                  <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 14, color: '#000' }}>Add Subject</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setIsTimetableOpen(false)} style={{ padding: 8 }}>
                  <Ionicons name="close" size={24} color={COLORS.textMuted} />
                </TouchableOpacity>
              </View>
            </View>
          </View>
          
          <FlatList
            data={subjects}
            keyExtractor={s => s.id!}
            contentContainerStyle={{ padding: SPACE.md }}
            renderItem={({ item: s }) => (
              <View style={{ backgroundColor: COLORS.surface, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACE.lg, padding: SPACE.md }}>
                
                {/* Subject Name & Edit Row */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SPACE.md }}>
                  <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 16, color: COLORS.textPrimary }}>{s.name}</Text>
                  <View style={{ flexDirection: 'row', gap: SPACE.md }}>
                    <TouchableOpacity onPress={() => { setEditSubject(s); setShowAddModal(true); }}>
                      <Ionicons name="pencil" size={20} color={COLORS.textMuted} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDeleteSubject(s.id!, s.name)}>
                      <Ionicons name="trash" size={20} color={COLORS.error} />
                    </TouchableOpacity>
                  </View>
                </View>
                
                {/* Summary Info */}
                <Text style={{ color: COLORS.textMuted, fontSize: 13, marginBottom: SPACE.xs }}>
                  Target: <Text style={{ color: COLORS.textPrimary, fontWeight: 'bold' }}>{s.targetPercentage || 75}%</Text>
                </Text>
                <View style={{ flexDirection: 'row', gap: SPACE.lg }}>
                  <Text style={{ color: COLORS.textMuted, fontSize: 13 }}>
                    Classes: <Text style={{ color: COLORS.textPrimary }}>{s.classesAttended || 0}/{s.classesTotal || 0}</Text>
                  </Text>
                  <Text style={{ color: COLORS.textMuted, fontSize: 13 }}>
                    Labs: <Text style={{ color: COLORS.textPrimary }}>{s.labsAttended || 0}/{s.labsTotal || 0}</Text>
                  </Text>
                </View>
              </View>
            )}
            ListFooterComponent={
              subjects.length > 0 ? (
                <View style={{ flexDirection: 'row', gap: SPACE.md, marginTop: SPACE.sm, marginBottom: 40 }}>
                  <TouchableOpacity onPress={handleExportCSV} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16, backgroundColor: COLORS.surface, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border }}>
                    <Ionicons name="download-outline" size={18} color="#10b981" />
                    <Text style={{ color: '#10b981', fontFamily: FONT_FAMILY.bold, fontSize: 14 }}>Export CSV</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleResetSemester} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16, backgroundColor: COLORS.surface, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border }}>
                    <Ionicons name="refresh-outline" size={18} color="#ef4444" />
                    <Text style={{ color: '#ef4444', fontFamily: FONT_FAMILY.bold, fontSize: 14 }}>Reset Semester</Text>
                  </TouchableOpacity>
                </View>
              ) : null
            }
          />
        </SafeAreaView>
      </Modal>

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
                    {l.action === 'attended' ? '✓ Attended' : '✗ Missed'} <Text style={{ color: COLORS.textPrimary }}>{l.isExtra ? '(Extra) ' : ''}{l.type||'class'}</Text>
                  </Text>
                  <Text style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 4 }}>{formatDisplayDate(l.date)} • {new Date(l.timestamp).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}</Text>
                </View>
                <TouchableOpacity onPress={() => handleUndo(l.id)} style={styles.undoBtn}><Ionicons name="refresh" size={14} color={COLORS.textPrimary}/></TouchableOpacity>
              </View>
            )}
            ListEmptyComponent={
              <Text style={{ color: COLORS.textMuted, textAlign: 'center', marginTop: SPACE.xl }}>No logs found for this subject.</Text>
            }
          />
        </SafeAreaView>
      </Modal>

      {/* Extra Class Modal */}
      <Modal visible={isExtraOpen} transparent animationType="fade">
        <KeyboardAvoidingView style={styles.overlayBg} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Log Extra Class</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              {subjects.map(s => (
                <TouchableOpacity key={s.id} onPress={() => setExtraSubjectId(s.id!)} style={[styles.chip, extraSubjectId === s.id && styles.chipActive]}>
                  <Text style={[styles.chipText, extraSubjectId === s.id && { color: '#fff' }]}>{s.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: 12, justifyContent: 'center' }}>
              <View style={{ gap: 8 }}>
                <Text style={{ fontSize: 12, textAlign: 'center', color: COLORS.textMuted }}>CLASS</Text>
                <TouchableOpacity style={[styles.extraBtn, { borderColor: '#10b981' }]} disabled={!extraSubjectId} onPress={() => { handleLog(subjects.find(s=>s.id===extraSubjectId)!, 'class', 'attended', selectedDate, true); setIsExtraOpen(false); }}>
                  <Ionicons name="checkmark" size={20} color="#10b981" />
                </TouchableOpacity>
                <TouchableOpacity style={[styles.extraBtn, { borderColor: '#ef4444' }]} disabled={!extraSubjectId} onPress={() => { handleLog(subjects.find(s=>s.id===extraSubjectId)!, 'class', 'missed', selectedDate, true); setIsExtraOpen(false); }}>
                  <Ionicons name="close" size={20} color="#ef4444" />
                </TouchableOpacity>
              </View>
              <View style={{ gap: 8 }}>
                <Text style={{ fontSize: 12, textAlign: 'center', color: COLORS.textMuted }}>LAB</Text>
                <TouchableOpacity style={[styles.extraBtn, { borderColor: '#10b981' }]} disabled={!extraSubjectId} onPress={() => { handleLog(subjects.find(s=>s.id===extraSubjectId)!, 'lab', 'attended', selectedDate, true); setIsExtraOpen(false); }}>
                  <Ionicons name="checkmark" size={20} color="#10b981" />
                </TouchableOpacity>
                <TouchableOpacity style={[styles.extraBtn, { borderColor: '#ef4444' }]} disabled={!extraSubjectId} onPress={() => { handleLog(subjects.find(s=>s.id===extraSubjectId)!, 'lab', 'missed', selectedDate, true); setIsExtraOpen(false); }}>
                  <Ionicons name="close" size={20} color="#ef4444" />
                </TouchableOpacity>
              </View>
            </View>
            <TouchableOpacity style={{ marginTop: 20, alignItems: 'center' }} onPress={() => setIsExtraOpen(false)}>
              <Text style={{ color: COLORS.textMuted, padding: 8 }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Custom Confirm Modal */}
      <Modal visible={confirmConfig.visible} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center', padding: SPACE.xl }}>
          <View style={{ backgroundColor: COLORS.surface, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, padding: SPACE.xl, width: '100%', maxWidth: 400 }}>
            <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 18, color: COLORS.textPrimary, marginBottom: 8 }}>{confirmConfig.title}</Text>
            <Text style={{ fontSize: 14, color: COLORS.textMuted, marginBottom: 24, lineHeight: 20 }}>{confirmConfig.message}</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12 }}>
              <TouchableOpacity onPress={() => setConfirmConfig(p => ({ ...p, visible: false }))} style={{ paddingHorizontal: 16, paddingVertical: 10 }}>
                <Text style={{ fontFamily: FONT_FAMILY.bold, color: COLORS.textMuted }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmConfig.onConfirm} style={{ paddingHorizontal: 16, paddingVertical: 10, backgroundColor: confirmConfig.danger ? '#ef4444' : COLORS.accentPrimary, borderRadius: 8 }}>
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

    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', justifyContent: 'flex-end', padding: SPACE.md, gap: SPACE.sm, borderBottomWidth: 1, borderColor: COLORS.border },
  headerBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  headerBtnText: { fontFamily: FONT_FAMILY.bold, fontSize: 12, color: COLORS.textPrimary },
  
  overviewCard: { marginHorizontal: 0, marginTop: 12, marginBottom: 12, padding: SPACE.lg, backgroundColor: 'rgba(16,185,129,0.05)', borderTopWidth: 1, borderBottomWidth: 1, borderColor: 'rgba(16,185,129,0.2)' },
  overviewTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 14, color: COLORS.textPrimary },
  overviewStats: { fontFamily: FONT_FAMILY.body, fontSize: 12, color: COLORS.textMuted },
  overviewPct: { fontFamily: FONT_FAMILY.title, fontSize: 32, fontWeight: 'bold' },
  progressBarBg: { flex: 1, height: 6, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden' },
  progressBarFill: { height: '100%', borderRadius: 3 },
  
  warningBanner: { marginHorizontal: 0, marginBottom: SPACE.sm, padding: SPACE.lg, backgroundColor: 'rgba(239,68,68,0.1)', borderTopWidth: 1, borderBottomWidth: 1, borderColor: 'rgba(239,68,68,0.3)' },
  
  weekStrip: { flexDirection: 'row', paddingHorizontal: 16, gap: 6, marginBottom: SPACE.md },
  weekPill: { flex: 1, paddingVertical: 8, borderRadius: 12, alignItems: 'center', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  weekPillActive: { backgroundColor: COLORS.accentPrimary, borderColor: COLORS.accentPrimary },
  weekPillToday: { backgroundColor: 'rgba(255,255,255,0.1)', borderColor: 'rgba(255,255,255,0.4)' },
  weekPillDay: { fontSize: 10, color: COLORS.textMuted, marginBottom: 2, fontWeight: 'bold' },
  weekPillLabel: { fontSize: 12, color: COLORS.textPrimary, fontWeight: 'bold' },
  
  scheduleHeader: { paddingHorizontal: 16, marginBottom: SPACE.sm },
  scheduleTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 16, color: COLORS.textPrimary },
  
  list: { paddingHorizontal: 0, paddingBottom: 100 },
  emptyState: { alignItems: 'center', paddingVertical: 60, gap: 12, backgroundColor: 'rgba(16,185,129,0.05)', borderTopWidth: 1, borderBottomWidth: 1, borderColor: 'rgba(16,185,129,0.2)' },
  emptyText: { fontFamily: FONT_FAMILY.bold, fontSize: 16, color: COLORS.textMuted },
  
  subjectCard: { backgroundColor: COLORS.surface, borderBottomWidth: 1, borderColor: COLORS.border, marginBottom: 0, overflow: 'hidden' },
  subjectHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: SPACE.md, backgroundColor: 'rgba(0,0,0,0.1)', borderBottomWidth: 1, borderColor: COLORS.border },
  subjectName: { fontFamily: FONT_FAMILY.bold, fontSize: 15, color: COLORS.textPrimary },
  subjectTarget: { fontFamily: FONT_FAMILY.body, fontSize: 11, color: COLORS.textMuted },
  
  sessionSection: { flexDirection: 'row', padding: SPACE.md },
  sessionInfo: { flex: 1, paddingRight: SPACE.md },
  sessionLabel: { fontSize: 10, color: COLORS.textMuted, fontWeight: 'bold', marginBottom: 4 },
  sessionPct: { fontFamily: FONT_FAMILY.title, fontSize: 24, fontWeight: 'bold' },
  sessionCounts: { fontSize: 11, color: COLORS.textMuted },
  sessionUrgency: { fontSize: 10, marginTop: 4, fontWeight: 'bold' },
  sessionList: { flex: 2, gap: 6 },
  logRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.background, padding: 8, borderRadius: 8 },
  logLabel: { fontSize: 12, fontWeight: 'bold', color: COLORS.textPrimary },
  logStatus: { fontSize: 11, fontWeight: 'bold' },
  undoBtn: { padding: 4, backgroundColor: COLORS.surface2, borderRadius: 4 },
  actionBtn: { padding: 6, borderRadius: 6, borderWidth: 1, backgroundColor: 'rgba(255,255,255,0.05)' },
  inlineLogBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.full, borderWidth: 1, backgroundColor: 'rgba(255,255,255,0.02)' },

  // Modals
  modalRoot: { flex: 1, backgroundColor: COLORS.background },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: SPACE.md, borderBottomWidth: 1, borderColor: COLORS.border },
  modalTitle: { fontFamily: FONT_FAMILY.title, fontSize: 18, color: COLORS.textPrimary },
  modalHeaderBtn: { padding: 4 },
  
  configCard: { backgroundColor: COLORS.surface, padding: SPACE.md, borderRadius: RADIUS.md, marginBottom: SPACE.sm, borderWidth: 1, borderColor: COLORS.border },
  configName: { fontFamily: FONT_FAMILY.bold, fontSize: 16, color: COLORS.accentPrimary },
  configInputName: { fontFamily: FONT_FAMILY.bold, fontSize: 16, color: COLORS.accentPrimary, padding: 0, flex: 1, borderBottomWidth: 1, borderColor: COLORS.border },
  configInputSmall: { width: 40, height: 24, backgroundColor: COLORS.background, borderRadius: 4, textAlign: 'center', color: COLORS.textPrimary, borderWidth: 1, borderColor: COLORS.border, padding: 0 },
  configInputGrid: { width: 28, height: 24, backgroundColor: COLORS.background, borderRadius: 4, textAlign: 'center', color: COLORS.textPrimary, borderWidth: 1, borderColor: COLORS.border, padding: 0 },
  
  historyCard: { backgroundColor: COLORS.surface, padding: SPACE.md, borderRadius: RADIUS.md, marginBottom: SPACE.sm, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  
  overlayBg: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.3)' },
  sheet: { backgroundColor: COLORS.surface, padding: SPACE.xl, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl },
  sheetTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 16, color: COLORS.textPrimary, textAlign: 'center', marginBottom: SPACE.md },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border, marginRight: 8 },
  chipActive: { backgroundColor: COLORS.accentPrimary, borderColor: COLORS.accentPrimary },
  chipText: { fontSize: 12, color: COLORS.textPrimary },
  extraBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.05)' }
});
