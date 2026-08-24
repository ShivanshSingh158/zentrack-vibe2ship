/**
 * AssignmentsScreen — ZenTrack Mobile
 * Luxury Minimalist Academic Assignment & Coursework Tracker
 *
 * Integrated with AcademicContext, Firestore offline-first safeWrite,
 * and unified ZenTrack Obsidian Cosmos / Frost Quartz design system.
 */

import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Modal,
  Dimensions,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import Reanimated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  Layout,
} from 'react-native-reanimated';
import { doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db, auth } from '../services/firebase';
import { useAcademicData } from '../contexts/domains/AcademicContext';
import type { Assignment } from '../contexts/MobileDataContext';
import { useTheme } from '../contexts/ThemeContext';
import { safeWrite } from '../utils/safeWrite';
import { COLLECTION } from '../config/constants';
import { FONT_FAMILY, FONT_SIZE, RADIUS, SPACE } from '../theme/tokens';
import { awardXP } from '../services/xpSystem';
import { formatDateShort } from '../utils/dateUtils';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type FilterTab = 'all' | 'pending' | 'submitted' | 'graded';
type SortOption = 'dueDate' | 'weightage' | 'subject';

export default function AssignmentsScreen() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const styles = useMemo(() => makeStyles(colors, isDark, insets), [colors, isDark, insets]);

  const {
    assignments,
    attendance,
    optimisticAddAssignment,
    optimisticUpdateAssignment,
    optimisticDeleteAssignment,
  } = useAcademicData();

  // Filter & Sort State
  const [activeTab, setActiveTab] = useState<FilterTab>('pending');
  const [sortBy, setSortBy] = useState<SortOption>('dueDate');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal State
  const [modalVisible, setModalVisible] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);

  // ── Metrics Calculation ───────────────────────────────────────────────────
  const metrics = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const now = Date.now();
    const oneWeekMs = 7 * 24 * 60 * 60 * 1000;

    let pendingCount = 0;
    let overdueCount = 0;
    let dueThisWeekCount = 0;
    let completedCount = 0;

    assignments.forEach((a) => {
      const isDone = a.status === 'submitted' || a.status === 'graded';
      if (isDone) {
        completedCount++;
      } else {
        pendingCount++;
        if (a.dueDate < todayStr) {
          overdueCount++;
        } else {
          const dueTime = new Date(a.dueDate).getTime();
          if (dueTime - now <= oneWeekMs) {
            dueThisWeekCount++;
          }
        }
      }
    });

    const total = assignments.length;
    const completionRate = total > 0 ? Math.round((completedCount / total) * 100) : 100;

    return {
      pendingCount,
      overdueCount,
      dueThisWeekCount,
      completedCount,
      total,
      completionRate,
    };
  }, [assignments]);

  // ── Filtered and Sorted Assignments ───────────────────────────────────────
  const filteredAssignments = useMemo(() => {
    return assignments
      .filter((a) => {
        // Tab Filter
        if (activeTab === 'pending') {
          if (a.status === 'submitted' || a.status === 'graded') return false;
        } else if (activeTab === 'submitted') {
          if (a.status !== 'submitted') return false;
        } else if (activeTab === 'graded') {
          if (a.status !== 'graded') return false;
        }

        // Search Filter
        if (searchQuery.trim()) {
          const query = searchQuery.toLowerCase();
          const matchesTitle = (a.title || '').toLowerCase().includes(query);
          const matchesSubject = (a.subjectName || '').toLowerCase().includes(query);
          const matchesNotes = (a.notes || '').toLowerCase().includes(query);
          if (!matchesTitle && !matchesSubject && !matchesNotes) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'dueDate') {
          return (a.dueDate || '').localeCompare(b.dueDate || '');
        }
        if (sortBy === 'weightage') {
          return (b.weightage || 0) - (a.weightage || 0);
        }
        if (sortBy === 'subject') {
          return (a.subjectName || '').localeCompare(b.subjectName || '');
        }
        return 0;
      });
  }, [assignments, activeTab, sortBy, searchQuery]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleOpenCreateModal = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditingAssignment(null);
    setModalVisible(true);
  };

  const handleOpenEditModal = (assignment: Assignment) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setEditingAssignment(assignment);
    setModalVisible(true);
  };

  const handleToggleComplete = async (assignment: Assignment) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const newStatus = assignment.status === 'submitted' ? 'in_progress' : 'submitted';
    const updated: Partial<Assignment> = {
      status: newStatus,
      updatedAt: Date.now(),
    };

    if (assignment.id) {
      optimisticUpdateAssignment(assignment.id, updated);
      const uid = auth.currentUser?.uid;
      if (uid) {
        safeWrite(
          () => updateDoc(doc(db, COLLECTION.ASSIGNMENTS, assignment.id!), updated),
          COLLECTION.ASSIGNMENTS,
          'update',
          updated,
          assignment.id
        ).catch(() => {});
      }

      if (newStatus === 'submitted') {
        awardXP('TASK_COMPLETE').catch(() => {});
      }
    }
  };

  const handleDelete = (assignment: Assignment) => {
    Alert.alert(
      'Delete Assignment',
      `Are you sure you want to delete "${assignment.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            if (assignment.id) {
              optimisticDeleteAssignment(assignment.id);
              safeWrite(
                () => deleteDoc(doc(db, COLLECTION.ASSIGNMENTS, assignment.id!)),
                COLLECTION.ASSIGNMENTS,
                'delete',
                null,
                assignment.id
              ).catch(() => {});
            }
          },
        },
      ]
    );
  };

  const handleSaveAssignment = (data: Partial<Assignment>) => {
    const uid = auth.currentUser?.uid || 'anonymous';
    const now = Date.now();

    if (editingAssignment?.id) {
      // Update existing
      const updated: Assignment = {
        ...editingAssignment,
        ...data,
        updatedAt: now,
      } as Assignment;

      optimisticUpdateAssignment(editingAssignment.id, updated);
      safeWrite(
        () => setDoc(doc(db, COLLECTION.ASSIGNMENTS, editingAssignment.id!), updated, { merge: true }),
        COLLECTION.ASSIGNMENTS,
        'update',
        updated,
        editingAssignment.id
      ).catch(() => {});
    } else {
      // Create new
      const newId = `assign_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const newAssignment: Assignment = {
        id: newId,
        userId: uid,
        title: data.title || 'Untitled Assignment',
        subjectName: data.subjectName || 'General',
        dueDate: data.dueDate || new Date().toISOString().slice(0, 10),
        weightage: data.weightage ?? 10,
        status: data.status || 'not_started',
        description: data.description || '',
        notes: data.notes || '',
        maxMarks: data.maxMarks ?? 100,
        obtainedMarks: data.obtainedMarks,
        createdAt: now,
        updatedAt: now,
      };

      optimisticAddAssignment(newAssignment);
      safeWrite(
        () => setDoc(doc(db, COLLECTION.ASSIGNMENTS, newId), newAssignment),
        COLLECTION.ASSIGNMENTS,
        'set',
        newAssignment,
        newId
      ).catch(() => {});
    }

    setModalVisible(false);
  };

  // ── Due Date Urgency Helper ───────────────────────────────────────────────
  const getDueBadge = (dueDateStr: string, status: string) => {
    if (status === 'submitted' || status === 'graded') {
      return { text: 'Done', color: '#34D399', bg: 'rgba(52, 211, 153, 0.12)' };
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    if (dueDateStr < todayStr) {
      return { text: 'Overdue', color: '#EF4444', bg: 'rgba(239, 68, 68, 0.15)' };
    }
    if (dueDateStr === todayStr) {
      return { text: 'Due Today', color: '#F59E0B', bg: 'rgba(245, 158, 11, 0.15)' };
    }

    const today = new Date();
    const due = new Date(dueDateStr);
    const diffDays = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      return { text: 'Tomorrow', color: '#FBBF24', bg: 'rgba(251, 191, 36, 0.12)' };
    }
    if (diffDays <= 7) {
      return { text: `In ${diffDays}d`, color: colors.accentPrimary, bg: isDark ? 'rgba(165,153,255,0.12)' : 'rgba(108,92,231,0.08)' };
    }
    return { text: formatDateShort(dueDateStr), color: colors.textMuted, bg: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)' };
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {/* ── Top Header ── */}
      <View style={styles.topHeader}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Home'))}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Assignments</Text>
          <Text style={styles.headerSubtitle}>
            {metrics.pendingCount} Pending · {metrics.dueThisWeekCount} Due This Week
          </Text>
        </View>

        <TouchableOpacity
          style={styles.addHeaderBtn}
          onPress={handleOpenCreateModal}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={22} color={isDark ? '#000000' : '#FFFFFF'} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Triage Stat Overview Banner ── */}
        <View style={styles.metricsRow}>
          <View style={styles.metricCard}>
            <Text style={styles.metricNum}>{metrics.pendingCount}</Text>
            <Text style={styles.metricLabel}>PENDING</Text>
          </View>

          <View style={styles.metricCard}>
            <Text style={[styles.metricNum, metrics.overdueCount > 0 && { color: '#EF4444' }]}>
              {metrics.overdueCount}
            </Text>
            <Text style={styles.metricLabel}>OVERDUE</Text>
          </View>

          <View style={styles.metricCard}>
            <Text style={styles.metricNum}>{metrics.dueThisWeekCount}</Text>
            <Text style={styles.metricLabel}>THIS WEEK</Text>
          </View>

          <View style={styles.metricCard}>
            <Text style={[styles.metricNum, { color: '#34D399' }]}>{metrics.completionRate}%</Text>
            <Text style={styles.metricLabel}>RATE</Text>
          </View>
        </View>

        {/* ── Search Bar ── */}
        <View style={styles.searchBarWrap}>
          <Ionicons name="search-outline" size={16} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search assignments or subjects..."
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* ── Filter Segment Tabs ── */}
        <View style={styles.filterSegment}>
          {(['pending', 'all', 'submitted', 'graded'] as FilterTab[]).map((tab) => {
            const isActive = activeTab === tab;
            const label = tab === 'pending' ? 'Pending' : tab === 'all' ? 'All' : tab === 'submitted' ? 'Submitted' : 'Graded';
            return (
              <TouchableOpacity
                key={tab}
                style={[styles.segmentBtn, isActive && styles.segmentBtnActive]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setActiveTab(tab);
                }}
                activeOpacity={0.7}
              >
                <Text style={[styles.segmentText, isActive && styles.segmentTextActive]}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── Assignment List ── */}
        {filteredAssignments.length === 0 ? (
          <View style={styles.emptyContainer}>
            <View style={styles.emptyIconCircle}>
              <Ionicons name="clipboard-outline" size={32} color={colors.accentPrimary} />
            </View>
            <Text style={styles.emptyTitle}>
              {activeTab === 'pending'
                ? 'All Caught Up!'
                : 'No Assignments Found'}
            </Text>
            <Text style={styles.emptySubtitle}>
              {activeTab === 'pending'
                ? 'Zero pending coursework. You are completely ahead of your deadlines.'
                : 'No assignments match the selected filter criteria.'}
            </Text>
            {activeTab === 'pending' && (
              <TouchableOpacity
                style={styles.emptyAddBtn}
                onPress={handleOpenCreateModal}
                activeOpacity={0.8}
              >
                <Ionicons name="add" size={16} color={isDark ? '#000000' : '#FFFFFF'} />
                <Text style={styles.emptyAddBtnText}>Add Assignment</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={styles.listWrap}>
            {filteredAssignments.map((a, idx) => {
              const isCompleted = a.status === 'submitted' || a.status === 'graded';
              const dueBadge = getDueBadge(a.dueDate, a.status);

              return (
                <Reanimated.View
                  key={a.id || `assign-${idx}`}
                  entering={FadeInDown.delay(idx * 40).duration(240)}
                  layout={Layout.springify()}
                  style={styles.card}
                >
                  <View style={styles.cardTopRow}>
                    {/* Subject Pill */}
                    <View style={styles.subjectPill}>
                      <View style={styles.subjectDot} />
                      <Text style={styles.subjectPillText} numberOfLines={1}>
                        {a.subjectName || 'Coursework'}
                      </Text>
                    </View>

                    {/* Due Badge */}
                    <View style={[styles.dueBadge, { backgroundColor: dueBadge.bg }]}>
                      <Text style={[styles.dueBadgeText, { color: dueBadge.color }]}>
                        {dueBadge.text}
                      </Text>
                    </View>
                  </View>

                  {/* Title & Checkbox */}
                  <View style={styles.cardBody}>
                    <TouchableOpacity
                      style={[styles.checkbox, isCompleted && styles.checkboxActive]}
                      onPress={() => handleToggleComplete(a)}
                      activeOpacity={0.7}
                    >
                      {isCompleted && (
                        <Ionicons name="checkmark" size={13} color={isDark ? '#000000' : '#FFFFFF'} />
                      )}
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={{ flex: 1 }}
                      onPress={() => handleOpenEditModal(a)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.cardTitle,
                          isCompleted && styles.cardTitleCompleted,
                        ]}
                      >
                        {a.title}
                      </Text>
                      {a.description ? (
                        <Text style={styles.cardDesc} numberOfLines={2}>
                          {a.description}
                        </Text>
                      ) : null}
                    </TouchableOpacity>
                  </View>

                  {/* Meta Specs Row */}
                  <View style={styles.cardFooter}>
                    <View style={styles.footerSpecs}>
                      {a.weightage !== undefined && (
                        <View style={styles.specChip}>
                          <Ionicons name="pie-chart-outline" size={11} color={colors.textMuted} />
                          <Text style={styles.specChipText}>{a.weightage}% Weight</Text>
                        </View>
                      )}
                      {a.maxMarks !== undefined && (
                        <View style={styles.specChip}>
                          <Ionicons name="ribbon-outline" size={11} color={colors.textMuted} />
                          <Text style={styles.specChipText}>
                            {a.obtainedMarks !== undefined ? `${a.obtainedMarks}/${a.maxMarks} pts` : `${a.maxMarks} pts`}
                          </Text>
                        </View>
                      )}
                    </View>

                    <View style={styles.actionButtons}>
                      <TouchableOpacity
                        style={styles.iconActionBtn}
                        onPress={() => handleOpenEditModal(a)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="create-outline" size={15} color={colors.textMuted} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.iconActionBtn}
                        onPress={() => handleDelete(a)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="trash-outline" size={15} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  </View>
                </Reanimated.View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* ── Create / Edit Assignment Modal ── */}
      <AssignmentModal
        visible={modalVisible}
        assignment={editingAssignment}
        subjects={attendance}
        onClose={() => setModalVisible(false)}
        onSave={handleSaveAssignment}
        colors={colors}
        isDark={isDark}
      />
    </SafeAreaView>
  );
}

// ─── Modal Sheet Component ────────────────────────────────────────────────────
function AssignmentModal({
  visible,
  assignment,
  subjects,
  onClose,
  onSave,
  colors,
  isDark,
}: {
  visible: boolean;
  assignment: Assignment | null;
  subjects: any[];
  onClose: () => void;
  onSave: (data: Partial<Assignment>) => void;
  colors: any;
  isDark: boolean;
}) {
  const [title, setTitle] = useState('');
  const [subjectName, setSubjectName] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [weightage, setWeightage] = useState('');
  const [maxMarks, setMaxMarks] = useState('');
  const [obtainedMarks, setObtainedMarks] = useState('');
  const [status, setStatus] = useState<Assignment['status']>('not_started');
  const [description, setDescription] = useState('');

  // Sync state on open
  React.useEffect(() => {
    if (visible) {
      if (assignment) {
        setTitle(assignment.title || '');
        setSubjectName(assignment.subjectName || '');
        setDueDate(assignment.dueDate || new Date().toISOString().slice(0, 10));
        setWeightage(assignment.weightage !== undefined ? String(assignment.weightage) : '10');
        setMaxMarks(assignment.maxMarks !== undefined ? String(assignment.maxMarks) : '100');
        setObtainedMarks(assignment.obtainedMarks !== undefined ? String(assignment.obtainedMarks) : '');
        setStatus(assignment.status || 'not_started');
        setDescription(assignment.description || '');
      } else {
        setTitle('');
        setSubjectName(subjects[0]?.name || 'General');
        setDueDate(new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
        setWeightage('10');
        setMaxMarks('100');
        setObtainedMarks('');
        setStatus('not_started');
        setDescription('');
      }
    }
  }, [visible, assignment, subjects]);

  const handleSubmit = () => {
    if (!title.trim()) {
      Alert.alert('Required', 'Please enter an assignment title.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onSave({
      title: title.trim(),
      subjectName: subjectName.trim() || 'General',
      dueDate: dueDate.trim() || new Date().toISOString().slice(0, 10),
      weightage: weightage ? parseFloat(weightage) : undefined,
      maxMarks: maxMarks ? parseFloat(maxMarks) : undefined,
      obtainedMarks: obtainedMarks ? parseFloat(obtainedMarks) : undefined,
      status,
      description: description.trim(),
    });
  };

  const setQuickDate = (daysFromNow: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const d = new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000);
    setDueDate(d.toISOString().slice(0, 10));
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={modalStyles.overlay}>
        <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} activeOpacity={1} />
        <View style={[modalStyles.sheet, { backgroundColor: isDark ? '#14121E' : '#FFFFFF' }]}>
          {/* Header */}
          <View style={modalStyles.headerRow}>
            <Text style={[modalStyles.title, { color: colors.textPrimary }]}>
              {assignment ? 'Edit Assignment' : 'New Assignment'}
            </Text>
            <TouchableOpacity onPress={onClose} style={modalStyles.closeBtn}>
              <Ionicons name="close" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
            {/* Title Input */}
            <Text style={[modalStyles.fieldLabel, { color: colors.textMuted }]}>TITLE</Text>
            <TextInput
              style={[modalStyles.input, { color: colors.textPrimary, borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }]}
              placeholder="e.g. Operating Systems Lab 4"
              placeholderTextColor={colors.textMuted}
              value={title}
              onChangeText={setTitle}
            />

            {/* Subject Picker / Chips */}
            <Text style={[modalStyles.fieldLabel, { color: colors.textMuted }]}>SUBJECT</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {subjects.map((s) => {
                  const active = subjectName === s.name;
                  return (
                    <TouchableOpacity
                      key={s.id}
                      style={[
                        modalStyles.subjectChip,
                        active && { backgroundColor: colors.accentPrimary, borderColor: colors.accentPrimary },
                      ]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setSubjectName(s.name);
                      }}
                    >
                      <Text style={[modalStyles.subjectChipText, active && { color: isDark ? '#000' : '#FFF', fontFamily: FONT_FAMILY.bold }]}>
                        {s.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            {/* Due Date & Quick Buttons */}
            <Text style={[modalStyles.fieldLabel, { color: colors.textMuted }]}>DUE DATE (YYYY-MM-DD)</Text>
            <TextInput
              style={[modalStyles.input, { color: colors.textPrimary, borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }]}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textMuted}
              value={dueDate}
              onChangeText={setDueDate}
            />
            <View style={modalStyles.quickDateRow}>
              {[
                { label: 'Today', days: 0 },
                { label: 'Tomorrow', days: 1 },
                { label: '3 Days', days: 3 },
                { label: '1 Week', days: 7 },
              ].map((q) => (
                <TouchableOpacity
                  key={q.label}
                  style={[modalStyles.quickDateBtn, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)' }]}
                  onPress={() => setQuickDate(q.days)}
                >
                  <Text style={[modalStyles.quickDateText, { color: colors.accentPrimary }]}>{q.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Status Selector */}
            <Text style={[modalStyles.fieldLabel, { color: colors.textMuted }]}>STATUS</Text>
            <View style={modalStyles.statusRow}>
              {(['not_started', 'in_progress', 'submitted', 'graded'] as Assignment['status'][]).map((st) => {
                const active = status === st;
                const labels: Record<string, string> = {
                  not_started: 'Not Started',
                  in_progress: 'In Progress',
                  submitted: 'Submitted',
                  graded: 'Graded',
                };
                return (
                  <TouchableOpacity
                    key={st}
                    style={[modalStyles.statusBtn, active && { backgroundColor: colors.accentPrimary, borderColor: colors.accentPrimary }]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setStatus(st);
                    }}
                  >
                    <Text style={[modalStyles.statusText, active && { color: isDark ? '#000' : '#FFF', fontFamily: FONT_FAMILY.bold }]}>
                      {labels[st]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Weightage & Marks (2 columns) */}
            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 14 }}>
              <View style={{ flex: 1 }}>
                <Text style={[modalStyles.fieldLabel, { color: colors.textMuted }]}>WEIGHTAGE (%)</Text>
                <TextInput
                  style={[modalStyles.input, { color: colors.textPrimary, borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }]}
                  placeholder="e.g. 15"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numeric"
                  value={weightage}
                  onChangeText={setWeightage}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[modalStyles.fieldLabel, { color: colors.textMuted }]}>MAX MARKS</Text>
                <TextInput
                  style={[modalStyles.input, { color: colors.textPrimary, borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }]}
                  placeholder="e.g. 100"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numeric"
                  value={maxMarks}
                  onChangeText={setMaxMarks}
                />
              </View>
            </View>

            {/* Description / Notes */}
            <Text style={[modalStyles.fieldLabel, { color: colors.textMuted }]}>NOTES / REQUIREMENTS</Text>
            <TextInput
              style={[
                modalStyles.input,
                { height: 70, textAlignVertical: 'top', color: colors.textPrimary, borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' },
              ]}
              placeholder="Add submission links, rubric details or notes..."
              placeholderTextColor={colors.textMuted}
              multiline
              value={description}
              onChangeText={setDescription}
            />

            {/* Save CTA */}
            <TouchableOpacity style={[modalStyles.submitBtn, { backgroundColor: colors.accentPrimary }]} onPress={handleSubmit}>
              <Text style={[modalStyles.submitBtnText, { color: isDark ? '#000' : '#FFF' }]}>
                {assignment ? 'Update Assignment' : 'Save Assignment (+50 XP)'}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─── Screen Styles ────────────────────────────────────────────────────────────
const makeStyles = (colors: any, isDark: boolean, insets: any) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
    },
    topHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
    },
    backBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
    },
    headerCenter: {
      flex: 1,
      alignItems: 'center',
    },
    headerTitle: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 16,
      color: colors.textPrimary,
      letterSpacing: 0.5,
    },
    headerSubtitle: {
      fontFamily: FONT_FAMILY.medium,
      fontSize: 11,
      color: colors.textMuted,
      marginTop: 2,
    },
    addHeaderBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.accentPrimary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 40,
    },

    // Metrics Row
    metricsRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 16,
    },
    metricCard: {
      flex: 1,
      paddingVertical: 10,
      paddingHorizontal: 6,
      borderRadius: RADIUS.md,
      backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#FFFFFF',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    metricNum: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 17,
      color: colors.textPrimary,
      letterSpacing: 0.5,
    },
    metricLabel: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 8.5,
      letterSpacing: 0.8,
      color: colors.textMuted,
      marginTop: 2,
    },

    // Search Bar
    searchBarWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 12,
      height: 42,
      borderRadius: RADIUS.md,
      backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
      marginBottom: 14,
    },
    searchInput: {
      flex: 1,
      fontFamily: FONT_FAMILY.body,
      fontSize: 13,
      color: colors.textPrimary,
    },

    // Filter Segment
    filterSegment: {
      flexDirection: 'row',
      gap: 6,
      padding: 4,
      borderRadius: RADIUS.md,
      backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
      marginBottom: 16,
    },
    segmentBtn: {
      flex: 1,
      paddingVertical: 7,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: RADIUS.sm,
    },
    segmentBtnActive: {
      backgroundColor: isDark ? 'rgba(165,153,255,0.15)' : 'rgba(108,92,231,0.1)',
    },
    segmentText: {
      fontFamily: FONT_FAMILY.medium,
      fontSize: 11.5,
      color: colors.textMuted,
    },
    segmentTextActive: {
      fontFamily: FONT_FAMILY.bold,
      color: colors.accentPrimary,
    },

    // Card Styles
    listWrap: {
      gap: 10,
    },
    card: {
      padding: 14,
      borderRadius: RADIUS.lg,
      backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#FFFFFF',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
    },
    cardTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    subjectPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: RADIUS.full,
      backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
      maxWidth: '65%',
    },
    subjectDot: {
      width: 5,
      height: 5,
      borderRadius: 2.5,
      backgroundColor: colors.accentPrimary,
    },
    subjectPillText: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 10,
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    dueBadge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: RADIUS.full,
    },
    dueBadgeText: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 10,
    },

    cardBody: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      marginBottom: 10,
    },
    checkbox: {
      width: 20,
      height: 20,
      borderRadius: 6,
      borderWidth: 1.5,
      borderColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 2,
    },
    checkboxActive: {
      backgroundColor: '#34D399',
      borderColor: '#34D399',
    },
    cardTitle: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 14,
      color: colors.textPrimary,
      lineHeight: 19,
    },
    cardTitleCompleted: {
      textDecorationLine: 'line-through',
      color: colors.textMuted,
    },
    cardDesc: {
      fontFamily: FONT_FAMILY.body,
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 3,
      lineHeight: 16,
    },

    cardFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
    },
    footerSpecs: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    specChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
    },
    specChipText: {
      fontFamily: FONT_FAMILY.medium,
      fontSize: 10.5,
      color: colors.textMuted,
    },
    actionButtons: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    iconActionBtn: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
      alignItems: 'center',
      justifyContent: 'center',
    },

    // Empty State
    emptyContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 50,
      paddingHorizontal: 24,
    },
    emptyIconCircle: {
      width: 60,
      height: 60,
      borderRadius: 30,
      backgroundColor: isDark ? 'rgba(165,153,255,0.1)' : 'rgba(108,92,231,0.08)',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14,
    },
    emptyTitle: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 17,
      color: colors.textPrimary,
      marginBottom: 6,
    },
    emptySubtitle: {
      fontFamily: FONT_FAMILY.body,
      fontSize: 12.5,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 18,
      marginBottom: 20,
    },
    emptyAddBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: RADIUS.full,
      backgroundColor: colors.accentPrimary,
    },
    emptyAddBtnText: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 13,
      color: isDark ? '#000000' : '#FFFFFF',
    },
  });

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    paddingHorizontal: 18,
    paddingTop: 16,
    maxHeight: '90%',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  title: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 17,
  },
  closeBtn: {
    padding: 4,
  },
  fieldLabel: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 9.5,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  input: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 13.5,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    marginBottom: 14,
  },
  subjectChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  subjectChipText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 11.5,
    color: '#8E8E93',
  },
  quickDateRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 14,
  },
  quickDateBtn: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
  },
  quickDateText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 11,
  },
  statusRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 14,
  },
  statusBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
  },
  statusText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 10.5,
    color: '#8E8E93',
  },
  submitBtn: {
    height: 48,
    borderRadius: RADIUS.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  submitBtnText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 14,
  },
});
