import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View, Text, SafeAreaView, TouchableOpacity, Alert, TextInput,
  Platform, KeyboardAvoidingView, ScrollView, ActivityIndicator, AppState,
  Keyboard, DeviceEventEmitter, InteractionManager
} from 'react-native';
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
import { awardXP } from '../../services/xpSystem';
import { playSetCompleteTone } from '../../services/gymSoundSynthesizer';
import { GymNavigationParamList } from '../../types/gym.types';

// Extracted Sub-Components & Styles
import { makeActiveLoggingStyles } from './activeLoggingStyles';
import SwipeableSetRow from '../../components/Gym/SwipeableSetRow';
import ActiveExerciseHeader from '../../components/Gym/ActiveExerciseHeader';
import ActiveExerciseVideo from '../../components/Gym/ActiveExerciseVideo';
import SupersetPickerModal from '../../components/Gym/SupersetPickerModal';
import ActiveSwapModal from '../../components/Gym/ActiveSwapModal';
import AnimatedRestTimer from '../../components/Gym/AnimatedRestTimer';
import { insertWarmupLadder } from '../../utils/warmupGenerator';
import { saveCachedLiveWorkoutData, updateLiveWorkoutWidget } from '../../services/widgetSyncService';
import { dismissActiveWorkoutNotification } from '../../services/activeWorkoutNotificationService';
import type { LiveWorkoutWidgetData } from '../../types/widget.types';

interface SetInputState {
  weight: string;
  reps: string;
}

