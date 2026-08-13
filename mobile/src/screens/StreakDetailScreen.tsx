import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMobileData } from '../contexts/MobileDataContext';
import { useTheme } from '../contexts/ThemeContext';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS } from '../theme/tokens';
import { Calendar } from 'react-native-calendars';

import { awardXP } from '../services/xpSystem';
import AnimatedPressable from '../components/AnimatedPressable';
import { calculateAppStreak } from '../utils/streakUtils';

export default function StreakDetailScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { colors, isDark } = useTheme();
  const s = makeStyles(colors);
  
  const { habitId } = route.params || {};
  const { allHabits, habitLogs, tasks, gymLogs } = useMobileData();

  const habit = useMemo(() => allHabits?.find((h) => h.id === habitId), [allHabits, habitId]);
  
  const isAppStreak = !habitId;

  // Colors
  const activeColor = habit ? (habit.color || colors.accentPrimary) : colors.accentPrimary;

  // Calculate marked dates
  const markedDates = useMemo(() => {
    const marks: any = {};
    const successStyle = {
      container: { backgroundColor: activeColor, borderRadius: RADIUS.md },
      text: { color: '#fff', fontFamily: FONT_FAMILY.bold }
    };

    if (habitId) {
      habitLogs?.forEach(log => {
        if (log.habitId === habitId) {
          marks[log.date] = { customStyles: successStyle };
        }
      });
    } else {
      // App Streak active days
      tasks?.forEach(t => {
        if (t.status === 'completed' && t.date) {
          marks[t.date] = { customStyles: successStyle };
        }
      });
      gymLogs?.forEach(g => {
        if (g.date) marks[g.date] = { customStyles: successStyle };
      });
      habitLogs?.forEach(l => {
        if (l.date) marks[l.date] = { customStyles: successStyle };
      });
    }
    
    // Mark today so it's highlighted differently if not active
    const todayStr = new Date().toISOString().slice(0, 10);
    if (!marks[todayStr]) {
      marks[todayStr] = {
        customStyles: {
          container: { borderWidth: 1, borderColor: activeColor, borderRadius: RADIUS.md },
          text: { color: activeColor, fontFamily: FONT_FAMILY.bold }
        }
      };
    }

    return marks;
  }, [habitId, habitLogs, tasks, gymLogs, activeColor]);

  // Calculate App Streak
  const appStreak = useMemo(() => {
    if (!isAppStreak) return 0;
    return calculateAppStreak(tasks, gymLogs, habitLogs);
  }, [isAppStreak, tasks, gymLogs, habitLogs]);

  const currentStreak = isAppStreak ? appStreak : (habit?.streak || 0);
  const longestStreak = isAppStreak ? Math.max(appStreak, 0) : (habit?.longestStreak || 0);

  return (
    <SafeAreaView style={s.root} edges={['bottom', 'top']}>
      <View style={s.navBar}>
        <AnimatedPressable onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </AnimatedPressable>
      </View>
      <ScrollView contentContainerStyle={s.scroll}>
        
        {isAppStreak ? (
          <View style={s.header}>
            <Text style={s.emoji}>🔥</Text>
            <Text style={s.title}>App Activity</Text>
            <Text style={s.frequency}>OVERALL STREAK</Text>
          </View>
        ) : (
          <View style={s.header}>
            <Text style={s.emoji}>{habit?.emoji}</Text>
            <Text style={s.title}>{habit?.name}</Text>
            <Text style={s.frequency}>{habit?.frequency}</Text>
          </View>
        )}

        <View style={s.statsRow}>
          <View style={s.statCard}>
            <Ionicons name="flame" size={24} color={activeColor} />
            <Text style={s.statValue}>{currentStreak}</Text>
            <Text style={s.statLabel}>Current Streak</Text>
          </View>
          
          {!isAppStreak && (
            <View style={s.statCard}>
              <Ionicons name="trophy" size={24} color={colors.accentAmber} />
              <Text style={s.statValue}>{longestStreak}</Text>
              <Text style={s.statLabel}>Longest Streak</Text>
            </View>
          )}
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>History</Text>
          <View style={s.calendarWrapper}>
            <Calendar
              markingType={'custom'}
              markedDates={markedDates}
              theme={{
                backgroundColor: colors.surface,
                calendarBackground: colors.surface,
                textSectionTitleColor: colors.textSecondary,
                selectedDayBackgroundColor: activeColor,
                selectedDayTextColor: '#ffffff',
                todayTextColor: activeColor,
                dayTextColor: colors.textPrimary,
                textDisabledColor: colors.textMuted,
                monthTextColor: colors.textPrimary,
                arrowColor: colors.textPrimary,
                textDayFontFamily: FONT_FAMILY.medium,
                textMonthFontFamily: FONT_FAMILY.bold,
                textDayHeaderFontFamily: FONT_FAMILY.mono,
              }}
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  navBar: { paddingHorizontal: SPACE.lg, paddingTop: SPACE.md, paddingBottom: SPACE.sm, flexDirection: 'row', alignItems: 'center' },
  backBtn: { padding: SPACE.xs },
  scroll: { padding: SPACE.xl, paddingBottom: 100, paddingTop: 0 },
  header: { alignItems: 'center', marginBottom: SPACE.xxl, marginTop: SPACE.md },
  emoji: { fontSize: 64, marginBottom: SPACE.sm },
  title: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.xxl, color: colors.textPrimary, marginBottom: 4 },
  frequency: { fontFamily: FONT_FAMILY.mono, fontSize: FONT_SIZE.xs, color: colors.textSecondary, textTransform: 'uppercase' },
  statsRow: { flexDirection: 'row', gap: SPACE.md, marginBottom: SPACE.xxl },
  statCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: RADIUS.xl,
    padding: SPACE.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  statValue: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.xxl, color: colors.textPrimary, marginTop: SPACE.sm },
  statLabel: { fontFamily: FONT_FAMILY.medium, fontSize: FONT_SIZE.xs, color: colors.textSecondary, marginTop: 2 },
  section: { marginTop: SPACE.md },
  sectionTitle: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.lg, color: colors.textPrimary, marginBottom: SPACE.lg },
  calendarWrapper: {
    borderRadius: RADIUS.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  }
});
