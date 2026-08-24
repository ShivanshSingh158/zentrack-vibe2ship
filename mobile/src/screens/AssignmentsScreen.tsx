import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  Platform,
  Alert,
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
import { collection, addDoc, updateDoc, deleteDoc, doc, setDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import DateTimePicker from '@react-native-community/datetimepicker';
import { COLLECTION } from '../config/constants';
import { useTheme } from '../contexts/ThemeContext';
import { useSaraSurface } from '../hooks/useSaraSurface';
import SaraHUDBanner from '../components/SARA/SaraHUDBanner';
import { handleSyncError } from '../utils/errorUtils';
import EmptyState from '../components/ui/EmptyState';
import { awardXP } from '../services/xpSystem';

const getStatusConfig = (isDark: boolean) => ({
  not_started: {
    label: 'Not Started',
    color: isDark ? '#6b7280' : '#64748B',
    bg: isDark ? 'rgba(107,114,128,0.1)' : 'rgba(100,116,139,0.10)',
    icon: 'time-outline' as const,
  },
  in_progress: {
    label: 'In Progress',
    color: isDark ? '#f59e0b' : '#D97706',
    bg: isDark ? 'rgba(245,158,11,0.1)' : 'rgba(217,119,6,0.10)',
    icon: 'create-outline' as const,
  },
  submitted: {
    label: 'Submitted',
    color: isDark ? '#3b82f6' : '#0284C7',
    bg: isDark ? 'rgba(59,130,246,0.1)' : 'rgba(2,132,199,0.10)',
    icon: 'document-text-outline' as const,
  },
  graded: {
    label: 'Graded',
    color: isDark ? '#10b981' : '#059669',
    bg: isDark ? 'rgba(16,185,129,0.1)' : 'rgba(5,150,105,0.10)',
    icon: 'checkmark-circle-outline' as const,
  },
});

/** Formats a date string (YYYY-MM-DD) or Date object to DD-MM-YYYY */
const formatDDMMYYYY = (dateInput: Date | string): string => {
  if (!dateInput) return '';
  if (typeof dateInput === 'string') {
    const parts = dateInput.split('T')[0].split('-');
    if (parts.length === 3 && parts[0].length === 4) {
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
  }
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return String(dateInput);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
};

/** Converts a Date to YYYY-MM-DD ISO date string */
const toISODate = (d: Date): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getDaysUntilDue = (dueDateStr: string) => {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const [y, m, d] = (dueDateStr || '').split('-').map(Number);
  if (!y || !m || !d) return 0;
  const due = new Date(y, m - 1, d);
  return Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
};

export default function AssignmentsScreen() {
  const { colors, isDark } = useTheme();
  const styles = makeStyles(colors, isDark);
  const {
    assignments,
    attendance,
    optimisticAddAssignment,
    optimisticUpdateAssignment,
    optimisticDeleteAssignment,
  } = useAcademicData();
  const { user } = useCoreData();

  const statusConfig = useMemo(() => getStatusConfig(isDark), [isDark]);

  // PSI surface injection — 48h deadline alert
  const psiCtx = useMemo(() => ({ assignments: assignments as any[] }), [assignments]);
  const { surfaceMessage, surfaceActionLabel, dismissBanner } = useSaraSurface('Assignments', psiCtx as any, user?.uid);

  const [filter, setFilter] = useState<'all' | 'not_started' | 'in_progress' | 'submitted' | 'graded'>('all');

  // Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form Fields
  const [title, setTitle] = useState('');
  const [subjectName, setSubjectName] = useState('');
  const [dueDate, setDueDate] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);
  const [status, setStatus] = useState<Assignment['status']>('not_started');
  const [weightage, setWeightage] = useState('');
  const [maxMarks, setMaxMarks] = useState('');
  const [obtainedMarks, setObtainedMarks] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const resetForm = () => {
    setTitle('');
    setSubjectName(attendance[0]?.name || '');
    setDueDate(new Date());
    setStatus('not_started');
    setWeightage('');
    setMaxMarks('');
    setObtainedMarks('');
    setNotes('');
    setEditingId(null);
  };

  const handleSave = async () => {
    if (!title.trim() || !subjectName.trim() || !user) {
      Alert.alert('Required', 'Please enter a title and select a subject.');
      return;
    }

    import('expo-haptics').then((Haptics) =>
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    );

    setSaving(true);
    const dueDateStr = toISODate(dueDate);
    const now = Date.now();

    const assignmentData: Partial<Assignment> = {
      userId: user.uid,
      title: title.trim(),
      subjectName: subjectName.trim(),
      dueDate: dueDateStr,
      status,
      weightage: weightage ? parseFloat(weightage) : undefined,
      maxMarks: maxMarks ? parseFloat(maxMarks) : undefined,
      obtainedMarks: obtainedMarks ? parseFloat(obtainedMarks) : undefined,
      notes: notes.trim(),
      description: notes.trim(),
      updatedAt: now,
    };

    try {
      if (editingId) {
        optimisticUpdateAssignment(editingId, assignmentData);
        await updateDoc(doc(db, COLLECTION.ASSIGNMENTS, editingId), assignmentData);
      } else {
        const newAssignment: Assignment = {
          ...assignmentData,
          createdAt: now,
        } as Assignment;

        const docRef = await addDoc(collection(db, COLLECTION.ASSIGNMENTS), newAssignment);
        optimisticAddAssignment({ ...newAssignment, id: docRef.id });
        awardXP('TASK_COMPLETE').catch(() => {});
      }
    } catch (err) {
      handleSyncError(err);
    } finally {
      setSaving(false);
      setModalVisible(false);
      resetForm();
    }
  };

  const confirmDelete = (id: string) => {
    Alert.alert('Delete', 'Are you sure you want to delete this assignment?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            optimisticDeleteAssignment(id);
            await deleteDoc(doc(db, COLLECTION.ASSIGNMENTS, id));
          } catch (e) {
            console.error(e);
          }
        },
      },
    ]);
  };

  const openEdit = (a: Assignment) => {
    setEditingId(a.id!);
    setTitle(a.title);
    setSubjectName(a.subjectName);
    setStatus(a.status);
    setDueDate(new Date(a.dueDate + 'T00:00:00'));
    setWeightage(a.weightage !== undefined ? String(a.weightage) : '');
    setMaxMarks(a.maxMarks !== undefined ? String(a.maxMarks) : '');
    setObtainedMarks(a.obtainedMarks !== undefined ? String(a.obtainedMarks) : '');
    setNotes(a.notes || a.description || '');
    setModalVisible(true);
  };

  const setQuickDate = (daysFromNow: number) => {
    import('expo-haptics').then((Haptics) =>
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    );
    const d = new Date();
    d.setDate(d.getDate() + daysFromNow);
    setDueDate(d);
  };

  const filteredData = useMemo(() => {
    let list = [...assignments];
    if (filter !== 'all') {
      list = list.filter((a) => a.status === filter);
    }
    list.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    return list;
  }, [assignments, filter]);

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style={isDark ? 'light' : 'dark'} backgroundColor={colors.background} />

      {/* Cap 5: PSI surface banner — fires when any assignment is due within 48h */}
      <SaraHUDBanner
        message={surfaceMessage || ''}
        visible={!!surfaceMessage}
        onDismiss={dismissBanner}
        actionLabel={surfaceActionLabel || undefined}
      />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerLabel}>ACADEMICS</Text>
          <Text style={styles.headerTitle}>Assignments</Text>
        </View>
      </View>

      {/* Filter Chips */}
      <View style={styles.filterScroll}>
        <FlashList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={['all', 'not_started', 'in_progress', 'submitted', 'graded']}
          keyExtractor={(i) => i}
          renderItem={({ item }) => {
            const label =
              item === 'all'
                ? 'All'
                : statusConfig[item as keyof typeof statusConfig].label;
            const isActive = filter === item;
            return (
              <AnimatedPressable
                style={[styles.filterChip, isActive && styles.filterChipActive]}
                onPress={() => setFilter(item as any)}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    isActive && styles.filterChipTextActive,
                  ]}
                >
                  {label}
                </Text>
              </AnimatedPressable>
            );
          }}
        />
      </View>

      {/* List */}
      <FlashList
        data={filteredData}
        keyExtractor={(a) => a.id!}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => {
          const conf = statusConfig[item.status];
          const daysLeft = getDaysUntilDue(item.dueDate);
          let urgencyColor = colors.textMuted;
          let urgencyText = '';

          if (item.status === 'submitted' || item.status === 'graded') {
            urgencyText = 'Done';
          } else if (daysLeft < 0) {
            urgencyColor = colors.error || '#EF4444';
            urgencyText = `Overdue by ${Math.abs(daysLeft)}d`;
          } else if (daysLeft === 0) {
            urgencyColor = colors.accentAmber || '#F59E0B';
            urgencyText = 'Due Today';
          } else {
            urgencyColor =
              daysLeft <= 3
                ? colors.accentAmber || '#F59E0B'
                : colors.accentGreen || '#10B981';
            urgencyText = `${daysLeft}d left`;
          }

          return (
            <AnimatedPressable
              style={styles.card}
              onPress={() => openEdit(item)}
              onLongPress={() => confirmDelete(item.id!)}
            >
              <View style={styles.cardHeader}>
                <View style={styles.cardHeaderLeft}>
                  <View style={[styles.statusIcon, { backgroundColor: conf.bg }]}>
                    <Ionicons name={conf.icon} size={16} color={conf.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{item.title}</Text>
                    <View style={styles.cardSubRow}>
                      <Text style={styles.cardSub}>{item.subjectName}</Text>
                      {item.weightage !== undefined && (
                        <Text style={styles.cardSubMeta}>· {item.weightage}% wt</Text>
                      )}
                      {item.maxMarks !== undefined && (
                        <Text style={styles.cardSubMeta}>
                          · {item.obtainedMarks !== undefined ? `${item.obtainedMarks}/${item.maxMarks}` : `${item.maxMarks}`} pts
                        </Text>
                      )}
                    </View>
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end', minWidth: 85 }}>
                  <Text style={[styles.urgencyText, { color: urgencyColor }]}>
                    {urgencyText}
                  </Text>
                  <Text style={styles.dueDateText}>
                    {formatDDMMYYYY(item.dueDate)}
                  </Text>
                </View>
              </View>

              {item.notes ? (
                <Text style={styles.cardNotesSnippet} numberOfLines={1}>
                  {item.notes}
                </Text>
              ) : null}
            </AnimatedPressable>
          );
        }}
        ListEmptyComponent={
          <EmptyState
            mascot="idle"
            title="All caught up!"
            subtitle="No pending assignments right now."
          />
        }
      />

      {/* FAB */}
      <AnimatedPressable
        style={styles.fab}
        onPress={() => {
          resetForm();
          setModalVisible(true);
        }}
      >
        <Ionicons name="add" size={26} color={isDark ? '#1a110a' : '#FFFFFF'} />
      </AnimatedPressable>

      {/* Add/Edit Modal */}
      {modalVisible && (
        <BottomSheet visible={modalVisible} onClose={() => setModalVisible(false)}>
          <ScrollView
            style={styles.modalScroll}
            contentContainerStyle={styles.modalContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingId ? 'Edit Assignment' : 'New Assignment'}
              </Text>
              <AnimatedPressable
                onPress={() => setModalVisible(false)}
                style={{ padding: 4 }}
              >
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </AnimatedPressable>
            </View>

            {/* Title */}
            <Text style={styles.inputLabel}>Title</Text>
            <TextInput
              style={styles.input}
              placeholder="E.g., Operating Systems Lab 4"
              placeholderTextColor={colors.textMuted}
              value={title}
              onChangeText={setTitle}
            />

            {/* Subject Selector from Timetable & Text Input */}
            <Text style={styles.inputLabel}>Subject</Text>
            {attendance && attendance.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.subjectChipsScroll}
              >
                {attendance.map((sub) => {
                  const isSelected = subjectName === sub.name;
                  return (
                    <AnimatedPressable
                      key={sub.id}
                      style={[
                        styles.subjectChip,
                        isSelected && styles.subjectChipActive,
                      ]}
                      onPress={() => setSubjectName(sub.name)}
                    >
                      <View
                        style={[
                          styles.subjectChipDot,
                          isSelected && { backgroundColor: isDark ? '#000000' : '#FFFFFF' },
                        ]}
                      />
                      <Text
                        style={[
                          styles.subjectChipText,
                          isSelected && styles.subjectChipTextActive,
                        ]}
                      >
                        {sub.name}
                      </Text>
                    </AnimatedPressable>
                  );
                })}
              </ScrollView>
            )}
            <TextInput
              style={styles.input}
              placeholder="Or type custom subject..."
              placeholderTextColor={colors.textMuted}
              value={subjectName}
              onChangeText={setSubjectName}
            />

            {/* Due Date Presets & Picker */}
            <Text style={styles.inputLabel}>Due Date (DD-MM-YYYY)</Text>
            <View style={styles.presetsRow}>
              {[
                { label: 'Today', days: 0 },
                { label: 'Tomorrow', days: 1 },
                { label: '3 Days', days: 3 },
                { label: '1 Week', days: 7 },
              ].map((p) => (
                <AnimatedPressable
                  key={p.label}
                  style={styles.presetBtn}
                  onPress={() => setQuickDate(p.days)}
                >
                  <Text style={styles.presetBtnText}>{p.label}</Text>
                </AnimatedPressable>
              ))}
            </View>

            <AnimatedPressable
              style={styles.dateBtn}
              onPress={() => setShowPicker(true)}
            >
              <Ionicons
                name="calendar-outline"
                size={20}
                color={colors.accentPrimary}
              />
              <Text style={styles.dateBtnText}>{formatDDMMYYYY(dueDate)}</Text>
            </AnimatedPressable>

            {showPicker && (
              <DateTimePicker
                value={dueDate}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(event, selectedDate) => {
                  setShowPicker(Platform.OS === 'ios');
                  if (selectedDate) setDueDate(selectedDate);
                }}
              />
            )}

            {/* Weightage % & Marks Grid */}
            <View style={styles.twoColRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>Weightage (%)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="E.g., 20"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numeric"
                  value={weightage}
                  onChangeText={setWeightage}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>Max Marks</Text>
                <TextInput
                  style={styles.input}
                  placeholder="E.g., 100"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numeric"
                  value={maxMarks}
                  onChangeText={setMaxMarks}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>Obtained</Text>
                <TextInput
                  style={styles.input}
                  placeholder="E.g., 92"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numeric"
                  value={obtainedMarks}
                  onChangeText={setObtainedMarks}
                />
              </View>
            </View>

            {/* Status */}
            <Text style={styles.inputLabel}>Status</Text>
            <View style={styles.statusRow}>
              {(Object.keys(statusConfig) as Array<keyof typeof statusConfig>).map(
                (k) => {
                  const conf = statusConfig[k];
                  const isSelected = status === k;
                  return (
                    <AnimatedPressable
                      key={k}
                      style={[
                        styles.statusChip,
                        isSelected && {
                          backgroundColor: conf.color,
                          borderColor: conf.color,
                        },
                      ]}
                      onPress={() => setStatus(k as any)}
                    >
                      <Text
                        style={[
                          styles.statusChipText,
                          isSelected && { color: '#FFFFFF' },
                        ]}
                      >
                        {conf.label}
                      </Text>
                    </AnimatedPressable>
                  );
                }
              )}
            </View>

            {/* Markdown Notes / Rubric */}
            <Text style={styles.inputLabel}>Markdown Notes / Rubric</Text>
            <TextInput
              style={[styles.input, styles.notesInput]}
              placeholder="Add submission links, grading rubric, or notes..."
              placeholderTextColor={colors.textMuted}
              multiline
              value={notes}
              onChangeText={setNotes}
            />

            <AnimatedPressable
              style={[styles.saveBtn, saving && { opacity: 0.5 }]}
              onPress={handleSave}
              disabled={saving}
            >
              <Text style={styles.saveBtnText}>
                {saving
                  ? 'Saving...'
                  : editingId
                  ? 'Update Assignment'
                  : 'Save Assignment (+50 XP)'}
              </Text>
            </AnimatedPressable>
          </ScrollView>
        </BottomSheet>
      )}
    </SafeAreaView>
  );
}

