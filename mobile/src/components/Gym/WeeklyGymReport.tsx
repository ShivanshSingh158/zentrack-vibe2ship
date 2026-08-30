/**
 * WeeklyGymReport • ZenTrack Mobile
 * Shown on rest days (e.g. Sunday) as the full-week workout analytics dashboard.
 * Displays:
 *  - Dynamic muscle target completion rings (done / planned sets)
 *  - Global weekly KPIs (Sessions, Total Sets, Volume) with WoW deltas
 *  - Volume Trend Line (this week vs last week SVG overlay)
 *  - Strength Progression sparklines (est. 1RM for top 4 lifts, 4-week trend)
 *  - Muscle Distribution donut chart
 *  - Weekly Highlights & Top Lifts
 *  - Cardio & Conditioning recap
 *  - 90-day Consistency Heatmap (4-level intensity gradient)
 *  - Untrained muscle balance alert
 *  - GYM-GPT Weekly Intelligence (fixed: robust JSON, pre-computed stats, retry)
 *
 * Theme: Obsidian Cosmos • COLORS tokens only.
 */

import React, { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, LayoutAnimation, Image } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, RADIUS, FONT_FAMILY, FONT_SIZE } from '../../theme/tokens';
import { useTheme } from '../../contexts/ThemeContext';
import { canonicalizeMuscle, isValidWorkoutSession } from '../../utils/gymUtils';
import { hapticLight, hapticMedium } from '../../utils/haptics';
import { GYM_PLAN } from '../../data/gymPlan';
import VolumeTrendLine from './Charts/VolumeTrendLine';
import StrengthProgressionChart from './Charts/StrengthProgressionChart';
import type { ExerciseSpark } from './Charts/StrengthProgressionChart';
import EffortDistributionCard from './Charts/EffortDistributionCard';
import ExerciseDeepDiveModal from './ExerciseDeepDiveModal';
import ConsistencyHeatmap from './Charts/ConsistencyHeatmap';
import AnatomicalBodyMapCard from './AnatomicalBodyMapCard';
import WeeklyReportSkeleton from './WeeklyReportSkeleton';
import {
  getOrGenerateWeeklyGymAnalysis,
  getCachedWeeklyGymAnalysis,
  getWeekMondayStr,
  WeeklyGymAnalysis,
  PrecomputedGymStats,
  epley1RM,
} from '../../services/weeklyGymAnalysisEngine';
import type { GymDayLog, GymPlanDay, UserGymPlanDoc } from '../../types/gym.types';
import { makeStyles } from './weeklyGymReportStyles';



// ── Types ────────────────────────────────────────────────────────────────────

interface Props {
  gymLogs: Array<GymDayLog | any>;
  /** ISO date string of the week being viewed (any day in that week, YYYY-MM-DD) */
  weekAnchorDate: string;
  userGymPlan?: UserGymPlanDoc | any | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Returns all 7 YYYY-MM-DD strings for the week containing anchorDate (Mon–Sun). */
function getWeekRange(anchor: string): string[] {
  const [y, m, day] = anchor.split('-').map(Number);
  const d = new Date(y, m - 1, day);
  const dow = d.getDay(); // 0=Sun
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((dow + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const dt = new Date(monday);
    dt.setDate(monday.getDate() + i);
    return localDateStr(dt);
  });
}

/** Returns the previous week's date range. */
function getPrevWeekRange(anchor: string): string[] {
  const [y, m, day] = anchor.split('-').map(Number);
  const d = new Date(y, m - 1, day);
  d.setDate(d.getDate() - 7);
  return getWeekRange(localDateStr(d));
}

const MUSCLE_COLORS: Record<string, string> = {
  Chest:      '#a599ff', // accent purple
  Back:       '#89dceb', // accent blue
  Shoulders:  '#ff9f4d', // amber
  Triceps:    '#5eda9e', // green
  Biceps:     '#b8afff', // accent light
  Quads:      '#ff9f4d', // amber
  Hamstrings: '#89dceb', // blue
  Calves:     '#5eda9e', // green
  Abs:        '#a599ff', // purple
  Forearms:   '#ff9f4d', // amber
  Glutes:     '#a599ff', // purple
  Traps:      '#89dceb', // blue
  Mixed:      '#8e8e93', // muted
};

// ── Formatted Text Component (Parses **bold** into native bold font) ─────────

function FormattedText({
  text,
  style,
  boldColor,
}: {
  text?: string;
  style?: any;
  boldColor?: string;
}) {
  if (!text) return null;
  // Splits by **...** markers
  const segments = text.split(/(\*\*[^*]+\*\*)/g);

  return (
    <Text style={style}>
      {segments.map((seg, idx) => {
        if (seg.startsWith('**') && seg.endsWith('**') && seg.length > 4) {
          const inner = seg.slice(2, -2);
          return (
            <Text
              key={idx}
              style={{
                fontFamily: FONT_FAMILY.bold,
                fontWeight: '700',
                color: boldColor || COLORS.textPrimary,
              }}
            >
              {inner}
            </Text>
          );
        }
        return <Text key={idx}>{seg}</Text>;
      })}
    </Text>
  );
}

// ── Donut Ring Component ─────────────────────────────────────────────────────

function DonutRing({
  pct,
  color,
  size = 66,
  strokeWidth = 6.5,
}: {
  pct: number;
  color: string;
  size?: number;
  strokeWidth?: number;
}) {
  const { isDark } = useTheme();
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const clampedPct = Math.min(100, Math.max(0, pct));
  const filled = (clampedPct / 100) * circ;
  const center = size / 2;
  const isComplete = clampedPct >= 100;

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Background Track */}
      <Circle
        cx={center}
        cy={center}
        r={r}
        stroke={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}
        strokeWidth={strokeWidth}
        fill="none"
      />
      {/* Filled Arc */}
      {filled > 0 && (
        <G rotation="-90" origin={`${center},${center}`}>
          <Circle
            cx={center}
            cy={center}
            r={r}
            stroke={isComplete ? (color === '#8e8e93' ? (isDark ? '#5EDA9E' : '#059669') : color) : color}
            strokeWidth={strokeWidth}
            fill="none"
            strokeDasharray={`${filled} ${circ - filled}`}
            strokeLinecap="round"
          />
        </G>
      )}
    </Svg>
  );
}

