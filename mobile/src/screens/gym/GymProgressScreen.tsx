import React, { useState, useMemo, useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Dimensions, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Defs, LinearGradient, Stop, Path, G } from 'react-native-svg';
import { StatusBar } from 'expo-status-bar';

import { SPACE } from '../../theme/tokens';
import { useWellnessData } from '../../contexts/domains/WellnessContext';
import { GymNavigationParamList } from '../../types/gym.types';
import { useTheme } from '../../contexts/ThemeContext';

// Extracted Sub-Components & Styles
import { makeGymProgressStyles } from './gymProgressStyles';
import GymProgressDonut from '../../components/Gym/GymProgressDonut';
import GymProgressCardio from '../../components/Gym/GymProgressCardio';

const { width } = Dimensions.get('window');
type TimeRange = '7d' | '30d' | '90d';

const CHART_HEIGHT = 180;
const CHART_WIDTH = width - 48;
const PADDING = 20;

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
  const { gymLogs } = useWellnessData();

  const [timeRange, setTimeRange] = useState<TimeRange>('7d');
  const [selectedMuscle, setSelectedMuscle] = useState<string | null>(null);
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null);

  // Staggered Entrance Animations
  const animCards = useRef(new Animated.Value(0)).current;
  const animChart = useRef(new Animated.Value(0)).current;
  const animDonut = useRef(new Animated.Value(0)).current;
  const animCardio = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    animCards.setValue(0);
    animChart.setValue(0);
    animDonut.setValue(0);
    animCardio.setValue(0);

    Animated.stagger(90, [
      Animated.spring(animCards, { toValue: 1, tension: 50, friction: 8, useNativeDriver: true }),
      Animated.spring(animChart, { toValue: 1, tension: 50, friction: 8, useNativeDriver: true }),
      Animated.spring(animDonut, { toValue: 1, tension: 50, friction: 8, useNativeDriver: true }),
      Animated.spring(animCardio, { toValue: 1, tension: 50, friction: 8, useNativeDriver: true }),
    ]).start();
  }, [timeRange]);

  // Data Processing
  const { filteredLogs, kpi, lineChartData, donutData, cardioMetrics } = useMemo(() => {
    const today = new Date();
    const daysToSubtract = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
    const cutoffDate = new Date(today);
    cutoffDate.setDate(today.getDate() - daysToSubtract);
    const cutoffStr = cutoffDate.toISOString().slice(0, 10);

    const fLogs = gymLogs.filter(l => l.date >= cutoffStr).sort((a, b) => a.date.localeCompare(b.date));

    let totalWorkouts = 0;
    let totalVolumeKg = 0;
    let totalCardioMins = 0;
    let cardioDistance = 0;
    let cardioCalories = 0;

    const dailyDurationMap = new Map<string, number>();
    const volumeByMuscle: Record<string, number> = {
      Chest: 0, Back: 0, Legs: 0, Shoulders: 0, Arms: 0, Core: 0
    };

    const allDatesInRange: string[] = [];
    for (let i = daysToSubtract - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dStr = d.toISOString().slice(0, 10);
      allDatesInRange.push(dStr);
      dailyDurationMap.set(dStr, 0);
    }

    fLogs.forEach(log => {
      let isWorkout = false;

      if (log.workoutDurationMinutes) {
        dailyDurationMap.set(log.date, (dailyDurationMap.get(log.date) || 0) + log.workoutDurationMinutes);
        isWorkout = true;
      }

      log.exercises?.forEach(ex => {
        let vol = 0;
        ex.setsLog?.forEach((s: any) => {
          const w = (s?.weight !== null && s?.weight !== undefined && !isNaN(Number(s.weight))) ? Number(s.weight) : (s?.weightKg ? Number(s.weightKg) : 0);
          const r = (s?.reps !== null && s?.reps !== undefined && !isNaN(Number(s.reps))) ? Number(s.reps) : 0;
          if (s.completed && w > 0 && r > 0) {
            vol += (w * r);
            isWorkout = true;
          }
        });
        totalVolumeKg += vol;

        if (vol > 0) {
          const rawMuscle = ex.muscle || '';
          let group = 'Other';
          if (/chest|pec/i.test(rawMuscle)) group = 'Chest';
          else if (/back|lat|row|trap/i.test(rawMuscle)) group = 'Back';
          else if (/leg|quad|ham|glute|calf|calves/i.test(rawMuscle)) group = 'Legs';
          else if (/shoulder|delt/i.test(rawMuscle)) group = 'Shoulders';
          else if (/arm|bicep|tricep|forearm/i.test(rawMuscle)) group = 'Arms';
          else if (/core|abs|oblique/i.test(rawMuscle)) group = 'Core';

          if (group !== 'Other') {
            volumeByMuscle[group] += vol;
          }
        }
      });

      log.cardio?.forEach(c => {
        if (c.completed) {
          if (c.durationMinutes) {
            totalCardioMins += c.durationMinutes;
            dailyDurationMap.set(log.date, (dailyDurationMap.get(log.date) || 0) + c.durationMinutes);
          }
          if (c.distanceKm) cardioDistance += c.distanceKm;
          if (c.calories) cardioCalories += c.calories;
          isWorkout = true;
        }
      });

      if (isWorkout) totalWorkouts++;
    });

    const lData = allDatesInRange.map(dateStr => {
      const parts = dateStr.split('-');
      const shortDate = `${parts[1]}/${parts[2]}`;
      return { dateStr, shortDate, duration: dailyDurationMap.get(dateStr) || 0 };
    });

    const MUSCLE_COLORS: Record<string, string> = {
      Chest: '#a599ff', Back: '#5eda9e', Legs: '#ff9f4d',
      Shoulders: '#89dceb', Arms: '#ff6b9d', Core: '#ffd93d',
    };
    const dData = Object.entries(volumeByMuscle)
      .map(([muscle, volume]) => ({ muscle, volume, color: MUSCLE_COLORS[muscle] }))
      .filter(m => m.volume > 0)
      .sort((a, b) => b.volume - a.volume);

    const maxVol = dData.reduce((sum, item) => sum + item.volume, 0);
    const donutFinal = dData.map(d => ({ ...d, percent: maxVol > 0 ? Math.round((d.volume / maxVol) * 100) : 0 }));

    return {
      filteredLogs: fLogs,
      kpi: { totalWorkouts, totalVolumeKg, totalCardioMins },
      lineChartData: lData,
      donutData: donutFinal,
      cardioMetrics: { distance: cardioDistance, calories: cardioCalories }
    };
  }, [gymLogs, timeRange]);

  // Duration line coordinates
  const { lineCoords, maxDuration } = useMemo(() => {
    if (lineChartData.length === 0) return { lineCoords: [], maxDuration: 0 };
    const maxDur = Math.max(...lineChartData.map(d => d.duration), 60);

    const coords = lineChartData.map((d, i) => {
      const x = PADDING + (i / (lineChartData.length - 1)) * (CHART_WIDTH - PADDING * 2);
      const y = CHART_HEIGHT - PADDING - (d.duration / maxDur) * (CHART_HEIGHT - PADDING * 2);
      return { x, y, data: d };
    });
    return { lineCoords: coords, maxDuration: maxDur };
  }, [lineChartData]);

  const smoothPath = useMemo(() => generateSmoothSvgPath(lineCoords), [lineCoords]);

  // Exercise selection progression
  const { availableMuscles, availableExercises } = useMemo(() => {
    const muscles = new Set<string>();
    const exercises = new Set<string>();

    filteredLogs.forEach(log => {
      log.exercises?.forEach((ex: any) => {
        if (ex.muscle) muscles.add(ex.muscle);
        if (selectedMuscle && ex.muscle === selectedMuscle) {
          exercises.add(ex.name);
        }
      });
    });

    return {
      availableMuscles: Array.from(muscles).sort(),
      availableExercises: Array.from(exercises).sort()
    };
  }, [filteredLogs, selectedMuscle]);

  useEffect(() => {
    if (availableMuscles.length > 0 && (!selectedMuscle || !availableMuscles.includes(selectedMuscle))) {
      setSelectedMuscle(availableMuscles[0]);
    }
  }, [availableMuscles, selectedMuscle]);

  useEffect(() => {
    if (availableExercises.length > 0 && (!selectedExercise || !availableExercises.includes(selectedExercise))) {
      setSelectedExercise(availableExercises[0]);
    } else if (availableExercises.length === 0) {
      setSelectedExercise(null);
    }
  }, [availableExercises, selectedExercise]);

  const exerciseLineData = useMemo(() => {
    if (!selectedExercise) return [];
    const dataPoints: { shortDate: string; maxWeight: number }[] = [];
    const sortedLogs = [...filteredLogs].sort((a, b) => a.date.localeCompare(b.date));

    sortedLogs.forEach(log => {
      let maxW = 0;
      let performed = false;
      log.exercises?.forEach((ex: any) => {
        if (ex.name === selectedExercise) {
          performed = true;
          (ex.setsLog || ex.sets || []).forEach((s: any) => {
            if (s.completed && (s.weight || 0) > maxW) {
              maxW = s.weight || 0;
            }
          });
        }
      });
      if (performed) {
        const parts = log.date.split('-');
        const shortDate = `${parts[1]}/${parts[2]}`;
        dataPoints.push({ shortDate, maxWeight: maxW });
      }
    });
    return dataPoints;
  }, [filteredLogs, selectedExercise]);

  const { exLineCoords } = useMemo(() => {
    if (exerciseLineData.length === 0) return { exLineCoords: [] };
    const maxW = Math.max(...exerciseLineData.map(d => d.maxWeight), 10);

    const coords = exerciseLineData.map((d, i) => {
      const x = PADDING + (i / Math.max(1, exerciseLineData.length - 1)) * (CHART_WIDTH - PADDING * 2);
      const y = CHART_HEIGHT - PADDING - (d.maxWeight / maxW) * (CHART_HEIGHT - PADDING * 2);
      return { x, y, data: d };
    });
    return { exLineCoords: coords };
  }, [exerciseLineData]);

  const exSmoothPath = useMemo(() => generateSmoothSvgPath(exLineCoords), [exLineCoords]);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <StatusBar style={isDark ? 'light' : 'dark'} backgroundColor={colors.background} />
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Gym Analytics</Text>
        <View style={{ width: 32 }} />
      </View>

      <View style={styles.filterTabs}>
        {(['7d', '30d', '90d'] as TimeRange[]).map(r => (
          <TouchableOpacity key={r} style={[styles.tab, timeRange === r && styles.tabActive]} onPress={() => setTimeRange(r)}>
            <Text style={[styles.tabText, timeRange === r && styles.tabTextActive]}>
              {r === '7d' ? 'Last 7 Days' : r === '30d' ? 'Last 30 Days' : 'Last 90 Days'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* KPI Cards */}
        <Animated.View style={[styles.kpiRow, { opacity: animCards, transform: [{ translateY: animCards.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }]}>
          <View style={styles.kpiCard}>
            <View style={[styles.kpiIconBox, { backgroundColor: isDark ? 'rgba(165,153,255,0.1)' : 'rgba(108,92,231,0.1)' }]}>
              <Ionicons name="fitness-outline" size={16} color={colors.accentPrimary} />
            </View>
            <Text style={styles.kpiValue}>{kpi.totalWorkouts}</Text>
            <Text style={styles.kpiLabel}>Workouts</Text>
          </View>
          <View style={styles.kpiCard}>
            <View style={[styles.kpiIconBox, { backgroundColor: isDark ? 'rgba(94,218,158,0.1)' : 'rgba(5,150,105,0.1)' }]}>
              <Ionicons name="barbell-outline" size={16} color={colors.accentGreen} />
            </View>
            <Text style={styles.kpiValue}>{kpi.totalVolumeKg >= 1000 ? `${(kpi.totalVolumeKg / 1000).toFixed(1)}k` : kpi.totalVolumeKg}</Text>
            <Text style={styles.kpiLabel}>Volume (kg)</Text>
          </View>
          <View style={styles.kpiCard}>
            <View style={[styles.kpiIconBox, { backgroundColor: isDark ? 'rgba(255,159,77,0.1)' : 'rgba(217,119,6,0.1)' }]}>
              <Ionicons name="stopwatch-outline" size={16} color={colors.accentAmber} />
            </View>
            <Text style={styles.kpiValue}>{kpi.totalCardioMins}m</Text>
            <Text style={styles.kpiLabel}>Cardio</Text>
          </View>
        </Animated.View>

        {/* Workout Duration Line Chart */}
        <Animated.View style={[styles.glassCard, { opacity: animChart, transform: [{ translateY: animChart.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }]}>
          <View style={styles.cardHeaderRow}>
            <View>
              <Text style={styles.cardTitle}>Workout Duration</Text>
              <Text style={styles.cardSubtitle}>Minutes spent training per day</Text>
            </View>
            <View style={styles.cardHeaderBadge}>
              <Text style={styles.cardHeaderBadgeText}>MAX {maxDuration}m</Text>
            </View>
          </View>

          <View style={styles.svgWrapper}>
            <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
              <Defs>
                <LinearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={colors.accentPrimary} stopOpacity="0.4" />
                  <Stop offset="1" stopColor={colors.accentPrimary} stopOpacity="0.0" />
                </LinearGradient>
              </Defs>

              <Path d={`M 0 ${PADDING} L ${CHART_WIDTH} ${PADDING}`} stroke={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'} strokeWidth="1" strokeDasharray="4 4" />
              <Path d={`M 0 ${CHART_HEIGHT / 2} L ${CHART_WIDTH} ${CHART_HEIGHT / 2}`} stroke={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'} strokeWidth="1" strokeDasharray="4 4" />
              <Path d={`M 0 ${CHART_HEIGHT - PADDING} L ${CHART_WIDTH} ${CHART_HEIGHT - PADDING}`} stroke={isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'} strokeWidth="1" strokeDasharray="4 4" />

              {lineCoords.length > 1 && (
                <>
                  <Path d={`${smoothPath} L ${lineCoords[lineCoords.length - 1].x},${CHART_HEIGHT - PADDING} L ${lineCoords[0].x},${CHART_HEIGHT - PADDING} Z`} fill="url(#lineGrad)" />
                  <Path d={smoothPath} fill="none" stroke={colors.accentPrimary} strokeWidth="8" strokeOpacity="0.15" strokeLinecap="round" strokeLinejoin="round" />
                  <Path d={smoothPath} fill="none" stroke={colors.accentPrimary} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                </>
              )}

              {timeRange !== '90d' && lineCoords.map((pt, idx) => (
                <G key={idx}>
                  <Circle cx={pt.x} cy={pt.y} r={3} fill={colors.surface} stroke={colors.accentPrimary} strokeWidth={1.5} />
                </G>
              ))}
            </Svg>

            <View style={styles.chartDateAxis}>
              <Text style={styles.axisDateText}>{lineChartData[0]?.shortDate}</Text>
              <Text style={styles.axisDateText}>{lineChartData[Math.floor(lineChartData.length / 2)]?.shortDate}</Text>
              <Text style={styles.axisDateText}>{lineChartData[lineChartData.length - 1]?.shortDate}</Text>
            </View>
          </View>
        </Animated.View>

        {/* Muscle Distribution Donut */}
        <Animated.View style={[styles.glassCard, { opacity: animDonut, transform: [{ translateY: animDonut.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }]}>
          <Text style={styles.cardTitle}>Muscle Group Distribution</Text>
          <Text style={styles.cardSubtitle}>Volume percentage by muscle</Text>
          <GymProgressDonut donutData={donutData} totalVolumeKg={kpi.totalVolumeKg} styles={styles} />
        </Animated.View>

        {/* Cardio Metrics */}
        <Animated.View style={[styles.glassCard, { opacity: animCardio, transform: [{ translateY: animCardio.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }]}>
          <Text style={styles.cardTitle}>Cardio Performance</Text>
          <Text style={styles.cardSubtitle}>Aggregated cardio metrics</Text>
          <GymProgressCardio totalCardioMins={kpi.totalCardioMins} calories={cardioMetrics.calories} distance={cardioMetrics.distance} styles={styles} />
        </Animated.View>

        {/* Exercise Progression */}
        <Animated.View style={[styles.glassCard, { opacity: animCards }]}>
          <Text style={styles.cardTitle}>Exercise Progression</Text>
          <Text style={styles.cardSubtitle}>Max weight over time</Text>

          {availableMuscles.length > 0 ? (
            <View style={{ marginTop: SPACE.lg }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
                {availableMuscles.map(m => (
                  <TouchableOpacity key={m} style={[styles.chip, selectedMuscle === m && styles.chipActive]} onPress={() => setSelectedMuscle(m)}>
                    <Text style={[styles.chipText, selectedMuscle === m && styles.chipTextActive]}>{m}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {availableExercises.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillScroll}>
                  {availableExercises.map(ex => (
                    <TouchableOpacity key={ex} style={[styles.pill, selectedExercise === ex && styles.pillActive]} onPress={() => setSelectedExercise(ex)}>
                      <Text style={[styles.pillText, selectedExercise === ex && styles.pillTextActive]}>{ex}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}

              {exerciseLineData.length > 1 ? (
                <View style={styles.svgWrapper}>
                  <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
                    <Defs>
                      <LinearGradient id="exLineGrad" x1="0" y1="0" x2="0" y2="1">
                        <Stop offset="0" stopColor="#5eda9e" stopOpacity="0.4" />
                        <Stop offset="1" stopColor="#5eda9e" stopOpacity="0" />
                      </LinearGradient>
                    </Defs>

                    <Path d={`M 0 ${PADDING} L ${CHART_WIDTH} ${PADDING}`} stroke="rgba(255,255,255,0.06)" strokeWidth="1" strokeDasharray="4 4" />
                    <Path d={`M 0 ${CHART_HEIGHT / 2} L ${CHART_WIDTH} ${CHART_HEIGHT / 2}`} stroke="rgba(255,255,255,0.06)" strokeWidth="1" strokeDasharray="4 4" />
                    <Path d={`M 0 ${CHART_HEIGHT - PADDING} L ${CHART_WIDTH} ${CHART_HEIGHT - PADDING}`} stroke="rgba(255,255,255,0.06)" strokeWidth="1" strokeDasharray="4 4" />

                    <Path d={`${exSmoothPath} L ${exLineCoords[exLineCoords.length - 1].x},${CHART_HEIGHT - PADDING} L ${exLineCoords[0].x},${CHART_HEIGHT - PADDING} Z`} fill="url(#exLineGrad)" />
                    <Path d={exSmoothPath} fill="none" stroke="#5eda9e" strokeWidth="8" strokeOpacity="0.15" strokeLinecap="round" strokeLinejoin="round" />
                    <Path d={exSmoothPath} fill="none" stroke="#5eda9e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />

                    {exLineCoords.map((c, i) => (
                      <Circle key={i} cx={c.x} cy={c.y} r={4} fill="#5eda9e" stroke="#000" strokeWidth={2} />
                    ))}
                  </Svg>

                  <View style={styles.chartDateAxis}>
                    <Text style={styles.axisDateText}>{exerciseLineData[0]?.shortDate}</Text>
                    {exerciseLineData.length > 2 && (
                      <Text style={styles.axisDateText}>{exerciseLineData[Math.floor((exerciseLineData.length - 1) / 2)]?.shortDate}</Text>
                    )}
                    <Text style={styles.axisDateText}>{exerciseLineData[exerciseLineData.length - 1]?.shortDate}</Text>
                  </View>
                </View>
              ) : (
                <View style={[styles.emptyBox, { marginTop: SPACE.lg }]}>
                  <Ionicons name="stats-chart" size={24} color="rgba(255,255,255,0.2)" />
                  <Text style={styles.emptyText}>Not enough data to plot progression.</Text>
                </View>
              )}
            </View>
          ) : (
            <View style={styles.emptyBox}>
              <Ionicons name="barbell-outline" size={24} color="rgba(255,255,255,0.2)" />
              <Text style={styles.emptyText}>No exercises logged in this period.</Text>
            </View>
          )}
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}
