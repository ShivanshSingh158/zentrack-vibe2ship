import React, { useState, useMemo, useCallback, useRef } from 'react';
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
} from 'react-native';
import AnimatedPressable from '../components/AnimatedPressable';
import BottomSheet from '../components/ui/BottomSheet';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useAcademicData } from '../contexts/domains/AcademicContext';
import { useCoreData } from '../contexts/domains/CoreDataContext';
import type { Assignment } from '../contexts/MobileDataContext';
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
  const { user } = useCoreData();

  React.useEffect(() => {
    const handle = InteractionManager.runAfterInteractions(() => ensureSubscribed?.());
    return () => handle.cancel();
  }, [ensureSubscribed]);

  const statusConfig = useMemo(() => getStatusConfig(isDark), [isDark]);

  // SARA HUD Banner surface injection (48h deadline alert)
  const psiCtx = useMemo(() => ({ assignments: assignments as any[] }), [assignments]);
  const { surfaceMessage, surfaceActionLabel, dismissBanner } = useSaraSurface('Assignments', psiCtx as any, user?.uid);

  // Filters & Search
  const [filter, setFilter] = useState<'all' | AssignmentStatus>('all');
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
    setModalVisible(true);
  }, []);

  const setQuickDate = useCallback((daysFromNow: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const d = new Date();
    d.setDate(d.getDate() + daysFromNow);
    setDueDate(d);
  }, []);

  // 0ms Optimistic Save with Background SafeWrite
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

      // 2. Background Firestore Sync
      safeWrite(
        () => setDoc(doc(db, COLLECTION.ASSIGNMENTS, newId), newAssignment),
        COLLECTION.ASSIGNMENTS,
        'set',
        newAssignment,
        newId
      ).catch(handleSyncError);

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
    optimisticUpdateAssignment,
    optimisticAddAssignment,
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

  // Filter & Search Aggregation
  const { filteredList, counts } = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const all = assignments || [];

    const stats = {
      all: all.length,
      not_started: 0,
      in_progress: 0,
      submitted: 0,
      graded: 0,
    };

    all.forEach((a) => {
      if (stats[a.status] !== undefined) stats[a.status]++;
    });

    let result = all;
    if (filter !== 'all') {
      result = result.filter((a) => a.status === filter);
    }
    if (q) {
      result = result.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          (a.subjectName && a.subjectName.toLowerCase().includes(q)) ||
          (a.notes && a.notes.toLowerCase().includes(q))
      );
    }

    result.sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
    return { filteredList: result, counts: stats };
  }, [assignments, filter, searchQuery]);

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
          const daysLeft = getDaysUntilDue(item.dueDate);
          let urgencyColor = colors.textMuted;
          let urgencyText = '';

          if (item.status === 'submitted' || item.status === 'graded') {
            urgencyText = item.status === 'graded' ? 'Graded' : 'Submitted';
            urgencyColor = colors.accentGreen || '#10B981';
          } else if (daysLeft < 0) {
            urgencyColor = colors.error || '#EF4444';
            urgencyText = `Overdue by ${Math.abs(daysLeft)}d`;
          } else if (daysLeft === 0) {
            urgencyColor = colors.accentAmber || '#F59E0B';
            urgencyText = 'Due Today';
          } else if (daysLeft <= 3) {
            urgencyColor = colors.accentAmber || '#F59E0B';
            urgencyText = `${daysLeft}d left`;
          } else {
            urgencyColor = colors.accentGreen || '#10B981';
            urgencyText = `${daysLeft}d left`;
          }

          return (
            <AnimatedPressable
              style={styles.card}
              onPress={() => openEdit(item)}
              onLongPress={() => confirmDelete(item.id!, item.title)}
            >
              {/* Top Row: Subject & Due Date */}
              <View style={styles.cardTopRow}>
                <View style={styles.subjectBadge}>
                  <View style={styles.subjectDot} />
                  <Text style={styles.subjectText} numberOfLines={1}>
                    {item.subjectName || 'General'}
                  </Text>
                </View>

                <View style={styles.urgencyBadge}>
                  <Text style={[styles.urgencyText, { color: urgencyColor }]}>
                    {urgencyText}
                  </Text>
                  <Text style={styles.dueDateText}>
                    • {formatDDMMYYYY(item.dueDate)}
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
                  <View style={{ flex: 1 }} />
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
            title={searchQuery ? 'No matching assignments' : 'All caught up!'}
            subtitle={searchQuery ? 'Try clearing your search or filter.' : 'Tap + to track your upcoming assignment.'}
          />
        }
      />

      {/* Floating Action Button */}
      <AnimatedPressable style={styles.fab} onPress={openCreate}>
        <Ionicons name="add" size={28} color={isDark ? '#1a110a' : '#FFFFFF'} />
      </AnimatedPressable>

      {/* Add / Edit Assignment Sheet */}
      {modalVisible && (
        <BottomSheet visible={modalVisible} onClose={() => setModalVisible(false)}>
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
                <Ionicons name="close" size={22} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.sheetScrollBody}
            >
              {/* 1. Title Input */}
              <Text style={styles.inputLabel}>ASSIGNMENT TITLE *</Text>
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

              {/* 2. Course / Subject Selection + Custom Input */}
              <Text style={styles.inputLabel}>COURSE / SUBJECT</Text>
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
                style={[styles.textInput, { marginTop: 6 }]}
                placeholder="Type or edit custom subject name..."
                placeholderTextColor={colors.textMuted}
                value={subjectName}
                onChangeText={setSubjectName}
                autoCapitalize="words"
              />

              {/* 3. Due Date & Quick Selectors */}
              <Text style={styles.inputLabel}>DUE DATE</Text>
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
                <Ionicons name="calendar-outline" size={18} color={colors.accentPrimary} style={{ marginRight: 8 }} />
                <Text style={styles.datePickerBtnText}>
                  {formatDisplayDate(dueDate)} ({formatDDMMYYYY(dueDate)})
                </Text>
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

              {/* 4. Status Segmented Buttons */}
              <Text style={styles.inputLabel}>STATUS</Text>
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
                        size={15}
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

              {/* 5. Marks / Grading Section Toggle */}
              <TouchableOpacity
                style={styles.toggleMarksBtn}
                onPress={() => setShowMarksFields((v) => !v)}
              >
                <Ionicons
                  name={showMarksFields ? 'chevron-up-circle-outline' : 'add-circle-outline'}
                  size={16}
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

              {/* 6. Notes / Rubric / Submission Link */}
              <Text style={styles.inputLabel}>NOTES / RUBRIC / SUBMISSION LINK</Text>
              <TextInput
                style={styles.notesAreaInput}
                placeholder="Add assignment rubric, drive links, instructions, or notes..."
                placeholderTextColor={colors.textMuted}
                multiline
                value={notes}
                onChangeText={setNotes}
                autoCapitalize="sentences"
              />

              {/* 7. Save Action Button */}
              <AnimatedPressable
                style={[styles.saveButton, saving && { opacity: 0.6 }]}
                onPress={handleSave}
                disabled={saving}
              >
                <Ionicons name="checkmark-circle" size={20} color={isDark ? '#000000' : '#FFFFFF'} style={{ marginRight: 6 }} />
                <Text style={styles.saveButtonText}>
                  {saving ? 'Saving...' : editingId ? 'Update Assignment' : 'Save Assignment (+50 XP)'}
                </Text>
              </AnimatedPressable>
            </ScrollView>
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
      paddingHorizontal: SPACE.xl,
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

    // Search
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: SPACE.xl,
      marginTop: SPACE.sm,
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
      paddingHorizontal: SPACE.xl,
      gap: 8,
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
      paddingHorizontal: SPACE.xl,
      paddingTop: SPACE.sm,
      paddingBottom: 110,
      gap: 12,
    },
    card: {
      backgroundColor: isDark ? colors.surface : '#FFFFFF',
      borderRadius: RADIUS.lg,
      padding: SPACE.md,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0',
      ...SHADOW.sm,
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
      maxWidth: '55%',
    },
    subjectDot: {
      width: 5,
      height: 5,
      borderRadius: 3,
      backgroundColor: colors.accentPrimary,
    },
    subjectText: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 11,
      color: colors.accentPrimary,
    },
    urgencyBadge: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    urgencyText: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 11,
    },
    dueDateText: {
      fontFamily: FONT_FAMILY.body,
      fontSize: 11,
      color: colors.textMuted,
      marginLeft: 4,
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

    // Sheet Modal Layout
    sheetContainer: {
      paddingHorizontal: 4,
    },
    sheetHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 14,
      paddingBottom: 10,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
    },
    sheetTitle: {
      fontFamily: FONT_FAMILY.title,
      fontSize: 20,
      fontWeight: 'bold',
      color: colors.textPrimary,
    },
    sheetSubtitle: {
      fontFamily: FONT_FAMILY.body,
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 2,
    },
    sheetCloseBtn: {
      padding: 6,
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
      borderRadius: RADIUS.full,
    },
    sheetScrollBody: {
      paddingBottom: 40,
    },

    // Inputs
    inputLabel: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 11,
      color: isDark ? colors.textMuted : colors.textSecondary,
      letterSpacing: 1,
      marginBottom: 6,
      marginTop: 12,
    },
    subInputLabel: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 10,
      color: colors.textMuted,
      letterSpacing: 0.8,
      marginBottom: 4,
    },
    textInput: {
      backgroundColor: isDark ? colors.surface2 : '#F8FAFC',
      borderRadius: RADIUS.md,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: colors.textPrimary,
      fontFamily: FONT_FAMILY.body,
      fontSize: 14,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#CBD5E1',
    },
    notesAreaInput: {
      backgroundColor: isDark ? colors.surface2 : '#F8FAFC',
      borderRadius: RADIUS.md,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: colors.textPrimary,
      fontFamily: FONT_FAMILY.body,
      fontSize: 13,
      minHeight: 85,
      maxHeight: 160,
      textAlignVertical: 'top',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#CBD5E1',
    },

    // Subject Chips
    subjectChipsRow: {
      marginBottom: 4,
    },
    subjectChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: RADIUS.full,
      backgroundColor: isDark ? colors.surface2 : '#F1F5F9',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0',
      marginRight: 6,
    },
    subjectChipActive: {
      backgroundColor: colors.accentPrimary,
      borderColor: colors.accentPrimary,
    },
    subjectChipDot: {
      width: 5,
      height: 5,
      borderRadius: 3,
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
      gap: 6,
      marginBottom: 8,
    },
    datePresetPill: {
      flex: 1,
      paddingVertical: 6,
      borderRadius: RADIUS.sm,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#F1F5F9',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#E2E8F0',
    },
    datePresetText: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 11,
      color: colors.accentPrimary,
    },
    datePickerBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? colors.surface2 : '#F8FAFC',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#CBD5E1',
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: RADIUS.md,
    },
    datePickerBtnText: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 13,
      color: colors.textPrimary,
    },

    // Status Grid
    statusGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    statusSelectChip: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: RADIUS.full,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#CBD5E1',
      backgroundColor: isDark ? colors.surface2 : '#F8FAFC',
    },
    statusSelectText: {
      fontFamily: FONT_FAMILY.medium,
      fontSize: 12,
      color: isDark ? colors.textMuted : colors.textPrimary,
    },

    // Marks Section
    toggleMarksBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 14,
      marginBottom: 6,
    },
    toggleMarksText: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 12,
      color: colors.accentPrimary,
    },
    marksInputRow: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 4,
    },

    // Save Button
    saveButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.accentPrimary,
      paddingVertical: 14,
      borderRadius: RADIUS.lg,
      marginTop: 20,
      ...SHADOW.md,
    },
    saveButtonText: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 15,
      color: isDark ? '#000000' : '#FFFFFF',
    },
  });
