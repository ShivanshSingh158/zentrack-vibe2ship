import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, TouchableOpacity, Alert, TextInput,
  Platform, KeyboardAvoidingView, ScrollView, Modal, ActivityIndicator, AppState,
  StatusBar as RNStatusBar, Keyboard, Animated, PanResponder
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Reanimated, { FadeIn, FadeOut } from 'react-native-reanimated';
import ConfettiCannon from 'react-native-confetti-cannon';
import YoutubeIframe from 'react-native-youtube-iframe';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { FONT_FAMILY, SPACE, RADIUS, FONT_SIZE, SHADOW } from '../../theme/tokens';
import { useGymLog, todayStr } from '../../hooks/useGymLog';
import { useWellnessData } from '../../contexts/domains/WellnessContext';
import { resolveMuscleColor, hexToRgba, calculateExerciseMaxWeight, calculateExerciseAvgReps, calculateHistorical1RM, getPreviousExerciseSession, resolveExerciseTargetMuscle, getExerciseSwapAlternatives } from '../../utils/gymUtils';
import { hapticLight, hapticMedium, hapticSuccess } from '../../utils/haptics';
import { callProxy } from '../../services/geminiProxy';
import { autoResolveExerciseVideoId } from '../../services/exerciseVideoResolver';
import AnimatedRestTimer from '../../components/Gym/AnimatedRestTimer';
import { GYM_PLAN } from '../../data/gymPlan';
import { EXERCISE_DATABASE } from '../../data/exerciseDatabase';
import { getOverloadSuggestion, getRestDuration } from '../../services/progressiveOverload';
import { GymSet, GymNavigationParamList } from '../../types/gym.types';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '../../contexts/ThemeContext';

// ─── Per-set controlled input state ──────────────────────────────────────────
// BUG FIX #1: Instead of feeding the exercise's weight/reps directly into
// TextInput's `value` (which flickers whenever saveLog triggers a re-render),
// we maintain LOCAL input state per set. This local state is only updated from
// the exercise data on initial load or exercise change — never during typing.
interface SetInputState {
  weight: string;
  reps: string;
}

interface SwipeableSetRowProps {
  set: GymSet;
  idx: number;
  isActive: boolean;
  isCompleted: boolean;
  displayWeight: string;
  displayReps: string;
  colors: any;
  isDark: boolean;
  styles: any;
  onTextChange: (field: 'weight' | 'reps', text: string) => void;
  onBlur: () => void;
  onToggleComplete: () => void;
  onLongPress: () => void;
  onSwipeComplete: () => void;
}

const SwipeableSetRow: React.FC<SwipeableSetRowProps> = ({
  set,
  idx,
  isActive,
  isCompleted,
  displayWeight,
  displayReps,
  colors,
  isDark,
  styles,
  onTextChange,
  onBlur,
  onToggleComplete,
  onLongPress,
  onSwipeComplete,
}) => {
  const translateX = useRef(new Animated.Value(0)).current;
  const isTriggeringRef = useRef(false);

  useEffect(() => {
    if (isCompleted) {
      translateX.setValue(0);
      isTriggeringRef.current = false;
    }
  }, [isCompleted]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) => {
          // Accurate horizontal gesture detection that never interferes with vertical scrolling
          return (
            !isCompleted &&
            !isTriggeringRef.current &&
            gestureState.dx > 8 &&
            Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.3
          );
        },
        onPanResponderGrant: () => {
          Keyboard.dismiss();
        },
        onPanResponderMove: (_, gestureState) => {
          if (gestureState.dx > 0 && !isTriggeringRef.current) {
            // Smooth resistance curve
            const dx = gestureState.dx > 70 ? 70 + (gestureState.dx - 70) * 0.35 : gestureState.dx;
            translateX.setValue(Math.min(dx, 120));
          }
        },
        onPanResponderRelease: (_, gestureState) => {
          if (isTriggeringRef.current) return;

          // Threshold: 45px rightward drag or fast swipe velocity
          if (gestureState.dx > 45 || gestureState.vx > 0.35) {
            isTriggeringRef.current = true;
            Animated.timing(translateX, {
              toValue: 130,
              duration: 110,
              useNativeDriver: true,
            }).start(() => {
              translateX.setValue(0);
              onSwipeComplete();
              setTimeout(() => {
                isTriggeringRef.current = false;
              }, 250);
            });
          } else {
            Animated.spring(translateX, {
              toValue: 0,
              tension: 140,
              friction: 12,
              useNativeDriver: true,
            }).start();
          }
        },
        onPanResponderTerminate: () => {
          if (!isTriggeringRef.current) {
            Animated.spring(translateX, {
              toValue: 0,
              tension: 140,
              friction: 12,
              useNativeDriver: true,
            }).start();
          }
        },
      }),
    [isCompleted, onSwipeComplete]
  );

  const trackOpacity = translateX.interpolate({
    inputRange: [0, 40, 90],
    outputRange: [0.4, 0.85, 1],
    extrapolate: 'clamp',
  });

  const iconScale = translateX.interpolate({
    inputRange: [0, 45, 90],
    outputRange: [0.85, 1.15, 1.25],
    extrapolate: 'clamp',
  });

  return (
    <View style={[styles.setRowWrapper, isActive && styles.setRowWrapperActive]}>
      {/* Background Animated Swipe Track */}
      {!isCompleted && (
        <Animated.View style={[styles.swipeTrack, { opacity: trackOpacity }]}>
          <Animated.View style={[styles.swipeTrackContent, { transform: [{ scale: iconScale }] }]}>
            <Ionicons name="checkmark-circle" size={20} color="#34C759" />
            <Text style={styles.swipeTrackText}>Release to log</Text>
          </Animated.View>
        </Animated.View>
      )}

      {isActive && <View style={styles.activeIndicator} />}

      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.setRow,
          isCompleted && styles.setRowCompleted,
          isActive && styles.setRowActive,
          { transform: [{ translateX }] },
        ]}
      >
        {/* Tap checkmark circle to toggle completed, long-press to delete */}
        <TouchableOpacity
          onPress={onToggleComplete}
          onLongPress={onLongPress}
          style={styles.setIndexArea}
        >
          {isCompleted ? (
            <Ionicons name="checkmark-circle" size={20} color={colors.accentPrimary} />
          ) : (
            <Text style={[styles.setIndexText, isActive && { color: colors.accentPrimary }]}>{set.setNumber}</Text>
          )}
        </TouchableOpacity>

        {/* Controlled inputs with local state - locked when completed */}
        <View style={styles.inputGroup}>
          {displayWeight === '' && (
            <View style={styles.fakePlaceholder} pointerEvents="none">
              <Text style={styles.fakePlaceholderText}>kg</Text>
            </View>
          )}
          <TextInput
            style={[styles.textInput, isCompleted && { opacity: 0.85, color: colors.textPrimary }]}
            value={displayWeight}
            keyboardType="numeric"
            editable={!isCompleted}
            onChangeText={(text) => onTextChange('weight', text)}
            onBlur={onBlur}
          />
        </View>

        <View style={styles.inputGroup}>
          {displayReps === '' && (
            <View style={styles.fakePlaceholder} pointerEvents="none">
              <Text style={styles.fakePlaceholderText}>reps</Text>
            </View>
          )}
          <TextInput
            style={[styles.textInput, isCompleted && { opacity: 0.85, color: colors.textPrimary }]}
            value={displayReps}
            keyboardType="numeric"
            editable={!isCompleted}
            onChangeText={(text) => onTextChange('reps', text)}
            onBlur={onBlur}
          />
        </View>

        {/* Right Action / Subtle Swipe Hint */}
        <View style={{ width: 28, alignItems: 'center', justifyContent: 'center' }}>
          {!isCompleted ? (
            <Ionicons name="chevron-forward" size={14} color={isActive ? colors.accentPrimary : colors.textMuted} style={{ opacity: 0.4 }} />
          ) : (
            <Ionicons name="lock-closed-outline" size={12} color={colors.textMuted} style={{ opacity: 0.35 }} />
          )}
        </View>
      </Animated.View>
    </View>
  );
};

