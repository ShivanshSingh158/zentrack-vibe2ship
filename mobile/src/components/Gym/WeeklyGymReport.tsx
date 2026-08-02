/**
 * WeeklyGymReport — ZenTrack Mobile
 * Shown every Sunday as the full-week workout analytics dashboard.
 * Displays: muscle frequency rings, set/volume bars, untrained muscle warnings,
 * weekly total stats, and week-over-week set/weight changes.
 * Theme: Obsidian Cosmos — no hardcoded colours outside COLORS tokens.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SPACE, RADIUS, FONT_FAMILY, FONT_SIZE } from '../../theme/tokens';
import { MUSCLE_CANONICAL, canonicalizeMuscle } from '../../utils/gymUtils';

// ── Types ────────────────────────────────────────────────────────────────────

interface GymSet {
  completed: boolean;
  reps?: number | null;
  weight?: number | null;
}

interface GymExercise {
  name: string;
  muscle?: string;
  setsLog: GymSet[];
}

interface GymLog {
  date: string; // YYYY-MM-DD
  exercises?: GymExercise[];
}

interface Props {
  gymLogs: GymLog[];
  /** ISO date string of the week being viewed (any day in that week) */
  weekAnchorDate: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Format a Date to YYYY-MM-DD using LOCAL timezone (not UTC). */
function localDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Returns all 7 YYYY-MM-DD strings for the week containing anchorDate (Mon–Sun). */
function getWeekRange(anchor: string): string[] {
  const d = new Date(anchor + 'T00:00:00'); // parse as local midnight
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
  const d = new Date(anchor + 'T00:00:00');
  d.setDate(d.getDate() - 7);
  return getWeekRange(localDateStr(d));
}



/** All muscle groups we track */
const ALL_MUSCLES = [
  'Chest', 'Back', 'Shoulders', 'Triceps', 'Biceps',
  'Quads', 'Hamstrings', 'Calves', 'Abs', 'Forearms', 'Glutes', 'Traps',
];

// Colour per muscle group — all from Obsidian Cosmos palette variants
const MUSCLE_COLORS: Record<string, string> = {
  Chest:      '#a599ff', // accent purple
  Back:       '#89dceb', // accent blue
  Shoulders:  '#ff9f4d', // amber
  Triceps:    '#5eda9e', // green
  Biceps:     '#b8afff', // accent light
  Quads:      '#ff9f4d', // amber
  Hamstrings: '#89dceb', // blue
  Calves:     '#5eda9e', // green
  Abs:        '#636366', // muted
  Forearms:   '#ff9f4d', // amber
  Glutes:     '#a599ff', // purple
  Traps:      '#89dceb', // blue
  Mixed:      '#3c3c3e', // border
};

// ── Donut Ring (pure SVG, no reanimated) ─────────────────────────────────────

function DonutRing({
  pct, color, size = 64, strokeWidth = 7,
}: { pct: number; color: string; size?: number; strokeWidth?: number }) {
  const r = (size - strokeWidth) / 2;
  const circ = 2 * Math.PI * r;
  const filled = Math.min(1, pct / 100) * circ;
  const center = size / 2;

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Track */}
      <Circle
        cx={center} cy={center} r={r}
        stroke="rgba(255,255,255,0.06)"
        strokeWidth={strokeWidth}
        fill="none"
      />
      {/* Fill */}
      <G rotation="-90" origin={`${center},${center}`}>
        <Circle
          cx={center} cy={center} r={r}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={`${filled} ${circ - filled}`}
          strokeLinecap="round"
        />
      </G>
    </Svg>
  );
}

// ── Bar component ─────────────────────────────────────────────────────────────

