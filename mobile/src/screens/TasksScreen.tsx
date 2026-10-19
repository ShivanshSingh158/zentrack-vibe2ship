import React, { useEffect, useState, useMemo, useCallback, useRef, Suspense } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, Alert, Pressable, Platform, StatusBar, Linking, PanResponder, InteractionManager, BackHandler, AppState } from 'react-native';
import { FlashList } from '@shopify/flash-list';
const TypedFlashList = FlashList as any;
import Animated, {
  FadeIn,
  FadeInUp,
  FadeInDown,
  FadeOut,
  SlideInRight,
  SlideInLeft,
  SlideInDown,
  SlideOutLeft,
  LinearTransition,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import * as Notifications from 'expo-notifications';
import { requestNotificationPermissions } from '../services/notifications';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { COLLECTION } from '../config/constants';
import { safeWrite } from '../utils/safeWrite';

import { useCoreData } from '../contexts/domains/CoreDataContext';
import { useTheme } from '../contexts/ThemeContext';
import { formatDateWithDay, formatLocalDateStr, formatDateShort, offsetDateStr } from '../utils/dateUtils';
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
import EditTaskModal from './tasks/EditTaskModal';
import NewTaskModal from './tasks/NewTaskModal';
const VoiceDictationOverlay = React.lazy(() => import('../components/Tasks/VoiceDictationOverlay'));

// Extracted Task Components
import { TaskDateStrip } from '../components/Tasks/TaskDateStrip';
import TaskRow from '../components/Tasks/TaskRow';
import TaskContextMenuModal from '../components/Tasks/TaskContextMenuModal';
import EmptyState from '../components/ui/EmptyState';
import { usePomodoroActions, usePomodoroActiveTask } from '../contexts/PomodoroContext';
import TasksSkeleton from '../components/Tasks/TasksSkeleton';
import type { Task } from '../contexts/MobileDataContext';

const taskKeyExtractor = (item: any) => item.id;

// Module-level cached permission to avoid blocking bridge call on every mount
let cachedNotifPermission: boolean | null = null;

export default function TasksScreen() {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeTasksStyles(colors, isDark), [colors, isDark]);
  const insets = useSafeAreaInsets();
  // Guaranteed synchronous status bar clearance on Frame 0 — prevents upward jump under Android status bar
  const topInset = Math.max(insets.top, Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 0);
  
  const { tasks, user, habits, habitLogs, tasksReady, optimisticUpdateTask, optimisticDeleteTask, optimisticAddTask } = useCoreData();
  const isInitialLoading = !tasksReady && (!tasks || tasks.length === 0);
  const { openPomodoro, startTaskPomodoro } = usePomodoroActions();
  const { linkedTaskId, isPomodoroRunning } = usePomodoroActiveTask();
  const todayDateStr = useMemo(() => formatLocalDateStr(new Date()), []);


  // 1. Recurring Spawn Logic (Deferred background run, guarded by tasksReady)
  useRecurringSpawn(tasks, user?.uid, optimisticAddTask, tasksReady);

  // 2. Data/State Hook
  const {
    selectedDate, viewMode, isCalendarOpen, isTemplatesSheetOpen,
    isNewTaskOpen, isBulkEdit, selectedTaskIds, bulkRescheduleModal,
    isOverdueModalOpen, isInboxModalOpen, isMenuOpen, sortBy,
    timeLogTask, isTimeSpentOpen, editingTask, conflicts,
    overdueTasks, inboxTasks, selectedDateTasks, upcomingTasks, taskDates,
    setSelectedDate, setViewMode, setIsCalendarOpen,
    setIsTemplatesSheetOpen, setIsNewTaskOpen, setIsBulkEdit,
    setSelectedTaskIds, setBulkRescheduleModal, setIsOverdueModalOpen,
    setIsInboxModalOpen, setIsMenuOpen, setSortBy, setTimeLogTask,
    setIsTimeSpentOpen, setEditingTask, setConflicts,
    toggleTaskSelection,
  } = useTasksData(tasks);

  // Hardware back button dismisses bulk edit mode on Android (Issue 99)
  useEffect(() => {
    if (!isBulkEdit) return;
    const onBackPress = () => {
      setIsBulkEdit(false);
      setSelectedTaskIds(new Set());
      return true;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [isBulkEdit, setIsBulkEdit, setSelectedTaskIds]);

  const [isVoiceDictationOpen, setIsVoiceDictationOpen] = useState(false);

  const route = useRoute<any>();
  useEffect(() => {
    if (route.params?.openAddTask) {
      setIsNewTaskOpen(true);
    }
  }, [route.params?.openAddTask, route.params?.timestamp]);

  const [contextMenuTask, setContextMenuTask] = useState<Task | null>(null);

  // Morphing View Switcher Animation (Issue 73: bounded modulo 360, removed redundant withSequence)
  const viewRotate = useSharedValue(0);
  const animViewRotateStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${viewRotate.value}deg` }],
  }));

  // Direction-aware view cycle: list → timeline → kanban → list
  const VIEW_ORDER = ['list', 'timeline', 'kanban'] as const;
  const prevViewRef = useRef(viewMode);

  const handleToggleView = useCallback(() => {
    const curIdx = VIEW_ORDER.indexOf(viewMode as any);
    const nextIdx = (curIdx + 1) % VIEW_ORDER.length;
    prevViewRef.current = viewMode;
    viewRotate.value = withTiming((viewRotate.value + 90) % 360, {
      duration: 180,
      easing: Easing.bezier(0.16, 1, 0.3, 1),
    });
    setViewMode(VIEW_ORDER[nextIdx]);
  }, [setViewMode, viewRotate, viewMode]);

  // 3. Firestore Hook
  const {
    completeTask,
    deleteTask,
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
    if (offsetY <= 35) {
      setTabBarVisible(true);
    } else {
      const diff = offsetY - lastScrollY.current;
      if (diff > 10) {
        setTabBarVisible(false);
      } else if (diff < -6) {
        setTabBarVisible(true);
      }
    }
    lastScrollY.current = offsetY;
  }, []);

  // ── Swipe-to-change-date Engine ──
  const [swipeDirection, setSwipeDirection] = useState<'forward' | 'backward'>('forward');

  const selectedDateRef = useRef(selectedDate);
  selectedDateRef.current = selectedDate;

  const handleDateSelect = useCallback((newDate: string) => {
    if (newDate > selectedDateRef.current) {
      setSwipeDirection('forward');
    } else if (newDate < selectedDateRef.current) {
      setSwipeDirection('backward');
    }
    setSelectedDate(newDate);
  }, [setSelectedDate]);

  const displayedTasks = selectedDateTasks;

  // Stable refs for isBulkEdit to preserve TaskRow memoization
  const isBulkEditRef = useRef(isBulkEdit);
  isBulkEditRef.current = isBulkEdit;

  const onCompleteRef = useCallback((task: Task) => completeTask(task), [completeTask]);
  const onRescheduleRef = useCallback((taskId: string) => {
    setSelectedTaskIds(new Set([taskId]));
    setBulkRescheduleModal(true);
  }, [setSelectedTaskIds, setBulkRescheduleModal]);

  // Floating Undo Toast State for Task Deletion
  const [recentlyDeletedTask, setRecentlyDeletedTask] = useState<Task | null>(null);
  const undoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    };
  }, []);

  const handleUndoDelete = useCallback(() => {
    if (recentlyDeletedTask && recentlyDeletedTask.id) {
      if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
      const restored = recentlyDeletedTask;
      setRecentlyDeletedTask(null);
      optimisticAddTask(restored);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      safeWrite(
        (payload) => setDoc(doc(db, COLLECTION.TASKS, restored.id), payload, { merge: true }),
        COLLECTION.TASKS,
        'set',
        restored,
        restored.id
      ).catch(console.warn);
    }
  }, [recentlyDeletedTask, optimisticAddTask]);

  const onDeleteRef = useCallback((task: Task) => {
    if (!task?.id) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    deleteTask(task.id);
    setRecentlyDeletedTask(task);
    if (undoTimeoutRef.current) clearTimeout(undoTimeoutRef.current);
    undoTimeoutRef.current = setTimeout(() => {
      undoTimeoutRef.current = null;
      setRecentlyDeletedTask(null);
    }, 4500);
  }, [deleteTask]);

  const onPressRef = useCallback((task: Task) => {
    if (isBulkEditRef.current) {
      if (task.id) toggleTaskSelection(task.id);
    } else {
      setEditingTask(task);
    }
  }, [toggleTaskSelection, setEditingTask]);

  const onLongPressRef = useCallback((task: Task) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (isBulkEditRef.current) {
      if (task.id) toggleTaskSelection(task.id);
    } else {
      // Wire WhatsApp-grade context menu on long press
      setContextMenuTask(task);
    }
  }, [toggleTaskSelection]);

  const onToggleSelectRef = useCallback((taskId: string) => {
    toggleTaskSelection(taskId);
  }, [toggleTaskSelection]);

  const onUpdateTaskRef = useCallback((id: string, updates: Partial<Task>) => updateTask(id, updates), [updateTask]);

  const onAddSubtaskRef = useCallback((task: Task) => setEditingTask(task), [setEditingTask]);

  // Modal-specific stable press handlers
  const onOverduePressRef = useCallback((task: Task) => {
    setIsOverdueModalOpen(false);
    setEditingTask(task);
  }, [setIsOverdueModalOpen, setEditingTask]);

  const onOverdueRescheduleRef = useCallback((taskId: string) => {
    setIsOverdueModalOpen(false);
    setSelectedTaskIds(new Set([taskId]));
    setBulkRescheduleModal(true);
  }, [setIsOverdueModalOpen, setSelectedTaskIds, setBulkRescheduleModal]);

  const onInboxPressRef = useCallback((task: Task) => {
    setIsInboxModalOpen(false);
    setEditingTask(task);
  }, [setIsInboxModalOpen, setEditingTask]);

  const onInboxRescheduleRef = useCallback((taskId: string) => {
    setIsInboxModalOpen(false);
    setSelectedTaskIds(new Set([taskId]));
    setBulkRescheduleModal(true);
  }, [setIsInboxModalOpen, setSelectedTaskIds, setBulkRescheduleModal]);

  const onStartPomodoroRef = useCallback((task: Task) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const mins = task.estimatedMinutes && task.estimatedMinutes > 0 ? task.estimatedMinutes : 25;
    startTaskPomodoro(task.id!, task.title, mins);
  }, [startTaskPomodoro]);

  const selectedTaskIdsRef = useRef(selectedTaskIds);
  selectedTaskIdsRef.current = selectedTaskIds;

  const renderItem = useCallback(({ item }: { item: any }) => (
    <TaskRow
      task={item}
      isOverdue={item.date ? item.date < todayDateStr && item.status !== 'completed' : false}
      isBulkEdit={isBulkEditRef.current}
      isSelected={selectedTaskIdsRef.current.has(item.id!)}
      todayDateStr={todayDateStr}
      onStartPomodoro={onStartPomodoroRef}
      activePomodoroTaskId={linkedTaskId}
      isPomodoroRunning={isPomodoroRunning}
      onComplete={onCompleteRef}
      onReschedule={onRescheduleRef}
      onPress={onPressRef}
      onLongPress={onLongPressRef}
      onDelete={onDeleteRef}
      onToggleSelect={onToggleSelectRef}
      onUpdateTask={onUpdateTaskRef}
      onAddSubtask={onAddSubtaskRef}
    />
  ), [todayDateStr, linkedTaskId, isPomodoroRunning, onStartPomodoroRef, onCompleteRef, onRescheduleRef, onPressRef, onLongPressRef, onDeleteRef, onToggleSelectRef, onUpdateTaskRef, onAddSubtaskRef]);

  const listHeaderComponent = useMemo(() => {
    if (displayedTasks.length === 0) return null;
    const title = selectedDate === todayDateStr ? 'TODAY' : formatDateWithDay(selectedDate).toUpperCase();
    return (
      <View style={styles.listSectionHeader}>
        <Text style={[styles.listSectionTitle, { color: colors.textTertiary, fontSize: 11, letterSpacing: 1 }]}>
          {title}
        </Text>
      </View>
    );
  }, [displayedTasks.length, selectedDate, todayDateStr, styles.listSectionHeader, styles.listSectionTitle, colors.textTertiary]);

  const taskConflicts = useMemo(() => {
    return conflicts.filter(c => c.modules.includes('tasks') && !c.modules.includes('academic'));
  }, [conflicts]);

  const [hasNotifPermission, setHasNotifPermission] = useState<boolean | null>(() => cachedNotifPermission ?? true);

  const checkNotifPermission = useCallback(() => {
    const handle = InteractionManager.runAfterInteractions(async () => {
      try {
        const { status } = await Notifications.getPermissionsAsync();
        const granted = status === 'granted';
        cachedNotifPermission = granted;
        setHasNotifPermission(prev => prev === granted ? prev : granted);
      } catch {
        // Leave existing state
      }
    });
    return () => handle.cancel?.();
  }, []);

  useEffect(() => {
    const cleanup = checkNotifPermission();
    return cleanup;
  }, [checkNotifPermission]);

  // Re-check notification permissions when app returns to foreground from OS settings (Issue 100)
  useEffect(() => {
    if (hasNotifPermission !== false) return;
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        checkNotifPermission();
      }
    });
    return () => sub.remove();
  }, [hasNotifPermission, checkNotifPermission]);

  const handleRequestNotifPermission = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const granted = await requestNotificationPermissions();
      cachedNotifPermission = granted;
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
        <View style={styles.proactiveConflictContainer}>
          {taskConflicts.map(c => (
            <View key={c.id} style={styles.proactiveConflictCard}>
              <View style={styles.proactiveConflictHeader}>
                <Ionicons name="warning" size={16} color={colors.error} />
                <Text style={styles.proactiveConflictTitle}>Conflict Detected</Text>
              </View>
              <Text style={styles.proactiveConflictBody}>{c.message} {c.suggestion}</Text>
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
              style={[styles.iconBtn, styles.closeBulkEditBtn]} 
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
                <Text style={styles.headerBtnText}>Inbox</Text>
              </AnimatedPressable>
              {/* Pomodoro Timer button */}
              <AnimatedPressable style={styles.iconBtn} onPress={() => openPomodoro()}>
                <Ionicons name="timer-outline" size={20} color={colors.textPrimary} />
                <Text style={styles.headerBtnText}>Timer</Text>
              </AnimatedPressable>
              <AnimatedPressable style={styles.iconBtn} onPress={handleToggleView}>
                <Animated.View style={animViewRotateStyle}>
                  <Ionicons name={viewMode === 'list' ? 'time-outline' : viewMode === 'timeline' ? 'git-branch-outline' : 'list'} size={20} color={colors.textPrimary} />
                </Animated.View>
                <Text style={styles.headerBtnText}>View</Text>
              </AnimatedPressable>
              <AnimatedPressable style={styles.iconBtn} onPress={() => setIsNewTaskOpen(true)}>
                <Ionicons name="add" size={22} color={colors.textPrimary} />
                <Text style={styles.headerBtnText}>Add</Text>
              </AnimatedPressable>
              <AnimatedPressable style={styles.iconBtn} onPress={() => setIsMenuOpen(true)}>
                <Ionicons name="ellipsis-horizontal" size={20} color={colors.textPrimary} />
                <Text style={styles.headerBtnText}>More</Text>
              </AnimatedPressable>
            </>
          )}
        </View>
      </View>

      {/* Date Selector */}
      <View style={styles.dateSelectorContainer}>
        <TaskDateStrip selectedDate={selectedDate} onSelectDate={handleDateSelect} taskDates={taskDates} />
      </View>

      {/* NOTIFICATION PERMISSION WARNING BANNER */}
      {hasNotifPermission === false && (
        <AnimatedPressable
          style={styles.notifBanner}
          onPress={handleRequestNotifPermission}
        >
          <Ionicons name="notifications-off" size={18} color="#f59e0b" />
          <View style={styles.notifBannerContent}>
            <Text style={styles.notifBannerTitle}>
              Notifications Disabled
            </Text>
            <Text style={styles.notifBannerSubtitle}>
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
            onClose={() => {
              setBulkRescheduleModal(false);
              if (!isBulkEdit) {
                setSelectedTaskIds(new Set());
              }
            }}
            selectedTaskIds={selectedTaskIds}
            allTasks={tasks}
            onConfirm={(newDate, newSlot) => handleBulkReschedule(selectedTaskIds, newDate, newSlot)}
          />
        </Suspense>
      )}

      {/* Edit & New Task Modals — only mounted when visible */}
      {!!editingTask && (
        <EditTaskModal visible={!!editingTask} onClose={() => setEditingTask(null)} task={editingTask} />
      )}
      {isNewTaskOpen && !!user && (
        <NewTaskModal
          visible={isNewTaskOpen}
          onClose={() => setIsNewTaskOpen(false)}
          userId={user.uid}
          selectedDate={selectedDate}
          listCount={selectedDateTasks.length}
        />
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
      <View style={{ flex: 1 }}>
        {isInitialLoading ? (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
            <TasksSkeleton />
          </ScrollView>
        ) : viewMode === 'timeline' ? (
          <Animated.View
            key="timeline"
            entering={
              swipeDirection === 'forward'
                ? SlideInRight.duration(200).easing(Easing.out(Easing.cubic))
                : SlideInLeft.duration(200).easing(Easing.out(Easing.cubic))
            }
            exiting={FadeOut.duration(120)}
            style={{ flex: 1 }}
          >
            <Suspense fallback={<TasksSkeleton />}>
              <TimelineView
                tasks={displayedTasks}
                onTaskPress={(t) => setEditingTask(t)}
                colors={colors}
                isDark={isDark}
                selectedDate={selectedDate}
              />
            </Suspense>
          </Animated.View>
        ) : viewMode === 'kanban' ? (
          <Animated.View key="kanban" entering={SlideInRight.duration(200).easing(Easing.out(Easing.exp))} exiting={FadeOut.duration(140)} style={{ flex: 1 }}>
            <Suspense fallback={<TasksSkeleton />}>
              <KanbanView
                tasks={tasks}
                onTaskPress={(t) => setEditingTask(t)}
                colors={colors}
              />
            </Suspense>
          </Animated.View>
        ) : (
          <View style={{ flex: 1 }}>
            <TypedFlashList
              data={displayedTasks}
              renderItem={renderItem}
              keyExtractor={taskKeyExtractor}
              estimatedItemSize={54}
              extraData={selectedTaskIds}
              ListHeaderComponent={listHeaderComponent}
              contentContainerStyle={[
                styles.listContent,
                displayedTasks.length === 0 
                  ? { flexGrow: 1, justifyContent: 'center', paddingBottom: 80 } 
                  : { paddingBottom: 140 }
              ]}
              showsVerticalScrollIndicator={false}
              onScroll={handleScroll}
              scrollEventThrottle={64}
              onScrollEndDrag={(e: any) => {
                if ((e?.nativeEvent?.contentOffset?.y ?? 0) <= 30) setTabBarVisible(true);
              }}
              onMomentumScrollEnd={(e: any) => {
                if ((e?.nativeEvent?.contentOffset?.y ?? 0) <= 30) setTabBarVisible(true);
              }}
              ListEmptyComponent={
                <EmptyState
                  mascot="running"
                  title="All clear!"
                  subtitle="No tasks for today. Add one to stay on track."
                  mascotSize={110}
                  style={{ marginTop: 0, paddingVertical: 10 }}
                />
              }
            />
          </View>
        )}
      </View>

      {/* FLOATING UNDO TOAST */}
      {recentlyDeletedTask && (
        <Animated.View
          entering={SlideInDown.duration(200).easing(Easing.bezier(0.16, 1, 0.3, 1))}
          exiting={FadeOut.duration(150)}
          style={[styles.undoToast, { backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF' }]}
        >
          <Text style={[styles.undoToastText, { color: colors.textPrimary }]} numberOfLines={1}>
            Task deleted
          </Text>
          <AnimatedPressable variant="button" onPress={handleUndoDelete} style={styles.undoToastBtn}>
            <Text style={styles.undoToastBtnText}>Undo</Text>
          </AnimatedPressable>
        </Animated.View>
      )}

      {/* FLOATING ACTION PILLS */}
      <View style={[styles.floatingAddContainer, { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 12 }]}>
        <AnimatedPressable
          style={[styles.floatingAddBtn, { shadowColor: colors.accentPrimary, shadowOpacity: 0.28, shadowRadius: 14, elevation: 6 }]}
          variant="cta"
          onPress={() => setIsNewTaskOpen(true)}
        >
          <Ionicons name="add" size={18} color={isDark ? '#000000' : '#ffffff'} style={{ marginRight: 4 }} />
          <Text style={styles.floatingAddText}>Add task</Text>
        </AnimatedPressable>
        <AnimatedPressable
          style={[styles.floatingAddBtn, styles.voiceActionBtn]}
          variant="cta"
          onPress={() => setIsVoiceDictationOpen(true)}
        >
          <Ionicons name="mic" size={18} color="#ffffff" style={{ marginRight: 4 }} />
          <Text style={[styles.floatingAddText, { color: '#ffffff' }]}>Voice</Text>
        </AnimatedPressable>
      </View>

      {/* OVERDUE MODAL — virtualized with FlashList (Issue 70: kept mounted for smooth slide-down exit) */}
      <BottomSheet visible={isOverdueModalOpen} onClose={() => setIsOverdueModalOpen(false)} avoidKeyboard={false}>
        <View style={{ flexShrink: 1, minHeight: 200, maxHeight: 600 }}>
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
          {isOverdueModalOpen && (
            <TypedFlashList
              data={overdueTasks}
              keyExtractor={taskKeyExtractor}
              estimatedItemSize={54}
              renderItem={({ item }: { item: Task }) => (
                <TaskRow
                  task={item}
                  isOverdue={true}
                  todayDateStr={todayDateStr}
                  onStartPomodoro={onStartPomodoroRef}
                  activePomodoroTaskId={linkedTaskId}
                  isPomodoroRunning={isPomodoroRunning}
                  onComplete={onCompleteRef}
                  onReschedule={onOverdueRescheduleRef}
                  onPress={onOverduePressRef}
                  onLongPress={onLongPressRef}
                  onDelete={onDeleteRef}
                  onToggleSelect={onToggleSelectRef}
                  onUpdateTask={onUpdateTaskRef}
                  onAddSubtask={onAddSubtaskRef}
                />
              )}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 20 }}
            />
          )}
        </View>
      </BottomSheet>

      {/* INBOX MODAL — virtualized with FlashList (Issue 70: kept mounted for smooth slide-down exit) */}
      <BottomSheet visible={isInboxModalOpen} onClose={() => setIsInboxModalOpen(false)} avoidKeyboard={false}>
        <View style={{ flexShrink: 1, minHeight: 200, maxHeight: 600 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20, paddingHorizontal: 8, paddingTop: 20 }}>
            <Ionicons name="file-tray" size={24} color={colors.accentPrimary} style={{ marginRight: 12 }} />
            <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 24, color: colors.textPrimary }}>Inbox</Text>
          </View>
          {inboxTasks.length === 0 ? (
            <Text style={{ color: colors.textTertiary, fontFamily: 'Inter_500Medium', textAlign: 'center', marginTop: 20, paddingBottom: 40 }}>No tasks in your inbox.</Text>
          ) : isInboxModalOpen ? (
            <TypedFlashList
              data={inboxTasks}
              keyExtractor={taskKeyExtractor}
              estimatedItemSize={54}
              renderItem={({ item }: { item: Task }) => (
                <TaskRow
                  task={item}
                  isOverdue={false}
                  isBulkEdit={isBulkEdit}
                  isSelected={selectedTaskIds.has(item.id!)}
                  todayDateStr={todayDateStr}
                  onStartPomodoro={onStartPomodoroRef}
                  activePomodoroTaskId={linkedTaskId}
                  isPomodoroRunning={isPomodoroRunning}
                  onComplete={onCompleteRef}
                  onReschedule={onInboxRescheduleRef}
                  onPress={onInboxPressRef}
                  onLongPress={onLongPressRef}
                  onDelete={onDeleteRef}
                  onToggleSelect={onToggleSelectRef}
                  onUpdateTask={onUpdateTaskRef}
                  onAddSubtask={onAddSubtaskRef}
                />
              )}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 20 }}
            />
          ) : null}
        </View>
      </BottomSheet>

      {/* OVERFLOW MENU MODAL — strictly conditional (Issue 71: animationType="none" prevents double fade) */}
      {isMenuOpen && (
        <Modal visible={isMenuOpen} transparent animationType="none" onRequestClose={() => setIsMenuOpen(false)}>
          <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setIsMenuOpen(false)}>
            <Animated.View entering={FadeIn.duration(150)} style={styles.menuContainer}>
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
            </Animated.View>
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

      {/* WHATSAPP-GRADE FLOATING CONTEXT MENU */}
      {!!contextMenuTask && (
        <TaskContextMenuModal
          visible={!!contextMenuTask}
          task={contextMenuTask}
          onClose={() => setContextMenuTask(null)}
          onToggleComplete={(t) => {
            completeTask(t);
          }}
          onReschedule={(t) => {
            if (t.id) {
              setSelectedTaskIds(new Set([t.id]));
              setBulkRescheduleModal(true);
            }
          }}
          onEdit={(t) => {
            setEditingTask(t);
          }}
          onDelete={(t) => {
            if (t.id) deleteTask(t.id);
          }}
        />
      )}

    </View>
  );
}