export default function ActiveLoggingScreen() {
    const { colors, isDark } = useTheme();
    const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const navigation = useNavigation<NativeStackNavigationProp<GymNavigationParamList>>();
  const route = useRoute<RouteProp<GymNavigationParamList, 'ActiveLogging'>>();
  const date = route.params?.date;

  const {
    log,
    updateExercise,
    startRestTimer,
    clearRestTimer,
    setRestTimerDuration,
    restTimerStartTime,
    restTimerDurationSecs,
    restTimerInitial,
    swapExercise,
    makeSwapPermanent,
    logSetAndStartTimer,
    endWorkout,
    updateNotes,
  } = useGymLog(date);

  const [showPR, setShowPR] = useState(false);
  // G8: Workout notes local state ΓÇö synced to Firestore on blur
  const [workoutNotes, setWorkoutNotes] = useState(log?.notes || '');
  const [showNotesInput, setShowNotesInput] = useState(!!log?.notes);
  // G6: Superset
  const [confettiTrigger, setConfettiTrigger] = useState(0);
  const [appState, setAppState] = useState(AppState.currentState);

  useEffect(() => {
    const sub = AppState.addEventListener('change', nextState => setAppState(nextState));
    return () => sub.remove();
  }, []);

  const [showSupersetPicker, setShowSupersetPicker] = useState(false);

  const [activeExIndex, setActiveExIndex] = useState(route.params?.initialIndex ?? 0);

  useEffect(() => {
    if (route.params?.initialIndex !== undefined) {
      setActiveExIndex(route.params.initialIndex);
    }
  }, [route.params?.initialIndex]);

  const [showVideo, setShowVideo] = useState(false);
  const [videoReady, setVideoReady] = useState(false);

  useEffect(() => {
    setVideoReady(false);
  }, [activeExIndex, showVideo]);

  const [showSwapModal, setShowSwapModal] = useState(false);
  const [aiSwapList, setAiSwapList] = useState<any[]>([]);
  const [isAiSwapLoading, setIsAiSwapLoading] = useState(false);

  const { gymLogs } = useWellnessData();

  // BUG FIX #1: Local controlled input state per set — decoupled from log state.
  // Initialised from exercise data, but never overwritten during typing.
  const [setInputs, setSetInputs] = useState<SetInputState[]>([]);
  const [isRefreshingVideo, setIsRefreshingVideo] = useState(false);
  const userEditedFieldsRef = useRef<{ [idx: number]: { weight?: boolean; reps?: boolean } }>({});
  const lastExerciseKeyRef = useRef<string>('');
  // Tracks the LIVE value the user is typing — updated synchronously on every keystroke
  // so the useEffect re-init never clobbers an in-progress edit.
  const liveInputsRef = useRef<{ [idx: number]: { weight?: string; reps?: string } }>({});

  const handleRefreshVideo = async () => {
    if (!exercise || isRefreshingVideo) return;
    hapticMedium();
    setIsRefreshingVideo(true);

    try {
      let freshVideoId = await autoResolveExerciseVideoId(exercise.name, true);
      if (!freshVideoId || freshVideoId === exercise.videoId) {
        freshVideoId = await autoResolveExerciseVideoId(`${exercise.name} exercise form tutorial`, true);
      }
      if (freshVideoId) {
        const updatedEx = { ...exercise, videoId: freshVideoId };
        updateExercise(realExerciseIndex, updatedEx);
        hapticSuccess();
      }
    } catch (e) {
      console.warn('[Refresh Video] Error:', e);
    } finally {
      setIsRefreshingVideo(false);
    }
  };

  const activeExercises = useMemo(() => log?.exercises?.filter(ex => !ex.skipped) || [], [log]);
  const safeIdx = Math.min(activeExIndex, Math.max(0, activeExercises.length - 1));
  const exercise = activeExercises[safeIdx];
  const exercises = activeExercises;

  const realExerciseIndex = useMemo(() => {
    if (!log?.exercises || !exercise) return safeIdx;
    const idx = log.exercises.findIndex(e => e.name === exercise.name);
    return idx !== -1 ? idx : safeIdx;
  }, [log?.exercises, exercise?.name, safeIdx]);

  // Superset partner exercise lookup
  const partnerExercise = useMemo(() => {
    if (!exercise?.supersetGroup) return null;
    return activeExercises.find(
      (e, i) => e.supersetGroup === exercise.supersetGroup && i !== safeIdx
    );
  }, [exercise?.supersetGroup, activeExercises, safeIdx]);

  // ─── Progressive overload suggestion ──────────────────────────────────────────
  const overloadSuggestion = useMemo(() => {
    if (!log?.exercises || !gymLogs) return null;
    const activeExercisesList = log.exercises.filter((ex: any) => !ex.skipped);
    const currentExercise = activeExercisesList[Math.min(activeExIndex, Math.max(0, activeExercisesList.length - 1))];
    if (!currentExercise) return null;
    const currentWeight = calculateExerciseMaxWeight(currentExercise as any);
    return getOverloadSuggestion(
      currentExercise,
      currentWeight,
      currentExercise.targetSets || 3,
      String(currentExercise.targetReps || '8'),
      gymLogs
    );
  }, [log, gymLogs, activeExIndex]);

  // Initialize input state when exercise or set count changes
  useEffect(() => {
    if (!exercise || !exercise.setsLog) return;

    const currentExId = exercise.exerciseId || exercise.name || '';
    const key = `${currentExId}-${activeExIndex}`;
    if (key !== lastExerciseKeyRef.current) {
      lastExerciseKeyRef.current = key;
      userEditedFieldsRef.current = {};
      liveInputsRef.current = {};
    }

    const prevSession = getPreviousExerciseSession(exercise.name, gymLogs, date || todayStr());
    const lastSessionSets = exercise.lastSessionSets || prevSession?.sets || [];
    const lastValidPastSet = lastSessionSets.length > 0 ? lastSessionSets[lastSessionSets.length - 1] : null;

    setSetInputs(prev => {
      return exercise.setsLog.map((s, idx) => {
        // ── COMPLETED SETS: use persisted weight/reps from log ──
        if (s.completed) {
          const savedW = (s.weight !== null && s.weight !== undefined && Number(s.weight) > 0) ? String(s.weight) : '';
          const savedR = (s.reps !== null && s.reps !== undefined && Number(s.reps) > 0) ? String(s.reps) : '';
          return {
            weight: savedW || prev?.[idx]?.weight || '',
            reps: savedR || prev?.[idx]?.reps || '',
          };
        }

        // ── INCOMPLETE SETS: respect user edits first, then prefill from exact last session ──
        const edited = userEditedFieldsRef.current[idx];
        const existingWeight = prev?.[idx]?.weight;
        const existingReps = prev?.[idx]?.reps;
        const liveWeight = liveInputsRef.current[idx]?.weight;
        const liveReps = liveInputsRef.current[idx]?.reps;

        const lastSet = lastSessionSets[idx] || lastValidPastSet;

        // 1. Weight: set's existing weight -> previous session set weight -> previous session last weight
        let initialWeight = (s.weight !== null && s.weight !== undefined && Number(s.weight) > 0)
          ? String(s.weight)
          : '';

        if (!initialWeight && lastSet?.weight != null && Number(lastSet.weight) > 0) {
          initialWeight = String(lastSet.weight);
        }

        // 2. Reps: set's existing reps -> previous session set reps -> default target reps
        const defaultTargetReps = String(parseInt(String(exercise.targetReps || '8-12').split("-")[0], 10) || 8);
        let initialReps = (s.reps !== null && s.reps !== undefined && Number(s.reps) > 0)
          ? String(s.reps)
          : (lastSet?.reps ? String(lastSet.reps) : defaultTargetReps);

        return {
          weight: edited?.weight ? (liveWeight !== undefined ? liveWeight : (existingWeight || '')) : (initialWeight || existingWeight || ''),
          reps: edited?.reps ? (liveReps !== undefined ? liveReps : (existingReps || '')) : (initialReps || existingReps || ''),
        };
      });
    });
  }, [exercise?.exerciseId, exercise?.name, activeExIndex, exercise?.setsLog, gymLogs, overloadSuggestion, date]);

  // Real-time S.A.R.A AI Swap generator for ActiveLoggingScreen modal
  useEffect(() => {
    if (!showSwapModal || !exercise) return;
    let isCancelled = false;

    const { targetMuscle, canonicalGroup } = resolveExerciseTargetMuscle(exercise.name, exercise.muscle);
    const swaps = getExerciseSwapAlternatives(exercise.name, exercise.muscle);

    setAiSwapList([]);
    setIsAiSwapLoading(true);

    async function loadAllSwaps() {
      try {
        const enriched = await Promise.all(
          swaps.map(async (alt) => {
            let vidId = alt.videoId && alt.videoId !== '1' ? alt.videoId : undefined;
            if (!vidId) {
              vidId = (await autoResolveExerciseVideoId(alt.name)) || '';
            }
            return {
              ...alt,
              videoId: vidId,
            };
          })
        );

        if (isCancelled) return;
        setAiSwapList(enriched);
      } catch (e) {
        console.warn('[Swap Load] Error:', e);
        if (!isCancelled) setAiSwapList(swaps);
      } finally {
        if (!isCancelled) setIsAiSwapLoading(false);
      }
    }

    loadAllSwaps();
    return () => { isCancelled = true; };
  }, [showSwapModal, exercise?.name, exercise?.muscle]);

  // S.A.R.A AI Auto-Form Video ID Resolver & Automatic Video Mismatch Auto-Healer
  useEffect(() => {
    if (!exercise) return;
    let isCancelled = false;

    autoResolveExerciseVideoId(exercise.name).then(resolvedId => {
      if (isCancelled || !resolvedId) return;
      if (exercise.videoId !== resolvedId) {
        const updatedEx = { ...exercise, videoId: resolvedId };
        updateExercise(realExerciseIndex, updatedEx);
      }
    });

    return () => { isCancelled = true; };
  }, [exercise?.name, exercise?.videoId]);

  // ΓöÇΓöÇΓöÇ Last-session banner ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  // BUG FIX #4: Show lastSessionSets (pre-filled data) even before any set is
  // completed, so the user can see what they lifted last time immediately.
  const lastTimeData = useMemo(() => {
    if (!log?.exercises || !gymLogs) return null;
    const exercisesList = log.exercises.filter(ex => !ex.skipped);
    const safeExerciseIdx = Math.min(activeExIndex, Math.max(0, exercisesList.length - 1));
    const currentEx = exercisesList[safeExerciseIdx];
    if (!currentEx) return null;

    const prevSession = getPreviousExerciseSession(currentEx.name, gymLogs, date || todayStr());
    if (!prevSession || prevSession.sets.length === 0) return null;

    const weightPart = prevSession.lastWeight ? `@ ${prevSession.lastWeight}kg` : '';
    const repsPart = prevSession.avgReps ? `${prevSession.avgReps} reps` : '';
    return `Last time: ${prevSession.sets.length} sets ${repsPart ? `× ${repsPart}` : ''} ${weightPart}`.trim();
  }, [log, activeExIndex, gymLogs, date]);



  if (!log || !log.exercises) {
    // Show an instant skeleton instead of a black spinner.
    // The header and set-row outlines render immediately; data fills in ~300ms.
    return (
      <SafeAreaView style={styles.root}>
        {/* Header skeleton */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <View style={{ width: 120, height: 14, borderRadius: 7, backgroundColor: '#2C2C2E' }} />
          <View style={{ width: 32 }} />
        </View>
        {/* Exercise title skeleton */}
        <View style={{ alignItems: 'center', marginTop: 32, gap: 12 }}>
          <View style={{ width: 80, height: 24, borderRadius: 12, backgroundColor: '#2C2C2E' }} />
          <View style={{ width: 200, height: 28, borderRadius: 8, backgroundColor: '#2C2C2E' }} />
          <View style={{ width: 150, height: 14, borderRadius: 7, backgroundColor: '#1C1C1E' }} />
        </View>
        {/* Set row skeletons */}
        <View style={{ paddingHorizontal: SPACE.xl, marginTop: 32, gap: 8 }}>
          {[1, 2, 3].map(i => (
            <View key={i} style={[styles.setRow, { opacity: 1 - i * 0.2 }]}>
              <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#2C2C2E' }} />
              <View style={{ flex: 1, height: 36, borderRadius: 6, backgroundColor: '#2C2C2E', marginHorizontal: 8 }} />
              <View style={{ flex: 1, height: 36, borderRadius: 6, backgroundColor: '#2C2C2E', marginHorizontal: 8 }} />
              <View style={{ width: 32 }} />
            </View>
          ))}
        </View>
        {/* "Loading..." label */}
        <View style={{ alignItems: 'center', marginTop: 24 }}>
          <ActivityIndicator size="small" color={colors.accentPrimary} />
        </View>
      </SafeAreaView>
    );
  }

  if (!exercise) {
    return (
      <View style={[styles.root, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: colors.textMuted }}>No exercises found.</Text>
      </View>
    );
  }

  const activeSetIndex = exercise.setsLog.findIndex(s => !s.completed);
  const isAllComplete = activeSetIndex === -1;

  const handleBack = () => {
    hapticMedium();
    navigation.goBack();
  };

  // SMART SET FORWARD AUTO-FILL:
  // When user types weight or reps in Set 1 (idx 0), auto-propagate forward to all uncompleted sets.
  const handleTextChange = (setIdx: number, field: 'reps' | 'weight', text: string) => {
    if (!userEditedFieldsRef.current[setIdx]) userEditedFieldsRef.current[setIdx] = {};
    userEditedFieldsRef.current[setIdx][field] = true;
    // Keep live ref in sync so the useEffect never clobbers an in-progress edit
    if (!liveInputsRef.current[setIdx]) liveInputsRef.current[setIdx] = {};
    liveInputsRef.current[setIdx][field] = text;

    setSetInputs(prev => {
      const next = [...prev];
      const curSet = exercise?.setsLog?.[setIdx];
      const current = next[setIdx] || {
        weight: curSet?.weight != null ? String(curSet.weight) : '',
        reps: curSet?.reps != null ? String(curSet.reps) : ''
      };
      next[setIdx] = { ...current, [field]: text };
      return next;
    });
  };

  // Flush local input state into the exercise when user leaves a field
  const handleBlur = (setIdx: number) => {
    const input = setInputs[setIdx];
    const curSet = exercise?.setsLog?.[setIdx];
    const isWeightEdited = userEditedFieldsRef.current[setIdx]?.weight;
    const isRepsEdited = userEditedFieldsRef.current[setIdx]?.reps;

    let weightVal: number | null = null;
    if (input?.weight !== '' && input?.weight !== undefined) {
      weightVal = parseFloat(input.weight);
    } else if (isWeightEdited) {
      weightVal = null;
    } else if (curSet?.weight != null && Number(curSet.weight) > 0) {
      weightVal = Number(curSet.weight);
    }

    let repsVal: number | null = null;
    if (input?.reps !== '' && input?.reps !== undefined) {
      repsVal = parseInt(input.reps, 10);
    } else if (isRepsEdited) {
      repsVal = null;
    } else if (curSet?.reps != null && Number(curSet.reps) > 0) {
      repsVal = Number(curSet.reps);
    }

    const newEx = {
      ...exercise,
      setsLog: exercise.setsLog.map((s, i) => {
        if (i !== setIdx) return s;
        return {
          ...s,
          weight: weightVal !== null && !isNaN(weightVal) ? weightVal : (isWeightEdited ? null : s.weight),
          reps: repsVal !== null && !isNaN(repsVal) ? repsVal : (isRepsEdited ? null : s.reps),
        };
      }),
    };
    updateExercise(realExerciseIndex, newEx);
  };

  const handleLogSet = () => {
    if (activeSetIndex === -1) return;
    Keyboard.dismiss();
    hapticMedium();

    const currentSet = exercise.setsLog[activeSetIndex];
    const input = setInputs[activeSetIndex];
    const isWeightEdited = userEditedFieldsRef.current[activeSetIndex]?.weight;
    const isRepsEdited = userEditedFieldsRef.current[activeSetIndex]?.reps;

    let parsedWeight: number | null = null;
    if (input?.weight !== '' && input?.weight !== undefined) {
      parsedWeight = parseFloat(input.weight);
    } else if (isWeightEdited) {
      parsedWeight = null;
    } else if (currentSet?.weight != null && Number(currentSet.weight) > 0) {
      parsedWeight = Number(currentSet.weight);
    } else if (overloadSuggestion?.recommended) {
      parsedWeight = Number(overloadSuggestion.recommended);
    }

    let parsedReps: number | null = null;
    if (input?.reps !== '' && input?.reps !== undefined) {
      parsedReps = parseInt(input.reps, 10);
    } else if (isRepsEdited) {
      parsedReps = null;
    } else if (currentSet?.reps != null && Number(currentSet.reps) > 0) {
      parsedReps = Number(currentSet.reps);
    } else {
      parsedReps = parseInt(String(exercise.targetReps || '8').split('-')[0], 10) || 8;
    }

    const newEx = {
      ...exercise,
      setsLog: exercise.setsLog.map((s, i) => {
        if (i === activeSetIndex) {
          return {
            ...s,
            weight: parsedWeight,
            reps: parsedReps,
            completed: true,
          };
        }
        return s;
      }),
    };

    // Update local setInputs buffer for this specific set
    setSetInputs(prev => prev.map((inp, i) => {
      if (i === activeSetIndex) {
        return { weight: parsedWeight !== null ? String(parsedWeight) : '', reps: parsedReps !== null ? String(parsedReps) : '' };
      }
      return inp;
    }));

    // SUPERSET & GIANT SET ALTERNATING FLOW:
    let nextIndexToJump = -1;
    let isSupersetPartner = false;

    if (exercise.supersetGroup) {
      const supersetIndices = exercises
        .map((ex, idx) => (ex.supersetGroup === exercise.supersetGroup ? idx : -1))
        .filter(idx => idx !== -1);
      
      if (supersetIndices.length > 1) {
        const currentIndexInGroup = supersetIndices.indexOf(activeExIndex);
        
        // Find next exercise in the superset that has incomplete sets
        for (let i = 1; i < supersetIndices.length; i++) {
          const checkIndex = supersetIndices[(currentIndexInGroup + i) % supersetIndices.length];
          const checkEx = exercises[checkIndex];
          const hasIncompleteSets = checkEx.setsLog.some(s => !s.completed);
          
          if (hasIncompleteSets) {
            nextIndexToJump = checkIndex;
            isSupersetPartner = true;
            break;
          }
        }
      }
    }

    // 30s transition for alternating superset partners, otherwise full rest duration
    const restSecs = isSupersetPartner ? 30 : getRestDuration(exercise);

    logSetAndStartTimer(realExerciseIndex, newEx, restSecs, exercise.name);

    if (nextIndexToJump !== -1) {
      setTimeout(() => {
        setActiveExIndex(nextIndexToJump);
      }, 400);
    }
  };

  // Smart Quick-Stepper: adjust weight on active set
  const handleAdjustWeight = (delta: number) => {
    const targetIdx = activeSetIndex !== -1 ? activeSetIndex : exercise.setsLog.length - 1;
    if (targetIdx < 0) return;
    hapticLight();
    const curSet = exercise.setsLog[targetIdx];
    const curInput = setInputs[targetIdx];
    const prevSet = targetIdx > 0 ? exercise.setsLog[targetIdx - 1] : null;

    let baseWeight = 0;
    if (curInput?.weight !== '' && curInput?.weight !== undefined) {
      baseWeight = parseFloat(curInput.weight) || 0;
    } else if (curSet?.weight != null && Number(curSet.weight) > 0) {
      baseWeight = Number(curSet.weight);
    } else if (prevSet?.weight != null && Number(prevSet.weight) > 0) {
      baseWeight = Number(prevSet.weight);
    } else if (overloadSuggestion?.recommended) {
      baseWeight = Number(overloadSuggestion.recommended);
    }

    const newWeight = Math.max(0, Math.round((baseWeight + delta) * 10) / 10);
    handleTextChange(targetIdx, 'weight', String(newWeight));
  };

  // Smart Quick-Stepper: adjust reps on active set
  const handleAdjustReps = (delta: number) => {
    const targetIdx = activeSetIndex !== -1 ? activeSetIndex : exercise.setsLog.length - 1;
    if (targetIdx < 0) return;
    hapticLight();
    const curSet = exercise.setsLog[targetIdx];
    const curInput = setInputs[targetIdx];
    const prevSet = targetIdx > 0 ? exercise.setsLog[targetIdx - 1] : null;

    let baseReps = 8;
    if (curInput?.reps !== '' && curInput?.reps !== undefined) {
      baseReps = parseInt(curInput.reps, 10) || 8;
    } else if (curSet?.reps != null && Number(curSet.reps) > 0) {
      baseReps = Number(curSet.reps);
    } else if (prevSet?.reps != null && Number(prevSet.reps) > 0) {
      baseReps = Number(prevSet.reps);
    } else {
      baseReps = parseInt(String(exercise.targetReps || '8').split('-')[0], 10) || 8;
    }

    const newReps = Math.max(1, baseReps + delta);
    handleTextChange(targetIdx, 'reps', String(newReps));
  };

  // Smart Quick-Fill: copy previous set or target
  const handleRepeatPreviousSet = () => {
    const targetIdx = activeSetIndex !== -1 ? activeSetIndex : exercise.setsLog.length - 1;
    if (targetIdx < 0) return;
    hapticLight();
    const prevSet = targetIdx > 0 ? exercise.setsLog[targetIdx - 1] : null;
    const prevInput = targetIdx > 0 ? setInputs[targetIdx - 1] : null;

    const repWeight = prevInput?.weight || (prevSet?.weight != null ? String(prevSet.weight) : (overloadSuggestion?.recommended ? String(overloadSuggestion.recommended) : ''));
    const repReps = prevInput?.reps || (prevSet?.reps != null ? String(prevSet.reps) : (String(exercise.targetReps || '8').split('-')[0] || '8'));

    if (repWeight) handleTextChange(targetIdx, 'weight', repWeight);
    if (repReps) handleTextChange(targetIdx, 'reps', repReps);
  };

  // 1-Swipe Set Completion & Auto-Flow
  const handleSwipeCompleteSet = (setIdx: number) => {
    hapticSuccess();
    const currentSet = exercise.setsLog[setIdx];
    const input = setInputs[setIdx];
    const prevSet = setIdx > 0 ? exercise.setsLog[setIdx - 1] : null;
    const prevInput = setIdx > 0 ? setInputs[setIdx - 1] : null;

    // 1. Resolve weight: current input -> current set -> previous input -> previous set -> overload suggestion
    let parsedWeight: number | null = null;
    if (input?.weight !== '' && input?.weight !== undefined) {
      parsedWeight = parseFloat(input.weight);
    } else if (currentSet?.weight != null && Number(currentSet.weight) > 0) {
      parsedWeight = Number(currentSet.weight);
    } else if (prevInput?.weight !== '' && prevInput?.weight !== undefined) {
      parsedWeight = parseFloat(prevInput.weight);
    } else if (prevSet?.weight != null && Number(prevSet.weight) > 0) {
      parsedWeight = Number(prevSet.weight);
    } else if (overloadSuggestion?.recommended) {
      parsedWeight = Number(overloadSuggestion.recommended);
    }

    // 2. Resolve reps: current input -> current set -> previous input -> previous set -> target reps
    let parsedReps: number | null = null;
    if (input?.reps !== '' && input?.reps !== undefined) {
      parsedReps = parseInt(input.reps, 10);
    } else if (currentSet?.reps != null && Number(currentSet.reps) > 0) {
      parsedReps = Number(currentSet.reps);
    } else if (prevInput?.reps !== '' && prevInput?.reps !== undefined) {
      parsedReps = parseInt(prevInput.reps, 10);
    } else if (prevSet?.reps != null && Number(prevSet.reps) > 0) {
      parsedReps = Number(prevSet.reps);
    } else {
      parsedReps = parseInt(String(exercise.targetReps || '8').split('-')[0], 10) || 8;
    }

    const newEx = {
      ...exercise,
      setsLog: exercise.setsLog.map((s, i) => {
        if (i === setIdx) {
          return {
            ...s,
            weight: parsedWeight,
            reps: parsedReps,
            completed: true,
          };
        }
        return s;
      }),
    };

    setSetInputs(prev => prev.map((inp, i) => {
      if (i === setIdx) {
        return {
          weight: parsedWeight !== null ? String(parsedWeight) : '',
          reps: parsedReps !== null ? String(parsedReps) : '',
        };
      }
      return inp;
    }));

    // SUPERSET & GIANT SET ALTERNATING FLOW:
    let nextIndexToJump = -1;
    let isSupersetPartner = false;

    if (exercise.supersetGroup) {
      const supersetIndices = exercises
        .map((ex, idx) => (ex.supersetGroup === exercise.supersetGroup ? idx : -1))
        .filter(idx => idx !== -1);
      
      if (supersetIndices.length > 1) {
        const currentIndexInGroup = supersetIndices.indexOf(activeExIndex);
        for (let i = 1; i < supersetIndices.length; i++) {
          const checkIndex = supersetIndices[(currentIndexInGroup + i) % supersetIndices.length];
          const checkEx = exercises[checkIndex];
          const hasIncompleteSets = checkEx.setsLog.some(s => !s.completed);
          if (hasIncompleteSets) {
            nextIndexToJump = checkIndex;
            isSupersetPartner = true;
            break;
          }
        }
      }
    }

    const restSecs = isSupersetPartner ? 30 : getRestDuration(exercise);
    logSetAndStartTimer(realExerciseIndex, newEx, restSecs, exercise.name);

    if (nextIndexToJump !== -1) {
      setTimeout(() => {
        setActiveExIndex(nextIndexToJump);
      }, 400);
    }
  };

  const handleNextExercise = () => {
    Keyboard.dismiss();
    if (activeExIndex < exercises.length - 1) {
      hapticMedium();
      setActiveExIndex(activeExIndex + 1);
    } else {
      hapticSuccess();
      clearRestTimer();
      endWorkout(true);
      navigation.replace('WorkoutSummary', { date });
    }
  };

  const handleDeleteSet = (idx: number) => {
    hapticLight();
    const newEx = { ...exercise, setsLog: exercise.setsLog.filter((_, i) => i !== idx).map((s, i) => ({ ...s, setNumber: i + 1 })) };
    updateExercise(realExerciseIndex, newEx);
    // Also remove from local input state
    setSetInputs(prev => prev.filter((_, i) => i !== idx));
  };

  const handleAddSet = () => {
    hapticLight();
    const lastSet = exercise.setsLog[exercise.setsLog.length - 1];
    const lastInput = setInputs[setInputs.length - 1];
    const weightVal = lastSet?.weight ?? (lastInput?.weight ? parseFloat(lastInput.weight) : null);
    const repsVal = lastSet?.reps ?? (lastInput?.reps ? parseInt(lastInput.reps, 10) : null);

    const newEx = {
      ...exercise,
      setsLog: [
        ...exercise.setsLog,
        {
          setNumber: exercise.setsLog.length + 1,
          reps: repsVal,
          weight: weightVal,
          completed: false,
        },
      ],
    };
    updateExercise(realExerciseIndex, newEx);
    // Add blank entry to local input state
    setSetInputs(prev => [...prev, { weight: '', reps: '' }]);
  };

  // Toggle completion: flips completed flag and flushes current input state (weight/reps) immediately
  const handleToggleSetComplete = (setIdx: number) => {
    Keyboard.dismiss();
    hapticLight();
    const input = setInputs[setIdx];
    const curSet = exercise.setsLog[setIdx];
    const targetCompleted = !curSet.completed;

    let weightVal: number | null = null;
    if (input?.weight !== '' && input?.weight !== undefined) {
      weightVal = parseFloat(input.weight);
    } else if (curSet?.weight != null && Number(curSet.weight) > 0) {
      weightVal = Number(curSet.weight);
    }

    let repsVal: number | null = null;
    if (input?.reps !== '' && input?.reps !== undefined) {
      repsVal = parseInt(input.reps, 10);
    } else if (curSet?.reps != null && Number(curSet.reps) > 0) {
      repsVal = Number(curSet.reps);
    } else {
      repsVal = parseInt(String(exercise.targetReps || '8').split('-')[0], 10) || 8;
    }

    const newEx = {
      ...exercise,
      setsLog: exercise.setsLog.map((s, i) =>
        i === setIdx ? {
          ...s,
          completed: targetCompleted,
          weight: weightVal !== null && !isNaN(weightVal) ? weightVal : s.weight,
          reps: repsVal !== null && !isNaN(repsVal) ? repsVal : s.reps,
        } : s
      ),
    };
    updateExercise(realExerciseIndex, newEx);
  };

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style={isDark ? 'light' : 'dark'} backgroundColor={colors.background} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>

        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Exercise {activeExIndex + 1} of {exercises.length}</Text>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.navigate('ExerciseDetail', { exerciseId: exercise.exerciseId, date })}>
            <Ionicons name="ellipsis-horizontal" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        {/* Content */}
        <View style={styles.content}>
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

            <View style={styles.titleArea}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                <View style={[styles.musclePill, { backgroundColor: hexToRgba(colors.accentPrimary, 0.15), marginBottom: 0 }]}>
                  <View style={[styles.muscleDot, { backgroundColor: colors.accentPrimary }]} />
                  <Text style={[styles.muscleText, { color: colors.accentPrimary }]}>{exercise.muscle}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    hapticMedium();
                    setShowSwapModal(true);
                  }}
                  style={[styles.musclePill, { backgroundColor: 'rgba(255,255,255,0.1)', marginBottom: 0, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center' }]}
                >
                  <Ionicons name="swap-horizontal" size={14} color={colors.textPrimary} />
                  <Text style={[styles.muscleText, { color: colors.textPrimary, marginLeft: 4 }]}>SWAP</Text>
                </TouchableOpacity>
                {/* G6: Superset badge/button */}
                <TouchableOpacity
                  onPress={() => { hapticMedium(); setShowSupersetPicker(true); }}
                  style={[styles.musclePill, {
                    backgroundColor: exercise.supersetGroup
                      ? 'rgba(255,159,77,0.18)' : 'rgba(255,255,255,0.07)',
                    marginBottom: 0, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center',
                    borderColor: exercise.supersetGroup ? 'rgba(255,159,77,0.4)' : 'rgba(255,255,255,0.1)',
                    borderWidth: 1,
                  }]}
                >
                  <Ionicons name="git-merge-outline" size={13} color={exercise.supersetGroup ? '#ff9f4d' : colors.textMuted} />
                  <Text style={[styles.muscleText, { color: exercise.supersetGroup ? '#ff9f4d' : colors.textMuted, marginLeft: 4 }]}>
                    {exercise.supersetGroup ? `SUPER-${exercise.supersetGroup}` : 'SUPERSET'}
                  </Text>
                </TouchableOpacity>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16, width: '100%' }}>
                <Text style={styles.exerciseName} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.85}>
                  {exercise.name}
                </Text>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => {
                    hapticMedium();
                    if (!exercise.videoId) {
                      setShowVideo(true);
                      autoResolveExerciseVideoId(exercise.name).then(resolvedId => {
                        if (resolvedId) {
                          updateExercise(realExerciseIndex, { ...exercise, videoId: resolvedId });
                        }
                      });
                    } else {
                      setShowVideo(prev => !prev);
                    }
                  }}
                  style={[
                    styles.videoBtn,
                    showVideo && styles.videoBtnActive,
                  ]}
                >
                  <Ionicons
                    name={showVideo ? "close" : "play"}
                    size={showVideo ? 16 : 14}
                    color={showVideo ? colors.textPrimary : "#000000"}
                    style={!showVideo ? { marginLeft: 2 } : {}}
                  />
                </TouchableOpacity>
              </View>

              {/* BUG FIX #4: Shows last session data immediately, even before sets are completed */}
              <Text style={styles.lastTimeText}>
                {lastTimeData ?? `Goal: ${exercise.targetSets} sets × ${exercise.targetReps} reps`}
              </Text>

              {/* Superset Partner Companion Banner */}
              {exercise.supersetGroup && partnerExercise && (
                <TouchableOpacity
                  activeOpacity={0.75}
                  onPress={() => {
                    hapticLight();
                    const partnerIdx = activeExercises.findIndex(e => e.exerciseId === partnerExercise.exerciseId);
                    if (partnerIdx !== -1) setActiveExIndex(partnerIdx);
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: 'rgba(255,159,77,0.12)',
                    borderWidth: 1,
                    borderColor: 'rgba(255,159,77,0.35)',
                    borderRadius: RADIUS.md,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    marginTop: 8,
                    width: '92%',
                    alignSelf: 'center',
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, marginRight: 10, minWidth: 0 }}>
                    <Ionicons name="git-merge" size={14} color="#ff9f4d" style={{ flexShrink: 0 }} />
                    <View style={{
                      backgroundColor: 'rgba(255,159,77,0.2)',
                      paddingHorizontal: 6,
                      paddingVertical: 2,
                      borderRadius: 6,
                      flexShrink: 0,
                    }}>
                      <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 10, color: '#ff9f4d', letterSpacing: 0.5 }}>
                        SUPER-{exercise.supersetGroup}
                      </Text>
                    </View>
                    <Text
                      style={{
                        fontFamily: FONT_FAMILY.medium,
                        fontSize: 12,
                        color: colors.textPrimary,
                        flex: 1,
                        flexShrink: 1,
                      }}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {partnerExercise.name}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                    <Text style={{ fontSize: 11, color: '#ff9f4d', fontFamily: FONT_FAMILY.bold }}>Switch</Text>
                    <Ionicons name="arrow-forward" size={12} color="#ff9f4d" />
                  </View>
                </TouchableOpacity>
              )}

              {overloadSuggestion && overloadSuggestion.type !== 'maintain' && (
                <Reanimated.View entering={FadeIn.duration(400)} style={[
                  styles.overloadChip,
                  { backgroundColor: overloadSuggestion.type === 'increase' ? 'rgba(94,218,158,0.15)' : 'rgba(255,159,77,0.15)' }
                ]}>
                  <Ionicons
                    name={overloadSuggestion.type === 'increase' ? 'trending-up' : 'trending-down'}
                    size={14}
                    color={overloadSuggestion.type === 'increase' ? colors.accentGreen : colors.accentAmber}
                  />
                  <Text style={[styles.overloadChipText, {
                    color: overloadSuggestion.type === 'increase' ? colors.accentGreen : colors.accentAmber
                  }]}>
                    {overloadSuggestion.type === 'increase' ? '📈' : '📉'} {overloadSuggestion.recommended}kg suggested • {overloadSuggestion.reason}
                  </Text>
                </Reanimated.View>
              )}
            </View>

            {showVideo && (
              <View style={[styles.videoContainer, { backgroundColor: '#161618', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', padding: 8, marginBottom: SPACE.xl }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, paddingHorizontal: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="logo-youtube" size={16} color="#ff453a" />
                    <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 12, color: colors.textPrimary }}>Form Guide Demonstration</Text>
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <TouchableOpacity
                      onPress={handleRefreshVideo}
                      disabled={isRefreshingVideo}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 }}
                    >
                      {isRefreshingVideo ? (
                        <ActivityIndicator size="small" color="#a599ff" />
                      ) : (
                        <Ionicons name="refresh" size={13} color="#a599ff" />
                      )}
                      <Text style={{ fontSize: 11, fontFamily: FONT_FAMILY.bold, color: '#a599ff' }}>
                        {isRefreshingVideo ? 'Refreshing...' : 'Refresh'}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity onPress={() => setShowVideo(false)}>
                      <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                </View>
                {exercise.videoId ? (
                  <YoutubeIframe
                    height={210}
                    play={true}
                    videoId={exercise.videoId}
                    onError={async (err: any) => {
                      console.warn('[YoutubeIframe Error] Video unavailable:', exercise.name, exercise.videoId, err);
                      const freshId = await autoResolveExerciseVideoId(exercise.name, true);
                      if (freshId && freshId !== exercise.videoId) {
                        updateExercise(realExerciseIndex, { ...exercise, videoId: freshId });
                      } else {
                        updateExercise(realExerciseIndex, { ...exercise, videoId: '' });
                        setShowVideo(false);
                      }
                    }}
                    initialPlayerParams={{ modestbranding: true, rel: false }}
                    webViewProps={{
                      androidLayerType: appState === 'active' ? 'hardware' : 'software',
                      domStorageEnabled: true,
                      javaScriptEnabled: true,
                    }}
                  />
                ) : (
                  <View style={{ height: 160, alignItems: 'center', justifyContent: 'center' }}>
                    <ActivityIndicator size="small" color={colors.accentPrimary} />
                    <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 8, fontFamily: FONT_FAMILY.medium }}>Finding form video for {exercise.name}...</Text>
                  </View>
                )}
              </View>
            )}

            {/* Smart Quick-Fill Chips & Quick-Steppers */}
            {!isAllComplete && (
              <View style={styles.quickChipsContainer}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickChipsScroll}>
                  <TouchableOpacity
                    activeOpacity={0.75}
                    style={styles.quickChipRepeat}
                    onPress={handleRepeatPreviousSet}
                  >
                    <Ionicons name="flash" size={12} color="#a599ff" />
                    <Text style={styles.quickChipTextHighlight}>
                      {activeSetIndex > 0 ? `Same as Set ${activeSetIndex}` : 'Match Target'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.75}
                    style={styles.quickChip}
                    onPress={() => handleAdjustWeight(2.5)}
                  >
                    <Text style={styles.quickChipText}>+2.5 kg</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.75}
                    style={styles.quickChip}
                    onPress={() => handleAdjustWeight(5)}
                  >
                    <Text style={styles.quickChipText}>+5 kg</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.75}
                    style={styles.quickChip}
                    onPress={() => handleAdjustWeight(-2.5)}
                  >
                    <Text style={styles.quickChipText}>-2.5 kg</Text>
                  </TouchableOpacity>

                  <View style={styles.quickChipDivider} />

                  <TouchableOpacity
                    activeOpacity={0.75}
                    style={styles.quickChip}
                    onPress={() => handleAdjustReps(1)}
                  >
                    <Text style={styles.quickChipText}>+1 Rep</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.75}
                    style={styles.quickChip}
                    onPress={() => handleAdjustReps(2)}
                  >
                    <Text style={styles.quickChipText}>+2 Reps</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.75}
                    style={styles.quickChip}
                    onPress={() => handleAdjustReps(-1)}
                  >
                    <Text style={styles.quickChipText}>-1 Rep</Text>
                  </TouchableOpacity>
                </ScrollView>
              </View>
            )}

            {exercise.setsLog.map((set, idx) => {
              const isActive = idx === activeSetIndex;
              const inputState = setInputs[idx] || { weight: '', reps: '' };
              const setWeightStr = (set.weight !== null && set.weight !== undefined && Number(set.weight) > 0) ? String(set.weight) : '';
              const setRepsStr = (set.reps !== null && set.reps !== undefined && Number(set.reps) > 0) ? String(set.reps) : '';

              const isInputReady = setInputs.length > idx;
              const displayWeight = set.completed
                ? (setWeightStr || inputState.weight || '')
                : (isInputReady ? inputState.weight : (setWeightStr || ''));

              const displayReps = set.completed
                ? (setRepsStr || inputState.reps || '')
                : (isInputReady ? inputState.reps : (setRepsStr || ''));

              return (
                <SwipeableSetRow
                  key={`set-${idx}`}
                  set={set}
                  idx={idx}
                  isActive={isActive}
                  isCompleted={!!set.completed}
                  displayWeight={displayWeight}
                  displayReps={displayReps}
                  colors={colors}
                  isDark={isDark}
                  styles={styles}
                  onTextChange={(field, text) => handleTextChange(idx, field, text)}
                  onBlur={() => handleBlur(idx)}
                  onToggleComplete={() => handleToggleSetComplete(idx)}
                  onLongPress={() => handleDeleteSet(idx)}
                  onSwipeComplete={() => handleSwipeCompleteSet(idx)}
                />
              );
            })}

            <TouchableOpacity onPress={handleAddSet} style={styles.addSetBtn}>
              <Text style={styles.addSetBtnText}>+ Add Set</Text>
            </TouchableOpacity>

            {/* G8: Workout Notes */}
            <View style={{ marginTop: 20, marginBottom: 8 }}>
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}
                onPress={() => {
                  hapticLight();
                  setShowNotesInput(prev => !prev);
                }}
              >
                <Ionicons name={showNotesInput ? "remove" : "add"} size={16} color={colors.textMuted} />
                <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 11, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>Session Notes</Text>
              </TouchableOpacity>
              
              {showNotesInput && (
                <TextInput
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.05)',
                    borderRadius: RADIUS.md,
                    borderWidth: 1,
                    borderColor: workoutNotes ? 'rgba(165,153,255,0.3)' : 'rgba(255,255,255,0.08)',
                    padding: 12,
                    color: colors.textPrimary,
                    fontFamily: FONT_FAMILY.body,
                    fontSize: 14,
                    minHeight: 80,
                    textAlignVertical: 'top',
                  }}
                  placeholder="How did this session feel? Any notes on form, energy, or PRs..."
                  placeholderTextColor={colors.textMuted}
                  multiline
                  value={workoutNotes}
                  onChangeText={setWorkoutNotes}
                  onBlur={() => updateNotes(workoutNotes)}
                />
              )}
            </View>

            <TouchableOpacity
              style={styles.mainBtnWrapper}
              activeOpacity={0.8}
              onPress={isAllComplete ? handleNextExercise : handleLogSet}
            >
              <View style={[styles.mainBtn, isAllComplete ? styles.mainBtnComplete : styles.mainBtnIncomplete]}>
                <Text style={styles.mainBtnText}>
                  {isAllComplete ? (activeExIndex === exercises.length - 1 ? 'Finish Workout' : "It's done, let's go!") : 'Log set & start rest'}
                </Text>
                <Ionicons
                  name={isAllComplete ? 'arrow-forward' : 'stopwatch-outline'}
                  size={20}
                  color={isAllComplete ? colors.background : colors.textPrimary}
                  style={{ marginLeft: 8 }}
                />
              </View>
            </TouchableOpacity>

          </ScrollView>
        </View>

        {/* Sticky Rest Timer Overlay — Placed cleanly exactly 2px above the bottom nav bar */}
        {(restTimerStartTime && restTimerDurationSecs) ? (
          <View style={{ position: 'absolute', bottom: 90, left: 0, right: 0, alignItems: 'center', zIndex: 9999 }} pointerEvents="box-none">
            <AnimatedRestTimer
              startTime={restTimerStartTime}
              durationSecs={restTimerDurationSecs}
              onAdd={() => setRestTimerDuration(restTimerInitial + 30)}
              onSubtract={() => setRestTimerDuration(Math.max(10, restTimerInitial - 30))}
              onSkip={() => clearRestTimer()}
            />
          </View>
        ) : null}

        {/* PR Celebration Overlay */}
        {showPR && (
          <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
            <ConfettiCannon count={100} origin={{ x: -10, y: 0 }} />
            <View style={{ position: 'absolute', top: '20%', width: '100%', alignItems: 'center' }}>
              <View style={{ backgroundColor: colors.accentPrimary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 30, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10 }}>
                <Text style={{ color: '#000', fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.lg }}>≡ƒÄë New Personal Record!</Text>
              </View>
            </View>
          </View>
        )}

        {/* G6: Superset Modal */}
        {showSupersetPicker && (
          <Modal transparent animationType="slide" onRequestClose={() => setShowSupersetPicker(false)}>
            <View style={styles.modalOverlay}>
              <View style={[styles.modalContent, { maxHeight: '75%' }]}>
                <View style={styles.modalHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="git-merge-outline" size={20} color="#ff9f4d" />
                    <Text style={styles.modalTitle}>Superset Grouping</Text>
                  </View>
                  <TouchableOpacity onPress={() => setShowSupersetPicker(false)}>
                    <Ionicons name="close" size={24} color={colors.textPrimary} />
                  </TouchableOpacity>
                </View>

                <Text style={styles.modalSubtitle}>Pair this exercise with another to use a fast 30s active rest timer.</Text>

                <ScrollView style={{ marginTop: 16 }} showsVerticalScrollIndicator={false}>
                  {exercise.supersetGroup && (
                    <TouchableOpacity
                      style={{
                        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                        backgroundColor: 'rgba(255,69,58,0.1)', padding: 16, borderRadius: RADIUS.lg,
                        borderWidth: 1, borderColor: 'rgba(255,69,58,0.3)', marginBottom: 12,
                      }}
                      onPress={() => {
                        hapticLight();
                        const newEx = { ...exercise, supersetGroup: undefined };
                        updateExercise(realExerciseIndex, newEx);
                        setShowSupersetPicker(false);
                      }}
                    >
                      <Ionicons name="unlink-outline" size={16} color="#FF453A" style={{ marginRight: 8 }} />
                      <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 14, color: '#FF453A' }}>Remove from Superset</Text>
                    </TouchableOpacity>
                  )}

                  {exercises.filter(e => e.exerciseId !== exercise.exerciseId).map((altEx, idx) => {
                    const isPartner = altEx.supersetGroup && altEx.supersetGroup === exercise.supersetGroup;
                    return (
                      <TouchableOpacity
                        key={idx}
                        style={{
                          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                          backgroundColor: isPartner ? 'rgba(255,159,77,0.1)' : '#161618',
                          borderRadius: RADIUS.lg, padding: SPACE.md, marginBottom: SPACE.sm,
                          borderWidth: 1, borderColor: isPartner ? '#ff9f4d' : 'rgba(255,255,255,0.06)',
                        }}
                        activeOpacity={0.7}
                        onPress={() => {
                          hapticSuccess();
                          // Assign a random letter group if one doesn't exist, else use existing
                          const groupLetter = exercise.supersetGroup || altEx.supersetGroup || String.fromCharCode(65 + Math.floor(Math.random() * 26));
                          
                          // Update current exercise
                          updateExercise(realExerciseIndex, { ...exercise, supersetGroup: groupLetter });
                          
                          // Update partner exercise (we need its real index)
                          const partnerRealIdx = log.exercises.findIndex(e => e.exerciseId === altEx.exerciseId);
                          if (partnerRealIdx !== -1) {
                            updateExercise(partnerRealIdx, { ...altEx, supersetGroup: groupLetter });
                          }
                          
                          setShowSupersetPicker(false);
                        }}
                      >
                        <View style={{ flex: 1, paddingRight: 8 }}>
                          <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 15, color: isPartner ? '#ff9f4d' : '#ffffff', marginBottom: 4 }}>
                            {altEx.name}
                          </Text>
                          <Text style={{ fontFamily: FONT_FAMILY.body, fontSize: 12, color: colors.textMuted }}>
                            {altEx.muscle}  •  {altEx.targetSets} Sets
                          </Text>
                        </View>
                        {isPartner && <Ionicons name="checkmark-circle" size={24} color="#ff9f4d" />}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            </View>
          </Modal>
        )}

        {/* Swap Modal */}
        {showSwapModal && (
          <Modal transparent animationType="slide" onRequestClose={() => setShowSwapModal(false)}>
            <View style={styles.modalOverlay}>
              <View style={[styles.modalContent, { maxHeight: '85%' }]}>
                <View style={styles.modalHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="sparkles" size={18} color="#a599ff" />
                    <Text style={styles.modalTitle}>S.A.R.A AI Exercise Swap</Text>
                  </View>
                  <TouchableOpacity onPress={() => setShowSwapModal(false)}>
                    <Ionicons name="close" size={24} color={colors.textPrimary} />
                  </TouchableOpacity>
                </View>

                <Text style={styles.modalSubtitle}>
                  Alternatives for {resolveExerciseTargetMuscle(exercise.name, exercise.muscle).targetMuscle}
                </Text>

                {isAiSwapLoading && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 8, paddingHorizontal: 4 }}>
                    <ActivityIndicator size="small" color="#a599ff" />
                    <Text style={{ fontSize: 12, color: '#a599ff', fontFamily: FONT_FAMILY.bold }}>Finding alternatives...</Text>
                  </View>
                )}

                <ScrollView style={{ marginTop: 12 }} showsVerticalScrollIndicator={false}>
                  {aiSwapList.map((alt: any, idx: number) => (
                    <TouchableOpacity
                      key={idx}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        backgroundColor: '#161618',
                        borderRadius: RADIUS.lg,
                        padding: SPACE.md,
                        marginBottom: SPACE.sm,
                        borderWidth: 1,
                        borderColor: alt.isFromTemplate ? 'rgba(165,153,255,0.25)' : 'rgba(255,255,255,0.06)',
                      }}
                      activeOpacity={0.75}
                      onPress={async () => {
                        const oldName = exercise.name;
                        hapticSuccess();
                        
                        let resolvedVideoId = alt.videoId;
                        if (!resolvedVideoId) {
                          resolvedVideoId = (await autoResolveExerciseVideoId(alt.name)) || '';
                        }

                        const updatedEx = {
                          ...exercise,
                          exerciseId: `swap_${Date.now()}_${idx}`,
                          name: alt.name,
                          muscle: alt.muscle || exercise.muscle,
                          targetSets: alt.targetSets || 3,
                          targetReps: alt.targetReps || '8-12',
                          restTimeSecs: alt.restTimeSecs || 90,
                          videoId: resolvedVideoId,
                          setsLog: Array.from({ length: alt.targetSets || 3 }, (_, i) => ({
                            setNumber: i + 1,
                            reps: null,
                            weight: null,
                            completed: false,
                          })),
                        };
                        
                        updateExercise(realExerciseIndex, updatedEx);
                        setShowSwapModal(false);
                        Alert.alert(
                          'Keep Swap Permanent?',
                          `Do you want to use ${alt.name} for future workouts?`,
                          [
                            { text: 'No, just for today', style: 'cancel' },
                            { text: 'Yes, update plan', onPress: () => makeSwapPermanent(oldName, alt.name, alt.videoId) }
                          ]
                        );
                      }}
                    >
                      <View style={{ flex: 1, paddingRight: 8 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                          <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 15, color: '#ffffff' }}>
                            {alt.name}
                          </Text>
                          {alt.isFromTemplate && (
                            <View style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 4,
                              backgroundColor: 'rgba(165,153,255,0.12)',
                              paddingHorizontal: 6,
                              paddingVertical: 2,
                              borderRadius: 6,
                              borderWidth: 1,
                              borderColor: 'rgba(165,153,255,0.25)',
                            }}>
                              <Ionicons name="calendar-outline" size={10} color="#a599ff" />
                              <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 9.5, color: '#a599ff' }}>
                                {alt.dayName || 'Template'}
                              </Text>
                            </View>
                          )}
                        </View>
                        <Text style={{ fontFamily: FONT_FAMILY.body, fontSize: 12, color: colors.textMuted }}>
                          {alt.targetSets} Sets × {alt.targetReps} Reps  •  {alt.restTimeSecs}s Rest
                        </Text>
                      </View>

                      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>
          </Modal>
        )}

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: any, isDark: boolean = true) => StyleSheet.create({
      root: { flex: 1, backgroundColor: isDark ? '#000000' : colors.background },
      header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: SPACE.xl,
        paddingTop: Platform.OS === 'android' ? (RNStatusBar.currentHeight || 40) + 8 : 12,
        paddingBottom: SPACE.sm,
        borderBottomWidth: 1,
        borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : colors.border,
      },
      backBtn: { padding: SPACE.xs },
      headerTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 13, color: colors.textMuted, letterSpacing: 1 },
      content: { flex: 1 },
      scrollContent: { padding: SPACE.xl, paddingBottom: 190 },

      titleArea: { marginBottom: SPACE.xl, alignItems: 'center' },
      musclePill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, marginBottom: 12 },
      muscleDot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
      muscleText: { fontFamily: FONT_FAMILY.bold, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 },
      exerciseName: { fontFamily: FONT_FAMILY.bold, fontSize: 20, color: colors.textPrimary, marginBottom: 4, textAlign: 'center', flexShrink: 1 },
      lastTimeText: { fontFamily: FONT_FAMILY.body, fontSize: 13, color: colors.textMuted, marginTop: 4 },
      overloadChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.md, marginTop: 12, gap: 6 },
      overloadChipText: { fontFamily: FONT_FAMILY.medium, fontSize: 12 },

      quickChipsContainer: {
        marginBottom: SPACE.md,
        marginHorizontal: -SPACE.xl,
        paddingHorizontal: SPACE.xl,
      },
      quickChipsScroll: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 2,
      },
      quickChipRepeat: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: 'rgba(165,153,255,0.14)',
        borderWidth: 1,
        borderColor: 'rgba(165,153,255,0.32)',
        paddingHorizontal: 11,
        paddingVertical: 6,
        borderRadius: RADIUS.full,
      },
      quickChipTextHighlight: {
        fontFamily: FONT_FAMILY.bold,
        fontSize: 11.5,
        color: '#a599ff',
      },
      quickChip: {
        backgroundColor: isDark ? '#1C1C1E' : colors.surface2,
        borderWidth: 1,
        borderColor: isDark ? 'rgba(255,255,255,0.08)' : colors.border,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: RADIUS.full,
      },
      quickChipText: {
        fontFamily: FONT_FAMILY.bold,
        fontSize: 11.5,
        color: colors.textPrimary,
      },
      quickChipDivider: {
        width: 1,
        height: 16,
        backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : colors.border,
        marginHorizontal: 2,
      },

      swipeTrack: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(52,199,89,0.15)',
        borderWidth: 1,
        borderColor: 'rgba(52,199,89,0.3)',
        borderRadius: RADIUS.md,
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: SPACE.md,
      },
      swipeTrackContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
      },
      swipeTrackText: {
        fontFamily: FONT_FAMILY.bold,
        fontSize: 12,
        color: '#34C759',
      },

      setRowWrapper: {
        marginBottom: 8,
        borderRadius: RADIUS.md,
        overflow: 'hidden',
        position: 'relative',
      },
      setRowWrapperActive: {
        paddingLeft: 4,
      },
      activeIndicator: {
        position: 'absolute',
        left: 0,
        top: 0,
        bottom: 0,
        width: 4,
        backgroundColor: colors.accentPrimary,
      },
      setRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 8,
        paddingHorizontal: SPACE.md,
        backgroundColor: isDark ? '#1C1C1E' : colors.surface,
        borderRadius: RADIUS.md,
        borderWidth: 1,
        borderColor: isDark ? 'rgba(255,255,255,0.05)' : colors.border,
        shadowColor: isDark ? '#000000' : 'rgba(0,0,0,0.03)',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
        elevation: 1,
      },
      setRowActive: {
        backgroundColor: isDark ? '#2C2C2E' : '#F0EFF7',
        borderTopLeftRadius: 0,
        borderBottomLeftRadius: 0,
        borderColor: colors.accentPrimary,
      },
      setRowCompleted: {
        backgroundColor: isDark ? 'transparent' : 'rgba(5, 150, 105, 0.04)',
        borderColor: isDark ? 'transparent' : colors.border,
      },
      setIndexArea: { width: 32, alignItems: 'center', justifyContent: 'center' },
      setIndexText: { fontFamily: FONT_FAMILY.bold, fontSize: 15, color: colors.textMuted },
      inputGroup: { flex: 1, marginHorizontal: 6, position: 'relative' },
      fakePlaceholder: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
      },
      fakePlaceholderText: {
        color: colors.textMuted,
        fontFamily: FONT_FAMILY.bold,
        fontSize: 16,
      },
      textInput: {
        backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : colors.surface2,
        borderRadius: RADIUS.sm,
        height: 44,
        paddingVertical: 0,
        fontFamily: FONT_FAMILY.bold,
        fontSize: 16,
        color: colors.textPrimary,
        textAlign: 'center',
        borderWidth: isDark ? 0 : 1,
        borderColor: colors.border,
      },

      addSetBtn: {
        alignSelf: 'center',
        paddingVertical: SPACE.md,
        paddingHorizontal: SPACE.xl,
        marginTop: SPACE.sm,
      },
      addSetBtnText: { fontFamily: FONT_FAMILY.bold, fontSize: 13, color: colors.accentPrimary },
      videoBtn: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#a599ff',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#a599ff',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.35,
        shadowRadius: 5,
        elevation: 3,
      },
      videoBtnActive: {
        backgroundColor: isDark ? 'rgba(255,255,255,0.15)' : colors.surface2,
        shadowOpacity: 0,
        elevation: 0,
        borderWidth: 1,
        borderColor: isDark ? 'rgba(255,255,255,0.2)' : colors.border,
      },
      videoContainer: { borderRadius: RADIUS.md, overflow: 'hidden', marginBottom: SPACE.xl },

      mainBtnWrapper: { marginTop: SPACE.md, ...SHADOW.lg },
      mainBtn: {
        flexDirection: 'row',
        borderRadius: RADIUS.lg,
        paddingVertical: 14,
        alignItems: 'center',
        justifyContent: 'center',
      },
      mainBtnComplete: { backgroundColor: isDark ? '#34C759' : colors.accentGreen },
      mainBtnIncomplete: { backgroundColor: isDark ? '#0c0c0f' : colors.surface, borderWidth: 1, borderColor: isDark ? '#1c1c20' : colors.border },
      mainBtnText: { fontFamily: FONT_FAMILY.bold, fontSize: 15, color: colors.textPrimary },

      modalOverlay: { flex: 1, backgroundColor: isDark ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
      modalContent: { backgroundColor: isDark ? '#000000' : (colors.surfaceRaised || colors.surface), borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '80%', borderWidth: 1, borderColor: isDark ? '#1c1c20' : colors.border },
      modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
      modalTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 20, color: colors.textPrimary },
      modalSubtitle: { fontFamily: FONT_FAMILY.body, fontSize: 13, color: colors.textMuted, marginTop: 4 },
      altRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? '#0c0c0f' : (colors.surface2 || '#F0EFF7'), padding: 16, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: isDark ? '#1c1c20' : colors.border },
      altText: { flex: 1, fontFamily: FONT_FAMILY.bold, fontSize: 16, color: colors.textPrimary, marginLeft: 12 },
    });
