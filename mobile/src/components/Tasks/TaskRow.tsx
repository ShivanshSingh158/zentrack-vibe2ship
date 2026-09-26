import React, { useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, Animated as RNAnimated } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
  withRepeat,
  Easing,
  FadeInDown,
  FadeOut,
  SlideOutLeft,
  LinearTransition,
  runOnJS,
} from 'react-native-reanimated';
import { Swipeable } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Task } from '../../contexts/MobileDataContext';
import { formatDateShort } from '../../utils/dateUtils';
import { useTheme } from '../../contexts/ThemeContext';

const today = new Date().toISOString().slice(0, 10);

// Module-level constant — avoids creating a new animation config object on every
// renderItem call. Reanimated uses reference equality to bail out no-op updates.
const TASK_ENTER_ANIM = FadeInDown.duration(180).easing(Easing.bezier(0.16, 1, 0.3, 1));

interface TaskRowProps {
  task: Task;
  onComplete: () => void;
  onCompleteStart?: () => void;
  onReschedule: () => void;
  onPress: () => void;
  onLongPress: () => void;
  onDelete?: (task: Task) => void;
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
    return `${formatSingleTime(parts[0].trim())} – ${formatSingleTime(parts[1].trim())}`;
  }
  return formatSingleTime(timeStr);
}

const getTagColor = (tag: string, colors: any) => {
  const cleanTag = tag.toLowerCase().replace(/^#/, '').trim();
  const map: Record<string, string> = {
    'high': colors.error,
    'work': colors.accentBlue,
    'personal': colors.accentGreen,
    'errand': colors.accentAmber,
    'gym': colors.accentPrimary,
    'college': '#a599ff',
    'finance': '#5eda9e',
    'placement': '#ff9f4d',
  };
  return map[cleanTag] || colors.textTertiary;
};

const getFormatSubtext = (task: Task, isOverdue: boolean, priorityColor: string | null, colors: any) => {
  if (isOverdue) return { text: 'Overdue', color: colors.error, icon: 'alert-circle' as const };
  if (task.timeSlot) {
    return { 
      text: formatTime12(task.timeSlot), 
      color: priorityColor || colors.textTertiary, 
      icon: 'time-outline' as const 
    };
  }
  if (task.date && task.date > today) {
    return { text: formatDateShort(task.date), color: colors.textTertiary, icon: 'calendar-outline' as const };
  }
  return null;
};

const PARTICLE_COLORS = ['#5eda9e', '#a599ff', '#ff9f4d', '#38bdf8', '#ff6961', '#facc15'];
const PARTICLE_ANGLES = [0, 60, 120, 180, 240, 300];

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

  const animCheckStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
  }));

  const handleToggle = useCallback(() => {
    if (!onUpdateTask || !taskId) return;
    Haptics.selectionAsync();

    // Apple iOS crisp tactile tap
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

    if (newCompletedCount === totalSubtasks && willBeCompleted) {
      onUpdateTask(taskId, { subtasks: newSubtasks });
      setTimeout(() => {
        onCompleteParent();
      }, 300);
    } else {
      onUpdateTask(taskId, { subtasks: newSubtasks });
    }
  }, [onUpdateTask, taskId, allSubtasks, index, subtask, totalSubtasks, onCompleteParent, checkScale]);

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

