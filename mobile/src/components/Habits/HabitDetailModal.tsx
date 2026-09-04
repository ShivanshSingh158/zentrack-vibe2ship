/**
 * HabitDetailModal.tsx — ZenTrack Mobile
 *
 * Deep Habit Analytics & 365-Day Annual Contribution Matrix Modal.
 * Inspired by HabitKit's signature detail view:
 * - Hero stats: Current Streak, Longest Streak, Total Check-ins, Consistency Rate
 * - Panoramic 52-Week (365-Day) horizontal scrollable GitHub-style contribution graph
 * - Month markers (Jan, Feb, Mar...) along the top
 * - Day-of-Week Consistency breakdown bars (Mon - Sun)
 * - Interactive tile tapping to backfill or inspect any date in the year
 */

import React, { useMemo, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import BottomSheet from '../ui/BottomSheet';
import { Habit, HabitLog } from '../../contexts/MobileDataContext';
import { useTheme } from '../../contexts/ThemeContext';
import { formatLocalDateStr } from '../../utils/dateUtils';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS } from '../../theme/tokens';

interface HabitDetailModalProps {
  visible: boolean;
  habit: Habit | null;
  habitLogs: HabitLog[];
  onClose: () => void;
  onToggleDate: (dateStr: string) => void;
  onArchive: (habitId: string) => void;
  onDelete: (habitId: string) => void;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function HabitDetailModal({
  visible,
  habit,
  habitLogs,
  onClose,
  onToggleDate,
  onArchive,
  onDelete,
}: HabitDetailModalProps) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  if (!habit) return null;

  const habitColor = habit.color || (isDark ? colors.accentPrimary : '#6C5CE7');
  const isNegative = habit.type === 'negative';
  const targetCount = habit.targetCount && habit.targetCount > 0 ? habit.targetCount : null;

  // Selected tile state for interactive inspecting
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Index logs by date
  const logMap = useMemo(() => {
    const map = new Map<string, HabitLog>();
    for (const l of habitLogs) {
      if (l.date) map.set(l.date.slice(0, 10), l);
    }
    return map;
  }, [habitLogs]);

