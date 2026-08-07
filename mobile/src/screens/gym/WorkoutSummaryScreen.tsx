/**
 * WorkoutSummaryScreen — ZenTrack Mobile
 *
 * P5 — Duolingo pattern:
 *  - PR badge: springs.bouncy scale pulse (1 → 1.15 → 1) on mount + feedback.success()
 *  - Streak card: same bouncy entrance
 *  - readOnly mode: no confetti, no Done button, shows historical date
 */
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LineChart } from 'react-native-chart-kit';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import ConfettiCannon from 'react-native-confetti-cannon';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withDelay,
} from 'react-native-reanimated';
import { FONT_FAMILY, SPACE, RADIUS, FONT_SIZE } from '../../theme/tokens';
import { GymExerciseLog, GymNavigationParamList } from '../../types/gym.types';
import { calculateExerciseMaxWeight, formatIndianDatePretty } from '../../utils/gymUtils';
import { springs } from '../../theme/motion';
import { feedback } from '../../utils/haptics';
import { useMobileData } from '../../contexts/MobileDataContext';
import { calculateGymStreak } from '../../utils/gymUtils';
import { useTheme } from "../../contexts/ThemeContext";

export default function WorkoutSummaryScreen() {
    const { colors, isDark } = useTheme();
    const styles = makeStyles(colors);
  const navigation = useNavigation<NativeStackNavigationProp<GymNavigationParamList>>();
  const route = useRoute<RouteProp<GymNavigationParamList, 'WorkoutSummary'>>();

  const readOnly = route.params?.readOnly || false;
  const targetDate = route.params?.date;
  const { gymLogs } = useMobileData();

  // ── Async PR detection: deferred 300ms to not block the navigation transition ──
  // The navigation slide-in animation takes ~280ms. Running this heavy loop during
  // that window causes the JS thread to compete, creating a jank. We wait until
  // the animation is settled before computing.
  const [newPR, setNewPR] = useState<{ name: string; weight: number } | null | undefined>(undefined); // undefined = loading

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
    }, 300); // Defer until after the slide-in animation (280ms) completes
    return () => clearTimeout(timer);
  }, [gymLogs, targetDate, readOnly]);

  // Controls lifetime of the ConfettiCannon — unmounts it after animation ends
  // to prevent holding 100+ animated nodes in memory after the celebration
  const [showConfetti, setShowConfetti] = useState(true);

  const isPR = !!newPR;

  // useMemo: calculateGymStreak sorts+iterates all logs — only rerun when gymLogs changes.
  const currentStreak = useMemo(() => calculateGymStreak(gymLogs), [gymLogs]);

  // G8: Fetch session notes from the log
  const sessionNotes = useMemo(() => {
    let logDate = targetDate;
    if (!logDate && gymLogs.length > 0) {
      logDate = [...gymLogs].sort((a, b) => b.date.localeCompare(a.date))[0]?.date;
    }
    return gymLogs.find(l => l.date === logDate)?.notes || '';
  }, [gymLogs, targetDate]);

  // P5 — Bouncy entrance animations
  const prScale = useSharedValue(0.6);
  const streakScale = useSharedValue(0.6);
  const prOpacity = useSharedValue(0);
  const streakOpacity = useSharedValue(0);

  useEffect(() => {
    if (!readOnly) {
      feedback.success();

      // PR badge springs in with a bounce (springs.bouncy)
      prOpacity.value = withDelay(200, withSpring(1, springs.gentle));
      prScale.value = withDelay(
        200,
        withSequence(
          withSpring(1.15, springs.bouncy),
          withSpring(1, springs.snappy)
        )
      );

      // Streak card slightly after
      streakOpacity.value = withDelay(400, withSpring(1, springs.gentle));
      streakScale.value = withDelay(
        400,
        withSequence(
          withSpring(1.08, springs.bouncy),
          withSpring(1, springs.snappy)
        )
      );
    } else {
      // Read-only: just appear
      prOpacity.value = 1;
      prScale.value = 1;
      streakOpacity.value = 1;
      streakScale.value = 1;
    }
  }, [readOnly]);

  const prStyle = useAnimatedStyle(() => ({
    transform: [{ scale: prScale.value }],
    opacity: prOpacity.value,
  }));

  const streakStyle = useAnimatedStyle(() => ({
    transform: [{ scale: streakScale.value }],
    opacity: streakOpacity.value,
  }));

  const screenWidth = Dimensions.get('window').width;
  const [selectedLift, setSelectedLift] = useState<string>('');
  const [selectedMetric, setSelectedMetric] = useState<'1RM' | 'Volume'>('1RM');

  // Compute performed lifts for today
  const performedLifts = useMemo(() => {
    let logDate = targetDate;
    if (!logDate && gymLogs && gymLogs.length > 0) {
      logDate = [...gymLogs].sort((a, b) => b.date.localeCompare(a.date))[0]?.date;
    }
    const todayLog = gymLogs?.find(l => l.date === logDate);
    if (todayLog?.exercises && todayLog.exercises.length > 0) {
      const activeEx = todayLog.exercises.filter((e: any) => !e.skipped).map((e: any) => e.name);
      return Array.from(new Set(activeEx));
    }
    return ['Bench Press', 'Squat', 'Deadlift'];
  }, [gymLogs, targetDate]);

  useEffect(() => {
    if (performedLifts.length > 0 && (!selectedLift || !performedLifts.includes(selectedLift))) {
      setSelectedLift(performedLifts[0]);
    }
  }, [performedLifts, selectedLift]);

  const chartData = useMemo(() => {
    if (!gymLogs || gymLogs.length === 0) return null;

    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const ninetyDaysAgoStr = ninetyDaysAgo.toISOString().split('T')[0];

    const logsInRange = gymLogs
      .filter(l => l.date >= ninetyDaysAgoStr)
      .sort((a, b) => a.date.localeCompare(b.date));

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
          const formattedDate = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          labels.push(formattedDate);
          dataPoints.push(Math.round(value));
        }
      }
    });

    if (dataPoints.length < 2) return null; // Need at least 2 points for a line chart

    // Thin out labels if there are too many (e.g., > 6)
    const step = Math.ceil(labels.length / 6);
    const displayLabels = labels.map((l, i) => i % step === 0 ? l : '');

    return {
      labels: displayLabels,
      datasets: [{
        data: dataPoints,
        color: (opacity = 1) => `rgba(165, 153, 255, ${opacity})`,
        strokeWidth: 3,
      }],
      legend: [`${selectedLift} - ${selectedMetric === '1RM' ? 'Est. 1RM (kg)' : 'Volume (kg)'}`]
    };
  }, [gymLogs, selectedLift, selectedMetric]);

  return (
    <SafeAreaView style={styles.root}>
      {!readOnly && isPR && showConfetti && (
        <ConfettiCannon
          count={100}
          origin={{ x: -10, y: 0 }}
          autoStart={true}
          fallSpeed={2500}
          fadeOut={true}
          onAnimationEnd={() => setShowConfetti(false)}
        />
      )}

      {readOnly && (
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>
      )}

      <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.content, readOnly && { paddingTop: 20 }, { paddingBottom: 100 }]} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 30, width: '100%' }}>
          <View style={{ ...styles.iconContainer, marginBottom: 0, marginRight: SPACE.lg }}>
            <Ionicons name="trophy" size={56} color="#eab308" />
          </View>
          <View style={{ flex: 1, alignItems: 'flex-start' }}>
            <Text style={{ ...styles.title, fontSize: 28, marginBottom: 2, textAlign: 'left' }} adjustsFontSizeToFit numberOfLines={1}>
              {readOnly
                ? targetDate
                  ? formatIndianDatePretty(targetDate)
                  : 'Session Summary'
                : 'Workout Complete!'}
            </Text>
            <Text style={{ ...styles.subtitle, marginBottom: 0, textAlign: 'left' }}>
              {readOnly ? 'You crushed it on this day.' : 'You crushed it today.'}
            </Text>
          </View>
        </View>

        {/* P5 — PR Badge with bouncy entrance */}
        {isPR && newPR && (
          <Animated.View style={prStyle}>
            <TouchableOpacity
              style={styles.prBadge}
              onPress={() => {
                feedback.tap();
                // We can navigate back or to history
                navigation.goBack();
              }}
            >
              <Ionicons name="flame" size={20} color="#FF453A" />
              <Text style={styles.prBadgeText}>New PR: {newPR.name} ({newPR.weight}kg)</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          </Animated.View>
        )}



        {/* G8: Session Notes display */}
        {sessionNotes ? (
          <View style={styles.notesCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Ionicons name="create-outline" size={14} color={colors.textMuted} />
              <Text style={styles.notesLabel}>Session Notes</Text>
            </View>
            <Text style={styles.notesText}>{sessionNotes}</Text>
          </View>
        ) : null}

        {/* 90-Day Progression Dashboard */}
        <Animated.View style={[styles.streakCard, streakStyle, { marginTop: SPACE.lg, flex: 1 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 }}>
            <Ionicons name="stats-chart" size={18} color={colors.accentPrimary} />
            <Text style={styles.notesLabel}>90-Day Progression</Text>
          </View>

          {/* Lift Selector */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', gap: 8, paddingRight: 16 }}>
              {performedLifts.map(lift => (
                <TouchableOpacity
                  key={lift}
                  style={[
                    styles.toggleBtn,
                    selectedLift === lift && { backgroundColor: 'rgba(165,153,255,0.15)', borderColor: colors.accentPrimary }
                  ]}
                  onPress={() => { feedback.tap(); setSelectedLift(lift); }}
                >
                  <Text style={[styles.toggleBtnText, selectedLift === lift && { color: colors.accentPrimary }]}>{lift}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          {/* Metric Selector */}
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
            {['1RM', 'Volume'].map(metric => (
              <TouchableOpacity
                key={metric}
                style={[
                  styles.toggleBtn,
                  selectedMetric === metric && { backgroundColor: 'rgba(165,153,255,0.15)', borderColor: colors.accentPrimary }
                ]}
                onPress={() => { feedback.tap(); setSelectedMetric(metric as any); }}
              >
                <Text style={[styles.toggleBtnText, selectedMetric === metric && { color: colors.accentPrimary }]}>{metric === '1RM' ? 'Est. 1RM' : 'Total Volume'}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Chart Display */}
          {chartData ? (
              <LineChart
                data={chartData}
                width={screenWidth - SPACE.xl * 2}
                height={260}
                withVerticalLines={false}
                chartConfig={{
                  backgroundColor: 'transparent',
                  backgroundGradientFrom: '#1C1C1E',
                  backgroundGradientTo: '#1C1C1E',
                  backgroundGradientFromOpacity: 0,
                  backgroundGradientToOpacity: 0,
                  decimalPlaces: 0,
                  color: (opacity = 1) => `rgba(165, 153, 255, ${opacity})`,
                  labelColor: (opacity = 1) => `rgba(161, 161, 170, ${opacity})`,
                  style: { borderRadius: 16 },
                  propsForDots: { r: '5', strokeWidth: '2', stroke: colors.accentPrimary },
                  propsForBackgroundLines: { strokeDasharray: '4', stroke: 'rgba(255,255,255,0.05)' }
                }}
                bezier
                style={{
                  marginVertical: 8,
                  borderRadius: 16,
                  paddingRight: 40,
                  paddingBottom: 20,
                  marginLeft: -10,
                }}
              />
          ) : (
            <View style={{ height: 320, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 12 }}>
              <Text style={{ color: colors.textMuted, fontFamily: FONT_FAMILY.medium, textAlign: 'center', paddingHorizontal: 20 }}>Not enough {selectedLift} data in last 90 days.</Text>
            </View>
          )}
        </Animated.View>

      </ScrollView>

      {!readOnly && (
        <View style={{ paddingHorizontal: SPACE.xl, paddingTop: SPACE.md, paddingBottom: 100 }}>
          <TouchableOpacity
            style={styles.doneBtn}
            onPress={() => {
              feedback.success();
              navigation.goBack();
            }}
          >
            <Text style={styles.doneBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
      root: { flex: 1, backgroundColor: colors.background },
      header: { paddingHorizontal: SPACE.xl, paddingTop: 10, alignItems: 'flex-start' },
      backBtn: { padding: SPACE.sm, backgroundColor: colors.surface, borderRadius: RADIUS.full },
      content: { flexGrow: 1, padding: SPACE.xl, alignItems: 'center', justifyContent: 'flex-start' },
      iconContainer: { alignItems: 'center', marginBottom: SPACE.xl },
      title: {
        fontFamily: FONT_FAMILY.bold, fontSize: 32, color: colors.textPrimary,
        textAlign: 'center', marginBottom: SPACE.xs,
      },
      subtitle: {
        fontFamily: FONT_FAMILY.body, fontSize: 16, color: colors.textMuted,
        textAlign: 'center', marginBottom: 40,
      },

      prBadge: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: 'rgba(255, 69, 58, 0.1)',
        borderWidth: 1, borderColor: 'rgba(255, 69, 58, 0.3)',
        padding: SPACE.md, borderRadius: RADIUS.lg,
        marginBottom: SPACE.md, gap: SPACE.sm,
        width: '100%',
      },
      prBadgeText: { flex: 1, fontFamily: FONT_FAMILY.bold, fontSize: 14, color: '#FF453A' },

      streakCard: { width: '100%', marginBottom: 40 },
      streakInner: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: '#1C1C1E', padding: SPACE.lg, borderRadius: RADIUS.lg,
      },
      streakLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
      streakTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 16, color: colors.textPrimary, marginBottom: 2 },
      streakSubtitle: { fontFamily: FONT_FAMILY.body, fontSize: 12, color: colors.textMuted },

      doneBtn: {
        backgroundColor: '#C490FF', paddingVertical: 14, width: '100%',
        borderRadius: RADIUS.md, alignItems: 'center',
      },
      doneBtnText: { fontFamily: FONT_FAMILY.bold, fontSize: 16, color: colors.background },
      notesCard: {
        width: '100%', marginTop: SPACE.md,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: RADIUS.lg, padding: SPACE.md,
        borderWidth: 1, borderColor: 'rgba(165,153,255,0.2)',
      },
      notesLabel: { fontFamily: FONT_FAMILY.bold, fontSize: 13, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
      notesText: { fontFamily: FONT_FAMILY.body, fontSize: 15, color: colors.textPrimary, lineHeight: 22 },

      toggleBtn: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: RADIUS.full,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        backgroundColor: 'rgba(255,255,255,0.05)',
      },
      toggleBtnText: {
        fontFamily: FONT_FAMILY.bold,
        fontSize: 12,
        color: colors.textMuted,
      },
    });
