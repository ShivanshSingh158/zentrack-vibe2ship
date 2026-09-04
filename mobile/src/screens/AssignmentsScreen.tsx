import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  Platform,
  Alert,
  TouchableOpacity,
  Keyboard,
  InteractionManager,
  Switch,
} from 'react-native';
import AnimatedPressable from '../components/AnimatedPressable';
import BottomSheet from '../components/ui/BottomSheet';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { useAcademicData } from '../contexts/domains/AcademicContext';
import { useCoreData } from '../contexts/domains/CoreDataContext';
import { usePlannerData } from '../contexts/domains/PlannerContext';
import type { Assignment, CustomEvent, Task } from '../contexts/MobileDataContext';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS, SHADOW } from '../theme/tokens';
import { doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import DateTimePicker from '@react-native-community/datetimepicker';
import { COLLECTION } from '../config/constants';
import { useTheme } from '../contexts/ThemeContext';
import { useSaraSurface } from '../hooks/useSaraSurface';
import SaraHUDBanner from '../components/SARA/SaraHUDBanner';
import { handleSyncError } from '../utils/errorUtils';
import EmptyState from '../components/ui/EmptyState';
import { awardXP } from '../services/xpSystem';
import { safeWrite, safeDelete } from '../utils/safeWrite';
import * as Haptics from 'expo-haptics';

// ─── Status Definitions & Themes ─────────────────────────────────────────────
type AssignmentStatus = 'not_started' | 'in_progress' | 'submitted' | 'graded';
type UrgencyTier = 'critical' | 'approaching' | 'safe' | 'completed' | 'overdue';

const getStatusConfig = (isDark: boolean) => ({
  not_started: {
    label: 'Not Started',
    color: isDark ? '#94A3B8' : '#64748B',
    bg: isDark ? 'rgba(148, 163, 184, 0.12)' : 'rgba(100, 116, 139, 0.10)',
    icon: 'time-outline' as const,
  },
  in_progress: {
    label: 'In Progress',
    color: isDark ? '#F59E0B' : '#D97706',
    bg: isDark ? 'rgba(245, 158, 11, 0.12)' : 'rgba(217, 119, 6, 0.10)',
    icon: 'create-outline' as const,
  },
  submitted: {
    label: 'Submitted',
    color: isDark ? '#60A5FA' : '#0284C7',
    bg: isDark ? 'rgba(96, 165, 250, 0.12)' : 'rgba(2, 132, 199, 0.10)',
    icon: 'document-text-outline' as const,
  },
  graded: {
    label: 'Graded',
    color: isDark ? '#34D399' : '#059669',
    bg: isDark ? 'rgba(52, 211, 153, 0.12)' : 'rgba(5, 150, 105, 0.10)',
    icon: 'checkmark-circle-outline' as const,
  },
});

// ─── Dynamic Deadline Radar & Urgency Resolver ──────────────────────────────
export function getDeadlineUrgency(dueDateStr: string, status: AssignmentStatus) {
  if (status === 'submitted' || status === 'graded') {
    return {
      tier: 'completed' as UrgencyTier,
      label: status === 'graded' ? 'Graded' : 'Submitted',
      color: '#5eda9e',
      bg: 'rgba(94, 218, 158, 0.08)',
      borderColor: 'rgba(94, 218, 158, 0.22)',
      icon: 'checkmark-circle' as const,
      isCritical: false,
    };
  }

  const due = parseLocalDateStr(dueDateStr);
  due.setHours(23, 59, 59, 999);
  const now = new Date();
  const diffMs = due.getTime() - now.getTime();

  if (diffMs < 0) {
    const overdueDays = Math.max(1, Math.ceil(Math.abs(diffMs) / (1000 * 60 * 60 * 24)));
    return {
      tier: 'overdue' as UrgencyTier,
      label: `Overdue (${overdueDays}d)`,
      color: '#ff6961',
      bg: 'rgba(255, 105, 97, 0.08)',
      borderColor: 'rgba(255, 105, 97, 0.24)',
      icon: 'alert-circle' as const,
      isCritical: true,
    };
  }

  const hoursLeft = diffMs / (1000 * 60 * 60);

  // 🔴 Critical (< 24 hrs): Dynamic Live Countdown
  if (hoursLeft <= 24) {
    const h = Math.floor(hoursLeft);
    const m = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    const countdown = h > 0 ? `${h}h ${m}m` : `${m}m`;
    return {
      tier: 'critical' as UrgencyTier,
      label: `${countdown} left`,
      color: '#ff6961',
      bg: 'rgba(255, 105, 97, 0.08)',
      borderColor: 'rgba(255, 105, 97, 0.28)',
      icon: 'flame' as const,
      isCritical: true,
    };
  }

  // 🟡 Approaching (< 3 days)
  if (hoursLeft <= 72) {
    const days = Math.ceil(hoursLeft / 24);
    return {
      tier: 'approaching' as UrgencyTier,
      label: `${days}d left`,
      color: '#ff9f4d',
      bg: 'rgba(255, 159, 77, 0.08)',
      borderColor: 'rgba(255, 159, 77, 0.22)',
      icon: 'time-outline' as const,
      isCritical: false,
    };
  }

  // 🟢 Safe (> 3 days)
  const days = Math.ceil(hoursLeft / 24);
  return {
    tier: 'safe' as const,
    label: `${days}d left`,
    color: '#5eda9e',
    bg: 'rgba(94, 218, 158, 0.06)',
    borderColor: 'rgba(94, 218, 158, 0.16)',
    icon: 'calendar-outline' as const,
    isCritical: false,
  };
}

// ─── Timezone-Safe Date Helpers ───────────────────────────────────────────────
/** Safely parses YYYY-MM-DD string into a local Date without UTC midnight shifts */
const parseLocalDateStr = (str: string): Date => {
  if (!str) return new Date();
  const parts = str.split('T')[0].split('-');
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
      return new Date(y, m, d, 12, 0, 0);
    }
  }
  const parsed = new Date(str);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
};

