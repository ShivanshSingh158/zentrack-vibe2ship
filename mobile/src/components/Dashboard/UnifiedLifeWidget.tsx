/**
 * UnifiedLifeWidget.tsx — ZenTrack Mobile
 * Reimagined premium life widget: streak/level pills, central quest donut ring,
 * flanking habit & water metrics, sleep row, and XP progress bar at the bottom.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle as SvgCircle, Defs, LinearGradient as SvgLinearGradient, RadialGradient, Stop } from 'react-native-svg';
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
  isOngoing?: boolean;
  nowMins?: number;
  startTimeMins?: number;
  endTimeMins?: number;
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
  classesAttendedToday?: number;
  classesTotalToday?: number;
  overallAttendancePct?: number;
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
  onPressAttendance?: () => void;
  onPressXP?: () => void;
  onPressRing?: () => void;
  onCapture?: () => void;
  onPressAssignments?: () => void;
}

const RING_SIZE = 124;
const RING_STROKE = 9.5;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

const MASCOT_IMAGES: Record<string, any> = {
  'Seeker': require('../../../assets/mascots/level0.png'),
  'Warden': require('../../../assets/mascots/level1.png'),
  'Sentinel': require('../../../assets/mascots/level3.png'),
  'Guardian': require('../../../assets/mascots/level2.png'),
  'Vanguard': require('../../../assets/mascots/level4.png'),
  'Luminary': require('../../../assets/mascots/level5.png'),
  'Legend': require('../../../assets/mascots/level6.png'),
  'Mythic': require('../../../assets/mascots/level7.png'),
  'Paragon': require('../../../assets/mascots/level8.png'),
  'Titan': require('../../../assets/mascots/level9.png'),
  'Ascendant': require('../../../assets/mascots/level10.png'),
  'Exalted': require('../../../assets/mascots/level11.png'),
  'Sovereign': require('../../../assets/mascots/level12.png'),
  'Archon': require('../../../assets/mascots/level13.png'),
  'Celestial': require('../../../assets/mascots/level14.png'),
  'Ethereal': require('../../../assets/mascots/level15.png'),
  'Empyrean': require('../../../assets/mascots/level16.png'),
  'Astral': require('../../../assets/mascots/level17.png'),
  'Zenith': require('../../../assets/mascots/level18.png'),
  'Apex': require('../../../assets/mascots/level19.png'),
};

const getGradientForLevel = (level: string) => {
  switch (level) {
    case 'Seeker':    return ['#34d399', '#22d3ee'];
    case 'Warden':    return ['#22d3ee', '#3b82f6'];
    case 'Sentinel':  return ['#14b8a6', '#0ea5e9'];
    case 'Guardian':  return ['#3b82f6', '#6366f1'];
    case 'Vanguard':  return ['#a855f7', '#ec4899'];
    case 'Luminary':  return ['#f59e0b', '#fbbf24'];
    case 'Legend':    return ['#f97316', '#ef4444'];
    case 'Mythic':    return ['#ec4899', '#8b5cf6'];
    case 'Paragon':   return ['#8b5cf6', '#6366f1'];
    case 'Titan':     return ['#6366f1', '#3b82f6'];
    case 'Ascendant': return ['#3b82f6', '#06b6d4'];
    case 'Exalted':   return ['#06b6d4', '#10b981'];
    case 'Sovereign': return ['#10b981', '#84cc16'];
    case 'Archon':    return ['#84cc16', '#eab308'];
    case 'Celestial': return ['#eab308', '#f97316'];
    case 'Ethereal':  return ['#f97316', '#ef4444'];
    case 'Empyrean':  return ['#ef4444', '#ec4899'];
    case 'Astral':    return ['#ec4899', '#d946ef'];
    case 'Zenith':    return ['#d946ef', '#a855f7'];
    case 'Apex':      return ['#a855f7', '#8b5cf6'];
    default:          return ['#a599ff', '#6366f1'];
  }
};

export const UnifiedLifeWidget = React.memo(function UnifiedLifeWidget({
  currentStreak,
  streakAtRisk = false,
  agendaCompleted,
  agendaTotal,
  habitsCompleted,
  habitsTotal,
  waterCompleted,
  waterTotal,
  classesAttendedToday = 0,
  classesTotalToday = 0,
  overallAttendancePct = 0,
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
  onPressAttendance,
  onPressXP,
  onPressRing,
  onCapture,
  onPressAssignments,
}: UnifiedLifeWidgetProps) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  const mascotConfig = useMemo(() => {
    if (levelLabel === 'Warden') return { w: 90, b: -28, x: 0 };
    if (levelLabel === 'Apex') return { w: 135, b: -42, x: 6 };
    return { w: 105, b: -32, x: 0 };
  }, [levelLabel]);

  const levelGradients = useMemo(() => getGradientForLevel(levelLabel), [levelLabel]);
  const primaryLevelColor = levelGradients[0];
  const isAttendanceRing = !!(nextClass && !nextClass.isOngoing);
  const isOngoingClass = !!(nextClass && nextClass.isOngoing);

  const ringPercent = nextClass
    ? (nextClass.isOngoing
        ? Math.min(Math.max((nextClass.nowMins! - nextClass.startTimeMins!) / (nextClass.endTimeMins! - nextClass.startTimeMins!), 0), 1)
        : (nextClass.total ? Math.min(nextClass.attended! / nextClass.total, 1) : 1))
    : (agendaTotal > 0 ? agendaCompleted / agendaTotal : 0);
    
  const strokeDashoffset = RING_CIRCUMFERENCE * (1 - ringPercent);
  const allDone = nextClass ? ringPercent === 1 : (agendaTotal > 0 && agendaCompleted >= agendaTotal);

  const bgStroke = isAttendanceRing
    ? (isDark ? '#ff4d4f' : '#dc2626')
    : (isDark ? 'rgba(255,255,255,0.06)' : '#EAE9F2');

  const fgStroke = isAttendanceRing
    ? (isDark ? '#5eda9e' : '#059669')
    : 'url(#xpGradient)';

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
        <AnimatedPressable 
          style={styles.ringWrapper} 
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onPressRing?.();
          }}
        >
          <Svg width={RING_SIZE} height={RING_SIZE} style={styles.svgAbsolute}>
            <Defs>
              <SvgLinearGradient id="xpGradient" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0%" stopColor={levelGradients[0]} />
                <Stop offset="100%" stopColor={levelGradients[1]} />
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
              <View style={styles.ringCenterInner}>
                <Text style={styles.ringTimeText}>{nextClass.time}</Text>
                <Text style={styles.ringClassTitle} numberOfLines={1}>
                  {nextClass.title}
                </Text>
                {nextClass.isOngoing && (
                  <Text style={[styles.ringClassTitle, { color: primaryLevelColor, marginTop: 2, fontSize: 10, letterSpacing: 1.5 }]}>
                    ONGOING
                  </Text>
                )}
              </View>
            ) : (
              <View style={styles.ringCenterInner}>
                <Text style={[styles.ringCount, { color: isDark ? primaryLevelColor : colors.textPrimary }]}>
                  {agendaCompleted}/{agendaTotal}
                </Text>
                <Text style={styles.ringLabel}>
                  {agendaTotal === 0 ? 'REST DAY' : 'QUESTS TODAY'}
                </Text>
              </View>
            )}
          </View>
        </AnimatedPressable>

        <View style={styles.rightMetricsColumn}>
          {/* HABITS */}
          <AnimatedPressable
            style={[
              styles.compactMetricRow, 
              { 
                backgroundColor: isDark ? '#1C1C20' : 'rgba(5, 150, 105, 0.08)', 
                borderColor: isDark ? 'rgba(255,255,255,0.08)' : colors.border, 
                borderWidth: 1 
              }
            ]}
            activeOpacity={0.75}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPressHabits(); }}
          >
            <View style={styles.compactLeftGroup}>
              <Text style={styles.compactEmoji}>🌱</Text>
              <Text style={[styles.compactLabel, { color: colors.accentGreen }]}>Momentum</Text>
            </View>
            <Text style={[styles.valuePillText, { color: colors.accentGreen }]}>{habitsCompleted}/{habitsTotal}</Text>
          </AnimatedPressable>

          {/* WATER */}
          <AnimatedPressable
            style={[
              styles.compactMetricRow, 
              { 
                backgroundColor: isDark ? '#1C1C20' : 'rgba(2, 132, 199, 0.08)', 
                borderColor: isDark ? 'rgba(255,255,255,0.08)' : colors.border, 
                borderWidth: 1, 
                overflow: 'hidden' 
              }
            ]}
            activeOpacity={0.75}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPressWater(); }}
          >
            <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${Math.min(100, (waterCompleted / (waterTotal || 1)) * 100)}%`, backgroundColor: isDark ? 'rgba(137, 220, 235, 0.18)' : 'rgba(2, 132, 199, 0.12)' }} />
            <View style={styles.compactLeftGroup}>
              <Text style={styles.compactEmoji}>💧</Text>
              <Text style={[styles.compactLabel, { color: colors.accentBlue }]}>Hydration</Text>
            </View>
            <Text style={[styles.valuePillText, { color: colors.accentBlue }]}>{displayWater}/{displayWaterTarget}L</Text>
          </AnimatedPressable>

          {/* CLASSES (Replaced Library) */}
          <AnimatedPressable
            style={[
              styles.compactMetricRow, 
              { 
                backgroundColor: isDark ? '#1C1C20' : 'rgba(217, 119, 6, 0.08)', 
                borderColor: isDark ? 'rgba(255,255,255,0.08)' : colors.border, 
                borderWidth: 1 
              }
            ]}
            activeOpacity={0.75}
            onPress={() => { 
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); 
              if (onPressAttendance) onPressAttendance();
            }}
          >
            <View style={styles.compactLeftGroup}>
              <Text style={styles.compactEmoji}>🎓</Text>
              <Text style={[styles.compactLabel, { color: colors.accentAmber }]}>Classes</Text>
            </View>
            <Text style={[styles.valuePillText, { color: colors.accentAmber }]}>
              {classesTotalToday > 0 
                ? `${classesAttendedToday}/${classesTotalToday} Done`
                : (overallAttendancePct > 0 ? `${overallAttendancePct}% Avg` : '0/0 Done')
              }
            </Text>
          </AnimatedPressable>
        </View>
      </View>

      {showXPSection && (
        <AnimatedPressable 
          style={[styles.xpSection, { zIndex: 100 }]} 
          activeOpacity={0.7} 
          onPress={() => {
            if (onPressXP) {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onPressXP();
            }
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {/* 3D Overflow Mascot Container */}
            <View style={{ width: 65, height: 45, marginRight: 8, justifyContent: 'center', alignItems: 'center', zIndex: 100 }}>
              {/* Glow / Aura Layer (Cross-Platform) */}
              <Animated.Image 
                source={MASCOT_IMAGES[levelLabel]} 
                style={{ 
                  width: mascotConfig.w, 
                  height: mascotConfig.w, 
                  position: 'absolute', 
                  bottom: mascotConfig.b, 
                  transform: [{ translateX: mascotConfig.x }],
                  zIndex: 90,
                  tintColor: getGradientForLevel(levelLabel)[0],
                  opacity: 0.95,
                }} 
                blurRadius={12}
                resizeMode="contain" 
              />
              
              {/* Real Mascot Image */}
              <Animated.Image 
                source={MASCOT_IMAGES[levelLabel]} 
                style={{ 
                  width: mascotConfig.w, 
                  height: mascotConfig.w, 
                  position: 'absolute', 
                  bottom: mascotConfig.b, 
                  transform: [{ translateX: mascotConfig.x }],
                  zIndex: 100 
                }} 
                resizeMode="contain" 
              />
            </View>
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
        <AnimatedPressable style={styles.captureBar} activeOpacity={0.75} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onCapture(); }}>
          <Ionicons name="add-circle-outline" size={20} color={colors.accentPrimary} />
          <Text style={styles.capturePlaceholder} numberOfLines={1}>Add anything... habit, task, notes</Text>
        </AnimatedPressable>
      )}

      {/* URGENT BANNER */}
      {urgentAssignments.length > 0 && (
        <AnimatedPressable style={styles.urgentBanner} activeOpacity={0.8} onPress={onPressAssignments}>
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
});

const makeStyles = (colors: any, isDark: boolean = true) =>
  StyleSheet.create({
    card: {
      backgroundColor: isDark ? '#101012' : colors.surface,
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
      backgroundColor: colors.accentAmberDim,
      borderColor: colors.accentAmber + '35',
    },
    levelPill: {
      backgroundColor: colors.accentDim,
      borderColor: colors.accentPrimary + '35',
    },
    pillIcon: { fontSize: 12 },
    pillText: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 11,
      letterSpacing: 0.2,
    },
    streakPillText: { color: colors.accentAmber },
    levelPillText: { color: colors.accentPrimary },
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
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : colors.border,
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
      backgroundColor: colors.border,
      overflow: 'hidden',
    },
    xpFill: {
      height: '100%',
      borderRadius: 3,
    },
    captureBar: {
      marginTop: SPACE.md,
      marginBottom: SPACE.xs,
      backgroundColor: colors.surface2 || colors.surface,
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
      backgroundColor: colors.accentAmberDim,
      borderWidth: 1,
      borderColor: colors.accentAmber + '40',
      borderRadius: RADIUS.lg,
      padding: SPACE.lg,
    },
    urgentTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 11, color: colors.accentAmber, letterSpacing: 0.5, marginBottom: 4 },
    urgentItem:  { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: colors.textSecondary, lineHeight: 18 },
  });
