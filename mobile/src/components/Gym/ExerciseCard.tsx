/**
 * ExerciseCard — ZenTrack Mobile
 *
 * Micro-interactions implemented:
 *  P2 — Swipe-to-complete (Things 3): 38% threshold, springs.snappy + feedback.commit
 *  P3 — Checkmark morph (Linear): 3-stage SVG animation (border fade → draw → text fade)
 *  P4 — Optimistic updates (Superhuman): local shared value flips instantly
 *  P6 — "Poof" dismiss on skip (Overcast): scale 0.8 + opacity 0 over 150ms
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Platform,
  UIManager,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import YoutubeIframe from 'react-native-youtube-iframe';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withSequence,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg, { Circle, Path } from 'react-native-svg';
import { COLORS, FONT_FAMILY, FONT_SIZE, SPACE, RADIUS } from '../../theme/tokens';
import { springs, durations } from '../../theme/motion';
import { feedback } from '../../utils/haptics';
import { GymExerciseLog, GymSet } from '../../types/gym.types';
import { triggerLayoutAnimation } from '../../theme/animations';
import { useMobileData } from '../../contexts/MobileDataContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.38;
const SET_ROW_HEIGHT = 38;

interface Props {
  exercise: GymExerciseLog;
  exerciseIndex: number;
  editMode?: boolean;
  onUpdateSet: (exIdx: number, setIdx: number, set: GymSet) => void;
  onToggleComplete: (exIdx: number, setIdx: number) => void;
  onDelete?: (exIdx: number) => void;
  onHistoryClick?: (id: string, name: string) => void;
  onAddSet?: (exIdx: number) => void;
  onRemoveSet?: (exIdx: number, setIdx: number) => void;
  onToggleSkip?: (exIdx: number) => void;
  onMoveToDate?: (exIdx: number) => void;
  onEditClick?: (exIdx: number) => void;
  onSwap?: (exIdx: number) => void;
}

// ─── Animated Checkmark ───────────────────────────────────────────────────────
const CHECKMARK_SIZE = 28;
const CIRCLE_CIRCUMFERENCE = Math.PI * (CHECKMARK_SIZE - 4); // r = (size-4)/2 = 12

function AnimatedCheckmark({ completed, onPress }: { completed: boolean; onPress: () => void }) {
  const borderOpacity = useSharedValue(completed ? 0 : 1);
  const checkOpacity = useSharedValue(completed ? 1 : 0);
  const bgOpacity = useSharedValue(completed ? 1 : 0);
  // stroke dash for draw-in effect
  const strokeDash = useSharedValue(completed ? 0 : CIRCLE_CIRCUMFERENCE);

  const prevCompleted = React.useRef(completed);

  React.useEffect(() => {
    if (completed === prevCompleted.current) return;
    prevCompleted.current = completed;

    if (completed) {
      // Stage 1: border fades out (150ms)
      borderOpacity.value = withTiming(0, { duration: durations.checkFade });
      bgOpacity.value = withTiming(1, { duration: durations.checkFade });
      // Stage 2: checkmark draws in (200ms, after 150ms)
      strokeDash.value = withSequence(
        withTiming(CIRCLE_CIRCUMFERENCE, { duration: 0 }), // reset
        withTiming(0, { duration: durations.checkDraw, easing: Easing.out(Easing.cubic) })
      );
      checkOpacity.value = withSequence(
        withTiming(0, { duration: 0 }),
        withTiming(1, { duration: durations.checkDraw })
      );
    } else {
      // Reverse
      checkOpacity.value = withTiming(0, { duration: durations.checkFade });
      strokeDash.value = withTiming(CIRCLE_CIRCUMFERENCE, { duration: durations.checkFade });
      bgOpacity.value = withTiming(0, { duration: durations.checkFade });
      borderOpacity.value = withTiming(1, { duration: durations.checkFade });
    }
  }, [completed]);

  const borderStyle = useAnimatedStyle(() => ({ opacity: borderOpacity.value }));
  const checkStyle = useAnimatedStyle(() => ({ opacity: checkOpacity.value }));
  const bgStyle = useAnimatedStyle(() => ({ opacity: bgOpacity.value }));

  return (
    <TouchableOpacity onPress={onPress} style={styles.checkBtnWrap} activeOpacity={0.8}>
      {/* Background fill (purple) */}
      <Animated.View style={[StyleSheet.absoluteFill, styles.checkBtnBg, bgStyle]} />

      {/* Border ring (fades out on complete) */}
      <Animated.View style={[StyleSheet.absoluteFill, styles.checkBtnBorder, borderStyle]} />

      {/* Checkmark icon (fades in on complete) */}
      <Animated.View style={checkStyle}>
        <Ionicons name="checkmark" size={14} color={COLORS.background} />
      </Animated.View>
    </TouchableOpacity>
  );
}

