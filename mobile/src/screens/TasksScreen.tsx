import React, { useEffect, useState, useMemo, useCallback, useRef, Suspense } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, Alert, SectionList, Pressable, Platform, StatusBar, Linking } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { requestNotificationPermissions } from '../services/notifications';

import { useCoreData } from '../contexts/domains/CoreDataContext';
import { useTheme } from '../contexts/ThemeContext';
import { formatDateWithDay, formatLocalDateStr, formatDateShort } from '../utils/dateUtils';
import { formatTimeStr } from '../utils/timeUtils';
import { setTabBarVisible } from '../utils/tabBarScroll';

// Extracted Hooks & Styles
import { makeTasksStyles } from './tasks/tasksStyles';
import { useTasksData } from './tasks/useTasksData';
import { useTasksFirestore } from './tasks/useTasksFirestore';
import { useRecurringSpawn } from './tasks/useRecurringSpawn';
import { parseTimeFloat } from './tasks/taskConstants';

// Components
import AnimatedPressable from '../components/AnimatedPressable';
import BottomSheet from '../components/ui/BottomSheet';


// ── Lazy-loaded Alternate Task Views: Skips parsing ~800 LOC until user switches view ──
const TimelineView = React.lazy(() => import('../components/Tasks/TimelineView'));
const KanbanView = React.lazy(() => import('../components/Tasks/KanbanView'));

// ── Lazy-loaded Heavy Modals & Sheets: Defers parsing ~5,066 LOC on cold boot ──
const UniversalCalendarModal = React.lazy(() => import('../components/UniversalCalendarModal'));
const BulkRescheduleSheet = React.lazy(() => import('../components/Tasks/BulkRescheduleSheet'));
const TaskTemplatesSheet = React.lazy(() => import('../components/Tasks/TaskTemplatesSheet'));
const TaskTimeLogSheet = React.lazy(() => import('../components/Tasks/TaskTimeLogSheet'));
const EditTaskModal = React.lazy(() => import('./tasks/EditTaskModal'));
const NewTaskModal = React.lazy(() => import('./tasks/NewTaskModal'));
const VoiceDictationOverlay = React.lazy(() => import('../components/Tasks/VoiceDictationOverlay'));

// Extracted Task Components
import { TaskDateStrip } from '../components/Tasks/TaskDateStrip';
import TaskRow from '../components/Tasks/TaskRow';
import EmptyState from '../components/ui/EmptyState';
import { usePomodoro } from '../contexts/PomodoroContext';
import TasksSkeleton from '../components/Tasks/TasksSkeleton';
import type { Task } from '../contexts/MobileDataContext';

const taskKeyExtractor = (item: any) => item.id;

/**
 * TaskRowMemo — Thin memoized adapter that bridges TasksScreen's stable
 * callback API to TaskRow's original prop interface.
 *
 * WHY THIS EXISTS:
 * TaskRow is already wrapped in React.memo, BUT renderItem was passing
 * new inline arrow functions (e.g. `() => completeTask(item)`) on every
 * render. Arrow functions always produce a new object reference, which
 * defeats memo entirely. All 200 rows re-rendered on every single state
 * change (e.g. toggling one checkbox).
 *
 * HOW IT WORKS:
 * - Parent passes stable `useCallback` refs (onComplete: (task) => void).
 * - TaskRowMemo wraps each ref into the row-specific signature TaskRow
 *   expects (onComplete: () => void) using its own internal useCallback.
 * - Because TaskRowMemo is itself React.memo'd with a custom comparator,
 *   it only re-renders when THIS row's task data or isSelected changes.
 *   Every other row stays frozen.
 */
interface TaskRowMemoProps {
  task: Task;
  isOverdue: boolean;
  isBulkEdit?: boolean;
  isSelected?: boolean;
  onComplete: (task: Task) => void;
  onReschedule: (taskId: string) => void;
  onPress: (task: Task) => void;
  onToggleSelect: (taskId: string) => void;
  onUpdateTask: (taskId: string, updates: Partial<Task>) => void;
}

