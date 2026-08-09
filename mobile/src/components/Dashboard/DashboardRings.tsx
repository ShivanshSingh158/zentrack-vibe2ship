/**
 * DashboardRings.tsx
 * HabitRing + WaterRing SVG components extracted from DashboardScreen.
 * Both are pure display components — no state, no Firestore.
 */
import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { FONT_FAMILY } from '../../theme/tokens';
import { useTheme } from '../../contexts/ThemeContext';

const RING_SIZE        = 36;
const RING_STROKE      = 3.5;
const RING_RADIUS      = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

// ─── Habit Ring ───────────────────────────────────────────────────────────────
export function HabitRing({ completed, total }: { completed: number; total: number }) {
  const { colors } = useTheme();
  const progress  = total > 0 ? Math.min(completed / total, 1) : 0;
  const strokeDash = RING_CIRCUMFERENCE * (1 - progress);

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', width: RING_SIZE, height: RING_SIZE }}>
      <Svg width={RING_SIZE} height={RING_SIZE} style={{ position: 'absolute' }}>
        {/* Track */}
        <Circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_RADIUS} strokeWidth={RING_STROKE} stroke={colors.border} fill="none" />
        {/* Progress */}
        <Circle
          cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_RADIUS}
          strokeWidth={RING_STROKE}
          stroke={progress >= 1 ? colors.accentGreen : colors.accentPrimary}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`}
          strokeDashoffset={strokeDash}
          rotation="-90"
          origin={`${RING_SIZE / 2}, ${RING_SIZE / 2}`}
        />
      </Svg>
      <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 9, color: progress >= 1 ? colors.accentGreen : colors.textMuted, lineHeight: 11 }}>
        {completed}/{total}
      </Text>
    </View>
  );
}

// ─── Water Ring ───────────────────────────────────────────────────────────────
export function WaterRing({ completed, total }: { completed: number; total: number }) {
  const { colors } = useTheme();
  const progress   = total > 0 ? Math.min(completed / total, 1) : 0;
  const strokeDash  = RING_CIRCUMFERENCE * (1 - progress);

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', width: RING_SIZE, height: RING_SIZE }}>
      <Svg width={RING_SIZE} height={RING_SIZE} style={{ position: 'absolute' }}>
        <Circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_RADIUS} strokeWidth={RING_STROKE} stroke={colors.border} fill="none" />
        <Circle
          cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_RADIUS}
          strokeWidth={RING_STROKE}
          // accentBlue = water done; accentPrimary = in-progress Sara violet
          stroke={progress >= 1 ? colors.accentBlue : colors.accentPrimary}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`}
          strokeDashoffset={strokeDash}
          rotation="-90"
          origin={`${RING_SIZE / 2}, ${RING_SIZE / 2}`}
        />
      </Svg>
      <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 9, color: progress >= 1 ? colors.accentBlue : colors.textMuted, lineHeight: 11 }}>
        {Math.round(completed / 1000 * 10) / 10}L
      </Text>
    </View>
  );
}
