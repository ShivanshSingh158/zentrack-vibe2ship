import React, { useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withSequence, withTiming, Easing } from 'react-native-reanimated';
import { Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Task } from '../../contexts/MobileDataContext';
import { formatDateShort } from '../../utils/dateUtils';

const today = new Date().toISOString().slice(0, 10);

interface TaskRowProps {
  task: Task;
  onComplete: () => void;
  onCompleteStart?: () => void;
  onReschedule: () => void;
  onPress: () => void;
  onLongPress: () => void;
  isOverdue: boolean;
  isBulkEdit?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
  onUpdateTask?: (taskId: string, updates: Partial<Task>) => void;
  onAddSubtask?: () => void;
}

/** Convert a time string (12-hr or 24-hr, single or range) to a display string like "7:30 am to 9:30 am" */
function formatSingleTime(timeStr: string) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':');
  if (!h || !m) return timeStr;
  let hh = parseInt(h, 10);
  const suffix = hh >= 12 ? 'pm' : 'am';
  if (hh === 0) hh = 12;
  else if (hh > 12) hh -= 12;
  return `${hh}:${m} ${suffix}`;
}

function formatTime12(timeStr?: string) {
  if (!timeStr) return '';
  if (timeStr.includes('-')) {
    const [start, end] = timeStr.split('-');
    return `${formatSingleTime(start.trim())} to ${formatSingleTime(end.trim())}`;
  }
  return formatSingleTime(timeStr);
}

const tagColor = (tag: string) => {
  const map: Record<string, string> = {
    'high': '#FF3B30',
    'work': '#0A84FF',
    'personal': '#30D158',
    'errand': '#FF9F0A',
    'gym': '#A599FF',
  };
  return map[tag.toLowerCase()] || '#8E8E93';
};

const formatSubtext = (task: Task, isOverdue: boolean) => {
  if (isOverdue) return { text: 'Overdue', color: '#FF453A', icon: 'alert-circle' as const };
  if (task.timeSlot) {
    return { text: formatTime12(task.timeSlot), color: '#8E8E93', icon: 'time-outline' as const };
  }
  if (task.date && task.date > today) {
    return { text: formatDateShort(task.date), color: '#8E8E93', icon: 'calendar-outline' as const };
  }
  return null;
};

