import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View, Text, SafeAreaView, TouchableOpacity, Alert, TextInput,
  Platform, KeyboardAvoidingView, ScrollView, ActivityIndicator, AppState,
  Keyboard
} from 'react-native';
import ConfettiCannon from 'react-native-confetti-cannon';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

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

interface SetInputState {
  weight: string;
  reps: string;
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
  // 1. Resolve Weight
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

  // 2. Resolve Reps
  let reps: number | null = null;
  if (input?.reps !== '' && input?.reps !== undefined) {
    reps = parseInt(input.reps, 10);
  } else if (isRepsEdited) {
    reps = null;
  } else if (currentSet?.reps != null && Number(currentSet.reps) > 0) {
    reps = Number(currentSet.reps);
  } else if (prevInput?.reps !== '' && prevInput?.reps !== undefined) {
    reps = parseInt(prevInput.reps, 10);
  } else if (prevSet?.reps != null && Number(prevSet.reps) > 0) {
    reps = Number(prevSet.reps);
  } else {
    reps = parseInt(String(targetRepsStr || '8').split('-')[0], 10) || 8;
  }

  return {
    weight: weight !== null && !isNaN(weight) ? weight : null,
    reps: reps !== null && !isNaN(reps) ? reps : 8,
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

  const { gymLogs } = useWellnessData();

  // Controlled input state per set
  const [setInputs, setSetInputs] = useState<SetInputState[]>([]);
  const userEditedFieldsRef = useRef<{ [idx: number]: { weight?: boolean; reps?: boolean } }>({});
  const lastExerciseKeyRef = useRef<string>('');
  const liveInputsRef = useRef<{ [idx: number]: { weight?: string; reps?: string } }>({});

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

        const defaultTargetReps = String(parseInt(String(exercise.targetReps || '8-12').split('-')[0], 10) || 8);
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

  // Load AI Swaps on modal open
  useEffect(() => {
    if (!showSwapModal || !exercise) return;
    let isCancelled = false;
    const swaps = getExerciseSwapAlternatives(exercise.name, exercise.muscle);

    setAiSwapList([]);
    setIsAiSwapLoading(true);

    async function loadAllSwaps() {
      try {
        const enriched = await Promise.all(
          swaps.map(async (alt) => {
            let vidId = alt.videoId && alt.videoId !== '1' ? alt.videoId : undefined;
            if (!vidId) vidId = (await autoResolveExerciseVideoId(alt.name)) || '';
            return { ...alt, videoId: vidId };
          })
        );
        if (!isCancelled) setAiSwapList(enriched);
      } catch (e) {
        if (!isCancelled) setAiSwapList(swaps);
      } finally {
        if (!isCancelled) setIsAiSwapLoading(false);
      }
    }

    loadAllSwaps();
    return () => { isCancelled = true; };
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
    return `Last time: ${prevSession.sets.length} sets ${repsPart ? `× ${repsPart}` : ''} ${weightPart}`.trim();
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
    if (!userEditedFieldsRef.current[setIdx]) userEditedFieldsRef.current[setIdx] = {};
    userEditedFieldsRef.current[setIdx][field] = true;
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

    const newWeight = Math.max(0, Math.round((baseWeight + delta) * 10) / 10);
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
  }, [exercise, activeSetIndex, setInputs, handleTextChange]);

  const handleRepeatPreviousSet = useCallback(() => {
    if (!exercise) return;
    const targetIdx = activeSetIndex !== -1 ? activeSetIndex : exercise.setsLog.length - 1;
    if (targetIdx < 0) return;
    hapticLight();

    const prevSet = targetIdx > 0 ? exercise.setsLog[targetIdx - 1] : null;
    const prevInput = targetIdx > 0 ? setInputs[targetIdx - 1] : null;

    const repWeight = prevInput?.weight || (prevSet?.weight != null ? String(prevSet.weight) : (overloadSuggestion?.recommended ? String(overloadSuggestion.recommended) : ''));
    const repReps = prevInput?.reps || (prevSet?.reps != null ? String(prevSet.reps) : (String(exercise.targetReps || '8').split('-')[0] || '8'));

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
          setNumber: exercise.setsLog.length + 1,
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

            {/* Smart Quick-Fill Chips */}
            {!isAllComplete && (
              <ActiveQuickChips
                activeSetIndex={activeSetIndex}
                styles={styles}
                onRepeatPrevious={handleRepeatPreviousSet}
                onAdjustWeight={handleAdjustWeight}
                onAdjustReps={handleAdjustReps}
              />
            )}

            {/* Set Rows */}
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

            {/* Add Set Button */}
            <TouchableOpacity onPress={handleAddSet} style={styles.addSetBtn}>
              <Text style={styles.addSetBtnText}>+ Add Set</Text>
            </TouchableOpacity>

            {/* Session Notes */}
            <View style={{ marginTop: 20, marginBottom: 8 }}>
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}
                onPress={() => {
                  hapticLight();
                  setShowNotesInput(prev => !prev);
                }}
              >
                <Ionicons name={showNotesInput ? 'remove' : 'add'} size={16} color={colors.textMuted} />
                <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 11, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Session Notes
                </Text>
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

        {/* Sticky Rest Timer Overlay */}
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
