/**
 * AnalyticsScreen.tsx — ZenTrack Mobile
 *
 * State-of-the-Art Telemetry & Life Performance Dashboard
 * Themes: "Obsidian Cosmos" (OLED Pitch Black) & "Frost Quartz" (Light Alabaster)
 *
 * Layout & Polish:
 * 1. Hero Zen Score Card: Spacious 190px progress ring, centered score with collision-free tier pill,
 *    and a structured 2x2 life balance grid (Tasks, Habits, Gym, Focus).
 * 2. 2x2 Telemetry Grid: Balanced tiles with icon, large stat, clear label, and spacious footer tag.
 * 3. Interactive Task Velocity Chart: Grounded capsule bars sit on an aligned baseline with tap inspection.
 * 4. Habit Momentum Spline Wave: Dedicated label row below the SVG eliminating label/wave collision.
 * 5. Academic Attendance Safety Card: Spacious gauge arc with structured metrics and bunk margin pill.
 * 6. Gym Physical Vitality Card: Clean volume bars with session frequency and tonnage metrics.
 * 7. 35-Day Discipline Grid: 5-week activity heatmap with interactive day inspection.
 */

import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, Animated, ScrollView,
  TouchableOpacity, Dimensions, Pressable
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import Svg, {
  Circle, Path, Defs, LinearGradient as SvgLinearGradient,
  Stop, Line
} from 'react-native-svg';
import { LinearGradient as ExpoLinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';

import { useCoreData } from '../contexts/domains/CoreDataContext';
import { useWellnessData } from '../contexts/domains/WellnessContext';
import { useAcademicData } from '../contexts/domains/AcademicContext';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS } from '../theme/tokens';
import { useTheme } from '../contexts/ThemeContext';
import AnalyticsSkeleton from '../components/Analytics/AnalyticsSkeleton';
import { computeOrGetHotCache, generateDatasetFingerprint } from '../utils/hotCacheStore';
import { formatLocalDateStr, formatDateShort, formatDateWithDay } from '../utils/dateUtils';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_MARGIN = 16;
const CARD_PAD = 16;
const CHART_WIDTH = SCREEN_WIDTH - CARD_MARGIN * 2 - CARD_PAD * 2;
const CHART_HEIGHT = 120;

