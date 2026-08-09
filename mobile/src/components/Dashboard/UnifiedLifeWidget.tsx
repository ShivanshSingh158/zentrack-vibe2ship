/**
 * UnifiedLifeWidget.tsx — ZenTrack Mobile
 * Reimagined premium life widget: streak/level pills, central quest donut ring,
 * flanking habit & water metrics, sleep row, and XP progress bar at the bottom.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle as SvgCircle } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';

import { Ionicons } from '@expo/vector-icons';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import AnimatedPressable from '../AnimatedPressable';
import { useTheme } from '../../contexts/ThemeContext';
import { FONT_FAMILY, FONT_SIZE, RADIUS, SPACE } from '../../theme/tokens';

interface UrgentItem { id: string; title: string; dueDate: string; }

export interface NextClassData {
  id: string;
  title: string;
  time: string;
  type: string;
  subjectId: string;
  attended?: number;
  total?: number;
}

interface UnifiedLifeWidgetProps {
  currentStreak: number;
  streakAtRisk?: boolean;
  agendaCompleted: number;
  agendaTotal: number;
  habitsCompleted: number;
  habitsTotal: number;
  waterCompleted: number;
  waterTotal: number;
  lastNightSleep: number | null;
  levelLabel: string;
  levelNextLabel: string;
  levelXP: number;
  levelNextXP: number;
  levelProgress: number;
  showXPSection?: boolean;
  urgentAssignments?: UrgentItem[];
  todayStr?: string;
  in3daysStr?: string;
  nextClass?: NextClassData | null;
  onPressStreak: () => void;
  onPressHabits: () => void;
  onPressWater: () => void;
  onPressSleep: () => void;
  onPressXP?: () => void;
  onCapture?: () => void;
  onPressAssignments?: () => void;
}

const RING_SIZE = 110;
const RING_STROKE = 9;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const getGradientForLevel = (level: string) => {
  switch (level) {
    case 'Seeker':    return ['#94a3b8', '#cbd5e1']; // Slate/Silver
    case 'Guardian':  return ['#5eda9e', '#3b82f6']; // Emerald to Blue
    case 'Sentinel':  return ['#3b82f6', '#8b5cf6']; // Blue to Purple
    case 'Warden':    return ['#8b5cf6', '#d946ef']; // Purple to Fuchsia
    case 'Vanguard':  return ['#d946ef', '#f43f5e']; // Fuchsia to Rose
    case 'Architect': return ['#f43f5e', '#f97316']; // Rose to Orange
    case 'Luminary':  return ['#f97316', '#eab308']; // Orange to Gold
    case 'Ascendant': return ['#eab308', '#a855f7']; // Gold to Mythic Purple
    default:          return ['#5eda9e', '#a599ff'];
  }
};

export function UnifiedLifeWidget({
  currentStreak,
  streakAtRisk = false,
  agendaCompleted,
  agendaTotal,
  habitsCompleted,
  habitsTotal,
  waterCompleted,
  waterTotal,
  lastNightSleep,
  levelLabel,
  levelNextLabel,
  levelXP,
  levelNextXP,
  levelProgress,
  showXPSection = true,
  urgentAssignments = [],
  todayStr = '',
  in3daysStr = '',
  nextClass,
  onPressStreak,
  onPressHabits,
  onPressWater,
  onPressSleep,
  onPressXP,
  onCapture,
  onPressAssignments,
}: UnifiedLifeWidgetProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const ringPercent = nextClass
    ? (nextClass.total ? Math.min(nextClass.attended! / nextClass.total, 1) : 1)
    : (agendaTotal > 0 ? agendaCompleted / agendaTotal : 0);
    
  const strokeDashoffset = RING_CIRCUMFERENCE * (1 - ringPercent);
  const allDone = nextClass ? ringPercent === 1 : (agendaTotal > 0 && agendaCompleted >= agendaTotal);

  const bgStroke = nextClass ? '#ff4d4f' : 'rgba(255,255,255,0.06)';
  const fgStroke = nextClass ? '#5eda9e' : (allDone ? '#5eda9e' : '#a599ff');

  const displayWater = useMemo(() => {
    if (!waterCompleted) return '0';
    return waterCompleted >= 100 ? (waterCompleted / 1000).toFixed(1) : String(waterCompleted);
  }, [waterCompleted]);

  const displayWaterTarget = useMemo(() => {
    if (!waterTotal) return '3.0';
    return waterTotal >= 100 ? (waterTotal / 1000).toFixed(1) : String(waterTotal);
  }, [waterTotal]);

  return (
    <View style={styles.card}>



      {/* MAIN BODY: Donut (Left) | Compact Metrics (Right) */}
      <View style={styles.mainRow}>
        {/* DONUT RING */}
        <View style={styles.ringWrapper}>
          <Svg width={RING_SIZE} height={RING_SIZE} style={styles.svgAbsolute}>
            <SvgCircle
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              r={RING_RADIUS}
              stroke={bgStroke}
              strokeWidth={RING_STROKE}
              fill="none"
            />
            {(agendaTotal > 0 || nextClass) && (
              <SvgCircle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RING_RADIUS}
                stroke={fgStroke}
                strokeWidth={RING_STROKE}
                fill="none"
                strokeDasharray={`${RING_CIRCUMFERENCE}`}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
                rotation="-90"
                originX={RING_SIZE / 2}
                originY={RING_SIZE / 2}
              />
            )}
          </Svg>
          <View style={styles.ringCenter}>
            {nextClass ? (
              <Animated.View key="next-class" entering={FadeIn.duration(400)} exiting={FadeOut.duration(300)} style={styles.ringCenterInner}>
                <Text style={styles.ringTimeText}>{nextClass.time}</Text>
                <Text style={styles.ringClassTitle} numberOfLines={1}>
                  {nextClass.title}
                </Text>
              </Animated.View>
            ) : (
              <Animated.View key="quests" entering={FadeIn.duration(400)} exiting={FadeOut.duration(300)} style={styles.ringCenterInner}>
                <Text style={[styles.ringCount, allDone && { color: '#5eda9e' }]}>
                  {agendaCompleted}/{agendaTotal}
                </Text>
                <Text style={styles.ringLabel}>
                  {agendaTotal === 0 ? 'REST DAY' : 'QUESTS TODAY'}
                </Text>
              </Animated.View>
            )}
          </View>
        </View>

        {/* VERTICAL DIVIDER */}
        <View style={styles.verticalDivider} />

        <View style={styles.rightMetricsColumn}>
          {/* HABITS */}
          <AnimatedPressable
            style={styles.compactMetricRow}
            activeOpacity={0.75}
            delayPressIn={80}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPressHabits(); }}
          >
            <View style={styles.compactLeftGroup}>
              <View style={[styles.compactBadge, { backgroundColor: 'rgba(94,218,158,0.12)' }]}>
                <Text style={styles.compactEmoji}>🌱</Text>
              </View>
              <Text style={styles.compactLabel}>Habits</Text>
            </View>
            <View style={[styles.valuePill, { backgroundColor: 'rgba(94,218,158,0.12)' }]}>
              <Text style={[styles.valuePillText, { color: '#5eda9e' }]}>{habitsCompleted} / {habitsTotal}</Text>
            </View>
          </AnimatedPressable>

          {/* WATER */}
          <AnimatedPressable
            style={styles.compactMetricRow}
            activeOpacity={0.75}
            delayPressIn={80}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPressWater(); }}
          >
            <View style={styles.compactLeftGroup}>
              <View style={[styles.compactBadge, { backgroundColor: 'rgba(137,220,235,0.12)' }]}>
                <Text style={styles.compactEmoji}>💧</Text>
              </View>
              <Text style={styles.compactLabel}>Water</Text>
            </View>
            <View style={[styles.valuePill, { backgroundColor: 'rgba(137,220,235,0.12)' }]}>
              <Text style={[styles.valuePillText, { color: '#89dceb' }]}>{displayWater} / {displayWaterTarget}L</Text>
            </View>
          </AnimatedPressable>

          {/* SLEEP */}
          <AnimatedPressable
            style={styles.compactMetricRow}
            activeOpacity={0.75}
            delayPressIn={80}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPressSleep(); }}
          >
            <View style={styles.compactLeftGroup}>
              <View style={[styles.compactBadge, { backgroundColor: 'rgba(165,153,255,0.12)' }]}>
                <Text style={styles.compactEmoji}>🌙</Text>
              </View>
              <Text style={styles.compactLabel}>Sleep</Text>
            </View>
            <View style={[styles.valuePill, { backgroundColor: 'rgba(165,153,255,0.12)' }]}>
              <Text style={[styles.valuePillText, { color: '#a599ff' }]}>
                {lastNightSleep !== null ? `${lastNightSleep} Hour` : '--'}
              </Text>
            </View>
          </AnimatedPressable>
        </View>
      </View>

      {showXPSection && (
        <>
          {/* XP BAR */}
          <View style={styles.xpSection}>
            <View style={styles.xpLabelRow}>
              <Text style={styles.xpLevelText}>{levelLabel} • {levelXP} / {levelNextXP} xp</Text>
              <Text style={styles.xpToNext}>{levelNextXP - levelXP} to {levelNextLabel}</Text>
            </View>
            <View style={styles.xpTrack}>
              <LinearGradient
                colors={getGradientForLevel(levelLabel)}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.xpFill, { width: `${Math.max(levelProgress * 100, 2)}%` as any }]}
              />
            </View>
          </View>

          {/* QUICK CAPTURE */}
          {onCapture && (
            <AnimatedPressable style={styles.captureBar} activeOpacity={0.75} delayPressIn={100} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onCapture(); }}>
              <Ionicons name="add-circle-outline" size={20} color={colors.accentPrimary} />
              <Text style={styles.capturePlaceholder} numberOfLines={1}>Add anything... habit, task, notes</Text>
            </AnimatedPressable>
          )}

          {/* URGENT BANNER */}
          {urgentAssignments.length > 0 && (
            <AnimatedPressable style={styles.urgentBanner} activeOpacity={0.8} delayPressIn={100} onPress={onPressAssignments}>
              <Ionicons name="warning-outline" size={14} color={colors.accentAmber} style={{ marginRight: 8 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.urgentTitle}>Due soon</Text>
                {urgentAssignments.map(a => (
                  <Text key={a.id} style={styles.urgentItem} numberOfLines={1}>
                    · {a.title} — {a.dueDate === todayStr ? 'Today' : a.dueDate === in3daysStr ? 'in 3 days' : a.dueDate}
                  </Text>
                ))}
              </View>
              <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} />
            </AnimatedPressable>
          )}
        </>
      )}

    </View>
  );
}

