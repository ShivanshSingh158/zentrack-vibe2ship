/**
 * PomodoroFloatingPill.tsx — ZenTrack Mobile
 *
 * Authentic Apple Dynamic Island / Floating Activity Capsule:
 * - Appears smoothly above bottom navigation when a focus timer is active in background.
 * - Displays an elegant mode beacon with breathing glow aura when running.
 * - Shows warm amber paused badge and icon when paused.
 * - Tabular crisp typography, balanced padding, and responsive press-down spring feedback.
 * - 1-tap instant expand to the full Pomodoro sheet.
 */
import React, { useEffect } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Animated, {
  FadeInDown,
  FadeOutDown,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../../contexts/ThemeContext';
import { usePomodoro } from '../../contexts/PomodoroContext';
import { formatTime } from './pomodoroTimeMath';
import { modeAccentDark, modeAccentLight, modeIconName, modeLabel } from './pomodoroStyles';
import { feedback } from '../../utils/haptics';

export default function PomodoroFloatingPill() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { status, mode, timeLeft, isSheetOpen, setIsSheetOpen } = usePomodoro();

  const accentFn = isDark ? modeAccentDark : modeAccentLight;
  const currentAccent = accentFn(mode);

  // Subtle breathing glow aura when timer is actively running
  const pulseAnim = useSharedValue(1);
  useEffect(() => {
    if (status === 'running') {
      pulseAnim.value = withRepeat(
        withTiming(1.22, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      );
    } else {
      pulseAnim.value = withTiming(1, { duration: 250 });
    }
  }, [status, pulseAnim]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseAnim.value }],
    opacity: status === 'running' ? 0.35 : 0,
  }));

  // Only render if timer is active (running or paused) and full sheet is closed
  if (status === 'idle' || isSheetOpen) {
    return null;
  }

  const handlePress = () => {
    feedback.selectionChange();
    setIsSheetOpen(true);
  };

  const bottomOffset = Math.max(insets.bottom + 68, 82);
  const isPaused = status === 'paused';
  const pillAccent = isPaused ? '#F59E0B' : currentAccent;

  return (
    <View style={[styles.floatingContainer, { bottom: bottomOffset }]} pointerEvents="box-none">
      <Animated.View
        entering={FadeInDown.duration(260).springify().damping(22).stiffness(240)}
        exiting={FadeOutDown.duration(180)}
        style={styles.animatedWrap}
        pointerEvents="box-none"
      >
        <Pressable
          onPress={handlePress}
          style={({ pressed }) => [
            styles.capsule,
            {
              backgroundColor: isDark ? '#14121B' : '#FFFFFF',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)',
              shadowColor: pillAccent,
              transform: [{ scale: pressed ? 0.96 : 1 }],
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Focus timer ${isPaused ? 'paused' : 'running'}: ${formatTime(timeLeft)} remaining. Tap to expand.`}
        >
          {/* Status Icon Disc with Breathing Aura */}
          <View style={styles.iconContainer}>
            <Animated.View
              style={[
                styles.iconGlowAura,
                { backgroundColor: pillAccent },
                pulseStyle,
              ]}
            />
            <View
              style={[
                styles.iconDisc,
                {
                  backgroundColor: isDark
                    ? isPaused
                      ? 'rgba(245, 158, 11, 0.16)'
                      : `${currentAccent}22`
                    : isPaused
                    ? 'rgba(245, 158, 11, 0.12)'
                    : `${currentAccent}15`,
                },
              ]}
            >
              <Ionicons
                name={isPaused ? 'pause' : modeIconName(mode)}
                size={12}
                color={pillAccent}
              />
            </View>
          </View>

          {/* Time Left Tabular Digits */}
          <Text style={[styles.digitsText, { color: colors.textPrimary }]}>
            {formatTime(timeLeft)}
          </Text>

          {/* Status Badge */}
          <View
            style={[
              styles.statusBadge,
              {
                backgroundColor: isDark
                  ? isPaused
                    ? 'rgba(245, 158, 11, 0.14)'
                    : `${currentAccent}1A`
                  : isPaused
                  ? 'rgba(245, 158, 11, 0.10)'
                  : `${currentAccent}12`,
              },
            ]}
          >
            <Text style={[styles.statusBadgeText, { color: pillAccent }]}>
              {isPaused ? 'PAUSED' : modeLabel(mode)}
            </Text>
          </View>

          {/* Expand Chevron */}
          <Ionicons
            name="chevron-up"
            size={13}
            color={colors.textTertiary}
            style={styles.chevron}
          />
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  floatingContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  animatedWrap: {
    alignSelf: 'center',
  },
  capsule: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    height: 42,
    paddingLeft: 8,
    paddingRight: 14,
    borderRadius: 999,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 6,
    gap: 8,
  },
  iconContainer: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  iconGlowAura: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderRadius: 13,
  },
  iconDisc: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  digitsText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 14,
    letterSpacing: -0.4,
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
  },
  statusBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 9.5,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    includeFontPadding: false,
  },
  chevron: {
    marginLeft: 1,
  },
});
