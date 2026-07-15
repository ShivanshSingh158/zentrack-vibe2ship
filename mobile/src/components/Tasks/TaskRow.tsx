import React, { useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, runOnJS } from 'react-native-reanimated';
import { Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Task } from '../../contexts/MobileDataContext';
import { COLORS } from '../../theme/tokens';

const today = new Date().toISOString().slice(0, 10);

interface TaskRowProps {
  task: Task;
  onComplete: () => void;
  onReschedule: () => void;
  onPress: () => void;
  onLongPress: () => void;
  isOverdue: boolean;
}

function formatRightMeta(task: Task, isOverdue: boolean): { label: string; color: string } {
  if (task.status === 'completed') return { label: '', color: '' };
  
  if (isOverdue) {
    if (task.date) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yStr = yesterday.toISOString().slice(0, 10);
      if (task.date === yStr) return { label: 'Yesterday', color: '#ff6961' };
      const d = new Date(task.date + 'T00:00:00');
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      return { label: days[d.getDay()], color: '#ff6961' };
    }
    return { label: 'Overdue', color: '#ff6961' };
  }

  if (task.timeSlot) {
    const start = task.timeSlot.split(/[-–]/)[0].trim();
    let formattedStart = start;
    if (start.includes(':')) {
      const [h, m] = start.split(':').map(Number);
      const ampm = h >= 12 ? 'pm' : 'am';
      const hr = h % 12 || 12;
      formattedStart = `${hr}:${m.toString().padStart(2,'0')}${ampm}`;
    }
    return { label: formattedStart, color: '#8e8e93' };
  }

  if (task.date) {
    const d = new Date(task.date + 'T00:00:00');
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return { label: days[d.getDay()], color: '#8e8e93' };
  }

  return { label: '', color: '' };
}

// Extracted + memoized — runs on UI thread with Reanimated, zero re-renders on parent changes
const TaskRow = React.memo(function TaskRow({ task, onComplete, onReschedule, onPress, onLongPress, isOverdue }: TaskRowProps) {
  const swipeableRef = useRef<Swipeable>(null);
  
  // Reanimated worklet — runs on UI thread, never blocks JS thread
  const checkScale = useSharedValue(1);
  const isDone = task.status === 'completed';

  const completedSubtasks = task.subtasks?.filter(st => st.completed).length || 0;
  const totalSubtasks = task.subtasks?.length || 0;

  let dotColor: string | null = null;
  if (!isDone) {
    if (isOverdue) {
      dotColor = '#ff6961';
    } else if (task.priority === 'high' || task.priority === 'P1') {
      dotColor = '#ff9f4d';
    } else if (task.priority === 'medium' || task.priority === 'P2') {
      dotColor = '#ff9f4d';
    }
  }

  const { label: rightLabel, color: rightColor } = formatRightMeta(task, isOverdue);

  const animatedCheckStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
  }));

  // useCallback prevents new function references on parent re-renders from defeating React.memo
  const handleComplete = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    // Trigger the state update instantly so the UI reflects the checkmark immediately
    onComplete();
    // Spring animation runs entirely on UI thread — zero JS thread involvement
    checkScale.value = withSpring(1.35, { damping: 6, stiffness: 350 }, () => {
      checkScale.value = withSpring(1, { damping: 14, stiffness: 200 });
    });
  }, [onComplete]);

  const handleLongPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    onLongPress();
  }, [onLongPress]);

  const renderLeftActions = useCallback(() => (
    <View style={styles.actionLeft}>
      <Ionicons name="checkmark" size={22} color="#fff" />
    </View>
  ), []);

  const renderRightActions = useCallback(() => (
    <View style={styles.actionRight}>
      <Ionicons name="calendar-outline" size={22} color="#fff" />
    </View>
  ), []);

  const handleSwipeOpen = useCallback((direction: string) => {
    if (direction === 'left') {
      handleComplete();
      swipeableRef.current?.close();
    } else if (direction === 'right') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      onReschedule();
      swipeableRef.current?.close();
    }
  }, [handleComplete, onReschedule]);

  return (
    <Swipeable
      ref={swipeableRef}
      renderLeftActions={renderLeftActions}
      renderRightActions={renderRightActions}
      onSwipeableOpen={handleSwipeOpen}
      containerStyle={{ backgroundColor: 'transparent' }}
    >
      <TouchableOpacity
        style={styles.row}
        onPress={onPress}
        onLongPress={handleLongPress}
        activeOpacity={0.75}
      >
        {/* Checkbox — Reanimated animated view, scale runs on UI thread */}
        <TouchableOpacity onPress={handleComplete} activeOpacity={0.8} style={styles.checkArea}>
          <Animated.View style={[styles.checkbox, isDone && styles.checkboxDone, animatedCheckStyle]}>
            {isDone && <Ionicons name="checkmark" size={13} color="#000" />}
          </Animated.View>
        </TouchableOpacity>

        {/* Content */}
        <View style={styles.content}>
          <View style={styles.titleRow}>
            {dotColor && <View style={[styles.dot, { backgroundColor: dotColor }]} />}
            <Text
              style={[styles.title, isDone && styles.titleDone]}
              numberOfLines={1}
            >
              {task.title}
            </Text>
          </View>
          {totalSubtasks > 0 && !isDone && (
            <Text style={styles.subtaskLine}>
              {completedSubtasks} of {totalSubtasks} subtasks
            </Text>
          )}
        </View>

        {/* Right Meta */}
        {rightLabel ? (
          <Text style={[styles.rightMeta, { color: rightColor }]}>{rightLabel}</Text>
        ) : null}
      </TouchableOpacity>
    </Swipeable>
  );
});

export default TaskRow;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1c1c1e',
    backgroundColor: '#000000',
  },
  checkArea: {
    paddingRight: 12,
    justifyContent: 'center',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#3a3a3c',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  checkboxDone: {
    backgroundColor: '#5eda9e',
    borderColor: '#5eda9e',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  title: {
    fontSize: 14,
    fontWeight: '400',
    color: '#f2f2f7',
    flex: 1,
  },
  titleDone: {
    color: '#636366',
    textDecorationLine: 'line-through',
  },
  subtaskLine: {
    fontSize: 11,
    color: '#636366',
    marginTop: 2,
    marginLeft: 11,
  },
  rightMeta: {
    fontSize: 12,
    fontWeight: '400',
    marginLeft: 8,
  },
  actionLeft: {
    backgroundColor: '#5eda9e',
    justifyContent: 'center',
    alignItems: 'flex-start',
    paddingLeft: 20,
    minWidth: 80,
  },
  actionRight: {
    backgroundColor: '#a599ff',
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: 20,
    minWidth: 80,
  },
});