function MiniBar({ value, maxValue, color }: { value: number; maxValue: number; color: string }) {
  const pct = maxValue > 0 ? Math.min(1, value / maxValue) : 0;
  return (
    <View style={{ flex: 1, height: 4, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
      <View style={{ width: `${pct * 100}%`, height: '100%', backgroundColor: color, borderRadius: 2 }} />
    </View>
  );
}

// ── Change Badge ──────────────────────────────────────────────────────────────

function ChangeBadge({ delta, unit }: { delta: number; unit: string }) {
  if (delta === 0) return <Text style={st.changeBadgeNeutral}>—</Text>;
  const up = delta > 0;
  return (
    <Text style={[st.changeBadge, { color: up ? COLORS.accentGreen : COLORS.error }]}>
      {up ? '↑' : '↓'} {Math.abs(delta)}{unit}
    </Text>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function WeeklyGymReport({ gymLogs, weekAnchorDate }: Props) {
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

  // ── Compute per-muscle stats ──────────────────────────────────────────────

  interface MuscleStats { sets: number; totalKg: number; sessions: number }

  function computeMuscleStats(logs: GymLog[]): Record<string, MuscleStats> {
    const map: Record<string, MuscleStats> = {};
    for (const log of logs) {
      for (const ex of (log.exercises ?? [])) {
        const m = canonicalizeMuscle(ex.muscle);
        if (!map[m]) map[m] = { sets: 0, totalKg: 0, sessions: 0 };
        const completedSets = ex.setsLog.filter(s => s.completed);
        map[m].sets += completedSets.length;
        map[m].totalKg += completedSets.reduce((sum, s) => sum + ((s.weight ?? 0) * (s.reps ?? 0)), 0);
        if (completedSets.length > 0) map[m].sessions += 1;
      }
    }
    return map;
  }

  const thisWeekMuscle = useMemo(() => computeMuscleStats(weekLogs), [weekLogs]);
  const prevWeekMuscle = useMemo(() => computeMuscleStats(prevLogs), [prevLogs]);

  // ── Global week totals ───────────────────────────────────────────────────

  const totalSets = useMemo(() =>
    Object.values(thisWeekMuscle).reduce((s, m) => s + m.sets, 0), [thisWeekMuscle]);
  const prevTotalSets = useMemo(() =>
    Object.values(prevWeekMuscle).reduce((s, m) => s + m.sets, 0), [prevWeekMuscle]);

  const totalVolume = useMemo(() =>
    Object.values(thisWeekMuscle).reduce((s, m) => s + m.totalKg, 0), [thisWeekMuscle]);
  const prevTotalVolume = useMemo(() =>
    Object.values(prevWeekMuscle).reduce((s, m) => s + m.totalKg, 0), [prevWeekMuscle]);

  const workoutDays = weekLogs.filter(l => (l.exercises?.length ?? 0) > 0).length;
  const prevWorkoutDays = prevLogs.filter(l => (l.exercises?.length ?? 0) > 0).length;

  // ── Muscle breakdown sorted by sets ─────────────────────────────────────

  const maxSets = useMemo(
    () => Math.max(1, ...Object.values(thisWeekMuscle).map(m => m.sets)),
    [thisWeekMuscle],
  );

  const trainedMuscles = useMemo(() =>
    ALL_MUSCLES.filter(m => (thisWeekMuscle[m]?.sets ?? 0) > 0)
      .sort((a, b) => (thisWeekMuscle[b]?.sets ?? 0) - (thisWeekMuscle[a]?.sets ?? 0)),
    [thisWeekMuscle],
  );

  const untrainedMuscles = useMemo(() =>
    ALL_MUSCLES.filter(m => !(thisWeekMuscle[m]?.sets ?? 0)),
    [thisWeekMuscle],
  );

  // ── Per-day volume bars (Mon–Sat, skip Sun rest) ─────────────────────────

  const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const dailyVolume = useMemo(() =>
    weekDates.map(date => {
      const log = weekLogs.find(l => l.date === date);
      if (!log) return 0;
      return (log.exercises ?? []).reduce((sum, ex) =>
        sum + ex.setsLog.filter(s => s.completed).reduce((s2, s) =>
          s2 + ((s.weight ?? 0) * (s.reps ?? 0)), 0), 0);
    }),
    [weekLogs, weekDates],
  );

  const maxDailyVol = useMemo(() => Math.max(1, ...dailyVolume), [dailyVolume]);

  // ── Render guard — no workouts this week ────────────────────────────────

  const hasData = workoutDays > 0;

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={st.container}
    >
      {/* ── Title ── */}
      <View style={st.titleRow}>
        <View>
          <Text style={st.title}>Weekly Recap</Text>
          <Text style={st.subtitle}>Rest day  •  Full breakdown below</Text>
        </View>
        <View style={st.restBadge}>
          <Text style={st.restBadgeText}>Rest 🌙</Text>
        </View>
      </View>

      {!hasData ? (
        <View style={st.emptyCard}>
          <Ionicons name="barbell-outline" size={40} color={COLORS.textTertiary} />
          <Text style={st.emptyText}>No workouts logged this week yet.</Text>
          <Text style={st.emptySubtext}>Start training and your stats will appear here every Sunday.</Text>
        </View>
      ) : (
        <>
          {/* ── Global Stats Row ── */}
          <View style={st.statsRow}>
            {[
              { label: 'Sessions', value: workoutDays, prevValue: prevWorkoutDays, unit: '', suffix: '/6' },
              { label: 'Total Sets', value: totalSets, prevValue: prevTotalSets, unit: '' },
              { label: 'Volume', value: Math.round(totalVolume / 1000), prevValue: Math.round(prevTotalVolume / 1000), unit: 'k kg' },
            ].map(({ label, value, prevValue, unit, suffix }) => (
              <View key={label} style={st.statCard}>
                <Text style={st.statValue}>{value}{unit}{suffix ?? ''}</Text>
                <Text style={st.statLabel}>{label}</Text>
                <ChangeBadge delta={value - prevValue} unit={unit} />
              </View>
            ))}
          </View>

          {/* ── Daily Volume Bar Chart ── */}
          <View style={st.card}>
            <Text style={st.sectionLabel}>DAILY VOLUME</Text>
            <View style={st.barChart}>
              {dailyVolume.map((vol, i) => {
                const pct = vol / maxDailyVol;
                const isSun = i === 6;
                return (
                  <View key={i} style={st.barCol}>
                    <View style={st.barTrack}>
                      <View
                        style={[
                          st.barFill,
                          {
                            height: `${Math.max(4, pct * 100)}%`,
                            backgroundColor: isSun
                              ? COLORS.textTertiary
                              : vol > 0 ? COLORS.accentPrimary : 'rgba(255,255,255,0.05)',
                            opacity: isSun ? 0.3 : 1,
                          },
                        ]}
                      />
                    </View>
                    <Text style={[st.barLabel, vol > 0 && !isSun && { color: COLORS.textMuted }]}>
                      {DAY_LABELS[i]}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>

          {/* ── Muscle Frequency Grid (Donut Rings) ── */}
          <View style={st.card}>
            <Text style={st.sectionLabel}>MUSCLE FREQUENCY</Text>
            <View style={st.muscleGrid}>
              {trainedMuscles.map(muscle => {
                const stats = thisWeekMuscle[muscle];
                const prev = prevWeekMuscle[muscle];
                const pct = Math.min(100, (stats.sets / 18) * 100); // 18 sets = 100%
                const color = MUSCLE_COLORS[muscle] ?? COLORS.accentPrimary;
                const delta = stats.sets - (prev?.sets ?? 0);
                return (
                  <View key={muscle} style={st.muscleCard}>
                    <View style={st.ringWrapper}>
                      <DonutRing pct={pct} color={color} size={62} strokeWidth={6} />
                      <View style={st.ringCenter}>
                        <Text style={[st.ringNum, { color }]}>{stats.sets}</Text>
                        <Text style={st.ringUnit}>sets</Text>
                      </View>
                    </View>
                    <Text style={st.muscleName}>{muscle}</Text>
                    <View style={st.muscleChangeRow}>
                      {delta !== 0 ? (
                        <Text style={{ fontSize: 10, color: delta > 0 ? COLORS.accentGreen : COLORS.error }}>
                          {delta > 0 ? '↑' : '↓'}{Math.abs(delta)}
                        </Text>
                      ) : (
                        <Text style={{ fontSize: 10, color: COLORS.textTertiary }}>—</Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          </View>

          {/* ── Muscle Set Bars ── */}
          <View style={st.card}>
            <Text style={st.sectionLabel}>SETS BY MUSCLE</Text>
            {ALL_MUSCLES.map(muscle => {
              const sets = thisWeekMuscle[muscle]?.sets ?? 0;
              const vol = thisWeekMuscle[muscle]?.totalKg ?? 0;
              const color = MUSCLE_COLORS[muscle] ?? COLORS.accentPrimary;
              const isTrained = sets > 0;
              return (
                <View key={muscle} style={st.muscleBarRow}>
                  <View style={st.muscleBarNameCol}>
                    <View style={[st.muscleDot, { backgroundColor: isTrained ? color : COLORS.border }]} />
                    <Text style={[st.muscleBarName, !isTrained && { color: COLORS.textTertiary }]}>
                      {muscle}
                    </Text>
                  </View>
                  <View style={st.muscleBarFill}>
                    <MiniBar value={sets} maxValue={maxSets} color={color} />
                  </View>
                  <Text style={[st.muscleBarSets, { color: isTrained ? COLORS.textPrimary : COLORS.textTertiary }]}>
                    {isTrained ? `${sets} sets` : '—'}
                  </Text>
                  {vol > 0 && (
                    <Text style={st.muscleBarVol}>{Math.round(vol / 1000 * 10) / 10}k</Text>
                  )}
                </View>
              );
            })}
          </View>

          {/* ── Untrained Muscles Warning ── */}
          {untrainedMuscles.length > 0 && (
            <View style={st.warningCard}>
              <View style={st.warningHeader}>
                <Ionicons name="warning-outline" size={14} color={COLORS.accentAmber} />
                <Text style={st.warningTitle}>NEEDS ATTENTION</Text>
              </View>
              <Text style={st.warningBody}>
                These muscle groups were not trained this week:
              </Text>
              <View style={st.chipRow}>
                {untrainedMuscles.map(m => (
                  <View key={m} style={st.chip}>
                    <Text style={st.chipText}>{m}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* ── Week vs Last Week Summary ── */}
          <View style={st.card}>
            <Text style={st.sectionLabel}>VS LAST WEEK</Text>
            {[
              {
                label: 'Workout Days',
                thisVal: workoutDays,
                prevVal: prevWorkoutDays,
                unit: 'days',
              },
              {
                label: 'Total Sets',
                thisVal: totalSets,
                prevVal: prevTotalSets,
                unit: 'sets',
              },
              {
                label: 'Volume',
                thisVal: Math.round(totalVolume),
                prevVal: Math.round(prevTotalVolume),
                unit: 'kg',
              },
            ].map(({ label, thisVal, prevVal, unit }) => {
              const delta = thisVal - prevVal;
              const pctChange = prevVal > 0 ? Math.round((delta / prevVal) * 100) : 0;
              return (
                <View key={label} style={st.compRow}>
                  <Text style={st.compLabel}>{label}</Text>
                  <View style={st.compRight}>
                    <Text style={st.compThis}>{thisVal} <Text style={st.compUnit}>{unit}</Text></Text>
                    <ChangeBadge delta={pctChange} unit="%" />
                  </View>
                </View>
              );
            })}
          </View>
        </>
      )}
      <View style={{ height: 80 }} />
    </ScrollView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const st = StyleSheet.create({
  container: {
    paddingHorizontal: 8,
    paddingBottom: 40,
  },

  // Title
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    marginTop: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.textPrimary,
    fontFamily: FONT_FAMILY.bold,
  },
  subtitle: {
    fontSize: 12,
    color: COLORS.textTertiary,
    marginTop: 2,
  },
  restBadge: {
    backgroundColor: 'rgba(165,153,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(165,153,255,0.2)',
    borderRadius: RADIUS.full,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  restBadgeText: {
    fontSize: 12,
    color: COLORS.accentPrimary,
    fontWeight: '600',
  },

  // Empty
  emptyCard: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  emptyText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textMuted,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 12,
    color: COLORS.textTertiary,
    textAlign: 'center',
    lineHeight: 18,
  },

  // Section label
  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.textTertiary,
    letterSpacing: 1.5,
    marginBottom: 14,
  },

  // Shared card
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },

  // Global stats
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    padding: 14,
    alignItems: 'center',
    gap: 3,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  statValue: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  statLabel: {
    fontSize: 10,
    color: COLORS.textTertiary,
    textAlign: 'center',
  },
  changeBadge: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  changeBadgeNeutral: {
    fontSize: 10,
    color: COLORS.textTertiary,
    marginTop: 2,
  },

  // Daily volume bar chart
  barChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 80,
    gap: 6,
  },
  barCol: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    height: '100%',
    justifyContent: 'flex-end',
  },
  barTrack: {
    flex: 1,
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: RADIUS.sm,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  barFill: {
    width: '100%',
    borderRadius: RADIUS.sm,
    minHeight: 4,
  },
  barLabel: {
    fontSize: 10,
    color: COLORS.textTertiary,
  },

  // Muscle donut grid
  muscleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  muscleCard: {
    width: '30%',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
  },
  ringWrapper: {
    position: 'relative',
    width: 62,
    height: 62,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringCenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringNum: {
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 18,
  },
  ringUnit: {
    fontSize: 8,
    color: COLORS.textTertiary,
    lineHeight: 10,
  },
  muscleName: {
    fontSize: 11,
    color: COLORS.textMuted,
    textAlign: 'center',
  },
  muscleChangeRow: {
    height: 14,
    justifyContent: 'center',
  },

  // Set bars
  muscleBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  muscleBarNameCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    width: 88,
  },
  muscleDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  muscleBarName: {
    fontSize: 12,
    color: COLORS.textMuted,
    flex: 1,
  },
  muscleBarFill: {
    flex: 1,
  },
  muscleBarSets: {
    fontSize: 11,
    width: 44,
    textAlign: 'right',
  },
  muscleBarVol: {
    fontSize: 10,
    color: COLORS.textTertiary,
    width: 34,
    textAlign: 'right',
  },

  // Untrained warning
  warningCard: {
    backgroundColor: 'rgba(255,159,77,0.07)',
    borderRadius: RADIUS.xl,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,159,77,0.2)',
    gap: 8,
  },
  warningHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  warningTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.accentAmber,
    letterSpacing: 1.5,
  },
  warningBody: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: RADIUS.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,159,77,0.15)',
  },
  chipText: {
    fontSize: 11,
    color: COLORS.accentAmber,
    fontWeight: '600',
  },

  // Comparison table
  compRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  compLabel: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
  compRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  compThis: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },
  compUnit: {
    fontSize: 11,
    color: COLORS.textTertiary,
    fontWeight: '400',
  },
});
