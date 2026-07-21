import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, TouchableOpacity, Alert, TextInput,
  Platform, KeyboardAvoidingView, ScrollView, Modal, ActivityIndicator
} from 'react-native';
import Reanimated, { FadeIn, FadeOut } from 'react-native-reanimated';
import ConfettiCannon from 'react-native-confetti-cannon';
import YoutubeIframe from 'react-native-youtube-iframe';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { FONT_FAMILY, SPACE, RADIUS, FONT_SIZE, SHADOW } from '../../theme/tokens';
import { useGymLog } from '../../hooks/useGymLog';
import { useMobileData } from '../../contexts/MobileDataContext';
import { resolveMuscleColor, hexToRgba, calculateExerciseMaxWeight, calculateExerciseAvgReps, calculateHistorical1RM } from '../../utils/gymUtils';
import { hapticLight, hapticMedium, hapticSuccess } from '../../utils/haptics';
import AnimatedRestTimer from '../../components/Gym/AnimatedRestTimer';
import { GYM_PLAN, EXERCISE_ALTERNATIVES } from '../../data/gymPlan';
import { getOverloadSuggestion, getRestDuration } from '../../services/progressiveOverload';
import { GymSet, GymNavigationParamList } from '../../types/gym.types';
import { useTheme } from "../../contexts/ThemeContext";