const TaskRow = React.memo(function TaskRow({
  task,
  onComplete,
  onCompleteStart,
  onReschedule,
  onPress,
  onLongPress,
  onDelete,
  isOverdue,
  isBulkEdit,
  isSelected,
  onToggleSelect,
  onUpdateTask,
  onAddSubtask,
}: TaskRowProps) {
  const { colors, isDark } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  const swipeableRef = useRef<Swipeable>(null);
  const checkScale = useSharedValue(1);
  const burstProgress = useSharedValue(0);
  const rowTranslateX = useSharedValue(0);
  const rowOpacity = useSharedValue(1);
  const [isCompleting, setIsCompleting] = React.useState(false);
  const isDone = task.status === 'completed' || isCompleting;
  const isRowSelected = Boolean(isBulkEdit && isSelected);
  const [isExpanded, setIsExpanded] = React.useState(false);

  // Chevron 180° rotation worklet
  const chevronRotation = useSharedValue(isExpanded ? 180 : 0);
  React.useEffect(() => {
    chevronRotation.value = withTiming(isExpanded ? 180 : 0, { duration: 180, easing: Easing.bezier(0.25, 0.1, 0.25, 1) });
  }, [isExpanded]);

  const animatedChevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${chevronRotation.value}deg` }],
  }));

  // Animated strikethrough, dissolve & card recession
  const strikeProgress = useSharedValue(isDone ? 1 : 0);
  const titleOpacity = useSharedValue(isDone ? 0.4 : 1);
  const rowScale = useSharedValue(isDone ? 0.985 : 1);

  React.useEffect(() => {
    strikeProgress.value = withTiming(isDone ? 1 : 0, { duration: 180, easing: Easing.bezier(0.25, 0.1, 0.25, 1) });
    titleOpacity.value = withTiming(isDone ? 0.4 : 1, { duration: 180 });
    rowScale.value = withTiming(isDone ? 0.985 : 1, { duration: 180 });
  }, [isDone]);

  const totalSubtasks = task.subtasks?.length || 0;
  const completedSubtasks = task.subtasks?.filter(st => st.completed).length || 0;
  const hasSubtasks = totalSubtasks > 0;

  // ── Priority Color: High -> #FF453A, Medium -> #FF9F0A, Low -> #30D158 ──
  const priorityColor = React.useMemo(() => {
    if (task.priority === 'high' || task.priority === 'P1') return '#FF453A';
    if (task.priority === 'medium' || task.priority === 'P2') return '#FF9F0A';
    if (task.priority === 'low' || task.priority === 'P3') return '#30D158';
    return null;
  }, [task.priority]);

  const subtextData = React.useMemo(
    () => getFormatSubtext(task, isOverdue, priorityColor, colors),
    [task.timeSlot, task.date, task.status, isOverdue, priorityColor, colors]
  );
  const taskTags = task.tags && task.tags.length > 0 ? task.tags : null;

  // ── Dynamic "Live Now" Indicator & Countdown ──
  const liveNowInfo = React.useMemo(() => {
    if (!task.timeSlot || task.status === 'completed' || task.date !== today) return null;
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
  }, [task.timeSlot, task.status, task.date, task.estimatedMinutes]);

  const isLiveNow = !!liveNowInfo;
  const hasMetadata = Boolean(
    isLiveNow ||
    isOverdue ||
    subtextData ||
    priorityColor ||
    task.isRecurring ||
    (taskTags && taskTags.length > 0) ||
    hasSubtasks
  );

  // ── Relative Overdue Time Calculation ──
  const overdueText = React.useMemo(() => {
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

  // Ambient Soft Radar Pulse Animation
  const pulseAnim = useSharedValue(1);
  React.useEffect(() => {
    if (isLiveNow || isOverdue) {
      pulseAnim.value = withRepeat(
        withSequence(
          withTiming(0.4, { duration: 900, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
    }
  }, [isLiveNow, isOverdue]);

  const animatedPulseStyle = useAnimatedStyle(() => ({
    opacity: pulseAnim.value,
    transform: [{ scale: 0.85 + pulseAnim.value * 0.25 }],
  }));

  const animatedCheckStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
  }));

  const animatedRowStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: rowTranslateX.value },
      { scale: rowScale.value },
    ],
    opacity: rowOpacity.value,
  }));

  const animatedTitleStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
  }));

  const animatedStrikeStyle = useAnimatedStyle(() => ({
    width: `${strikeProgress.value * 100}%`,
    opacity: strikeProgress.value > 0.05 ? 1 : 0,
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
        withTiming(1.0, { duration: 90 }, () => { runOnJS(onComplete)(); })
      );
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setIsCompleting(false);
      onComplete();
    }
  }, [onComplete, onCompleteStart, isDone, checkScale, burstProgress]);

  const handleLongPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    onLongPress();
  }, [onLongPress]);

  // Haptic Swipe-to-Complete with Threshold Pop: checkmark scales 0.7 -> 1.2
  const renderLeftActions = useCallback((progress: any, dragX: any) => {
    const scale = progress.interpolate({
      inputRange: [0, 0.6, 1],
      outputRange: [0.7, 0.9, 1.2],
      extrapolate: 'clamp',
    });
    return (
      <View style={styles.actionLeftContainer}>
        <RNAnimated.View style={[styles.actionLeft, { backgroundColor: colors.accentGreen, transform: [{ scale }] }]}>
          <Ionicons name="checkmark" size={22} color="#fff" />
        </RNAnimated.View>
      </View>
    );
  }, [colors, styles]);

  const handleEditPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    swipeableRef.current?.close();
    (onPress as any)(task);
  }, [onPress, task]);

  const renderRightActions = useCallback((progress: any, _dragX: any) => {
    const scale = progress.interpolate({
      inputRange: [0, 0.6, 1],
      outputRange: [0.7, 0.9, 1.15],
      extrapolate: 'clamp',
    });

    return (
      <View style={styles.actionRightContainer}>
        <TouchableOpacity
          style={[styles.actionRight, { backgroundColor: '#0A84FF', width: 76 }]}
          onPress={handleEditPress}
          activeOpacity={0.8}
        >
          <RNAnimated.View style={{ transform: [{ scale }], alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="create-outline" size={22} color="#ffffff" />
          </RNAnimated.View>
        </TouchableOpacity>
      </View>
    );
  }, [styles, handleEditPress]);

  const handleSwipeOpen = useCallback((direction: string) => {
    if (direction === 'left') {
      handleComplete();
      swipeableRef.current?.close();
    } else if (direction === 'right') {
      handleEditPress();
    }
  }, [handleComplete, handleEditPress]);

  return (
    <Swipeable
      ref={swipeableRef}
      renderLeftActions={renderLeftActions}
      renderRightActions={renderRightActions}
      onSwipeableWillOpen={(direction) => {
        if (direction === 'left' || direction === 'right') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }
      }}
      onSwipeableOpen={handleSwipeOpen}
      containerStyle={{ backgroundColor: 'transparent' }}
    >
      <Animated.View
        entering={TASK_ENTER_ANIM}
        exiting={SlideOutLeft.duration(200)}
        layout={LinearTransition.springify().damping(20).stiffness(200)}
        style={animatedRowStyle}
      >
        <View
          style={[styles.row, isRowSelected && { backgroundColor: isDark ? 'rgba(165, 153, 255, 0.08)' : 'rgba(108, 92, 231, 0.08)' }]}
        >
          {/* 1. Dedicated Circular Checkbox Touch Target */}
          <TouchableOpacity
            style={styles.checkArea}
            onPress={isBulkEdit && onToggleSelect ? onToggleSelect : handleComplete}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.7}
          >
            {/* WhatsApp-Style Celebration Micro-Burst */}
            {PARTICLE_ANGLES.map((ang, idx) => (
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

          {/* 2. Unified Row Body (Tapping opens edit modal, holding opens context menu) */}
          <TouchableOpacity
            style={styles.rowBody}
            onPress={isBulkEdit && onToggleSelect ? onToggleSelect : handleEditPress}
            onLongPress={isBulkEdit && onToggleSelect ? onToggleSelect : handleLongPress}
            activeOpacity={0.75}
          >
            <View style={styles.content}>
              {/* Title with Animated Strikethrough Line */}
              <View style={styles.titleWrapper}>
                <Animated.Text style={[styles.title, isDone && styles.titleDone, animatedTitleStyle]} numberOfLines={1}>
                  {task.title}
                </Animated.Text>
                <Animated.View style={[styles.strikeLine, animatedStrikeStyle]} />
              </View>

              {/* Apple Reminders Unified Metadata Line (Zero Ugly Pills) */}
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

                  {/* 4. Priority Indicator (when no timeslot/date) */}
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

                  {/* 5. Recurrence Indicator */}
                  {task.isRecurring && (
                    <>
                      {(subtextData || isLiveNow || isOverdue || (!subtextData && priorityColor)) && (
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

                  {/* 6. Clean Tag Dots (NO UGLY PILLS!) */}
                  {taskTags && taskTags.length > 0 && (
                    <>
                      {(subtextData || isOverdue || isLiveNow || task.isRecurring || (!subtextData && priorityColor)) && (
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

            {/* Right Side: Clean Expand Chevron if task has subtasks */}
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

        {/* ── Subtask Smooth Accordion Fold ── */}
        {isExpanded && hasSubtasks && !isDone && (
          <Animated.View
            entering={FadeInDown.duration(180).easing(Easing.bezier(0.16, 1, 0.3, 1))}
            exiting={FadeOut.duration(120)}
            layout={LinearTransition.duration(160).easing(Easing.bezier(0.25, 0.1, 0.25, 1))}
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
    </Swipeable>
  );
}, (prev, next) => {
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
    prev.isOverdue === next.isOverdue &&
    prev.isBulkEdit === next.isBulkEdit &&
    prev.isSelected === next.isSelected &&
    prev.onDelete === next.onDelete
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
    justifyContent: 'flex-start',
    paddingRight: 6,
  },
  titleWrapper: {
    position: 'relative',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    minHeight: 20,
    maxWidth: '100%',
  },
  title: {
    fontFamily: 'Inter_500Medium',
    fontSize: 15,
    lineHeight: 20,
    color: colors.textPrimary,
    letterSpacing: -0.2,
  },
  titleDone: {
    color: colors.textTertiary,
  },
  strikeLine: {
    position: 'absolute',
    left: 0,
    top: '52%',
    height: 1.5,
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.45)' : 'rgba(0, 0, 0, 0.35)',
    borderRadius: 1,
    zIndex: 1,
  },
  // Apple Reminders Unified Metadata Line
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 3,
    rowGap: 2,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: colors.textTertiary,
    letterSpacing: -0.1,
  },
  metaTimeText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: colors.textTertiary,
    letterSpacing: -0.1,
  },
  metaDot: {
    fontSize: 11,
    color: isDark ? 'rgba(255, 255, 255, 0.25)' : 'rgba(0, 0, 0, 0.25)',
    marginHorizontal: 3.5,
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.accentPrimary,
    marginRight: 4,
  },
  liveNowText: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    color: colors.accentPrimary,
    letterSpacing: -0.1,
  },
  overdueDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#FF453A',
    marginRight: 4,
  },
  overdueText: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    color: '#FF453A',
    letterSpacing: -0.1,
  },
  tagItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tagDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    marginRight: 4,
  },
  tagText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 12,
    letterSpacing: -0.1,
  },
  subtaskInlineItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  subtaskInlineText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: colors.textTertiary,
    letterSpacing: -0.1,
  },
  expandChevronBtn: {
    paddingTop: 2,
    paddingHorizontal: 4,
    justifyContent: 'center',
    alignItems: 'center',
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
  subtaskList: {
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : colors.surface2,
    paddingLeft: 44,
    paddingRight: 16,
    paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
  },
  subtaskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
  },
  subtaskCheckbox: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.2,
    borderColor: isDark ? 'rgba(255, 255, 255, 0.3)' : 'rgba(0, 0, 0, 0.25)',
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  subtaskCheckboxDone: {
    backgroundColor: colors.accentPrimary,
    borderColor: colors.accentPrimary,
  },
  subtaskTitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: colors.textPrimary,
    letterSpacing: -0.1,
  },
  subtaskTitleDone: {
    color: colors.textTertiary,
    textDecorationLine: 'line-through',
  },
});