const TaskRowMemo = React.memo(function TaskRowMemo({
  task, isOverdue, isBulkEdit, isSelected,
  onComplete, onReschedule, onPress, onToggleSelect, onUpdateTask,
}: TaskRowMemoProps) {
  const handleComplete  = useCallback(() => onComplete(task), [onComplete, task]);
  const handleReschedule = useCallback(() => onReschedule(task.id!), [onReschedule, task.id]);
  const handlePress     = useCallback(() => onPress(task), [onPress, task]);
  const handleLongPress = useCallback(() => onPress(task), [onPress, task]);
  const handleToggle    = useCallback(() => onToggleSelect(task.id!), [onToggleSelect, task.id]);
  const handleUpdate    = useCallback((id: string, updates: Partial<Task>) => onUpdateTask(id, updates), [onUpdateTask]);
  const handleAddSubtask = useCallback(() => onPress(task), [onPress, task]);

  return (
    <TaskRow
      task={task}
      isOverdue={isOverdue}
      isBulkEdit={isBulkEdit}
      isSelected={isSelected}
      onComplete={handleComplete}
      onReschedule={handleReschedule}
      onPress={handlePress}
      onLongPress={handleLongPress}
      onToggleSelect={handleToggle}
      onUpdateTask={handleUpdate}
      onAddSubtask={handleAddSubtask}
    />
  );
}, (prev, next) =>
  // Custom comparator: only re-render if this row's data or selection changed.
  // This is the key gate that keeps 199 untouched rows frozen.
  prev.task === next.task &&
  prev.isOverdue === next.isOverdue &&
  prev.isSelected === next.isSelected &&
  prev.isBulkEdit === next.isBulkEdit &&
  prev.onComplete === next.onComplete &&
  prev.onReschedule === next.onReschedule &&
  prev.onPress === next.onPress
);



