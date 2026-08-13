/**
 * UnifiedLifeWidget.tsx — ZenTrack Mobile
 * Reimagined premium life widget: streak/level pills, central quest donut ring,
 * flanking habit & water metrics, sleep row, and XP progress bar at the bottom.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle as SvgCircle, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
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
  showCapture?: boolean;
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

const MASCOT_IMAGES: Record<string, any> = {
  'Seeker': require('../../../assets/mascots/level0.png'),
  'Warden': require('../../../assets/mascots/level1.png'),
  'Guardian': require('../../../assets/mascots/level2.png'),
  'Sentinel': require('../../../assets/mascots/level3.png'),
  'Vanguard': require('../../../assets/mascots/level4.png'),
  'Luminary': require('../../../assets/mascots/level5.png'),
  'Legend': require('../../../assets/mascots/level6.png'),
  'Mythic': require('../../../assets/mascots/level7.png'),
};

const getGradientForLevel = (level: string) => {
  switch (level) {
    case 'Seeker':    return ['#34d399', '#22d3ee'];
    case 'Warden':    return ['#22d3ee', '#3b82f6'];
    case 'Guardian':  return ['#3b82f6', '#6366f1'];
    case 'Sentinel':  return ['#14b8a6', '#0ea5e9'];
    case 'Vanguard':  return ['#a855f7', '#ec4899'];
    case 'Luminary':  return ['#f59e0b', '#fbbf24'];
    case 'Legend':    return ['#f97316', '#ef4444'];
    case 'Mythic':    return ['#ec4899', '#8b5cf6'];
    default:          return ['#34d399', '#22d3ee'];
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
  showCapture = true,
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
    ? (nextClass.isOngoing
        ? Math.min(Math.max((nextClass.nowMins! - nextClass.startTimeMins!) / (nextClass.endTimeMins! - nextClass.startTimeMins!), 0), 1)
        : (nextClass.total ? Math.min(nextClass.attended! / nextClass.total, 1) : 1))
    : (agendaTotal > 0 ? agendaCompleted / agendaTotal : 0);
    
  const strokeDashoffset = RING_CIRCUMFERENCE * (1 - ringPercent);
  const allDone = nextClass ? ringPercent === 1 : (agendaTotal > 0 && agendaCompleted >= agendaTotal);

  const bgStroke = (nextClass && !nextClass.isOngoing) ? '#ff4d4f' : 'rgba(255,255,255,0.06)';
  const fgStroke = nextClass 
    ? (nextClass.isOngoing ? 'url(#xpGradient)' : '#5eda9e') 
    : (allDone ? '#5eda9e' : 'url(#xpGradient)');

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
            <Defs>
              <SvgLinearGradient id="xpGradient" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor={getGradientForLevel(levelLabel)[0]} />
                <Stop offset="1" stopColor={getGradientForLevel(levelLabel)[1]} />
              </SvgLinearGradient>
            </Defs>
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
              <Animated.View entering={FadeIn.duration(400)} exiting={FadeOut.duration(300)} style={styles.ringCenterInner}>
                <Text style={styles.ringTimeText}>{nextClass.time}</Text>
                <Text style={styles.ringClassTitle} numberOfLines={1}>
                  {nextClass.title}
                </Text>
                {nextClass.isOngoing && (
                  <Text style={[styles.ringClassTitle, { color: '#5eda9e', marginTop: 2, fontSize: 10, letterSpacing: 1.5 }]}>
                    ONGOING
                  </Text>
                )}
              </Animated.View>
            ) : (
              <Animated.View entering={FadeIn.duration(400)} exiting={FadeOut.duration(300)} style={styles.ringCenterInner}>
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
            style={[styles.compactMetricRow, { backgroundColor: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.05)', borderWidth: 1 }]}
            activeOpacity={0.75}
            delayPressIn={80}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPressHabits(); }}
          >
            <View style={styles.compactLeftGroup}>
              <Text style={styles.compactEmoji}>🌱</Text>
              <Text style={[styles.compactLabel, { color: '#5eda9e' }]}>Momentum</Text>
            </View>
            <Text style={[styles.valuePillText, { color: '#5eda9e' }]}>{habitsCompleted}/{habitsTotal}</Text>
          </AnimatedPressable>

          {/* WATER */}
          <AnimatedPressable
            style={[styles.compactMetricRow, { backgroundColor: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.05)', borderWidth: 1, overflow: 'hidden' }]}
            activeOpacity={0.75}
            delayPressIn={80}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPressWater(); }}
          >
            <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${Math.min(100, (waterCompleted / (waterTotal || 1)) * 100)}%`, backgroundColor: 'rgba(137, 220, 235, 0.15)' }} />
            <View style={styles.compactLeftGroup}>
              <Text style={styles.compactEmoji}>💧</Text>
              <Text style={[styles.compactLabel, { color: '#89dceb' }]}>Hydration</Text>
            </View>
            <Text style={[styles.valuePillText, { color: '#89dceb' }]}>{displayWater}/{displayWaterTarget}L</Text>
          </AnimatedPressable>

          {/* SLEEP */}
          <AnimatedPressable
            style={[styles.compactMetricRow, { backgroundColor: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.05)', borderWidth: 1 }]}
            activeOpacity={0.75}
            delayPressIn={80}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPressSleep(); }}
          >
            <View style={styles.compactLeftGroup}>
              <Text style={styles.compactEmoji}>🌙</Text>
              <Text style={[styles.compactLabel, { color: '#a599ff' }]}>Sleep</Text>
            </View>
            <Text style={[styles.valuePillText, { color: '#a599ff' }]}>
              {lastNightSleep !== null ? `${lastNightSleep} Hour` : '--'}
            </Text>
          </AnimatedPressable>
        </View>
      </View>

      {showXPSection && (
        <AnimatedPressable 
          style={styles.xpSection} 
          activeOpacity={0.7} 
          onPress={() => {
            if (onPressXP) {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onPressXP();
            }
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Animated.Image 
              source={MASCOT_IMAGES[levelLabel]} 
              style={{ width: 62, height: 62, marginRight: 6, marginVertical: -10, alignSelf: 'center' }} 
              resizeMode="contain" 
            />
            <View style={{ flex: 1 }}>
              <View style={styles.xpLabelRow}>
                <Text style={styles.xpLevelText}>{levelLabel} • {levelXP} / {levelNextXP} xp</Text>
                <Text style={styles.xpToNext}>{levelNextXP - levelXP} to {levelNextLabel}</Text>
              </View>
              <View style={styles.xpTrack}>
                <LinearGradient
                  colors={getGradientForLevel(levelLabel) as any}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={[styles.xpFill, { width: `${Math.max(levelProgress * 100, 2)}%` as any }]}
                />
              </View>
            </View>
          </View>
        </AnimatedPressable>
      )}

      {/* QUICK CAPTURE */}
      {showCapture !== false && onCapture && (
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
              <Text key={a.id as any} style={styles.urgentItem} numberOfLines={1}>
                · {a.title} — {a.dueDate === todayStr ? 'Today' : a.dueDate === in3daysStr ? 'in 3 days' : a.dueDate}
              </Text>
            ))}
          </View>
          <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} />
        </AnimatedPressable>
      )}
    </View>
  );
}

const makeStyles = (colors: any) =>
  StyleSheet.create({
    card: {
      backgroundColor: '#101012', // solid/slug-like black, not pure black
      borderRadius: RADIUS.xl,
      borderWidth: 1,
      borderColor: colors.border || '#2c2c2e',
      paddingHorizontal: SPACE.md,
      paddingTop: 14,
      paddingBottom: 12,
      marginTop: 4,
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
      height: '100%',
      backgroundColor: 'rgba(255,255,255,0.06)',
    },
    rightMetricsColumn: {
      flex: 1,
      justifyContent: 'center',
      gap: 6,
    },
    compactMetricRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      width: '100%',
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 12,
    },
    compactLeftGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
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
      height: 6,
      borderRadius: 3,
      backgroundColor: 'rgba(255,255,255,0.08)',
      overflow: 'hidden',
    },
    xpFill: {
      height: '100%',
      borderRadius: 3,
    },
    captureBar: {
      marginTop: SPACE.md,
      marginBottom: SPACE.xs,
      backgroundColor: '#161618',
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
