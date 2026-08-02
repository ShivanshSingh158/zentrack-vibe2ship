import React, { useState, useMemo, useRef, useEffect } from 'react';
import { formatDateShort } from '../../utils/dateUtils';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions, Platform, Animated, TextInput, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Defs, LinearGradient, Stop, Path, G } from 'react-native-svg';
import { FONT_FAMILY, SPACE, RADIUS, SHADOW } from '../../theme/tokens';
import { useMobileData } from '../../contexts/MobileDataContext';
import { calculateEstimated1RM } from '../../utils/gymUtils';
import { GymNavigationParamList } from '../../types/gym.types';
import { useTheme } from "../../contexts/ThemeContext";
import { GYM_PLAN, WEEKDAY_TO_PLAN } from '../../data/gymPlan';
import { todayStr } from '../../hooks/useGymLog';
import { callProxy } from '../../services/geminiProxy';

const { width } = Dimensions.get('window');

export default function GymProgressScreen() {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const navigation = useNavigation<NativeStackNavigationProp<GymNavigationParamList>>();
  const { gymLogs, userGymPlan } = useMobileData();

  // AI Insight State
  const [saraInsightCache, setSaraInsightCache] = useState<Record<string, string>>({});
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [activeMetricMode, setActiveMetricMode] = useState<'working' | '1rm'>('working');

  // Exercise Picker Filters
  const [pickerFilterMode, setPickerFilterMode] = useState<'today' | 'all'>('today');
  const [selectedMuscleFilter, setSelectedMuscleFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const [activePointIndex, setActivePointIndex] = useState<number | null>(null);

  // Animations
  const animHeader = useRef(new Animated.Value(0)).current;
  const animInsight = useRef(new Animated.Value(0)).current;
  const animChart = useRef(new Animated.Value(0)).current;
  const animStats = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    Animated.stagger(80, [
      Animated.timing(animHeader, { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.spring(animInsight, { toValue: 1, tension: 50, friction: 8, useNativeDriver: true }),
      Animated.spring(animChart, { toValue: 1, tension: 50, friction: 8, useNativeDriver: true }),
      Animated.spring(animStats, { toValue: 1, tension: 50, friction: 8, useNativeDriver: true }),
    ]).start();
    
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.5, duration: 1000, useNativeDriver: true })
      ])
    ).start();
  }, []);

  const todayPlanInfo = useMemo(() => {
    const dayOfWeek = new Date().getDay();
    const planIndex = WEEKDAY_TO_PLAN[dayOfWeek] ?? 7;
    const customDay = userGymPlan?.customDays?.[planIndex];
    if (customDay) return customDay;
    return GYM_PLAN.find(p => p.dayIndex === planIndex);
  }, [userGymPlan]);

  const uniqueExercises = useMemo(() => {
    const exMap = new Map<string, { id: string; name: string; muscle: string; isToday?: boolean; isLogged?: boolean }>();

    if (todayPlanInfo && todayPlanInfo.exercises) {
      todayPlanInfo.exercises.forEach(ex => {
        exMap.set(ex.id, { id: ex.id, name: ex.name, muscle: ex.muscle || 'Other', isToday: true, isLogged: false });
      });
    }

    const todayLog = gymLogs.find(l => l.date === todayStr());
    if (todayLog?.exercises) {
      todayLog.exercises.forEach(ex => {
        const existing = exMap.get(ex.exerciseId);
        exMap.set(ex.exerciseId, {
          id: ex.exerciseId,
          name: ex.name,
          muscle: ex.muscle || existing?.muscle || 'Other',
          isToday: true,
          isLogged: true,
        });
      });
    }

    gymLogs.forEach(log => {
      log.exercises?.forEach(ex => {
        const key = ex.exerciseId || ex.id || ex.name.toLowerCase();
        const existing = exMap.get(key);
        if (!existing) {
          exMap.set(key, { id: key, name: ex.name, muscle: ex.muscle || 'Other', isToday: false, isLogged: true });
        } else {
          existing.isLogged = true;
        }
      });
    });

    if (userGymPlan?.customDays) {
      Object.values(userGymPlan.customDays).forEach(day => {
        day.exercises?.forEach(ex => {
          if (!exMap.has(ex.id)) {
            exMap.set(ex.id, { id: ex.id, name: ex.name, muscle: ex.muscle || 'Other', isToday: false, isLogged: false });
          }
        });
      });
    }

    return Array.from(exMap.values());
  }, [gymLogs, todayPlanInfo, userGymPlan]);

  const filteredExercises = useMemo(() => {
    let list = uniqueExercises;
    if (pickerFilterMode === 'today') {
      const todayList = list.filter(e => e.isToday);
      if (todayList.length > 0) list = todayList;
    }
    if (selectedMuscleFilter) list = list.filter(e => e.muscle.toLowerCase() === selectedMuscleFilter.toLowerCase());
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(e => e.name.toLowerCase().includes(q));
    }
    return list;
  }, [uniqueExercises, pickerFilterMode, selectedMuscleFilter, searchQuery]);

  const [selectedExId, setSelectedExId] = useState<string | null>(null);
  
  useEffect(() => {
    if (!selectedExId || !uniqueExercises.some(e => e.id === selectedExId)) {
      if (filteredExercises.length > 0) setSelectedExId(filteredExercises[0].id);
      else if (uniqueExercises.length > 0) setSelectedExId(uniqueExercises[0].id);
    }
  }, [filteredExercises, uniqueExercises]);

  const { chartData, peakWeight, peak1RM, totalVolume, totalSessions } = useMemo(() => {
    if (!selectedExId) return { chartData: [], peakWeight: 0, peak1RM: 0, totalVolume: 0, totalSessions: 0 };

    let sessionsWithEx = gymLogs
      .map(log => {
        const ex = log.exercises?.find(e => e.exerciseId === selectedExId || e.id === selectedExId || e.name.toLowerCase() === uniqueExercises.find(u => u.id === selectedExId)?.name.toLowerCase());
        if (!ex) return null;

        const maxWeightForSession = calculateEstimated1RM(ex as any); // max estimated 1RM for session
        if (maxWeightForSession === 0) return null;

        const bestSet = (ex.setsLog ?? []).find((s: any) => s.completed && s.weight > 0) || ex.setsLog?.[0];
        
        let vol = 0;
        ex.setsLog?.forEach((s: any) => { if (s.completed && s.weight && s.reps) vol += (s.weight * s.reps); });

        return {
          date: new Date(log.date),
          dateStr: formatDateShort(log.date),
          dateFull: log.date,
          max1RM: maxWeightForSession,
          rawWeight: bestSet?.weight || 0,
          rawReps: bestSet?.reps || 0,
          volume: vol
        };
      })
      .filter(Boolean) as { date: Date; dateStr: string; dateFull: string; max1RM: number; rawWeight: number; rawReps: number; volume: number }[];

    sessionsWithEx = sessionsWithEx.sort((a, b) => a.date.getTime() - b.date.getTime());

    const totalSessions = sessionsWithEx.length;
    let peakWeight = 0;
    let peak1RM = 0;
    let totalVolume = 0;

    sessionsWithEx.forEach(s => {
      if (s.rawWeight > peakWeight) peakWeight = s.rawWeight;
      if (s.max1RM > peak1RM) peak1RM = s.max1RM;
      totalVolume += s.volume;
    });

    return { chartData: sessionsWithEx, peakWeight, peak1RM, totalVolume, totalSessions };
  }, [gymLogs, selectedExId, uniqueExercises]);

  // AI Insight Generator
  useEffect(() => {
    if (!selectedExId) return;
    if (saraInsightCache[selectedExId]) return;

    if (chartData.length === 0) {
      setSaraInsightCache(prev => ({ ...prev, [selectedExId]: "You haven't logged any data for this exercise yet. Complete a few sets so I can analyze your progress!" }));
      return;
    }

    let mounted = true;
    setIsAnalyzing(true);
    
    const dataSlice = chartData.slice(-5).map(d => `${d.dateFull}: Working=${d.rawWeight}kgx${d.rawReps}, Est1RM=${Math.round(d.max1RM)}kg`).join('; ');
    const exName = uniqueExercises.find(e => e.id === selectedExId)?.name || 'the exercise';
    
    const userPrompt = `Exercise: ${exName}. Past 5 sessions: ${dataSlice}. 
Analyze this trend. Tell me what I am doing well (going up/down), and what I should focus on or do next session.`;

    const systemPrompt = `You are GAINS, the ZenTrack gym coach. Your personality is encouraging, analytical, and direct.
Analyze the user's 5-session history for the given exercise. Provide a 2-3 sentence insight:
1. Identify the trend (e.g., 1RM is climbing, volume dipping, plateauing).
2. Point out what they are doing well.
3. Tell them exactly what to focus on next time (e.g. 'Drop weight by 10% for 15 reps', 'Push for a 5kg PR', 'Add 1 more set').
Keep it highly actionable and conversational. Do not use asterisks or markdown.`;

    callProxy({
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      systemInstruction: systemPrompt,
    }).then(res => {
       if (!mounted) return;
       let text = res.candidates?.[0]?.content?.parts?.[0]?.text || "Keep pushing hard!";
       text = text.replace(/\*/g, '');
       setSaraInsightCache(prev => ({ ...prev, [selectedExId]: text }));
       setIsAnalyzing(false);
    }).catch(e => {
       if (!mounted) return;
       setIsAnalyzing(false);
       console.error(e);
    });

    return () => { mounted = false; };
  }, [selectedExId, chartData, uniqueExercises, saraInsightCache]);


  // Chart layout dimensions
  const CHART_HEIGHT = 190;
  const CHART_WIDTH = width - 48;
  const PADDING = 20;

  const { chartCoords, oneRMCoords } = useMemo(() => {
    if (chartData.length === 0) return { chartCoords: [], oneRMCoords: [] };
    
    // Unified scale for BOTH lines
    const minW = Math.min(...chartData.map(d => Math.min(d.rawWeight, d.max1RM)));
    const maxW = Math.max(...chartData.map(d => Math.max(d.rawWeight, d.max1RM)));
    const range = maxW - minW;

    const _chartCoords = chartData.map((d, i) => {
      let y = CHART_HEIGHT / 2;
      let y1RM = CHART_HEIGHT / 2;
      if (range > 0) {
        y = CHART_HEIGHT - PADDING - ((d.rawWeight - minW) / range) * (CHART_HEIGHT - PADDING * 2);
        y1RM = CHART_HEIGHT - PADDING - ((d.max1RM - minW) / range) * (CHART_HEIGHT - PADDING * 2);
      }
      return { x: PADDING + (i / (chartData.length - 1)) * (CHART_WIDTH - PADDING * 2), y, y1RM, data: d };
    });

    if (chartData.length === 1) {
       _chartCoords.unshift({ x: PADDING, y: _chartCoords[0].y, y1RM: _chartCoords[0].y1RM, data: _chartCoords[0].data, virtual: true } as any);
       _chartCoords[1].x = CHART_WIDTH / 2;
       _chartCoords.push({ x: CHART_WIDTH - PADDING, y: _chartCoords[1].y, y1RM: _chartCoords[1].y1RM, data: _chartCoords[1].data, virtual: true } as any);
    }

    return { chartCoords: _chartCoords, oneRMCoords: _chartCoords };
  }, [chartData, CHART_WIDTH]);

  const smoothPath = useMemo(() => {
    if (chartCoords.length === 0) return '';
    let path = `M ${chartCoords[0].x},${chartCoords[0].y}`;
    for (let i = 0; i < chartCoords.length - 1; i++) {
      const xMid = (chartCoords[i].x + chartCoords[i + 1].x) / 2;
      path += ` C ${xMid},${chartCoords[i].y} ${xMid},${chartCoords[i + 1].y} ${chartCoords[i + 1].x},${chartCoords[i + 1].y}`;
    }
    return path;
  }, [chartCoords]);

  const smoothPath1RM = useMemo(() => {
    if (oneRMCoords.length === 0) return '';
    let path = `M ${oneRMCoords[0].x},${oneRMCoords[0].y1RM}`;
    for (let i = 0; i < oneRMCoords.length - 1; i++) {
      const xMid = (oneRMCoords[i].x + oneRMCoords[i + 1].x) / 2;
      path += ` C ${xMid},${oneRMCoords[i].y1RM} ${xMid},${oneRMCoords[i + 1].y1RM} ${oneRMCoords[i + 1].x},${oneRMCoords[i + 1].y1RM}`;
    }
    return path;
  }, [oneRMCoords]);

  const volumeData = useMemo(() => {
    const vMap = new Map<string, { name: string; volume: number }>();
    gymLogs.forEach(log => {
      log.exercises?.forEach(ex => {
        let vol = 0;
        ex.setsLog?.filter((s: any) => s.completed && s.weight && s.reps).forEach((s: any) => { vol += (s.weight * s.reps); });
        if (vol > 0) {
          const existing = vMap.get(ex.name) || { name: ex.name, volume: 0 };
          vMap.set(ex.name, { name: ex.name, volume: existing.volume + vol });
        }
      });
    });
    let sorted = Array.from(vMap.values()).sort((a, b) => b.volume - a.volume);
    const total = sorted.reduce((sum, item) => sum + item.volume, 0);
    if (sorted.length > 5) {
      const top4 = sorted.slice(0, 4);
      const others = sorted.slice(4).reduce((sum, item) => sum + item.volume, 0);
      top4.push({ name: 'Others', volume: others });
      sorted = top4;
    }
    return sorted.map((item, i) => ({
      ...item, color: ['#a599ff', '#5eda9e', '#ff9f4d', '#89dceb', '#636366'][i % 5], percent: total > 0 ? Math.round((item.volume / total) * 100) : 0,
    }));
  }, [gymLogs]);

  // G2: Muscle Group Volume Chart — last 7 days, grouped by muscle tag
  const muscleVolumeData = useMemo(() => {
    const MUSCLE_GROUPS = ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core'];
    const MUSCLE_COLORS: Record<string, string> = {
      Chest: '#a599ff', Back: '#5eda9e', Legs: '#ff9f4d',
      Shoulders: '#89dceb', Arms: '#ff6b9d', Core: '#ffd93d',
    };
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const cutoff = sevenDaysAgo.toISOString().slice(0, 10);

    const volumeByMuscle: Record<string, number> = {};
    MUSCLE_GROUPS.forEach(m => { volumeByMuscle[m] = 0; });

    gymLogs
      .filter(l => l.date >= cutoff)
      .forEach(log => {
        log.exercises?.forEach(ex => {
          const rawMuscle = ex.muscle || '';
          // Normalize to canonical group
          let group = 'Other';
          if (/chest|pec/i.test(rawMuscle)) group = 'Chest';
          else if (/back|lat|row|trap/i.test(rawMuscle)) group = 'Back';
          else if (/leg|quad|ham|glute|calf|calves/i.test(rawMuscle)) group = 'Legs';
          else if (/shoulder|delt/i.test(rawMuscle)) group = 'Shoulders';
          else if (/arm|bicep|tricep|forearm/i.test(rawMuscle)) group = 'Arms';
          else if (/core|abs|oblique/i.test(rawMuscle)) group = 'Core';
          if (group === 'Other') return;

          let vol = 0;
          ex.setsLog?.filter((s: any) => s.completed && s.weight && s.reps)
            .forEach((s: any) => { vol += s.weight * s.reps; });
          volumeByMuscle[group] = (volumeByMuscle[group] || 0) + vol;
        });
      });

    const entries = MUSCLE_GROUPS
      .map(g => ({ muscle: g, volume: volumeByMuscle[g] || 0, color: MUSCLE_COLORS[g] }))
      .filter(e => e.volume > 0)
      .sort((a, b) => b.volume - a.volume);

    const max = entries[0]?.volume || 1;
    return entries.map(e => ({ ...e, pct: Math.round((e.volume / max) * 100) }));
  }, [gymLogs]);

  const availableMuscles = useMemo(() => {
    const set = new Set<string>();
    uniqueExercises.forEach(e => { if (e.muscle) set.add(e.muscle); });
    return Array.from(set);
  }, [uniqueExercises]);
  
  const activePointData = activePointIndex !== null && chartCoords[activePointIndex] ? chartCoords[activePointIndex].data : (chartData.length > 0 ? chartData[chartData.length - 1] : null);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <Animated.View style={[styles.header, { opacity: animHeader, transform: [{ translateY: animHeader.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }] }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Progress Analytics</Text>
        <View style={{ width: 32 }} />
      </Animated.View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.exerciseSelectorSection}>
          <View style={styles.filterHeaderRow}>
            <View style={styles.routineBadgeContainer}>
              <Ionicons name="sparkles" size={14} color="#a599ff" />
              <Text style={styles.routineBadgeText}>{pickerFilterMode === 'today' ? (todayPlanInfo ? `Today: ${todayPlanInfo.name}` : "Today's Routine") : "All Logged Exercises"}</Text>
            </View>
            <View style={styles.modeTogglePillContainer}>
              <TouchableOpacity style={[styles.modeTogglePill, pickerFilterMode === 'today' && styles.modeTogglePillActive]} onPress={() => { setPickerFilterMode('today'); setSelectedMuscleFilter(null); }}>
                <Text style={[styles.modeToggleText, pickerFilterMode === 'today' && styles.modeToggleTextActive]}>Today</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modeTogglePill, pickerFilterMode === 'all' && styles.modeTogglePillActive]} onPress={() => setPickerFilterMode('all')}>
                <Text style={[styles.modeToggleText, pickerFilterMode === 'all' && styles.modeToggleTextActive]}>All</Text>
              </TouchableOpacity>
            </View>
          </View>

          {pickerFilterMode === 'all' && availableMuscles.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.muscleScroll}>
              <TouchableOpacity style={[styles.muscleChip, selectedMuscleFilter === null && styles.muscleChipActive]} onPress={() => setSelectedMuscleFilter(null)}>
                <Text style={[styles.muscleChipText, selectedMuscleFilter === null && styles.muscleChipTextActive]}>All Muscles</Text>
              </TouchableOpacity>
              {availableMuscles.map(m => (
                <TouchableOpacity key={m} style={[styles.muscleChip, selectedMuscleFilter === m && styles.muscleChipActive]} onPress={() => setSelectedMuscleFilter(selectedMuscleFilter === m ? null : m)}>
                  <Text style={[styles.muscleChipText, selectedMuscleFilter === m && styles.muscleChipTextActive]}>{m}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.exerciseScroll}>
            {filteredExercises.map(ex => {
              const isSelected = selectedExId === ex.id;
              return (
                <TouchableOpacity key={ex.id} style={[styles.exerciseCardPill, isSelected && styles.exerciseCardPillActive]} onPress={() => { setSelectedExId(ex.id); setActivePointIndex(null); }} activeOpacity={0.7}>
                  <Text style={[styles.exercisePillText, isSelected && styles.exercisePillTextActive]} numberOfLines={1}>{ex.name}</Text>
                  {ex.isToday && <View style={styles.todayDot} />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* AI Insight Card */}
        {selectedExId && (
          <Animated.View style={[styles.glassCard, styles.aiCard, { opacity: animInsight, transform: [{ translateY: animInsight.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }]}>
            <View style={styles.aiHeader}>
               <Animated.View style={{ opacity: isAnalyzing ? pulseAnim : 1 }}>
                 <Ionicons name="sparkles" size={16} color="#a599ff" />
               </Animated.View>
               <Text style={styles.aiTitle}>SARA Insight</Text>
            </View>
            <Text style={styles.aiBody}>
              {isAnalyzing ? "Analyzing progression..." : (saraInsightCache[selectedExId] || "Keep pushing hard!")}
            </Text>
          </Animated.View>
        )}

        <Animated.View style={[styles.glassCard, { opacity: animChart, transform: [{ translateY: animChart.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }]}>
          <View style={styles.chartHeader}>
            <Text style={styles.cardTitle} numberOfLines={1} ellipsizeMode="tail">
              {uniqueExercises.find(e => e.id === selectedExId)?.name || 'Load Progression'}
            </Text>
            <View style={styles.chartHeaderSubRow}>
              <View style={styles.metricToggles}>
                 <TouchableOpacity style={[styles.metricToggleBtn, activeMetricMode === 'working' && styles.metricToggleBtnActive]} onPress={() => setActiveMetricMode('working')}>
                    <View style={styles.metricDotWorking} />
                    <Text style={[styles.metricToggleText, activeMetricMode === 'working' && styles.metricToggleTextActive]}>Working</Text>
                 </TouchableOpacity>
                 <TouchableOpacity style={[styles.metricToggleBtn, activeMetricMode === '1rm' && styles.metricToggleBtnActive]} onPress={() => setActiveMetricMode('1rm')}>
                    <View style={styles.metricDot1RM} />
                    <Text style={[styles.metricToggleText, activeMetricMode === '1rm' && styles.metricToggleTextActive]}>Est 1RM</Text>
                 </TouchableOpacity>
              </View>
              {activePointData && (
                <View style={styles.activeTooltipBadge}>
                  <Text style={styles.tooltipWeight}>
                    {activeMetricMode === 'working' ? (activePointData.rawWeight > 0 ? `${activePointData.rawWeight} kg` : '-') : `${Math.round(activePointData.max1RM)} kg`}
                  </Text>
                  {activeMetricMode === 'working' && activePointData.rawReps > 0 && (
                    <Text style={styles.tooltipDate}> ({activePointData.rawReps} reps)</Text>
                  )}
                </View>
              )}
            </View>
          </View>

          {selectedExId && chartData.length > 0 ? (
            <View style={styles.svgWrapper}>
              <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
                <Defs>
                  <LinearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor={activeMetricMode === 'working' ? "#a599ff" : "#5eda9e"} stopOpacity="0.35" />
                    <Stop offset="1" stopColor={activeMetricMode === 'working' ? "#a599ff" : "#5eda9e"} stopOpacity="0.0" />
                  </LinearGradient>
                </Defs>

                <Path d={`M 0 ${PADDING} L ${CHART_WIDTH} ${PADDING}`} stroke="rgba(255,255,255,0.06)" strokeWidth="1" strokeDasharray="4 4" />
                <Path d={`M 0 ${CHART_HEIGHT / 2} L ${CHART_WIDTH} ${CHART_HEIGHT / 2}`} stroke="rgba(255,255,255,0.06)" strokeWidth="1" strokeDasharray="4 4" />
                <Path d={`M 0 ${CHART_HEIGHT - PADDING} L ${CHART_WIDTH} ${CHART_HEIGHT - PADDING}`} stroke="rgba(255,255,255,0.06)" strokeWidth="1" strokeDasharray="4 4" />

                {/* 1RM Line (Dashed, background) */}
                {activeMetricMode === '1rm' && (
                  <>
                     {chartCoords.length > 1 && (
                      <Path d={`${smoothPath1RM} L ${CHART_WIDTH - PADDING},${CHART_HEIGHT - PADDING} L ${PADDING},${CHART_HEIGHT - PADDING} Z`} fill="url(#chartGrad)" />
                     )}
                     <Path d={smoothPath1RM} fill="none" stroke="#5eda9e" strokeWidth="12" strokeOpacity="0.15" strokeLinecap="round" strokeLinejoin="round" />
                     <Path d={smoothPath1RM} fill="none" stroke="#5eda9e" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
                     {chartCoords.map((pt: any, idx) => {
                       if (pt.virtual) return null;
                       const isActive = activePointIndex === idx || (activePointIndex === null && pt.data === activePointData);
                       return (
                         <G key={`1rm-${idx}`}>
                           {isActive && <Circle cx={pt.x} cy={pt.y1RM} r={10} fill="rgba(94,218,158,0.25)" />}
                           <Circle cx={pt.x} cy={pt.y1RM} r={isActive ? 6 : 4.5} fill="#141416" stroke="#5eda9e" strokeWidth={isActive ? 3 : 2} onPress={() => setActivePointIndex(idx)} />
                         </G>
                       );
                     })}
                  </>
                )}

                {/* Working Line (Solid, foreground) */}
                {activeMetricMode === 'working' && (
                   <>
                     {chartCoords.length > 1 && (
                      <Path d={`${smoothPath} L ${CHART_WIDTH - PADDING},${CHART_HEIGHT - PADDING} L ${PADDING},${CHART_HEIGHT - PADDING} Z`} fill="url(#chartGrad)" />
                     )}
                     <Path d={smoothPath} fill="none" stroke="#a599ff" strokeWidth="12" strokeOpacity="0.15" strokeLinecap="round" strokeLinejoin="round" />
                     <Path d={smoothPath} fill="none" stroke="#a599ff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
                     {chartCoords.map((pt: any, idx) => {
                       if (pt.virtual) return null;
                       const isActive = activePointIndex === idx || (activePointIndex === null && pt.data === activePointData);
                       return (
                         <G key={`work-${idx}`}>
                           {isActive && <Circle cx={pt.x} cy={pt.y} r={10} fill="rgba(165,153,255,0.25)" />}
                           <Circle cx={pt.x} cy={pt.y} r={isActive ? 6 : 4.5} fill="#141416" stroke="#a599ff" strokeWidth={isActive ? 3 : 2} onPress={() => setActivePointIndex(idx)} />
                         </G>
                       );
                     })}
                   </>
                )}
              </Svg>
              <View style={styles.chartDateAxis}>
                <Text style={styles.axisDateText}>{chartData[0]?.dateStr || ''}</Text>
                {chartData.length > 1 && <Text style={styles.axisDateText}>{chartData[chartData.length - 1]?.dateStr || ''}</Text>}
              </View>
            </View>
          ) : (
            <View style={styles.emptyGraphBox}>
              <View style={styles.emptyIconCircle}>
                <Ionicons name="barbell-outline" size={28} color="#a599ff" />
              </View>
              <Text style={styles.emptyGraphTitle}>No Logged Data Yet</Text>
              <Text style={styles.emptyGraphSubtitle}>Log sets for this exercise to generate progression analytics.</Text>
            </View>
          )}
        </Animated.View>

        {selectedExId && chartData.length > 0 && (
          <Animated.View style={[styles.statsGrid, { opacity: animStats, transform: [{ translateY: animStats.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }]}>
            <View style={styles.statCardRow}>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>PEAK WEIGHT</Text>
                <Text style={styles.statValue}>{peakWeight}kg</Text>
                <Text style={styles.statSubText}>Best working set</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>EST 1RM</Text>
                <Text style={styles.statValue}>{Math.round(peak1RM)}kg</Text>
                <Text style={styles.statSubText}>All-time max</Text>
              </View>
            </View>
            <View style={styles.statCardRow}>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>SESSIONS</Text>
                <Text style={styles.statValue}>{totalSessions}</Text>
                <Text style={styles.statSubText}>Total recorded</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>VOLUME</Text>
                <Text style={styles.statValue}>{totalVolume >= 1000 ? `${(totalVolume/1000).toFixed(1)}k` : totalVolume}</Text>
                <Text style={styles.statSubText}>Total tonnage kg</Text>
              </View>
            </View>
          </Animated.View>
        )}

        {/* G2: Muscle Group Volume Chart (last 7 days) */}
        {muscleVolumeData.length > 0 && (
          <View style={styles.glassCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <Text style={styles.cardTitle}>Weekly Muscle Volume</Text>
              <View style={{ backgroundColor: 'rgba(94,218,158,0.12)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 10, color: '#5eda9e' }}>LAST 7 DAYS</Text>
              </View>
            </View>
            <Text style={styles.cardSubtitle}>Volume = sets × reps × weight per muscle group</Text>
            <View style={{ marginTop: 16, gap: 10 }}>
              {muscleVolumeData.map((item, i) => (
                <View key={item.muscle}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: item.color }} />
                      <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 12, color: '#f2f2f7' }}>{item.muscle}</Text>
                      {i === muscleVolumeData.length - 1 && muscleVolumeData.length > 1 && (
                        <View style={{ backgroundColor: 'rgba(255,105,97,0.15)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                          <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 9, color: '#ff6961' }}>needs work</Text>
                        </View>
                      )}
                    </View>
                    <Text style={{ fontFamily: FONT_FAMILY.medium, fontSize: 11, color: '#8e8e93' }}>
                      {item.volume >= 1000 ? `${(item.volume / 1000).toFixed(1)}k` : item.volume} kg
                    </Text>
                  </View>
                  <View style={{ height: 6, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
                    <View style={{ height: 6, width: `${item.pct}%`, backgroundColor: item.color, borderRadius: 3 }} />
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}

        {volumeData.length > 0 && (
          <View style={styles.glassCard}>
            <Text style={styles.cardTitle}>Global Volume Distribution</Text>
            <Text style={styles.cardSubtitle}>Total tonnage moved across all exercises</Text>
            <View style={styles.donutContainer}>
              <View style={styles.donutSvgWrapper}>
                <Svg width={150} height={150} viewBox="0 0 150 150">
                  {(() => {
                    const CIRCUMFERENCE = 2 * Math.PI * 52;
                    let cumulativePercent = 0;
                    return volumeData.map((item, i) => {
                      const strokeDasharray = `${(item.percent / 100) * CIRCUMFERENCE} ${CIRCUMFERENCE}`;
                      const strokeDashoffset = -((cumulativePercent / 100) * CIRCUMFERENCE);
                      cumulativePercent += item.percent;
                      return (
                        <Circle key={i} cx={75} cy={75} r={52} stroke={item.color} strokeWidth={18} strokeDasharray={strokeDasharray} strokeDashoffset={strokeDashoffset} fill="none" strokeLinecap="round" />
                      );
                    });
                  })()}
                </Svg>
                <View style={styles.donutCenterLabel}>
                  <Text style={styles.donutCenterValue}>{volumeData.reduce((sum, item) => sum + item.volume, 0).toLocaleString()}</Text>
                  <Text style={styles.donutCenterSub}>kg Total</Text>
                </View>
              </View>
              <View style={styles.donutLegend}>
                {volumeData.map((item, idx) => (
                  <View key={idx} style={styles.donutLegendRow}>
                    <View style={[styles.donutDot, { backgroundColor: item.color }]} />
                    <Text style={styles.donutLegendName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.donutLegendPercent}>{item.percent}%</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: any) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: '#000000' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingTop: Platform.OS === 'ios' ? 8 : 16, paddingBottom: SPACE.md },
    backBtn: { padding: 4 },
    headerTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 18, color: '#ffffff' },
    content: { paddingHorizontal: 8, paddingBottom: 120 },
    exerciseSelectorSection: { marginBottom: SPACE.lg },
    filterHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACE.sm },
    routineBadgeContainer: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(165,153,255,0.08)', paddingVertical: 4, paddingHorizontal: 10, borderRadius: RADIUS.full, borderWidth: 1, borderColor: 'rgba(165,153,255,0.15)' },
    routineBadgeText: { fontFamily: FONT_FAMILY.bold, fontSize: 12, color: '#a599ff' },
    modeTogglePillContainer: { flexDirection: 'row', backgroundColor: '#141416', borderRadius: RADIUS.full, padding: 2, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
    modeTogglePill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: RADIUS.full },
    modeTogglePillActive: { backgroundColor: 'rgba(255,255,255,0.15)' },
    modeToggleText: { fontFamily: FONT_FAMILY.medium, fontSize: 11, color: '#8e8e93' },
    modeToggleTextActive: { color: '#ffffff' },
    muscleScroll: { gap: 6, marginBottom: SPACE.sm },
    muscleChip: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: RADIUS.full, backgroundColor: '#141416', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
    muscleChipActive: { borderColor: '#a599ff', backgroundColor: 'rgba(165,153,255,0.1)' },
    muscleChipText: { fontFamily: FONT_FAMILY.medium, fontSize: 11, color: '#8e8e93' },
    muscleChipTextActive: { color: '#a599ff' },
    exerciseScroll: { gap: 8, paddingVertical: 4 },
    exerciseCardPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADIUS.lg, backgroundColor: '#141416', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
    exerciseCardPillActive: { backgroundColor: '#a599ff', borderColor: '#a599ff' },
    exercisePillText: { fontFamily: FONT_FAMILY.bold, fontSize: 13, color: '#8e8e93' },
    exercisePillTextActive: { color: '#000000' },
    todayDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#5eda9e' },
    aiCard: { backgroundColor: 'rgba(165,153,255,0.08)', borderColor: 'rgba(165,153,255,0.2)' },
    aiHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
    aiTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 12, color: '#a599ff', textTransform: 'uppercase', letterSpacing: 1 },
    aiBody: { fontFamily: FONT_FAMILY.medium, fontSize: 14, color: '#e0e0e0', lineHeight: 20 },
    glassCard: { backgroundColor: '#141416', borderRadius: RADIUS.xl, padding: SPACE.lg, marginBottom: SPACE.lg, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', ...SHADOW.sm },
    chartHeader: { marginBottom: SPACE.md, gap: 4 },
    cardTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 16, color: '#ffffff' },
    chartHeaderSubRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 },
    metricToggles: { flexDirection: 'row', gap: 12 },
    metricToggleBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, opacity: 0.5 },
    metricToggleBtnActive: { opacity: 1 },
    metricDotWorking: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#a599ff' },
    metricDot1RM: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#5eda9e' },
    metricToggleText: { fontFamily: FONT_FAMILY.bold, fontSize: 12, color: '#ffffff' },
    metricToggleTextActive: { color: '#ffffff' },
    cardSubtitle: { fontFamily: FONT_FAMILY.body, fontSize: 12, color: '#8e8e93', flex: 1 },
    activeTooltipBadge: { flexDirection: 'row', alignItems: 'baseline', backgroundColor: 'rgba(165,153,255,0.12)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.md, borderWidth: 1, borderColor: 'rgba(165,153,255,0.2)' },
    tooltipWeight: { fontFamily: FONT_FAMILY.bold, fontSize: 13, color: '#ffffff' },
    tooltipDate: { fontFamily: FONT_FAMILY.mono, fontSize: 11, color: '#8e8e93' },
    svgWrapper: { alignItems: 'center', marginTop: SPACE.xs },
    chartDateAxis: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginTop: 6, paddingHorizontal: 10 },
    axisDateText: { fontFamily: FONT_FAMILY.mono, fontSize: 10, color: '#636366' },
    emptyGraphBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: SPACE.xxl },
    emptyIconCircle: { width: 54, height: 54, borderRadius: 27, backgroundColor: 'rgba(165,153,255,0.1)', alignItems: 'center', justifyContent: 'center', marginBottom: SPACE.sm },
    emptyGraphTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 15, color: '#ffffff' },
    emptyGraphSubtitle: { fontFamily: FONT_FAMILY.body, fontSize: 12, color: '#8e8e93', textAlign: 'center', marginTop: 4, paddingHorizontal: SPACE.xl },
    statsGrid: { gap: 6, marginBottom: SPACE.lg },
    statCardRow: { flexDirection: 'row', gap: 6 },
    statCard: { flex: 1, backgroundColor: '#141416', borderRadius: RADIUS.lg, paddingVertical: SPACE.md, paddingHorizontal: 4, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', alignItems: 'center' },
    statLabel: { fontFamily: FONT_FAMILY.bold, fontSize: 10, color: '#8e8e93', letterSpacing: 0.8 },
    statValue: { fontFamily: FONT_FAMILY.bold, fontSize: 20, color: '#ffffff', marginVertical: 4 },
    statSubText: { fontFamily: FONT_FAMILY.body, fontSize: 10, color: '#636366' },
    donutContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: SPACE.md, gap: SPACE.md },
    donutSvgWrapper: { width: 150, height: 150, alignItems: 'center', justifyContent: 'center', position: 'relative' },
    donutCenterLabel: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
    donutCenterValue: { fontFamily: FONT_FAMILY.bold, fontSize: 16, color: '#FFFFFF' },
    donutCenterSub: { fontFamily: FONT_FAMILY.medium, fontSize: 11, color: '#A1A1AA' },
    donutLegend: { flex: 1, gap: 8 },
    donutLegendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    donutDot: { width: 10, height: 10, borderRadius: 5 },
    donutLegendName: { flex: 1, fontFamily: FONT_FAMILY.medium, fontSize: 13, color: '#FFFFFF' },
    donutLegendPercent: { fontFamily: FONT_FAMILY.bold, fontSize: 13, color: '#A1A1AA' },
  });
