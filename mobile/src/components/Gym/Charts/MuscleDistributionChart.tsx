import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { FONT_FAMILY, FONT_SIZE, RADIUS, SPACE } from '../../../theme/tokens';
import { useTheme } from '../../../contexts/ThemeContext';

export const MUSCLE_COLORS: Record<string, string> = {
  Chest:      '#a599ff', // accent purple
  Back:       '#89dceb', // accent blue
  Shoulders:  '#ff9f4d', // amber
  Triceps:    '#5eda9e', // green
  Biceps:     '#b8afff', // accent light
  Arms:       '#ff6b9d', // pink
  Legs:       '#ff9f4d', // amber
  Quads:      '#ff9f4d', // amber
  Hamstrings: '#89dceb', // blue
  Calves:     '#5eda9e', // green
  Abs:        '#636366', // muted
  Forearms:   '#ff9f4d', // amber
  Glutes:     '#a599ff', // purple
  Traps:      '#89dceb', // blue
  Mixed:      '#3c3c3e', // border
  Other:      '#636366',
};

interface MuscleDistributionChartProps {
  data: { muscle: string; sets: number }[];
}

export default function MuscleDistributionChart({ data }: MuscleDistributionChartProps) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const { chartData, totalSets } = useMemo(() => {
    if (!data || data.length === 0) return { chartData: [], totalSets: 0 };
    
    const sorted = [...data].sort((a, b) => b.sets - a.sets);
    const total = sorted.reduce((sum, d) => sum + d.sets, 0);

    return {
      chartData: sorted.map(item => ({
        name: item.muscle,
        sets: item.sets,
        color: MUSCLE_COLORS[item.muscle] || MUSCLE_COLORS.Other,
        pct: total > 0 ? item.sets / total : 0,
      })),
      totalSets: total,
    };
  }, [data]);

  if (chartData.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No muscle data available yet.</Text>
      </View>
    );
  }

  // SVG Donut Math
  const SIZE = 180;
  const STROKE_WIDTH = 22;
  const RADIUS_VAL = (SIZE - STROKE_WIDTH) / 2;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS_VAL;

  let currentAngle = 0;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Muscle Balance</Text>
      <Text style={styles.subtitle}>Distribution of sets across muscle groups</Text>
      
      <View style={styles.chartWrapper}>
        <View style={styles.donutContainer}>
          <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
            <G rotation="-90" origin={`${SIZE / 2}, ${SIZE / 2}`}>
              {/* Background ring */}
              <Circle
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={RADIUS_VAL}
                stroke="rgba(255,255,255,0.06)"
                strokeWidth={STROKE_WIDTH}
                fill="none"
              />
              {/* Segments */}
              {chartData.map((item, idx) => {
                const strokeDasharray = `${item.pct * CIRCUMFERENCE} ${CIRCUMFERENCE}`;
                const strokeDashoffset = -currentAngle * CIRCUMFERENCE;
                currentAngle += item.pct;

                return (
                  <Circle
                    key={idx}
                    cx={SIZE / 2}
                    cy={SIZE / 2}
                    r={RADIUS_VAL}
                    stroke={item.color}
                    strokeWidth={STROKE_WIDTH}
                    strokeDasharray={strokeDasharray}
                    strokeDashoffset={strokeDashoffset}
                    fill="none"
                  />
                );
              })}
            </G>
          </Svg>

          {/* Center Text Badge */}
          <View style={styles.centerTextContainer}>
            <Text style={styles.centerNumber}>{totalSets}</Text>
            <Text style={styles.centerLabel}>Total Sets</Text>
          </View>
        </View>

        {/* Legend Grid Below */}
        <View style={styles.legendGrid}>
          {chartData.map((item, idx) => (
            <View key={idx} style={styles.legendItem}>
              <View style={[styles.colorDot, { backgroundColor: item.color }]} />
              <Text style={styles.legendSets}>{item.sets}</Text>
              <Text style={styles.legendName}>{item.name}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: RADIUS.lg,
    padding: SPACE.md,
    marginTop: SPACE.md,
  },
  title: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.md,
    color: '#ffffff',
    marginBottom: SPACE.xs,
  },
  subtitle: {
    fontFamily: FONT_FAMILY.regular,
    fontSize: FONT_SIZE.xs,
    color: 'rgba(255, 255, 255, 0.7)',
    marginBottom: SPACE.md,
  },
  chartWrapper: {
    alignItems: 'center',
  },
  donutContainer: {
    position: 'relative',
    width: 180,
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACE.md,
  },
  centerTextContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerNumber: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 26,
    color: '#ffffff',
  },
  centerLabel: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.6)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  legendGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: SPACE.xs,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '48%',
    marginBottom: SPACE.sm,
    backgroundColor: 'rgba(255,255,255,0.03)',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: RADIUS.md,
  },
  colorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  legendSets: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 14,
    color: '#ffffff',
    marginRight: 6,
  },
  legendName: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.7)',
  },
  emptyContainer: {
    backgroundColor: colors.surface,
    borderRadius: RADIUS.lg,
    padding: SPACE.xl,
    marginTop: SPACE.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: FONT_SIZE.sm,
    color: colors.textTertiary,
  },
});
