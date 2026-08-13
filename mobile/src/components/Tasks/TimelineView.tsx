import React, { useCallback, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector, ScrollView } from 'react-native-gesture-handler';
import Svg, { Defs, Pattern, Line, Rect } from 'react-native-svg';
import { Task, AttendanceSubject, GymLog } from '../../contexts/MobileDataContext';
import { UserGymPlanDoc } from '../../types/gym.types';
import { getCustomPlanDay, planDayIndexForDate } from '../../hooks/useGymLog';
import { GYM_PLAN } from '../../data/gymPlan';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS } from '../../theme/tokens';
import { Ionicons } from '@expo/vector-icons';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { feedback } from '../../utils/haptics';
import * as Haptics from 'expo-haptics';

interface ClassBlock {
  id: string;
  title: string;
  type: 'class' | 'lab';
  startFloat: number;
  endFloat: number;
  top: number;
  height: number;
  time: string;
  room?: string;
  isDone?: boolean;
}

interface TimelineViewProps {
  tasks: Task[];
  onTaskPress: (task: Task) => void;
  colors: any;
  attendance?: AttendanceSubject[];
  attendanceLogs?: any[];
  gymLogs?: GymLog[];
  userGymPlan?: UserGymPlanDoc | null;
  selectedDate?: string;
}

const DEFAULT_START_HOUR = 6;
const END_HOUR = 23;
const HOUR_HEIGHT = 80;
const SNAP_MINUTES = 15; // 15-minute grid
const PIXELS_PER_MINUTE = HOUR_HEIGHT / 60;
const SNAP_PX = SNAP_MINUTES * PIXELS_PER_MINUTE; // 20px per 15 min

// •• Hatch Overlay •••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••
/** SVG diagonal stripes drawn over completed/attended blocks */
function HatchOverlay({ width, height, color = 'rgba(255,255,255,0.12)' }: { width: number; height: number; color?: string }) {
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFillObject}>
      <Defs>
        <Pattern id="hatch" width={8} height={8} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <Line x1={0} y1={0} x2={0} y2={8} stroke={color} strokeWidth={2.5} />
        </Pattern>
      </Defs>
      <Rect width={width} height={height} fill="url(#hatch)" />
    </Svg>
  );
}

/**
 * Parses both 12-hour ("2:00 PM", "10:00 AM") and 24-hour ("14:00", "09:00")
 * time strings and returns a float hour (e.g. 14.5 for 2:30 PM).
 */
function parseTime(timeStr: string): number | null {
  if (!timeStr) return null;
  const upper = timeStr.trim().toUpperCase();
  const isPM = upper.includes('PM');
  const isAM = upper.includes('AM');
  const cleaned = upper.replace(/[APM\s]+$/i, '').trim();
  const parts = cleaned.split(':');
  let h = parseInt(parts[0], 10);
  if (isNaN(h)) return null;
  const m = parts.length >= 2 ? (parseInt(parts[1], 10) || 0) : 0;
  if (isPM || isAM) {
    if (isPM && h !== 12) h += 12;
    if (isAM && h === 12) h = 0;
  }
  return h + m / 60;
}

