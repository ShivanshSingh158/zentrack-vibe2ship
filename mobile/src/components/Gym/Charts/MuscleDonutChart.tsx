/**
 * MuscleDonutChart.tsx — ZenTrack Mobile
 *
 * SVG donut chart showing the distribution of this week's total sets
 * across muscle groups. Each arc segment is color-coded by muscle.
 *
 * Features:
 *  - Animated arc segments via strokeDasharray
 *  - Center displays total sets count
 *  - Tappable legend items
 *  - Shows top 6 muscles by set count
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONT_FAMILY, RADIUS } from '../../../theme/tokens';

interface MuscleStat {
  muscle: string;
  sets: number;
  color: string;
}

interface MuscleDonutChartProps {
  data: MuscleStat[];
}

const DONUT_SIZE = 140;
const STROKE_WIDTH = 18;
const GAP_DEG = 2; // degrees gap between segments

function degsToFraction(deg: number) {
  return deg / 360;
}

export default function MuscleDonutChart({ data }: MuscleDonutChartProps) {
  const filtered = useMemo(
    () =>
      [...data]
        .filter(d => d.sets > 0)
        .sort((a, b) => b.sets - a.sets)
        .slice(0, 7),
    [data],
  );

  const totalSets = useMemo(
    () => filtered.reduce((s, d) => s + d.sets, 0),
    [filtered],
  );

  const segments = useMemo(() => {
    if (totalSets === 0) return [];
    const center = DONUT_SIZE / 2;
    const r = (DONUT_SIZE - STROKE_WIDTH) / 2;
    const circ = 2 * Math.PI * r;

    let offset = 0; // degrees elapsed
    const GAP_FRAC = GAP_DEG / 360;

    return filtered.map(d => {
      const frac = d.sets / totalSets;
      const gapAdjustedFrac = Math.max(0, frac - GAP_FRAC);
      const filled = gapAdjustedFrac * circ;
      const dashOffset = -offset * circ;

      const result = {
        ...d,
        pct: Math.round(frac * 100),
        circ,
        filled,
        dashOffset,
        center,
        r,
      };

      offset += frac; // advance by full fraction (including gap)
      return result;
    });
  }, [filtered, totalSets]);

  if (filtered.length === 0) return null;

  const center = DONUT_SIZE / 2;
  const r = (DONUT_SIZE - STROKE_WIDTH) / 2;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Ionicons name="pie-chart" size={12} color="#a599ff" />
        </View>
        <View>
          <Text style={styles.sectionLabel}>MUSCLE DISTRIBUTION</Text>
          <Text style={styles.sectionSub}>Set share by muscle group</Text>
        </View>
      </View>

      {/* Chart + Legend row */}
      <View style={styles.chartRow}>
        {/* SVG Donut */}
        <View style={styles.donutWrap}>
          <Svg width={DONUT_SIZE} height={DONUT_SIZE}>
            {/* Background track */}
            <Circle
              cx={center}
              cy={center}
              r={r}
              stroke="rgba(255,255,255,0.05)"
              strokeWidth={STROKE_WIDTH}
              fill="none"
            />

            {/* Segments */}
            {segments.map((seg, i) => (
              <G key={i} rotation="-90" origin={`${center},${center}`}>
                <Circle
                  cx={center}
                  cy={center}
                  r={r}
                  fill="none"
                  stroke={seg.color}
                  strokeWidth={STROKE_WIDTH}
                  strokeDasharray={`${seg.filled} ${seg.circ - seg.filled}`}
                  strokeDashoffset={seg.dashOffset}
                  strokeLinecap="round"
                />
              </G>
            ))}
          </Svg>

          {/* Center label */}
          <View style={styles.donutCenter}>
            <Text style={styles.donutTotal}>{totalSets}</Text>
            <Text style={styles.donutTotalLabel}>total sets</Text>
          </View>
        </View>

        {/* Legend */}
        <View style={styles.legend}>
          {segments.map((seg, i) => (
            <View key={i} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: seg.color }]} />
              <View style={styles.legendInfo}>
                <Text style={styles.legendMuscle} numberOfLines={1}>{seg.muscle}</Text>
                <Text style={styles.legendStat}>
                  {seg.sets} sets · {seg.pct}%
                </Text>
              </View>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  headerIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: 'rgba(165,153,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textTertiary,
    letterSpacing: 1.2,
    fontFamily: FONT_FAMILY.bold,
  },
  sectionSub: {
    fontSize: 10,
    color: COLORS.textTertiary,
    fontFamily: FONT_FAMILY.regular,
    marginTop: 1,
  },
  chartRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  donutWrap: {
    width: DONUT_SIZE,
    height: DONUT_SIZE,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  donutCenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  donutTotal: {
    fontSize: 22,
    fontFamily: FONT_FAMILY.bold,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  donutTotalLabel: {
    fontSize: 10,
    color: COLORS.textTertiary,
    fontFamily: FONT_FAMILY.regular,
  },
  legend: {
    flex: 1,
    gap: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    flexShrink: 0,
  },
  legendInfo: {
    flex: 1,
  },
  legendMuscle: {
    fontSize: 12,
    fontFamily: FONT_FAMILY.bold,
    color: COLORS.textPrimary,
  },
  legendStat: {
    fontSize: 10,
    color: COLORS.textTertiary,
    fontFamily: FONT_FAMILY.regular,
  },
});