// ─── Pure Helper: Parse Upper Circuit of Reps (e.g., "10-12" or "10–12" -> 12, "8-10" -> 10) ───
export function parseUpperTargetReps(targetRepsStr?: string | number | null): number {
  if (!targetRepsStr) return 10;
  const str = String(targetRepsStr).trim();
  if (/[-–—]/.test(str)) {
    const parts = str.split(/[-–—]/);
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

// ─── Extracted React.memo SetList Component ──────────────────────────────────
// Prevents all set rows and phase headers from re-evaluating on unrelated parent
// re-renders (such as the 1Hz rest-timer countdown, duration ticks, or video toggles).
interface SetListProps {
  setsLog: any[];
  activeSetIndex: number;
  setInputs: SetInputState[];
  allWarmupsCompleted: boolean;
  showCompletedWarmups: boolean;
  warmupSetsCount: number;
  hasWarmups: boolean;
  colors: any;
  isDark: boolean;
  styles: any;
  onSetAction: (idx: number, action: 'textChange' | 'blur' | 'toggle' | 'delete' | 'swipe', payload?: any) => void;
  onToggleShowWarmups: (show: boolean) => void;
}

const SetList: React.FC<SetListProps> = React.memo(({
  setsLog,
  activeSetIndex,
  setInputs,
  allWarmupsCompleted,
  showCompletedWarmups,
  warmupSetsCount,
  hasWarmups,
  colors,
  isDark,
  styles,
  onSetAction,
  onToggleShowWarmups,
}) => {
  return (
    <>
      {setsLog.map((set, idx) => {
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

        const prevSet = idx > 0 ? setsLog[idx - 1] : null;
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
                  onToggleShowWarmups(true);
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
                    Warm-up Completed ({warmupSetsCount} {warmupSetsCount === 1 ? 'set' : 'sets'})
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
                      onToggleShowWarmups(false);
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
              onAction={onSetAction}
            />
          </React.Fragment>
        );
      })}
    </>
  );
});

// ─── Pure helper: compute initial set-input state synchronously ───────────────
// Called inside useState() initializer so the component never renders with empty
// inputs and immediately re-renders — eliminating the double-render on mount.
function computeInitialSetInputs(
  exercise: any,
  gymLogs: any[] | null | undefined,
  date: string | undefined
): SetInputState[] {
  if (!exercise || !exercise.setsLog) return [];
  const lastSessionSets = exercise.lastSessionSets ?? getPreviousExerciseSession(exercise.name, gymLogs, date || todayStr())?.sets ?? [];
  const lastValidPastSet = lastSessionSets.length > 0 ? lastSessionSets[lastSessionSets.length - 1] : null;
  return exercise.setsLog.map((s: any, idx: number) => {
    if (s.completed) {
      return {
        weight: (s.weight !== null && s.weight !== undefined && Number(s.weight) > 0) ? String(s.weight) : '',
        reps: (s.reps !== null && s.reps !== undefined && Number(s.reps) > 0) ? String(s.reps) : '',
      };
    }
    const lastSet = lastSessionSets[idx] || lastValidPastSet;
    let initialWeight = (s.weight !== null && s.weight !== undefined && Number(s.weight) > 0) ? String(s.weight) : '';
    if (!initialWeight && lastSet?.weight != null && Number(lastSet.weight) > 0) {
      initialWeight = String(lastSet.weight);
    }
    const defaultTargetReps = String(parseUpperTargetReps(exercise.targetReps));
    const initialReps = (s.reps !== null && s.reps !== undefined && Number(s.reps) > 0)
      ? String(parseUpperTargetReps(s.reps))
      : (lastSet?.reps ? String(parseUpperTargetReps(lastSet.reps)) : defaultTargetReps);
    return { weight: initialWeight, reps: initialReps };
  });
}

export default function ActiveLoggingScreen() {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeActiveLoggingStyles(colors, isDark), [colors, isDark]);
  const navigation = useNavigation<NativeStackNavigationProp<GymNavigationParamList>>();
  const route = useRoute<RouteProp<GymNavigationParamList, 'ActiveLogging'>>();
  const date = route.params?.date;

  const {
    log,
    startWorkout,
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
  } = useGymLog(date);

  // Auto-engage workout timer if arrived from GPS / geofence and workout was not yet started
  useEffect(() => {
    if (log && !log.completed && !log.workoutStartTime) {
      startWorkout();
    }
  }, [log?.completed, log?.workoutStartTime, startWorkout]);

  const insets = useSafeAreaInsets();
  // Nav bar height: tabs row (54px) + safe bottom inset
  const navBarHeight = 54 + (insets.bottom > 0 ? insets.bottom : 8);
  // Rest timer sits docked strictly and cleanly 8px above the bottom navigation bar
  const timerBottomOffset = navBarHeight + 8;

  // Prevent phone screen from locking or sleeping during active workout
  useKeepAwake();

  const isLoggingSetRef = useRef(false);
  const supersetJumpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handlersRef = useRef<any>({});

  const [appState, setAppState] = useState(AppState.currentState);

  useEffect(() => {
    const sub = AppState.addEventListener('change', nextState => setAppState(nextState));
    return () => sub.remove();
  }, []);

  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, () => setIsKeyboardVisible(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setIsKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const [showSupersetPicker, setShowSupersetPicker] = useState(false);
  const [activeExIndex, setActiveExIndex] = useState(route.params?.initialIndex ?? 0);
  // ── FIX 3: Track initialIndex consumption via ref only — no navigation.setParams() on mount.
  // Calling navigation.setParams() during mount triggers a React Navigation router state update
  // which causes a re-render cascade while the push animation is still in flight.
  const consumedInitialIndexRef = useRef<number | null>(route.params?.initialIndex ?? null);

  useEffect(() => {
    if (route.params?.initialIndex !== undefined) {
      if (consumedInitialIndexRef.current !== route.params.initialIndex) {
        consumedInitialIndexRef.current = route.params.initialIndex;
        setActiveExIndex(route.params.initialIndex);
      }
      // NOTE: We intentionally do NOT call navigation.setParams() here.
      // The ref above already prevents the index from being applied twice.
      // Calling setParams during mount causes React Navigation to trigger a router
      // state update and re-render cascade while the slide animation is in flight.
    }
  }, [route.params?.initialIndex]);

  const [showVideo, setShowVideo] = useState(false);
  // ── FIX 4: Lazy-mount modals — don't track 'ever shown' as the same flag as 'currently visible'.
  // SupersetPickerModal and ActiveSwapModal are only inserted into the React tree
  // once the user has opened them for the first time — saving initial module evaluation.
  const [swapModalEverShown, setSwapModalEverShown] = useState(false);
  const [supersetPickerEverShown, setSupersetPickerEverShown] = useState(false);
  const [showSwapModal, setShowSwapModal] = useState(false);
  const [aiSwapList, setAiSwapList] = useState<any[]>([]);
  const [isAiSwapLoading, setIsAiSwapLoading] = useState(false);
  const [isRefreshingVideo, setIsRefreshingVideo] = useState(false);
  const [showCompletedWarmups, setShowCompletedWarmups] = useState(false);

  useEffect(() => {
    setShowCompletedWarmups(false);
  }, [activeExIndex]);

  const { gymLogs } = useWellnessData();

  const activeExercises = useMemo(() => log?.exercises?.filter(ex => !ex.skipped) || [], [log?.exercises]);
  const safeIdx = Math.min(activeExIndex, Math.max(0, activeExercises.length - 1));
  const exercise = activeExercises[safeIdx];

  // ── FIX 1: Lazy-initialize setInputs synchronously in the useState initializer.
  // This eliminates the double-render that previously happened on every mount:
  //   Frame 0: render with empty [] → Frame 1: useEffect fires setSetInputs() → re-render
  // Now Frame 0 already has the correct inputs; no forced second render needed.
  const userEditedFieldsRef = useRef<{ [idx: number]: { weight?: boolean; reps?: boolean } }>({});
  const lastExerciseKeyRef = useRef<string>('');
  const liveInputsRef = useRef<{ [idx: number]: { weight?: string; reps?: string } }>({});
  // ── FIX 4: Track the previous setsLog length to detect actual add/remove events.
  // handleLogSet already patches setInputs directly when completing a set, so the
  // setsLog sync useEffect must not re-run setSetInputs() just because `completed`
  // flags changed — the count hasn't changed and the data is already correct.
  const prevSetsLengthRef = useRef<number>(-1);
  const [setInputs, setSetInputs] = useState<SetInputState[]>(() =>
    computeInitialSetInputs(exercise, gymLogs, date)
  );

  // ── FIX 2: Defer heavy historical computation after the slide animation completes.
  // overloadSuggestion and lastTimeData both walk the entire gymLogs history.
  // Running them synchronously on mount blocks the JS thread during the push animation.
  // With InteractionManager they execute only after all pending animations finish.
  const [overloadSuggestion, setOverloadSuggestion] = useState<any | null>(null);
  const [lastTimeData, setLastTimeData] = useState<string | null>(null);
  const interactionsSettledRef = useRef(false);
  const lastBannerExKeyRef = useRef<string>('');

  // Debounce ref for widget sync — prevents bridge calls on every rest-timer tick
  const widgetSyncDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Sync Live Workout State with Android Home Screen Widget ───────────────
  // Debounced 500ms — widget/notification don't need to update every rest-timer second.
  // Separates the fast notification path (immediate) from the heavy widget data build.
  useEffect(() => {
    if (Platform.OS !== 'android') return; // iOS early return before any computation
    if (!activeExercises || activeExercises.length === 0) return;

    if (widgetSyncDebounceRef.current) clearTimeout(widgetSyncDebounceRef.current);
    widgetSyncDebounceRef.current = setTimeout(() => {
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

      const now = new Date();
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const dayName = dayNames[now.getDay()];
      const displayDate = now.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });

      const widgetData: LiveWorkoutWidgetData = {
        dateStr: log?.date || todayStr(),
        dayName,
        displayDate,
        isActive: !log?.completed,
        isCompleted: Boolean(log?.completed),
        isRestDay: false,
        splitTitle: log?.dayPlanIndex !== undefined ? `Routine • Ex ${safeIdx + 1}/${activeExercises.length}` : ((log as any)?.name || "Active Workout"),
        splitSubtitle: currentEx?.name || 'Target: Progressive Overload',
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
        plannedExercisesPreview: activeExercises.map(e => e.name),
        lastUpdated: Date.now(),
      };

      saveCachedLiveWorkoutData(widgetData);
      updateLiveWorkoutWidget(widgetData);

      // OS push notifications for rest timer/set logging are muted per user preference.
      // Widget sync (Android home screen widget) remains active above.
    }, 500); // 500ms debounce — widget doesn't need 1Hz updates

    return () => {
      if (widgetSyncDebounceRef.current) {
        clearTimeout(widgetSyncDebounceRef.current);
        widgetSyncDebounceRef.current = null;
      }
    };
  }, [activeExercises, safeIdx, log?.completed, log?.workoutDurationMinutes, restTimerStartTime, restTimerDurationSecs]);

  // Clean up lock screen notification on mount, unmount, or workout completion
  useEffect(() => {
    dismissActiveWorkoutNotification();
    return () => {
      dismissActiveWorkoutNotification();
    };
  }, []);

  const exercises = activeExercises;

  const realExerciseIndex = useMemo(() => {
    if (!log?.exercises || !exercise) return safeIdx;
    const idx = log.exercises.findIndex(e =>
      (e.exerciseId && exercise.exerciseId && e.exerciseId === exercise.exerciseId) ||
      (e._idx !== undefined && exercise._idx !== undefined && e._idx === exercise._idx) ||
      e.name === exercise.name
    );
    return idx !== -1 ? idx : safeIdx;
  }, [log?.exercises, exercise?.exerciseId, exercise?._idx, exercise?.name, safeIdx]);

  // Superset partner exercise lookup
  const partnerExercise = useMemo(() => {
    if (!exercise?.supersetGroup) return null;
    return activeExercises.find(
      (e, i) => e.supersetGroup === exercise.supersetGroup &&
        i !== safeIdx &&
        ((e.exerciseId && exercise.exerciseId && e.exerciseId !== exercise.exerciseId) || e.name !== exercise.name)
    );
  }, [exercise?.supersetGroup, exercise?.exerciseId, exercise?.name, activeExercises, safeIdx]);

  const targetDateStr = date || todayStr();
  // Filter historical gym logs strictly BEFORE targetDateStr and stabilize with fingerprinting
  // so today's live sets don't churn history or re-trigger overload calculations
  const pastGymLogsRef = useRef<any[]>([]);
  const pastLogsFingerprintRef = useRef<string>('');
  const pastGymLogs = useMemo(() => {
    if (!gymLogs || gymLogs.length === 0) return [];
    const past = gymLogs.filter(l => l.date < targetDateStr);
    const fingerprint = past.map(l => `${l.date}_${l.exercises?.length ?? 0}`).join('|');
    if (fingerprint === pastLogsFingerprintRef.current && pastGymLogsRef.current.length === past.length) {
      return pastGymLogsRef.current;
    }
    pastLogsFingerprintRef.current = fingerprint;
    pastGymLogsRef.current = past;
    return past;
  }, [gymLogs, targetDateStr]);

  // ── Compute overloadSuggestion + lastTimeData without layout collapse flickers.
  // 1. Only wipe banner to null if user genuinely switched to a DIFFERENT exercise.
  // 2. Evaluates against past completed sessions (before today) so logging sets today never triggers recalculations.
  // 3. Fallback baseline weight uses previous session weight so suggestion displays on set 1 without popping in late.
  useEffect(() => {
    if (!exercise) return;
    const currentExId = exercise.exerciseId || exercise.name || '';
    const currentExKey = `${currentExId}-${activeExIndex}`;
    const isDifferentExercise = currentExKey !== lastBannerExKeyRef.current;

    if (isDifferentExercise) {
      lastBannerExKeyRef.current = currentExKey;
      interactionsSettledRef.current = false;
      setOverloadSuggestion(null);
      setLastTimeData(null);
    }

    const task = InteractionManager.runAfterInteractions(() => {
      interactionsSettledRef.current = true;
      // Overload suggestion: evaluate against past completed sessions before today
      const prevSession = getPreviousExerciseSession(exercise.name, pastGymLogs, targetDateStr);
      const curWeight = calculateExerciseMaxWeight(exercise as any) ||
        prevSession?.lastWeight ||
        Number(exercise.lastSessionSets?.[0]?.weight) ||
        0;

      const suggestion = getOverloadSuggestion(
        exercise,
        curWeight,
        exercise.targetSets || 3,
        String(exercise.targetReps || '8'),
        pastGymLogs
      );
      setOverloadSuggestion(suggestion);

      // Last-session stats banner
      if (prevSession && prevSession.sets.length > 0) {
        const weightPart = prevSession.lastWeight ? `@ ${prevSession.lastWeight}kg` : '';
        const repsPart = prevSession.avgReps ? `${prevSession.avgReps} reps` : '';
        setLastTimeData(`Last: ${prevSession.sets.length} sets ${repsPart ? `× ${repsPart}` : ''} ${weightPart}`.trim());
      } else {
        setLastTimeData(null);
      }
    });

    return () => task.cancel();
  }, [exercise?.exerciseId, exercise?.name, activeExIndex, pastGymLogs, targetDateStr]);

  // ── FIX 1 (continued): Sync setInputs when exercise changes or setsLog mutates.
  // This replaces the old 'initialize from scratch' useEffect with a lightweight
  // sync that only updates inputs for changed/added sets, preserving live edits.
  useEffect(() => {
    if (!exercise || !exercise.setsLog) return;

    const currentExId = exercise.exerciseId || exercise.name || '';
    const key = `${currentExId}-${activeExIndex}`;
    const currentLen = exercise.setsLog.length;

    // Exercise switched → reset edit tracking & recompute from scratch
    if (key !== lastExerciseKeyRef.current) {
      lastExerciseKeyRef.current = key;
      prevSetsLengthRef.current = currentLen;
      userEditedFieldsRef.current = {};
      liveInputsRef.current = {};
      setSetInputs(computeInitialSetInputs(exercise, gymLogs, date));
      return;
    }

    // ── FIX 4: Skip the sync when set count hasn't changed (same exercise).
    // This fires when `completed` flags change but no set was added/removed.
    // handleLogSet() already called setSetInputs() directly for the logged set,
    // so re-running the full map here is redundant and causes an extra render.
    if (currentLen === prevSetsLengthRef.current) {
      return;
    }
    prevSetsLengthRef.current = currentLen;

    // Same exercise, set count changed (add/remove): only sync completed-set values
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
        // Preserve live user edits for incomplete sets
        const edited = userEditedFieldsRef.current[idx];
        const liveWeight = liveInputsRef.current[idx]?.weight;
        const liveReps = liveInputsRef.current[idx]?.reps;
        if (edited?.weight || edited?.reps) {
          return {
            weight: liveWeight !== undefined ? liveWeight : (prev?.[idx]?.weight || ''),
            reps: liveReps !== undefined ? liveReps : (prev?.[idx]?.reps || ''),
          };
        }
        // New set appended or no prior state: fall back to computed defaults
        return prev?.[idx] || { weight: '', reps: String(parseUpperTargetReps(exercise.targetReps)) };
      });
    });
  }, [exercise?.exerciseId, exercise?.name, activeExIndex, exercise?.setsLog?.length, date]);

  // Load Instant Database Swaps on modal open
  useEffect(() => {
    if (!showSwapModal || !exercise) return;
    const swaps = getExerciseSwapAlternatives(exercise.name, exercise.muscle);
    setAiSwapList(swaps);
    setIsAiSwapLoading(false);
  }, [showSwapModal, exercise?.name, exercise?.muscle]);

  // Note: Video ID resolution is handled on-demand when user taps onVideoToggle,
  // preventing re-render stutters while typing weights & reps.

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

  const stateRef = useRef({
    setInputs,
    exercise,
    overloadSuggestion,
    realExerciseIndex,
    exercises,
    activeExIndex,
  });
  stateRef.current = {
    setInputs,
    exercise,
    overloadSuggestion,
    realExerciseIndex,
    exercises,
    activeExIndex,
  };

  const handleTextChange = useCallback((setIdx: number, field: 'reps' | 'weight', text: string) => {
    let sanitized = text.trim();

    if (field === 'weight') {
      const num = parseFloat(sanitized);
      if (!isNaN(num) && num > 1000) {
        sanitized = '1000';
      }
    } else if (field === 'reps') {
      if (/[-–—]/.test(sanitized)) {
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
      if (prev[setIdx] && prev[setIdx][field] === sanitized) return prev;
      const next = [...prev];
      const curSet = stateRef.current.exercise?.setsLog?.[setIdx];
      const current = next[setIdx] || {
        weight: curSet?.weight != null ? String(curSet.weight) : '',
        reps: curSet?.reps != null ? String(curSet.reps) : ''
      };
      next[setIdx] = { ...current, [field]: sanitized };
      return next;
    });
  }, []);

  const handleBlur = useCallback((setIdx: number) => {
    if (isLoggingSetRef.current) return;
    const { exercise, setInputs: curInputs, overloadSuggestion: curOverload, realExerciseIndex: curRealIdx } = stateRef.current;
    if (!exercise) return;
    const input = curInputs[setIdx];
    const curSet = exercise.setsLog[setIdx];
    const isWeightEdited = userEditedFieldsRef.current[setIdx]?.weight;
    const isRepsEdited = userEditedFieldsRef.current[setIdx]?.reps;

    const resolved = resolveSetWeightAndReps(
      input,
      curSet,
      null,
      null,
      curOverload,
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
    updateExercise(curRealIdx, newEx);
  }, [updateExercise]);

  const handleLogSet = useCallback(() => {
    const { exercise, setInputs: curInputs, overloadSuggestion: curOverload, realExerciseIndex: curRealIdx, exercises: allExs, activeExIndex: curActiveIdx } = stateRef.current;
    const curActiveSetIndex = exercise ? exercise.setsLog.findIndex(s => !s.completed) : -1;
    if (!exercise || curActiveSetIndex === -1) return;

    isLoggingSetRef.current = true;
    Keyboard.dismiss();
    setTimeout(() => { isLoggingSetRef.current = false; }, 300);
    hapticMedium();

    const currentSet = exercise.setsLog[curActiveSetIndex];
    const input = curInputs[curActiveSetIndex];
    const isWeightEdited = userEditedFieldsRef.current[curActiveSetIndex]?.weight;
    const isRepsEdited = userEditedFieldsRef.current[curActiveSetIndex]?.reps;

    const resolved = resolveSetWeightAndReps(
      input,
      currentSet,
      null,
      null,
      curOverload,
      exercise.targetReps,
      isWeightEdited,
      isRepsEdited
    );

    const newEx = {
      ...exercise,
      setsLog: exercise.setsLog.map((s, i) =>
        i === curActiveSetIndex ? { ...s, weight: resolved.weight, reps: resolved.reps, completed: true } : s
      ),
    };

    setSetInputs(prev => prev.map((inp, i) =>
      i === curActiveSetIndex ? { weight: resolved.weight !== null ? String(resolved.weight) : '', reps: String(resolved.reps) } : inp
    ));

    const nextJumpIdx = findNextSupersetExerciseIndex(allExs, curActiveIdx, exercise.supersetGroup);
    const restSecs = nextJumpIdx !== -1 ? 30 : getRestDuration(exercise);

    logSetAndStartTimer(curRealIdx, newEx, restSecs, exercise.name);

    if (nextJumpIdx !== -1) {
      if (supersetJumpTimerRef.current) clearTimeout(supersetJumpTimerRef.current);
      supersetJumpTimerRef.current = setTimeout(() => setActiveExIndex(nextJumpIdx), 400);
    }
  }, [logSetAndStartTimer]);

  const handleAdjustWeight = useCallback((delta: number) => {
    const { exercise, setInputs: curInputs, overloadSuggestion: curOverload } = stateRef.current;
    if (!exercise) return;
    const curActiveSetIndex = exercise.setsLog.findIndex(s => !s.completed);
    const targetIdx = curActiveSetIndex !== -1 ? curActiveSetIndex : exercise.setsLog.length - 1;
    if (targetIdx < 0) return;
    hapticLight();

    const curSet = exercise.setsLog[targetIdx];
    const curInput = curInputs[targetIdx];
    const prevSet = targetIdx > 0 ? exercise.setsLog[targetIdx - 1] : null;

    let baseWeight = 0;
    if (curInput?.weight !== '' && curInput?.weight !== undefined) {
      baseWeight = parseFloat(curInput.weight) || 0;
    } else if (curSet?.weight != null && Number(curSet.weight) > 0) {
      baseWeight = Number(curSet.weight);
    } else if (prevSet?.weight != null && Number(prevSet.weight) > 0) {
      baseWeight = Number(prevSet.weight);
    } else if (curOverload?.recommended) {
      baseWeight = Number(curOverload.recommended);
    }

    const newWeight = Math.min(1000, Math.max(0, Math.round((baseWeight + delta) * 10) / 10));
    handleTextChange(targetIdx, 'weight', String(newWeight));
  }, [handleTextChange]);

  const handleAdjustReps = useCallback((delta: number) => {
    const { exercise, setInputs: curInputs } = stateRef.current;
    if (!exercise) return;
    const curActiveSetIndex = exercise.setsLog.findIndex(s => !s.completed);
    const targetIdx = curActiveSetIndex !== -1 ? curActiveSetIndex : exercise.setsLog.length - 1;
    if (targetIdx < 0) return;
    hapticLight();

    const curSet = exercise.setsLog[targetIdx];
    const curInput = curInputs[targetIdx];
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
  }, [handleTextChange]);

  const handleRepeatPreviousSet = useCallback(() => {
    const { exercise, setInputs: curInputs, overloadSuggestion: curOverload } = stateRef.current;
    if (!exercise) return;
    const curActiveSetIndex = exercise.setsLog.findIndex(s => !s.completed);
    const targetIdx = curActiveSetIndex !== -1 ? curActiveSetIndex : exercise.setsLog.length - 1;
    if (targetIdx < 0) return;
    hapticLight();

    const prevSet = targetIdx > 0 ? exercise.setsLog[targetIdx - 1] : null;
    const prevInput = targetIdx > 0 ? curInputs[targetIdx - 1] : null;

    let repWeight = '';
    if (prevInput?.weight) {
      repWeight = prevInput.weight;
    } else if (prevSet?.weight != null && Number(prevSet.weight) > 0) {
      repWeight = String(prevSet.weight);
    } else if (curOverload?.recommended) {
      repWeight = String(Math.min(1000, Number(curOverload.recommended)));
    }

    let repReps = '';
    if (prevInput?.reps) {
      repReps = String(parseUpperTargetReps(prevInput.reps));
    } else if (prevSet?.reps != null && Number(prevSet.reps) > 0) {
      repReps = String(parseUpperTargetReps(prevSet.reps));
    } else {
      repReps = String(parseUpperTargetReps(exercise.targetReps));
    }

    if (repWeight) handleTextChange(targetIdx, 'weight', repWeight);
    if (repReps) handleTextChange(targetIdx, 'reps', repReps);
  }, [handleTextChange]);

  const handleNextExercise = useCallback(async () => {
    Keyboard.dismiss();
    const { activeExIndex: curIdx, exercises: curExs } = stateRef.current;
    if (curIdx < curExs.length - 1) {
      hapticMedium();
      if (supersetJumpTimerRef.current) clearTimeout(supersetJumpTimerRef.current);
      setActiveExIndex(curIdx + 1);
    } else {
      hapticSuccess();
      if (widgetSyncDebounceRef.current) {
        clearTimeout(widgetSyncDebounceRef.current);
        widgetSyncDebounceRef.current = null;
      }
      clearRestTimer();
      await endWorkout(true);
      navigation.replace('WorkoutSummary', { date });
    }
  }, [clearRestTimer, endWorkout, navigation, date]);

  const handleDeleteSet = useCallback((idx: number) => {
    const { exercise, realExerciseIndex: curRealIdx } = stateRef.current;
    if (!exercise) return;
    hapticLight();
    const newEx = {
      ...exercise,
      setsLog: exercise.setsLog.filter((_, i) => i !== idx).map((s, i) => ({ ...s, setNumber: i + 1 })),
    };
    updateExercise(curRealIdx, newEx);
    setSetInputs(prev => prev.filter((_, i) => i !== idx));

    // Re-index userEditedFieldsRef and liveInputsRef to prevent index desync
    const newUserEdited: { [idx: number]: { weight?: boolean; reps?: boolean } } = {};
    const newLiveInputs: { [idx: number]: { weight?: string; reps?: string } } = {};
    Object.keys(userEditedFieldsRef.current).forEach(k => {
      const numK = Number(k);
      if (numK < idx) {
        newUserEdited[numK] = userEditedFieldsRef.current[numK];
      } else if (numK > idx) {
        newUserEdited[numK - 1] = userEditedFieldsRef.current[numK];
      }
    });
    Object.keys(liveInputsRef.current).forEach(k => {
      const numK = Number(k);
      if (numK < idx) {
        newLiveInputs[numK] = liveInputsRef.current[numK];
      } else if (numK > idx) {
        newLiveInputs[numK - 1] = liveInputsRef.current[numK];
      }
    });
    userEditedFieldsRef.current = newUserEdited;
    liveInputsRef.current = newLiveInputs;
  }, [updateExercise]);

  // Keep handlersRef current for native DeviceEventEmitter listeners
  handlersRef.current = {
    handleLogSet,
    handleAdjustWeight,
    handleNextExercise,
    clearRestTimer,
    setRestTimerDuration,
    restTimerInitial,
  };

  // Handle interactive lock screen notification actions (Done Set, Add Weight, Next Exercise, Skip Rest)
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('ACTIVE_WORKOUT_ACTION', (payload: any) => {
      const h = handlersRef.current;
      if (!h) return;
      if (payload.action === 'DONE_SET') {
        h.handleLogSet?.();
      } else if (payload.action === 'ADD_WEIGHT') {
        h.handleAdjustWeight?.(payload.delta || 2.5);
      } else if (payload.action === 'NEXT_EXERCISE') {
        h.handleNextExercise?.();
      } else if (payload.action === 'SKIP_REST') {
        h.clearRestTimer?.();
      } else if (payload.action === 'ADD_REST_SECONDS') {
        h.setRestTimerDuration?.(h.restTimerInitial + (payload.seconds || 30));
      }
    });

    const finishSub = DeviceEventEmitter.addListener('gym_workout_auto_finished', () => {
      navigation.goBack();
    });

    return () => {
      sub.remove();
      finishSub.remove();
      if (supersetJumpTimerRef.current) {
        clearTimeout(supersetJumpTimerRef.current);
      }
    };
  }, [navigation]);

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
      userEditedFieldsRef.current = {};
      liveInputsRef.current = {};
      return;
    }

    // Determine target working weight: check liveInputsRef / setInputs first!
    let targetW = 40;
    const firstWorkingIdx = exercise.setsLog.findIndex(s => !s.isWarmup);
    const liveFirstWorkingWeight = firstWorkingIdx >= 0 ? (liveInputsRef.current[firstWorkingIdx]?.weight || setInputs[firstWorkingIdx]?.weight) : undefined;
    const parsedLiveWeight = liveFirstWorkingWeight ? parseFloat(liveFirstWorkingWeight) : null;

    const firstWorking = exercise.setsLog.find(s => !s.isWarmup && s.weight != null && Number(s.weight) > 0);
    if (parsedLiveWeight && parsedLiveWeight > 0) {
      targetW = parsedLiveWeight;
    } else if (firstWorking?.weight) {
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
    userEditedFieldsRef.current = {};
    liveInputsRef.current = {};
  }, [exercise, overloadSuggestion, lastTimeData, realExerciseIndex, updateExercise, setInputs]);

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
    setSetInputs(prev => [
      ...prev,
      {
        weight: weightVal != null ? String(weightVal) : '',
        reps: repsVal != null ? String(repsVal) : '',
      },
    ]);
  }, [exercise, setInputs, realExerciseIndex, updateExercise]);

  const handleToggleSetComplete = useCallback((setIdx: number) => {
    const { exercise, setInputs: curInputs, realExerciseIndex: curRealIdx } = stateRef.current;
    if (!exercise) return;
    isLoggingSetRef.current = true;
    Keyboard.dismiss();
    setTimeout(() => { isLoggingSetRef.current = false; }, 300);
    hapticLight();

    const input = curInputs[setIdx];
    const curSet = exercise.setsLog[setIdx];
    const targetCompleted = !curSet.completed;

    if (targetCompleted) {
      awardXP('GYM_SET').catch(() => {});
      playSetCompleteTone();
    }

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
      repsVal = parseInt(String(exercise.targetReps || '8').split(/[-–—]/)[0], 10) || 8;
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
    updateExercise(curRealIdx, newEx);
  }, [updateExercise]);

  // Stable unified set action dispatcher — passed to SwipeableSetRow instead of 5 inline
  // arrow functions, so React.memo can bail out on unrelated re-renders (timer ticks, etc.).
  // With zero reactive dependencies, it never changes reference across keystrokes!
  const handleSetAction = useCallback((idx: number, action: 'textChange' | 'blur' | 'toggle' | 'delete' | 'swipe', payload?: any) => {
    switch (action) {
      case 'textChange': handleTextChange(idx, payload.field, payload.text); break;
      case 'blur':       handleBlur(idx); break;
      case 'toggle':     handleToggleSetComplete(idx); break;
      case 'delete':     handleDeleteSet(idx); break;
      case 'swipe':      handleToggleSetComplete(idx); break;
    }
  }, [handleTextChange, handleBlur, handleToggleSetComplete, handleDeleteSet]);

  // ── All Hooks MUST be declared BEFORE any conditional early returns (React Rules of Hooks) ──
  const handleSwapPress = useCallback(() => {
    hapticMedium();
    setSwapModalEverShown(true);
    setShowSwapModal(true);
  }, []);

  const handleSupersetPress = useCallback(() => {
    hapticMedium();
    setSupersetPickerEverShown(true);
    setShowSupersetPicker(true);
  }, []);

  const handleVideoToggle = useCallback(() => {
    hapticMedium();
    const curEx = stateRef.current.exercise;
    const curRealIdx = stateRef.current.realExerciseIndex;
    if (!curEx) return;
    if (!curEx.videoId) {
      setShowVideo(true);
      autoResolveExerciseVideoId(curEx.name).then(resolvedId => {
        if (resolvedId) {
          updateExercise(curRealIdx, { ...curEx, videoId: resolvedId });
        }
      });
    } else {
      setShowVideo(prev => !prev);
    }
  }, [updateExercise]);

  const handleSwitchToPartner = useCallback(() => {
    hapticLight();
    const partner = partnerExercise;
    if (!partner) return;
    const partnerIdx = activeExercises.findIndex(e =>
      (e.exerciseId && partner.exerciseId && e.exerciseId === partner.exerciseId) || e.name === partner.name
    );
    if (partnerIdx !== -1) {
      if (supersetJumpTimerRef.current) clearTimeout(supersetJumpTimerRef.current);
      setActiveExIndex(partnerIdx);
    }
  }, [partnerExercise, activeExercises]);

  const handleTimerAdd = useCallback(() => {
    setRestTimerDuration(restTimerInitial + 30);
  }, [setRestTimerDuration, restTimerInitial]);

  const handleTimerSubtract = useCallback(() => {
    setRestTimerDuration(Math.max(10, restTimerInitial - 30));
  }, [setRestTimerDuration, restTimerInitial]);

  const handleTimerSkip = useCallback(() => {
    clearRestTimer();
  }, [clearRestTimer]);

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
      <SafeAreaView style={styles.root}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Active Workout</Text>
          <View style={{ width: 32 }} />
        </View>
        <View style={[styles.root, { justifyContent: 'center', alignItems: 'center' }]}>
          <Text style={{ color: colors.textMuted }}>No exercises found for this session.</Text>
        </View>
      </SafeAreaView>
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
              onSwapPress={handleSwapPress}
              onSupersetPress={handleSupersetPress}
              onVideoToggle={handleVideoToggle}
              onSwitchToPartner={handleSwitchToPartner}
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

            {/* Set Rows with Warmup / Working Phase Dividers (Memoized) */}
            <SetList
              setsLog={exercise.setsLog}
              activeSetIndex={activeSetIndex}
              setInputs={setInputs}
              allWarmupsCompleted={allWarmupsCompleted}
              showCompletedWarmups={showCompletedWarmups}
              warmupSetsCount={warmupSets.length}
              hasWarmups={hasWarmups}
              colors={colors}
              isDark={isDark}
              styles={styles}
              onSetAction={handleSetAction}
              onToggleShowWarmups={setShowCompletedWarmups}
            />

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


        {/* ── FIX 4: Lazy-mount Superset Modal — only inserted into the tree on first open.
             Before first open: zero JS evaluation, zero layout cost, zero PanResponder init. */}
        {supersetPickerEverShown && (
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
              const partnerRealIdx = log?.exercises?.findIndex((e: any) =>
                (e.exerciseId && altEx.exerciseId && e.exerciseId === altEx.exerciseId) || e.name === altEx.name
              ) ?? -1;
              if (partnerRealIdx !== -1) {
                updateExercise(partnerRealIdx, { ...altEx, supersetGroup: groupLetter });
              }
              setShowSupersetPicker(false);
            }}
          />
        )}

        {/* ── FIX 4: Lazy-mount Swap Modal — same pattern. Zero mount cost until user first taps Swap. */}
        {swapModalEverShown && (
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

              const targetDateStr = date || todayStr();
              const prevSession = getPreviousExerciseSession(alt.name, gymLogs, targetDateStr);
              const lastSets = prevSession?.sets || [];
              const lastValidSet = lastSets.length > 0 ? lastSets[lastSets.length - 1] : null;
              const targetSetsCount = alt.targetSets || 3;
              const defaultTargetReps = parseUpperTargetReps(alt.targetReps || '8-12');

              const initialSetsLog = Array.from({ length: targetSetsCount }, (_, i) => {
                const lastSet = lastSets[i] || lastValidSet;
                const setWeight = (lastSet?.weight != null && Number(lastSet.weight) > 0) ? Number(lastSet.weight) : null;
                return {
                  setNumber: i + 1,
                  reps: lastSet?.reps ? Number(lastSet.reps) : defaultTargetReps,
                  weight: setWeight,
                  completed: false,
                };
              });

              const updatedEx = {
                ...exercise,
                exerciseId: `swap_${Date.now()}`,
                name: alt.name,
                muscle: alt.muscle || exercise.muscle,
                targetSets: targetSetsCount,
                targetReps: alt.targetReps || '8-12',
                restTimeSecs: alt.restTimeSecs || 90,
                videoId: resolvedVideoId,
                lastSessionSets: lastSets.length > 0 ? lastSets : undefined,
                setsLog: initialSetsLog,
              };

              updateExercise(realExerciseIndex, updatedEx);
              setSetInputs(initialSetsLog.map(s => ({
                weight: s.weight != null ? String(s.weight) : '',
                reps: s.reps != null ? String(s.reps) : '',
              })));
              userEditedFieldsRef.current = {};
              liveInputsRef.current = {};

              setShowSwapModal(false);
              Alert.alert(
                'Keep Swap Permanent?',
                `Do you want to use ${alt.name} for future workouts?`,
                [
                  { text: 'No, just for today', style: 'cancel' },
                  {
                    text: 'Yes, update plan',
                    onPress: () => makeSwapPermanent(
                      oldName,
                      alt.name,
                      resolvedVideoId || alt.videoId,
                      alt.muscle || exercise.muscle,
                      alt.targetSets,
                      alt.targetReps,
                      alt.restTimeSecs
                    )
                  }
                ]
              );
            }}
          />
        )}

      </KeyboardAvoidingView>

      {/* Sticky Rest Timer Overlay (Rendered outside KeyboardAvoidingView so it never jumps with keyboard) */}
      {(restTimerStartTime && restTimerDurationSecs && !isKeyboardVisible) ? (
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
            onAdd={handleTimerAdd}
            onSubtract={handleTimerSubtract}
            onSkip={handleTimerSkip}
          />
        </View>
      ) : null}
    </SafeAreaView>
  );
}
