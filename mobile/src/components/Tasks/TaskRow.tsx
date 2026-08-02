import React, { useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Task } from '../../contexts/MobileDataContext';
import { formatDateShort } from '../../utils/dateUtils';

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
  onUpdateTask?: (taskId: string, updates: Partial<Task>) => void;
  onAddSubtask?: () => void;
}

/** Convert a time string (12-hr or 24-hr) to a display string like "5:30 AM" */
function formatTimeStr(raw: string): string {
  const t = raw.trim().toUpperCase();
  const isPM = t.includes('PM');
  const isAM = t.includes('AM');
  const cleaned = t.replace(/[\sAPM]+$/i, '').trim();
  const parts = cleaned.split(':');
  let h = parseInt(parts[0], 10);
  const m = parts.length >= 2 ? (parseInt(parts[1], 10) || 0) : 0;
  if (isNaN(h)) return raw.trim();
  if (isPM || isAM) {
    // already 12-hr format — just normalise
    const ampm = isPM ? 'PM' : 'AM';
    const hr = h % 12 || 12;
    return `${hr}:${m.toString().padStart(2, '0')} ${ampm}`;
  }
  // 24-hr input
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hr = h % 12 || 12;
  return `${hr}:${m.toString().padStart(2, '0')} ${ampm}`;
}

function formatSubtext(task: Task, isOverdue: boolean) {
  if (task.status === 'completed') return null;

  if (isOverdue && task.date) {
    return {
      text: `${formatDateShort(task.date)}  Overdue`,
      color: '#D84C4C',
      icon: 'calendar-outline' as const,
    };
  }

  if (task.timeSlot) {
    // timeSlot may be "5:30 AM - 6:30 AM", "5:30 AM", "05:30-06:30", etc.
    const [startRaw, endRaw] = task.timeSlot.split(/[-–]/).map(s => s.trim());
    const formattedStart = formatTimeStr(startRaw);
    const timeText = endRaw
      ? `${formattedStart} – ${formatTimeStr(endRaw)}`
      : formattedStart;
    return { text: timeText, color: '#8E8E93', icon: 'time-outline' as const };
  }

  return null;
}

// ─── Tag color (deterministic by name hash) ─────────────────────────────────
const TAG_PALETTE = ['#a599ff','#60a5fa','#34d399','#f87171','#fb923c','#e879f9','#facc15','#38bdf8'];
function tagColor(tag: string): string {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  return TAG_PALETTE[Math.abs(hash) % TAG_PALETTE.length];
}


const TaskRow = React.memo(function TaskRow({ task, onComplete, onReschedule, onPress, onLongPress, isOverdue, isBulkEdit, isSelected, onToggleSelect, onUpdateTask, onAddSubtask }: TaskRowProps) {
  const swipeableRef = useRef<Swipeable>(null);
  const checkScale = useSharedValue(1);
  const isDone = task.status === 'completed';
  const [isExpanded, setIsExpanded] = React.useState(false);

  const totalSubtasks = task.subtasks?.length || 0;
  const completedSubtasks = task.subtasks?.filter(st => st.completed).length || 0;
  const hasSubtasks = totalSubtasks > 0;

  const subtextData = formatSubtext(task, isOverdue);
  const taskTags = task.tags && task.tags.length > 0 ? task.tags : null;


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
    <View style={styles.actionLeftContainer}>
      <View style={[styles.actionLeft, { backgroundColor: '#34C759' }]}>
        <Ionicons name="checkmark" size={22} color="#fff" />
      </View>
    </View>
  ), []);

  const renderRightActions = useCallback(() => (
    <View style={styles.actionRightContainer}>
      <TouchableOpacity 
        style={[styles.actionRight, { backgroundColor: '#5EA2FF', marginRight: 2 }]} 
        onPress={() => {
          swipeableRef.current?.close();
          onAddSubtask?.();
        }}
      >
        <Ionicons name="add-circle-outline" size={22} color="#fff" />
      </TouchableOpacity>
      <TouchableOpacity 
        style={[styles.actionRight, { backgroundColor: '#FF9500' }]}
        onPress={() => {
          swipeableRef.current?.close();
          onReschedule();
        }}
      >
        <Ionicons name="calendar-outline" size={22} color="#fff" />
      </TouchableOpacity>
    </View>
  ), [onAddSubtask, onReschedule]);

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
    paddingVertical: 14,
    paddingLeft: 20,
    paddingRight: 8,
  },
  rightHalf: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingRight: 20,
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
    fontSize: 15,
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

