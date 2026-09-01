/**
 * GymProgressScreen.tsx — ZenTrack Mobile
 *
 * Full Long-Term Gym Analytics Hub (Direct OpenGym Architecture):
 * - Time Ranges: 7d | 30d | 90d | 1y | All
 * - Top 4 KPI Tiles: Workouts, Total Volume (kg), Cardio Output, Avg Effort
 * - Total Volume Tonnage Progression Area Chart
 * - Dual-View Anatomical BodyMap (Muscle Balance, Fatigue, Strength)
 * - Effort & Hypertrophy Stimulus Card (Proximity to Failure & Histogram)
 * - 3-in-1 Exercise Deep-Dive Hub (Top Set with Effort Opacity, Est. 1RM, Effort Trend)
 * - Scientific Rep-Max Breakdown Table (1RM - 12RM)
 * - 5-Session Historical Audit Logs
 * - Cardio & Conditioning Performance Pods
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Defs, LinearGradient, Stop, Path, Line, G } from 'react-native-svg';
import { StatusBar } from 'expo-status-bar';

import { COLORS, FONT_FAMILY, RADIUS, SPACE } from '../../theme/tokens';
import { useWellnessData } from '../../contexts/domains/WellnessContext';
import { GymNavigationParamList } from '../../types/gym.types';
import { useTheme } from '../../contexts/ThemeContext';
import { hapticLight } from '../../utils/haptics';
import { makeGymProgressStyles } from './gymProgressStyles';
import AnatomicalBodyMapCard from '../../components/Gym/AnatomicalBodyMapCard';
import EffortDistributionCard from '../../components/Gym/Charts/EffortDistributionCard';
import GymProgressCardio from '../../components/Gym/GymProgressCardio';
import GymProgressSkeleton from '../../components/Gym/GymProgressSkeleton';
import { estimate1RM, calculateRepMaxTable } from '../../services/oneRepMaxEngine';
import { calculateEffortSummary } from '../../services/effortEngine';
import { computeOrGetHotCache, generateDatasetFingerprint } from '../../utils/hotCacheStore';

const { width } = Dimensions.get('window');
type TimeRange = '7d' | '30d' | '90d' | '1y' | 'all';
type ExCurveMode = '1rm' | 'top' | 'effort';

const CHART_HEIGHT = 160;
const CHART_WIDTH = width - 48;
const PADDING = 18;

// ─── Pure Helper: Cubic Bezier Smoothing for SVG Path ─────────────────────────
function generateSmoothSvgPath(coords: Array<{ x: number; y: number }>): string {
  if (coords.length === 0) return '';
  let path = `M ${coords[0].x},${coords[0].y}`;
  for (let i = 0; i < coords.length - 1; i++) {
    const xMid = (coords[i].x + coords[i + 1].x) / 2;
    path += ` C ${xMid},${coords[i].y} ${xMid},${coords[i + 1].y} ${coords[i + 1].x},${coords[i + 1].y}`;
  }
  return path;
}

export default function GymProgressScreen() {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeGymProgressStyles(colors, isDark), [colors, isDark]);
  const navigation = useNavigation<NativeStackNavigationProp<GymNavigationParamList>>();
  const { gymLogs, gymLogsReady } = useWellnessData();
  const isInitialLoading = !gymLogsReady && (!gymLogs || gymLogs.length === 0);

  const [timeRange, setTimeRange] = useState<TimeRange>('30d');
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null);
  const [exCurveMode, setExCurveMode] = useState<ExCurveMode>('1rm');

  // Entrance Animations
  const animCards = useRef(new Animated.Value(0)).current;
  const animChart = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    animCards.setValue(0);
    animChart.setValue(0);

    Animated.stagger(80, [
      Animated.spring(animCards, { toValue: 1, tension: 50, friction: 8, useNativeDriver: true }),
      Animated.spring(animChart, { toValue: 1, tension: 50, friction: 8, useNativeDriver: true }),
    ]).start();
  }, [timeRange]);

  // ── Filter Logs Based on Time Range (Hot-Cached) ───────────────────────────
  const { filteredLogs, kpi, volumeTimeline, cardioMetrics, allCompletedSets } = useMemo(() => {
    const cacheKey = `gym_prog_${timeRange}_${generateDatasetFingerprint(gymLogs)}`;
    return computeOrGetHotCache(cacheKey, () => {
      const today = new Date();
      const daysToSubtract =
        timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : timeRange === '90d' ? 90 : timeRange === '1y' ? 365 : 0;

      let fLogs = (gymLogs || []).slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      if (daysToSubtract > 0) {
        const cutoffDate = new Date(today);
        cutoffDate.setDate(today.getDate() - daysToSubtract);
        const cutoffStr = cutoffDate.toISOString().slice(0, 10);
        fLogs = fLogs.filter(l => l.date >= cutoffStr);
      }

      let totalWorkouts = 0;
      let totalVolumeKg = 0;
      let totalCardioMins = 0;
      let cardioDistance = 0;
      let cardioCalories = 0;
      const completedSetsList: any[] = [];
      const dailyVolumeMap = new Map<string, number>();

      fLogs.forEach(log => {
        let isWorkout = false;
        let sessionVol = 0;

        log.exercises?.forEach(ex => {
          if (ex.skipped) return;
          ex.setsLog?.forEach((s: any) => {
            if (s.completed) {
              completedSetsList.push(s);
              const w = Number(s.weight) || 0;
              const r = Number(s.reps) || 0;
              if (w > 0 && r > 0) {
                sessionVol += w * r;
                isWorkout = true;
              }
            }
          });
        });

        totalVolumeKg += sessionVol;
        if (sessionVol > 0) {
          dailyVolumeMap.set(log.date, (dailyVolumeMap.get(log.date) || 0) + sessionVol);
        }

        log.cardio?.forEach(c => {
          if (c.completed) {
            if (c.durationMinutes) totalCardioMins += c.durationMinutes;
            if (c.distanceKm) cardioDistance += c.distanceKm;
            if (c.calories) cardioCalories += c.calories;
            isWorkout = true;
          }
        });

        if (isWorkout) totalWorkouts++;
      });

      // Volume timeline points
      const vTimeline = Array.from(dailyVolumeMap.entries()).map(([dateStr, vol]) => {
        const parts = dateStr.split('-');
        const shortDate = `${parts[1]}/${parts[2]}`;
        return { dateStr, shortDate, volume: vol };
      });

      return {
        filteredLogs: fLogs,
        kpi: { totalWorkouts, totalVolumeKg, totalCardioMins },
        volumeTimeline: vTimeline,
        cardioMetrics: { distance: cardioDistance, calories: cardioCalories },
        allCompletedSets: completedSetsList,
      };
    });
  }, [gymLogs, timeRange]);

  const windowDays = useMemo(() => {
    return timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : timeRange === '90d' ? 90 : timeRange === '1y' ? 365 : 0;
  }, [timeRange]);

  const effortSummary = useMemo(() => calculateEffortSummary(allCompletedSets), [allCompletedSets]);

  // ── Macro Hypertrophy Volume Distribution across Major Muscle Groups ─────────
  const macroMuscleStats = useMemo(() => {
    const cacheKey = `macro_stats_${generateDatasetFingerprint(filteredLogs)}`;
    return computeOrGetHotCache(cacheKey, () => {
      const map: Record<string, { name: string; sets: number; volumeKg: number; color: string }> = {
        Back: { name: 'Back & Lats', sets: 0, volumeKg: 0, color: '#89dceb' },
        Chest: { name: 'Chest & Pecs', sets: 0, volumeKg: 0, color: '#a599ff' },
        Quads: { name: 'Quads & Squats', sets: 0, volumeKg: 0, color: '#5eda9e' },
        GlutesHams: { name: 'Glutes & Hamstrings', sets: 0, volumeKg: 0, color: '#ff9f4d' },
        Shoulders: { name: 'Shoulders & Delts', sets: 0, volumeKg: 0, color: '#ffd32a' },
        Arms: { name: 'Arms (Biceps / Triceps)', sets: 0, volumeKg: 0, color: '#b8afff' },
        Core: { name: 'Core & Calves', sets: 0, volumeKg: 0, color: '#8e8e93' },
      };

      let totalSetsCount = 0;
      let totalKgSum = 0;

      (filteredLogs || []).forEach(log => {
        (log.exercises || []).forEach(ex => {
          if (ex.skipped) return;
          const m = (ex.muscle || '').toLowerCase();
          let targetKey = 'Back';
          if (m.includes('chest') || m.includes('pec')) targetKey = 'Chest';
          else if (m.includes('quad') || m.includes('vmo')) targetKey = 'Quads';
          else if (m.includes('ham') || m.includes('glute') || m.includes('rdl') || m.includes('hip')) targetKey = 'GlutesHams';
          else if (m.includes('shoulder') || m.includes('delt') || m.includes('trap')) targetKey = 'Shoulders';
          else if (m.includes('bicep') || m.includes('tricep') || m.includes('brach') || m.includes('arm') || m.includes('forearm')) targetKey = 'Arms';
          else if (m.includes('abs') || m.includes('core') || m.includes('calf') || m.includes('calves') || m.includes('oblique')) targetKey = 'Core';
          else targetKey = 'Back';

          (ex.setsLog || []).forEach((s: any) => {
            if (s.completed) {
              const w = Number(s.weight) || 0;
              const r = Number(s.reps) || 0;
              const vol = w * r;
              map[targetKey].sets += 1;
              map[targetKey].volumeKg += vol;
              totalSetsCount += 1;
              totalKgSum += vol;
            }
          });
        });
      });

      const list = Object.values(map)
        .filter(item => item.sets > 0)
        .sort((a, b) => b.volumeKg - a.volumeKg)
        .map(item => ({
          ...item,
          percentage: totalKgSum > 0 ? Math.round((item.volumeKg / totalKgSum) * 100) : 0,
        }));

      return { list, totalSetsCount, totalKgSum };
    });
  }, [filteredLogs]);

  // ── Total Volume Tonnage Line Coordinates ────────────────────────────────────
  const { volCoords, maxVol } = useMemo(() => {
    if (volumeTimeline.length === 0) return { volCoords: [], maxVol: 0 };
    const maxV = Math.max(...volumeTimeline.map(d => d.volume), 100);

    const coords = volumeTimeline.map((d, i) => {
      const x = PADDING + (i / Math.max(1, volumeTimeline.length - 1)) * (CHART_WIDTH - PADDING * 2);
      const y = CHART_HEIGHT - PADDING - (d.volume / maxV) * (CHART_HEIGHT - PADDING * 2);
      return { x, y, data: d };
    });
    return { volCoords: coords, maxVol: maxV };
  }, [volumeTimeline]);

  const volSmoothPath = useMemo(() => generateSmoothSvgPath(volCoords), [volCoords]);

  // ── All Distinct Exercises in History ────────────────────────────────────────
  const allExerciseNames = useMemo(() => {
    const set = new Set<string>();
    (gymLogs || []).forEach(log => {
      log.exercises?.forEach(ex => {
        if (ex.name) set.add(ex.name);
      });
    });
    return Array.from(set).sort();
  }, [gymLogs]);

  useEffect(() => {
    if (allExerciseNames.length > 0 && (!selectedExercise || !allExerciseNames.includes(selectedExercise))) {
      setSelectedExercise(allExerciseNames[0]);
    }
  }, [allExerciseNames, selectedExercise]);

  // ── Selected Exercise Deep-Dive Data (Hot-Cached) ───────────────────────────
  const exerciseSessions = useMemo(() => {
    if (!selectedExercise) return [];
    const cacheKey = `ex_sessions_${selectedExercise}_${generateDatasetFingerprint(gymLogs)}`;
    return computeOrGetHotCache(cacheKey, () => {
      const sessions: any[] = [];
      const sorted = (gymLogs || []).slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));

      for (const log of sorted) {
        for (const ex of log.exercises || []) {
          if (ex.skipped) continue;
          if (ex.name === selectedExercise) {
            const completedSets = (ex.setsLog || []).filter((s: any) => s.completed && !s.isWarmup);
            if (completedSets.length > 0) {
              const topWeight = Math.max(0, ...completedSets.map((s: any) => Number(s.weight) || 0));
              const topSet = completedSets.find((s: any) => Number(s.weight) === topWeight) || completedSets[0];
              const maxReps = Number(topSet?.reps) || 0;
              const oneRM = estimate1RM(topWeight, maxReps, 'epley');

              let rirSum = 0;
              let rirCount = 0;
              for (const s of completedSets) {
                if (s.rir !== undefined && s.rir !== null) {
                  rirSum += Number(s.rir);
                  rirCount++;
                } else if (s.rpe !== undefined && s.rpe !== null) {
                  rirSum += 10 - Number(s.rpe);
                  rirCount++;
                }
              }
              const avgRIR = rirCount > 0 ? Math.round((rirSum / rirCount) * 10) / 10 : 2;

              const parts = (log.date || '').split('-');
              const shortDate = parts.length === 3 ? `${parts[1]}/${parts[2]}` : log.date;

              sessions.push({
                date: log.date,
                shortDate,
                topWeight,
                maxReps,
                oneRM,
                avgRIR,
                sets: completedSets,
              });
            }
          }
        }
      }
      return sessions;
    });
  }, [gymLogs, selectedExercise]);

  // All-time best 1RM for selected exercise
  const exerciseBest = useMemo(() => {
    let best1RM = 0;
    let heaviestWeight = 0;
    let bestReps = 0;
    let bestDate = '';

    for (const s of exerciseSessions) {
      if (s.oneRM > best1RM) {
        best1RM = s.oneRM;
        heaviestWeight = s.topWeight;
        bestReps = s.maxReps;
        bestDate = s.date;
      }
    }
    return { best1RM, heaviestWeight, bestReps, bestDate };
  }, [exerciseSessions]);

  const repMaxTable = useMemo(() => calculateRepMaxTable(exerciseBest.best1RM), [exerciseBest.best1RM]);
  const recent5Sessions = useMemo(() => exerciseSessions.slice(-5).reverse(), [exerciseSessions]);

  // Exercise Chart Coordinates
  const { exCoords } = useMemo(() => {
    if (exerciseSessions.length === 0) return { exCoords: [] };
    const pts = exerciseSessions.slice(-8);
    const values = pts.map(p =>
      exCurveMode === 'top' ? p.topWeight : exCurveMode === '1rm' ? p.oneRM : p.avgRIR
    );
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const range = maxVal - minVal || 1;

    const coords = pts.map((p, idx) => {
      const val = exCurveMode === 'top' ? p.topWeight : exCurveMode === '1rm' ? p.oneRM : p.avgRIR;
      const x = PADDING + (idx / Math.max(1, pts.length - 1)) * (CHART_WIDTH - PADDING * 2);
      const y = CHART_HEIGHT - PADDING - ((val - minVal) / range) * (CHART_HEIGHT - PADDING * 2);
      return { x, y, data: p, val };
    });
    return { exCoords: coords };
  }, [exerciseSessions, exCurveMode]);

  const exSmoothPath = useMemo(() => generateSmoothSvgPath(exCoords), [exCoords]);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <StatusBar style={isDark ? 'light' : 'dark'} backgroundColor={colors.background} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Gym Analytics</Text>
        <View style={{ width: 32 }} />
      </View>

      {/* Time Range Filter Tabs */}
      <View style={styles.filterTabs}>
        {(['7d', '30d', '90d', '1y', 'all'] as TimeRange[]).map(r => (
          <TouchableOpacity
            key={r}
            style={[styles.tab, timeRange === r && styles.tabActive]}
            onPress={() => {
              hapticLight();
              setTimeRange(r);
            }}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabText, timeRange === r && styles.tabTextActive]}>
              {r === '7d' ? '7D' : r === '30d' ? '30D' : r === '90d' ? '90D' : r === '1y' ? '1Y' : 'All'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {isInitialLoading ? (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <GymProgressSkeleton />
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* 1. ── Top 4 KPI Dashboard Tiles ────────────────────────────────────── */}
        <Animated.View
          style={[
            styles.kpiRow,
            {
              opacity: animCards,
              transform: [{ translateY: animCards.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
            },
          ]}
        >
          {/* 1. Workouts */}
          <View style={styles.kpiCard}>
            <View style={[styles.kpiIconBox, { backgroundColor: isDark ? 'rgba(165,153,255,0.1)' : 'rgba(108,92,231,0.1)' }]}>
              <Ionicons name="fitness-outline" size={14} color={colors.accentPrimary} />
            </View>
            <View style={styles.kpiValueRow}>
              <Text style={styles.kpiValue}>{kpi.totalWorkouts}</Text>
            </View>
            <Text style={styles.kpiLabel} numberOfLines={1}>Workouts</Text>
          </View>

          {/* 2. Volume */}
          <View style={styles.kpiCard}>
            <View style={[styles.kpiIconBox, { backgroundColor: isDark ? 'rgba(94,218,158,0.1)' : 'rgba(5,150,105,0.1)' }]}>
              <Ionicons name="barbell-outline" size={14} color={colors.accentGreen} />
            </View>
            <View style={styles.kpiValueRow}>
              <Text style={styles.kpiValue}>
                {kpi.totalVolumeKg >= 1000 ? (kpi.totalVolumeKg / 1000).toFixed(1) : kpi.totalVolumeKg}
              </Text>
              {kpi.totalVolumeKg >= 1000 && <Text style={styles.kpiUnit}>k</Text>}
            </View>
            <Text style={styles.kpiLabel} numberOfLines={1}>Volume (kg)</Text>
          </View>

          {/* 3. Avg Effort (RIR) */}
          <View style={styles.kpiCard}>
            <View style={[styles.kpiIconBox, { backgroundColor: 'rgba(255, 159, 77, 0.12)' }]}>
              <Ionicons name="flame-outline" size={14} color="#ff9f4d" />
            </View>
            <View style={styles.kpiValueRow}>
              <Text style={[styles.kpiValue, { color: '#ff9f4d' }]}>
                {effortSummary.averageRIR !== null ? effortSummary.averageRIR : '2'}
              </Text>
              <Text style={[styles.kpiUnit, { color: '#ff9f4d' }]}> RIR</Text>
            </View>
            <Text style={styles.kpiLabel} numberOfLines={1}>Avg Effort</Text>
          </View>

          {/* 4. Cardio */}
          <View style={styles.kpiCard}>
            <View style={[styles.kpiIconBox, { backgroundColor: 'rgba(137, 220, 235, 0.12)' }]}>
              <Ionicons name="stopwatch-outline" size={14} color={colors.accentBlue} />
            </View>
            <View style={styles.kpiValueRow}>
              <Text style={styles.kpiValue}>{kpi.totalCardioMins}</Text>
              <Text style={styles.kpiUnit}>m</Text>
            </View>
            <Text style={styles.kpiLabel} numberOfLines={1}>Cardio</Text>
          </View>
        </Animated.View>

        {/* 2. ── Total Volume Tonnage Progression Curve (Replacing Duration) ───── */}
        <Animated.View
          style={[
            styles.glassCard,
            {
              opacity: animChart,
              transform: [{ translateY: animChart.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
            },
          ]}
        >
          <View style={styles.cardHeaderRow}>
            <View>
              <Text style={styles.cardTitle}>Volume Progression</Text>
              <Text style={styles.cardSubtitle}>Total tonnage moved per session (kg)</Text>
            </View>
            {maxVol > 0 && (
              <View style={styles.cardHeaderBadge}>
                <Text style={styles.cardHeaderBadgeText}>
                  PEAK {maxVol >= 1000 ? `${(maxVol / 1000).toFixed(1)}k` : maxVol}kg
                </Text>
              </View>
            )}
          </View>

          <View style={styles.svgWrapper}>
            {volCoords.length > 1 ? (
              <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
                <Defs>
                  <LinearGradient id="volLineGrad" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor={colors.accentPrimary} stopOpacity="0.35" />
                    <Stop offset="1" stopColor={colors.accentPrimary} stopOpacity="0.0" />
                  </LinearGradient>
                </Defs>

                <Line x1={0} y1={PADDING} x2={CHART_WIDTH} y2={PADDING} stroke={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'} strokeWidth="1" strokeDasharray="4 4" />
                <Line x1={0} y1={CHART_HEIGHT / 2} x2={CHART_WIDTH} y2={CHART_HEIGHT / 2} stroke={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'} strokeWidth="1" strokeDasharray="4 4" />
                <Line x1={0} y1={CHART_HEIGHT - PADDING} x2={CHART_WIDTH} y2={CHART_HEIGHT - PADDING} stroke={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'} strokeWidth="1" strokeDasharray="4 4" />

                <Path d={`${volSmoothPath} L ${volCoords[volCoords.length - 1].x},${CHART_HEIGHT - PADDING} L ${volCoords[0].x},${CHART_HEIGHT - PADDING} Z`} fill="url(#volLineGrad)" />
                <Path d={volSmoothPath} fill="none" stroke={colors.accentPrimary} strokeWidth="6" strokeOpacity="0.15" strokeLinecap="round" strokeLinejoin="round" />
                <Path d={volSmoothPath} fill="none" stroke={colors.accentPrimary} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

                {volCoords.map((pt, idx) => (
                  <Circle key={idx} cx={pt.x} cy={pt.y} r={3.5} fill={colors.surface} stroke={colors.accentPrimary} strokeWidth={2} />
                ))}
              </Svg>
            ) : (
              <View style={styles.emptyBox}>
                <Ionicons name="trending-up" size={24} color={colors.textTertiary} />
                <Text style={styles.emptyText}>Log workouts to plot volume accumulation curves.</Text>
              </View>
            )}

            {volumeTimeline.length > 0 && (
              <View style={styles.chartDateAxis}>
                <Text style={styles.axisDateText}>{volumeTimeline[0]?.shortDate}</Text>
                {volumeTimeline.length > 2 && (
                  <Text style={styles.axisDateText}>
                    {volumeTimeline[Math.floor(volumeTimeline.length / 2)]?.shortDate}
                  </Text>
                )}
                {volumeTimeline.length > 1 && (
                  <Text style={styles.axisDateText}>
                    {volumeTimeline[volumeTimeline.length - 1]?.shortDate}
                  </Text>
                )}
              </View>
            )}
          </View>
        </Animated.View>

        {/* 3. ── Macro Hypertrophy Volume Distribution across Major Muscle Groups ── */}
        {macroMuscleStats.list.length > 0 && (
          <View style={styles.glassCard}>
            <View style={styles.cardHeaderRow}>
              <View>
                <Text style={styles.cardTitle}>Hypertrophy Volume Distribution</Text>
                <Text style={styles.cardSubtitle}>
                  {macroMuscleStats.totalSetsCount} total sets · {timeRange.toUpperCase()} training investment
                </Text>
              </View>
              <View style={styles.cardHeaderBadge}>
                <Text style={styles.cardHeaderBadgeText}>
                  {macroMuscleStats.totalKgSum >= 1000
                    ? `${(macroMuscleStats.totalKgSum / 1000).toFixed(1)}k`
                    : macroMuscleStats.totalKgSum} KG
                </Text>
              </View>
            </View>

            <View style={{ marginTop: 12, gap: 12 }}>
              {macroMuscleStats.list.map(m => (
                <View key={m.name} style={{ gap: 5 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: m.color }} />
                      <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 13, color: colors.textPrimary }}>
                        {m.name}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                      <Text style={{ fontFamily: FONT_FAMILY.medium, fontSize: 12, color: colors.textTertiary }}>
                        {m.sets} {m.sets === 1 ? 'set' : 'sets'} ({m.volumeKg >= 1000 ? `${(m.volumeKg / 1000).toFixed(1)}k` : m.volumeKg} kg)
                      </Text>
                      <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 12, color: m.color }}>
                        {m.percentage}%
                      </Text>
                    </View>
                  </View>

                  {/* Progress track */}
                  <View style={{ height: 6, backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                    <View
                      style={{
                        height: '100%',
                        width: `${Math.min(100, Math.max(4, m.percentage))}%`,
                        backgroundColor: m.color,
                        borderRadius: 3,
                      }}
                    />
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* 4. ── Dual-View Anatomical BodyMap (Macro Analytics Engine) ── */}
        <AnatomicalBodyMapCard
          gymLogs={filteredLogs as any}
          timeWindowDays={windowDays as any}
          variant="analytics"
          defaultMode="volume"
        />

        {/* 5. ── Effort & Hypertrophy Stimulus Card ────────────────────────────── */}
        <EffortDistributionCard weekLogs={filteredLogs as any} />

        {/* 6. ── 3-in-1 Exercise Deep-Dive Hub ────────────────────────────────── */}
        <View style={styles.glassCard}>
          <Text style={styles.cardTitle}>Exercise Performance Hub</Text>
          <Text style={styles.cardSubtitle}>Multi-curve 1RM, top loads, and set audit</Text>

          {allExerciseNames.length > 0 ? (
            <View style={{ marginTop: SPACE.md }}>
              {/* Exercise Selector Horizontal Pills */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillScroll}>
                {allExerciseNames.map(ex => (
                  <TouchableOpacity
                    key={ex}
                    style={[styles.pill, selectedExercise === ex && styles.pillActive]}
                    onPress={() => {
                      hapticLight();
                      setSelectedExercise(ex);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.pillText, selectedExercise === ex && styles.pillTextActive]}>
                      {ex}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* All-Time Peak PR Banner */}
              {exerciseBest.best1RM > 0 && (
                <View
                  style={{
                    backgroundColor: 'rgba(230, 200, 117, 0.1)',
                    borderColor: 'rgba(230, 200, 117, 0.25)',
                    borderWidth: 1,
                    borderRadius: RADIUS.md,
                    padding: 12,
                    marginTop: 8,
                    marginBottom: 12,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="trophy" size={13} color="#e6c875" />
                    <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 11, color: '#e6c875' }}>ALL-TIME BEST</Text>
                  </View>
                  <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 18, color: colors.textPrimary, marginTop: 4 }}>
                    {exerciseBest.best1RM} kg <Text style={{ fontSize: 12, color: colors.textMuted }}>(Est. 1RM)</Text>
                  </Text>
                  <Text style={{ fontFamily: FONT_FAMILY.body, fontSize: 10.5, color: colors.textTertiary, marginTop: 2 }}>
                    From {exerciseBest.heaviestWeight}kg × {exerciseBest.bestReps} reps • {exerciseBest.bestDate}
                  </Text>
                </View>
              )}

              {/* 3-Curve Switcher */}
              <View
                style={{
                  flexDirection: 'row',
                  borderRadius: RADIUS.md,
                  backgroundColor: isDark ? '#2C2C2E' : colors.surface2,
                  padding: 3,
                  marginBottom: SPACE.md,
                }}
              >
                {(['1rm', 'top', 'effort'] as ExCurveMode[]).map(mode => (
                  <TouchableOpacity
                    key={mode}
                    onPress={() => {
                      hapticLight();
                      setExCurveMode(mode);
                    }}
                    style={{
                      flex: 1,
                      paddingVertical: 6,
                      alignItems: 'center',
                      borderRadius: 8,
                      backgroundColor: exCurveMode === mode ? (isDark ? 'rgba(165, 153, 255, 0.2)' : '#ffffff') : 'transparent',
                    }}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={{
                        fontFamily: exCurveMode === mode ? FONT_FAMILY.bold : FONT_FAMILY.medium,
                        fontSize: 12,
                        color: exCurveMode === mode ? colors.accentPrimary : colors.textMuted,
                      }}
                    >
                      {mode === '1rm' ? 'Est. 1RM' : mode === 'top' ? 'Top Set' : 'Effort (RIR)'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Progression Chart */}
              {exCoords.length > 1 ? (
                <View style={styles.svgWrapper}>
                  <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
                    <Defs>
                      <LinearGradient id="exLineGrad" x1="0" y1="0" x2="0" y2="1">
                        <Stop offset="0" stopColor={exCurveMode === 'effort' ? '#ff9f4d' : '#5eda9e'} stopOpacity="0.35" />
                        <Stop offset="1" stopColor={exCurveMode === 'effort' ? '#ff9f4d' : '#5eda9e'} stopOpacity="0.0" />
                      </LinearGradient>
                    </Defs>

                    <Line x1={0} y1={PADDING} x2={CHART_WIDTH} y2={PADDING} stroke={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'} strokeWidth="1" strokeDasharray="4 4" />
                    <Line x1={0} y1={CHART_HEIGHT / 2} x2={CHART_WIDTH} y2={CHART_HEIGHT / 2} stroke={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'} strokeWidth="1" strokeDasharray="4 4" />
                    <Line x1={0} y1={CHART_HEIGHT - PADDING} x2={CHART_WIDTH} y2={CHART_HEIGHT - PADDING} stroke={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'} strokeWidth="1" strokeDasharray="4 4" />

                    <Path d={`${exSmoothPath} L ${exCoords[exCoords.length - 1].x},${CHART_HEIGHT - PADDING} L ${exCoords[0].x},${CHART_HEIGHT - PADDING} Z`} fill="url(#exLineGrad)" />
                    <Path d={exSmoothPath} fill="none" stroke={exCurveMode === 'effort' ? '#ff9f4d' : '#5eda9e'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

                    {exCoords.map((c, i) => (
                      <Circle
                        key={i}
                        cx={c.x}
                        cy={c.y}
                        r={4}
                        fill={exCurveMode === 'effort' ? '#ff9f4d' : '#5eda9e'}
                        opacity={exCurveMode === 'top' ? Math.max(0.35, 1 - (c.data.avgRIR || 0) / 4) : 1}
                      />
                    ))}
                  </Svg>

                  <View style={styles.chartDateAxis}>
                    <Text style={styles.axisDateText}>{exCoords[0]?.data.shortDate}</Text>
                    {exCoords.length > 2 && (
                      <Text style={styles.axisDateText}>{exCoords[Math.floor((exCoords.length - 1) / 2)]?.data.shortDate}</Text>
                    )}
                    <Text style={styles.axisDateText}>{exCoords[exCoords.length - 1]?.data.shortDate}</Text>
                  </View>
                </View>
              ) : (
                <View style={[styles.emptyBox, { marginTop: SPACE.md }]}>
                  <Ionicons name="stats-chart" size={24} color={colors.textTertiary} />
                  <Text style={styles.emptyText}>Log 2+ sessions to generate progression curves.</Text>
                </View>
              )}

              {/* Scientific Rep-Max Table */}
              <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 13, color: colors.textPrimary, marginTop: 16, marginBottom: 8 }}>
                Scientific Rep-Max Targets
              </Text>
              <View
                style={{
                  backgroundColor: isDark ? '#141318' : 'rgba(0,0,0,0.03)',
                  borderRadius: RADIUS.md,
                  borderWidth: 1,
                  borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
                  padding: 10,
                  marginBottom: 12,
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }}>
                  <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 10, color: colors.textTertiary }}>REPS</Text>
                  <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 10, color: colors.textTertiary }}>% 1RM</Text>
                  <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 10, color: colors.textTertiary, textAlign: 'right' }}>WEIGHT</Text>
                </View>
                {repMaxTable.map(tier => (
                  <View key={tier.reps} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
                    <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 11.5, color: colors.textPrimary }}>{tier.reps} RM</Text>
                    <Text style={{ fontFamily: FONT_FAMILY.body, fontSize: 11, color: colors.textMuted }}>{tier.percentage}%</Text>
                    <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 11.5, color: colors.accentPrimary, textAlign: 'right' }}>{tier.weight} kg</Text>
                  </View>
                ))}
              </View>

              {/* Recent 5 Sessions */}
              <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 13, color: colors.textPrimary, marginTop: 8, marginBottom: 8 }}>
                Recent Session Logs
              </Text>
              <View style={{ gap: 6 }}>
                {recent5Sessions.map((sess, idx) => (
                  <View
                    key={idx}
                    style={{
                      backgroundColor: isDark ? '#141318' : 'rgba(0,0,0,0.03)',
                      borderRadius: RADIUS.md,
                      borderWidth: 1,
                      borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
                      padding: 10,
                    }}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                      <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 11.5, color: colors.textPrimary }}>{sess.date}</Text>
                      <Text style={{ fontFamily: FONT_FAMILY.medium, fontSize: 11, color: colors.accentPrimary }}>
                        Peak: {sess.topWeight}kg × {sess.maxReps}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                      {sess.sets.map((s: any, sIdx: number) => (
                        <View key={sIdx} style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 5 }}>
                          <Text style={{ fontFamily: FONT_FAMILY.body, fontSize: 10.5, color: colors.textSecondary }}>
                            {s.weight}kg × {s.reps}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                ))}
              </View>
            </View>
          ) : (
            <View style={styles.emptyBox}>
              <Ionicons name="barbell-outline" size={24} color={colors.textTertiary} />
              <Text style={styles.emptyText}>No exercises logged in this period.</Text>
            </View>
          )}
        </View>

        {/* 6. ── Cardio Performance Recap ──────────────────────────────────────── */}
        {cardioMetrics.distance > 0 || kpi.totalCardioMins > 0 ? (
          <View style={styles.glassCard}>
            <Text style={styles.cardTitle}>Cardio Performance</Text>
            <Text style={styles.cardSubtitle}>Aerobic and conditioning output</Text>
            <GymProgressCardio
              totalCardioMins={kpi.totalCardioMins}
              calories={cardioMetrics.calories}
              distance={cardioMetrics.distance}
              styles={styles}
            />
          </View>
        ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