// ─── Swipeable Set Row ────────────────────────────────────────────────────────
function SwipeableSetRow({
  set,
  idx,
  exerciseIndex,
  onToggleComplete,
  onUpdateSet,
  exercise,
}: {
  set: GymSet;
  idx: number;
  exerciseIndex: number;
  onToggleComplete: (exIdx: number, setIdx: number) => void;
  onUpdateSet: (exIdx: number, setIdx: number, set: GymSet) => void;
  exercise: GymExerciseLog;
}) {
  // P4 — Optimistic local state
  const [localCompleted, setLocalCompleted] = useState(set.completed);

  React.useEffect(() => {
    setLocalCompleted(set.completed);
  }, [set.completed]);

  const translateX = useSharedValue(0);
  const rowOpacity = useSharedValue(1);

  const handleToggle = useCallback(() => {
    // P4: flip locally first (optimistic)
    setLocalCompleted(prev => !prev);
    feedback.commit();
    onToggleComplete(exerciseIndex, idx);
  }, [exerciseIndex, idx, onToggleComplete]);

  // P2 — Swipe gesture
  const panGesture = Gesture.Pan()
    .activeOffsetX([10, 99999]) // only horizontal
    .onUpdate(e => {
      if (localCompleted) return; // already done — no swipe
      translateX.value = Math.max(0, e.translationX);
    })
    .onEnd(e => {
      if (e.translationX > SWIPE_THRESHOLD) {
        // Commit
        translateX.value = withSpring(SCREEN_WIDTH, springs.snappy, () => {
          runOnJS(handleToggle)();
          translateX.value = withSpring(0, springs.standard);
        });
      } else {
        // Snap back
        translateX.value = withSpring(0, springs.standard);
      }
    });

  const rowAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  // Row text fades on complete
  const textStyle = useAnimatedStyle(() => ({
    opacity: withTiming(localCompleted ? 0.45 : 1, { duration: durations.checkFade + 100 }),
  }));

  const handleTextChange = (field: 'reps' | 'weight', text: string) => {
    const parsed = field === 'reps' ? parseInt(text, 10) : parseFloat(text);
    if (text === '') {
      onUpdateSet(exerciseIndex, idx, { ...set, [field]: null });
    } else if (!isNaN(parsed)) {
      onUpdateSet(exerciseIndex, idx, { ...set, [field]: parsed });
    }
  };

  return (
    <View style={styles.swipeRowWrap}>
      {/* Green reveal underneath */}
      <View style={styles.swipeAction}>
        <Ionicons name="checkmark-done" size={18} color="#fff" />
      </View>

      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.setRow, localCompleted && styles.setRowCompleted, rowAnimStyle]}>
          <Animated.Text style={[styles.setIndexText, textStyle]}>{set.setNumber}</Animated.Text>

          {/* Weight Input */}
          <View style={styles.inputGroup}>
            <TextInput
              style={[styles.textInput, localCompleted && { opacity: 0.5 }]}
              value={set.weight !== null && set.weight !== undefined ? String(set.weight) : ''}
              placeholder="kg"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="numeric"
              editable={!localCompleted}
              onChangeText={text => handleTextChange('weight', text)}
            />
          </View>

          {/* Reps Input */}
          <View style={styles.inputGroup}>
            <TextInput
              style={[styles.textInput, localCompleted && { opacity: 0.5 }]}
              value={set.reps !== null && set.reps !== undefined ? String(set.reps) : ''}
              placeholder="reps"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="numeric"
              editable={!localCompleted}
              onChangeText={text => handleTextChange('reps', text)}
            />
          </View>

          <View style={styles.actionCol}>
            <AnimatedCheckmark completed={localCompleted} onPress={handleToggle} />
          </View>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

