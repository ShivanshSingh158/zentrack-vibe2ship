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

import { View, Text, StyleSheet, ScrollView, TouchableOpacity, KeyboardAvoidingView, Platform, Alert, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker from '@react-native-community/datetimepicker';

import { useMobileData } from '../../contexts/MobileDataContext';
import { useGymLog, todayStr, dateStrOffset } from '../../hooks/useGymLog';
import { calculateGymStreak } from '../../utils/gymUtils';
import { hapticMedium } from '../../utils/haptics';

import { COLORS, SPACE, RADIUS, FONT_FAMILY, FONT_SIZE, SHADOW } from '../../theme/tokens';

import { AddExerciseModal } from '../../components/Gym/AddExerciseModal';
import { AddCardioModal } from '../../components/Gym/AddCardioModal';
import { ExerciseHistoryDrawer } from '../../components/Gym/ExerciseHistoryDrawer';
import { ZenGymAiModal } from '../../components/Gym/ZenGymAiModal';
import { LogCardioModal } from '../../components/Gym/LogCardioModal';
import { GymNotificationModal } from '../../components/Gym/GymNotificationModal';
import { GymCardioLog } from '../../types/gym.types';

// ── Design Tokens ────────────────────────────────────────────────────────────

export default function GymHomeScreen() {
  const navigation = useNavigation<any>();
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [weekOffset, setWeekOffset] = useState(0);
  
  const { gymLogs } = useMobileData();
  const currentStreak = useMemo(() => calculateGymStreak(gymLogs), [gymLogs]);

  const { log, startWorkout, resumeWorkout, endWorkout, restTimerRemaining, clearRestTimer, addExercise, deleteExercise, updateSet, saveLog, addCardio, updateCardio, planDay } = useGymLog(selectedDate);

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCardioModal, setShowCardioModal] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [showNotifPicker, setShowNotifPicker] = useState(false);
  const [historyFor, setHistoryFor] = useState<{ id: string; name: string } | null>(null);
  const [logCardioFor, setLogCardioFor] = useState<GymCardioLog | null>(null);

  const scrollY = useRef(new Animated.Value(0)).current;
  const headerFade = scrollY.interpolate({
    inputRange: [0, 50],
    outputRange: [1, 0],
    extrapolate: 'clamp'
  });

  const animHeader = useRef(new Animated.Value(0)).current;
  const animWeek = useRef(new Animated.Value(0)).current;
  const animBanner = useRef(new Animated.Value(0)).current;
  const animList = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.stagger(100, [
      Animated.timing(animHeader, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.spring(animWeek, { toValue: 1, tension: 50, friction: 8, useNativeDriver: true }),
      Animated.spring(animBanner, { toValue: 1, tension: 50, friction: 8, useNativeDriver: true }),
      Animated.spring(animList, { toValue: 1, tension: 50, friction: 8, useNativeDriver: true }),
    ]).start();
  }, []);

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

  // Date strip
  const weekDates = useMemo(() => 
    Array.from({ length: 7 }, (_, i) => dateStrOffset(weekOffset * 7 + i - 6)),
  [weekOffset]);

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
    // Only call resumeWorkout if the workout was finished, or if it was never started
    if (!log?.workoutStartTime || log.workoutDurationMinutes !== undefined) {
      resumeWorkout();
    }
    navigation.navigate('ActiveLogging', { date: selectedDate, initialIndex: typeof index === 'number' ? index : 0 });
  };

  // Renderers
  const renderWorkoutBanner = () => {
    if (log?.workoutDurationMinutes !== undefined && !log?.workoutStartTime) {
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
    if (!log?.cardio || log.cardio.length === 0) return null;
    return (
      <View style={s.section}>
        <Text style={s.sectionLabel}>CARDIO</Text>
        {log.cardio.map(c => {
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
                    {c.incline ? ` • ${c.incline}° incline` : ''}
                  </Text>
                </View>
              </TouchableOpacity>
            </Animated.View>
          );
        })}
      </View>
    );
  };

  const renderExercises = () => {
    if (!log?.exercises || log.exercises.length === 0) return null;
    return (
      <View style={s.section}>
        <Text style={s.sectionLabel}>EXERCISES</Text>
        {log.exercises.map((ex, i) => {
          if (ex.skipped) return null;
          const isDone = ex.setsLog.length > 0 && ex.setsLog.every(set => set.completed);
          const totalSets = ex.setsLog.length;
          const completedSets = ex.setsLog.filter(s => s.completed);
          
          let subText = '';
          if (completedSets.length > 0) {
            const avgReps = Math.round(completedSets.reduce((sum, s) => sum + (s.reps || 0), 0) / completedSets.length) || 0;
            const maxWeight = Math.max(...completedSets.map(s => s.weight || 0));
            subText = `${completedSets.length}/${totalSets} sets, ~${avgReps} reps ${maxWeight > 0 ? `@ ${maxWeight}kg` : ''}`;
          } else {
            subText = `${totalSets} sets, ${ex.targetReps || '0'} reps`;
          }

          return (
            <Animated.View key={ex.id || i} style={{ opacity: animList, transform: [{ translateY: animList.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
              <TouchableOpacity style={s.row} activeOpacity={0.7} onPress={() => handleResumeWorkout(i)}>
                <View style={[s.checkboxCircle, isDone && s.checkboxCircleDone]}>
                  {isDone && <Ionicons name="checkmark" size={14} color={COLORS.background} />}
                </View>
                <View style={s.rowTextCol}>
                  <Text style={[s.rowTitle, isDone && s.textStrikethrough]}>{ex.name}</Text>
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
          contentContainerStyle={s.scrollContent} 
          showsVerticalScrollIndicator={false}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
          scrollEventThrottle={16}
        >
          {/* Header */}
          <Animated.View style={[s.header, { opacity: animHeader, transform: [{ translateY: animHeader.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }] }]}>
            <Text style={s.headerTitle}>Gym</Text>
            <View style={s.headerActions}>
              <TouchableOpacity onPress={() => { hapticMedium(); setShowNotifPicker(true); }} style={s.headerBtn}>
                <Ionicons name="notifications-outline" size={18} color={COLORS.textMuted} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { hapticMedium(); setShowAddModal(true); }} style={s.headerBtn}>
                <Ionicons name="add" size={24} color={COLORS.textPrimary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { hapticMedium(); navigation.navigate('GymProgress'); }} style={s.headerBtn}>
                <Ionicons name="bar-chart-outline" size={18} color={COLORS.textMuted} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { hapticMedium(); navigation.navigate('GymHistory'); }} style={s.headerBtn}>
                <Ionicons name="time-outline" size={18} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>
          </Animated.View>

          {/* Week Strip */}
          <Animated.View style={[s.weekStrip, { opacity: Animated.multiply(headerFade, animWeek), transform: [{ translateY: animWeek.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }] }]}>
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
          </Animated.View>

          <View style={s.workoutSection}>
            {renderWorkoutBanner()}
          </View>

          {renderCardio()}
          {renderExercises()}

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
        />

        <GymNotificationModal visible={showNotifPicker} onClose={() => setShowNotifPicker(false)} />

        {/* ZenGymAI FAB */}
        <TouchableOpacity style={s.fabAi} onPress={() => setShowAiModal(true)}>
          <View style={s.fabGradient}>
            <Ionicons name="planet" size={24} color={COLORS.background} />
          </View>
        </TouchableOpacity>

        {/* Rest Timer Overlay */}
        {restTimerRemaining > 0 && (
          <Animated.View style={s.restTimerOverlay}>
            <Text style={s.restTimerLabel}>REST</Text>
            <Text style={s.restTimerText}>{Math.floor(restTimerRemaining / 60)}:{(restTimerRemaining % 60).toString().padStart(2, '0')}</Text>
            <TouchableOpacity onPress={clearRestTimer} style={s.restTimerClose}>
              <Ionicons name="close-circle" size={24} color={COLORS.textMuted} />
            </TouchableOpacity>
          </Animated.View>
        )}

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  scrollContent: { paddingBottom: 160 },
  
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 16, paddingTop: 16 },
  headerTitle: { fontSize: 26, fontWeight: '700', color: COLORS.textPrimary, fontFamily: 'Inter-Bold' },
  headerActions: { flexDirection: 'row', gap: 16 },
  headerBtn: { padding: 4 },

  weekStrip: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 24 },
  dayCol: { alignItems: 'center', gap: 6 },
  dayLetter: { fontSize: 11, color: COLORS.textTertiary, fontFamily: 'Inter-Regular' },
  dayLetterActive: { color: COLORS.textPrimary },
  dayPill: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },
  dayPillActive: { backgroundColor: COLORS.accentPrimary },
  dayNum: { fontSize: 13, color: COLORS.textTertiary, fontFamily: 'Inter-Regular' },
  dayNumActive: { color: '#000000', fontWeight: '700' },

  workoutSection: { paddingHorizontal: 8, marginBottom: 24 },
  startBtn: { backgroundColor: '#1C1C1E', borderRadius: 16, paddingVertical: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
  startBtnText: { color: COLORS.textPrimary, fontSize: 15, fontWeight: '700', letterSpacing: 1 },

  completedBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: COLORS.accentGreenDim, borderRadius: 16, padding: 16 },
  completedBannerLeft: { gap: 2 },
  completedBannerTitle: { fontSize: 15, fontWeight: '700', color: COLORS.accentGreen },
  completedBannerSub: { fontSize: 13, color: COLORS.textMuted },
  streakBadgeInline: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 14, backgroundColor: COLORS.accentAmberDim },
  streakBadgeInlineText: { fontSize: 12, fontWeight: '700', color: COLORS.accentAmber },

  activeBanner: { backgroundColor: '#1a140b', borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#4d3b20' },
  activeBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  activeIndicator: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#eab308' },
  activeBannerTitle: { fontSize: 10, fontWeight: '700', color: '#eab308', letterSpacing: 1 },
  activeBannerResume: { fontSize: 14, fontWeight: '600', color: COLORS.textPrimary },

  section: { paddingHorizontal: 8, marginBottom: 32 },
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

  fabAi: { position: 'absolute', bottom: 100, right: 20, borderRadius: 28, elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 8 },
  fabGradient: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.accentPrimary },

  restTimerOverlay: { position: 'absolute', bottom: 110, alignSelf: 'center', backgroundColor: '#1C1C1E', borderWidth: 1, borderColor: 'rgba(52, 199, 89, 0.5)', borderRadius: 30, paddingVertical: 12, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, elevation: 10, zIndex: 9999 },
  restTimerLabel: { fontSize: 12, fontWeight: '700', color: COLORS.textTertiary, letterSpacing: 1 },
  restTimerText: { fontFamily: 'Courier', fontSize: 24, color: '#34C759', fontWeight: 'bold' },
  restTimerClose: { marginLeft: 8 }
});