  // ── 1. Calculate 52-Week (365 Days) Matrix ──────────────────────────────────
  const { annualWeeks, monthHeaders, totalCompleted, totalPossible, bestDayOfWeek } = useMemo(() => {
    const now = new Date();
    const todayStr = formatLocalDateStr(now);
    const todayDayOfWeek = now.getDay();

    // End on the coming Saturday
    const endOfWeek = new Date(now);
    endOfWeek.setDate(now.getDate() + (6 - todayDayOfWeek));

    const totalDays = 52 * 7; // 364 days
    const startMatrixDate = new Date(endOfWeek);
    startMatrixDate.setDate(endOfWeek.getDate() - totalDays + 1);

    const weeks: Array<
      Array<{
        dateStr: string;
        dayNum: number;
        dayOfWeek: number;
        monthIdx: number;
        isToday: boolean;
        isFuture: boolean;
        log?: HabitLog;
        status: 'completed' | 'missed' | 'freeze' | 'future';
        ratio: number;
        count: number;
      }>
    > = [];

    const months: Array<{ label: string; weekIdx: number }> = [];
    let lastRecordedMonth = -1;

    let completed = 0;
    let possible = 0;

    // Day of week stats: count completed vs total
    const dowCompleted = [0, 0, 0, 0, 0, 0, 0];
    const dowTotal = [0, 0, 0, 0, 0, 0, 0];

    const curr = new Date(startMatrixDate);
    for (let w = 0; w < 52; w++) {
      const currentWeek: typeof weeks[0] = [];

      for (let d = 0; d < 7; d++) {
        const dateStr = formatLocalDateStr(curr);
        const dayOfWeek = curr.getDay();
        const dayNum = curr.getDate();
        const monthIdx = curr.getMonth();
        const isToday = dateStr === todayStr;
        const isFuture = dateStr > todayStr;
        const log = logMap.get(dateStr);

        // Record month label at start of new month in week 0-51
        if (monthIdx !== lastRecordedMonth && d === 0) {
          months.push({ label: MONTH_NAMES[monthIdx], weekIdx: w });
          lastRecordedMonth = monthIdx;
        }

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
        } else {
          status = 'missed';
        }

        if (!isFuture) {
          possible++;
          dowTotal[dayOfWeek]++;
          if (status === 'completed') {
            completed++;
            dowCompleted[dayOfWeek]++;
          }
        }

        currentWeek.push({
          dateStr,
          dayNum,
          dayOfWeek,
          monthIdx,
          isToday,
          isFuture,
          log,
          status,
          ratio,
          count,
        });

        curr.setDate(curr.getDate() + 1);
      }
      weeks.push(currentWeek);
    }

    // Determine strongest day
    let bestDowIdx = 1;
    let bestDowRate = -1;
    for (let i = 0; i < 7; i++) {
      const rate = dowTotal[i] > 0 ? dowCompleted[i] / dowTotal[i] : 0;
      if (rate > bestDowRate) {
        bestDowRate = rate;
        bestDowIdx = i;
      }
    }

    return {
      annualWeeks: weeks,
      monthHeaders: months,
      totalCompleted: completed,
      totalPossible: possible,
      bestDayOfWeek: {
        name: DAY_NAMES[bestDowIdx],
        rate: Math.round(bestDowRate * 100),
      },
    };
  }, [logMap, targetCount]);

  // ── 2. Day-of-Week Breakdown Bars ──────────────────────────────────────────
  const dayOfWeekBars = useMemo(() => {
    const dowCompleted = [0, 0, 0, 0, 0, 0, 0];
    const dowTotal = [0, 0, 0, 0, 0, 0, 0];
    const now = new Date();
    const todayStr = formatLocalDateStr(now);

    for (const week of annualWeeks) {
      for (const tile of week) {
        if (!tile.isFuture && tile.dateStr <= todayStr) {
          dowTotal[tile.dayOfWeek]++;
          if (tile.status === 'completed') {
            dowCompleted[tile.dayOfWeek]++;
          }
        }
      }
    }

    return [1, 2, 3, 4, 5, 6, 0].map((dow) => {
      const total = dowTotal[dow] || 1;
      const done = dowCompleted[dow];
      const pct = Math.round((done / total) * 100);
      return {
        label: DAY_SHORT[dow],
        fullName: DAY_NAMES[dow],
        done,
        total,
        pct,
      };
    });
  }, [annualWeeks]);

  const overallConsistencyRate = totalPossible > 0 ? Math.round((totalCompleted / totalPossible) * 100) : 0;
  const currentStreak = habit.streak || 0;
  const longestStreak = Math.max(currentStreak, habit.longestStreak || 0);

  const handleTilePress = useCallback((dateStr: string, isFuture: boolean) => {
    if (isFuture) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedDate((prev) => (prev === dateStr ? null : dateStr));
  }, []);

  const handleToggleSelectedDate = useCallback(() => {
    if (!selectedDate) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onToggleDate(selectedDate);
  }, [selectedDate, onToggleDate]);

  const selectedTileLog = selectedDate ? logMap.get(selectedDate) : null;
  const isSelectedDateCompleted = selectedTileLog
    ? targetCount
      ? (selectedTileLog.count || 0) >= targetCount
      : true
    : false;

  const handleMenuPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert('Manage Habit', habit.name, [
      {
        text: habit.archived ? 'Unarchive' : 'Archive',
        onPress: () => {
          onArchive(habit.id);
          onClose();
        },
      },
      {
        text: 'Delete Habit',
        style: 'destructive',
        onPress: () => {
          Alert.alert('Delete Habit?', `Are you sure you want to delete "${habit.name}"? This cannot be undone.`, [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: () => {
                onDelete(habit.id);
                onClose();
              },
            },
          ]);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const annualScrollRef = useRef<ScrollView>(null);

  return (
    <BottomSheet visible={visible} onClose={onClose} fullHeight={true}>
      <View style={styles.sheetContainer}>
        {/* ── HEADER ──────────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <View style={[styles.avatar, { backgroundColor: `${habitColor}22`, borderColor: `${habitColor}50` }]}>
            <Text style={styles.avatarEmoji}>{habit.emoji || (isNegative ? '🚫' : '⭐')}</Text>
          </View>

          <View style={styles.headerInfo}>
            <Text style={styles.habitTitle} numberOfLines={1}>
              {habit.name}
            </Text>
            <Text style={styles.habitSubtitle}>
              {isNegative ? 'Vice · Relapse Tracker' : `${habit.frequency || 'Daily'} Routine`}
            </Text>
          </View>

          <View style={styles.headerActions}>
            <TouchableOpacity onPress={handleMenuPress} style={styles.iconBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="ellipsis-horizontal" size={18} color={colors.textPrimary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} style={styles.iconBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {/* ── 4-PILL HERO METRICS STRIP ────────────────────────────────────── */}
          <View style={styles.heroGrid}>
            <View style={styles.statPill}>
              <View style={[styles.statIconBadge, { backgroundColor: 'rgba(245, 158, 11, 0.15)' }]}>
                <Text style={{ fontSize: 13 }}>🔥</Text>
              </View>
              <Text style={styles.statVal}>{currentStreak}d</Text>
              <Text style={styles.statLabel}>Current</Text>
            </View>

            <View style={styles.statPill}>
              <View style={[styles.statIconBadge, { backgroundColor: 'rgba(165, 153, 255, 0.15)' }]}>
                <Text style={{ fontSize: 13 }}>🏆</Text>
              </View>
              <Text style={styles.statVal}>{longestStreak}d</Text>
              <Text style={styles.statLabel}>Best</Text>
            </View>

            <View style={styles.statPill}>
              <View style={[styles.statIconBadge, { backgroundColor: 'rgba(50, 215, 75, 0.15)' }]}>
                <Text style={{ fontSize: 13 }}>🎯</Text>
              </View>
              <Text style={styles.statVal}>{totalCompleted}</Text>
              <Text style={styles.statLabel}>Total</Text>
            </View>

            <View style={styles.statPill}>
              <View style={[styles.statIconBadge, { backgroundColor: `${habitColor}22` }]}>
                <Text style={{ fontSize: 13 }}>📈</Text>
              </View>
              <Text style={styles.statVal}>{overallConsistencyRate}%</Text>
              <Text style={styles.statLabel}>Rate</Text>
            </View>
          </View>

          {/* ── 365-DAY ANNUAL HEATMAP ──────────────────────────────────────── */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>365-Day Contribution Matrix</Text>
              <Text style={[styles.sectionBadge, { color: habitColor }]}>{totalCompleted} / {totalPossible} days</Text>
            </View>

            {/* Selected Tile Inspector Bar */}
            {selectedDate && (
              <View style={[styles.inspectorBar, { borderColor: habitColor }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inspectorDate}>{selectedDate}</Text>
                  <Text style={[styles.inspectorStatus, { color: isSelectedDateCompleted ? colors.accentGreen : colors.textTertiary }]}>
                    {isSelectedDateCompleted ? '✓ Completed' : '○ Missed'}
                  </Text>
                </View>

                <TouchableOpacity onPress={handleToggleSelectedDate} style={[styles.inspectorBtn, { backgroundColor: isSelectedDateCompleted ? 'rgba(239,68,68,0.2)' : habitColor }]}>
                  <Text style={[styles.inspectorBtnText, { color: isSelectedDateCompleted ? '#EF4444' : (isDark ? '#000000' : '#FFFFFF') }]}>
                    {isSelectedDateCompleted ? 'Undo' : 'Mark Done'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Scrollable Panoramic 52-Week Grid */}
            <ScrollView
              ref={annualScrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.matrixScrollContainer}
              onContentSizeChange={() => {
                annualScrollRef.current?.scrollToEnd({ animated: false });
              }}
            >
              <View style={styles.matrixWrapper}>
                {/* 52 Columns of Weeks */}
                <View style={styles.annualColumns}>
                  {annualWeeks.map((week, wIdx) => (
                    <View key={wIdx} style={styles.annualWeekColumn}>
                      {week.map((tile) => {
                        const isSelected = selectedDate === tile.dateStr;
                        const isFuture = tile.isFuture;
                        const isDone = tile.status === 'completed';
                        const isFreeze = tile.status === 'freeze';

                        let bg = isDark ? 'rgba(255,255,255,0.06)' : '#ECEBF2';
                        let border = isDark ? 'rgba(255,255,255,0.03)' : 'transparent';

                        if (isFuture) {
                          bg = 'transparent';
                          border = isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)';
                        } else if (isFreeze) {
                          bg = '#06B6D4';
                          border = '#06B6D4';
                        } else if (isDone) {
                          bg = habitColor;
                          border = habitColor;
                        } else if (tile.isToday) {
                          bg = isDark ? 'rgba(255,255,255,0.04)' : '#F0EFF7';
                          border = habitColor;
                        }

                        return (
                          <TouchableOpacity
                            key={tile.dateStr}
                            activeOpacity={isFuture ? 1 : 0.7}
                            onPress={() => handleTilePress(tile.dateStr, isFuture)}
                            style={[
                              styles.annualTile,
                              { backgroundColor: bg, borderColor: isSelected ? '#FFFFFF' : border, borderWidth: isSelected ? 2 : 1 },
                            ]}
                          />
                        );
                      })}
                    </View>
                  ))}
                </View>
              </View>
            </ScrollView>

            <Text style={styles.scrollHint}>← Scroll horizontally to explore past 12 months</Text>
          </View>

          {/* ── DAY-OF-WEEK BREAKDOWN BARS ───────────────────────────────────── */}
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Day of Week Consistency</Text>
              <Text style={[styles.sectionBadge, { color: colors.accentGreen }]}>Best: {bestDayOfWeek.name} ({bestDayOfWeek.rate}%)</Text>
            </View>

            <View style={styles.dowList}>
              {dayOfWeekBars.map((dow) => (
                <View key={dow.label} style={styles.dowRow}>
                  <Text style={styles.dowLabel}>{dow.label}</Text>
                  <View style={styles.dowBarTrack}>
                    <View style={[styles.dowBarFill, { width: `${dow.pct}%`, backgroundColor: habitColor }]} />
                  </View>
                  <Text style={styles.dowPct}>{dow.pct}%</Text>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      </View>
    </BottomSheet>
  );
}

const makeStyles = (colors: any, isDark: boolean = true) =>
  StyleSheet.create({
    sheetContainer: {
      flex: 1,
      maxHeight: Dimensions.get('window').height * 0.88,
      backgroundColor: isDark ? '#0D0D12' : colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
    },
    avatar: {
      width: 44,
      height: 44,
      borderRadius: 14,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarEmoji: { fontSize: 22 },
    headerInfo: { flex: 1, marginLeft: 12, marginRight: 8 },
    habitTitle: {
      fontSize: 18,
      fontFamily: FONT_FAMILY.bold,
      color: colors.textPrimary,
      letterSpacing: -0.2,
    },
    habitSubtitle: {
      fontSize: 11,
      fontFamily: FONT_FAMILY.medium,
      color: colors.textSecondary,
      marginTop: 2,
    },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    iconBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    scrollContent: {
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 40,
    },
    heroGrid: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      marginBottom: 16,
    },
    statPill: {
      flex: 1,
      backgroundColor: isDark ? colors.surface : '#FFFFFF',
      borderRadius: 16,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
      paddingVertical: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    statIconBadge: {
      width: 26,
      height: 26,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 4,
    },
    statVal: {
      fontSize: 15,
      fontFamily: FONT_FAMILY.bold,
      color: colors.textPrimary,
    },
    statLabel: {
      fontSize: 10,
      fontFamily: FONT_FAMILY.medium,
      color: colors.textTertiary,
      marginTop: 2,
      textTransform: 'uppercase',
    },
    sectionCard: {
      backgroundColor: isDark ? colors.surface : '#FFFFFF',
      borderRadius: 20,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
      padding: 16,
      marginBottom: 16,
    },
    sectionHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    sectionTitle: {
      fontSize: 13,
      fontFamily: FONT_FAMILY.bold,
      color: colors.textPrimary,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    sectionBadge: {
      fontSize: 11,
      fontFamily: FONT_FAMILY.bold,
    },
    inspectorBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F5F4FA',
      borderRadius: 12,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 8,
      marginBottom: 12,
    },
    inspectorDate: {
      fontSize: 12,
      fontFamily: FONT_FAMILY.bold,
      color: colors.textPrimary,
    },
    inspectorStatus: {
      fontSize: 10,
      fontFamily: FONT_FAMILY.medium,
      marginTop: 2,
    },
    inspectorBtn: {
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    inspectorBtnText: {
      fontSize: 11,
      fontFamily: FONT_FAMILY.bold,
    },
    matrixScrollContainer: {
      paddingVertical: 4,
    },
    matrixWrapper: {
      flexDirection: 'column',
    },
    annualColumns: {
      flexDirection: 'row',
      gap: 3,
    },
    annualWeekColumn: {
      flexDirection: 'column',
      gap: 3,
    },
    annualTile: {
      width: 10,
      height: 10,
      borderRadius: 2.5,
    },
    scrollHint: {
      fontSize: 9,
      fontFamily: FONT_FAMILY.medium,
      color: colors.textTertiary,
      textAlign: 'center',
      marginTop: 10,
    },
    dowList: {
      flexDirection: 'column',
      gap: 8,
    },
    dowRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    dowLabel: {
      width: 30,
      fontSize: 11,
      fontFamily: FONT_FAMILY.bold,
      color: colors.textSecondary,
    },
    dowBarTrack: {
      flex: 1,
      height: 7,
      borderRadius: 3.5,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#ECEBF2',
      overflow: 'hidden',
    },
    dowBarFill: {
      height: '100%',
      borderRadius: 3.5,
    },
    dowPct: {
      width: 36,
      textAlign: 'right',
      fontSize: 11,
      fontFamily: FONT_FAMILY.bold,
      color: colors.textPrimary,
    },
  });

export default HabitDetailModal;
