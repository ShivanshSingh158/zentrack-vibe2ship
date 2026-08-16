/**
 * StrengthProgressionChart.tsx — ZenTrack Mobile
 *
 * Shows estimated 1RM (Epley formula: weight × (1 + reps/30)) progression
 * for the top 4 compound lifts over the last 4 weeks.
 *
 * Each exercise gets a small sparkline card with:
 *  - Exercise name + current est. 1RM
 *  - Mini SVG line chart (4-week trend)
 *  - WoW delta badge (▲/▼)
 *  - Muscle group color accent
 *
 * Uses react-native-svg Path — no chart library.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONT_FAMILY, RADIUS } from '../../../theme/tokens';

interface ExerciseSpark {
  name: string;
  muscle: string;
  /** Array of { weekLabel, est1RM } — oldest first */
  weeks: { label: string; est1RM: number }[];
  currentRM: number;
  prevRM: number;
  color: string;
}

interface StrengthProgressionChartProps {
  /**
   * Top exercises with their 4-week 1RM history.
   * Computed by WeeklyGymReport from gymLogs.
   */
  exercises: ExerciseSpark[];
}

export type { ExerciseSpark };

const CARD_HEIGHT = 70;
const SPARK_W = 90;
const SPARK_H = 40;

function buildSparkPath(values: number[], w: number, h: number): string {
  if (values.length < 2) return '';
  const maxV = Math.max(...values, 1);
  const minV = Math.min(...values, 0);
  const range = maxV - minV || 1;
  const stepX = w / (values.length - 1);
  const padY = 4;
  const chartH = h - padY * 2;

  return values
    .map((v, i) => {
      const x = (i * stepX).toFixed(1);
      const y = (padY + chartH - ((v - minV) / range) * chartH).toFixed(1);
      return `${i === 0 ? 'M' : 'L'}${x},${y}`;
    })
    .join(' ');
}

function buildAreaPath(values: number[], w: number, h: number): string {
  if (values.length < 2) return '';
  const maxV = Math.max(...values, 1);
  const minV = Math.min(...values, 0);
  const range = maxV - minV || 1;
  const stepX = w / (values.length - 1);
  const padY = 4;
  const chartH = h - padY * 2;
  const baseY = (padY + chartH).toFixed(1);

  const pts = values
    .map((v, i) => {
      const x = (i * stepX).toFixed(1);
      const y = (padY + chartH - ((v - minV) / range) * chartH).toFixed(1);
      return `${i === 0 ? 'M' : 'L'}${x},${y}`;
    })
    .join(' ');

  const lastX = ((values.length - 1) * stepX).toFixed(1);
  return `${pts} L${lastX},${baseY} L0,${baseY} Z`;
}

