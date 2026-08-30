/**
 * StrengthProgressionChart.tsx — ZenTrack Mobile (Obsidian Cosmos Edition)
 *
 * Visualizes 1RM progression over 4 weeks using smooth cubic Bezier curves,
 * gradient aura fills, and muscle-coded telemetry pods.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import Svg, { Path, Circle, Defs, LinearGradient, Stop, Line } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONT_FAMILY, RADIUS, SPACE } from '../../../theme/tokens';
import { useTheme } from '../../../contexts/ThemeContext';
import { hapticLight } from '../../../utils/haptics';

interface ExerciseSpark {
  name: string;
  muscle: string;
  /** Array of { label: string; est1RM: number } — oldest first */
  weeks: { label: string; est1RM: number }[];
  currentRM: number;
  prevRM: number;
  color: string;
}

interface StrengthProgressionChartProps {
  exercises: ExerciseSpark[];
  onSelectExercise?: (name: string) => void;
}

export type { ExerciseSpark };

const SPARK_W = 110;
const SPARK_H = 46;

// ─── Pure Helper: Generate Smooth Cubic Bezier Curves for SVG ──────────────────
function generateSmoothSparkline(values: number[], w: number, h: number): { linePath: string; areaPath: string; points: Array<{ x: number; y: number }> } {
  if (values.length === 0) return { linePath: '', areaPath: '', points: [] };

  const maxV = Math.max(...values, 1);
  const minV = Math.min(...values, 0);
  const range = maxV - minV || 1;
  const padTop = 6;
  const padBottom = 6;
  const chartH = h - padTop - padBottom;
  const stepX = w / Math.max(1, values.length - 1);

  const points = values.map((v, i) => {
    const x = Number((i * stepX).toFixed(1));
    const y = Number((padTop + chartH - ((v - minV) / range) * chartH).toFixed(1));
    return { x, y };
  });

  if (points.length === 1) {
    const y = points[0].y;
    return {
      linePath: `M 0,${y} L ${w},${y}`,
      areaPath: `M 0,${y} L ${w},${y} L ${w},${h} L 0,${h} Z`,
      points,
    };
  }

  let linePath = `M ${points[0].x},${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const midX = (p0.x + p1.x) / 2;
    linePath += ` C ${midX},${p0.y} ${midX},${p1.y} ${p1.x},${p1.y}`;
  }

  const lastPt = points[points.length - 1];
  const areaPath = `${linePath} L ${lastPt.x},${h} L ${points[0].x},${h} Z`;

  return { linePath, areaPath, points };
}

function SparkCard({ ex, onPress }: { ex: ExerciseSpark; onPress?: () => void }) {
  const { colors, isDark } = useTheme();

  // Normalize historical points: filter out non-existent zero weeks to avoid artificial spikes
  const rawValues = ex.weeks.map(w => w.est1RM);
  const nonZeroValues = rawValues.filter(v => v > 0);
  const isFirstTimeBaseline = nonZeroValues.length <= 1;

  // For chart plotting: if only current week exists, create a gentle baseline
  const plotValues = useMemo(() => {
    if (isFirstTimeBaseline) {
      return [ex.currentRM, ex.currentRM, ex.currentRM, ex.currentRM];
    }
    // Fill in earlier 0s with the first recorded non-zero value
    const firstValid = rawValues.find(v => v > 0) || ex.currentRM;
    return rawValues.map(v => (v > 0 ? v : firstValid));
  }, [rawValues, ex.currentRM, isFirstTimeBaseline]);

  const { linePath, areaPath, points } = useMemo(
    () => generateSmoothSparkline(plotValues, SPARK_W, SPARK_H),
    [plotValues]
  );

  const delta = ex.prevRM > 0 && ex.prevRM !== ex.currentRM ? ex.currentRM - ex.prevRM : 0;
  const isUp = delta > 0;
  const isDown = delta < 0;

  const gradId = `spark_grad_${ex.name.replace(/[^a-zA-Z0-9]/g, '_')}_${ex.currentRM}`;
  const lastPoint = points.length > 0 ? points[points.length - 1] : null;

  return (
    <TouchableOpacity
      activeOpacity={0.78}
      onPress={() => {
        if (onPress) {
          hapticLight();
          onPress();
        }
      }}
      style={[
        localStyles.card,
        {
          borderColor: isDark ? 'rgba(255,255,255,0.07)' : colors.border,
        },
      ]}
    >
      {/* ── Card Top Row: Muscle Chip + Exercise Name + Delta Pill ────────── */}
      <View style={localStyles.cardTopRow}>
        <View style={localStyles.nameContainer}>
          <View style={[localStyles.musclePill, { backgroundColor: `${ex.color}15`, borderColor: `${ex.color}35` }]}>
            <Text style={[localStyles.musclePillText, { color: ex.color }]}>
              {ex.muscle}
            </Text>
          </View>
          <Text style={localStyles.exerciseTitle} numberOfLines={1}>
            {ex.name}
          </Text>
        </View>

        {/* Delta / Status Badge */}
        {isFirstTimeBaseline ? (
          <View style={localStyles.baselineBadge}>
            <Ionicons name="sparkles" size={10} color="#a599ff" />
            <Text style={localStyles.baselineBadgeText}>New Baseline</Text>
          </View>
        ) : isUp ? (
          <View style={[localStyles.deltaBadge, localStyles.deltaUp]}>
            <Ionicons name="trending-up" size={11} color="#5eda9e" />
            <Text style={[localStyles.deltaText, { color: '#5eda9e' }]}>+{delta} kg</Text>
          </View>
        ) : isDown ? (
          <View style={[localStyles.deltaBadge, localStyles.deltaDown]}>
            <Ionicons name="trending-down" size={11} color="#ff6961" />
            <Text style={[localStyles.deltaText, { color: '#ff6961' }]}>{delta} kg</Text>
          </View>
        ) : (
          <View style={[localStyles.deltaBadge, localStyles.deltaFlat]}>
            <Text style={[localStyles.deltaText, { color: '#8e8e93' }]}>Solid</Text>
          </View>
        )}
      </View>

      {/* ── Card Bottom Row: Big 1RM Stat + Smooth Bezier Sparkline ───────── */}
      <View style={localStyles.cardBottomRow}>
        {/* Left: 1RM Weight Numbers */}
        <View style={localStyles.statColumn}>
          <View style={localStyles.weightRow}>
            <Text style={localStyles.weightValue}>{ex.currentRM}</Text>
            <Text style={localStyles.weightUnit}>kg</Text>
          </View>
          <View style={localStyles.subLabelRow}>
            <Ionicons name="barbell-outline" size={11} color="#8e8e93" />
            <Text style={localStyles.subLabelText}>Est. 1RM</Text>
          </View>
        </View>

        {/* Right: Smooth Bezier Sparkline Curve */}
        <View style={localStyles.chartColumn}>
          <Svg width={SPARK_W} height={SPARK_H} style={{ overflow: 'visible' }}>
            <Defs>
              <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={ex.color} stopOpacity="0.28" />
                <Stop offset="1" stopColor={ex.color} stopOpacity="0.0" />
              </LinearGradient>
            </Defs>

            {/* Gradient Area Fill */}
            <Path d={areaPath} fill={`url(#${gradId})`} />

            {/* Glowing Accent Curve */}
            <Path
              d={linePath}
              fill="none"
              stroke={ex.color}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* Subtle Baseline Grid Track */}
            <Line
              x1={0}
              y1={SPARK_H - 6}
              x2={SPARK_W}
              y2={SPARK_H - 6}
              stroke="rgba(255,255,255,0.04)"
              strokeWidth="1"
              strokeDasharray="3 3"
            />

            {/* Neon Glowing End Point */}
            {lastPoint && (
              <>
                <Circle cx={lastPoint.x} cy={lastPoint.y} r={4.5} fill={ex.color} />
                <Circle
                  cx={lastPoint.x}
                  cy={lastPoint.y}
                  r={2}
                  fill="#ffffff"
                />
              </>
            )}
          </Svg>

          {/* Timeframe Axis (-3w -2w -1w Now) */}
          <View style={localStyles.axisRow}>
            {ex.weeks.map((w, i) => (
              <Text key={i} style={[localStyles.axisText, i === ex.weeks.length - 1 && localStyles.axisTextActive]}>
                {w.label}
              </Text>
            ))}
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function StrengthProgressionChart({ exercises, onSelectExercise }: StrengthProgressionChartProps) {
  const { colors, isDark } = useTheme();

  if (!exercises || exercises.length === 0) return null;

  return (
    <View style={localStyles.container}>
      {/* Section Header */}
      <View style={localStyles.header}>
        <View style={localStyles.headerIcon}>
          <Ionicons name="trending-up" size={14} color="#5eda9e" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={localStyles.sectionLabel}>STRENGTH TELEMETRY</Text>
          <Text style={localStyles.sectionSub}>4-week estimated 1RM trajectory & progressive overload</Text>
        </View>
      </View>

      {/* Cards List */}
      <View style={localStyles.list}>
        {exercises.map(ex => (
          <SparkCard
            key={ex.name}
            ex={ex}
            onPress={() => onSelectExercise && onSelectExercise(ex.name)}
          />
        ))}
      </View>
    </View>
  );
}

const localStyles = StyleSheet.create({
  container: {
    backgroundColor: '#0d0d10',
    borderRadius: RADIUS.xl,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#1f1f26',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  headerIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(94, 218, 158, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(94, 218, 158, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: FONT_FAMILY.bold,
    color: '#ffffff',
    letterSpacing: 0.8,
  },
  sectionSub: {
    fontSize: 11,
    color: '#8e8e93',
    fontFamily: FONT_FAMILY.regular,
    marginTop: 1,
  },
  list: {
    gap: 10,
  },
  card: {
    backgroundColor: '#141418',
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 8,
  },
  nameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  musclePill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  musclePillText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  exerciseTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 14.5,
    color: '#ffffff',
    letterSpacing: -0.2,
    flex: 1,
  },
  deltaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
    borderWidth: 1,
  },
  deltaUp: {
    backgroundColor: 'rgba(94, 218, 158, 0.12)',
    borderColor: 'rgba(94, 218, 158, 0.28)',
  },
  deltaDown: {
    backgroundColor: 'rgba(255, 105, 97, 0.12)',
    borderColor: 'rgba(255, 105, 97, 0.28)',
  },
  deltaFlat: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  deltaText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 10.5,
  },
  baselineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(165, 153, 255, 0.12)',
    borderColor: 'rgba(165, 153, 255, 0.28)',
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  baselineBadgeText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 10,
    color: '#a599ff',
  },
  cardBottomRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  statColumn: {
    justifyContent: 'flex-end',
  },
  weightRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
  },
  weightValue: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 22,
    color: '#ffffff',
    letterSpacing: -0.5,
  },
  weightUnit: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 12,
    color: '#8e8e93',
  },
  subLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  subLabelText: {
    fontFamily: FONT_FAMILY.regular,
    fontSize: 11,
    color: '#8e8e93',
  },
  chartColumn: {
    alignItems: 'flex-end',
  },
  axisRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: SPARK_W,
    marginTop: 4,
    paddingHorizontal: 2,
  },
  axisText: {
    fontFamily: FONT_FAMILY.regular,
    fontSize: 8.5,
    color: '#636366',
  },
  axisTextActive: {
    color: '#a599ff',
    fontFamily: FONT_FAMILY.bold,
  },
});
