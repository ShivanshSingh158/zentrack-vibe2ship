/**
 * HabitHeatmapGrid.tsx — ZenTrack Mobile
 *
 * GitHub-Style Contribution Heatmap Matrix for Habits.
 * Inspired by HabitKit: renders a clean, dense 2D grid of squircle tiles
 * organized in columns of weeks (7 days per column).
 *
 * Features:
 * - 35-day (5 weeks) or 56-day (8 weeks) rolling window
 * - 4-tier graduated luminance for quantitative habits (e.g. 8 glasses of water)
 * - Saturated cosmic glow for completed days
 * - Frost-cyan indicator for streak freeze days
 * - Subtle border ring highlighting TODAY
 * - Interactive tile tapping with coordinate capture for HUD tooltips
 */

import React, { useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Habit, HabitLog } from '../../contexts/MobileDataContext';
import { useTheme } from '../../contexts/ThemeContext';
import { formatLocalDateStr } from '../../utils/dateUtils';
import { FONT_FAMILY } from '../../theme/tokens';

export interface TilePressEvent {
  dateStr: string;
  dayLabel: string;
  isToday: boolean;
  isFuture: boolean;
  status: 'completed' | 'missed' | 'freeze' | 'future';
  count: number;
  targetCount?: number | null;
  log?: HabitLog;
  layout?: { x: number; y: number; pageX: number; pageY: number };
}

