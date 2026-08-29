import React, { useEffect, useRef, useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions, TouchableOpacity, Animated, InteractionManager } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import Svg, { Path, Defs, LinearGradient as SvgLinearGradient, Stop, Rect, Text as SvgText, Line, Circle } from 'react-native-svg';
import { BlurView } from 'expo-blur';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '../contexts/ThemeContext';
import { useWellnessData } from '../contexts/domains/WellnessContext';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS } from '../theme/tokens';
import * as Haptics from 'expo-haptics';
import { callProxy } from '../services/geminiProxy';

import { formatLocalDateStr } from '../utils/dateUtils';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_PAD = 16;
const CHART_W = SCREEN_WIDTH - SPACE.xl * 2 - CARD_PAD * 2;
const CHART_H = 120;

// ─── Smooth bezier helper ─────────────────────────────────────────────────────
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  const d = [`M ${pts[0].x} ${pts[0].y}`];
  for (let i = 0; i < pts.length - 1; i++) {
    const p1 = pts[i], p2 = pts[i + 1];
    const cpX = (p1.x + p2.x) / 2;
    d.push(`C ${cpX} ${p1.y}, ${cpX} ${p2.y}, ${p2.x} ${p2.y}`);
  }
  return d.join(' ');
}

// ─── Date helpers ─────────────────────────────────────────────────────────────
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

// ─── Animated SVG Path ─────────────────────────────────────────────────────
const AnimatedPath = Animated.createAnimatedComponent(Path);

// ─── GlassCard ───────────────────────────────────────────────────────────────
function GlassCard({ children, style, isDark, colors }: { children?: React.ReactNode; style?: any; isDark: boolean; colors: any }) {
  if (isDark) {
    return (
      <BlurView intensity={55} tint="dark" style={[{
        borderRadius: RADIUS.xl, padding: CARD_PAD,
        borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
        overflow: 'hidden', backgroundColor: 'rgba(20, 20, 25, 0.4)',
      }, style]}>
        {children}
      </BlurView>
    );
  }
  return (
    <View style={[{
      borderRadius: RADIUS.xl, padding: CARD_PAD,
      borderWidth: 1, borderColor: colors.border,
      overflow: 'hidden', backgroundColor: colors.surface,
    }, style]}>
      {children}
    </View>
  );
}