const makeStyles = (colors: any) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.surface || '#1c1c1d',
      borderRadius: RADIUS.xl,
      borderWidth: 1,
      borderColor: colors.border || '#2c2c2e',
      paddingHorizontal: SPACE.md,
      paddingTop: 14,
      paddingBottom: 12,
      marginTop: SPACE.xl,
      gap: 8,
    },
    pillsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 8,
    },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 20,
      borderWidth: 1,
    },
    streakPill: {
      backgroundColor: 'rgba(255,159,77,0.10)',
      borderColor: 'rgba(255,159,77,0.22)',
    },
    levelPill: {
      backgroundColor: 'rgba(165,153,255,0.10)',
      borderColor: 'rgba(165,153,255,0.22)',
    },
    pillIcon: { fontSize: 12 },
    pillText: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 11,
      letterSpacing: 0.2,
    },
    streakPillText: { color: '#ff9f4d' },
    levelPillText: { color: '#a599ff' },
    mainRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-start',
      gap: 16,
      marginVertical: SPACE.xs,
    },
    verticalDivider: {
      width: 1,
      height: 90,
      backgroundColor: 'rgba(255,255,255,0.06)',
    },
    rightMetricsColumn: {
      flex: 1,
      height: 90,
      justifyContent: 'space-between',
    },
    compactMetricRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      width: '100%',
    },
    compactLeftGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    compactBadge: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    compactEmoji: { fontSize: 13 },
    compactLabel: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 13,
      color: colors.textPrimary || '#ffffff',
    },
    valuePill: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 12,
    },
    valuePillText: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 12,
      letterSpacing: 0.5,
    },
    ringWrapper: {
      width: RING_SIZE,
      height: RING_SIZE,
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
    },
    svgAbsolute: {
      position: 'absolute',
      top: 0,
      left: 0,
    },
    ringCenter: {
      position: 'absolute',
      width: RING_SIZE,
      height: RING_SIZE,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ringCenterInner: {
      position: 'absolute',
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
      height: '100%',
    },
    ringCount: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 26,
      color: colors.textPrimary,
      lineHeight: 30,
    },
    ringLabel: {
      fontFamily: FONT_FAMILY.medium,
      fontSize: 9,
      color: colors.textTertiary,
      letterSpacing: 1,
      marginTop: 2,
    },
    ringTimeText: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 16,
      color: colors.textPrimary,
      marginBottom: 2,
    },
    ringClassTitle: {
      fontFamily: FONT_FAMILY.medium,
      fontSize: 9,
      color: colors.textTertiary,
      textTransform: 'uppercase',
      letterSpacing: 1,
      textAlign: 'center',
      paddingHorizontal: 12,
    },

    xpSection: {
      gap: 5,
      marginTop: 2,
    },
    xpLabelRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    xpLevelText: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 9,
      color: colors.textTertiary || '#8e8e93',
      letterSpacing: 0.3,
    },
    xpToNext: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 9,
      color: colors.textTertiary || '#8e8e93',
      letterSpacing: 0.3,
    },
    xpTrack: {
      height: 4,
      borderRadius: 2,
      backgroundColor: 'rgba(255,255,255,0.07)',
      overflow: 'hidden',
    },
    xpFill: {
      height: '100%',
      borderRadius: 2,
    },
    captureBar: {
      marginTop: SPACE.md,
      marginBottom: SPACE.xs,
      backgroundColor: colors.surface,
      borderRadius: RADIUS.xl,
      borderWidth: 1,
      borderColor: colors.border,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: SPACE.lg,
      paddingVertical: SPACE.md,
      gap: SPACE.sm,
    },
    capturePlaceholder: {
      flex: 1,
      fontFamily: FONT_FAMILY.body,
      fontSize: FONT_SIZE.md,
      color: colors.textTertiary,
    },
    urgentBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: SPACE.md,
      backgroundColor: 'rgba(255,159,77,0.08)',
      borderWidth: 1,
      borderColor: 'rgba(255,159,77,0.25)',
      borderRadius: RADIUS.lg,
      padding: SPACE.lg,
    },
    urgentTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 11, color: colors.accentAmber, letterSpacing: 0.5, marginBottom: 4 },
    urgentItem:  { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: colors.textMuted || '#8e8e93', lineHeight: 18 },
  });
