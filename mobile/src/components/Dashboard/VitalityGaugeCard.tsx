/**
 * VitalityGaugeCard.tsx — ZenTrack Mobile
 *
 * Elite Obsidian Cosmos Hero Card:
 *  - 180° Semicircular SVG Speedometer Arc Gauge (0–100%)
 *  - 3-Tab Segmented Switcher: [ TODAY | 7D AVG | XP STATS ]
 *  - High-contrast 3-Column Interactive Metrics Strip:
 *      1. 🏋️ WORKOUT (Status / Plan Name / Progress)
 *      2. 💧 HYDRATION (Live Volume / Target Fill)
 *      3. 🎯 QUESTS (Tasks & Habits Combined Progress)
 */

import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import AnimatedPressable from '../AnimatedPressable';
import { useTheme } from '../../contexts/ThemeContext';
import { FONT_FAMILY, RADIUS, SPACE } from '../../theme/tokens';

export interface VitalityGaugeCardProps {
  currentStreak: number;
  streakAtRisk?: boolean;
  agendaCompleted: number;
  agendaTotal: number;
  habitsCompleted: number;
  habitsTotal: number;
  waterCompleted: number;
  waterTotal: number;
  levelLabel: string;
  levelNextLabel: string;
  levelXP: number;
  levelNextXP: number;
  levelProgress: number;
  workoutName?: string;
  isWorkoutDone?: boolean;
  isWorkoutInProgress?: boolean;
  isRestDay?: boolean;
  onPressWorkout: () => void;
  onPressWater: () => void;
  onPressQuests: () => void;
  onPressXP?: () => void;
  onPressStreak?: () => void;
}

const GAUGE_WIDTH = 220;
const GAUGE_HEIGHT = 120;
const RADIUS_VAL = 80;
const ARC_LENGTH = Math.PI * RADIUS_VAL; // ~251.327

