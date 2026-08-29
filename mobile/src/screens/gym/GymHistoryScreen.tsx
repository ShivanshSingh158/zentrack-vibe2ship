import React, { useMemo, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withSequence, withDelay } from 'react-native-reanimated';
import { StatusBar } from 'expo-status-bar';

import { GymNavigationParamList } from '../../types/gym.types';
import { springs } from '../../theme/motion';
import { useWellnessData } from '../../contexts/domains/WellnessContext';
import { calculateGymStreak } from '../../utils/gymUtils';
import { useTheme } from '../../contexts/ThemeContext';

// Extracted Sub-Components & Styles
import { makeGymHistoryStyles } from './gymHistoryStyles';
import GymHeatmapCard, { HeatmapDay } from '../../components/Gym/GymHeatmapCard';

const WEEKS = 13;
const DAYS_PER_WEEK = 7;

export default function GymHistoryScreen() {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeGymHistoryStyles(colors, isDark), [colors, isDark]);
  const navigation = useNavigation<NativeStackNavigationProp<GymNavigationParamList>>();
  const { gymLogs } = useWellnessData();

  // Streak
  const streak = useMemo(() => calculateGymStreak(gymLogs), [gymLogs]);

  // Entrance animation for streak card
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
  const heatmapData = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const logMap = new Map<string, any>();
    gymLogs.forEach(log => {
      const d = new Date(log.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

      let totalSets = 0;
      log.exercises?.forEach(ex => {
        totalSets += ex.setsLog?.filter((s: any) => s.completed).length || 0;
      });

      logMap.set(key, { totalSets, log });
    });

    const grid: HeatmapDay[][] = [];
    const startDay = new Date(today);
    startDay.setDate(today.getDate() - today.getDay() - (WEEKS - 1) * 7);

    for (let w = 0; w < WEEKS; w++) {
      const weekCol: HeatmapDay[] = [];
      for (let d = 0; d < DAYS_PER_WEEK; d++) {
        const currentDate = new Date(startDay);
        currentDate.setDate(startDay.getDate() + (w * 7) + d);

        const key = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
        const data = logMap.get(key);

        weekCol.push({
          date: currentDate,
          dateStr: key,
          isFuture: currentDate > today,
          intensity: data ? Math.max(0.3, Math.min(1.0, data.totalSets / 20)) : 0,
          log: data?.log || null,
        });
      }
      grid.push(weekCol);
    }
    return grid;
  }, [gymLogs]);

  const handleSelectDay = useCallback((dateStr: string) => {
    navigation.navigate('WorkoutSummary', { date: dateStr, readOnly: true });
  }, [navigation]);

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
        {/* Streak Counter */}
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

        {/* Heatmap Card */}
        <GymHeatmapCard
          heatmapData={heatmapData}
          onSelectDay={handleSelectDay}
          styles={styles}
          isDark={isDark}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