export default function WellbeingDashboardScreen() {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const navigation = useNavigation<any>();
  const { waterLogs, ensureSubscribed } = useWellnessData();

  useEffect(() => {
    const handle = InteractionManager.runAfterInteractions(() => ensureSubscribed?.());
    return () => handle.cancel();
  }, [ensureSubscribed]);

  // Animation values
  const mountAnim = useRef(new Animated.Value(0)).current;
  const pathAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(mountAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(pathAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
    ]).start();
  }, []);

  const days = useMemo(() => getPast7Days(), []);
  const todayStr = days[days.length - 1];

  // ─── Water Data ────────────────────────────────────────────────────────────
  const waterData = useMemo(() => {
    return days.map(date => {
      const dayLogs = (waterLogs || []).filter(w => w.date === date);
      return dayLogs.reduce((sum, log) => sum + (log.amountMl || 0), 0);
    });
  }, [waterLogs, days]);

  const maxWater = Math.max(...waterData, 2500); // at least 2500 scale
  const waterAvg = Math.round(waterData.reduce((a, b) => a + b, 0) / 7);
  const todayWater = waterData[waterData.length - 1];
  
  const waterPts = waterData.map((val, i) => ({
    x: (i / (days.length - 1)) * CHART_W,
    y: CHART_H - (val / maxWater) * CHART_H,
  }));
  const waterPath = smoothPath(waterPts);
  const waterAreaPath = `${waterPath} L ${CHART_W} ${CHART_H} L 0 ${CHART_H} Z`;

  const [aiWaterTip, setAiWaterTip] = useState<string | null>(null);
  const [isAiThinking, setIsAiThinking] = useState<boolean>(true);

  // Fetch AI insights (cached per-day in AsyncStorage)
  useEffect(() => {
    let isMounted = true;
    async function fetchAiInsights() {
      const cacheKey = `@zentrack_daily_water_tip_${todayStr}`;
      try {
        const cached = await AsyncStorage.getItem(cacheKey);
        if (cached && isMounted) {
          setAiWaterTip(cached);
          setIsAiThinking(false);
          return;
        }
      } catch {}

      setIsAiThinking(true);
      try {
        const prompt = `
You are S.A.R.A, a high-performance wellness coach AI.
Analyze the user's last 7 days of water logs and provide one short, punchy tip.
Format your response as a JSON object: {"waterTip": "..."}.
Do not include any markdown formatting, just pure JSON.

Water Data (ml per day): ${JSON.stringify(waterData)}
`;
        const resp = await callProxy({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json' }
        });
        
        const rawText = resp.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawText && isMounted) {
          const parsed = JSON.parse(rawText);
          if (parsed.waterTip) {
            setAiWaterTip(parsed.waterTip);
            AsyncStorage.setItem(cacheKey, parsed.waterTip).catch(() => {});
          }
        }
      } catch (e) {
        console.error('Error fetching wellbeing AI insights', e);
      } finally {
        if (isMounted) setIsAiThinking(false);
      }
    }
    fetchAiInsights();
    return () => { isMounted = false; };
  }, [todayStr]);

  const waterTip = aiWaterTip || (todayWater < 2500 
    ? `You're ${2500 - todayWater}ml away from optimal hydration. Drink a glass now!` 
    : "Great job staying hydrated today!");

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top']}>
      <StatusBar style={isDark ? 'light' : 'dark'} backgroundColor={colors.background} />
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={28} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Wellbeing</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        
        {/* Water Intake Section */}
        <Animated.View style={{ opacity: mountAnim, transform: [{ translateY: mountAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Water Intake</Text>
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
                    <Stop offset="0%" stopColor={isDark ? "#00d2ff" : colors.accentBlue} stopOpacity={isDark ? 0.4 : 0.25} />
                    <Stop offset="100%" stopColor={isDark ? "#3a7bd5" : colors.accentBlue} stopOpacity={0} />
                  </SvgLinearGradient>
                  <SvgLinearGradient id="waterLineGrad" x1="0" y1="0" x2="1" y2="0">
                    <Stop offset="0%" stopColor={isDark ? "#3a7bd5" : colors.accentBlue} />
                    <Stop offset="100%" stopColor={isDark ? "#00d2ff" : "#0ea5e9"} />
                  </SvgLinearGradient>
                </Defs>
                
                {/* Grid lines */}
                {[0, 0.5, 1].map(r => (
                  <Line key={r} x1="0" y1={CHART_H * r} x2={CHART_W} y2={CHART_H * r} stroke={isDark ? "rgba(255,255,255,0.05)" : colors.border} strokeWidth="1" />
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
                
                {/* Data points */}
                {waterPts.map((p, i) => (
                  <Circle key={i} cx={p.x} cy={p.y} r="4" fill={isDark ? "#00d2ff" : colors.accentBlue} />
                ))}
              </Svg>

              <View style={styles.xLabels}>
                {days.map((d, i) => (
                  <Text key={i} style={[styles.xLabelText, { color: isDark ? 'rgba(255,255,255,0.6)' : colors.textPrimary }]}>{getDayLabel(d)}</Text>
                ))}
              </View>
            </View>

            <View style={[styles.tipBox, { backgroundColor: isDark ? 'rgba(0,0,0,0.3)' : colors.surface2, borderColor: colors.border }]}>
              <Ionicons name="sparkles" size={16} color={colors.accentPrimary} />
              <Text style={[styles.tipText, { color: colors.textPrimary }]}>
                {isAiThinking ? 'S.A.R.A is analyzing your hydration...' : waterTip}
              </Text>
            </View>
          </GlassCard>
        </Animated.View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: any, isDark: boolean = true) => StyleSheet.create({
  safeArea: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACE.xl, paddingBottom: SPACE.md,
    borderBottomWidth: 1, borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : colors.border,
  },
  backBtn: { padding: SPACE.xs, marginLeft: -SPACE.xs },
  headerTitle: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.lg },
  scroll: { flex: 1 },
  scrollContent: { padding: SPACE.xl },
  sectionTitle: {
    fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.xl,
    marginBottom: SPACE.md, marginLeft: SPACE.xs,
  },
  glassCardDark: {
    borderRadius: RADIUS.xl, padding: CARD_PAD,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden', backgroundColor: 'rgba(20, 20, 25, 0.4)',
  },
  glassCardLight: {
    borderRadius: RADIUS.xl, padding: CARD_PAD,
    borderWidth: 1, borderColor: colors.border,
    overflow: 'hidden', backgroundColor: colors.surface,
  },
  card: {
    marginBottom: SPACE.md,
  },
  statRow: {
    flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACE.xl,
  },
  statLabel: {
    fontFamily: FONT_FAMILY.medium, fontSize: FONT_SIZE.xs,
    marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1,
  },
  statValue: {
    fontFamily: FONT_FAMILY.bold, fontSize: 32,
  },
  statUnit: {
    fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm,
  },
  chartContainer: {
    marginBottom: SPACE.lg,
  },
  xLabels: {
    flexDirection: 'row', justifyContent: 'space-between', marginTop: SPACE.sm,
  },
  xLabelText: {
    fontFamily: FONT_FAMILY.body, fontSize: 10,
  },
  tipBox: {
    flexDirection: 'row', alignItems: 'center',
    padding: SPACE.md, borderRadius: RADIUS.lg, borderWidth: 1,
  },
  tipText: {
    fontFamily: FONT_FAMILY.medium, fontSize: FONT_SIZE.sm,
    marginLeft: SPACE.md, flex: 1, lineHeight: 20,
  }
});
