import React, { useCallback, useMemo, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
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
import { Task, AttendanceSubject, AttendanceLog, GymLog } from '../../contexts/MobileDataContext';
import { UserGymPlanDoc } from '../../types/gym.types';
import { getCustomPlanDay, planDayIndexForDate } from '../../hooks/useGymLog';
import { GYM_PLAN } from '../../data/gymPlan';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS } from '../../theme/tokens';
import { Ionicons } from '@expo/vector-icons';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { feedback } from '../../utils/haptics';
import * as Haptics from 'expo-haptics';
import { formatLocalDateStr } from '../../utils/dateUtils';
import { useAcademicData } from '../../contexts/domains/AcademicContext';
import { useWellnessData } from '../../contexts/domains/WellnessContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useNavigation } from '@react-navigation/native';

interface ClassBlock {
  id: string;
  title: string;
  type: 'class' | 'lab' | 'gym';
  startFloat: number;
  endFloat: number;
  top: number;
  height: number;
  time: string;
  room?: string;
  logStatus: 'attended' | 'missed' | 'cancelled' | 'unlogged';
  isOngoing?: boolean;
}

interface TimelineViewProps {
  tasks: Task[];
  onTaskPress: (task: Task) => void;
  colors?: any;
  isDark?: boolean;
  attendance?: AttendanceSubject[];
  attendanceLogs?: AttendanceLog[];
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

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// •• Hatch Overlay •••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••
/** SVG diagonal stripes drawn over completed/attended blocks */
function HatchOverlay({
  width,
  height,
  color = 'rgba(255,255,255,0.12)',
  id = 'hatch'
}: {
  width: number;
  height: number;
  color?: string;
  id?: string;
}) {
  const patternId = `hatch-${id.replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFillObject} pointerEvents="none">
      <Defs>
        <Pattern id={patternId} width={8} height={8} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <Line x1={0} y1={0} x2={0} y2={8} stroke={color} strokeWidth={2.5} />
        </Pattern>
      </Defs>
      <Rect width={width} height={height} fill={`url(#${patternId})`} />
    </Svg>
  );
}

/**
 * Parses both 12-hour ("2:00 PM", "10:00 AM") and 24-hour ("14:00", "09:00")
 * time strings and returns a float hour (e.g. 14.5 for 2:30 PM).
 */
function parseTime(timeStr: string | undefined): number | null {
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
  return Math.max(0, Math.min(24, h + m / 60));
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

/** Parse a time range like "10:00 AM - 11:00 AM" or "10:00 - 11:00" */
function parseTimeRange(raw: string, defaultDurationHours: number = 1): { startFloat: number | null; endFloat: number | null } {
  if (!raw) return { startFloat: null, endFloat: null };
  const parts = raw.split(/[-–—•]| to /i);
  const startFloat = parseTime(parts[0]?.trim());
  if (startFloat === null) return { startFloat: null, endFloat: null };
  let endFloat: number | null = null;
  if (parts.length > 1 && parts[1]?.trim()) {
    endFloat = parseTime(parts[1].trim());
  }
  if (endFloat === null || endFloat <= startFloat) {
    endFloat = Math.min(END_HOUR, startFloat + defaultDurationHours);
  }
  return { startFloat, endFloat };
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
  return `${floatToTimeString(startFloat)} - ${floatToTimeString(endFloat)}`;
}

/** Color tokens for task blocks in Light and Dark mode */
function getTaskBlockColors(priority: string, isDone: boolean, isMissed: boolean, isDark: boolean) {
  const isHigh = priority === 'high' || priority === 'P1';
  const isMed = priority === 'medium' || priority === 'P2';

  if (isDone) {
    return {
      accentColor: isDark ? '#5EDA9E' : '#059669',
      bgColor: isDark ? 'rgba(94, 218, 158, 0.14)' : 'rgba(16, 185, 129, 0.12)',
      borderNormal: isDark ? 'rgba(94, 218, 158, 0.45)' : 'rgba(5, 150, 105, 0.35)',
      hatchColor: isDark ? 'rgba(94, 218, 158, 0.10)' : 'rgba(5, 150, 105, 0.08)',
      badgeBg: isDark ? 'rgba(94, 218, 158, 0.18)' : 'rgba(16, 185, 129, 0.15)',
      badgeText: isDark ? '#5EDA9E' : '#059669',
    };
  }

  if (isMissed) {
    return {
      accentColor: isDark ? '#FF6961' : '#DC2626',
      bgColor: isDark ? 'rgba(255, 105, 97, 0.14)' : 'rgba(239, 68, 68, 0.10)',
      borderNormal: isDark ? 'rgba(255, 105, 97, 0.45)' : 'rgba(220, 38, 38, 0.35)',
      hatchColor: isDark ? 'rgba(255, 105, 97, 0.10)' : 'rgba(220, 38, 38, 0.08)',
      badgeBg: isDark ? 'rgba(255, 105, 97, 0.18)' : 'rgba(239, 68, 68, 0.15)',
      badgeText: isDark ? '#FF6961' : '#DC2626',
    };
  }

  if (isHigh) {
    return {
      accentColor: isDark ? '#FF6961' : '#DC2626',
      bgColor: isDark ? 'rgba(255, 105, 97, 0.16)' : 'rgba(239, 68, 68, 0.12)',
      borderNormal: isDark ? 'rgba(255, 105, 97, 0.45)' : 'rgba(220, 38, 38, 0.35)',
      hatchColor: 'transparent',
      badgeBg: 'transparent',
      badgeText: isDark ? '#FF6961' : '#DC2626',
    };
  }

  if (isMed) {
    return {
      accentColor: isDark ? '#FF9F4D' : '#D97706',
      bgColor: isDark ? 'rgba(255, 159, 77, 0.16)' : 'rgba(245, 158, 11, 0.12)',
      borderNormal: isDark ? 'rgba(255, 159, 77, 0.45)' : 'rgba(217, 119, 6, 0.35)',
      hatchColor: 'transparent',
      badgeBg: 'transparent',
      badgeText: isDark ? '#FF9F4D' : '#D97706',
    };
  }

  // Low / Default (Signature Purple)
  return {
    accentColor: isDark ? '#A599FF' : '#6C5CE7',
    bgColor: isDark ? 'rgba(165, 153, 255, 0.14)' : 'rgba(108, 92, 231, 0.12)',
    borderNormal: isDark ? 'rgba(165, 153, 255, 0.40)' : 'rgba(108, 92, 231, 0.35)',
    hatchColor: 'transparent',
    badgeBg: 'transparent',
    badgeText: isDark ? '#A599FF' : '#6C5CE7',
  };
}

/** Color tokens for static blocks (Classes, Labs, Gym) in Light and Dark mode */
function getStaticBlockColors(
  type: 'class' | 'lab' | 'gym',
  logStatus: 'attended' | 'missed' | 'cancelled' | 'unlogged',
  isOngoing: boolean,
  isPast: boolean,
  isDark: boolean
) {
  if (logStatus === 'attended') {
    return {
      accentColor: isDark ? '#5EDA9E' : '#059669',
      bgColor: isDark ? 'rgba(94, 218, 158, 0.12)' : 'rgba(16, 185, 129, 0.10)',
      borderColor: isDark ? 'rgba(94, 218, 158, 0.35)' : 'rgba(5, 150, 105, 0.30)',
      tagColor: isDark ? '#5EDA9E' : '#059669',
      hatchColor: isDark ? 'rgba(94, 218, 158, 0.08)' : 'rgba(5, 150, 105, 0.06)',
      iconName: type === 'gym' ? 'barbell-outline' : type === 'lab' ? 'flask-outline' : 'book-outline',
      badgeText: 'PRESENT',
      isLineThrough: true,
    };
  }

  if (logStatus === 'missed') {
    return {
      accentColor: isDark ? '#FF6961' : '#DC2626',
      bgColor: isDark ? 'rgba(255, 105, 97, 0.12)' : 'rgba(239, 68, 68, 0.10)',
      borderColor: isDark ? 'rgba(255, 105, 97, 0.35)' : 'rgba(220, 38, 38, 0.30)',
      tagColor: isDark ? '#FF6961' : '#DC2626',
      hatchColor: isDark ? 'rgba(255, 105, 97, 0.08)' : 'rgba(220, 38, 38, 0.06)',
      iconName: type === 'gym' ? 'barbell-outline' : type === 'lab' ? 'flask-outline' : 'book-outline',
      badgeText: 'ABSENT',
      isLineThrough: true,
    };
  }

  if (logStatus === 'cancelled') {
    return {
      accentColor: isDark ? '#8E8E93' : '#6B7280',
      bgColor: isDark ? 'rgba(100, 100, 100, 0.10)' : 'rgba(0, 0, 0, 0.04)',
      borderColor: isDark ? 'rgba(160, 160, 160, 0.30)' : 'rgba(0, 0, 0, 0.10)',
      tagColor: isDark ? '#8E8E93' : '#6B7280',
      hatchColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)',
      iconName: 'close-circle-outline',
      badgeText: 'CANCELLED',
      isLineThrough: true,
    };
  }

  // Unlogged / Pending
  if (isOngoing) {
    return {
      accentColor: isDark ? '#A599FF' : '#6C5CE7',
      bgColor: isDark ? 'rgba(165, 153, 255, 0.16)' : 'rgba(108, 92, 231, 0.12)',
      borderColor: isDark ? 'rgba(165, 153, 255, 0.50)' : 'rgba(108, 92, 231, 0.40)',
      tagColor: isDark ? '#A599FF' : '#6C5CE7',
      hatchColor: 'transparent',
      iconName: type === 'gym' ? 'barbell-outline' : type === 'lab' ? 'flask-outline' : 'book-outline',
      badgeText: 'IN PROGRESS',
      isLineThrough: false,
    };
  }

  if (isPast) {
    return {
      accentColor: isDark ? '#8E8E93' : '#9CA3AF',
      bgColor: isDark ? 'rgba(100, 100, 100, 0.08)' : 'rgba(0, 0, 0, 0.03)',
      borderColor: isDark ? 'rgba(160, 160, 160, 0.25)' : 'rgba(0, 0, 0, 0.08)',
      tagColor: isDark ? '#8E8E93' : '#6B7280',
      hatchColor: 'transparent',
      iconName: type === 'gym' ? 'barbell-outline' : type === 'lab' ? 'flask-outline' : 'book-outline',
      badgeText: type === 'gym' ? 'GYM' : type === 'lab' ? 'LAB' : 'CLASS',
      isLineThrough: false,
    };
  }

  if (type === 'gym') {
    return {
      accentColor: isDark ? '#5EDA9E' : '#059669',
      bgColor: isDark ? 'rgba(94, 218, 158, 0.14)' : 'rgba(16, 185, 129, 0.12)',
      borderColor: isDark ? 'rgba(94, 218, 158, 0.45)' : 'rgba(5, 150, 105, 0.35)',
      tagColor: isDark ? '#5EDA9E' : '#059669',
      hatchColor: 'transparent',
      iconName: 'barbell-outline',
      badgeText: 'GYM',
      isLineThrough: false,
    };
  }

  if (type === 'lab') {
    return {
      accentColor: isDark ? '#FAD7A1' : '#0284C7',
      bgColor: isDark ? 'rgba(250, 215, 161, 0.14)' : 'rgba(2, 132, 199, 0.12)',
      borderColor: isDark ? 'rgba(250, 215, 161, 0.45)' : 'rgba(2, 132, 199, 0.35)',
      tagColor: isDark ? '#FAD7A1' : '#0284C7',
      hatchColor: 'transparent',
      iconName: 'flask-outline',
      badgeText: 'LAB',
      isLineThrough: false,
    };
  }

  // Class
  return {
    accentColor: isDark ? '#89DCEB' : '#6C5CE7',
    bgColor: isDark ? 'rgba(137, 220, 235, 0.14)' : 'rgba(108, 92, 231, 0.12)',
    borderColor: isDark ? 'rgba(137, 220, 235, 0.45)' : 'rgba(108, 92, 231, 0.35)',
    tagColor: isDark ? '#89DCEB' : '#6C5CE7',
    hatchColor: 'transparent',
    iconName: 'book-outline',
    badgeText: 'CLASS',
    isLineThrough: false,
  };
}

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
  isDark?: boolean;
  onPress: () => void;
  onReschedule: (taskId: string, newTimeSlot: string) => void;
  checkCollision: (taskId: string, proposedTop: number, height: number) => boolean;
  isDone?: boolean;
  isMissed?: boolean;
  actualMinutes?: number;
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
  isDark = true,
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
        