function SparkCard({ ex }: { ex: ExerciseSpark }) {
  const values = ex.weeks.map(w => w.est1RM);
  const linePath = useMemo(() => buildSparkPath(values, SPARK_W, SPARK_H), [values]);
  const areaPath = useMemo(() => buildAreaPath(values, SPARK_W, SPARK_H), [values]);
  const delta = ex.currentRM - ex.prevRM;
  const isUp = delta > 0;
  const isFlat = delta === 0;

  const gradId = `grad_${ex.name.replace(/\s/g, '_')}`;

  return (
    <View style={[styles.sparkCard, { borderColor: `${ex.color}22` }]}>
      {/* Left: info */}
      <View style={styles.sparkInfo}>
        <View style={[styles.accentDot, { backgroundColor: ex.color }]} />
        <Text style={styles.exName} numberOfLines={1}>{ex.name}</Text>
        <Text style={styles.muscleTag}>{ex.muscle}</Text>
        <Text style={[styles.rm1Value, { color: ex.color }]}>
          {ex.currentRM}<Text style={styles.rm1Unit}> kg</Text>
        </Text>
        <Text style={styles.rm1Sub}>est. 1RM</Text>
        <View style={[
          styles.deltaBadge,
          { backgroundColor: isFlat ? 'rgba(255,255,255,0.06)' : isUp ? 'rgba(94,218,158,0.12)' : 'rgba(255,76,76,0.12)' }
        ]}>
          <Text style={[
            styles.deltaText,
            { color: isFlat ? COLORS.textTertiary : isUp ? COLORS.accentGreen : COLORS.error }
          ]}>
            {isFlat ? '• flat' : isUp ? `▲ +${delta}` : `▼ ${delta}`}
          </Text>
        </View>
      </View>

      {/* Right: sparkline */}
      <View style={styles.sparkChart}>
        {values.length >= 2 ? (
          <Svg width={SPARK_W} height={SPARK_H} viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}>
            <Defs>
              <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={ex.color} stopOpacity="0.25" />
                <Stop offset="1" stopColor={ex.color} stopOpacity="0.02" />
              </LinearGradient>
            </Defs>
            <Path d={areaPath} fill={`url(#${gradId})`} />
            <Path d={linePath} fill="none" stroke={ex.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            {/* Last point dot */}
            {(() => {
              if (values.length < 1) return null;
              const maxV = Math.max(...values, 1);
              const minV = Math.min(...values, 0);
              const range = maxV - minV || 1;
              const stepX = SPARK_W / (values.length - 1);
              const padY = 4;
              const chartH = SPARK_H - padY * 2;
              const lastIdx = values.length - 1;
              const x = (lastIdx * stepX).toFixed(1);
              const y = (padY + chartH - ((values[lastIdx] - minV) / range) * chartH).toFixed(1);
              return <Circle cx={x} cy={y} r="3" fill={ex.color} stroke="#0e0e1a" strokeWidth="1.5" />;
            })()}
          </Svg>
        ) : (
          <Text style={styles.notEnoughData}>Not enough data</Text>
        )}
        {/* Week labels */}
        <View style={styles.weekLabels}>
          {ex.weeks.map((w, i) => (
            <Text key={i} style={styles.weekLabel}>{w.label}</Text>
          ))}
        </View>
      </View>
    </View>
  );
}

export default function StrengthProgressionChart({ exercises }: StrengthProgressionChartProps) {
  if (!exercises || exercises.length === 0) return null;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Ionicons name="trending-up" size={12} color="#5eda9e" />
        </View>
        <View>
          <Text style={styles.sectionLabel}>STRENGTH PROGRESSION</Text>
          <Text style={styles.sectionSub}>Est. 1RM over 4 weeks (Epley formula)</Text>
        </View>
      </View>

      {/* Spark cards grid */}
      <View style={styles.grid}>
        {exercises.map(ex => (
          <SparkCard key={ex.name} ex={ex} />
        ))}
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
    marginBottom: 14,
  },
  headerIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: 'rgba(94,218,158,0.12)',
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
  grid: {
    gap: 8,
  },
  sparkCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    padding: 12,
    gap: 12,
  },
  sparkInfo: {
    flex: 1,
    gap: 2,
  },
  accentDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginBottom: 4,
  },
  exName: {
    fontSize: 13,
    fontFamily: FONT_FAMILY.bold,
    color: COLORS.textPrimary,
    lineHeight: 16,
  },
  muscleTag: {
    fontSize: 10,
    color: COLORS.textTertiary,
    fontFamily: FONT_FAMILY.medium,
  },
  rm1Value: {
    fontSize: 20,
    fontFamily: FONT_FAMILY.bold,
    fontWeight: '700',
    marginTop: 4,
  },
  rm1Unit: {
    fontSize: 12,
    color: COLORS.textTertiary,
    fontFamily: FONT_FAMILY.medium,
  },
  rm1Sub: {
    fontSize: 10,
    color: COLORS.textTertiary,
    fontFamily: FONT_FAMILY.regular,
  },
  deltaBadge: {
    alignSelf: 'flex-start',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginTop: 4,
  },
  deltaText: {
    fontSize: 10,
    fontFamily: FONT_FAMILY.bold,
  },
  sparkChart: {
    alignItems: 'flex-end',
  },
  weekLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: SPARK_W,
    marginTop: 3,
  },
  weekLabel: {
    fontSize: 8,
    color: COLORS.textTertiary,
    fontFamily: FONT_FAMILY.regular,
  },
  notEnoughData: {
    fontSize: 10,
    color: COLORS.textTertiary,
    fontFamily: FONT_FAMILY.regular,
    width: SPARK_W,
    textAlign: 'center',
    marginTop: 12,
  },
});
