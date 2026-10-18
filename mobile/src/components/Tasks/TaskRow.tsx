import React, { useCallback, useRef, useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
  withRepeat,
  cancelAnimation,
  Easing,
  FadeInDown,
  FadeOut,
  SlideOutLeft,
  LinearTransition,
  runOnJS,
  interpolate,
  Extrapolation,
  SharedValue,
} from 'react-native-reanimated';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Task } from '../../contexts/MobileDataContext';
import { formatDateShort, formatLocalDateStr } from '../../utils/dateUtils';
import { useTheme } from '../../contexts/ThemeContext';
import { getTagColor, TIME_RANGE_REGEX } from '../../screens/tasks/taskConstants';

export interface TaskRowProps {
  task: Task;
  onComplete: (task: Task) => void;
  onCompleteStart?: () => void;
  onReschedule?: (taskId: string) => void;
  onPress: (task: Task) => void;
  onLongPress?: (task: Task) => void;
  onDelete?: (task: Task) => void;
  isOverdue: boolean;
  isBulkEdit?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (taskId: string) => void;
  onUpdateTask?: (taskId: string, updates: Partial<Task>) => void;
  onAddSubtask?: (task: Task) => void;
  todayDateStr?: string;
  currentMinuteTick?: number;
}

/** Convert a time string to clean 12-hr display */
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
    suffix = hh >= 12 ? 'pm' : 'am';
    if (hh === 0) hh = 12;
    else if (hh > 12) hh -= 12;
  }

  const mmStr = isNaN(mm) ? '00' : String(mm).padStart(2, '0');
  return `${hh}:${mmStr} ${suffix}`;
}

// Issue 61: use safe TIME_RANGE_REGEX — spaces inside "7:30 PM" must not split as range delimiter
function formatTime12(timeStr?: string) {
  if (!timeStr) return '';
  const parts = timeStr.split(TIME_RANGE_REGEX);
  if (parts.length > 1) {
    return `${formatSingleTime(parts[0].trim())} – ${formatSingleTime(parts[1].trim())}`;
  }
  return formatSingleTime(timeStr);
}

// Issue 94: getTagColor now imported from centralized taskConstants; local duplicate removed

const getFormatSubtext = (task: Task, isOverdue: boolean, priorityColor: string | null, colors: any, todayStr: string) => {
  if (isOverdue) return { text: 'Overdue', color: colors.error, icon: 'alert-circle' as const };
  if (task.timeSlot) {
    return { 
      text: formatTime12(task.timeSlot), 
      color: priorityColor || colors.textTertiary, 
      icon: 'time-outline' as const 
    };
  }
  if (task.date && task.date > todayStr) {
    return { text: formatDateShort(task.date), color: colors.textTertiary, icon: 'calendar-outline' as const };
  }
  return null;
};

const PARTICLE_COLORS = ['#5eda9e', '#a599ff', '#ff9f4d', '#38bdf8', '#ff6961', '#facc15'];
const PARTICLE_ANGLES = [0, 60, 120, 180, 240, 300];

// Issue 13: ParticleDot only mounts and executes worklets during active completion burst
const ParticleDot = React.memo(function ParticleDot({
  angle,
  color,
  progress,
}: {
  angle: number;
  color: string;
  progress: { value: number };
}) {
  const rad = (angle * Math.PI) / 180;
  const dist = 18;
  const targetX = Math.cos(rad) * dist;
  const targetY = Math.sin(rad) * dist;

  const style = useAnimatedStyle(() => {
    'worklet';
    const p = progress.value;
    if (p <= 0.01) return { opacity: 0 };
    return {
      opacity: 1 - p,
      transform: [
        { translateX: targetX * p },
        { translateY: targetY * p },
        { scale: Math.max(0.2, 1.25 - p * 0.7) },
      ],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          width: 4,
          height: 4,
          borderRadius: 2,
          backgroundColor: color,
          top: 8,
          left: 8,
        },
        style,
      ]}
    />
  );
});

interface SubtaskRowItemProps {
  subtask: { id: string; title: string; completed: boolean };
  index: number;
  totalSubtasks: number;
  allSubtasks: { id: string; title: string; completed: boolean }[];
  taskId?: string;
  onUpdateTask?: (taskId: string, updates: Partial<Task>) => void;
  onCompleteParent: () => void;
  isDark: boolean;
  styles: any;
}

