import React, { useMemo, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions, TouchableOpacity } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Calendar } from 'react-native-calendars';
import { StatusBar } from 'expo-status-bar';

import { useCoreData } from '../contexts/domains/CoreDataContext';
import { useWellnessData } from '../contexts/domains/WellnessContext';
import { useAcademicData } from '../contexts/domains/AcademicContext';
import { useTheme } from '../contexts/ThemeContext';
import { FONT_FAMILY, SPACE, RADIUS } from '../theme/tokens';
import AnimatedPressable from '../components/AnimatedPressable';
import {
  calculateAppStreak,
  calculateLongestAppStreak,
  calculateTotalActiveDays,
  calculateConsistencyRate,
  getNextMilestone,
  STREAK_MILESTONES,
  StreakMilestone,
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

export default function StreakDetailScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { colors, isDark } = useTheme();
  const s = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  const { habitId } = route.params || {};
  const { allHabits, habitLogs, tasks } = useCoreData();
  const { gymLogs } = useWellnessData();
  const { attendanceLogs } = useAcademicData();

  const habit = useMemo(() => allHabits?.find((h) => h.id === habitId), [allHabits, habitId]);
  const isAppStreak = !habitId;
  const activeColor = habit ? (habit.color || colors.accentPrimary) : (isDark ? '#FF9500' : colors.accentAmber);

  const todayStr = useMemo(() => getLocalDateString(new Date()), []);
  const [inspectedDate, setInspectedDate] = useState<string>(todayStr);
  const [selectedMilestone, setSelectedMilestone] = useState<StreakMilestone | null>(null);

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

  const milestoneInfo = useMemo(() => {
    let current = STREAK_MILESTONES[0];
    let next = STREAK_MILESTONES[1];

    for (let i = 0; i < STREAK_MILESTONES.length; i++) {
      if (currentStreak >= STREAK_MILESTONES[i].days) {
        current = STREAK_MILESTONES[i];
        next = STREAK_MILESTONES[Math.min(i + 1, STREAK_MILESTONES.length - 1)];
      } else {
        next = STREAK_MILESTONES[i];
        current = i > 0 ? STREAK_MILESTONES[i - 1] : { days: 0, label: 'Initiate', badge: '🌱', badgeIcon: 'flame', color: '#A855F7', gradient: ['#A855F7', '#6366F1'], desc: 'Start your streak' };
        break;
      }
    }

    const span = next.days - current.days;
    const earned = Math.max(0, currentStreak - current.days);
    const progress = span > 0 ? Math.min(1, earned / span) : 1;
    const remaining = Math.max(0, next.days - currentStreak);

    return { current, next, progress, remaining };
  }, [currentStreak]);

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
      container: { backgroundColor: isDark ? 'rgba(255,149,0,0.22)' : 'rgba(217,119,6,0.18)', borderRadius: 8, borderWidth: 1, borderColor: isDark ? '#FF9500' : '#D97706' },
      text: { color: isDark ? '#FFA500' : '#B45309', fontFamily: FONT_FAMILY.bold, fontWeight: '700' as const },
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
              backgroundColor: isDark ? '#FF9500' : colors.accentAmber,
              borderColor: '#FFFFFF',
              borderWidth: 2,
            },
            text: { color: isDark ? '#000000' : '#FFFFFF', fontFamily: FONT_FAMILY.bold, fontWeight: '700' as const },
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
  }, [habitId, habitLogs, tasks, gymLogs, inspectedDate, colors.accentPrimary, colors.accentAmber, isDark]);

  const handleMilestonePress = useCallback((m: StreakMilestone) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedMilestone(prev => prev?.days === m.days ? null : m);
  }, []);

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <StatusBar style={isDark ? 'light' : 'dark'} backgroundColor={colors.background} />

      {/* ── Top Navigation Bar ── */}
      <View style={s.navBar}>
        <AnimatedPressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            navigation.goBack();
          }}
          style={s.backBtn}
        >
          <Ionicons name="chevron-back" size={22} color={colors.textPrimary} />
          <Text style={s.backText}>Back</Text>
        </AnimatedPressable>

        <View style={s.liveStatusPill}>
          <View style={[s.liveDot, { backgroundColor: currentStreak > 0 ? '#22C55E' : colors.textMuted }]} />
          <Text style={s.liveStatusText}>
            {currentStreak > 0 ? 'Active Streak' : 'Resting'}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* ── Hero Glowing Streak Card ── */}
        <View style={s.heroCard}>
          <LinearGradient
            colors={isDark ? ['rgba(255,149,0,0.12)', 'rgba(255,59,48,0.04)', 'transparent'] : ['rgba(255,149,0,0.08)', 'rgba(255,59,48,0.02)', 'transparent']}
            style={StyleSheet.absoluteFillObject}
          />

          {/* Radiant Flame Orb */}
          <View style={s.flameOrbOuter}>
            <LinearGradient
              colors={['#FF9500', '#FF3B30']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={s.flameOrbInner}
            >
              <Ionicons name="flame" size={32} color="#FFFFFF" />
            </LinearGradient>
          </View>

          {/* Large Streak Metric */}
          <View style={s.streakCountRow}>
            <Text style={s.streakLargeNumber}>{currentStreak}</Text>
            <View style={s.streakBadgeBox}>
              <Text style={s.streakBadgeText}>DAYS</Text>
            </View>
          </View>

          {/* Current Tier Pill */}
          <View style={s.tierPill}>
            <Ionicons name="sparkles" size={13} color="#FF9500" style={{ marginRight: 4 }} />
            <Text style={s.heroTierTitle}>
              {milestoneInfo.current.label}
            </Text>
          </View>

          {/* Milestone Progress Bar */}
          <View style={s.heroProgressWrapper}>
            <View style={s.heroProgressBarTrack}>
              <LinearGradient
                colors={['#FF9500', '#FF3B30', '#A855F7']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[s.heroProgressBarFill, { width: `${Math.min(100, Math.max(6, milestoneInfo.progress * 100))}%` }]}
              />
            </View>
            <Text style={s.heroProgressSubtext}>
              {milestoneInfo.remaining > 0
                ? `${milestoneInfo.remaining} days to ${milestoneInfo.next.label}`
                : 'Maximum tier unlocked!'}
            </Text>
          </View>
        </View>

        {/* ── Section: Overview Matrix (2x2 Grid) ── */}
        <Text style={s.sectionHeader}>Streak Analytics</Text>
        <View style={s.matrixGrid}>
          {/* Card 1: Current Streak */}
          <View style={s.matrixCard}>
            <View style={s.matrixIconRow}>
              <View style={[s.matrixIconBox, { backgroundColor: 'rgba(255,149,0,0.14)' }]}>
                <Ionicons name="flame" size={16} color="#FF9500" />
              </View>
              <Text style={s.matrixLabel}>CURRENT</Text>
            </View>
            <Text style={s.matrixValue}>{currentStreak} <Text style={s.matrixUnit}>days</Text></Text>
          </View>

          {/* Card 2: Longest Streak */}
          <View style={s.matrixCard}>
            <View style={s.matrixIconRow}>
              <View style={[s.matrixIconBox, { backgroundColor: 'rgba(56,189,248,0.14)' }]}>
                <Ionicons name="trophy" size={15} color="#38BDF8" />
              </View>
              <Text style={s.matrixLabel}>BEST EVER</Text>
            </View>
            <Text style={s.matrixValue}>{longestStreak} <Text style={s.matrixUnit}>days</Text></Text>
          </View>

          {/* Card 3: Total Active */}
          <View style={s.matrixCard}>
            <View style={s.matrixIconRow}>
              <View style={[s.matrixIconBox, { backgroundColor: 'rgba(168,85,247,0.14)' }]}>
                <Ionicons name="calendar" size={15} color="#A855F7" />
              </View>
              <Text style={s.matrixLabel}>TOTAL DAYS</Text>
            </View>
            <Text style={s.matrixValue}>{totalActiveDays} <Text style={s.matrixUnit}>active</Text></Text>
          </View>

          {/* Card 4: 30-Day Rate */}
          <View style={s.matrixCard}>
            <View style={s.matrixIconRow}>
              <View style={[s.matrixIconBox, { backgroundColor: 'rgba(34,197,94,0.14)' }]}>
                <Ionicons name="trending-up" size={16} color="#22C55E" />
              </View>
              <Text style={s.matrixLabel}>30-DAY RATE</Text>
            </View>
            <Text style={s.matrixValue}>{consistencyRate}%</Text>
          </View>
        </View>

        {/* ── Section: Milestone Awards (Redesigned Medallions) ── */}
        <View style={s.sectionHeaderRow}>
          <Text style={s.sectionHeader}>Milestone Awards</Text>
          <Text style={s.sectionSubtitle}>Tap for details</Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.awardsRow}
        >
          {STREAK_MILESTONES.map((m) => {
            const isUnlocked = currentStreak >= m.days;
            const isSelected = selectedMilestone?.days === m.days;

            return (
              <TouchableOpacity
                key={m.days}
                activeOpacity={0.8}
                onPress={() => handleMilestonePress(m)}
                style={[
                  s.awardItem,
                  isSelected && s.awardItemSelected,
                ]}
              >
                {/* Medallion Circle */}
                <View style={[
                  s.awardMedallion,
                  isUnlocked ? { borderColor: m.color, shadowColor: m.color } : s.awardMedallionLocked,
                ]}>
                  {isUnlocked ? (
                    <LinearGradient
                      colors={m.gradient || [m.color, m.color]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={s.awardMedallionFill}
                    >
                      {m.badgeIconSet === 'mci' ? (
                        <MaterialCommunityIcons name={m.badgeIcon as any} size={22} color="#FFFFFF" />
                      ) : (
                        <Ionicons name={m.badgeIcon as any} size={22} color="#FFFFFF" />
                      )}
                    </LinearGradient>
                  ) : (
                    <View style={s.awardMedallionFillLocked}>
                      <Ionicons name="lock-closed" size={18} color={isDark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)'} />
                    </View>
                  )}

                  {/* Micro Checkmark Tag if Unlocked */}
                  {isUnlocked && (
                    <View style={s.awardCheckTag}>
                      <Ionicons name="checkmark" size={9} color="#FFFFFF" />
                    </View>
                  )}
                </View>

                {/* Day Threshold */}
                <Text style={[s.awardDays, isUnlocked && { color: m.color }]}>
                  {m.days}d
                </Text>

                {/* Milestone Title */}
                <Text style={[s.awardLabel, isUnlocked && { color: colors.textPrimary }]} numberOfLines={1}>
                  {m.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Selected Milestone Tooltip Banner */}
        {selectedMilestone && (
          <View style={[s.milestoneDetailCard, { borderColor: selectedMilestone.color + '40' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={[s.milestoneDetailDot, { backgroundColor: selectedMilestone.color }]} />
              <Text style={s.milestoneDetailTitle}>{selectedMilestone.label} ({selectedMilestone.days} Days)</Text>
            </View>
            <Text style={s.milestoneDetailDesc}>{selectedMilestone.desc}</Text>
            <Text style={[s.milestoneDetailStatus, { color: currentStreak >= selectedMilestone.days ? '#22C55E' : colors.accentAmber }]}>
              {currentStreak >= selectedMilestone.days
                ? '✓ Milestone Unlocked & Mastered'
                : `⏳ ${selectedMilestone.days - currentStreak} days remaining to unlock`}
            </Text>
          </View>
        )}

        {/* ── Section: Activity Breakdown ── */}
        {isAppStreak && (
          <>
            <Text style={s.sectionHeader}>Activity Contribution</Text>
            <View style={s.insetCard}>
              {/* Gym */}
              <View style={s.tableRow}>
                <View style={[s.tableIconSquircle, { backgroundColor: 'rgba(56,189,248,0.14)' }]}>
                  <MaterialCommunityIcons name="arm-flex" size={17} color="#38BDF8" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.tableTitle}>Fitness & Gym Workouts</Text>
                  <Text style={s.tableSubtitle}>Weight training and cardio logs</Text>
                </View>
                <Text style={s.tableValue}>{gymSessionsCount} <Text style={s.tableValueUnit}>logs</Text></Text>
              </View>

              <View style={s.tableDivider} />

              {/* Attendance */}
              <View style={s.tableRow}>
                <View style={[s.tableIconSquircle, { backgroundColor: 'rgba(168,85,247,0.14)' }]}>
                  <Ionicons name="id-card" size={16} color="#A855F7" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.tableTitle}>Academic Attendance</Text>
                  <Text style={s.tableSubtitle}>Classes and lectures attended</Text>
                </View>
                <Text style={s.tableValue}>{classesAttendedCount} <Text style={s.tableValueUnit}>classes</Text></Text>
              </View>

              <View style={s.tableDivider} />

              {/* Habits */}
              <View style={s.tableRow}>
                <View style={[s.tableIconSquircle, { backgroundColor: 'rgba(255,149,0,0.14)' }]}>
                  <Ionicons name="sync" size={16} color="#FF9500" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.tableTitle}>Daily Habits & Rituals</Text>
                  <Text style={s.tableSubtitle}>Habit completions checked</Text>
                </View>
                <Text style={s.tableValue}>{habitCompletionsCount} <Text style={s.tableValueUnit}>checked</Text></Text>
              </View>

              <View style={s.tableDivider} />

              {/* Tasks */}
              <View style={s.tableRow}>
                <View style={[s.tableIconSquircle, { backgroundColor: 'rgba(34,197,94,0.14)' }]}>
                  <Ionicons name="checkmark-circle" size={16} color="#22C55E" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.tableTitle}>Completed Tasks</Text>
                  <Text style={s.tableSubtitle}>Daily agenda items resolved</Text>
                </View>
                <Text style={s.tableValue}>{tasksCompletedCount} <Text style={s.tableValueUnit}>tasks</Text></Text>
              </View>
            </View>
          </>
        )}

        {/* ── Section: Activity History Calendar ── */}
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
              textSectionTitleColor: colors.textTertiary,
              selectedDayBackgroundColor: activeColor,
              selectedDayTextColor: '#FFFFFF',
              todayTextColor: '#FF9500',
              dayTextColor: colors.textPrimary,
              textDisabledColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)',
              monthTextColor: colors.textPrimary,
              arrowColor: colors.textPrimary,
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
              <View style={[s.statusDot, { backgroundColor: inspectedData.hasActivity ? '#22C55E' : colors.textMuted }]} />
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

const makeStyles = (colors: any, isDark: boolean = true) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
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
      gap: 3,
    },
    backText: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 15,
      color: colors.textPrimary,
    },
    liveStatusPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: isDark ? '#1C1C1E' : colors.surface,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.1)' : colors.border,
    },
    liveDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    liveStatusText: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 11,
      color: colors.textPrimary,
      letterSpacing: 0.2,
    },
    scroll: {
      paddingHorizontal: 16,
      paddingBottom: 100,
      paddingTop: 4,
    },

    // ── Hero Section ──
    heroCard: {
      backgroundColor: isDark ? '#141416' : colors.surface,
      borderRadius: RADIUS.xl,
      paddingVertical: 24,
      paddingHorizontal: 18,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,149,0,0.22)' : 'rgba(217,119,6,0.18)',
      marginBottom: 16,
      overflow: 'hidden',
      position: 'relative',
    },
    flameOrbOuter: {
      width: 68,
      height: 68,
      borderRadius: 34,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 10,
      shadowColor: '#FF6B00',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: isDark ? 0.45 : 0.25,
      shadowRadius: 16,
      elevation: 12,
    },
    flameOrbInner: {
      width: 68,
      height: 68,
      borderRadius: 34,
      alignItems: 'center',
      justifyContent: 'center',
    },
    streakCountRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginVertical: 4,
    },
    streakLargeNumber: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 56,
      color: colors.textPrimary,
      lineHeight: 62,
      letterSpacing: -1.5,
    },
    streakBadgeBox: {
      backgroundColor: isDark ? 'rgba(255,149,0,0.18)' : 'rgba(217,119,6,0.12)',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,149,0,0.3)' : 'rgba(217,119,6,0.2)',
    },
    streakBadgeText: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 11,
      color: '#FF9500',
      letterSpacing: 1,
    },
    tierPill: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? '#1C1C1E' : colors.surface2,
      paddingHorizontal: 12,
      paddingVertical: 5,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : colors.border,
      marginTop: 4,
    },
    heroTierTitle: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 13,
      color: colors.textPrimary,
      letterSpacing: 0.2,
    },
    heroProgressWrapper: {
      width: '100%',
      maxWidth: 280,
      alignItems: 'center',
      marginTop: 16,
    },
    heroProgressBarTrack: {
      width: '100%',
      height: 6,
      backgroundColor: isDark ? '#26262A' : '#E2E1EA',
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
      color: colors.textTertiary,
    },

    // ── Section Headers ──
    sectionHeader: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 12,
      color: colors.textTertiary,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginLeft: 4,
      marginBottom: 10,
      marginTop: 6,
    },
    sectionHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 4,
      marginBottom: 10,
      marginTop: 6,
    },
    sectionSubtitle: {
      fontFamily: FONT_FAMILY.medium,
      fontSize: 11,
      color: colors.textTertiary,
    },

    // ── 2x2 Matrix Grid ──
    matrixGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      marginBottom: 16,
    },
    matrixCard: {
      width: (Dimensions.get('window').width - 42) / 2,
      backgroundColor: isDark ? '#18181B' : colors.surface,
      borderRadius: RADIUS.lg,
      padding: 14,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : colors.border,
    },
    matrixIconRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 10,
    },
    matrixIconBox: {
      width: 28,
      height: 28,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    matrixLabel: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 10,
      color: colors.textTertiary,
      letterSpacing: 0.6,
    },
    matrixValue: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 20,
      color: colors.textPrimary,
      letterSpacing: -0.3,
    },
    matrixUnit: {
      fontFamily: FONT_FAMILY.medium,
      fontSize: 12,
      color: colors.textTertiary,
    },

    // ── Inset Table Cards ──
    insetCard: {
      backgroundColor: isDark ? '#18181B' : colors.surface,
      borderRadius: RADIUS.xl,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.08)' : colors.border,
      marginBottom: 16,
    },
    tableRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 13,
      paddingHorizontal: 16,
    },
    tableIconSquircle: {
      width: 34,
      height: 34,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    tableTitle: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 13.5,
      color: colors.textPrimary,
      letterSpacing: -0.1,
    },
    tableSubtitle: {
      fontFamily: FONT_FAMILY.medium,
      fontSize: 11,
      color: colors.textTertiary,
      marginTop: 1,
    },
    tableValue: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 14,
      color: colors.textPrimary,
    },
    tableValueUnit: {
      fontFamily: FONT_FAMILY.medium,
      fontSize: 11.5,
      color: colors.textTertiary,
    },
    tableDivider: {
      height: 1,
      marginLeft: 62,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : colors.border,
    },

    // ── Milestone Awards (Medallions) ──
    awardsRow: {
      paddingHorizontal: 2,
      paddingBottom: 6,
      gap: 12,
      marginBottom: 12,
    },
    awardItem: {
      alignItems: 'center',
      width: 74,
      paddingVertical: 8,
      paddingHorizontal: 4,
      borderRadius: 14,
    },
    awardItemSelected: {
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    },
    awardMedallion: {
      width: 54,
      height: 54,
      borderRadius: 27,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 6,
      position: 'relative',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.4 : 0.2,
      shadowRadius: 10,
      elevation: 6,
    },
    awardMedallionFill: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
    },
    awardMedallionLocked: {
      borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
      backgroundColor: isDark ? '#1C1C1E' : '#E2E1EA',
    },
    awardMedallionFillLocked: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? '#141416' : '#F0EFF7',
    },
    awardCheckTag: {
      position: 'absolute',
      bottom: -2,
      right: -2,
      width: 16,
      height: 16,
      borderRadius: 8,
      backgroundColor: '#22C55E',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1.5,
      borderColor: isDark ? '#141416' : '#FFFFFF',
    },
    awardDays: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 11.5,
      color: colors.textTertiary,
    },
    awardLabel: {
      fontFamily: FONT_FAMILY.medium,
      fontSize: 9.5,
      color: colors.textTertiary,
      marginTop: 2,
      textAlign: 'center',
    },
    milestoneDetailCard: {
      backgroundColor: isDark ? '#1C1C1E' : colors.surface,
      borderRadius: RADIUS.lg,
      padding: 14,
      borderWidth: 1,
      marginBottom: 16,
      gap: 4,
    },
    milestoneDetailDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    milestoneDetailTitle: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 13.5,
      color: colors.textPrimary,
    },
    milestoneDetailDesc: {
      fontFamily: FONT_FAMILY.body,
      fontSize: 12,
      color: colors.textSecondary,
      lineHeight: 16,
    },
    milestoneDetailStatus: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 11.5,
      marginTop: 2,
    },

    // ── Inspection Summary ──
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
      fontSize: 13.5,
      color: colors.textPrimary,
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
      color: colors.textSecondary,
      lineHeight: 18,
    },
    boldWhite: {
      fontFamily: FONT_FAMILY.bold,
      color: colors.textPrimary,
    },
    inspectionEmptyText: {
      fontFamily: FONT_FAMILY.medium,
      fontSize: 12,
      color: colors.textMuted,
      fontStyle: 'italic',
    },
  });
