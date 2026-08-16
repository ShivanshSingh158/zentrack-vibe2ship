import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, Alert, SectionList, Pressable } from 'react-native';
import Animated, { FadeInUp, useSharedValue, useAnimatedStyle, withTiming, withDelay } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import Svg, { Circle } from 'react-native-svg';

import { useMobileData } from '../contexts/MobileDataContext';
import { useTheme } from '../contexts/ThemeContext';
import { formatDateWithDay } from '../utils/dateUtils';
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
const AnimatedSectionList = Animated.createAnimatedComponent(SectionList);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// Extracted Task Components
import { TaskDateStrip } from '../components/Tasks/TaskDateStrip';
import TimelineView from '../components/Tasks/TimelineView';
import KanbanView from '../components/Tasks/KanbanView';
import TaskRow from '../components/Tasks/TaskRow';
import EmptyState from '../components/ui/EmptyState';
import BulkRescheduleSheet from '../components/Tasks/BulkRescheduleSheet';
import TaskTimeLogSheet from '../components/Tasks/TaskTimeLogSheet';
import TimeSpentSheet from '../components/Tasks/TimeSpentSheet';
import TaskTemplatesSheet from '../components/Tasks/TaskTemplatesSheet';
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
    const ampm = isPM ? 'am' : 'pm'; // wait, logic fixed below
    return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${isPM ? 'pm' : 'am'}`;
  }
  return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${h >= 12 ? 'pm' : 'am'}`;
}