export default function TasksScreen() {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeTasksStyles(colors, isDark), [colors, isDark]);
  const insets = useSafeAreaInsets();
  // Guaranteed synchronous status bar clearance on Frame 0 — prevents upward jump under Android status bar
  const topInset = Math.max(insets.top, Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 0);
  
  const { tasks, user, habits, habitLogs, tasksReady, optimisticUpdateTask, optimisticDeleteTask, optimisticAddTask } = useCoreData();
  const isInitialLoading = !tasksReady && (!tasks || tasks.length === 0);
  const { openPomodoro } = usePomodoro();
  const todayDateStr = useMemo(() => formatLocalDateStr(new Date()), []);

  // 1. Recurring Spawn Logic (Deferred background run)
  useRecurringSpawn(tasks, user?.uid, optimisticAddTask);

  // 2. Data/State Hook
  const {
    selectedDate, viewMode, filterTag, isCalendarOpen, isTemplatesSheetOpen,
    isNewTaskOpen, isBulkEdit, selectedTaskIds, bulkRescheduleModal,
    isOverdueModalOpen, isInboxModalOpen, isMenuOpen, sortBy,
    timeLogTask, isTimeSpentOpen, editingTask, conflicts,
    overdueTasks, inboxTasks, selectedDateTasks, upcomingTasks, taskDates,
    setSelectedDate, setViewMode, setFilterTag, setIsCalendarOpen,
    setIsTemplatesSheetOpen, setIsNewTaskOpen, setIsBulkEdit,
    setSelectedTaskIds, setBulkRescheduleModal, setIsOverdueModalOpen,
    setIsInboxModalOpen, setIsMenuOpen, setSortBy, setTimeLogTask,
    setIsTimeSpentOpen, setEditingTask, setConflicts,
    toggleTaskSelection,
  } = useTasksData(tasks);

  const [isVoiceDictationOpen, setIsVoiceDictationOpen] = useState(false);

  const route = useRoute<any>();
  useEffect(() => {
    if (route.params?.openAddTask) {
      setIsNewTaskOpen(true);
    }
  }, [route.params?.openAddTask, route.params?.timestamp]);

  // 3. Firestore Hook
  const {
    completeTask,
    clearCompletedTasks,
    bulkComplete,
    bulkDelete,
    handleBulkReschedule,
    updateTask,
    addTaskFromTemplate,
    saveTimeLog,
    skipTimeLog,
  } = useTasksFirestore({
    optimisticUpdateTask,
    optimisticDeleteTask,
    optimisticAddTask,
    setTimeLogTask,
    setIsBulkEdit,
    setSelectedTaskIds,
    setBulkRescheduleModal,
    todayTasks: selectedDateTasks,
    habits,
    habitLogs,
    todayDateStr,
  });

  const lastScrollY = useRef(0);
  const handleScroll = useCallback((e: any) => {
    const offsetY = e?.nativeEvent?.contentOffset?.y ?? 0;
    // Auto-hiding bottom navigation bar on scroll (fast & smooth)
    if (offsetY <= 35) {
      setTabBarVisible(true);
    } else {
      const diff = offsetY - lastScrollY.current;
      if (diff > 10) {
        setTabBarVisible(false); // Scroll down -> hide
      } else if (diff < -6) {
        setTabBarVisible(true); // Scroll up -> show instantly
      }
    }
    lastScrollY.current = offsetY;
  }, []);

  const handleDateSelect = useCallback((date: string) => {
    setSelectedDate(date);
  }, [setSelectedDate]);

  // ── Interactive Tag Filters & Task Counts ──
  const tagFilters = useMemo(() => {
    const counts: Record<string, number> = { all: selectedDateTasks.length };
    const discoveredTags = new Set<string>();

    for (let i = 0; i < selectedDateTasks.length; i++) {
      const t = selectedDateTasks[i];
      const tags = (t.tags || []).map(tg => tg.toLowerCase().replace(/^#/, '').trim());
      const titleMatches = t.title?.match(/#([a-zA-Z0-9_\-]+)/g);
      if (titleMatches) {
        titleMatches.forEach(m => tags.push(m.toLowerCase().replace(/^#/, '').trim()));
      }
      const unique = new Set(tags);
      unique.forEach(tag => {
        if (!tag) return;
        discoveredTags.add(tag);
        counts[tag] = (counts[tag] || 0) + 1;
      });
    }

    // Only show tags that are actually present on tasks for this date!
    const activeTags = Array.from(discoveredTags).filter(tag => (counts[tag] || 0) > 0);

    if (activeTags.length === 0) {
      return [];
    }

    const orderedTagKeys = ['all', ...activeTags];

    return orderedTagKeys.map(key => {
      let label = key === 'all' ? '#all' : `#${key}`;
      return {
        key,
        label,
        count: counts[key] || 0,
      };
    });
  }, [selectedDateTasks]);

  // Reset filterTag if it no longer exists on the current date
  useEffect(() => {
    if (filterTag && tagFilters.length > 0 && !tagFilters.some(t => t.key === filterTag.toLowerCase().replace(/^#/, ''))) {
      setFilterTag(null);
    }
  }, [tagFilters, filterTag, setFilterTag]);

  // ── Filtered Tasks by Selected Tag ──
  const displayedTasks = useMemo(() => {
    if (!filterTag || filterTag.toLowerCase() === 'all') return selectedDateTasks;
    const target = filterTag.toLowerCase().replace(/^#/, '').trim();
    return selectedDateTasks.filter(t => {
      const tags = (t.tags || []).map(tg => tg.toLowerCase().replace(/^#/, '').trim());
      if (tags.includes(target)) return true;
      if (t.title?.toLowerCase().includes(`#${target}`)) return true;
      return false;
    });
  }, [selectedDateTasks, filterTag]);

  const sections = useMemo(() => {
    if (displayedTasks.length === 0) return [];
    return [{
      title: selectedDate === todayDateStr ? 'TODAY' : formatDateWithDay(selectedDate).toUpperCase(),
      data: displayedTasks,
      isSelectedDate: true,
    }];
  }, [displayedTasks, selectedDate, todayDateStr]);


  // ── Stable handler refs — created once, never recreated on re-render ──────────
  // Passed into TaskRowMemo so React.memo actually prevents TaskRow re-renders.
  // Previously, inline `() => completeTask(item)` closures defeated React.memo
  // because each renderItem call produced new function objects, forcing all rows
  // to re-render whenever isBulkEdit or selectedTaskIds changed.
  const onCompleteRef = useCallback((task: any) => completeTask(task), [completeTask]);
  const onRescheduleRef = useCallback((taskId: string) => {
    setSelectedTaskIds(new Set([taskId]));
    setBulkRescheduleModal(true);
  }, [setSelectedTaskIds, setBulkRescheduleModal]);
  const onPressRef = useCallback((task: any) => setEditingTask(task), [setEditingTask]);
  const onToggleSelectRef = useCallback((taskId: string) => toggleTaskSelection(taskId), [toggleTaskSelection]);
  const onUpdateTaskRef = useCallback((id: string, updates: any) => updateTask(id, updates), [updateTask]);

  // Modal-specific stable press handlers — close the modal first, then open edit.
  // Passed to TaskRowMemo inside Overdue/Inbox so those rows stay frozen on parent re-renders.
  const onOverduePressRef = useCallback((task: any) => {
    setIsOverdueModalOpen(false);
    setEditingTask(task);
  }, [setIsOverdueModalOpen, setEditingTask]);
  const onOverdueRescheduleRef = useCallback((taskId: string) => {
    setIsOverdueModalOpen(false);
    setSelectedTaskIds(new Set([taskId]));
    setBulkRescheduleModal(true);
  }, [setIsOverdueModalOpen, setSelectedTaskIds, setBulkRescheduleModal]);
  const onInboxPressRef = useCallback((task: any) => {
    setIsInboxModalOpen(false);
    setEditingTask(task);
  }, [setIsInboxModalOpen, setEditingTask]);
  const onInboxRescheduleRef = useCallback((taskId: string) => {
    setIsInboxModalOpen(false);
    setSelectedTaskIds(new Set([taskId]));
    setBulkRescheduleModal(true);
  }, [setIsInboxModalOpen, setSelectedTaskIds, setBulkRescheduleModal]);

  const renderItem = useCallback(({ item }: { item: any }) => (
    <TaskRowMemo
      task={item}
      isOverdue={item.date ? item.date < todayDateStr && item.status !== 'completed' : false}
      isBulkEdit={isBulkEdit}
      isSelected={selectedTaskIds.has(item.id!)}
      onComplete={onCompleteRef}
      onReschedule={onRescheduleRef}
      onPress={onPressRef}
      onToggleSelect={onToggleSelectRef}
      onUpdateTask={onUpdateTaskRef}
    />
  ), [isBulkEdit, selectedTaskIds, todayDateStr, onCompleteRef, onRescheduleRef, onPressRef, onToggleSelectRef, onUpdateTaskRef]);

  const renderSectionHeader = useCallback(({ section: { title } }: any) => (
    <View style={styles.listSectionHeader}>
      <Text style={[styles.listSectionTitle, { color: colors.textTertiary, fontSize: 11, letterSpacing: 1 }]}>{title}</Text>
    </View>
  ), [styles.listSectionHeader, styles.listSectionTitle, colors.textTertiary]);

  const taskConflicts = useMemo(() => {
    return conflicts.filter(c => c.modules.includes('tasks') && !c.modules.includes('academic'));
  }, [conflicts]);

  const [hasNotifPermission, setHasNotifPermission] = useState<boolean | null>(true);

  const checkNotifPermission = useCallback(async () => {
    try {
      const { status } = await Notifications.getPermissionsAsync();
      setHasNotifPermission(status === 'granted');
    } catch {
      setHasNotifPermission(null);
    }
  }, []);

  useEffect(() => {
    checkNotifPermission();
  }, [checkNotifPermission]);

  const handleRequestNotifPermission = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const granted = await requestNotificationPermissions();
      if (!granted) {
        Alert.alert(
          'Notifications Required',
          'Android system notifications are turned off. Please open settings and allow notifications for ZenTrack to receive task reminders and alarms.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() }
          ]
        );
      } else {
        setHasNotifPermission(true);
      }
    } catch {
      Linking.openSettings();
    }
  };

  return (
    <View style={[styles.root, { paddingTop: topInset }]}>
      
      {/* PROACTIVE WIDGET */}
      {taskConflicts.length > 0 && (
        <View style={{ paddingHorizontal: 24, marginBottom: 16, marginTop: 8 }}>
          {taskConflicts.map(c => (
            <View key={c.id} style={{ backgroundColor: isDark ? 'rgba(255, 105, 97, 0.12)' : '#fee2e2', padding: 16, borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: isDark ? 'rgba(255, 105, 97, 0.25)' : '#fca5a5' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <Ionicons name="warning" size={16} color={colors.error} />
                <Text style={{ fontFamily: 'Inter_700Bold', color: colors.error, fontSize: 14 }}>Conflict Detected</Text>
              </View>
              <Text style={{ fontFamily: 'Inter_400Regular', color: colors.error, fontSize: 12 }}>{c.message} {c.suggestion}</Text>
            </View>
          ))}
        </View>
      )}

      {/* HEADER */}
      <View style={styles.topHeader}>
        <Text style={styles.topHeaderTitle}>{isBulkEdit ? `${selectedTaskIds.size} Selected` : 'Tasks'}</Text>
        <View style={styles.topHeaderIcons}>
          {isBulkEdit ? (
            <AnimatedPressable 
              style={[styles.iconBtn, { width: 34, height: 34, borderRadius: 17, backgroundColor: isDark ? 'rgba(165,153,255,0.15)' : colors.surface2, alignItems: 'center', justifyContent: 'center' }]} 
              onPress={() => { setIsBulkEdit(false); setSelectedTaskIds(new Set()); }}
            >
              <Ionicons name="close" size={18} color={colors.accentPrimary} />
            </AnimatedPressable>
          ) : (
            <>
              {/* Inbox button */}
              <AnimatedPressable
                style={styles.iconBtn}
                onPress={() => overdueTasks.length > 0 ? setIsOverdueModalOpen(true) : setIsInboxModalOpen(true)}
              >
                <Ionicons name="file-tray-outline" size={20} color={colors.textPrimary} />
                {overdueTasks.length > 0 ? (
                  <View style={[styles.badge, { backgroundColor: colors.error, top: -6, right: 6 }]}>
                    <Text style={[styles.badgeText, { color: isDark ? '#000000' : '#FFFFFF' }]}>{overdueTasks.length}</Text>
                  </View>
                ) : inboxTasks.length > 0 ? (
                  <View style={[styles.badge, { top: -6, right: 6 }]}>
                    <Text style={styles.badgeText}>{inboxTasks.length}</Text>
                  </View>
                ) : null}
                <Text style={{ fontSize: 9, color: colors.textTertiary, fontFamily: 'Inter_500Medium', marginTop: 2, textAlign: 'center' }}>Inbox</Text>
              </AnimatedPressable>
              {/* Pomodoro Timer button */}
              <AnimatedPressable style={styles.iconBtn} onPress={() => openPomodoro()}>
                <Ionicons name="timer-outline" size={20} color={colors.textPrimary} />
                <Text style={{ fontSize: 9, color: colors.textTertiary, fontFamily: 'Inter_500Medium', marginTop: 2, textAlign: 'center' }}>Timer</Text>
              </AnimatedPressable>
              <AnimatedPressable style={styles.iconBtn} onPress={() => setViewMode(v => v === 'list' ? 'timeline' : v === 'timeline' ? 'kanban' : 'list')}>
                <Ionicons name={viewMode === 'list' ? 'time-outline' : viewMode === 'timeline' ? 'git-branch-outline' : 'list'} size={20} color={colors.textPrimary} />
                <Text style={{ fontSize: 9, color: colors.textTertiary, fontFamily: 'Inter_500Medium', marginTop: 2, textAlign: 'center' }}>View</Text>
              </AnimatedPressable>
              <AnimatedPressable style={styles.iconBtn} onPress={() => setIsNewTaskOpen(true)}>
                <Ionicons name="add" size={22} color={colors.textPrimary} />
                <Text style={{ fontSize: 9, color: colors.textTertiary, fontFamily: 'Inter_500Medium', marginTop: 2, textAlign: 'center' }}>Add</Text>
              </AnimatedPressable>
              <AnimatedPressable style={styles.iconBtn} onPress={() => setIsMenuOpen(true)}>
                <Ionicons name="ellipsis-horizontal" size={20} color={colors.textPrimary} />
                <Text style={{ fontSize: 9, color: colors.textTertiary, fontFamily: 'Inter_500Medium', marginTop: 2, textAlign: 'center' }}>More</Text>
              </AnimatedPressable>
            </>
          )}
        </View>
      </View>

      {/* Date Selector */}
      <View style={styles.dateSelectorContainer}>
        <TaskDateStrip selectedDate={selectedDate} onSelectDate={handleDateSelect} taskDates={taskDates} />
      </View>

      {/* Interactive Horizontal Tag Filter Strip — only rendered when tags are present on this day */}
      {tagFilters.length > 1 && (
        <View style={styles.tagFilterStripContainer}>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tagFilterContent}
          >
            {tagFilters.map((item) => {
              const isActive = item.key === 'all' 
                ? (!filterTag || filterTag === 'all')
                : filterTag?.toLowerCase() === item.key;
              return (
                <TouchableOpacity
                  key={item.key}
                  style={[
                    styles.filterTagChip,
                    isActive && styles.filterTagChipActive,
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    if (item.key === 'all' || filterTag?.toLowerCase() === item.key) {
                      setFilterTag(null);
                    } else {
                      setFilterTag(item.key);
                    }
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.filterTagChipText, isActive && styles.filterTagChipTextActive]}>
                    {item.label}
                  </Text>
                  <View style={[styles.tagCountBadge, isActive && styles.tagCountBadgeActive]}>
                    <Text style={[styles.tagCountText, isActive && styles.tagCountTextActive]}>
                      {item.count}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* NOTIFICATION PERMISSION WARNING BANNER */}
      {hasNotifPermission === false && (
        <AnimatedPressable
          style={{
            marginHorizontal: 16,
            marginBottom: 10,
            paddingVertical: 10,
            paddingHorizontal: 14,
            backgroundColor: isDark ? 'rgba(245, 158, 11, 0.12)' : '#fffbeb',
            borderRadius: 14,
            borderWidth: 1,
            borderColor: isDark ? 'rgba(245, 158, 11, 0.35)' : '#fde68a',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
          }}
          onPress={handleRequestNotifPermission}
        >
          <Ionicons name="notifications-off" size={18} color="#f59e0b" />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: isDark ? '#fbbf24' : '#b45309', fontFamily: 'Inter_600SemiBold' }}>
              Notifications Disabled
            </Text>
            <Text style={{ fontSize: 11, color: isDark ? '#d1d5db' : '#92400e', fontFamily: 'Inter_400Regular' }}>
              Task reminders and alarms won't fire. Tap to enable.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color="#f59e0b" />
        </AnimatedPressable>
      )}


      {/* Standard Calendar Modal */}
      {isCalendarOpen && (
        <Suspense fallback={null}>
          <UniversalCalendarModal
            visible={isCalendarOpen}
            onClose={() => setIsCalendarOpen(false)}
            selectedDate={selectedDate}
            onDateSelect={handleDateSelect}
            title="Jump to date"
          />
        </Suspense>
      )}

      {/* Advanced Reschedule Sheet */}
      {bulkRescheduleModal && (
        <Suspense fallback={null}>
          <BulkRescheduleSheet
            visible={bulkRescheduleModal}
            onClose={() => setBulkRescheduleModal(false)}
            selectedTaskIds={selectedTaskIds}
            allTasks={tasks}
            onConfirm={(newDate, newSlot) => handleBulkReschedule(selectedTaskIds, newDate, newSlot)}
          />
        </Suspense>
      )}

      {/* Edit & New Task Modals — strictly conditional (0 lines executed on mount) */}
      {!!editingTask && (
        <Suspense fallback={null}>
          <EditTaskModal visible={!!editingTask} onClose={() => setEditingTask(null)} task={editingTask} />
        </Suspense>
      )}
      {isNewTaskOpen && !!user && (
        <Suspense fallback={null}>
          <NewTaskModal visible={isNewTaskOpen} onClose={() => setIsNewTaskOpen(false)} userId={user.uid} selectedDate={selectedDate} listCount={selectedDateTasks.length} />
        </Suspense>
      )}
      {isVoiceDictationOpen && (
        <Suspense fallback={null}>
          <VoiceDictationOverlay
            visible={isVoiceDictationOpen}
            onClose={() => setIsVoiceDictationOpen(false)}
            selectedDate={selectedDate}
            userId={user?.uid}
          />
        </Suspense>
      )}

      {/* VIEWS */}
      {isInitialLoading ? (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
          <TasksSkeleton />
        </ScrollView>
      ) : viewMode === 'timeline' ? (
        <View style={{ flex: 1 }}>
          <Suspense fallback={<TasksSkeleton />}>
            <TimelineView 
              tasks={displayedTasks} 
              onTaskPress={(t) => setEditingTask(t)} 
              colors={colors}
              isDark={isDark}
              selectedDate={selectedDate}
            />
          </Suspense>
        </View>
      ) : viewMode === 'kanban' ? (
        <View style={{ flex: 1 }}>
          <Suspense fallback={<TasksSkeleton />}>
            <KanbanView
              tasks={tasks.filter(t => !filterTag || (t.tags ?? []).includes(filterTag))}
              onTaskPress={(t) => setEditingTask(t)}
              colors={colors}
            />
          </Suspense>
        </View>
      ) : (
        <SectionList
          style={{ flex: 1 }}
          contentContainerStyle={[
            styles.listContent,
            displayedTasks.length === 0 
              ? { flexGrow: 1, justifyContent: 'center', paddingBottom: 80 } 
              : { paddingBottom: 140 }
          ]}
          scrollEnabled={displayedTasks.length > 0}
          bounces={displayedTasks.length > 0}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={Platform.OS === 'android'}
          maxToRenderPerBatch={10}
          windowSize={5}
          initialNumToRender={8}
          onScroll={handleScroll}
          scrollEventThrottle={64}
          onScrollEndDrag={(e: any) => {
            if ((e?.nativeEvent?.contentOffset?.y ?? 0) <= 30) setTabBarVisible(true);
          }}
          onMomentumScrollEnd={(e: any) => {
            if ((e?.nativeEvent?.contentOffset?.y ?? 0) <= 30) setTabBarVisible(true);
          }}
          sections={sections as any}
          keyExtractor={taskKeyExtractor}
          ListEmptyComponent={
            filterTag ? (
              <View style={{ alignItems: 'center', paddingVertical: 40, paddingHorizontal: 20 }}>
                <Ionicons name="pricetag-outline" size={38} color={colors.textTertiary} style={{ marginBottom: 12, opacity: 0.6 }} />
                <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 16, color: colors.textPrimary, marginBottom: 4 }}>
                  No #{filterTag} tasks
                </Text>
                <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 13, color: colors.textSecondary, textAlign: 'center', marginBottom: 16 }}>
                  No tasks tagged #{filterTag} found for this day.
                </Text>
                <TouchableOpacity
                  style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: isDark ? 'rgba(165,153,255,0.15)' : colors.surface2, borderWidth: 1, borderColor: colors.border }}
                  onPress={() => setFilterTag(null)}
                >
                  <Text style={{ color: colors.accentPrimary, fontFamily: 'Inter_600SemiBold', fontSize: 13 }}>Show All Tasks</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <EmptyState
                mascot="running"
                title="All clear!"
                subtitle="No tasks for today. Add one to stay on track."
                mascotSize={110}
                style={{ marginTop: 0, paddingVertical: 10 }}
              />
            )
          }
          renderSectionHeader={renderSectionHeader}
          renderItem={renderItem}
        />
      )}

      {/* FLOATING ACTION PILLS */}
      <View style={[styles.floatingAddContainer, { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 12 }]}>
        <AnimatedPressable style={styles.floatingAddBtn} onPress={() => setIsNewTaskOpen(true)}>
          <Ionicons name="add" size={18} color={isDark ? '#000000' : '#ffffff'} style={{ marginRight: 4 }} />
          <Text style={styles.floatingAddText}>Add task</Text>
        </AnimatedPressable>
        <AnimatedPressable
          style={[styles.floatingAddBtn, { backgroundColor: '#FF453A', paddingHorizontal: 16 }]}
          onPress={() => setIsVoiceDictationOpen(true)}
        >
          <Ionicons name="mic" size={18} color="#ffffff" style={{ marginRight: 4 }} />
          <Text style={[styles.floatingAddText, { color: '#ffffff' }]}>Voice</Text>
        </AnimatedPressable>
      </View>

      {/* OVERDUE MODAL — strictly conditional to avoid running overdueTasks.map on mount */}
      {isOverdueModalOpen && (
        <BottomSheet visible={isOverdueModalOpen} onClose={() => setIsOverdueModalOpen(false)} avoidKeyboard={false}>
          <View style={{ flexShrink: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, paddingHorizontal: 8, paddingTop: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="warning" size={24} color={colors.error} style={{ marginRight: 12 }} />
                <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 24, color: colors.textPrimary }}>Overdue Tasks</Text>
              </View>
              {overdueTasks.length > 0 && (
                <Pressable onPress={() => {
                  Alert.alert(
                    "Clear Overdue Tasks",
                    "Are you sure you want to completely delete all overdue tasks? This cannot be undone.",
                    [
                      { text: "Cancel", style: "cancel" },
                      { 
                        text: "Clear All", 
                        style: "destructive", 
                        onPress: () => {
                          overdueTasks.forEach(t => optimisticDeleteTask(t.id!));
                          bulkDelete(new Set(overdueTasks.map(t => t.id!)));
                          setIsOverdueModalOpen(false);
                        } 
                      }
                    ]
                  );
                }}>
                  <Text style={{ color: colors.error, fontSize: 14, fontFamily: 'Inter_600SemiBold', padding: 8 }}>Clear All</Text>
                </Pressable>
              )}
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 10 }}>
              {overdueTasks.map(t => (
                <TaskRowMemo
                  key={t.id}
                  task={t}
                  isOverdue={true}
                  onComplete={onCompleteRef}
                  onReschedule={onOverdueRescheduleRef}
                  onPress={onOverduePressRef}
                  onToggleSelect={onToggleSelectRef}
                  onUpdateTask={onUpdateTaskRef}
                />
              ))}
            </ScrollView>
          </View>
        </BottomSheet>
      )}

      {/* INBOX MODAL — strictly conditional to avoid running inboxTasks.map on mount */}
      {isInboxModalOpen && (
        <BottomSheet visible={isInboxModalOpen} onClose={() => setIsInboxModalOpen(false)} avoidKeyboard={false}>
          <View style={{ flexShrink: 1, maxHeight: 600 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20, paddingHorizontal: 8, paddingTop: 20 }}>
              <Ionicons name="file-tray" size={24} color={colors.accentPrimary} style={{ marginRight: 12 }} />
              <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 24, color: colors.textPrimary }}>Inbox</Text>
            </View>
            {inboxTasks.length === 0 ? (
              <Text style={{ color: colors.textTertiary, fontFamily: 'Inter_500Medium', textAlign: 'center', marginTop: 20, paddingBottom: 40 }}>No tasks in your inbox.</Text>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
                {inboxTasks.map(t => (
                  <TaskRowMemo
                    key={t.id}
                    task={t}
                    isOverdue={false}
                    onComplete={onCompleteRef}
                    onReschedule={onInboxRescheduleRef}
                    onPress={onInboxPressRef}
                    isBulkEdit={isBulkEdit}
                    isSelected={selectedTaskIds.has(t.id!)}
                    onToggleSelect={onToggleSelectRef}
                    onUpdateTask={onUpdateTaskRef}
                  />
                ))}
              </ScrollView>
            )}
          </View>
        </BottomSheet>
      )}

      {/* OVERFLOW MENU MODAL — strictly conditional */}
      {isMenuOpen && (
        <Modal visible={isMenuOpen} transparent animationType="fade" onRequestClose={() => setIsMenuOpen(false)}>
          <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setIsMenuOpen(false)}>
            <View style={styles.menuContainer}>
              <TouchableOpacity style={styles.menuItem} onPress={() => { setSortBy('priority'); setIsMenuOpen(false); }}>
                <Ionicons name="filter" size={18} color={colors.textPrimary} style={{ marginRight: 12 }} />
                <Text style={styles.menuItemText}>Sort by Priority</Text>
                {sortBy === 'priority' && <Ionicons name="checkmark" size={16} color={colors.accentPrimary} style={{ marginLeft: 'auto' }} />}
              </TouchableOpacity>
              <View style={styles.menuDivider} />
              <TouchableOpacity style={styles.menuItem} onPress={() => { setIsTemplatesSheetOpen(true); setIsMenuOpen(false); }}>
                <Ionicons name="copy-outline" size={18} color={colors.textPrimary} style={{ marginRight: 12 }} />
                <Text style={styles.menuItemText}>Task Templates</Text>
              </TouchableOpacity>
              <View style={styles.menuDivider} />
              <TouchableOpacity style={styles.menuItem} onPress={() => { setIsBulkEdit(true); setIsMenuOpen(false); }}>
                <Ionicons name="checkbox-outline" size={18} color={colors.textPrimary} style={{ marginRight: 12 }} />
                <Text style={styles.menuItemText}>Select Multiple</Text>
              </TouchableOpacity>
              <View style={styles.menuDivider} />
              <TouchableOpacity style={styles.menuItem} onPress={() => { clearCompletedTasks(tasks); setIsMenuOpen(false); }}>
                <Ionicons name="trash-bin-outline" size={18} color={colors.error} style={{ marginRight: 12 }} />
                <Text style={[styles.menuItemText, { color: colors.error }]}>Clear Completed</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
      )}

      {/* BULK ACTION BAR */}
      {isBulkEdit && (
        <Animated.View entering={FadeInUp} style={[styles.bulkActionBar, { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 20, paddingVertical: 16, paddingHorizontal: 24 }]}>
          <AnimatedPressable style={[styles.bulkActionCircle, { opacity: selectedTaskIds.size === 0 ? 0.35 : 1, backgroundColor: isDark ? 'rgba(94,218,158,0.15)' : 'rgba(5,150,105,0.12)', borderColor: isDark ? 'rgba(94,218,158,0.4)' : 'rgba(5,150,105,0.3)' }]} disabled={selectedTaskIds.size === 0} onPress={() => { if(selectedTaskIds.size > 0) { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); bulkComplete(selectedTaskIds); setIsBulkEdit(false); setSelectedTaskIds(new Set()); } }}>
            <Ionicons name="checkmark" size={22} color={colors.accentGreen} />
          </AnimatedPressable>
          <AnimatedPressable style={[styles.bulkActionCircle, { opacity: selectedTaskIds.size === 0 ? 0.35 : 1, backgroundColor: isDark ? 'rgba(165,153,255,0.15)' : 'rgba(108,92,231,0.12)', borderColor: isDark ? 'rgba(165,153,255,0.4)' : 'rgba(108,92,231,0.3)' }]} disabled={selectedTaskIds.size === 0} onPress={() => { if(selectedTaskIds.size > 0) setBulkRescheduleModal(true); }}>
            <Ionicons name="calendar-outline" size={22} color={colors.accentPrimary} />
          </AnimatedPressable>
          <AnimatedPressable style={[styles.bulkActionCircle, { opacity: selectedTaskIds.size === 0 ? 0.35 : 1, backgroundColor: isDark ? 'rgba(255,105,97,0.15)' : 'rgba(220,38,38,0.12)', borderColor: isDark ? 'rgba(255,105,97,0.4)' : 'rgba(220,38,38,0.3)' }]} disabled={selectedTaskIds.size === 0} onPress={() => { if(selectedTaskIds.size > 0) { bulkDelete(selectedTaskIds); setIsBulkEdit(false); setSelectedTaskIds(new Set()); } }}>
            <Ionicons name="trash-outline" size={22} color={colors.error} />
          </AnimatedPressable>
        </Animated.View>
      )}

      {/* SHEETS */}
      {isTemplatesSheetOpen && (
        <Suspense fallback={null}>
          <TaskTemplatesSheet visible={isTemplatesSheetOpen} onClose={() => setIsTemplatesSheetOpen(false)} userId={user?.uid!} onApplyTemplate={(template) => addTaskFromTemplate(user?.uid!, template, selectedDate, tasks.length)} />
        </Suspense>
      )}
      {!!timeLogTask && (
        <Suspense fallback={null}>
          <TaskTimeLogSheet task={timeLogTask} visible={!!timeLogTask} onSkip={() => skipTimeLog(timeLogTask?.id!, optimisticUpdateTask)} onSave={(taskId, actualMinutes, actualStartTime) => saveTimeLog(taskId, actualMinutes, actualStartTime, optimisticUpdateTask)} />
        </Suspense>
      )}

    </View>
  );
}
