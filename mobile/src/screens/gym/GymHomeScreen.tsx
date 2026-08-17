import React, { useEffect, useRef, useState, useMemo, memo, useCallback } from 'react';
import WorkoutTimer from '../../components/Gym/WorkoutTimer';
import { View, Text, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform, Alert, Animated, Image, Modal, LayoutAnimation, Dimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import DraggableFlatList, { ScaleDecorator, RenderItemParams } from 'react-native-draggable-flatlist';
import { hapticLight, hapticMedium } from '../../utils/haptics';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';

import { doc, deleteDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { COLLECTION } from '../../config/constants';

import { useWellnessData } from '../../contexts/domains/WellnessContext';
import { useCoreData } from '../../contexts/domains/CoreDataContext';
import { useGymLog, todayStr, dateStrOffset, planDayIndexForDate } from '../../hooks/useGymLog';
import { GYM_PLAN_PPL, GYM_PLAN_ARNOLD } from '../../data/gymPlan';
import type { GymPlanDay } from '../../types/gym.types';
import { calculateGymStreak } from '../../utils/gymUtils';
import { clearScheduleCache, scheduleAllNotifications } from '../../services/notifications';

import { useTheme } from '../../contexts/ThemeContext';
import { COLORS, SPACE, RADIUS, FONT_FAMILY, FONT_SIZE, SHADOW } from '../../theme/tokens';

import { AddExerciseModal } from '../../components/Gym/AddExerciseModal';
import { AddCardioModal } from '../../components/Gym/AddCardioModal';
import { ExerciseHistoryDrawer } from '../../components/Gym/ExerciseHistoryDrawer';
import { ZenGymAiModal, type MultiDayPlanEntry } from '../../components/Gym/ZenGymAiModal';
import { LogCardioModal } from '../../components/Gym/LogCardioModal';
import { SwapRoutineModal } from '../../components/Gym/SwapRoutineModal';
import { GymProfileModal } from '../../components/Gym/GymProfileModal';
import { GymTemplateModal } from '../../components/Gym/GymTemplateModal';
import { GymScheduleSettingsModal } from '../../components/Gym/GymScheduleSettingsModal';
import WeeklyGymReport from '../../components/Gym/WeeklyGymReport';
import { GymCardioLog } from '../../types/gym.types';
import BodyMetricsSheet from '../../components/Gym/BodyMetricsSheet';
import PRHallOfFameSheet from '../../components/Gym/PRHallOfFameSheet';
import { useGymProfile } from '../../hooks/useGymProfile';
import { ZenGymAiFab } from '../../components/Gym/ZenGymAiFab';
import { handleSyncError } from '../../utils/errorUtils';
import { getOverloadSuggestion } from '../../services/progressiveOverload';
import { setTabBarVisible } from '../../utils/tabBarScroll';
import BottomSheet from '../../components/ui/BottomSheet';

import { StatusBar } from 'expo-status-bar';

// ─── Design Tokens ────────────────────────────────────────────────────────────

export const GymHomeScreen = memo(function GymHomeScreen() {
  const { colors, isDark } = useTheme();
  const s = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [weekOffset, setWeekOffset] = useState(0);

  // ── Animated pill visibility: 0 at top (flat/normal), 1 on scroll (glass pills) ──
  const pillAnim = useRef(new Animated.Value(0)).current;
  const isPillVisibleRef = useRef(false);

  // Reset scroll-linked pill animation when screen focuses
  useFocusEffect(
    useCallback(() => {
      isPillVisibleRef.current = false;
      pillAnim.setValue(0);
    }, [pillAnim])
  );

  const { gymLogs, waterLogs, sleepLogs, applyMasterTemplate, userGymPlan, updateMasterPlan, updateFullMasterPlan } = useWellnessData();
  const { user } = useCoreData();
  const currentStreak = useMemo(() => calculateGymStreak(gymLogs, userGymPlan), [gymLogs, userGymPlan]);

  // BUG-3 FIX: Callback passed to GymNotificationModal so gym reminder time
  // changes reschedule immediately (not just on next app open or data change).
  const handleGymNotifSaved = () => {
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
  };

  const { log, startWorkout, resumeWorkout, endWorkout, addExercise, deleteExercise, updateSet, saveLog, addCardio, updateCardio, deleteCardio, planDay, swapDayRoutine, reorderExercise, reorderExercisesFull, triggerDeload, forceOverrideTodayPlan } = useGymLog(selectedDate);

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCardioModal, setShowCardioModal] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [showScheduleSettingsModal, setShowScheduleSettingsModal] = useState(false);
  const [showSwapRoutineModal, setShowSwapRoutineModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [historyFor, setHistoryFor] = useState<{ id: string; name: string } | null>(null);
  const [logCardioFor, setLogCardioFor] = useState<GymCardioLog | null>(null);
  const [showBodyMetrics, setShowBodyMetrics] = useState(false);
  const [showPRHallOfFame, setShowPRHallOfFame] = useState(false);
  const [exerciseMenuFor, setExerciseMenuFor] = useState<any | null>(null);
  const [supersetPickerFor, setSupersetPickerFor] = useState<any | null>(null);
  const [cardioMenuFor, setCardioMenuFor] = useState<GymCardioLog | null>(null);

  // ── Progressive Overload Toast state ────────────────────────────────────────
  const [overloadToast, setOverloadToast] = useState<{
    exerciseName: string;
    suggestedWeight: number;
    currentWeight: number;
    step: number;
  } | null>(null);
  const overloadToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const SCREEN_HEIGHT = Dimensions.get('window').height;
  const scrollViewRef = useRef<any>(null);
  const currentScrollY = useRef<number>(0);
  const scrollY = useRef(new Animated.Value(0)).current;
  const lastScrollY = useRef(0);

  const updatePillVisibility = useCallback((offsetY: number) => {
    currentScrollY.current = offsetY;
    const shouldShow = offsetY > 20;
    if (shouldShow !== isPillVisibleRef.current) {
      isPillVisibleRef.current = shouldShow;
      Animated.timing(pillAnim, {
        toValue: shouldShow ? 1 : 0,
        duration: shouldShow ? 140 : 80, // Instantly disappears in 80ms on scroll-up
        useNativeDriver: true,
      }).start();
    }

    // Auto-hiding bottom navigation bar on scroll (fast & smooth)
    if (offsetY <= 35) {
      setTabBarVisible(true);
    } else {
      const diff = offsetY - lastScrollY.current;
      if (diff > 10) {
        setTabBarVisible(false); // Scroll down -> hide
      } else if (diff < -6) {
        setTabBarVisible(true); // Scroll up -> show instantly
      }
    }
    lastScrollY.current = offsetY;
  }, [pillAnim]);

  const headerFade = scrollY.interpolate({
    inputRange: [0, 50],
    outputRange: [1, 0.6],
    extrapolate: 'clamp',
  });

  const animHeader = useRef(new Animated.Value(1)).current;
  const animWeek = useRef(new Animated.Value(1)).current;
  const animBanner = useRef(new Animated.Value(1)).current;
  const animList = useRef(new Animated.Value(1)).current;

  // ─── Sub-5-min Abandoned Micro-Log Auto-Purge ──────────────────────────
  // If a workout was started but abandoned without any completed sets,
  // or has duration < 5 min with 0 sets logged, auto-reset it so junk logs don't clutter history.
  useEffect(() => {
    if (!log) return;
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
  }, [log?.id, selectedDate, (log as any)?.completed, log?.workoutStartTime, log?.workoutDurationMinutes]);

  // ── Real-time session context for GYM-GPT ─────────────────────────────────
  // Previously hardcoded mocks — now computed from actual log data so GYM-GPT
  // knows exactly what muscles were trained and how many sets are done.
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

  // ── Progressive Overload Toast trigger ────────────────────────────────────
  // Fires when an exercise becomes 100% complete (all sets done).
  // Checks if the user has hit targets for 2+ past sessions and surfaces a
  // weight increase suggestion — the core value of apps like Hevy / Strong.
  const prevExercisesDoneRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!log?.exercises || !gymLogs) return;
    (log.exercises || []).forEach(ex => {
      if (ex.skipped) return;
      const allDone = ex.setsLog.length > 0 && ex.setsLog.every((s: any) => s.completed);
      if (!allDone || prevExercisesDoneRef.current.has(ex.exerciseId)) return;

      // Mark as already triggered so we don't re-fire on re-render
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
        // Clear any existing toast timer
        if (overloadToastTimer.current) clearTimeout(overloadToastTimer.current);
        setOverloadToast({
          exerciseName: ex.name,
          suggestedWeight: suggestion.recommended,
          currentWeight: lastCompletedWeight,
          step: suggestion.weightDelta,
        });
        // Auto-dismiss after 6 seconds
        overloadToastTimer.current = setTimeout(() => setOverloadToast(null), 6000);
      }
    });
  }, [log?.exercises, gymLogs]);

  // Reset done-set tracker when date/log changes
  useEffect(() => {
    prevExercisesDoneRef.current = new Set();
    setOverloadToast(null);
  }, [log?.id]);

  const handleAiAddExercise = (name: string, targetSets: number, targetReps: string) => {
    addExercise({
      exerciseId: `ai_${Date.now()}`,
      name,
      targetSets,
      targetReps,
      muscle: 'Mixed', // Default, could be refined
      videoId: '',
      restTimeSecs: 90,
      setsLog: Array.from({ length: targetSets }, (_, i) => ({
        setNumber: i + 1,
        reps: null,
        weight: null,
        completed: false
      }))
    });
  };

  const handleAiLogSet = (exerciseIndex: number, setIndex: number, weightKg: number, reps: number) => {
    updateSet(exerciseIndex, setIndex, {
      setNumber: setIndex + 1,
      weight: weightKg,
      reps,
      completed: true
    });
  };

  const handleAiGenerateWorkoutPlan = (planName: string, exercises: { name: string, sets: number, reps: string }[]) => {
    if (!log) return;
    const newExercises = exercises.map((e, idx) => ({
      exerciseId: `ai_plan_${Date.now()}_${idx}`,
      name: e.name,
      targetSets: e.sets,
      targetReps: e.reps,
      muscle: 'Mixed',
      videoId: '',
      restTimeSecs: 90,
      setsLog: Array.from({ length: e.sets }, (_, i) => ({
        setNumber: i + 1,
        reps: null,
        weight: null,
        completed: false
      }))
    }));
    
    // Create a whole new log structure, overriding current exercises
    saveLog({
      ...log,
      exercises: newExercises,
      updatedAt: Date.now()
    });
  };

  /**
   * Import a multi-day plan generated by GYM-GPT directly into the recurring
   * gym calendar (customDays). This is permanent — applies every future week.
   */
  const handleAiImportMultiDayPlan = async (planName: string, days: MultiDayPlanEntry[]) => {
    const newCustomDays = { ...(userGymPlan?.customDays || {}) };
    for (const d of days) {
      newCustomDays[d.dayIndex] = {
        dayIndex: d.dayIndex,
        name: d.dayName,
        subtitle: d.focus || d.dayName,
        focus: d.focus || d.dayName,
        exercises: d.exercises.map((ex, idx) => ({
          id: `ai_import_${d.dayIndex}_${Date.now()}_${idx}`,
          name: ex.name,
          targetSets: ex.targetSets,
          targetReps: ex.targetReps,
          muscle: ex.muscle || 'Mixed',
          videoId: '',
          restTimeSecs: 90,
          isCompound: false,
        })),
        isRest: false,
      };
    }
    await updateFullMasterPlan(newCustomDays);
  };

  /**
   * Add a single exercise to a specific recurring plan day (permanent).
   * dayIndex: 1=Monday … 7=Sunday
   */
  const handleAiAddExerciseToPlanDay = async (
    dayIndex: number,
    dayName: string,
    exercise: { name: string; targetSets: number; targetReps: string; muscle?: string }
  ) => {
    const { GYM_PLAN } = require('../../data/gymPlan');
    const existingDay = userGymPlan?.customDays?.[dayIndex] ||
      (GYM_PLAN as GymPlanDay[]).find(d => d.dayIndex === dayIndex);

    const updatedDay: GymPlanDay = {
      dayIndex,
      name: existingDay?.name || dayName,
      subtitle: existingDay?.subtitle || dayName,
      focus: existingDay?.focus || dayName,
      exercises: [
        ...(existingDay?.exercises || []),
        {
          id: `ai_add_${dayIndex}_${Date.now()}`,
          name: exercise.name,
          targetSets: exercise.targetSets,
          targetReps: exercise.targetReps,
          muscle: exercise.muscle || 'Mixed',
          videoId: '',
          restTimeSecs: 90,
          isCompound: false,
        },
      ],
      isRest: false,
    };
    await updateMasterPlan(dayIndex, updatedDay);
  };

  // Date strip: Standard Monday to Sunday calendar week
  const weekDates = useMemo(() => {
    const today = todayStr();
    const [y, m, d] = today.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    const dayOfWeek = dateObj.getDay(); // 0 is Sunday, 1 is Monday...
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const mondayOffset = -daysFromMonday + (weekOffset * 7);
    return Array.from({ length: 7 }, (_, i) => dateStrOffset(mondayOffset + i, today));
  }, [weekOffset]);

  const handleStartWorkout = () => {
    hapticMedium();
    if (!log?.exercises || log.exercises.length === 0) {
      Alert.alert('No exercises', 'Please add exercises before starting the workout.');
      return;
    }
    if (!log?.workoutStartTime) startWorkout();
    navigation.navigate('ActiveLogging', { date: selectedDate });
  };

  const handleResumeWorkout = (index?: number) => {
    hapticMedium();
    if (!log?.exercises || log.exercises.length === 0) {
      Alert.alert('No exercises', 'Please add exercises to resume the workout.');
      return;
    }

    if (!log?.workoutStartTime) {
      Alert.alert(
        'Start Workout?',
        'Do you want to start the workout timer, or just check the exercises?',
        [
          { 
            text: 'Just Checking', 
            style: 'cancel',
            onPress: () => {
              navigation.navigate('ActiveLogging', { date: selectedDate, initialIndex: typeof index === 'number' ? index : 0 });
            }
          },
          { 
            text: 'Start Workout', 
            style: 'default',
            onPress: () => {
              resumeWorkout();
              navigation.navigate('ActiveLogging', { date: selectedDate, initialIndex: typeof index === 'number' ? index : 0 });
            }
          },
        ]
      );
      return;
    }

    if (log.workoutDurationMinutes !== undefined) {
      resumeWorkout();
    }
    navigation.navigate('ActiveLogging', { date: selectedDate, initialIndex: typeof index === 'number' ? index : 0 });
  };

  // Renderers
  const renderWorkoutBanner = () => {
    if ((log as any)?.completed || (log?.workoutDurationMinutes !== undefined && !log?.workoutStartTime)) {
      return (
        <View style={s.completedBanner}>
          <View style={s.completedBannerLeft}>
            <Text style={s.completedBannerTitle}>Workout Completed</Text>
            <Text style={s.completedBannerSub}>
              {log?.workoutDurationMinutes ? `${log.workoutDurationMinutes} min session` : 'Session completed'}
            </Text>
          </View>
          {currentStreak > 0 && (
            <View style={s.streakBadgeInline}>
              <Ionicons name="flame" size={14} color={COLORS.accentAmber} />
              <Text style={s.streakBadgeInlineText}>{currentStreak} Day</Text>
            </View>
          )}
        </View>
      );
    }
    if (log?.workoutStartTime && !(log as any)?.completed) {
      return (
        <View style={s.activeBanner}>
          <View style={s.activeBannerLeft}>
            <View style={s.activeIndicator} />
            <Text style={s.activeBannerTitle}>IN PROGRESS  •  </Text>
            <WorkoutTimer startTime={log.workoutStartTime} />
          </View>
          <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
            <TouchableOpacity onPress={() => {
              hapticMedium();
              if (log?.workoutStartTime) {
                const durationMins = Math.round((Date.now() - log.workoutStartTime) / 60000);
                if (durationMins < 10) {
                  Alert.alert(
                    'Finish Workout 💪',
                    `Your session is ${Math.max(1, durationMins)} min${durationMins !== 1 ? 's' : ''}. Complete this workout now?`,
                    [
                      { text: 'Keep Going', style: 'cancel' },
                      { 
                        text: 'Finish Workout', 
                        style: 'default',
                        onPress: () => {
                          endWorkout(true);
                          navigation.navigate('WorkoutSummary', { date: selectedDate });
                        }
                      }
                    ]
                  );
                  return;
                }
              }
              endWorkout(true);
              navigation.navigate('WorkoutSummary', { date: selectedDate });
            }}>
              <Text style={{ color: '#ef4444', fontSize: 14, fontWeight: '600' }}>Finish</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleResumeWorkout()}>
              <Text style={s.activeBannerResume}>Resume</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }
    return (
      <Animated.View style={{ opacity: animBanner, transform: [{ translateY: animBanner.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
        <TouchableOpacity style={s.startBtn} onPress={handleStartWorkout} activeOpacity={0.8}>
          <Text style={s.startBtnText}>START WORKOUT</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  const renderCardio = () => {
    const cardioItems = log?.cardio || [];
    return (
      <View style={s.section}>
        <Text style={s.sectionLabel}>CARDIO</Text>

        {cardioItems.map(c => {
          const isDone = c.completed;
          return (
            <Animated.View key={c.id} style={{ opacity: animList, transform: [{ translateY: animList.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
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
                {/* Ellipsis menu ΓÇö matches exercise row pattern */}
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

        {/* Compact Add Cardio pill */}
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
  };


  const activeExercisesData = useMemo(() => {
    if (planDay?.isRest) return [];
    if (!log?.exercises) return [];
    return log.exercises
      .map((ex, originalIndex) => ({ ...ex, originalIndex }))
      .filter(ex => !ex.skipped);
  }, [log?.exercises, planDay?.isRest]);

  const renderExerciseItem = useCallback(({ item: ex, drag, isActive }: RenderItemParams<any>) => {
    const isDone = ex.setsLog.length > 0 && ex.setsLog.every((set: any) => set.completed);
    const totalSets = ex.setsLog.length;
    const completedSets = ex.setsLog.filter((s: any) => s.completed);
    
    let subText = '';
    if (completedSets.length > 0) {
      const avgReps = Math.round(completedSets.reduce((sum: number, s: any) => sum + (s.reps || 0), 0) / completedSets.length) || 0;
      const maxWeight = Math.max(...completedSets.map((s: any) => s.weight || 0));
      subText = `${completedSets.length}/${totalSets} sets, ~${avgReps} reps ${maxWeight > 0 ? `@ ${maxWeight}kg` : ''}`;
    } else {
      subText = `${totalSets} sets, ${ex.targetReps || '0'} reps`;
    }

    let isPartnerWithPrevious = false;
    if (ex.supersetGroup && log?.exercises) {
      for (let i = ex.originalIndex - 1; i >= 0; i--) {
        const prev = log.exercises[i];
        if (prev && !prev.skipped) {
          if (prev.supersetGroup === ex.supersetGroup) {
            isPartnerWithPrevious = true;
          }
          break;
        }
      }
    }

    return (
      <ScaleDecorator>
        <TouchableOpacity
          style={[
            s.row,
            { marginHorizontal: 8 },
            ex.supersetGroup && { 
              backgroundColor: 'rgba(255,159,77,0.05)', 
              borderColor: 'rgba(255,159,77,0.25)',
              borderWidth: 1
            },
            isActive && {
              borderColor: '#a599ff',
              borderWidth: 1.5,
              backgroundColor: '#272338',
              shadowColor: '#a599ff',
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.4,
              shadowRadius: 10,
            }
          ]}
          activeOpacity={0.8}
          onPress={() => {
            if (!isActive) handleResumeWorkout(ex.originalIndex);
          }}
          onLongPress={() => {
            hapticMedium();
            drag();
          }}
          delayLongPress={200}
        >
          {isPartnerWithPrevious && (
            <View style={{
              position: 'absolute',
              top: -8,
              left: 25,
              width: 2,
              height: 8,
              backgroundColor: 'rgba(255,159,77,0.6)',
              zIndex: -1,
            }} />
          )}
          
          <View style={[s.checkboxCircle, isDone && s.checkboxCircleDone]}>
            {isDone && <Ionicons name="checkmark" size={14} color={COLORS.background} />}
          </View>

          <View style={s.rowTextCol}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, paddingRight: 4 }}>
              <Text style={[s.rowTitle, isDone && s.textStrikethrough, isActive && { color: '#a599ff', fontWeight: '700' }]}>
                {ex.name}
              </Text>
              {ex.supersetGroup && (
                <View style={{
                  backgroundColor: 'rgba(255,159,77,0.12)',
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: 'rgba(255,159,77,0.25)',
                  marginBottom: 4,
                }}>
                  <Text style={{ fontSize: 9, fontFamily: 'Inter-Bold', color: '#ff9f4d', letterSpacing: 0.5 }}>
                    SUPER-{ex.supersetGroup}
                  </Text>
                </View>
              )}
            </View>
            <Text style={s.rowSubtitle}>{subText}</Text>
          </View>

          <View style={s.rowActions}>
            <TouchableOpacity 
              style={s.actionBtn} 
              onPress={() => setHistoryFor({ id: ex.exerciseId, name: ex.name })}
            >
              <Ionicons name="time-outline" size={20} color={COLORS.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity 
              style={s.actionBtn} 
              onPress={() => {
                hapticMedium();
                setExerciseMenuFor(ex);
              }}
            >
              <Ionicons name="ellipsis-horizontal" size={20} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </ScaleDecorator>
    );
  }, [log?.exercises, s, handleResumeWorkout]);

  const renderHeader = () => (
    <>
      {/* Week Strip */}
      <Animated.View style={[s.weekStrip, { opacity: Animated.multiply(headerFade, animWeek), transform: [{ translateY: animWeek.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }] }]}>
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
      </Animated.View>

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
            {renderWorkoutBanner()}
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
  );

  const renderFooter = () => {
    return (
      <View style={{ paddingBottom: 0 }}>
        {!planDay?.isRest && (
          <View style={{ marginTop: 16 }}>
            {renderCardio()}
          </View>
        )}
        
        {activeExercisesData.length > 0 && (() => {
          const muscleCounts: Record<string, number> = {};
          activeExercisesData.forEach(ex => {
            const m = ex.muscle || 'Mixed';
            muscleCounts[m] = (muscleCounts[m] || 0) + 1;
          });
          const getMuscleWeight = (m: string) => {
            const ml = m.toLowerCase();
            if (ml.includes('chest') || ml.includes('pec')) return 1;
            if (ml.includes('delt') || ml.includes('shoulder')) return 2;
            if (ml.includes('back') || ml.includes('lat') || ml.includes('trap')) return 3;
            if (ml.includes('bicep') || ml.includes('tricep') || ml.includes('brach') || ml.includes('forearm')) return 4;
            if (ml.includes('abs') || ml.includes('oblique') || ml.includes('core')) return 5;
            if (ml.includes('quad') || ml.includes('glute') || ml.includes('ham') || ml.includes('calf') || ml.includes('soleus')) return 6;
            return 7;
          };

          const sortedMuscles = Object.entries(muscleCounts).sort((a, b) => {
            const wA = getMuscleWeight(a[0]);
            const wB = getMuscleWeight(b[0]);
            if (wA !== wB) return wA - wB;
            return b[1] - a[1];
          });

          return (
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
          );
        })()}
      </View>
    );
  };


  return (
    <View style={s.root}>
      <View style={{ flex: 1 }}>
        {/* ── Single Sticky Header (Positioned right below status bar via insets.top) ── */}
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

              <TouchableOpacity onPress={() => { hapticMedium(); setShowProfileModal(true); }} style={s.morphBtn} activeOpacity={0.7}>
                <View style={s.morphBtnIconWrap}>
                  <Animated.View style={[s.morphBtnPill, { opacity: pillAnim }]} />
                  <Ionicons name="person-outline" size={16} color={COLORS.textMuted} />
                </View>
                <Text style={s.headerBtnText}>Profile</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => { 
                hapticMedium(); 
                Alert.alert('Planning', 'Choose an option', [
                  { text: 'Workout Templates', onPress: () => setShowTemplateModal(true) },
                  { text: 'Schedule Settings', onPress: () => setShowScheduleSettingsModal(true) },
                  { text: 'Cancel', style: 'cancel' }
                ]);
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

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        
        <DraggableFlatList
          data={activeExercisesData}
          keyExtractor={(item, index) => item.exerciseId + '-' + index}
          renderItem={renderExerciseItem}
          ListHeaderComponent={renderHeader}
          ListFooterComponent={renderFooter}
          containerStyle={{ flex: 1 }}
          activationDistance={20}
          onDragEnd={({ data }) => {
            if (!log) return;
            // Reconstruct the full log.exercises array maintaining skipped items
            const newFullList = [];
            let activeIdx = 0;
            for (let i = 0; i < log.exercises.length; i++) {
              if (log.exercises[i].skipped) {
                newFullList.push(log.exercises[i]);
              } else {
                const draggedItem = { ...data[activeIdx] } as any;
                delete draggedItem.originalIndex; // Cleanup before save
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
            if (y <= 30) {
              setTabBarVisible(true);
            }
            if (y <= 20 && isPillVisibleRef.current) {
              isPillVisibleRef.current = false;
              Animated.timing(pillAnim, { toValue: 0, duration: 50, useNativeDriver: true }).start();
            }
          }}
          onMomentumScrollEnd={(e: any) => {
            const y = e?.nativeEvent?.contentOffset?.y ?? 0;
            if (y <= 30) {
              setTabBarVisible(true);
            }
            if (y <= 20 && isPillVisibleRef.current) {
              isPillVisibleRef.current = false;
              Animated.timing(pillAnim, { toValue: 0, duration: 50, useNativeDriver: true }).start();
            }
          }}
          scrollEventThrottle={16}
        />

        {/* Modals and Overlays */}
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
              
              // If today's log hasn't started, overwrite it instantly with the new template's layout.
              if (!log?.workoutStartTime && newCustomDays) {
                forceOverrideTodayPlan(newCustomDays);
                setWeekOffset(prev => prev); // trigger minor re-render
              }
            }}
          />
        )}

        {/* Body Metrics & PR Hall */}
        {showBodyMetrics && <BodyMetricsSheet visible={showBodyMetrics} onClose={() => setShowBodyMetrics(false)} />}
        {showPRHallOfFame && <PRHallOfFameSheet visible={showPRHallOfFame} onClose={() => setShowPRHallOfFame(false)} />}

        {/* ─── Themed Exercise Options Bottom Sheet ──────────────────────────────── */}
        <BottomSheet
          visible={!!exerciseMenuFor}
          onClose={() => setExerciseMenuFor(null)}
        >
          <View style={{ gap: 8, paddingBottom: 16 }}>
            <Text style={{ fontSize: 18, fontFamily: FONT_FAMILY.bold, color: colors.textPrimary }}>
              {exerciseMenuFor?.name || 'Exercise Options'}
            </Text>
            <Text style={{ fontSize: 13, color: colors.textMuted, marginBottom: 8, fontFamily: FONT_FAMILY.medium }}>
              {exerciseMenuFor?.muscle ? `${exerciseMenuFor.muscle} • ` : ''}{exerciseMenuFor?.setsLog?.length || exerciseMenuFor?.targetSets || 3} sets, {exerciseMenuFor?.targetReps || '8–12'} reps
            </Text>

            {/* Option 1: Exercise Details & Guide */}
            <TouchableOpacity
              style={s.menuActionRow}
              activeOpacity={0.7}
              onPress={() => {
                const ex = exerciseMenuFor;
                setExerciseMenuFor(null);
                navigation.navigate('ExerciseDetail', { exerciseId: ex.exerciseId, date: log!.date });
              }}
            >
              <View style={[s.menuActionIcon, { backgroundColor: isDark ? 'rgba(165,153,255,0.12)' : 'rgba(108,92,231,0.08)' }]}>
                <Ionicons name="book-outline" size={18} color={colors.accentPrimary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.menuActionTitle}>Exercise Details & Guide</Text>
                <Text style={s.menuActionSub}>Instructions, muscle anatomy & video</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
            </TouchableOpacity>

            {/* Option 2: Swap Exercise */}
            <TouchableOpacity
              style={s.menuActionRow}
              activeOpacity={0.7}
              onPress={() => {
                const ex = exerciseMenuFor;
                setExerciseMenuFor(null);
                navigation.navigate('ExerciseSwap', { originalExerciseId: ex.exerciseId, date: log!.date });
              }}
            >
              <View style={[s.menuActionIcon, { backgroundColor: isDark ? 'rgba(56,189,248,0.12)' : 'rgba(2,132,199,0.08)' }]}>
                <Ionicons name="swap-horizontal" size={18} color={isDark ? '#38bdf8' : '#0284C7'} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.menuActionTitle}>Swap Exercise...</Text>
                <Text style={s.menuActionSub}>Choose alternative target movements</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
            </TouchableOpacity>

            {/* Option 3: Link/Unlink Superset */}
            {exerciseMenuFor?.supersetGroup ? (
              <TouchableOpacity
                style={s.menuActionRow}
                activeOpacity={0.7}
                onPress={() => {
                  const ex = exerciseMenuFor;
                  setExerciseMenuFor(null);
                  const updated = log!.exercises.map(e => e.exerciseId === ex.exerciseId ? { ...e, supersetGroup: undefined } : e);
                  reorderExercisesFull(updated);
                }}
              >
                <View style={[s.menuActionIcon, { backgroundColor: 'rgba(255,105,97,0.12)' }]}>
                  <Ionicons name="link-outline" size={18} color="#ff6961" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.menuActionTitle, { color: '#ff6961' }]}>Remove from Superset ({exerciseMenuFor.supersetGroup})</Text>
                  <Text style={s.menuActionSub}>Unlink from paired exercise</Text>
                </View>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={s.menuActionRow}
                activeOpacity={0.7}
                onPress={() => {
                  const ex = exerciseMenuFor;
                  setExerciseMenuFor(null);
                  const availablePartners = (log?.exercises || []).filter(e => !e.skipped && e.exerciseId !== ex.exerciseId);
                  if (availablePartners.length === 0) {
                    Alert.alert('Superset', 'Add at least 2 exercises to create a superset.', [{ text: 'OK' }]);
                    return;
                  }
                  setSupersetPickerFor(ex);
                }}
              >
                <View style={[s.menuActionIcon, { backgroundColor: isDark ? 'rgba(255,159,77,0.12)' : 'rgba(217,119,6,0.08)' }]}>
                  <Ionicons name="link-outline" size={18} color={isDark ? '#ff9f4d' : '#D97706'} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.menuActionTitle}>Link as Superset...</Text>
                  <Text style={s.menuActionSub}>Pair with another movement for back-to-back sets</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
              </TouchableOpacity>
            )}

            {/* Option 4: Delete Exercise */}
            <TouchableOpacity
              style={s.menuActionRow}
              activeOpacity={0.7}
              onPress={() => {
                const ex = exerciseMenuFor;
                setExerciseMenuFor(null);
                deleteExercise(ex.exerciseId);
              }}
            >
              <View style={[s.menuActionIcon, { backgroundColor: 'rgba(255,105,97,0.12)' }]}>
                <Ionicons name="trash-outline" size={18} color="#ff6961" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.menuActionTitle, { color: '#ff6961' }]}>Delete Exercise</Text>
                <Text style={s.menuActionSub}>Remove from today's workout</Text>
              </View>
            </TouchableOpacity>

            {/* Cancel / Go Back Button */}
            <TouchableOpacity
              style={s.menuCancelBtn}
              activeOpacity={0.7}
              onPress={() => setExerciseMenuFor(null)}
            >
              <Text style={s.menuCancelText}>Go Back</Text>
            </TouchableOpacity>
          </View>
        </BottomSheet>

        {/* ─── Themed Superset Partner Picker Bottom Sheet ──────────────────── */}
        <BottomSheet
          visible={!!supersetPickerFor}
          onClose={() => setSupersetPickerFor(null)}
        >
          <View style={{ gap: 8, paddingBottom: 16 }}>
            <Text style={{ fontSize: 18, fontFamily: FONT_FAMILY.bold, color: colors.textPrimary }}>
              Select Superset Partner
            </Text>
            <Text style={{ fontSize: 13, color: colors.textMuted, marginBottom: 8, fontFamily: FONT_FAMILY.medium }}>
              Pair "{supersetPickerFor?.name}" with:
            </Text>
            {(log?.exercises || [])
              .filter(e => !e.skipped && e.exerciseId !== supersetPickerFor?.exerciseId)
              .map(partner => (
                <TouchableOpacity
                  key={partner.exerciseId}
                  style={s.menuActionRow}
                  activeOpacity={0.7}
                  onPress={() => {
                    const ex = supersetPickerFor;
                    setSupersetPickerFor(null);
                    const groupLetter = partner.supersetGroup || String.fromCharCode(65 + Math.floor(Math.random() * 26));
                    const updated = (log?.exercises || []).map(e => {
                      if (e.exerciseId === ex.exerciseId || e.exerciseId === partner.exerciseId) {
                        return { ...e, supersetGroup: groupLetter };
                      }
                      return e;
                    });
                    reorderExercisesFull(updated);
                  }}
                >
                  <View style={[s.menuActionIcon, { backgroundColor: isDark ? 'rgba(165,153,255,0.12)' : 'rgba(108,92,231,0.08)' }]}>
                    <Ionicons name="barbell-outline" size={18} color={colors.accentPrimary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.menuActionTitle}>{partner.name}</Text>
                    <Text style={s.menuActionSub}>{partner.muscle || 'Exercise'}</Text>
                  </View>
                  <Ionicons name="checkmark-circle-outline" size={18} color={colors.accentPrimary} />
                </TouchableOpacity>
              ))}
            <TouchableOpacity
              style={s.menuCancelBtn}
              activeOpacity={0.7}
              onPress={() => setSupersetPickerFor(null)}
            >
              <Text style={s.menuCancelText}>Go Back</Text>
            </TouchableOpacity>
          </View>
        </BottomSheet>

        {/* ─── Themed Cardio Options Bottom Sheet ───────────────────────────── */}
        <BottomSheet
          visible={!!cardioMenuFor}
          onClose={() => setCardioMenuFor(null)}
        >
          <View style={{ gap: 8, paddingBottom: 16 }}>
            <Text style={{ fontSize: 18, fontFamily: FONT_FAMILY.bold, color: colors.textPrimary }}>
              {cardioMenuFor?.type || 'Cardio Options'}
            </Text>
            <TouchableOpacity
              style={s.menuActionRow}
              activeOpacity={0.7}
              onPress={() => {
                const c = cardioMenuFor;
                setCardioMenuFor(null);
                if (c) setLogCardioFor(c);
              }}
            >
              <View style={[s.menuActionIcon, { backgroundColor: isDark ? 'rgba(56,189,248,0.12)' : 'rgba(2,132,199,0.08)' }]}>
                <Ionicons name="create-outline" size={18} color={isDark ? '#38bdf8' : '#0284C7'} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.menuActionTitle}>Log / Edit Cardio</Text>
                <Text style={s.menuActionSub}>Update duration, distance, speed & pace</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
            </TouchableOpacity>

            <TouchableOpacity
              style={s.menuActionRow}
              activeOpacity={0.7}
              onPress={() => {
                const c = cardioMenuFor;
                setCardioMenuFor(null);
                if (c) deleteCardio(c.id);
              }}
            >
              <View style={[s.menuActionIcon, { backgroundColor: 'rgba(255,105,97,0.12)' }]}>
                <Ionicons name="trash-outline" size={18} color="#ff6961" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.menuActionTitle, { color: '#ff6961' }]}>Delete Cardio</Text>
                <Text style={s.menuActionSub}>Remove from today's workout</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={s.menuCancelBtn}
              activeOpacity={0.7}
              onPress={() => setCardioMenuFor(null)}
            >
              <Text style={s.menuCancelText}>Go Back</Text>
            </TouchableOpacity>
          </View>
        </BottomSheet>

      </KeyboardAvoidingView>
      </View>

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

const makeStyles = (colors: any, isDark: boolean = true) => StyleSheet.create({
  root: { flex: 1, backgroundColor: isDark ? '#000000' : colors.background },
  scrollContent: { paddingBottom: 95, paddingTop: 48 },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: isDark ? '#1C1C1E' : (colors.surfaceRaised || colors.surface), borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.05)' : colors.border },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  modalTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  moveActionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: isDark ? 'rgba(165,153,255,0.1)' : colors.accentDim, borderWidth: 1, borderColor: isDark ? 'rgba(165,153,255,0.25)' : colors.border, paddingVertical: 10, borderRadius: 14 },
  moveActionText: { fontSize: 13, fontWeight: '700', color: isDark ? '#a599ff' : colors.accentPrimary },
  posRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12, backgroundColor: isDark ? '#2C2C2E' : (colors.surface2 || colors.surface), marginBottom: 6 },
  posRowActive: { backgroundColor: isDark ? '#a599ff' : colors.accentPrimary },
  posNum: { fontSize: 12, fontWeight: '700', color: colors.textMuted, width: 30 },
  posName: { flex: 1, fontSize: 13, color: colors.textPrimary, marginRight: 8 },

  weekStrip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, marginTop: 4, marginBottom: 2 },
  weekDaysContainer: { flexDirection: 'row', flex: 1, justifyContent: 'space-evenly', alignItems: 'center' },
  weekNavBtn: { paddingVertical: 12, paddingHorizontal: 4, justifyContent: 'center', alignItems: 'center', opacity: 0.7 },
  dayCol: { alignItems: 'center', gap: 2 },
  dayLetter: { fontSize: 10.5, color: colors.textTertiary, fontFamily: 'Inter-Medium', marginBottom: 1 },
  dayLetterActive: { color: colors.textPrimary },
  dayPill: { width: 36, height: 36, borderRadius: 18, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },
  dayPillActive: { backgroundColor: isDark ? '#a599ff' : colors.accentPrimary, borderRadius: 18, overflow: 'hidden' },
  dayNum: { fontSize: 13, color: colors.textTertiary, fontFamily: 'Inter-Regular' },
  dayNumActive: { color: isDark ? '#000000' : '#ffffff', fontWeight: '700' },

  muscleSection: { paddingHorizontal: 8, marginBottom: 16 },
  muscleDiagramWrapper: { alignItems: 'center', paddingVertical: 8 },
  muscleLegend: { flexDirection: 'row', gap: 12, marginTop: 12, flexWrap: 'wrap', justifyContent: 'center' },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 10, color: colors.textTertiary, fontFamily: 'Inter-Regular' },

  workoutSection: { paddingHorizontal: 8, marginBottom: 8 },
  startBtn: {
    backgroundColor: isDark ? '#1C1C1E' : colors.accentGreen,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.05)' : colors.accentGreen,
  },
  startBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 1,
  },

  completedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: isDark ? 'rgba(94,218,158,0.12)' : 'rgba(16,185,129,0.10)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: isDark ? 'transparent' : 'rgba(16,185,129,0.25)',
  },
  completedBannerLeft: { gap: 2 },
  completedBannerTitle: { fontSize: 15, fontWeight: '700', color: isDark ? '#5eda9e' : '#059669' },
  completedBannerSub: { fontSize: 13, color: colors.textMuted },
  streakBadgeInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    backgroundColor: isDark ? 'rgba(255,159,77,0.1)' : 'rgba(249,115,22,0.12)',
  },
  streakBadgeInlineText: { fontSize: 12, fontWeight: '700', color: isDark ? '#ff9f4d' : '#EA580C' },
  
  readinessBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1 },

  activeBanner: {
    backgroundColor: isDark ? '#1a140b' : '#FFFBEB',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: isDark ? '#4d3b20' : '#FDE68A',
  },
  activeBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  activeIndicator: { width: 8, height: 8, borderRadius: 4, backgroundColor: isDark ? '#eab308' : '#D97706' },
  activeBannerTitle: { fontSize: 10, fontWeight: '700', color: isDark ? '#eab308' : '#B45309', letterSpacing: 1 },
  activeBannerResume: { fontSize: 14, fontWeight: '600', color: isDark ? '#ffffff' : '#B45309' },

  section: { paddingHorizontal: 8, marginBottom: 12 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: colors.textTertiary, marginBottom: 12, marginLeft: 4, letterSpacing: 2 },
  
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? '#1C1C1E' : colors.surface,
    padding: 16,
    borderRadius: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.05)' : colors.border,
  },
  cardioSquare: {
    width: 20,
    height: 20,
    borderRadius: 4,
    backgroundColor: isDark ? '#2C2C2E' : 'rgba(14,165,233,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
    borderWidth: isDark ? 0 : 1,
    borderColor: isDark ? 'transparent' : '#0284C7',
  },
  checkboxCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: isDark ? '#2c2c2e' : '#D1D1D6',
    backgroundColor: isDark ? 'transparent' : '#F4F3F8',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  checkboxCircleDone: {
    backgroundColor: isDark ? '#5eda9e' : '#059669',
    borderColor: isDark ? '#5eda9e' : '#059669',
  },
  rowTextCol: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
  rowSubtitle: { fontSize: 12, color: colors.textMuted },
  textStrikethrough: { textDecorationLine: 'line-through', color: colors.textTertiary },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionBtn: { padding: 8, marginHorizontal: -4 },

  fabAi: { position: 'absolute', bottom: 110, right: 24, borderRadius: 24, elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 8 },
  fabGradient: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? '#a599ff' : colors.accentPrimary },

  restTimerOverlay: {
    position: 'absolute',
    bottom: 110,
    alignSelf: 'center',
    backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(52, 199, 89, 0.5)' : 'rgba(16, 185, 129, 0.40)',
    borderRadius: 30,
    paddingVertical: 12,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    elevation: 10,
    zIndex: 9999,
  },
  restTimerLabel: { fontSize: 12, fontWeight: '700', color: colors.textTertiary, letterSpacing: 1 },
  restTimerText: { fontFamily: 'Courier', fontSize: 24, color: isDark ? '#34C759' : '#059669', fontWeight: 'bold' },
  restTimerClose: { marginLeft: 8 },
  routineHeaderBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 12,
    backgroundColor: isDark ? '#1C1C1E' : colors.surface,
    marginHorizontal: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.05)' : colors.border,
  },
  routineInfoCol: { flex: 1, paddingRight: 8 },
  routineLabelText: { fontSize: 10, fontWeight: '700', color: colors.textTertiary, letterSpacing: 1.5, marginBottom: 2 },
  routineNameText: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  smallSwapIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: isDark ? 'rgba(165,153,255,0.1)' : colors.accentDim,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(165,153,255,0.25)' : colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Single Morphing Sticky Header Styles ─────────────────────────────────
  topHeaderWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    backgroundColor: 'transparent',
  },
  headerInner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 4,
    backgroundColor: 'transparent',
  },
  headerTitle: {
    fontSize: 21,
    fontWeight: '700',
    fontFamily: 'Inter-Bold',
    color: colors.textPrimary,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  morphBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 35,
  },
  morphBtnIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  morphBtnPill: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
    backgroundColor: isDark ? 'rgba(255,255,255,0.09)' : colors.surface,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.14)' : colors.border,
  },
  morphBtnPillAccent: {
    backgroundColor: isDark ? 'rgba(165,153,255,0.16)' : colors.accentDim,
    borderColor: isDark ? 'rgba(165,153,255,0.32)' : colors.accentPrimary,
  },
  headerBtnText: {
    fontSize: 8.5,
    color: colors.textTertiary,
    fontFamily: 'Inter-Medium',
    marginTop: 1,
    textAlign: 'center',
  },

  // ── Themed Action Sheet Menu Styles ──────────────────────────────────────
  menuActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: isDark ? '#1C1C1E' : '#F5F4FA',
    marginBottom: 6,
    gap: 12,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.05)' : colors.border,
  },
  menuActionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuActionTitle: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.bold,
    color: colors.textPrimary,
  },
  menuActionSub: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.body,
    color: colors.textMuted,
    marginTop: 2,
  },
  menuCancelBtn: {
    marginTop: 8,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#E2E1EA',
  },
  menuCancelText: {
    fontSize: 14,
    fontFamily: FONT_FAMILY.bold,
    color: colors.textPrimary,
  },
});

export default GymHomeScreen;
