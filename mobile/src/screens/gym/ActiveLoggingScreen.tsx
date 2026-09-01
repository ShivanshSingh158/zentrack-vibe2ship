import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View, Text, SafeAreaView, TouchableOpacity, Alert, TextInput,
  Platform, KeyboardAvoidingView, ScrollView, ActivityIndicator, AppState,
  Keyboard, DeviceEventEmitter
} from 'react-native';
import ConfettiCannon from 'react-native-confetti-cannon';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useKeepAwake } from 'expo-keep-awake';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FONT_FAMILY, SPACE, RADIUS, FONT_SIZE } from '../../theme/tokens';
import { useGymLog, todayStr } from '../../hooks/useGymLog';
import { useWellnessData } from '../../contexts/domains/WellnessContext';
import { useTheme } from '../../contexts/ThemeContext';
import { calculateExerciseMaxWeight, getPreviousExerciseSession, resolveExerciseTargetMuscle, getExerciseSwapAlternatives } from '../../utils/gymUtils';
import { hapticLight, hapticMedium, hapticSuccess } from '../../utils/haptics';
import { autoResolveExerciseVideoId } from '../../services/exerciseVideoResolver';
import { getOverloadSuggestion, getRestDuration } from '../../services/progressiveOverload';
import { GymNavigationParamList } from '../../types/gym.types';

// Extracted Sub-Components & Styles
import { makeActiveLoggingStyles } from './activeLoggingStyles';
import SwipeableSetRow from '../../components/Gym/SwipeableSetRow';
import ActiveExerciseHeader from '../../components/Gym/ActiveExerciseHeader';
import ActiveExerciseVideo from '../../components/Gym/ActiveExerciseVideo';
import ActiveQuickChips from '../../components/Gym/ActiveQuickChips';
import SupersetPickerModal from '../../components/Gym/SupersetPickerModal';
import ActiveSwapModal from '../../components/Gym/ActiveSwapModal';
import AnimatedRestTimer from '../../components/Gym/AnimatedRestTimer';
import { insertWarmupLadder } from '../../utils/warmupGenerator';
import { saveCachedLiveWorkoutData, updateLiveWorkoutWidget } from '../../services/widgetSyncService';
import { updateActiveWorkoutNotification, dismissActiveWorkoutNotification } from '../../services/activeWorkoutNotificationService';
import type { LiveWorkoutWidgetData } from '../../types/widget.types';

interface SetInputState {
  weight: string;
  reps: string;
}

// ─── Pure Helper: Parse Upper Circuit of Reps (e.g., "10-12" -> 12, "8-10" -> 10) ───
export function parseUpperTargetReps(targetRepsStr?: string | number | null): number {
  if (!targetRepsStr) return 10;
  const str = String(targetRepsStr).trim();
  if (str.includes('-')) {
    const parts = str.split('-');
    const upper = parseInt(parts[parts.length - 1].trim(), 10);
    if (!isNaN(upper) && upper > 0) return Math.min(50, upper);
  }
  const val = parseInt(str, 10);
  return !isNaN(val) && val > 0 ? Math.min(50, val) : 10;
}

// ─── Pure Helper: Resolve Set Weight & Reps across fallback tiers ─────────────
function resolveSetWeightAndReps(
  input?: SetInputState,
  currentSet?: any,
  prevInput?: SetInputState | null,
  prevSet?: any | null,
  overloadSuggestion?: any | null,
  targetRepsStr?: string,
  isWeightEdited?: boolean,
  isRepsEdited?: boolean
): { weight: number | null; reps: number | null } {
  // 1. Resolve Weight (Clamped 0 - 1000 kg)
  let weight: number | null = null;
  if (input?.weight !== '' && input?.weight !== undefined) {
    weight = parseFloat(input.weight);
  } else if (isWeightEdited) {
    weight = null;
  } else if (currentSet?.weight != null && Number(currentSet.weight) > 0) {
    weight = Number(currentSet.weight);
  } else if (prevInput?.weight !== '' && prevInput?.weight !== undefined) {
    weight = parseFloat(prevInput.weight);
  } else if (prevSet?.weight != null && Number(prevSet.weight) > 0) {
    weight = Number(prevSet.weight);
  } else if (overloadSuggestion?.recommended) {
    weight = Number(overloadSuggestion.recommended);
  }

  // 2. Resolve Reps (Clamped 1 - 50 reps, upper bound of ranges)
  let reps: number | null = null;
  if (input?.reps !== '' && input?.reps !== undefined) {
    reps = parseUpperTargetReps(input.reps);
  } else if (isRepsEdited) {
    reps = null;
  } else if (currentSet?.reps != null && Number(currentSet.reps) > 0) {
    reps = parseUpperTargetReps(currentSet.reps);
  } else if (prevInput?.reps !== '' && prevInput?.reps !== undefined) {
    reps = parseUpperTargetReps(prevInput.reps);
  } else if (prevSet?.reps != null && Number(prevSet.reps) > 0) {
    reps = parseUpperTargetReps(prevSet.reps);
  } else {
    reps = parseUpperTargetReps(targetRepsStr);
  }

  return {
    weight: weight !== null && !isNaN(weight) ? Math.min(1000, Math.max(0, weight)) : null,
    reps: reps !== null && !isNaN(reps) ? Math.min(50, Math.max(1, reps)) : 10,
  };
}

