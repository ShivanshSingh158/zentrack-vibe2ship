/**
 * WorkoutSummaryScreen — ZenTrack Mobile
 *
 * Minimalist, subtle structured workout completion view:
 *  - Flat, non-glowing hero badge
 *  - Flat subtle cards for stats & exercises (matching GymHomeScreen)
 *  - Separated exercise cards with clean typography
 *  - Subtle 90-Day Progression Dashboard with segmented metrics
 *  - Elevated floating Done CTA button positioned cleanly above bottom navigation bar
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, ScrollView } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LineChart } from 'react-native-chart-kit';
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
import { FONT_FAMILY, SPACE, RADIUS, FONT_SIZE } from '../../theme/tokens';
import { GymNavigationParamList } from '../../types/gym.types';
import { calculateExerciseMaxWeight, formatIndianDatePretty } from '../../utils/gymUtils';
import { springs } from '../../theme/motion';
import { feedback } from '../../utils/haptics';
import { useMobileData } from '../../contexts/MobileDataContext';
import { useTheme } from '../../contexts/ThemeContext';

export default function WorkoutSummaryScreen() {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const navigation = useNavigation<NativeStackNavigationProp<GymNavigationParamList>>();
  const route = useRoute<RouteProp<GymNavigationParamList, 'WorkoutSummary'>>();

  const readOnly = route.params?.readOnly || false;
  const targetDate = route.params?.date;
  const { gymLogs } = useMobileData();

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
        if (todayMax > pastMax) { found = { name: ex.name, weight: todayMax }; break; }
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
        if (set.completed || (todayLog as any).completed || (set.weight && set.reps)) {
          exSets++;
          if (set.weight && set.reps) {
            totalVolume += set.weight * set.reps;
            if (set.weight > exMaxWeight) exMaxWeight = set.weight;
            exTotalReps += set.reps;
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

        <Animated.View style={[styles.progressionCard, streakStyle]}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>90-DAY PROGRESSION</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow} style={{ marginBottom: 14 }}>
            {availableLifts.map(lift => {
              const isActive = selectedLift.toLowerCase() === lift.toLowerCase();
              return (
                <TouchableOpacity key={lift} style={[styles.liftPill, isActive && styles.liftPillActive]} onPress={() => { feedback.tap(); setSelectedLift(lift); }} activeOpacity={0.7}>
                  <Text style={[styles.liftPillText, isActive && styles.liftPillTextActive]}>{lift}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <View style={styles.segmentedControl}>
            <TouchableOpacity style={[styles.segmentBtn, selectedMetric === '1RM' && styles.segmentBtnActive]} onPress={() => { feedback.tap(); setSelectedMetric('1RM'); }} activeOpacity={0.7}>
              <Text style={[styles.segmentText, selectedMetric === '1RM' && styles.segmentTextActive]}>Est. 1RM (kg)</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.segmentBtn, selectedMetric === 'Volume' && styles.segmentBtnActive]} onPress={() => { feedback.tap(); setSelectedMetric('Volume'); }} activeOpacity={0.7}>
              <Text style={[styles.segmentText, selectedMetric === 'Volume' && styles.segmentTextActive]}>Total Volume (kg)</Text>
            </TouchableOpacity>
          </View>
          {chartData ? (
            <View style={styles.chartWrapper}>
              <LineChart
                data={chartData}
                width={screenWidth - 48}
                height={160}
                withDots={true}
                withInnerLines={true}
                withOuterLines={false}
                withVerticalLines={false}
                chartConfig={{
                  backgroundColor: 'transparent',
                  backgroundGradientFrom: isDark ? '#1C1C1E' : '#FFFFFF',
                  backgroundGradientTo: isDark ? '#1C1C1E' : '#FFFFFF',
                  decimalPlaces: 0,
                  color: (opacity = 1) => isDark ? `rgba(255, 255, 255, ${opacity})` : `rgba(108, 92, 231, ${opacity})`,
                  labelColor: (opacity = 1) => isDark ? `rgba(255, 255, 255, ${opacity * 0.45})` : `rgba(28, 28, 30, ${opacity * 0.6})`,
                  style: { borderRadius: 12 },
                  propsForBackgroundLines: { strokeDasharray: '4 4', stroke: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' },
                  propsForDots: { r: '3.5', strokeWidth: '1.5', stroke: isDark ? '#1C1C1E' : '#FFFFFF' },
                }}
                bezier
                style={styles.chartStyle}
              />
            </View>
          ) : (
            <View style={styles.emptyChartBox}>
              <View style={styles.emptyIconBadge}>
                <Ionicons name="barbell-outline" size={18} color={colors.textMuted} />
              </View>
              <Text style={styles.emptyChartTitle}>No Lift History</Text>
              <Text style={styles.emptyChartText}>Log sets for {selectedLift} across multiple workouts to plot your 90-day strength curve.</Text>
            </View>
          )}
        </Animated.View>

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

const makeStyles = (colors: any, isDark: boolean) => StyleSheet.create({
  root: { flex: 1, backgroundColor: isDark ? '#000000' : colors.background },
  header: { paddingHorizontal: SPACE.xl, paddingTop: 10, alignItems: 'flex-start' },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)', borderRadius: RADIUS.full },
  content: { flexGrow: 1, paddingHorizontal: 8, paddingTop: SPACE.lg },
  heroSection: { alignItems: 'center', marginVertical: SPACE.lg },
  badgeHalo: { marginBottom: SPACE.md },
  haloGradient: { padding: 6, borderRadius: RADIUS.full, alignItems: 'center', justifyContent: 'center' },
  badgeWrapper: { width: 54, height: 54, borderRadius: RADIUS.full, borderWidth: 1, borderColor: isDark ? 'rgba(165,153,255,0.3)' : colors.border, alignItems: 'center', justifyContent: 'center' },
  sessionPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: isDark ? 'rgba(94, 218, 158, 0.08)' : 'rgba(5, 150, 105, 0.1)', borderWidth: 1, borderColor: isDark ? 'rgba(94, 218, 158, 0.2)' : 'rgba(5, 150, 105, 0.25)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.full, marginBottom: SPACE.md },
  pulseDot: { width: 6, height: 6, borderRadius: RADIUS.full, backgroundColor: isDark ? '#5eda9e' : colors.accentGreen },
  sessionPillText: { fontFamily: FONT_FAMILY.bold, fontSize: 10, color: isDark ? '#5eda9e' : colors.accentGreen, letterSpacing: 0.6 },
  heroTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 27, color: colors.textPrimary, textAlign: 'center', letterSpacing: -0.4, marginBottom: 4 },
  heroSubtitle: { fontFamily: FONT_FAMILY.body, fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  prCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? '#1C1C1E' : colors.surface, borderRadius: 16, padding: 16, marginBottom: SPACE.lg, gap: SPACE.md, borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.05)' : colors.border },
  prIconBox: { width: 36, height: 36, borderRadius: RADIUS.md, backgroundColor: 'rgba(255, 107, 107, 0.15)', alignItems: 'center', justifyContent: 'center' },
  prTag: { fontFamily: FONT_FAMILY.bold, fontSize: 10, color: '#FF6B6B', letterSpacing: 0.6, marginBottom: 2 },
  prText: { fontFamily: FONT_FAMILY.bold, fontSize: 15, color: colors.textPrimary },
  statsGrid: { flexDirection: 'row', gap: 8, marginBottom: SPACE.xl },
  statBox: { flex: 1, backgroundColor: isDark ? '#1C1C1E' : colors.surface, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 4, alignItems: 'center', borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.05)' : colors.border },
  statNumber: { fontFamily: FONT_FAMILY.bold, fontSize: 18, color: colors.textPrimary, marginBottom: 3 },
  statLabel: { fontFamily: FONT_FAMILY.bold, fontSize: 9, color: colors.textMuted, letterSpacing: 0.5 },
  sectionContainer: { marginBottom: SPACE.xl },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: SPACE.md, paddingLeft: 4 },
  sectionTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 11, color: colors.textMuted, letterSpacing: 1.5 },
  countBadge: { backgroundColor: isDark ? '#1C1C1E' : '#E5E7EB', paddingHorizontal: 6, paddingVertical: 2, borderRadius: RADIUS.full, marginLeft: 'auto' },
  countBadgeText: { fontFamily: FONT_FAMILY.bold, fontSize: 10, color: colors.textMuted },
  exercisesList: { gap: 8 },
  exerciseCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: isDark ? '#1C1C1E' : colors.surface, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.05)' : colors.border },
  exerciseName: { fontFamily: FONT_FAMILY.bold, fontSize: 14, color: colors.textPrimary, marginBottom: 4 },
  exerciseMetaBadge: { fontFamily: FONT_FAMILY.body, fontSize: 12, color: colors.textMuted },
  exerciseMetaWeight: { fontFamily: FONT_FAMILY.bold, fontSize: 12, color: colors.textPrimary },
  expandBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 14, backgroundColor: isDark ? '#1C1C1E' : colors.surface, borderRadius: 16, borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.05)' : colors.border },
  expandBtnText: { fontFamily: FONT_FAMILY.bold, fontSize: 12, color: colors.textMuted },
  progressionCard: { backgroundColor: isDark ? '#1C1C1E' : colors.surface, borderRadius: 16, padding: SPACE.lg, marginBottom: SPACE.xl, borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.05)' : colors.border },
  pillRow: { flexDirection: 'row', gap: 8 },
  liftPill: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: RADIUS.full, backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.05)' },
  liftPillActive: { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(108, 92, 231, 0.15)' },
  liftPillText: { fontFamily: FONT_FAMILY.medium, fontSize: 12, color: colors.textMuted },
  liftPillTextActive: { color: isDark ? '#ffffff' : colors.accentPrimary, fontFamily: FONT_FAMILY.bold },
  segmentedControl: { flexDirection: 'row', backgroundColor: isDark ? 'rgba(0, 0, 0, 0.2)' : 'rgba(0, 0, 0, 0.04)', borderRadius: RADIUS.md, padding: 3, marginBottom: 16 },
  segmentBtn: { flex: 1, paddingVertical: 7, alignItems: 'center', justifyContent: 'center', borderRadius: RADIUS.md - 2 },
  segmentBtnActive: { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.12)' : '#FFFFFF' },
  segmentText: { fontFamily: FONT_FAMILY.medium, fontSize: 12, color: colors.textMuted },
  segmentTextActive: { fontFamily: FONT_FAMILY.bold, color: colors.textPrimary },
  chartWrapper: { alignItems: 'center', justifyContent: 'center', marginTop: 4, overflow: 'hidden' },
  chartStyle: { marginVertical: 4, borderRadius: 12 },
  emptyChartBox: { height: 140, justifyContent: 'center', alignItems: 'center', backgroundColor: isDark ? 'rgba(0, 0, 0, 0.15)' : 'rgba(0, 0, 0, 0.03)', borderRadius: RADIUS.md, paddingHorizontal: SPACE.xl },
  emptyIconBadge: { width: 38, height: 38, borderRadius: RADIUS.full, backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  emptyChartTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 13, color: colors.textPrimary, marginBottom: 4 },
  emptyChartText: { fontFamily: FONT_FAMILY.body, fontSize: 12, color: colors.textMuted, textAlign: 'center', lineHeight: 18 },
  notesContainer: { backgroundColor: isDark ? '#1C1C1E' : colors.surface, borderRadius: 16, padding: SPACE.lg, marginBottom: SPACE.xl, borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.05)' : colors.border },
  notesText: { fontFamily: FONT_FAMILY.body, fontSize: 14, color: colors.textPrimary, lineHeight: 20 },
  footer: { paddingHorizontal: 7, paddingTop: SPACE.sm },
  doneBtn: { backgroundColor: isDark ? '#ffffff' : colors.accentPrimary, paddingVertical: 14, width: '100%', borderRadius: RADIUS.lg, alignItems: 'center', justifyContent: 'center' },
  doneBtnText: { fontFamily: FONT_FAMILY.bold, fontSize: 15, color: isDark ? '#000000' : '#ffffff', letterSpacing: 0.3 },
});
