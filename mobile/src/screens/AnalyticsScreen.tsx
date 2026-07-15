/**
 * AnalyticsScreen — ZenTrack Mobile
 * Radical Redesign: "Zen Ring" Hero + Horizontal Bento Grid
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, ScrollView, Dimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Path, Defs, LinearGradient, Stop, G } from 'react-native-svg';
import { BlurView } from 'expo-blur';
import { LinearGradient as ExpoLinearGradient } from 'expo-linear-gradient';

import { useMobileData } from '../contexts/MobileDataContext';
import { COLORS, FONT_FAMILY, FONT_SIZE, SPACE, RADIUS } from '../theme/tokens';
import { animateFadeInUp } from '../theme/animations';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Bezier Curve Helper
const smoothLine = (points: {x: number, y: number}[]) => {
  if (points.length === 0) return '';
  const path = [`M ${points[0].x} ${points[0].y}`];
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    const midX = (p1.x + p2.x) / 2;
    path.push(`C ${midX} ${p1.y}, ${midX} ${p2.y}, ${p2.x} ${p2.y}`);
  }
  return path.join(' ');
};

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export default function AnalyticsScreen() {
  const { tasks, habitLogs, gymLogs, pomodoroSessions } = useMobileData();
  const navigation = useNavigation<any>();
  
  // Staggered Intro Animations
  const animHeader = useRef(new Animated.Value(0)).current;
  const animRing = useRef(new Animated.Value(0)).current;
  const animBento1 = useRef(new Animated.Value(0)).current;
  const animBento2 = useRef(new Animated.Value(0)).current;
  const animBento3 = useRef(new Animated.Value(0)).current;

  useEffect(() => { 
    Animated.stagger(150, [
      Animated.timing(animHeader, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.spring(animRing, { toValue: 1, tension: 40, friction: 7, useNativeDriver: true }),
      Animated.spring(animBento1, { toValue: 1, tension: 50, friction: 8, useNativeDriver: true }),
      Animated.spring(animBento2, { toValue: 1, tension: 50, friction: 8, useNativeDriver: true }),
      Animated.spring(animBento3, { toValue: 1, tension: 50, friction: 8, useNativeDriver: true }),
    ]).start();
  }, []);

  // ─── Data Processing ───
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysStr = thirtyDaysAgo.toISOString().slice(0, 10);
  
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDaysStr = sevenDaysAgo.toISOString().slice(0, 10);

  // 1. Stats
  const completedTasks = tasks.filter(t => t.status === 'completed' && t.completedAt && t.completedAt >= thirtyDaysStr).length;
  const habitsLast30 = habitLogs.filter(l => l.date >= thirtyDaysStr).length;
  const gymSessions30 = gymLogs.filter(l => l.date >= thirtyDaysStr).length;

  // Zen Score (Dummy calculation for visuals)
  const maxScore = 300;
  const zenScore = Math.min(completedTasks + (habitsLast30 * 2) + (gymSessions30 * 5), maxScore);
  const ringProgress = zenScore / maxScore;

  const RING_SIZE = 160;
  const RING_RADIUS = (RING_SIZE - 20) / 2;
  const CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
  
  // Animate the strokeDashoffset
  const strokeDashoffset = animRing.interpolate({
    inputRange: [0, 1],
    outputRange: [CIRCUMFERENCE, CIRCUMFERENCE - (ringProgress * CIRCUMFERENCE)]
  });

  // 2. Task Consistency Heatmap Data (Last 35 days)
  const heatmapDates = Array.from({ length: 35 }).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (34 - i));
    return d.toISOString().slice(0, 10);
  });
  
  // 3. Line Chart (Gym Strength)
  const benchData = gymLogs
    .map(log => {
      let maxW = 0;
      log.exercises?.forEach(ex => {
        if (ex.name?.toLowerCase().includes('bench')) {
          ex.sets?.forEach((s: any) => {
            if (s.weight > maxW) maxW = s.weight;
          });
        }
      });
      return { date: log.date, w: maxW };
    })
    .filter(d => d.w > 0)
    .sort((a,b) => a.date.localeCompare(b.date))
    .slice(-7);

  const finalGymData = benchData.length > 3 ? benchData : [
    { date: '1st', w: 60 }, { date: '5th', w: 65 }, { date: '10th', w: 65 }, 
    { date: '15th', w: 70 }, { date: '20th', w: 75 }, { date: '25th', w: 75 }, { date: '30th', w: 80 }
  ];
  const maxGym = Math.max(...finalGymData.map(g => g.w));
  const minGym = Math.min(...finalGymData.map(g => g.w)) - 10;
  
  const chartWidth = 220; // Fixed for horizontal bento
  const chartHeight = 80;
  const gymPoints = finalGymData.map((d, i) => ({
    x: (i / (finalGymData.length - 1)) * chartWidth,
    y: chartHeight - ((d.w - minGym) / (maxGym - minGym)) * chartHeight
  }));
  const curvePath = smoothLine(gymPoints);
  const areaPath = `${curvePath} L ${chartWidth},${chartHeight} L 0,${chartHeight} Z`;

  // 4. Task Completion Trend (Grouped Bar)
  const taskTrendData = Array.from({length: 7}).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const dt = d.toISOString().slice(0,10);
    const completed = tasks.filter(t => t.status === 'completed' && t.completedAt?.startsWith(dt)).length;
    return { day: ['M','T','W','T','F','S','S'][(d.getDay() + 6) % 7], completed };
  });
  const maxTask = Math.max(...taskTrendData.map(t => t.completed), 5);

  // 5. Deep Work Focus Trend
  const focusTrendData = Array.from({length: 7}).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const dt = d.toISOString().slice(0,10);
    const mins = pomodoroSessions
      .filter(p => p.date === dt)
      .reduce((acc, p) => acc + p.durationMinutes, 0);
    return { day: ['M','T','W','T','F','S','S'][(d.getDay() + 6) % 7], mins };
  });
  const maxFocus = Math.max(...focusTrendData.map(t => t.mins), 30);

  // 6. Gym Volume (Last 7 days)
  const gymActivityData = Array.from({length: 7}).map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const dt = d.toISOString().slice(0,10);
    const log = gymLogs.find(g => g.date === dt);
    const volume = log ? (log.exercises?.length || 0) : 0;
    return { day: ['M','T','W','T','F','S','S'][(d.getDay() + 6) % 7], volume };
  });
  const maxGymActivity = Math.max(...gymActivityData.map(g => g.volume), 5);

  // ─── Sub-components ───

  const GlassCard = ({ children, style }: any) => (
    <BlurView intensity={60} tint="dark" style={[styles.glassCard, style]}>
      {children}
    </BlurView>
  );

  return (
    <ExpoLinearGradient colors={['#181036', '#090710', '#050507']} style={styles.root}>
      {/* Immersive mesh background effect */}
      <View style={styles.bgGlow1} />
      <View style={styles.bgGlow2} />

      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        {/* Header */}
        <Animated.View style={[styles.header, { opacity: animHeader, transform: [{ translateY: animHeader.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }] }]}>
          <Text style={styles.title}>Zen Score</Text>
          <View style={styles.liveSync}>
            <View style={styles.syncDot} />
            <Text style={styles.syncText}>Live</Text>
          </View>
        </Animated.View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          
          {/* 1. HERO ZEN RING */}
          <Animated.View style={[styles.heroRingContainer, { 
            opacity: animRing,
            transform: [{ scale: animRing.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }]
          }]}>
            <Svg width={RING_SIZE} height={RING_SIZE} style={{ transform: [{ rotate: '-90deg' }] }}>
              <Defs>
                <LinearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
                  <Stop offset="0" stopColor={COLORS.accentPrimary} />
                  <Stop offset="1" stopColor={COLORS.accentSecondary} />
                </LinearGradient>
              </Defs>
              {/* Background Track */}
              <Circle
                cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_RADIUS}
                stroke="rgba(255,255,255,0.05)" strokeWidth="10" fill="none"
              />
              {/* Progress Ring */}
              <AnimatedCircle
                cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_RADIUS}
                stroke="url(#ringGrad)" strokeWidth="12" fill="none"
                strokeDasharray={CIRCUMFERENCE}
                strokeDashoffset={strokeDashoffset}
                strokeLinecap="round"
              />
            </Svg>
            {/* Inner Content */}
            <View style={styles.heroRingInner}>
              <Text style={styles.heroScore}>{zenScore}</Text>
              <Text style={styles.heroLabel}>Total XP</Text>
            </View>
          </Animated.View>

          {/* 2. Top Bento Row: 2 Tabular Cards */}
          <Animated.View style={[styles.bentoRow, { 
            opacity: animBento1,
            transform: [{ translateY: animBento1.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }]
          }]}>
            <GlassCard style={{ flex: 1, padding: SPACE.md, flexDirection: 'row', alignItems: 'center', gap: SPACE.md }}>
              <View style={[styles.iconBox, { backgroundColor: 'rgba(94,218,158,0.15)', marginBottom: 0 }]}>
                <Ionicons name="checkmark-done" size={18} color={COLORS.accentGreen} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.bentoValSmall}>{completedTasks}</Text>
                <Text style={styles.bentoTitleSmall}>Tasks Done</Text>
              </View>
            </GlassCard>

            <GlassCard style={{ flex: 1, padding: SPACE.md, flexDirection: 'row', alignItems: 'center', gap: SPACE.md }}>
              <View style={[styles.iconBox, { backgroundColor: 'rgba(165,153,255,0.15)', marginBottom: 0 }]}>
                <Ionicons name="flame" size={18} color={COLORS.accentPrimary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.bentoValSmall}>{habitsLast30}</Text>
                <Text style={styles.bentoTitleSmall}>Habit Streaks</Text>
              </View>
            </GlassCard>
          </Animated.View>

          {/* 3. Horizontal Bento Carousel for Charts */}
          <Animated.View style={{ 
            opacity: animBento2,
            transform: [{ translateY: animBento2.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }]
          }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: SPACE.xl, gap: SPACE.md, paddingBottom: SPACE.lg }}>
              
              {/* Gym Progress Horizontal Card */}
              <GlassCard style={{ width: 260, padding: SPACE.lg, marginBottom: 0 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACE.lg }}>
                  <Text style={styles.bentoTitle}>Gym Max</Text>
                  <Text style={styles.bentoSub}>{maxGym} kg</Text>
                </View>
                <View style={{ height: 80, width: '100%' }}>
                  <Svg width="100%" height="100%">
                    <Defs>
                      <LinearGradient id="gymGrad" x1="0" y1="0" x2="0" y2="1">
                        <Stop offset="0" stopColor={COLORS.accentSecondary} stopOpacity="0.4" />
                        <Stop offset="1" stopColor={COLORS.accentSecondary} stopOpacity="0" />
                      </LinearGradient>
                    </Defs>
                    <Path d={areaPath} fill="url(#gymGrad)" />
                    <Path d={curvePath} fill="none" stroke={COLORS.accentSecondary} strokeWidth="3" strokeLinecap="round" />
                    {gymPoints.map((p, i) => (
                      <Circle key={i} cx={p.x} cy={p.y} r="3" fill={COLORS.accentSecondary} />
                    ))}
                  </Svg>
                </View>
              </GlassCard>

              {/* Task Trend Horizontal Card */}
              <GlassCard style={{ width: 260, padding: SPACE.lg, marginBottom: 0 }}>
                <Text style={styles.bentoTitle}>Task Flow</Text>
                <Text style={[styles.bentoSub, { marginBottom: SPACE.lg }]}>Last 7 Days</Text>
                <View style={{ height: 80, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                  {taskTrendData.map((d, i) => {
                    const hPct = (d.completed / maxTask) * 100;
                    return (
                      <View key={i} style={{ alignItems: 'center' }}>
                        <View style={{ width: 12, height: `${Math.max(10, hPct)}%`, backgroundColor: COLORS.accentPrimary, borderRadius: 6, marginBottom: 8 }} />
                        <Text style={{ fontSize: 10, color: COLORS.textMuted, fontFamily: FONT_FAMILY.bold }}>{d.day}</Text>
                      </View>
                    )
                  })}
                </View>
              </GlassCard>

              {/* Focus Trend Horizontal Card */}
              <GlassCard style={{ width: 260, padding: SPACE.lg, marginBottom: 0 }}>
                <Text style={styles.bentoTitle}>Deep Work</Text>
                <Text style={[styles.bentoSub, { marginBottom: SPACE.lg }]}>Focus Minutes</Text>
                <View style={{ height: 80, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                  {focusTrendData.map((d, i) => {
                    const hPct = (d.mins / maxFocus) * 100;
                    return (
                      <View key={i} style={{ alignItems: 'center' }}>
                        <View style={{ width: 12, height: `${Math.max(10, hPct)}%`, backgroundColor: COLORS.accentSecondary, borderRadius: 6, marginBottom: 8 }} />
                        <Text style={{ fontSize: 10, color: COLORS.textMuted, fontFamily: FONT_FAMILY.bold }}>{d.day}</Text>
                      </View>
                    )
                  })}
                </View>
              </GlassCard>

              {/* Gym Volume Horizontal Card */}
              <GlassCard style={{ width: 260, padding: SPACE.lg, marginBottom: 0 }}>
                <Text style={styles.bentoTitle}>Gym Volume</Text>
                <Text style={[styles.bentoSub, { marginBottom: SPACE.lg }]}>Exercises per Session</Text>
                <View style={{ height: 80, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                  {gymActivityData.map((d, i) => {
                    const hPct = (d.volume / maxGymActivity) * 100;
                    return (
                      <View key={i} style={{ alignItems: 'center' }}>
                        <View style={{ width: 12, height: `${Math.max(10, hPct)}%`, backgroundColor: COLORS.accentSecondary, borderRadius: 6, marginBottom: 8 }} />
                        <Text style={{ fontSize: 10, color: COLORS.textMuted, fontFamily: FONT_FAMILY.bold }}>{d.day}</Text>
                      </View>
                    )
                  })}
                </View>
              </GlassCard>

            </ScrollView>
          </Animated.View>

          {/* 4. Bottom Bento Row: Task Consistency Heatmap */}
          <Animated.View style={[styles.bentoRow, { 
            opacity: animBento3,
            transform: [{ translateY: animBento3.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }]
          }]}>
            <GlassCard style={{ flex: 1, padding: SPACE.lg }}>
              <Text style={styles.bentoTitle}>Task Consistency</Text>
              <Text style={styles.bentoSub}>Last 35 Days</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: SPACE.lg }}>
                {heatmapDates.map((date, i) => {
                  const count = tasks.filter(t => t.status === 'completed' && t.completedAt?.startsWith(date)).length;
                  let bg = 'rgba(255,255,255,0.04)';
                  if (count > 0 && count < 3) bg = 'rgba(165,153,255,0.3)';
                  if (count >= 3) bg = COLORS.accentPrimary;
                  return <View key={i} style={{ width: '12%', aspectRatio: 1, borderRadius: 4, backgroundColor: bg }} />
                })}
              </View>
            </GlassCard>
          </Animated.View>
          
          {/* Scroll spacer */}
          <View style={{ height: 100 }} />

        </ScrollView>
      </SafeAreaView>
    </ExpoLinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#050507' }, // Ultra dark
  
  bgGlow1: {
    position: 'absolute',
    top: -100, left: -50,
    width: 300, height: 300,
    borderRadius: 150,
    backgroundColor: 'rgba(165,153,255,0.15)',
    transform: [{ scale: 2 }],
    opacity: 0.8,
  },
  bgGlow2: {
    position: 'absolute',
    bottom: 200, right: -100,
    width: 250, height: 250,
    borderRadius: 125,
    backgroundColor: 'rgba(94,218,158,0.1)',
    transform: [{ scale: 2 }],
  },
  
  header: { 
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: SPACE.xl, paddingTop: SPACE.xl, paddingBottom: SPACE.md 
  },
  title: { fontFamily: FONT_FAMILY.title, fontSize: 28, color: COLORS.textPrimary },
  liveSync: { 
    flexDirection: 'row', alignItems: 'center', 
    backgroundColor: 'rgba(255,255,255,0.1)', 
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 
  },
  syncDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: COLORS.accentSecondary, marginRight: 6 },
  syncText: { color: COLORS.textPrimary, fontSize: 11, fontFamily: FONT_FAMILY.bold },
  
  scrollContent: { paddingTop: SPACE.md },

  // Hero Ring
  heroRingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACE.sm,
    marginBottom: SPACE.xl,
    position: 'relative'
  },
  heroRingInner: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center'
  },
  heroScore: {
    fontFamily: FONT_FAMILY.title,
    fontSize: 42,
    color: COLORS.textPrimary,
    lineHeight: 46,
  },
  heroLabel: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 12,
    color: COLORS.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 2
  },

  // Bento
  bentoRow: {
    flexDirection: 'row',
    paddingHorizontal: SPACE.xl,
    gap: SPACE.md,
    marginBottom: SPACE.md,
  },
  glassCard: {
    borderRadius: RADIUS.xxl,
    borderWidth: 1, 
    borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  
  iconBox: {
    width: 36, height: 36,
    borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: SPACE.md,
  },
  bentoVal: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 28,
    color: COLORS.textPrimary,
  },
  bentoValSmall: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 20,
    color: COLORS.textPrimary,
  },
  bentoTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 13,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  bentoTitleSmall: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 11,
    color: COLORS.textMuted,
  },
  bentoSub: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 13,
    color: COLORS.textPrimary,
  }
});