// ─── Pure Helper: Find next superset partner index with incomplete sets ────────
function findNextSupersetExerciseIndex(exercises: any[], currentIdx: number, supersetGroup?: string): number {
  if (!supersetGroup) return -1;
  const supersetIndices = exercises
    .map((ex, idx) => (ex.supersetGroup === supersetGroup ? idx : -1))
    .filter(idx => idx !== -1);

  if (supersetIndices.length <= 1) return -1;
  const currentIndexInGroup = supersetIndices.indexOf(currentIdx);

  for (let i = 1; i < supersetIndices.length; i++) {
    const checkIndex = supersetIndices[(currentIndexInGroup + i) % supersetIndices.length];
    const checkEx = exercises[checkIndex];
    if (checkEx?.setsLog?.some((s: any) => !s.completed)) {
      return checkIndex;
    }
  }
  return -1;
}

export default function ActiveLoggingScreen() {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeActiveLoggingStyles(colors, isDark), [colors, isDark]);
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

  const insets = useSafeAreaInsets();
  // Guarantee timer always floats cleanly above bottom navigation bar
  const timerBottomOffset = Math.max(insets.bottom + 68, 88);

  // Prevent phone screen from locking or sleeping during active workout
  useKeepAwake();

  const [showPR, setShowPR] = useState(false);
  const [workoutNotes, setWorkoutNotes] = useState(log?.notes || '');
  const [showNotesInput, setShowNotesInput] = useState(!!log?.notes);
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
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [aiSwapList, setAiSwapList] = useState<any[]>([]);
  const [isAiSwapLoading, setIsAiSwapLoading] = useState(false);
  const [isRefreshingVideo, setIsRefreshingVideo] = useState(false);
  const [showCompletedWarmups, setShowCompletedWarmups] = useState(false);

  useEffect(() => {
    setShowCompletedWarmups(false);
  }, [activeExIndex]);

  const { gymLogs } = useWellnessData();

  // Controlled input state per set
  const [setInputs, setSetInputs] = useState<SetInputState[]>([]);
  const userEditedFieldsRef = useRef<{ [idx: number]: { weight?: boolean; reps?: boolean } }>({});
  const lastExerciseKeyRef = useRef<string>('');
  const liveInputsRef = useRef<{ [idx: number]: { weight?: string; reps?: string } }>({});

  const activeExercises = useMemo(() => log?.exercises?.filter(ex => !ex.skipped) || [], [log]);
  const safeIdx = Math.min(activeExIndex, Math.max(0, activeExercises.length - 1));
  const exercise = activeExercises[safeIdx];

  // ── Sync Live Workout State with Android Home Screen Widget ───────────────
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    if (activeExercises && activeExercises.length > 0) {
      const currentEx = activeExercises[safeIdx] || activeExercises[0];
      const nextEx = activeExercises[safeIdx + 1];
      const completedSets = activeExercises.reduce(
        (sum, ex) => sum + (ex.setsLog || []).filter((s: any) => s.completed).length,
        0
      );
      const totalSets = activeExercises.reduce(
        (sum, ex) => sum + (ex.setsLog || []).length,
        0
      );

      const widgetData: LiveWorkoutWidgetData = {
        isActive: !log?.completed,
        splitTitle: log?.dayPlanIndex !== undefined ? `Routine • Ex ${safeIdx + 1}/${activeExercises.length}` : "Active Workout",
        workoutDurationMinutes: log?.workoutDurationMinutes,
        currentExerciseIndex: safeIdx,
        totalExercises: activeExercises.length,
        currentExercise: {
          id: currentEx.id || currentEx.name,
          name: currentEx.name,
          targetSets: currentEx.setsLog?.length || currentEx.targetSets || 4,
          currentSetIndex: (currentEx.setsLog || []).findIndex((s: any) => !s.completed) >= 0
            ? (currentEx.setsLog || []).findIndex((s: any) => !s.completed)
            : 0,
          sets: (currentEx.setsLog || []).map((s: any, idx: number) => ({
            setNumber: idx + 1,
            weight: Number(s.weight) || 0,
            reps: Number(s.reps) || 10,
            completed: Boolean(s.completed),
          })),
          targetWeight: Number(currentEx.setsLog?.[0]?.weight) || 20,
          targetReps: Number(currentEx.setsLog?.[0]?.reps) || 10,
        },
        nextExerciseName: nextEx?.name,
        completedSetsCount: completedSets,
        totalSetsCount: totalSets,
        lastUpdated: Date.now(),
      };

      saveCachedLiveWorkoutData(widgetData);
      updateLiveWorkoutWidget(widgetData);

      // Lock Screen Active Workout HUD Notification Sync
      if (!log?.completed) {
        const uncompletedSetIdx = (currentEx.setsLog || []).findIndex((s: any) => !s.completed);
        const curSet = uncompletedSetIdx >= 0 ? currentEx.setsLog[uncompletedSetIdx] : currentEx.setsLog[0];
        const targetWeight = Number(curSet?.weight) || Number(currentEx.setsLog?.[0]?.weight) || 20;
        const targetReps = Number(curSet?.reps) || 10;
        const isRestActive = Boolean(restTimerStartTime && restTimerDurationSecs);
        const restSecsRemaining = (isRestActive && restTimerDurationSecs && restTimerStartTime)
          ? Math.max(0, Math.ceil(restTimerDurationSecs - (Date.now() - restTimerStartTime) / 1000))
          : 0;

        updateActiveWorkoutNotification({
          exerciseName: currentEx.name,
          currentSet: (uncompletedSetIdx >= 0 ? uncompletedSetIdx : 0) + 1,
          totalSets: currentEx.setsLog?.length || 4,
          weight: targetWeight,
          reps: targetReps,
          isResting: isRestActive,
          restSecondsRemaining: restSecsRemaining,
          nextExerciseName: nextEx?.name,
        });
      }
    }
  }, [activeExercises, safeIdx, log?.completed, log?.workoutDurationMinutes, restTimerStartTime, restTimerDurationSecs]);

  // Clean up lock screen notification on unmount or workout completion
  useEffect(() => {
    return () => {
      dismissActiveWorkoutNotification();
    };
  }, []);

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

  // Progressive overload suggestion
  const overloadSuggestion = useMemo(() => {
    if (!log?.exercises || !gymLogs) return null;
    const activeList = log.exercises.filter((ex: any) => !ex.skipped);
    const cur = activeList[Math.min(activeExIndex, Math.max(0, activeList.length - 1))];
    if (!cur) return null;
    const curWeight = calculateExerciseMaxWeight(cur as any);
    return getOverloadSuggestion(
      cur,
      curWeight,
      cur.targetSets || 3,
      String(cur.targetReps || '8'),
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
        if (s.completed) {
          const savedW = (s.weight !== null && s.weight !== undefined && Number(s.weight) > 0) ? String(s.weight) : '';
          const savedR = (s.reps !== null && s.reps !== undefined && Number(s.reps) > 0) ? String(s.reps) : '';
          return {
            weight: savedW || prev?.[idx]?.weight || '',
            reps: savedR || prev?.[idx]?.reps || '',
          };
        }

        const edited = userEditedFieldsRef.current[idx];
        const existingWeight = prev?.[idx]?.weight;
        const existingReps = prev?.[idx]?.reps;
        const liveWeight = liveInputsRef.current[idx]?.weight;
        const liveReps = liveInputsRef.current[idx]?.reps;
        const lastSet = lastSessionSets[idx] || lastValidPastSet;

        let initialWeight = (s.weight !== null && s.weight !== undefined && Number(s.weight) > 0) ? String(s.weight) : '';
        if (!initialWeight && lastSet?.weight != null && Number(lastSet.weight) > 0) {
          initialWeight = String(lastSet.weight);
        }

        const defaultTargetReps = String(parseUpperTargetReps(exercise.targetReps));
        let initialReps = (s.reps !== null && s.reps !== undefined && Number(s.reps) > 0)
          ? String(parseUpperTargetReps(s.reps))
          : (lastSet?.reps ? String(parseUpperTargetReps(lastSet.reps)) : defaultTargetReps);

        return {
          weight: edited?.weight ? (liveWeight !== undefined ? liveWeight : (existingWeight || '')) : (initialWeight || existingWeight || ''),
          reps: edited?.reps ? (liveReps !== undefined ? liveReps : (existingReps || '')) : (initialReps || existingReps || ''),
        };
      });
    });
  }, [exercise?.exerciseId, exercise?.name, activeExIndex, exercise?.setsLog, gymLogs, overloadSuggestion, date]);

  // Load Instant Database Swaps on modal open
  useEffect(() => {
    if (!showSwapModal || !exercise) return;
    const swaps = getExerciseSwapAlternatives(exercise.name, exercise.muscle);
    setAiSwapList(swaps);
    setIsAiSwapLoading(false);
  }, [showSwapModal, exercise?.name, exercise?.muscle]);

  // Auto-resolve video ID
  useEffect(() => {
    if (!exercise) return;
    let isCancelled = false;

    autoResolveExerciseVideoId(exercise.name).then(resolvedId => {
      if (isCancelled || !resolvedId) return;
      if (exercise.videoId !== resolvedId) {
        updateExercise(realExerciseIndex, { ...exercise, videoId: resolvedId });
      }
    });

    return () => { isCancelled = true; };
  }, [exercise?.name, exercise?.videoId]);

  // Last-session stats banner text
  const lastTimeData = useMemo(() => {
    if (!log?.exercises || !gymLogs) return null;
    const list = log.exercises.filter(ex => !ex.skipped);
    const cur = list[Math.min(activeExIndex, Math.max(0, list.length - 1))];
    if (!cur) return null;

    const prevSession = getPreviousExerciseSession(cur.name, gymLogs, date || todayStr());
    if (!prevSession || prevSession.sets.length === 0) return null;

    const weightPart = prevSession.lastWeight ? `@ ${prevSession.lastWeight}kg` : '';
    const repsPart = prevSession.avgReps ? `${prevSession.avgReps} reps` : '';
    return `Last: ${prevSession.sets.length} sets ${repsPart ? `× ${repsPart}` : ''} ${weightPart}`.trim();
  }, [log, activeExIndex, gymLogs, date]);

  const activeSetIndex = exercise ? exercise.setsLog.findIndex(s => !s.completed) : -1;
  const isAllComplete = activeSetIndex === -1;

  const handleBack = useCallback(() => {
    hapticMedium();
    navigation.goBack();
  }, [navigation]);

  const handleRefreshVideo = useCallback(async () => {
    if (!exercise || isRefreshingVideo) return;
    hapticMedium();
    setIsRefreshingVideo(true);

    try {
      let freshVideoId = await autoResolveExerciseVideoId(exercise.name, true);
      if (!freshVideoId || freshVideoId === exercise.videoId) {
        freshVideoId = await autoResolveExerciseVideoId(`${exercise.name} exercise form tutorial`, true);
      }
      if (freshVideoId) {
        updateExercise(realExerciseIndex, { ...exercise, videoId: freshVideoId });
        hapticSuccess();
      }
    } catch (e) {
      console.warn('[Refresh Video] Error:', e);
    } finally {
      setIsRefreshingVideo(false);
    }
  }, [exercise, isRefreshingVideo, realExerciseIndex, updateExercise]);

  const handleTextChange = useCallback((setIdx: number, field: 'reps' | 'weight', text: string) => {
    let sanitized = text.trim();

    if (field === 'weight') {
      const num = parseFloat(sanitized);
      if (!isNaN(num) && num > 1000) {
        sanitized = '1000';
      }
    } else if (field === 'reps') {
      if (sanitized.includes('-')) {
        sanitized = String(parseUpperTargetReps(sanitized));
      } else {
        const num = parseInt(sanitized, 10);
        if (!isNaN(num) && num > 50) {
          sanitized = '50';
        }
      }
    }

    if (!userEditedFieldsRef.current[setIdx]) userEditedFieldsRef.current[setIdx] = {};
    userEditedFieldsRef.current[setIdx][field] = true;
    if (!liveInputsRef.current[setIdx]) liveInputsRef.current[setIdx] = {};
    liveInputsRef.current[setIdx][field] = sanitized;

    setSetInputs(prev => {
      const next = [...prev];
      const curSet = exercise?.setsLog?.[setIdx];
      const current = next[setIdx] || {
        weight: curSet?.weight != null ? String(curSet.weight) : '',
        reps: curSet?.reps != null ? String(curSet.reps) : ''
      };
      next[setIdx] = { ...current, [field]: sanitized };
      return next;
    });
  }, [exercise?.setsLog]);

  const handleBlur = useCallback((setIdx: number) => {
    if (!exercise) return;
    const input = setInputs[setIdx];
    const curSet = exercise.setsLog[setIdx];
    const isWeightEdited = userEditedFieldsRef.current[setIdx]?.weight;
    const isRepsEdited = userEditedFieldsRef.current[setIdx]?.reps;

    const resolved = resolveSetWeightAndReps(
      input,
      curSet,
      null,
      null,
      overloadSuggestion,
      exercise.targetReps,
      isWeightEdited,
      isRepsEdited
    );

    const newEx = {
      ...exercise,
      setsLog: exercise.setsLog.map((s, i) =>
        i === setIdx ? { ...s, weight: resolved.weight, reps: resolved.reps } : s
      ),
    };
    updateExercise(realExerciseIndex, newEx);
  }, [exercise, setInputs, overloadSuggestion, realExerciseIndex, updateExercise]);

  const handleLogSet = useCallback(() => {
    if (!exercise || activeSetIndex === -1) return;
    Keyboard.dismiss();
    hapticMedium();

    const currentSet = exercise.setsLog[activeSetIndex];
    const input = setInputs[activeSetIndex];
    const isWeightEdited = userEditedFieldsRef.current[activeSetIndex]?.weight;
    const isRepsEdited = userEditedFieldsRef.current[activeSetIndex]?.reps;

    const resolved = resolveSetWeightAndReps(
      input,
      currentSet,
      null,
      null,
      overloadSuggestion,
      exercise.targetReps,
      isWeightEdited,
      isRepsEdited
    );

    const newEx = {
      ...exercise,
      setsLog: exercise.setsLog.map((s, i) =>
        i === activeSetIndex ? { ...s, weight: resolved.weight, reps: resolved.reps, completed: true } : s
      ),
    };

    setSetInputs(prev => prev.map((inp, i) =>
      i === activeSetIndex ? { weight: resolved.weight !== null ? String(resolved.weight) : '', reps: String(resolved.reps) } : inp
    ));

    const nextJumpIdx = findNextSupersetExerciseIndex(exercises, activeExIndex, exercise.supersetGroup);
    const restSecs = nextJumpIdx !== -1 ? 30 : getRestDuration(exercise);

    logSetAndStartTimer(realExerciseIndex, newEx, restSecs, exercise.name);

    if (nextJumpIdx !== -1) {
      setTimeout(() => setActiveExIndex(nextJumpIdx), 400);
    }
  }, [exercise, activeSetIndex, setInputs, overloadSuggestion, exercises, activeExIndex, realExerciseIndex, logSetAndStartTimer]);

  const handleSwipeCompleteSet = useCallback((setIdx: number) => {
    if (!exercise) return;
    hapticSuccess();

    const currentSet = exercise.setsLog[setIdx];
    const input = setInputs[setIdx];
    const prevSet = setIdx > 0 ? exercise.setsLog[setIdx - 1] : null;
    const prevInput = setIdx > 0 ? setInputs[setIdx - 1] : null;

    const resolved = resolveSetWeightAndReps(
      input,
      currentSet,
      prevInput,
      prevSet,
      overloadSuggestion,
      exercise.targetReps
    );

    const newEx = {
      ...exercise,
      setsLog: exercise.setsLog.map((s, i) =>
        i === setIdx ? { ...s, weight: resolved.weight, reps: resolved.reps, completed: true } : s
      ),
    };

    setSetInputs(prev => prev.map((inp, i) =>
      i === setIdx ? { weight: resolved.weight !== null ? String(resolved.weight) : '', reps: String(resolved.reps) } : inp
    ));

    const nextJumpIdx = findNextSupersetExerciseIndex(exercises, activeExIndex, exercise.supersetGroup);
    const restSecs = nextJumpIdx !== -1 ? 30 : getRestDuration(exercise);

    logSetAndStartTimer(realExerciseIndex, newEx, restSecs, exercise.name);

    if (nextJumpIdx !== -1) {
      setTimeout(() => setActiveExIndex(nextJumpIdx), 400);
    }
  }, [exercise, setInputs, overloadSuggestion, exercises, activeExIndex, realExerciseIndex, logSetAndStartTimer]);

  const handleAdjustWeight = useCallback((delta: number) => {
    if (!exercise) return;
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

    const newWeight = Math.min(1000, Math.max(0, Math.round((baseWeight + delta) * 10) / 10));
    handleTextChange(targetIdx, 'weight', String(newWeight));
  }, [exercise, activeSetIndex, setInputs, overloadSuggestion, handleTextChange]);

  const handleAdjustReps = useCallback((delta: number) => {
    if (!exercise) return;
    const targetIdx = activeSetIndex !== -1 ? activeSetIndex : exercise.setsLog.length - 1;
    if (targetIdx < 0) return;
    hapticLight();

    const curSet = exercise.setsLog[targetIdx];
    const curInput = setInputs[targetIdx];
    const prevSet = targetIdx > 0 ? exercise.setsLog[targetIdx - 1] : null;

    let baseReps = 10;
    if (curInput?.reps !== '' && curInput?.reps !== undefined) {
      baseReps = parseUpperTargetReps(curInput.reps);
    } else if (curSet?.reps != null && Number(curSet.reps) > 0) {
      baseReps = parseUpperTargetReps(curSet.reps);
    } else if (prevSet?.reps != null && Number(prevSet.reps) > 0) {
      baseReps = parseUpperTargetReps(prevSet.reps);
    } else {
      baseReps = parseUpperTargetReps(exercise.targetReps);
    }

    const newReps = Math.min(50, Math.max(1, baseReps + delta));
    handleTextChange(targetIdx, 'reps', String(newReps));
  }, [exercise, activeSetIndex, setInputs, handleTextChange]);

  const handleRepeatPreviousSet = useCallback(() => {
    if (!exercise) return;
    const targetIdx = activeSetIndex !== -1 ? activeSetIndex : exercise.setsLog.length - 1;
    if (targetIdx < 0) return;
    hapticLight();

    const prevSet = targetIdx > 0 ? exercise.setsLog[targetIdx - 1] : null;
    const prevInput = targetIdx > 0 ? setInputs[targetIdx - 1] : null;

    let repWeight = '';
    if (prevInput?.weight) {
      repWeight = prevInput.weight;
    } else if (prevSet?.weight != null && Number(prevSet.weight) > 0) {
      repWeight = String(prevSet.weight);
    } else if (overloadSuggestion?.recommended) {
      repWeight = String(Math.min(1000, Number(overloadSuggestion.recommended)));
    }

    let repReps = '';
    if (prevInput?.reps) {
      repReps = String(parseUpperTargetReps(prevInput.reps));
    } else if (prevSet?.reps != null && Number(prevSet.reps) > 0) {
      repReps = String(parseUpperTargetReps(prevSet.reps));
    } else {
      // Match Target upper bound (e.g. 10-12 -> 12)
      repReps = String(parseUpperTargetReps(exercise.targetReps));
    }

    if (repWeight) handleTextChange(targetIdx, 'weight', repWeight);
    if (repReps) handleTextChange(targetIdx, 'reps', repReps);
  }, [exercise, activeSetIndex, setInputs, overloadSuggestion, handleTextChange]);

  const handleNextExercise = useCallback(() => {
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
  }, [activeExIndex, exercises.length, clearRestTimer, endWorkout, navigation, date]);

  const handleDeleteSet = useCallback((idx: number) => {
    if (!exercise) return;
    hapticLight();
    const newEx = {
      ...exercise,
      setsLog: exercise.setsLog.filter((_, i) => i !== idx).map((s, i) => ({ ...s, setNumber: i + 1 })),
    };
    updateExercise(realExerciseIndex, newEx);
    setSetInputs(prev => prev.filter((_, i) => i !== idx));
  }, [exercise, realExerciseIndex, updateExercise]);

  // Handle interactive lock screen notification actions (Done Set, Add Weight, Next Exercise, Skip Rest)
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('ACTIVE_WORKOUT_ACTION', (payload: any) => {
      if (payload.action === 'DONE_SET') {
        const targetIdx = activeSetIndex !== -1 ? activeSetIndex : 0;
        handleSwipeCompleteSet(targetIdx);
      } else if (payload.action === 'ADD_WEIGHT') {
        handleAdjustWeight(payload.delta || 2.5);
      } else if (payload.action === 'NEXT_EXERCISE') {
        handleNextExercise();
      } else if (payload.action === 'SKIP_REST') {
        clearRestTimer();
      } else if (payload.action === 'ADD_REST_SECONDS') {
        setRestTimerDuration(restTimerInitial + (payload.seconds || 30));
      }
    });
    return () => sub.remove();
  }, [activeSetIndex, handleSwipeCompleteSet, handleAdjustWeight, handleNextExercise, clearRestTimer, setRestTimerDuration, restTimerInitial]);

  const warmupSets = useMemo(() => exercise?.setsLog.filter(s => s.isWarmup) || [], [exercise?.setsLog]);
  const hasWarmups = warmupSets.length > 0;
  const allWarmupsCompleted = hasWarmups && warmupSets.every(s => s.completed);
  const hasAnyWarmupCompleted = hasWarmups && warmupSets.some(s => s.completed);

  const handleAutoWarmup = useCallback(() => {
    if (!exercise) return;
    hapticMedium();

    const existingWarmups = exercise.setsLog.filter(s => s.isWarmup);
    if (existingWarmups.length > 0) {
      // Toggle off / remove warmups
      const workingSetsOnly = exercise.setsLog.filter(s => !s.isWarmup).map((s, i) => ({
        ...s,
        setNumber: i + 1,
        isWarmup: false,
        warmupLabel: undefined,
      }));
      const newEx = {
        ...exercise,
        setsLog: workingSetsOnly,
      };
      updateExercise(realExerciseIndex, newEx);
      setSetInputs(workingSetsOnly.map(s => ({
        weight: (s.weight !== null && s.weight !== undefined && Number(s.weight) > 0) ? String(s.weight) : '',
        reps: (s.reps !== null && s.reps !== undefined && Number(s.reps) > 0) ? String(s.reps) : '',
      })));
      return;
    }

    // Determine target working weight
    let targetW = 40;
    const firstWorking = exercise.setsLog.find(s => !s.isWarmup && s.weight != null && Number(s.weight) > 0);
    if (firstWorking?.weight) {
      targetW = Number(firstWorking.weight);
    } else if (overloadSuggestion?.recommended) {
      targetW = Number(overloadSuggestion.recommended);
    } else if (exercise.lastSessionSets?.[0]?.weight) {
      targetW = Number(exercise.lastSessionSets[0].weight);
    }

    const updatedSets = insertWarmupLadder(exercise.setsLog, targetW);
    const newEx = {
      ...exercise,
      setsLog: updatedSets,
    };

    updateExercise(realExerciseIndex, newEx);
    setSetInputs(updatedSets.map(s => ({
      weight: (s.weight !== null && s.weight !== undefined && Number(s.weight) > 0) ? String(s.weight) : '',
      reps: (s.reps !== null && s.reps !== undefined && Number(s.reps) > 0) ? String(s.reps) : '',
    })));
  }, [exercise, overloadSuggestion, lastTimeData, realExerciseIndex, updateExercise]);

  const handleAddSet = useCallback(() => {
    if (!exercise) return;
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
          setNumber: exercise.setsLog.filter(s => !s.isWarmup).length + 1,
          reps: repsVal,
          weight: weightVal,
          completed: false,
        },
      ],
    };
    updateExercise(realExerciseIndex, newEx);
    setSetInputs(prev => [...prev, { weight: '', reps: '' }]);
  }, [exercise, setInputs, realExerciseIndex, updateExercise]);

  const handleToggleSetComplete = useCallback((setIdx: number) => {
    if (!exercise) return;
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
  }, [exercise, setInputs, realExerciseIndex, updateExercise]);

  // Loading skeleton
  if (!log || !log.exercises) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <View style={{ width: 120, height: 14, borderRadius: 7, backgroundColor: '#2C2C2E' }} />
          <View style={{ width: 32 }} />
        </View>
        <View style={{ alignItems: 'center', marginTop: 32, gap: 12 }}>
          <View style={{ width: 80, height: 24, borderRadius: 12, backgroundColor: '#2C2C2E' }} />
          <View style={{ width: 200, height: 28, borderRadius: 8, backgroundColor: '#2C2C2E' }} />
          <View style={{ width: 150, height: 14, borderRadius: 7, backgroundColor: '#1C1C1E' }} />
        </View>
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
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.navigate('ExerciseDetail', { exerciseId: exercise.exerciseId, date })}
          >
            <Ionicons name="ellipsis-horizontal" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>

        {/* Scrollable Content */}
        <View style={styles.content}>
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

            {/* Exercise Header Component */}
            <ActiveExerciseHeader
              exercise={exercise}
              partnerExercise={partnerExercise}
              overloadSuggestion={overloadSuggestion}
              lastTimeData={lastTimeData}
              showVideo={showVideo}
              activeSetIndex={activeSetIndex}
              isAllComplete={isAllComplete}
              onRepeatPrevious={handleRepeatPreviousSet}
              colors={colors}
              styles={styles}
              onSwapPress={() => {
                hapticMedium();
                setShowSwapModal(true);
              }}
              onSupersetPress={() => {
                hapticMedium();
                setShowSupersetPicker(true);
              }}
              onVideoToggle={() => {
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
              onSwitchToPartner={() => {
                hapticLight();
                const partnerIdx = activeExercises.findIndex(e => e.exerciseId === partnerExercise?.exerciseId);
                if (partnerIdx !== -1) setActiveExIndex(partnerIdx);
              }}
            />

            {/* Form Video Player Component */}
            {showVideo && (
              <ActiveExerciseVideo
                exercise={exercise}
                appState={appState}
                isRefreshingVideo={isRefreshingVideo}
                colors={colors}
                styles={styles}
                onRefreshVideo={handleRefreshVideo}
                onCloseVideo={() => setShowVideo(false)}
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
              />
            )}

            {/* Set Rows with Warmup / Working Phase Dividers */}
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

              const prevSet = idx > 0 ? exercise.setsLog[idx - 1] : null;
              const isFirstWarmup = set.isWarmup && idx === 0;
              const isFirstWorking = !set.isWarmup && (idx === 0 || !!prevSet?.isWarmup);

              // Auto-collapse completed warm-up sets
              if (set.isWarmup && allWarmupsCompleted && !showCompletedWarmups) {
                if (isFirstWarmup) {
                  return (
                    <TouchableOpacity
                      key="warmup-collapsed-summary"
                      activeOpacity={0.75}
                      onPress={() => {
                        hapticLight();
                        setShowCompletedWarmups(true);
                      }}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        backgroundColor: 'rgba(255, 159, 77, 0.08)',
                        borderColor: 'rgba(255, 159, 77, 0.22)',
                        borderWidth: 1,
                        borderRadius: RADIUS.md,
                        paddingHorizontal: 12,
                        paddingVertical: 7,
                        marginBottom: 8,
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Ionicons name="checkmark-circle" size={14} color="#ff9f4d" />
                        <Text style={{ fontFamily: FONT_FAMILY.medium, fontSize: 11.5, color: '#ff9f4d' }}>
                          Warm-up Completed ({warmupSets.length} {warmupSets.length === 1 ? 'set' : 'sets'})
                        </Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                        <Text style={{ fontFamily: FONT_FAMILY.regular, fontSize: 11, color: colors.textMuted }}>Show</Text>
                        <Ionicons name="chevron-down" size={12} color={colors.textMuted} />
                      </View>
                    </TouchableOpacity>
                  );
                }
                return null;
              }

              return (
                <React.Fragment key={`set-frag-${idx}`}>
                  {isFirstWarmup && (
                    <View style={[styles.phaseHeaderRow, allWarmupsCompleted && { justifyContent: 'space-between' }]}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                        <Ionicons name="layers-outline" size={13} color="#ff9f4d" />
                        <Text style={[styles.phaseHeaderText, { color: '#ff9f4d' }]}>WARM-UP SETS</Text>
                        <View style={styles.phaseHeaderLine} />
                      </View>
                      {allWarmupsCompleted && (
                        <TouchableOpacity
                          onPress={() => {
                            hapticLight();
                            setShowCompletedWarmups(false);
                          }}
                          style={{ paddingHorizontal: 6, paddingVertical: 2 }}
                        >
                          <Text style={{ fontFamily: FONT_FAMILY.medium, fontSize: 11, color: colors.textMuted }}>Hide</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                  {isFirstWorking && hasWarmups && (!allWarmupsCompleted || showCompletedWarmups) && (
                    <View style={styles.phaseHeaderRow}>
                      <Ionicons name="barbell-outline" size={13} color={colors.accentPrimary} />
                      <Text style={[styles.phaseHeaderText, { color: colors.accentPrimary }]}>WORKING SETS</Text>
                      <View style={styles.phaseHeaderLine} />
                    </View>
                  )}
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
                </React.Fragment>
              );
            })}

            {/* Set Actions: Balanced Clean Pills for Add Set & Auto Warm-up */}
            <View style={[styles.setActionsRow, hasAnyWarmupCompleted && { justifyContent: 'center' }]}>
              <TouchableOpacity
                onPress={handleAddSet}
                style={[styles.actionPillBtn, styles.actionPillPrimary, hasAnyWarmupCompleted && { flex: 0, paddingHorizontal: 24 }]}
                activeOpacity={0.75}
              >
                <Ionicons name="add" size={16} color={isDark ? '#a599ff' : colors.accentPrimary} />
                <Text style={styles.actionPillPrimaryText}>Add Set</Text>
              </TouchableOpacity>

              {/* Show Auto Warm-up if no warmups, or Remove Warm-up ONLY if none of the warmups are completed yet */}
              {!hasWarmups ? (
                <TouchableOpacity
                  onPress={handleAutoWarmup}
                  style={styles.actionPillBtn}
                  activeOpacity={0.75}
                >
                  <Ionicons name="layers-outline" size={15} color={colors.textSecondary} />
                  <Text style={styles.actionPillSecondaryText}>Auto Warm-up</Text>
                </TouchableOpacity>
              ) : !hasAnyWarmupCompleted ? (
                <TouchableOpacity
                  onPress={handleAutoWarmup}
                  style={[styles.actionPillBtn, styles.warmupBtnActive]}
                  activeOpacity={0.75}
                >
                  <Ionicons name="close-circle-outline" size={15} color="#ff9f4d" />
                  <Text style={styles.actionPillActiveText}>Remove Warm-up</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Main Action Button */}
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

        {/* Sticky Rest Timer Overlay (Always floating strictly above the Bottom Tab Bar) */}
        {(restTimerStartTime && restTimerDurationSecs) ? (
          <View
            style={{
              position: 'absolute',
              bottom: timerBottomOffset,
              left: 0,
              right: 0,
              alignItems: 'center',
              zIndex: 9999,
            }}
            pointerEvents="box-none"
          >
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
          <View style={{ ...styles.root, position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} pointerEvents="none">
            <ConfettiCannon count={100} origin={{ x: -10, y: 0 }} />
            <View style={{ position: 'absolute', top: '20%', width: '100%', alignItems: 'center' }}>
              <View style={{ backgroundColor: colors.accentPrimary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 30 }}>
                <Text style={{ color: '#000', fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.lg }}>🎉 New Personal Record!</Text>
              </View>
            </View>
          </View>
        )}

        {/* Superset Modal */}
        <SupersetPickerModal
          visible={showSupersetPicker}
          exercise={exercise}
          exercises={exercises}
          colors={colors}
          styles={styles}
          onClose={() => setShowSupersetPicker(false)}
          onRemoveSuperset={() => {
            updateExercise(realExerciseIndex, { ...exercise, supersetGroup: undefined });
            setShowSupersetPicker(false);
          }}
          onSelectPartner={(altEx) => {
            const groupLetter = exercise.supersetGroup || altEx.supersetGroup || String.fromCharCode(65 + Math.floor(Math.random() * 26));
            updateExercise(realExerciseIndex, { ...exercise, supersetGroup: groupLetter });
            const partnerRealIdx = log.exercises.findIndex((e: any) => e.exerciseId === altEx.exerciseId);
            if (partnerRealIdx !== -1) {
              updateExercise(partnerRealIdx, { ...altEx, supersetGroup: groupLetter });
            }
            setShowSupersetPicker(false);
          }}
        />

        {/* Swap Modal */}
        <ActiveSwapModal
          visible={showSwapModal}
          exercise={exercise}
          aiSwapList={aiSwapList}
          isAiSwapLoading={isAiSwapLoading}
          colors={colors}
          styles={styles}
          onClose={() => setShowSwapModal(false)}
          onSelectSwap={async (alt) => {
            const oldName = exercise.name;
            hapticSuccess();

            let resolvedVideoId = alt.videoId;
            if (!resolvedVideoId) {
              resolvedVideoId = (await autoResolveExerciseVideoId(alt.name)) || '';
            }

            const updatedEx = {
              ...exercise,
              exerciseId: `swap_${Date.now()}`,
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
        />

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
