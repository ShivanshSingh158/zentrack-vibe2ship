import React, { useEffect, useRef, useState, useMemo, memo, useCallback, Suspense } from 'react';
import { View, Text, TouchableOpacity, Platform, Alert, Animated, LayoutAnimation, ScrollView, InteractionManager, DeviceEventEmitter, Linking } from 'react-native';
import DraggableFlatList, { RenderItemParams } from 'react-native-draggable-flatlist';
import { hapticLight, hapticMedium } from '../../utils/haptics';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Modal } from 'react-native';

import { useWellnessData } from '../../contexts/domains/WellnessContext';
import { useCoreData } from '../../contexts/domains/CoreDataContext';
import { useGymLog, todayStr, dateStrOffset, planDayIndexForDate } from '../../hooks/useGymLog';
import type { GymCardioLog } from '../../types/gym.types';
import { clearScheduleCache, scheduleAllNotifications } from '../../services/notifications';

import { useTheme } from '../../contexts/ThemeContext';
import { COLORS, FONT_FAMILY } from '../../theme/tokens';
import { makeStyles } from './gymHomeStyles';

import { ZenGymAiFab } from '../../components/Gym/ZenGymAiFab';
import { getOverloadSuggestion } from '../../services/progressiveOverload';
import { setTabBarVisible } from '../../utils/tabBarScroll';
import { resolveExerciseTargetMuscle } from '../../utils/gymUtils';
import { GymExerciseOptionsSheet } from '../../components/Gym/GymExerciseOptionsSheet';
import { useGymAiPlanManager } from '../../hooks/useGymAiPlanManager';
import GymExerciseDraggableRow from '../../components/Gym/GymExerciseDraggableRow';
import GymWorkoutBanner from '../../components/Gym/GymWorkoutBanner';
import WeeklyGymReport from '../../components/Gym/WeeklyGymReport';
import { useGymPlanPreCache } from '../../hooks/useGymPlanPreCache';
import GymHomeSkeleton from '../../components/Gym/GymHomeSkeleton';
import {
  getGeofenceDiagnosticStatus,
  checkImmediateGymProximity,
  ensureLocationServicesEnabled,
  requestLocationPermissions,
  type GeofenceDiagnosticStatus,
} from '../../services/geofenceService';

// ─── Heavy Modals: Lazy-loaded on demand (skips parsing ~9,750 LOC on cold boot) ───
const AddExerciseModal = React.lazy(() => import('../../components/Gym/AddExerciseModal').then(m => ({ default: m.AddExerciseModal })));
const AddCardioModal = React.lazy(() => import('../../components/Gym/AddCardioModal').then(m => ({ default: m.AddCardioModal })));
const ExerciseHistoryDrawer = React.lazy(() => import('../../components/Gym/ExerciseHistoryDrawer').then(m => ({ default: m.ExerciseHistoryDrawer })));
const ZenGymAiModal = React.lazy(() => import('../../components/Gym/ZenGymAiModal').then(m => ({ default: m.ZenGymAiModal })));
const LogCardioModal = React.lazy(() => import('../../components/Gym/LogCardioModal').then(m => ({ default: m.LogCardioModal })));
const SwapRoutineModal = React.lazy(() => import('../../components/Gym/SwapRoutineModal').then(m => ({ default: m.SwapRoutineModal })));
const GymProfileModal = React.lazy(() => import('../../components/Gym/GymProfileModal').then(m => ({ default: m.GymProfileModal })));
const GymTemplateModal = React.lazy(() => import('../../components/Gym/GymTemplateModal').then(m => ({ default: m.GymTemplateModal })));
const GymScheduleSettingsModal = React.lazy(() => import('../../components/Gym/GymScheduleSettingsModal').then(m => ({ default: m.GymScheduleSettingsModal || m.default })));
const GymLocationModal = React.lazy(() => import('../../components/Gym/GymLocationModal').then(m => ({ default: m.GymLocationModal })));
const BodyMetricsSheet = React.lazy(() => import('../../components/Gym/BodyMetricsSheet'));
const PRHallOfFameSheet = React.lazy(() => import('../../components/Gym/PRHallOfFameSheet'));

// ─── Fast Muscle Weight Categorizer Helper ─────────────────────────────────────
function getMuscleWeight(m: string): number {
  const ml = m.toLowerCase();
  if (ml.includes('chest') || ml.includes('pec')) return 1;
  if (ml.includes('delt') || ml.includes('shoulder')) return 2;
  if (ml.includes('back') || ml.includes('lat') || ml.includes('trap')) return 3;
  if (ml.includes('bicep') || ml.includes('tricep') || ml.includes('brach') || ml.includes('forearm')) return 4;
  if (ml.includes('abs') || ml.includes('oblique') || ml.includes('core')) return 5;
  if (ml.includes('quad') || ml.includes('glute') || ml.includes('ham') || ml.includes('calf') || ml.includes('soleus')) return 6;
  return 7;
}