// ─── Per-set controlled input state ──────────────────────────────────────────
// BUG FIX #1: Instead of feeding the exercise's weight/reps directly into
// TextInput's `value` (which flickers whenever saveLog triggers a re-render),
// we maintain LOCAL input state per set. This local state is only updated from
// the exercise data on initial load or exercise change — never during typing.
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
    updateRestTimerDuration,
    restTimerStartTime,
    restTimerDurationSecs,
    restTimerInitial,
    swapExercise,
    makeSwapPermanent,
    logSetAndStartTimer,
    endWorkout,
  } = useGymLog(date);

  const [showPR, setShowPR] = useState(false);

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

  const { gymLogs } = useMobileData();

  // BUG FIX #1: Local controlled input state per set — decoupled from log state.
  // Initialised from exercise data, but never overwritten during typing.
  const [setInputs, setSetInputs] = useState<SetInputState[]>([]);
  const inputInitKey = useRef('');

  // Synchronise local input state when we switch to a different exercise
  // or when the exercise's set count changes (a set was added/removed).
  // We DO NOT sync when weight/reps change from Firestore — local state wins.
  useEffect(() => {
    if (!log?.exercises) return;
    const exercises = log.exercises.filter(ex => !ex.skipped);
    const safeIdx = Math.min(activeExIndex, Math.max(0, exercises.length - 1));
    const exercise = exercises[safeIdx];
    if (!exercise) return;

    // A key that uniquely identifies "which exercise and how many sets"
    const key = `${exercise.exerciseId}-${exercise.setsLog.length}-${activeExIndex}`;
    if (key === inputInitKey.current) return; // don't reset if the key hasn't changed

    inputInitKey.current = key;
    setSetInputs(exercise.setsLog.map(s => ({
      weight: s.weight !== null && s.weight !== undefined ? String(s.weight) : '',
      reps: s.reps !== null && s.reps !== undefined ? String(s.reps) : '',
    })));
  }, [log, activeExIndex]);

  // ─── Last-session banner ────────────────────────────────────────────────────
  // BUG FIX #4: Show lastSessionSets (pre-filled data) even before any set is
  // completed, so the user can see what they lifted last time immediately.
  const lastTimeData = useMemo(() => {
    if (!log?.exercises || !gymLogs) return null;
    const exercises = log.exercises.filter(ex => !ex.skipped);
    const safeIdx = Math.min(activeExIndex, Math.max(0, exercises.length - 1));
    const currentEx = exercises[safeIdx];
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

  // ─── Progressive overload suggestion ───────────────────────────────────────
  const overloadSuggestion = useMemo(() => {
    if (!log?.exercises || !gymLogs) return null;
    const activeExercises = log.exercises.filter((ex: any) => !ex.skipped);
    const currentExercise = activeExercises[Math.min(activeExIndex, Math.max(0, activeExercises.length - 1))];
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


  const exercises = log.exercises.filter(ex => !ex.skipped);
  const safeIndex = Math.min(activeExIndex, Math.max(0, exercises.length - 1));
  const exercise = exercises[safeIndex];

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

  // BUG FIX #1: handleTextChange only updates local input state — it does NOT
  // call updateExercise on every keystroke. The actual save happens onBlur
  // or when the user presses "Log Set", so the TextInput never gets reset mid-type.
  const handleTextChange = (setIdx: number, field: 'reps' | 'weight', text: string) => {
    setSetInputs(prev => {
      const next = [...prev];
      if (!next[setIdx]) next[setIdx] = { weight: '', reps: '' };
      next[setIdx] = { ...next[setIdx], [field]: text };
      return next;
    });
  };

  // Flush local input state into the exercise when user leaves a field
  const handleBlur = (setIdx: number) => {
    const input = setInputs[setIdx];
    if (!input) return;
    const newEx = {
      ...exercise,
      setsLog: exercise.setsLog.map((s, i) => {
        if (i !== setIdx) return s;
        const weight = input.weight === '' ? null : parseFloat(input.weight);
        const reps = input.reps === '' ? null : parseInt(input.reps, 10);
        return {
          ...s,
          weight: isNaN(weight as number) ? s.weight : weight,
          reps: isNaN(reps as number) ? s.reps : reps,
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

    const smartRestSecs = getRestDuration(exercise);

    if (weight !== null && reps !== null && weight > 0 && reps > 0) {
      const currentSet1RM = weight * (1 + (reps / 30));
      const historicalMax1RM = calculateHistorical1RM(gymLogs, exercise.exerciseId);
      
      if (currentSet1RM > historicalMax1RM && historicalMax1RM > 0) {
        setShowPR(true);
        setTimeout(() => setShowPR(false), 4500);
      }
    }

    logSetAndStartTimer(realExerciseIndex, newEx, smartRestSecs, exercise.name);
  };

  const handleNextExercise = () => {
    if (activeExIndex < exercises.length - 1) {
      hapticMedium();
      setActiveExIndex(activeExIndex + 1);
    } else {
      hapticSuccess();
      endWorkout();
      navigation.replace('WorkoutSummary');
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
    const newEx = {
      ...exercise,
      setsLog: [
        ...exercise.setsLog,
        { setNumber: exercise.setsLog.length + 1, reps: null, weight: null, completed: false },
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
          <ScrollView contentContainerStyle={styles.scrollContent}>

            <View style={styles.titleArea}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 12 }}>
                <View style={[styles.musclePill, { backgroundColor: hexToRgba(colors.accentPrimary, 0.15), marginBottom: 0 }]}>
                  <View style={[styles.muscleDot, { backgroundColor: colors.accentPrimary }]} />
                  <Text style={[styles.muscleText, { color: colors.accentPrimary }]}>{exercise.muscle}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => { hapticMedium(); setShowSwapModal(true); }}
                  style={[styles.musclePill, { backgroundColor: 'rgba(255,255,255,0.1)', marginBottom: 0, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center' }]}
                >
                  <Ionicons name="swap-horizontal" size={14} color={colors.textPrimary} />
                  <Text style={[styles.muscleText, { color: colors.textPrimary, marginLeft: 4 }]}>SWAP</Text>
                </TouchableOpacity>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                <Text style={styles.exerciseName}>{exercise.name}</Text>
                {exercise.videoId && (
                  <TouchableOpacity onPress={() => setShowVideo(!showVideo)} style={styles.videoBtn}>
                    <Ionicons name="play-circle" size={28} color={colors.accentPrimary} />
                  </TouchableOpacity>
                )}
              </View>

              {/* BUG FIX #4: Shows last session data immediately, even before sets are completed */}
              <Text style={styles.lastTimeText}>
                {lastTimeData ?? `Goal: ${exercise.targetSets} sets × ${exercise.targetReps} reps`}
              </Text>

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
                    {overloadSuggestion.type === 'increase' ? '▲' : '▼'} {overloadSuggestion.recommended}kg suggested · {overloadSuggestion.reason}
                  </Text>
                </Reanimated.View>
              )}
            </View>

            {showVideo && exercise.videoId && (
              <Reanimated.View entering={FadeIn.duration(300)} exiting={FadeOut.duration(200)} style={styles.videoContainer}>
                <YoutubeIframe
                  play={videoReady}
                  onReady={() => setVideoReady(true)}
                  forceAndroidAutoplay={true}
                  height={200}
                  videoId={exercise.videoId}
                  initialPlayerParams={{ modestbranding: true, autoplay: 1 }}
                />
              </Reanimated.View>
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

                    {/* BUG FIX #1: Controlled inputs with local state — no defaultValue */}
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
          <View style={{ position: 'absolute', bottom: 20, left: 16, right: 16, zIndex: 100 }}>
            <AnimatedRestTimer
              startTime={restTimerStartTime}
              durationSecs={restTimerDurationSecs}
              onAdd={() => updateRestTimerDuration(restTimerInitial + 30)}
              onSubtract={() => updateRestTimerDuration(Math.max(10, restTimerInitial - 30))}
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
                <Text style={{ color: '#000', fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.lg }}>🎉 New Personal Record!</Text>
              </View>
            </View>
          </View>
        )}

        {/* Swap Modal */}
        {showSwapModal && (
          <Modal transparent animationType="slide" onRequestClose={() => setShowSwapModal(false)}>
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Swap Exercise</Text>
                  <TouchableOpacity onPress={() => setShowSwapModal(false)}>
                    <Ionicons name="close" size={24} color={colors.textPrimary} />
                  </TouchableOpacity>
                </View>
                <Text style={styles.modalSubtitle}>Alternatives for {exercise.muscle}</Text>
                <ScrollView style={{ marginTop: 16 }}>
                  {(EXERCISE_ALTERNATIVES[(exercise.muscle ?? '') as keyof typeof EXERCISE_ALTERNATIVES] || []).map((alt: any, idx: number) => (
                    <TouchableOpacity
                      key={idx}
                      style={styles.altRow}
                      onPress={() => {
                        const oldName = exercise.name;
                        hapticSuccess();
                        swapExercise(realExerciseIndex, alt.name, alt.videoId);
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
                      <Ionicons name="barbell-outline" size={20} color={colors.textPrimary} />
                      <Text style={styles.altText}>{alt.name}</Text>
                      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                    </TouchableOpacity>
                  ))}
                  {(!EXERCISE_ALTERNATIVES[(exercise.muscle ?? '') as keyof typeof EXERCISE_ALTERNATIVES] || EXERCISE_ALTERNATIVES[(exercise.muscle ?? '') as keyof typeof EXERCISE_ALTERNATIVES].length === 0) && (
                    <Text style={styles.modalSubtitle}>No curated alternatives found for this muscle group.</Text>
                  )}
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
      scrollContent: { padding: SPACE.xl, paddingBottom: 160 },

      titleArea: { marginBottom: SPACE.xl, alignItems: 'center' },
      musclePill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, marginBottom: 12 },
      muscleDot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
      muscleText: { fontFamily: FONT_FAMILY.bold, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 },
      exerciseName: { fontFamily: FONT_FAMILY.bold, fontSize: 22, color: colors.textPrimary, marginBottom: 4, textAlign: 'center' },
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