        const newSlot = topToTimeSlot(snappedTop, startHour, durationFloat);
        if (newSlot !== timeSlot) {
          runOnJS(onReschedule)(taskId, newSlot);
        }
      }
    });

  const taskColors = useMemo(() => {
    return getTaskBlockColors(priority, isDone, isMissed, isDark);
  }, [priority, isDone, isMissed, isDark]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { scale: scale.value },
    ],
    opacity: opacity.value,
    borderColor: borderGlow.value === 2
      ? (isDark ? 'rgba(255, 80, 80, 0.9)' : '#DC2626')   // collision = red
      : borderGlow.value === 1
      ? (isDark ? 'rgba(165, 153, 255, 0.9)' : '#6C5CE7') // dragging = purple glow
      : taskColors.borderNormal,
    shadowColor: borderGlow.value > 0
      ? borderGlow.value === 2 ? '#ff5050' : (isDark ? '#a599ff' : '#6C5CE7')
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
            backgroundColor: taskColors.bgColor,
            borderColor: taskColors.borderNormal,
            borderLeftColor: taskColors.accentColor,
            borderLeftWidth: 4,
            borderTopWidth: 1,
            borderRightWidth: 1,
            borderBottomWidth: 1,
          },
          animatedStyle,
        ]}
      >
        {/* Drag handle indicator • only shown for active tasks */}
        {!isDone && !isMissed && (
          <View style={blockStyles.dragHandle}>
            <View style={[blockStyles.dragDot, { backgroundColor: taskColors.accentColor }]} />
            <View style={[blockStyles.dragDot, { backgroundColor: taskColors.accentColor }]} />
            <View style={[blockStyles.dragDot, { backgroundColor: taskColors.accentColor }]} />
          </View>
        )}

        <Text
          style={[
            blockStyles.taskTitle,
            {
              color: (isDone || isMissed) ? colors.textMuted : colors.textPrimary,
              textDecorationLine: isDone ? 'line-through' : 'none',
            }
          ]}
          numberOfLines={1}
        >
          {title}
        </Text>
        <View style={blockStyles.taskSubtext}>
          <Ionicons name="time-outline" size={11} color={colors.textSecondary} style={{ marginRight: 4 }} />
          <Text style={[blockStyles.taskTime, { color: colors.textSecondary }]}>
            {timeSlot}
          </Text>
        </View>

        {/* Status badge • top-right corner */}
        {isDone && (
          <View style={[blockStyles.statusBadge, { backgroundColor: taskColors.badgeBg }]}>
            <Ionicons name="checkmark-circle" size={12} color={taskColors.badgeText} style={{ marginRight: 3 }} />
            <Text style={[blockStyles.statusBadgeText, { color: taskColors.badgeText }]}>DONE</Text>
          </View>
        )}
        {isMissed && (
          <View style={[blockStyles.statusBadge, { backgroundColor: taskColors.badgeBg }]}>
            <Ionicons name="alert-circle" size={12} color={taskColors.badgeText} style={{ marginRight: 3 }} />
            <Text style={[blockStyles.statusBadgeText, { color: taskColors.badgeText }]}>MISSED</Text>
          </View>
        )}

        {/* Actual time logged row */}
        {isDone && actualMinutes && (
          <View style={[blockStyles.taskSubtext, { marginTop: 3 }]}>
            <Ionicons name="timer-outline" size={11} color={taskColors.accentColor} style={{ marginRight: 4 }} />
            <Text style={[blockStyles.taskTime, { color: taskColors.accentColor }]}>
              {actualStartTime ? `Started ${actualStartTime} • ` : ''}
              {actualMinutes < 60 ? `${actualMinutes}m actual` : `${(actualMinutes / 60).toFixed(1)}h actual`}
            </Text>
          </View>
        )}

        {/* Hatch overlay for completed/missed tasks */}
        {(isDone || isMissed) && (
          <HatchOverlay width={500} height={height} color={taskColors.hatchColor} id={`task-${taskId}`} />
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
    opacity: 0.7,
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
  statusBadge: {
    position: 'absolute' as const,
    top: 5,
    right: 6,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 9,
    letterSpacing: 0.5,
  },
});