const makeStyles = (colors: any, isDark: boolean = true) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingHorizontal: SPACE.xl,
      paddingTop: SPACE.lg,
      paddingBottom: SPACE.md,
    },
    headerLabel: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: FONT_SIZE.xs,
      color: colors.textMuted,
      letterSpacing: 2,
      marginBottom: 2,
    },
    headerTitle: {
      fontFamily: FONT_FAMILY.title,
      fontSize: FONT_SIZE.xxl,
      color: colors.textPrimary,
    },

    filterScroll: {
      paddingHorizontal: SPACE.xl,
      marginBottom: SPACE.md,
      height: 40,
    },
    filterChip: {
      paddingHorizontal: SPACE.md,
      paddingVertical: SPACE.sm,
      borderRadius: RADIUS.full,
      backgroundColor: isDark ? colors.surface2 : '#FFFFFF',
      borderWidth: 1,
      borderColor: isDark ? colors.border : '#E2E1EA',
      marginRight: SPACE.sm,
    },
    filterChipActive: {
      backgroundColor: colors.accentPrimary,
      borderColor: colors.accentPrimary,
    },
    filterChipText: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: FONT_SIZE.xs,
      color: isDark ? colors.textMuted : colors.textSecondary,
    },
    filterChipTextActive: { color: isDark ? '#000000' : '#FFFFFF' },

    list: { padding: SPACE.xl, gap: SPACE.md, paddingBottom: 100 },
    card: {
      backgroundColor: isDark ? colors.surface : '#FFFFFF',
      borderRadius: RADIUS.lg,
      padding: SPACE.lg,
      borderWidth: 1,
      borderColor: colors.border,
      elevation: isDark ? 0 : 1,
      shadowColor: isDark ? '#000000' : 'rgba(0,0,0,0.04)',
      shadowOffset: { width: 0, height: 1 },
      shadowRadius: 2,
      shadowOpacity: isDark ? 0 : 0.5,
    },
    cardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    cardHeaderLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACE.md,
      flex: 1,
      marginRight: 8,
    },
    statusIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardTitle: {
      fontFamily: FONT_FAMILY.title,
      fontSize: FONT_SIZE.md,
      color: colors.textPrimary,
    },
    cardSubRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      gap: 4,
      marginTop: 2,
    },
    cardSub: {
      fontFamily: FONT_FAMILY.body,
      fontSize: FONT_SIZE.sm,
      color: colors.textMuted,
    },
    cardSubMeta: {
      fontFamily: FONT_FAMILY.medium,
      fontSize: FONT_SIZE.xs,
      color: colors.accentPrimary,
    },
    cardNotesSnippet: {
      fontFamily: FONT_FAMILY.body,
      fontSize: FONT_SIZE.xs,
      color: colors.textMuted,
      marginTop: 8,
      paddingTop: 6,
      borderTopWidth: 1,
      borderTopColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
    },
    urgencyText: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: FONT_SIZE.xs,
      marginBottom: 2,
    },
    dueDateText: {
      fontFamily: FONT_FAMILY.body,
      fontSize: FONT_SIZE.xs,
      color: colors.textMuted,
    },

    empty: {
      padding: SPACE.xl,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 40,
    },
    emptyText: {
      fontFamily: FONT_FAMILY.body,
      color: colors.textMuted,
      fontSize: FONT_SIZE.md,
    },

    fab: {
      position: 'absolute',
      bottom: 100,
      right: SPACE.xl,
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.accentPrimary,
      alignItems: 'center',
      justifyContent: 'center',
      ...SHADOW.md,
    },

    modalScroll: {
      maxHeight: 520,
    },
    modalContent: {
      paddingTop: 4,
      paddingBottom: 24,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: SPACE.md,
    },
    modalTitle: {
      fontFamily: FONT_FAMILY.title,
      fontSize: FONT_SIZE.xl,
      color: colors.textPrimary,
    },

    inputLabel: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: FONT_SIZE.xs,
      color: isDark ? colors.textMuted : colors.textSecondary,
      letterSpacing: 0.8,
      marginBottom: SPACE.xs,
      marginTop: SPACE.sm,
      textTransform: 'uppercase',
    },
    input: {
      backgroundColor: isDark ? colors.surface2 : '#F0EFF7',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#E2E1EA',
      borderRadius: RADIUS.md,
      paddingHorizontal: SPACE.md,
      paddingVertical: 10,
      color: colors.textPrimary,
      fontFamily: FONT_FAMILY.body,
      fontSize: FONT_SIZE.md,
    },
    notesInput: {
      height: 72,
      textAlignVertical: 'top',
    },

    subjectChipsScroll: {
      marginBottom: 8,
    },
    subjectChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: RADIUS.full,
      backgroundColor: isDark ? colors.surface2 : '#F0EFF7',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#E2E1EA',
      marginRight: 6,
    },
    subjectChipActive: {
      backgroundColor: colors.accentPrimary,
      borderColor: colors.accentPrimary,
    },
    subjectChipDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.accentPrimary,
    },
    subjectChipText: {
      fontFamily: FONT_FAMILY.medium,
      fontSize: FONT_SIZE.xs,
      color: isDark ? colors.textMuted : colors.textSecondary,
    },
    subjectChipTextActive: {
      fontFamily: FONT_FAMILY.bold,
      color: isDark ? '#000000' : '#FFFFFF',
    },

    presetsRow: {
      flexDirection: 'row',
      gap: 6,
      marginBottom: 8,
    },
    presetBtn: {
      flex: 1,
      paddingVertical: 7,
      borderRadius: RADIUS.sm,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
    },
    presetBtnText: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 11,
      color: colors.accentPrimary,
    },

    twoColRow: {
      flexDirection: 'row',
      gap: 8,
    },

    dateBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: SPACE.sm,
      backgroundColor: isDark ? colors.surface2 : '#F0EFF7',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#E2E1EA',
      paddingHorizontal: SPACE.md,
      paddingVertical: 11,
      borderRadius: RADIUS.md,
      marginBottom: 4,
    },
    dateBtnText: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: FONT_SIZE.md,
      color: colors.textPrimary,
    },

    statusRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: SPACE.sm,
      marginTop: 2,
    },
    statusChip: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: RADIUS.full,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#E2E1EA',
      backgroundColor: isDark ? colors.surface2 || colors.surface : '#F0EFF7',
    },
    statusChipText: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: FONT_SIZE.xs,
      color: isDark ? colors.textMuted : colors.textPrimary,
    },

    saveBtn: {
      backgroundColor: colors.accentPrimary,
      paddingVertical: 14,
      borderRadius: RADIUS.lg,
      alignItems: 'center',
      marginTop: SPACE.lg,
      marginBottom: SPACE.xs,
    },
    saveBtnText: {
      fontFamily: FONT_FAMILY.bold,
      color: isDark ? '#1a110a' : '#FFFFFF',
      fontSize: FONT_SIZE.md,
    },
  });