export default function TasksScreen() {
  const { colors, isDark } = useTheme();
  const styles = makeTasksStyles(colors);
  
  const { tasks, user, attendance, attendanceLogs, gymLogs, userGymPlan, optimisticUpdateTask, optimisticDeleteTask } = useMobileData();
  
  // 1. Recurring Spawn Logic
  useRecurringSpawn(tasks, user?.uid);

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
    setTimeLogTask,
    setIsBulkEdit,
    setSelectedTaskIds,
    setBulkRescheduleModal,
  });

  // Animations
  const animHeader = useSharedValue(0);
  const animDateStrip = useSharedValue(0);
  const animList = useSharedValue(0);

  useEffect(() => {
    animHeader.value = withTiming(1, { duration: 300 });
    animDateStrip.value = withDelay(100, withTiming(1, { duration: 300 }));
    animList.value = withDelay(200, withTiming(1, { duration: 300 }));
  }, []);

  const headerStyle = useAnimatedStyle(() => ({ opacity: animHeader.value, transform: [{ translateY: -20 * (1 - animHeader.value) }] }));
  const dateStripStyle = useAnimatedStyle(() => ({ opacity: animDateStrip.value, transform: [{ translateY: 20 * (1 - animDateStrip.value) }] }));
  const isFocused = useNavigation().isFocused();
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
  const listStyle = useAnimatedStyle(() => ({ opacity: animList.value, transform: [{ translateY: 40 * (1 - animList.value) }], flex: 1 }));

  const handleDateSelect = (date: string) => {
    triggerLayoutAnimation();
    setSelectedDate(date);
  };

  const doneCount = selectedDateTasks.filter((t) => t.status === 'completed').length;
  
  const now = new Date();
  const todayStr = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  const currentTimeFloat = now.getHours() + (now.getMinutes() / 60);

  const pendingTasksWithTime = selectedDateTasks
    .filter(t => {
      if (t.status !== 'pending' || !t.timeSlot) return false;
      if (selectedDate === todayStr) {
        return parseTimeFloat(t.timeSlot.split(/[-–]/)[0]) >= currentTimeFloat;
      }
      return true;
    })
    .sort((a, b) => parseTimeFloat(a.timeSlot) - parseTimeFloat(b.timeSlot));

  const nextPendingTimeStr = pendingTasksWithTime.length > 0 ? formatTimeStr(pendingTasksWithTime[0].timeSlot!.split(/[-–]/)[0]) : '';

  const progressSize = 44;
  const progressStroke = 3;
  const progressRadius = (progressSize - progressStroke) / 2;
  const progressCircum = progressRadius * 2 * Math.PI;
  const progressPercent = selectedDateTasks.length > 0 ? (doneCount / selectedDateTasks.length) : 0;
  const progressDashoffset = progressCircum - (progressPercent * progressCircum);

  const renderItem = ({ item }: { item: any }) => (
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
  );

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: '#000000' }]}>
      
      {/* PROACTIVE WIDGET */}
      {conflicts.filter(c => c.modules.includes('tasks') && !c.modules.includes('academic')).length > 0 && (
        <Animated.View style={[{ paddingHorizontal: 24, marginBottom: 16, marginTop: 8 }, headerStyle]}>
          {conflicts.filter(c => c.modules.includes('tasks') && !c.modules.includes('academic')).map(c => (
            <View key={c.id} style={{ backgroundColor: '#fee2e2', padding: 16, borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: '#fca5a5' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <Ionicons name="warning" size={16} color="#ef4444" />
                <Text style={{ fontFamily: 'Inter_700Bold', color: '#b91c1c', fontSize: 14 }}>Conflict Detected</Text>
              </View>
              <Text style={{ fontFamily: 'Inter_400Regular', color: '#991b1b', fontSize: 12 }}>{c.message} {c.suggestion}</Text>
            </View>
          ))}
        </Animated.View>
      )}

      {/* HEADER */}
      <View style={styles.topHeader}>
        <Text style={styles.topHeaderTitle}>{isBulkEdit ? `${selectedTaskIds.size} Selected` : 'Tasks'}</Text>
        <View style={styles.topHeaderIcons}>
          {isBulkEdit ? (
            <AnimatedPressable 
              style={[styles.iconBtn, { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(165,153,255,0.15)', alignItems: 'center', justifyContent: 'center' }]} 
              onPress={() => { setIsBulkEdit(false); setSelectedTaskIds(new Set()); }}
            >
              <Ionicons name="close" size={18} color="#A599FF" />
            </AnimatedPressable>
          ) : (
            <>
              {/* Inbox button */}
              <AnimatedPressable
                style={styles.iconBtn}
                onPress={() => overdueTasks.length > 0 ? setIsOverdueModalOpen(true) : setIsInboxModalOpen(true)}
              >
                <Ionicons name="file-tray-outline" size={20} color="#FFFFFF" />
                {overdueTasks.length > 0 ? (
                  <View style={[styles.badge, { backgroundColor: '#FF6961', top: -6, right: 6 }]}>
                    <Text style={[styles.badgeText, { color: '#FFFFFF' }]}>{overdueTasks.length}</Text>
                  </View>
                ) : inboxTasks.length > 0 ? (
                  <View style={[styles.badge, { top: -6, right: 6 }]}>
                    <Text style={styles.badgeText}>{inboxTasks.length}</Text>
                  </View>
                ) : null}
                <Text style={{ fontSize: 9, color: '#8e8e93', fontFamily: 'Inter_500Medium', marginTop: 2, textAlign: 'center' }}>Inbox</Text>
              </AnimatedPressable>
              {/* Time Spent button */}
              <AnimatedPressable style={styles.iconBtn} onPress={() => setIsTimeSpentOpen(true)}>
                <Ionicons name="timer-outline" size={20} color="#FFFFFF" />
                <Text style={{ fontSize: 9, color: '#8e8e93', fontFamily: 'Inter_500Medium', marginTop: 2, textAlign: 'center' }}>Timer</Text>
              </AnimatedPressable>
              <AnimatedPressable style={styles.iconBtn} onPress={() => setViewMode(v => v === 'list' ? 'timeline' : v === 'timeline' ? 'kanban' : 'list')}>
                <Ionicons name={viewMode === 'list' ? 'time-outline' : viewMode === 'timeline' ? 'git-branch-outline' : 'list'} size={20} color="#FFFFFF" />
                <Text style={{ fontSize: 9, color: '#8e8e93', fontFamily: 'Inter_500Medium', marginTop: 2, textAlign: 'center' }}>View</Text>
              </AnimatedPressable>
              <AnimatedPressable style={styles.iconBtn} onPress={() => setIsNewTaskOpen(true)}>
                <Ionicons name="add" size={22} color="#FFFFFF" />
                <Text style={{ fontSize: 9, color: '#8e8e93', fontFamily: 'Inter_500Medium', marginTop: 2, textAlign: 'center' }}>Add</Text>
              </AnimatedPressable>
              <AnimatedPressable style={styles.iconBtn} onPress={() => setIsMenuOpen(true)}>
                <Ionicons name="ellipsis-horizontal" size={20} color="#FFFFFF" />
                <Text style={{ fontSize: 9, color: '#8e8e93', fontFamily: 'Inter_500Medium', marginTop: 2, textAlign: 'center' }}>More</Text>
              </AnimatedPressable>
            </>
          )}
        </View>
      </View>

      {/* Date Selector */}
      <Animated.View style={[styles.dateSelectorContainer, dateStripStyle]}>
        <TaskDateStrip selectedDate={selectedDate} onSelectDate={handleDateSelect} taskDates={taskDates} />
      </Animated.View>

      {/* PROGRESS RING */}
      <Animated.View style={[{ paddingHorizontal: 6, marginBottom: 0 }, dateStripStyle]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#0A0A0A', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#2C2C2E' }}>
          <View style={{ width: progressSize, height: progressSize, alignItems: 'center', justifyContent: 'center', marginRight: 16 }}>
            <Svg width={progressSize} height={progressSize} style={{ position: 'absolute' }}>
              <Circle
                stroke="#2C2C2E"
                fill="none"
                cx={progressSize / 2}
                cy={progressSize / 2}
                r={progressRadius}
                strokeWidth={progressStroke}
              />
              <AnimatedCircle
                stroke="#FF9500"
                fill="none"
                cx={progressSize / 2}
                cy={progressSize / 2}
                r={progressRadius}
                strokeWidth={progressStroke}
                strokeDasharray={`${progressCircum} ${progressCircum}`}
                strokeDashoffset={progressDashoffset}
                strokeLinecap="round"
                transform={`rotate(-90 ${progressSize / 2} ${progressSize / 2})`}
              />
            </Svg>
            <Text style={{ color: '#FFFFFF', fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>{doneCount}/{selectedDateTasks.length}</Text>
          </View>
          <View>
            <Text style={{ color: '#FFFFFF', fontSize: 16, fontFamily: 'Inter_600SemiBold', marginBottom: 2 }}>
              <Text style={{ color: '#FF9500' }}>{doneCount}</Text> of {selectedDateTasks.length} done today
            </Text>
            <Text style={{ color: '#8E8E93', fontSize: 13, fontFamily: 'Inter_400Regular' }}>
              {selectedDateTasks.length - doneCount} remaining{nextPendingTimeStr ? ` · next at ${nextPendingTimeStr}` : ''}
            </Text>
          </View>
        </View>
      </Animated.View>

      {/* Standard Calendar Modal */}
      <UniversalCalendarModal
        visible={isCalendarOpen}
        onClose={() => setIsCalendarOpen(false)}
        selectedDate={selectedDate}
        onDateSelect={handleDateSelect}
        title="Jump to date"
      />

      {/* Advanced Reschedule Sheet */}
      <BulkRescheduleSheet
        visible={bulkRescheduleModal}
        onClose={() => setBulkRescheduleModal(false)}
        selectedTaskIds={selectedTaskIds}
        allTasks={tasks}
        onConfirm={(newDate, newSlot) => handleBulkReschedule(selectedTaskIds, newDate, newSlot)}
      />

      {editingTask && <EditTaskModal visible={!!editingTask} onClose={() => setEditingTask(null)} task={editingTask} />}
      {user && <NewTaskModal visible={isNewTaskOpen} onClose={() => setIsNewTaskOpen(false)} userId={user.uid} selectedDate={selectedDate} listCount={selectedDateTasks.length} />}

      {/* VIEWS */}
      {viewMode === 'timeline' ? (
        <Animated.View style={[{ flex: 1 }, listStyle]}>
          <TimelineView 
            tasks={selectedDateTasks} 
            onTaskPress={(t) => setEditingTask(t)} 
            colors={colors}
            attendance={attendance}
            attendanceLogs={attendanceLogs}
            gymLogs={gymLogs}
            userGymPlan={userGymPlan}
            selectedDate={selectedDate}
          />
        </Animated.View>
      ) : viewMode === 'kanban' ? (
        <Animated.View style={[{ flex: 1 }, listStyle]}>
          <KanbanView
            tasks={tasks.filter(t => !filterTag || (t.tags ?? []).includes(filterTag))}
            onTaskPress={(t) => setEditingTask(t)}
            colors={colors}
          />
        </Animated.View>
      ) : (
        <AnimatedSectionList
          style={listStyle}
          contentContainerStyle={[
            styles.listContent,
            selectedDateTasks.length === 0 
              ? { flexGrow: 1, justifyContent: 'center', paddingBottom: 80 } 
              : { paddingBottom: 140 }
          ]}
          scrollEnabled={selectedDateTasks.length > 0}
          bounces={selectedDateTasks.length > 0}
          showsVerticalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          onScrollEndDrag={(e: any) => {
            if ((e?.nativeEvent?.contentOffset?.y ?? 0) <= 30) setTabBarVisible(true);
          }}
          onMomentumScrollEnd={(e: any) => {
            if ((e?.nativeEvent?.contentOffset?.y ?? 0) <= 30) setTabBarVisible(true);
          }}
          sections={[
            ...(selectedDateTasks.length > 0 || isNewTaskOpen ? [{ title: selectedDate === todayStr ? 'TODAY' : formatDateWithDay(selectedDate).toUpperCase(), data: selectedDateTasks, isSelectedDate: true }] : []),
          ] as any}
          keyExtractor={(item: any) => item.id}
          ListEmptyComponent={
            <EmptyState
              mascot="running"
              title="All clear!"
              subtitle="No tasks for today. Add one to stay on track."
              mascotSize={110}
              style={{ marginTop: 0, paddingVertical: 10 }}
            />
          }
          renderSectionHeader={({ section: { title } }: any) => (
            <View style={styles.listSectionHeader}>
              <Text style={[styles.listSectionTitle, { color: '#8E8E93', fontSize: 11, letterSpacing: 1 }]}>{title}</Text>
            </View>
          )}
          renderItem={renderItem}
        />
      )}

      {/* FLOATING ACTION PILLS */}
      <View style={[styles.floatingAddContainer, { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 16 }]}>
        <AnimatedPressable style={styles.floatingAddBtn} onPress={() => setIsNewTaskOpen(true)}>
          <Ionicons name="add" size={18} color="#000000" style={{ marginRight: 4 }} />
          <Text style={styles.floatingAddText}>Add task</Text>
        </AnimatedPressable>
      </View>

      {/* OVERDUE MODAL */}
      <BottomSheet visible={isOverdueModalOpen} onClose={() => setIsOverdueModalOpen(false)}>
        <View style={{ flexShrink: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, paddingHorizontal: 8, paddingTop: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="warning" size={24} color="#FF6961" style={{ marginRight: 12 }} />
              <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 24, color: '#FFFFFF' }}>Overdue Tasks</Text>
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
                <Text style={{ color: '#FF6961', fontSize: 14, fontFamily: 'Inter_600SemiBold', padding: 8 }}>Clear All</Text>
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

      {/* INBOX MODAL */}
      <BottomSheet visible={isInboxModalOpen} onClose={() => setIsInboxModalOpen(false)}>
        <View style={{ flexShrink: 1, maxHeight: 600 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20, paddingHorizontal: 8, paddingTop: 20 }}>
            <Ionicons name="file-tray" size={24} color="#A599FF" style={{ marginRight: 12 }} />
            <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 24, color: '#FFFFFF' }}>Inbox</Text>
          </View>
          {inboxTasks.length === 0 ? (
            <Text style={{ color: '#8E8E93', fontFamily: 'Inter_500Medium', textAlign: 'center', marginTop: 20, paddingBottom: 40 }}>No tasks in your inbox.</Text>
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

      {/* OVERFLOW MENU MODAL */}
      <Modal visible={isMenuOpen} transparent animationType="fade" onRequestClose={() => setIsMenuOpen(false)}>
        <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={() => setIsMenuOpen(false)}>
          <View style={styles.menuContainer}>
            <TouchableOpacity style={styles.menuItem} onPress={() => { setSortBy('priority'); setIsMenuOpen(false); }}>
              <Ionicons name="filter" size={18} color="#FFFFFF" style={{ marginRight: 12 }} />
              <Text style={styles.menuItemText}>Sort by Priority</Text>
              {sortBy === 'priority' && <Ionicons name="checkmark" size={16} color="#A599FF" style={{ marginLeft: 'auto' }} />}
            </TouchableOpacity>
            <View style={styles.menuDivider} />
            <TouchableOpacity style={styles.menuItem} onPress={() => { setIsTemplatesSheetOpen(true); setIsMenuOpen(false); }}>
              <Ionicons name="copy-outline" size={18} color="#FFFFFF" style={{ marginRight: 12 }} />
              <Text style={styles.menuItemText}>Task Templates</Text>
            </TouchableOpacity>
            <View style={styles.menuDivider} />
            <TouchableOpacity style={styles.menuItem} onPress={() => { setIsBulkEdit(true); setIsMenuOpen(false); }}>
              <Ionicons name="checkbox-outline" size={18} color="#FFFFFF" style={{ marginRight: 12 }} />
              <Text style={styles.menuItemText}>Select Multiple</Text>
            </TouchableOpacity>
            <View style={styles.menuDivider} />
            <TouchableOpacity style={styles.menuItem} onPress={() => { clearCompletedTasks(tasks); setIsMenuOpen(false); }}>
              <Ionicons name="trash-bin-outline" size={18} color="#FF6961" style={{ marginRight: 12 }} />
              <Text style={[styles.menuItemText, { color: '#FF6961' }]}>Clear Completed</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* BULK ACTION BAR */}
      {isBulkEdit && (
        <Animated.View entering={FadeInUp} style={[styles.bulkActionBar, { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 20, paddingVertical: 16, paddingHorizontal: 24 }]}>
          <AnimatedPressable style={[styles.bulkActionCircle, { opacity: selectedTaskIds.size === 0 ? 0.35 : 1, backgroundColor: 'rgba(94,218,158,0.15)', borderColor: 'rgba(94,218,158,0.4)' }]} disabled={selectedTaskIds.size === 0} onPress={() => { if(selectedTaskIds.size > 0) { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); bulkComplete(selectedTaskIds); setIsBulkEdit(false); setSelectedTaskIds(new Set()); } }}>
            <Ionicons name="checkmark" size={22} color="#5eda9e" />
          </AnimatedPressable>
          <AnimatedPressable style={[styles.bulkActionCircle, { opacity: selectedTaskIds.size === 0 ? 0.35 : 1, backgroundColor: 'rgba(165,153,255,0.15)', borderColor: 'rgba(165,153,255,0.4)' }]} disabled={selectedTaskIds.size === 0} onPress={() => { if(selectedTaskIds.size > 0) setBulkRescheduleModal(true); }}>
            <Ionicons name="calendar-outline" size={22} color="#A599FF" />
          </AnimatedPressable>
          <AnimatedPressable style={[styles.bulkActionCircle, { opacity: selectedTaskIds.size === 0 ? 0.35 : 1, backgroundColor: 'rgba(255,105,97,0.15)', borderColor: 'rgba(255,105,97,0.4)' }]} disabled={selectedTaskIds.size === 0} onPress={() => { if(selectedTaskIds.size > 0) { bulkDelete(selectedTaskIds); setIsBulkEdit(false); setSelectedTaskIds(new Set()); } }}>
            <Ionicons name="trash-outline" size={22} color="#ff6961" />
          </AnimatedPressable>
        </Animated.View>
      )}

      {/* SHEETS */}
      <TaskTemplatesSheet visible={isTemplatesSheetOpen} onClose={() => setIsTemplatesSheetOpen(false)} userId={user?.uid!} onApplyTemplate={(template) => addTaskFromTemplate(user?.uid!, template, selectedDate, tasks.length)} />
      <TaskTimeLogSheet task={timeLogTask} visible={!!timeLogTask} onSkip={() => skipTimeLog(timeLogTask?.id!, optimisticUpdateTask)} onSave={(taskId, actualMinutes, actualStartTime) => saveTimeLog(taskId, actualMinutes, actualStartTime, optimisticUpdateTask)} />
      <TimeSpentSheet visible={isTimeSpentOpen} onClose={() => setIsTimeSpentOpen(false)} tasks={tasks} selectedDate={selectedDate} />

    </SafeAreaView>
  );
}
