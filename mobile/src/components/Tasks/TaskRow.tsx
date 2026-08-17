import React, { useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withSequence, withTiming, Easing } from 'react-native-reanimated';
import { Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Task } from '../../contexts/MobileDataContext';
import { formatDateShort } from '../../utils/dateUtils';
import { useTheme } from '../../contexts/ThemeContext';

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

/** Convert a time string (12-hr or 24-hr, single or range) to a clean display string like "7:30 am to 9:30 am" */
function formatSingleTime(timeStr: string) {
  if (!timeStr) return '';
  const upper = timeStr.trim().toUpperCase();
  const isPM = upper.includes('PM');
  const isAM = upper.includes('AM');
  const cleaned = upper.replace(/[\sAPM]+$/i, '').trim();
  const [h, m] = cleaned.split(':');
  if (!h) return timeStr;
  let hh = parseInt(h, 10);
  const mm = m ? parseInt(m, 10) : 0;
  if (isNaN(hh)) return timeStr;

  let suffix = 'am';
  if (isPM) {
    suffix = 'pm';
    if (hh > 12) hh -= 12;
  } else if (isAM) {
    suffix = 'am';
    if (hh === 0) hh = 12;
  } else {
    // 24-hr format
    suffix = hh >= 12 ? 'pm' : 'am';
    if (hh === 0) hh = 12;
    else if (hh > 12) hh -= 12;
  }

  const mmStr = isNaN(mm) ? '00' : String(mm).padStart(2, '0');
  return `${hh}:${mmStr} ${suffix}`;
}

function formatTime12(timeStr?: string) {
  if (!timeStr) return '';
  const parts = timeStr.split(/[-–—•]| to /i);
  if (parts.length > 1) {
    return `${formatSingleTime(parts[0].trim())} to ${formatSingleTime(parts[1].trim())}`;
  }
  return formatSingleTime(timeStr);
}

const getTagColor = (tag: string, colors: any) => {
  const map: Record<string, string> = {
    'high': colors.error,
    'work': colors.accentBlue,
    'personal': colors.accentGreen,
    'errand': colors.accentAmber,
    'gym': colors.accentPrimary,
  };
  return map[tag.toLowerCase()] || colors.textTertiary;
};

const getFormatSubtext = (task: Task, isOverdue: boolean, colors: any) => {
  if (isOverdue) return { text: 'Overdue', color: colors.error, icon: 'alert-circle' as const };
  if (task.timeSlot) {
    return { text: formatTime12(task.timeSlot), color: colors.textTertiary, icon: 'time-outline' as const };
  }
  if (task.date && task.date > today) {
    return { text: formatDateShort(task.date), color: colors.textTertiary, icon: 'calendar-outline' as const };
  }
  return null;
};

const TaskRow = React.memo(function TaskRow({ task, onComplete, onCompleteStart, onReschedule, onPress, onLongPress, isOverdue, isBulkEdit, isSelected, onToggleSelect, onUpdateTask, onAddSubtask }: TaskRowProps) {
  const { colors, isDark } = useTheme();
  const styles = makeStyles(colors, isDark);

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

  const subtextData = React.useMemo(() => getFormatSubtext(task, isOverdue, colors), [task.timeSlot, task.date, task.status, isOverdue, colors]);
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
      <View style={[styles.actionLeft, { backgroundColor: colors.accentGreen }]}>
        <Ionicons name="checkmark" size={22} color="#fff" />
      </View>
    </View>
  ), [colors]);

  const renderRightActions = useCallback(() => (
    <View style={styles.actionRightContainer}>
      <TouchableOpacity style={[styles.actionRight, { backgroundColor: colors.accentPrimary }]} onPress={onReschedule}>
        <Ionicons name="calendar-outline" size={20} color="#fff" />
      </TouchableOpacity>
      {onAddSubtask && (
         <TouchableOpacity style={[styles.actionRight, { backgroundColor: isDark ? '#3A3A3C' : '#6B7280' }]} onPress={onAddSubtask}>
          <Ionicons name="list-outline" size={20} color="#fff" />
        </TouchableOpacity>
      )}
    </View>
  ), [onReschedule, onAddSubtask, colors, isDark]);

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
          style={[styles.row, isSelected && { backgroundColor: isDark ? 'rgba(165, 153, 255, 0.08)' : 'rgba(108, 92, 231, 0.08)' }]}
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
                   isSelected && <Ionicons name="checkmark" size={12} color={isDark ? '#000000' : '#FFFFFF'} />
                ) : (
                   isDone && <Ionicons name="checkmark" size={12} color={isDark ? '#000000' : '#FFFFFF'} />
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
                  <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={12} color={colors.textTertiary} style={{ marginLeft: 4 }} />
                </TouchableOpacity>
              )}

              {/* Tag Pills */}
              {taskTags && !isDone && (
                <View style={styles.tagRow}>
                  {taskTags.slice(0, 3).map(tag => (
                    <View key={tag} style={[styles.tagPill, { backgroundColor: getTagColor(tag, colors) + '18' }]}>
                      <Text style={[styles.tagPillText, { color: getTagColor(tag, colors) }]}>{tag}</Text>
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
                   <Ionicons name="repeat" size={10} color={colors.textTertiary} style={{ marginLeft: 6 }} />
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
                  {st.completed && <Ionicons name="checkmark" size={10} color={isDark ? '#000000' : '#FFFFFF'} />}
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

const makeStyles = (colors: any, isDark: boolean = true) => StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
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
    borderColor: isDark ? '#3A3A3C' : '#D1D1D6',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: isDark ? 'transparent' : colors.surface2,
  },
  checkboxDone: {
    backgroundColor: colors.accentPrimary,
    borderColor: colors.accentPrimary,
  },
  checkboxSelected: {
    backgroundColor: colors.accentPrimary,
    borderColor: colors.accentPrimary,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: colors.textPrimary,
  },
  titleDone: {
    color: colors.textTertiary,
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
    borderColor: colors.border,
    backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
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
    backgroundColor: isDark ? '#3A3A3C' : '#E2E1EA',
    borderRadius: 2,
    marginRight: 8,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.accentPrimary,
    borderRadius: 2,
  },
  subtaskProgressText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    color: colors.textTertiary,
  },
  subtaskList: {
    backgroundColor: isDark ? '#0A0A0A' : colors.surface2,
    paddingLeft: 54,
    paddingRight: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
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
    borderColor: isDark ? '#3A3A3C' : '#D1D1D6',
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: isDark ? 'transparent' : colors.surface,
  },
  subtaskCheckboxDone: {
    backgroundColor: colors.accentPrimary,
    borderColor: colors.accentPrimary,
  },
  subtaskTitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: colors.textPrimary,
  },
  subtaskTitleDone: {
    color: colors.textTertiary,
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
