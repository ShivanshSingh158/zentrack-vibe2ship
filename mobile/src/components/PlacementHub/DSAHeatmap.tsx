/**
 * DSAHeatmap.tsx — GitHub-style 12-week DSA problem heatmap
 *
 * Renders a 12-column × 7-row grid. Each cell = 1 day.
 * Color intensity based on number of problems solved.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { FONT_FAMILY, FONT_SIZE, RADIUS, SPACE } from '../../theme/tokens';
import { DSALog } from '../../hooks/usePlacementData';

interface DSAHeatmapProps {
  logs: DSALog[];
}

const CELL_SIZE = 14;
const CELL_GAP = 3;
const WEEKS = 12;
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function getIntensityColor(count: number, baseColor: string): string {
  if (count === 0) return 'rgba(255,255,255,0.04)';
  if (count === 1) return `${baseColor}40`;
  if (count === 2) return `${baseColor}70`;
  if (count <= 4) return `${baseColor}aa`;
  return baseColor;
}

function formatDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default function DSAHeatmap({ logs }: DSAHeatmapProps) {
  const { colors } = useTheme();
  const accentColor = colors.accentPrimary ?? '#a599ff';

  // Build a map of date → problem count for the last 84 days
  const heatData = useMemo(() => {
    const map: Record<string, number> = {};
    const now = new Date();
    for (let i = 0; i < WEEKS * 7; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      map[formatDateKey(d)] = 0;
    }
    logs.forEach(l => {
      const key = formatDateKey(l.solvedAt);
      if (key in map) map[key] = (map[key] || 0) + 1;
    });
    return map;
  }, [logs]);

  // Build 12 columns (weeks), each column = 7 days (Mon–Sun)
  const grid = useMemo(() => {
    const today = new Date();
    const todayDow = today.getDay(); // 0=Sun, 1=Mon…
    const daysSinceMonday = (todayDow + 6) % 7; // Mon=0
    const mondayThisWeek = new Date(today);
    mondayThisWeek.setDate(today.getDate() - daysSinceMonday);

    const columns: { dateKey: string; count: number }[][] = [];
    for (let w = WEEKS - 1; w >= 0; w--) {
      const col: { dateKey: string; count: number }[] = [];
      for (let d = 0; d < 7; d++) {
        const date = new Date(mondayThisWeek);
        date.setDate(mondayThisWeek.getDate() - w * 7 + d);
        const key = formatDateKey(date);
        col.push({ dateKey: key, count: heatData[key] ?? 0 });
      }
      columns.push(col);
    }
    return columns;
  }, [heatData]);

  const totalProblems = logs.length;

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Activity</Text>
        <Text style={[styles.total, { color: colors.textMuted }]}>
          {totalProblems} problems total
        </Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.gridWrapper}>
          {/* Day labels */}
          <View style={styles.dayLabels}>
            {DAY_LABELS.map(day => (
              <Text key={day} style={[styles.dayLabel, { color: colors.textMuted }]}>{day[0]}</Text>
            ))}
          </View>

          {/* Grid */}
          <View style={styles.grid}>
            {grid.map((col, colIdx) => (
              <View key={colIdx} style={styles.column}>
                {col.map((cell, rowIdx) => {
                  const isToday = cell.dateKey === formatDateKey(new Date());
                  return (
                    <View
                      key={rowIdx}
                      style={[
                        styles.cell,
                        {
                          backgroundColor: getIntensityColor(cell.count, accentColor),
                          borderColor: isToday ? accentColor : 'transparent',
                          borderWidth: isToday ? 1 : 0,
                        },
                      ]}
                    />
                  );
                })}
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      {/* Legend */}
      <View style={styles.legend}>
        <Text style={[styles.legendLabel, { color: colors.textMuted }]}>Less</Text>
        {[0, 1, 2, 3, 4].map(n => (
          <View
            key={n}
            style={[styles.legendCell, { backgroundColor: getIntensityColor(n, accentColor) }]}
          />
        ))}
        <Text style={[styles.legendLabel, { color: colors.textMuted }]}>More</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { marginBottom: SPACE.lg },
  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: SPACE.sm,
  },
  title: { fontFamily: FONT_FAMILY.medium, fontSize: FONT_SIZE.md },
  total: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs },
  gridWrapper: { flexDirection: 'row' },
  dayLabels: {
    flexDirection: 'column', justifyContent: 'space-between',
    paddingTop: 2, marginRight: CELL_GAP + 2,
    height: (CELL_SIZE + CELL_GAP) * 7 - CELL_GAP,
  },
  dayLabel: { fontFamily: FONT_FAMILY.body, fontSize: 9, width: 12, textAlign: 'center' },
  grid: { flexDirection: 'row', gap: CELL_GAP },
  column: { flexDirection: 'column', gap: CELL_GAP },
  cell: {
    width: CELL_SIZE, height: CELL_SIZE,
    borderRadius: RADIUS.sm ?? 3,
  },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: SPACE.sm },
  legendLabel: { fontFamily: FONT_FAMILY.body, fontSize: 9 },
  legendCell: { width: 10, height: 10, borderRadius: 2 },
});