// ─── Smooth Cubic Bezier Spline Helper ─────────────────────────────────────────
function generateSplinePath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return pts.length === 1 ? `M ${pts[0].x} ${pts[0].y}` : '';
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const midX = (p1.x + p2.x) / 2;
    d += ` C ${midX.toFixed(1)} ${p1.y.toFixed(1)}, ${midX.toFixed(1)} ${p2.y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

// ─── Date helpers ──────────────────────────────────────────────────────────────
function daysAgoStr(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return formatLocalDateStr(d);
}

type Period = 'week' | 'month' | 'semester';
const PERIOD_DAYS: Record<Period, number> = { week: 7, month: 30, semester: 90 };

// ─── Delta Badge ───────────────────────────────────────────────────────────────
const badgeStyles = StyleSheet.create({
  deltaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    gap: 3,
  },
  deltaText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 10.5,
  },
});

const DeltaBadge = React.memo(function DeltaBadge({ cur, prev, unit = '' }: { cur: number; prev: number; unit?: string }) {
  const { isDark } = useTheme();

  if (prev === 0 && cur === 0) return null;
  const diff = cur - prev;
  const up = diff >= 0;

  const posBg = isDark ? 'rgba(94,218,158,0.14)' : 'rgba(5,150,105,0.10)';
  const negBg = isDark ? 'rgba(255,105,97,0.14)' : 'rgba(220,38,38,0.10)';
  const posColor = isDark ? '#5EDA9E' : '#059669';
  const negColor = isDark ? '#FF6961' : '#DC2626';

  let text = '';
  if (unit === 'pts') {
    text = diff > 0 ? `+${diff} pts` : diff < 0 ? `${diff} pts` : `0 pts`;
  } else if (prev > 0) {
    const pct = Math.round((diff / prev) * 100);
    text = pct >= 0 ? `+${pct}%` : `${pct}%`;
  } else {
    text = `+${cur}`;
  }

  return (
    <View style={[badgeStyles.deltaBadge, { backgroundColor: up ? posBg : negBg }]}>
      <Ionicons name={up ? 'trending-up' : 'trending-down'} size={11} color={up ? posColor : negColor} />
      <Text style={[badgeStyles.deltaText, { color: up ? posColor : negColor }]}>{text}</Text>
    </View>
  );
});

// ─── Period Selector (Glass Pill Segment) ──────────────────────────────────────
const periodStyles = StyleSheet.create({
  periodContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 3,
    height: 36,
  },
  periodBtn: {
    paddingHorizontal: 12,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
  },
  periodBtnActive: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 2,
  },
  periodText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 12.5,
  },
});

const PeriodSelector = React.memo(function PeriodSelector({
  value,
  onChange,
}: {
  value: Period;
  onChange: (p: Period) => void;
}) {
  const { colors, isDark } = useTheme();
  const periods: Period[] = ['week', 'month', 'semester'];
  const labels: Record<Period, string> = { week: '7D', month: '30D', semester: '90D' };

  return (
    <View style={[periodStyles.periodContainer, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#ECEBF2' }]}>
      {periods.map((p) => {
        const isActive = value === p;
        return (
          <TouchableOpacity
            key={p}
            style={[
              periodStyles.periodBtn,
              isActive && [
                periodStyles.periodBtnActive,
                { backgroundColor: isDark ? '#232328' : '#FFFFFF' },
              ],
            ]}
            onPress={() => {
              if (!isActive) {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onChange(p);
              }
            }}
            activeOpacity={0.7}
          >
            <Text
              style={[
                periodStyles.periodText,
                { color: isActive ? (isDark ? '#FFFFFF' : '#000000') : colors.textMuted },
                isActive && { fontFamily: FONT_FAMILY.bold },
              ]}
            >
              {labels[p]}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
});

export default function AnalyticsScreen() {
  const { colors, isDark } = useTheme();
  const dynamicStyles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  // Domain data hooks (granular subscription)
  const { tasks, habitLogs, allHabits, tasksReady } = useCoreData();
  const isInitialLoading = !tasksReady && (!tasks || tasks.length === 0);
  const { gymLogs } = useWellnessData();
  const { attendanceLogs } = useAcademicData();

  const [period, setPeriod] = useState<Period>('week');
  const [selectedTaskIdx, setSelectedTaskIdx] = useState<number | null>(null);
  const [selectedHabitIdx, setSelectedHabitIdx] = useState<number | null>(null);
  const [selectedHeatDate, setSelectedHeatDate] = useState<string | null>(null);

  const days = PERIOD_DAYS[period];
  const curStart = daysAgoStr(days - 1);
  const prevStart = daysAgoStr(days * 2 - 1);
  const prevEnd = daysAgoStr(days);

  // ─── Computed Statistics (Hot-Cached) ────────────────────────────────────────
  const stats = useMemo(() => {
    const cacheKey = `analytics_v3_${period}_${generateDatasetFingerprint(tasks)}_${generateDatasetFingerprint(habitLogs)}_${generateDatasetFingerprint(gymLogs)}_${generateDatasetFingerprint(attendanceLogs)}`;
    return computeOrGetHotCache(cacheKey, () => {
      let curTasks = 0;
      let prevTasks = 0;
      let curFocusMins = 0;
      let prevFocusMins = 0;

      for (const t of tasks || []) {
        if (t.status !== 'completed') continue;
        const d = (t.completedAt || t.date || '').slice(0, 10);
        if (d >= curStart) {
          curTasks++;
          curFocusMins += t.actualMinutes || 0;
        } else if (d >= prevStart && d <= prevEnd) {
          prevTasks++;
          prevFocusMins += t.actualMinutes || 0;
        }
      }

      let curHabits = 0;
      let prevHabits = 0;
      for (const l of habitLogs || []) {
        if (l.date >= curStart) curHabits++;
        else if (l.date >= prevStart && l.date <= prevEnd) prevHabits++;
      }

      let curGym = 0;
      let prevGym = 0;
      let curGymVolume = 0;
      let prevGymVolume = 0;

      for (const g of gymLogs || []) {
        let vol = 0;
        for (const ex of g.exercises || []) {
          for (const s of ex.setsLog || ex.sets || []) {
            if (s.completed) vol += (s.weight || 0) * (s.reps || 0);
          }
        }
        if (g.date >= curStart) {
          curGym++;
          curGymVolume += vol;
        } else if (g.date >= prevStart && g.date <= prevEnd) {
          prevGym++;
          prevGymVolume += vol;
        }
      }

      let curAttended = 0;
      let curMissed = 0;
      let prevAttended = 0;
      let prevMissed = 0;

      for (const l of attendanceLogs || []) {
        if (l.date >= curStart) {
          if (l.action === 'attended') curAttended++;
          else if (l.action === 'missed') curMissed++;
        } else if (l.date >= prevStart && l.date <= prevEnd) {
          if (l.action === 'attended') prevAttended++;
          else if (l.action === 'missed') prevMissed++;
        }
      }

      const totalClasses = curAttended + curMissed;
      const attendancePct = totalClasses > 0 ? (curAttended / totalClasses) * 100 : 100;

      // Calculate Bunk Safety Margin (75% threshold)
      let bunkSafetyText = 'All Clear';
      let isBunkSafe = true;

      if (totalClasses > 0) {
        if (attendancePct >= 75) {
          const safeCount = Math.floor((curAttended - 0.75 * totalClasses) / 0.75);
          bunkSafetyText = safeCount > 0 ? `Safe to skip ${safeCount}` : '75% Border';
          isBunkSafe = true;
        } else {
          const needed = Math.ceil((0.75 * totalClasses - curAttended) / 0.25);
          bunkSafetyText = `Attend +${needed}`;
          isBunkSafe = false;
        }
      }

      // Zen Score Formula
      const D = days;
      const targetTasks = D * 3;
      const targetGym = Math.round(D * (4 / 7));
      const targetFocus = D * 30;
      const targetHabits = D * 2;

      const taskScore = Math.min(25, (curTasks / Math.max(1, targetTasks)) * 25);
      const gymScore = targetGym > 0 ? Math.min(30, (curGym / targetGym) * 30) : 30;
      const focusScore = Math.min(25, (curFocusMins / Math.max(1, targetFocus)) * 25);
      const habitScore = Math.min(20, (curHabits / Math.max(1, targetHabits)) * 20);

      let attModifier = 0;
      if (totalClasses > 0) {
        if (attendancePct >= 90) attModifier = 5;
        else if (attendancePct < 60) attModifier = -10;
        else if (attendancePct < 75) attModifier = -5;
      }

      const zenScore = Math.max(0, Math.min(100, Math.round(taskScore + gymScore + focusScore + habitScore + attModifier)));

      // Previous Zen Score
      const prevTotalClasses = prevAttended + prevMissed;
      const prevAttPct = prevTotalClasses > 0 ? (prevAttended / prevTotalClasses) * 100 : 100;
      const prevTaskScore = Math.min(25, (prevTasks / Math.max(1, targetTasks)) * 25);
      const prevGymScore = targetGym > 0 ? Math.min(30, (prevGym / targetGym) * 30) : 30;
      const prevFocusScore = Math.min(25, (prevFocusMins / Math.max(1, targetFocus)) * 25);
      const prevHabitScore = Math.min(20, (prevHabits / Math.max(1, targetHabits)) * 20);
      let prevAttMod = 0;
      if (prevTotalClasses > 0) {
        if (prevAttPct >= 90) prevAttMod = 5;
        else if (prevAttPct < 60) prevAttMod = -10;
        else if (prevAttPct < 75) prevAttMod = -5;
      }
      const prevZen = Math.max(0, Math.min(100, Math.round(prevTaskScore + prevGymScore + prevFocusScore + prevHabitScore + prevAttMod)));

      // Streaks
      const activeDates = new Set<string>();
      for (const t of tasks || []) {
        if (t.status === 'completed' && t.completedAt) activeDates.add(t.completedAt.slice(0, 10));
      }
      for (const g of gymLogs || []) { if (g.date) activeDates.add(g.date); }
      for (const l of habitLogs || []) { if (l.date) activeDates.add(l.date); }

      let bestStreak = 0;
      let currentStreak = 0;
      let run = 0;
      for (let i = 0; i < 90; i++) {
        const d = daysAgoStr(i);
        if (activeDates.has(d)) {
          run++;
          bestStreak = Math.max(bestStreak, run);
          if (i === currentStreak) currentStreak = run;
        } else {
          run = 0;
        }
      }

      // Tier badge classification
      let tierTitle = 'Zen Master';
      let tierColor = '#A599FF';
      if (zenScore >= 90) {
        tierTitle = 'Zen Master';
        tierColor = isDark ? '#A599FF' : '#6C5CE7';
      } else if (zenScore >= 80) {
        tierTitle = 'Peak Flow';
        tierColor = isDark ? '#5EDA9E' : '#059669';
      } else if (zenScore >= 65) {
        tierTitle = 'Momentum';
        tierColor = isDark ? '#89DCEB' : '#0284C7';
      } else {
        tierTitle = 'Recharge';
        tierColor = isDark ? '#FF9F4D' : '#D97706';
      }

      return {
        curTasks,
        prevTasks,
        curHabits,
        curGym,
        curGymVolume,
        prevGymVolume,
        curFocusMins,
        prevFocusMins,
        curAttended,
        curMissed,
        totalClasses,
        attendancePct: Math.round(attendancePct),
        bunkSafetyText,
        isBunkSafe,
        zenScore,
        prevZen,
        bestStreak,
        currentStreak: Math.max(currentStreak, activeDates.has(daysAgoStr(0)) ? 1 : 0),
        tierTitle,
        tierColor,
        // Pillar breakdown percentages
        taskPillar: Math.min(100, Math.round((taskScore / 25) * 100)),
        habitPillar: Math.min(100, Math.round((habitScore / 20) * 100)),
        gymPillar: Math.min(100, Math.round((gymScore / 30) * 100)),
        focusPillar: Math.min(100, Math.round((focusScore / 25) * 100)),
      };
    });
  }, [tasks, habitLogs, gymLogs, attendanceLogs, period, curStart, prevStart, prevEnd, days, isDark]);

  // ─── Task Velocity Data ──────────────────────────────────────────────────────
  const taskChartData = useMemo(() => {
    const taskMap = new Map<string, { count: number; mins: number }>();
    for (const t of tasks || []) {
      if (t.status !== 'completed') continue;
      const d = (t.completedAt || t.date || '').slice(0, 10);
      if (d) {
        const cur = taskMap.get(d) || { count: 0, mins: 0 };
        taskMap.set(d, { count: cur.count + 1, mins: cur.mins + (t.actualMinutes || 0) });
      }
    }

    const n = Math.min(days, 14);
    const step = days <= 7 ? 1 : days <= 30 ? 2 : 7;
    const items: Array<{
      dateStr: string;
      label: string;
      count: number;
      mins: number;
      fullDate: string;
    }> = [];

    for (let i = n - 1; i >= 0; i -= step) {
      const d = daysAgoStr(i);
      const data = taskMap.get(d) || { count: 0, mins: 0 };
      const label = days <= 7 ? formatDateWithDay(d).split(',')[0].slice(0, 3) : d.slice(8);
      items.push({
        dateStr: d,
        label,
        count: data.count,
        mins: data.mins,
        fullDate: formatDateShort(d),
      });
    }
    return items;
  }, [tasks, days]);

  const maxTaskVal = Math.max(...taskChartData.map((d) => d.count), 4);
  const avgTasks = taskChartData.length > 0
    ? (taskChartData.reduce((acc, d) => acc + d.count, 0) / taskChartData.length).toFixed(1)
    : '0';

  // ─── Habit Momentum Spline Area Data ─────────────────────────────────────────
  const habitWaveData = useMemo(() => {
    const habitMap = new Map<string, number>();
    for (const l of habitLogs || []) {
      if (l.date) habitMap.set(l.date, (habitMap.get(l.date) || 0) + 1);
    }

    const activeHabitCount = Math.max((allHabits || []).filter((h) => !h.archived).length, 1);
    const n = Math.min(days, 14);
    const step = days <= 7 ? 1 : days <= 30 ? 2 : 7;
    const items: Array<{
      dateStr: string;
      label: string;
      pct: number;
      fullDate: string;
    }> = [];

    for (let i = n - 1; i >= 0; i -= step) {
      const d = daysAgoStr(i);
      const done = habitMap.get(d) || 0;
      const pct = Math.min(100, Math.round((done / activeHabitCount) * 100));
      const label = days <= 7 ? formatDateWithDay(d).split(',')[0].slice(0, 3) : d.slice(8);
      items.push({
        dateStr: d,
        label,
        pct,
        fullDate: formatDateShort(d),
      });
    }
    return items;
  }, [habitLogs, allHabits, days]);

  const avgHabitPct = habitWaveData.length > 0
    ? Math.round(habitWaveData.reduce((acc, d) => acc + d.pct, 0) / habitWaveData.length)
    : 0;

  // ─── Gym Volume Bar Data ─────────────────────────────────────────────────────
  const gymChartData = useMemo(() => {
    const gymMap = new Map<string, number>();
    for (const g of gymLogs || []) {
      if (!g.date) continue;
      let vol = 0;
      for (const ex of g.exercises || []) {
        for (const s of ex.setsLog || ex.sets || []) {
          if (s.completed) vol += (s.weight || 0) * (s.reps || 0);
        }
      }
      gymMap.set(g.date, (gymMap.get(g.date) || 0) + vol);
    }

    const n = Math.min(days, 14);
    const step = days <= 7 ? 1 : days <= 30 ? 2 : 7;
    const items: Array<{ label: string; volume: number; fullDate: string }> = [];

    for (let i = n - 1; i >= 0; i -= step) {
      const d = daysAgoStr(i);
      const volume = gymMap.get(d) || 0;
      const label = days <= 7 ? formatDateWithDay(d).split(',')[0].slice(0, 3) : d.slice(8);
      items.push({
        label,
        volume,
        fullDate: formatDateShort(d),
      });
    }
    return items;
  }, [gymLogs, days]);

  const maxGymVolume = Math.max(...gymChartData.map((d) => d.volume), 1000);

  // ─── 35-Day Discipline Grid (Heatmap Matrix) ─────────────────────────────────
  const heatmapData = useMemo(() => {
    const taskDates = new Map<string, number>();
    for (const t of tasks || []) {
      if (t.status === 'completed') {
        const d = (t.completedAt || t.date || '').slice(0, 10);
        if (d) taskDates.set(d, (taskDates.get(d) || 0) + 1);
      }
    }

    const gymDates = new Set((gymLogs || []).map((g) => g.date));
    const habitDates = new Map<string, number>();
    for (const l of habitLogs || []) {
      if (l.date) habitDates.set(l.date, (habitDates.get(l.date) || 0) + 1);
    }

    const today = new Date();
    const todayStr = formatLocalDateStr(today);
    const dayOfWeek = (today.getDay() + 6) % 7;
    const currentMonday = new Date(today);
    currentMonday.setDate(today.getDate() - dayOfWeek);

    const startMonday = new Date(currentMonday);
    startMonday.setDate(currentMonday.getDate() - 28);

    const weeksArr = [];
    let activeDaysCount = 0;
    let daysPast = 0;

    for (let w = 0; w < 5; w++) {
      const daysRow = [];
      for (let d = 0; d < 7; d++) {
        const cellDate = new Date(startMonday);
        cellDate.setDate(startMonday.getDate() + (w * 7 + d));
        const dateStr = formatLocalDateStr(cellDate);
        const isToday = dateStr === todayStr;
        const isFuture = dateStr > todayStr;

        const taskCount = taskDates.get(dateStr) || 0;
        const hasGym = gymDates.has(dateStr);
        const habitCount = habitDates.get(dateStr) || 0;
        const totalActivity = taskCount + (hasGym ? 1 : 0) + (habitCount > 0 ? 1 : 0);

        if (!isFuture) {
          daysPast++;
          if (totalActivity > 0) activeDaysCount++;
        }

        daysRow.push({
          dateStr,
          dayNum: cellDate.getDate(),
          isToday,
          isFuture,
          totalActivity,
          taskCount,
          hasGym,
          habitCount,
        });
      }
      weeksArr.push(daysRow);
    }

    return { weeks: weeksArr, activeDaysCount, totalDays: daysPast };
  }, [tasks, gymLogs, habitLogs]);

  const selectedDayInfo = useMemo(() => {
    if (!selectedHeatDate) return null;
    for (const w of heatmapData.weeks) {
      for (const d of w) {
        if (d.dateStr === selectedHeatDate) return d;
      }
    }
    return null;
  }, [selectedHeatDate, heatmapData]);

  // ─── Spacious Single-Ring Geometry (Zero Collisions) ────────────────────────
  // Ring diameter: 190px, Outer radius: 76px, Stroke: 12px
  // Inner diameter is 152px - 24px = 128px! Plenty of space for 48px score + tier badge.
  const RING_BOX = 190;
  const RING_R = 76;
  const RING_CIRC = 2 * Math.PI * RING_R;
  const ringOffset = RING_CIRC - (stats.zenScore / 100) * RING_CIRC;

  // ─── Attendance Circular Gauge Geometry ─────────────────────────────────────
  const GAUGE_BOX = 100;
  const GAUGE_R = 38;
  const GAUGE_CIRC = 2 * Math.PI * GAUGE_R;
  const gaugeOffset = GAUGE_CIRC - (Math.min(100, stats.attendancePct) / 100) * GAUGE_CIRC;

  return (
    <View style={dynamicStyles.root}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      {isDark && (
        <ExpoLinearGradient
          colors={['#100B1E', '#05040A', '#000000']}
          style={StyleSheet.absoluteFillObject}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        />
      )}

      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {/* ── Header ── */}
        <View style={dynamicStyles.headerRow}>
          <View>
            <Text style={dynamicStyles.screenTitle}>Analytics</Text>
            <Text style={dynamicStyles.screenSubtitle}>Telemetry & Performance</Text>
          </View>
          <PeriodSelector value={period} onChange={setPeriod} />
        </View>

        {isInitialLoading ? (
          <ScrollView contentContainerStyle={dynamicStyles.scrollContent} showsVerticalScrollIndicator={false}>
            <AnalyticsSkeleton />
          </ScrollView>
        ) : (
          <ScrollView
            contentContainerStyle={dynamicStyles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* ── 1. HERO ZEN SCORE CARD ── */}
            <View style={dynamicStyles.heroCard}>
              <View style={dynamicStyles.cardHeaderRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="sparkles" size={15} color={colors.accentPrimary} />
                  <Text style={dynamicStyles.cardHeaderTitle}>OVERALL ZEN SCORE</Text>
                </View>
                <DeltaBadge cur={stats.zenScore} prev={stats.prevZen} unit="pts" />
              </View>

              {/* Spacious Progress Ring (Zero Collisions) */}
              <View style={dynamicStyles.ringContainer}>
                <Svg width={RING_BOX} height={RING_BOX} style={{ transform: [{ rotate: '-90deg' }] }}>
                  <Defs>
                    <SvgLinearGradient id="zenRingGrad" x1="0" y1="0" x2="1" y2="1">
                      <Stop offset="0%" stopColor={colors.accentPrimary} />
                      <Stop offset="100%" stopColor={isDark ? colors.accentSecondary : '#0284C7'} />
                    </SvgLinearGradient>
                  </Defs>

                  {/* Background Track */}
                  <Circle
                    cx={RING_BOX / 2}
                    cy={RING_BOX / 2}
                    r={RING_R}
                    stroke={isDark ? 'rgba(255,255,255,0.06)' : colors.border}
                    strokeWidth="12"
                    fill="none"
                  />
                  {/* Glowing Progress Arc */}
                  <Circle
                    cx={RING_BOX / 2}
                    cy={RING_BOX / 2}
                    r={RING_R}
                    stroke="url(#zenRingGrad)"
                    strokeWidth="12.5"
                    fill="none"
                    strokeDasharray={RING_CIRC}
                    strokeDashoffset={ringOffset}
                    strokeLinecap="round"
                  />
                </Svg>

                {/* Center HUD: Ample vertical space, no collisions */}
                <View style={dynamicStyles.ringInnerHud}>
                  <Text style={dynamicStyles.ringScoreText}>{stats.zenScore}</Text>
                  <View style={[dynamicStyles.tierBadge, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)' }]}>
                    <View style={[dynamicStyles.tierDot, { backgroundColor: stats.tierColor }]} />
                    <Text style={[dynamicStyles.tierText, { color: stats.tierColor }]}>
                      {stats.tierTitle}
                    </Text>
                  </View>
                  <Text style={dynamicStyles.ringSubLabel}>OUT OF 100</Text>
                </View>
              </View>

              {/* 4-Pillar Life Balance 2x2 Grid (Spacious & Clean) */}
              <View style={dynamicStyles.pillarsGrid}>
                {/* Pillar 1: Tasks */}
                <View style={dynamicStyles.pillarCell}>
                  <View style={dynamicStyles.pillarHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <Ionicons name="checkbox-outline" size={13} color={colors.accentPrimary} />
                      <Text style={dynamicStyles.pillarLabel}>Tasks</Text>
                    </View>
                    <Text style={dynamicStyles.pillarPct}>{stats.taskPillar}%</Text>
                  </View>
                  <View style={dynamicStyles.pillarTrack}>
                    <View style={[dynamicStyles.pillarFill, { width: `${stats.taskPillar}%`, backgroundColor: colors.accentPrimary }]} />
                  </View>
                </View>

                {/* Pillar 2: Habits */}
                <View style={dynamicStyles.pillarCell}>
                  <View style={dynamicStyles.pillarHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <Ionicons name="flame-outline" size={13} color={isDark ? '#5EDA9E' : '#059669'} />
                      <Text style={dynamicStyles.pillarLabel}>Habits</Text>
                    </View>
                    <Text style={dynamicStyles.pillarPct}>{stats.habitPillar}%</Text>
                  </View>
                  <View style={dynamicStyles.pillarTrack}>
                    <View style={[dynamicStyles.pillarFill, { width: `${stats.habitPillar}%`, backgroundColor: isDark ? '#5EDA9E' : '#059669' }]} />
                  </View>
                </View>

                {/* Pillar 3: Gym */}
                <View style={dynamicStyles.pillarCell}>
                  <View style={dynamicStyles.pillarHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <Ionicons name="barbell-outline" size={13} color={isDark ? '#FF9F4D' : '#D97706'} />
                      <Text style={dynamicStyles.pillarLabel}>Gym</Text>
                    </View>
                    <Text style={dynamicStyles.pillarPct}>{stats.gymPillar}%</Text>
                  </View>
                  <View style={dynamicStyles.pillarTrack}>
                    <View style={[dynamicStyles.pillarFill, { width: `${stats.gymPillar}%`, backgroundColor: isDark ? '#FF9F4D' : '#D97706' }]} />
                  </View>
                </View>

                {/* Pillar 4: Focus */}
                <View style={dynamicStyles.pillarCell}>
                  <View style={dynamicStyles.pillarHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <Ionicons name="timer-outline" size={13} color={isDark ? '#89DCEB' : '#0284C7'} />
                      <Text style={dynamicStyles.pillarLabel}>Focus</Text>
                    </View>
                    <Text style={dynamicStyles.pillarPct}>{stats.focusPillar}%</Text>
                  </View>
                  <View style={dynamicStyles.pillarTrack}>
                    <View style={[dynamicStyles.pillarFill, { width: `${stats.focusPillar}%`, backgroundColor: isDark ? '#89DCEB' : '#0284C7' }]} />
                  </View>
                </View>
              </View>
            </View>

            {/* ── 2. 2x2 HIGH-SIGNAL TELEMETRY GRID ── */}
            <View style={dynamicStyles.statGrid}>
              {/* Tile 1: Tasks Completed */}
              <View style={dynamicStyles.statTile}>
                <View style={dynamicStyles.statTileHeader}>
                  <View style={[dynamicStyles.statIconBox, { backgroundColor: isDark ? 'rgba(165,153,255,0.14)' : 'rgba(108,92,231,0.10)' }]}>
                    <Ionicons name="checkbox" size={17} color={colors.accentPrimary} />
                  </View>
                  <DeltaBadge cur={stats.curTasks} prev={stats.prevTasks} />
                </View>
                <Text style={dynamicStyles.statTileVal}>{stats.curTasks}</Text>
                <Text style={dynamicStyles.statTileLabel}>Tasks Completed</Text>
                <Text style={dynamicStyles.statTileSub}>{avgTasks} daily avg</Text>
              </View>

              {/* Tile 2: Daily Streak */}
              <View style={dynamicStyles.statTile}>
                <View style={dynamicStyles.statTileHeader}>
                  <View style={[dynamicStyles.statIconBox, { backgroundColor: 'rgba(255,159,77,0.15)' }]}>
                    <Ionicons name="flame" size={17} color="#FF9F4D" />
                  </View>
                  <View style={dynamicStyles.subtleTag}>
                    <Text style={dynamicStyles.subtleTagText}>Best {stats.bestStreak}d</Text>
                  </View>
                </View>
                <Text style={dynamicStyles.statTileVal}>{stats.currentStreak}d</Text>
                <Text style={dynamicStyles.statTileLabel}>Daily Streak</Text>
                <Text style={dynamicStyles.statTileSub}>Consistency active</Text>
              </View>

              {/* Tile 3: Class Attendance */}
              <View style={dynamicStyles.statTile}>
                <View style={dynamicStyles.statTileHeader}>
                  <View style={[dynamicStyles.statIconBox, { backgroundColor: stats.isBunkSafe ? 'rgba(94,218,158,0.14)' : 'rgba(255,105,97,0.14)' }]}>
                    <Ionicons name="school" size={17} color={stats.isBunkSafe ? (isDark ? '#5EDA9E' : '#059669') : '#FF6961'} />
                  </View>
                  <View style={[dynamicStyles.subtleTag, { backgroundColor: stats.isBunkSafe ? (isDark ? 'rgba(94,218,158,0.12)' : 'rgba(5,150,105,0.08)') : 'rgba(255,105,97,0.12)' }]}>
                    <Text style={[dynamicStyles.subtleTagText, { color: stats.isBunkSafe ? (isDark ? '#5EDA9E' : '#059669') : '#FF6961' }]}>
                      {stats.isBunkSafe ? 'Safe' : 'Risk'}
                    </Text>
                  </View>
                </View>
                <Text style={dynamicStyles.statTileVal}>{stats.attendancePct}%</Text>
                <Text style={dynamicStyles.statTileLabel}>Class Attendance</Text>
                <Text style={[dynamicStyles.statTileSub, { color: stats.isBunkSafe ? (isDark ? '#5EDA9E' : '#059669') : '#FF6961' }]}>
                  {stats.bunkSafetyText}
                </Text>
              </View>

              {/* Tile 4: Deep Work Focus */}
              <View style={dynamicStyles.statTile}>
                <View style={dynamicStyles.statTileHeader}>
                  <View style={[dynamicStyles.statIconBox, { backgroundColor: 'rgba(137,220,235,0.14)' }]}>
                    <Ionicons name="timer" size={17} color={isDark ? '#89DCEB' : '#0284C7'} />
                  </View>
                  <DeltaBadge cur={stats.curFocusMins} prev={stats.prevFocusMins} />
                </View>
                <Text style={dynamicStyles.statTileVal}>
                  {stats.curFocusMins >= 60
                    ? `${Math.floor(stats.curFocusMins / 60)}h ${stats.curFocusMins % 60}m`
                    : `${stats.curFocusMins}m`}
                </Text>
                <Text style={dynamicStyles.statTileLabel}>Deep Work Focus</Text>
                <Text style={dynamicStyles.statTileSub}>Logged session time</Text>
              </View>
            </View>

            {/* ── 3. INTERACTIVE TASK VELOCITY CHART ── */}
            <View style={dynamicStyles.chartCard}>
              <View style={dynamicStyles.chartHeaderRow}>
                <View>
                  <Text style={dynamicStyles.chartTitle}>Task Velocity</Text>
                  <Text style={dynamicStyles.chartSub}>Daily completions • Avg {avgTasks}/day</Text>
                </View>
                {selectedTaskIdx !== null ? (
                  <View style={dynamicStyles.tooltipPill}>
                    <Text style={dynamicStyles.tooltipText}>
                      {taskChartData[selectedTaskIdx].fullDate}: {taskChartData[selectedTaskIdx].count} tasks
                    </Text>
                  </View>
                ) : (
                  <View style={dynamicStyles.legendBadge}>
                    <View style={[dynamicStyles.legendDot, { backgroundColor: colors.accentPrimary }]} />
                    <Text style={dynamicStyles.legendLabel}>Completed</Text>
                  </View>
                )}
              </View>

              {/* Capsule Bar Chart with Grounded Baseline */}
              <View style={dynamicStyles.barChartBox}>
                {/* Horizontal Average Guideline */}
                {parseFloat(avgTasks) > 0 && (
                  <View
                    style={[
                      dynamicStyles.avgGuideline,
                      { bottom: `${Math.min(90, (parseFloat(avgTasks) / maxTaskVal) * 85)}%` },
                    ]}
                  />
                )}

                <View style={dynamicStyles.barsRow}>
                  {taskChartData.map((d, i) => {
                    const isSelected = selectedTaskIdx === i;
                    const barHeightPct = Math.max(8, (d.count / maxTaskVal) * 100);
                    return (
                      <Pressable
                        key={i}
                        style={dynamicStyles.barColumnTouch}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setSelectedTaskIdx(isSelected ? null : i);
                        }}
                      >
                        <View style={dynamicStyles.barTrack}>
                          <View
                            style={[
                              dynamicStyles.capsuleBar,
                              {
                                height: `${barHeightPct}%`,
                                backgroundColor: isSelected
                                  ? (isDark ? '#FFFFFF' : '#000000')
                                  : colors.accentPrimary,
                                opacity: selectedTaskIdx !== null && !isSelected ? 0.35 : 1,
                              },
                            ]}
                          />
                        </View>
                        <Text style={[dynamicStyles.barAxisLabel, isSelected && { color: colors.textPrimary, fontFamily: FONT_FAMILY.bold }]}>
                          {d.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </View>

            {/* ── 4. HABIT MOMENTUM SPLINE AREA WAVE ── */}
            <View style={dynamicStyles.chartCard}>
              <View style={dynamicStyles.chartHeaderRow}>
                <View>
                  <Text style={dynamicStyles.chartTitle}>Habit Momentum</Text>
                  <Text style={dynamicStyles.chartSub}>Daily check-in consistency • {avgHabitPct}% Avg</Text>
                </View>
                {selectedHabitIdx !== null ? (
                  <View style={[dynamicStyles.tooltipPill, { backgroundColor: isDark ? 'rgba(94,218,158,0.16)' : 'rgba(5,150,105,0.10)' }]}>
                    <Text style={[dynamicStyles.tooltipText, { color: isDark ? '#5EDA9E' : '#059669' }]}>
                      {habitWaveData[selectedHabitIdx].fullDate}: {habitWaveData[selectedHabitIdx].pct}%
                    </Text>
                  </View>
                ) : (
                  <View style={[dynamicStyles.subtleTag, { backgroundColor: isDark ? 'rgba(94,218,158,0.12)' : 'rgba(5,150,105,0.08)' }]}>
                    <Text style={[dynamicStyles.subtleTagText, { color: isDark ? '#5EDA9E' : '#059669' }]}>
                      {avgHabitPct >= 75 ? 'Strong Cadence' : 'Building Habit'}
                    </Text>
                  </View>
                )}
              </View>

              {/* Smooth Curved SVG Spline Wave */}
              {habitWaveData.length >= 2 ? (
                <View style={{ marginTop: 8 }}>
                  <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
                    <Defs>
                      <SvgLinearGradient id="habitWaveGrad" x1="0" y1="0" x2="0" y2="1">
                        <Stop offset="0%" stopColor={isDark ? '#5EDA9E' : '#059669'} stopOpacity={isDark ? '0.35' : '0.22'} />
                        <Stop offset="100%" stopColor={isDark ? '#5EDA9E' : '#059669'} stopOpacity="0" />
                      </SvgLinearGradient>
                    </Defs>

                    {/* Horizontal Guidelines */}
                    {[0.25, 0.5, 0.75, 1].map((f, i) => (
                      <Line
                        key={i}
                        x1={0}
                        y1={CHART_HEIGHT * (1 - f)}
                        x2={CHART_WIDTH}
                        y2={CHART_HEIGHT * (1 - f)}
                        stroke={isDark ? 'rgba(255,255,255,0.05)' : colors.border}
                        strokeWidth="1"
                        strokeDasharray="4 4"
                      />
                    ))}

                    {/* Spline Path Calculations */}
                    {(() => {
                      const padX = 14;
                      const padY = 14;
                      const stepX = (CHART_WIDTH - padX * 2) / Math.max(1, habitWaveData.length - 1);
                      const points = habitWaveData.map((d, idx) => ({
                        x: padX + idx * stepX,
                        y: (CHART_HEIGHT - padY) - (d.pct / 100) * (CHART_HEIGHT - padY * 2),
                      }));
                      const curvePath = generateSplinePath(points);
                      const areaPath = `${curvePath} L ${points[points.length - 1].x.toFixed(1)} ${CHART_HEIGHT} L ${points[0].x.toFixed(1)} ${CHART_HEIGHT} Z`;

                      return (
                        <>
                          <Path d={areaPath} fill="url(#habitWaveGrad)" />
                          <Path
                            d={curvePath}
                            fill="none"
                            stroke={isDark ? '#5EDA9E' : '#059669'}
                            strokeWidth="2.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          {points.map((p, idx) => {
                            const isSelected = selectedHabitIdx === idx;
                            return (
                              <Circle
                                key={idx}
                                cx={p.x}
                                cy={p.y}
                                r={isSelected ? 6 : 3.5}
                                fill={isSelected ? '#FFFFFF' : (isDark ? '#5EDA9E' : '#059669')}
                                stroke={isDark ? '#000000' : '#FFFFFF'}
                                strokeWidth="2"
                              />
                            );
                          })}
                        </>
                      );
                    })()}
                  </Svg>

                  {/* Dedicated Day Labels Row (Zero Collisions with Wave) */}
                  <View style={dynamicStyles.chartLabelsRow}>
                    {habitWaveData.map((d, idx) => (
                      <Pressable
                        key={idx}
                        style={dynamicStyles.labelColTouch}
                        onPress={() => {
                          Haptics.selectionAsync();
                          setSelectedHabitIdx(selectedHabitIdx === idx ? null : idx);
                        }}
                      >
                        <Text style={[dynamicStyles.barAxisLabel, selectedHabitIdx === idx && { color: colors.textPrimary, fontFamily: FONT_FAMILY.bold }]}>
                          {d.label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : (
                <View style={dynamicStyles.emptyChartBox}>
                  <Text style={dynamicStyles.emptyChartText}>Log habits to visualize continuity wave</Text>
                </View>
              )}
            </View>

            {/* ── 5. ACADEMIC ATTENDANCE SAFETY CARD ── */}
            <View style={dynamicStyles.chartCard}>
              <View style={dynamicStyles.chartHeaderRow}>
                <View>
                  <Text style={dynamicStyles.chartTitle}>Class Attendance Safety</Text>
                  <Text style={dynamicStyles.chartSub}>75% university requirement tracker</Text>
                </View>
                <View style={[dynamicStyles.subtleTag, { backgroundColor: stats.isBunkSafe ? (isDark ? 'rgba(94,218,158,0.12)' : 'rgba(5,150,105,0.08)') : 'rgba(255,105,97,0.12)' }]}>
                  <Ionicons
                    name={stats.isBunkSafe ? 'shield-checkmark' : 'alert-circle'}
                    size={12}
                    color={stats.isBunkSafe ? (isDark ? '#5EDA9E' : '#059669') : '#FF6961'}
                  />
                  <Text style={[dynamicStyles.subtleTagText, { color: stats.isBunkSafe ? (isDark ? '#5EDA9E' : '#059669') : '#FF6961' }]}>
                    {stats.bunkSafetyText}
                  </Text>
                </View>
              </View>

              {/* Attendance Safety Telemetry Layout */}
              <View style={dynamicStyles.attendanceContentRow}>
                {/* Circular Gauge Arc */}
                <View style={dynamicStyles.gaugeContainer}>
                  <Svg width={GAUGE_BOX} height={GAUGE_BOX} style={{ transform: [{ rotate: '-90deg' }] }}>
                    <Circle
                      cx={GAUGE_BOX / 2}
                      cy={GAUGE_BOX / 2}
                      r={GAUGE_R}
                      stroke={isDark ? 'rgba(255,255,255,0.06)' : colors.border}
                      strokeWidth="9"
                      fill="none"
                    />
                    <Circle
                      cx={GAUGE_BOX / 2}
                      cy={GAUGE_BOX / 2}
                      r={GAUGE_R}
                      stroke={stats.isBunkSafe ? (isDark ? '#5EDA9E' : '#059669') : '#FF6961'}
                      strokeWidth="9.5"
                      fill="none"
                      strokeDasharray={GAUGE_CIRC}
                      strokeDashoffset={gaugeOffset}
                      strokeLinecap="round"
                    />
                  </Svg>
                  <View style={dynamicStyles.gaugeInnerLabel}>
                    <Text style={dynamicStyles.gaugeScoreText}>{stats.attendancePct}%</Text>
                    <Text style={dynamicStyles.gaugeSubText}>Current</Text>
                  </View>
                </View>

                {/* Status Breakdown Metrics */}
                <View style={dynamicStyles.attendanceMetricsCol}>
                  <View style={dynamicStyles.attMetricRow}>
                    <View style={[dynamicStyles.attDot, { backgroundColor: isDark ? '#5EDA9E' : '#059669' }]} />
                    <Text style={dynamicStyles.attMetricLabel}>Classes Attended</Text>
                    <Text style={dynamicStyles.attMetricValue}>{stats.curAttended}</Text>
                  </View>

                  <View style={dynamicStyles.attMetricRow}>
                    <View style={[dynamicStyles.attDot, { backgroundColor: isDark ? '#FF6961' : '#DC2626' }]} />
                    <Text style={dynamicStyles.attMetricLabel}>Classes Missed</Text>
                    <Text style={dynamicStyles.attMetricValue}>{stats.curMissed}</Text>
                  </View>

                  <View style={dynamicStyles.attMetricRow}>
                    <View style={[dynamicStyles.attDot, { backgroundColor: colors.accentSecondary }]} />
                    <Text style={dynamicStyles.attMetricLabel}>Target Threshold</Text>
                    <Text style={dynamicStyles.attMetricValue}>75%</Text>
                  </View>

                  <View style={dynamicStyles.attProgressTrack}>
                    <View
                      style={[
                        dynamicStyles.attProgressFill,
                        {
                          width: `${Math.min(100, stats.attendancePct)}%`,
                          backgroundColor: stats.isBunkSafe ? (isDark ? '#5EDA9E' : '#059669') : '#FF6961',
                        },
                      ]}
                    />
                    <View style={dynamicStyles.attThresholdMarker} />
                  </View>
                </View>
              </View>
            </View>

            {/* ── 6. GYM PHYSICAL VITALITY CARD ── */}
            <View style={dynamicStyles.chartCard}>
              <View style={dynamicStyles.chartHeaderRow}>
                <View>
                  <Text style={dynamicStyles.chartTitle}>Workout Output</Text>
                  <Text style={dynamicStyles.chartSub}>
                    {stats.curGym} sessions • {stats.curGymVolume >= 1000 ? `${(stats.curGymVolume / 1000).toFixed(1)}k kg` : `${stats.curGymVolume} kg`} tonnage
                  </Text>
                </View>
                <DeltaBadge cur={stats.curGymVolume} prev={stats.prevGymVolume} />
              </View>

              {/* Gym Volume Bars sitting on Grounded Baseline */}
              <View style={dynamicStyles.barChartBox}>
                <View style={dynamicStyles.barsRow}>
                  {gymChartData.map((d, i) => {
                    const barHeightPct = Math.max(6, (d.volume / maxGymVolume) * 100);
                    return (
                      <View key={i} style={dynamicStyles.barColumnTouch}>
                        <View style={dynamicStyles.barTrack}>
                          <View
                            style={[
                              dynamicStyles.capsuleBar,
                              {
                                height: `${barHeightPct}%`,
                                backgroundColor: isDark ? '#89DCEB' : '#0284C7',
                                opacity: d.volume > 0 ? 1 : 0.25,
                              },
                            ]}
                          />
                        </View>
                        <Text style={dynamicStyles.barAxisLabel}>{d.label}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            </View>

            {/* ── 7. 35-DAY DISCIPLINE GRID (ACTIVITY HEATMAP) ── */}
            <View style={dynamicStyles.chartCard}>
              <View style={dynamicStyles.chartHeaderRow}>
                <View>
                  <Text style={dynamicStyles.chartTitle}>35-Day Discipline Grid</Text>
                  <Text style={dynamicStyles.chartSub}>
                    {heatmapData.activeDaysCount} of {heatmapData.totalDays} Days Active ({heatmapData.totalDays > 0 ? Math.round((heatmapData.activeDaysCount / heatmapData.totalDays) * 100) : 0}%)
                  </Text>
                </View>
                <View style={[dynamicStyles.subtleTag, { backgroundColor: isDark ? 'rgba(165,153,255,0.12)' : 'rgba(108,92,231,0.08)' }]}>
                  <Ionicons name="calendar-outline" size={12} color={colors.accentPrimary} />
                  <Text style={[dynamicStyles.subtleTagText, { color: colors.accentPrimary }]}>5 Weeks</Text>
                </View>
              </View>

              {/* Day Headers */}
              <View style={dynamicStyles.heatHeaderRow}>
                {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                  <View key={i} style={dynamicStyles.heatHeaderCol}>
                    <Text style={dynamicStyles.heatHeaderText}>{d}</Text>
                  </View>
                ))}
              </View>

              {/* 5 Rows of 7 Tiles */}
              <View style={{ gap: 6 }}>
                {heatmapData.weeks.map((week, wIdx) => (
                  <View key={wIdx} style={dynamicStyles.heatWeekRow}>
                    {week.map((item, dIdx) => {
                      if (item.isFuture) {
                        return (
                          <View key={dIdx} style={dynamicStyles.futureHeatCell}>
                            <Text style={dynamicStyles.futureHeatCellText}>{item.dayNum}</Text>
                          </View>
                        );
                      }

                      // Graduated 4-level color tiers
                      let bg = isDark ? 'rgba(255,255,255,0.04)' : '#F0EFF7';
                      let borderColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)';
                      let textColor = colors.textMuted;

                      if (item.totalActivity === 1) {
                        bg = isDark ? 'rgba(165,153,255,0.26)' : 'rgba(108,92,231,0.20)';
                        borderColor = isDark ? 'rgba(165,153,255,0.40)' : 'rgba(108,92,231,0.30)';
                        textColor = isDark ? '#C7BEFF' : '#5E48E8';
                      } else if (item.totalActivity === 2) {
                        bg = isDark ? 'rgba(165,153,255,0.58)' : 'rgba(108,92,231,0.50)';
                        borderColor = isDark ? 'rgba(165,153,255,0.70)' : 'rgba(108,92,231,0.60)';
                        textColor = '#FFFFFF';
                      } else if (item.totalActivity >= 3) {
                        bg = colors.accentPrimary;
                        borderColor = colors.accentPrimary;
                        textColor = isDark ? '#000000' : '#FFFFFF';
                      }

                      const isSelected = selectedHeatDate === item.dateStr;

                      return (
                        <TouchableOpacity
                          key={dIdx}
                          style={[
                            dynamicStyles.activeHeatCell,
                            {
                              backgroundColor: bg,
                              borderColor: isSelected
                                ? (isDark ? '#FFFFFF' : '#000000')
                                : (item.isToday ? colors.accentPrimary : borderColor),
                              borderWidth: isSelected || item.isToday ? 2 : 1,
                            },
                          ]}
                          onPress={() => {
                            Haptics.selectionAsync();
                            setSelectedHeatDate(isSelected ? null : item.dateStr);
                          }}
                          activeOpacity={0.75}
                        >
                          <Text style={[dynamicStyles.activeHeatCellText, { color: textColor }]}>
                            {item.dayNum}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ))}
              </View>

              {/* Tapped Day HUD Inspection Pill */}
              {selectedDayInfo && (
                <View style={dynamicStyles.heatDetailHud}>
                  <Text style={dynamicStyles.heatDetailDate}>{formatDateWithDay(selectedDayInfo.dateStr)}</Text>
                  <View style={dynamicStyles.heatDetailBadgesRow}>
                    <View style={dynamicStyles.heatDetailChip}>
                      <Ionicons name="checkbox" size={12} color={colors.accentPrimary} />
                      <Text style={dynamicStyles.heatDetailChipText}>{selectedDayInfo.taskCount} Tasks</Text>
                    </View>
                    <View style={dynamicStyles.heatDetailChip}>
                      <Ionicons name="barbell" size={12} color={isDark ? '#FF9F4D' : '#D97706'} />
                      <Text style={dynamicStyles.heatDetailChipText}>{selectedDayInfo.hasGym ? 'Gym Logged' : 'Rest'}</Text>
                    </View>
                    <View style={dynamicStyles.heatDetailChip}>
                      <Ionicons name="flame" size={12} color={isDark ? '#5EDA9E' : '#059669'} />
                      <Text style={dynamicStyles.heatDetailChipText}>{selectedDayInfo.habitCount} Habits</Text>
                    </View>
                  </View>
                </View>
              )}

              {/* Legend Row */}
              <View style={dynamicStyles.heatLegendRow}>
                <Text style={dynamicStyles.heatLegendLabel}>Less</Text>
                {[
                  isDark ? 'rgba(255,255,255,0.04)' : '#F0EFF7',
                  isDark ? 'rgba(165,153,255,0.26)' : 'rgba(108,92,231,0.20)',
                  isDark ? 'rgba(165,153,255,0.58)' : 'rgba(108,92,231,0.50)',
                  colors.accentPrimary,
                ].map((c, idx) => (
                  <View key={idx} style={[dynamicStyles.legendSquare, { backgroundColor: c }]} />
                ))}
                <Text style={dynamicStyles.heatLegendLabel}>More</Text>
              </View>
            </View>

            <View style={{ height: 110 }} />
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}

// ─── Stylesheet ────────────────────────────────────────────────────────────────
const makeStyles = (colors: any, isDark: boolean) => StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: isDark ? '#000000' : colors.background,
  },

  // Header Row
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: CARD_MARGIN,
    paddingTop: SPACE.md,
    paddingBottom: SPACE.sm,
  },
  screenTitle: {
    fontFamily: FONT_FAMILY.title,
    fontSize: 27,
    color: colors.textPrimary,
    letterSpacing: -0.4,
  },
  screenSubtitle: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 1,
  },

  // Scroll Content
  scrollContent: {
    paddingTop: 4,
    paddingBottom: 120,
  },

  // Hero Card
  heroCard: {
    marginHorizontal: CARD_MARGIN,
    backgroundColor: isDark ? '#0A0812' : '#FFFFFF',
    borderRadius: 24,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.06)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: isDark ? 0.45 : 0.05,
    shadowRadius: 14,
    elevation: 4,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardHeaderTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 11,
    color: colors.textMuted,
    letterSpacing: 0.9,
  },

  // Ring & Center HUD
  ringContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 10,
  },
  ringInnerHud: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringScoreText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 48,
    color: colors.textPrimary,
    letterSpacing: -1.2,
    lineHeight: 52,
  },
  tierBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    marginTop: 3,
  },
  tierDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  tierText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 11.5,
    letterSpacing: 0.3,
  },
  ringSubLabel: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 9.5,
    color: colors.textTertiary,
    letterSpacing: 1.2,
    marginTop: 4,
  },

  // 4-Pillar Life Balance 2x2 Grid
  pillarsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
  },
  pillarCell: {
    width: (SCREEN_WIDTH - CARD_MARGIN * 2 - CARD_PAD * 2 - 12) / 2,
  },
  pillarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  pillarLabel: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 11.5,
    color: colors.textMuted,
  },
  pillarPct: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 11.5,
    color: colors.textPrimary,
  },
  pillarTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
    overflow: 'hidden',
  },
  pillarFill: {
    height: '100%',
    borderRadius: 3,
  },

  // 2x2 Telemetry Grid
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: CARD_MARGIN,
    marginBottom: 14,
  },
  statTile: {
    width: (SCREEN_WIDTH - CARD_MARGIN * 2 - 10) / 2,
    backgroundColor: isDark ? '#0C0A14' : '#FFFFFF',
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: isDark ? 0.3 : 0.03,
    shadowRadius: 6,
    elevation: 2,
  },
  statTileHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  statIconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statTileVal: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 23,
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  statTileLabel: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  statTileSub: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 10.5,
    color: colors.textTertiary,
    marginTop: 2,
  },

  // Standard Chart Card
  chartCard: {
    marginHorizontal: CARD_MARGIN,
    backgroundColor: isDark ? '#0C0A14' : '#FFFFFF',
    borderRadius: 22,
    padding: CARD_PAD,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: isDark ? 0.35 : 0.04,
    shadowRadius: 10,
    elevation: 3,
  },
  chartHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  chartTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 16,
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },
  chartSub: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 11.5,
    color: colors.textMuted,
    marginTop: 2,
  },

  // Bar Chart Layout
  barChartBox: {
    height: CHART_HEIGHT,
    position: 'relative',
    marginTop: 6,
    borderBottomWidth: 1,
    borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
    paddingBottom: 4,
  },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: '100%',
  },
  barColumnTouch: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  barTrack: {
    flex: 1,
    width: '100%',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  capsuleBar: {
    width: 14,
    borderRadius: 7,
  },
  barAxisLabel: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 6,
  },
  avgGuideline: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    borderWidth: 0.8,
    borderColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)',
    borderStyle: 'dashed',
    zIndex: 1,
  },

  // Wave Chart Dedicated Labels Row
  chartLabelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingHorizontal: 2,
  },
  labelColTouch: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 2,
  },
  emptyChartBox: {
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyChartText: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 12,
    color: colors.textMuted,
  },

  // Attendance Card Layout
  attendanceContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 6,
  },
  gaugeContainer: {
    width: 100,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gaugeInnerLabel: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gaugeScoreText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 22,
    color: colors.textPrimary,
    letterSpacing: -0.4,
  },
  gaugeSubText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 10,
    color: colors.textMuted,
  },
  attendanceMetricsCol: {
    flex: 1,
    gap: 7,
  },
  attMetricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  attDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    marginRight: 6,
  },
  attMetricLabel: {
    flex: 1,
    fontFamily: FONT_FAMILY.medium,
    fontSize: 12,
    color: colors.textMuted,
  },
  attMetricValue: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 13,
    color: colors.textPrimary,
  },
  attProgressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
    marginTop: 6,
    overflow: 'hidden',
    position: 'relative',
  },
  attProgressFill: {
    height: '100%',
    borderRadius: 3,
  },
  attThresholdMarker: {
    position: 'absolute',
    left: '75%',
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: isDark ? '#FFFFFF' : '#000000',
    opacity: 0.4,
  },

  // Heatmap Matrix
  heatHeaderRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  heatHeaderCol: {
    flex: 1,
    alignItems: 'center',
  },
  heatHeaderText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 11,
    color: colors.textMuted,
  },
  heatWeekRow: {
    flexDirection: 'row',
    gap: 6,
  },
  futureHeatCell: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 8,
    backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  futureHeatCellText: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 10,
    color: colors.textTertiary,
    opacity: 0.35,
  },
  activeHeatCell: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeHeatCellText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 10.5,
  },
  heatDetailHud: {
    marginTop: 12,
    padding: 10,
    borderRadius: 12,
    backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
  },
  heatDetailDate: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 11.5,
    color: colors.textPrimary,
    marginBottom: 6,
  },
  heatDetailBadgesRow: {
    flexDirection: 'row',
    gap: 8,
  },
  heatDetailChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  heatDetailChipText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 11,
    color: colors.textMuted,
  },
  heatLegendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
  },
  heatLegendLabel: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 10.5,
    color: colors.textMuted,
    marginHorizontal: 2,
  },
  legendSquare: {
    width: 10,
    height: 10,
    borderRadius: 2.5,
  },

  // Pills, Badges & Tooltips
  subtleTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
    backgroundColor: isDark ? 'rgba(255,255,255,0.07)' : '#F0EFF7',
  },
  subtleTagText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 10,
    color: colors.textMuted,
  },
  tooltipPill: {
    backgroundColor: isDark ? 'rgba(165,153,255,0.18)' : 'rgba(108,92,231,0.12)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  tooltipText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 11,
    color: colors.accentPrimary,
  },
  legendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  legendLabel: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 10.5,
    color: colors.textMuted,
  },
});
