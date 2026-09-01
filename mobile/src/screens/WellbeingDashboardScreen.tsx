/**
 * WellbeingDashboardScreen.tsx — ZenTrack Physical Vitality & Daily Movement Hub
 * Features: Real-time native Step Counter, 7-Day movement graphs, Hydration tracking, and S.A.R.A Intelligence.
 */

import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Dimensions,
  TouchableOpacity,
  Animated,
  InteractionManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import Svg, {
  Path,
  Defs,
  LinearGradient as SvgLinearGradient,
  Stop,
  Rect,
  Text as SvgText,
  Line,
  Circle,
} from 'react-native-svg';
import { BlurView } from 'expo-blur';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';

import { useTheme } from '../contexts/ThemeContext';
import { useWellnessData } from '../contexts/domains/WellnessContext';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS } from '../theme/tokens';
import { callProxy } from '../services/geminiProxy';
import { formatLocalDateStr } from '../utils/dateUtils';
import {
  useStepCounter,
  formatStepsDistance,
  formatStepsCalories,
  formatStepsActiveTime,
  DayStepData,
} from '../hooks/useStepCounter';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_PAD = 16;
const CHART_W = SCREEN_WIDTH - SPACE.xl * 2 - CARD_PAD * 2;
const CHART_H = 130;

// ─── Smooth Bezier Helper for Water Chart ──────────────────────────────────────
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  const d = [`M ${pts[0].x} ${pts[0].y}`];
  for (let i = 0; i < pts.length - 1; i++) {
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const cpX = (p1.x + p2.x) / 2;
    d.push(`C ${cpX} ${p1.y}, ${cpX} ${p2.y}, ${p2.x} ${p2.y}`);
  }
  return d.join(' ');
}

function daysAgoStr(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return formatLocalDateStr(d);
}

function getPast7Days(): string[] {
  return Array.from({ length: 7 }, (_, i) => daysAgoStr(6 - i));
}

function getDayLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days[d.getDay()];
}

const AnimatedPath = Animated.createAnimatedComponent(Path);

