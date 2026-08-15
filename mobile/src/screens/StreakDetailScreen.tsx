import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Calendar } from 'react-native-calendars';

import { useMobileData } from '../contexts/MobileDataContext';
import { useTheme } from '../contexts/ThemeContext';
import { FONT_FAMILY, SPACE } from '../theme/tokens';
import AnimatedPressable from '../components/AnimatedPressable';
import {
  calculateAppStreak,
  calculateLongestAppStreak,
  calculateTotalActiveDays,
  calculateConsistencyRate,
  getNextMilestone,
  STREAK_MILESTONES,
} from '../utils/streakUtils';

const getLocalDateString = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const formatDisplayDate = (dateStr: string): string => {
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function StreakDetailScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { colors } = useTheme();
  const s = makeStyles(colors);

  const { habitId } = route.params || {};
  const { allHabits, habitLogs, tasks, gymLogs, attendanceLogs } = useMobileData();

  const habit = useMemo(() => allHabits?.find((h) => h.id === habitId), [allHabits, habitId]);
  const isAppStreak = !habitId;
  const activeColor = habit ? (habit.color || colors.accentPrimary) : '#ff9f4d';

  const todayStr = useMemo(() => getLocalDateString(new Date()), []);
  const [inspectedDate, setInspectedDate] = useState<string>(todayStr);

  // ── Stats Calculations ────────────────────────────────────────────────────────
  const currentStreak = useMemo(() => {
    if (isAppStreak) return calculateAppStreak(tasks, gymLogs, habitLogs);
    return habit?.streak || 0;
  }, [isAppStreak, tasks, gymLogs, habitLogs, habit]);

  const longestStreak = useMemo(() => {
    if (isAppStreak) return calculateLongestAppStreak(tasks, gymLogs, habitLogs);
    return habit?.longestStreak || currentStreak;
  }, [isAppStreak, tasks, gymLogs, habitLogs, habit, currentStreak]);

  const totalActiveDays = useMemo(() => {
    if (isAppStreak) return calculateTotalActiveDays(tasks, gymLogs, habitLogs);
    return habitLogs?.filter(l => l.habitId === habitId).length || 0;
  }, [isAppStreak, tasks, gymLogs, habitLogs, habitId]);

  const consistencyRate = useMemo(() => {
    if (isAppStreak) return calculateConsistencyRate(tasks, gymLogs, habitLogs, 30);
    const past30HabitLogs = (habitLogs || []).filter(l => {
      if (l.habitId !== habitId) return false;
      const d = new Date(l.date + 'T00:00:00');
      const diff = (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24);
      return diff <= 30;
    });
    return Math.round((past30HabitLogs.length / 30) * 100);
  }, [isAppStreak, tasks, gymLogs, habitLogs, habitId]);

  const milestoneInfo = useMemo(() => getNextMilestone(currentStreak), [currentStreak]);

  // ── Pillar Counts ─────────────────────────────────────────────────────────────
  const gymSessionsCount = useMemo(() => (gymLogs || []).length, [gymLogs]);
  const tasksCompletedCount = useMemo(() => (tasks || []).filter(t => t.status === 'completed').length, [tasks]);
  const habitCompletionsCount = useMemo(() => (habitLogs || []).length, [habitLogs]);
  const classesAttendedCount = useMemo(() => {
    return (attendanceLogs || []).filter(l => l.action === 'attended').length;
  }, [attendanceLogs]);

  // ── Day Inspector Data ────────────────────────────────────────────────────────
  const inspectedData = useMemo(() => {
    const dayTasks = (tasks || []).filter(t => t.date === inspectedDate);
    const dayTasksDone = dayTasks.filter(t => t.status === 'completed');
    const dayGym = (gymLogs || []).find(g => g.date === inspectedDate);
    const dayHabits = (habitLogs || []).filter(l => l.date === inspectedDate);
    const dayAttendance = (attendanceLogs || []).filter(l => l.date === inspectedDate && l.action === 'attended');

    const hasAny = dayTasksDone.length > 0 || !!dayGym || dayHabits.length > 0 || dayAttendance.length > 0;

    return {
      date: inspectedDate,
      hasActivity: hasAny,
      tasksDone: dayTasksDone,
      tasksTotal: dayTasks.length,
      gym: dayGym,
      habits: dayHabits,
      classesAttended: dayAttendance.length,
    };
  }, [inspectedDate, tasks, gymLogs, habitLogs, attendanceLogs]);

  // ── Marked Dates for Calendar ─────────────────────────────────────────────────
  const markedDates = useMemo(() => {
    const marks: any = {};
    const successStyle = {
      container: { backgroundColor: activeColor, borderRadius: 8 },
      text: { color: '#000000', fontFamily: FONT_FAMILY.bold, fontWeight: '700' as const },
    };

    if (habitId) {
      habitLogs?.forEach(log => {
        if (log.habitId === habitId) {
          marks[log.date] = { customStyles: successStyle };
        }
      });
    } else {
      tasks?.forEach(t => {
        if (t.status === 'completed' && t.date) marks[t.date] = { customStyles: successStyle };
      });
      gymLogs?.forEach(g => {
        if (g.date) marks[g.date] = { customStyles: successStyle };
      });
      habitLogs?.forEach(l => {
        if (l.date) marks[l.date] = { customStyles: successStyle };
      });
    }

    if (inspectedDate) {
      const existing = marks[inspectedDate];
      if (existing) {
        marks[inspectedDate] = {
          customStyles: {
            container: {
              ...existing.customStyles.container,
              borderWidth: 2,
              borderColor: '#ffffff',
            },
            text: existing.customStyles.text,
          },
        };
      } else {
        marks[inspectedDate] = {
          customStyles: {
            container: {
              borderWidth: 1.5,
              borderColor: colors.accentPrimary,
              borderRadius: 8,
            },
            text: { color: colors.accentPrimary, fontFamily: FONT_FAMILY.bold },
          },
        };
      }
    }

    return marks;
  }, [habitId, habitLogs, tasks, gymLogs, activeColor, inspectedDate, colors.accentPrimary]);

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      {/* ── iOS Minimal Top Navigation Bar ── */}
      <View style={s.navBar}>
        <AnimatedPressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            navigation.goBack();
          }}
          style={s.backBtn}
        >
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
          <Text style={s.backText}>Back</Text>
        </AnimatedPressable>

        <View style={s.liveStatusPill}>
          <View style={[s.liveDot, { backgroundColor: currentStreak > 0 ? '#ff9f4d' : '#8e8e93' }]} />
          <Text style={s.liveStatusText}>
            {currentStreak > 0 ? 'Active Streak' : 'Resting'}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* ── Apple Fitness Style Hero Section ── */}
        <View style={s.heroSection}>
          <View style={s.flameOrb}>
            <LinearGradient
              colors={['rgba(255,159,77,0.25)', 'rgba(255,159,77,0.05)']}
              style={s.flameOrbGlow}
            />
            <Ionicons name="flame" size={36} color="#ff9f4d" />
          </View>

          <View style={s.streakCountRow}>
            <Text style={s.streakLargeNumber}>{currentStreak}</Text>
            <Text style={s.streakUnitLabel}>DAYS</Text>
          </View>

          <Text style={s.heroTierTitle}>
            {milestoneInfo.current.badge} {milestoneInfo.current.label}
          </Text>

          {/* Minimalist Progress Track */}
          <View style={s.heroProgressWrapper}>
            <View style={s.heroProgressBarTrack}>
              <LinearGradient
                colors={['#ff9f4d', '#a599ff']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[s.heroProgressBarFill, { width: `${Math.min(100, Math.max(6, milestoneInfo.progress * 100))}%` }]}
              />
            </View>
            <Text style={s.heroProgressSubtext}>
              {milestoneInfo.remaining > 0
                ? `${milestoneInfo.remaining} day${milestoneInfo.remaining > 1 ? 's' : ''} to ${milestoneInfo.next.label}`
                : 'Highest milestone unlocked!'}
            </Text>
          </View>
        </View>

        {/* ── Section: Overview Matrix (Apple Inset Card) ── */}
        <Text style={s.sectionHeader}>Overview</Text>
        <View style={s.insetCard}>
          <View style={s.matrixRow}>
            <View style={s.matrixCell}>
              <Text style={s.matrixLabel}>CURRENT STREAK</Text>
              <Text style={s.matrixNumber}>{currentStreak} <Text style={s.matrixUnit}>days</Text></Text>
            </View>
            <View style={s.matrixDividerV} />
            <View style={s.matrixCell}>
              <Text style={s.matrixLabel}>ALL-TIME BEST</Text>
              <Text style={s.matrixNumber}>{longestStreak} <Text style={s.matrixUnit}>days</Text></Text>
            </View>
          </View>

          <View style={s.matrixDividerH} />

          <View style={s.matrixRow}>
            <View style={s.matrixCell}>
              <Text style={s.matrixLabel}>TOTAL ACTIVE</Text>
              <Text style={s.matrixNumber}>{totalActiveDays} <Text style={s.matrixUnit}>days</Text></Text>
            </View>
            <View style={s.matrixDividerV} />
            <View style={s.matrixCell}>
              <Text style={s.matrixLabel}>30-DAY RATE</Text>
              <Text style={s.matrixNumber}>{consistencyRate}%</Text>
            </View>
          </View>
        </View>

        {/* ── Section: Achievement Awards (Apple Watch Style) ── */}
        <Text style={s.sectionHeader}>Milestone Awards</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.awardsRow}
        >
          {STREAK_MILESTONES.map((m) => {
            const isUnlocked = currentStreak >= m.days;
            return (
              <View key={m.days} style={s.awardItem}>
                <View style={[s.awardRing, isUnlocked ? s.awardRingUnlocked : s.awardRingLocked]}>
                  <Text style={[s.awardEmoji, !isUnlocked && { opacity: 0.3 }]}>{m.badge}</Text>
                </View>
                <Text style={[s.awardDays, isUnlocked && { color: m.color }]}>{m.days}d</Text>
                <Text style={s.awardLabel} numberOfLines={1}>{m.label}</Text>
              </View>
            );
          })}
        </ScrollView>

        {/* ── Section: Activity Breakdown (iOS Inset Grouped Table) ── */}
        {isAppStreak && (
          <>
            <Text style={s.sectionHeader}>Activity Breakdown</Text>
            <View style={s.insetCard}>
              <View style={s.tableRow}>
                <View style={[s.tableIconSquircle, { backgroundColor: 'rgba(255,159,77,0.15)' }]}>
                  <Ionicons name="barbell" size={16} color="#ff9f4d" />
                </View>
                <Text style={s.tableTitle}>Fitness & Gym</Text>
                <Text style={s.tableValue}>{gymSessionsCount} <Text style={s.tableValueUnit}>sessions</Text></Text>
              </View>

              <View style={s.tableDivider} />

              <View style={s.tableRow}>
                <View style={[s.tableIconSquircle, { backgroundColor: 'rgba(56,189,248,0.15)' }]}>
                  <Ionicons name="school" size={16} color="#38bdf8" />
                </View>
                <Text style={s.tableTitle}>Academic Attendance</Text>
                <Text style={s.tableValue}>{classesAttendedCount} <Text style={s.tableValueUnit}>classes</Text></Text>
              </View>

              <View style={s.tableDivider} />

              <View style={s.tableRow}>
                <View style={[s.tableIconSquircle, { backgroundColor: 'rgba(94,218,158,0.15)' }]}>
                  <Ionicons name="leaf" size={16} color="#5eda9e" />
                </View>
                <Text style={s.tableTitle}>Daily Habits</Text>
                <Text style={s.tableValue}>{habitCompletionsCount} <Text style={s.tableValueUnit}>checked</Text></Text>
              </View>

              <View style={s.tableDivider} />

              <View style={s.tableRow}>
                <View style={[s.tableIconSquircle, { backgroundColor: 'rgba(165,153,255,0.15)' }]}>
                  <Ionicons name="checkmark-circle" size={16} color="#a599ff" />
                </View>
                <Text style={s.tableTitle}>Tasks Completed</Text>
                <Text style={s.tableValue}>{tasksCompletedCount} <Text style={s.tableValueUnit}>finished</Text></Text>
              </View>
            </View>
          </>
        )}

        {/* ── Section: Activity History (Apple Health Minimal Calendar) ── */}
        <Text style={s.sectionHeader}>Activity History</Text>
        <View style={s.insetCard}>
          <Calendar
            markingType={'custom'}
            markedDates={markedDates}
            onDayPress={(day: any) => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setInspectedDate(day.dateString);
            }}
            theme={{
              backgroundColor: 'transparent',
              calendarBackground: 'transparent',
              textSectionTitleColor: '#8e8e93',
              selectedDayBackgroundColor: activeColor,
              selectedDayTextColor: '#000000',
              todayTextColor: activeColor,
              dayTextColor: '#ffffff',
              textDisabledColor: 'rgba(255,255,255,0.12)',
              monthTextColor: '#ffffff',
              arrowColor: '#ffffff',
              textDayFontFamily: FONT_FAMILY.medium,
              textMonthFontFamily: FONT_FAMILY.bold,
              textDayHeaderFontFamily: FONT_FAMILY.mono,
            }}
          />

          <View style={s.tableDivider} />

          {/* Inline Day Inspection Row */}
          <View style={s.inspectionSection}>
            <View style={s.inspectionHeader}>
              <Text style={s.inspectionDateText}>
                {inspectedDate === todayStr ? 'Today’s Summary' : formatDisplayDate(inspectedDate)}
              </Text>
              <View style={[s.statusDot, { backgroundColor: inspectedData.hasActivity ? '#5eda9e' : '#8e8e93' }]} />
            </View>

            {inspectedData.hasActivity ? (
              <View style={s.inspectionDetails}>
                {inspectedData.tasksDone.length > 0 && (
                  <Text style={s.inspectionItem}>
                    • <Text style={s.boldWhite}>{inspectedData.tasksDone.length}</Text> tasks completed
                  </Text>
                )}
                {inspectedData.gym && (
                  <Text style={s.inspectionItem}>
                    • Gym workout completed ({inspectedData.gym.exercises?.length || 0} exercises)
                  </Text>
                )}
                {inspectedData.habits.length > 0 && (
                  <Text style={s.inspectionItem}>
                    • <Text style={s.boldWhite}>{inspectedData.habits.length}</Text> habits logged
                  </Text>
                )}
                {inspectedData.classesAttended > 0 && (
                  <Text style={s.inspectionItem}>
                    • <Text style={s.boldWhite}>{inspectedData.classesAttended}</Text> academic sessions attended
                  </Text>
                )}
              </View>
            ) : (
              <Text style={s.inspectionEmptyText}>
                No activity recorded on this date.
              </Text>
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: any) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: '#000000',
    },
    navBar: {
      paddingHorizontal: 16,
      paddingTop: 6,
      paddingBottom: 10,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    backBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
    },
    backText: {
      fontFamily: FONT_FAMILY.medium,
      fontSize: 16,
      color: colors.textPrimary,
    },
    liveStatusPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: '#1c1c1e',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 14,
      borderWidth: 0.5,
      borderColor: 'rgba(255,255,255,0.1)',
    },
    liveDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    liveStatusText: {
      fontFamily: FONT_FAMILY.medium,
      fontSize: 11,
      color: '#8e8e93',
    },
    scroll: {
      paddingHorizontal: 16,
      paddingBottom: 100,
      paddingTop: 6,
    },

    // Apple Fitness Hero
    heroSection: {
      alignItems: 'center',
      paddingVertical: 20,
      marginBottom: 16,
    },
    flameOrb: {
      width: 68,
      height: 68,
      borderRadius: 34,
      backgroundColor: '#1c1c1e',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
      borderWidth: 0.5,
      borderColor: 'rgba(255,159,77,0.3)',
      position: 'relative',
    },
    flameOrbGlow: {
      position: 'absolute',
      width: 68,
      height: 68,
      borderRadius: 34,
    },
    streakCountRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      gap: 6,
    },
    streakLargeNumber: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 60,
      color: '#ffffff',
      lineHeight: 68,
      letterSpacing: -1,
    },
    streakUnitLabel: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 14,
      color: '#ff9f4d',
      letterSpacing: 1.5,
    },
    heroTierTitle: {
      fontFamily: FONT_FAMILY.medium,
      fontSize: 14,
      color: '#8e8e93',
      marginTop: 2,
    },
    heroProgressWrapper: {
      width: '100%',
      maxWidth: 260,
      alignItems: 'center',
      marginTop: 14,
    },
    heroProgressBarTrack: {
      width: '100%',
      height: 6,
      backgroundColor: '#2c2c2e',
      borderRadius: 3,
      overflow: 'hidden',
      marginBottom: 8,
    },
    heroProgressBarFill: {
      height: '100%',
      borderRadius: 3,
    },
    heroProgressSubtext: {
      fontFamily: FONT_FAMILY.medium,
      fontSize: 12,
      color: '#8e8e93',
    },

    // iOS Inset Card Architecture
    sectionHeader: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 12,
      color: '#8e8e93',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginLeft: 12,
      marginBottom: 8,
      marginTop: 10,
    },
    insetCard: {
      backgroundColor: '#1c1c1e',
      borderRadius: 16,
      overflow: 'hidden',
      borderWidth: 0.5,
      borderColor: '#2c2c2e',
      marginBottom: 16,
    },

    // Matrix
    matrixRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    matrixCell: {
      flex: 1,
      paddingVertical: 14,
      paddingHorizontal: 16,
    },
    matrixLabel: {
      fontFamily: FONT_FAMILY.medium,
      fontSize: 10,
      color: '#8e8e93',
      letterSpacing: 0.5,
      marginBottom: 4,
    },
    matrixNumber: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 20,
      color: '#ffffff',
    },
    matrixUnit: {
      fontFamily: FONT_FAMILY.medium,
      fontSize: 12,
      color: '#8e8e93',
      fontWeight: '400',
    },
    matrixDividerV: {
      width: 0.5,
      height: '70%',
      backgroundColor: '#2c2c2e',
    },
    matrixDividerH: {
      height: 0.5,
      width: '100%',
      backgroundColor: '#2c2c2e',
    },

    // Table
    tableRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 16,
    },
    tableIconSquircle: {
      width: 30,
      height: 30,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    tableTitle: {
      fontFamily: FONT_FAMILY.medium,
      fontSize: 14,
      color: '#ffffff',
      flex: 1,
    },
    tableValue: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 14,
      color: '#ffffff',
    },
    tableValueUnit: {
      fontFamily: FONT_FAMILY.medium,
      fontSize: 12,
      color: '#8e8e93',
      fontWeight: '400',
    },
    tableDivider: {
      height: 0.5,
      marginLeft: 58,
      backgroundColor: '#2c2c2e',
    },

    // Awards
    awardsRow: {
      paddingHorizontal: 4,
      paddingBottom: 8,
      gap: 12,
      marginBottom: 16,
    },
    awardItem: {
      alignItems: 'center',
      width: 68,
    },
    awardRing: {
      width: 52,
      height: 52,
      borderRadius: 26,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 6,
      borderWidth: 1.5,
    },
    awardRingUnlocked: {
      backgroundColor: 'rgba(255,159,77,0.12)',
      borderColor: '#ff9f4d',
    },
    awardRingLocked: {
      backgroundColor: '#1c1c1e',
      borderColor: '#2c2c2e',
    },
    awardEmoji: {
      fontSize: 20,
    },
    awardDays: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 11,
      color: '#8e8e93',
    },
    awardLabel: {
      fontFamily: FONT_FAMILY.medium,
      fontSize: 9,
      color: '#636366',
      marginTop: 1,
      textAlign: 'center',
    },

    // Inspection
    inspectionSection: {
      padding: 16,
    },
    inspectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    inspectionDateText: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 13,
      color: '#ffffff',
    },
    statusDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    inspectionDetails: {
      gap: 4,
    },
    inspectionItem: {
      fontFamily: FONT_FAMILY.medium,
      fontSize: 12,
      color: '#8e8e93',
      lineHeight: 18,
    },
    boldWhite: {
      fontFamily: FONT_FAMILY.bold,
      color: '#ffffff',
    },
    inspectionEmptyText: {
      fontFamily: FONT_FAMILY.medium,
      fontSize: 12,
      color: '#636366',
      fontStyle: 'italic',
    },
  });