const SubtaskRowItem = React.memo(function SubtaskRowItem({
  subtask,
  index,
  totalSubtasks,
  allSubtasks,
  taskId,
  onUpdateTask,
  onCompleteParent,
  isDark,
  styles,
}: SubtaskRowItemProps) {
  const checkScale = useSharedValue(1);
  const completeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (completeTimeoutRef.current) {
        clearTimeout(completeTimeoutRef.current);
      }
    };
  }, []);

  const animCheckStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
  }));

  const handleToggle = useCallback(() => {
    if (!onUpdateTask || !taskId) return;
    Haptics.selectionAsync();

    if (completeTimeoutRef.current) {
      clearTimeout(completeTimeoutRef.current);
      completeTimeoutRef.current = null;
    }

    checkScale.value = withSequence(
      withTiming(0.85, { duration: 60, easing: Easing.out(Easing.quad) }),
      withTiming(1.08, { duration: 80, easing: Easing.out(Easing.cubic) }),
      withTiming(1, { duration: 60, easing: Easing.out(Easing.cubic) })
    );

    const willBeCompleted = !subtask.completed;
    const newSubtasks = allSubtasks.map((st, i) =>
      i === index ? { ...st, completed: willBeCompleted } : st
    );
    const newCompletedCount = newSubtasks.filter(s => s.completed).length;

    onUpdateTask(taskId, { subtasks: newSubtasks });

    // Issue 23: Memory-safe cancellable timeout guard for parent task completion
    if (newCompletedCount === totalSubtasks && willBeCompleted) {
      completeTimeoutRef.current = setTimeout(() => {
        onCompleteParent();
      }, 300);
    }
  }, [onUpdateTask, taskId, allSubtasks, index, subtask.completed, totalSubtasks, onCompleteParent, checkScale]);

  return (
    <TouchableOpacity
      style={styles.subtaskItem}
      activeOpacity={0.7}
      onPress={handleToggle}
    >
      <Animated.View
        style={[
          styles.subtaskCheckbox,
          subtask.completed && styles.subtaskCheckboxDone,
          animCheckStyle,
        ]}
      >
        {subtask.completed && (
          <Ionicons name="checkmark" size={10} color={isDark ? '#000000' : '#FFFFFF'} />
        )}
      </Animated.View>
      <Text style={[styles.subtaskTitle, subtask.completed && styles.subtaskTitleDone]}>
        {subtask.title}
      </Text>
    </TouchableOpacity>
  );
});

// Issue 16: UI-thread Reanimated Swipe actions without JS bridge bottlenecks
const LeftSwipeAction = React.memo(function LeftSwipeAction({
  progress,
  colors,
  styles,
}: {
  progress: SharedValue<number>;
  colors: any;
  styles: any;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    const scale = interpolate(progress.value, [0, 0.6, 1], [0.7, 0.9, 1.2], Extrapolation.CLAMP);
    return { transform: [{ scale }] };
  });

  return (
    <View style={styles.actionLeftContainer}>
      <Animated.View style={[styles.actionLeft, { backgroundColor: colors.accentGreen }, animatedStyle]}>
        <Ionicons name="checkmark" size={22} color="#fff" />
      </Animated.View>
    </View>
  );
});

const RightSwipeAction = React.memo(function RightSwipeAction({
  progress,
  styles,
  onDelete,
}: {
  progress: SharedValue<number>;
  styles: any;
  onDelete: () => void;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    const scale = interpolate(progress.value, [0, 0.6, 1], [0.7, 0.9, 1.15], Extrapolation.CLAMP);
    return { transform: [{ scale }] };
  });

  return (
    <View style={styles.actionRightContainer}>
      <TouchableOpacity
        style={[styles.actionRight, { backgroundColor: '#FF453A', width: 76 }]}
        onPress={onDelete}
        activeOpacity={0.8}
      >
        <Animated.View style={[{ alignItems: 'center', justifyContent: 'center' }, animatedStyle]}>
          <Ionicons name="trash-outline" size={22} color="#ffffff" />
        </Animated.View>
      </TouchableOpacity>
    </View>
  );
});

// Issue 19: Module-level cached stylesheets keyed by isDark
let cachedStylesDark: any = null;
let cachedStylesLight: any = null;
const getCachedStyles = (colors: any, isDark: boolean) => {
  if (isDark) {
    if (!cachedStylesDark) cachedStylesDark = makeStyles(colors, true);
    return cachedStylesDark;
  }
  if (!cachedStylesLight) cachedStylesLight = makeStyles(colors, false);
  return cachedStylesLight;
};