/** Converts a local Date to YYYY-MM-DD */
const toISODateStr = (d: Date): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/** Formats a date string (YYYY-MM-DD) to readable DD-MM-YYYY */
const formatDDMMYYYY = (dateInput: Date | string): string => {
  if (!dateInput) return '';
  if (typeof dateInput === 'string') {
    const parts = dateInput.split('T')[0].split('-');
    if (parts.length === 3 && parts[0].length === 4) {
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
  }
  const d = typeof dateInput === 'string' ? parseLocalDateStr(dateInput) : dateInput;
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
};

/** Formats date into friendly string like "Thu, 28 Aug 2026" */
const formatDisplayDate = (dateInput: Date | string): string => {
  const d = typeof dateInput === 'string' ? parseLocalDateStr(dateInput) : dateInput;
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
};

/** Computes calendar day delta between today and due date */
const getDaysUntilDue = (dueDateStr: string): number => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const due = parseLocalDateStr(dueDateStr);
  const target = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
};

// ─── Main Component ──────────────────────────────────────────────────────────
export default function AssignmentsScreen() {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const {
    assignments,
    attendance,
    ensureSubscribed,
    optimisticAddAssignment,
    optimisticUpdateAssignment,
    optimisticDeleteAssignment,
  } = useAcademicData();
  const { user, optimisticAddTask } = useCoreData();
  const { optimisticAddEvent } = usePlannerData();

  useEffect(() => {
    const handle = InteractionManager.runAfterInteractions(() => ensureSubscribed?.());
    return () => handle.cancel();
  }, [ensureSubscribed]);

  const statusConfig = useMemo(() => getStatusConfig(isDark), [isDark]);

  // SARA HUD Banner surface injection (48h deadline alert)
  const psiCtx = useMemo(() => ({ assignments: assignments as any[] }), [assignments]);
  const { surfaceMessage, surfaceActionLabel, dismissBanner } = useSaraSurface('Assignments', psiCtx as any, user?.uid);

  // Filters, Radar & Search
  const [filter, setFilter] = useState<'all' | AssignmentStatus>('all');
  const [radarFilter, setRadarFilter] = useState<'all' | 'critical' | 'approaching' | 'safe'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal Form State
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form Fields
  const [title, setTitle] = useState('');
  const [subjectName, setSubjectName] = useState('');
  const [dueDate, setDueDate] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);
  const [status, setStatus] = useState<AssignmentStatus>('not_started');
  const [notes, setNotes] = useState('');
  const [maxMarks, setMaxMarks] = useState('');
  const [obtainedMarks, setObtainedMarks] = useState('');
  const [grade, setGrade] = useState('');
  const [showMarksFields, setShowMarksFields] = useState(false);
  const [syncToCalendarAndTasks, setSyncToCalendarAndTasks] = useState(true);
  const [saving, setSaving] = useState(false);

  const titleInputRef = useRef<TextInput>(null);

  const resetForm = useCallback(() => {
    setTitle('');
    setSubjectName(attendance[0]?.name || '');
    setDueDate(new Date());
    setStatus('not_started');
    setNotes('');
    setMaxMarks('');
    setObtainedMarks('');
    setGrade('');
    setShowMarksFields(false);
    setSyncToCalendarAndTasks(true);
    setEditingId(null);
    setSaving(false);
  }, [attendance]);

  const openCreate = useCallback(() => {
    resetForm();
    setModalVisible(true);
    setTimeout(() => {
      titleInputRef.current?.focus();
    }, 150);
  }, [resetForm]);

  const openEdit = useCallback((a: Assignment) => {
    setEditingId(a.id || null);
    setTitle(a.title || '');
    setSubjectName(a.subjectName || '');
    setStatus(a.status || 'not_started');
    setDueDate(parseLocalDateStr(a.dueDate));
    setNotes(a.notes || a.description || '');
    setMaxMarks(a.maxMarks !== undefined ? String(a.maxMarks) : '');
    setObtainedMarks(a.obtainedMarks !== undefined ? String(a.obtainedMarks) : '');
    setGrade(a.grade || '');
    setShowMarksFields(a.maxMarks !== undefined || a.obtainedMarks !== undefined || !!a.grade || a.status === 'graded');
    setSyncToCalendarAndTasks(false);
    setModalVisible(true);
  }, []);

  const setQuickDate = useCallback((daysFromNow: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const d = new Date();
    d.setDate(d.getDate() + daysFromNow);
    setDueDate(d);
  }, []);

  // 0ms Optimistic Save with Background SafeWrite + Ecosystem Sync
  const handleSave = useCallback(async () => {
    const finalTitle = title.trim();
    if (!finalTitle) {
      Alert.alert('Required Field', 'Please enter a title for this assignment.');
      return;
    }
    if (!user) {
      Alert.alert('Authentication Error', 'You must be signed in to save assignments.');
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSaving(true);
    Keyboard.dismiss();

    const dueDateStr = toISODateStr(dueDate);
    const now = Date.now();
    const finalSubject = subjectName.trim() || 'General';
    const parsedMax = maxMarks.trim() ? Number(maxMarks.trim()) : undefined;
    const parsedObtained = obtainedMarks.trim() ? Number(obtainedMarks.trim()) : undefined;
    const parsedGrade = grade.trim() ? grade.trim().toUpperCase() : undefined;

    const assignmentData: Assignment = {
      userId: user.uid,
      title: finalTitle,
      subjectName: finalSubject,
      dueDate: dueDateStr,
      status,
      notes: notes.trim() || undefined,
      description: notes.trim() || undefined,
      maxMarks: !isNaN(parsedMax as number) ? parsedMax : undefined,
      obtainedMarks: !isNaN(parsedObtained as number) ? parsedObtained : undefined,
      grade: parsedGrade,
      updatedAt: now,
      createdAt: now,
    };

    if (editingId) {
      // 1. Optimistic Update (0ms instant UI reflection)
      optimisticUpdateAssignment(editingId, assignmentData);
      setModalVisible(false);
      resetForm();

      // 2. Background Firestore Sync
      safeWrite(
        () => updateDoc(doc(db, COLLECTION.ASSIGNMENTS, editingId), assignmentData as any),
        COLLECTION.ASSIGNMENTS,
        'update',
        assignmentData,
        editingId
      ).catch(handleSyncError);

      if (status === 'submitted' || status === 'graded') {
        awardXP('TASK_COMPLETE').catch(() => {});
      }
    } else {
      // 1. Generate Deterministic ID for 0ms Instant Optimistic Add
      const newId = `asg_${now}_${Math.random().toString(36).substr(2, 6)}`;
      const newAssignment = { ...assignmentData, id: newId, createdAt: now };

      optimisticAddAssignment(newAssignment);
      setModalVisible(false);
      resetForm();

      // 2. Background Firestore Sync for Assignment
      safeWrite(
        () => setDoc(doc(db, COLLECTION.ASSIGNMENTS, newId), newAssignment),
        COLLECTION.ASSIGNMENTS,
        'set',
        newAssignment,
        newId
      ).catch(handleSyncError);

      // 3. 1-Tap Sync to Calendar & Tasks (if toggle enabled)
      if (syncToCalendarAndTasks) {
        // A. Calendar Deadline Event
        const eventId = `ev_${newId}`;
        const eventData: CustomEvent = {
          id: eventId,
          userId: user.uid,
          title: `📋 ${finalTitle} (${finalSubject})`,
          date: dueDateStr,
          type: 'assignment_due',
          description: `Assignment Deadline: ${finalTitle} for ${finalSubject}.${notes.trim() ? '\n' + notes.trim() : ''}`,
        };
        optimisticAddEvent(eventData);
        safeWrite(
          () => setDoc(doc(db, COLLECTION.CALENDAR_EVENTS, eventId), eventData),
          COLLECTION.CALENDAR_EVENTS,
          'set',
          eventData,
          eventId
        ).catch(handleSyncError);

        // B. High-Priority Task
        const taskId = `task_${newId}`;
        const taskData: Task = {
          id: taskId,
          userId: user.uid,
          title: `Complete: ${finalTitle}`,
          priority: 'high',
          status: 'pending',
          date: dueDateStr,
          timeSlot: '23:59',
          isReminder: true,
          tags: ['Assignment', finalSubject],
        };
        optimisticAddTask(taskData);
        safeWrite(
          () => setDoc(doc(db, COLLECTION.TASKS, taskId), taskData),
          COLLECTION.TASKS,
          'set',
          taskData,
          taskId
        ).catch(handleSyncError);

        // C. Schedule 24h & 2h Push Notifications
        try {
          const dueDateTime = parseLocalDateStr(dueDateStr);
          dueDateTime.setHours(23, 59, 0, 0);
          const nowMs = Date.now();

          // 24 Hours Alert
          const t24 = dueDateTime.getTime() - 24 * 60 * 60 * 1000;
          if (t24 > nowMs) {
            Notifications.scheduleNotificationAsync({
              content: {
                title: `Kal Deadline Hai: ${finalTitle}! 🚨`,
                body: `Don't forget to submit your ${finalSubject} assignment on time.`,
                data: { type: 'assignment_24h', assignmentId: newId },
              },
              trigger: { type: 'date', date: new Date(t24) } as any,
            }).catch(() => {});
          }

          // 2 Hours Alert
          const t2 = dueDateTime.getTime() - 2 * 60 * 60 * 1000;
          if (t2 > nowMs) {
            Notifications.scheduleNotificationAsync({
              content: {
                title: `Final 2 Hours: ${finalTitle} Due Soon! ⏰`,
                body: `Submit your ${finalSubject} assignment before the portal closes.`,
                data: { type: 'assignment_2h', assignmentId: newId },
              },
              trigger: { type: 'date', date: new Date(t2) } as any,
            }).catch(() => {});
          }
        } catch {}
      }

      awardXP('TASK_COMPLETE').catch(() => {});
    }
  }, [
    title,
    user,
    dueDate,
    subjectName,
    maxMarks,
    obtainedMarks,
    grade,
    status,
    notes,
    editingId,
    syncToCalendarAndTasks,
    optimisticUpdateAssignment,
    optimisticAddAssignment,
    optimisticAddEvent,
    optimisticAddTask,
    resetForm,
  ]);

  // Direct quick-status progression on card tap
  const cycleStatus = useCallback((assignment: Assignment) => {
    if (!assignment.id || !user) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const order: AssignmentStatus[] = ['not_started', 'in_progress', 'submitted', 'graded'];
    const currentIdx = order.indexOf(assignment.status);
    const nextStatus = order[(currentIdx + 1) % order.length];

    const updated = { ...assignment, status: nextStatus, updatedAt: Date.now() };
    optimisticUpdateAssignment(assignment.id, updated);

    safeWrite(
      () => updateDoc(doc(db, COLLECTION.ASSIGNMENTS, assignment.id!), { status: nextStatus, updatedAt: Date.now() }),
      COLLECTION.ASSIGNMENTS,
      'update',
      { status: nextStatus, updatedAt: Date.now() },
      assignment.id
    ).catch(handleSyncError);

    if (nextStatus === 'submitted' || nextStatus === 'graded') {
      awardXP('TASK_COMPLETE').catch(() => {});
    }
  }, [user, optimisticUpdateAssignment]);

  const confirmDelete = useCallback((id: string, titleStr: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert('Delete Assignment', `Are you sure you want to remove "${titleStr}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          optimisticDeleteAssignment(id);
          safeDelete(id, COLLECTION.ASSIGNMENTS, () => deleteDoc(doc(db, COLLECTION.ASSIGNMENTS, id))).catch(handleSyncError);
        },
      },
    ]);
  }, [optimisticDeleteAssignment]);

  // Filter, Radar & Search Aggregation
  const { filteredList, counts, radarStats } = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const all = assignments || [];

    const stats = {
      all: all.length,
      not_started: 0,
      in_progress: 0,
      submitted: 0,
      graded: 0,
    };

    const radar = {
      critical: 0,
      approaching: 0,
      safe: 0,
      completed: 0,
    };

    all.forEach((a) => {
      if (stats[a.status] !== undefined) stats[a.status]++;
      const urgency = getDeadlineUrgency(a.dueDate, a.status);
      if (urgency.tier === 'critical' || urgency.tier === 'overdue') {
        radar.critical++;
      } else if (urgency.tier === 'approaching') {
        radar.approaching++;
      } else if (urgency.tier === 'safe') {
        radar.safe++;
      } else if (urgency.tier === 'completed') {
        radar.completed++;
      }
    });

    let result = all;

    // Status filter
    if (filter !== 'all') {
      result = result.filter((a) => a.status === filter);
    }

    // Radar urgency filter
    if (radarFilter !== 'all') {
      result = result.filter((a) => {
        const u = getDeadlineUrgency(a.dueDate, a.status);
        if (radarFilter === 'critical') return u.tier === 'critical' || u.tier === 'overdue';
        if (radarFilter === 'approaching') return u.tier === 'approaching';
        if (radarFilter === 'safe') return u.tier === 'safe';
        return true;
      });
    }

    // Search query
    if (q) {
      result = result.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          (a.subjectName && a.subjectName.toLowerCase().includes(q)) ||
          (a.notes && a.notes.toLowerCase().includes(q))
      );
    }

    result.sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
    return { filteredList: result, counts: stats, radarStats: radar };
  }, [assignments, filter, radarFilter, searchQuery]);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
      <StatusBar style={isDark ? 'light' : 'dark'} backgroundColor={colors.background} />

      {/* SARA HUD Alert Banner */}
      <SaraHUDBanner
        message={surfaceMessage || ''}
        visible={!!surfaceMessage}
        onDismiss={dismissBanner}
        actionLabel={surfaceActionLabel || undefined}
      />

      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerLabel}>ACADEMICS</Text>
          <Text style={styles.headerTitle}>Assignments</Text>
        </View>
        <AnimatedPressable style={styles.headerAddBtn} onPress={openCreate}>
          <Ionicons name="add" size={22} color={isDark ? '#000000' : '#FFFFFF'} />
          <Text style={styles.headerAddBtnText}>New</Text>
        </AnimatedPressable>
      </View>

      {/* Dynamic Deadline Radar Urgency Strip */}
      <View style={styles.radarContainer}>
        <View style={styles.radarHeaderRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Ionicons name="radio-outline" size={12} color={colors.accentPrimary} />
            <Text style={styles.radarTitle}>DEADLINE RADAR</Text>
          </View>
          {radarFilter !== 'all' ? (
            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setRadarFilter('all');
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.radarResetText}>Reset Filter</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.radarSubText}>Active urgency tracker</Text>
          )}
        </View>

        <View style={styles.radarChipsRow}>
          {/* Critical Pill */}
          <AnimatedPressable
            style={[
              styles.radarChip,
              radarFilter === 'critical' && styles.radarChipActive,
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setRadarFilter((prev) => (prev === 'critical' ? 'all' : 'critical'));
            }}
          >
            <View style={[styles.radarDot, { backgroundColor: '#ff6961' }]} />
            <Text
              style={[
                styles.radarChipLabel,
                radarFilter === 'critical' && styles.radarChipLabelActive,
              ]}
              numberOfLines={1}
            >
              &lt;24h Critical
            </Text>
            <View
              style={[
                styles.radarCountBadge,
                radarStats.critical > 0 && styles.radarCountBadgeCritical,
                radarFilter === 'critical' && styles.radarCountBadgeActive,
              ]}
            >
              <Text
                style={[
                  styles.radarCountText,
                  radarStats.critical > 0 && styles.radarCountTextCritical,
                  radarFilter === 'critical' && styles.radarCountTextActive,
                ]}
              >
                {radarStats.critical}
              </Text>
            </View>
          </AnimatedPressable>

          {/* Approaching Pill */}
          <AnimatedPressable
            style={[
              styles.radarChip,
              radarFilter === 'approaching' && styles.radarChipActive,
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setRadarFilter((prev) => (prev === 'approaching' ? 'all' : 'approaching'));
            }}
          >
            <View style={[styles.radarDot, { backgroundColor: '#ff9f4d' }]} />
            <Text
              style={[
                styles.radarChipLabel,
                radarFilter === 'approaching' && styles.radarChipLabelActive,
              ]}
              numberOfLines={1}
            >
              &lt;3 Days
            </Text>
            <View
              style={[
                styles.radarCountBadge,
                radarFilter === 'approaching' && styles.radarCountBadgeActive,
              ]}
            >
              <Text
                style={[
                  styles.radarCountText,
                  radarFilter === 'approaching' && styles.radarCountTextActive,
                ]}
              >
                {radarStats.approaching}
              </Text>
            </View>
          </AnimatedPressable>

          {/* Safe Pill */}
          <AnimatedPressable
            style={[
              styles.radarChip,
              radarFilter === 'safe' && styles.radarChipActive,
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setRadarFilter((prev) => (prev === 'safe' ? 'all' : 'safe'));
            }}
          >
            <View style={[styles.radarDot, { backgroundColor: '#5eda9e' }]} />
            <Text
              style={[
                styles.radarChipLabel,
                radarFilter === 'safe' && styles.radarChipLabelActive,
              ]}
              numberOfLines={1}
            >
              &gt;3 Days
            </Text>
            <View
              style={[
                styles.radarCountBadge,
                radarFilter === 'safe' && styles.radarCountBadgeActive,
              ]}
            >
              <Text
                style={[
                  styles.radarCountText,
                  radarFilter === 'safe' && styles.radarCountTextActive,
                ]}
              >
                {radarStats.safe}
              </Text>
            </View>
          </AnimatedPressable>
        </View>
      </View>

      {/* Search Input Bar */}
      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={18} color={colors.textMuted} style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by title, course, or notes..."
          placeholderTextColor={colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          clearButtonMode="while-editing"
          autoCapitalize="none"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      {/* Filter Horizontal Strip */}
      <View style={styles.filterContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScrollContent}>
          {(['all', 'not_started', 'in_progress', 'submitted', 'graded'] as const).map((key) => {
            const isActive = filter === key;
            const label = key === 'all' ? 'All' : statusConfig[key].label;
            const count = counts[key] || 0;
            return (
              <AnimatedPressable
                key={key}
                style={[styles.filterChip, isActive && styles.filterChipActive]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setFilter(key);
                }}
              >
                <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                  {label}
                </Text>
                <View style={[styles.filterBadge, isActive && styles.filterBadgeActive]}>
                  <Text style={[styles.filterBadgeText, isActive && styles.filterBadgeTextActive]}>
                    {count}
                  </Text>
                </View>
              </AnimatedPressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Main FlashList */}
      <FlashList
        data={filteredList}
        keyExtractor={(item) => item.id || `asg_${item.createdAt}_${item.title}`}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => {
          const conf = statusConfig[item.status] || statusConfig.not_started;
          const urgency = getDeadlineUrgency(item.dueDate, item.status);

          return (
            <AnimatedPressable
              style={[
                styles.card,
                urgency.isCritical && styles.cardCriticalBorder,
              ]}
              onPress={() => openEdit(item)}
              onLongPress={() => confirmDelete(item.id!, item.title)}
            >
              {/* Top Row: Subject & Dynamic Urgency Radar */}
              <View style={styles.cardTopRow}>
                <View style={styles.subjectBadge}>
                  <View style={styles.subjectDot} />
                  <Text style={styles.subjectText} numberOfLines={1}>
                    {item.subjectName || 'General'}
                  </Text>
                </View>

                {/* Urgency Pulse Glow Pill */}
                <View style={[styles.urgencyPill, { backgroundColor: urgency.bg, borderColor: urgency.borderColor }]}>
                  <Ionicons name={urgency.icon} size={12} color={urgency.color} style={{ marginRight: 3 }} />
                  <Text style={[styles.urgencyText, { color: urgency.color }]}>
                    {urgency.label}
                  </Text>
                </View>
              </View>

              {/* Middle Row: Title */}
              <Text style={styles.cardTitle} numberOfLines={2}>
                {item.title}
              </Text>

              {/* Notes Snippet */}
              {item.notes ? (
                <Text style={styles.cardNotes} numberOfLines={2}>
                  {item.notes}
                </Text>
              ) : null}

              {/* Bottom Row: Marks/Grade + Quick Status Pill */}
              <View style={styles.cardBottomRow}>
                {item.maxMarks !== undefined || item.grade ? (
                  <View style={styles.marksBadge}>
                    <Ionicons name="ribbon-outline" size={14} color={colors.accentPrimary} />
                    <Text style={styles.marksText}>
                      {item.obtainedMarks !== undefined ? `${item.obtainedMarks}/${item.maxMarks}` : `Max: ${item.maxMarks}`}
                      {item.grade ? ` • ${item.grade}` : ''}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.dueDateBadge}>
                    <Ionicons name="calendar-outline" size={12} color={colors.textMuted} />
                    <Text style={styles.dueDateText}>
                      {formatDDMMYYYY(item.dueDate)}
                    </Text>
                  </View>
                )}

                {/* Direct Tap to Cycle Status */}
                <TouchableOpacity
                  style={[styles.statusTogglePill, { backgroundColor: conf.bg, borderColor: conf.color }]}
                  onPress={() => cycleStatus(item)}
                  activeOpacity={0.7}
                >
                  <Ionicons name={conf.icon} size={14} color={conf.color} style={{ marginRight: 4 }} />
                  <Text style={[styles.statusToggleText, { color: conf.color }]}>
                    {conf.label}
                  </Text>
                </TouchableOpacity>
              </View>
            </AnimatedPressable>
          );
        }}
        ListEmptyComponent={
          <EmptyState
            mascot="idle"
            title={searchQuery || radarFilter !== 'all' ? 'No matching assignments' : 'All caught up!'}
            subtitle={searchQuery || radarFilter !== 'all' ? 'Try clearing your search or radar filter.' : 'Tap + to track your upcoming assignment.'}
          />
        }
      />

      {/* Floating Action Button */}
      <AnimatedPressable style={styles.fab} onPress={openCreate}>
        <Ionicons name="add" size={28} color={isDark ? '#1a110a' : '#FFFFFF'} />
      </AnimatedPressable>

      {/* Add / Edit Assignment Sheet */}
      {modalVisible && (
        <BottomSheet
          visible={modalVisible}
          onClose={() => setModalVisible(false)}
          contentStyle={{ paddingHorizontal: 10, maxHeight: '94%' }}
        >
          <View style={styles.sheetContainer}>
            {/* Modal Header */}
            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.sheetTitle}>
                  {editingId ? 'Edit Assignment' : 'New Assignment'}
                </Text>
                <Text style={styles.sheetSubtitle}>
                  Track deadlines, rubrics, and marks
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setModalVisible(false)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={styles.sheetCloseBtn}
              >
                <Ionicons name="close" size={18} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              style={{ flexShrink: 1 }}
              contentContainerStyle={styles.sheetScrollBody}
            >
              {/* 1. Title Input */}
              <View style={styles.formSection}>
                <View style={styles.inputLabelRow}>
                  <Ionicons name="document-text-outline" size={12} color={colors.accentPrimary} />
                  <Text style={styles.inputLabel}>ASSIGNMENT TITLE *</Text>
                </View>
                <TextInput
                  ref={titleInputRef}
                  style={styles.textInput}
                  placeholder="e.g. Computer Networks Lab 3 Report"
                  placeholderTextColor={colors.textMuted}
                  value={title}
                  onChangeText={setTitle}
                  autoCapitalize="sentences"
                  returnKeyType="next"
                />
              </View>

              {/* 2. Course / Subject Selection + Custom Input */}
              <View style={styles.formSection}>
                <View style={styles.inputLabelRow}>
                  <Ionicons name="school-outline" size={12} color={colors.accentPrimary} />
                  <Text style={styles.inputLabel}>COURSE / SUBJECT</Text>
                </View>
                {attendance && attendance.length > 0 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.subjectChipsRow}>
                    {attendance.map((sub) => {
                      const isSelected = subjectName.trim().toLowerCase() === sub.name.trim().toLowerCase();
                      return (
                        <TouchableOpacity
                          key={sub.id}
                          style={[styles.subjectChip, isSelected && styles.subjectChipActive]}
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                            setSubjectName(sub.name);
                          }}
                        >
                          <View style={[styles.subjectChipDot, isSelected && { backgroundColor: isDark ? '#000' : '#FFF' }]} />
                          <Text style={[styles.subjectChipText, isSelected && styles.subjectChipTextActive]}>
                            {sub.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                )}
                <TextInput
                  style={[styles.textInput, { marginTop: 4 }]}
                  placeholder="Type or edit custom subject name..."
                  placeholderTextColor={colors.textMuted}
                  value={subjectName}
                  onChangeText={setSubjectName}
                  autoCapitalize="words"
                />
              </View>

              {/* 3. Due Date & Quick Selectors */}
              <View style={styles.formSection}>
                <View style={styles.inputLabelRow}>
                  <Ionicons name="calendar-outline" size={12} color={colors.accentPrimary} />
                  <Text style={styles.inputLabel}>DUE DATE</Text>
                </View>
                <View style={styles.datePresetsRow}>
                  {[
                    { label: 'Today', days: 0 },
                    { label: 'Tomorrow', days: 1 },
                    { label: '3 Days', days: 3 },
                    { label: '1 Week', days: 7 },
                    { label: '2 Weeks', days: 14 },
                  ].map((preset) => (
                    <TouchableOpacity
                      key={preset.label}
                      style={styles.datePresetPill}
                      onPress={() => setQuickDate(preset.days)}
                    >
                      <Text style={styles.datePresetText}>{preset.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TouchableOpacity style={styles.datePickerBtn} onPress={() => setShowPicker(true)}>
                  <Ionicons name="calendar" size={15} color={colors.accentPrimary} style={{ marginRight: 6 }} />
                  <Text style={styles.datePickerBtnText}>
                    {formatDisplayDate(dueDate)} ({formatDDMMYYYY(dueDate)})
                  </Text>
                  <Ionicons name="chevron-forward" size={13} color={colors.textMuted} style={{ marginLeft: 'auto' }} />
                </TouchableOpacity>

                {showPicker && (
                  <DateTimePicker
                    value={dueDate}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={(_, selectedDate) => {
                      setShowPicker(Platform.OS === 'ios');
                      if (selectedDate) setDueDate(selectedDate);
                    }}
                  />
                )}
              </View>

              {/* 4. Status Segmented Buttons */}
              <View style={styles.formSection}>
                <View style={styles.inputLabelRow}>
                  <Ionicons name="flag-outline" size={12} color={colors.accentPrimary} />
                  <Text style={styles.inputLabel}>STATUS</Text>
                </View>
                <View style={styles.statusGrid}>
                  {(['not_started', 'in_progress', 'submitted', 'graded'] as const).map((k) => {
                    const conf = statusConfig[k];
                    const isSelected = status === k;
                    return (
                      <TouchableOpacity
                        key={k}
                        style={[
                          styles.statusSelectChip,
                          isSelected && { backgroundColor: conf.color, borderColor: conf.color },
                        ]}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setStatus(k);
                          if (k === 'graded') setShowMarksFields(true);
                        }}
                      >
                        <Ionicons
                          name={conf.icon}
                          size={13}
                          color={isSelected ? '#FFFFFF' : conf.color}
                          style={{ marginRight: 4 }}
                        />
                        <Text style={[styles.statusSelectText, isSelected && { color: '#FFFFFF', fontWeight: 'bold' }]}>
                          {conf.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Marks / Grading Section Toggle */}
                <TouchableOpacity
                  style={styles.toggleMarksBtn}
                  onPress={() => setShowMarksFields((v) => !v)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={showMarksFields ? 'chevron-up-circle' : 'add-circle-outline'}
                    size={15}
                    color={colors.accentPrimary}
                  />
                  <Text style={styles.toggleMarksText}>
                    {showMarksFields ? 'Hide Marks & Grade details' : 'Add Marks, Max Marks, or Grade'}
                  </Text>
                </TouchableOpacity>

                {showMarksFields && (
                  <View style={styles.marksInputRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.subInputLabel}>OBTAINED</Text>
                      <TextInput
                        style={styles.textInput}
                        placeholder="e.g. 85"
                        placeholderTextColor={colors.textMuted}
                        keyboardType="numeric"
                        value={obtainedMarks}
                        onChangeText={setObtainedMarks}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.subInputLabel}>MAX MARKS</Text>
                      <TextInput
                        style={styles.textInput}
                        placeholder="e.g. 100"
                        placeholderTextColor={colors.textMuted}
                        keyboardType="numeric"
                        value={maxMarks}
                        onChangeText={setMaxMarks}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.subInputLabel}>GRADE</Text>
                      <TextInput
                        style={styles.textInput}
                        placeholder="e.g. A+"
                        placeholderTextColor={colors.textMuted}
                        autoCapitalize="characters"
                        value={grade}
                        onChangeText={setGrade}
                      />
                    </View>
                  </View>
                )}
              </View>

              {/* 5. 1-Tap Sync to Calendar & Tasks Feature */}
              {!editingId && (
                <View style={styles.syncCard}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <Ionicons name="sparkles" size={13} color={colors.accentPrimary} />
                      <Text style={styles.syncCardTitle}>1-Tap Sync to Calendar & Tasks</Text>
                    </View>
                    <Text style={styles.syncCardSub}>
                      Creates calendar deadline event + high-priority task with 24h & 2h alerts
                    </Text>
                  </View>
                  <Switch
                    value={syncToCalendarAndTasks}
                    onValueChange={(val) => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setSyncToCalendarAndTasks(val);
                    }}
                    trackColor={{ false: isDark ? '#333338' : '#CBD5E1', true: colors.accentPrimary }}
                    thumbColor="#FFFFFF"
                  />
                </View>
              )}

              {/* 6. Notes / Rubric / Submission Link */}
              <View style={styles.formSection}>
                <View style={styles.inputLabelRow}>
                  <Ionicons name="clipboard-outline" size={12} color={colors.accentPrimary} />
                  <Text style={styles.inputLabel}>NOTES / RUBRIC / SUBMISSION LINK</Text>
                </View>
                <TextInput
                  style={styles.notesAreaInput}
                  placeholder="Add assignment rubric, drive links, instructions, or notes..."
                  placeholderTextColor={colors.textMuted}
                  multiline
                  value={notes}
                  onChangeText={setNotes}
                  autoCapitalize="sentences"
                />
              </View>
            </ScrollView>

            {/* 7. Sticky Pinned Save Action Button */}
            <View style={styles.sheetFooter}>
              <AnimatedPressable
                style={[styles.saveButton, saving && { opacity: 0.6 }]}
                onPress={handleSave}
                disabled={saving}
              >
                <Ionicons name="checkmark-circle" size={17} color={isDark ? '#000000' : '#FFFFFF'} style={{ marginRight: 6 }} />
                <Text style={styles.saveButtonText}>
                  {saving ? 'Saving...' : editingId ? 'Update Assignment' : 'Save Assignment (+50 XP)'}
                </Text>
              </AnimatedPressable>
            </View>
          </View>
        </BottomSheet>
      )}
    </SafeAreaView>
  );
}

// ─── Stylesheet ───────────────────────────────────────────────────────────────
const makeStyles = (colors: any, isDark: boolean = true) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 8,
      paddingTop: SPACE.sm,
      paddingBottom: SPACE.xs,
    },
    headerLabel: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 11,
      color: colors.accentPrimary || '#A599FF',
      letterSpacing: 2,
      marginBottom: 2,
    },
    headerTitle: {
      fontFamily: FONT_FAMILY.title,
      fontSize: 26,
      color: colors.textPrimary,
      fontWeight: 'bold',
    },
    headerAddBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.accentPrimary,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: RADIUS.full,
      ...SHADOW.sm,
    },
    headerAddBtnText: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: FONT_SIZE.xs,
      color: isDark ? '#000000' : '#FFFFFF',
    },

    // Dynamic Deadline Radar Strip
    radarContainer: {
      marginHorizontal: 5,
      marginTop: 2,
      marginBottom: 6,
      paddingHorizontal: 6,
      paddingVertical: 7,
      borderRadius: RADIUS.md,
      backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : '#FFFFFF',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.06)' : '#E2E8F0',
    },
    radarHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 6,
      paddingHorizontal: 2,
    },
    radarTitle: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 9.5,
      letterSpacing: 1.1,
      color: isDark ? colors.textMuted : colors.textSecondary,
    },
    radarSubText: {
      fontFamily: FONT_FAMILY.body,
      fontSize: 10,
      color: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.35)',
    },
    radarResetText: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 10.5,
      color: colors.accentPrimary,
    },
    radarChipsRow: {
      flexDirection: 'row',
      gap: 4,
    },
    radarChip: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 3.5,
      paddingVertical: 6,
      paddingHorizontal: 2,
      borderRadius: RADIUS.sm,
      backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#F8FAFC',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.06)' : '#E2E8F0',
    },
    radarChipActive: {
      backgroundColor: isDark ? 'rgba(165,153,255,0.12)' : 'rgba(108,92,231,0.08)',
      borderColor: colors.accentPrimary,
    },
    radarDot: {
      width: 5,
      height: 5,
      borderRadius: 2.5,
    },
    radarChipLabel: {
      fontFamily: FONT_FAMILY.medium,
      fontSize: 10.5,
      color: isDark ? colors.textMuted : colors.textSecondary,
    },
    radarChipLabelActive: {
      fontFamily: FONT_FAMILY.bold,
      color: colors.accentPrimary,
    },
    radarCountBadge: {
      paddingHorizontal: 5,
      paddingVertical: 0.5,
      borderRadius: RADIUS.full,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
      minWidth: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radarCountBadgeCritical: {
      backgroundColor: isDark ? 'rgba(255,105,97,0.16)' : 'rgba(255,105,97,0.10)',
    },
    radarCountBadgeActive: {
      backgroundColor: colors.accentPrimary,
    },
    radarCountText: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 9.5,
      color: isDark ? colors.textMuted : colors.textSecondary,
    },
    radarCountTextCritical: {
      color: colors.error || '#ff6961',
    },
    radarCountTextActive: {
      color: isDark ? '#000000' : '#FFFFFF',
    },

    // Search
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: 5,
      marginTop: 4,
      marginBottom: SPACE.xs,
      backgroundColor: isDark ? colors.surface2 : '#F1F5F9',
      borderRadius: RADIUS.md,
      paddingHorizontal: 12,
      paddingVertical: Platform.OS === 'ios' ? 8 : 4,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.06)' : '#E2E8F0',
    },
    searchInput: {
      flex: 1,
      fontFamily: FONT_FAMILY.body,
      fontSize: FONT_SIZE.sm,
      color: colors.textPrimary,
    },

    // Filter Chips
    filterContainer: {
      marginVertical: SPACE.xs,
    },
    filterScrollContent: {
      paddingHorizontal: 5,
      gap: 6,
    },
    filterChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: RADIUS.full,
      backgroundColor: isDark ? colors.surface2 : '#FFFFFF',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0',
    },
    filterChipActive: {
      backgroundColor: colors.accentPrimary,
      borderColor: colors.accentPrimary,
    },
    filterChipText: {
      fontFamily: FONT_FAMILY.medium,
      fontSize: 12,
      color: isDark ? colors.textMuted : colors.textSecondary,
    },
    filterChipTextActive: {
      fontFamily: FONT_FAMILY.bold,
      color: isDark ? '#000000' : '#FFFFFF',
    },
    filterBadge: {
      backgroundColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: 10,
    },
    filterBadgeActive: {
      backgroundColor: isDark ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.3)',
    },
    filterBadgeText: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 10,
      color: isDark ? colors.textMuted : colors.textSecondary,
    },
    filterBadgeTextActive: {
      color: isDark ? '#000000' : '#FFFFFF',
    },

    // List & Cards
    listContent: {
      paddingHorizontal: 5,
      paddingTop: SPACE.sm,
      paddingBottom: 110,
      gap: 10,
    },
    card: {
      backgroundColor: isDark ? colors.surface : '#FFFFFF',
      borderRadius: RADIUS.lg,
      padding: SPACE.md,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0',
      ...SHADOW.sm,
    },
    cardCriticalBorder: {
      borderColor: isDark ? 'rgba(255, 105, 97, 0.3)' : 'rgba(255, 105, 97, 0.25)',
      backgroundColor: isDark ? 'rgba(255, 105, 97, 0.02)' : '#FFFFFF',
    },
    cardTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 6,
    },
    subjectBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: isDark ? 'rgba(165,153,255,0.12)' : 'rgba(108,92,231,0.08)',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: RADIUS.sm,
      maxWidth: '52%',
    },
    subjectDot: {
      width: 5,
      height: 5,
      borderRadius: 2.5,
      backgroundColor: colors.accentPrimary,
    },
    subjectText: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 11,
      color: colors.accentPrimary,
    },
    urgencyPill: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 7,
      paddingVertical: 2.5,
      borderRadius: RADIUS.full,
      borderWidth: 1,
    },
    urgencyText: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 10,
    },
    dueDateBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    dueDateText: {
      fontFamily: FONT_FAMILY.body,
      fontSize: 11,
      color: colors.textMuted,
    },

    cardTitle: {
      fontFamily: FONT_FAMILY.title,
      fontSize: 16,
      fontWeight: '600',
      color: colors.textPrimary,
      lineHeight: 22,
      marginBottom: 4,
    },
    cardNotes: {
      fontFamily: FONT_FAMILY.body,
      fontSize: 12,
      color: colors.textMuted,
      lineHeight: 16,
      marginBottom: 8,
      paddingTop: 4,
    },
    cardBottomRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 6,
      paddingTop: 6,
      borderTopWidth: 1,
      borderTopColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
    },
    marksBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    marksText: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 11,
      color: colors.accentPrimary,
    },
    statusTogglePill: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: RADIUS.full,
      borderWidth: 1,
    },
    statusToggleText: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 11,
    },

    // Floating Button
    fab: {
      position: 'absolute',
      bottom: 90,
      right: 20,
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.accentPrimary,
      alignItems: 'center',
      justifyContent: 'center',
      ...SHADOW.lg,
      elevation: 6,
    },

    // 1-Tap Sync Card
    syncCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#F8FAFC',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0',
      borderRadius: RADIUS.md,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 2,
    },
    syncCardTitle: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 11.5,
      color: colors.textPrimary,
    },
    syncCardSub: {
      fontFamily: FONT_FAMILY.body,
      fontSize: 10,
      color: colors.textMuted,
      marginTop: 2,
      lineHeight: 14,
    },

    // Sheet Modal Layout
    sheetContainer: {
      paddingHorizontal: 2,
    },
    sheetHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingBottom: 10,
      marginBottom: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
    },
    sheetTitle: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 17,
      letterSpacing: -0.2,
      color: colors.textPrimary,
    },
    sheetSubtitle: {
      fontFamily: FONT_FAMILY.body,
      fontSize: 11.5,
      color: colors.textMuted,
      marginTop: 1,
    },
    sheetCloseBtn: {
      padding: 5,
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
      borderRadius: RADIUS.full,
    },
    sheetScrollBody: {
      paddingBottom: 10,
      gap: 10,
    },

    // Form Sections
    formSection: {
      width: '100%',
    },
    inputLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4.5,
      marginBottom: 4,
    },
    inputLabel: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 10,
      color: isDark ? colors.textMuted : colors.textSecondary,
      letterSpacing: 0.6,
    },
    subInputLabel: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 9,
      color: colors.textMuted,
      letterSpacing: 0.6,
      marginBottom: 3,
    },
    textInput: {
      backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#F8FAFC',
      borderRadius: RADIUS.md,
      paddingHorizontal: 12,
      paddingVertical: 9,
      color: colors.textPrimary,
      fontFamily: FONT_FAMILY.body,
      fontSize: 13,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0',
    },
    notesAreaInput: {
      backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#F8FAFC',
      borderRadius: RADIUS.md,
      paddingHorizontal: 12,
      paddingVertical: 9,
      color: colors.textPrimary,
      fontFamily: FONT_FAMILY.body,
      fontSize: 12.5,
      minHeight: 56,
      maxHeight: 90,
      textAlignVertical: 'top',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0',
    },

    // Subject Chips
    subjectChipsRow: {
      marginBottom: 5,
    },
    subjectChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 5.5,
      borderRadius: RADIUS.full,
      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F1F5F9',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0',
      marginRight: 5,
    },
    subjectChipActive: {
      backgroundColor: colors.accentPrimary,
      borderColor: colors.accentPrimary,
    },
    subjectChipDot: {
      width: 4.5,
      height: 4.5,
      borderRadius: 2.5,
      backgroundColor: colors.accentPrimary,
    },
    subjectChipText: {
      fontFamily: FONT_FAMILY.medium,
      fontSize: 11,
      color: isDark ? colors.textMuted : colors.textSecondary,
    },
    subjectChipTextActive: {
      fontFamily: FONT_FAMILY.bold,
      color: isDark ? '#000000' : '#FFFFFF',
    },

    // Due Date Presets
    datePresetsRow: {
      flexDirection: 'row',
      gap: 5,
      marginBottom: 6,
    },
    datePresetPill: {
      flex: 1,
      paddingVertical: 6,
      borderRadius: RADIUS.sm,
      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F1F5F9',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0',
    },
    datePresetText: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 10,
      color: colors.accentPrimary,
      letterSpacing: 0.2,
    },
    datePickerBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#F8FAFC',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0',
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: RADIUS.md,
    },
    datePickerBtnText: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 12.5,
      color: colors.textPrimary,
    },

    // Status Grid
    statusGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    statusSelectChip: {
      flex: 1,
      minWidth: '47%',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 8,
      paddingVertical: 8,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#CBD5E1',
      backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#F8FAFC',
    },
    statusSelectText: {
      fontFamily: FONT_FAMILY.medium,
      fontSize: 11.5,
      color: isDark ? colors.textMuted : colors.textPrimary,
    },

    // Marks Section
    toggleMarksBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      marginTop: 6,
      paddingVertical: 3,
    },
    toggleMarksText: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 11.5,
      color: colors.accentPrimary,
    },
    marksInputRow: {
      flexDirection: 'row',
      gap: 6,
      marginTop: 4,
    },

    // Sticky Bottom Action Container
    sheetFooter: {
      paddingTop: 8,
      paddingBottom: 4,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
    },
    saveButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? '#FFFFFF' : '#0A0A0E',
      paddingVertical: 13.5,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: isDark ? '#FFFFFF' : '#0A0A0E',
      width: '100%',
      ...SHADOW.sm,
    },
    saveButtonText: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 14.5,
      letterSpacing: 0.2,
      color: isDark ? '#0A0A0E' : '#FFFFFF',
    },
  });