// ─── Main ExerciseCard ────────────────────────────────────────────────────────
export function ExerciseCard({
  exercise,
  exerciseIndex,
  onUpdateSet,
  onToggleComplete,
  onDelete,
  onHistoryClick,
  onAddSet,
  onRemoveSet,
  onToggleSkip,
  onMoveToDate,
  onEditClick,
  onSwap,
}: Props) {
  const [isLocalEditMode, setIsLocalEditMode] = useState(false);
  const [showVideo, setShowVideo] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [playing, setPlaying] = useState(false);
  const { gymLogs } = useMobileData();

  // P6 — Poof dismiss
  const poofScale = useSharedValue(1);
  const poofOpacity = useSharedValue(1);
  const poofHeight = useSharedValue<number | undefined>(undefined);

  const completedCount = exercise.setsLog.filter(s => s.completed).length;
  const totalSets = exercise.setsLog.length;
  const isAllComplete = completedCount === totalSets && totalSets > 0;

  const prWeight = React.useMemo(() => {
    let max = 0;
    if (gymLogs) {
      gymLogs.forEach(log => {
        if (log.exercises) {
          const match = log.exercises.find(
            e => e.exerciseId === exercise.exerciseId || e.name === exercise.name
          );
          if (match && match.setsLog) {
            match.setsLog.forEach((s: GymSet) => {
              if (s.completed && s.weight && s.weight > max) max = s.weight;
            });
          }
        }
      });
    }
    return max;
  }, [gymLogs, exercise.name, exercise.exerciseId]);

  const toggleVideo = () => {
    triggerLayoutAnimation();
    if (showVideo) {
      setPlaying(false);
      setShowVideo(false);
    } else {
      setShowVideo(true);
    }
  };

  const toggleExpand = () => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
    triggerLayoutAnimation();
    feedback.tap();
    setIsExpanded(prev => !prev);
  };

  // P6 — poof animation before skip
  const handleSkip = useCallback(() => {
    if (!onToggleSkip) return;
    poofScale.value = withTiming(0.8, {
      duration: durations.poof,
      easing: Easing.in(Easing.quad),
    });
    poofOpacity.value = withTiming(0, { duration: durations.poof }, () => {
      runOnJS(onToggleSkip)(exerciseIndex);
    });
    feedback.tap();
    setIsLocalEditMode(false);
  }, [exerciseIndex, onToggleSkip]);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ scale: poofScale.value }],
    opacity: poofOpacity.value,
  }));

  return (
    <Animated.View style={[styles.cardContainer, cardStyle]}>
      <View style={styles.cardContent}>

        {/* Header Row */}
        <TouchableOpacity style={styles.header} onPress={toggleExpand} activeOpacity={0.8}>
          <Ionicons
            name={isAllComplete ? 'checkmark-circle' : 'ellipse-outline'}
            size={24}
            color={isAllComplete ? '#C490FF' : COLORS.textMuted}
            style={styles.icon}
          />

          <View style={styles.headerTextContainer}>
            <Text style={styles.title} numberOfLines={1}>{exercise.name}</Text>
            <View style={styles.subtitleRow}>
              <Text style={styles.subtitle}>
                {exercise.targetSets} sets, {exercise.targetReps} reps
              </Text>
            </View>
          </View>

          {/* Action Area (Right) */}
          <View style={styles.headerRight}>
            {exercise.videoId && (
              <TouchableOpacity style={styles.videoIconBtn} onPress={toggleVideo}>
                <Ionicons name="play-outline" size={20} color={COLORS.textMuted} />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.videoIconBtn}
              onPress={() => {
                triggerLayoutAnimation();
                feedback.tap();
                setIsLocalEditMode(prev => !prev);
              }}
            >
              <Ionicons name="ellipsis-horizontal" size={20} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>

        {/* Edit Menu */}
        {isLocalEditMode && (
          <View style={styles.editMenu}>
            {onSwap && (
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => { feedback.tap(); onSwap(exerciseIndex); setIsLocalEditMode(false); }}
              >
                <Ionicons name="swap-horizontal" size={16} color={COLORS.textPrimary} />
              </TouchableOpacity>
            )}
            {onToggleSkip && (
              <TouchableOpacity style={styles.actionBtn} onPress={handleSkip}>
                <Ionicons name="remove-circle-outline" size={16} color={COLORS.textPrimary} />
              </TouchableOpacity>
            )}
            {onDelete && (
              <TouchableOpacity
                style={[styles.actionBtn, { borderColor: 'rgba(255,69,58,0.3)', backgroundColor: 'rgba(255,69,58,0.1)' }]}
                onPress={() => { feedback.warning(); onDelete(exerciseIndex); }}
              >
                <Ionicons name="trash-outline" size={16} color="#FF453A" />
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Video Dropdown */}
        {showVideo && exercise.videoId && (
          <View style={styles.videoContainer}>
            <YoutubeIframe
              height={200}
              play={playing}
              onReady={() => setPlaying(true)}
              videoId={exercise.videoId}
              initialPlayerParams={{ preventFullScreen: false, modestbranding: true }}
            />
          </View>
        )}

        {/* Expanded set rows */}
        {isExpanded && (
          <View style={styles.expandedArea}>
            {exercise.setsLog.map((set, idx) => (
              <SwipeableSetRow
                key={idx}
                set={set}
                idx={idx}
                exerciseIndex={exerciseIndex}
                onToggleComplete={onToggleComplete}
                onUpdateSet={onUpdateSet}
                exercise={exercise}
              />
            ))}

            <TouchableOpacity
              style={styles.addSetBtn}
              onPress={() => { feedback.tap(); onAddSet && onAddSet(exerciseIndex); }}
            >
              <Text style={styles.addSetText}>+ Add Set</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  cardContainer: { marginBottom: SPACE.sm },
  cardContent: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  icon: { marginRight: SPACE.sm },
  headerTextContainer: { flex: 1 },
  title: { fontFamily: FONT_FAMILY.bold, fontSize: 15, color: COLORS.textPrimary, marginBottom: 2 },
  subtitleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.xs },
  subtitle: { fontFamily: FONT_FAMILY.body, fontSize: 13, color: COLORS.textMuted },
  headerRight: { flexDirection: 'row', alignItems: 'center' },
  videoIconBtn: { padding: SPACE.xs },

  editMenu: { flexDirection: 'row', padding: SPACE.sm, gap: SPACE.sm, justifyContent: 'flex-end' },
  actionBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: COLORS.surface2,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: COLORS.border,
  },

  videoContainer: {
    width: '100%', borderRadius: RADIUS.md,
    overflow: 'hidden', marginTop: SPACE.md, backgroundColor: '#000',
  },

  expandedArea: { marginTop: SPACE.sm, paddingBottom: SPACE.md },

  // ── Swipe row ──────────────────────────────────────────
  swipeRowWrap: {
    position: 'relative',
    marginBottom: 4,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
  },
  swipeAction: {
    position: 'absolute',
    left: 0, top: 0, bottom: 0,
    width: '40%',
    backgroundColor: '#34C759',
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingLeft: SPACE.xl,
    borderRadius: RADIUS.md,
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    paddingHorizontal: SPACE.md,
    backgroundColor: '#1C1C1E',
    borderRadius: RADIUS.md,
    height: SET_ROW_HEIGHT,
  },
  setRowCompleted: { backgroundColor: '#242229' },
  setIndexText: { fontFamily: FONT_FAMILY.bold, fontSize: 12, color: COLORS.textMuted, width: 24 },

  inputGroup: { flex: 1, marginHorizontal: 8 },
  textInput: {
    backgroundColor: '#303033',
    borderRadius: RADIUS.sm,
    height: 30,
    fontFamily: FONT_FAMILY.bold,
    fontSize: 14,
    color: COLORS.textPrimary,
    textAlign: 'center',
    padding: 0,
  },
  actionCol: { marginLeft: 8 },

  // ── Animated checkmark ─────────────────────────────────
  checkBtnWrap: {
    width: CHECKMARK_SIZE, height: CHECKMARK_SIZE, borderRadius: RADIUS.sm,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  checkBtnBg: {
    borderRadius: RADIUS.md,
    backgroundColor: '#C490FF',
  },
  checkBtnBorder: {
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: '#1C1C1E',
  },

  addSetBtn: {
    marginTop: SPACE.sm,
    paddingVertical: SPACE.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderStyle: 'dashed',
    borderRadius: RADIUS.md,
    alignItems: 'center',
  },
  addSetText: { fontFamily: FONT_FAMILY.body, fontSize: 12, color: COLORS.textMuted },
});
