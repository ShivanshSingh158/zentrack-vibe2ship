import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, Alert, SectionList, Pressable, Platform, StatusBar } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import Svg, { Circle } from 'react-native-svg';

import { useCoreData } from '../contexts/domains/CoreDataContext';
import { useTheme } from '../contexts/ThemeContext';
import { formatDateWithDay, formatLocalDateStr } from '../utils/dateUtils';
import { triggerLayoutAnimation } from '../theme/animations';
import { setTabBarVisible } from '../utils/tabBarScroll';
import { today } from './tasks/taskConstants';

// Extracted Hooks & Styles
import { makeTasksStyles } from './tasks/tasksStyles';
import { useTasksData } from './tasks/useTasksData';
import { useTasksFirestore } from './tasks/useTasksFirestore';
import { useRecurringSpawn } from './tasks/useRecurringSpawn';
import { parseTimeFloat } from './tasks/taskConstants';

// Components
import AnimatedPressable from '../components/AnimatedPressable';
import UniversalCalendarModal from '../components/UniversalCalendarModal';
import BottomSheet from '../components/ui/BottomSheet';
const AnimatedCircle = Circle;

// Extracted Task Components
import { TaskDateStrip } from '../components/Tasks/TaskDateStrip';
import TimelineView from '../components/Tasks/TimelineView';
import KanbanView from '../components/Tasks/KanbanView';
import TaskRow from '../components/Tasks/TaskRow';
import EmptyState from '../components/ui/EmptyState';
import BulkRescheduleSheet from '../components/Tasks/BulkRescheduleSheet';
import TaskTimeLogSheet from '../components/Tasks/TaskTimeLogSheet';
import TaskTemplatesSheet from '../components/Tasks/TaskTemplatesSheet';
import { usePomodoro } from '../contexts/PomodoroContext';
import EditTaskModal from './tasks/EditTaskModal';
import NewTaskModal from './tasks/NewTaskModal';