interface HabitHeatmapGridProps {
  habit: Habit;
  habitLogs: HabitLog[];
  weeksCount?: number; // default: 5 (35 days)
  onTilePress?: (event: TilePressEvent) => void;
  compact?: boolean;
  showWeekLabels?: boolean;
}

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export const HabitHeatmapGrid = React.memo(function HabitHeatmapGrid({
  habit,
  habitLogs,
  weeksCount = 5,
  onTilePress,
  compact = false,
  showWeekLabels = true,
}: HabitHeatmapGridProps) {
  const { colors, isDark } = useTheme();
  const habitColor = habit.color || (isDark ? colors.accentPrimary : '#6C5CE7');
  const targetCount = habit.targetCount && habit.targetCount > 0 ? habit.targetCount : null;
  const isNegative = habit.type === 'negative';

  // O(N) pre-indexed log map for O(1) tile lookup
  const logMap = useMemo(() => {
    const map = new Map<string, HabitLog>();
    for (const l of habitLogs) {
      if (l.date) {
        map.set(l.date.slice(0, 10), l);
      }
    }
    return map;
  }, [habitLogs]);

  // Generate 2D Matrix of Weeks: columns = weeks, rows = days of week (0 to 6)
  const { weeks, completedDaysCount, totalPastDaysCount } = useMemo(() => {
    const now = new Date();
    const todayStr = formatLocalDateStr(now);
    const todayDayOfWeek = now.getDay(); // 0 = Sunday, 6 = Saturday

    // End of the current week (Saturday)
    const endOfWeek = new Date(now);
    endOfWeek.setDate(now.getDate() + (6 - todayDayOfWeek));

    const totalDays = weeksCount * 7;
    const startMatrixDate = new Date(endOfWeek);
    startMatrixDate.setDate(endOfWeek.getDate() - totalDays + 1);

    const generatedWeeks: Array<
      Array<{
        dateStr: string;
        dayNum: number;
        dayOfWeek: number;
        isToday: boolean;
        isFuture: boolean;
        isBeforeStart: boolean;
        log?: HabitLog;
        status: 'completed' | 'missed' | 'freeze' | 'future';
        ratio: number;
        count: number;
      }>
    > = [];

    let completedCount = 0;
    let pastCount = 0;

    const curr = new Date(startMatrixDate);
    for (let w = 0; w < weeksCount; w++) {
      const currentWeek: typeof generatedWeeks[0] = [];
      for (let d = 0; d < 7; d++) {
        const dateStr = formatLocalDateStr(curr);
        const dayOfWeek = curr.getDay();
        const dayNum = curr.getDate();
        const isToday = dateStr === todayStr;
        const isFuture = dateStr > todayStr;
        const isBeforeStart = !!(habit.startDate && dateStr < habit.startDate);
        const log = logMap.get(dateStr);

        let status: 'completed' | 'missed' | 'freeze' | 'future' = 'missed';
        let ratio = 0;
        let count = log?.count || (log ? 1 : 0);

        if (isFuture) {
          status = 'future';
        } else if (log) {
          if (log.isFreeze) {
            status = 'freeze';
          } else if (targetCount) {
            ratio = Math.min(1, count / targetCount);
            status = count >= targetCount ? 'completed' : 'missed';
          } else {
            ratio = 1;
            status = 'completed';
          }
        } else if (isBeforeStart) {
          status = 'future';
        } else {
          status = 'missed';
        }

        if (!isFuture && !isBeforeStart) {
          pastCount++;
          if (status === 'completed') completedCount++;
        }

        currentWeek.push({
          dateStr,
          dayNum,
          dayOfWeek,
          isToday,
          isFuture,
          isBeforeStart,
          log,
          status,
          ratio,
          count,
        });

        // Next day
        curr.setDate(curr.getDate() + 1);
      }
      generatedWeeks.push(currentWeek);
    }

    return {
      weeks: generatedWeeks,
      completedDaysCount: completedCount,
      totalPastDaysCount: pastCount,
    };
  }, [weeksCount, habit.startDate, logMap, targetCount]);

  const tileSize = compact ? 13 : 16;
  const tileRadius = habit.tileShape === 'circle' ? tileSize / 2 : habit.tileShape === 'square' ? 2 : 4;
  const tileGap = compact ? 3 : 4;

  const handleTilePress = useCallback(
    (tile: typeof weeks[0][0], e: any) => {
      if (tile.isFuture) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (!onTilePress) return;

      const pageX = e.nativeEvent?.pageX || 0;
      const pageY = e.nativeEvent?.pageY || 0;
      const x = e.nativeEvent?.locationX || 0;
      const y = e.nativeEvent?.locationY || 0;

      onTilePress({
        dateStr: tile.dateStr,
        dayLabel: DAY_LABELS[tile.dayOfWeek],
        isToday: tile.isToday,
        isFuture: tile.isFuture,
        status: tile.status,
        count: tile.count,
        targetCount,
        log: tile.log,
        layout: { x, y, pageX, pageY },
      });
    },
    [onTilePress, targetCount]
  );

  const getTileStyle = useCallback(
    (tile: typeof weeks[0][0]) => {
      if (tile.isFuture) {
        return {
          backgroundColor: 'transparent',
          borderWidth: 1,
          borderColor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.03)',
        };
      }

      if (tile.status === 'freeze') {
        return {
          backgroundColor: '#06B6D4',
          borderColor: '#06B6D4',
          borderWidth: 1,
        };
      }

      if (tile.status === 'completed') {
        if (isNegative) {
          // Negative habit completed = relapsed on this day
          return {
            backgroundColor: '#EF4444',
            borderColor: '#EF4444',
            borderWidth: 1,
          };
        }

        // Quantitative graduated opacity
        if (targetCount && tile.ratio < 1) {
          const opacity = Math.max(0.25, tile.ratio);
          return {
            backgroundColor: habitColor,
            opacity,
            borderWidth: 1,
            borderColor: habitColor,
          };
        }

        // 100% Completed
        return {
          backgroundColor: habitColor,
          borderWidth: 1,
          borderColor: habitColor,
        };
      }

      // Missed / pending day
      if (tile.isToday) {
        return {
          backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : '#F0EFF7',
          borderWidth: 1.5,
          borderColor: isNegative ? '#EF4444' : habitColor,
        };
      }

      return {
        backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : '#ECEBF2',
        borderWidth: 1,
        borderColor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
      };
    },
    [isDark, isNegative, targetCount, habitColor]
  );

  const completionRate = totalPastDaysCount > 0 ? Math.round((completedDaysCount / totalPastDaysCount) * 100) : 0;

  return (
    <View style={styles.container}>
      <View style={styles.matrixRow}>
        {/* Day-of-week Row Guides (M, W, F) */}
        {showWeekLabels && (
          <View style={[styles.dayLabelsColumn, { gap: tileGap, marginRight: 6 }]}>
            {DAY_LABELS.map((label, idx) => (
              <View key={idx} style={{ height: tileSize, justifyContent: 'center' }}>
                <Text
                  style={[
                    styles.dayLabelText,
                    {
                      color: idx === 1 || idx === 3 || idx === 5 ? colors.textTertiary : 'transparent',
                      fontSize: compact ? 8 : 9,
                    },
                  ]}
                >
                  {label}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* 2D Week Columns */}
        <View style={[styles.weeksContainer, { gap: tileGap }]}>
          {weeks.map((week, weekIdx) => (
            <View key={weekIdx} style={[styles.weekColumn, { gap: tileGap }]}>
              {week.map((tile) => {
                const tileStyle = getTileStyle(tile);

                return (
                  <TouchableOpacity
                    key={tile.dateStr}
                    activeOpacity={tile.isFuture ? 1 : 0.7}
                    onPress={(e) => handleTilePress(tile, e)}
                    style={[
                      styles.tile,
                      {
                        width: tileSize,
                        height: tileSize,
                        borderRadius: tileRadius,
                      },
                      tileStyle,
                    ]}
                  >
                    {tile.status === 'freeze' && (
                      <Ionicons name="snow" size={compact ? 7 : 8} color="#FFFFFF" />
                    )}
                    {tile.status === 'completed' && !isNegative && (
                      <Ionicons
                        name="checkmark"
                        size={compact ? 8 : 9}
                        color={isDark ? '#000000' : '#FFFFFF'}
                      />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>
      </View>

      {/* Grid Footer: Summary Stat & Density Indicator */}
      <View style={styles.footerRow}>
        <Text style={[styles.footerText, { color: colors.textTertiary }]}>
          {isNegative
            ? `${totalPastDaysCount - completedDaysCount} days clean`
            : `${completionRate}% consistency (${completedDaysCount}/${totalPastDaysCount}d)`}
        </Text>

        {targetCount ? (
          <View style={styles.legendRow}>
            <Text style={[styles.legendLabel, { color: colors.textTertiary }]}>Less</Text>
            <View style={[styles.legendTile, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#ECEBF2' }]} />
            <View style={[styles.legendTile, { backgroundColor: habitColor, opacity: 0.35 }]} />
            <View style={[styles.legendTile, { backgroundColor: habitColor, opacity: 0.65 }]} />
            <View style={[styles.legendTile, { backgroundColor: habitColor, opacity: 1 }]} />
            <Text style={[styles.legendLabel, { color: colors.textTertiary }]}>More</Text>
          </View>
        ) : (
          <View style={styles.legendRow}>
            <View style={[styles.legendDot, { backgroundColor: habitColor }]} />
            <Text style={[styles.legendLabel, { color: colors.textTertiary }]}>Past {weeksCount * 7}d</Text>
          </View>
        )}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'column',
    width: '100%',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.05)',
  },
  matrixRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  dayLabelsColumn: {
    flexDirection: 'column',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dayLabelText: {
    fontFamily: FONT_FAMILY.bold,
    textAlign: 'center',
    lineHeight: 12,
  },
  weeksContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    justifyContent: 'space-between',
  },
  weekColumn: {
    flexDirection: 'column',
  },
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingHorizontal: 2,
  },
  footerText: {
    fontSize: 10,
    fontFamily: FONT_FAMILY.medium,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  legendLabel: {
    fontSize: 8,
    fontFamily: FONT_FAMILY.bold,
    textTransform: 'uppercase',
  },
  legendTile: {
    width: 7,
    height: 7,
    borderRadius: 1.5,
  },
  legendDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
