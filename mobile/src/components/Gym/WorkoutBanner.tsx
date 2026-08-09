/**
 * WorkoutBanner.tsx
 * Renders the workout banner in 3 states:
 *   1. Completed (green) — workout finished ≥10 min
 *   2. Active (yellow) — workout in progress with timer
 *   3. Idle — "START WORKOUT" button
 *
 * Extracted from GymHomeScreen.tsx renderWorkoutBanner().
 */
import React from 'react';
import { View, Text, TouchableOpacity, Alert, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../theme/tokens';
import { gymHomeStyles as s } from '../../screens/gym/home/gymHomeStyles';
import WorkoutTimer from './WorkoutTimer';
import { hapticMedium } from '../../utils/haptics';

interface WorkoutBannerProps {
  log: any;
  currentStreak: number;
  animBanner: Animated.Value;
  onStart: () => void;
  onResume: () => void;
  onFinish: () => void;
}

export function WorkoutBanner({ log, currentStreak, animBanner, onStart, onResume, onFinish }: WorkoutBannerProps) {
  // ── Completed state ── show whenever workout is marked completed, regardless of duration
  if (log?.completed && !log?.workoutStartTime) {
    const durationMins = log.workoutDurationMinutes ?? 0;

    // Build subtitle: prefer "startTime – endTime" if both are stored; fallback to duration
    let subLabel = '';
    if (log.startTime && log.endTime) {
      // Convert "HH:mm" to "h:mm AM/PM"
      const fmt = (t: string) => {
        const [hStr, mStr] = t.split(':');
        const h = parseInt(hStr, 10);
        const ampm = h >= 12 ? 'PM' : 'AM';
        const h12 = h % 12 || 12;
        return `${h12}:${mStr} ${ampm}`;
      };
      subLabel = `${fmt(log.startTime)} – ${fmt(log.endTime)}`;
      if (durationMins > 0) subLabel += `  •  ${durationMins} min`;
    } else if (durationMins > 0) {
      subLabel = `${durationMins} min session`;
    } else {
      subLabel = 'Session logged';
    }

    return (
      <View style={s.completedBanner}>
        <View style={s.completedBannerLeft}>
          <Text style={s.completedBannerTitle}>Workout Completed ✓</Text>
          <Text style={s.completedBannerSub}>{subLabel}</Text>
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

  // ── Active (in-progress) state ──
  if (log?.workoutStartTime && !log?.completed) {
    const handleFinish = () => {
      hapticMedium();
      if (log?.workoutStartTime) {
        const durationMins = Math.round((Date.now() - Number(log.workoutStartTime)) / 60000);
        if (durationMins < 10) {
          Alert.alert(
            'Too Short 💪',
            `Your session is only ${durationMins} min${durationMins !== 1 ? 's' : ''}. Workouts must be at least 10 minutes to count. Keep going!`,
            [{ text: 'Keep Going', style: 'cancel' }]
          );
          return;
        }
      }
      onFinish();
    };

    return (
      <View style={s.activeBanner}>
        <View style={s.activeBannerLeft}>
          <View style={s.activeIndicator} />
          <Text style={s.activeBannerTitle}>IN PROGRESS  •  </Text>
          <WorkoutTimer startTime={log.workoutStartTime} />
        </View>
        <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
          <TouchableOpacity onPress={handleFinish}>
            <Text style={{ color: '#ef4444', fontSize: 14, fontWeight: '600' }}>Finish</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onResume}>
            <Text style={s.activeBannerResume}>Resume</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Idle state: START button ──
  return (
    <Animated.View style={{ opacity: animBanner, transform: [{ translateY: animBanner.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
      <TouchableOpacity style={s.startBtn} onPress={onStart} activeOpacity={0.8}>
        <Text style={s.startBtnText}>START WORKOUT</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}