// •• Main TimelineView ••••••••••••••••••••••••••••••••••••••••••••••••••••••••

const TimelineView = React.memo(function TimelineView({
  tasks,
  onTaskPress,
  colors: propColors,
  isDark: propIsDark,
  attendance: propAttendance,
  attendanceLogs: propAttendanceLogs,
  gymLogs: propGymLogs,
  userGymPlan: propUserGymPlan,
  selectedDate,
}: TimelineViewProps) {
  const theme = useTheme();
  const colors = propColors || theme.colors;
  const isDark = propIsDark !== undefined ? propIsDark : theme.isDark;

  const academicData = useAcademicData();
  const wellnessData = useWellnessData();
  const navigation = useNavigation<any>();

  const attendance = propAttendance || academicData.attendance;
  const attendanceLogs = propAttendanceLogs || academicData.attendanceLogs;
  const gymLogs = propGymLogs || wellnessData.gymLogs;
  const userGymPlan = propUserGymPlan !== undefined ? propUserGymPlan : wellnessData.userGymPlan;

  // Live time tracking for "Current Time" indicator
  const [currentTime, setCurrentTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  const todayStr = formatLocalDateStr(currentTime);
  const isToday = selectedDate === todayStr;
  const isPastDay = selectedDate ? selectedDate < todayStr : false;
  const nowHours = currentTime.getHours() + currentTime.getMinutes() / 60;

  // •• Dynamically compute START_HOUR from earliest task/class/gym (min 5 AM) ••••
  const START_HOUR = useMemo(() => {
    const floats: number[] = [];

    tasks
      .filter(t => t.timeSlot)
      .forEach(t => {
        const parts = t.timeSlot!.split(/[-–—•]| to /i);
        const f = parseTime(parts[0]);
        if (f !== null && f <= END_HOUR) floats.push(f);
      });

    if (attendance && selectedDate) {
      const dayOfWeek = new Date(selectedDate + 'T00:00:00').getDay();
      const dayKey = dayOfWeek.toString();
      
      attendance.forEach(subj => {
        const sch = subj.schedule?.[dayKey] || subj.schedule?.[dayOfWeek as any] || subj.schedule?.[DAY_NAMES[dayOfWeek]] || subj.schedule?.[DAY_NAMES[dayOfWeek].toLowerCase()];
        if (!sch) return;
        (sch.classes || []).forEach((c: any) => {
          const f = parseTime(c.time?.split(/[-–—•]| to /i)[0]);
          if (f !== null && f <= END_HOUR) floats.push(f);
        });
        (sch.labs || []).forEach((l: any) => {
          const f = parseTime(l.time?.split(/[-–—•]| to /i)[0]);
          if (f !== null && f <= END_HOUR) floats.push(f);
        });
      });
    }

    if (selectedDate) {
      const gLog = (gymLogs || []).find(g => g.date === selectedDate);
      const planIdx = planDayIndexForDate(selectedDate);
      const gPlan = getCustomPlanDay(userGymPlan?.customDays, planIdx) || GYM_PLAN.find(d => d.dayIndex === planIdx);
      const isRest = gPlan?.isRest ?? (planIdx === 7);
      if (gLog?.startTime || !isRest) {
        const f = parseTime(gLog?.startTime || gPlan?.startTime || '18:00');
        if (f !== null && f <= END_HOUR) floats.push(f);
      }
    }

    if (floats.length === 0) return DEFAULT_START_HOUR;
    const minFloat = Math.min(...floats);
    return Math.min(DEFAULT_START_HOUR, Math.max(0, Math.floor(minFloat - 0.1)));
  }, [tasks, attendance, gymLogs, userGymPlan, selectedDate]);

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
    return tasks
      .filter(t => t.timeSlot)
      .map(task => {
        const parts = task.timeSlot!.split(/[-–—•]| to /i);
        const startText = parts[0];
        const endText = parts[1];

        const startFloat = parseTime(startText);
        const endFloat = endText ? parseTime(endText) : (startFloat ? startFloat + 1 : null);

        if (startFloat === null || startFloat > END_HOUR) return null;

        const top = (startFloat - START_HOUR) * HOUR_HEIGHT;
        const durationFloat = endFloat && endFloat > startFloat
          ? endFloat - startFloat
          : 0.75;
        const height = durationFloat * HOUR_HEIGHT;

        const isMissed = task.status === 'pending' && ((isToday && endFloat !== null && endFloat < nowHours) || isPastDay);

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
  }, [tasks, START_HOUR, isToday, isPastDay, nowHours]);

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
          const { startFloat, endFloat: parsedEnd } = parseTimeRange(c.time, 1);
          if (startFloat === null || startFloat > END_HOUR) return;
          const endFloat = Math.min(END_HOUR, parsedEnd ?? (startFloat + 1));
          const top = (startFloat - START_HOUR) * HOUR_HEIGHT;
          const height = (endFloat - startFloat) * HOUR_HEIGHT;

          const subLogs = (attendanceLogs || []).filter(
            (l: any) => l.date === selectedDate && l.subjectId === subject.id && !l.isExtra && (l.type === 'class' || !l.type)
          );
          const matchLog = subLogs[i] || (subLogs.length === 1 ? subLogs[0] : null);
          const logStatus: 'attended' | 'missed' | 'cancelled' | 'unlogged' = matchLog ? (matchLog.action as any) : 'unlogged';
          const isOngoing = isToday && nowHours >= startFloat && nowHours < endFloat;

          blocks.push({
            id: `${subject.id}-class-${i}`,
            title: subject.name,
            type: 'class',
            startFloat,
            endFloat,
            top,
            height: Math.max(height - 4, 38),
            time: `${floatToTimeString(startFloat)} - ${floatToTimeString(endFloat)}`,
            room: c.room,
            logStatus,
            isOngoing,
          });
        });
      }

      if (sch.labs && Array.isArray(sch.labs)) {
        sch.labs.forEach((l: any, i: number) => {
          if (!l.time) return;
          const { startFloat, endFloat: parsedEnd } = parseTimeRange(l.time, 2);
          if (startFloat === null || startFloat > END_HOUR) return;
          const endFloat = Math.min(END_HOUR, parsedEnd ?? (startFloat + 2));
          const top = (startFloat - START_HOUR) * HOUR_HEIGHT;
          const height = (endFloat - startFloat) * HOUR_HEIGHT;

          const subLogs = (attendanceLogs || []).filter(
            (log: any) => log.date === selectedDate && log.subjectId === subject.id && !log.isExtra && log.type === 'lab'
          );
          const matchLog = subLogs[i] || (subLogs.length === 1 ? subLogs[0] : null);
          const logStatus: 'attended' | 'missed' | 'cancelled' | 'unlogged' = matchLog ? (matchLog.action as any) : 'unlogged';
          const isOngoing = isToday && nowHours >= startFloat && nowHours < endFloat;

          blocks.push({
            id: `${subject.id}-lab-${i}`,
            title: `${subject.name} (Lab)`,
            type: 'lab',
            startFloat,
            endFloat,
            top,
            height: Math.max(height - 4, 38),
            time: `${floatToTimeString(startFloat)} - ${floatToTimeString(endFloat)}`,
            room: l.room,
            logStatus,
            isOngoing,
          });
        });
      }
    });

    return blocks.sort((a, b) => a.startFloat - b.startFloat);
  }, [attendance, attendanceLogs, selectedDate, START_HOUR, isToday, nowHours]);

  // •• Build gym block from gymLogs and userGymPlan •••••••••••••••••••••••••••
  const gymBlock = useMemo((): ClassBlock | null => {
    if (!selectedDate) return null;
    const gLog = (gymLogs || []).find(g => g.date === selectedDate);
    const planIdx = planDayIndexForDate(selectedDate);
    const gPlan = getCustomPlanDay(userGymPlan?.customDays, planIdx) || GYM_PLAN.find(d => d.dayIndex === planIdx);
    
    // Check if this day is a gym day or has a manual log
    const isRest = gPlan?.isRest ?? (planIdx === 7);
    if (!gLog?.startTime && isRest) return null;

    // Use manual override first, then weekly schedule, then default '18:00'
    const startTimeStr = gLog?.startTime || gPlan?.startTime || '18:00';
    const endTimeStr = gLog?.endTime || gPlan?.endTime || (startTimeStr === '18:00' ? '19:30' : undefined);

    const { startFloat, endFloat: parsedEnd } = parseTimeRange(`${startTimeStr} - ${endTimeStr || ''}`, 1.5);
    if (startFloat === null || startFloat > END_HOUR) return null;
    
    const endFloat = Math.min(END_HOUR, parsedEnd ?? (startFloat + 1.5));
    const top = (startFloat - START_HOUR) * HOUR_HEIGHT;
    const height = (endFloat - startFloat) * HOUR_HEIGHT;

    const hasCompletedSets = (gLog?.exercises || []).some(
      (ex: any) => (ex.setsLog || []).some((s: any) => s.completed)
    );
    const isGymDone = !!gLog?.completed || hasCompletedSets || (gLog?.workoutDurationMinutes !== undefined && gLog.workoutDurationMinutes > 0);
    const isOngoing = isToday && nowHours >= startFloat && nowHours < endFloat && !isGymDone;
    const logStatus: 'attended' | 'missed' | 'cancelled' | 'unlogged' = isGymDone ? 'attended' : 'unlogged';
    
    const workoutTitle = gPlan?.name || (gPlan?.focus ? `Workout: ${gPlan.focus}` : 'Gym Workout');

    return {
      id: `gym-${selectedDate}`,
      title: workoutTitle,
      type: 'gym',
      startFloat,
      endFloat,
      top,
      height: Math.max(height - 4, 38),
      time: `${floatToTimeString(startFloat)} - ${floatToTimeString(endFloat)}`,
      room: 'Gym',
      logStatus,
      isOngoing,
    };
  }, [gymLogs, userGymPlan, selectedDate, START_HOUR, isToday, nowHours]);

  // •• Calculate Free Time gaps between all events •••••••••••••••••••••••••••
  const freeTimeBlocks = useMemo(() => {
    const allBlocks: { startFloat: number; endFloat: number }[] = [];

    positionedTasks.forEach(pt => {
      if (pt) allBlocks.push({ startFloat: pt.startFloat, endFloat: pt.endFloat });
    });
    classBlocks.forEach(cb => {
      allBlocks.push({ startFloat: cb.startFloat, endFloat: cb.endFloat });
    });
    if (gymBlock) {
      allBlocks.push({ startFloat: gymBlock.startFloat, endFloat: gymBlock.endFloat });
    }

    allBlocks.sort((a, b) => a.startFloat - b.startFloat);

    const fBlocks: { top: number; height: number }[] = [];
    let currentTimeFloat = START_HOUR;

    for (const block of allBlocks) {
      if (block.startFloat - currentTimeFloat >= 1) {
        fBlocks.push({
          top: (currentTimeFloat - START_HOUR) * HOUR_HEIGHT,
          height: (block.startFloat - currentTimeFloat) * HOUR_HEIGHT,
        });
      }
      currentTimeFloat = Math.max(currentTimeFloat, block.endFloat);
    }
    if (currentTimeFloat < END_HOUR) {
      fBlocks.push({
        top: (currentTimeFloat - START_HOUR) * HOUR_HEIGHT,
        height: (END_HOUR - currentTimeFloat) * HOUR_HEIGHT,
      });
    }
    return fBlocks;
  }, [positionedTasks, classBlocks, gymBlock, START_HOUR]);

  // •• Collision check •••••••••••••••••••••••••••••••••••••••••••••••••••••••
  const checkCollision = useCallback((
    draggedTaskId: string,
    proposedTop: number,
    blockHeight: number
  ): boolean => {
    const proposedStart = START_HOUR + proposedTop / HOUR_HEIGHT;
    const proposedEnd = proposedStart + blockHeight / HOUR_HEIGHT;

    for (const pt of positionedTasks) {
      if (pt.task.id === draggedTaskId) continue;
      if (proposedStart < pt.endFloat && proposedEnd > pt.startFloat) return true;
    }
    for (const cb of classBlocks) {
      if (proposedStart < cb.endFloat && proposedEnd > cb.startFloat) return true;
    }
    if (gymBlock) {
      if (proposedStart < gymBlock.endFloat && proposedEnd > gymBlock.startFloat) return true;
    }
    return false;
  }, [positionedTasks, classBlocks, gymBlock, START_HOUR]);

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

  const handleStaticBlockPress = (cb: ClassBlock) => {
    feedback.tap();
    if (cb.type === 'gym') {
      navigation.navigate('MoreStack', { screen: 'Gym' });
    } else {
      navigation.navigate('MoreStack', { screen: 'Attendance' });
    }
  };

  const indicatorTop = (nowHours - START_HOUR) * HOUR_HEIGHT;
  const showCurrentTimeIndicator = isToday && nowHours >= START_HOUR && nowHours <= END_HOUR;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {/* Background Grid */}
      {hours.map((h) => (
        <View key={h.hour} style={[styles.hourRow, { height: HOUR_HEIGHT }]}>
          <Text style={[styles.timeLabel, { color: isDark ? colors.textMuted : colors.textTertiary }]}>{h.label}</Text>
          <View style={[styles.hourLine, { backgroundColor: isDark ? colors.border : '#E2E1EA' }]} />
        </View>
      ))}

      {/* Absolute Positioned Events */}
      <View style={styles.tasksContainer}>
        {/* Live Current Time Indicator */}
        {showCurrentTimeIndicator && (
          <View style={[styles.currentTimeIndicator, { top: indicatorTop }]}>
            <View style={[styles.currentTimeDot, { backgroundColor: isDark ? '#A599FF' : '#6C5CE7' }]} />
            <View style={[styles.currentTimeLine, { backgroundColor: isDark ? '#A599FF' : '#6C5CE7' }]} />
          </View>
        )}

        {/* Free Time Blocks */}
        {freeTimeBlocks.map((ft, i) => (
          <View
            key={`free-${i}`}
            style={[
              styles.staticBlock,
              {
                top: ft.top,
                height: ft.height - 4,
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.02)',
                borderColor: isDark ? colors.border : '#E2E1EA',
                borderStyle: 'dashed',
                borderWidth: 1,
                justifyContent: 'center',
                alignItems: 'center',
              }
            ]}
          >
            <Text style={{ color: isDark ? colors.textMuted : colors.textTertiary, fontFamily: FONT_FAMILY.medium, fontSize: FONT_SIZE.xs }}>
              Free Time
            </Text>
          </View>
        ))}

        {/* Class / Lab / Gym Blocks (non-draggable) */}
        {[...classBlocks, gymBlock].filter(Boolean).map((cb: any) => {
          const isPast = isPastDay || (isToday && cb.endFloat < nowHours);
          const isOngoing = !!cb.isOngoing;
          const isAttended = cb.logStatus === 'attended';
          const isMissed = cb.logStatus === 'missed';
          const isCancelled = cb.logStatus === 'cancelled';
          const isUnlogged = cb.logStatus === 'unlogged';

          const blockColors = getStaticBlockColors(cb.type, cb.logStatus, isOngoing, isPast, isDark);

          return (
            <TouchableOpacity
              key={cb.id}
              activeOpacity={0.8}
              onPress={() => handleStaticBlockPress(cb)}
              style={[
                styles.staticBlock,
                {
                  top: cb.top,
                  height: cb.height,
                  backgroundColor: blockColors.bgColor,
                  borderColor: blockColors.borderColor,
                  borderLeftWidth: 4,
                  borderLeftColor: blockColors.accentColor,
                  borderTopWidth: 1,
                  borderRightWidth: 1,
                  borderBottomWidth: 1,
                }
              ]}
            >
              <View style={styles.classBlockHeader}>
                <Ionicons
                  name={blockColors.iconName as any}
                  size={12}
                  color={blockColors.tagColor}
                  style={{ marginRight: 2 }}
                />
                <Text style={[styles.classTypeTag, { color: blockColors.tagColor }]}>
                  {blockColors.badgeText}
                </Text>
              </View>
              <Text
                style={[
                  styles.taskTitle,
                  {
                    color: blockColors.isLineThrough || (isPast && isUnlogged) ? colors.textMuted : colors.textPrimary,
                    textDecorationLine: blockColors.isLineThrough ? 'line-through' : 'none',
                  }
                ]}
                numberOfLines={1}
              >
                {cb.title}
              </Text>
              <View style={styles.taskSubtext}>
                <Ionicons name="time-outline" size={11} color={colors.textMuted} style={{ marginRight: 3 }} />
                <Text style={[styles.taskTime, { color: colors.textMuted }]}>
                  {cb.time}{cb.room ? ` • ${cb.room}` : ''}
                </Text>
              </View>

              {/* Hatch overlay for past/done/missed */}
              {(isPast || cb.isDone || isMissed) && blockColors.hatchColor !== 'transparent' && (
                <HatchOverlay width={500} height={cb.height} color={blockColors.hatchColor} id={cb.id} />
              )}
            </TouchableOpacity>
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
              isDark={isDark}
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
});

export default TimelineView;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    marginTop: SPACE.xs,
  },
  content: {
    paddingBottom: 140,
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
    gap: 4,
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
  currentTimeIndicator: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 100,
    pointerEvents: 'none',
  },
  currentTimeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 4,
  },
  currentTimeLine: {
    flex: 1,
    height: 2,
    marginLeft: 2,
  },
});
