/**
 * ConsistencyHeatmap.tsx — ZenTrack Mobile
 *
 * 90-day workout consistency heatmap grid.
 * Upgraded from binary (trained/not) to 4-level intensity gradient
 * based on daily training volume (kg):
 *
 *  Level 0 → Empty:  rgba(255,255,255,0.04)
 *  Level 1 → Light:  rgba(165,153,255,0.22)   — 1..999 kg
 *  Level 2 → Medium: rgba(165,153,255,0.52)   — 1000..2999 kg
 *  Level 3 → Heavy:  #a599ff                  — 3000+ kg
 *
 * Tooltip: tapping a cell shows date + volume in a small caption.
 */

import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { FONT_FAMILY, FONT_SIZE, RADIUS, SPACE, COLORS } from '../../../theme/tokens';
import { useTheme } from '../../../contexts/ThemeContext';

interface ConsistencyHeatmapProps {
  data: { date: string; volume: number }[];
}

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function getLast90Days(): string[] {
  const dates = [];
  for (let i = 89; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    dates.push(`${y}-${m}-${day}`);
  }
  return dates;
}

function getIntensityColor(volume: number): string {
  if (volume <= 0)    return 'rgba(255,255,255,0.04)';
  if (volume < 1000)  return 'rgba(165,153,255,0.22)';
  if (volume < 3000)  return 'rgba(165,153,255,0.52)';
  return '#a599ff';
}

function formatDateShort(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[m - 1]} ${d}`;
}

export default function ConsistencyHeatmap({ data }: ConsistencyHeatmapProps) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const [selected, setSelected] = useState<{ date: string; volume: number } | null>(null);

  const { grid, totalWorkouts, maxVolume, volumeMap } = useMemo(() => {
    const dateStrings = getLast90Days();
    const volumeMap = new Map<string, number>();
    let maxVol = 0;
    let workoutCount = 0;

    data.forEach(d => {
      volumeMap.set(d.date, d.volume);
      if (d.volume > maxVol) maxVol = d.volume;
      if (d.volume > 0) workoutCount++;
    });

    // Group into columns of 7 (Mon–Sun)
    const chunks: string[][] = [];
    for (let i = 0; i < dateStrings.length; i += 7) {
      chunks.push(dateStrings.slice(i, i + 7));
    }

    return {
      grid: chunks,
      totalWorkouts: workoutCount,
      maxVolume: maxVol || 1,
      volumeMap,
    };
  }, [data]);

  const volumeForDate = (dateStr: string): number => {
    return volumeMap.get(dateStr) || 0;
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>CONSISTENCY HEATMAP</Text>
          <Text style={styles.subtitle}>
            {totalWorkouts} workouts in the last 90 days
          </Text>
        </View>
        {/* Intensity legend */}
        <View style={styles.intensityLegend}>
          <Text style={styles.legendLabel}>Less</Text>
          {['rgba(255,255,255,0.04)', 'rgba(165,153,255,0.22)', 'rgba(165,153,255,0.52)', '#a599ff'].map((c, i) => (
            <View key={i} style={[styles.legendCell, { backgroundColor: c }]} />
          ))}
          <Text style={styles.legendLabel}>More</Text>
        </View>
      </View>

      {/* Day labels + grid */}
      <View style={styles.heatmapRow}>
        {/* Mon–Sun row labels */}
        <View style={styles.dayLabelsCol}>
          {DAY_LABELS.map((label, i) => (
            <Text key={i} style={styles.dayLabelText}>{label}</Text>
          ))}
        </View>

        {/* Scrollable grid */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scrollArea}>
          <View style={styles.grid}>
            {grid.map((col, colIndex) => (
              <View key={`col-${colIndex}`} style={styles.column}>
                {col.map((dateStr) => {
                  const vol = volumeForDate(dateStr);
                  const bgColor = getIntensityColor(vol);
                  const isSelected = selected?.date === dateStr;
                  return (
                    <TouchableOpacity
                      key={dateStr}
                      onPress={() => {
                        if (vol > 0) {
                          setSelected(prev => prev?.date === dateStr ? null : { date: dateStr, volume: vol });
                        }
                      }}
                      activeOpacity={vol > 0 ? 0.7 : 1}
                    >
                      <View
                        style={[
                          styles.cell,
                          { backgroundColor: bgColor },
                          isSelected && styles.cellSelected,
                        ]}
                      />
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>
        </ScrollView>
      </View>

      {/* Selected cell tooltip */}
      {selected && (
        <View style={styles.tooltip}>
          <Text style={styles.tooltipDate}>{formatDateShort(selected.date)}</Text>
          <Text style={styles.tooltipVol}>
            {selected.volume >= 1000
              ? `${(selected.volume / 1000).toFixed(1)}k kg`
              : `${selected.volume} kg`} trained
          </Text>
        </View>
      )}
    </View>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: RADIUS.xl,
    padding: SPACE.md,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textTertiary,
    letterSpacing: 1.2,
  },
  subtitle: {
    fontFamily: FONT_FAMILY.regular,
    fontSize: FONT_SIZE.xs,
    color: 'rgba(255, 255, 255, 0.5)',
    marginTop: 2,
  },
  intensityLegend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  legendLabel: {
    fontSize: 8,
    color: 'rgba(255,255,255,0.35)',
    fontFamily: FONT_FAMILY.regular,
  },
  legendCell: {
    width: 10,
    height: 10,
    borderRadius: 2,
  },
  heatmapRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  dayLabelsCol: {
    justifyContent: 'space-between',
    height: 7 * 18, // 7 rows × 18px each (14px cell + 4px gap)
    paddingRight: 6,
    paddingVertical: 2,
  },
  dayLabelText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 9,
    color: 'rgba(255, 255, 255, 0.35)',
    lineHeight: 14,
  },
  scrollArea: {
    flexGrow: 0,
  },
  grid: {
    flexDirection: 'row',
    gap: 3,
  },
  column: {
    flexDirection: 'column',
    gap: 3,
  },
  cell: {
    width: 14,
    height: 14,
    borderRadius: 3,
  },
  cellSelected: {
    borderWidth: 1.5,
    borderColor: '#a599ff',
  },
  tooltip: {
    marginTop: 10,
    backgroundColor: 'rgba(165,153,255,0.12)',
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
  },
  tooltipDate: {
    fontSize: 11,
    fontFamily: FONT_FAMILY.bold,
    color: '#a599ff',
  },
  tooltipVol: {
    fontSize: 11,
    fontFamily: FONT_FAMILY.medium,
    color: COLORS.textPrimary,
  },
});