function GlassCard({
  children,
  style,
  isDark,
  colors,
}: {
  children?: React.ReactNode;
  style?: any;
  isDark: boolean;
  colors: any;
}) {
  if (isDark) {
    return (
      <BlurView
        intensity={55}
        tint="dark"
        style={[
          {
            borderRadius: RADIUS.xl,
            padding: CARD_PAD,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.08)',
            overflow: 'hidden',
            backgroundColor: 'rgba(18, 17, 26, 0.65)',
          },
          style,
        ]}
      >
        {children}
      </BlurView>
    );
  }
  return (
    <View
      style={[
        {
          borderRadius: RADIUS.xl,
          padding: CARD_PAD,
          borderWidth: 1,
          borderColor: colors.border,
          overflow: 'hidden',
          backgroundColor: colors.surface,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export default function WellbeingDashboardScreen() {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  const [activeTab, setActiveTab] = useState<'steps' | 'water'>(
    route.params?.initialTab === 'water' ? 'water' : 'steps'
  );

  const { steps, stepGoal, history: stepHistory, updateGoal, refreshSteps } = useStepCounter();
  const { waterLogs, ensureSubscribed } = useWellnessData();

  useEffect(() => {
    const handle = InteractionManager.runAfterInteractions(() => ensureSubscribed?.());
    return () => handle.cancel();
  }, [ensureSubscribed]);

  // Mount animation
  const mountAnim = useRef(new Animated.Value(0)).current;
  const pathAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(mountAnim, { toValue: 1, duration: 450, useNativeDriver: true }),
      Animated.timing(pathAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
    ]).start();
  }, [activeTab]);

  const days = useMemo(() => getPast7Days(), []);
  const todayStr = days[days.length - 1];

  // ─── Water Metrics ────────────────────────────────────────────────────────
  const waterData = useMemo(() => {
    return days.map((date) => {
      const dayLogs = (waterLogs || []).filter((w) => w.date === date);
      return dayLogs.reduce((sum, log) => sum + (log.amountMl || 0), 0);
    });
  }, [waterLogs, days]);

  const maxWater = Math.max(...waterData, 2500);
  const waterAvg = Math.round(waterData.reduce((a, b) => a + b, 0) / 7);
  const todayWater = waterData[waterData.length - 1];

  const waterPts = waterData.map((val, i) => ({
    x: (i / (days.length - 1)) * CHART_W,
    y: CHART_H - (val / maxWater) * CHART_H,
  }));
  const waterPath = smoothPath(waterPts);
  const waterAreaPath = `${waterPath} L ${CHART_W} ${CHART_H} L 0 ${CHART_H} Z`;

  // ─── Step Metrics ─────────────────────────────────────────────────────────
  const stepHistoryDays = useMemo(() => {
    if (stepHistory && stepHistory.length === 7) return stepHistory;
    return days.map((dateStr, i) => ({
      dateStr,
      dayLabel: getDayLabel(dateStr),
      steps: i === 6 ? steps : 0,
    }));
  }, [stepHistory, days, steps]);

  const maxStepsInWeek = Math.max(...stepHistoryDays.map((d) => d.steps), stepGoal);
  const stepAvg = Math.round(stepHistoryDays.reduce((a, b) => a + b.steps, 0) / 7);
  const stepProgress = Math.min(1, steps / (stepGoal || 10000));

  // AI Movement & Hydration Insights
  const [aiTip, setAiTip] = useState<string | null>(null);
  const [isAiThinking, setIsAiThinking] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;
    async function fetchAiInsights() {
      const cacheKey = `@zentrack_daily_wellbeing_tip_${todayStr}_${activeTab}`;
      try {
        const cached = await AsyncStorage.getItem(cacheKey);
        if (cached && isMounted) {
          setAiTip(cached);
          return;
        }
      } catch {}

      setIsAiThinking(true);
      try {
        const prompt =
          activeTab === 'steps'
            ? `You are S.A.R.A, a high-performance biohacking & athletic movement AI.
Analyze the user's daily steps (${steps}/${stepGoal}) and provide one punchy, motivational coaching tip under 120 characters.`
            : `You are S.A.R.A, a high-performance wellness coach AI.
Analyze the user's last 7 days of water logs and provide one short, punchy hydration tip under 120 characters.`;

        const resp = await callProxy({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json' },
        });

        const rawText = resp.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawText && isMounted) {
          const parsed = JSON.parse(rawText);
          const tipText = parsed.tip || parsed.waterTip || parsed.text || rawText;
          setAiTip(tipText);
          AsyncStorage.setItem(cacheKey, tipText).catch(() => {});
        }
      } catch (e) {
      } finally {
        if (isMounted) setIsAiThinking(false);
      }
    }
    fetchAiInsights();
    return () => {
      isMounted = false;
    };
  }, [todayStr, activeTab, steps, stepGoal]);

  const defaultStepTip =
    steps >= stepGoal
      ? '🔥 Daily goal crushed! Active walking accelerates muscle recovery and optimizes REM sleep.'
      : `🏃 ${Math.max(0, stepGoal - steps).toLocaleString()} steps remaining to hit your 10k target before evening.`;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top']}>
      <StatusBar style={isDark ? 'light' : 'dark'} backgroundColor={colors.background} />

      {/* ── Top Header Bar ── */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Physical Vitality</Text>
        <TouchableOpacity style={styles.refreshBtn} onPress={() => refreshSteps()}>
          <Ionicons name="refresh-outline" size={20} color={colors.accentPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Segmented Tab Switcher (Steps vs Hydration) ── */}
        <View style={[styles.tabBar, { backgroundColor: isDark ? '#161522' : '#F2F1F8' }]}>
          <TouchableOpacity
            style={[styles.tabItem, activeTab === 'steps' && [styles.tabItemActive, { backgroundColor: isDark ? '#262438' : '#FFFFFF' }]]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setActiveTab('steps');
            }}
          >
            <Text style={{ fontSize: 13, marginRight: 5 }}>🚶</Text>
            <Text
              style={[
                styles.tabText,
                { color: activeTab === 'steps' ? '#f59e0b' : colors.textMuted },
                activeTab === 'steps' && { fontWeight: 'bold' },
              ]}
            >
              Daily Steps
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabItem, activeTab === 'water' && [styles.tabItemActive, { backgroundColor: isDark ? '#262438' : '#FFFFFF' }]]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setActiveTab('water');
            }}
          >
            <Text style={{ fontSize: 13, marginRight: 5 }}>💧</Text>
            <Text
              style={[
                styles.tabText,
                { color: activeTab === 'water' ? '#0ea5e9' : colors.textMuted },
                activeTab === 'water' && { fontWeight: 'bold' },
              ]}
            >
              Hydration
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Tab 1: Steps & Daily Movement ── */}
        {activeTab === 'steps' && (
          <Animated.View style={{ opacity: mountAnim }}>
            {/* Hero Radial Ring Card */}
            <GlassCard isDark={isDark} colors={colors} style={styles.card}>
              <View style={styles.heroRingContainer}>
                <Svg width={180} height={180} viewBox="0 0 180 180">
                  <Defs>
                    <SvgLinearGradient id="stepRingGrad" x1="0" y1="0" x2="1" y2="1">
                      <Stop offset="0%" stopColor="#ffb703" />
                      <Stop offset="100%" stopColor="#f59e0b" />
                    </SvgLinearGradient>
                  </Defs>
                  {/* Background Track */}
                  <Circle
                    cx="90"
                    cy="90"
                    r="74"
                    stroke={isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)'}
                    strokeWidth="14"
                    fill="none"
                  />
                  {/* Active Progress Ring */}
                  <Circle
                    cx="90"
                    cy="90"
                    r="74"
                    stroke="url(#stepRingGrad)"
                    strokeWidth="14"
                    fill="none"
                    strokeDasharray={465}
                    strokeDashoffset={465 - stepProgress * 465}
                    strokeLinecap="round"
                    transform="rotate(-90 90 90)"
                  />
                </Svg>

                {/* Ring Center Metrics */}
                <View style={styles.ringCenterOverlay}>
                  <Text style={[styles.ringBigCount, { color: colors.textPrimary }]}>
                    {steps.toLocaleString()}
                  </Text>
                  <Text style={[styles.ringGoalLabel, { color: '#f59e0b' }]}>
                    / {stepGoal.toLocaleString()} STEPS
                  </Text>
                  <Text style={[styles.ringPctText, { color: colors.textMuted }]}>
                    {Math.round(stepProgress * 100)}% Reached
                  </Text>
                </View>
              </View>

              {/* 3 Metric Sub-Pills */}
              <View style={styles.subMetricsRow}>
                <View style={[styles.subMetricBox, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' }]}>
                  <Text style={styles.subMetricEmoji}>🔥</Text>
                  <Text style={[styles.subMetricValue, { color: colors.textPrimary }]}>
                    {formatStepsCalories(steps)}
                  </Text>
                  <Text style={[styles.subMetricLabel, { color: colors.textMuted }]}>Active Burn</Text>
                </View>

                <View style={[styles.subMetricBox, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' }]}>
                  <Text style={styles.subMetricEmoji}>📍</Text>
                  <Text style={[styles.subMetricValue, { color: colors.textPrimary }]}>
                    {formatStepsDistance(steps)}
                  </Text>
                  <Text style={[styles.subMetricLabel, { color: colors.textMuted }]}>Distance</Text>
                </View>

                <View style={[styles.subMetricBox, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' }]}>
                  <Text style={styles.subMetricEmoji}>⏱️</Text>
                  <Text style={[styles.subMetricValue, { color: colors.textPrimary }]}>
                    {formatStepsActiveTime(steps)}
                  </Text>
                  <Text style={[styles.subMetricLabel, { color: colors.textMuted }]}>Active Move</Text>
                </View>
              </View>
            </GlassCard>

            {/* 7-Day Movement Bar Chart */}
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>7-Day Movement Trend</Text>
            <GlassCard isDark={isDark} colors={colors} style={styles.card}>
              <View style={styles.statRow}>
                <View>
                  <Text style={[styles.statLabel, { color: colors.textTertiary }]}>7-Day Average</Text>
                  <Text style={[styles.statValue, { color: colors.textPrimary }]}>
                    {stepAvg.toLocaleString()} <Text style={[styles.statUnit, { color: colors.textTertiary }]}>steps/day</Text>
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.statLabel, { color: colors.textTertiary }]}>Pace Status</Text>
                  <Text style={[styles.statValue, { color: '#30D158', fontSize: 18, marginTop: 4 }]}>
                    {steps >= stepGoal ? '⚡ Goal Crushed' : '🏃 On Track'}
                  </Text>
                </View>
              </View>

              {/* Bar Chart Svg */}
              <View style={styles.chartContainer}>
                <Svg width={CHART_W} height={CHART_H}>
                  {/* Target 10k Line */}
                  <Line
                    x1="0"
                    y1={CHART_H * (1 - stepGoal / (maxStepsInWeek || 12000))}
                    x2={CHART_W}
                    y2={CHART_H * (1 - stepGoal / (maxStepsInWeek || 12000))}
                    stroke="#f59e0b"
                    strokeWidth="1.5"
                    strokeDasharray="4 4"
                    strokeOpacity="0.4"
                  />

                  {stepHistoryDays.map((item, i) => {
                    const barW = CHART_W / 7 - 10;
                    const barX = i * (CHART_W / 7) + 5;
                    const barH = Math.max(6, (item.steps / (maxStepsInWeek || 12000)) * (CHART_H - 24));
                    const barY = CHART_H - barH - 18;
                    const isToday = i === 6;
                    const isGoalMet = item.steps >= stepGoal;

                    return (
                      <React.Fragment key={item.dateStr}>
                        <Rect
                          x={barX}
                          y={barY}
                          width={barW}
                          height={barH}
                          rx={5}
                          fill={isToday ? '#f59e0b' : isGoalMet ? '#30D158' : isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.12)'}
                        />
                        <SvgText
                          x={barX + barW / 2}
                          y={CHART_H - 4}
                          fontSize="10"
                          fill={isToday ? '#f59e0b' : colors.textMuted}
                          textAnchor="middle"
                          fontFamily={FONT_FAMILY.medium}
                        >
                          {item.dayLabel}
                        </SvgText>
                      </React.Fragment>
                    );
                  })}
                </Svg>
              </View>

              {/* SARA AI Tip */}
              <View style={[styles.tipBox, { backgroundColor: isDark ? 'rgba(0,0,0,0.3)' : colors.surface2, borderColor: colors.border }]}>
                <Ionicons name="sparkles" size={16} color="#f59e0b" />
                <Text style={[styles.tipText, { color: colors.textPrimary }]}>
                  {isAiThinking ? 'S.A.R.A is analyzing your movement...' : aiTip || defaultStepTip}
                </Text>
              </View>
            </GlassCard>

            {/* Daily Target Goal Selector */}
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Adjust Daily Step Target</Text>
            <View style={styles.goalPillsRow}>
              {[6000, 8000, 10000, 12000, 15000].map((goalVal) => {
                const isSelected = stepGoal === goalVal;
                return (
                  <TouchableOpacity
                    key={goalVal}
                    style={[
                      styles.goalPill,
                      {
                        backgroundColor: isSelected
                          ? '#f59e0b'
                          : isDark
                          ? '#1c1b29'
                          : '#FFFFFF',
                        borderColor: isSelected ? '#f59e0b' : colors.border,
                      },
                    ]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      updateGoal(goalVal);
                    }}
                  >
                    <Text
                      style={[
                        styles.goalPillText,
                        { color: isSelected ? '#000000' : colors.textPrimary },
                      ]}
                    >
                      {goalVal / 1000}k
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </Animated.View>
        )}

        {/* ── Tab 2: Hydration Intake ── */}
        {activeTab === 'water' && (
          <Animated.View style={{ opacity: mountAnim }}>
            <GlassCard style={styles.card} isDark={isDark} colors={colors}>
              <View style={styles.statRow}>
                <View>
                  <Text style={[styles.statLabel, { color: colors.textTertiary }]}>Today</Text>
                  <Text style={[styles.statValue, { color: colors.textPrimary }]}>
                    {todayWater} <Text style={[styles.statUnit, { color: colors.textTertiary }]}>ml</Text>
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.statLabel, { color: colors.textTertiary }]}>7-Day Avg</Text>
                  <Text style={[styles.statValue, { color: colors.textPrimary }]}>
                    {waterAvg} <Text style={[styles.statUnit, { color: colors.textTertiary }]}>ml</Text>
                  </Text>
                </View>
              </View>

              <View style={styles.chartContainer}>
                <Svg width={CHART_W} height={CHART_H}>
                  <Defs>
                    <SvgLinearGradient id="waterGrad" x1="0" y1="0" x2="0" y2="1">
                      <Stop offset="0%" stopColor={isDark ? '#00d2ff' : colors.accentBlue} stopOpacity={isDark ? 0.4 : 0.25} />
                      <Stop offset="100%" stopColor={isDark ? '#3a7bd5' : colors.accentBlue} stopOpacity={0} />
                    </SvgLinearGradient>
                    <SvgLinearGradient id="waterLineGrad" x1="0" y1="0" x2="1" y2="0">
                      <Stop offset="0%" stopColor={isDark ? '#3a7bd5' : colors.accentBlue} />
                      <Stop offset="100%" stopColor={isDark ? '#00d2ff' : '#0ea5e9'} />
                    </SvgLinearGradient>
                  </Defs>

                  {[0, 0.5, 1].map((r) => (
                    <Line
                      key={r}
                      x1="0"
                      y1={CHART_H * r}
                      x2={CHART_W}
                      y2={CHART_H * r}
                      stroke={isDark ? 'rgba(255,255,255,0.05)' : colors.border}
                      strokeWidth="1"
                    />
                  ))}

                  <Path d={waterAreaPath} fill="url(#waterGrad)" />
                  <AnimatedPath
                    d={waterPath}
                    fill="none"
                    stroke="url(#waterLineGrad)"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeDasharray={1000}
                    strokeDashoffset={pathAnim.interpolate({ inputRange: [0, 1], outputRange: [1000, 0] })}
                  />

                  {waterPts.map((p, i) => (
                    <Circle key={i} cx={p.x} cy={p.y} r="4" fill={isDark ? '#00d2ff' : colors.accentBlue} />
                  ))}
                </Svg>

                <View style={styles.xLabels}>
                  {days.map((d, i) => (
                    <Text key={i} style={[styles.xLabelText, { color: isDark ? 'rgba(255,255,255,0.6)' : colors.textPrimary }]}>
                      {getDayLabel(d)}
                    </Text>
                  ))}
                </View>
              </View>

              <View style={[styles.tipBox, { backgroundColor: isDark ? 'rgba(0,0,0,0.3)' : colors.surface2, borderColor: colors.border }]}>
                <Ionicons name="sparkles" size={16} color={colors.accentPrimary} />
                <Text style={[styles.tipText, { color: colors.textPrimary }]}>
                  {isAiThinking ? 'S.A.R.A is analyzing your hydration...' : aiTip || 'Great job staying hydrated today!'}
                </Text>
              </View>
            </GlassCard>
          </Animated.View>
        )}

        <View style={{ height: 80 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: any, isDark: boolean = true) =>
  StyleSheet.create({
    safeArea: { flex: 1 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SPACE.xl,
      paddingBottom: SPACE.md,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : colors.border,
    },
    backBtn: { padding: SPACE.xs, marginLeft: -SPACE.xs },
    refreshBtn: { padding: SPACE.xs, marginRight: -SPACE.xs },
    headerTitle: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.lg },
    scroll: { flex: 1 },
    scrollContent: { padding: SPACE.xl },
    tabBar: {
      flexDirection: 'row',
      borderRadius: RADIUS.lg,
      padding: 4,
      marginBottom: SPACE.lg,
    },
    tabItem: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 9,
      borderRadius: RADIUS.md,
    },
    tabItemActive: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 4,
      elevation: 3,
    },
    tabText: {
      fontFamily: FONT_FAMILY.medium,
      fontSize: FONT_SIZE.sm,
    },
    sectionTitle: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: FONT_SIZE.md,
      marginBottom: SPACE.sm,
      marginLeft: SPACE.xs,
    },
    card: {
      marginBottom: SPACE.lg,
    },
    heroRingContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      marginVertical: SPACE.sm,
    },
    ringCenterOverlay: {
      position: 'absolute',
      alignItems: 'center',
      justifyContent: 'center',
    },
    ringBigCount: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 28,
    },
    ringGoalLabel: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 10,
      letterSpacing: 0.8,
      marginTop: 2,
    },
    ringPctText: {
      fontFamily: FONT_FAMILY.body,
      fontSize: 11,
      marginTop: 2,
    },
    subMetricsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: SPACE.md,
      gap: 8,
    },
    subMetricBox: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 10,
      borderRadius: RADIUS.lg,
    },
    subMetricEmoji: {
      fontSize: 14,
      marginBottom: 3,
    },
    subMetricValue: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 13,
    },
    subMetricLabel: {
      fontFamily: FONT_FAMILY.body,
      fontSize: 10,
      marginTop: 1,
    },
    statRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: SPACE.md,
    },
    statLabel: {
      fontFamily: FONT_FAMILY.medium,
      fontSize: FONT_SIZE.xs,
      marginBottom: 2,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    statValue: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 24,
    },
    statUnit: {
      fontFamily: FONT_FAMILY.body,
      fontSize: FONT_SIZE.sm,
    },
    chartContainer: {
      marginBottom: SPACE.md,
    },
    xLabels: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: SPACE.xs,
    },
    xLabelText: {
      fontFamily: FONT_FAMILY.body,
      fontSize: 10,
    },
    tipBox: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: SPACE.md,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
    },
    tipText: {
      fontFamily: FONT_FAMILY.medium,
      fontSize: FONT_SIZE.xs,
      marginLeft: SPACE.sm,
      flex: 1,
      lineHeight: 18,
    },
    goalPillsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 6,
      marginBottom: SPACE.md,
    },
    goalPill: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 10,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
    },
    goalPillText: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 12,
    },
  });