export const GymHomeScreen = memo(function GymHomeScreen() {
  const { colors, isDark } = useTheme();
  const s = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [weekOffset, setWeekOffset] = useState(0);

  // Animated pill visibility on scroll
  const pillAnim = useRef(new Animated.Value(0)).current;
  const isPillVisibleRef = useRef(false);

  // Live Geofence Status HUD State
  const [geofenceStatus, setGeofenceStatus] = useState<GeofenceDiagnosticStatus | null>(null);

  const refreshGeofenceStatus = useCallback(async () => {
    try {
      const status = await getGeofenceDiagnosticStatus();
      setGeofenceStatus(status);
      if (status.isConfigured && status.isEnabled && status.isLocationServicesEnabled) {
        checkImmediateGymProximity().catch(() => {});
      }
    } catch {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      isPillVisibleRef.current = false;
      pillAnim.setValue(0);
      const handle = InteractionManager.runAfterInteractions(() => {
        refreshGeofenceStatus();
      });
      return () => handle.cancel();
    }, [pillAnim, refreshGeofenceStatus])
  );

  const { gymLogs, gymLogsReady, waterLogs, sleepLogs, applyMasterTemplate, userGymPlan, updateMasterPlan, updateFullMasterPlan } = useWellnessData();
  const isInitialLoading = !gymLogsReady && !userGymPlan && (!gymLogs || gymLogs.length === 0);
  const { user } = useCoreData();

  // Background exercise GIF pre-caching for 100% offline gym workouts
  useGymPlanPreCache();

  // Streak calculation (deferred after frame 0)
  const [currentStreak, setCurrentStreak] = useState(0);
  useEffect(() => {
    const handle = InteractionManager.runAfterInteractions(async () => {
      const { calculateGymStreak } = await import('../../utils/gymUtils');
      setCurrentStreak(calculateGymStreak(gymLogs, userGymPlan));
    });
    return () => handle.cancel();
  }, [gymLogs, userGymPlan]);

  const handleGymNotifSaved = useCallback(() => {
    clearScheduleCache();
    scheduleAllNotifications({
      tasks: [],
      customEvents: [],
      attendance: [],
      gymLogs,
      waterLogs,
      sleepLogs,
      userGymPlan,
    } as any).catch(console.warn);
  }, [gymLogs, waterLogs, sleepLogs, userGymPlan]);

  const {
    log, startWorkout, resumeWorkout, endWorkout, addExercise, deleteExercise,
    updateSet, saveLog, addCardio, updateCardio, deleteCardio, planDay,
    swapDayRoutine, reorderExercisesFull, triggerDeload, forceOverrideTodayPlan
  } = useGymLog(selectedDate);

  // Autonomous Geofence Arrival: auto-starts local workout session and routes to ActiveLogging (ONCE ONLY)
  const hasAutoNavigatedToWorkoutRef = useRef(false);

  useEffect(() => {
    if (log?.completed) {
      hasAutoNavigatedToWorkoutRef.current = false;
    }
  }, [log?.completed]);

  useEffect(() => {
    const startSub = DeviceEventEmitter.addListener('gym_workout_auto_started', (event: any) => {
      if (hasAutoNavigatedToWorkoutRef.current) {
        return;
      }
      if (log?.workoutStartTime) {
        hasAutoNavigatedToWorkoutRef.current = true;
        return;
      }
      hasAutoNavigatedToWorkoutRef.current = true;
      startWorkout();
      navigation.navigate('ActiveLogging', {
        date: event?.date || todayStr(),
        initialIndex: 0,
      });
    });

    const finishSub = DeviceEventEmitter.addListener('gym_workout_auto_finished', () => {
      hasAutoNavigatedToWorkoutRef.current = false;
    });

    return () => {
      startSub.remove();
      finishSub.remove();
    };
  }, [navigation, log?.workoutStartTime, startWorkout]);

  // Extracted AI Plan Manager
  const {
    handleAiAddExercise,
    handleAiLogSet,
    handleAiGenerateWorkoutPlan,
    handleAiImportMultiDayPlan,
    handleAiAddExerciseToPlanDay,
  } = useGymAiPlanManager({
    log,
    saveLog,
    addExercise,
    updateSet,
    userGymPlan,
    updateMasterPlan,
    updateFullMasterPlan,
  });

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCardioModal, setShowCardioModal] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [showScheduleSettingsModal, setShowScheduleSettingsModal] = useState(false);
  const [showSwapRoutineModal, setShowSwapRoutineModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showWeeklyRecap, setShowWeeklyRecap] = useState(false);
  const [historyFor, setHistoryFor] = useState<{ id: string; name: string } | null>(null);
  const [logCardioFor, setLogCardioFor] = useState<GymCardioLog | null>(null);
  const [showBodyMetrics, setShowBodyMetrics] = useState(false);
  const [showPRHallOfFame, setShowPRHallOfFame] = useState(false);
  const [exerciseMenuFor, setExerciseMenuFor] = useState<any | null>(null);
  const [supersetPickerFor, setSupersetPickerFor] = useState<any | null>(null);
  const [cardioMenuFor, setCardioMenuFor] = useState<GymCardioLog | null>(null);
  const [showLocationModal, setShowLocationModal] = useState(false);

  // 1-Tap Location Issue Resolver (Google Play Services dialog or Permission Request)
  const handleResolveLocationIssue = useCallback(async () => {
    hapticMedium();
    if (!geofenceStatus?.isLocationServicesEnabled) {
      const enabled = await ensureLocationServicesEnabled();
      if (enabled) {
        refreshGeofenceStatus();
      }
    } else if (!geofenceStatus?.hasBackgroundPermission) {
      const granted = await requestLocationPermissions();
      if (!granted) {
        Alert.alert(
          'Background Location Needed',
          'To automatically start and finish workouts when your phone is locked or in your pocket:\n\n1. Tap "Open Settings" below\n2. Tap "Permissions" → "Location"\n3. Select "Allow all the time"',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Open Settings',
              onPress: () => {
                Linking.openSettings();
              },
            },
          ]
        );
      } else {
        refreshGeofenceStatus();
      }
    } else {
      setShowLocationModal(true);
    }
  }, [geofenceStatus, refreshGeofenceStatus]);

  // Progressive Overload Toast
  const [overloadToast, setOverloadToast] = useState<{
    exerciseName: string;
    suggestedWeight: number;
    currentWeight: number;
    step: number;
  } | null>(null);
  const overloadToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrollY = useRef(new Animated.Value(0)).current;
  const lastScrollY = useRef(0);

  const updatePillVisibility = useCallback((offsetY: number) => {
    const shouldShow = offsetY > 20;
    if (shouldShow !== isPillVisibleRef.current) {
      isPillVisibleRef.current = shouldShow;
      Animated.timing(pillAnim, {
        toValue: shouldShow ? 1 : 0,
        duration: shouldShow ? 140 : 80,
        useNativeDriver: true,
      }).start();
    }

    if (offsetY <= 35) {
      setTabBarVisible(true);
    } else {
      const diff = offsetY - lastScrollY.current;
      if (diff > 10) {
        setTabBarVisible(false);
      } else if (diff < -6) {
        setTabBarVisible(true);
      }
    }
    lastScrollY.current = offsetY;
  }, [pillAnim]);

  const headerFade = scrollY.interpolate({
    inputRange: [0, 50],
    outputRange: [1, 0.6],
    extrapolate: 'clamp',
  });

  const animWeek = useRef(new Animated.Value(1)).current;
  const animBanner = useRef(new Animated.Value(1)).current;
  const animList = useRef(new Animated.Value(1)).current;

  // Sub-5-min Abandoned Micro-Log Auto-Purge
  useEffect(() => {
    if (!log) return;
    const handle = InteractionManager.runAfterInteractions(() => {
      const isToday = selectedDate === todayStr();
      if (!isToday) return;

      const completedSetsCount = (log.exercises || []).reduce(
        (sum, ex) => sum + (ex.setsLog || []).filter((s: any) => s.completed).length,
        0
      );

      const isAbandonedQuickStart =
        !(log as any).completed &&
        completedSetsCount === 0 &&
        log.workoutDurationMinutes !== undefined &&
        log.workoutDurationMinutes < 5 &&
        !log.workoutStartTime;

      const isStaleZeroSession =
        !(log as any).completed &&
        completedSetsCount === 0 &&
        log.workoutStartTime &&
        Date.now() - log.workoutStartTime > 4 * 60 * 60 * 1000;

      if (isAbandonedQuickStart || isStaleZeroSession) {
        const fixed = {
          ...log,
          completed: false,
          workoutDurationMinutes: undefined,
          workoutStartTime: undefined,
          startTime: undefined,
          endTime: undefined,
          updatedAt: Date.now(),
        };
        saveLog(fixed);
      }
    });
    return () => handle.cancel();
  }, [log?.id, selectedDate, (log as any)?.completed, log?.workoutStartTime, log?.workoutDurationMinutes, saveLog]);

  // Session context for GYM-GPT
  const activeMuscles = useMemo(() =>
    [...new Set((log?.exercises || []).filter(ex => !ex.skipped).flatMap(ex => ex.muscle ? [ex.muscle] : []))]
      .map(m => ({ muscle: m as string })),
  [log?.exercises]);

  const doneSets = useMemo(() =>
    (log?.exercises || []).reduce((sum, ex) => sum + (ex.setsLog || []).filter((s: any) => s.completed).length, 0),
  [log?.exercises]);

  const totalSets = useMemo(() =>
    (log?.exercises || []).reduce((sum, ex) => sum + (ex.setsLog || []).length, 0),
  [log?.exercises]);

  // Progressive Overload Toast Trigger
  const prevExercisesDoneRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!log?.exercises || !gymLogs) return;
    const handle = InteractionManager.runAfterInteractions(() => {
      (log.exercises || []).forEach(ex => {
        if (ex.skipped) return;
        const allDone = ex.setsLog.length > 0 && ex.setsLog.every((s: any) => s.completed);
        if (!allDone || prevExercisesDoneRef.current.has(ex.exerciseId)) return;

        prevExercisesDoneRef.current.add(ex.exerciseId);
        const lastCompletedWeight = Math.max(...(ex.setsLog || []).map((s: any) => s.weight || 0));
        if (lastCompletedWeight <= 0) return;

        const suggestion = getOverloadSuggestion(
          { name: ex.name, isCompound: ex.isCompound },
          lastCompletedWeight,
          ex.setsLog.length,
          ex.targetReps || '8',
          gymLogs
        );

        if (suggestion?.type === 'increase') {
          if (overloadToastTimer.current) clearTimeout(overloadToastTimer.current);
          setOverloadToast({
            exerciseName: ex.name,
            suggestedWeight: suggestion.recommended,
            currentWeight: lastCompletedWeight,
            step: suggestion.weightDelta,
          });
          overloadToastTimer.current = setTimeout(() => setOverloadToast(null), 6000);
        }
      });
    });
    return () => handle.cancel();
  }, [log?.exercises, gymLogs]);

  useEffect(() => {
    prevExercisesDoneRef.current = new Set();
    setOverloadToast(null);
  }, [log?.id]);

  // Week Dates
  const weekDates = useMemo(() => {
    const today = todayStr();
    const [y, m, d] = today.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    const dayOfWeek = dateObj.getDay();
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const mondayOffset = -daysFromMonday + (weekOffset * 7);
    return Array.from({ length: 7 }, (_, i) => dateStrOffset(mondayOffset + i, today));
  }, [weekOffset]);

  const handleStartWorkout = useCallback(() => {
    hapticMedium();
    if (!log?.exercises || log.exercises.length === 0) {
      Alert.alert('No exercises', 'Please add exercises before starting the workout.');
      return;
    }
    startWorkout();
    navigation.navigate('ActiveLogging', { date: selectedDate });
  }, [log?.exercises, startWorkout, navigation, selectedDate]);

  const handleResumeWorkout = useCallback((index?: number) => {
    hapticMedium();
    if (!log?.exercises || log.exercises.length === 0) {
      Alert.alert('No exercises', 'Please add exercises to resume the workout.');
      return;
    }
    if (!log?.workoutStartTime) {
      resumeWorkout();
    }
    navigation.navigate('ActiveLogging', { date: selectedDate, initialIndex: typeof index === 'number' ? index : 0 });
  }, [log?.exercises, log?.workoutStartTime, resumeWorkout, navigation, selectedDate]);

  const activeExercisesData = useMemo(() => {
    if (planDay?.isRest || !log?.exercises) return [];
    return log.exercises
      .map((ex, originalIndex) => ({ ...ex, originalIndex }))
      .filter(ex => !ex.skipped);
  }, [log?.exercises, planDay?.isRest]);

  const sortedMuscles = useMemo(() => {
    if (!activeExercisesData || activeExercisesData.length === 0) return [];
    const muscleCounts: Record<string, number> = {};
    activeExercisesData.forEach(ex => {
      const resolved = resolveExerciseTargetMuscle(ex.name, ex.muscle).targetMuscle;
      const m = resolved || 'Mixed';
      muscleCounts[m] = (muscleCounts[m] || 0) + 1;
    });

    return Object.entries(muscleCounts).sort((a, b) => {
      const wA = getMuscleWeight(a[0]);
      const wB = getMuscleWeight(b[0]);
      if (wA !== wB) return wA - wB;
      return b[1] - a[1];
    });
  }, [activeExercisesData]);

  // Stable derivations from log — passed as individual props to GymExerciseDraggableRow
  // so React.memo can bail out when only unrelated log fields change (notes, timer, etc.)
  const logCompleted = log?.completed ?? false;
  const logWorkoutStartTime = log?.workoutStartTime ?? null;
  const logExercises = log?.exercises;

  // Item Renderer
  const renderExerciseItem = useCallback((itemParams: RenderItemParams<any>) => (
    <GymExerciseDraggableRow
      itemParams={itemParams}
      logCompleted={logCompleted}
      logWorkoutStartTime={logWorkoutStartTime}
      logExercises={logExercises}
      s={s}
      selectedDate={selectedDate}
      navigation={navigation}
      onResumeWorkout={handleResumeWorkout}
      onShowHistory={setHistoryFor}
      onShowMenu={setExerciseMenuFor}
    />
  ), [logCompleted, logWorkoutStartTime, logExercises, s, selectedDate, navigation, handleResumeWorkout]);

  // Header Renderer
  const renderHeader = useCallback(() => (
    <>
      {/* Week Strip */}
      <View style={s.weekStrip}>
        <TouchableOpacity onPress={() => { hapticLight(); LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setWeekOffset(prev => prev - 1); setSelectedDate(prev => dateStrOffset(-7, prev)); }} style={s.weekNavBtn}>
          <Ionicons name="chevron-back" size={16} color={COLORS.textTertiary} />
        </TouchableOpacity>

        <View style={s.weekDaysContainer}>
          {weekDates.map(date => {
            const isSelected = date === selectedDate;
            const [yyyy, mm, dd] = date.split('-');
            const dateObj = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
            const dateNum = dateObj.getDate();
            const days = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
            const dateDay = days[dateObj.getDay()];

            return (
              <TouchableOpacity key={date} style={s.dayCol} onPress={() => { hapticLight(); LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setSelectedDate(date); }}>
                <Text style={[s.dayLetter, isSelected && s.dayLetterActive]}>{dateDay}</Text>
                <View style={[s.dayPill, isSelected && s.dayPillActive]}>
                  <Text style={[s.dayNum, isSelected && s.dayNumActive]}>{dateNum}</Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity onPress={() => { hapticLight(); LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); setWeekOffset(prev => prev + 1); setSelectedDate(prev => dateStrOffset(7, prev)); }} style={s.weekNavBtn}>
          <Ionicons name="chevron-forward" size={16} color={COLORS.textTertiary} />
        </TouchableOpacity>
      </View>

      {/* Geofence Status HUD Pill */}
      {geofenceStatus?.isConfigured && geofenceStatus?.isEnabled && (
        <View style={{ paddingHorizontal: 12, marginBottom: 10 }}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handleResolveLocationIssue}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingVertical: 8,
              paddingHorizontal: 12,
              borderRadius: 12,
              borderWidth: 1,
              backgroundColor: !geofenceStatus.isLocationServicesEnabled
                ? 'rgba(255, 179, 71, 0.08)'
                : !geofenceStatus.hasBackgroundPermission
                ? 'rgba(255, 105, 97, 0.08)'
                : 'rgba(165, 153, 255, 0.08)',
              borderColor: !geofenceStatus.isLocationServicesEnabled
                ? 'rgba(255, 179, 71, 0.3)'
                : !geofenceStatus.hasBackgroundPermission
                ? 'rgba(255, 105, 97, 0.3)'
                : 'rgba(165, 153, 255, 0.25)',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
              <View
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: !geofenceStatus.isLocationServicesEnabled
                    ? '#ffb347'
                    : !geofenceStatus.hasBackgroundPermission
                    ? '#ff6961'
                    : '#5eda9e',
                }}
              />
              <Text
                style={{
                  fontSize: 12,
                  fontFamily: FONT_FAMILY.medium,
                  color: !geofenceStatus.isLocationServicesEnabled
                    ? '#ffb347'
                    : !geofenceStatus.hasBackgroundPermission
                    ? '#ff6961'
                    : '#e2ddff',
                }}
                numberOfLines={1}
              >
                {!geofenceStatus.isLocationServicesEnabled
                  ? 'Location is OFF • Tap to enable 1-tap GPS'
                  : !geofenceStatus.hasBackgroundPermission
                  ? 'Background location needed for pocket detection'
                  : `Auto-Tracking ${geofenceStatus.gymName} (${geofenceStatus.radius}m)`}
              </Text>
            </View>
            <Ionicons
              name={
                !geofenceStatus.isLocationServicesEnabled
                  ? 'chevron-forward'
                  : !geofenceStatus.hasBackgroundPermission
                  ? 'chevron-forward'
                  : 'options-outline'
              }
              size={14}
              color={
                !geofenceStatus.isLocationServicesEnabled
                  ? '#ffb347'
                  : !geofenceStatus.hasBackgroundPermission
                  ? '#ff6961'
                  : '#a599ff'
              }
            />
          </TouchableOpacity>
        </View>
      )}

      {planDay?.isRest ? (
        <WeeklyGymReport gymLogs={gymLogs} weekAnchorDate={selectedDate} userGymPlan={userGymPlan} />
      ) : (
        <>
          {selectedDate === todayStr() && (() => {
            const lastSleep = (sleepLogs || []).slice(-1)[0];
            const isLowReadiness = lastSleep && lastSleep.hours != null && lastSleep.hours < 6;
            if (isLowReadiness) {
              return (
                <View style={s.workoutSection}>
                  <TouchableOpacity onPress={() => { hapticMedium(); triggerDeload(); }} style={[s.readinessBanner, { backgroundColor: 'rgba(255, 159, 77, 0.1)', borderColor: 'rgba(255, 159, 77, 0.3)', marginBottom: 0 }]}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.accentAmber, marginBottom: 2 }}>Low Readiness Detected</Text>
                      <Text style={{ fontSize: 12, color: '#d1d1d6' }}>Sleep: {lastSleep.hours}h. Tap here to auto-deload -20% volume.</Text>
                    </View>
                    <Ionicons name="shield-checkmark" size={18} color={COLORS.accentAmber} />
                  </TouchableOpacity>
                </View>
              );
            }
            return null;
          })()}

          <View style={s.workoutSection}>
            <GymWorkoutBanner
              log={log}
              s={s}
              currentStreak={currentStreak}
              selectedDate={selectedDate}
              animBanner={animBanner}
              navigation={navigation}
              onStartWorkout={handleStartWorkout}
              onResumeWorkout={() => handleResumeWorkout()}
              onEndWorkout={endWorkout}
              resumeWorkout={resumeWorkout}
            />
          </View>

          {activeExercisesData.length > 0 && (
            <View style={{ paddingHorizontal: 8, marginBottom: 12, marginTop: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={s.sectionLabel}>EXERCISES</Text>
              </View>
            </View>
          )}
        </>
      )}
    </>
  ), [s, weekDates, selectedDate, planDay?.isRest, gymLogs, userGymPlan, sleepLogs, triggerDeload, log, currentStreak, animBanner, navigation, handleStartWorkout, handleResumeWorkout, endWorkout, resumeWorkout, activeExercisesData.length, geofenceStatus, handleResolveLocationIssue]);

  // Cardio Renderer
  // Stable Animated interpolation node — hoisted out of renderCardio so it isn't
  // recreated on every render (which disconnects the native Animated driver).
  const animListTranslateY = useMemo(
    () => animList.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }),
    [animList]
  );

  const renderCardio = useCallback(() => {
    const cardioItems = log?.cardio || [];
    return (
      <View style={s.section}>
        <Text style={s.sectionLabel}>CARDIO</Text>

        {cardioItems.map(c => {
          const isDone = c.completed;
          return (
            <Animated.View key={c.id} style={{ opacity: animList, transform: [{ translateY: animListTranslateY }] }}>
              <TouchableOpacity style={s.row} activeOpacity={0.7} onPress={() => setLogCardioFor(c)}>
                <View style={s.cardioSquare}>
                  {isDone ? (
                    <Ionicons name="checkmark" size={18} color={COLORS.background} />
                  ) : (
                    <Ionicons name="fitness-outline" size={18} color={COLORS.textMuted} />
                  )}
                </View>
                <View style={s.rowTextCol}>
                  <Text style={[s.rowTitle, isDone && s.textStrikethrough]}>{c.type || 'Cardio'}</Text>
                  <Text style={s.rowSubtitle}>
                    {c.durationMinutes ? `${c.durationMinutes} min` : '0 min'}
                    {c.distanceKm ? ` • ${c.distanceKm} km` : ''}
                    {c.speedKmh ? ` • ${c.speedKmh} km/h` : ''}
                    {c.incline ? ` • ${c.incline}% incline` : ''}
                    {c.floors ? ` • ${c.floors} floors` : ''}
                    {c.level ? ` • Lvl ${c.level}` : ''}
                    {c.laps ? ` • ${c.laps} laps` : ''}
                    {c.rounds ? ` • ${c.rounds} rounds` : ''}
                    {c.spm ? ` • ${c.spm} spm` : ''}
                    {c.pace ? ` • ${c.pace} min/km` : ''}
                  </Text>
                </View>
                <View style={s.rowActions}>
                  <TouchableOpacity
                    style={s.actionBtn}
                    onPress={() => {
                      hapticMedium();
                      setCardioMenuFor(c);
                    }}
                  >
                    <Ionicons name="ellipsis-horizontal" size={20} color={COLORS.textMuted} />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            </Animated.View>
          );
        })}

        <TouchableOpacity
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', marginTop: 4 }}
          activeOpacity={0.7}
          onPress={() => setShowCardioModal(true)}
        >
          <Ionicons name="add" size={14} color={COLORS.textMuted} />
          <Text style={{ fontFamily: FONT_FAMILY.medium, fontSize: 12, color: COLORS.textMuted }}>Add Cardio</Text>
        </TouchableOpacity>
      </View>
    );
  }, [log?.cardio, s, animList, animListTranslateY]);

  // Footer Renderer
  const renderFooter = useCallback(() => (
    <View style={{ paddingBottom: 0 }}>
      {!planDay?.isRest && (
        <View style={{ marginTop: 16 }}>
          {renderCardio()}
        </View>
      )}

      {sortedMuscles.length > 0 && (
        <View style={{ paddingHorizontal: 24, paddingTop: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16, opacity: 0.8 }}>
            <Ionicons name="analytics-outline" size={16} color={COLORS.textTertiary} />
            <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 11, color: COLORS.textTertiary, letterSpacing: 0.5, textTransform: 'uppercase' }}>Session Muscle Target</Text>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-start' }}>
            {sortedMuscles.map(([muscle, count]) => (
              <View key={muscle} style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.03)',
                paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
              }}>
                <Text style={{ fontSize: 10, color: COLORS.textMuted, fontFamily: FONT_FAMILY.medium, flexShrink: 1 }} numberOfLines={1}>{muscle}</Text>
                <Text style={{ fontSize: 10, color: COLORS.textTertiary, fontFamily: FONT_FAMILY.bold, marginLeft: 4 }}>×{count}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  ), [planDay?.isRest, renderCardio, sortedMuscles]);

  return (
    <View style={s.root}>
      <View style={{ flex: 1 }}>
        {/* Sticky Header */}
        <View style={[s.topHeaderWrapper, { top: insets.top }]} pointerEvents="box-none">
          <View style={s.headerInner}>
            <Text style={s.headerTitle}>Gym</Text>
            <View style={s.headerActions}>
              <TouchableOpacity onPress={() => { hapticMedium(); setShowSwapRoutineModal(true); }} style={s.morphBtn} activeOpacity={0.7}>
                <View style={s.morphBtnIconWrap}>
                  <Animated.View style={[s.morphBtnPill, { opacity: pillAnim }]} />
                  <Ionicons name="swap-horizontal-outline" size={16} color={COLORS.textMuted} />
                </View>
                <Text style={s.headerBtnText}>Swap</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => { hapticMedium(); setShowWeeklyRecap(true); }} style={s.morphBtn} activeOpacity={0.7}>
                <View style={s.morphBtnIconWrap}>
                  <Animated.View style={[s.morphBtnPill, { opacity: pillAnim }]} />
                  <Ionicons name="bar-chart-outline" size={16} color={COLORS.textMuted} />
                </View>
                <Text style={s.headerBtnText}>Recap</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => { hapticMedium(); setShowScheduleSettingsModal(true); }} style={s.morphBtn} activeOpacity={0.7}>
                <View style={s.morphBtnIconWrap}>
                  <Animated.View style={[s.morphBtnPill, { opacity: pillAnim }]} />
                  <Ionicons name="calendar-outline" size={16} color={COLORS.textMuted} />
                </View>
                <Text style={s.headerBtnText}>Schedule</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => {
                hapticMedium();
                setShowTemplateModal(true);
              }} style={s.morphBtn} activeOpacity={0.7}>
                <View style={s.morphBtnIconWrap}>
                  <Animated.View style={[s.morphBtnPill, { opacity: pillAnim }]} />
                  <Ionicons name="document-text-outline" size={16} color={COLORS.textMuted} />
                </View>
                <Text style={s.headerBtnText}>Plan</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => { hapticMedium(); setShowBodyMetrics(true); }} style={s.morphBtn} activeOpacity={0.7}>
                <View style={s.morphBtnIconWrap}>
                  <Animated.View style={[s.morphBtnPill, { opacity: pillAnim }]} />
                  <Ionicons name="body-outline" size={16} color={COLORS.textMuted} />
                </View>
                <Text style={s.headerBtnText}>Body</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => { hapticMedium(); setShowLocationModal(true); }} style={s.morphBtn} activeOpacity={0.7}>
                <View style={s.morphBtnIconWrap}>
                  <Animated.View style={[s.morphBtnPill, { opacity: pillAnim }]} />
                  <Ionicons
                    name="location-outline"
                    size={16}
                    color={
                      geofenceStatus?.isConfigured && geofenceStatus?.isEnabled
                        ? (!geofenceStatus.isLocationServicesEnabled ? '#ffb347' : '#a599ff')
                        : COLORS.textMuted
                    }
                  />
                  {geofenceStatus?.isConfigured && geofenceStatus?.isEnabled && (
                    <View
                      style={{
                        position: 'absolute',
                        top: 4,
                        right: 4,
                        width: 5,
                        height: 5,
                        borderRadius: 2.5,
                        backgroundColor: !geofenceStatus.isLocationServicesEnabled ? '#ffb347' : '#5eda9e',
                      }}
                    />
                  )}
                </View>
                <Text
                  style={[
                    s.headerBtnText,
                    geofenceStatus?.isConfigured && geofenceStatus?.isEnabled
                      ? { color: !geofenceStatus.isLocationServicesEnabled ? '#ffb347' : '#a599ff' }
                      : null,
                  ]}
                >
                  GPS
                </Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => { hapticMedium(); navigation.navigate('GymProgress'); }} style={s.morphBtn} activeOpacity={0.7}>
                <View style={s.morphBtnIconWrap}>
                  <Animated.View style={[s.morphBtnPill, { opacity: pillAnim }]} />
                  <Ionicons name="bar-chart-outline" size={16} color={COLORS.textMuted} />
                </View>
                <Text style={s.headerBtnText}>Stats</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => { hapticMedium(); setShowAddModal(true); }} style={s.morphBtn} activeOpacity={0.7}>
                <View style={s.morphBtnIconWrap}>
                  <Animated.View style={[s.morphBtnPill, s.morphBtnPillAccent, { opacity: pillAnim }]} />
                  <Ionicons name="add" size={18} color="#a599ff" />
                </View>
                <Text style={[s.headerBtnText, { color: '#a599ff' }]}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={{ flex: 1 }}>
          {isInitialLoading ? (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[s.scrollContent, { paddingTop: insets.top + 58 }]}>
              <GymHomeSkeleton />
            </ScrollView>
          ) : (
            <DraggableFlatList
              data={activeExercisesData}
              keyExtractor={(item, index) => (item.exerciseId || item.id || item.name || 'ex') + '-' + index}
              renderItem={renderExerciseItem}
              ListHeaderComponent={renderHeader}
              ListFooterComponent={renderFooter}
              containerStyle={{ flex: 1 }}
              activationDistance={20}
            onDragEnd={({ data }) => {
              if (!log) return;
              const newFullList = [];
              let activeIdx = 0;
              for (let i = 0; i < log.exercises.length; i++) {
                if (log.exercises[i].skipped) {
                  newFullList.push(log.exercises[i]);
                } else {
                  const draggedItem = { ...data[activeIdx] } as any;
                  delete draggedItem.originalIndex;
                  newFullList.push(draggedItem);
                  activeIdx++;
                }
              }
              reorderExercisesFull(newFullList);
            }}
            contentContainerStyle={[s.scrollContent, { paddingTop: insets.top + 58 }]}
            showsVerticalScrollIndicator={false}
            onScrollOffsetChange={updatePillVisibility}
            onScroll={(e: any) => {
              const y = e?.nativeEvent?.contentOffset?.y ?? 0;
              updatePillVisibility(y);
            }}
            onScrollEndDrag={(e: any) => {
              const y = e?.nativeEvent?.contentOffset?.y ?? 0;
              if (y <= 30) setTabBarVisible(true);
              if (y <= 20 && isPillVisibleRef.current) {
                isPillVisibleRef.current = false;
                Animated.timing(pillAnim, { toValue: 0, duration: 50, useNativeDriver: true }).start();
              }
            }}
            onMomentumScrollEnd={(e: any) => {
              const y = e?.nativeEvent?.contentOffset?.y ?? 0;
              if (y <= 30) setTabBarVisible(true);
              if (y <= 20 && isPillVisibleRef.current) {
                isPillVisibleRef.current = false;
                Animated.timing(pillAnim, { toValue: 0, duration: 50, useNativeDriver: true }).start();
              }
            }}
            scrollEventThrottle={16}
          />
        )}

          {/* Lazy Modals & Sheets */}
          <Suspense fallback={null}>
            {showAddModal && (
              <AddExerciseModal
                visible={showAddModal}
                onClose={() => setShowAddModal(false)}
                onAdd={addExercise}
                planDay={planDay}
                existingExerciseIds={log?.exercises.map(e => e.exerciseId) || []}
              />
            )}
            {showCardioModal && (
              <AddCardioModal visible={showCardioModal} onClose={() => setShowCardioModal(false)} onAdd={addCardio} />
            )}
            {!!historyFor && (
              <ExerciseHistoryDrawer
                visible={!!historyFor}
                exerciseId={historyFor?.id || null}
                exerciseName={historyFor?.name || null}
                onClose={() => setHistoryFor(null)}
              />
            )}
            {!!logCardioFor && (
              <LogCardioModal
                visible={!!logCardioFor}
                cardio={logCardioFor}
                onClose={() => setLogCardioFor(null)}
                onSave={(updates) => log?.cardio && updateCardio(logCardioFor!.id, updates)}
              />
            )}

            {showAiModal && (
              <ZenGymAiModal
                visible={showAiModal}
                onClose={() => setShowAiModal(false)}
                workoutData={{ activeMuscles: activeMuscles.map(m => m.muscle).join(', '), doneSets, totalSets }}
                onAddExercise={handleAiAddExercise}
                onDeleteExercise={deleteExercise}
                onLogSet={handleAiLogSet}
                onGenerateWorkoutPlan={handleAiGenerateWorkoutPlan}
                onImportMultiDayPlan={handleAiImportMultiDayPlan}
                onAddExerciseToPlanDay={handleAiAddExerciseToPlanDay}
                onAutoregulateDeload={triggerDeload}
                userGymPlan={userGymPlan}
                currentPlanDay={planDay}
              />
            )}

            {showScheduleSettingsModal && (
              <GymScheduleSettingsModal
                visible={showScheduleSettingsModal}
                onClose={() => setShowScheduleSettingsModal(false)}
                userGymPlan={userGymPlan}
                onSaveWeekly={updateFullMasterPlan}
                currentStartTime={log?.startTime}
                currentEndTime={log?.endTime}
                onSaveOverride={(start, end) => {
                  saveLog({
                    ...(log || {
                      id: `gym_${selectedDate}`,
                      userId: user?.uid || 'temp',
                      dayPlanIndex: planDayIndexForDate(selectedDate),
                      date: selectedDate,
                      exercises: [],
                      cardio: [],
                      createdAt: Date.now(),
                      updatedAt: Date.now(),
                      completed: false,
                    }),
                    startTime: start,
                    endTime: end,
                    updatedAt: Date.now(),
                  } as any);
                }}
                onNotifSaved={handleGymNotifSaved}
              />
            )}

            {showSwapRoutineModal && (
              <SwapRoutineModal
                visible={showSwapRoutineModal}
                selectedDate={selectedDate}
                currentPlanDayIndex={log?.dayPlanIndex || planDay?.dayIndex}
                onClose={() => setShowSwapRoutineModal(false)}
                onSelectDay={(targetDayIdx) => swapDayRoutine(targetDayIdx)}
              />
            )}

            {showProfileModal && (
              <GymProfileModal
                visible={showProfileModal}
                onClose={() => setShowProfileModal(false)}
              />
            )}

            {showTemplateModal && (
              <GymTemplateModal
                visible={showTemplateModal}
                onClose={() => setShowTemplateModal(false)}
                onApply={async (templateId, schedulePattern) => {
                  const newCustomDays = await applyMasterTemplate(templateId, schedulePattern);
                  if (!log?.workoutStartTime && newCustomDays) {
                    forceOverrideTodayPlan(newCustomDays);
                    setWeekOffset(prev => prev);
                  }
                }}
              />
            )}

            {showBodyMetrics && <BodyMetricsSheet visible={showBodyMetrics} onClose={() => setShowBodyMetrics(false)} />}
            {showPRHallOfFame && <PRHallOfFameSheet visible={showPRHallOfFame} onClose={() => setShowPRHallOfFame(false)} />}
            {showLocationModal && (
              <GymLocationModal
                visible={showLocationModal}
                onClose={() => {
                  setShowLocationModal(false);
                  refreshGeofenceStatus();
                }}
              />
            )}

            {showWeeklyRecap && (
              <Modal
                visible={showWeeklyRecap}
                animationType="slide"
                transparent={false}
                onRequestClose={() => setShowWeeklyRecap(false)}
                statusBarTranslucent
              >
                <SafeAreaView style={{ flex: 1, backgroundColor: '#000000' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)' }}>
                    <Text style={{ fontSize: 17, fontFamily: FONT_FAMILY.bold, color: '#FFFFFF' }}>Weekly Recap</Text>
                    <TouchableOpacity onPress={() => { hapticLight(); setShowWeeklyRecap(false); }} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                      <Ionicons name="close" size={22} color={COLORS.textMuted} />
                    </TouchableOpacity>
                  </View>
                  <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
                    <WeeklyGymReport gymLogs={gymLogs} weekAnchorDate={selectedDate} userGymPlan={userGymPlan} />
                  </ScrollView>
                </SafeAreaView>
              </Modal>
            )}
          </Suspense>

          {(!!exerciseMenuFor || !!supersetPickerFor || !!cardioMenuFor) && (
            <GymExerciseOptionsSheet
              exerciseMenuFor={exerciseMenuFor}
              setExerciseMenuFor={setExerciseMenuFor}
              supersetPickerFor={supersetPickerFor}
              setSupersetPickerFor={setSupersetPickerFor}
              cardioMenuFor={cardioMenuFor}
              setCardioMenuFor={setCardioMenuFor}
              setLogCardioFor={setLogCardioFor}
              deleteCardio={deleteCardio}
              deleteExercise={deleteExercise}
              reorderExercisesFull={reorderExercisesFull}
              log={log}
              selectedDate={selectedDate}
              userGymPlan={userGymPlan}
              updateMasterPlan={updateMasterPlan}
              navigation={navigation}
              colors={colors}
              isDark={isDark}
              s={s}
            />
          )}
        </View>
      </View>

      {/* Progressive Overload Toast */}
      {overloadToast && (
        <Animated.View
          style={{
            position: 'absolute',
            bottom: 160,
            left: 16,
            right: 16,
            backgroundColor: isDark ? '#1a2a1a' : '#ECFDF5',
            borderRadius: 16,
            padding: 14,
            borderWidth: 1,
            borderColor: isDark ? 'rgba(52,199,89,0.35)' : '#A7F3D0',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            shadowColor: isDark ? '#34C759' : '#059669',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: isDark ? 0.25 : 0.15,
            shadowRadius: 12,
            elevation: 12,
            zIndex: 9998,
          }}
        >
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: isDark ? 'rgba(52,199,89,0.15)' : 'rgba(5,150,105,0.12)', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 18 }}>💪</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, fontFamily: FONT_FAMILY.bold, color: isDark ? '#34C759' : '#059669', marginBottom: 2 }}>
              Progressive Overload Ready!
            </Text>
            <Text style={{ fontSize: 11, fontFamily: FONT_FAMILY.body, color: isDark ? '#c7f7d4' : '#065F46', lineHeight: 15 }} numberOfLines={2}>
              {overloadToast.exerciseName}: try {overloadToast.suggestedWeight}kg next session (+{overloadToast.step}kg from {overloadToast.currentWeight}kg)
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => { if (overloadToastTimer.current) clearTimeout(overloadToastTimer.current); setOverloadToast(null); }}
            style={{ padding: 4 }}
          >
            <Ionicons name="close" size={16} color={isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'} />
          </TouchableOpacity>
        </Animated.View>
      )}

      <ZenGymAiFab onPress={() => setShowAiModal(true)} />
    </View>
  );
});

export default GymHomeScreen;
