import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { SPACE } from '../../theme/tokens';
import {
  END_HOUR, HOUR_HEIGHT, HatchOverlay, snapTopToGrid, topToTimeSlot, getTaskBlockColors,
} from './timelineMath';
import { blockStyles } from './timelineViewStyles';

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
  leftPercent?: number;
  widthPercent?: number;
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
  leftPercent = 0,
  widthPercent = 100,
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
            left: widthPercent < 100 ? `${leftPercent}%` : SPACE.sm,
            width: widthPercent < 100 ? `${widthPercent - 2}%` : undefined,
            right: widthPercent < 100 ? undefined : 0,
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

export default React.memo(DraggableTaskBlock);
