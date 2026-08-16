import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, TouchableOpacity, Alert, TextInput,
  Platform, KeyboardAvoidingView, ScrollView, Modal, ActivityIndicator, AppState
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
import { resolveMuscleColor, hexToRgba, calculateExerciseMaxWeight, calculateExerciseAvgReps, calculateHistorical1RM } from '../../utils/gymUtils';
import { hapticLight, hapticMedium, hapticSuccess } from '../../utils/haptics';
import { callProxy } from '../../services/geminiProxy';
import { autoResolveExerciseVideoId } from '../../services/exerciseVideoResolver';
import AnimatedRestTimer from '../../components/Gym/AnimatedRestTimer';
import { GYM_PLAN } from '../../data/gymPlan';
import { EXERCISE_DATABASE } from '../../data/exerciseDatabase';
import { getOverloadSuggestion, getRestDuration } from '../../services/progressiveOverload';
import { GymSet, GymNavigationParamList } from '../../types/gym.types';
import { useTheme } from "../../contexts/ThemeContext";

// ΓöÇΓöÇΓöÇ Per-set controlled input state ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
// BUG FIX #1: Instead of feeding the exercise's weight/reps directly into
// TextInput's `value` (which flickers whenever saveLog triggers a re-render),
// we maintain LOCAL input state per set. This local state is only updated from
// the exercise data on initial load or exercise change ΓÇö never during typing.
interface SetInputState {
  weight: string;
  reps: string;
}

