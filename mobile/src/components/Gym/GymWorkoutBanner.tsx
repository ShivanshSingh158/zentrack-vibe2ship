import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, Animated, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import WorkoutTimer from './WorkoutTimer';
import { COLORS } from '../../theme/tokens';
import { hapticMedium } from '../../utils/haptics';

export interface GymWorkoutBannerProps {
  log: any;
  s: any;
  currentStreak: number;
  selectedDate: string;
  animBanner: Animated.Value;
  navigation: any;
  onStartWorkout: () => void;
  onResumeWorkout: () => void;
  onEndWorkout: (completed: boolean) => void;
  resumeWorkout: () => void;
  onRevertWorkout?: () => void;
}

export const GymWorkoutBanner: React.FC<GymWorkoutBannerProps> = React.memo(({
  log,
  s,
  currentStreak,
  selectedDate,
  animBanner,
  navigation,
  onStartWorkout,
  onResumeWorkout,
  onEndWorkout,
  resumeWorkout,
  onRevertWorkout,
}) => {
  const isCompleted = Boolean(
    (log as any)?.completed ||
    (log?.workoutDurationMinutes !== undefined && !log?.workoutStartTime)
  );

  const hasLoggedAnyWork = useMemo(() => {
    const hasExerciseSet = (log?.exercises || []).some((ex: any) =>
      (ex?.setsLog || []).some((s: any) => Boolean(s?.completed))
    );
    const hasCardio = (log?.cardio || []).some((c: any) => Boolean(c?.completed));
    return hasExerciseSet || hasCardio;
  }, [log?.exercises, log?.cardio]);

  if (isCompleted) {
    return (
      <View style={s.completedBanner}>
        <View style={s.completedBannerLeft}>
          <Text style={s.completedBannerTitle}>Workout Completed</Text>
          <Text style={s.completedBannerSub}>
            {log?.workoutDurationMinutes ? `${log.workoutDurationMinutes} min session` : 'Session completed'}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {/* Placed properly in place of Resume:
              - If 0 sets/exercises logged: Revert button replaces Resume
              - If at least 1 set logged: Resume button stays as normal */}
          {!hasLoggedAnyWork && onRevertWorkout ? (
            <TouchableOpacity
              onPress={() => {
                hapticMedium();
                Alert.alert(
                  'Revert Workout?',
                  'No sets or exercises were logged. Revert session time to 0 and show Start Workout?',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Revert',
                      style: 'destructive',
                      onPress: () => {
                        hapticMedium();
                        onRevertWorkout();
                      },
                    },
                  ]
                );
              }}
              style={{
                backgroundColor: 'rgba(255, 159, 77, 0.15)',
                borderColor: 'rgba(255, 159, 77, 0.35)',
                borderWidth: 1,
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: 14,
              }}
              activeOpacity={0.7}
            >
              <Text style={{ color: '#ff9f4d', fontSize: 12, fontWeight: '700' }}>Revert</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={() => {
                hapticMedium();
                resumeWorkout();
                navigation.navigate('ActiveLogging', { date: selectedDate });
              }}
              style={{
                backgroundColor: 'rgba(94,218,158,0.15)',
                borderColor: 'rgba(94,218,158,0.3)',
                borderWidth: 1,
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: 14,
              }}
              activeOpacity={0.7}
            >
              <Text style={{ color: '#5eda9e', fontSize: 12, fontWeight: '700' }}>Resume</Text>
            </TouchableOpacity>
          )}

          {currentStreak > 0 && (
            <View style={s.streakBadgeInline}>
              <Ionicons name="flame" size={14} color={COLORS.accentAmber} />
              <Text style={s.streakBadgeInlineText}>{currentStreak} Day</Text>
            </View>
          )}
        </View>
      </View>
    );
  }

  if (log?.workoutStartTime) {
    return (
      <View style={s.activeBanner}>
        <View style={s.activeBannerLeft}>
          <View style={s.activeIndicator} />
          <Text style={s.activeBannerTitle}>IN PROGRESS • </Text>
          <WorkoutTimer startTime={log.workoutStartTime} />
        </View>
        <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
          <TouchableOpacity onPress={() => {
            hapticMedium();
            onEndWorkout(true);
            navigation.navigate('WorkoutSummary', { date: selectedDate });
          }}>
            <Text style={{ color: '#ef4444', fontSize: 14, fontWeight: '600' }}>Finish</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onResumeWorkout}>
            <Text style={s.activeBannerResume}>Resume</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <Animated.View style={{ opacity: animBanner, transform: [{ translateY: animBanner.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
      <TouchableOpacity style={s.startBtn} onPress={onStartWorkout} activeOpacity={0.8}>
        <Text style={s.startBtnText}>START WORKOUT</Text>
      </TouchableOpacity>
    </Animated.View>
  );
});

export default GymWorkoutBanner;
