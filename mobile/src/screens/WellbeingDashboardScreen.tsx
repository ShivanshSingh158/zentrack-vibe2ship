/**
 * WellbeingDashboardScreen.tsx — ZenTrack Physical Vitality & Movement Hub
 * High-performance, edge-to-edge Obsidian Cosmos design with native Step Counter,
 * 7-Day movement trends, Hydration tracking, and on-demand S.A.R.A Intelligence.
 */

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Dimensions,
  TouchableOpacity,
  InteractionManager,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
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
} from '../hooks/useStepCounter';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SCREEN_PAD = 6;
const CARD_PAD = 14;
const CHART_W = SCREEN_WIDTH - SCREEN_PAD * 2 - CARD_PAD * 2;
const CHART_H = 135;

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

// ─── Lag-Free High Performance Obsidian Card ─────────────────────────────────
function ObsidianCard({
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
  return (
    <View
      style={[
        {
          borderRadius: 20,
          padding: CARD_PAD,
          borderWidth: 1,
          borderColor: isDark ? 'rgba(165, 153, 255, 0.12)' : colors.border,
          backgroundColor: isDark ? '#13121D' : colors.surface,
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: isDark ? 0.25 : 0.05,
          shadowRadius: 10,
          elevation: 3,
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

  const [showCustomGoalModal, setShowCustomGoalModal] = useState(false);
  const [customGoalInput, setCustomGoalInput] = useState(String(stepGoal));

  // SARA AI On-Demand Coaching State
  const [aiTip, setAiTip] = useState<string | null>(null);
  const [isAiThinking, setIsAiThinking] = useState<boolean>(false);

  useEffect(() => {
    const handle = InteractionManager.runAfterInteractions(() => ensureSubscribed?.());
    return () => handle.cancel();
  }, [ensureSubscribed]);

  const days = useMemo(() => getPast7Days(), []);
  const todayStr = days[days.length - 1];

  // Load cached AI tip on mount
  useEffect(() => {
    AsyncStorage.getItem(`@zentrack_daily_tip_${todayStr}_${activeTab}`)
      .then((cached) => {
        if (cached) setAiTip(cached);
      })
      .catch(() => {});
  }, [todayStr, activeTab]);

  const handleOpenCustomGoal = () => {
    setCustomGoalInput(String(stepGoal));
    setShowCustomGoalModal(true);
  };

  const handleSaveCustomGoal = () => {
    const parsed = parseInt(customGoalInput.replace(/[^0-9]/g, ''), 10);
    if (!isNaN(parsed) && parsed >= 500 && parsed <= 100000) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      updateGoal(parsed);
      setShowCustomGoalModal(false);
    }
  };

  // ─── S.A.R.A On-Demand Analysis Trigger ──────────────────────────────────────
  const triggerAiAnalysis = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsAiThinking(true);
    const cacheKey = `@zentrack_daily_tip_${todayStr}_${activeTab}`;

    try {
      const prompt =
        activeTab === 'steps'
          ? `You are S.A.R.A, a high-performance biohacking & movement AI coach.
Analyze the user's daily movement: ${steps} steps taken out of a ${stepGoal} daily goal.
Respond with a strict single JSON object format:
{"coaching_tip": "Your punchy 1-2 sentence actionable coaching advice here"}
Do NOT output markdown code fences or other text.`
          : `You are S.A.R.A, a wellness coach AI.
Analyze the user's hydration.
Respond with a strict single JSON object format:
{"coaching_tip": "Your punchy 1-2 sentence hydration advice here"}
Do NOT output markdown code fences or other text.`;

      const resp = await callProxy({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' },
      });

      const rawText = resp.candidates?.[0]?.content?.parts?.[0]?.text;
      if (rawText) {
        let extractedTip = '';
        try {
          const clean = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
          const parsed = JSON.parse(clean);
          extractedTip = parsed.coaching_tip || parsed.tip || parsed.text || clean;
        } catch {
          const match = rawText.match(/"coaching_tip"\s*:\s*"([^"]+)"/);
          extractedTip = match ? match[1] : rawText.replace(/[{}"\\]/g, '').trim();
        }

        if (extractedTip) {
          setAiTip(extractedTip);
          await AsyncStorage.setItem(cacheKey, extractedTip).catch(() => {});
        }
      }
    } catch (e) {
      console.warn('[Wellbeing] AI Analysis error:', e);
      setAiTip(
        steps >= stepGoal
          ? '🔥 Target achieved! Active walking keeps your metabolic rate elevated.'
          : `🏃 ${(stepGoal - steps).toLocaleString()} steps remaining to hit your daily goal.`
      );
    } finally {
      setIsAiThinking(false);
    }
  }, [todayStr, activeTab, steps, stepGoal]);

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

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top']}>
      <StatusBar style={isDark ? 'light' : 'dark'} backgroundColor={colors.background} />

      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Physical Vitality</Text>
        <TouchableOpacity
          style={styles.refreshBtn}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            refreshSteps();
          }}
          hitSlop={12}
        >
          <Ionicons name="refresh-outline" size={20} color={colors.accentPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Segmented Tab Switcher (Full Width) ── */}
        <View style={[styles.tabBar, { backgroundColor: isDark ? '#171622' : '#EFEFF4' }]}>
          <TouchableOpacity
            style={[
              styles.tabItem,
              activeTab === 'steps' && [
                styles.tabItemActive,
                { backgroundColor: isDark ? '#262438' : '#FFFFFF' },
              ],
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setActiveTab('steps');
            }}
          >
            <Text style={{ fontSize: 14, marginRight: 6 }}>🚶</Text>
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
            style={[
              styles.tabItem,
              activeTab === 'water' && [
                styles.tabItemActive,
                { backgroundColor: isDark ? '#262438' : '#FFFFFF' },
              ],
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setActiveTab('water');
            }}
          >
            <Text style={{ fontSize: 14, marginRight: 6 }}>💧</Text>
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

        {/* ── TAB 1: STEPS & MOVEMENT ── */}
        {activeTab === 'steps' && (
          <View>
            {/* Hero Radial Ring Card */}
            <ObsidianCard isDark={isDark} colors={colors} style={styles.card}>
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
            </ObsidianCard>

            {/* 7-Day Movement Bar Chart */}
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>7-Day Movement Trend</Text>
            <ObsidianCard isDark={isDark} colors={colors} style={styles.card}>
              <View style={styles.statRow}>
                <View>
                  <Text style={[styles.statLabel, { color: colors.textTertiary }]}>7-Day Average</Text>
                  <Text style={[styles.statValue, { color: colors.textPrimary }]}>
                    {stepAvg.toLocaleString()} <Text style={[styles.statUnit, { color: colors.textTertiary }]}>steps/day</Text>
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.statLabel, { color: colors.textTertiary }]}>Pace Status</Text>
                  <Text style={[styles.statValue, { color: '#30D158', fontSize: 16, marginTop: 4 }]}>
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
                    const colW = CHART_W / 7;
                    const barW = colW - 8;
                    const barX = i * colW + 4;
                    const barH = Math.max(6, (item.steps / (maxStepsInWeek || 12000)) * (CHART_H - 26));
                    const barY = CHART_H - barH - 20;
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
                          fill={
                            isToday
                              ? '#f59e0b'
                              : isGoalMet
                              ? '#30D158'
                              : isDark
                              ? 'rgba(255,255,255,0.18)'
                              : 'rgba(0,0,0,0.12)'
                          }
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

              {/* ── S.A.R.A On-Demand Intelligence Button / Card ── */}
              {aiTip ? (
                <View style={[styles.tipBox, { backgroundColor: isDark ? '#1C1B2B' : '#F6F5FB', borderColor: isDark ? 'rgba(165,153,255,0.2)' : colors.border }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="sparkles" size={15} color="#f59e0b" />
                      <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 12, color: '#f59e0b' }}>S.A.R.A Coaching</Text>
                    </View>
                    <TouchableOpacity onPress={triggerAiAnalysis} hitSlop={10} disabled={isAiThinking}>
                      {isAiThinking ? (
                        <ActivityIndicator size="small" color="#f59e0b" />
                      ) : (
                        <Ionicons name="refresh" size={14} color={colors.textMuted} />
                      )}
                    </TouchableOpacity>
                  </View>
                  <Text style={[styles.tipText, { color: colors.textPrimary }]}>
                    "{aiTip}"
                  </Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={[
                    styles.aiAnalyzeBtn,
                    { backgroundColor: isDark ? '#1C1A2E' : '#F2F1FA', borderColor: isDark ? 'rgba(165,153,255,0.25)' : colors.border },
                  ]}
                  onPress={triggerAiAnalysis}
                  disabled={isAiThinking}
                >
                  {isAiThinking ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <ActivityIndicator size="small" color="#f59e0b" />
                      <Text style={{ fontFamily: FONT_FAMILY.medium, fontSize: 13, color: '#f59e0b' }}>
                        Analyzing movement biomechanics...
                      </Text>
                    </View>
                  ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Ionicons name="sparkles" size={16} color="#f59e0b" />
                      <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 13, color: colors.textPrimary }}>
                        Ask S.A.R.A for Movement Analysis
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              )}
            </ObsidianCard>

            {/* Daily Target Goal Selector */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACE.sm, marginLeft: 2, marginRight: 2 }}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginBottom: 0, marginLeft: 0 }]}>Adjust Daily Step Target</Text>
              <TouchableOpacity onPress={handleOpenCustomGoal} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Ionicons name="pencil" size={13} color="#f59e0b" />
                <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 12, color: '#f59e0b' }}>Custom</Text>
              </TouchableOpacity>
            </View>

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
                        borderColor: isSelected ? '#f59e0b' : isDark ? 'rgba(255,255,255,0.08)' : colors.border,
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
              <TouchableOpacity
                style={[
                  styles.goalPill,
                  {
                    backgroundColor: ![6000, 8000, 10000, 12000, 15000].includes(stepGoal)
                      ? '#f59e0b'
                      : isDark
                      ? '#1c1b29'
                      : '#FFFFFF',
                    borderColor: ![6000, 8000, 10000, 12000, 15000].includes(stepGoal) ? '#f59e0b' : isDark ? 'rgba(255,255,255,0.08)' : colors.border,
                  },
                ]}
                onPress={handleOpenCustomGoal}
              >
                <Text
                  style={[
                    styles.goalPillText,
                    { color: ![6000, 8000, 10000, 12000, 15000].includes(stepGoal) ? '#000000' : colors.textPrimary },
                  ]}
                >
                  {![6000, 8000, 10000, 12000, 15000].includes(stepGoal) ? `${(stepGoal / 1000).toFixed(1)}k` : '✏️'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── TAB 2: HYDRATION INTAKE ── */}
        {activeTab === 'water' && (
          <View>
            <ObsidianCard style={styles.card} isDark={isDark} colors={colors}>
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
                  <Path
                    d={waterPath}
                    fill="none"
                    stroke="url(#waterLineGrad)"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
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

              {/* SARA Hydration Tip */}
              {aiTip ? (
                <View style={[styles.tipBox, { backgroundColor: isDark ? '#1C1B2B' : '#F6F5FB', borderColor: isDark ? 'rgba(165,153,255,0.2)' : colors.border }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="sparkles" size={15} color="#0ea5e9" />
                      <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 12, color: '#0ea5e9' }}>S.A.R.A Hydration</Text>
                    </View>
                    <TouchableOpacity onPress={triggerAiAnalysis} hitSlop={10} disabled={isAiThinking}>
                      {isAiThinking ? (
                        <ActivityIndicator size="small" color="#0ea5e9" />
                      ) : (
                        <Ionicons name="refresh" size={14} color={colors.textMuted} />
                      )}
                    </TouchableOpacity>
                  </View>
                  <Text style={[styles.tipText, { color: colors.textPrimary }]}>
                    "{aiTip}"
                  </Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={[
                    styles.aiAnalyzeBtn,
                    { backgroundColor: isDark ? '#1A222E' : '#F0F8FF', borderColor: isDark ? 'rgba(14,165,233,0.25)' : colors.border },
                  ]}
                  onPress={triggerAiAnalysis}
                  disabled={isAiThinking}
                >
                  {isAiThinking ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <ActivityIndicator size="small" color="#0ea5e9" />
                      <Text style={{ fontFamily: FONT_FAMILY.medium, fontSize: 13, color: '#0ea5e9' }}>
                        Analyzing hydration data...
                      </Text>
                    </View>
                  ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Ionicons name="sparkles" size={16} color="#0ea5e9" />
                      <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 13, color: colors.textPrimary }}>
                        Ask S.A.R.A for Hydration Coaching
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              )}
            </ObsidianCard>
          </View>
        )}

        <View style={{ height: 60 }} />
      </ScrollView>

      {/* ── Custom Goal Modal ── */}
      <Modal
        visible={showCustomGoalModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowCustomGoalModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 20,
          }}
        >
          <View
            style={{
              width: '100%',
              maxWidth: 340,
              backgroundColor: isDark ? '#161524' : '#FFFFFF',
              borderRadius: 22,
              padding: 22,
              borderWidth: 1,
              borderColor: isDark ? 'rgba(165, 153, 255, 0.20)' : 'rgba(0, 0, 0, 0.08)',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 10 },
              shadowOpacity: 0.35,
              shadowRadius: 20,
              elevation: 15,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
              <Text style={{ fontSize: 20, marginRight: 8 }}>🎯</Text>
              <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 18, color: colors.textPrimary }}>
                Set Custom Step Goal
              </Text>
            </View>

            <Text style={{ fontFamily: FONT_FAMILY.body, fontSize: 13, color: colors.textMuted, marginBottom: 16 }}>
              Enter your personalized daily target for active walking and wellness:
            </Text>

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: isDark ? '#0f0e18' : '#F5F4F9',
                borderRadius: 14,
                paddingHorizontal: 16,
                paddingVertical: 12,
                marginBottom: 16,
                borderWidth: 1,
                borderColor: '#f59e0b',
              }}
            >
              <TextInput
                style={{
                  flex: 1,
                  fontFamily: FONT_FAMILY.bold,
                  fontSize: 22,
                  color: colors.textPrimary,
                }}
                keyboardType="number-pad"
                value={customGoalInput}
                onChangeText={setCustomGoalInput}
                placeholder="e.g. 7500"
                placeholderTextColor={colors.textMuted}
                autoFocus
                selectTextOnFocus
              />
              <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 14, color: '#f59e0b' }}>
                STEPS
              </Text>
            </View>

            {/* Quick Stepper Controls */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20, gap: 8 }}>
              <TouchableOpacity
                style={{
                  flex: 1,
                  backgroundColor: isDark ? '#232136' : '#ECEBF2',
                  borderRadius: 10,
                  paddingVertical: 9,
                  alignItems: 'center',
                }}
                onPress={() => {
                  const cur = parseInt(customGoalInput.replace(/[^0-9]/g, ''), 10) || stepGoal;
                  setCustomGoalInput(String(Math.max(500, cur - 1000)));
                }}
              >
                <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 13, color: colors.textPrimary }}>-1,000</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{
                  flex: 1,
                  backgroundColor: isDark ? '#232136' : '#ECEBF2',
                  borderRadius: 10,
                  paddingVertical: 9,
                  alignItems: 'center',
                }}
                onPress={() => {
                  const cur = parseInt(customGoalInput.replace(/[^0-9]/g, ''), 10) || stepGoal;
                  setCustomGoalInput(String(Math.min(100000, cur + 1000)));
                }}
              >
                <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 13, color: colors.textPrimary }}>+1,000</Text>
              </TouchableOpacity>
            </View>

            {/* Action Buttons */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 12,
                  backgroundColor: isDark ? '#232136' : '#E8E7EE',
                  alignItems: 'center',
                }}
                onPress={() => setShowCustomGoalModal(false)}
              >
                <Text style={{ fontFamily: FONT_FAMILY.medium, fontSize: 14, color: colors.textMuted }}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 12,
                  backgroundColor: '#f59e0b',
                  alignItems: 'center',
                }}
                onPress={handleSaveCustomGoal}
              >
                <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 14, color: '#000000' }}>Save Target</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
      paddingHorizontal: 16,
      paddingBottom: SPACE.sm,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : colors.border,
    },
    backBtn: { padding: 4 },
    refreshBtn: { padding: 4 },
    headerTitle: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.lg },
    scroll: { flex: 1 },
    scrollContent: {
      paddingHorizontal: SCREEN_PAD,
      paddingTop: 8,
      paddingBottom: 40,
    },
    tabBar: {
      flexDirection: 'row',
      borderRadius: RADIUS.lg,
      padding: 4,
      marginBottom: 12,
      marginHorizontal: 2,
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
      marginBottom: 8,
      marginLeft: 4,
    },
    card: {
      marginBottom: 14,
    },
    heroRingContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      marginVertical: 4,
    },
    ringCenterOverlay: {
      position: 'absolute',
      alignItems: 'center',
      justifyContent: 'center',
    },
    ringBigCount: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 32,
    },
    ringGoalLabel: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 11,
      letterSpacing: 0.8,
      marginTop: 2,
    },
    ringPctText: {
      fontFamily: FONT_FAMILY.body,
      fontSize: 12,
      marginTop: 2,
    },
    subMetricsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 14,
      gap: 8,
    },
    subMetricBox: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 10,
      borderRadius: RADIUS.lg,
    },
    subMetricEmoji: {
      fontSize: 15,
      marginBottom: 2,
    },
    subMetricValue: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 14,
    },
    subMetricLabel: {
      fontFamily: FONT_FAMILY.body,
      fontSize: 10,
      marginTop: 1,
    },
    statRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 10,
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
      fontSize: 22,
    },
    statUnit: {
      fontFamily: FONT_FAMILY.body,
      fontSize: FONT_SIZE.sm,
    },
    chartContainer: {
      marginBottom: 10,
    },
    xLabels: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 2,
    },
    xLabelText: {
      fontFamily: FONT_FAMILY.body,
      fontSize: 10,
    },
    tipBox: {
      padding: 12,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      marginTop: 4,
    },
    tipText: {
      fontFamily: FONT_FAMILY.medium,
      fontSize: 13,
      lineHeight: 19,
      fontStyle: 'italic',
    },
    aiAnalyzeBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      marginTop: 4,
    },
    goalPillsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 5,
      marginBottom: 16,
      marginHorizontal: 2,
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
