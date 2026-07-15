import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Dimensions, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Polyline, Circle, Defs, LinearGradient, Stop, Path } from 'react-native-svg';
import { COLORS, FONT_FAMILY, FONT_SIZE, SPACE, RADIUS, SHADOW } from '../../theme/tokens';
import { useMobileData } from '../../contexts/MobileDataContext';
import { GymExerciseLog } from '../../types/gym.types';

const { width } = Dimensions.get('window');

export default function GymProgressScreen() {
  const navigation = useNavigation<any>();
  const { gymLogs } = useMobileData();

  // 1. Get all unique exercises logged by user
  const uniqueExercises = useMemo(() => {
    const exMap = new Map<string, string>();
    gymLogs.forEach(log => {
      log.exercises?.forEach(ex => {
        if (!exMap.has(ex.exerciseId)) {
          exMap.set(ex.exerciseId, ex.name);
        }
      });
    });
    return Array.from(exMap.entries()).map(([id, name]) => ({ id, name }));
  }, [gymLogs]);

  const [selectedExId, setSelectedExId] = useState<string | null>(
    uniqueExercises.length > 0 ? uniqueExercises[0].id : null
  );

  // 2. Compute stats and chart data for selected exercise
  const { chartData, maxWeight, monthlyImprovement, totalSessions } = useMemo(() => {
    if (!selectedExId) return { chartData: [], maxWeight: 0, monthlyImprovement: 0, totalSessions: 0 };

    let sessionsWithEx = gymLogs
      .map(log => {
        const ex = log.exercises?.find(e => e.exerciseId === selectedExId);
        if (!ex) return null;
        
        const validSets = ex.setsLog.filter((s: any) => s.completed && s.weight && s.weight > 0);
        if (validSets.length === 0) return null;
        
        const maxWeightForSession = Math.max(...validSets.map((s: any) => s.weight as number));
        return {
          date: new Date(log.date),
          maxWeight: maxWeightForSession,
          log
        };
      })
      .filter(Boolean) as { date: Date, maxWeight: number, log: any }[];

    sessionsWithEx = sessionsWithEx.sort((a, b) => a.date.getTime() - b.date.getTime());

    const totalSessions = sessionsWithEx.length;
    let maxWeight = 0;
    
    // Improvement calc
    const now = new Date();
    let currentMonthMax = 0;
    let lastMonthMax = 0;

    sessionsWithEx.forEach(s => {
      if (s.maxWeight > maxWeight) maxWeight = s.maxWeight;
      
      const isCurrentMonth = s.date.getMonth() === now.getMonth() && s.date.getFullYear() === now.getFullYear();
      const isLastMonth = (now.getMonth() === 0 && s.date.getMonth() === 11 && s.date.getFullYear() === now.getFullYear() - 1) 
                       || (s.date.getMonth() === now.getMonth() - 1 && s.date.getFullYear() === now.getFullYear());

      if (isCurrentMonth && s.maxWeight > currentMonthMax) currentMonthMax = s.maxWeight;
      if (isLastMonth && s.maxWeight > lastMonthMax) lastMonthMax = s.maxWeight;
    });

    const monthlyImprovement = lastMonthMax > 0 ? currentMonthMax - lastMonthMax : 0;

    return { chartData: sessionsWithEx, maxWeight, monthlyImprovement, totalSessions };
  }, [gymLogs, selectedExId]);

  // 3. SVG Chart calculations
  const CHART_HEIGHT = 200;
  const CHART_WIDTH = width - SPACE.xl * 2;
  const PADDING = 20;

  const points = useMemo(() => {
    if (chartData.length === 0) return '';
    if (chartData.length === 1) {
      return `${PADDING},${CHART_HEIGHT / 2}`;
    }

    const minWeight = Math.min(...chartData.map(d => d.maxWeight));
    const weightRange = maxWeight - minWeight || 1; // avoid div by 0

    return chartData.map((d, i) => {
      const x = PADDING + (i / (chartData.length - 1)) * (CHART_WIDTH - PADDING * 2);
      const y = CHART_HEIGHT - PADDING - ((d.maxWeight - minWeight) / weightRange) * (CHART_HEIGHT - PADDING * 2);
      return `${x},${y}`;
    }).join(' ');
  }, [chartData, maxWeight, CHART_WIDTH]);

  const chartCoords = useMemo(() => {
     if (chartData.length === 0) return [];
     if (chartData.length === 1) return [{ x: PADDING, y: CHART_HEIGHT / 2, data: chartData[0] }];
     const minWeight = Math.min(...chartData.map(d => d.maxWeight));
     const weightRange = maxWeight - minWeight || 1;
     return chartData.map((d, i) => {
        return {
          x: PADDING + (i / (chartData.length - 1)) * (CHART_WIDTH - PADDING * 2),
          y: CHART_HEIGHT - PADDING - ((d.maxWeight - minWeight) / weightRange) * (CHART_HEIGHT - PADDING * 2),
          data: d
        };
     });
  }, [chartData, maxWeight, CHART_WIDTH]);


  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Progress</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Picker */}
      <View style={styles.pickerContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pickerScroll}>
          {uniqueExercises.map(ex => (
            <TouchableOpacity 
              key={ex.id} 
              style={[styles.pill, selectedExId === ex.id && styles.pillActive]}
              onPress={() => setSelectedExId(ex.id)}
            >
              <Text style={[styles.pillText, selectedExId === ex.id && styles.pillTextActive]}>{ex.name}</Text>
            </TouchableOpacity>
          ))}
          {uniqueExercises.length === 0 && (
            <Text style={styles.emptyText}>No exercises logged yet.</Text>
          )}
        </ScrollView>
      </View>

      {/* Chart */}
      <ScrollView contentContainerStyle={styles.content}>
        {selectedExId && chartData.length > 0 ? (
          <View style={styles.chartCard}>
            <Text style={styles.chartTitle}>Max Weight Over Time</Text>
            <View style={styles.svgContainer}>
              <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
                <Defs>
                  <LinearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor="#C490FF" stopOpacity="0.5" />
                    <Stop offset="1" stopColor="#C490FF" stopOpacity="0.0" />
                  </LinearGradient>
                </Defs>
                
                {/* Grid Lines */}
                <Path d={`M 0 ${PADDING} L ${CHART_WIDTH} ${PADDING}`} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                <Path d={`M 0 ${CHART_HEIGHT / 2} L ${CHART_WIDTH} ${CHART_HEIGHT / 2}`} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                <Path d={`M 0 ${CHART_HEIGHT - PADDING} L ${CHART_WIDTH} ${CHART_HEIGHT - PADDING}`} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                
                {chartData.length > 1 && (
                  <Path 
                    d={`M ${PADDING},${CHART_HEIGHT} L ${points} L ${CHART_WIDTH - PADDING},${CHART_HEIGHT} Z`} 
                    fill="url(#grad)" 
                  />
                )}
                <Polyline
                  points={points}
                  fill="none"
                  stroke="#C490FF"
                  strokeWidth="3"
                />
                {chartCoords.map((pt, idx) => (
                  <Circle 
                    key={idx} 
                    cx={pt.x} 
                    cy={pt.y} 
                    r={4} 
                    fill="#1C1C1E" 
                    stroke="#C490FF" 
                    strokeWidth="2" 
                    onPress={() => {
                      navigation.navigate('WorkoutSummary', { date: pt.data.log.date, readOnly: true });
                    }}
                  />
                ))}
              </Svg>
            </View>
          </View>
        ) : (
           <View style={[styles.chartCard, { alignItems: 'center', justifyContent: 'center', height: 250 }]}>
             <Ionicons name="bar-chart-outline" size={48} color={COLORS.textMuted} />
             <Text style={styles.emptyText}>Not enough data to graph.</Text>
           </View>
        )}

        {/* Stats Row */}
        {selectedExId && (
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Current Best</Text>
              <Text style={styles.statValue}>{maxWeight > 0 ? `${maxWeight}kg` : '-'}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Monthly Imp.</Text>
              <Text style={[styles.statValue, { color: monthlyImprovement > 0 ? '#34C759' : COLORS.textPrimary }]}>
                {monthlyImprovement > 0 ? '+' : ''}{monthlyImprovement}kg
              </Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Sessions</Text>
              <Text style={styles.statValue}>{totalSessions}</Text>
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACE.xl, paddingTop: Platform.OS === 'ios' ? 10 : 20, paddingBottom: SPACE.md },
  backBtn: { padding: SPACE.xs },
  headerTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 18, color: COLORS.textPrimary },
  
  pickerContainer: { paddingVertical: SPACE.md, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  pickerScroll: { paddingHorizontal: SPACE.xl, gap: SPACE.sm },
  pill: { paddingHorizontal: SPACE.md, paddingVertical: 10, borderRadius: RADIUS.full, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  pillActive: { backgroundColor: '#C490FF', borderColor: '#C490FF' },
  pillText: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.sm, color: COLORS.textMuted },
  pillTextActive: { color: COLORS.background },
  
  content: { padding: SPACE.xl, paddingBottom: 100 },
  
  chartCard: { backgroundColor: '#1C1C1E', borderRadius: RADIUS.lg, padding: SPACE.lg, marginBottom: SPACE.xl, ...SHADOW.md },
  chartTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 16, color: COLORS.textPrimary, marginBottom: SPACE.lg },
  svgContainer: { alignItems: 'center' },
  
  statsRow: { flexDirection: 'row', gap: SPACE.md },
  statBox: { flex: 1, backgroundColor: '#1C1C1E', borderRadius: RADIUS.md, padding: SPACE.lg, alignItems: 'center', ...SHADOW.sm },
  statLabel: { fontFamily: FONT_FAMILY.body, fontSize: 11, color: COLORS.textMuted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 },
  statValue: { fontFamily: FONT_FAMILY.bold, fontSize: 20, color: COLORS.textPrimary },
  
  emptyText: { fontFamily: FONT_FAMILY.body, fontSize: 14, color: COLORS.textMuted, marginTop: SPACE.sm },
});
