import React, { useEffect, useRef, useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions, TouchableOpacity, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import Svg, { Path, Defs, LinearGradient as SvgLinearGradient, Stop, Rect, Text as SvgText, Line, Circle } from 'react-native-svg';
import { BlurView } from 'expo-blur';
import { useTheme } from '../contexts/ThemeContext';
import { useMobileData } from '../contexts/MobileDataContext';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS } from '../theme/tokens';
import * as Haptics from 'expo-haptics';
import { callProxy } from '../services/geminiProxy';

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
  return d.toISOString().slice(0, 10);
}

function getPast7Days(): string[] {
  return Array.from({ length: 7 }, (_, i) => daysAgoStr(6 - i));
}

function getDayLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days[d.getDay()];
}

// ─── Animated SVG Path ─────────────────────────────────────────────────────
const AnimatedPath = Animated.createAnimatedComponent(Path);

// ─── GlassCard ───────────────────────────────────────────────────────────────
function GlassCard({ children, style }: { children?: React.ReactNode; style?: any }) {
  return (
    <BlurView intensity={55} tint="dark" style={[styles.glassCard, style]}>
      {children}
    </BlurView>
  );
}

export default function WellbeingDashboardScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<any>();
  const { waterLogs, sleepLogs } = useMobileData();

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

  // ─── Sleep Data ────────────────────────────────────────────────────────────
  const sleepData = useMemo(() => {
    return days.map(date => {
      const dayLogs = (sleepLogs || []).filter(s => s.date === date);
      return dayLogs.reduce((sum, log) => sum + (log.hours || 0), 0);
    });
  }, [sleepLogs, days]);

  const maxSleep = Math.max(...sleepData, 8); // at least 8 hours scale
  const sleepAvg = (sleepData.reduce((a, b) => a + b, 0) / 7).toFixed(1);

  // AI Recommendations State
  const [aiWaterTip, setAiWaterTip] = useState<string | null>(null);
  const [aiSleepTip, setAiSleepTip] = useState<string | null>(null);
  const [isAiThinking, setIsAiThinking] = useState<boolean>(true);

  // Fetch AI insights
  useEffect(() => {
    async function fetchAiInsights() {
      setIsAiThinking(true);
      try {
        const prompt = `
You are S.A.R.A, a high-performance wellness coach AI.
Analyze the user's last 7 days of water and sleep logs and provide one short, punchy tip for each.
Format your response as a JSON object: {"waterTip": "...", "sleepTip": "..."}.
Do not include any markdown formatting, just pure JSON.

Water Data (ml per day): ${JSON.stringify(waterData)}
Sleep Data (hours per day): ${JSON.stringify(sleepData)}
`;
        const resp = await callProxy({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json' }
        });
        
        const rawText = resp.candidates?.[0]?.content?.parts?.[0]?.text;
        if (rawText) {
          const parsed = JSON.parse(rawText);
          if (parsed.waterTip) setAiWaterTip(parsed.waterTip);
          if (parsed.sleepTip) setAiSleepTip(parsed.sleepTip);
        }
      } catch (e) {
        console.error('Error fetching wellbeing AI insights', e);
      } finally {
        setIsAiThinking(false);
      }
    }
    fetchAiInsights();
  }, [waterData, sleepData]);

  // Fallback Recommendations
  const waterTip = aiWaterTip || (todayWater < 2500 
    ? `You're ${2500 - todayWater}ml away from optimal hydration. Drink a glass now!` 
    : "Great job staying hydrated today!");
  
  const sleepTip = aiSleepTip || (Number(sleepAvg) < 7 
    ? "Your average sleep is under 7 hours. Try winding down 30 mins earlier tonight."
    : "Excellent sleep patterns this week. Maintain this rhythm!");

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top']}>
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
          <Text style={styles.sectionTitle}>Water Intake</Text>
          <GlassCard style={styles.card}>
            <View style={styles.statRow}>
              <View>
                <Text style={styles.statLabel}>Today</Text>
                <Text style={styles.statValue}>{todayWater} <Text style={styles.statUnit}>ml</Text></Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.statLabel}>7-Day Avg</Text>
                <Text style={styles.statValue}>{waterAvg} <Text style={styles.statUnit}>ml</Text></Text>
              </View>
            </View>

            <View style={styles.chartContainer}>
              <Svg width={CHART_W} height={CHART_H}>
                <Defs>
                  <SvgLinearGradient id="waterGrad" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0%" stopColor="#00d2ff" stopOpacity="0.4" />
                    <Stop offset="100%" stopColor="#3a7bd5" stopOpacity="0" />
                  </SvgLinearGradient>
                  <SvgLinearGradient id="waterLineGrad" x1="0" y1="0" x2="1" y2="0">
                    <Stop offset="0%" stopColor="#3a7bd5" />
                    <Stop offset="100%" stopColor="#00d2ff" />
                  </SvgLinearGradient>
                </Defs>
                
                {/* Grid lines */}
                {[0, 0.5, 1].map(r => (
                  <Line key={r} x1="0" y1={CHART_H * r} x2={CHART_W} y2={CHART_H * r} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
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
                  <Circle key={i} cx={p.x} cy={p.y} r="4" fill="#00d2ff" />
                ))}
              </Svg>

              <View style={styles.xLabels}>
                {days.map((d, i) => (
                  <Text key={i} style={styles.xLabelText}>{getDayLabel(d)}</Text>
                ))}
              </View>
            </View>

            <GlassCard style={styles.tipBox}>
              <Ionicons name="sparkles" size={16} color="#A599FF" />
              <Text style={styles.tipText}>
                {isAiThinking ? 'S.A.R.A is analyzing your hydration...' : waterTip}
              </Text>
            </GlassCard>
          </GlassCard>
        </Animated.View>

        {/* Sleep Patterns Section */}
        <Animated.View style={{ opacity: mountAnim, transform: [{ translateY: mountAnim.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }], marginTop: SPACE.xl }}>
          <Text style={styles.sectionTitle}>Sleep Patterns</Text>
          <GlassCard style={styles.card}>
            <View style={styles.statRow}>
              <View>
                <Text style={styles.statLabel}>Last Night</Text>
                <Text style={styles.statValue}>{sleepData[sleepData.length - 1]} <Text style={styles.statUnit}>hrs</Text></Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.statLabel}>7-Day Avg</Text>
                <Text style={styles.statValue}>{sleepAvg} <Text style={styles.statUnit}>hrs</Text></Text>
              </View>
            </View>

            <View style={styles.chartContainer}>
              <Svg width={CHART_W} height={CHART_H}>
                <Defs>
                  <SvgLinearGradient id="sleepGrad" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0%" stopColor="#a599ff" />
                    <Stop offset="100%" stopColor="rgba(165,153,255,0.2)" />
                  </SvgLinearGradient>
                </Defs>

                {/* Grid lines */}
                {[0, 0.5, 1].map(r => (
                  <Line key={r} x1="0" y1={CHART_H * r} x2={CHART_W} y2={CHART_H * r} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                ))}

                {/* Bars */}
                {sleepData.map((val, i) => {
                  const barH = (val / maxSleep) * CHART_H;
                  const barW = 16;
                  const x = (i / (days.length - 1)) * CHART_W - (i === 0 ? 0 : i === days.length - 1 ? barW : barW / 2);
                  const y = CHART_H - barH;
                  return (
                    <Rect
                      key={i}
                      x={x}
                      y={y}
                      width={barW}
                      height={barH}
                      rx={6}
                      fill="url(#sleepGrad)"
                    />
                  );
                })}
              </Svg>

              <View style={styles.xLabels}>
                {days.map((d, i) => (
                  <Text key={i} style={styles.xLabelText}>{getDayLabel(d)}</Text>
                ))}
              </View>
            </View>

            <GlassCard style={styles.tipBox}>
              <Ionicons name="sparkles" size={16} color="#A599FF" />
              <Text style={styles.tipText}>
                {isAiThinking ? 'S.A.R.A is analyzing your sleep...' : sleepTip}
              </Text>
            </GlassCard>
          </GlassCard>
        </Animated.View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACE.xl, paddingBottom: SPACE.md,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  backBtn: { padding: SPACE.xs, marginLeft: -SPACE.xs },
  headerTitle: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.lg },
  scroll: { flex: 1 },
  scrollContent: { padding: SPACE.xl },
  sectionTitle: {
    fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.xl, color: '#f2f2f7',
    marginBottom: SPACE.md, marginLeft: SPACE.xs,
  },
  glassCard: {
    borderRadius: RADIUS.xl, padding: CARD_PAD,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden', backgroundColor: 'rgba(20, 20, 25, 0.4)',
  },
  card: {
    marginBottom: SPACE.md,
  },
  statRow: {
    flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACE.xl,
  },
  statLabel: {
    fontFamily: FONT_FAMILY.medium, fontSize: FONT_SIZE.xs, color: 'rgba(255,255,255,0.5)',
    marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1,
  },
  statValue: {
    fontFamily: FONT_FAMILY.bold, fontSize: 32, color: '#f2f2f7',
  },
  statUnit: {
    fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: 'rgba(255,255,255,0.5)',
  },
  chartContainer: {
    marginBottom: SPACE.lg,
  },
  xLabels: {
    flexDirection: 'row', justifyContent: 'space-between', marginTop: SPACE.sm,
  },
  xLabelText: {
    fontFamily: FONT_FAMILY.body, fontSize: 10, color: 'rgba(255,255,255,0.4)',
  },
  tipBox: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)',
    padding: SPACE.md, borderRadius: RADIUS.lg,
  },
  tipText: {
    fontFamily: FONT_FAMILY.medium, fontSize: FONT_SIZE.sm, color: '#f2f2f7',
    marginLeft: SPACE.md, flex: 1, lineHeight: 20,
  }
});
