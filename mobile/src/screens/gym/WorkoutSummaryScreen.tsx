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
  const styles = makeStyles(colors, isDark);
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
    let maxWeight = 0;
    const exercisesList: { name: string; setsCount: number; targetReps: string; maxWeight: number; muscle?: string }[] = [];

    if (todayLog?.exercises) {
      todayLog.exercises.forEach(ex => {
        if ((ex as any).skipped) return;
        let exSets = 0;
        let exMaxW = 0;
        let totalReps = 0;

        ex.setsLog?.forEach((set: any) => {
          if (set.completed || (set.weight && set.reps)) {
            const w = set.weight || 0;
            const r = set.reps || 0;
            if (w > 0 || r > 0) exSets++;
            if (w > maxWeight) maxWeight = w;
            if (w > exMaxW) exMaxW = w;
            totalVolume += w * r;
            totalReps += r;
          }
        });
        totalSets += exSets;

        const avgReps = exSets > 0 ? Math.round(totalReps / exSets) : 0;
        let repLabel = avgReps > 0 ? `~${avgReps} reps` : (ex.targetReps ? `${ex.targetReps} reps` : '0 reps');

        exercisesList.push({
          name: ex.name,
          setsCount: exSets || ex.targetSets || 0,
          targetReps: repLabel,
          maxWeight: exMaxW,
          muscle: (ex as any).muscle || undefined,
        });
      });
    }

    return {
      notes: todayLog?.notes || '',
      totalExercises: exercisesList.length,
      totalSets,
      totalVolume,
      maxWeight,
      exercisesList,
    };
  }, [gymLogs, targetDate]);

  const visibleExercises = useMemo(() => {
    if (showAllExercises || sessionData.exercisesList.length <= 3) {
      return sessionData.exercisesList;
    }
    return sessionData.exercisesList.slice(0, 3);
  }, [sessionData.exercisesList, showAllExercises]);

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
  const [selectedLift, setSelectedLift] = useState<string>('');
  const [selectedMetric, setSelectedMetric] = useState<'1RM' | 'Volume'>('1RM');

  const performedLifts = useMemo(() => {
    let logDate = targetDate;
    if (!logDate && gymLogs && gymLogs.length > 0) {
      logDate = [...gymLogs].sort((a, b) => b.date.localeCompare(a.date))[0]?.date;
    }
    const todayLog = gymLogs?.find(l => l.date === logDate);
    if (todayLog?.exercises && todayLog.exercises.length > 0) {
      const activeEx = todayLog.exercises.filter((e: any) => !e.skipped).map((e: any) => e.name);
      if (activeEx.length > 0) return Array.from(new Set(activeEx));
    }
    return ['Bench Press', 'Squat', 'Deadlift'];
  }, [gymLogs, targetDate]);

  useEffect(() => {
    if (performedLifts.length > 0 && (!selectedLift || !performedLifts.includes(selectedLift))) {
      setSelectedLift(performedLifts[0]);
    }
  }, [performedLifts, selectedLift]);

  const chartData = useMemo(() => {
    if (!gymLogs || gymLogs.length === 0 || !selectedLift) return null;
    const ninetyDaysAgo = new Date(); ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
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
          labels.push(dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
          dataPoints.push(Math.round(value));
        }
      }
    });

    if (dataPoints.length < 2) return null;
    const step = Math.ceil(labels.length / 5);
    return {
      labels: labels.map((l, i) => i % step === 0 ? l : ''),
      datasets: [{ data: dataPoints, color: (opacity = 1) => `rgba(255, 255, 255, ${opacity * 0.95})`, strokeWidth: 2 }],
    };
  }, [gymLogs, selectedLift, selectedMetric]);

  return (
    <SafeAreaView style={styles.root}>
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
              colors={isDark ? ['rgba(165,153,255,0.22)', 'rgba(94,218,158,0.12)', 'transparent'] : ['rgba(165,153,255,0.15)', 'transparent']}
              style={styles.haloGradient}
            >
              <LinearGradient colors={isDark ? ['#282832', '#16161c'] : ['#ffffff', '#f4f4f6']} style={styles.badgeWrapper}>
                <Ionicons name="trophy" size={26} color="#a599ff" />
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
              <View style={styles.prIconBox}><Ionicons name="flame" size={18} color="#FF6B6B" /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.prTag}>NEW PERSONAL RECORD</Text>
                <Text style={styles.prText}>{newPR.name} • {newPR.weight} kg</Text>
              </View>
            </View>
          </Animated.View>
        )}

        <View style={styles.statsGrid}>
          <View style={styles.statBox}>
            <Ionicons name="barbell-outline" size={15} color="#a599ff" style={{ marginBottom: 6 }} />
            <Text style={styles.statNumber}>{sessionData.totalExercises}</Text>
            <Text style={styles.statLabel}>EXERCISES</Text>
          </View>
          <View style={styles.statBox}>
            <Ionicons name="checkmark-done-circle-outline" size={15} color="#5eda9e" style={{ marginBottom: 6 }} />
            <Text style={styles.statNumber}>{sessionData.totalSets}</Text>
            <Text style={styles.statLabel}>SETS DONE</Text>
          </View>
          <View style={styles.statBox}>
            <Ionicons name="flame-outline" size={15} color="#ff9f4d" style={{ marginBottom: 6 }} />
            <Text style={styles.statNumber}>{sessionData.totalVolume > 0 ? `${(sessionData.totalVolume / 1000).toFixed(1)}k` : '0'}</Text>
            <Text style={styles.statLabel}>VOLUME (KG)</Text>
          </View>
          <View style={styles.statBox}>
            <Ionicons name="trophy-outline" size={15} color="#ffd700" style={{ marginBottom: 6 }} />
            <Text style={styles.statNumber}>{sessionData.maxWeight > 0 ? `${sessionData.maxWeight}kg` : '—'}</Text>
            <Text style={styles.statLabel}>BEST LIFT</Text>
          </View>
        </View>

        {sessionData.exercisesList.length > 0 && (
          <View style={styles.sectionContainer}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>SESSION BREAKDOWN</Text>
              <View style={styles.countBadge}><Text style={styles.countBadgeText}>{sessionData.exercisesList.length}</Text></View>
            </View>

            <View style={styles.exercisesList}>
              {visibleExercises.map((ex, idx) => (
                <View key={ex.name + idx} style={styles.exerciseCard}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={styles.exerciseName} numberOfLines={1}>{ex.name}</Text>
                    <Text style={styles.exerciseMetaBadge}>{ex.setsCount} {ex.setsCount === 1 ? 'set' : 'sets'}, {ex.targetReps}</Text>
                  </View>
                  {ex.maxWeight > 0 && (
                    <Text style={styles.exerciseMetaWeight}>{ex.maxWeight} kg</Text>
                  )}
                </View>
              ))}

              {sessionData.exercisesList.length > 3 && (
                <TouchableOpacity style={styles.expandBtn} onPress={() => { feedback.tap(); setShowAllExercises(prev => !prev); }} activeOpacity={0.7}>
                  <Text style={styles.expandBtnText}>{showAllExercises ? 'Show less' : `+ ${sessionData.exercisesList.length - 3} more`}</Text>
                  <Ionicons name={showAllExercises ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        <Animated.View style={[styles.progressionCard, streakStyle]}>
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>90-DAY PROGRESSION</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
            <View style={styles.pillRow}>
              {performedLifts.map(lift => (
                <TouchableOpacity key={lift} style={[styles.liftPill, selectedLift === lift && styles.liftPillActive]} onPress={() => { feedback.tap(); setSelectedLift(lift); }} activeOpacity={0.7}>
                  <Text style={[styles.liftPillText, selectedLift === lift && styles.liftPillTextActive]}>{lift}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
          <View style={styles.segmentedControl}>
            {(['1RM', 'Volume'] as const).map(metric => (
              <TouchableOpacity key={metric} style={[styles.segmentBtn, selectedMetric === metric && styles.segmentBtnActive]} onPress={() => { feedback.tap(); setSelectedMetric(metric); }} activeOpacity={0.8}>
                <Text style={[styles.segmentText, selectedMetric === metric && styles.segmentTextActive]}>{metric === '1RM' ? 'Est. 1RM' : 'Total Volume'}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {chartData ? (
            <View style={styles.chartWrapper}>
              <LineChart data={chartData} width={screenWidth - 64} height={200} chartConfig={{ backgroundColor: 'transparent', backgroundGradientFrom: 'transparent', backgroundGradientTo: 'transparent', decimalPlaces: 0, color: (opacity = 1) => `rgba(255, 255, 255, ${opacity * 0.95})`, labelColor: (opacity = 1) => `rgba(161, 161, 170, ${opacity * 0.8})`, propsForDots: { r: '3', strokeWidth: '1.5', stroke: colors.textPrimary }, propsForBackgroundLines: { stroke: 'rgba(255, 255, 255, 0.05)', strokeDasharray: '4' } }} bezier style={styles.chartStyle} />
            </View>
          ) : (
            <View style={styles.emptyChartBox}>
              <View style={styles.emptyIconBadge}><Ionicons name="analytics-outline" size={20} color={colors.textMuted} /></View>
              <Text style={styles.emptyChartTitle}>Insufficient Data</Text>
              <Text style={styles.emptyChartText}>Log at least 2 sessions of {selectedLift} in 90 days to see graphs.</Text>
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
  root: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: SPACE.xl, paddingTop: 10, alignItems: 'flex-start' },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)', borderRadius: RADIUS.full },
  content: { flexGrow: 1, paddingHorizontal: 8, paddingTop: SPACE.lg },
  heroSection: { alignItems: 'center', marginVertical: SPACE.lg },
  badgeHalo: { marginBottom: SPACE.md },
  haloGradient: { padding: 6, borderRadius: RADIUS.full, alignItems: 'center', justifyContent: 'center' },
  badgeWrapper: { width: 54, height: 54, borderRadius: RADIUS.full, borderWidth: 1, borderColor: isDark ? 'rgba(165,153,255,0.3)' : 'rgba(0,0,0,0.1)', alignItems: 'center', justifyContent: 'center' },
  sessionPill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: isDark ? 'rgba(94, 218, 158, 0.08)' : 'rgba(94, 218, 158, 0.1)', borderWidth: 1, borderColor: 'rgba(94, 218, 158, 0.2)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.full, marginBottom: SPACE.md },
  pulseDot: { width: 6, height: 6, borderRadius: RADIUS.full, backgroundColor: '#5eda9e' },
  sessionPillText: { fontFamily: FONT_FAMILY.bold, fontSize: 10, color: '#5eda9e', letterSpacing: 0.6 },
  heroTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 27, color: colors.textPrimary, textAlign: 'center', letterSpacing: -0.4, marginBottom: 4 },
  heroSubtitle: { fontFamily: FONT_FAMILY.body, fontSize: 14, color: colors.textMuted, textAlign: 'center' },
  prCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? '#1C1C1E' : '#F3F4F6', borderRadius: 16, padding: 16, marginBottom: SPACE.lg, gap: SPACE.md },
  prIconBox: { width: 36, height: 36, borderRadius: RADIUS.md, backgroundColor: 'rgba(255, 107, 107, 0.15)', alignItems: 'center', justifyContent: 'center' },
  prTag: { fontFamily: FONT_FAMILY.bold, fontSize: 10, color: '#FF6B6B', letterSpacing: 0.6, marginBottom: 2 },
  prText: { fontFamily: FONT_FAMILY.bold, fontSize: 15, color: colors.textPrimary },
  statsGrid: { flexDirection: 'row', gap: 8, marginBottom: SPACE.xl },
  statBox: { flex: 1, backgroundColor: isDark ? '#1C1C1E' : '#F3F4F6', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 4, alignItems: 'center' },
  statNumber: { fontFamily: FONT_FAMILY.bold, fontSize: 18, color: colors.textPrimary, marginBottom: 3 },
  statLabel: { fontFamily: FONT_FAMILY.bold, fontSize: 9, color: colors.textMuted, letterSpacing: 0.5 },
  sectionContainer: { marginBottom: SPACE.xl },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: SPACE.md, paddingLeft: 4 },
  sectionTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 11, color: colors.textMuted, letterSpacing: 1.5 },
  countBadge: { backgroundColor: isDark ? '#1C1C1E' : '#E5E7EB', paddingHorizontal: 6, paddingVertical: 2, borderRadius: RADIUS.full, marginLeft: 'auto' },
  countBadgeText: { fontFamily: FONT_FAMILY.bold, fontSize: 10, color: colors.textMuted },
  exercisesList: { gap: 8 },
  exerciseCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: isDark ? '#1C1C1E' : '#F3F4F6', padding: 16, borderRadius: 16 },
  exerciseName: { fontFamily: FONT_FAMILY.bold, fontSize: 14, color: colors.textPrimary, marginBottom: 4 },
  exerciseMetaBadge: { fontFamily: FONT_FAMILY.body, fontSize: 12, color: colors.textMuted },
  exerciseMetaWeight: { fontFamily: FONT_FAMILY.bold, fontSize: 12, color: colors.textPrimary },
  expandBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 14, backgroundColor: isDark ? '#1C1C1E' : '#F3F4F6', borderRadius: 16 },
  expandBtnText: { fontFamily: FONT_FAMILY.bold, fontSize: 12, color: colors.textMuted },
  progressionCard: { backgroundColor: isDark ? '#1C1C1E' : '#F3F4F6', borderRadius: 16, padding: SPACE.lg, marginBottom: SPACE.xl },
  pillRow: { flexDirection: 'row', gap: 8 },
  liftPill: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: RADIUS.full, backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.05)' },
  liftPillActive: { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)' },
  liftPillText: { fontFamily: FONT_FAMILY.medium, fontSize: 12, color: colors.textMuted },
  liftPillTextActive: { color: colors.textPrimary, fontFamily: FONT_FAMILY.bold },
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
  notesContainer: { backgroundColor: isDark ? '#1C1C1E' : '#F3F4F6', borderRadius: 16, padding: SPACE.lg, marginBottom: SPACE.xl },
  notesText: { fontFamily: FONT_FAMILY.body, fontSize: 14, color: colors.textPrimary, lineHeight: 20 },
  footer: { paddingHorizontal: 7, paddingTop: SPACE.sm },
  doneBtn: { backgroundColor: colors.textPrimary, paddingVertical: 14, width: '100%', borderRadius: RADIUS.lg, alignItems: 'center', justifyContent: 'center' },
  doneBtnText: { fontFamily: FONT_FAMILY.bold, fontSize: 15, color: colors.background, letterSpacing: 0.3 },
});
