import React, { useCallback } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform, Alert, Text } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import AnimatedPressable from '../components/AnimatedPressable';
import { useTheme } from '../contexts/ThemeContext';
import { useMobileData, Task } from '../contexts/MobileDataContext';

// Hooks
import { useTasksData, ViewMode } from './tasks/useTasksData';
import { useTasksFirestore } from './tasks/useTasksFirestore';
import { useRecurringSpawn } from './tasks/useRecurringSpawn';
import { makeStyles } from './tasks/tasksStyles';

// Components
import TimelineView from '../components/Tasks/TimelineView';
import KanbanView from '../components/Tasks/KanbanView';
import MatrixView from '../components/Tasks/MatrixView';
import NewTaskModal from './tasks/NewTaskModal';
import EditTaskModal from './tasks/EditTaskModal';
import VoiceDictationOverlay from '../components/Tasks/VoiceDictationOverlay';
import TaskTimeLogSheet from '../components/Tasks/TaskTimeLogSheet';
import TaskDateStrip from '../components/Tasks/TaskDateStrip';

export default function TasksScreen() {
  const { colors } = useTheme();
  const s = makeStyles(colors);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { user, tasks, setTasks, customEvents } = useMobileData();

  // Data
  const data = useTasksData(tasks);
  
  // Firestore
  const optimisticUpdateTask = useCallback((id: string, updates: Partial<Task>) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  }, [setTasks]);

  const firestore = useTasksFirestore({
    optimisticUpdateTask,
    setTimeLogTask: data.setTimeLogTask,
    setIsBulkEdit: data.setIsBulkEdit,
    setSelectedTaskIds: data.setSelectedTaskIds,
    setBulkRescheduleModal: data.setBulkRescheduleModal
  });

  useRecurringSpawn(user?.uid, tasks);

  const renderView = () => {
    if (data.viewMode === 'timeline') {
      return (
        <TimelineView 
          tasks={data.selectedDateTasks}
          date={data.selectedDate}
          events={customEvents?.filter(e => e.date === data.selectedDate) || []}
          onToggleTask={t => firestore.completeTask(t)}
          onEditTask={data.setEditingTask}
        />
      );
    }
    if (data.viewMode === 'kanban') {
      return (
        <KanbanView 
          tasks={tasks.filter(t => t.status !== 'completed' && t.date === data.selectedDate)}
          onEditTask={data.setEditingTask}
          onToggleTask={t => firestore.completeTask(t)}
        />
      );
    }
    if (data.viewMode === 'matrix') {
      return (
        <MatrixView 
          tasks={tasks.filter(t => t.status !== 'completed' && t.date === data.selectedDate)}
          onEditTask={data.setEditingTask}
          onToggleTask={t => firestore.completeTask(t)}
        />
      );
    }
    // Default to list
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: colors.textSecondary }}>List View (Tasks: {data.selectedDateTasks.length})</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        
        {/* Header */}
        <View style={s.header}>
          <Text style={s.headerTitle}>Tasks</Text>
          <View style={s.headerActions}>
            <AnimatedPressable onPress={() => data.setIsNewTaskOpen(true)} style={s.iconButton}>
              <Ionicons name="add" size={24} color={colors.textPrimary} />
            </AnimatedPressable>
          </View>
        </View>

        {/* Date Strip */}
        <TaskDateStrip 
          selectedDate={data.selectedDate} 
          onSelectDate={data.setSelectedDate} 
        />

        {/* Main Content */}
        <View style={{ flex: 1 }}>
          {renderView()}
        </View>

        {/* Modals */}
        <NewTaskModal 
          visible={data.isNewTaskOpen} 
          onClose={() => data.setIsNewTaskOpen(false)} 
          defaultDate={data.selectedDate} 
        />
        <EditTaskModal 
          visible={!!data.editingTask} 
          task={data.editingTask} 
          onClose={() => data.setEditingTask(null)} 
        />
        <TaskTimeLogSheet 
          visible={!!data.timeLogTask}
          task={data.timeLogTask}
          onClose={() => data.setTimeLogTask(null)}
          onSave={(taskId, actualMins, actualStart) => firestore.saveTimeLog(taskId, actualMins, actualStart, optimisticUpdateTask)}
          onSkip={() => data.timeLogTask && firestore.skipTimeLog(data.timeLogTask.id!)}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
