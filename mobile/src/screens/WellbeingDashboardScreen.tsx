/**
 * WellbeingDashboardScreen.tsx — ZenTrack Hydration & Physical Vitality Hub
 * High-performance, edge-to-edge Obsidian Cosmos design with 7-Day Hydration trends,
 * intake analytics, and on-demand S.A.R.A Intelligence.
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
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import Svg, {
  Path,
  Defs,
  LinearGradient as SvgLinearGradient,
  Stop,
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

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SCREEN_PAD = 12;
const CARD_PAD = 16;
const CHART_W = SCREEN_WIDTH - SCREEN_PAD * 2 - CARD_PAD * 2;
const CHART_H = 140;

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

  const { waterLogs, ensureSubscribed } = useWellnessData();

  // SARA AI On-Demand Coaching State
  const [aiTip, setAiTip] = useState<string | null>(null);
  const [isAiThinking, setIsAiThinking] = useState<boolean>(false);

  useEffect(() => {
    const handle = InteractionManager.runAfterInteractions(() => ensureSubscribed?.());
    return () => handle.cancel();
  }, [ensureSubscribed]);

  const days = useMemo(() => getPast7Days(), []);
  const todayStr = days[days.length - 1];

  // ─── Water Metrics ────────────────────────────────────────────────────────
  const waterData = useMemo(() => {
    return days.map((date) => {
      const dayLogs = (waterLogs || []).filter((w) => w.date === date);
      return dayLogs.reduce((sum, log) => sum + (log.amountMl || 0), 0);
    });
  }, [waterLogs, days]);

  const waterGoal = 2500; // Standard 2.5L target
  const maxWater = Math.max(...waterData, waterGoal);
  const waterAvg = Math.round(waterData.reduce((a, b) => a + b, 0) / 7);
  const todayWater = waterData[waterData.length - 1];
  const waterProgress = Math.min(1, todayWater / waterGoal);

  // Load cached AI tip on mount
  useEffect(() => {
    AsyncStorage.getItem(`@zentrack_daily_tip_${todayStr}_water`)
      .then((cached) => {
        if (cached) setAiTip(cached);
      })
      .catch(() => {});
  }, [todayStr]);

  // ─── S.A.R.A On-Demand Hydration Analysis ─────────────────────────────────
  const triggerAiAnalysis = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsAiThinking(true);
    const cacheKey = `@zentrack_daily_tip_${todayStr}_water`;

    try {
      const prompt = `You are S.A.R.A, a high-performance wellness and biohacking AI coach in ZenTrack.
Analyze the user's hydration metrics:
- Today's intake: ${todayWater} ml / ${waterGoal} ml target (${Math.round(waterProgress * 100)}%)
- 7-Day average: ${waterAvg} ml/day
Respond with a strict single JSON object format:
{"coaching_tip": "Your punchy, scientifically grounded 1-2 sentence hydration advice here"}
Do NOT output markdown code fences or any other text.`;

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
        todayWater >= waterGoal
          ? '💧 Optimal cellular hydration achieved! Peak cognitive velocity unlocked.'
          : `💧 ${(waterGoal - todayWater).toLocaleString()} ml remaining to reach your optimal 2.5L hydration target.`
      );
    } finally {
      setIsAiThinking(false);
    }
  }, [todayStr, todayWater, waterAvg, waterGoal, waterProgress]);

  const waterPts = waterData.map((val, i) => ({
    x: (i / (days.length - 1)) * CHART_W,
    y: CHART_H - (val / maxWater) * (CHART_H - 24) - 12,
  }));
  const waterPath = smoothPath(waterPts);
  const waterAreaPath = `${waterPath} L ${CHART_W} ${CHART_H} L 0 ${CHART_H} Z`;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top']}>
      <StatusBar style={isDark ? 'light' : 'dark'} backgroundColor={colors.background} />

      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Hydration Analytics</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero Status Card ── */}
        <ObsidianCard isDark={isDark} colors={colors} style={styles.card}>
          <View style={styles.heroRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.heroLabel, { color: colors.accentBlue }]}>TODAY'S HYDRATION</Text>
              <Text style={[styles.heroBigValue, { color: colors.textPrimary }]}>
                {(todayWater / 1000).toFixed(1)} <Text style={[styles.heroUnit, { color: colors.textMuted }]}>/ {(waterGoal / 1000).toFixed(1)} L</Text>
              </Text>
              <Text style={[styles.heroSubtext, { color: colors.textMuted }]}>
                {todayWater >= waterGoal ? '🎉 Daily target met' : `${((waterGoal - todayWater) / 1000).toFixed(1)} L to target`}
              </Text>
            </View>
            <View style={[styles.pctBadge, { backgroundColor: isDark ? 'rgba(14, 165, 233, 0.15)' : 'rgba(14, 165, 233, 0.1)' }]}>
              <Text style={[styles.pctText, { color: colors.accentBlue }]}>
                {Math.round(waterProgress * 100)}%
              </Text>
            </View>
          </View>

          {/* Progress Bar */}
          <View style={[styles.progressBarTrack, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }]}>
            <View
              style={[
                styles.progressBarFill,
                {
                  width: `${Math.min(100, Math.round(waterProgress * 100))}%`,
                  backgroundColor: colors.accentBlue,
                },
              ]}
            />
          </View>
        </ObsidianCard>

        {/* ── 7-Day Trend Card ── */}
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>7-Day Intake Trend</Text>
        <ObsidianCard style={styles.card} isDark={isDark} colors={colors}>
          <View style={styles.statRow}>
            <View>
              <Text style={[styles.statLabel, { color: colors.textTertiary }]}>7-Day Average</Text>
              <Text style={[styles.statValue, { color: colors.textPrimary }]}>
                {waterAvg} <Text style={[styles.statUnit, { color: colors.textTertiary }]}>ml/day</Text>
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[styles.statLabel, { color: colors.textTertiary }]}>Target Status</Text>
              <Text style={[styles.statValue, { color: todayWater >= waterGoal ? '#32D74B' : colors.accentBlue, fontSize: 16, marginTop: 4 }]}>
                {todayWater >= waterGoal ? '⚡ Target Hit' : '💧 In Progress'}
              </Text>
            </View>
          </View>

          {/* Chart */}
          <View style={styles.chartContainer}>
            <Svg width={CHART_W} height={CHART_H}>
              <Defs>
                <SvgLinearGradient id="waterGrad" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0%" stopColor={isDark ? '#00d2ff' : colors.accentBlue} stopOpacity={isDark ? 0.35 : 0.2} />
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

          {/* ── S.A.R.A Hydration Tip ── */}
          {aiTip ? (
            <View style={[styles.tipBox, { backgroundColor: isDark ? '#1C1B2B' : '#F6F5FB', borderColor: isDark ? 'rgba(165,153,255,0.2)' : colors.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="sparkles" size={15} color="#0ea5e9" />
                  <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 12, color: '#0ea5e9' }}>S.A.R.A Hydration Coaching</Text>
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
                    Analyzing hydration trends...
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

        <View style={{ height: 40 }} />
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
      paddingHorizontal: 16,
      paddingBottom: SPACE.sm,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : colors.border,
    },
    backBtn: { padding: 4 },
    headerTitle: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.lg },
    scroll: { flex: 1 },
    scrollContent: {
      paddingHorizontal: SCREEN_PAD,
      paddingTop: 12,
      paddingBottom: 40,
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
    heroRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    heroLabel: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 10,
      letterSpacing: 1.2,
      marginBottom: 4,
    },
    heroBigValue: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 28,
    },
    heroUnit: {
      fontFamily: FONT_FAMILY.medium,
      fontSize: 14,
    },
    heroSubtext: {
      fontFamily: FONT_FAMILY.body,
      fontSize: 12,
      marginTop: 2,
    },
    pctBadge: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: RADIUS.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pctText: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 18,
    },
    progressBarTrack: {
      height: 8,
      borderRadius: 4,
      overflow: 'hidden',
    },
    progressBarFill: {
      height: '100%',
      borderRadius: 4,
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
      marginBottom: 12,
    },
    xLabels: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 6,
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
  });