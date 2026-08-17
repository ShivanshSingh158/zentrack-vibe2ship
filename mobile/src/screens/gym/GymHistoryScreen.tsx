import React, { useMemo, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withSequence, withDelay } from 'react-native-reanimated';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS, SHADOW } from '../../theme/tokens';
import { GymDayLog, GymNavigationParamList } from '../../types/gym.types';
import { springs } from '../../theme/motion';
import { useWellnessData } from '../../contexts/domains/WellnessContext';
import { calculateGymStreak } from '../../utils/gymUtils';
import { useTheme } from "../../contexts/ThemeContext";
import { StatusBar } from 'expo-status-bar';

export default function GymHistoryScreen() {
    const { colors, isDark } = useTheme();
    const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const navigation = useNavigation<NativeStackNavigationProp<GymNavigationParamList>>();
  const { gymLogs } = useWellnessData();
  const scrollViewRef = useRef<ScrollView>(null);

  // Streak
  const streak = useMemo(() => calculateGymStreak(gymLogs), [gymLogs]);

  // P5b — Bouncy entrance for streak card
  const streakScale = useSharedValue(0.7);
  const streakOpacity = useSharedValue(0);
  useEffect(() => {
    streakOpacity.value = withDelay(100, withSpring(1, springs.gentle));
    streakScale.value = withDelay(100, withSequence(
      withSpring(1.08, springs.bouncy),
      withSpring(1, springs.snappy)
    ));
  }, []);
  const streakStyle = useAnimatedStyle(() => ({
    transform: [{ scale: streakScale.value }],
    opacity: streakOpacity.value,
  }));

  // Heatmap generation
  const weeks = 13; // 13 weeks visible (approx 90 days)
  const daysPerWeek = 7;
  
  const heatmapData = useMemo(() => {
    const today = new Date();
    today.setHours(0,0,0,0);
    
    // Map of YYYY-MM-DD -> total sets (for intensity)
    const logMap = new Map<string, any>();
    gymLogs.forEach(log => {
      const d = new Date(log.date);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      
      let totalSets = 0;
      log.exercises?.forEach(ex => {
        totalSets += ex.setsLog.filter((s: any) => s.completed).length;
      });
      
      logMap.set(key, { totalSets, log });
    });

    const grid = [];
    // Start from the Sunday of the week 14 weeks ago
    const startDay = new Date(today);
    startDay.setDate(today.getDate() - today.getDay() - (weeks - 1) * 7);

    for (let w = 0; w < weeks; w++) {
      const weekCol = [];
      for (let d = 0; d < daysPerWeek; d++) {
        const currentDate = new Date(startDay);
        currentDate.setDate(startDay.getDate() + (w * 7) + d);
        
        const key = `${currentDate.getFullYear()}-${String(currentDate.getMonth()+1).padStart(2,'0')}-${String(currentDate.getDate()).padStart(2,'0')}`;
        const hasLog = logMap.has(key);
        const data = logMap.get(key);
        
        weekCol.push({
          date: currentDate,
          dateStr: key,
          isFuture: currentDate > today,
          intensity: hasLog ? Math.max(0.3, Math.min(1.0, data.totalSets / 20)) : 0, // max intensity at 20 sets
          log: data?.log || null
        });
      }
      grid.push(weekCol);
    }
    return grid;
  }, [gymLogs]);


  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <StatusBar style={isDark ? 'light' : 'dark'} backgroundColor={colors.background} />
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>History</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        
        {/* Streak Counter — P5b: bouncy entrance */}
        <Animated.View style={[styles.streakCard, streakStyle]}>
          <View style={styles.streakLeft}>
            <View style={styles.streakBadge}>
              <Ionicons name="flame" size={20} color={isDark ? '#FFD166' : '#D97706'} style={{ marginRight: 6 }} />
              <Text style={[styles.streakBadgeText, { color: isDark ? '#FFD166' : '#D97706' }]}>{streak}</Text>
            </View>
            <View>
              <Text style={styles.streakTitle}>Day Streak</Text>
              <Text style={styles.streakSubtitle}>Keep the momentum going!</Text>
            </View>
          </View>
        </Animated.View>

        {/* Heatmap */}
        <View style={styles.heatmapCard}>
          <Text style={styles.heatmapTitle}>Activity</Text>
          
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false} 
            contentContainerStyle={{ paddingBottom: 10 }}
            ref={scrollViewRef}
            onContentSizeChange={() => {
              scrollViewRef.current?.scrollToEnd({ animated: false });
            }}
          >
            <View style={styles.gridContainer}>
              {/* Day Labels */}
              <View style={styles.dayLabels}>
                <Text style={styles.dayLabelText}>S</Text>
                <Text style={styles.dayLabelText}>M</Text>
                <Text style={styles.dayLabelText}>T</Text>
                <Text style={styles.dayLabelText}>W</Text>
                <Text style={styles.dayLabelText}>T</Text>
                <Text style={styles.dayLabelText}>F</Text>
                <Text style={styles.dayLabelText}>S</Text>
              </View>

              {/* Grid */}
              <View style={styles.grid}>
                {heatmapData.map((week, wIdx) => (
                  <View key={`w-${wIdx}`} style={styles.column}>
                    {week.map((day, dIdx) => (
                      <TouchableOpacity
                        key={`d-${dIdx}`}
                        disabled={!day.log || day.isFuture}
                        onPress={() => {
                          if (day.log) {
                            navigation.navigate('WorkoutSummary', { date: day.log.date, readOnly: true });
                          }
                        }}
                        style={[
                          styles.square,
                          day.isFuture && { backgroundColor: 'transparent' },
                          !day.isFuture && day.intensity === 0 && { backgroundColor: isDark ? '#2C2C2E' : '#E2E1EA' },
                          !day.isFuture && day.intensity > 0 && {
                            backgroundColor: isDark
                              ? `rgba(196, 144, 255, ${day.intensity})`
                              : `rgba(108, 92, 231, ${day.intensity})`
                          }
                        ]}
                      />
                    ))}
                  </View>
                ))}
              </View>
            </View>
          </ScrollView>

          {/* Legend */}
          <View style={styles.legendRow}>
            <Text style={styles.legendText}>Less</Text>
            <View style={[styles.legendSquare, { backgroundColor: isDark ? '#2C2C2E' : '#E2E1EA' }]} />
            <View style={[styles.legendSquare, { backgroundColor: isDark ? 'rgba(196, 144, 255, 0.3)' : 'rgba(108, 92, 231, 0.3)' }]} />
            <View style={[styles.legendSquare, { backgroundColor: isDark ? 'rgba(196, 144, 255, 0.6)' : 'rgba(108, 92, 231, 0.6)' }]} />
            <View style={[styles.legendSquare, { backgroundColor: isDark ? 'rgba(196, 144, 255, 1.0)' : 'rgba(108, 92, 231, 1.0)' }]} />
            <Text style={styles.legendText}>More</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: any, isDark: boolean = true) => StyleSheet.create({
      root: { flex: 1, backgroundColor: isDark ? '#000000' : colors.background },
      header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACE.xl, paddingTop: Platform.OS === 'ios' ? 10 : 20, paddingBottom: SPACE.md },
      backBtn: { padding: SPACE.xs },
      headerTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 18, color: colors.textPrimary },
      
      content: { padding: SPACE.xl, paddingBottom: 100 },

      streakCard: { backgroundColor: isDark ? '#1C1C1E' : colors.surface, borderRadius: RADIUS.lg, padding: SPACE.lg, marginBottom: SPACE.xl, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.05)' : colors.border, ...SHADOW.md },
      streakLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
      streakBadge: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? 'rgba(255, 140, 0, 0.15)' : 'rgba(217, 119, 6, 0.12)', borderWidth: 1, borderColor: isDark ? 'rgba(255, 140, 0, 0.3)' : 'rgba(217, 119, 6, 0.25)', paddingHorizontal: 16, paddingVertical: 10, borderRadius: RADIUS.full },
      streakBadgeText: { fontFamily: FONT_FAMILY.bold, fontSize: 16 },
      streakTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 16, color: colors.textPrimary },
      streakSubtitle: { fontFamily: FONT_FAMILY.body, fontSize: 13, color: colors.textMuted },

      heatmapCard: { backgroundColor: isDark ? '#1C1C1E' : colors.surface, borderRadius: RADIUS.lg, padding: SPACE.lg, borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.05)' : colors.border, ...SHADOW.md },
      heatmapTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 16, color: colors.textPrimary, marginBottom: SPACE.xl },
      
      gridContainer: { flexDirection: 'row' },
      dayLabels: { justifyContent: 'space-between', marginRight: SPACE.sm, paddingVertical: 2 },
      dayLabelText: { fontFamily: FONT_FAMILY.body, fontSize: 10, color: colors.textMuted, height: 16, lineHeight: 16, textAlign: 'center' },
      
      grid: { flexDirection: 'row', gap: 4 },
      column: { gap: 4 },
      square: { width: 16, height: 16, borderRadius: 4 },
      
      legendRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: SPACE.xl, gap: 4 },
      legendText: { fontFamily: FONT_FAMILY.body, fontSize: 10, color: colors.textMuted, marginHorizontal: 4 },
      legendSquare: { width: 12, height: 12, borderRadius: 3 },
    });
