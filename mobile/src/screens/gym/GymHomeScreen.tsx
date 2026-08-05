import React, { useEffect, useRef, useState, useMemo, memo } from 'react';

// ── Isolated WorkoutTimer — only this re-renders every second, not the whole screen
const WorkoutTimer = memo(function WorkoutTimer({ startTime }: { startTime: number }) {
  const [elapsed, setElapsed] = React.useState(Math.floor((Date.now() - startTime) / 1000));
  useEffect(() => {
    setElapsed(Math.floor((Date.now() - startTime) / 1000));
    const iv = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000);
    return () => clearInterval(iv);
  }, [startTime]);
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  const label = h > 0
    ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
    : `${m}:${s.toString().padStart(2, '0')}`;
  return <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 13, color: '#a599ff' }}>{label}</Text>;
});

import { View, Text, StyleSheet, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform, Alert, Animated, Image, Modal, PanResponder, LayoutAnimation, Dimensions } from 'react-native';
import { hapticLight, hapticMedium } from '../../utils/haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';

import { doc, deleteDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { COLLECTION } from '../../config/constants';

import { useMobileData } from '../../contexts/MobileDataContext';
import { useGymLog, todayStr, dateStrOffset, planDayIndexForDate } from '../../hooks/useGymLog';
import { calculateGymStreak } from '../../utils/gymUtils';
import { clearScheduleCache, scheduleAllNotifications } from '../../services/notifications';

import { COLORS, SPACE, RADIUS, FONT_FAMILY, FONT_SIZE, SHADOW } from '../../theme/tokens';

import { AddExerciseModal } from '../../components/Gym/AddExerciseModal';
import { AddCardioModal } from '../../components/Gym/AddCardioModal';
import { ExerciseHistoryDrawer } from '../../components/Gym/ExerciseHistoryDrawer';
import { ZenGymAiModal } from '../../components/Gym/ZenGymAiModal';
import { LogCardioModal } from '../../components/Gym/LogCardioModal';
import { SwapRoutineModal } from '../../components/Gym/SwapRoutineModal';
import { GymTemplateModal } from '../../components/Gym/GymTemplateModal';
import { GymScheduleSettingsModal } from '../../components/Gym/GymScheduleSettingsModal';
import { WorkoutInsightCard } from '../../components/Gym/WorkoutInsightCard';
import WeeklyGymReport from '../../components/Gym/WeeklyGymReport';
import { GymCardioLog } from '../../types/gym.types';
import { useGymProfile } from '../../hooks/useGymProfile';
import { generateWorkoutInsight, hasInsightFiredToday, markInsightFiredToday, WorkoutInsight } from '../../services/gymInsightEngine';
import BodyMetricsSheet from '../../components/Gym/BodyMetricsSheet';
import PRHallOfFameSheet from '../../components/Gym/PRHallOfFameSheet';
import { handleSyncError } from '../../utils/errorUtils';


// ── Design Tokens ────────────────────────────────────────────────────────────

export default function GymHomeScreen() {
  const navigation = useNavigation<any>();
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [weekOffset, setWeekOffset] = useState(0);

  const { gymLogs, waterLogs, sleepLogs, tasks, customEvents, attendance, habitLogs, allHabits, assignments, applyMasterTemplate, userGymPlan, updateFullMasterPlan, user } = useMobileData();
  const currentStreak = useMemo(() => calculateGymStreak(gymLogs), [gymLogs]);

  // BUG-3 FIX: Callback passed to GymNotificationModal so gym reminder time
  // changes reschedule immediately (not just on next app open or data change).
  const handleGymNotifSaved = () => {
    clearScheduleCache();
    scheduleAllNotifications({
      tasks, customEvents, gymLogs, attendance, habitLogs, allHabits, assignments,
      waterLogs, sleepLogs,
    }).catch(console.warn);
  };

  const { log, startWorkout, resumeWorkout, endWorkout, addExercise, deleteExercise, updateSet, saveLog, addCardio, updateCardio, deleteCardio, planDay, swapDayRoutine, reorderExercise, triggerDeload } = useGymLog(selectedDate);

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCardioModal, setShowCardioModal] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [showScheduleSettingsModal, setShowScheduleSettingsModal] = useState(false);
  const [showSwapRoutineModal, setShowSwapRoutineModal] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [historyFor, setHistoryFor] = useState<{ id: string; name: string } | null>(null);
  const [logCardioFor, setLogCardioFor] = useState<GymCardioLog | null>(null);
  const [showBodyMetrics, setShowBodyMetrics] = useState(false);
  const [showPRHallOfFame, setShowPRHallOfFame] = useState(false);

  // ── Workout Insight Card State ───────────────────────────────────────────────
  const { gymProfile } = useGymProfile();
  const [showInsightCard, setShowInsightCard] = useState(false);
  const [insightCardLoading, setInsightCardLoading] = useState(false);
  const [workoutInsight, setWorkoutInsight] = useState<WorkoutInsight | null>(null);
  const insightFiredRef = useRef(false);

  /** Trigger insight once per day when workout is started */
  const triggerWorkoutInsight = async (dateStr: string, exercises: any[]) => {
    if (insightFiredRef.current) return;
    const alreadyFired = await hasInsightFiredToday(dateStr);
    if (alreadyFired) return;
    insightFiredRef.current = true;
    
    setShowInsightCard(true);
    setInsightCardLoading(true);
    try {
      const insight = await generateWorkoutInsight(
        gymLogs ?? [],
        gymProfile,
        exercises,
        dateStr
      );
      setWorkoutInsight(insight);
      if (insight) {
        await markInsightFiredToday(dateStr);
      } else {
        insightFiredRef.current = false;
      }
    } catch (_) {
      insightFiredRef.current = false;
    }
    finally { setInsightCardLoading(false); }
  };

  const SCREEN_HEIGHT = Dimensions.get('window').height;
  const scrollViewRef = useRef<any>(null);
  const currentScrollY = useRef<number>(0);

  // ── Drag & Drop Animated Reorder State ─────────────────────────────────────
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const dragY = useRef(new Animated.Value(0)).current;
  const draggingIdxRef = useRef<number | null>(null);
  const logRefCurrent = useRef(log);

  useEffect(() => {
    draggingIdxRef.current = draggingIdx;
    logRefCurrent.current = log;
  }, [draggingIdx, log]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return draggingIdxRef.current !== null && Math.abs(gestureState.dy) > 3;
      },
      onPanResponderMove: (_, gestureState) => {
        if (draggingIdxRef.current === null || !logRefCurrent.current?.exercises) return;
        const curIdx = draggingIdxRef.current;
        const dy = gestureState.dy;
        const moveY = gestureState.moveY;

        // Auto-scroll screen when dragging near top or bottom edges
        if (moveY < 180 && currentScrollY.current > 0) {
          currentScrollY.current = Math.max(0, currentScrollY.current - 12);
          scrollViewRef.current?.scrollTo?.({ y: currentScrollY.current, animated: false });
        } else if (moveY > SCREEN_HEIGHT - 160) {
          currentScrollY.current = currentScrollY.current + 12;
          scrollViewRef.current?.scrollTo?.({ y: currentScrollY.current, animated: false });
        }

        const slotShift = Math.round(dy / 68);
        const targetIdx = Math.max(0, Math.min(logRefCurrent.current.exercises.length - 1, curIdx + slotShift));

        if (targetIdx !== curIdx) {
          hapticLight();
          try {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          } catch (_) { /* silent */ }
          reorderExercise(curIdx, targetIdx);
          setDraggingIdx(targetIdx);
          draggingIdxRef.current = targetIdx;
          dragY.setValue(0);
        } else {
          dragY.setValue(dy % 68);
        }
      },
      onPanResponderRelease: () => {
        if (draggingIdxRef.current !== null) {
          hapticMedium();
          try {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          } catch (_) { /* silent */ }
          setDraggingIdx(null);
          draggingIdxRef.current = null;
          Animated.spring(dragY, { toValue: 0, useNativeDriver: true }).start();
        }
      },
      onPanResponderTerminate: () => {
        setDraggingIdx(null);
        draggingIdxRef.current = null;
        dragY.setValue(0);
      },
    })
  ).current;

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

  useEffect(() => {
    // Disabled mount animations for instant load
  }, []);

  // ── Sub-10-min log cleanup ─────────────────────────────────────────────────
  // If today's log was incorrectly saved with a duration < 10 mins (e.g. from
  // an accidental "Finish" tap), reset it back to an unfinished state so the
  // user can start a real workout.
  useEffect(() => {
    if (!log) return;
    const isToday = selectedDate === todayStr();
    if (!isToday) return;
    if (log.workoutDurationMinutes !== undefined && log.workoutDurationMinutes < 10 && !log.workoutStartTime) {
      // Reset: clear completed flag and duration so the banner disappears
      const fixed = {
        ...log,
        completed: false,
        workoutDurationMinutes: undefined,
        startTime: undefined,
        endTime: undefined,
        updatedAt: Date.now(),
      };
      saveLog(fixed);
    }
  }, [log?.id, selectedDate]);

  // Mocks for AI modal
  const activeMuscles: { muscle: string }[] = [];
  const doneSets = 0;
  const totalSets = 0;

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
    // Trigger workout insight card once per day on first start
    const today = todayStr();
    if (selectedDate === today) {
      triggerWorkoutInsight(today, log?.exercises ?? []);
    }
    navigation.navigate('ActiveLogging', { date: selectedDate });
  };

  const handleResumeWorkout = (index?: number) => {
    hapticMedium();
    if (!log?.exercises || log.exercises.length === 0) {
      Alert.alert('No exercises', 'Please add exercises to resume the workout.');
      return;
    }
    // Only call resumeWorkout if the workout was finished, or if it was never started
    if (!log?.workoutStartTime || log.workoutDurationMinutes !== undefined) {
      resumeWorkout();
    }
    navigation.navigate('ActiveLogging', { date: selectedDate, initialIndex: typeof index === 'number' ? index : 0 });
  };

  // Renderers
  const renderWorkoutBanner = () => {
    if (log?.workoutDurationMinutes !== undefined && log.workoutDurationMinutes >= 10 && !log?.workoutStartTime) {
      return (
        <View style={s.completedBanner}>
          <View style={s.completedBannerLeft}>
            <Text style={s.completedBannerTitle}>Workout Completed</Text>
            <Text style={s.completedBannerSub}>{log.workoutDurationMinutes} min session</Text>
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
    if (log?.workoutStartTime) {
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
                    'Too Short 💪',
                    `Your session is only ${durationMins} min${durationMins !== 1 ? 's' : ''}. Workouts must be at least 10 minutes to count. Keep going!`,
                    [{ text: 'Keep Going', style: 'cancel' }]
                  );
                  return;
                }
              }
              endWorkout();
              navigation.navigate('WorkoutSummary');
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
                {/* Ellipsis menu — matches exercise row pattern */}
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


  const renderExercises = () => {
    if (!log?.exercises || log.exercises.length === 0) return null;
    const activeExercises = log.exercises.filter(ex => !ex.skipped);
    const isAnyDragging = draggingIdx !== null;

    return (
      <View style={s.section} {...panResponder.panHandlers}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <Text style={s.sectionLabel}>EXERCISES</Text>
        </View>

        {log.exercises.map((ex, i) => {
          if (ex.skipped) return null;
          const isDone = ex.setsLog.length > 0 && ex.setsLog.every(set => set.completed);
          const totalSets = ex.setsLog.length;
          const completedSets = ex.setsLog.filter(s => s.completed);
          const isDragging = draggingIdx === i;
          
          let subText = '';
          if (completedSets.length > 0) {
            const avgReps = Math.round(completedSets.reduce((sum, s) => sum + (s.reps || 0), 0) / completedSets.length) || 0;
            const maxWeight = Math.max(...completedSets.map(s => s.weight || 0));
            subText = `${completedSets.length}/${totalSets} sets, ~${avgReps} reps ${maxWeight > 0 ? `@ ${maxWeight}kg` : ''}`;
          } else {
            subText = `${totalSets} sets, ${ex.targetReps || '0'} reps`;
          }

          const activePrevExercises = log.exercises.slice(0, i).filter(e => !e.skipped);
          const prevEx = activePrevExercises.length > 0 ? activePrevExercises[activePrevExercises.length - 1] : null;
          const isPartnerWithPrevious = ex.supersetGroup && prevEx && prevEx.supersetGroup === ex.supersetGroup;

          return (
            <Animated.View
              key={ex.id || i}
              style={[
                { opacity: animList },
                isDragging && {
                  transform: [
                    { translateY: dragY },
                    { scale: 1.04 }
                  ],
                  zIndex: 9999,
                  elevation: 10,
                }
              ]}
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
              <TouchableOpacity
                style={[
                  s.row,
                  ex.supersetGroup && { 
                    backgroundColor: 'rgba(255,159,77,0.05)', 
                    borderColor: 'rgba(255,159,77,0.25)',
                    borderWidth: 1
                  },
                  isDragging && {
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
                  if (draggingIdx === null) handleResumeWorkout(i);
                }}
                onLongPress={() => {
                  hapticMedium();
                  setDraggingIdx(i);
                  draggingIdxRef.current = i;
                }}
                delayLongPress={300}
              >
                <View style={[s.checkboxCircle, isDone && s.checkboxCircleDone]}>
                  {isDone && <Ionicons name="checkmark" size={14} color={COLORS.background} />}
                </View>

                <View style={s.rowTextCol}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, paddingRight: 4 }}>
                    <Text style={[s.rowTitle, isDone && s.textStrikethrough, isDragging && { color: '#a599ff', fontWeight: '700' }]}>
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
                    onPress={() => navigation.navigate('ExerciseDetail', { exerciseId: ex.exerciseId, date: log.date })}
                  >
                    <Ionicons name="ellipsis-horizontal" size={20} color={COLORS.textMuted} />
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            </Animated.View>
          );
        })}
      </View>
    );
  };

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        
        <Animated.ScrollView 
          ref={scrollViewRef}
          contentContainerStyle={s.scrollContent} 
          showsVerticalScrollIndicator={false}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            {
              useNativeDriver: true,
              listener: (e: any) => {
                currentScrollY.current = e?.nativeEvent?.contentOffset?.y ?? 0;
              }
            }
          )}
          scrollEventThrottle={16}
        >
          {/* Header */}
          <Animated.View style={[s.header, { opacity: animHeader, transform: [{ translateY: animHeader.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }] }]}>
            <Text style={s.headerTitle}>Gym</Text>
            <View style={s.headerActions}>
              <TouchableOpacity onPress={() => { hapticMedium(); setShowSwapRoutineModal(true); }} style={s.headerBtn} activeOpacity={0.7}>
                <Ionicons name="swap-horizontal-outline" size={18} color={COLORS.textMuted} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { hapticMedium(); setShowTemplateModal(true); }} style={s.headerBtn} activeOpacity={0.7}>
                <Ionicons name="document-text-outline" size={18} color={COLORS.textMuted} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { hapticMedium(); setShowScheduleSettingsModal(true); }} style={s.headerBtn} activeOpacity={0.7}>
                <Ionicons name="calendar-outline" size={18} color={COLORS.textMuted} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { hapticMedium(); setShowBodyMetrics(true); }} style={s.headerBtn} activeOpacity={0.7}>
                <Ionicons name="body-outline" size={18} color={COLORS.textMuted} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { hapticMedium(); navigation.navigate('GymProgress'); }} style={s.headerBtn} activeOpacity={0.7}>
                <Ionicons name="bar-chart-outline" size={18} color={COLORS.textMuted} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { hapticMedium(); setShowAddModal(true); }} style={[s.headerBtn, { backgroundColor: '#a599ff22' }]} activeOpacity={0.7}>
                <Ionicons name="add" size={20} color="#a599ff" />
              </TouchableOpacity>
            </View>
          </Animated.View>

          {/* Week Strip */}
          <Animated.View style={[s.weekStrip, { opacity: Animated.multiply(headerFade, animWeek), transform: [{ translateY: animWeek.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }] }]}>
            <TouchableOpacity onPress={() => { hapticLight(); setWeekOffset(prev => prev - 1); setSelectedDate(prev => dateStrOffset(-7, prev)); }} style={s.weekNavBtn}>
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
                  <TouchableOpacity key={date} style={s.dayCol} onPress={() => setSelectedDate(date)}>
                    <Text style={[s.dayLetter, isSelected && s.dayLetterActive]}>{dateDay}</Text>
                    <View style={[s.dayPill, isSelected && s.dayPillActive]}>
                      <Text style={[s.dayNum, isSelected && s.dayNumActive]}>{dateNum}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity onPress={() => { hapticLight(); setWeekOffset(prev => prev + 1); setSelectedDate(prev => dateStrOffset(7, prev)); }} style={s.weekNavBtn}>
              <Ionicons name="chevron-forward" size={16} color={COLORS.textTertiary} />
            </TouchableOpacity>
          </Animated.View>

          {planDay?.isRest ? (
            /* ── Rest Day: Full-week stats dashboard ── */
            <WeeklyGymReport gymLogs={gymLogs} weekAnchorDate={selectedDate} />
          ) : (
            /* ── Mon–Sat: Regular workout UI ── */
            <>
              {selectedDate === todayStr() && (() => {
                const lastSleep = (sleepLogs || []).slice(-1)[0];
                const isLowReadiness = lastSleep && lastSleep.hours < 6;
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

              {renderCardio()}
              {renderExercises()}
            </>
          )}

        </Animated.ScrollView>

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
        
        <GymTemplateModal
          visible={showTemplateModal}
          onClose={() => setShowTemplateModal(false)}
          onApply={async (templateId) => {
            await applyMasterTemplate(templateId);
            // Optionally force-reload the un-started log if needed
            if (!log?.workoutStartTime && log?.id) {
              await deleteDoc(doc(db, COLLECTION.GYM_LOGS, log.id));
              setWeekOffset(prev => prev); // trigger minor re-render
            }
          }}
        />

        {/* Workout Insight Card — fires once per day on workout start */}
        <WorkoutInsightCard
          visible={showInsightCard}
          insight={workoutInsight}
          loading={insightCardLoading}
          onDismiss={() => setShowInsightCard(false)}
        />

        {/* Body Metrics & PR Hall */}
        <BodyMetricsSheet visible={showBodyMetrics} onClose={() => setShowBodyMetrics(false)} />
        <PRHallOfFameSheet visible={showPRHallOfFame} onClose={() => setShowPRHallOfFame(false)} />

        {/* ZenGymAI FAB */}
        <TouchableOpacity style={s.fabAi} onPress={() => setShowAiModal(true)}>
          <View style={s.fabGradient}>
            <Ionicons name="barbell" size={24} color={COLORS.background} />
          </View>
        </TouchableOpacity>



      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  scrollContent: { paddingBottom: 160 },
  
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
  
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12, paddingBottom: 14, paddingTop: 14 },
  headerTitle: { fontSize: 24, fontWeight: '700', color: COLORS.textPrimary, fontFamily: 'Inter-Bold' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },


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