export default function ActiveLoggingScreen() {
    const { colors, isDark } = useTheme();
    const styles = makeStyles(colors);
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

  // BUG FIX #1: Local controlled input state per set ΓÇö decoupled from log state.
  // Initialised from exercise data, but never overwritten during typing.
  const [setInputs, setSetInputs] = useState<SetInputState[]>([]);
  const [isRefreshingVideo, setIsRefreshingVideo] = useState(false);
  const inputInitKey = useRef('');

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

  // Superset partner exercise lookup
  const partnerExercise = useMemo(() => {
    if (!exercise?.supersetGroup) return null;
    return activeExercises.find(
      (e, i) => e.supersetGroup === exercise.supersetGroup && i !== safeIdx
    );
  }, [exercise?.supersetGroup, activeExercises, safeIdx]);

  // ΓöÇΓöÇΓöÇ Progressive overload suggestion ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
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
    if (!exercise) return;

    // A key that uniquely identifies "which exercise and how many sets"
    const key = `${exercise.exerciseId}-${exercise.setsLog.length}-${activeExIndex}`;
    if (key === inputInitKey.current) return; // don't reset if the key hasn't changed

    inputInitKey.current = key;
    setSetInputs(exercise.setsLog.map((s, idx) => {
      let initialWeight = s.weight !== null && s.weight !== undefined ? String(s.weight) : '';
      let initialReps = s.reps !== null && s.reps !== undefined ? String(s.reps) : '';

      // Auto pre-fill Progressive Overload suggestion for the first incomplete set
      if (idx === 0 && !s.completed && overloadSuggestion?.recommended) {
        if (!initialWeight || initialWeight === '0') initialWeight = String(overloadSuggestion.recommended);
        if (!initialReps || initialReps === '0') initialReps = String(parseInt(String(exercise.targetReps).split("-")[0], 10) || 8);
      }

      return {
        weight: initialWeight,
        reps: initialReps,
      };
    }));
  }, [exercise, activeExIndex, overloadSuggestion]);

  // Real-time S.A.R.A AI Swap generator for ActiveLoggingScreen modal
  useEffect(() => {
    if (!showSwapModal || !exercise) return;
    let isCancelled = false;

    const origName = exercise.name || 'Exercise';
    const rawMuscle = exercise.muscle || 'Chest';
    const inferredMuscle = (rawMuscle === 'None' || !rawMuscle)
      ? (origName.toLowerCase().includes('bicep') ? 'Biceps' : origName.toLowerCase().includes('tricep') ? 'Triceps' : origName.toLowerCase().includes('row') || origName.toLowerCase().includes('pull') ? 'Back' : origName.toLowerCase().includes('press') || origName.toLowerCase().includes('dip') ? 'Chest' : origName.toLowerCase().includes('squat') || origName.toLowerCase().includes('leg') ? 'Quads' : origName.toLowerCase().includes('shoulder') || origName.toLowerCase().includes('raise') ? 'Shoulders' : 'Chest')
      : rawMuscle;

    const origNameLower = origName.toLowerCase().trim();
    const muscleLower = inferredMuscle.toLowerCase();

    // 1. Find matching exercises from the workout template across all days
    const templateMatches: any[] = [];
    const seenNames = new Set<string>();
    seenNames.add(origNameLower);

    const DAY_NAMES: Record<number, string> = {
      1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday', 6: 'Saturday', 7: 'Sunday'
    };

    const daysToScan = GYM_PLAN;
    for (const d of daysToScan) {
      if (!d || !d.exercises) continue;
      const dayLabel = DAY_NAMES[d.dayIndex] ? `${DAY_NAMES[d.dayIndex]} (${d.name || d.subtitle || ''})` : (d.name || 'Routine Day');
      for (const ex of d.exercises) {
        const exName = (ex.name || '').trim();
        const exNameLower = exName.toLowerCase();
        if (!exName || seenNames.has(exNameLower)) continue;
        const exMuscleLower = (ex.muscle || '').toLowerCase();
        const isMatch = exMuscleLower === muscleLower ||
          (muscleLower.includes('tricep') && exMuscleLower.includes('tricep')) ||
          (muscleLower.includes('bicep') && (exMuscleLower.includes('bicep') || exMuscleLower.includes('brachialis'))) ||
          (muscleLower.includes('chest') && exMuscleLower.includes('chest')) ||
          (muscleLower.includes('back') && (exMuscleLower.includes('back') || exMuscleLower.includes('lat'))) ||
          (muscleLower.includes('delt') && (exMuscleLower.includes('delt') || exMuscleLower.includes('shoulder'))) ||
          (muscleLower.includes('quad') && exMuscleLower.includes('quad')) ||
          (muscleLower.includes('ham') && exMuscleLower.includes('ham')) ||
          (muscleLower.includes('calf') && (exMuscleLower.includes('calf') || exMuscleLower.includes('soleus'))) ||
          (muscleLower.includes('ab') && (exMuscleLower.includes('ab') || exMuscleLower.includes('core')));
        
        if (isMatch) {
          seenNames.add(exNameLower);
          templateMatches.push({
            name: exName,
            muscle: ex.muscle || inferredMuscle,
            targetSets: ex.targetSets || 3,
            targetReps: ex.targetReps || '8-12',
            restTimeSecs: (ex as any).restTimeSecs || 90,
            videoId: ex.videoId,
            isFromTemplate: true,
            dayName: dayLabel,
          });
        }
      }
    }

    // 2. Offline exercise database matches
    let alternativesList = EXERCISE_DATABASE.filter(db => db.muscle.toLowerCase() === muscleLower);
    if (alternativesList.length === 0) {
      alternativesList = EXERCISE_DATABASE.filter(db => 
        db.muscle.toLowerCase().includes(muscleLower) || 
        muscleLower.includes(db.muscle.toLowerCase())
      );
    }
    if (alternativesList.length === 0) {
      alternativesList = EXERCISE_DATABASE.filter(db => db.muscle.includes('Chest'));
    }
    
    const dbList = alternativesList
      .filter(alt => !seenNames.has(alt.name.toLowerCase().trim()))
      .slice(0, 6);

    setAiSwapList([]);
    setIsAiSwapLoading(true);

    async function loadAllSwaps() {
      try {
        const combined = [...templateMatches];
        for (const alt of dbList) {
          let vidId = (alt as any).videoId && (alt as any).videoId !== '1' ? (alt as any).videoId : undefined;
          if (!vidId) {
            vidId = (await autoResolveExerciseVideoId(alt.name)) || '';
          }
          combined.push({
            name: alt.name,
            muscle: inferredMuscle,
            targetSets: 3,
            targetReps: '8-12',
            restTimeSecs: 60,
            videoId: vidId,
            isFromTemplate: false,
          });
        }
        
        if (isCancelled) return;
        setAiSwapList(combined);
      } catch (e) {
        console.warn('[Swap Load] Error:', e);
      } finally {
        if (!isCancelled) setIsAiSwapLoading(false);
      }
    }

    loadAllSwaps();
    return () => { isCancelled = true; };
  }, [showSwapModal, exercise]);

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

    // First check if the hook pre-filled lastSessionSets from history
    if (currentEx.lastSessionSets && currentEx.lastSessionSets.length > 0) {
      const completed = currentEx.lastSessionSets.filter((s: any) => s.weight || s.reps);
      if (completed.length > 0) {
        const maxWeight = calculateExerciseMaxWeight(currentEx as any);
        const avgReps = calculateExerciseAvgReps(currentEx as any);
        return `Last time: ${completed.length} sets × ${avgReps} reps @ ${maxWeight}kg`;
      }
    }

    // Fall back to searching gym logs for completed sets
    const pastLogs = gymLogs
      .filter(l => l.date < date && l.exercises)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    for (const pLog of pastLogs) {
      const pastEx = pLog.exercises!.find(e => e.exerciseId === currentEx.exerciseId);
      if (pastEx?.setsLog?.length > 0) {
        const completedSets = pastEx.setsLog.filter((s: any) => s.completed);
        if (completedSets.length === 0) continue;

        const avgReps = calculateExerciseAvgReps(pastEx as any);
        const maxWeight = calculateExerciseMaxWeight(pastEx as any);
        return `Last time: ${completedSets.length} sets × ${avgReps} reps @ ${maxWeight}kg`;
      }
    }
    return null;
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

  // BUG FIX #2: Find the real array index in log.exercises (not the filtered list)
  // so updateExercise always gets the correct position even when some are skipped.
  // Use the stable _idx injected by useGymLog if available, otherwise fallback.
  const realExerciseIndex = exercise._idx !== undefined ? exercise._idx : log.exercises.findIndex(
    ex => ex.exerciseId === exercise.exerciseId && ex.name === exercise.name
  );

  const handleBack = () => {
    hapticMedium();
    navigation.goBack();
  };

  // SMART SET FORWARD AUTO-FILL:
  // When user types weight or reps in Set 1 (idx 0), auto-propagate forward to all uncompleted sets.
  const handleTextChange = (setIdx: number, field: 'reps' | 'weight', text: string) => {
    setSetInputs(prev => {
      const next = [...prev];
      if (!next[setIdx]) next[setIdx] = { weight: '', reps: '' };
      next[setIdx] = { ...next[setIdx], [field]: text };

      // Propagate forward from Set 1 (index 0) to all subsequent incomplete sets
      if (setIdx === 0 && exercise?.setsLog) {
        for (let i = 1; i < exercise.setsLog.length; i++) {
          if (!exercise.setsLog[i].completed) {
            if (!next[i]) next[i] = { weight: '', reps: '' };
            next[i] = { ...next[i], [field]: text };
          }
        }
      }

      return next;
    });
  };

  // Flush local input state into the exercise when user leaves a field
  const handleBlur = (_setIdx: number) => {
    const newEx = {
      ...exercise,
      setsLog: exercise.setsLog.map((s, i) => {
        const input = setInputs[i];
        if (!input) return s;
        const weight = input.weight === '' ? null : parseFloat(input.weight);
        const reps = input.reps === '' ? null : parseInt(input.reps, 10);
        return {
          ...s,
          weight: !isNaN(weight as number) && weight !== null ? weight : s.weight,
          reps: !isNaN(reps as number) && reps !== null ? reps : s.reps,
        };
      }),
    };
    updateExercise(realExerciseIndex, newEx);
  };

  const handleLogSet = () => {
    if (activeSetIndex === -1) return;
    hapticMedium();

    // Flush the active set's inputs before marking it complete
    const input = setInputs[activeSetIndex];
    const weight = input?.weight === '' ? null : parseFloat(input?.weight || '');
    const reps = input?.reps === '' ? null : parseInt(input?.reps || '', 10);

    const newEx = {
      ...exercise,
      setsLog: exercise.setsLog.map((s, i) => {
        if (i !== activeSetIndex) return s;
        return {
          ...s,
          weight: !isNaN(weight as number) && weight !== null ? weight : s.weight,
          reps: !isNaN(reps as number) && reps !== null ? reps : s.reps,
          completed: true,
        };
      }),
    };

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

  const handleNextExercise = () => {
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

  // BUG FIX #5: Toggle completion can now be undone. We flip the completed flag
  // and persist immediately through updateExercise.
  const handleToggleSetComplete = (setIdx: number) => {
    hapticLight();
    const newEx = {
      ...exercise,
      setsLog: exercise.setsLog.map((s, i) =>
        i === setIdx ? { ...s, completed: !s.completed } : s
      ),
    };
    updateExercise(realExerciseIndex, newEx);
  };

  return (
    <SafeAreaView style={styles.root}>
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
                  style={styles.videoBtn}
                >
                  <Ionicons name={showVideo ? "close-circle" : "play-circle"} size={26} color={colors.accentPrimary} />
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

            {exercise.setsLog.map((set, idx) => {
              const isActive = idx === activeSetIndex;
              const inputState = setInputs[idx] || { weight: '', reps: '' };

              return (
                <View key={`set-${idx}`} style={[styles.setRowWrapper, isActive && styles.setRowWrapperActive]}>
                  {isActive && <View style={styles.activeIndicator} />}

                  <View style={[styles.setRow, set.completed && styles.setRowCompleted, isActive && styles.setRowActive]}>
                    {/* BUG FIX #5: Tap to toggle completed, long-press to delete */}
                    <TouchableOpacity
                      onPress={() => set.completed ? handleToggleSetComplete(idx) : undefined}
                      onLongPress={() => handleDeleteSet(idx)}
                      style={styles.setIndexArea}
                    >
                      {set.completed ? (
                        <Ionicons name="checkmark-circle" size={20} color={colors.accentPrimary} />
                      ) : (
                        <Text style={[styles.setIndexText, isActive && { color: colors.accentPrimary }]}>{set.setNumber}</Text>
                      )}
                    </TouchableOpacity>

                    {/* BUG FIX #1: Controlled inputs with local state ΓÇö no defaultValue */}
                    <View style={styles.inputGroup}>
                      {inputState.weight === '' && (
                        <View style={styles.fakePlaceholder} pointerEvents="none">
                          <Text style={styles.fakePlaceholderText}>kg</Text>
                        </View>
                      )}
                      <TextInput
                        style={[styles.textInput, set.completed && { opacity: 0.5, color: colors.textMuted }]}
                        value={inputState.weight}
                        keyboardType="numeric"
                        editable={!set.completed}
                        onChangeText={(text) => handleTextChange(idx, 'weight', text)}
                        onBlur={() => handleBlur(idx)}
                      />
                    </View>

                    <View style={styles.inputGroup}>
                      {inputState.reps === '' && (
                        <View style={styles.fakePlaceholder} pointerEvents="none">
                          <Text style={styles.fakePlaceholderText}>reps</Text>
                        </View>
                      )}
                      <TextInput
                        style={[styles.textInput, set.completed && { opacity: 0.5, color: colors.textMuted }]}
                        value={inputState.reps}
                        keyboardType="numeric"
                        editable={!set.completed}
                        onChangeText={(text) => handleTextChange(idx, 'reps', text)}
                        onBlur={() => handleBlur(idx)}
                      />
                    </View>

                    <View style={{ width: 32 }} />
                  </View>
                </View>
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

        {/* Sticky Rest Timer Overlay ΓÇö Placed cleanly just a little above the bottom nav bar always */}
        {(restTimerStartTime && restTimerDurationSecs) ? (
          <View style={{ position: 'absolute', bottom: Platform.OS === 'ios' ? 112 : 98, left: 0, right: 0, alignItems: 'center', zIndex: 9999 }} pointerEvents="box-none">
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

                <Text style={styles.modalSubtitle}>Recommended Alternatives for {exercise.muscle}</Text>

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

const makeStyles = (colors: any) => StyleSheet.create({
      root: { flex: 1, backgroundColor: '#000000' },
      header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: SPACE.xl,
        paddingTop: Platform.OS === 'ios' ? 50 : 40,
        paddingBottom: SPACE.md,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
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

      setRowWrapper: {
        marginBottom: 8,
        borderRadius: RADIUS.md,
        overflow: 'hidden',
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
        backgroundColor: '#1C1C1E',
        borderRadius: RADIUS.md,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
      },
      setRowActive: {
        backgroundColor: '#2C2C2E',
        borderTopLeftRadius: 0,
        borderBottomLeftRadius: 0,
      },
      setRowCompleted: { backgroundColor: 'transparent', borderColor: 'transparent' },
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
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: RADIUS.sm,
        height: 44,
        paddingVertical: 0,
        fontFamily: FONT_FAMILY.bold,
        fontSize: 16,
        color: colors.textPrimary,
        textAlign: 'center',
      },

      addSetBtn: {
        alignSelf: 'center',
        paddingVertical: SPACE.md,
        paddingHorizontal: SPACE.xl,
        marginTop: SPACE.sm,
      },
      addSetBtnText: { fontFamily: FONT_FAMILY.bold, fontSize: 13, color: colors.textMuted },
      videoBtn: { padding: 4 },
      videoContainer: { borderRadius: RADIUS.md, overflow: 'hidden', marginBottom: SPACE.xl },

      mainBtnWrapper: { marginTop: SPACE.md, ...SHADOW.lg },
      mainBtn: {
        flexDirection: 'row',
        borderRadius: RADIUS.lg,
        paddingVertical: 14,
        alignItems: 'center',
        justifyContent: 'center',
      },
      mainBtnComplete: { backgroundColor: '#34C759' },
      mainBtnIncomplete: { backgroundColor: '#1C1C1E', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
      mainBtnText: { fontFamily: FONT_FAMILY.bold, fontSize: 15, color: colors.textPrimary },

      modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
      modalContent: { backgroundColor: '#1C1C1E', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '80%' },
      modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
      modalTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 20, color: colors.textPrimary },
      modalSubtitle: { fontFamily: FONT_FAMILY.body, fontSize: 13, color: colors.textMuted, marginTop: 4 },
      altRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#2C2C2E', padding: 16, borderRadius: 12, marginBottom: 12 },
      altText: { flex: 1, fontFamily: FONT_FAMILY.bold, fontSize: 16, color: colors.textPrimary, marginLeft: 12 },
    });
