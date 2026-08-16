import React, { useState, useMemo, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions, Platform, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Defs, LinearGradient, Stop, Path, G } from 'react-native-svg';
import { FONT_FAMILY, SPACE, RADIUS, SHADOW } from '../../theme/tokens';
import { useWellnessData } from '../../contexts/domains/WellnessContext';
import { GymNavigationParamList } from '../../types/gym.types';
import { useTheme } from "../../contexts/ThemeContext";

const { width } = Dimensions.get('window');

type TimeRange = '7d' | '30d' | '90d';

const CHART_HEIGHT = 180;
const CHART_WIDTH = width - 48;
const PADDING = 20;

export default function GymProgressScreen() {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const navigation = useNavigation<NativeStackNavigationProp<GymNavigationParamList>>();
  const { gymLogs } = useWellnessData();

  const [timeRange, setTimeRange] = useState<TimeRange>('7d');
  const [selectedMuscle, setSelectedMuscle] = useState<string | null>(null);
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null);
  
  // Animations
  const animHeader = useRef(new Animated.Value(0)).current;
  const animCards = useRef(new Animated.Value(0)).current;
  const animChart = useRef(new Animated.Value(0)).current;
  const animDonut = useRef(new Animated.Value(0)).current;
  const animCardio = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    animHeader.setValue(0);
    animCards.setValue(0);
    animChart.setValue(0);
    animDonut.setValue(0);
    animCardio.setValue(0);

    Animated.stagger(100, [
      Animated.timing(animHeader, { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.spring(animCards, { toValue: 1, tension: 50, friction: 8, useNativeDriver: true }),
      Animated.spring(animChart, { toValue: 1, tension: 50, friction: 8, useNativeDriver: true }),
      Animated.spring(animDonut, { toValue: 1, tension: 50, friction: 8, useNativeDriver: true }),
      Animated.spring(animCardio, { toValue: 1, tension: 50, friction: 8, useNativeDriver: true }),
    ]).start();
  }, [timeRange]);

  // --- Data Processing ---
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

    const dailyDurationMap = new Map<string, number>();
    const volumeByMuscle: Record<string, number> = {
      Chest: 0, Back: 0, Legs: 0, Shoulders: 0, Arms: 0, Core: 0
    };

    let cardioDistance = 0;
    let cardioCalories = 0;

    // Generate all dates in range for line chart
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
      
      // Calculate Daily Duration
      if (log.workoutDurationMinutes) {
        dailyDurationMap.set(log.date, (dailyDurationMap.get(log.date) || 0) + log.workoutDurationMinutes);
        isWorkout = true;
      }

      // Calculate Volume & Muscle Group
      log.exercises?.forEach(ex => {
        let vol = 0;
        ex.setsLog?.forEach((s: any) => {
          if (s.completed && s.weight && s.reps) {
            vol += (s.weight * s.reps);
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

      // Calculate Cardio
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

    // Format Line Chart Data
    const lData = allDatesInRange.map(dateStr => {
      const parts = dateStr.split('-');
      const shortDate = `${parts[1]}/${parts[2]}`; // MM/DD
      return { dateStr, shortDate, duration: dailyDurationMap.get(dateStr) || 0 };
    });

    // Format Donut Chart Data
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

  // --- Chart Line Calculation ---
  const { lineCoords, maxDuration } = useMemo(() => {
    if (lineChartData.length === 0) return { lineCoords: [], maxDuration: 0 };
    const maxDur = Math.max(...lineChartData.map(d => d.duration), 60); // min ceiling of 60 mins
    
    const coords = lineChartData.map((d, i) => {
      const x = PADDING + (i / (lineChartData.length - 1)) * (CHART_WIDTH - PADDING * 2);
      const y = CHART_HEIGHT - PADDING - (d.duration / maxDur) * (CHART_HEIGHT - PADDING * 2);
      return { x, y, data: d };
    });
    return { lineCoords: coords, maxDuration: maxDur };
  }, [lineChartData]);

  const smoothPath = useMemo(() => {
    if (lineCoords.length === 0) return '';
    let path = `M ${lineCoords[0].x},${lineCoords[0].y}`;
    for (let i = 0; i < lineCoords.length - 1; i++) {
      const xMid = (lineCoords[i].x + lineCoords[i + 1].x) / 2;
      path += ` C ${xMid},${lineCoords[i].y} ${xMid},${lineCoords[i + 1].y} ${lineCoords[i + 1].x},${lineCoords[i + 1].y}`;
    }
    return path;
  }, [lineCoords]);

  // --- Specific Exercise Line Chart Data ---
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
    const dataPoints: { shortDate: string, maxWeight: number }[] = [];
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

  const { exLineCoords, maxExWeight } = useMemo(() => {
    if (exerciseLineData.length === 0) return { exLineCoords: [], maxExWeight: 0 };
    const maxW = Math.max(...exerciseLineData.map(d => d.maxWeight), 10);
    
    const coords = exerciseLineData.map((d, i) => {
      const x = PADDING + (i / Math.max(1, exerciseLineData.length - 1)) * (CHART_WIDTH - PADDING * 2);
      const y = CHART_HEIGHT - PADDING - (d.maxWeight / maxW) * (CHART_HEIGHT - PADDING * 2);
      return { x, y, data: d };
    });
    return { exLineCoords: coords, maxExWeight: maxW };
  }, [exerciseLineData]);

  const exSmoothPath = useMemo(() => {
    if (exLineCoords.length === 0) return '';
    let path = `M ${exLineCoords[0].x},${exLineCoords[0].y}`;
    for (let i = 0; i < exLineCoords.length - 1; i++) {
      const xMid = (exLineCoords[i].x + exLineCoords[i + 1].x) / 2;
      path += ` C ${xMid},${exLineCoords[i].y} ${xMid},${exLineCoords[i + 1].y} ${exLineCoords[i + 1].x},${exLineCoords[i + 1].y}`;
    }
    return path;
  }, [exLineCoords]);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
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
        
        {/* KPI CARDS */}
        <Animated.View style={[styles.kpiRow, { opacity: animCards, transform: [{ translateY: animCards.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }]}>
          <View style={styles.kpiCard}>
            <View style={[styles.kpiIconBox, { backgroundColor: 'rgba(165,153,255,0.1)' }]}>
              <Ionicons name="fitness-outline" size={16} color="#a599ff" />
            </View>
            <Text style={styles.kpiValue}>{kpi.totalWorkouts}</Text>
            <Text style={styles.kpiLabel}>Workouts</Text>
          </View>
          <View style={styles.kpiCard}>
            <View style={[styles.kpiIconBox, { backgroundColor: 'rgba(94,218,158,0.1)' }]}>
              <Ionicons name="barbell-outline" size={16} color="#5eda9e" />
            </View>
            <Text style={styles.kpiValue}>{kpi.totalVolumeKg >= 1000 ? `${(kpi.totalVolumeKg/1000).toFixed(1)}k` : kpi.totalVolumeKg}</Text>
            <Text style={styles.kpiLabel}>Volume (kg)</Text>
          </View>
          <View style={styles.kpiCard}>
            <View style={[styles.kpiIconBox, { backgroundColor: 'rgba(255,159,77,0.1)' }]}>
              <Ionicons name="stopwatch-outline" size={16} color="#ff9f4d" />
            </View>
            <Text style={styles.kpiValue}>{kpi.totalCardioMins}m</Text>
            <Text style={styles.kpiLabel}>Cardio</Text>
          </View>
        </Animated.View>

        {/* LINE CHART: WORKOUT DURATION */}
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
                  <Stop offset="0" stopColor="#a599ff" stopOpacity="0.4" />
                  <Stop offset="1" stopColor="#a599ff" stopOpacity="0.0" />
                </LinearGradient>
              </Defs>

              {/* Grid Lines */}
              <Path d={`M 0 ${PADDING} L ${CHART_WIDTH} ${PADDING}`} stroke="rgba(255,255,255,0.06)" strokeWidth="1" strokeDasharray="4 4" />
              <Path d={`M 0 ${CHART_HEIGHT / 2} L ${CHART_WIDTH} ${CHART_HEIGHT / 2}`} stroke="rgba(255,255,255,0.06)" strokeWidth="1" strokeDasharray="4 4" />
              <Path d={`M 0 ${CHART_HEIGHT - PADDING} L ${CHART_WIDTH} ${CHART_HEIGHT - PADDING}`} stroke="rgba(255,255,255,0.06)" strokeWidth="1" strokeDasharray="4 4" />

              {lineCoords.length > 1 && (
                <>
                  <Path d={`${smoothPath} L ${lineCoords[lineCoords.length-1].x},${CHART_HEIGHT - PADDING} L ${lineCoords[0].x},${CHART_HEIGHT - PADDING} Z`} fill="url(#lineGrad)" />
                  <Path d={smoothPath} fill="none" stroke="#a599ff" strokeWidth="8" strokeOpacity="0.15" strokeLinecap="round" strokeLinejoin="round" />
                  <Path d={smoothPath} fill="none" stroke="#a599ff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                </>
              )}

              {/* Data Points (Render only if length is small or downsample for 90d to prevent clutter) */}
              {timeRange !== '90d' && lineCoords.map((pt, idx) => (
                <G key={idx}>
                  <Circle cx={pt.x} cy={pt.y} r={3} fill="#141416" stroke="#a599ff" strokeWidth={1.5} />
                </G>
              ))}
            </Svg>
            
            {/* Axis labels */}
            <View style={styles.chartDateAxis}>
              <Text style={styles.axisDateText}>{lineChartData[0]?.shortDate}</Text>
              <Text style={styles.axisDateText}>{lineChartData[Math.floor(lineChartData.length / 2)]?.shortDate}</Text>
              <Text style={styles.axisDateText}>{lineChartData[lineChartData.length - 1]?.shortDate}</Text>
            </View>
          </View>
        </Animated.View>

        {/* DONUT CHART: MUSCLE DISTRIBUTION */}
        <Animated.View style={[styles.glassCard, { opacity: animDonut, transform: [{ translateY: animDonut.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }]}>
           <Text style={styles.cardTitle}>Muscle Group Distribution</Text>
           <Text style={styles.cardSubtitle}>Volume percentage by muscle</Text>
           
           {donutData.length > 0 ? (
             <View style={styles.donutContainer}>
               <View style={styles.donutSvgWrapper}>
                 <Svg width={150} height={150} viewBox="0 0 150 150">
                   {(() => {
                     const CIRCUMFERENCE = 2 * Math.PI * 52;
                     let cumulativePercent = 0;
                     return donutData.map((item, i) => {
                       const strokeDasharray = `${(item.percent / 100) * CIRCUMFERENCE} ${CIRCUMFERENCE}`;
                       const strokeDashoffset = -((cumulativePercent / 100) * CIRCUMFERENCE);
                       cumulativePercent += item.percent;
                       return (
                         <Circle key={i} cx={75} cy={75} r={52} stroke={item.color} strokeWidth={16} strokeDasharray={strokeDasharray} strokeDashoffset={strokeDashoffset} fill="none" strokeLinecap="round" />
                       );
                     });
                   })()}
                 </Svg>
                 <View style={styles.donutCenterLabel}>
                   <Text style={styles.donutCenterValue}>{kpi.totalVolumeKg >= 1000 ? `${(kpi.totalVolumeKg/1000).toFixed(1)}k` : kpi.totalVolumeKg}</Text>
                   <Text style={styles.donutCenterSub}>kg Total</Text>
                 </View>
               </View>
               <View style={styles.donutLegend}>
                 {donutData.map((item, idx) => (
                   <View key={idx} style={styles.donutLegendRow}>
                     <View style={[styles.donutDot, { backgroundColor: item.color }]} />
                     <Text style={styles.donutLegendName} numberOfLines={1}>{item.muscle}</Text>
                     <Text style={styles.donutLegendPercent}>{item.percent}%</Text>
                   </View>
                 ))}
               </View>
             </View>
           ) : (
             <View style={styles.emptyBox}>
               <Ionicons name="pie-chart-outline" size={24} color="rgba(255,255,255,0.2)" />
               <Text style={styles.emptyText}>No muscle data logged in this period.</Text>
             </View>
           )}
        </Animated.View>

        {/* CARDIO SECTION */}
        <Animated.View style={[styles.glassCard, { opacity: animCardio, transform: [{ translateY: animCardio.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }]}>
          <Text style={styles.cardTitle}>Cardio Performance</Text>
          <Text style={styles.cardSubtitle}>Aggregated cardio metrics</Text>

          {kpi.totalCardioMins > 0 ? (
            <View style={styles.cardioMetricsGrid}>
               <View style={styles.cardioMetricBox}>
                 <Ionicons name="time-outline" size={20} color="#ff9f4d" />
                 <Text style={styles.cardioMetricValue}>{kpi.totalCardioMins}</Text>
                 <Text style={styles.cardioMetricLabel}>Minutes</Text>
               </View>
               <View style={styles.cardioMetricBox}>
                 <Ionicons name="flame-outline" size={20} color="#ff6b9d" />
                 <Text style={styles.cardioMetricValue}>{Math.round(cardioMetrics.calories)}</Text>
                 <Text style={styles.cardioMetricLabel}>Calories</Text>
               </View>
               <View style={styles.cardioMetricBox}>
                 <Ionicons name="location-outline" size={20} color="#89dceb" />
                 <Text style={styles.cardioMetricValue}>{cardioMetrics.distance.toFixed(1)}</Text>
                 <Text style={styles.cardioMetricLabel}>Distance (km)</Text>
               </View>
            </View>
          ) : (
            <View style={styles.emptyBox}>
               <Ionicons name="walk-outline" size={24} color="rgba(255,255,255,0.2)" />
               <Text style={styles.emptyText}>No cardio logged in this period.</Text>
             </View>
          )}
        </Animated.View>

        {/* EXERCISE PROGRESSION */}
        <Animated.View style={[styles.glassCard, { opacity: animCards }]}>
          <Text style={styles.cardTitle}>Exercise Progression</Text>
          <Text style={styles.cardSubtitle}>Max weight over time</Text>

          {availableMuscles.length > 0 ? (
            <View style={{ marginTop: SPACE.lg }}>
              {/* Muscle selector */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
                {availableMuscles.map(m => (
                  <TouchableOpacity key={m} style={[styles.chip, selectedMuscle === m && styles.chipActive]} onPress={() => setSelectedMuscle(m)}>
                    <Text style={[styles.chipText, selectedMuscle === m && styles.chipTextActive]}>{m}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Exercise selector */}
              {availableExercises.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillScroll}>
                  {availableExercises.map(ex => (
                    <TouchableOpacity key={ex} style={[styles.pill, selectedExercise === ex && styles.pillActive]} onPress={() => setSelectedExercise(ex)}>
                      <Text style={[styles.pillText, selectedExercise === ex && styles.pillTextActive]}>{ex}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}

              {/* Chart */}
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

                    <Path d={`${exSmoothPath} L ${exLineCoords[exLineCoords.length-1].x},${CHART_HEIGHT - PADDING} L ${exLineCoords[0].x},${CHART_HEIGHT - PADDING} Z`} fill="url(#exLineGrad)" />
                    <Path d={exSmoothPath} fill="none" stroke="#5eda9e" strokeWidth="8" strokeOpacity="0.15" strokeLinecap="round" strokeLinejoin="round" />
                    <Path d={exSmoothPath} fill="none" stroke="#5eda9e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                    
                    {exLineCoords.map((c, i) => (
                      <Circle key={i} cx={c.x} cy={c.y} r={4} fill="#5eda9e" stroke="#000" strokeWidth={2} />
                    ))}
                  </Svg>
                  
                  {/* Axis labels */}
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

const makeStyles = (colors: any) => StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingTop: Platform.OS === 'ios' ? 8 : 16, paddingBottom: SPACE.md },
  backBtn: { padding: 4 },
  headerTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 18, color: '#ffffff' },
  filterTabs: { flexDirection: 'row', paddingHorizontal: SPACE.md, gap: 8, marginBottom: SPACE.md },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: RADIUS.full, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.02)' },
  tabActive: { backgroundColor: 'rgba(165,153,255,0.15)', borderColor: '#a599ff' },
  tabText: { fontFamily: FONT_FAMILY.bold, fontSize: 12, color: '#8e8e93' },
  tabTextActive: { color: '#a599ff' },
  content: { paddingHorizontal: SPACE.md, paddingBottom: 120 },
  kpiRow: { flexDirection: 'row', gap: SPACE.sm, marginBottom: SPACE.lg },
  kpiCard: { flex: 1, backgroundColor: '#141416', borderRadius: RADIUS.lg, padding: SPACE.sm, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  kpiIconBox: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  kpiValue: { fontFamily: FONT_FAMILY.bold, fontSize: 18, color: '#ffffff' },
  kpiLabel: { fontFamily: FONT_FAMILY.medium, fontSize: 10, color: '#8e8e93', marginTop: 2 },
  glassCard: { backgroundColor: '#141416', borderRadius: RADIUS.xl, padding: SPACE.lg, marginBottom: SPACE.lg, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', ...SHADOW.sm },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: SPACE.md },
  cardTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 16, color: '#ffffff' },
  cardSubtitle: { fontFamily: FONT_FAMILY.medium, fontSize: 12, color: '#8e8e93', marginTop: 2 },
  cardHeaderBadge: { backgroundColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  cardHeaderBadgeText: { fontFamily: FONT_FAMILY.bold, fontSize: 9, color: '#ffffff', letterSpacing: 0.5 },
  svgWrapper: { alignItems: 'center', marginTop: SPACE.xs },
  chartDateAxis: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginTop: 6, paddingHorizontal: 4 },
  axisDateText: { fontFamily: FONT_FAMILY.mono, fontSize: 10, color: '#636366' },
  donutContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: SPACE.md, gap: SPACE.md },
  donutSvgWrapper: { width: 150, height: 150, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  donutCenterLabel: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  donutCenterValue: { fontFamily: FONT_FAMILY.bold, fontSize: 18, color: '#FFFFFF' },
  donutCenterSub: { fontFamily: FONT_FAMILY.medium, fontSize: 11, color: '#A1A1AA' },
  donutLegend: { flex: 1, gap: 8 },
  donutLegendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  donutDot: { width: 10, height: 10, borderRadius: 5 },
  donutLegendName: { flex: 1, fontFamily: FONT_FAMILY.medium, fontSize: 13, color: '#FFFFFF' },
  donutLegendPercent: { fontFamily: FONT_FAMILY.bold, fontSize: 13, color: '#A1A1AA' },
  cardioMetricsGrid: { flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.lg },
  cardioMetricBox: { flex: 1, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: RADIUS.md, padding: SPACE.sm, alignItems: 'center' },
  cardioMetricValue: { fontFamily: FONT_FAMILY.bold, fontSize: 16, color: '#ffffff', marginTop: 8 },
  cardioMetricLabel: { fontFamily: FONT_FAMILY.medium, fontSize: 10, color: '#8e8e93', marginTop: 2 },
  chipScroll: { gap: 6, marginBottom: SPACE.md },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: RADIUS.full, backgroundColor: '#141416', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  chipActive: { borderColor: '#a599ff', backgroundColor: 'rgba(165,153,255,0.1)' },
  chipText: { fontFamily: FONT_FAMILY.medium, fontSize: 12, color: '#8e8e93' },
  chipTextActive: { color: '#a599ff' },
  pillScroll: { gap: 8, paddingVertical: 4, marginBottom: SPACE.sm },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADIUS.lg, backgroundColor: '#141416', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  pillActive: { backgroundColor: '#5eda9e', borderColor: '#5eda9e' },
  pillText: { fontFamily: FONT_FAMILY.bold, fontSize: 13, color: '#8e8e93' },
  pillTextActive: { color: '#000000' },
  emptyBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: SPACE.xl, gap: 8 },
  emptyText: { fontFamily: FONT_FAMILY.medium, fontSize: 12, color: 'rgba(255,255,255,0.4)', textAlign: 'center' },
});
