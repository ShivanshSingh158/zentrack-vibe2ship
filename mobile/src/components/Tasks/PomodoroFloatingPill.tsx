/**
 * PomodoroFloatingPill.tsx — ZenTrack Mobile
 *
 * Ultra-Sleek Dynamic Island / Floating Capsule:
 * - Appears above bottom navigation when a Pomodoro timer is running in the background.
 * - Shows live countdown with mode icon and subtle accent highlights.
 * - 1-tap instant expand to the full Pomodoro sheet.
 */
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Animated, {
  FadeInDown,
  FadeOutDown,
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

  // Only render if timer is active (running or paused) and full sheet is closed
  if (status === 'idle' || isSheetOpen) {
    return null;
  }

  const handlePress = () => {
    feedback.tap();
    setIsSheetOpen(true);
  };

  const bottomOffset = Math.max(insets.bottom + 68, 82);

  return (
    <View style={[styles.floatingContainer, { bottom: bottomOffset }]} pointerEvents="box-none">
      <Animated.View
        entering={FadeInDown.duration(240).springify().damping(20).stiffness(200)}
        exiting={FadeOutDown.duration(180)}
        style={styles.animatedWrap}
        pointerEvents="box-none"
      >
        <Pressable
          onPress={handlePress}
          style={[
            styles.capsule,
            {
              backgroundColor: isDark ? '#111016' : '#FFFFFF',
              borderColor: isDark ? currentAccent + '40' : currentAccent + '30',
              shadowColor: currentAccent,
            },
          ]}
        >
          {/* Pulsing Status Dot */}
          <View style={[styles.indicatorDot, { backgroundColor: currentAccent }]} />

          {/* Mode Icon */}
          <Ionicons
            name={modeIconName(mode)}
            size={13}
            color={currentAccent}
            style={{ marginRight: 2 }}
          />

          {/* Time Left */}
          <Text style={[styles.digitsText, { color: colors.textPrimary }]}>
            {formatTime(timeLeft)}
          </Text>

          {/* Mode Tag */}
          <View style={[styles.modeTag, { backgroundColor: currentAccent + '1A' }]}>
            <Text style={[styles.modeTagText, { color: currentAccent }]}>
              {status === 'paused' ? 'PAUSED' : modeLabel(mode)}
            </Text>
          </View>

          <Ionicons
            name="chevron-up"
            size={13}
            color={colors.textTertiary}
            style={{ marginLeft: 2 }}
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
    gap: 7,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1.2,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  indicatorDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  digitsText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 13.5,
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
  modeTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  modeTagText: {
    fontFamily: 'Inter_700Bold',
    fontSize: 9,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
});