/** Format a float hour (e.g. 14.25) into a 12-hour time string ("2:15 PM") */
function floatToTimeString(floatHour: number): string {
  const totalMinutes = Math.round(floatHour * 60);
  const h24 = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const ampm = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

/** Snap a pixel top value to the nearest SNAP_MINUTES grid */
function snapTopToGrid(top: number): number {
  'worklet';
  return Math.round(top / SNAP_PX) * SNAP_PX;
}

/** Compute new timeSlot string from snapped top position */
function topToTimeSlot(snappedTop: number, startHour: number, durationFloat: number): string {
  const startFloat = startHour + snappedTop / HOUR_HEIGHT;
  const endFloat = startFloat + durationFloat;
  return `${floatToTimeString(startFloat)}•${floatToTimeString(endFloat)}`;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// •• Draggable Task Block •••••••••••••••••••••••••••••••••••••••••••••••••••••

interface DraggableTaskBlockProps {
  taskId: string;
  title: string;
  timeSlot: string;
  initialTop: number;
  height: number;
  priority: string;
  startFloat: number;
  durationFloat: number;
  startHour: number;
  colors: any;
  onPress: () => void;
  onReschedule: (taskId: string, newTimeSlot: string) => void;
  /** Returns true if the proposed top position collides with another block */
  checkCollision: (taskId: string, proposedTop: number, height: number) => boolean;
  /** Whether the task is already completed */
  isDone?: boolean;
  /** Whether the task is past its scheduled time but not completed (missed) */
  isMissed?: boolean;
  /** Actual minutes worked (logged on completion) */
  actualMinutes?: number;
  /** Actual start time (logged on completion) */
  actualStartTime?: string;
}

function DraggableTaskBlock({
  taskId,
  title,
  timeSlot,
  initialTop,
  height,
  priority,
  durationFloat,
  startHour,
  colors,
  onPress,
  onReschedule,
  checkCollision,
  isDone = false,
  isMissed = false,
  actualMinutes,
  actualStartTime,
}: DraggableTaskBlockProps) {
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);
  const borderGlow = useSharedValue(0); // 0 = normal, 1 = dragging, 2 = collision flash

  const maxTop = (END_HOUR - startHour) * HOUR_HEIGHT - height;

  const panGesture = Gesture.Pan()
    .activateAfterLongPress(200)
    .onStart(() => {
      'worklet';
      runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Medium);
      scale.value = withSpring(1.04, { damping: 15, stiffness: 300 });
      borderGlow.value = withTiming(1, { duration: 150 });
    })
    .onUpdate((event) => {
      'worklet';
      const rawTop = initialTop + event.translationY;
      const clampedTop = Math.max(0, Math.min(maxTop, rawTop));
      const snapped = snapTopToGrid(clampedTop);
      translateY.value = snapped - initialTop;
    })
    .onEnd((event) => {
      'worklet';
      const rawTop = initialTop + event.translationY;
      const clampedTop = Math.max(0, Math.min(maxTop, rawTop));
      const snappedTop = snapTopToGrid(clampedTop);
      const hasCollision = checkCollision(taskId, snappedTop, height);

      if (hasCollision) {
        // Red flash + bounce back
        borderGlow.value = withSequence(
          withTiming(2, { duration: 80 }),
          withTiming(2, { duration: 200 }),
          withTiming(0, { duration: 200 })
        );
        translateY.value = withSpring(0, { damping: 12, stiffness: 200 });
        scale.value = withSpring(1, { damping: 15, stiffness: 300 });
      } else {
        // Snap to new position
        translateY.value = withSpring(snappedTop - initialTop, { damping: 20, stiffness: 300 }, () => {
          borderGlow.value = withTiming(0, { duration: 200 });
          scale.value = withSpring(1, { damping: 15, stiffness: 300 });
        });
        
        // Ensure formatting maintains the 'AM/PM' correctly
        const newSlot = topToTimeSlot(snappedTop, startHour, durationFloat);
        if (newSlot !== timeSlot) {
          runOnJS(onReschedule)(taskId, newSlot);
        }
      }
    });

  const bgColor = isDone
    ? 'rgba(94, 218, 158, 0.10)'
    : isMissed
    ? 'rgba(255, 105, 97, 0.12)'
    : priority === 'high' || priority === 'P1'
    ? 'rgba(255, 105, 97, 0.15)'
    : priority === 'medium' || priority === 'P2'
    ? 'rgba(255, 159, 77, 0.15)'
    : colors.surface;

  const borderNormal = isDone
    ? '#5eda9e'
    : isMissed
    ? 'rgba(255,105,97,0.6)'
    : priority === 'high' || priority === 'P1'
    ? '#ff6961'
    : priority === 'medium' || priority === 'P2'
    ? '#ff9f4d'
    : colors.border;

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { scale: scale.value },
    ],
    opacity: opacity.value,
    borderColor: borderGlow.value === 2
      ? 'rgba(255, 80, 80, 0.9)'   // collision = red
      : borderGlow.value === 1
      ? 'rgba(165, 153, 255, 0.9)' // dragging = purple glow
      : borderNormal,
    shadowColor: borderGlow.value > 0
      ? borderGlow.value === 2 ? '#ff5050' : '#a599ff'
      : 'transparent',
    shadowOpacity: borderGlow.value > 0 ? 0.6 : 0,
    shadowRadius: borderGlow.value > 0 ? 8 : 0,
    elevation: borderGlow.value > 0 ? 8 : 2,
    zIndex: borderGlow.value > 0 ? 99 : 1,
  }));

  // Separate tap from pan: short press = edit modal, long drag = reschedule
  const tapGesture = Gesture.Tap()
    .maxDuration(200)
    .onEnd(() => {
      'worklet';
      runOnJS(onPress)();
    });

  const combinedGesture = Gesture.Simultaneous(tapGesture, panGesture);

  return (
    <GestureDetector gesture={combinedGesture}>
      <Animated.View
        style={[
          blockStyles.taskBlock,
          {
            top: initialTop,
            height: height - 4,
            backgroundColor: bgColor,
            borderWidth: 1.5,
          },
          animatedStyle,
        ]}
      >
        {/* Drag handle indicator • only shown for active tasks */}
        {!isDone && !isMissed && (
          <View style={blockStyles.dragHandle}>
            <View style={[blockStyles.dragDot, { backgroundColor: borderNormal }]} />
            <View style={[blockStyles.dragDot, { backgroundColor: borderNormal }]} />
            <View style={[blockStyles.dragDot, { backgroundColor: borderNormal }]} />
          </View>
        )}

        <Text style={[blockStyles.taskTitle, { color: (isDone || isMissed) ? colors.textMuted : colors.textPrimary, textDecorationLine: isDone ? 'line-through' : 'none' }]} numberOfLines={1}>
          {title}
        </Text>
        <View style={blockStyles.taskSubtext}>
          <Ionicons name="time-outline" size={10} color={colors.textSecondary} style={{ marginRight: 4 }} />
          <Text style={[blockStyles.taskTime, { color: colors.textSecondary }]}>
            {timeSlot}
          </Text>
        </View>

        {/* Status badge • top-right corner */}
        {isDone && (
          <View style={blockStyles.statusBadge}>
            <Ionicons name="checkmark-circle" size={12} color="#5eda9e" style={{ marginRight: 3 }} />
            <Text style={[blockStyles.statusBadgeText, { color: '#5eda9e' }]}>DONE</Text>
          </View>
        )}
        {isMissed && (
          <View style={blockStyles.statusBadge}>
            <Ionicons name="alert-circle" size={12} color="#ff6961" style={{ marginRight: 3 }} />
            <Text style={[blockStyles.statusBadgeText, { color: '#ff6961' }]}>MISSED</Text>
          </View>
        )}

        {/* Actual time logged row */}
        {isDone && actualMinutes && (
          <View style={[blockStyles.taskSubtext, { marginTop: 3 }]}>
            <Ionicons name="timer-outline" size={10} color="#5eda9e" style={{ marginRight: 4 }} />
            <Text style={[blockStyles.taskTime, { color: '#5eda9e' }]}>
              {actualStartTime ? `Started ${actualStartTime} • ` : ''}
              {actualMinutes < 60 ? `${actualMinutes}m actual` : `${(actualMinutes / 60).toFixed(1)}h actual`}
            </Text>
          </View>
        )}

        {/* Hatch overlay for completed/missed tasks */}
        {(isDone || isMissed) && (
          <HatchOverlay width={500} height={height} color={isDone ? 'rgba(94,218,158,0.08)' : 'rgba(255,105,97,0.08)'} />
        )}
      </Animated.View>
    </GestureDetector>
  );
}

