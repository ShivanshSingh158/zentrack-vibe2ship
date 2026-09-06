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
  steps?: number;        // kept for prop-compat (ignored — attendance shown instead)
  stepGoal?: number;     // kept for prop-compat (ignored)
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
  onPressSteps?: () => void;   // kept for prop-compat (not used — attendance shown instead)
  onPressAttendance?: () => void;
  onPressXP?: () => void;
  onPressRing?: () => void;
  onCapture?: () => void;
  onPressAssignments?: () => void;
}

import { MASCOT_IMAGES, getGradientForLevel } from './mascotConstants';
import { makeStyles, RING_SIZE, RING_STROKE, RING_RADIUS, RING_CIRCUMFERENCE } from './unifiedLifeWidgetStyles';

export const UnifiedLifeWidget = React.memo(function UnifiedLifeWidget({
  currentStreak,
  streakAtRisk = false,
  agendaCompleted,
  agendaTotal,
  habitsCompleted,
  habitsTotal,
  waterCompleted,
  waterTotal,
  steps = 0,
  stepGoal = 10000,
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
  onPressSteps,
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

  // Extract attendance metric derivations from render body IIFE to useMemo.
  // Prevents recomputing 5 values on every render cycle, bypassing React.memo.
  const attendanceMetrics = useMemo(() => {
    const pct = Math.round(overallAttendancePct || 0);
    const isSafe = pct >= 75;
    const isWarning = pct >= 65 && pct < 75;
    const accentColor = isSafe ? '#32D74B' : isWarning ? '#FFD60A' : '#FF453A';
    const bgColor = isSafe
      ? (isDark ? 'rgba(50, 215, 75, 0.08)' : 'rgba(50, 215, 75, 0.10)')
      : isWarning
      ? (isDark ? 'rgba(255, 214, 10, 0.10)' : 'rgba(255, 214, 10, 0.10)')
      : (isDark ? 'rgba(255, 69, 58, 0.10)' : 'rgba(255, 69, 58, 0.08)');
    const fillColor = isSafe
      ? (isDark ? 'rgba(50, 215, 75, 0.14)' : 'rgba(50, 215, 75, 0.12)')
      : isWarning
      ? (isDark ? 'rgba(255, 214, 10, 0.14)' : 'rgba(255, 214, 10, 0.12)')
      : (isDark ? 'rgba(255, 69, 58, 0.16)' : 'rgba(255, 69, 58, 0.12)');
    const label = isSafe ? 'Safe Zone' : isWarning ? 'At Risk' : 'Critical';
    return { pct, isSafe, isWarning, accentColor, bgColor, fillColor, label };
  }, [overallAttendancePct, isDark]);

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

          {/* CLASS ATTENDANCE AVERAGE (replaces Steps) */}
          {/* CLASS ATTENDANCE AVERAGE (replaces Steps) */}
          <AnimatedPressable
            style={[
              styles.compactMetricRow,
              {
                backgroundColor: isDark ? '#1C1C20' : attendanceMetrics.bgColor,
                borderColor: isDark ? 'rgba(255,255,255,0.08)' : attendanceMetrics.accentColor + '33',
                borderWidth: 1,
                overflow: 'hidden',
              },
            ]}
            activeOpacity={0.75}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              if (onPressAttendance) onPressAttendance();
            }}
          >
            {/* Attendance progress fill */}
            <View
              style={{
                position: 'absolute',
                top: 0, bottom: 0, left: 0,
                width: `${Math.min(100, attendanceMetrics.pct)}%`,
                backgroundColor: attendanceMetrics.fillColor,
              }}
            />
            <View style={styles.compactLeftGroup}>
              <Text style={styles.compactEmoji}>🎓</Text>
              <Text style={[styles.compactLabel, { color: attendanceMetrics.accentColor }]}>
                Attendance
              </Text>
            </View>
            <Text style={[styles.valuePillText, { color: attendanceMetrics.accentColor }]}>
              {attendanceMetrics.pct}%
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

export default UnifiedLifeWidget;
