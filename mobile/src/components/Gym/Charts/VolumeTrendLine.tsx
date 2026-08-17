/**
 * VolumeTrendLine.tsx — ZenTrack Mobile
 *
 * SVG multi-line chart showing daily training volume for this week vs last week.
 * Built with react-native-svg Path — no external chart library needed.
 *
 * Two overlaid lines:
 *  - This week: accent purple (#a599ff) solid line with filled area
 *  - Last week: accent blue (#89dceb) dashed line (reference)
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop, Rect, Circle, G, Line } from 'react-native-svg';
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACE } from '../../../theme/tokens';
import { useTheme } from '../../../contexts/ThemeContext';

interface VolumeTrendLineProps {
  /** Mon–Sun volumes for this week (index 0 = Monday) */
  thisWeek: number[];
  /** Mon–Sun volumes for last week */
  lastWeek: number[];
  height?: number;
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function buildLinePath(values: number[], width: number, height: number, maxVal: number, padX: number, padY: number): string {
  const chartW = width - padX * 2;
  const chartH = height - padY * 2;
  const step = chartW / Math.max(values.length - 1, 1);

  return values
    .map((v, i) => {
      const x = padX + i * step;
      const y = padY + chartH - (maxVal > 0 ? (v / maxVal) * chartH : 0);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

function buildAreaPath(values: number[], width: number, height: number, maxVal: number, padX: number, padY: number): string {
  const chartW = width - padX * 2;
  const chartH = height - padY * 2;
  const step = chartW / Math.max(values.length - 1, 1);
  const baseY = padY + chartH;

  const lineParts = values.map((v, i) => {
    const x = padX + i * step;
    const y = padY + chartH - (maxVal > 0 ? (v / maxVal) * chartH : 0);
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const lastX = padX + (values.length - 1) * step;
  return `${lineParts.join(' ')} L${lastX.toFixed(1)},${baseY.toFixed(1)} L${padX.toFixed(1)},${baseY.toFixed(1)} Z`;
}

export default function VolumeTrendLine({ thisWeek, lastWeek, height = 160 }: VolumeTrendLineProps) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  const svgWidth = 320; // rendered full width via flex
  const padX = 8;
  const padY = 12;

  const primaryColor = isDark ? '#a599ff' : '#6C5CE7';
  const secondaryColor = isDark ? '#89dceb' : '#64748B';
  const gridColor = isDark ? 'rgba(255,255,255,0.06)' : '#EAE9F2';

  const maxVal = useMemo(
    () => Math.max(1, ...thisWeek, ...lastWeek),
    [thisWeek, lastWeek],
  );

  const thisLinePath = useMemo(
    () => buildLinePath(thisWeek, svgWidth, height, maxVal, padX, padY),
    [thisWeek, height, maxVal],
  );
  const thisAreaPath = useMemo(
    () => buildAreaPath(thisWeek, svgWidth, height, maxVal, padX, padY),
    [thisWeek, height, maxVal],
  );
  const lastLinePath = useMemo(
    () => buildLinePath(lastWeek, svgWidth, height, maxVal, padX, padY),
    [lastWeek, height, maxVal],
  );

  const chartW = svgWidth - padX * 2;
  const step = chartW / Math.max(thisWeek.length - 1, 1);

  const hasData = thisWeek.some(v => v > 0) || lastWeek.some(v => v > 0);

  if (!hasData) {
    return (
      <View style={[styles.container, { height }]}>
        <Text style={styles.title}>VOLUME TREND</Text>
        <Text style={styles.empty}>No training data this week</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>VOLUME TREND</Text>
          <Text style={styles.subtitle}>This week vs last week (kg)</Text>
        </View>
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: primaryColor }]} />
            <Text style={styles.legendText}>This week</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: secondaryColor, opacity: 0.7 }]} />
            <Text style={styles.legendText}>Last week</Text>
          </View>
        </View>
      </View>

      {/* SVG Chart */}
      <View style={styles.svgWrap}>
        <Svg width="100%" height={height} viewBox={`0 0 ${svgWidth} ${height}`} preserveAspectRatio="none">
          <Defs>
            <LinearGradient id="thisWeekGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={primaryColor} stopOpacity={isDark ? 0.28 : 0.20} />
              <Stop offset="1" stopColor={primaryColor} stopOpacity={0.02} />
            </LinearGradient>
          </Defs>

          {/* Horizontal grid lines */}
          {[0.25, 0.5, 0.75, 1].map((f, i) => (
            <Line
              key={i}
              x1={padX}
              y1={padY + (height - padY * 2) * (1 - f)}
              x2={svgWidth - padX}
              y2={padY + (height - padY * 2) * (1 - f)}
              stroke={gridColor}
              strokeWidth="1"
            />
          ))}

          {/* Last week dashed reference line */}
          {lastWeek.some(v => v > 0) && (
            <Path
              d={lastLinePath}
              fill="none"
              stroke={secondaryColor}
              strokeWidth="1.5"
              strokeOpacity={isDark ? 0.55 : 0.65}
              strokeDasharray="4,4"
            />
          )}

          {/* This week filled area */}
          <Path d={thisAreaPath} fill="url(#thisWeekGrad)" />

          {/* This week solid line */}
          <Path
            d={thisLinePath}
            fill="none"
            stroke={primaryColor}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Data point dots for this week */}
          {thisWeek.map((v, i) => {
            if (v === 0) return null;
            const x = padX + i * step;
            const y = padY + (height - padY * 2) - (v / maxVal) * (height - padY * 2);
            return (
              <Circle
                key={i}
                cx={x.toFixed(1)}
                cy={y.toFixed(1)}
                r="3.5"
                fill={primaryColor}
                stroke={isDark ? '#1a1a2e' : '#ffffff'}
                strokeWidth="1.5"
              />
            );
          })}
        </Svg>
      </View>

      {/* Day labels */}
      <View style={styles.dayLabels}>
        {DAY_LABELS.map((label, i) => {
          const vol = thisWeek[i] || 0;
          const isTrained = vol > 0;
          return (
            <View key={i} style={styles.dayLabelCol}>
              <Text style={[styles.dayLabel, isTrained && styles.dayLabelActive]}>
                {label}
              </Text>
              {isTrained && (
                <Text style={styles.dayVolLabel}>
                  {vol >= 1000 ? `${(vol / 1000).toFixed(1)}k` : vol}
                </Text>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const makeStyles = (colors: any, isDark: boolean = true) =>
  StyleSheet.create({
    container: {
      backgroundColor: colors.surface,
      borderRadius: RADIUS.xl,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    title: {
      fontSize: 10,
      fontWeight: '700',
      color: colors.textTertiary,
      letterSpacing: 1.2,
      fontFamily: FONT_FAMILY.bold,
    },
    subtitle: {
      fontSize: 11,
      color: colors.textTertiary,
      fontFamily: FONT_FAMILY.regular,
      marginTop: 2,
    },
    legend: {
      gap: 6,
      alignItems: 'flex-end',
    },
    legendItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    legendDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    legendText: {
      fontSize: 10,
      color: colors.textTertiary,
      fontFamily: FONT_FAMILY.medium,
    },
    svgWrap: {
      width: '100%',
      marginBottom: 4,
    },
    dayLabels: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      paddingHorizontal: 4,
    },
    dayLabelCol: {
      alignItems: 'center',
      minWidth: 32,
    },
    dayLabel: {
      fontSize: 10,
      color: colors.textTertiary,
      fontFamily: FONT_FAMILY.medium,
    },
    dayLabelActive: {
      color: colors.textPrimary,
      fontFamily: FONT_FAMILY.bold,
    },
    dayVolLabel: {
      fontSize: 9,
      color: colors.accentPrimary,
      fontFamily: FONT_FAMILY.bold,
      marginTop: 1,
    },
    empty: {
      fontSize: 13,
      color: colors.textTertiary,
      textAlign: 'center',
      marginTop: 20,
      fontFamily: FONT_FAMILY.regular,
    },
  });
