/**
 * AnalyticsScreen — ZenTrack Mobile
 */

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { formatDateShort, formatDateWithDay } from '../utils/dateUtils';
import {
  View, Text, StyleSheet, Animated, ScrollView,
  TouchableOpacity, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Path, Defs, LinearGradient as SvgLinearGradient, Stop, Line, Text as SvgText, Rect } from 'react-native-svg';
import { LinearGradient as ExpoLinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useNavigation } from '@react-navigation/native';
import { SCREENS } from '../config/constants';
import * as Haptics from 'expo-haptics';
import { useMobileData } from '../contexts/MobileDataContext';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS } from '../theme/tokens';
import { useTheme } from "../contexts/ThemeContext";

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CHART_H = 90;
const CARD_PAD = 16;
const CHART_W = SCREEN_WIDTH - 8 * 2 - CARD_PAD * 2;

// ─── Smooth bezier helper ──────────────────────────────────────────────────
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return pts.length === 1 ? `M ${pts[0].x} ${pts[0].y}` : '';
  const d = [`M ${pts[0].x} ${pts[0].y}`];
  for (let i = 0; i < pts.length - 1; i++) {
    const p1 = pts[i], p2 = pts[i + 1];
    const cpX = (p1.x + p2.x) / 2;
    d.push(`C ${cpX} ${p1.y}, ${cpX} ${p2.y}, ${p2.x} ${p2.y}`);
  }
  return d.join(' ');
}

// ─── Date helpers ──────────────────────────────────────────────────────────
function daysAgoStr(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function daysRange(start: number, end: number): string[] {
  return Array.from({ length: end - start }, (_, i) => daysAgoStr(start + i)).reverse();
}

type Period = 'week' | 'month' | 'semester';
const PERIOD_DAYS: Record<Period, number> = { week: 7, month: 30, semester: 90 };
const PERIOD_LABEL: Record<Period, string> = { week: 'This Week', month: 'This Month', semester: 'This Semester' };

// ─── Animated SVG Circle ───────────────────────────────────────────────────
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// ─── GlassCard ─────────────────────────────────────────────────────────────
function GlassCard({ children, style }: { children: React.ReactNode; style?: any }) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  if (isDark) {
    return (
      <BlurView intensity={55} tint="dark" style={[styles.glassCard, style]}>
        {children}
      </BlurView>
    );
  }
  return (
    <View style={[styles.glassCard, style]}>
      {children}
    </View>
  );
}

