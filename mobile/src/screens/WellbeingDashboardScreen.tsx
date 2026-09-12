/**
 * WellbeingDashboardScreen.tsx — ZenTrack Hydration & Bio-Vitality Intelligence Hub
 * High-performance, edge-to-edge Obsidian Cosmos design with Intraday Intake Telemetry,
 * 7-Day & 14-Day Fluid Curves, Circadian Pacing Protocols, 0-Tap Quick Logging,
 * and S.A.R.A Biohacking Intelligence.
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
  TextInput,
  Modal,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
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
import { serverTimestamp } from 'firebase/firestore';

import { useTheme } from '../contexts/ThemeContext';
import { useWellnessData } from '../contexts/domains/WellnessContext';
import { useCoreData } from '../contexts/domains/CoreDataContext';
import { useGymProfile } from '../hooks/useGymProfile';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS } from '../theme/tokens';
import { callProxy } from '../services/geminiProxy';
import { formatLocalDateStr } from '../utils/dateUtils';
import { getBootManifestSync, updateL1Cache } from '../utils/bootManifest';
import { queueWrite } from '../services/offlineSync';
import { COLLECTION } from '../config/constants';
import WaterLogSheet from '../components/Dashboard/WaterLogSheet';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SCREEN_PAD = 14;
const CARD_PAD = 16;
const CHART_W = SCREEN_WIDTH - SCREEN_PAD * 2 - CARD_PAD * 2;
const CHART_H = 148;

// ─── Smooth Bezier Helper for Water Curve ──────────────────────────────────────
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

function getPastDays(count: number): string[] {
  return Array.from({ length: count }, (_, i) => daysAgoStr(count - 1 - i));
}

function getDayLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days[d.getDay()];
}

function formatLogTime(timestamp?: number): string {
  if (!timestamp) return 'Today';
  const d = new Date(timestamp);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// ─── High Performance Obsidian Card ─────────────────────────────────────────
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

  const { user } = useCoreData();
  const { waterLogs, ensureSubscribed, optimisticAddWaterLog, optimisticDeleteWaterLog, gymLogs, weightLogs } = useWellnessData();
  const { gymProfile } = useGymProfile();

  // User weight: check gymProfile first, then weightLogs
  const userWeight = gymProfile?.weightKg || (weightLogs && weightLogs.length > 0 ? ((weightLogs[0] as any).weightKg || (weightLogs[0] as any).weight) : null);

  // SARA AI On-Demand Coaching State
  const [aiTip, setAiTip] = useState<string | null>(null);
  const [isAiThinking, setIsAiThinking] = useState<boolean>(false);

  // Target & WaterLogSheet State
  const initialManifest = getBootManifestSync();
  const [waterGoal, setWaterGoal] = useState<number>(initialManifest?.waterGoalMl ?? 3800);
  const [isWaterSheetOpen, setIsWaterSheetOpen] = useState<boolean>(false);
  const [isCustomLogModalOpen, setIsCustomLogModalOpen] = useState<boolean>(false);
  const [customMlInput, setCustomMlInput] = useState<string>('350');

  // Interactive View Mode (Chart vs Daily Table Breakdown)
  const [trendViewMode, setTrendViewMode] = useState<'chart' | 'table'>('chart');

  useEffect(() => {
    const handle = InteractionManager.runAfterInteractions(() => ensureSubscribed?.());
    return () => handle.cancel();
  }, [ensureSubscribed]);

  const days7 = useMemo(() => getPastDays(7), []);
  const days14 = useMemo(() => getPastDays(14), []);
  const todayStr = days7[days7.length - 1];

  // Sync user's saved water goal dynamically across app lifecycle
  const syncWaterGoalFromStorage = useCallback(async () => {
    try {
      const val = await AsyncStorage.getItem('zentrack_water_goal_ml');
      if (val) {
        const parsed = parseInt(val, 10);
        if (!isNaN(parsed) && parsed > 0) {
          setWaterGoal(parsed);
          updateL1Cache('waterGoalMl', parsed);
          return;
        }
      }
      const legacy = await AsyncStorage.getItem('@zentrack_water_target');
      if (legacy) {
        const parsed = parseInt(legacy, 10);
        if (!isNaN(parsed) && parsed > 0) {
          setWaterGoal(parsed);
          updateL1Cache('waterGoalMl', parsed);
        }
      }
    } catch (_) {}
  }, []);

  useEffect(() => {
    syncWaterGoalFromStorage();
  }, [syncWaterGoalFromStorage]);

  useFocusEffect(
    useCallback(() => {
      syncWaterGoalFromStorage();
    }, [syncWaterGoalFromStorage])
  );

  const handleUpdateTarget = useCallback((newGoalMl: number) => {
    if (!newGoalMl || isNaN(newGoalMl) || newGoalMl <= 0) return;
    setWaterGoal(newGoalMl);
    updateL1Cache('waterGoalMl', newGoalMl);
    AsyncStorage.setItem('zentrack_water_goal_ml', String(newGoalMl)).catch(() => {});
    if (user?.uid) {
      queueWrite(COLLECTION.USER_PROFILES, 'update', {
        id: user.uid,
        waterGoalMl: newGoalMl,
        waterTarget: newGoalMl,
        updatedAt: Date.now(),
      }).catch(() => {});
    }
  }, [user?.uid]);

  // ── Quick Log Intake Vessel Action ──────────────────────────────────────────
  const handleQuickLog = async (amountMl: number) => {
    if (amountMl <= 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const newLogId = `local_water_${Date.now()}`;
    optimisticAddWaterLog({
      id: newLogId,
      userId: user?.uid || '',
      date: todayStr,
      amountMl,
      timestamp: Date.now(),
    });

    try {
      await queueWrite(COLLECTION.WATER_LOGS, 'add', {
        userId: user?.uid || '',
        date: todayStr,
        amountMl,
        timestamp: Date.now(),
        createdAt: serverTimestamp(),
      });
      setIsCustomLogModalOpen(false);
    } catch (e) {
      console.warn('[Wellbeing] Error logging water', e);
    }
  };

  // ── Delete a Log Entry ──────────────────────────────────────────────────────
  const handleDeleteLog = (logId: string) => {
    Alert.alert('Remove Log', 'Delete this water intake entry?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          optimisticDeleteWaterLog(logId);
          if (logId && !logId.startsWith('local_')) {
            await queueWrite(COLLECTION.WATER_LOGS, 'delete', null, logId);
          }
        },
      },
    ]);
  };

  // ── Water Metrics ────────────────────────────────────────────────────────
  const waterData7 = useMemo(() => {
    return days7.map((date) => {
      const dayLogs = (waterLogs || []).filter((w) => (w.date || '').slice(0, 10) === date);
      return dayLogs.reduce((sum, log) => sum + (log.amountMl || 0), 0);
    });
  }, [waterLogs, days7]);

  const todayWaterLogs = useMemo(() => {
    return (waterLogs || [])
      .filter((w) => (w.date || '').slice(0, 10) === todayStr)
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  }, [waterLogs, todayStr]);

  const maxWater = Math.max(...waterData7, waterGoal, 1000);
  const waterAvg = Math.round(waterData7.reduce((a, b) => a + b, 0) / 7);
  const todayWater = waterData7[waterData7.length - 1];
  const waterProgress = Math.min(1, todayWater / waterGoal);
  const deficitMl = Math.max(0, waterGoal - todayWater);

  // ── 7-Day Consistency Hit Rate ─────────────────────────────────────────────
  const hitRate7d = useMemo(() => {
    const hits = waterData7.filter((w) => w >= waterGoal).length;
    return Math.round((hits / 7) * 100);
  }, [waterData7, waterGoal]);

  // ── Hydration Streak ───────────────────────────────────────────────────────
  const streakDays = useMemo(() => {
    let streak = 0;
    let checkIdx = days14.length - 1;

    // If today is met, count it and look backward; else start evaluating from yesterday
    if (todayWater >= waterGoal) {
      streak++;
      checkIdx--;
    } else {
      checkIdx--;
    }

    while (checkIdx >= 0) {
      const date = days14[checkIdx];
      const sum = (waterLogs || [])
        .filter((w) => (w.date || '').slice(0, 10) === date)
        .reduce((acc, l) => acc + (l.amountMl || 0), 0);
      if (sum >= waterGoal) {
        streak++;
        checkIdx--;
      } else {
        break;
      }
    }
    return streak;
  }, [waterLogs, waterGoal, days14, todayWater]);

  // ── Circadian Intraday Distribution (Morning vs Afternoon vs Evening) ───────
  const timeOfDayDist = useMemo(() => {
    let morning = 0; // 05:00 - 11:59
    let afternoon = 0; // 12:00 - 16:59
    let evening = 0; // 17:00 - 23:59

    todayWaterLogs.forEach((log) => {
      const ts = log.timestamp ? new Date(log.timestamp) : null;
      const hour = ts ? ts.getHours() : 12;
      const amt = log.amountMl || 0;
      if (hour >= 5 && hour < 12) {
        morning += amt;
      } else if (hour >= 12 && hour < 17) {
        afternoon += amt;
      } else {
        evening += amt;
      }
    });

    const sum = morning + afternoon + evening || 1;
    return {
      morning,
      afternoon,
      evening,
      morningPct: Math.round((morning / sum) * 100),
      afternoonPct: Math.round((afternoon / sum) * 100),
      eveningPct: Math.round((evening / sum) * 100),
    };
  }, [todayWaterLogs]);

  // ── Recommended Hourly Intake Pacing ────────────────────────────────────────
  const hourlyPacing = useMemo(() => {
    if (todayWater >= waterGoal) return { pace: 0, status: 'Completed', label: 'Daily Goal Met' };
    const now = new Date();
    const currentHour = now.getHours() + now.getMinutes() / 60;
    const cutOffHour = 21.5; // 9:30 PM bedtime taper cutoff

    // Night phase: taper fluids to protect slow-wave deep sleep
    if (currentHour >= cutOffHour) {
      return {
        pace: 0,
        status: 'Night Taper',
        label: 'Taper fluids before sleep to protect REM quality',
      };
    }

    const remainingHours = Math.max(1, cutOffHour - currentHour);
    const rawPace = Math.round(deficitMl / remainingHours);
    const pace = Math.min(450, Math.max(150, rawPace));
    const isBehind = currentHour >= 14 && waterProgress < 0.45;
    return {
      pace,
      status: isBehind ? 'Behind Pace' : 'On Pace',
      label: `${pace} ml/hr until 9:30 PM`,
    };
  }, [todayWater, waterGoal, deficitMl, waterProgress]);

  // Load cached AI tip on mount
  useEffect(() => {
    AsyncStorage.getItem(`@zentrack_daily_tip_${todayStr}_water`)
      .then((cached) => {
        if (cached) setAiTip(cached);
      })
      .catch(() => {});
  }, [todayStr]);

  // ── S.A.R.A On-Demand Hydration Analysis ─────────────────────────────────────
  const triggerAiAnalysis = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsAiThinking(true);
    const cacheKey = `@zentrack_daily_tip_${todayStr}_water`;

    try {
      const prompt = `You are S.A.R.A, a high-performance wellness and biohacking AI coach in ZenTrack.
Analyze the user's hydration metrics:
- Daily Target: ${waterGoal} ml (${(waterGoal / 1000).toFixed(1)} L)
- Today's intake: ${todayWater} ml (${Math.round(waterProgress * 100)}%)
- Deficit: ${deficitMl} ml
- 7-Day average: ${waterAvg} ml/day
- 7-Day Hit Rate: ${hitRate7d}%
- Streak: ${streakDays} days
- Circadian breakdown: Morning ${timeOfDayDist.morning}ml, Afternoon ${timeOfDayDist.afternoon}ml, Evening ${timeOfDayDist.evening}ml
- Hourly pace recommendation: ${hourlyPacing.label}
Respond with a strict single JSON object format:
{"coaching_tip": "Your punchy, scientifically grounded 1-2 sentence biohacking hydration advice here"}
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
          : `💧 ${(waterGoal - todayWater).toLocaleString()} ml remaining to reach your optimal ${(waterGoal / 1000).toFixed(1)}L hydration target.`
      );
    } finally {
      setIsAiThinking(false);
    }
  }, [todayStr, todayWater, waterAvg, waterGoal, waterProgress, deficitMl, hitRate7d, streakDays, timeOfDayDist, hourlyPacing]);

  // Chart Coordinates Calculation
  const waterPts = waterData7.map((val, i) => ({
    x: (i / (days7.length - 1)) * CHART_W,
    y: CHART_H - (val / maxWater) * (CHART_H - 28) - 14,
  }));
  const waterPath = smoothPath(waterPts);
  const waterAreaPath = `${waterPath} L ${CHART_W} ${CHART_H} L 0 ${CHART_H} Z`;

  // Target Dotted Line Y-coordinate
  const targetY = CHART_H - (waterGoal / maxWater) * (CHART_H - 28) - 14;

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top']}>
      <StatusBar style={isDark ? 'light' : 'dark'} backgroundColor={colors.background} />

      {/* ── Top Header ── */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Hydration Analytics</Text>
        <TouchableOpacity
          style={[styles.headerQuickLogBtn, { backgroundColor: isDark ? 'rgba(14, 165, 233, 0.16)' : 'rgba(14, 165, 233, 0.1)' }]}
          onPress={() => setIsCustomLogModalOpen(true)}
          hitSlop={8}
        >
          <Ionicons name="add" size={16} color={colors.accentBlue} />
          <Text style={[styles.headerQuickLogBtnText, { color: colors.accentBlue }]}>Log</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── 1. Hero Status Card (Spacious & Clean) ── */}
        <ObsidianCard isDark={isDark} colors={colors} style={styles.card}>
          {/* Top Row: Label on left, Target adjustment pill on right */}
          <View style={styles.heroTopRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="water" size={14} color={colors.accentBlue} />
              <Text style={[styles.heroLabel, { color: colors.accentBlue }]}>TODAY'S HYDRATION</Text>
            </View>

            <TouchableOpacity
              style={[
                styles.targetBadge,
                {
                  backgroundColor: isDark ? 'rgba(14, 165, 233, 0.12)' : 'rgba(14, 165, 233, 0.08)',
                  borderColor: isDark ? 'rgba(14, 165, 233, 0.28)' : 'rgba(14, 165, 233, 0.2)',
                },
              ]}
              onPress={() => setIsWaterSheetOpen(true)}
              activeOpacity={0.7}
              hitSlop={6}
            >
              <Ionicons name="sparkles" size={11} color={colors.accentBlue} />
              <Text style={[styles.targetBadgeText, { color: colors.accentBlue }]}>
                Goal: {(waterGoal / 1000).toFixed(1)}L
              </Text>
              <Ionicons name="pencil" size={10} color={colors.accentBlue} />
            </TouchableOpacity>
          </View>

          {/* Main Value & Ring / Percentage */}
          <View style={styles.heroRow}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setIsWaterSheetOpen(true)}
              style={styles.heroValueRow}
            >
              <Text style={[styles.heroBigValue, { color: colors.textPrimary }]}>
                {(todayWater / 1000).toFixed(1)}
                <Text style={[styles.heroUnit, { color: colors.textMuted }]}>
                  {' '}/ {(waterGoal / 1000).toFixed(1)} L
                </Text>
              </Text>
              <Text style={[styles.heroSubtext, { color: colors.textMuted }]}>
                {todayWater >= waterGoal
                  ? '🎉 Daily target met! Optimal cellular velocity.'
                  : `${(deficitMl / 1000).toFixed(1)} L remaining to hit target`}
              </Text>
            </TouchableOpacity>

            <View
              style={[
                styles.pctBadge,
                {
                  backgroundColor:
                    todayWater >= waterGoal
                      ? isDark
                        ? 'rgba(50, 215, 75, 0.18)'
                        : 'rgba(50, 215, 75, 0.15)'
                      : isDark
                      ? 'rgba(14, 165, 233, 0.15)'
                      : 'rgba(14, 165, 233, 0.1)',
                  borderColor:
                    todayWater >= waterGoal
                      ? 'rgba(50, 215, 75, 0.3)'
                      : isDark
                      ? 'rgba(14, 165, 233, 0.25)'
                      : 'rgba(14, 165, 233, 0.18)',
                },
              ]}
            >
              <Text
                style={[
                  styles.pctText,
                  { color: todayWater >= waterGoal ? '#32D74B' : colors.accentBlue },
                ]}
              >
                {Math.round(waterProgress * 100)}%
              </Text>
              <Text style={[styles.pctSub, { color: todayWater >= waterGoal ? '#32D74B' : colors.accentBlue }]}>
                {todayWater >= waterGoal ? 'MET' : 'PROGRESS'}
              </Text>
            </View>
          </View>

          {/* Progress Bar with Glow Track */}
          <View style={[styles.progressBarTrack, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }]}>
            <View
              style={[
                styles.progressBarFill,
                {
                  width: `${Math.min(100, Math.round(waterProgress * 100))}%`,
                  backgroundColor: todayWater >= waterGoal ? '#32D74B' : colors.accentBlue,
                },
              ]}
            />
          </View>

          {/* Today's Clean Telemetry Mini-Strip */}
          <View style={[styles.heroMiniStrip, { borderColor: isDark ? 'rgba(255,255,255,0.06)' : colors.border }]}>
            <View style={styles.miniStripCol}>
              <Text style={[styles.miniStripLabel, { color: colors.textTertiary }]}>Logged</Text>
              <Text style={[styles.miniStripVal, { color: colors.textPrimary }]}>
                {todayWater >= 1000 ? `${(todayWater / 1000).toFixed(2)} L` : `${todayWater} ml`}
              </Text>
            </View>
            <View style={[styles.miniStripDivider, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : colors.border }]} />
            <View style={styles.miniStripCol}>
              <Text style={[styles.miniStripLabel, { color: colors.textTertiary }]}>Deficit</Text>
              <Text style={[styles.miniStripVal, { color: deficitMl === 0 ? '#32D74B' : colors.textPrimary }]}>
                {deficitMl === 0 ? '0 L' : `${(deficitMl / 1000).toFixed(2)} L`}
              </Text>
            </View>
            <View style={[styles.miniStripDivider, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : colors.border }]} />
            <View style={styles.miniStripCol}>
              <Text style={[styles.miniStripLabel, { color: colors.textTertiary }]}>Pacing</Text>
              <Text
                style={[
                  styles.miniStripVal,
                  {
                    color:
                      hourlyPacing.status === 'Completed'
                        ? '#32D74B'
                        : hourlyPacing.status === 'Night Taper'
                        ? colors.accentBlue
                        : hourlyPacing.status === 'Behind Pace'
                        ? '#F59E0B'
                        : colors.accentBlue,
                  },
                ]}
              >
                {hourlyPacing.status}
              </Text>
            </View>
          </View>

          {/* Body Weight Calibration Meta Footer (Single Line, No Overflow) */}
          {userWeight ? (
            <TouchableOpacity
              style={[styles.heroFooterMeta, { borderTopColor: isDark ? 'rgba(255,255,255,0.06)' : colors.border }]}
              onPress={() => setIsWaterSheetOpen(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="fitness-outline" size={13} color={colors.accentBlue} />
              <Text style={[styles.heroFooterMetaText, { color: colors.textTertiary }]} numberOfLines={1}>
                Calibrated for your <Text style={{ fontFamily: FONT_FAMILY.bold, color: colors.textSecondary }}>{userWeight}kg</Text> weight (40ml/kg)
              </Text>
              <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 11, color: colors.accentBlue, marginLeft: 'auto' }}>
                Adjust ❯
              </Text>
            </TouchableOpacity>
          ) : null}
        </ObsidianCard>

        {/* ── 2. Quick Log Vessel Carousel (Spacious Horizontal Scroll) ── */}
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Quick Hydrate</Text>
          <Text style={{ fontSize: 11, color: colors.textTertiary, fontFamily: FONT_FAMILY.medium }}>
            0-Tap Vessel Log
          </Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.vesselCarousel}
        >
          {[
            { ml: 250, label: 'Glass', icon: 'water-outline', sub: '250 ml' },
            { ml: 500, label: 'Bottle', icon: 'flask-outline', sub: '500 ml' },
            { ml: 750, label: 'Sipper', icon: 'pint-outline', sub: '750 ml' },
            { ml: 1000, label: 'Flask', icon: 'beaker-outline', sub: '1.0 L' },
            { ml: 0, label: 'Custom', icon: 'options-outline', sub: 'Exact' },
          ].map((vessel) => (
            <TouchableOpacity
              key={vessel.label}
              style={[
                styles.vesselCard,
                {
                  backgroundColor: isDark ? '#141420' : colors.surface,
                  borderColor: isDark ? 'rgba(14, 165, 233, 0.18)' : colors.border,
                },
              ]}
              onPress={() => {
                if (vessel.ml > 0) {
                  handleQuickLog(vessel.ml);
                } else {
                  setIsCustomLogModalOpen(true);
                }
              }}
              activeOpacity={0.7}
            >
              <View
                style={[
                  styles.vesselIconWrap,
                  { backgroundColor: isDark ? 'rgba(14, 165, 233, 0.12)' : 'rgba(14, 165, 233, 0.08)' },
                ]}
              >
                <Ionicons name={vessel.icon as any} size={20} color={colors.accentBlue} />
              </View>
              <Text style={[styles.vesselSub, { color: colors.textPrimary }]}>{vessel.sub}</Text>
              <Text style={[styles.vesselLabel, { color: colors.textTertiary }]}>{vessel.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* ── 3. 4-Metric Key Vitality Telemetry Grid ── */}
        <View style={styles.metricGrid}>
          {/* Card 1: Streak */}
          <ObsidianCard isDark={isDark} colors={colors} style={styles.metricCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={[styles.metricLabel, { color: colors.textTertiary }]}>Streak</Text>
              <Ionicons name="flame" size={15} color="#FF9500" />
            </View>
            <Text style={[styles.metricVal, { color: colors.textPrimary }]}>
              {streakDays} <Text style={{ fontSize: 13, fontFamily: FONT_FAMILY.medium, color: colors.textTertiary }}>days</Text>
            </Text>
            <Text style={[styles.metricSub, { color: colors.textMuted }]}>
              {streakDays > 0 ? 'Consistency on track' : 'Hit target to ignite streak'}
            </Text>
          </ObsidianCard>

          {/* Card 2: 7D Hit Rate */}
          <ObsidianCard isDark={isDark} colors={colors} style={styles.metricCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={[styles.metricLabel, { color: colors.textTertiary }]}>7D Hit Rate</Text>
              <Ionicons name="trending-up" size={15} color={colors.accentGreen} />
            </View>
            <Text style={[styles.metricVal, { color: colors.textPrimary }]}>
              {hitRate7d}<Text style={{ fontSize: 13, fontFamily: FONT_FAMILY.medium, color: colors.textTertiary }}>%</Text>
            </Text>
            <Text style={[styles.metricSub, { color: colors.textMuted }]}>
              {waterData7.filter((w) => w >= waterGoal).length} of 7 days completed
            </Text>
          </ObsidianCard>

          {/* Card 3: Recommended Hourly Pace (Bug-Free Biohacking Pacing) */}
          <ObsidianCard isDark={isDark} colors={colors} style={styles.metricCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={[styles.metricLabel, { color: colors.textTertiary }]}>Pacing</Text>
              <Ionicons name="speedometer-outline" size={15} color={colors.accentBlue} />
            </View>
            <Text style={[styles.metricVal, { color: colors.textPrimary, fontSize: hourlyPacing.status === 'Night Taper' ? 17 : 20 }]}>
              {hourlyPacing.status === 'Night Taper'
                ? 'Night Taper'
                : hourlyPacing.pace > 0
                ? `${hourlyPacing.pace} ml`
                : 'Completed'}
            </Text>
            <Text style={[styles.metricSub, { color: colors.textMuted }]}>
              {hourlyPacing.status === 'Night Taper'
                ? 'Sleep fluid protection'
                : hourlyPacing.pace > 0
                ? 'PerHour to hit target'
                : 'Rest cellular absorption'}
            </Text>
          </ObsidianCard>

          {/* Card 4: Cellular Hydration Index */}
          <ObsidianCard isDark={isDark} colors={colors} style={styles.metricCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <Text style={[styles.metricLabel, { color: colors.textTertiary }]}>Hydration Index</Text>
              <Ionicons name="pulse-outline" size={15} color="#A78BFA" />
            </View>
            <Text style={[styles.metricVal, { color: colors.textPrimary, fontSize: 18 }]}>
              {waterProgress >= 1 ? 'Peak' : waterProgress >= 0.6 ? 'Optimal' : waterProgress >= 0.3 ? 'Sub-optimal' : 'Depleted'}
            </Text>
            <Text style={[styles.metricSub, { color: colors.textMuted }]}>
              Fluid & Electrolyte balance
            </Text>
          </ObsidianCard>
        </View>

        {/* ── 4. 7-Day Trend Card (Chart or Detailed Breakdown) ── */}
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>7-Day Intake Trend</Text>
          <View style={[styles.viewToggleWrap, { backgroundColor: isDark ? '#1C1B2B' : colors.surface2 }]}>
            <TouchableOpacity
              style={[styles.viewToggleBtn, trendViewMode === 'chart' && styles.viewToggleBtnActive]}
              onPress={() => setTrendViewMode('chart')}
            >
              <Ionicons name="analytics" size={14} color={trendViewMode === 'chart' ? '#fff' : colors.textTertiary} />
              <Text style={[styles.viewToggleText, trendViewMode === 'chart' && styles.viewToggleTextActive]}>Curve</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.viewToggleBtn, trendViewMode === 'table' && styles.viewToggleBtnActive]}
              onPress={() => setTrendViewMode('table')}
            >
              <Ionicons name="list" size={14} color={trendViewMode === 'table' ? '#fff' : colors.textTertiary} />
              <Text style={[styles.viewToggleText, trendViewMode === 'table' && styles.viewToggleTextActive]}>Days</Text>
            </TouchableOpacity>
          </View>
        </View>

        <ObsidianCard style={styles.card} isDark={isDark} colors={colors}>
          <View style={styles.statRow}>
            <View>
              <Text style={[styles.statLabel, { color: colors.textTertiary }]}>7-Day Average</Text>
              <Text style={[styles.statValue, { color: colors.textPrimary }]}>
                {(waterAvg / 1000).toFixed(2)}{' '}
                <Text style={[styles.statUnit, { color: colors.textTertiary }]}>L / day</Text>
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[styles.statLabel, { color: colors.textTertiary }]}>Target Comparison</Text>
              <Text
                style={[
                  styles.statValue,
                  {
                    color: waterAvg >= waterGoal ? '#32D74B' : colors.accentBlue,
                    fontSize: 15,
                    marginTop: 3,
                  },
                ]}
              >
                {waterAvg >= waterGoal
                  ? `⚡ +${((waterAvg - waterGoal) / 1000).toFixed(1)}L over goal`
                  : `💧 -${((waterGoal - waterAvg) / 1000).toFixed(1)}L avg deficit`}
              </Text>
            </View>
          </View>

          {trendViewMode === 'chart' ? (
            /* Bezier Curve with Goal Baseline Line */
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

                {/* Horizontal reference lines */}
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

                {/* Target Baseline Line (Dashed) */}
                <Line
                  x1="0"
                  y1={targetY}
                  x2={CHART_W}
                  y2={targetY}
                  stroke={colors.accentBlue}
                  strokeWidth="1.2"
                  strokeDasharray="4, 4"
                  opacity={0.5}
                />

                {/* Shaded Area & Bezier Stroke */}
                <Path d={waterAreaPath} fill="url(#waterGrad)" />
                <Path
                  d={waterPath}
                  fill="none"
                  stroke="url(#waterLineGrad)"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {/* Data Points */}
                {waterPts.map((p, i) => {
                  const isHit = waterData7[i] >= waterGoal;
                  return (
                    <Circle
                      key={i}
                      cx={p.x}
                      cy={p.y}
                      r={i === 6 ? 5.5 : 4}
                      fill={isHit ? '#32D74B' : isDark ? '#00d2ff' : colors.accentBlue}
                      stroke={isDark ? '#13121D' : '#ffffff'}
                      strokeWidth={1.5}
                    />
                  );
                })}
              </Svg>

              <View style={styles.xLabels}>
                {days7.map((d, i) => (
                  <Text
                    key={i}
                    style={[
                      styles.xLabelText,
                      {
                        color:
                          i === 6
                            ? colors.accentBlue
                            : isDark
                            ? 'rgba(255,255,255,0.6)'
                            : colors.textPrimary,
                        fontWeight: i === 6 ? '700' : '400',
                      },
                    ]}
                  >
                    {i === 6 ? 'Today' : getDayLabel(d)}
                  </Text>
                ))}
              </View>

              <View style={styles.chartLegendRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={[styles.legendDot, { backgroundColor: '#32D74B' }]} />
                  <Text style={[styles.legendText, { color: colors.textTertiary }]}>Target Hit</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={[styles.legendLine, { borderColor: colors.accentBlue }]} />
                  <Text style={[styles.legendText, { color: colors.textTertiary }]}>
                    Goal Line ({(waterGoal / 1000).toFixed(1)}L)
                  </Text>
                </View>
              </View>
            </View>
          ) : (
            /* 7-Day Detailed Breakdown Table */
            <View style={styles.breakdownTable}>
              {days7.slice().reverse().map((date, idx) => {
                const dayLogs = (waterLogs || []).filter((w) => (w.date || '').slice(0, 10) === date);
                const totalMl = dayLogs.reduce((sum, l) => sum + (l.amountMl || 0), 0);
                const isMet = totalMl >= waterGoal;
                const pct = Math.min(100, Math.round((totalMl / waterGoal) * 100));
                const isToday = idx === 0;

                return (
                  <View key={date} style={[styles.breakdownRow, { borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : colors.border }]}>
                    <View style={{ width: 85 }}>
                      <Text style={[styles.breakdownDay, { color: isToday ? colors.accentBlue : colors.textPrimary }]}>
                        {isToday ? 'Today' : getDayLabel(date)}
                      </Text>
                      <Text style={[styles.breakdownDate, { color: colors.textTertiary }]}>
                        {date.slice(5)}
                      </Text>
                    </View>

                    <View style={{ flex: 1, marginHorizontal: 12 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                        <Text style={{ fontSize: 12, fontFamily: FONT_FAMILY.bold, color: colors.textPrimary }}>
                          {(totalMl / 1000).toFixed(1)} L
                        </Text>
                        <Text style={{ fontSize: 11, fontFamily: FONT_FAMILY.medium, color: isMet ? '#32D74B' : colors.textTertiary }}>
                          {pct}%
                        </Text>
                      </View>
                      <View style={[styles.breakdownTrack, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' }]}>
                        <View
                          style={[
                            styles.breakdownFill,
                            {
                              width: `${pct}%`,
                              backgroundColor: isMet ? '#32D74B' : colors.accentBlue,
                            },
                          ]}
                        />
                      </View>
                    </View>

                    <View style={[styles.statusPill, { backgroundColor: isMet ? 'rgba(50, 215, 75, 0.14)' : 'rgba(245, 158, 11, 0.12)' }]}>
                      <Text style={[styles.statusPillText, { color: isMet ? '#32D74B' : '#F59E0B' }]}>
                        {isMet ? 'Met' : 'Deficit'}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}

          {/* S.A.R.A Hydration Coaching Card */}
          {aiTip ? (
            <View
              style={[
                styles.tipBox,
                {
                  backgroundColor: isDark ? '#1C1B2B' : '#F6F5FB',
                  borderColor: isDark ? 'rgba(165,153,255,0.2)' : colors.border,
                },
              ]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="sparkles" size={15} color="#0ea5e9" />
                  <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 12, color: '#0ea5e9' }}>
                    S.A.R.A Hydration Coaching
                  </Text>
                </View>
                <TouchableOpacity onPress={triggerAiAnalysis} hitSlop={10} disabled={isAiThinking}>
                  {isAiThinking ? (
                    <ActivityIndicator size="small" color="#0ea5e9" />
                  ) : (
                    <Ionicons name="refresh" size={14} color={colors.textMuted} />
                  )}
                </TouchableOpacity>
              </View>
              <Text style={[styles.tipText, { color: colors.textPrimary }]}>"{aiTip}"</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[
                styles.aiAnalyzeBtn,
                {
                  backgroundColor: isDark ? '#1A222E' : '#F0F8FF',
                  borderColor: isDark ? 'rgba(14,165,233,0.25)' : colors.border,
                },
              ]}
              onPress={triggerAiAnalysis}
              disabled={isAiThinking}
            >
              {isAiThinking ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <ActivityIndicator size="small" color="#0ea5e9" />
                  <Text style={{ fontFamily: FONT_FAMILY.medium, fontSize: 13, color: '#0ea5e9' }}>
                    Analyzing biohacking metrics...
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

        {/* ── 5. Intraday Circadian Intake Distribution ── */}
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Intraday Fluid Distribution</Text>
        <ObsidianCard style={styles.card} isDark={isDark} colors={colors}>
          <Text style={{ fontSize: 12, fontFamily: FONT_FAMILY.medium, color: colors.textSecondary, marginBottom: 12 }}>
            Absorption rhythm across today's circadian phases
          </Text>

          {/* Tri-color Segmented Progress Bar */}
          <View style={styles.intradayTrack}>
            <View style={[styles.intradaySeg, { flex: Math.max(1, timeOfDayDist.morning), backgroundColor: '#0EA5E9' }]} />
            <View style={[styles.intradaySeg, { flex: Math.max(1, timeOfDayDist.afternoon), backgroundColor: '#38BDF8' }]} />
            <View style={[styles.intradaySeg, { flex: Math.max(1, timeOfDayDist.evening), backgroundColor: '#818CF8' }]} />
          </View>

          {/* Breakdown Badges */}
          <View style={styles.intradayLegends}>
            <View style={styles.intradayLegendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#0EA5E9' }]} />
              <View>
                <Text style={[styles.intradayLegendTitle, { color: colors.textPrimary }]}>Morning</Text>
                <Text style={[styles.intradayLegendSub, { color: colors.textTertiary }]}>
                  {timeOfDayDist.morning} ml ({timeOfDayDist.morningPct}%)
                </Text>
              </View>
            </View>

            <View style={styles.intradayLegendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#38BDF8' }]} />
              <View>
                <Text style={[styles.intradayLegendTitle, { color: colors.textPrimary }]}>Afternoon</Text>
                <Text style={[styles.intradayLegendSub, { color: colors.textTertiary }]}>
                  {timeOfDayDist.afternoon} ml ({timeOfDayDist.afternoonPct}%)
                </Text>
              </View>
            </View>

            <View style={styles.intradayLegendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#818CF8' }]} />
              <View>
                <Text style={[styles.intradayLegendTitle, { color: colors.textPrimary }]}>Evening</Text>
                <Text style={[styles.intradayLegendSub, { color: colors.textTertiary }]}>
                  {timeOfDayDist.evening} ml ({timeOfDayDist.eveningPct}%)
                </Text>
              </View>
            </View>
          </View>
        </ObsidianCard>

        {/* ── 6. Today's Intake Log Feed ── */}
        <View style={styles.sectionHeaderRow}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Today's Log Entries</Text>
          <Text style={{ fontSize: 11, color: colors.textTertiary, fontFamily: FONT_FAMILY.medium }}>
            {todayWaterLogs.length} {todayWaterLogs.length === 1 ? 'entry' : 'entries'}
          </Text>
        </View>

        <ObsidianCard style={styles.card} isDark={isDark} colors={colors}>
          {todayWaterLogs.length === 0 ? (
            <View style={{ alignItems: 'center', paddingVertical: 20 }}>
              <Ionicons name="water-outline" size={32} color={colors.accentBlue} style={{ opacity: 0.5, marginBottom: 8 }} />
              <Text style={{ fontFamily: FONT_FAMILY.medium, fontSize: 14, color: colors.textPrimary }}>
                No water logged yet today
              </Text>
              <Text style={{ fontFamily: FONT_FAMILY.body, fontSize: 12, color: colors.textTertiary, textAlign: 'center', marginTop: 4 }}>
                Tap any vessel above to quickly record your fluid intake.
              </Text>
            </View>
          ) : (
            <View style={styles.logsList}>
              {todayWaterLogs.map((log) => (
                <View
                  key={log.id}
                  style={[
                    styles.logEntryRow,
                    { borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : colors.border },
                  ]}
                >
                  <View style={[styles.logIconBox, { backgroundColor: isDark ? 'rgba(14,165,233,0.14)' : 'rgba(14,165,233,0.08)' }]}>
                    <Ionicons
                      name={log.amountMl >= 1000 ? 'beaker-outline' : log.amountMl >= 500 ? 'flask-outline' : 'water-outline'}
                      size={18}
                      color={colors.accentBlue}
                    />
                  </View>

                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 15, color: colors.textPrimary }}>
                      +{log.amountMl} ml
                    </Text>
                    <Text style={{ fontFamily: FONT_FAMILY.body, fontSize: 11, color: colors.textTertiary }}>
                      {formatLogTime(log.timestamp)}
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={styles.logDeleteBtn}
                    onPress={() => handleDeleteLog(log.id)}
                    hitSlop={10}
                  >
                    <Ionicons name="trash-outline" size={16} color={colors.textTertiary} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </ObsidianCard>

        {/* ── 7. Circadian Hydration Pacing Protocol (Biohacking Guide) ── */}
        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Optimal Circadian Protocol</Text>
        <ObsidianCard style={styles.card} isDark={isDark} colors={colors}>
          <View style={styles.protocolList}>
            {[
              {
                time: '07:00 – 10:00',
                title: 'Dawn Flush',
                ml: '800 ml',
                icon: 'sunny-outline',
                desc: 'Rehydrates overnight fluid loss, fires morning metabolic rate, and reduces cortisol peaks.',
              },
              {
                time: '10:00 – 14:00',
                title: 'Cognitive Velocity',
                ml: '1,200 ml',
                icon: 'bulb-outline',
                desc: 'Maintains optimal brain volume and neural transmission during peak analytical work.',
              },
              {
                time: '14:00 – 18:00',
                title: 'Physical & Training Satiety',
                ml: '1,200 ml',
                icon: 'barbell-outline',
                desc: 'Pre-load and replenish muscle glycogen water storage around resistance training.',
              },
              {
                time: '18:00 – 21:30',
                title: 'Night Taper',
                ml: '600 ml',
                icon: 'moon-outline',
                desc: 'Sip gently and taper fluids 2 hours before bed to protect uninterrupted deep slow-wave sleep.',
              },
            ].map((phase, idx) => (
              <View key={phase.title} style={[styles.protocolItem, idx < 3 && { borderBottomColor: isDark ? 'rgba(255,255,255,0.06)' : colors.border, borderBottomWidth: 1 }]}>
                <View style={[styles.protocolIconWrap, { backgroundColor: isDark ? '#1C1A2E' : colors.surface2 }]}>
                  <Ionicons name={phase.icon as any} size={18} color={colors.accentBlue} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 13.5, color: colors.textPrimary }}>
                      {phase.title}
                    </Text>
                    <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 12, color: colors.accentBlue }}>
                      {phase.ml}
                    </Text>
                  </View>
                  <Text style={{ fontFamily: FONT_FAMILY.medium, fontSize: 11, color: colors.accentBlue, marginTop: 1 }}>
                    {phase.time}
                  </Text>
                  <Text style={{ fontFamily: FONT_FAMILY.body, fontSize: 11.5, color: colors.textTertiary, marginTop: 3, lineHeight: 16 }}>
                    {phase.desc}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </ObsidianCard>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── Hydration Tracker Sheet (Synced with Weight & Reminders) ── */}
      {isWaterSheetOpen && (
        <WaterLogSheet
          visible={isWaterSheetOpen}
          onClose={() => setIsWaterSheetOpen(false)}
          userId={user?.uid || ''}
          target={waterGoal}
          onUpdateTarget={handleUpdateTarget}
          hideDashboardBtn={true}
        />
      )}

      {/* ── Custom Log Modal ── */}
      <Modal visible={isCustomLogModalOpen} transparent animationType="fade" onRequestClose={() => setIsCustomLogModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: isDark ? '#181726' : colors.surface, borderColor: isDark ? 'rgba(165, 153, 255, 0.2)' : colors.border }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="pint" size={22} color={colors.accentBlue} />
                <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Log Custom Amount</Text>
              </View>
              <TouchableOpacity onPress={() => setIsCustomLogModalOpen(false)} hitSlop={10}>
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={{ fontFamily: FONT_FAMILY.body, fontSize: 13, color: colors.textSecondary, marginBottom: 12 }}>
              Enter exact amount consumed:
            </Text>

            {/* Quick add chips */}
            <View style={styles.presetRow}>
              {[150, 300, 450, 600].map((ml) => (
                <TouchableOpacity
                  key={ml}
                  style={[
                    styles.presetChip,
                    {
                      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : colors.surface2,
                      borderColor: isDark ? 'rgba(255,255,255,0.1)' : colors.border,
                    },
                  ]}
                  onPress={() => {
                    setCustomMlInput(String(ml));
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  }}
                >
                  <Text style={[styles.presetChipText, { color: colors.textPrimary }]}>{ml} ml</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={[styles.inputRow, { borderColor: colors.border, backgroundColor: isDark ? '#11101A' : colors.surface2 }]}>
              <TextInput
                style={[styles.modalInput, { color: colors.textPrimary }]}
                value={customMlInput}
                onChangeText={setCustomMlInput}
                keyboardType="number-pad"
                placeholder="350"
                placeholderTextColor={colors.textTertiary}
                autoFocus
                selectTextOnFocus
              />
              <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 15, color: colors.textSecondary, paddingRight: 14 }}>
                ml
              </Text>
            </View>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
              <TouchableOpacity
                style={[styles.modalCancelBtn, { borderColor: colors.border }]}
                onPress={() => setIsCustomLogModalOpen(false)}
              >
                <Text style={{ fontFamily: FONT_FAMILY.medium, color: colors.textSecondary }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSaveBtn, { backgroundColor: colors.accentBlue }]}
                onPress={() => {
                  const val = parseInt(customMlInput, 10);
                  if (!isNaN(val) && val > 0) {
                    handleQuickLog(val);
                  }
                }}
              >
                <Text style={{ fontFamily: FONT_FAMILY.bold, color: '#ffffff' }}>Add Intake</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
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
    headerTitle: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.lg },
    headerQuickLogBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: RADIUS.full,
    },
    headerQuickLogBtnText: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 12,
    },
    scroll: { flex: 1 },
    scrollContent: {
      paddingHorizontal: SCREEN_PAD,
      paddingTop: 12,
      paddingBottom: 50,
    },
    sectionHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 6,
      marginBottom: 8,
      paddingHorizontal: 4,
    },
    sectionTitle: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: FONT_SIZE.md,
      marginLeft: 4,
    },
    card: {
      marginBottom: 14,
    },
    heroTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    targetBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 4.5,
      borderRadius: 12,
      borderWidth: 1,
    },
    targetBadgeText: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 11.5,
    },
    heroRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 14,
    },
    heroLabel: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 10.5,
      letterSpacing: 1.2,
    },
    heroValueRow: {
      marginTop: 2,
    },
    editTargetBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
    },
    editTargetBtnText: {
      fontFamily: FONT_FAMILY.medium,
      fontSize: 11,
    },
    heroBigValue: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 29,
    },
    heroUnit: {
      fontFamily: FONT_FAMILY.medium,
      fontSize: 15,
    },
    heroSubtext: {
      fontFamily: FONT_FAMILY.body,
      fontSize: 12,
      marginTop: 2,
    },
    pctBadge: {
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: RADIUS.md,
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 70,
    },
    pctText: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 19,
    },
    pctSub: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 8.5,
      letterSpacing: 0.8,
      marginTop: 1,
    },
    progressBarTrack: {
      height: 9,
      borderRadius: 5,
      overflow: 'hidden',
    },
    progressBarFill: {
      height: '100%',
      borderRadius: 5,
    },
    heroMiniStrip: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 14,
      paddingTop: 12,
      borderTopWidth: 1,
    },
    miniStripCol: {
      flex: 1,
      alignItems: 'center',
    },
    miniStripDivider: {
      width: 1,
      height: 24,
    },
    miniStripLabel: {
      fontFamily: FONT_FAMILY.medium,
      fontSize: 10.5,
      marginBottom: 2,
    },
    miniStripVal: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 13,
    },
    heroFooterMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 12,
      paddingTop: 10,
      borderTopWidth: 1,
    },
    heroFooterMetaText: {
      fontFamily: FONT_FAMILY.medium,
      fontSize: 11.5,
      flex: 1,
    },

    // Quick Vessel Carousel (Horizontal Scroll)
    vesselCarousel: {
      flexDirection: 'row',
      paddingVertical: 2,
      paddingRight: 16,
      gap: 10,
      marginBottom: 16,
    },
    vesselCard: {
      width: 78,
      borderRadius: 16,
      borderWidth: 1,
      paddingVertical: 12,
      paddingHorizontal: 4,
      alignItems: 'center',
      justifyContent: 'center',
    },
    vesselIconWrap: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 6,
    },
    vesselSub: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 11.5,
    },
    vesselLabel: {
      fontFamily: FONT_FAMILY.body,
      fontSize: 9.5,
      marginTop: 2,
    },

    // 4-Metric Grid
    metricGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      marginBottom: 14,
    },
    metricCard: {
      width: (SCREEN_WIDTH - SCREEN_PAD * 2 - 10) / 2,
      padding: 12,
      borderRadius: 16,
    },
    metricLabel: {
      fontFamily: FONT_FAMILY.medium,
      fontSize: 11,
    },
    metricVal: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 22,
      marginBottom: 2,
    },
    metricSub: {
      fontFamily: FONT_FAMILY.body,
      fontSize: 10.5,
    },

    // Trend View Toggle
    viewToggleWrap: {
      flexDirection: 'row',
      padding: 2,
      borderRadius: 10,
    },
    viewToggleBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
    },
    viewToggleBtnActive: {
      backgroundColor: '#0EA5E9',
    },
    viewToggleText: {
      fontFamily: FONT_FAMILY.medium,
      fontSize: 11,
    },
    viewToggleTextActive: {
      color: '#fff',
      fontFamily: FONT_FAMILY.bold,
    },

    statRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    statLabel: {
      fontFamily: FONT_FAMILY.medium,
      fontSize: 11,
      marginBottom: 2,
    },
    statValue: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 20,
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
      marginTop: 8,
    },
    xLabelText: {
      fontFamily: FONT_FAMILY.body,
      fontSize: 10,
    },
    chartLegendRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 14,
      marginTop: 10,
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
    },
    legendDot: {
      width: 7,
      height: 7,
      borderRadius: 3.5,
    },
    legendLine: {
      width: 14,
      borderTopWidth: 1.5,
      borderStyle: 'dashed',
    },
    legendText: {
      fontFamily: FONT_FAMILY.medium,
      fontSize: 10,
    },

    // Breakdown Table
    breakdownTable: {
      marginVertical: 4,
    },
    breakdownRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      borderBottomWidth: 1,
    },
    breakdownDay: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 13,
    },
    breakdownDate: {
      fontFamily: FONT_FAMILY.body,
      fontSize: 10.5,
    },
    breakdownTrack: {
      height: 6,
      borderRadius: 3,
      overflow: 'hidden',
    },
    breakdownFill: {
      height: '100%',
      borderRadius: 3,
    },
    statusPill: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
    },
    statusPillText: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 10.5,
    },

    // Intraday Distribution
    intradayTrack: {
      flexDirection: 'row',
      height: 10,
      borderRadius: 5,
      overflow: 'hidden',
      marginBottom: 12,
      backgroundColor: 'rgba(255,255,255,0.05)',
    },
    intradaySeg: {
      height: '100%',
    },
    intradayLegends: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    intradayLegendItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    intradayLegendTitle: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 12,
    },
    intradayLegendSub: {
      fontFamily: FONT_FAMILY.body,
      fontSize: 10.5,
      marginTop: 1,
    },

    // Today's Logs List
    logsList: {
      marginVertical: 2,
    },
    logEntryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 9,
      borderBottomWidth: 1,
    },
    logIconBox: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    logDeleteBtn: {
      padding: 6,
    },

    // Circadian Protocol
    protocolList: {
      marginVertical: 2,
    },
    protocolItem: {
      flexDirection: 'row',
      paddingVertical: 10,
    },
    protocolIconWrap: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 2,
    },

    tipBox: {
      padding: 12,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      marginTop: 12,
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
      marginTop: 12,
    },

    // Modals
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.65)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    modalCard: {
      width: '100%',
      maxWidth: 380,
      borderRadius: 20,
      borderWidth: 1,
      padding: 20,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.35,
      shadowRadius: 16,
      elevation: 8,
    },
    modalTitle: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 18,
    },
    presetRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 14,
      gap: 6,
    },
    presetChip: {
      flex: 1,
      paddingVertical: 8,
      borderRadius: 10,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    presetChipText: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 12,
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 12,
      borderWidth: 1,
      overflow: 'hidden',
    },
    modalInput: {
      flex: 1,
      paddingHorizontal: 16,
      paddingVertical: 12,
      fontFamily: FONT_FAMILY.bold,
      fontSize: 20,
    },
    modalCancelBtn: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 12,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalSaveBtn: {
      flex: 1.5,
      paddingVertical: 12,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });