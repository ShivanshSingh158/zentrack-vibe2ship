/**
 * WorkoutSummaryScreen — ZenTrack Mobile
 *
 * P5 — Duolingo pattern:
 *  - PR badge: springs.bouncy scale pulse (1 → 1.15 → 1) on mount + feedback.success()
 *  - Streak card: same bouncy entrance
 *  - readOnly mode: no confetti, no Done button, shows historical date
 */
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity } from 'react-native';
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

      <View style={[styles.content, readOnly && { paddingTop: 20 }]}>
        <View style={styles.iconContainer}>
          <Ionicons name="trophy" size={64} color="#eab308" />
        </View>
        <Text style={styles.title}>
          {readOnly
            ? targetDate
              ? formatIndianDatePretty(targetDate)
              : 'Session Summary'
            : 'Workout Complete!'}
        </Text>
        <Text style={styles.subtitle}>
          {readOnly ? 'You crushed it on this day.' : 'You crushed it today.'}
        </Text>

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

        {/* P5 — Streak card with bouncy entrance */}
        <Animated.View style={[styles.streakCard, streakStyle]}>
          <TouchableOpacity
            style={styles.streakInner}
            onPress={() => {
              feedback.tap();
              navigation.navigate('GymProgress');
            }}
          >
            <View style={styles.streakLeft}>
              <Ionicons name="calendar" size={24} color="#C490FF" />
              <View>
                <Text style={styles.streakTitle}>
                  {readOnly ? 'Consistency' : `${currentStreak} Day Streak!`}
                </Text>
                <Text style={styles.streakSubtitle}>
                  {readOnly ? 'Way to keep showing up.' : 'Keep the momentum going.'}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </Animated.View>

        {!readOnly && (
          <TouchableOpacity
            style={styles.doneBtn}
            onPress={() => {
              feedback.success();
              navigation.goBack();
            }}
          >
            <Text style={styles.doneBtnText}>Done</Text>
          </TouchableOpacity>
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
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
      root: { flex: 1, backgroundColor: colors.background },
      header: { paddingHorizontal: SPACE.xl, paddingTop: 10, alignItems: 'flex-start' },
      backBtn: { padding: SPACE.sm, backgroundColor: colors.surface, borderRadius: RADIUS.full },
      content: { flex: 1, padding: SPACE.xl, alignItems: 'center', justifyContent: 'center' },
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
        backgroundColor: '#C490FF', paddingVertical: 18, width: '100%',
        borderRadius: RADIUS.md, alignItems: 'center',
      },
      doneBtnText: { fontFamily: FONT_FAMILY.bold, fontSize: 18, color: colors.background },
      notesCard: {
        width: '100%', marginTop: SPACE.md,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderRadius: RADIUS.lg, padding: SPACE.md,
        borderWidth: 1, borderColor: 'rgba(165,153,255,0.2)',
      },
      notesLabel: { fontFamily: FONT_FAMILY.bold, fontSize: 11, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
      notesText: { fontFamily: FONT_FAMILY.body, fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
    });
