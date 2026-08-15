import React, { useEffect, useRef, useState, useMemo, memo, useCallback } from 'react';
import WorkoutTimer from '../../components/Gym/WorkoutTimer';
import { View, Text, StyleSheet, TouchableOpacity, KeyboardAvoidingView, Platform, Alert, Animated, Image, Modal, LayoutAnimation, Dimensions } from 'react-native';
import DraggableFlatList, { ScaleDecorator, RenderItemParams } from 'react-native-draggable-flatlist';
import { hapticLight, hapticMedium } from '../../utils/haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';

import { doc, deleteDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { COLLECTION } from '../../config/constants';

import { useMobileData } from '../../contexts/MobileDataContext';
import { useGymLog, todayStr, dateStrOffset, planDayIndexForDate } from '../../hooks/useGymLog';
import { GYM_PLAN_PPL, GYM_PLAN_ARNOLD } from '../../data/gymPlan';
import type { GymPlanDay } from '../../types/gym.types';
import { calculateGymStreak } from '../../utils/gymUtils';
import { clearScheduleCache, scheduleAllNotifications } from '../../services/notifications';

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
import { useGymProfile } from '../../hooks/useGymProfile';
import BodyMetricsSheet from '../../components/Gym/BodyMetricsSheet';
import PRHallOfFameSheet from '../../components/Gym/PRHallOfFameSheet';
import { ZenGymAiFab } from '../../components/Gym/ZenGymAiFab';
import { handleSyncError } from '../../utils/errorUtils';
import { getOverloadSuggestion } from '../../services/progressiveOverload';


// ─── Design Tokens ────────────────────────────────────────────────────────────

export default function GymHomeScreen() {
  const navigation = useNavigation<any>();
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [weekOffset, setWeekOffset] = useState(0);

  // When switching to the Gym module from another tab/module, always return to Today
  useFocusEffect(
    useCallback(() => {
      const today = todayStr();
      setSelectedDate(today);
      setWeekOffset(0);
    }, [])
  );

  const { gymLogs, waterLogs, sleepLogs, tasks, customEvents, attendance, habitLogs, allHabits, assignments, applyMasterTemplate, userGymPlan, updateMasterPlan, updateFullMasterPlan, user } = useMobileData();
  const currentStreak = useMemo(() => calculateGymStreak(gymLogs, userGymPlan), [gymLogs, userGymPlan]);

  // BUG-3 FIX: Callback passed to GymNotificationModal so gym reminder time
  // changes reschedule immediately (not just on next app open or data change).
  const handleGymNotifSaved = () => {
    clearScheduleCache();
    scheduleAllNotifications({
      tasks, customEvents, gymLogs, attendance, habitLogs, allHabits, assignments,
      waterLogs, sleepLogs,
    }).catch(console.warn);
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
  const headerFade = scrollY.interpolate({
    inputRange: [0, 50],
    outputRange: [1, 0],
    extrapolate: 'clamp'
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
      prevExercisesDoneRef.current = new Set([...prevExercisesDoneRef.current, ex.exerciseId]);

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
                      Alert.alert(
                        c.type || 'Cardio',
                        'What would you like to do?',
                        [
                          { text: 'Log / Edit', onPress: () => setLogCardioFor(c) },
                          {
                            text: 'Delete',
                            style: 'destructive',
                            onPress: () => deleteCardio(c.id),
                          },
                          { text: 'Cancel', style: 'cancel' },
                        ]
                      );
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
    if (!log?.exercises) return [];
    return log.exercises
      .map((ex, originalIndex) => ({ ...ex, originalIndex }))
      .filter(ex => !ex.skipped);
  }, [log?.exercises]);

  const renderExerciseItem = ({ item: ex, drag, isActive }: RenderItemParams<any>) => {
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

    const activePrevExercises = log!.exercises.slice(0, ex.originalIndex).filter(e => !e.skipped);
    const prevEx = activePrevExercises.length > 0 ? activePrevExercises[activePrevExercises.length - 1] : null;
    const isPartnerWithPrevious = ex.supersetGroup && prevEx && prevEx.supersetGroup === ex.supersetGroup;

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
                const isGrouped = !!ex.supersetGroup;
                const buttons = [
                  {
                    text: 'Exercise Details & Guide',
                    onPress: () => navigation.navigate('ExerciseDetail', { exerciseId: ex.exerciseId, date: log!.date }),
                  },
                  {
                    text: 'Swap Exercise...',
                    onPress: () => navigation.navigate('ExerciseSwap', { originalExerciseId: ex.exerciseId, date: log!.date }),
                  },
                  ...(isGrouped
                    ? [{
                        text: `Remove from Superset (${ex.supersetGroup})`,
                        style: 'destructive' as const,
                        onPress: () => {
                          const updated = log!.exercises.map(e => e.exerciseId === ex.exerciseId ? { ...e, supersetGroup: undefined } : e);
                          reorderExercisesFull(updated);
                        },
                      }]
                    : [{
                        text: 'Link as Superset...',
                        onPress: () => {
                          const availablePartners = log!.exercises.filter(e => !e.skipped && e.exerciseId !== ex.exerciseId);
                          if (availablePartners.length === 0) {
                            Alert.alert('Superset', 'Add at least 2 exercises to create a superset.');
                            return;
                          }
                          Alert.alert(
                            'Select Superset Partner',
                            `Pair "${ex.name}" with:`,
                            [
                              ...availablePartners.map(partner => ({
                                text: partner.name,
                                onPress: () => {
                                  const groupLetter = partner.supersetGroup || String.fromCharCode(65 + Math.floor(Math.random() * 26));
                                  const updated = log!.exercises.map(e => {
                                    if (e.exerciseId === ex.exerciseId || e.exerciseId === partner.exerciseId) {
                                      return { ...e, supersetGroup: groupLetter };
                                    }
                                    return e;
                                  });
                                  reorderExercisesFull(updated);
                                },
                              })),
                              { text: 'Cancel', style: 'cancel' as const },
                            ]
                          );
                        },
                      }]
                  ),
                  { text: 'Cancel', style: 'cancel' as const },
                ];
                Alert.alert(ex.name, 'Exercise Options', buttons);
              }}
            >
              <Ionicons name="ellipsis-horizontal" size={20} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </ScaleDecorator>
    );
  };

  const renderHeader = () => (
    <>
      {/* Header */}
      <Animated.View style={[s.header, { opacity: animHeader, transform: [{ translateY: animHeader.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }] }]}>
        <Text style={s.headerTitle}>Gym</Text>
        <View style={s.headerActions}>
          <TouchableOpacity onPress={() => { hapticMedium(); setShowSwapRoutineModal(true); }} style={s.headerBtn} activeOpacity={0.7}>
            <Ionicons name="swap-horizontal-outline" size={16} color={COLORS.textMuted} />
            <Text style={s.headerBtnText}>Swap</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { hapticMedium(); setShowProfileModal(true); }} style={s.headerBtn} activeOpacity={0.7}>
            <Ionicons name="person-outline" size={16} color={COLORS.textMuted} />
            <Text style={s.headerBtnText}>Profile</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { 
            hapticMedium(); 
            Alert.alert('Planning', 'Choose an option', [
              { text: 'Workout Templates', onPress: () => setShowTemplateModal(true) },
              { text: 'Schedule Settings', onPress: () => setShowScheduleSettingsModal(true) },
              { text: 'Cancel', style: 'cancel' }
            ]);
          }} style={s.headerBtn} activeOpacity={0.7}>
            <Ionicons name="document-text-outline" size={16} color={COLORS.textMuted} />
            <Text style={s.headerBtnText}>Plan</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { hapticMedium(); setShowBodyMetrics(true); }} style={s.headerBtn} activeOpacity={0.7}>
            <Ionicons name="body-outline" size={16} color={COLORS.textMuted} />
            <Text style={s.headerBtnText}>Body</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { hapticMedium(); navigation.navigate('GymProgress'); }} style={s.headerBtn} activeOpacity={0.7}>
            <Ionicons name="bar-chart-outline" size={16} color={COLORS.textMuted} />
            <Text style={s.headerBtnText}>Stats</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { hapticMedium(); setShowAddModal(true); }} style={s.headerBtn} activeOpacity={0.7}>
            <Ionicons name="add" size={18} color="#a599ff" />
            <Text style={[s.headerBtnText, { color: '#a599ff' }]}>Add</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>

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
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
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
          contentContainerStyle={s.scrollContent} 
          showsVerticalScrollIndicator={false}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            {
              useNativeDriver: false, // DraggableFlatList scroll might require false for nativeEvent
              listener: (e: any) => {
                currentScrollY.current = e?.nativeEvent?.contentOffset?.y ?? 0;
              }
            }
          )}
          scrollEventThrottle={16}
        />

        {/* Modals and Overlays */}
        <AddExerciseModal
          visible={showAddModal}
          onClose={() => setShowAddModal(false)}
          onAdd={addExercise}
          planDay={planDay}
          existingExerciseIds={log?.exercises.map(e => e.exerciseId) || []}
        />
        <AddCardioModal visible={showCardioModal} onClose={() => setShowCardioModal(false)} onAdd={addCardio} />
        <ExerciseHistoryDrawer 
          visible={!!historyFor} 
          exerciseId={historyFor?.id || null}
          exerciseName={historyFor?.name || null}
          onClose={() => setHistoryFor(null)} 
        />
        <LogCardioModal
          visible={!!logCardioFor}
          cardio={logCardioFor}
          onClose={() => setLogCardioFor(null)}
          onSave={(updates) => log?.cardio && updateCardio(logCardioFor!.id, updates)}
        />
        
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
        
        <SwapRoutineModal
          visible={showSwapRoutineModal}
          selectedDate={selectedDate}
          currentPlanDayIndex={log?.dayPlanIndex || planDay?.dayIndex}
          onClose={() => setShowSwapRoutineModal(false)}
          onSelectDay={(targetDayIdx) => swapDayRoutine(targetDayIdx)}
        />

        <GymProfileModal
          visible={showProfileModal}
          onClose={() => setShowProfileModal(false)}
        />
        
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

        {/* Body Metrics & PR Hall */}
        <BodyMetricsSheet visible={showBodyMetrics} onClose={() => setShowBodyMetrics(false)} />
        <PRHallOfFameSheet visible={showPRHallOfFame} onClose={() => setShowPRHallOfFame(false)} />

      </KeyboardAvoidingView>
      </SafeAreaView>

      {/* ── Progressive Overload Toast ─────────────────────────────────────────
          Surfaces automatically when an exercise is fully completed and the
          algorithm detects the user has hit their targets 2+ sessions in a row.
          Floats above the AI FAB, auto-dismisses after 6 seconds.
      ─────────────────────────────────────────────────────────────────────── */}
      {overloadToast && (
        <Animated.View
          style={{
            position: 'absolute',
            bottom: 160, // above the AI FAB
            left: 16,
            right: 16,
            backgroundColor: '#1a2a1a',
            borderRadius: 16,
            padding: 14,
            borderWidth: 1,
            borderColor: 'rgba(52,199,89,0.35)',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            shadowColor: '#34C759',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.25,
            shadowRadius: 12,
            elevation: 12,
            zIndex: 9998,
          }}
        >
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(52,199,89,0.15)', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 18 }}>💪</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, fontFamily: FONT_FAMILY.bold, color: '#34C759', marginBottom: 2 }}>
              Progressive Overload Ready!
            </Text>
            <Text style={{ fontSize: 11, fontFamily: FONT_FAMILY.body, color: '#c7f7d4', lineHeight: 15 }} numberOfLines={2}>
              {overloadToast.exerciseName}: try {overloadToast.suggestedWeight}kg next session (+{overloadToast.step}kg from {overloadToast.currentWeight}kg)
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => { if (overloadToastTimer.current) clearTimeout(overloadToastTimer.current); setOverloadToast(null); }}
            style={{ padding: 4 }}
          >
            <Ionicons name="close" size={16} color="rgba(255,255,255,0.4)" />
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* ZenGymAI FAB fixed to root, immune to keyboard layout jumps */}
      <ZenGymAiFab onPress={() => setShowAiModal(true)} />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  scrollContent: { paddingBottom: 95 },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#1C1C1E', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  modalTitle: { fontSize: 15, fontWeight: '700', color: COLORS.textPrimary },
  moveActionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: 'rgba(165,153,255,0.12)', borderWidth: 1, borderColor: 'rgba(165,153,255,0.3)', paddingVertical: 10, borderRadius: 14 },
  moveActionText: { fontSize: 13, fontWeight: '700', color: '#a599ff' },
  posRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12, backgroundColor: '#2C2C2E', marginBottom: 6 },
  posRowActive: { backgroundColor: '#a599ff' },
  posNum: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted, width: 30 },
  posName: { flex: 1, fontSize: 13, color: COLORS.textPrimary, marginRight: 8 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 14, paddingTop: 4 },
  headerTitle: { fontSize: 24, fontWeight: '700', color: COLORS.textPrimary, fontFamily: 'Inter-Bold', marginRight: 4 },
  headerActions: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'flex-end', gap: 4 },
  headerBtn: { alignItems: 'center', width: 38 },
  headerBtnText: { fontSize: 9, color: COLORS.textTertiary, fontFamily: 'Inter-Medium', marginTop: 2, textAlign: 'center' },


  weekStrip: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, marginBottom: 8 },
  weekDaysContainer: { flexDirection: 'row', flex: 1, justifyContent: 'space-evenly', alignItems: 'center' },
  weekNavBtn: { paddingVertical: 12, paddingHorizontal: 4, justifyContent: 'center', alignItems: 'center', opacity: 0.7 },
  dayCol: { alignItems: 'center', gap: 6 },
  dayLetter: { fontSize: 11, color: COLORS.textTertiary, fontFamily: 'Inter-Regular' },
  dayLetterActive: { color: COLORS.textPrimary },
  dayPill: { width: 36, height: 36, borderRadius: 18, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0)' },
  dayPillActive: { backgroundColor: COLORS.accentPrimary, borderRadius: 18, overflow: 'hidden' },
  dayNum: { fontSize: 13, color: COLORS.textTertiary, fontFamily: 'Inter-Regular' },
  dayNumActive: { color: '#000000', fontWeight: '700' },

  muscleSection: { paddingHorizontal: 8, marginBottom: 16 },
  muscleDiagramWrapper: { alignItems: 'center', paddingVertical: 8 },
  muscleLegend: { flexDirection: 'row', gap: 12, marginTop: 12, flexWrap: 'wrap', justifyContent: 'center' },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 10, color: COLORS.textTertiary, fontFamily: 'Inter-Regular' },

  workoutSection: { paddingHorizontal: 8, marginBottom: 8 },
  startBtn: { backgroundColor: '#1C1C1E', borderRadius: 16, paddingVertical: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  startBtnText: { color: COLORS.textPrimary, fontSize: 15, fontWeight: '700', letterSpacing: 1 },

  completedBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.accentGreenDim, borderRadius: 16, padding: 16 },
  completedBannerLeft: { gap: 2 },
  completedBannerTitle: { fontSize: 15, fontWeight: '700', color: COLORS.accentGreen },
  completedBannerSub: { fontSize: 13, color: COLORS.textMuted },
  streakBadgeInline: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 14, backgroundColor: COLORS.accentAmberDim },
  streakBadgeInlineText: { fontSize: 12, fontWeight: '700', color: COLORS.accentAmber },
  
  readinessBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1 },

  activeBanner: { backgroundColor: '#1a140b', borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#4d3b20' },
  activeBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  activeIndicator: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#eab308' },
  activeBannerTitle: { fontSize: 10, fontWeight: '700', color: '#eab308', letterSpacing: 1 },
  activeBannerResume: { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary },

  section: { paddingHorizontal: 8, marginBottom: 12 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: COLORS.textTertiary, marginBottom: 12, marginLeft: 4, letterSpacing: 2 },
  
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1C1C1E', padding: 16, borderRadius: 16, marginBottom: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  cardioSquare: { width: 20, height: 20, borderRadius: 4, backgroundColor: '#2C2C2E', alignItems: 'center', justifyContent: 'center', marginRight: 16 },
  checkboxCircle: { width: 20, height: 20, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center', marginRight: 16 },
  checkboxCircleDone: { backgroundColor: COLORS.accentGreen, borderColor: COLORS.accentGreen },
  rowTextCol: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary },
  rowSubtitle: { fontSize: 12, color: COLORS.textMuted },
  textStrikethrough: { textDecorationLine: 'line-through', color: COLORS.textTertiary },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionBtn: { padding: 8, marginHorizontal: -4 },

  fabAi: { position: 'absolute', bottom: 110, right: 24, borderRadius: 24, elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 8 },
  fabGradient: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.accentPrimary },

  restTimerOverlay: { position: 'absolute', bottom: 110, alignSelf: 'center', backgroundColor: '#1C1C1E', borderWidth: 1, borderColor: 'rgba(52, 199, 89, 0.5)', borderRadius: 30, paddingVertical: 12, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, elevation: 10, zIndex: 9999 },
  restTimerLabel: { fontSize: 12, fontWeight: '700', color: COLORS.textTertiary, letterSpacing: 1 },
  restTimerText: { fontFamily: 'Courier', fontSize: 24, color: '#34C759', fontWeight: 'bold' },
  restTimerClose: { marginLeft: 8 },
  routineHeaderBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 12,
    backgroundColor: '#1C1C1E',
    marginHorizontal: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  routineInfoCol: { flex: 1, paddingRight: 8 },
  routineLabelText: { fontSize: 10, fontWeight: '700', color: COLORS.textTertiary, letterSpacing: 1.5, marginBottom: 2 },
  routineNameText: { fontSize: 15, fontWeight: '700', color: COLORS.textPrimary },
  smallSwapIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(165,153,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(165,153,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