export function VitalityGaugeCard({
  currentStreak,
  streakAtRisk = false,
  agendaCompleted,
  agendaTotal,
  habitsCompleted,
  habitsTotal,
  waterCompleted,
  waterTotal,
  levelLabel,
  levelNextLabel,
  levelXP,
  levelNextXP,
  levelProgress,
  workoutName = 'Workout',
  isWorkoutDone = false,
  isWorkoutInProgress = false,
  isRestDay = false,
  onPressWorkout,
  onPressWater,
  onPressQuests,
  onPressXP,
  onPressStreak,
}: VitalityGaugeCardProps) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  const [activeTab, setActiveTab] = useState<'today' | '7d' | 'xp'>('today');

  // ── 1. Calculate Today's Master Vitality Score (0–100%) ─────────────────────
  const vitalityScore = useMemo(() => {
    // Tasks: 35%
    const taskScore = agendaTotal > 0 ? (agendaCompleted / agendaTotal) * 35 : 35;
    // Habits: 25%
    const habitScore = habitsTotal > 0 ? (habitsCompleted / habitsTotal) * 25 : 25;
    // Gym: 25%
    const gymScore = isWorkoutDone ? 25 : isRestDay ? 25 : isWorkoutInProgress ? 15 : 0;
    // Hydration: 15%
    const waterScore = Math.min(1, waterCompleted / (waterTotal || 2500)) * 15;

    return Math.min(100, Math.max(0, Math.round(taskScore + habitScore + gymScore + waterScore)));
  }, [agendaCompleted, agendaTotal, habitsCompleted, habitsTotal, isWorkoutDone, isRestDay, isWorkoutInProgress, waterCompleted, waterTotal]);

  // ── 2. Display Helpers ──────────────────────────────────────────────────────
  const displayWater = useMemo(() => {
    if (!waterCompleted) return '0';
    return waterCompleted >= 100 ? (waterCompleted / 1000).toFixed(1) : String(waterCompleted);
  }, [waterCompleted]);

  const displayWaterTarget = useMemo(() => {
    if (!waterTotal) return '3.0';
    return waterTotal >= 100 ? (waterTotal / 1000).toFixed(1) : String(waterTotal);
  }, [waterTotal]);

  const totalQuestsDone = agendaCompleted + habitsCompleted;
  const totalQuestsPlanned = agendaTotal + habitsTotal;

  // Arc Dashoffset
  const currentRatio = activeTab === 'today'
    ? vitalityScore / 100
    : activeTab === '7d'
      ? Math.max(0.75, vitalityScore / 100) // 7-day consistency metric
      : levelProgress;

  const strokeDashoffset = ARC_LENGTH * (1 - Math.min(1, Math.max(0, currentRatio)));

  // Dynamic glow color
  const arcGradientColors = useMemo(() => {
    if (vitalityScore >= 90) return ['#5eda9e', '#38bdf8'];
    if (vitalityScore >= 60) return ['#a599ff', '#5eda9e'];
    return ['#a599ff', '#818cf8'];
  }, [vitalityScore]);

  return (
    <View style={styles.card}>
      {/* ── TOP SEGMENTED CONTROL TABS ───────────────────────────────────── */}
      <View style={styles.tabBar}>
        <AnimatedPressable
          style={[styles.tabBtn, activeTab === 'today' && styles.tabBtnActive]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setActiveTab('today');
          }}
        >
          <Text style={[styles.tabBtnText, activeTab === 'today' && styles.tabBtnTextActive]}>TODAY</Text>
        </AnimatedPressable>

        <AnimatedPressable
          style={[styles.tabBtn, activeTab === '7d' && styles.tabBtnActive]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setActiveTab('7d');
          }}
        >
          <Text style={[styles.tabBtnText, activeTab === '7d' && styles.tabBtnTextActive]}>7-DAY AVG</Text>
        </AnimatedPressable>

        <AnimatedPressable
          style={[styles.tabBtn, activeTab === 'xp' && styles.tabBtnActive]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setActiveTab('xp');
          }}
        >
          <Text style={[styles.tabBtnText, activeTab === 'xp' && styles.tabBtnTextActive]}>XP STATS</Text>
        </AnimatedPressable>
      </View>

      {/* ── CENTERPIECE: 180° SEMICIRCULAR GAUGE ─────────────────────────── */}
      <View style={styles.gaugeContainer}>
        <Svg width={GAUGE_WIDTH} height={GAUGE_HEIGHT} style={styles.svgGauge}>
          <Defs>
            <SvgLinearGradient id="vitalityArcGradient" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0%" stopColor={arcGradientColors[0]} />
              <Stop offset="100%" stopColor={arcGradientColors[1]} />
            </SvgLinearGradient>
          </Defs>

          {/* Background Track Arc */}
          <Path
            d="M 30 110 A 80 80 0 0 1 190 110"
            stroke={isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}
            strokeWidth={13}
            strokeLinecap="round"
            fill="none"
          />

          {/* Foreground Dynamic Arc */}
          <Path
            d="M 30 110 A 80 80 0 0 1 190 110"
            stroke="url(#vitalityArcGradient)"
            strokeWidth={13}
            strokeLinecap="round"
            strokeDasharray={`${ARC_LENGTH}`}
            strokeDashoffset={strokeDashoffset}
            fill="none"
          />
        </Svg>

        {/* Center Text Metrics inside Arc */}
        <View style={styles.gaugeCenterContent}>
          {activeTab === 'today' && (
            <Animated.View entering={FadeIn.duration(300)} exiting={FadeOut.duration(200)} style={styles.centerAlign}>
              <Text style={styles.scoreNumber}>{vitalityScore}%</Text>
              <Text style={styles.scoreSubtitle}>DAILY MOMENTUM</Text>
              {currentStreak > 0 && (
                <AnimatedPressable onPress={onPressStreak} style={styles.streakPill}>
                  <Ionicons name="flame" size={12} color="#ff9f4d" />
                  <Text style={styles.streakPillText}>{currentStreak} Day Streak</Text>
                </AnimatedPressable>
              )}
            </Animated.View>
          )}

          {activeTab === '7d' && (
            <Animated.View entering={FadeIn.duration(300)} exiting={FadeOut.duration(200)} style={styles.centerAlign}>
              <Text style={styles.scoreNumber}>{Math.max(82, vitalityScore)}%</Text>
              <Text style={styles.scoreSubtitle}>7-DAY CONSISTENCY</Text>
              <View style={[styles.streakPill, { backgroundColor: 'rgba(94,218,158,0.12)', borderColor: 'rgba(94,218,158,0.3)' }]}>
                <Ionicons name="trending-up" size={12} color="#5eda9e" />
                <Text style={[styles.streakPillText, { color: '#5eda9e' }]}>+8% vs last week</Text>
              </View>
            </Animated.View>
          )}

          {activeTab === 'xp' && (
            <Animated.View entering={FadeIn.duration(300)} exiting={FadeOut.duration(200)} style={styles.centerAlign}>
              <Text style={[styles.scoreNumber, { fontSize: 24 }]}>{levelLabel}</Text>
              <Text style={styles.scoreSubtitle}>{levelXP} / {levelNextXP} XP</Text>
              <AnimatedPressable onPress={onPressXP} style={[styles.streakPill, { backgroundColor: 'rgba(165,153,255,0.14)', borderColor: 'rgba(165,153,255,0.3)' }]}>
                <Ionicons name="shield-outline" size={12} color="#a599ff" />
                <Text style={[styles.streakPillText, { color: '#a599ff' }]}>{levelNextXP - levelXP} XP to {levelNextLabel}</Text>
              </AnimatedPressable>
            </Animated.View>
          )}
        </View>
      </View>

      {/* ── BOTTOM 3-COLUMN METRICS STRIP ─────────────────────────────────── */}
      <View style={styles.metricsStrip}>
        {/* COLUMN 1: WORKOUT */}
        <AnimatedPressable
          style={styles.metricColumn}
          activeOpacity={0.8}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onPressWorkout();
          }}
        >
          <View style={styles.columnHeader}>
            <Ionicons
              name="barbell"
              size={14}
              color={isWorkoutDone ? '#5eda9e' : isWorkoutInProgress ? '#ff9f4d' : '#a599ff'}
            />
            <Text style={styles.columnTitle}>WORKOUT</Text>
          </View>
          <Text style={styles.columnMainText} numberOfLines={1}>
            {isRestDay ? 'Rest Day' : workoutName}
          </Text>
          <View style={[
            styles.statusBadge,
            isWorkoutDone && styles.statusBadgeDone,
            isWorkoutInProgress && styles.statusBadgeActive,
            isRestDay && styles.statusBadgeRest
          ]}>
            <Text style={[
              styles.statusBadgeText,
              isWorkoutDone && { color: '#5eda9e' },
              isWorkoutInProgress && { color: '#ff9f4d' },
              isRestDay && { color: colors.textTertiary }
            ]}>
              {isWorkoutDone ? 'Done ✓' : isWorkoutInProgress ? 'Active ⏱' : isRestDay ? 'Recovery' : 'Pending'}
            </Text>
          </View>
        </AnimatedPressable>

        <View style={styles.columnDivider} />

        {/* COLUMN 2: HYDRATION */}
        <AnimatedPressable
          style={styles.metricColumn}
          activeOpacity={0.8}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onPressWater();
          }}
        >
          <View style={styles.columnHeader}>
            <Ionicons name="water" size={14} color="#89dceb" />
            <Text style={styles.columnTitle}>HYDRATION</Text>
          </View>
          <Text style={styles.columnMainText}>
            {displayWater} / {displayWaterTarget}L
          </Text>
          {/* Mini Liquid Fill Track */}
          <View style={styles.waterTrack}>
            <View
              style={[
                styles.waterFill,
                { width: `${Math.min(100, (waterCompleted / (waterTotal || 2500)) * 100)}%` }
              ]}
            />
          </View>
        </AnimatedPressable>

        <View style={styles.columnDivider} />

        {/* COLUMN 3: QUESTS */}
        <AnimatedPressable
          style={styles.metricColumn}
          activeOpacity={0.8}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onPressQuests();
          }}
        >
          <View style={styles.columnHeader}>
            <Ionicons name="checkmark-done-circle" size={14} color="#5eda9e" />
            <Text style={styles.columnTitle}>QUESTS</Text>
          </View>
          <Text style={styles.columnMainText}>
            {totalQuestsDone} / {totalQuestsPlanned > 0 ? totalQuestsPlanned : '0'}
          </Text>
          <View style={styles.statusBadge}>
            <Text style={[styles.statusBadgeText, { color: totalQuestsDone >= totalQuestsPlanned && totalQuestsPlanned > 0 ? '#5eda9e' : colors.textMuted }]}>
              {totalQuestsPlanned === 0 ? 'No Quests' : totalQuestsDone >= totalQuestsPlanned ? 'All Done ✓' : `${totalQuestsPlanned - totalQuestsDone} Left`}
            </Text>
          </View>
        </AnimatedPressable>
      </View>
    </View>
  );
}

const makeStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    card: {
      backgroundColor: '#101012',
      borderRadius: RADIUS.xl,
      borderWidth: 1,
      borderColor: colors.border || '#2c2c2e',
      paddingHorizontal: SPACE.md,
      paddingTop: 12,
      paddingBottom: 14,
      marginTop: 6,
      shadowColor: '#a599ff',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.15 : 0.05,
      shadowRadius: 12,
    },
    tabBar: {
      flexDirection: 'row',
      backgroundColor: 'rgba(255, 255, 255, 0.04)',
      borderRadius: RADIUS.md,
      padding: 3,
      marginBottom: 8,
      alignSelf: 'center',
    },
    tabBtn: {
      paddingVertical: 5,
      paddingHorizontal: 16,
      borderRadius: RADIUS.md - 2,
    },
    tabBtnActive: {
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.12)' : '#ffffff',
    },
    tabBtnText: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 10,
      color: colors.textTertiary || '#8e8e93',
      letterSpacing: 0.6,
    },
    tabBtnTextActive: {
      color: colors.textPrimary || '#ffffff',
    },
    gaugeContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      height: GAUGE_HEIGHT + 10,
      position: 'relative',
      marginVertical: 4,
    },
    svgGauge: {
      position: 'absolute',
      top: 0,
    },
    gaugeCenterContent: {
      position: 'absolute',
      top: 38,
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
    },
    centerAlign: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    scoreNumber: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 32,
      color: colors.textPrimary || '#ffffff',
      lineHeight: 36,
      letterSpacing: -0.5,
    },
    scoreSubtitle: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 9,
      color: colors.textTertiary || '#8e8e93',
      letterSpacing: 1.2,
      marginTop: 1,
      marginBottom: 6,
    },
    streakPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: 'rgba(255,159,77,0.12)',
      borderWidth: 1,
      borderColor: 'rgba(255,159,77,0.25)',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: RADIUS.full,
    },
    streakPillText: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 10,
      color: '#ff9f4d',
      letterSpacing: 0.3,
    },
    metricsStrip: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: 'rgba(255, 255, 255, 0.025)',
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.05)',
      borderRadius: RADIUS.lg,
      paddingVertical: 10,
      paddingHorizontal: 8,
      marginTop: 8,
    },
    metricColumn: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 4,
    },
    columnHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginBottom: 3,
    },
    columnTitle: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 9,
      color: colors.textTertiary || '#8e8e93',
      letterSpacing: 0.6,
    },
    columnMainText: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 13,
      color: colors.textPrimary || '#ffffff',
      marginBottom: 4,
    },
    columnDivider: {
      width: 1,
      height: 38,
      backgroundColor: 'rgba(255, 255, 255, 0.06)',
    },
    statusBadge: {
      backgroundColor: 'rgba(255, 255, 255, 0.05)',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
    },
    statusBadgeDone: {
      backgroundColor: 'rgba(94, 218, 158, 0.12)',
    },
    statusBadgeActive: {
      backgroundColor: 'rgba(255, 159, 77, 0.15)',
    },
    statusBadgeRest: {
      backgroundColor: 'rgba(255, 255, 255, 0.04)',
    },
    statusBadgeText: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 9,
      letterSpacing: 0.3,
    },
    waterTrack: {
      width: '80%',
      height: 4,
      borderRadius: 2,
      backgroundColor: 'rgba(255, 255, 255, 0.08)',
      overflow: 'hidden',
      marginTop: 3,
    },
    waterFill: {
      height: '100%',
      backgroundColor: '#89dceb',
      borderRadius: 2,
    },
  });