function formatTimeStr(raw: string): string {
  if (!raw) return '';
  const t = raw.trim().toUpperCase();
  const isPM = t.includes('PM');
  const isAM = t.includes('AM');
  const cleaned = t.replace(/[\sAPM]+$/i, '').trim();
  const parts = cleaned.split(':');
  let h = parseInt(parts[0], 10);
  const m = parts.length >= 2 ? (parseInt(parts[1], 10) || 0) : 0;
  if (isNaN(h)) return raw.trim().toLowerCase();
  if (isPM || isAM) {
    return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${isPM ? 'pm' : 'am'}`;
  }
  return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${h >= 12 ? 'pm' : 'am'}`;
}

const PROGRESS_SIZE = 44;
const PROGRESS_STROKE = 3;
const PROGRESS_RADIUS = (PROGRESS_SIZE - PROGRESS_STROKE) / 2;
const PROGRESS_CIRCUM = PROGRESS_RADIUS * 2 * Math.PI;

export default function TasksScreen() {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeTasksStyles(colors, isDark), [colors, isDark]);
  const insets = useSafeAreaInsets();
  // Guaranteed synchronous status bar clearance on Frame 0 — prevents upward jump under Android status bar
  const topInset = Math.max(insets.top, Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 0);
  
  const { tasks, user, habits, habitLogs, tasksReady, optimisticUpdateTask, optimisticDeleteTask, optimisticAddTask } = useCoreData();
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

  const lastScrollY = React.useRef(0);
  const handleScroll = React.useCallback((e: any) => {
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

  const handleDateSelect = (date: string) => {
    triggerLayoutAnimation();
    setSelectedDate(date);
  };

  const { doneCount, progressPercent, progressDashoffset, nextPendingTimeStr } = useMemo(() => {
    let done = 0;
    const total = selectedDateTasks.length;
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const currentTimeFloat = now.getHours() + now.getMinutes() / 60;
    let nextStr = '';

    for (let i = 0; i < total; i++) {
      const t = selectedDateTasks[i];
      if (t.status === 'completed') {
        done++;
      } else if (!nextStr && t.status === 'pending' && t.timeSlot) {
        const start = t.timeSlot.split(/[-–—•]| to /i)[0]?.trim();
        if (selectedDate !== todayStr || parseTimeFloat(start) >= currentTimeFloat) {
          nextStr = formatTimeStr(start);
        }
      }
    }

    const progressSize = 44;
    const progressStroke = 3;
    const progressRadius = (progressSize - progressStroke) / 2;
    const progressCircum = progressRadius * 2 * Math.PI;
    const pct = total > 0 ? done / total : 0;
    const offset = progressCircum - pct * progressCircum;

    return {
      doneCount: done,
      progressPercent: pct,
      progressDashoffset: offset,
      nextPendingTimeStr: nextStr,
    };
  }, [selectedDateTasks, selectedDate]);

  const renderItem = useCallback(({ item }: { item: any }) => (
    <TaskRow
      task={item}
      isOverdue={item.date ? item.date < today && item.status !== 'completed' : false}
      onComplete={() => completeTask(item)}
      onReschedule={() => {
        setSelectedTaskIds(new Set([item.id!]));
        setBulkRescheduleModal(true);
      }}
      onPress={() => setEditingTask(item)}
      onLongPress={() => setEditingTask(item)}
      isBulkEdit={isBulkEdit}
      isSelected={selectedTaskIds.has(item.id!)}
      onToggleSelect={() => toggleTaskSelection(item.id!)}
      onUpdateTask={(id, updates) => updateTask(id, updates)}
      onAddSubtask={() => setEditingTask(item)}
    />
  ), [completeTask, isBulkEdit, selectedTaskIds, setSelectedTaskIds, setBulkRescheduleModal, setEditingTask, toggleTaskSelection, updateTask]);

  const taskConflicts = useMemo(() => {
    return conflicts.filter(c => c.modules.includes('tasks') && !c.modules.includes('academic'));
  }, [conflicts]);

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

      {/* PROGRESS RING */}
      <View style={{ paddingHorizontal: 6, marginBottom: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: colors.border }}>
          <View style={{ width: PROGRESS_SIZE, height: PROGRESS_SIZE, alignItems: 'center', justifyContent: 'center', marginRight: 16 }}>
            <Svg width={PROGRESS_SIZE} height={PROGRESS_SIZE} style={{ position: 'absolute' }}>
              <Circle
                stroke={isDark ? '#2C2C2E' : '#E2E1EA'}
                fill="none"
                cx={PROGRESS_SIZE / 2}
                cy={PROGRESS_SIZE / 2}
                r={PROGRESS_RADIUS}
                strokeWidth={PROGRESS_STROKE}
              />
              <AnimatedCircle
                stroke={colors.accentAmber}
                fill="none"
                cx={PROGRESS_SIZE / 2}
                cy={PROGRESS_SIZE / 2}
                r={PROGRESS_RADIUS}
                strokeWidth={PROGRESS_STROKE}
                strokeDasharray={`${PROGRESS_CIRCUM} ${PROGRESS_CIRCUM}`}
                strokeDashoffset={progressDashoffset}
                strokeLinecap="round"
                transform={`rotate(-90 ${PROGRESS_SIZE / 2} ${PROGRESS_SIZE / 2})`}
              />
            </Svg>
            <Text style={{ color: colors.textPrimary, fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>{doneCount}/{selectedDateTasks.length}</Text>
          </View>
          <View>
            <Text style={{ color: colors.textPrimary, fontSize: 16, fontFamily: 'Inter_600SemiBold', marginBottom: 2 }}>
              <Text style={{ color: colors.accentAmber }}>{doneCount}</Text> of {selectedDateTasks.length} done today
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 13, fontFamily: 'Inter_400Regular' }}>
              {selectedDateTasks.length - doneCount} remaining{nextPendingTimeStr ? ` · next at ${nextPendingTimeStr}` : ''}
            </Text>
          </View>
        </View>
      </View>

      {/* Standard Calendar Modal */}
      {isCalendarOpen && (
        <UniversalCalendarModal
          visible={isCalendarOpen}
          onClose={() => setIsCalendarOpen(false)}
          selectedDate={selectedDate}
          onDateSelect={handleDateSelect}
          title="Jump to date"
        />
      )}

      {/* Advanced Reschedule Sheet */}
      {bulkRescheduleModal && (
        <BulkRescheduleSheet
          visible={bulkRescheduleModal}
          onClose={() => setBulkRescheduleModal(false)}
          selectedTaskIds={selectedTaskIds}
          allTasks={tasks}
          onConfirm={(newDate, newSlot) => handleBulkReschedule(selectedTaskIds, newDate, newSlot)}
        />
      )}

      {/* Edit & New Task Modals — strictly conditional (0 lines executed on mount) */}
      {!!editingTask && (
        <EditTaskModal visible={!!editingTask} onClose={() => setEditingTask(null)} task={editingTask} />
      )}
      {isNewTaskOpen && !!user && (
        <NewTaskModal visible={isNewTaskOpen} onClose={() => setIsNewTaskOpen(false)} userId={user.uid} selectedDate={selectedDate} listCount={selectedDateTasks.length} />
      )}

      {/* VIEWS */}
      {viewMode === 'timeline' ? (
        <View style={{ flex: 1 }}>
          <TimelineView 
            tasks={selectedDateTasks} 
            onTaskPress={(t) => setEditingTask(t)} 
            colors={colors}
            isDark={isDark}
            selectedDate={selectedDate}
          />
        </View>
      ) : viewMode === 'kanban' ? (
        <View style={{ flex: 1 }}>
          <KanbanView
            tasks={tasks.filter(t => !filterTag || (t.tags ?? []).includes(filterTag))}
            onTaskPress={(t) => setEditingTask(t)}
            colors={colors}
          />
        </View>
      ) : (
        <SectionList
          style={{ flex: 1 }}
          contentContainerStyle={[
            styles.listContent,
            selectedDateTasks.length === 0 
              ? { flexGrow: 1, justifyContent: 'center', paddingBottom: 80 } 
              : { paddingBottom: 140 }
          ]}
          scrollEnabled={selectedDateTasks.length > 0}
          bounces={selectedDateTasks.length > 0}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={Platform.OS === 'android'}
          maxToRenderPerBatch={10}
          windowSize={5}
          initialNumToRender={8}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          onScrollEndDrag={(e: any) => {
            if ((e?.nativeEvent?.contentOffset?.y ?? 0) <= 30) setTabBarVisible(true);
          }}
          onMomentumScrollEnd={(e: any) => {
            if ((e?.nativeEvent?.contentOffset?.y ?? 0) <= 30) setTabBarVisible(true);
          }}
          sections={[
            ...(selectedDateTasks.length > 0 ? [{ title: selectedDate === today ? 'TODAY' : formatDateWithDay(selectedDate).toUpperCase(), data: selectedDateTasks, isSelectedDate: true }] : []),
          ] as any}
          keyExtractor={(item: any) => item.id}
          ListEmptyComponent={
            tasksReady ? (
              <EmptyState
                mascot="running"
                title="All clear!"
                subtitle="No tasks for today. Add one to stay on track."
                mascotSize={110}
                style={{ marginTop: 0, paddingVertical: 10 }}
              />
            ) : null
          }
          renderSectionHeader={({ section: { title } }: any) => (
            <View style={styles.listSectionHeader}>
              <Text style={[styles.listSectionTitle, { color: colors.textTertiary, fontSize: 11, letterSpacing: 1 }]}>{title}</Text>
            </View>
          )}
          renderItem={renderItem}
        />
      )}

      {/* FLOATING ACTION PILLS */}
      <View style={[styles.floatingAddContainer, { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 16 }]}>
        <AnimatedPressable style={styles.floatingAddBtn} onPress={() => setIsNewTaskOpen(true)}>
          <Ionicons name="add" size={18} color={isDark ? '#000000' : '#ffffff'} style={{ marginRight: 4 }} />
          <Text style={styles.floatingAddText}>Add task</Text>
        </AnimatedPressable>
      </View>

      {/* OVERDUE MODAL — strictly conditional to avoid running overdueTasks.map on mount */}
      {isOverdueModalOpen && (
        <BottomSheet visible={isOverdueModalOpen} onClose={() => setIsOverdueModalOpen(false)}>
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
                <TaskRow
                  key={t.id}
                  task={t}
                  isOverdue={true}
                  onComplete={() => completeTask(t)}
                  onReschedule={() => {
                    setIsOverdueModalOpen(false);
                    setSelectedTaskIds(new Set([t.id!]));
                    setBulkRescheduleModal(true);
                  }}
                  onPress={() => { setIsOverdueModalOpen(false); setEditingTask(t); }}
                  onLongPress={() => { setIsOverdueModalOpen(false); setEditingTask(t); }}
                  onUpdateTask={(id, updates) => updateTask(id, updates)}
                  onAddSubtask={() => {
                    setIsOverdueModalOpen(false);
                    setEditingTask(t);
                  }}
                />
              ))}
            </ScrollView>
          </View>
        </BottomSheet>
      )}

      {/* INBOX MODAL — strictly conditional to avoid running inboxTasks.map on mount */}
      {isInboxModalOpen && (
        <BottomSheet visible={isInboxModalOpen} onClose={() => setIsInboxModalOpen(false)}>
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
                  <TaskRow
                    key={t.id}
                    task={t}
                    isOverdue={false}
                    onComplete={() => completeTask(t)}
                    onReschedule={() => {
                      setIsInboxModalOpen(false);
                      setSelectedTaskIds(new Set([t.id!]));
                      setBulkRescheduleModal(true);
                    }}
                    onPress={() => { setIsInboxModalOpen(false); setEditingTask(t); }}
                    onLongPress={() => { setIsInboxModalOpen(false); setEditingTask(t); }}
                    isBulkEdit={isBulkEdit}
                    isSelected={selectedTaskIds.has(t.id!)}
                    onToggleSelect={() => toggleTaskSelection(t.id!)}
                    onUpdateTask={(id, updates) => updateTask(id, updates)}
                    onAddSubtask={() => {
                      setIsInboxModalOpen(false);
                      setEditingTask(t);
                    }}
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
      {isTemplatesSheetOpen && <TaskTemplatesSheet visible={isTemplatesSheetOpen} onClose={() => setIsTemplatesSheetOpen(false)} userId={user?.uid!} onApplyTemplate={(template) => addTaskFromTemplate(user?.uid!, template, selectedDate, tasks.length)} />}
      {!!timeLogTask && <TaskTimeLogSheet task={timeLogTask} visible={!!timeLogTask} onSkip={() => skipTimeLog(timeLogTask?.id!, optimisticUpdateTask)} onSave={(taskId, actualMinutes, actualStartTime) => saveTimeLog(taskId, actualMinutes, actualStartTime, optimisticUpdateTask)} />}

    </View>
  );
}
