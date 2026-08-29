import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, Dimensions, ScrollView } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import ConfettiCannon from 'react-native-confetti-cannon';
import { StatusBar } from 'expo-status-bar';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withDelay,
} from 'react-native-reanimated';

import { GymNavigationParamList } from '../../types/gym.types';
import { calculateExerciseMaxWeight, formatIndianDatePretty } from '../../utils/gymUtils';
import { springs } from '../../theme/motion';
import { feedback } from '../../utils/haptics';
import { useWellnessData } from '../../contexts/domains/WellnessContext';
import { useTheme } from '../../contexts/ThemeContext';
import { awardXP } from '../../services/xpSystem';

// Extracted Sub-Components & Styles
import { makeWorkoutSummaryStyles } from './workoutSummaryStyles';
import WorkoutSummaryProgressionChart from '../../components/Gym/WorkoutSummaryProgressionChart';

export default function WorkoutSummaryScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeWorkoutSummaryStyles(colors, isDark), [colors, isDark]);
  const navigation = useNavigation<NativeStackNavigationProp<GymNavigationParamList>>();
  const route = useRoute<RouteProp<GymNavigationParamList, 'WorkoutSummary'>>();

  const readOnly = route.params?.readOnly || false;
  const targetDate = route.params?.date;
  const { gymLogs } = useWellnessData();

  const [newPR, setNewPR] = useState<{ name: string; weight: number } | null | undefined>(undefined);
  const [showConfetti, setShowConfetti] = useState(true);
  const [showAllExercises, setShowAllExercises] = useState(false);

  useEffect(() => {
    if (readOnly) { setNewPR(null); return; }
    const timer = setTimeout(() => {
      if (!gymLogs || gymLogs.length === 0) { setNewPR(null); return; }

      let logDate = targetDate;
      if (!logDate) {
        const sortedLogs = [...gymLogs].sort((a, b) => b.date.localeCompare(a.date));
        logDate = sortedLogs[0]?.date;
      }
      if (!logDate) { setNewPR(null); return; }

      const todayLog = gymLogs.find(l => l.date === logDate);
      if (!todayLog?.exercises) { setNewPR(null); return; }

      const pastLogs = gymLogs.filter(l => l.date < logDate!);
      let found: { name: string; weight: number } | null = null;

      for (const ex of todayLog.exercises) {
        if (!ex.setsLog) continue;
        const todayMax = calculateExerciseMaxWeight(ex as any);
        if (todayMax === 0) continue;

        let pastMax = 0;
        for (const pl of pastLogs) {
          const pastEx = pl.exercises?.find(
            e => e.exerciseId === ex.exerciseId || e.name === ex.name
          );
          if (pastEx?.setsLog) {
            const m = calculateExerciseMaxWeight(pastEx as any);
            if (m > pastMax) pastMax = m;
          }
        }
        if (todayMax > pastMax) {
          found = { name: ex.name, weight: todayMax };
          break;
        }
      }
      if (found) {
        awardXP('GYM_PR').catch(() => {});
      }
      setNewPR(found);
    }, 300);
    return () => clearTimeout(timer);
  }, [gymLogs, targetDate, readOnly]);

  const isPR = !!newPR;

  const sessionData = useMemo(() => {
    let logDate = targetDate;
    if (!logDate && gymLogs && gymLogs.length > 0) {
      logDate = [...gymLogs].sort((a, b) => b.date.localeCompare(a.date))[0]?.date;
    }
    const todayLog = gymLogs?.find(l => l.date === logDate);

    let totalSets = 0;
    let totalVolume = 0;
    let totalExercises = 0;
    const exercises: Array<{ name: string; sets: number; maxWeight: number; reps: number }> = [];

    todayLog?.exercises?.forEach(ex => {
      let exSets = 0;
      let exMaxWeight = 0;
      let exTotalReps = 0;

      ex.setsLog?.forEach((set: any) => {
        const w = (set?.weight !== null && set?.weight !== undefined && !isNaN(Number(set.weight))) ? Number(set.weight) : (set?.weightKg ? Number(set.weightKg) : 0);
        const r = (set?.reps !== null && set?.reps !== undefined && !isNaN(Number(set.reps))) ? Number(set.reps) : 0;
        if (set.completed || (todayLog as any).completed || (w > 0 && r > 0)) {
          exSets++;
          if (w > 0 && r > 0) {
            totalVolume += w * r;
            if (w > exMaxWeight) exMaxWeight = w;
            exTotalReps += r;
          } else if (r > 0) {
            exTotalReps += r;
          }
        }
      });

      if (exSets > 0) {
        totalSets += exSets;
        totalExercises++;
        exercises.push({
          name: ex.name,
          sets: exSets,
          maxWeight: exMaxWeight,
          reps: exTotalReps,
        });
      }
    });

    const duration = todayLog?.workoutDurationMinutes || 0;
    const notes = todayLog?.notes;

    return { totalSets, totalVolume, totalExercises, duration, exercises, notes };
  }, [gymLogs, targetDate]);

  const displayedExercises = showAllExercises
    ? sessionData.exercises
    : sessionData.exercises.slice(0, 3);
  const remainingCount = sessionData.exercises.length - 3;

  const availableLifts = useMemo(() => {
    const defaultLifts = ['Bench Press', 'Squat', 'Deadlift', 'Overhead Press', 'Pull Up', 'Barbell Row'];
    const loggedNames = sessionData.exercises.map(e => e.name);
    const combined = Array.from(new Set([...loggedNames, ...defaultLifts]));
    return combined.slice(0, 6);
  }, [sessionData.exercises]);

  const [selectedLift, setSelectedLift] = useState<string>('Bench Press');
  const [selectedMetric, setSelectedMetric] = useState<'1RM' | 'Volume'>('1RM');

  useEffect(() => {
    if (sessionData.exercises.length > 0) {
      setSelectedLift(sessionData.exercises[0].name);
    }
  }, [sessionData.exercises]);

  const prScale = useSharedValue(0.6);
  const streakScale = useSharedValue(0.6);
  const prOpacity = useSharedValue(0);
  const streakOpacity = useSharedValue(0);

  useEffect(() => {
    if (!readOnly) {
      feedback.success();
      prOpacity.value = withDelay(200, withSpring(1, springs.gentle));
      prScale.value = withDelay(200, withSequence(withSpring(1.15, springs.bouncy), withSpring(1, springs.snappy)));
      streakOpacity.value = withDelay(400, withSpring(1, springs.gentle));
      streakScale.value = withDelay(400, withSequence(withSpring(1.08, springs.bouncy), withSpring(1, springs.snappy)));
    } else {
      prOpacity.value = 1; prScale.value = 1; streakOpacity.value = 1; streakScale.value = 1;
    }
  }, [readOnly]);

  const prStyle = useAnimatedStyle(() => ({ transform: [{ scale: prScale.value }], opacity: prOpacity.value }));
  const streakStyle = useAnimatedStyle(() => ({ transform: [{ scale: streakScale.value }], opacity: streakOpacity.value }));

  const screenWidth = Dimensions.get('window').width;

  const chartData = useMemo(() => {
    if (!gymLogs || gymLogs.length === 0) return null;
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const ninetyDaysAgoStr = ninetyDaysAgo.toISOString().split('T')[0];
    const logsInRange = gymLogs.filter(l => l.date >= ninetyDaysAgoStr).sort((a, b) => a.date.localeCompare(b.date));
    const labels: string[] = [];
    const dataPoints: number[] = [];

    logsInRange.forEach(log => {
      if (!log.exercises) return;
      const liftEx = log.exercises.find(e => e.name.toLowerCase() === selectedLift.toLowerCase() || e.name.toLowerCase().includes(selectedLift.toLowerCase()));
      if (liftEx && liftEx.setsLog) {
        let max1RM = 0;
        let totalVolume = 0;
        liftEx.setsLog.forEach((set: any) => {
          if ((set.completed || (log as any).completed || (set.weight && set.reps)) && set.weight && set.reps) {
            const est1RM = set.weight * (1 + set.reps / 30);
            if (est1RM > max1RM) max1RM = est1RM;
            totalVolume += set.weight * set.reps;
          }
        });
        const value = selectedMetric === '1RM' ? max1RM : totalVolume;
        if (value > 0) {
          const dateObj = new Date(log.date);
          const formattedDate = `${dateObj.getMonth() + 1}/${dateObj.getDate()}`;
          labels.push(formattedDate);
          dataPoints.push(Math.round(value));
        }
      }
    });

    if (dataPoints.length === 0) return null;
    const step = Math.max(1, Math.floor(labels.length / 5));
    return {
      labels: labels.map((l, i) => i % step === 0 ? l : ''),
      datasets: [{ data: dataPoints, color: (opacity = 1) => isDark ? `rgba(255, 255, 255, ${opacity * 0.95})` : `rgba(108, 92, 231, ${opacity * 0.95})`, strokeWidth: 2 }],
    };
  }, [gymLogs, selectedLift, selectedMetric, isDark]);

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style={isDark ? 'light' : 'dark'} backgroundColor={colors.background} />
      {!readOnly && isPR && showConfetti && (
        <ConfettiCannon count={80} origin={{ x: screenWidth / 2, y: -10 }} autoStart={true} fallSpeed={2500} fadeOut={true} onAnimationEnd={() => setShowConfetti(false)} />
      )}

      {readOnly && (
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
            <Ionicons name="close" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingBottom: 160 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Section */}
        <View style={styles.heroSection}>
          <View style={styles.badgeHalo}>
            <LinearGradient
              colors={isDark ? ['rgba(165,153,255,0.22)', 'rgba(94,218,158,0.12)', 'transparent'] : ['rgba(108,92,231,0.15)', 'transparent']}
              style={styles.haloGradient}
            >
              <LinearGradient colors={isDark ? ['#282832', '#16161c'] : ['#ffffff', '#f4f4f6']} style={styles.badgeWrapper}>
                <Ionicons name="trophy" size={26} color={colors.accentPrimary} />
              </LinearGradient>
            </LinearGradient>
          </View>
          <View style={styles.sessionPill}>
            <View style={styles.pulseDot} />
            <Text style={styles.sessionPillText}>SESSION LOGGED</Text>
          </View>
          <Text style={styles.heroTitle}>{readOnly ? (targetDate ? formatIndianDatePretty(targetDate) : 'Session Summary') : 'Workout Complete'}</Text>
          <Text style={styles.heroSubtitle}>{readOnly ? 'Historical workout log details' : 'Great consistency. All sets & progress saved.'}</Text>
        </View>

        {/* PR Card */}
        {isPR && newPR && (
          <Animated.View style={prStyle}>
            <View style={styles.prCard}>
              <View style={styles.prIconBox}>
                <Ionicons name="flame" size={20} color="#FF6B6B" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.prTag}>NEW PERSONAL RECORD</Text>
                <Text style={styles.prText}>{newPR.name} — {newPR.weight} kg</Text>
              </View>
            </View>
          </Animated.View>
        )}

        {/* Stats Grid */}
        <View style={styles.statsGrid}>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>{sessionData.duration > 0 ? `${sessionData.duration}m` : '--'}</Text>
            <Text style={styles.statLabel}>DURATION</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>{sessionData.totalExercises}</Text>
            <Text style={styles.statLabel}>EXERCISES</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>{sessionData.totalSets}</Text>
            <Text style={styles.statLabel}>SETS</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statNumber}>{sessionData.totalVolume > 1000 ? `${(sessionData.totalVolume / 1000).toFixed(1)}k` : sessionData.totalVolume}</Text>
            <Text style={styles.statLabel}>KG VOL</Text>
          </View>
        </View>

        {/* Performed Exercises List */}
        {sessionData.exercises.length > 0 && (
          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>PERFORMED EXERCISES</Text>
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{sessionData.exercises.length}</Text>
              </View>
            </View>
            <View style={styles.exercisesList}>
              {displayedExercises.map((ex, index) => (
                <View key={index} style={styles.exerciseCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.exerciseName} numberOfLines={1}>{ex.name}</Text>
                    <Text style={styles.exerciseMetaBadge}>{ex.sets} sets · {ex.reps} reps</Text>
                  </View>
                  {ex.maxWeight > 0 && (
                    <Text style={styles.exerciseMetaWeight}>{ex.maxWeight} kg</Text>
                  )}
                </View>
              ))}
              {!showAllExercises && remainingCount > 0 && (
                <TouchableOpacity style={styles.expandBtn} activeOpacity={0.7} onPress={() => setShowAllExercises(true)}>
                  <Text style={styles.expandBtnText}>Show {remainingCount} more exercises</Text>
                  <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        {/* 90-Day Progression Chart Component */}
        <WorkoutSummaryProgressionChart
          availableLifts={availableLifts}
          selectedLift={selectedLift}
          setSelectedLift={setSelectedLift}
          selectedMetric={selectedMetric}
          setSelectedMetric={setSelectedMetric}
          chartData={chartData}
          streakStyle={streakStyle}
          styles={styles}
          isDark={isDark}
        />

        {/* Session Notes */}
        {sessionData.notes ? (
          <View style={styles.notesContainer}>
            <View style={styles.sectionHeaderRow}><Text style={styles.sectionTitle}>NOTES</Text></View>
            <Text style={styles.notesText}>{sessionData.notes}</Text>
          </View>
        ) : null}
      </ScrollView>

      {!readOnly && (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom + 70, 85) }]}>
          <TouchableOpacity style={styles.doneBtn} activeOpacity={0.85} onPress={() => { feedback.success(); (navigation as any).navigate('GymHome'); }}>
            <Text style={styles.doneBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}