const TaskRow = React.memo(function TaskRow({ task, onComplete, onCompleteStart, onReschedule, onPress, onLongPress, isOverdue, isBulkEdit, isSelected, onToggleSelect, onUpdateTask, onAddSubtask }: TaskRowProps) {
  const swipeableRef = useRef<Swipeable>(null);
  const checkScale = useSharedValue(1);
  const rowTranslateX = useSharedValue(0);
  const rowOpacity = useSharedValue(1);
  const [isCompleting, setIsCompleting] = React.useState(false);
  const isDone = task.status === 'completed' || isCompleting;
  const [isExpanded, setIsExpanded] = React.useState(false);

  const totalSubtasks = task.subtasks?.length || 0;
  const completedSubtasks = task.subtasks?.filter(st => st.completed).length || 0;
  const hasSubtasks = totalSubtasks > 0;

  const subtextData = formatSubtext(task, isOverdue);
  const taskTags = task.tags && task.tags.length > 0 ? task.tags : null;

  const animatedCheckStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
  }));

  const animatedRowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: rowTranslateX.value }],
    opacity: rowOpacity.value,
  }));

  const handleComplete = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    if (!isDone) {
      // Completing a pending task — optimistic animation
      if (onCompleteStart) onCompleteStart();
      setIsCompleting(true);
      checkScale.value = withSequence(
        withTiming(0.8, { duration: 100 }),
        withTiming(1.2, { duration: 150 }),
        withTiming(1.0, { duration: 100 })
      );
      setTimeout(() => {
        onComplete();
      }, 350);
    } else {
      // Un-completing — reset the local optimistic flag so isDone clears immediately
      setIsCompleting(false);
      onComplete();
    }
  }, [onComplete, onCompleteStart, isDone, checkScale]);


  const handleLongPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    onLongPress();
  }, [onLongPress]);

  const renderLeftActions = useCallback(() => (
    <View style={styles.actionLeftContainer}>
      <View style={[styles.actionLeft, { backgroundColor: '#34C759' }]}>
        <Ionicons name="checkmark" size={22} color="#fff" />
      </View>
    </View>
  ), []);

  const renderRightActions = useCallback(() => (
    <View style={styles.actionRightContainer}>
      <TouchableOpacity style={[styles.actionRight, { backgroundColor: '#A599FF' }]} onPress={onReschedule}>
        <Ionicons name="calendar-outline" size={20} color="#fff" />
      </TouchableOpacity>
      {onAddSubtask && (
         <TouchableOpacity style={[styles.actionRight, { backgroundColor: '#3A3A3C' }]} onPress={onAddSubtask}>
          <Ionicons name="list-outline" size={20} color="#fff" />
        </TouchableOpacity>
      )}
    </View>
  ), [onReschedule, onAddSubtask]);

  const handleSwipeOpen = useCallback((direction: string) => {
    if (direction === 'left') {
      handleComplete();
      swipeableRef.current?.close();
    }
  }, [handleComplete]);

  return (
    <Swipeable
      ref={swipeableRef}
      renderLeftActions={renderLeftActions}
      renderRightActions={renderRightActions}
      onSwipeableOpen={handleSwipeOpen}
      containerStyle={{ backgroundColor: 'transparent' }}
    >
      <Animated.View style={animatedRowStyle}>
        <View
          style={[styles.row, isSelected && { backgroundColor: 'rgba(165, 153, 255, 0.05)' }]}
        >
          <TouchableOpacity
            style={styles.leftHalf}
            onPress={isBulkEdit && onToggleSelect ? onToggleSelect : handleComplete}
            onLongPress={isBulkEdit && onToggleSelect ? onToggleSelect : handleLongPress}
            activeOpacity={0.75}
          >
            <View style={styles.checkArea}>
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
            </View>

            <View style={styles.content}>
              <Text style={[styles.title, isDone && styles.titleDone]} numberOfLines={1}>
                {task.title}
              </Text>

              {/* Subtask Progress Bar */}
              {hasSubtasks && !isDone && (
                <TouchableOpacity 
                  style={styles.subtaskProgressContainer}
                  onPress={() => setIsExpanded(!isExpanded)}
                  activeOpacity={0.7}
                >
                  <View style={styles.progressBarBg}>
                    <View style={[styles.progressBarFill, { width: `${(completedSubtasks / totalSubtasks) * 100}%` }]} />
                  </View>
                  <Text style={styles.subtaskProgressText}>
                    {completedSubtasks}/{totalSubtasks} subtasks
                  </Text>
                  <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={12} color="#8E8E93" style={{ marginLeft: 4 }} />
                </TouchableOpacity>
              )}

              {/* Tag Pills */}
              {taskTags && !isDone && (
                <View style={styles.tagRow}>
                  {taskTags.slice(0, 3).map(tag => (
                    <View key={tag} style={[styles.tagPill, { backgroundColor: tagColor(tag) + '22' }]}>
                      <Text style={[styles.tagPillText, { color: tagColor(tag) }]}>{tag}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.rightHalf}
            onPress={isBulkEdit && onToggleSelect ? onToggleSelect : onPress}
            onLongPress={isBulkEdit && onToggleSelect ? onToggleSelect : handleLongPress}
            activeOpacity={0.75}
          >
            {subtextData && !isDone && (
              <View style={styles.subtextRowRight}>
                <Ionicons name={subtextData.icon} size={12} color={subtextData.color} style={{ marginRight: 4 }} />
                <Text style={[styles.subtext, { color: subtextData.color }]}>
                  {subtextData.text}
                </Text>
                {subtextData.icon === 'time-outline' && !isOverdue && (
                   <Ionicons name="repeat" size={10} color="#C7C7CC" style={{ marginLeft: 6 }} />
                )}
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Expanded Subtasks List */}
        {isExpanded && hasSubtasks && !isDone && (
          <View style={styles.subtaskList}>
            {task.subtasks!.map((st, idx) => (
              <TouchableOpacity 
                key={st.id || idx} 
                style={styles.subtaskItem}
                activeOpacity={0.7}
                onPress={() => {
                  if (!onUpdateTask || !task.id) return;
                  Haptics.selectionAsync();
                  const newSubtasks = [...task.subtasks!];
                  newSubtasks[idx] = { ...st, completed: !st.completed };
                  const newCompletedCount = newSubtasks.filter(s => s.completed).length;
                  
                  // If this is the last subtask being completed, auto-complete the parent
                  if (newCompletedCount === totalSubtasks && !st.completed) {
                    onUpdateTask(task.id, { subtasks: newSubtasks });
                    setTimeout(() => {
                      handleComplete();
                    }, 300);
                  } else {
                    onUpdateTask(task.id, { subtasks: newSubtasks });
                  }
                }}
              >
                <View style={[styles.subtaskCheckbox, st.completed && styles.subtaskCheckboxDone]}>
                  {st.completed && <Ionicons name="checkmark" size={10} color="#000" />}
                </View>
                <Text style={[styles.subtaskTitle, st.completed && styles.subtaskTitleDone]}>
                  {st.title}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </Animated.View>
    </Swipeable>
  );
});

export default TaskRow;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderBottomWidth: 1,
    borderBottomColor: '#1C1C1E',
    backgroundColor: '#000000',
  },
  leftHalf: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingLeft: 4,
    paddingRight: 8,
  },
  rightHalf: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingRight: 4,
    paddingLeft: 8,
    minWidth: 80,
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
    fontSize: 14,
    color: '#FFFFFF',
  },
  titleDone: {
    color: '#636366',
    textDecorationLine: 'line-through',
  },

  subtextRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
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
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  pillText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 10,
  },
  actionLeftContainer: {
    flexDirection: 'row',
  },
  actionLeft: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
  },
  actionRightContainer: {
    flexDirection: 'row',
  },
  actionRight: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 60,
  },
  subtaskProgressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingVertical: 2,
  },
  progressBarBg: {
    width: 60,
    height: 4,
    backgroundColor: '#3A3A3C',
    borderRadius: 2,
    marginRight: 8,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#A599FF',
    borderRadius: 2,
  },
  subtaskProgressText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    color: '#8E8E93',
  },
  subtaskList: {
    backgroundColor: '#0A0A0A',
    paddingLeft: 54,
    paddingRight: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1C1C1E',
  },
  subtaskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  subtaskCheckbox: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#3A3A3C',
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtaskCheckboxDone: {
    backgroundColor: '#A599FF',
    borderColor: '#A599FF',
  },
  subtaskTitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: '#D1D1D6',
  },
  subtaskTitleDone: {
    color: '#636366',
    textDecorationLine: 'line-through',
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 4,
  },
  tagPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 20,
  },
  tagPillText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
  },
});
