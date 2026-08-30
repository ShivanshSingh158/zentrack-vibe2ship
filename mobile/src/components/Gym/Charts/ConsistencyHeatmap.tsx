import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONT_FAMILY, FONT_SIZE, RADIUS, SPACE, COLORS } from '../../../theme/tokens';
import { useTheme } from '../../../contexts/ThemeContext';
import { hapticLight } from '../../../utils/haptics';

interface ConsistencyHeatmapProps {
  data: { date: string; volume: number }[];
}

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const NUM_WEEKS = 18; // 18 weeks = 126 days (fills horizontal card width cleanly)

function getRecentWeeksDates(numWeeks: number = 18): string[] {
  const dates: string[] = [];
  const today = new Date();
  const todayDay = today.getDay(); // 0 is Sunday
  const daysFromMonday = todayDay === 0 ? 6 : todayDay - 1;

  // Find Monday of the current week
  const currentMonday = new Date(today);
  currentMonday.setDate(today.getDate() - daysFromMonday);

  // Start (numWeeks - 1) weeks before current Monday
  const startMonday = new Date(currentMonday);
  startMonday.setDate(currentMonday.getDate() - (numWeeks - 1) * 7);

  const totalDays = numWeeks * 7;
  for (let i = 0; i < totalDays; i++) {
    const d = new Date(startMonday);
    d.setDate(startMonday.getDate() + i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    dates.push(`${y}-${m}-${day}`);
  }
  return dates;
}

function formatDateShort(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${months[m - 1]} ${d}`;
}

export default function ConsistencyHeatmap({ data }: ConsistencyHeatmapProps) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  const [selected, setSelected] = useState<{ date: string; volume: number } | null>(null);

  const { grid, totalWorkouts, volumeMap } = useMemo(() => {
    const dateStrings = getRecentWeeksDates(NUM_WEEKS);
    const volumeMap = new Map<string, number>();
    let workoutCount = 0;

    data.forEach(d => {
      volumeMap.set(d.date, d.volume);
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
      volumeMap,
    };
  }, [data]);

  const volumeForDate = (dateStr: string): number => {
    return volumeMap.get(dateStr) || 0;
  };

  const todayStr = useMemo(() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  }, []);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.headerIcon}>
            <Ionicons name="calendar-outline" size={13} color="#5eda9e" />
          </View>
          <View>
            <Text style={styles.title}>CONSISTENCY GRID</Text>
            <Text style={styles.subtitle}>
              {totalWorkouts} {totalWorkouts === 1 ? 'workout' : 'workouts'} logged across {NUM_WEEKS} weeks
            </Text>
          </View>
        </View>

        {/* Active Badge */}
        <View style={styles.activeTag}>
          <View style={styles.activeDot} />
          <Text style={styles.activeTagText}>Logged</Text>
        </View>
      </View>

      {/* Day labels + Full-Width Grid */}
      <View style={styles.heatmapRow}>
        {/* Mon–Sun row labels */}
        <View style={styles.dayLabelsCol}>
          {DAY_LABELS.map((label, i) => (
            <Text key={i} style={styles.dayLabelText}>{label}</Text>
          ))}
        </View>

        {/* Full-width scrollable grid (auto-scrolled to latest) */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.grid}>
            {grid.map((col, colIndex) => (
              <View key={`col-${colIndex}`} style={styles.column}>
                {col.map((dateStr) => {
                  const vol = volumeForDate(dateStr);
                  const isLogged = vol > 0;
                  const isToday = dateStr === todayStr;
                  const isSelected = selected?.date === dateStr;

                  return (
                    <TouchableOpacity
                      key={dateStr}
                      onPress={() => {
                        hapticLight();
                        setSelected(prev => (prev?.date === dateStr ? null : { date: dateStr, volume: vol }));
                      }}
                      activeOpacity={0.75}
                      style={styles.cellWrapper}
                    >
                      <View
                        style={[
                          styles.cell,
                          isLogged ? styles.cellLogged : styles.cellEmpty,
                          isToday && !isLogged && styles.cellToday,
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
          <View style={[styles.tooltipDot, { backgroundColor: selected.volume > 0 ? '#5eda9e' : '#8e8e93' }]} />
          <Text style={styles.tooltipDate}>{formatDateShort(selected.date)}</Text>
          <Text style={styles.tooltipVol}>
            {selected.volume > 0
              ? `${selected.volume >= 1000 ? (selected.volume / 1000).toFixed(1) + 'k' : selected.volume} kg volume`
              : 'Rest day / No log'}
          </Text>
        </View>
      )}
    </View>
  );
}

const makeStyles = (colors: any, isDark: boolean = true) => StyleSheet.create({
  container: {
    backgroundColor: isDark ? '#0d0d10' : colors.surface,
    borderRadius: RADIUS.xl,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: isDark ? '#1f1f26' : colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerIcon: {
    width: 26,
    height: 26,
    borderRadius: 7,
    backgroundColor: 'rgba(94, 218, 158, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(94, 218, 158, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 11,
    color: '#ffffff',
    letterSpacing: 0.8,
  },
  subtitle: {
    fontFamily: FONT_FAMILY.regular,
    fontSize: 11,
    color: '#8e8e93',
    marginTop: 1,
  },
  activeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(94, 218, 158, 0.10)',
    borderColor: 'rgba(94, 218, 158, 0.25)',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#5eda9e',
  },
  activeTagText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 10,
    color: '#5eda9e',
  },
  heatmapRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  dayLabelsCol: {
    justifyContent: 'space-between',
    height: 7 * 19, // 7 rows × 19px each
    paddingRight: 8,
    paddingVertical: 1,
  },
  dayLabelText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 9,
    color: '#636366',
    lineHeight: 15,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingRight: 4,
  },
  grid: {
    flexDirection: 'row',
    gap: 4.5,
  },
  column: {
    flexDirection: 'column',
    gap: 4.5,
  },
  cellWrapper: {
    padding: 0,
  },
  cell: {
    width: 15.5,
    height: 15.5,
    borderRadius: 3.5,
  },
  cellEmpty: {
    backgroundColor: isDark ? '#17171c' : '#EAE9F2',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.04)',
  },
  cellLogged: {
    backgroundColor: '#5eda9e',
    borderWidth: 1,
    borderColor: '#7feebe',
    shadowColor: '#5eda9e',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.45,
    shadowRadius: 3,
    elevation: 2,
  },
  cellToday: {
    borderColor: 'rgba(94, 218, 158, 0.4)',
    borderWidth: 1,
  },
  cellSelected: {
    borderWidth: 1.8,
    borderColor: '#ffffff',
  },
  tooltip: {
    marginTop: 12,
    backgroundColor: isDark ? '#17171c' : colors.surface2,
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(94, 218, 158, 0.25)' : 'rgba(94, 218, 158, 0.3)',
  },
  tooltipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  tooltipDate: {
    fontSize: 11,
    fontFamily: FONT_FAMILY.bold,
    color: '#ffffff',
  },
  tooltipVol: {
    fontSize: 11,
    fontFamily: FONT_FAMILY.medium,
    color: '#5eda9e',
  },
});