const blockStyles = StyleSheet.create({
  taskBlock: {
    position: 'absolute',
    left: SPACE.sm,
    right: 0,
    borderRadius: RADIUS.md,
    padding: SPACE.sm,
    paddingLeft: SPACE.md + 4,
    overflow: 'hidden',
  },
  dragHandle: {
    position: 'absolute',
    left: 5,
    top: 0,
    bottom: 0,
    width: 12,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 3,
  },
  dragDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    opacity: 0.6,
  },
  taskTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.sm,
    marginBottom: 3,
  },
  taskSubtext: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  taskTime: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 10,
  },
  doneCheckmark: {
    position: 'absolute' as const,
    top: 4,
    right: 6,
  },
  statusBadge: {
    position: 'absolute' as const,
    top: 5,
    right: 6,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
  },
  statusBadgeText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 9,
    letterSpacing: 0.5,
  },
});

// •• Main TimelineView ••••••••••••••••••••••••••••••••••••••••••••••••••••••••

export default function TimelineView({ tasks, onTaskPress, colors, attendance, attendanceLogs, gymLogs, userGymPlan, selectedDate }: TimelineViewProps) {

  // •• Dynamically compute START_HOUR from earliest task/class (min 5 AM) ••••
  const START_HOUR = useMemo(() => {
    const floats: number[] = [];

    tasks
      .filter(t => t.timeSlot)
      .forEach(t => {
        const startText = t.timeSlot!.split(/[-•]/)[0];
        const f = parseTime(startText);
        if (f !== null && f <= END_HOUR) floats.push(f);
      });

    if (attendance && selectedDate) {
      const dayOfWeek = new Date(selectedDate + 'T00:00:00').getDay();
      const dayKey = dayOfWeek.toString();
      const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      
      attendance.forEach(subj => {
        const sch = subj.schedule?.[dayKey] || subj.schedule?.[dayOfWeek as any] || subj.schedule?.[DAY_NAMES[dayOfWeek]] || subj.schedule?.[DAY_NAMES[dayOfWeek].toLowerCase()];
        if (!sch) return;
        (sch.labs || []).forEach((l: any) => {
          const f = parseTime(l.time);
          if (f !== null && f <= END_HOUR) floats.push(f);
        });
      });
    }

    if (floats.length === 0) return DEFAULT_START_HOUR;
    
    // Calculate the earliest time. If a task is exactly on the hour (e.g. 4.0), 
    // subtract a small amount (0.1) so Math.floor rounds down to the previous hour (3),
    // ensuring the task isn't squished directly against the top edge.
    const minFloat = Math.min(...floats);
    return Math.min(DEFAULT_START_HOUR, Math.floor(minFloat - 0.1));
  }, [tasks, attendance, selectedDate]);

  const hours = useMemo(() => {
    const arr = [];
    for (let i = START_HOUR; i <= END_HOUR; i++) {
      const ampm = i >= 12 ? 'PM' : 'AM';
      const displayHour = i % 12 || 12;
      arr.push({ hour: i, label: `${displayHour}:00 ${ampm}` });
    }
    return arr;
  }, [START_HOUR]);

  // •• Build positioned task blocks ••••••••••••••••••••••••••••••••••••••••••
  const positionedTasks = useMemo(() => {
    // NOW includes completed tasks • they show as DONE blocks in their scheduled slot
    return tasks
      .filter(t => t.timeSlot)
      .map(task => {
        const startText = task.timeSlot!.split(/[-•]/)[0];
        const endText = task.timeSlot!.split(/[-•]/)[1];

        const startFloat = parseTime(startText);
        const endFloat = endText ? parseTime(endText) : (startFloat ? startFloat + 1 : null);

        if (startFloat === null || startFloat > END_HOUR) return null;

        const top = (startFloat - START_HOUR) * HOUR_HEIGHT;
        const durationFloat = endFloat && endFloat > startFloat
          ? endFloat - startFloat
          : 0.75;
        const height = durationFloat * HOUR_HEIGHT;

        // A task is "missed" if it was pending and its scheduled time is already in the past (today)
        const nowHours = new Date().getHours() + new Date().getMinutes() / 60;
        const isMissed = task.status === 'pending' && endFloat !== null && endFloat < nowHours;

        return {
          task,
          top,
          height: Math.max(height, HOUR_HEIGHT * 0.5),
          startFloat,
          endFloat: endFloat || (startFloat + 0.75),
          durationFloat,
          isMissed,
        };
      })
      .filter(Boolean) as {
        task: Task;
        top: number;
        height: number;
        startFloat: number;
        endFloat: number;
        durationFloat: number;
        isMissed: boolean;
      }[];
  }, [tasks, START_HOUR]);

  // •• Build positioned class/lab blocks from attendance schedule •••••••••••
  const classBlocks = useMemo((): ClassBlock[] => {
    if (!attendance || !selectedDate) return [];
    const dayOfWeek = new Date(selectedDate + 'T00:00:00').getDay();
    const dayKey = dayOfWeek.toString();
    const blocks: ClassBlock[] = [];

    attendance.forEach(subject => {
      const sch =
        subject.schedule?.[dayKey] ||
        subject.schedule?.[dayOfWeek as any] ||
        subject.schedule?.[DAY_NAMES[dayOfWeek]] ||
        subject.schedule?.[DAY_NAMES[dayOfWeek].toLowerCase()];

      if (!sch) return;

      if (sch.classes && Array.isArray(sch.classes)) {
        sch.classes.forEach((c: any, i: number) => {
          if (!c.time) return;
          const startFloat = parseTime(c.time);
          if (startFloat === null || startFloat > END_HOUR) return;
          const endFloat = Math.min(END_HOUR, startFloat + 1);
          const top = (startFloat - START_HOUR) * HOUR_HEIGHT;
          const height = (endFloat - startFloat) * HOUR_HEIGHT;
          const hasLog = (attendanceLogs || []).some((l: any) => l.date === selectedDate && l.subjectId === subject.id && l.type === 'class');
          blocks.push({
            id: `${subject.id}-class-${i}`,
            title: subject.name,
            type: 'class',
            startFloat,
            endFloat,
            top,
            height: Math.max(height - 4, 36),
            time: c.time,
            room: c.room,
            isDone: hasLog,
          });
        });
      }

      if (sch.labs && Array.isArray(sch.labs)) {
        sch.labs.forEach((l: any, i: number) => {
          if (!l.time) return;
          const startFloat = parseTime(l.time);
          if (startFloat === null || startFloat > END_HOUR) return;
          const endFloat = Math.min(END_HOUR, startFloat + 2);
          const top = (startFloat - START_HOUR) * HOUR_HEIGHT;
          const height = (endFloat - startFloat) * HOUR_HEIGHT;
          const hasLog = (attendanceLogs || []).some((log: any) => log.date === selectedDate && log.subjectId === subject.id && log.type === 'lab');
          blocks.push({
            id: `${subject.id}-lab-${i}`,
            title: `${subject.name} (Lab)`,
            type: 'lab',
            startFloat,
            endFloat,
            top,
            height: Math.max(height - 4, 36),
            time: l.time,
            room: l.room,
            isDone: hasLog,
          });
        });
      }
    });

    return blocks.sort((a, b) => a.startFloat - b.startFloat);
  }, [attendance, attendanceLogs, selectedDate, START_HOUR]);

  // •• Build gym block from gymLogs and userGymPlan •••••••••••••••••••••••••••
  const gymBlock = useMemo((): ClassBlock | null => {
    if (!selectedDate) return null;
    const gLog = (gymLogs || []).find(g => g.date === selectedDate);
    const planIdx = planDayIndexForDate(selectedDate);
    const gPlan = getCustomPlanDay(userGymPlan?.customDays, planIdx) || GYM_PLAN.find(d => d.dayIndex === planIdx);
    
    // Use manual override first, then weekly schedule
    const startTimeStr = gLog?.startTime || gPlan?.startTime;
    const endTimeStr = gLog?.endTime || gPlan?.endTime;
    
    // Do not show gym if it's a rest day AND no manual override exists
    if (!startTimeStr || (!gLog?.startTime && gPlan?.isRest)) return null;

    const startFloat = parseTime(startTimeStr);
    if (startFloat === null || startFloat > END_HOUR) return null;
    
    let endFloat = Math.min(END_HOUR, startFloat + 1);
    if (endTimeStr) {
      const parsedEnd = parseTime(endTimeStr);
      if (parsedEnd !== null && parsedEnd > startFloat && parsedEnd <= END_HOUR) {
        endFloat = parsedEnd;
      }
    }
    
    const top = (startFloat - START_HOUR) * HOUR_HEIGHT;
    const height = (endFloat - startFloat) * HOUR_HEIGHT;
    const isDone = !!gLog?.workoutDurationMinutes || !!gLog?.workoutStartTime;
    
    return {
      id: `gym-${selectedDate}`,
      title: gPlan?.focus ? `Workout: ${gPlan.focus}` : 'Gym Workout',
      type: 'gym' as any,
      startFloat,
      endFloat,
      top,
      height: Math.max(height - 4, 36),
      time: startTimeStr,
      room: 'Gym',
      isDone,
    };
  }, [gymLogs, userGymPlan, selectedDate, START_HOUR]);

  // •• Combine tasks + classes for free-time detection •••••••••••••••••••••••
  const allBlocks = useMemo(() => {
    const taskB = positionedTasks.map(pt => ({ startFloat: pt.startFloat, endFloat: pt.endFloat }));
    const classB = classBlocks.map(cb => ({ startFloat: cb.startFloat, endFloat: cb.endFloat }));
    const gymB = gymBlock ? [{ startFloat: gymBlock.startFloat, endFloat: gymBlock.endFloat }] : [];
    return [...taskB, ...classB, ...gymB].sort((a, b) => a.startFloat - b.startFloat);
  }, [positionedTasks, classBlocks, gymBlock]);

  const freeTimeBlocks = useMemo(() => {
    const fBlocks = [];
    let currentTime = START_HOUR;
    for (const block of allBlocks) {
      if (block.startFloat - currentTime >= 0.5) {
        fBlocks.push({
          top: (currentTime - START_HOUR) * HOUR_HEIGHT,
          height: (block.startFloat - currentTime) * HOUR_HEIGHT,
        });
      }
      currentTime = Math.max(currentTime, block.endFloat);
    }
    // Only show trailing free time after the last scheduled block, not before END_HOUR
    // This prevents a huge empty block at the end of the day from dominating the view
    if (allBlocks.length > 0 && END_HOUR - currentTime >= 1) {
      fBlocks.push({
        top: (currentTime - START_HOUR) * HOUR_HEIGHT,
        height: (END_HOUR - currentTime) * HOUR_HEIGHT,
      });
    } else if (allBlocks.length === 0) {
      // No tasks at all • show one full free block
      fBlocks.push({ top: 0, height: (END_HOUR - START_HOUR) * HOUR_HEIGHT });
    }
    return fBlocks;
  }, [allBlocks, START_HOUR]);

  // •• Collision check: does a proposed top position overlap with OTHER tasks or classes? ••
  const checkCollision = useCallback((
    draggedTaskId: string,
    proposedTop: number,
    blockHeight: number
  ): boolean => {
    const proposedStart = START_HOUR + proposedTop / HOUR_HEIGHT;
    const proposedEnd = proposedStart + blockHeight / HOUR_HEIGHT;

    // Check against other task blocks (excluding self)
    for (const pt of positionedTasks) {
      if (pt.task.id === draggedTaskId) continue;
      if (proposedStart < pt.endFloat && proposedEnd > pt.startFloat) return true;
    }
    // Check against class blocks
    for (const cb of classBlocks) {
      if (proposedStart < cb.endFloat && proposedEnd > cb.startFloat) return true;
    }
    return false;
  }, [positionedTasks, classBlocks, START_HOUR]);

  // •• Save new timeSlot to Firestore ••••••••••••••••••••••••••••••••••••••••
  const handleReschedule = useCallback(async (taskId: string, newTimeSlot: string) => {
    try {
      feedback.commit();
      await updateDoc(doc(db, 'tasks', taskId), { timeSlot: newTimeSlot });
    } catch (e) {
      feedback.warning();
      console.warn('[TimelineView] reschedule failed:', e);
    }
  }, []);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Background Grid */}
      {hours.map((h) => (
        <View key={h.hour} style={[styles.hourRow, { height: HOUR_HEIGHT }]}>
          <Text style={[styles.timeLabel, { color: colors.textMuted }]}>{h.label}</Text>
          <View style={[styles.hourLine, { backgroundColor: colors.border }]} />
        </View>
      ))}

      {/* Absolute Positioned Events */}
      <View style={styles.tasksContainer}>
        {/* Free Time Blocks */}
        {freeTimeBlocks.map((ft, i) => (
          <View
            key={`free-${i}`}
            style={[
              styles.staticBlock,
              {
                top: ft.top,
                height: ft.height - 4,
                backgroundColor: 'rgba(255, 255, 255, 0.02)',
                borderColor: colors.border,
                borderStyle: 'dashed',
                borderWidth: 1,
                justifyContent: 'center',
                alignItems: 'center',
              }
            ]}
          >
            <Text style={{ color: colors.textMuted, fontFamily: FONT_FAMILY.medium, fontSize: FONT_SIZE.xs }}>
              Free Time
            </Text>
          </View>
        ))}

        {/* Class / Lab Blocks (non-draggable) */}
        {[...classBlocks, gymBlock].filter(Boolean).map((cb: any) => {
          const isLab = cb.type === 'lab';
          const isGym = cb.type === 'gym';
          
          let blockBg = isLab ? 'rgba(250, 215, 161, 0.12)' : 'rgba(137, 220, 235, 0.12)';
          let blockBorder = isLab ? '#FAD7A1' : '#89dceb';
          let iconName = isLab ? 'flask-outline' : 'book-outline';
          
          if (isGym) {
            blockBg = 'rgba(165, 153, 255, 0.12)'; // a599ff
            blockBorder = '#a599ff';
            iconName = 'barbell-outline';
          }
          
          // Shade past classes (ended before now today)
          const nowHours = new Date().getHours() + new Date().getMinutes() / 60;
          const todayStr = new Date().toISOString().slice(0, 10);
          const isToday = selectedDate === todayStr;
          const isPastDay = selectedDate ? selectedDate < todayStr : false;
          const isPast = isPastDay || (isToday && cb.endFloat < nowHours);
          
          const isMissed = isPast && !cb.isDone;

          return (
            <View
              key={cb.id}
              style={[
                styles.staticBlock,
                {
                  top: cb.top,
                  height: cb.height,
                  backgroundColor: isPast ? 'rgba(100,100,100,0.1)' : blockBg,
                  borderColor: isPast ? 'rgba(160,160,160,0.4)' : blockBorder,
                  borderLeftWidth: 3,
                  borderTopWidth: 0,
                  borderRightWidth: 0,
                  borderBottomWidth: 0,
                }
              ]}
            >
              <View style={styles.classBlockHeader}>
                <Ionicons
                  name={iconName as any}
                  size={10}
                  color={cb.isDone ? '#5eda9e' : isMissed ? '#ff6961' : isPast ? '#8e8e93' : blockBorder}
                  style={{ marginRight: 4 }}
                />
                <Text style={[styles.classTypeTag, { color: cb.isDone ? '#5eda9e' : isMissed ? '#ff6961' : isPast ? '#8e8e93' : blockBorder }]}>
                  {cb.isDone ? 'DONE' : isMissed ? 'MISSED' : isPast ? 'PAST' : (isGym ? 'GYM' : isLab ? 'LAB' : 'CLASS')}
                </Text>
              </View>
              <Text style={[styles.taskTitle, { color: isPast ? colors.textMuted : colors.textPrimary, textDecorationLine: (cb.isDone || isMissed) ? 'line-through' : 'none' }]} numberOfLines={1}>
                {cb.title}
              </Text>
              <View style={styles.taskSubtext}>
                <Ionicons name="time-outline" size={10} color={colors.textMuted} style={{ marginRight: 3 }} />
                <Text style={[styles.taskTime, { color: colors.textMuted }]}>
                  {cb.time}{cb.room ? ` • ${cb.room}` : ''}
                </Text>
              </View>
              {/* Hatch overlay for past classes */}
              {isPast && <HatchOverlay width={500} height={cb.height} color={cb.isDone ? 'rgba(94,218,158,0.06)' : isMissed ? 'rgba(255,105,97,0.06)' : 'rgba(255,255,255,0.06)'} />}
            </View>
          );
        })}

        {/* Draggable Task Blocks */}
        {positionedTasks.map((pt) => {
          if (!pt) return null;
          const { task, top, height, durationFloat, startFloat, isMissed } = pt;
          return (
            <DraggableTaskBlock
              key={task.id}
              taskId={task.id}
              title={task.title}
              timeSlot={task.timeSlot!}
              initialTop={top}
              height={height}
              priority={task.priority || 'low'}
              startFloat={startFloat}
              durationFloat={durationFloat}
              startHour={START_HOUR}
              colors={colors}
              onPress={() => onTaskPress(task)}
              onReschedule={handleReschedule}
              checkCollision={checkCollision}
              isDone={task.status === 'completed'}
              isMissed={isMissed}
              actualMinutes={task.actualMinutes}
              actualStartTime={task.actualStartTime}
            />
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    marginTop: SPACE.sm,
  },
  content: {
    paddingBottom: 100,
    position: 'relative',
  },
  hourRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  timeLabel: {
    width: 65,
    textAlign: 'right',
    paddingRight: SPACE.sm,
    fontFamily: FONT_FAMILY.mono,
    fontSize: FONT_SIZE.xs,
    marginTop: -7,
  },
  hourLine: {
    flex: 1,
    height: 1,
  },
  tasksContainer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 65,
    right: SPACE.md,
  },
  staticBlock: {
    position: 'absolute',
    left: SPACE.sm,
    right: 0,
    borderRadius: RADIUS.md,
    padding: SPACE.sm,
    overflow: 'hidden',
  },
  classBlockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  classTypeTag: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 9,
    letterSpacing: 0.5,
  },
  taskTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.sm,
    marginBottom: 3,
  },
  taskSubtext: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  taskTime: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 10,
  },
});
