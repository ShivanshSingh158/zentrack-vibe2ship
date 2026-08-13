/**
 * VoiceOrb — Sara's animated presence indicator.
 *
 * Props:
 *   size       — 'small' (60px, header presence dot) | 'large' (160px, voice mode)
 *   status     — State machine UI mode
 *
 * PERF NOTE: All animations run as Reanimated worklets on the UI thread.
 */

import React, { useEffect } from 'react';
import { View, StyleSheet, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
  cancelAnimation,
  withDelay,
} from 'react-native-reanimated';

const PURPLE = '#a599ff';
const PURPLE_DIM = 'rgba(165,153,255,0.18)';
const PURPLE_MID = 'rgba(165,153,255,0.35)';

export type VoiceStatus = 'idle' | 'listening' | 'processing' | 'speaking' | 'success';

interface VoiceOrbProps {
  size?: 'small' | 'large';
  status?: VoiceStatus;
  isActive?: boolean; // legacy
  isListening?: boolean; // legacy
}

export default function VoiceOrb({
  size = 'small',
  status,
  isActive = false,
  isListening = false,
}: VoiceOrbProps) {
  const coreSize = size === 'large' ? 160 : 60;

  // Resolve legacy props if status is not explicitly passed
  const currentStatus: VoiceStatus = status 
    ? status 
    : (isListening ? 'listening' : (isActive ? 'speaking' : 'idle'));

  // Outer ring animations
  const coreScale = useSharedValue(1);
  const coreOpacity = useSharedValue(0.7);
  const outerScale = useSharedValue(1);
  const outerOpacity = useSharedValue(0.3);

  // Inner elements opacities
  const idleOp = useSharedValue(1);
  const listenOp = useSharedValue(0);
  const processOp = useSharedValue(0);
  const speakOp = useSharedValue(0);
  const successOp = useSharedValue(0);

  // Waveform bars
  const bar1 = useSharedValue(0.2);
  const bar2 = useSharedValue(0.2);
  const bar3 = useSharedValue(0.2);

  useEffect(() => {
    // Cancel any ongoing animations before starting new ones
    cancelAnimation(coreScale);
    cancelAnimation(coreOpacity);
    cancelAnimation(outerScale);
    cancelAnimation(outerOpacity);

    // Fade in/out inner elements
    idleOp.value = withTiming(currentStatus === 'idle' ? 1 : 0, { duration: 300 });
    listenOp.value = withTiming(currentStatus === 'listening' ? 1 : 0, { duration: 300 });
    processOp.value = withTiming(currentStatus === 'processing' ? 1 : 0, { duration: 300 });
    speakOp.value = withTiming(currentStatus === 'speaking' ? 1 : 0, { duration: 300 });
    successOp.value = withTiming(currentStatus === 'success' ? 1 : 0, { duration: 300 });

    if (currentStatus === 'listening') {
      coreScale.value = withRepeat(
        withSequence(
          withTiming(1.12, { duration: 350, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.94, { duration: 350, easing: Easing.inOut(Easing.ease) }),
        ),
        -1, false
      );
      outerScale.value = withRepeat(
        withSequence(
          withTiming(1.3, { duration: 350 }),
          withTiming(1.0, { duration: 350 }),
        ),
        -1, false
      );
      outerOpacity.value = withRepeat(
        withSequence(
          withTiming(0.5, { duration: 350 }),
          withTiming(0.2, { duration: 350 }),
        ),
        -1, false
      );
    } else if (currentStatus === 'processing' || currentStatus === 'speaking') {
      coreScale.value = withRepeat(
        withSequence(
          withTiming(1.08, { duration: 600, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.96, { duration: 600, easing: Easing.inOut(Easing.ease) }),
        ),
        -1, false
      );
      outerOpacity.value = withRepeat(
        withSequence(
          withTiming(0.45, { duration: 600 }),
          withTiming(0.15, { duration: 600 }),
        ),
        -1, false
      );

      if (currentStatus === 'processing') {
        const d = 300;
        bar1.value = withRepeat(withSequence(withTiming(1, {duration: d}), withTiming(0.2, {duration: d})), -1, true);
        bar2.value = withDelay(100, withRepeat(withSequence(withTiming(1, {duration: d}), withTiming(0.2, {duration: d})), -1, true));
        bar3.value = withDelay(200, withRepeat(withSequence(withTiming(1, {duration: d}), withTiming(0.2, {duration: d})), -1, true));
      } else {
        cancelAnimation(bar1);
        cancelAnimation(bar2);
        cancelAnimation(bar3);
      }
    } else if (currentStatus === 'success') {
      coreScale.value = withSequence(
        withTiming(1.2, { duration: 250, easing: Easing.out(Easing.back(1.5)) }),
        withTiming(1.0, { duration: 400 })
      );
      outerOpacity.value = withTiming(0, { duration: 400 });
      coreOpacity.value = withTiming(1, { duration: 200 });
    } else {
      // Idle
      coreOpacity.value = withRepeat(
        withSequence(
          withTiming(1.0, { duration: 2500, easing: Easing.inOut(Easing.ease) }),
          withTiming(0.6, { duration: 2500, easing: Easing.inOut(Easing.ease) }),
        ),
        -1, false
      );
      outerOpacity.value = withRepeat(
        withSequence(
          withTiming(0.25, { duration: 2500 }),
          withTiming(0.08, { duration: 2500 }),
        ),
        -1, false
      );
    }
  }, [currentStatus]);

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
  
  const idleStyle = useAnimatedStyle(() => ({ opacity: idleOp.value, position: 'absolute' }));
  const listenStyle = useAnimatedStyle(() => ({ opacity: listenOp.value, position: 'absolute' }));
  const processStyle = useAnimatedStyle(() => ({ opacity: processOp.value, position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 6 }));
  const speakStyle = useAnimatedStyle(() => ({ opacity: speakOp.value, position: 'absolute' }));
  const successStyle = useAnimatedStyle(() => ({ opacity: successOp.value, position: 'absolute' }));

  const b1Style = useAnimatedStyle(() => ({ transform: [{ scaleY: bar1.value }] }));
  const b2Style = useAnimatedStyle(() => ({ transform: [{ scaleY: bar2.value }] }));
  const b3Style = useAnimatedStyle(() => ({ transform: [{ scaleY: bar3.value }] }));

  const iconSize = coreSize * 0.55;
  const imageSize = coreSize * 0.65;

  return (
    <View style={[s.container, { width: coreSize * 1.7, height: coreSize * 1.7 }]}>
      <Animated.View
        style={[s.ring, { width: coreSize * 1.5, height: coreSize * 1.5, borderRadius: (coreSize * 1.5) / 2, backgroundColor: PURPLE_DIM }, outerRingStyle]}
      />
      <Animated.View
        style={[s.ring, { width: coreSize * 1.2, height: coreSize * 1.2, borderRadius: (coreSize * 1.2) / 2, backgroundColor: PURPLE_MID }, midRingStyle]}
      />
      <Animated.View
        style={[s.core, { width: coreSize, height: coreSize, borderRadius: coreSize / 2, backgroundColor: PURPLE, shadowColor: PURPLE }, coreStyle]}
      >
        <Animated.View style={idleStyle}>
          <Image source={require('../../../assets/images/sara-idle.png')} style={{ width: imageSize, height: imageSize, opacity: 0.95 }} resizeMode="contain" />
        </Animated.View>
        <Animated.View style={listenStyle}>
          <Ionicons name="mic" size={iconSize} color="white" />
        </Animated.View>
        <Animated.View style={processStyle}>
          <Animated.View style={[s.bar, { height: iconSize * 0.8 }, b1Style]} />
          <Animated.View style={[s.bar, { height: iconSize * 0.8 }, b2Style]} />
          <Animated.View style={[s.bar, { height: iconSize * 0.8 }, b3Style]} />
        </Animated.View>
        <Animated.View style={speakStyle}>
          <Image source={require('../../../assets/images/sara-running.png')} style={{ width: imageSize, height: imageSize, opacity: 0.95 }} resizeMode="contain" />
        </Animated.View>
        <Animated.View style={successStyle}>
          <Ionicons name="checkmark" size={iconSize} color="white" />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute' },
  core: { position: 'absolute', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.7, shadowRadius: 24, elevation: 12, alignItems: 'center', justifyContent: 'center' },
  bar: { width: 8, borderRadius: 4, backgroundColor: 'white' },
});