// ── Change Delta Badge ───────────────────────────────────────────────────────

function ChangeBadge({ delta, unit = '' }: { delta: number; unit?: string }) {
  const { colors, isDark } = useTheme();
  const st = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  if (delta === 0) return <Text style={st.changeBadgeNeutral}>• no change</Text>;
  const isPositive = delta > 0;
  return (
    <Text style={[st.changeBadge, { color: isPositive ? (isDark ? '#5EDA9E' : '#059669') : (isDark ? '#FF4C4C' : '#DC2626') }]}>
      {isPositive ? '▲ +' : '▼ -'}{Math.abs(delta)}{unit}
    </Text>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function WeeklyGymReport({ gymLogs, weekAnchorDate, userGymPlan }: Props) {
  const { colors, isDark } = useTheme();
  const st = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const weekDates = useMemo(() => getWeekRange(weekAnchorDate), [weekAnchorDate]);
  const prevDates = useMemo(() => getPrevWeekRange(weekAnchorDate), [weekAnchorDate]);

  const weekLogs = useMemo(
    () => gymLogs.filter(l => weekDates.includes(l.date)),
    [gymLogs, weekDates],
  );
  const prevLogs = useMemo(
    () => gymLogs.filter(l => prevDates.includes(l.date)),
    [gymLogs, prevDates],
  );

  // ── Compute Weekly Target Sets from Active Routine ─────────────────────────
  const plannedMuscleTargets = useMemo(() => {
    const targets: Record<string, number> = {};
    const daysIndices = [1, 2, 3, 4, 5, 6, 7];

    daysIndices.forEach(dayIdx => {
      const planDay: GymPlanDay | undefined =
        userGymPlan?.customDays?.[dayIdx] || GYM_PLAN.find(p => p.dayIndex === dayIdx);

      if (planDay && !planDay.isRest && planDay.exercises) {
        planDay.exercises.forEach(ex => {
          const m = canonicalizeMuscle(ex.muscle);
          const sets = ex.targetSets || 3;
          targets[m] = (targets[m] || 0) + sets;
        });
      }
    });

    return targets;
  }, [userGymPlan]);

  // Total planned workout days in weekly routine
  const plannedWorkoutDaysCount = useMemo(() => {
    const daysIndices = [1, 2, 3, 4, 5, 6, 7];
    let count = 0;
    daysIndices.forEach(dayIdx => {
      const planDay: GymPlanDay | undefined =
        userGymPlan?.customDays?.[dayIdx] || GYM_PLAN.find(p => p.dayIndex === dayIdx);
      if (planDay && !planDay.isRest) count++;
    });
    return Math.max(1, count);
  }, [userGymPlan]);

  // ── Compute Actual Logged Muscle Stats ─────────────────────────────────────
  interface MuscleStats {
    sets: number;
    totalKg: number;
    sessions: number;
  }

  function computeMuscleStats(logs: GymDayLog[]): Record<string, MuscleStats> {
    const map: Record<string, MuscleStats> = {};
    for (const log of logs) {
      for (const ex of log.exercises ?? []) {
        if (ex.skipped) continue;
        const m = canonicalizeMuscle(ex.muscle);
        if (!map[m]) map[m] = { sets: 0, totalKg: 0, sessions: 0 };
        const completedSets = (ex.setsLog ?? []).filter(s => s.completed);
        map[m].sets += completedSets.length;
        map[m].totalKg += completedSets.reduce(
          (sum, s) => sum + (s.weight ?? 0) * (s.reps ?? 0),
          0,
        );
        if (completedSets.length > 0) map[m].sessions += 1;
      }
    }
    return map;
  }

  const thisWeekMuscle = useMemo(() => computeMuscleStats(weekLogs), [weekLogs]);
  const prevWeekMuscle = useMemo(() => computeMuscleStats(prevLogs), [prevLogs]);

  // ── Global KPI Totals ──────────────────────────────────────────────────────
  const totalSets = useMemo(
    () => Object.values(thisWeekMuscle).reduce((s, m) => s + m.sets, 0),
    [thisWeekMuscle],
  );
  const prevTotalSets = useMemo(
    () => Object.values(prevWeekMuscle).reduce((s, m) => s + m.sets, 0),
    [prevWeekMuscle],
  );

  const totalVolume = useMemo(
    () => Object.values(thisWeekMuscle).reduce((s, m) => s + m.totalKg, 0),
    [thisWeekMuscle],
  );
  const prevTotalVolume = useMemo(
    () => Object.values(prevWeekMuscle).reduce((s, m) => s + m.totalKg, 0),
    [prevWeekMuscle],
  );

  const workoutDays = useMemo(
    () => weekLogs.filter(isValidWorkoutSession).length,
    [weekLogs],
  );

  const prevWorkoutDays = useMemo(
    () => prevLogs.filter(isValidWorkoutSession).length,
    [prevLogs],
  );

  // ── Weekly Highlights: Heaviest Lift & Top Volume Exercise ─────────────────
  const weeklyHighlights = useMemo(() => {
    let topLift = { name: '', weight: 0, reps: 0 };
    const exerciseVolMap: Record<string, { volume: number; name: string }> = {};

    for (const log of weekLogs) {
      for (const ex of log.exercises ?? []) {
        if (ex.skipped) continue;
        for (const s of ex.setsLog ?? []) {
          if (s.completed && s.weight && s.weight > 0) {
            if (s.weight > topLift.weight) {
              topLift = { name: ex.name, weight: s.weight, reps: s.reps || 0 };
            }
            const vol = s.weight * (s.reps || 1);
            if (!exerciseVolMap[ex.name]) {
              exerciseVolMap[ex.name] = { name: ex.name, volume: 0 };
            }
            exerciseVolMap[ex.name].volume += vol;
          }
        }
      }
    }

    const topVolumeExercise = Object.values(exerciseVolMap).sort(
      (a, b) => b.volume - a.volume,
    )[0] || null;

    return { topLift: topLift.weight > 0 ? topLift : null, topVolumeExercise };
  }, [weekLogs]);

  // ── Cardio Recap ───────────────────────────────────────────────────────────
  const cardioSummary = useMemo(() => {
    let totalMinutes = 0;
    let totalKm = 0;
    let sessions = 0;
    let loggedCalories = 0;

    for (const log of weekLogs) {
      for (const c of log.cardio ?? []) {
        if (c.completed) {
          sessions++;
          totalMinutes += Number(c.durationMinutes) || 0;
          totalKm += Number(c.distanceKm) || 0;
          loggedCalories += Number(c.caloriesBurned) || 0;
        }
      }
    }

    const roundedKm = Math.round(totalKm * 10) / 10;
    const estCalories = loggedCalories > 0 ? loggedCalories : Math.round(totalMinutes * 8.5);
    const avgDuration = sessions > 0 ? Math.round(totalMinutes / sessions) : 0;
    const avgSpeedKmh = totalMinutes > 0 && roundedKm > 0 ? Math.round((roundedKm / (totalMinutes / 60)) * 10) / 10 : 0;
    const avgPaceMinKm = roundedKm > 0 && totalMinutes > 0 ? Math.round((totalMinutes / roundedKm) * 10) / 10 : 0;

    return {
      totalMinutes,
      totalKm: roundedKm,
      sessions,
      estCalories,
      avgDuration,
      avgSpeedKmh,
      avgPaceMinKm,
    };
  }, [weekLogs]);

  // ── Muscle List for Display ────────────────────────────────────────────────
  const displayMuscles = useMemo(() => {
    const allRelevant = Array.from(
      new Set([
        ...Object.keys(plannedMuscleTargets),
        ...Object.keys(thisWeekMuscle),
      ]),
    );

    return allRelevant
      .filter(m => (thisWeekMuscle[m]?.sets ?? 0) > 0 || (plannedMuscleTargets[m] ?? 0) > 0)
      .sort((a, b) => {
        const setsA = thisWeekMuscle[a]?.sets ?? 0;
        const setsB = thisWeekMuscle[b]?.sets ?? 0;
        return setsB - setsA;
      });
  }, [plannedMuscleTargets, thisWeekMuscle]);

  const untrainedMuscles = useMemo(() => {
    return Object.keys(plannedMuscleTargets).filter(
      m => !(thisWeekMuscle[m]?.sets ?? 0) && (plannedMuscleTargets[m] ?? 0) > 0,
    );
  }, [plannedMuscleTargets, thisWeekMuscle]);

  // ── Daily Volume Bar Chart Data (Mon–Sun) ──────────────────────────────────
  const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const dailyVolume = useMemo(() => {
    return weekDates.map(date => {
      const log = weekLogs.find(l => l.date === date);
      if (!log) return 0;
      return (log.exercises ?? []).reduce((sum: number, ex: any) => {
        if (ex.skipped) return sum;
        return (
          sum +
          (ex.setsLog ?? [])
            .filter((s: any) => s.completed)
            .reduce((s2: number, s: any) => s2 + (s.weight ?? 0) * (s.reps ?? 0), 0)
        );
      }, 0);
    });
  }, [weekLogs, weekDates]);

  const maxDailyVol = useMemo(() => Math.max(1, ...dailyVolume), [dailyVolume]);

  const totalPlannedSets = useMemo(
    () => Object.values(plannedMuscleTargets).reduce((a, b) => a + b, 0),
    [plannedMuscleTargets],
  );
  const adherenceRate = totalPlannedSets > 0 ? Math.round((totalSets / totalPlannedSets) * 100) : 100;
  const hasData = workoutDays > 0 || cardioSummary.sessions > 0;

  // ── Estimated 1RM per exercise (Epley) ───────────────────────────────────
  const exerciseEstRMs = useMemo(() => {
    const rmMap: Record<string, number> = {};
    for (const log of weekLogs) {
      for (const ex of log.exercises ?? []) {
        if (ex.skipped) continue;
        const completed = (ex.setsLog ?? []).filter((s: any) => s.completed);
        const maxW = Math.max(0, ...completed.map((s: any) => Number(s.weight) || 0));
        const maxReps = completed.find((s: any) => Number(s.weight) === maxW)?.reps || 0;
        const rm = epley1RM(maxW, maxReps);
        if (rm > 0 && rm > (rmMap[ex.name] || 0)) rmMap[ex.name] = rm;
      }
    }
    return rmMap;
  }, [weekLogs]);

  // ── Muscle completion map for precomputed stats ───────────────────────────
  const muscleCompletionMap = useMemo(() => {
    const map: Record<string, { done: number; planned: number; pct: number }> = {};
    for (const muscle of displayMuscles) {
      const done = thisWeekMuscle[muscle]?.sets ?? 0;
      const planned = plannedMuscleTargets[muscle] ?? done;
      map[muscle] = { done, planned, pct: planned > 0 ? Math.round((done / planned) * 100) : 100 };
    }
    return map;
  }, [displayMuscles, thisWeekMuscle, plannedMuscleTargets]);

  // ── PrecomputedGymStats for AI prompt ────────────────────────────────────
  const precomputedStats = useMemo((): PrecomputedGymStats => {
    const volumeDeltaKg = Math.round(totalVolume - prevTotalVolume);
    const volumeDeltaPct = prevTotalVolume > 0
      ? Math.round(((totalVolume - prevTotalVolume) / prevTotalVolume) * 1000) / 10
      : 0;
    return {
      thisWeekVolume: Math.round(totalVolume),
      prevWeekVolume: Math.round(prevTotalVolume),
      volumeDeltaKg,
      volumeDeltaPct,
      thisWeekSets: totalSets,
      prevWeekSets: prevTotalSets,
      sessionCount: workoutDays,
      plannedSessions: plannedWorkoutDaysCount,
      topLift: weeklyHighlights.topLift,
      muscleCompletion: muscleCompletionMap,
      untrainedMuscles,
      estimatedOneRMs: exerciseEstRMs,
    };
  }, [totalVolume, prevTotalVolume, totalSets, prevTotalSets, workoutDays, plannedWorkoutDaysCount, weeklyHighlights, muscleCompletionMap, untrainedMuscles, exerciseEstRMs]);

  // ── Strength Progression Data (top 4 exercises, 4-week 1RM history) ───────
  const strengthProgressionData = useMemo((): ExerciseSpark[] => {
    // Build 4-week date ranges (current + 3 previous weeks)
    const ranges: { label: string; dates: string[] }[] = [];
    for (let w = 3; w >= 0; w--) {
      const [y, m, dayN] = weekAnchorDate.split('-').map(Number);
      const anchor = new Date(y, m - 1, dayN);
      anchor.setDate(anchor.getDate() - w * 7);
      const mon = new Date(anchor);
      mon.setDate(anchor.getDate() - ((anchor.getDay() + 6) % 7));
      const weekDates: string[] = [];
      for (let i = 0; i < 7; i++) {
        const dt = new Date(mon);
        dt.setDate(mon.getDate() + i);
        weekDates.push(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`);
      }
      const label = w === 0 ? 'Now'
        : w === 1 ? '-1w'
        : w === 2 ? '-2w'
        : '-3w';
      ranges.push({ label, dates: weekDates });
    }

    // For each exercise, compute max est1RM per week
    const exWeeklyRMs: Record<string, { muscle: string; weeks: number[] }> = {};
    for (const log of gymLogs) {
      for (const ex of log.exercises ?? []) {
        if (ex.skipped) continue;
        const completed = (ex.setsLog ?? []).filter((s: any) => s.completed);
        if (!completed.length) continue;
        const maxW = Math.max(0, ...completed.map((s: any) => Number(s.weight) || 0));
        const maxReps = completed.find((s: any) => Number(s.weight) === maxW)?.reps || 0;
        const rm = epley1RM(maxW, maxReps);
        if (!exWeeklyRMs[ex.name]) {
          exWeeklyRMs[ex.name] = { muscle: canonicalizeMuscle(ex.muscle), weeks: [0, 0, 0, 0] };
        }
        const weekIdx = ranges.findIndex(r => r.dates.includes(log.date));
        if (weekIdx !== -1 && rm > exWeeklyRMs[ex.name].weeks[weekIdx]) {
          exWeeklyRMs[ex.name].weeks[weekIdx] = rm;
        }
      }
    }

    const EXERCISE_COLORS: Record<string, string> = {
      Chest: '#a599ff', Back: '#89dceb', Shoulders: '#ff9f4d',
      Triceps: '#5eda9e', Biceps: '#b8afff', Quads: '#ff9f4d',
      Hamstrings: '#89dceb', Abs: '#a599ff', Forearms: '#ff9f4d',
      Glutes: '#a599ff', Traps: '#89dceb', Calves: '#5eda9e', Mixed: '#8e8e93',
    };

    return Object.entries(exWeeklyRMs)
      .filter(([, v]) => v.weeks[3] > 0) // must have current week data
      .sort(([, a], [, b]) => b.weeks[3] - a.weeks[3])
      .slice(0, 4)
      .map(([name, v]) => ({
        name,
        muscle: v.muscle,
        weeks: ranges.map((r, i) => ({ label: r.label, est1RM: v.weeks[i] })),
        currentRM: v.weeks[3],
        prevRM: v.weeks[2] || v.weeks[1] || v.weeks[0] || 0,
        color: EXERCISE_COLORS[v.muscle] ?? '#a599ff',
      }));
  }, [gymLogs, weekAnchorDate]);

  // ── Heatmap data (90 days of volume) ─────────────────────────────────────
  const heatmapData = useMemo(() => {
    return gymLogs.map(log => {
      const vol = (log.exercises ?? []).reduce((sum: number, ex: any) => {
        if (ex.skipped) return sum;
        return sum + (ex.setsLog ?? [])
          .filter((s: any) => s.completed)
          .reduce((s2: number, s: any) => s2 + (Number(s.weight) || 0) * (Number(s.reps) || 0), 0);
      }, 0);
      return { date: log.date, volume: vol };
    });
  }, [gymLogs]);

  // ── Muscle distribution data for donut chart ─────────────────────────────
  const muscleDonutData = useMemo(() => {
    const MUSCLE_COLORS_MAP: Record<string, string> = {
      Chest: '#a599ff', Back: '#89dceb', Shoulders: '#ff9f4d',
      Triceps: '#5eda9e', Biceps: '#b8afff', Quads: '#ff9f4d',
      Hamstrings: '#89dceb', Abs: '#a599ff', Forearms: '#ff9f4d',
      Glutes: '#b8afff', Traps: '#89dceb', Calves: '#5eda9e', Mixed: '#8e8e93',
    };
    return Object.entries(thisWeekMuscle).map(([muscle, stats]) => ({
      muscle,
      sets: stats.sets,
      color: MUSCLE_COLORS_MAP[muscle] ?? '#a599ff',
    }));
  }, [thisWeekMuscle]);

  // ── Last week daily volume for trend overlay ──────────────────────────────
  const prevDailyVolume = useMemo(() => {
    return prevDates.map(date => {
      const log = prevLogs.find(l => l.date === date);
      if (!log) return 0;
      return (log.exercises ?? []).reduce((sum: number, ex: any) => {
        if (ex.skipped) return sum;
        return sum + (ex.setsLog ?? [])
          .filter((s: any) => s.completed)
          .reduce((s2: number, s: any) => s2 + (Number(s.weight) || 0) * (Number(s.reps) || 0), 0);
      }, 0);
    });
  }, [prevLogs, prevDates]);

  // ── GYM-GPT Weekly Intelligence Hook & State ──────────────────────────────
  const [aiAnalysis, setAiAnalysis] = useState<WeeklyGymAnalysis | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [isAiCollapsed, setIsAiCollapsed] = useState(true);
  const [selectedDeepDiveEx, setSelectedDeepDiveEx] = useState<string | null>(null);
  const autoGeneratedWeeksRef = useRef<Set<string>>(new Set());

  const loadWeeklyAnalysis = useCallback(async (force = false) => {
    if (!hasData) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await getOrGenerateWeeklyGymAnalysis(
        gymLogs,
        weekAnchorDate,
        userGymPlan,
        undefined,
        force,
        precomputedStats,
      );
      if (res.analysis) {
        setAiAnalysis(res.analysis);
      } else if (res.error) {
        setAiError(res.error);
      }
    } catch (e: any) {
      setAiError(e?.message || 'Failed to generate analysis');
      console.warn('[WeeklyGymReport] AI load error:', e);
    } finally {
      setAiLoading(false);
    }
  }, [gymLogs, weekAnchorDate, userGymPlan, hasData, precomputedStats]);

  // Load from cache only (instant, 0ms).
  // NEVER auto-start Gemini generation automatically on view/render.
  // Generation only runs when the user explicitly taps 'Generate GYM-GPT Analysis' or 'Retry'.
  useEffect(() => {
    let isCurrent = true;
    setAiLoading(false);
    setAiError(null);
    setIsAiCollapsed(true);

    getCachedWeeklyGymAnalysis(weekAnchorDate).then((cached: WeeklyGymAnalysis | null) => {
      if (!isCurrent) return;
      if (cached) {
        setAiAnalysis(cached);
      } else {
        setAiAnalysis(null);
      }
    });

    return () => {
      isCurrent = false;
    };
  }, [weekAnchorDate]);

  return (
    <View style={st.container}>
      {/* ── Title Header ──────────────────────────────────────────────────── */}
      <View style={st.titleRow}>
        <View>
          <Text style={st.title}>Weekly Recap</Text>
          <Text style={st.subtitle}>
            {workoutDays}/{plannedWorkoutDaysCount} Days Trained • Full Breakdown
          </Text>
        </View>
        <View style={st.restBadge}>
          <Ionicons name="bed-outline" size={13} color={COLORS.accentPrimary} />
          <Text style={st.restBadgeText}>Recovery Mode</Text>
        </View>
      </View>

      {!hasData ? (
        <View style={st.emptyCard}>
          <Ionicons name="barbell-outline" size={42} color={COLORS.textTertiary} />
          <Text style={st.emptyText}>No workouts logged this week yet.</Text>
          <Text style={st.emptySubtext}>
            Log your workouts during the week and your full analytics and progress rings will populate here.
          </Text>
        </View>
      ) : (
        <>
          {/* 1. ── Global KPI Stats (Sessions, Total Sets, Total Volume) ────── */}
          <View style={st.statsRow}>
            <View style={st.statCard}>
              <Text style={st.statValue}>
                {workoutDays}
                <Text style={st.statSuffix}>/{plannedWorkoutDaysCount}</Text>
              </Text>
              <Text style={st.statLabel}>Sessions</Text>
              <ChangeBadge delta={workoutDays - prevWorkoutDays} unit="d" />
            </View>

            <View style={st.statCard}>
              <Text style={st.statValue}>{totalSets}</Text>
              <Text style={st.statLabel}>Total Sets</Text>
              <ChangeBadge delta={totalSets - prevTotalSets} unit="s" />
            </View>

            <View style={st.statCard}>
              <Text style={st.statValue}>
                {totalVolume >= 1000
                  ? `${Math.round(totalVolume / 100) / 10}k`
                  : totalVolume}
                <Text style={st.statSuffix}> kg</Text>
              </Text>
              <Text style={st.statLabel}>Volume</Text>
              <ChangeBadge
                delta={Math.round((totalVolume - prevTotalVolume) / 100) / 10}
                unit="k"
              />
            </View>
          </View>

          {/* 2. ── GYM-GPT Weekly Intelligence Card (Collapsible) ────────────── */}
          <View style={[st.aiCard, isAiCollapsed && st.aiCardCollapsed]}>
            {/* Header with Title, Grade Badge, Sync Button, and Fold/Unfold Chevron */}
            <TouchableOpacity
              style={[st.aiCardHeader, isAiCollapsed && st.aiCardHeaderCollapsed]}
              onPress={() => {
                hapticLight();
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setIsAiCollapsed(prev => !prev);
              }}
              activeOpacity={0.7}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, flex: 1, minWidth: 0 }}>
                <View style={st.aiSparkleBadge}>
                  <Image
                    source={require('../../../assets/images/sara-idle.png')}
                    style={{ width: 22, height: 22 }}
                    resizeMode="contain"
                  />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={st.aiSectionTitle} numberOfLines={1}>GYM-GPT • INTELLIGENCE</Text>
                  <Text style={st.aiSectionSubtitle} numberOfLines={1}>
                    S.A.R.A Biomechanics & Overload
                  </Text>
                </View>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                {aiAnalysis && (
                  <View style={st.aiScoreBadge}>
                    <Text style={st.aiScoreBadgeText}>
                      {aiAnalysis.scoreGrade} • {aiAnalysis.score}%
                    </Text>
                  </View>
                )}
                <View style={st.aiFoldBtn}>
                  <Ionicons
                    name={isAiCollapsed ? 'chevron-down' : 'chevron-up'}
                    size={14}
                    color={COLORS.textTertiary}
                  />
                </View>
              </View>
            </TouchableOpacity>

            {/* Horizontal "Click to open" prompt with clean spacing when collapsed */}
            {isAiCollapsed && (
              <TouchableOpacity
                style={st.aiCollapsedRow}
                onPress={() => {
                  hapticLight();
                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                  setIsAiCollapsed(false);
                }}
                activeOpacity={0.7}
              >
                <View style={st.aiCollapsedLeft}>
                  <Image
                    source={require('../../../assets/images/sara-idle.png')}
                    style={{ width: 14, height: 14 }}
                    resizeMode="contain"
                  />
                  <Text style={st.aiClickToOpenText}>Click to open</Text>
                  {aiAnalysis?.headline ? (
                    <>
                      <Text style={st.aiCollapsedDot}>•</Text>
                      <Text style={st.aiCollapsedHeadlineText} numberOfLines={1}>
                        {aiAnalysis.headline}
                      </Text>
                    </>
                  ) : null}
                </View>
                <Ionicons name="chevron-forward" size={12} color="#a599ff" />
              </TouchableOpacity>
            )}

            {!isAiCollapsed && (
              aiLoading ? (
                <View style={st.aiLoadingState}>
                  <ActivityIndicator size="small" color="#a599ff" />
                  <Text style={st.aiLoadingText}>
                    Synthesizing 30-day mesocycle & progressive overload...
                  </Text>
                </View>
              ) : aiError ? (
                <View style={st.aiErrorState}>
                  <Ionicons name="alert-circle-outline" size={18} color={COLORS.error} />
                  <Text style={st.aiErrorText}>Analysis failed. Check connection and retry.</Text>
                  <TouchableOpacity
                    style={st.aiErrorRetryBtn}
                    onPress={() => { hapticLight(); loadWeeklyAnalysis(true); }}
                  >
                    <Ionicons name="refresh" size={13} color="#a599ff" />
                    <Text style={st.aiErrorRetryText}>Retry Analysis</Text>
                  </TouchableOpacity>
                </View>
              ) : aiAnalysis ? (
                <View style={st.aiContent}>
                  {/* Headline & Executive Verdict */}
                  <View style={st.aiHeroBlock}>
                    <FormattedText
                      text={aiAnalysis.headline}
                      style={st.aiHeadline}
                      boldColor="#ffffff"
                    />
                    <FormattedText
                      text={aiAnalysis.verdict}
                      style={st.aiVerdict}
                      boldColor="#ffffff"
                    />
                  </View>

                  {/* Directives (Numbered Luxury Action Cards) */}
                  {aiAnalysis.nextWeekDirectives && aiAnalysis.nextWeekDirectives.length > 0 && (
                    <View style={st.aiBlock}>
                      <View style={st.aiBlockHeader}>
                        <Ionicons name="flag" size={13} color="#a599ff" />
                        <Text style={[st.aiBlockTitle, { color: '#a599ff' }]}>
                          NEXT CYCLE DIRECTIVES
                        </Text>
                      </View>

                      <View style={{ gap: 8, marginTop: 4 }}>
                        {aiAnalysis.nextWeekDirectives.map((directive, idx) => (
                          <View key={idx} style={st.aiDirectiveCard}>
                            <View style={st.aiDirectiveNumPill}>
                              <Text style={st.aiDirectiveNumText}>0{idx + 1}</Text>
                            </View>
                            <FormattedText
                              text={directive}
                              style={st.aiDirectiveText}
                              boldColor="#ffffff"
                            />
                          </View>
                        ))}
                      </View>
                    </View>
                  )}

                  {/* Overload Comparison vs Last Week */}
                  <View style={st.aiBlock}>
                    <View style={st.aiBlockHeader}>
                      <Ionicons name="swap-horizontal" size={13} color={COLORS.accentGreen} />
                      <Text style={[st.aiBlockTitle, { color: COLORS.accentGreen }]}>
                        VS LAST WEEK (PROGRESSIVE OVERLOAD)
                      </Text>
                    </View>

                    {aiAnalysis.comparisonVsLastWeek?.volumeDeltaText ? (
                      <View style={st.aiVolumePill}>
                        <Ionicons name="trending-up" size={12} color={COLORS.accentGreen} style={{ marginRight: 4 }} />
                        <Text style={st.aiVolumePillText}>
                          {aiAnalysis.comparisonVsLastWeek.volumeDeltaText}
                        </Text>
                      </View>
                    ) : null}

                    {aiAnalysis.comparisonVsLastWeek?.keyOverloads?.map((item, idx) => (
                      <View key={idx} style={st.aiBulletRow}>
                        <Text style={st.aiBulletDot}>•</Text>
                        <FormattedText
                          text={item}
                          style={st.aiBulletText}
                          boldColor="#ffffff"
                        />
                      </View>
                    ))}

                    {aiAnalysis.comparisonVsLastWeek?.summary ? (
                      <FormattedText
                        text={aiAnalysis.comparisonVsLastWeek.summary}
                        style={st.aiSubSummary}
                        boldColor="#d1d1d6"
                      />
                    ) : null}
                  </View>

                  {/* 30-Day Mesocycle Dynamics & Fatigue Indicator */}
                  <View style={st.aiBlock}>
                    <View style={st.aiBlockHeader}>
                      <Ionicons name="analytics" size={13} color={COLORS.accentAmber} />
                      <Text style={[st.aiBlockTitle, { color: COLORS.accentAmber }]}>
                        30-DAY MESOCYCLE DYNAMICS
                      </Text>
                    </View>

                    <FormattedText
                      text={aiAnalysis.thirtyDayTrend.trajectory}
                      style={st.aiTrajectoryText}
                      boldColor="#ffffff"
                    />

                    {aiAnalysis.thirtyDayTrend?.laggingMuscles?.map((item, idx) => (
                      <View key={idx} style={st.aiBulletRow}>
                        <Text style={[st.aiBulletDot, { color: COLORS.accentAmber }]}>⚡</Text>
                        <FormattedText
                          text={item}
                          style={st.aiBulletText}
                          boldColor="#ffffff"
                        />
                      </View>
                    ))}

                    {aiAnalysis.thirtyDayTrend?.fatigueIndicator ? (
                      <View style={st.aiFatigueBox}>
                        <Ionicons name="shield-checkmark" size={13} color={COLORS.accentAmber} />
                        <FormattedText
                          text={aiAnalysis.thirtyDayTrend.fatigueIndicator}
                          style={st.aiFatigueText}
                          boldColor={COLORS.accentAmber}
                        />
                      </View>
                    ) : null}
                  </View>
                </View>
              ) : (
                <View style={st.aiPromptState}>
                  <Text style={st.aiPromptTitle}>Weekly Intelligence & Overload Report</Text>
                  <Text style={st.aiPromptSub}>
                    Generate S.A.R.A's AI breakdown for this week's volume progression, fatigue index, and next cycle directives.
                  </Text>
                  <TouchableOpacity
                    style={st.aiGenerateBtn}
                    onPress={() => {
                      hapticMedium();
                      loadWeeklyAnalysis(false);
                    }}
                    activeOpacity={0.75}
                  >
                    <Image
                      source={require('../../../assets/images/sara-idle.png')}
                      style={{ width: 18, height: 18 }}
                      resizeMode="contain"
                    />
                    <Text style={st.aiGenerateBtnText}>Generate GYM-GPT Analysis</Text>
                  </TouchableOpacity>
                </View>
              )
            )}
          </View>

          {/* 2.5 ── Anatomical Muscle Heatmap & Recovery BodyMap (Dual-View Vector Engine) ──── */}
          <AnatomicalBodyMapCard
            gymLogs={gymLogs}
            weekAnchorDate={weekAnchorDate}
            variant="weekly"
            defaultMode="fatigue"
          />

          {/* 2.8 ── Effort & Intensity Intelligence (OpenGym Hypertrophy Stimulus Engine) ──── */}
          <EffortDistributionCard weekLogs={weekLogs} />

          {/* 3. ── Muscle Target Adherence (Dynamic Donut Circles) ───────────── */}
          <View style={st.card}>
            <View style={st.cardHeaderRow}>
              <Text style={st.sectionLabel}>MUSCLE TARGET ADHERENCE</Text>
              <View style={st.adherenceBadge}>
                <Text style={st.adherenceBadgeText}>
                  {adherenceRate >= 100 ? '100% Plan Hit' : `${adherenceRate}% Plan Hit`}
                </Text>
              </View>
            </View>

            <View style={st.muscleGrid}>
              {displayMuscles.map(muscle => {
                const stats = thisWeekMuscle[muscle] || { sets: 0, totalKg: 0, sessions: 0 };
                const plannedTarget = plannedMuscleTargets[muscle] || stats.sets || 1;
                const pct = Math.min(100, Math.round((stats.sets / plannedTarget) * 100));
                const isComplete = stats.sets >= plannedTarget && plannedTarget > 0;
                const color = isComplete ? COLORS.accentGreen : (MUSCLE_COLORS[muscle] ?? COLORS.accentPrimary);
                const prev = prevWeekMuscle[muscle];
                const delta = stats.sets - (prev?.sets ?? 0);

                return (
                  <View key={muscle} style={st.muscleCard}>
                    <View style={st.ringWrapper}>
                      <DonutRing pct={pct} color={color} size={66} strokeWidth={6.5} />
                      <View style={st.ringCenter}>
                        <Text style={[st.ringNum, { color }]}>
                          {stats.sets}
                          <Text style={st.ringTarget}>/{plannedTarget}</Text>
                        </Text>
                        <Text style={st.ringUnit}>
                          {isComplete ? '✓ Done' : `${pct}%`}
                        </Text>
                      </View>
                    </View>

                    <Text style={st.muscleName} numberOfLines={1}>
                      {muscle}
                    </Text>

                    <View style={st.muscleChangeRow}>
                      {delta !== 0 ? (
                        <Text
                          style={{
                            fontSize: 10,
                            fontFamily: FONT_FAMILY.bold,
                            color: delta > 0 ? COLORS.accentGreen : COLORS.error,
                          }}
                        >
                          {delta > 0 ? '▲ +' : '▼ -'}{Math.abs(delta)} sets
                        </Text>
                      ) : (
                        <Text style={{ fontSize: 10, color: COLORS.textTertiary }}>
                          • on track
                        </Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          </View>

          {/* 4. ── Highlights & Top Lift Card (Subtle Obsidian Gold) ─────────── */}
          {weeklyHighlights.topLift && (
            <View style={st.highlightCard}>
              <View style={st.highlightHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={st.trophyCircle}>
                    <Ionicons name="trophy" size={13} color="#e6c875" />
                  </View>
                  <View>
                    <Text style={st.highlightTitle}>WEEKLY BEST LIFTS</Text>
                    <Text style={st.highlightSubtitle}>Peak Load & Volume Leaders</Text>
                  </View>
                </View>
                <View style={st.highlightBadge}>
                  <Text style={st.highlightBadgeText}>🏆 PR Highs</Text>
                </View>
              </View>

              <View style={st.highlightPodsGrid}>
                {/* Pod 1: Heaviest Lift (Tappable Deep-Dive) */}
                <TouchableOpacity
                  style={st.highlightPod}
                  activeOpacity={0.75}
                  onPress={() => {
                    hapticLight();
                    setSelectedDeepDiveEx(weeklyHighlights.topLift!.name);
                  }}
                >
                  <View style={st.highlightPodHeader}>
                    <Ionicons name="barbell-outline" size={12} color="#e6c875" />
                    <Text style={st.highlightPodTag}>HEAVIEST LIFT</Text>
                  </View>
                  <Text style={st.highlightLiftName} numberOfLines={1}>
                    {weeklyHighlights.topLift.name}
                  </Text>
                  <View style={st.highlightStatRow}>
                    <Text style={st.highlightWeightText}>
                      {weeklyHighlights.topLift.weight}
                      <Text style={st.highlightUnit}> kg</Text>
                    </Text>
                    <Text style={st.highlightRepsText}>
                      • {weeklyHighlights.topLift.reps} reps
                    </Text>
                  </View>
                </TouchableOpacity>

                {/* Pod 2: Volume Leader (Tappable Deep-Dive) */}
                {weeklyHighlights.topVolumeExercise && (
                  <TouchableOpacity
                    style={st.highlightPod}
                    activeOpacity={0.75}
                    onPress={() => {
                      hapticLight();
                      setSelectedDeepDiveEx(weeklyHighlights.topVolumeExercise!.name);
                    }}
                  >
                    <View style={st.highlightPodHeader}>
                      <Ionicons name="layers-outline" size={12} color="#89dceb" />
                      <Text style={[st.highlightPodTag, { color: '#89dceb' }]}>VOLUME LEADER</Text>
                    </View>
                    <Text style={st.highlightLiftName} numberOfLines={1}>
                      {weeklyHighlights.topVolumeExercise.name}
                    </Text>
                    <View style={st.highlightStatRow}>
                      <Text style={[st.highlightWeightText, { color: '#ffffff' }]}>
                        {Math.round(weeklyHighlights.topVolumeExercise.volume / 100) / 10}k
                        <Text style={st.highlightUnit}> kg</Text>
                      </Text>
                      <Text style={st.highlightRepsText}>
                        • workload
                      </Text>
                    </View>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}

          {/* 5. ── Volume Trends (This week vs last week line overlay) ──────── */}
          <VolumeTrendLine thisWeek={dailyVolume} lastWeek={prevDailyVolume} height={140} />

          {/* 6. ── Strength Progression Sparklines with Interactive Deep-Dive Modal ── */}
          {strengthProgressionData.length > 0 && (
            <StrengthProgressionChart
              exercises={strengthProgressionData}
              onSelectExercise={name => {
                hapticLight();
                setSelectedDeepDiveEx(name);
              }}
            />
          )}

          {/* 7. ── Cardio & Conditioning (Elevated Luxury Pods Design) ─────── */}
          {cardioSummary.sessions > 0 && (
            <View style={st.cardioCard}>
              <View style={st.cardioHeaderRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={st.cardioIconBadge}>
                    <Ionicons name="flame" size={14} color={COLORS.accentAmber} />
                  </View>
                  <View>
                    <Text style={st.cardioSectionTitle}>CARDIO & CONDITIONING</Text>
                    <Text style={st.cardioSectionSubtitle}>Aerobic & Heart Health Output</Text>
                  </View>
                </View>

                <View style={st.cardioTagPill}>
                  <Text style={st.cardioTagText}>
                    {cardioSummary.avgDuration > 0
                      ? `Avg ${cardioSummary.avgDuration}m / run`
                      : `${cardioSummary.sessions} Sessions`}
                  </Text>
                </View>
              </View>

              {/* 3 Styled Metric Pods */}
              <View style={st.cardioPodsGrid}>
                {/* Pod 1: Duration */}
                <View style={st.cardioPod}>
                  <View style={[st.cardioPodIconBox, { backgroundColor: 'rgba(255, 159, 77, 0.12)' }]}>
                    <Ionicons name="time-outline" size={12} color={COLORS.accentAmber} />
                  </View>
                  <Text style={st.cardioPodValue}>
                    {cardioSummary.totalMinutes}
                    <Text style={st.cardioPodUnit}> min</Text>
                  </Text>
                  <Text style={st.cardioPodLabel}>Total Time</Text>
                </View>

                {/* Pod 2: Distance */}
                <View style={st.cardioPod}>
                  <View style={[st.cardioPodIconBox, { backgroundColor: 'rgba(137, 220, 235, 0.12)' }]}>
                    <Ionicons name="navigate-outline" size={12} color={COLORS.accentBlue} />
                  </View>
                  <Text style={st.cardioPodValue}>
                    {cardioSummary.totalKm}
                    <Text style={st.cardioPodUnit}> km</Text>
                  </Text>
                  <Text style={st.cardioPodLabel}>Distance</Text>
                </View>

                {/* Pod 3: Frequency */}
                <View style={st.cardioPod}>
                  <View style={[st.cardioPodIconBox, { backgroundColor: 'rgba(94, 218, 158, 0.12)' }]}>
                    <Ionicons name="pulse-outline" size={12} color={COLORS.accentGreen} />
                  </View>
                  <Text style={st.cardioPodValue}>
                    {cardioSummary.sessions}
                    <Text style={st.cardioPodUnit}> runs</Text>
                  </Text>
                  <Text style={st.cardioPodLabel}>Sessions</Text>
                </View>
              </View>

              {/* Footer Output / Pace & Calorie Bar */}
              <View style={st.cardioFooterRow}>
                <View style={st.cardioFooterItem}>
                  <Ionicons name="speedometer-outline" size={12} color={COLORS.accentAmber} />
                  <Text style={st.cardioFooterText}>
                    {cardioSummary.avgPaceMinKm > 0
                      ? `${cardioSummary.avgPaceMinKm} min/km pace`
                      : cardioSummary.avgSpeedKmh > 0
                      ? `${cardioSummary.avgSpeedKmh} km/h speed`
                      : `Aerobic Base Active`}
                  </Text>
                </View>

                <View style={st.cardioFooterItem}>
                  <Ionicons name="flame-outline" size={12} color={COLORS.accentAmber} />
                  <Text style={st.cardioFooterText}>
                    ~{cardioSummary.estCalories} kcal burned
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* 8. ── 90-Day Consistency Heatmap (Clean Bottom Foundation) ───── */}
          <ConsistencyHeatmap data={heatmapData} />

          {/* ── Single-Exercise Deep-Dive Inspector Modal ────────────────────── */}
          <ExerciseDeepDiveModal
            visible={!!selectedDeepDiveEx}
            exerciseName={selectedDeepDiveEx}
            gymLogs={gymLogs}
            onClose={() => setSelectedDeepDiveEx(null)}
          />
        </>
      )}

      <View style={{ height: 40 }} />
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────
