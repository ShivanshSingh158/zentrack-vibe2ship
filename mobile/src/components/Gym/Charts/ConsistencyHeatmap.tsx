import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { FONT_FAMILY, FONT_SIZE, RADIUS, SPACE } from '../../../theme/tokens';
import { useTheme } from '../../../contexts/ThemeContext';

interface ConsistencyHeatmapProps {
  data: { date: string; volume: number }[]; // Array of YYYY-MM-DD
}

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

export default function ConsistencyHeatmap({ data }: ConsistencyHeatmapProps) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const { grid, maxVolume, totalWorkouts } = useMemo(() => {
    const dateStrings = getLast90Days();
    
    const volumeMap = new Map<string, number>();
    let maxVol = 0;
    let workoutCount = 0;
    
    data.forEach(d => {
      volumeMap.set(d.date, d.volume);
      if (d.volume > maxVol) maxVol = d.volume;
      if (d.volume > 0) workoutCount++;
    });

    const chunks = [];
    for (let i = 0; i < dateStrings.length; i += 7) {
      chunks.push(dateStrings.slice(i, i + 7));
    }

    return { grid: chunks, maxVolume: maxVol || 1, totalWorkouts: workoutCount };
  }, [data]);

  const getCellColor = (dateStr: string) => {
    const vol = data.find(d => d.date === dateStr)?.volume || 0;
    return vol > 0 ? '#a599ff' : 'rgba(255, 255, 255, 0.04)';
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Consistency Heatmap</Text>
      <Text style={styles.subtitle}>{totalWorkouts} workouts completed in the last 90 days</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scrollArea}>
        <View style={styles.grid}>
          {grid.map((col, colIndex) => (
            <View key={`col-${colIndex}`} style={styles.column}>
              {col.map((dateStr, rowIdx) => (
                <View 
                  key={dateStr} 
                  style={[styles.cell, { backgroundColor: getCellColor(dateStr) }]} 
                />
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
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
  heatmapRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dayLabelsColumn: {
    justifyContent: 'space-between',
    height: 110,
    paddingRight: 8,
    paddingVertical: 4,
  },
  dayLabelText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.4)',
  },
  scrollArea: {
    flexGrow: 0,
  },
  grid: {
    flexDirection: 'row',
    gap: 4,
  },
  column: {
    flexDirection: 'column',
    gap: 4,
  },
  cell: {
    width: 14,
    height: 14,
    borderRadius: 3,
  },
  legendFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: SPACE.md,
    gap: 6,
  },
  legendFooterCells: {
    flexDirection: 'row',
    gap: 4,
  },
  legendFooterText: {
    fontFamily: FONT_FAMILY.regular,
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.5)',
  },
});
