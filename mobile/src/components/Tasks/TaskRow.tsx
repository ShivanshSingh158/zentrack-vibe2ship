import React, { useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Task } from '../../contexts/MobileDataContext';

const today = new Date().toISOString().slice(0, 10);

interface TaskRowProps {
  task: Task;
  onComplete: () => void;
  onReschedule: () => void;
  onPress: () => void;
  onLongPress: () => void;
  isOverdue: boolean;
  isBulkEdit?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
}

function formatSubtext(task: Task, isOverdue: boolean) {
  if (task.status === 'completed') return null;
  
  if (isOverdue && task.date) {
    const d = new Date(task.date + 'T00:00:00');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return { 
      text: `${months[d.getMonth()]} ${d.getDate()}  Overdue`, 
      color: '#D84C4C', 
      icon: 'calendar-outline' as const 
    };
  }

  let finalSubtext = null;
  if (task.timeSlot) {
    const start = task.timeSlot.split(/[-–]/)[0].trim();
    let formattedStart = start;
    if (start.includes(':')) {
      const [h, m] = start.split(':').map(Number);
      const ampm = h >= 12 ? 'PM' : 'AM';
      const hr = h % 12 || 12;
      formattedStart = `${hr}:${m.toString().padStart(2,'0')} ${ampm}`;
    }
    finalSubtext = { text: formattedStart, color: '#8E8E93', icon: 'time-outline' as const };
  }

  // Add subtask progress if subtasks exist
  if (task.subtasks && task.subtasks.length > 0) {
    const completedSubtasks = task.subtasks.filter(st => st.completed).length;
    const totalSubtasks = task.subtasks.length;
    const subtaskText = `${completedSubtasks}/${totalSubtasks} subtasks`;
    if (finalSubtext) {
      finalSubtext.text += `  •  ${subtaskText}`;
    } else {
      finalSubtext = { text: subtaskText, color: '#8E8E93', icon: 'list-outline' as const };
    }
  }

  return finalSubtext;
}

// Return a pill only if the task has a category/tag assigned by the user
function getPillData(task: Task) {
  if ((task as any).category) {
    return { label: `#${(task as any).category}`, bg: '#141416', text: '#A599FF' };
  }
  if ((task as any).tag) {
    return { label: `#${(task as any).tag}`, bg: '#141416', text: '#A599FF' };
  }
  return null;
}

const TaskRow = React.memo(function TaskRow({ task, onComplete, onReschedule, onPress, onLongPress, isOverdue, isBulkEdit, isSelected, onToggleSelect }: TaskRowProps) {
  const swipeableRef = useRef<Swipeable>(null);
  const checkScale = useSharedValue(1);
  const isDone = task.status === 'completed';

  const subtextData = formatSubtext(task, isOverdue);
  const pillData = getPillData(task);

  const animatedCheckStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
  }));

  const handleComplete = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    onComplete();
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
        style={[styles.row, isSelected && { backgroundColor: 'rgba(165, 153, 255, 0.05)' }]}
        onPress={isBulkEdit && onToggleSelect ? onToggleSelect : onPress}
        onLongPress={isBulkEdit && onToggleSelect ? onToggleSelect : handleLongPress}
        activeOpacity={0.75}
      >
        <TouchableOpacity 
          onPress={isBulkEdit && onToggleSelect ? onToggleSelect : handleComplete} 
          activeOpacity={0.8} 
          style={styles.checkArea}
        >
          <Animated.View style={[
            styles.checkbox, 
            isDone && !isBulkEdit && styles.checkboxDone, 
            isSelected && styles.checkboxSelected,
            animatedCheckStyle
          ]}>
            {isBulkEdit ? (
               isSelected && <Ionicons name="checkmark" size={12} color="#000000" />
            ) : (
               isDone && <Ionicons name="checkmark" size={12} color="#000000" />
            )}
          </Animated.View>
        </TouchableOpacity>

        <View style={styles.content}>
          <Text style={[styles.title, isDone && styles.titleDone]} numberOfLines={1}>
            {task.title}
          </Text>
          {subtextData && !isDone && (
            <View style={styles.subtextRow}>
              <Ionicons name={subtextData.icon} size={12} color={subtextData.color} style={{ marginRight: 4 }} />
              <Text style={[styles.subtext, { color: subtextData.color }]}>
                {subtextData.text}
              </Text>
              {/* Fake refresh icon shown in screenshot on some items */}
              {subtextData.icon === 'time-outline' && !isOverdue && (
                 <Ionicons name="repeat" size={10} color="#C7C7CC" style={{ marginLeft: 6 }} />
              )}
            </View>
          )}
        </View>

        {!isDone && pillData && (
          <View style={[styles.pill, { backgroundColor: pillData.bg }]}>
            <Text style={[styles.pillText, { color: pillData.text }]}>{pillData.label}</Text>
          </View>
        )}
      </TouchableOpacity>
    </Swipeable>
  );
});

export default TaskRow;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#1C1C1E',
    backgroundColor: '#000000',
  },
  checkArea: {
    paddingRight: 14,
    justifyContent: 'center',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#3A3A3C',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  checkboxDone: {
    backgroundColor: '#3A3A3C',
    borderColor: '#3A3A3C',
  },
  checkboxSelected: {
    backgroundColor: '#A599FF',
    borderColor: '#A599FF',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
    color: '#FFFFFF',
  },
  titleDone: {
    color: '#636366',
    textDecorationLine: 'line-through',
  },
  subtextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  subtext: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 12,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  pillText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
  },
  actionLeft: {
    backgroundColor: '#34C759', // iOS green
    justifyContent: 'center',
    alignItems: 'flex-start',
    paddingLeft: 20,
    minWidth: 80,
  },
  actionRight: {
    backgroundColor: '#FF9500', // iOS orange
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: 20,
    minWidth: 80,
  },
});
