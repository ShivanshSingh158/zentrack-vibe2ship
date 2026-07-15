/**
 * VoiceOrb — Sara's animated presence indicator.
 *
 * Props:
 *   size       — 'small' (60px, header presence dot) | 'large' (160px, voice mode)
 *   isActive   — true when Sara is speaking or actively processing
 *   isListening — true when mic is open and waiting for user speech
 *
 * Color is always purple (#a599ff) to match app-wide accent semantics.
 * Green is reserved for success/completion signals elsewhere in the app.
 *
 * PERF NOTE: All animations run as Reanimated worklets on the UI thread.
 * The JS thread is completely uninvolved in every frame of the pulse animation.
 */

import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';

const PURPLE = '#a599ff';
const PURPLE_DIM = 'rgba(165,153,255,0.18)';
const PURPLE_MID = 'rgba(165,153,255,0.35)';

interface VoiceOrbProps {
  /** 'small' = 60px (chat header indicator), 'large' = 160px (voice overlay) */
  size?: 'small' | 'large';
  /** Sara is speaking / agent is running */
  isActive?: boolean;
  /** Mic is open, waiting for user speech */
  isListening?: boolean;
}

export default function VoiceOrb({
  size = 'small',
  isActive = false,
  isListening = false,
}: VoiceOrbProps) {
  const coreSize = size === 'large' ? 160 : 60;

  // All shared values — these run exclusively on the UI thread (zero JS involvement)
  const coreScale = useSharedValue(1);
  const coreOpacity = useSharedValue(0.7);
  const outerScale = useSharedValue(1);
  const outerOpacity = useSharedValue(0.3);

  useEffect(() => {
    // Cancel any ongoing animations before starting new ones
    cancelAnimation(coreScale);
    cancelAnimation(coreOpacity);
    cancelAnimation(outerScale);
    cancelAnimation(outerOpacity);

    if (isListening) {
      // Fast pulse — user is speaking, runs entirely on UI thread
      coreScale.value = withRepeat(
        withSequence(
          withTiming(1.12, { duration: 350, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.94, { duration: 350, easing: Easing.inOut(Easing.ease) }),
        ),
        -1, // infinite
        false
      );
      outerScale.value = withRepeat(
        withSequence(
          withTiming(1.3, { duration: 350 }),
          withTiming(1.0, { duration: 350 }),
        ),
        -1,
        false
      );
      outerOpacity.value = withRepeat(
        withSequence(
          withTiming(0.5, { duration: 350 }),
          withTiming(0.2, { duration: 350 }),
        ),
        -1,
        false
      );
    } else if (isActive) {
      // Medium pulse — Sara is responding
      coreScale.value = withRepeat(
        withSequence(
          withTiming(1.08, { duration: 600, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.96, { duration: 600, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false
      );
      outerOpacity.value = withRepeat(
        withSequence(
          withTiming(0.45, { duration: 600 }),
          withTiming(0.15, { duration: 600 }),
        ),
        -1,
        false
      );
    } else {
      // Gentle breathing — idle state, slowest animation
      coreOpacity.value = withRepeat(
        withSequence(
          withTiming(1.0, { duration: 2500, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.6, { duration: 2500, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false
      );
      outerOpacity.value = withRepeat(
        withSequence(
          withTiming(0.25, { duration: 2500 }),
          withTiming(0.08, { duration: 2500 }),
        ),
        -1,
        false
      );
    }
  }, [isActive, isListening]);

  // Animated styles — computed on UI thread, never crosses the bridge
  const outerRingStyle = useAnimatedStyle(() => ({
    transform: [{ scale: outerScale.value }],
    opacity: outerOpacity.value,
  }));

  const midRingStyle = useAnimatedStyle(() => ({
    opacity: outerOpacity.value,
  }));

  const coreStyle = useAnimatedStyle(() => ({
    transform: [{ scale: coreScale.value }],
    opacity: coreOpacity.value,
  }));

  return (
    <View style={[s.container, { width: coreSize * 1.7, height: coreSize * 1.7 }]}>
      {/* Outer glow ring — Reanimated worklet */}
      <Animated.View
        style={[
          s.ring,
          {
            width: coreSize * 1.5,
            height: coreSize * 1.5,
            borderRadius: (coreSize * 1.5) / 2,
            backgroundColor: PURPLE_DIM,
          },
          outerRingStyle,
        ]}
      />
      {/* Mid ring — Reanimated worklet */}
      <Animated.View
        style={[
          s.ring,
          {
            width: coreSize * 1.2,
            height: coreSize * 1.2,
            borderRadius: (coreSize * 1.2) / 2,
            backgroundColor: PURPLE_MID,
          },
          midRingStyle,
        ]}
      />
      {/* Core orb — Reanimated worklet */}
      <Animated.View
        style={[
          s.core,
          {
            width: coreSize,
            height: coreSize,
            borderRadius: coreSize / 2,
            backgroundColor: PURPLE,
            shadowColor: PURPLE,
          },
          coreStyle,
        ]}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
  },
  core: {
    position: 'absolute',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 24,
    elevation: 12,
  },
});