// ─── Period Pill Selector ──────────────────────────────────────────────────
function PeriodSelector({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const PERIODS: Period[] = ['week', 'month', 'semester'];
  const LABELS: Record<Period, string> = { week: '7D', month: '30D', semester: '90D' };
  return (
    <View style={styles.periodRow}>
      {PERIODS.map(p => (
        <TouchableOpacity
          key={p}
          style={[styles.periodBtn, value === p && styles.periodBtnActive]}
          onPress={() => { onChange(p); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
        >
          <Text style={[styles.periodBtnText, value === p && styles.periodBtnTextActive]}>
            {LABELS[p]}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ─── Delta badge ───────────────────────────────────────────────────────────
function Delta({ cur, prev, unit = '' }: { cur: number; prev: number; unit?: string }) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  if (prev === 0 && cur === 0) return null;
  const diff = cur - prev;
  const pct = prev > 0 ? Math.round((diff / prev) * 100) : (cur > 0 ? 100 : 0);
  const up = diff >= 0;
  const posBg = isDark ? 'rgba(94,218,158,0.15)' : 'rgba(5,150,105,0.10)';
  const negBg = isDark ? 'rgba(255,105,97,0.15)' : 'rgba(220,38,38,0.10)';
  const posColor = isDark ? colors.accentGreen : '#059669';
  const negColor = isDark ? colors.error : '#DC2626';
  return (
    <View style={[styles.delta, { backgroundColor: up ? posBg : negBg }]}>
      <Ionicons name={up ? 'trending-up' : 'trending-down'} size={10} color={up ? posColor : negColor} />
      <Text style={[styles.deltaText, { color: up ? posColor : negColor }]}>
        {up ? '+' : ''}{pct}%{unit ? ` ${unit}` : ''}
      </Text>
    </View>
  );
}

// ─── Bar Chart ─────────────────────────────────────────────────────────────
interface BarChartProps {
  data: { label: string; cur: number; prev?: number }[];
  color: string;
  prevColor?: string;
  maxVal: number;
  height?: number;
  animated?: boolean;
}

function BarChart({ data, color, prevColor, maxVal, height = CHART_H, animated = false }: BarChartProps) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    anim.setValue(0);
    if (animated) {
      Animated.timing(anim, { toValue: 1, duration: 600, useNativeDriver: false }).start();
    } else {
      anim.setValue(1);
    }
  }, [data]);

  const barW = prevColor ? 8 : 12;
  const gap = prevColor ? 3 : 6;

  return (
    <View style={{ height, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
      {/* Y-axis grid lines */}
      <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
        {[0.25, 0.5, 0.75, 1].map((f, i) => (
          <View key={i} style={[styles.gridLine, { bottom: `${f * 100}%` as any }]} />
        ))}
      </View>

      {data.map((d, i) => {
        const curH = anim.interpolate({
          inputRange: [0, 1],
          outputRange: [2, Math.max(2, (d.cur / maxVal) * (height - 20))],
        });
        const prevH = d.prev !== undefined
          ? anim.interpolate({
              inputRange: [0, 1],
              outputRange: [2, Math.max(2, ((d.prev || 0) / maxVal) * (height - 20))],
            })
          : null;

        return (
          <View key={i} style={{ alignItems: 'center', flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap }}>
              {prevH !== null && (
                <Animated.View style={{
                  width: barW,
                  height: prevH,
                  backgroundColor: prevColor || 'transparent',
                  borderRadius: 4,
                  opacity: isDark ? 0.45 : 0.25,
                }} />
              )}
              <Animated.View style={{
                width: barW,
                height: curH,
                backgroundColor: color,
                borderRadius: 4,
                shadowColor: color,
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: isDark ? 0.35 : 0.15,
                shadowRadius: 4,
                elevation: 2,
              }} />
            </View>
            <Text style={styles.barLabel}>{d.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

// ─── Stacked Bar Chart ─────────────────────────────────────────────────────
interface StackedBarChartProps {
  data: { label: string; attended: number; missed: number }[];
  color1: string;
  color2: string;
  maxVal: number;
  height?: number;
  animated?: boolean;
}

function StackedBarChart({ data, color1, color2, maxVal, height = CHART_H, animated = true }: StackedBarChartProps) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    anim.setValue(0);
    if (animated) {
      Animated.timing(anim, { toValue: 1, duration: 600, useNativeDriver: false }).start();
    } else {
      anim.setValue(1);
    }
  }, [data]);

  const barW = 12;

  return (
    <View style={{ height, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' }}>
      <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
        {[0.25, 0.5, 0.75, 1].map((f, i) => (
          <View key={i} style={[styles.gridLine, { bottom: `${f * 100}%` as any }]} />
        ))}
      </View>

      {data.map((d, i) => {
        const total = d.attended + d.missed;
        const totalH = anim.interpolate({
          inputRange: [0, 1],
          outputRange: [0, Math.max(0, (total / maxVal) * (height - 20))],
        });

        const attPct = total > 0 ? d.attended / total : 0;
        const missedPct = total > 0 ? d.missed / total : 0;

        return (
          <View key={i} style={{ alignItems: 'center', flex: 1 }}>
            <Animated.View style={{
              width: barW,
              height: totalH,
              flexDirection: 'column-reverse',
              borderRadius: 4,
              overflow: 'hidden',
              backgroundColor: 'transparent'
            }}>
              {d.attended > 0 && <View style={{ flex: attPct, backgroundColor: color1 }} />}
              {d.missed > 0 && <View style={{ flex: missedPct, backgroundColor: color2 }} />}
            </Animated.View>
            <Text style={styles.barLabel}>{d.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

// ─── Line Chart (SVG) ──────────────────────────────────────────────────────
interface LineChartProps {
  data: { label: string; value: number }[];
  color: string;
  width?: number;
  height?: number;
}

function LineChart({ data, color, width = SCREEN_WIDTH - SPACE.xl * 2 - CARD_PAD * 2, height = CHART_H }: LineChartProps) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const anim = useRef(new Animated.Value(0)).current;
  const [rendered, setRendered] = useState(false);

  useEffect(() => {
    setRendered(true);
    anim.setValue(1);
  }, [data]);

  if (data.length < 2) {
    return (
      <View style={{ height, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: colors.textTertiary, fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm }}>
          Not enough data yet
        </Text>
      </View>
    );
  }

  const vals = data.map(d => d.value);
  const minV = Math.min(...vals);
  const maxV = Math.max(...vals);
  const range = Math.max(maxV - minV, 1);
  const pad = 8;

  const pts = data.map((d, i) => ({
    x: pad + (i / (data.length - 1)) * (width - pad * 2),
    y: (height - pad) - ((d.value - minV) / range) * (height - pad * 2),
  }));

  const linePath = smoothPath(pts);
  const areaPath = `${linePath} L ${pts[pts.length - 1].x} ${height} L ${pts[0].x} ${height} Z`;

  return (
    <View style={{ height }}>
      {/* Grid lines */}
      <Svg width={width} height={height} style={StyleSheet.absoluteFillObject} pointerEvents="none">
        {[0.25, 0.5, 0.75].map((f, i) => (
          <Line key={i} x1={0} y1={height * (1 - f)} x2={width} y2={height * (1 - f)}
            stroke={isDark ? "rgba(255,255,255,0.06)" : colors.border} strokeWidth="1" />
        ))}
        {/* Area fill */}
        <Defs>
          <SvgLinearGradient id={`areaGrad_${color}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity={isDark ? "0.35" : "0.20"} />
            <Stop offset="1" stopColor={color} stopOpacity="0" />
          </SvgLinearGradient>
        </Defs>
        {rendered && <Path d={areaPath} fill={`url(#areaGrad_${color})`} />}
        {rendered && <Path d={linePath} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
        {rendered && pts.map((p, i) => (
          <Circle key={i} cx={p.x} cy={p.y} r="4" fill={color}
            stroke={isDark ? "rgba(0,0,0,0.5)" : "#FFFFFF"} strokeWidth="1.5" />
        ))}
      </Svg>
      {/* X-axis labels */}
      <View style={{ position: 'absolute', bottom: -18, left: pad, right: pad, height: 20 }}>
        <Text style={[styles.axisLabel, { position: 'absolute', left: 0 }]}>{data[0].label}</Text>
        <Text style={[styles.axisLabel, { position: 'absolute', alignSelf: 'center' }]}>
          {data[Math.floor((data.length - 1) / 2)].label}
        </Text>
        <Text style={[styles.axisLabel, { position: 'absolute', right: 0 }]}>{data[data.length - 1].label}</Text>
      </View>
    </View>
  );
}

// ─── Heatmap ───────────────────────────────────────────────────────────────
function ActivityHeatmap({ dates, tasks, gymLogs, habitLogs }: {
  dates: string[];
  tasks: any[];
  gymLogs: any[];
  habitLogs: any[];
}) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: SPACE.md }}>
      {dates.map((date, i) => {
        const tasksDone = tasks.filter(t => t.status === 'completed' && (t.completedAt || t.date || '').startsWith(date)).length;
        const gymDone   = gymLogs.some(g => g.date === date) ? 1 : 0;
        const habitDone = habitLogs.filter(l => l.date === date).length;
        const total = tasksDone + gymDone + (habitDone > 0 ? 1 : 0);

        let bg = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)';
        let borderColor = isDark ? 'rgba(255,255,255,0.07)' : colors.border;
        if (total === 1) {
          bg = isDark ? 'rgba(165,153,255,0.25)' : 'rgba(108,92,231,0.20)';
          borderColor = isDark ? 'rgba(165,153,255,0.40)' : 'rgba(108,92,231,0.30)';
        }
        if (total === 2) {
          bg = isDark ? 'rgba(165,153,255,0.55)' : 'rgba(108,92,231,0.50)';
          borderColor = isDark ? 'rgba(165,153,255,0.70)' : 'rgba(108,92,231,0.60)';
        }
        if (total >= 3) {
          bg = colors.accentPrimary;
          borderColor = colors.accentPrimary;
        }

        return (
          <View key={i} style={{
            width: (SCREEN_WIDTH - SPACE.xl * 2 - CARD_PAD * 2 - 4 * 6) / 7,
            aspectRatio: 1,
            borderRadius: 4,
            backgroundColor: bg,
            borderWidth: 1,
            borderColor,
          }} />
        );
      })}
    </View>
  );
}

export default function AnalyticsScreen() {
  const { colors, isDark } = useTheme();
  const navigation = useNavigation<any>();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const {
    tasks,
    gymLogs,
    habitLogs,
    goals,
    semesters,
    attendance,
    attendanceLogs,
    allHabits
  } = useMobileData();
  const [period, setPeriod] = useState<Period>('week');

  // Staggered entry animations
  const animHeader  = useRef(new Animated.Value(1)).current;
  const animRing    = useRef(new Animated.Value(1)).current;
  const animCards   = useRef(new Animated.Value(1)).current;
  const animCharts  = useRef(new Animated.Value(1)).current;
  const animHeat    = useRef(new Animated.Value(1)).current;

  // Period bounds
  const days = PERIOD_DAYS[period];
  const curStart  = daysAgoStr(days - 1);
  const prevStart = daysAgoStr(days * 2 - 1);
  const prevEnd   = daysAgoStr(days);

  // ── Computed stats (Single-pass O(N) optimization) ──────────────────────
  const stats = useMemo(() => {
    let curTasks = 0;
    let prevTasks = 0;
    let curFocus = 0;
    let prevFocus = 0;

    for (const t of tasks) {
      if (t.status !== 'completed') continue;
      const d = t.completedAt || t.date || '';
      if (d >= curStart) {
        curTasks++;
        curFocus += (t.actualMinutes || 0);
      } else if (d >= prevStart && d <= prevEnd) {
        prevTasks++;
        prevFocus += (t.actualMinutes || 0);
      }
    }

    let curHabits = 0;
    let prevHabits = 0;
    for (const l of habitLogs) {
      if (l.date >= curStart) curHabits++;
      else if (l.date >= prevStart && l.date <= prevEnd) prevHabits++;
    }

    let curGym = 0;
    let prevGym = 0;
    for (const g of gymLogs) {
      if (g.date >= curStart) curGym++;
      else if (g.date >= prevStart && g.date <= prevEnd) prevGym++;
    }

    let curAttended = 0;
    let curMissed = 0;
    let prevAttended = 0;
    let prevMissed = 0;

    for (const l of attendanceLogs) {
      if (l.date >= curStart) {
        if (l.action === 'attended') curAttended++;
        else if (l.action === 'missed') curMissed++;
      } else if (l.date >= prevStart && l.date <= prevEnd) {
        if (l.action === 'attended') prevAttended++;
        else if (l.action === 'missed') prevMissed++;
      }
    }

    const totalAtt = curAttended + curMissed;
    const attendancePct = totalAtt > 0 ? (curAttended / totalAtt) * 100 : 100;

    const D = PERIOD_DAYS[period] || 7;
    const targetTasks = D * 3;
    const targetGym = Math.round(D * (4 / 7));
    const targetFocus = D * 30;
    const targetHabits = D * 2;

    const calcScore = (tasksCount: number, gymCount: number, focusMins: number, habitsCount: number, totAtt: number, attPct: number) => {
      const tScore = Math.min(25, (tasksCount / targetTasks) * 25);
      const gScore = targetGym > 0 ? Math.min(30, (gymCount / targetGym) * 30) : 30;
      const fScore = Math.min(25, (focusMins / targetFocus) * 25);
      const hScore = Math.min(20, (habitsCount / targetHabits) * 20);

      let base = tScore + gScore + fScore + hScore;
      let attMod = 0;
      if (totAtt > 0) {
        if (attPct >= 90) attMod = 5;
        else if (attPct < 50) attMod = -10;
      }
      return Math.max(0, Math.min(100, Math.round(base + attMod)));
    };

    // Zen Score - Real Data Formula
    const zenScore = calcScore(curTasks, curGym, curFocus, curHabits, totalAtt, attendancePct);

    // Prev Zen
    const prevTotalAtt = prevAttended + prevMissed;
    const prevAttendancePct = prevTotalAtt > 0 ? (prevAttended / prevTotalAtt) * 100 : 100;
    const prevZen = calcScore(prevTasks, prevGym, prevFocus, prevHabits, prevTotalAtt, prevAttendancePct);

    // Best streak - pre-index active dates into a Set for O(1) lookup
    const activeDates = new Set<string>();
    for (const t of tasks) {
      if (t.status === 'completed' && t.completedAt) activeDates.add(t.completedAt.slice(0, 10));
    }
    for (const g of gymLogs) { if (g.date) activeDates.add(g.date); }
    for (const l of habitLogs) { if (l.date) activeDates.add(l.date); }

    let best = 0, run = 0;
    for (let i = 0; i < 90; i++) {
      const d = daysAgoStr(i);
      if (activeDates.has(d)) { run++; best = Math.max(best, run); } else { run = 0; }
    }

    return { curTasks, prevTasks, curHabits, prevHabits, curGym, prevGym, curFocus, prevFocus, zenScore, prevZen, bestStreak: best, curAttended };
  }, [tasks, habitLogs, gymLogs, attendanceLogs, period, curStart, prevStart, prevEnd]);

  // ── Zen Score ring ──
  const RING_SIZE = 160;
  const RING_R    = (RING_SIZE - 20) / 2;
  const CIRC      = 2 * Math.PI * RING_R;
  const ringProgress = stats.zenScore / 100;
  const strokeDashoffset = animRing.interpolate({
    inputRange: [0, 1],
    outputRange: [CIRC, CIRC - ringProgress * CIRC],
  });

  // ── Task trend bar chart (O(N) pre-indexed map) ──
  const taskBarData = useMemo(() => {
    const taskDateCounts = new Map<string, number>();
    for (const t of tasks) {
      if (t.status !== 'completed') continue;
      const d = (t.completedAt || t.date || '').slice(0, 10);
      if (d) taskDateCounts.set(d, (taskDateCounts.get(d) || 0) + 1);
    }

    const n = Math.min(days, 14);
    const step = days <= 7 ? 1 : days <= 30 ? 2 : 7;
    const result: { label: string; cur: number; prev: number }[] = [];
    for (let i = n - 1; i >= 0; i -= step) {
      const d = daysAgoStr(i);
      const dPrev = daysAgoStr(i + days);
      const label = d.slice(8); // day-of-month
      const cur  = taskDateCounts.get(d) || 0;
      const prev = taskDateCounts.get(dPrev) || 0;
      result.push({ label, cur, prev });
    }
    return result;
  }, [tasks, period, days]);
  const maxTaskBar = Math.max(...taskBarData.map(d => Math.max(d.cur, d.prev)), 4);

  // ── Habit consistency line chart (O(N) pre-indexed map) ──
  const focusBarData = useMemo(() => {
    const habitDateCounts = new Map<string, number>();
    for (const l of habitLogs) {
      if (l.date) habitDateCounts.set(l.date, (habitDateCounts.get(l.date) || 0) + 1);
    }

    const activeCount = Math.max(allHabits.filter(h => !h.archived).length, 1);
    const n = Math.min(days, 14);
    const step = days <= 7 ? 1 : days <= 30 ? 2 : 7;
    const result: { label: string; cur: number; prev: number }[] = [];
    for (let i = n - 1; i >= 0; i -= step) {
      const d     = daysAgoStr(i);
      const dPrev = daysAgoStr(i + days);
      const label = d.slice(8);
      const cur  = Math.round(((habitDateCounts.get(d) || 0) / activeCount) * 100);
      const prev = Math.round(((habitDateCounts.get(dPrev) || 0) / activeCount) * 100);
      result.push({ label, cur, prev });
    }
    return result;
  }, [habitLogs, allHabits, period, days]);
  const maxFocusBar = 100; // always percentage, cap at 100%

  // ── Attendance Stacked Bar Chart Data (O(L) Map indexing) ──
  const attendanceBarData = useMemo(() => {
    const attMap = new Map<string, { attended: number; missed: number }>();
    for (const l of attendanceLogs) {
      if (!l.date) continue;
      const entry = attMap.get(l.date) || { attended: 0, missed: 0 };
      if (l.action === 'attended') entry.attended++;
      else if (l.action === 'missed') entry.missed++;
      attMap.set(l.date, entry);
    }

    const buckets = days <= 7 ? 7 : days <= 30 ? 5 : 6;
    const step = days <= 7 ? 1 : days <= 30 ? 6 : 15;
    const result: { label: string; attended: number; missed: number }[] = [];
    for (let b = buckets - 1; b >= 0; b--) {
      const startDay = b * step + step - 1;
      const endDay = b * step;
      const startStr = daysAgoStr(startDay);
      const endStr = daysAgoStr(endDay);
      let label = '';
      if (days <= 7) label = formatDateWithDay(endStr).split(',')[0];
      else label = formatDateShort(startStr);

      let attended = 0;
      let missed = 0;
      for (let i = startDay; i >= endDay; i--) {
        const targetDate = daysAgoStr(i);
        const dayCounts = attMap.get(targetDate);
        if (dayCounts) {
          attended += dayCounts.attended;
          missed += dayCounts.missed;
        }
      }
      result.push({ label, attended, missed });
    }
    return result;
  }, [attendanceLogs, period, days]);
  const maxAttBar = Math.max(...attendanceBarData.map(d => d.attended + d.missed), 4);

  // ── Gym volume bar chart ──
  const gymVolData = useMemo(() => {
    const calcVolume = (log: any): number => {
      if (!log?.exercises) return 0;
      return log.exercises.reduce((total: number, ex: any) => {
        return total + (ex.setsLog || ex.sets || []).reduce((setTotal: number, s: any) => {
          return setTotal + (s.completed ? (s.weight || 0) * (s.reps || 0) : 0);
        }, 0);
      }, 0);
    };

    const gymDateMap = new Map<string, any>();
    for (const g of gymLogs || []) {
      if (g.date) gymDateMap.set(g.date, g);
    }

    const n = Math.min(days, 14);
    const step = days <= 7 ? 1 : days <= 30 ? 2 : 7;
    const result: { label: string; cur: number; prev: number }[] = [];
    for (let i = n - 1; i >= 0; i -= step) {
      const d = daysAgoStr(i);
      const dPrev = daysAgoStr(i + days);
      const log  = gymDateMap.get(d);
      const logP = gymDateMap.get(dPrev);
      result.push({
        label: d.slice(8),
        cur:  calcVolume(log),
        prev: calcVolume(logP),
      });
    }
    return result;
  }, [gymLogs, period, days]);
  const maxGymVol = Math.max(...gymVolData.map(d => Math.max(d.cur, d.prev)), 5);

  // ── Heatmap dates (5 weeks) ──
  const heatDates = useMemo(() => daysRange(0, 35), []);

  return (
    <View style={styles.root}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      {isDark && (
        <ExpoLinearGradient colors={['#160C28', '#080512', '#000000']} style={StyleSheet.absoluteFillObject} />
      )}
      {/* Ambient glow blobs in dark mode */}
      {isDark && (
        <>
          <View style={styles.bgGlow1} />
          <View style={styles.bgGlow2} />
          <View style={styles.bgGlow3} />
        </>
      )}

      <SafeAreaView style={{ flex: 1 }} edges={['top']}>

        {/* ── Header ── */}
        <Animated.View style={[styles.header, {
          opacity: animHeader,
          transform: [{ translateY: animHeader.interpolate({ inputRange: [0,1], outputRange: [-16,0] }) }],
        }]}>
          <View>
            <Text style={styles.title}>Analytics</Text>
            <Text style={styles.subtitle}>{PERIOD_LABEL[period]}</Text>
          </View>
          <View style={styles.liveSync}>
            <View style={styles.syncDot} />
            <Text style={styles.syncText}>Live</Text>
          </View>
        </Animated.View>

        {/* ── Period Selector ── */}
        <Animated.View style={{ opacity: animHeader }}>
          <PeriodSelector value={period} onChange={setPeriod} />
        </Animated.View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* ── 1. ZEN SCORE RING ── */}
          <Animated.View style={[styles.heroSection, {
            opacity: animRing,
            transform: [{ scale: animRing.interpolate({ inputRange: [0,1], outputRange: [0.85,1] }) }],
          }]}>
            <View style={{ alignItems: 'center' }}>
              <Svg width={RING_SIZE} height={RING_SIZE} style={{ transform: [{ rotate: '-90deg' }] }}>
                <Defs>
                  <SvgLinearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
                    <Stop offset="0" stopColor={colors.accentPrimary} />
                    <Stop offset="1" stopColor={isDark ? colors.accentSecondary : '#0284C7'} />
                  </SvgLinearGradient>
                </Defs>
                <Circle cx={RING_SIZE/2} cy={RING_SIZE/2} r={RING_R}
                  stroke={isDark ? "rgba(255,255,255,0.05)" : colors.border} strokeWidth="10" fill="none" />
                <AnimatedCircle cx={RING_SIZE/2} cy={RING_SIZE/2} r={RING_R}
                  stroke="url(#ringGrad)" strokeWidth="13" fill="none"
                  strokeDasharray={CIRC} strokeDashoffset={strokeDashoffset} strokeLinecap="round" />
              </Svg>
              <View style={styles.ringInner}>
                <Text style={styles.ringScore}>{stats.zenScore}</Text>
                <Text style={styles.ringLabel}>ZEN SCORE</Text>
              </View>
            </View>

            {/* 3 summary stats */}
            <View style={styles.summaryRow}>
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryVal, { color: isDark ? colors.accentGreen : '#059669' }]}>{stats.curTasks}</Text>
                <Text style={styles.summaryKey}>Tasks</Text>
                <Delta cur={stats.curTasks} prev={stats.prevTasks} />
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryVal, { color: isDark ? colors.accentPrimary : '#D97706' }]}>{stats.curGym}</Text>
                <Text style={styles.summaryKey}>Gym Days</Text>
                <Delta cur={stats.curGym} prev={stats.prevGym} />
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryVal, { color: isDark ? colors.accentSecondary : '#0284C7' }]}>
                  {stats.curFocus >= 60 ? `${Math.floor(stats.curFocus / 60)}h ${stats.curFocus % 60}m` : `${stats.curFocus}m`}
                </Text>
                <Text style={styles.summaryKey}>Focus Time</Text>
                <Delta cur={stats.curFocus} prev={stats.prevFocus} />
              </View>
            </View>
          </Animated.View>

          {/* ── 2. STAT CARDS ROW ── */}
          <Animated.View style={[styles.cardRow, {
            opacity: animCards,
            transform: [{ translateY: animCards.interpolate({ inputRange: [0,1], outputRange: [20,0] }) }],
          }]}>
            <GlassCard style={styles.statCard}>
              <Ionicons name="flame" size={20} color={isDark ? colors.accentPrimary : '#D97706'} style={{ marginBottom: 6 }} />
              <Text style={styles.statCardVal}>{stats.bestStreak}d</Text>
              <Text style={styles.statCardLabel}>Best Streak</Text>
            </GlassCard>
            <GlassCard style={styles.statCard}>
              <Ionicons name="checkmark-circle-outline" size={20} color={isDark ? colors.accentSecondary : '#059669'} style={{ marginBottom: 6 }} />
              <Text style={styles.statCardVal}>{stats.curHabits}</Text>
              <Text style={styles.statCardLabel}>Habits Done</Text>
            </GlassCard>
            <GlassCard style={styles.statCard}>
              <Ionicons name="school-outline" size={20} color={isDark ? colors.success : '#0284C7'} style={{ marginBottom: 6 }} />
              <Text style={styles.statCardVal}>{stats.curAttended}</Text>
              <Text style={styles.statCardLabel}>Classes Attended</Text>
            </GlassCard>
          </Animated.View>

          {/* ── 3. TASK COMPLETION CHART ── */}
          <Animated.View style={[styles.fullCard, {
            opacity: animCharts,
            transform: [{ translateY: animCharts.interpolate({ inputRange: [0,1], outputRange: [30,0] }) }],
          }]}>
            <GlassCard style={styles.chartCard}>
              <View style={styles.chartHeader}>
                <View>
                  <Text style={styles.chartTitle}>Task Completion</Text>
                  <Text style={styles.chartSub}>vs previous {period}</Text>
                </View>
                <View style={styles.legendRow}>
                  <View style={[styles.legendDot, { backgroundColor: colors.accentPrimary }]} />
                  <Text style={styles.legendText}>This</Text>
                  <View style={[styles.legendDot, { backgroundColor: colors.accentPrimary, opacity: isDark ? 0.4 : 0.25 }]} />
                  <Text style={styles.legendText}>Prev</Text>
                </View>
              </View>
              <BarChart
                data={taskBarData}
                color={colors.accentPrimary}
                prevColor={colors.accentPrimary}
                maxVal={maxTaskBar}
                height={CHART_H}
              />
            </GlassCard>
          </Animated.View>

          {/* ── 4. HABIT CONSISTENCY CHART ── */}
          <Animated.View style={[styles.fullCard, {
            opacity: animCharts,
            transform: [{ translateY: animCharts.interpolate({ inputRange: [0,1], outputRange: [40,0] }) }],
          }]}>
            <GlassCard style={styles.chartCard}>
              <View style={styles.chartHeader}>
                <View>
                  <Text style={styles.chartTitle}>Habit Consistency</Text>
                  <Text style={styles.chartSub}>% of habits completed per day</Text>
                </View>
                <View style={styles.legendRow}>
                  <View style={[styles.legendDot, { backgroundColor: isDark ? colors.accentSecondary : '#D97706' }]} />
                  <Text style={styles.legendText}>This</Text>
                  <View style={[styles.legendDot, { backgroundColor: isDark ? colors.accentSecondary : '#D97706', opacity: isDark ? 0.4 : 0.25 }]} />
                  <Text style={styles.legendText}>Prev</Text>
                </View>
              </View>
              <BarChart
                data={focusBarData}
                color={isDark ? colors.accentSecondary : '#D97706'}
                prevColor={isDark ? colors.accentSecondary : '#D97706'}
                maxVal={maxFocusBar}
                height={CHART_H}
              />
            </GlassCard>
          </Animated.View>

          {/* ── 5. ATTENDANCE CHART ── */}
          <Animated.View style={[styles.fullCard, {
            opacity: animCharts,
            transform: [{ translateY: animCharts.interpolate({ inputRange: [0,1], outputRange: [50,0] }) }],
          }]}>
            <GlassCard style={styles.chartCard}>
              <View style={styles.chartHeader}>
                <View>
                  <Text style={styles.chartTitle}>Class Attendance</Text>
                  <Text style={styles.chartSub}>Attended vs Missed</Text>
                </View>
                <View style={styles.legendRow}>
                  <View style={[styles.legendDot, { backgroundColor: isDark ? colors.accentGreen : '#059669' }]} />
                  <Text style={styles.legendText}>Attended</Text>
                  <View style={[styles.legendDot, { backgroundColor: isDark ? colors.error : '#DC2626' }]} />
                  <Text style={styles.legendText}>Missed</Text>
                </View>
              </View>
              <StackedBarChart
                data={attendanceBarData}
                color1={isDark ? colors.accentGreen : '#059669'}
                color2={isDark ? colors.error : '#DC2626'}
                maxVal={maxAttBar}
                height={CHART_H}
              />
            </GlassCard>
          </Animated.View>

          {/* ── 7. GYM VOLUME BAR CHART ── */}
          <Animated.View style={[styles.fullCard, {
            opacity: animCharts,
          }]}>
            <GlassCard style={styles.chartCard}>
              <View style={styles.chartHeader}>
                <View>
                  <Text style={styles.chartTitle}>Gym Volume</Text>
                  <Text style={styles.chartSub}>Total weight × reps (This vs Last period)</Text>
                </View>
                <Delta cur={stats.curGym} prev={stats.prevGym} />
              </View>
              <BarChart
                data={gymVolData}
                color={isDark ? colors.accentBlue : '#0284C7'}
                prevColor={isDark ? colors.accentBlue : '#0284C7'}
                maxVal={maxGymVol}
                height={CHART_H}
              />
            </GlassCard>
          </Animated.View>

          {/* ── 8. ACTIVITY HEATMAP ── */}
          <Animated.View style={[styles.fullCard, {
            opacity: animHeat,
            transform: [{ translateY: animHeat.interpolate({ inputRange: [0,1], outputRange: [40,0] }) }],
          }]}>
            <GlassCard style={styles.chartCard}>
              <View style={styles.chartHeader}>
                <View>
                  <Text style={styles.chartTitle}>Activity Heatmap</Text>
                  <Text style={styles.chartSub}>Last 35 days</Text>
                </View>
                <View style={styles.legendRow}>
                  {[
                    isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
                    isDark ? 'rgba(165,153,255,0.3)' : 'rgba(108,92,231,0.25)',
                    isDark ? 'rgba(165,153,255,0.6)' : 'rgba(108,92,231,0.55)',
                    colors.accentPrimary
                  ].map((c, i) => (
                    <View key={i} style={[styles.heatLegendDot, { backgroundColor: c }]} />
                  ))}
                </View>
              </View>
              <ActivityHeatmap
                dates={heatDates}
                tasks={tasks}
                gymLogs={gymLogs}
                habitLogs={habitLogs}
              />
              <View style={styles.heatLegendLabels}>
                <Text style={styles.legendText}>Less</Text>
                <Text style={styles.legendText}>More</Text>
              </View>
            </GlassCard>
          </Animated.View>

          <View style={{ height: 100 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const makeStyles = (colors: any, isDark: boolean = true) => StyleSheet.create({
  root: { flex: 1, backgroundColor: isDark ? '#000000' : colors.background },

  bgGlow1: {
    position: 'absolute', top: -80, left: -100,
    width: 350, height: 350, borderRadius: 175,
    backgroundColor: colors.accentPrimary,
    transform: [{ scale: 1.5 }], opacity: isDark ? 0.12 : 0,
  },
  bgGlow2: {
    position: 'absolute', bottom: 100, right: -120,
    width: 300, height: 300, borderRadius: 150,
    backgroundColor: colors.accentSecondary,
    transform: [{ scale: 1.5 }], opacity: isDark ? 0.08 : 0,
  },
  bgGlow3: {
    position: 'absolute', top: 300, right: -50,
    width: 200, height: 200, borderRadius: 100,
    backgroundColor: colors.accentAmber || '#ff9f4d',
    transform: [{ scale: 1.5 }], opacity: isDark ? 0.05 : 0,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingTop: SPACE.lg,
    paddingBottom: SPACE.sm,
  },
  title: { fontFamily: FONT_FAMILY.title, fontSize: 28, color: colors.textPrimary },
  subtitle: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: colors.textSecondary, marginTop: 2 },
  
  liveSync: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#F0EFF7',
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    borderWidth: 1, borderColor: isDark ? 'transparent' : colors.border,
  },
  syncDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: isDark ? colors.accentGreen : '#059669', marginRight: 6 },
  syncText: { color: colors.textPrimary, fontSize: 11, fontFamily: FONT_FAMILY.bold },

  // Period selector
  periodRow: {
    flexDirection: 'row',
    gap: SPACE.sm,
    paddingHorizontal: 16,
    marginBottom: SPACE.lg,
  },
  periodBtn: {
    flex: 1, alignItems: 'center',
    paddingVertical: 8,
    borderRadius: RADIUS.full,
    backgroundColor: isDark ? '#18181B' : '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.border,
    elevation: isDark ? 0 : 1,
    shadowColor: isDark ? '#000000' : 'rgba(0,0,0,0.04)',
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    shadowOpacity: isDark ? 0 : 1,
  },
  periodBtnActive: {
    backgroundColor: colors.accentPrimary,
    borderColor: colors.accentPrimary,
  },
  periodBtnText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.sm,
    color: colors.textSecondary,
  },
  periodBtnTextActive: { color: '#ffffff' },

  scrollContent: { paddingTop: 0 },

  // Hero ring
  heroSection: {
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: SPACE.lg,
  },
  ringInner: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ translateY: -15 }],
  },
  ringScore: {
    fontFamily: FONT_FAMILY.title,
    fontSize: 52,
    color: colors.textPrimary,
    lineHeight: 60,
  },
  ringLabel: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 11,
    color: colors.textTertiary,
    letterSpacing: 3,
    marginTop: 8,
    textTransform: 'uppercase',
  },

  // Summary stats row
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: SPACE.xl,
    backgroundColor: colors.surface,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: SPACE.lg,
    paddingHorizontal: 8,
    elevation: isDark ? 0 : 1,
    shadowColor: isDark ? '#000000' : 'rgba(0,0,0,0.04)',
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    shadowOpacity: isDark ? 0 : 1,
  },
  summaryItem: { alignItems: 'center', flex: 1 },
  summaryVal: { fontFamily: FONT_FAMILY.bold, fontSize: 22, lineHeight: 26 },
  summaryKey: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.xs, color: colors.textSecondary, marginTop: 2, marginBottom: 4 },
  summaryDivider: { width: 1, height: 36, backgroundColor: colors.border },

  // Delta badge
  delta: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    gap: 2,
  },
  deltaText: { fontFamily: FONT_FAMILY.bold, fontSize: 10 },

  // Stat cards
  cardRow: {
    flexDirection: 'row',
    gap: SPACE.md,
    paddingHorizontal: 16,
    marginBottom: SPACE.md,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    padding: SPACE.lg,
  },
  statCardVal: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.xxl,
    color: colors.textPrimary,
  },
  statCardLabel: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 2,
  },

  // Chart cards
  fullCard: {
    paddingHorizontal: 16,
    marginBottom: SPACE.md,
  },
  chartCard: {
    padding: CARD_PAD,
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACE.lg,
  },
  chartTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.base,
    color: colors.textPrimary,
  },
  chartSub: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },

  // Legend
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontFamily: FONT_FAMILY.mono, fontSize: 10, color: colors.textSecondary },

  // Bar chart grid
  gridLine: {
    position: 'absolute',
    left: 0, right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  barLabel: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 9,
    color: colors.textTertiary,
    marginTop: 4,
  },

  // Axis labels
  axisLabel: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 9,
    color: colors.textTertiary,
    textAlign: 'center',
  },

  // Glass card
  glassCard: {
    borderRadius: RADIUS.xxl,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.08)' : colors.border,
    overflow: 'hidden',
    backgroundColor: isDark ? 'rgba(20,20,25,0.4)' : '#FFFFFF',
    elevation: isDark ? 0 : 2,
    shadowColor: isDark ? '#000000' : 'rgba(0,0,0,0.03)',
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    shadowOpacity: isDark ? 0 : 1,
  },

  // Heatmap
  heatLegendDot: { width: 10, height: 10, borderRadius: 2 },
  heatLegendLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: SPACE.sm,
  },
});

