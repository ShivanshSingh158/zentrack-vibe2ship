import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import Svg, { Polyline, Circle, Line, Defs, LinearGradient, Stop, Text as SvgText } from 'react-native-svg';
import { formatDateShort } from '../../utils/dateUtils';

export interface WeightChartEntry {
  weight: number;
  date: string;
}

export interface BodyMetricsHistoryChartProps {
  entries: WeightChartEntry[];
  styles: any;
  colors: any;
  isDark: boolean;
}

export const BodyMetricsHistoryChart: React.FC<BodyMetricsHistoryChartProps> = React.memo(({
  entries,
  styles,
  colors,
  isDark,
}) => {
  const CHART_W = 320;
  const CHART_H = 110;

  const chartPoints = useMemo(() => {
    if (entries.length < 2) return null;
    const weights = entries.map(l => l.weight).filter(w => w > 0);
    if (weights.length < 2) return null;
    const minW = Math.min(...weights) - 0.5;
    const maxW = Math.max(...weights) + 0.5;
    const range = maxW - minW || 1;
    return entries.map((entry, i) => {
      const x = 20 + (i / (entries.length - 1)) * (CHART_W - 40);
      const y = CHART_H - (((entry.weight - minW) / range) * (CHART_H - 28) + 14);
      return { x, y, weight: entry.weight, date: entry.date };
    });
  }, [entries]);

  if (!chartPoints || chartPoints.length < 2) return null;

  const polylinePoints = chartPoints.map(p => `${p.x},${p.y}`).join(' ');

  return (
    <Animated.View entering={FadeInDown.delay(100).duration(250)} style={styles.sectionCard}>
      <View style={styles.cardHeaderRow}>
        <Text style={styles.sectionTitle}>Weight Trend</Text>
        <Text style={styles.badgeText}>{entries[entries.length - 1]?.weight} kg</Text>
      </View>

      <View style={styles.chartContainer}>
        <Svg width={CHART_W} height={CHART_H}>
          <Defs>
            <LinearGradient id="wgrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={isDark ? '#FFFFFF' : colors.accentPrimary} stopOpacity="0.25" />
              <Stop offset="1" stopColor={isDark ? '#FFFFFF' : colors.accentPrimary} stopOpacity="0" />
            </LinearGradient>
          </Defs>
          {[0.25, 0.5, 0.75].map(f => (
            <Line
              key={f}
              x1={0}
              y1={CHART_H * (1 - f)}
              x2={CHART_W}
              y2={CHART_H * (1 - f)}
              stroke={isDark ? '#27272A' : 'rgba(0,0,0,0.08)'}
              strokeWidth={0.8}
            />
          ))}
          <Polyline
            points={polylinePoints}
            fill="none"
            stroke={isDark ? '#FFFFFF' : colors.accentPrimary}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {chartPoints.map((p, i) => (
            <React.Fragment key={i}>
              <Circle
                cx={p.x}
                cy={p.y}
                r={4}
                fill={isDark ? '#000000' : '#ffffff'}
                stroke={isDark ? '#FFFFFF' : colors.accentPrimary}
                strokeWidth={2}
              />
              {i === chartPoints.length - 1 && (
                <SvgText
                  x={p.x}
                  y={p.y - 8}
                  fontSize={10}
                  fill={isDark ? '#FFFFFF' : colors.textPrimary}
                  textAnchor="middle"
                  fontWeight="700"
                >
                  {p.weight}kg
                </SvgText>
              )}
            </React.Fragment>
          ))}
        </Svg>
      </View>

      <Text style={[styles.metricLabel, { textAlign: 'center', marginTop: 4, fontSize: 11 }]}>
        {entries.length} entries recorded ({formatDateShort(entries[0]?.date ?? '')} → {formatDateShort(entries[entries.length - 1]?.date ?? '')})
      </Text>
    </Animated.View>
  );
});

export default BodyMetricsHistoryChart;