const TaskRow = React.memo(function TaskRow({
  task,
  onComplete,
  onCompleteStart,
  onReschedule,
  onPress,
  onLongPress,
  onDelete,
  isOverdue,
  isBulkEdit = false,
  isSelected = false,
  onToggleSelect,
  onUpdateTask,
  onAddSubtask,
  todayDateStr,
  currentMinuteTick,
}: TaskRowProps) {
  const { colors, isDark } = useTheme();
  const styles = getCachedStyles(colors, isDark);
  const effectiveToday = todayDateStr || formatLocalDateStr(new Date());

  const swipeableRef = useRef<any>(null);
  const checkScale = useSharedValue(1);
  const burstProgress = useSharedValue(0);
  const [isCompleting, setIsCompleting] = useState(false);
  const isDone = task.status === 'completed' || isCompleting;
  const isRowSelected = Boolean(isBulkEdit && isSelected);
  const [isExpanded, setIsExpanded] = useState(false);

  // Chevron 180° rotation worklet
  const chevronRotation = useSharedValue(isExpanded ? 180 : 0);
  useEffect(() => {
    chevronRotation.value = withTiming(isExpanded ? 180 : 0, { duration: 180, easing: Easing.bezier(0.25, 0.1, 0.25, 1) });
  }, [isExpanded]);

  const animatedChevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${chevronRotation.value}deg` }],
  }));

  // Issue 76: reset isCompleting when task.status flips back to 'pending' (e.g. un-complete from KanbanView)
  useEffect(() => {
    if (task.status !== 'completed') {
      setIsCompleting(false);
    }
  }, [task.status]);

  // Issue 14: Single consolidated completionProgress shared value interpolates scale, opacity, and strike
  const completionProgress = useSharedValue(isDone ? 1 : 0);

  useEffect(() => {
    completionProgress.value = withTiming(isDone ? 1 : 0, { duration: 180, easing: Easing.bezier(0.25, 0.1, 0.25, 1) });
  }, [isDone]);

  const animatedRowStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(completionProgress.value, [0, 1], [1, 0.985]) }],
  }));

  const animatedTitleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(completionProgress.value, [0, 1], [1, 0.4]),
  }));

  // Issue 17: Static 100% width, transform scaleX on UI thread avoiding Yoga layout recalculation
  const animatedStrikeStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: completionProgress.value }],
    opacity: completionProgress.value > 0.05 ? 1 : 0,
  }));

  const totalSubtasks = task.subtasks?.length || 0;
  const completedSubtasks = task.subtasks?.filter(st => st.completed).length || 0;
  const hasSubtasks = totalSubtasks > 0;

  const priorityColor = useMemo(() => {
    if (task.priority === 'high' || task.priority === 'P1') return '#FF453A';
    if (task.priority === 'medium' || task.priority === 'P2') return '#FF9F0A';
    if (task.priority === 'low' || task.priority === 'P3') return '#30D158';
    return null;
  }, [task.priority]);

  const subtextData = useMemo(
    () => getFormatSubtext(task, isOverdue, priorityColor, colors, effectiveToday),
    [task.timeSlot, task.date, task.status, isOverdue, priorityColor, colors, effectiveToday]
  );
  const taskTags = task.tags && task.tags.length > 0 ? task.tags : null;

  // Issue 21: Reactive live countdown using currentMinuteTick
  const liveNowInfo = useMemo(() => {
    if (!task.timeSlot || task.status === 'completed' || task.date !== effectiveToday) return null;
    const now = new Date();
    const currentMin = now.getHours() * 60 + now.getMinutes();
    const parts = task.timeSlot.split(/[-–—•]| to /i);
    const parseSlot = (str: string) => {
      const cleaned = str.trim().toUpperCase();
      const isPM = cleaned.includes('PM');
      const isAM = cleaned.includes('AM');
      const [h, m] = cleaned.replace(/[^\d:]/g, '').split(':');
      if (!h) return null;
      let hh = parseInt(h, 10);
      const mm = m ? parseInt(m, 10) : 0;
      if (isPM && hh < 12) hh += 12;
      if (isAM && hh === 12) hh = 0;
      return hh * 60 + mm;
    };
    const startMin = parseSlot(parts[0]);
    if (startMin == null) return null;
    const duration = task.estimatedMinutes || 45;
    const endMin = parts.length > 1 ? (parseSlot(parts[1]) ?? startMin + duration) : (startMin + duration);
    if (currentMin >= startMin && currentMin <= endMin) {
      const remainingMins = Math.max(1, endMin - currentMin);
      return { remainingMins };
    }
    return null;
  }, [task.timeSlot, task.status, task.date, task.estimatedMinutes, effectiveToday, currentMinuteTick]);

  const isLiveNow = !!liveNowInfo;
  const hasMetadata = Boolean(
    isLiveNow ||
    isOverdue ||
    subtextData ||
    priorityColor ||
    task.isRecurring ||
    (taskTags && taskTags.length > 0) ||
    hasSubtasks ||
    task.isReminder
  );

  const overdueText = useMemo(() => {
    if (!isOverdue || !task.date) return 'Overdue';
    const now = new Date();
    const todayZero = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const [y, m, d] = task.date.split('-').map(Number);
    const taskDateZero = new Date(y, m - 1, d).getTime();
    const diffDays = Math.round((todayZero - taskDateZero) / (1000 * 60 * 60 * 24));
    if (diffDays === 1) return 'Overdue by 1 day';
    if (diffDays > 1) return `Overdue by ${diffDays} days`;
    return 'Overdue';
  }, [isOverdue, task.date]);

  // Issue 15: Clean pulse animation cancellation on stop / unmount
  const pulseAnim = useSharedValue(1);
  useEffect(() => {
    if (isLiveNow || isOverdue) {
      pulseAnim.value = withRepeat(
        withSequence(
          withTiming(0.4, { duration: 900, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
    } else {
      cancelAnimation(pulseAnim);
      pulseAnim.value = 1;
    }
    return () => {
      cancelAnimation(pulseAnim);
    };
  }, [isLiveNow, isOverdue]);

  const animatedPulseStyle = useAnimatedStyle(() => ({
    opacity: pulseAnim.value,
    transform: [{ scale: 0.85 + pulseAnim.value * 0.25 }],
  }));

  const animatedCheckStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
  }));

  const handleComplete = useCallback(() => {
    if (!isDone) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      if (onCompleteStart) onCompleteStart();
      setIsCompleting(true);
      burstProgress.value = withSequence(
        withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) }),
        withTiming(0, { duration: 0 })
      );
      checkScale.value = withSequence(
        withTiming(0.8, { duration: 85 }),
        withTiming(1.25, { duration: 140 }),
        withTiming(1.0, { duration: 90 }, () => {
          runOnJS(onComplete)(task);
        })
      );
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setIsCompleting(false);
      onComplete(task);
    }
  }, [onComplete, onCompleteStart, isDone, checkScale, burstProgress, task]);

  const handleLongPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    if (onLongPress) onLongPress(task);
  }, [onLongPress, task]);

  const handleEditPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    swipeableRef.current?.close();
    onPress(task);
  }, [onPress, task]);

  const handleDeletePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    swipeableRef.current?.close();
    if (onDelete) {
      onDelete(task);
    }
  }, [onDelete, task]);

  const handleSwipeOpen = useCallback((direction: string) => {
    if (direction === 'left') {
      handleComplete();
      swipeableRef.current?.close();
    } else if (direction === 'right') {
      handleDeletePress();
    }
  }, [handleComplete, handleDeletePress]);

  return (
    <ReanimatedSwipeable
      ref={swipeableRef}
      renderLeftActions={(progress) => <LeftSwipeAction progress={progress} colors={colors} styles={styles} />}
      renderRightActions={(progress) => <RightSwipeAction progress={progress} styles={styles} onDelete={handleDeletePress} />}
      onSwipeableWillOpen={(direction) => {
        if (direction === 'left' || direction === 'right') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }
      }}
      onSwipeableOpen={handleSwipeOpen}
      containerStyle={{ backgroundColor: 'transparent' }}
    >
      <Animated.View
        exiting={SlideOutLeft.duration(200)}
        style={animatedRowStyle}
      >
        <View
          style={[styles.row, isRowSelected && { backgroundColor: isDark ? 'rgba(165, 153, 255, 0.08)' : 'rgba(108, 92, 231, 0.08)' }]}
        >
          {/* 1. Dedicated Circular Checkbox Touch Target */}
          <TouchableOpacity
            style={styles.checkArea}
            onPress={isBulkEdit && onToggleSelect ? () => onToggleSelect(task.id!) : handleComplete}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.7}
          >
            {/* Issue 13: Particle bursts mounted ONLY during active 320ms completion */}
            {isCompleting && PARTICLE_ANGLES.map((ang, idx) => (
              <ParticleDot
                key={idx}
                angle={ang}
                color={PARTICLE_COLORS[idx % PARTICLE_COLORS.length]}
                progress={burstProgress}
              />
            ))}

            <Animated.View style={[
              styles.checkbox, 
              isDone && !isBulkEdit && styles.checkboxDone, 
              isRowSelected && styles.checkboxSelected,
              animatedCheckStyle
            ]}>
              {isRowSelected ? (
                 <Ionicons name="checkmark" size={12} color={isDark ? '#000000' : '#FFFFFF'} />
              ) : (
                 isDone && <Ionicons name="checkmark" size={12} color="#FFFFFF" />
              )}
            </Animated.View>
          </TouchableOpacity>

          {/* 2. Unified Row Body */}
          <TouchableOpacity
            style={styles.rowBody}
            onPress={isBulkEdit && onToggleSelect ? () => onToggleSelect(task.id!) : handleEditPress}
            onLongPress={isBulkEdit && onToggleSelect ? () => onToggleSelect(task.id!) : handleLongPress}
            activeOpacity={0.75}
          >
            <View style={styles.content}>
              {/* Title with GPU-accelerated Strikethrough Line */}
              <View style={styles.titleWrapper}>
                <Animated.Text style={[styles.title, isDone && styles.titleDone, animatedTitleStyle]} numberOfLines={1}>
                  {task.title}
                </Animated.Text>
                <Animated.View style={[styles.strikeLine, animatedStrikeStyle]} />
              </View>

              {/* Apple Reminders Unified Metadata Line */}
              {!isDone && hasMetadata && (
                <View style={styles.metaRow}>
                  {/* 1. Live Now Status */}
                  {isLiveNow && (
                    <View style={styles.metaItem}>
                      <Animated.View style={[styles.liveDot, animatedPulseStyle]} />
                      <Text style={styles.liveNowText}>In Progress ({liveNowInfo?.remainingMins}m left)</Text>
                    </View>
                  )}

                  {/* 2. Overdue Status */}
                  {isOverdue && !isLiveNow && (
                    <View style={styles.metaItem}>
                      <Animated.View style={[styles.overdueDot, animatedPulseStyle]} />
                      <Text style={styles.overdueText}>{overdueText}</Text>
                    </View>
                  )}

                  {/* 3. Scheduled Time Slot / Date */}
                  {!isLiveNow && (
                    <>
                      {isOverdue && task.timeSlot && (
                        <>
                          <Text style={styles.metaDot}>•</Text>
                          <View style={styles.metaItem}>
                            <Ionicons
                              name="time-outline"
                              size={11}
                              color={colors.textTertiary}
                              style={{ marginRight: 3.5 }}
                            />
                            <Text style={styles.metaTimeText}>{formatTime12(task.timeSlot)}</Text>
                          </View>
                        </>
                      )}
                      {!isOverdue && subtextData && (
                        <View style={styles.metaItem}>
                          <Ionicons
                            name={subtextData.icon}
                            size={11}
                            color={priorityColor ? priorityColor : colors.textTertiary}
                            style={{ marginRight: 3.5 }}
                          />
                          <Text
                            style={[
                              styles.metaTimeText,
                              priorityColor && { color: priorityColor, fontFamily: 'Inter_500Medium' },
                            ]}
                          >
                            {subtextData.text}
                          </Text>
                        </View>
                      )}
                    </>
                  )}

                  {/* 4. Priority Indicator */}
                  {!isLiveNow && !isOverdue && !subtextData && priorityColor && (
                    <View style={styles.metaItem}>
                      <Ionicons
                        name="flag"
                        size={11}
                        color={priorityColor}
                        style={{ marginRight: 3.5 }}
                      />
                      <Text style={[styles.metaText, { color: priorityColor, fontFamily: 'Inter_500Medium' }]}>
                        {task.priority === 'high' || task.priority === 'P1' ? 'High' : task.priority === 'medium' || task.priority === 'P2' ? 'Medium' : 'Low'}
                      </Text>
                    </View>
                  )}

                  {/* 4b. Alarm / Reminder Indicator */}
                  {task.isReminder && (
                    <>
                      {(subtextData || isLiveNow || isOverdue || (!subtextData && priorityColor)) && (
                        <Text style={styles.metaDot}>•</Text>
                      )}
                      <View style={styles.metaItem}>
                        <Ionicons
                          name="notifications"
                          size={11}
                          color="#f59e0b"
                          style={{ marginRight: 3 }}
                        />
                        <Text style={[styles.metaText, { color: '#f59e0b', fontFamily: 'Inter_500Medium' }]}>
                          Alarm
                        </Text>
                      </View>
                    </>
                  )}

                  {/* 5. Recurrence Indicator */}
                  {task.isRecurring && (
                    <>
                      {(subtextData || isLiveNow || isOverdue || (!subtextData && priorityColor) || task.isReminder) && (
                        <Text style={styles.metaDot}>•</Text>
                      )}
                      <View style={styles.metaItem}>
                        <Ionicons
                          name="repeat"
                          size={11}
                          color={colors.textTertiary}
                          style={{ marginRight: 3 }}
                        />
                        <Text style={styles.metaText}>
                          {task.recurrenceRule?.type
                            ? task.recurrenceRule.type.charAt(0).toUpperCase() + task.recurrenceRule.type.slice(1)
                            : 'Repeating'}
                        </Text>
                      </View>
                    </>
                  )}

                  {/* 6. Clean Tag Dots */}
                  {taskTags && taskTags.length > 0 && (
                    <>
                      {(subtextData || isOverdue || isLiveNow || task.isRecurring || (!subtextData && priorityColor) || task.isReminder) && (
                        <Text style={styles.metaDot}>•</Text>
                      )}
                      {taskTags.slice(0, 2).map((tag, idx) => {
                        const cleanName = tag.replace(/^#/, '').trim();
                        const tagColor = getTagColor(tag, colors);
                        return (
                          <React.Fragment key={tag}>
                            {idx > 0 && <Text style={styles.metaDot}>•</Text>}
                            <View style={styles.tagItem}>
                              <View style={[styles.tagDot, { backgroundColor: tagColor }]} />
                              <Text style={[styles.tagText, { color: isDark ? 'rgba(255, 255, 255, 0.70)' : 'rgba(0, 0, 0, 0.65)' }]}>
                                {cleanName}
                              </Text>
                            </View>
                          </React.Fragment>
                        );
                      })}
                      {taskTags.length > 2 && (
                        <>
                          <Text style={styles.metaDot}>•</Text>
                          <Text style={styles.metaText}>+{taskTags.length - 2}</Text>
                        </>
                      )}
                    </>
                  )}

                  {/* 7. Subtasks Count Inline */}
                  {hasSubtasks && (
                    <>
                      {(subtextData || (taskTags && taskTags.length > 0) || isOverdue || isLiveNow || task.isRecurring || (!subtextData && priorityColor)) && (
                        <Text style={styles.metaDot}>•</Text>
                      )}
                      <View style={styles.subtaskInlineItem}>
                        <Ionicons
                          name="list-outline"
                          size={11}
                          color={colors.textTertiary}
                          style={{ marginRight: 3 }}
                        />
                        <Text style={styles.subtaskInlineText}>
                          {completedSubtasks}/{totalSubtasks}
                        </Text>
                      </View>
                    </>
                  )}
                </View>
              )}
            </View>

            {/* Right Side: Clean Expand Chevron */}
            {hasSubtasks && !isDone && (
              <TouchableOpacity
                style={styles.expandChevronBtn}
                onPress={() => {
                  Haptics.selectionAsync();
                  setIsExpanded(!isExpanded);
                }}
                hitSlop={10}
                activeOpacity={0.7}
              >
                <Animated.View style={animatedChevronStyle}>
                  <Ionicons name="chevron-down" size={14} color={colors.textTertiary} />
                </Animated.View>
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        </View>

        {/* ── Subtask Smooth Accordion Fold (Issue 77: LinearTransition removed — conflicts with FlashList cell recycler) ── */}
        {isExpanded && hasSubtasks && !isDone && (
          <Animated.View
            entering={FadeInDown.duration(180).easing(Easing.bezier(0.16, 1, 0.3, 1))}
            exiting={FadeOut.duration(120)}
            style={styles.subtaskList}
          >
            {task.subtasks!.map((st, idx) => (
              <SubtaskRowItem
                key={st.id || idx}
                subtask={st}
                index={idx}
                totalSubtasks={totalSubtasks}
                allSubtasks={task.subtasks!}
                taskId={task.id}
                onUpdateTask={onUpdateTask}
                onCompleteParent={handleComplete}
                isDark={isDark}
                styles={styles}
              />
            ))}
          </Animated.View>
        )}
      </Animated.View>
    </ReanimatedSwipeable>
  );
}, (prev, next) => {
  // Issue 22: Fixed custom comparator checking isReminder, estimatedMinutes, todayDateStr, and tick
  return (
    prev.task.id === next.task.id &&
    prev.task.status === next.task.status &&
    prev.task.title === next.task.title &&
    prev.task.date === next.task.date &&
    prev.task.priority === next.task.priority &&
    prev.task.timeSlot === next.task.timeSlot &&
    prev.task.isRecurring === next.task.isRecurring &&
    prev.task.recurrenceRule?.type === next.task.recurrenceRule?.type &&
    prev.task.subtasks === next.task.subtasks &&
    prev.task.tags === next.task.tags &&
    prev.task.isReminder === next.task.isReminder &&
    prev.task.estimatedMinutes === next.task.estimatedMinutes &&
    prev.isOverdue === next.isOverdue &&
    prev.isBulkEdit === next.isBulkEdit &&
    prev.isSelected === next.isSelected &&
    prev.todayDateStr === next.todayDateStr &&
    prev.currentMinuteTick === next.currentMinuteTick &&
    prev.onComplete === next.onComplete &&
    prev.onPress === next.onPress &&
    prev.onLongPress === next.onLongPress &&
    prev.onDelete === next.onDelete &&
    prev.onReschedule === next.onReschedule &&
    prev.onToggleSelect === next.onToggleSelect
  );
});

export default TaskRow;

const makeStyles = (colors: any, isDark: boolean = true) => StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
    backgroundColor: isDark ? '#000000' : colors.surface,
    paddingVertical: 11,
    paddingHorizontal: 8,
  },
  rowBody: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  checkArea: {
    paddingRight: 12,
    paddingTop: 1,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.28)' : 'rgba(0, 0, 0, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxDone: {
    backgroundColor: colors.accentGreen,
    borderColor: colors.accentGreen,
  },
  checkboxSelected: {
    backgroundColor: colors.accentPrimary,
    borderColor: colors.accentPrimary,
  },
  content: {
    flex: 1,
    paddingRight: 8,
  },
  titleWrapper: {
    position: 'relative',
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  title: {
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
    color: colors.textPrimary,
    letterSpacing: -0.2,
  },
  titleDone: {
    color: colors.textMuted,
  },
  // Issue 17: static width: 100% with transform scaleX
  strikeLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '50%',
    height: 1.5,
    width: '100%',
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.38)' : 'rgba(0, 0, 0, 0.38)',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 4,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaDot: {
    fontSize: 10,
    color: colors.textTertiary,
    marginHorizontal: 5,
    opacity: 0.5,
  },
  metaTimeText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11.5,
    color: colors.textTertiary,
  },
  metaText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11.5,
    color: colors.textTertiary,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#30D158',
    marginRight: 4,
  },
  liveNowText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11.5,
    color: '#30D158',
  },
  overdueDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.error,
    marginRight: 4,
  },
  overdueText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11.5,
    color: colors.error,
  },
  tagItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tagDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    marginRight: 3.5,
  },
  tagText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
  },
  subtaskInlineItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  subtaskInlineText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    color: colors.textTertiary,
  },
  expandChevronBtn: {
    padding: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  subtaskList: {
    paddingLeft: 32,
    paddingRight: 12,
    paddingBottom: 8,
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)',
  },
  subtaskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  subtaskCheckbox: {
    width: 15,
    height: 15,
    borderRadius: 4,
    borderWidth: 1.2,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.28)' : 'rgba(0, 0, 0, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  subtaskCheckboxDone: {
    backgroundColor: colors.accentGreen,
    borderColor: colors.accentGreen,
  },
  subtaskTitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: colors.textSecondary,
    flex: 1,
  },
  subtaskTitleDone: {
    textDecorationLine: 'line-through',
    color: colors.textMuted,
  },
  actionLeftContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 64,
  },
  actionLeft: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionRightContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 76,
  },
  actionRight: {
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
