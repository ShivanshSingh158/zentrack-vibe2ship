/**
 * WorkoutSummaryScreen — ZenTrack Mobile
 *
 * P5 — Duolingo pattern:
 *  - PR badge: springs.bouncy scale pulse (1 → 1.15 → 1) on mount + feedback.success()
 *  - Streak card: same bouncy entrance
 *  - readOnly mode: no confetti, no Done button, shows historical date
 */
import React, { useEffect } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import ConfettiCannon from 'react-native-confetti-cannon';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withDelay,
} from 'react-native-reanimated';
import { COLORS, FONT_FAMILY, SPACE, RADIUS, FONT_SIZE } from '../../theme/tokens';
import { springs } from '../../theme/motion';
import { feedback } from '../../utils/haptics';
import { useMobileData } from '../../contexts/MobileDataContext';
import { calculateGymStreak } from '../../utils/gymUtils';

export default function WorkoutSummaryScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  const readOnly = route.params?.readOnly || false;
  const targetDate = route.params?.date;
  const { gymLogs } = useMobileData();

  const getNewPR = () => {
    if (readOnly) return null; // Don't show new PRs on historical read-only views for now
    if (!gymLogs) return null;
    
    // Find today's log (or the log we just completed)
    // The date might be targetDate or today's date if not passed.
    // For simplicity, we just use targetDate if available, else we try to find the most recent.
    // However, the log might be saved with the targetDate.
    let logDate = targetDate;
    if (!logDate && gymLogs && gymLogs.length > 0) {
      // If no date passed, grab the most recent workout log instead of assuming today
      const sortedLogs = [...gymLogs].sort((a, b) => b.date.localeCompare(a.date));
      logDate = sortedLogs[0].date;
    } else if (!logDate) {
      logDate = new Date().toISOString().split('T')[0];
    }
    
    const todayLog = gymLogs.find(l => l.date === logDate);
    if (!todayLog || !todayLog.exercises) return null;
    
    const pastLogs = gymLogs.filter(l => l.date < logDate);

    for (const ex of todayLog.exercises) {
      if (!ex.setsLog) continue;
      const todayMax = Math.max(...ex.setsLog.filter((s: any) => s.completed && typeof s.weight === 'number').map((s: any) => s.weight as number), 0);
      if (todayMax === 0) continue;

      let pastMax = 0;
      let hasPast = false;
      for (const pl of pastLogs) {
        const pastEx = pl.exercises?.find(e => e.exerciseId === ex.exerciseId || e.name === ex.name);
        if (pastEx && pastEx.setsLog) {
          const m = Math.max(...pastEx.setsLog.filter((s: any) => s.completed && typeof s.weight === 'number').map((s: any) => s.weight as number), 0);
          if (m > pastMax) pastMax = m;
          hasPast = true;
        }
      }

      // If it's higher than a past max, it's a PR.
      // If there's no past max but they logged weight, we can treat it as an initial PR!
      if (todayMax > pastMax) {
        return { name: ex.name, weight: todayMax };
      }
    }
    return null;
  };

  const newPR = getNewPR();
  const isPR = !!newPR;
  const currentStreak = calculateGymStreak(gymLogs);

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
      {!readOnly && isPR && (
        <ConfettiCannon
          count={100}
          origin={{ x: -10, y: 0 }}
          autoStart={true}
          fallSpeed={2500}
          fadeOut={true}
        />
      )}

      {readOnly && (
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Ionicons name="close" size={24} color={COLORS.textPrimary} />
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
              ? new Date(targetDate).toLocaleDateString()
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
              <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
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
            <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
          </TouchableOpacity>
        </Animated.View>

        {!readOnly && (
          <TouchableOpacity
            style={styles.doneBtn}
            onPress={() => {
              feedback.success();
              navigation.navigate('GymHome');
            }}
          >
            <Text style={styles.doneBtnText}>Done</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  header: { paddingHorizontal: SPACE.xl, paddingTop: 10, alignItems: 'flex-start' },
  backBtn: { padding: SPACE.sm, backgroundColor: COLORS.surface, borderRadius: RADIUS.full },
  content: { flex: 1, padding: SPACE.xl, alignItems: 'center', justifyContent: 'center' },
  iconContainer: { alignItems: 'center', marginBottom: SPACE.xl },
  title: {
    fontFamily: FONT_FAMILY.bold, fontSize: 32, color: COLORS.textPrimary,
    textAlign: 'center', marginBottom: SPACE.xs,
  },
  subtitle: {
    fontFamily: FONT_FAMILY.body, fontSize: 16, color: COLORS.textMuted,
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
  streakTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 16, color: COLORS.textPrimary, marginBottom: 2 },
  streakSubtitle: { fontFamily: FONT_FAMILY.body, fontSize: 12, color: COLORS.textMuted },

  doneBtn: {
    backgroundColor: '#C490FF', paddingVertical: 18, width: '100%',
    borderRadius: RADIUS.md, alignItems: 'center',
  },
  doneBtnText: { fontFamily: FONT_FAMILY.bold, fontSize: 18, color: COLORS.background },
});
