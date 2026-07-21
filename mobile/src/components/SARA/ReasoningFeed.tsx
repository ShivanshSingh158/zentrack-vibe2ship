/**
 * ReasoningFeed.tsx — ZenTrack Mobile SARA Engine v2
 *
 * Capability 4 — Streaming Reasoning Transparency
 *
 * A live animated feed of what SARA is doing during thinking.
 * Each step slides in from the left with a stagger delay.
 * Steps are cleared when the final answer arrives.
 *
 * This transforms "Sara is thinking..." (opaque wait) into
 * "🧠 Reading your tasks... 📅 Checking calendar..." (engaged wait).
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { FONT_FAMILY, FONT_SIZE, RADIUS, SPACE } from '../../theme/tokens';

export interface ReasoningStep {
  id: string;
  label: string;
  timestamp: number;
}

interface ReasoningFeedProps {
  steps: ReasoningStep[];
  visible: boolean;
}

interface StepRowProps {
  step: ReasoningStep;
  index: number;
  colors: any;
}

function StepRow({ step, index, colors }: StepRowProps) {
  const slideAnim = useRef(new Animated.Value(-20)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const delay = index * 60; // 60ms stagger
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 280,
        delay,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 200,
        delay,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <Animated.View
      style={[
        styles.stepRow,
        {
          transform: [{ translateX: slideAnim }],
          opacity: opacityAnim,
        },
      ]}
    >
      <View style={[styles.stepDot, { backgroundColor: colors.accentPrimary + '60' }]} />
      <Text style={[styles.stepText, { color: colors.textMuted }]}>{step.label}</Text>
    </Animated.View>
  );
}

export default function ReasoningFeed({ steps, visible }: ReasoningFeedProps) {
  const { colors } = useTheme();
  const containerOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(containerOpacity, {
      toValue: visible ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [visible]);

  if (steps.length === 0) return null;

  // Show only last 4 steps (keeps the feed tight)
  const visibleSteps = steps.slice(-4);

  return (
    <Animated.View style={[styles.container, { opacity: containerOpacity }]}>
      {visibleSteps.map((step, idx) => (
        <StepRow
          key={step.id}
          step={step}
          index={idx}
          colors={colors}
        />
      ))}
      <PulsingDot colors={colors} />
    </Animated.View>
  );
}

function PulsingDot({ colors }: { colors: any }) {
  const pulse = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 600, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return (
    <View style={styles.pulseRow}>
      <Animated.View
        style={[
          styles.pulseDot,
          { backgroundColor: colors.accentPrimary, opacity: pulse },
        ]}
      />
      <Animated.View
        style={[
          styles.pulseDot,
          { backgroundColor: colors.accentPrimary, opacity: pulse, marginLeft: 4 },
        ]}
      />
      <Animated.View
        style={[
          styles.pulseDot,
          { backgroundColor: colors.accentPrimary, opacity: pulse, marginLeft: 4 },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: SPACE.xs,
    paddingVertical: SPACE.xs,
    gap: 4,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    paddingVertical: 2,
  },
  stepDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  stepText: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 11,
    letterSpacing: 0.2,
  },
  pulseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: SPACE.md,
    marginTop: 2,
  },
  pulseDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
});
