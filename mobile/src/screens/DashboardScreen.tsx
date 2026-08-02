import React, { useRef, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, KeyboardAvoidingView, Platform } from 'react-native';
import Animated, { FadeInDown, useSharedValue, useAnimatedStyle, withSequence, withDelay, withSpring, withTiming, runOnJS } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS } from '../theme/tokens';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMobileData } from '../contexts/MobileDataContext';
import AnimatedPressable from '../components/AnimatedPressable';
import { BRUTAL_QUOTES, getDailyQuote, QuotePersonality } from '../data/brutalQuotes';
import { WEEKDAY_TO_PLAN, GYM_PLAN } from '../data/gymPlan';
import { getCustomPlanDay } from '../hooks/useGymLog';
import QuickCaptureSheet from '../components/Dashboard/QuickCaptureSheet';
import DashboardLayoutSheet, { LayoutItem } from '../components/Dashboard/DashboardLayoutSheet';
import WaterLogSheet from '../components/Dashboard/WaterLogSheet';
import SleepLogSheet from '../components/Dashboard/SleepLogSheet';
import { useTheme } from "../contexts/ThemeContext";
import { useSaraSurface } from '../hooks/useSaraSurface';
import SaraHUDBanner from '../components/SARA/SaraHUDBanner';
import { getFingerprint } from '../services/saraMemory';
import BlockCalendar from '../components/PlacementHub/BlockCalendar';
import { usePlacementData } from '../hooks/usePlacementData';

// ─── XP Level thresholds ─────────────────────────────────────────────────────

const XP_LEVELS = [
  { min: 0,     label: 'Initiate'   },
  { min: 500,   label: 'Operator'   },
  { min: 1500,  label: 'Commander'  },
  { min: 3500,  label: 'Strategist' },
  { min: 7000,  label: 'Vanguard'   },
  { min: 13000, label: 'Architect'  },
  { min: 22000, label: 'Legend'     },
  { min: 35000, label: 'Mythic'     },
];

function getLevel(xp: number) {
  let level = XP_LEVELS[0];
  let next = XP_LEVELS[1];
  for (let i = 0; i < XP_LEVELS.length; i++) {
    if (xp >= XP_LEVELS[i].min) {
      level = XP_LEVELS[i];
      next = XP_LEVELS[i + 1] || XP_LEVELS[i];
    }
  }
  const progress = next.min !== level.min
    ? (xp - level.min) / (next.min - level.min)
    : 1;
  return { label: level.label, progress: Math.min(progress, 1), xp, nextXP: next.min };
}

// ─── Habit Ring SVG ───────────────────────────────────────────────────────────

const RING_SIZE = 36;
const RING_STROKE = 3.5;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function HabitRing({ completed, total }: { completed: number; total: number }) {
    const { colors, isDark } = useTheme();
    const s = makeStyles(colors);
  const progress = total > 0 ? Math.min(completed / total, 1) : 0;
  const strokeDash = RING_CIRCUMFERENCE * (1 - progress);
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', width: RING_SIZE, height: RING_SIZE }}>
      <Svg width={RING_SIZE} height={RING_SIZE} style={{ position: 'absolute' }}>
        {/* Track */}
        <Circle
          cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_RADIUS}
          strokeWidth={RING_STROKE}
          stroke={colors.border}
          fill="none"
        />
        {/* Progress */}
        <Circle
          cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_RADIUS}
          strokeWidth={RING_STROKE}
          stroke={progress >= 1 ? colors.accentGreen : colors.accentPrimary}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`}
          strokeDashoffset={strokeDash}
          rotation="-90"
          origin={`${RING_SIZE / 2}, ${RING_SIZE / 2}`}
        />
      </Svg>
      <Text style={{
        fontFamily: FONT_FAMILY.bold,
        fontSize: 9,
        color: progress >= 1 ? colors.accentGreen : colors.textMuted,
        lineHeight: 11,
      }}>
        {completed}/{total}
      </Text>
    </View>
  );
}

function WaterRing({ completed, total }: { completed: number; total: number }) {
  const { colors, isDark } = useTheme();
  const progress = total > 0 ? Math.min(completed / total, 1) : 0;
  const strokeDash = RING_CIRCUMFERENCE * (1 - progress);
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', width: RING_SIZE, height: RING_SIZE }}>
      <Svg width={RING_SIZE} height={RING_SIZE} style={{ position: 'absolute' }}>
        <Circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_RADIUS} strokeWidth={RING_STROKE} stroke={colors.border} fill="none" />
        <Circle
          cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_RADIUS}
          strokeWidth={RING_STROKE}
          // accentBlue (#89dceb) = water completion (semantically: blue = water)
          // accentPrimary (#a599ff) = in-progress Sara violet
          stroke={progress >= 1 ? colors.accentBlue : colors.accentPrimary}
          fill="none" strokeLinecap="round" strokeDasharray={`${RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`}
          strokeDashoffset={strokeDash} rotation="-90" origin={`${RING_SIZE / 2}, ${RING_SIZE / 2}`}
        />
      </Svg>
      <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 9, color: progress >= 1 ? colors.accentBlue : colors.textMuted, lineHeight: 11 }}>
        {Math.round(completed/1000 * 10)/10}L
      </Text>
    </View>
  );
}

// ─── XP Pop-up Banner ─────────────────────────────────────────────────────────

function XPPopup({ amount, onDone }: { amount: number; onDone: () => void }) {
    const { colors, isDark } = useTheme();
    const s = makeStyles(colors);
  const anim = useSharedValue(0);
  
  useEffect(() => {
    anim.value = withSequence(
      withSpring(1, { damping: 15, stiffness: 180 }),
      withDelay(900, withTiming(0, { duration: 300 }, (finished) => {
        if (finished) runOnJS(onDone)();
      }))
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: anim.value,
    transform: [
      { scale: 0.7 + (anim.value * 0.3) },
      { translateY: 20 - (anim.value * 20) },
    ],
  }));

  return (
    <Animated.View style={[s.xpPopup, animatedStyle]}>
      <Ionicons name="flash" size={14} color={colors.accentPrimary} style={{ marginRight: 4 }} />
      <Text style={s.xpPopupText}>+{amount} XP</Text>
    </Animated.View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function DashboardScreen() {
    const { colors, isDark } = useTheme();
    const s = makeStyles(colors);
  const insets = useSafeAreaInsets();
  const { user, tasks, gymLogs, userGymPlan, habitLogs, allHabits, attendance, attendanceLogs, assignments, waterLogs, sleepLogs } = useMobileData();
  const navigation = useNavigation<any>();

  const [quote, setQuote] = useState(BRUTAL_QUOTES[0]);
  const [xp, setXp] = useState(0);
  const [prevXp, setPrevXp] = useState(0);
  const [xpGain, setXpGain] = useState<number | null>(null);
  const [captureVisible, setCaptureVisible] = useState(false);
  const defaultLayout: LayoutItem[] = [
    { id: 'quote', hidden: false },
    { id: 'stats', hidden: false },
    { id: 'xp', hidden: false },
    { id: 'agenda', hidden: false }
  ];
  const [layout, setLayout] = useState<LayoutItem[]>(defaultLayout);
  const [layoutSheetVisible, setLayoutSheetVisible] = useState(false);
  const [waterLogVisible, setWaterLogVisible] = useState(false);
  const [sleepLogVisible, setSleepLogVisible] = useState(false);
  const [waterTotal, setWaterTotal] = useState(2500);

  useEffect(() => {
    AsyncStorage.getItem('@zentrack_dashboard_layout').then(val => {
      if (val) {
        try {
          const parsed = JSON.parse(val);
          if (Array.isArray(parsed) && parsed.length === 4) {
            if (typeof parsed[0] === 'string') {
              setLayout(parsed.map((id: string) => ({ id, hidden: false })));
            } else if (parsed[0] && typeof parsed[0].id === 'string') {
              setLayout(parsed);
            } else {
              setLayout(defaultLayout);
            }
          } else {
            setLayout(defaultLayout);
          }
        } catch (e) {
          setLayout(defaultLayout);
        }
      }
    });
    AsyncStorage.getItem('zentrack_water_goal_ml').then(val => {
      if (val) {
        setWaterTotal(parseInt(val, 10));
      } else {
        AsyncStorage.getItem('@zentrack_water_target').then(legacy => {
          if (legacy) setWaterTotal(parseInt(legacy, 10));
        });
      }
    });
  }, []);

  // Cap 5: PSI surface injection
  const psiCtx = React.useMemo(() => ({ tasks: tasks as any[], attendance: attendance as any[], habits: [], habitLogs, gymLogs }), [tasks, attendance, habitLogs, gymLogs]);
  const { surfaceMessage, surfaceActionLabel, dismissBanner } = useSaraSurface('DashboardScreen', psiCtx as any, user?.uid);

  useFocusEffect(
    React.useCallback(() => {
      // Cap 7: BFE-powered quote selection
      const loadBFEQuote = async () => {
        try {
          if (user?.uid) {
            const fp = await getFingerprint(user.uid);
            const q = getDailyQuote(fp.streakPersonality as QuotePersonality);
            setQuote(q);
          } else {
            setQuote(getDailyQuote());
          }
        } catch {
          setQuote(getDailyQuote());
        }
      };
      loadBFEQuote();
      AsyncStorage.getItem('zentrack_xp_v1').then(v => {
        const newXp = parseInt(v || '0', 10);
        setXp(cur => {
          if (cur > 0 && newXp > cur) {
            setXpGain(newXp - cur);
          }
          return newXp;
        });
      });
    }, [user?.uid])
  );

  // ── Entry animations handled by Reanimated layout animations (FadeInDown) ──

  // ── Header / Greeting ──
  const [nowDate, setNowDate] = useState(new Date());

  useEffect(() => {
    // O7 FIX: Force re-render every minute to update next class and time-sensitive stats
    const interval = setInterval(() => setNowDate(new Date()), 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const today        = nowDate;
  const hour         = today.getHours();
  // Day resets at 2 AM local time: before 2 AM is still treated as previous day
  const effectiveDate = new Date(today);
  if (hour < 2) effectiveDate.setDate(effectiveDate.getDate() - 1);
  const todayStr = [effectiveDate.getFullYear(), String(effectiveDate.getMonth()+1).padStart(2,'0'), String(effectiveDate.getDate()).padStart(2,'0')].join('-');
  // Greeting: 0-1 AM = night, 2-11 = morning, 12-16 = afternoon, 17-20 = evening, 21+ = night
  let timeGreeting = 'evening.';
  if (hour >= 21 || hour < 2) timeGreeting = 'night.';
  else if (hour < 12)         timeGreeting = 'morning.';
  else if (hour < 17)         timeGreeting = 'afternoon.';
  const avatarLetter = user?.displayName?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || 'A';

  // ── Stats Memoization ──
  const stats = React.useMemo(() => {
    const todayTasks   = tasks.filter(t => t.date === todayStr);
    const doneTasksCount = todayTasks.filter(t => t.status === 'completed').length;

    // Streak logic
    let currentStreak = 0;
    for (let i = 0; i < 30; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dStr = d.toISOString().slice(0, 10);
      const dayOfWeek  = d.getDay(); // 0 = Sun, 6 = Sat
      const isWeekend  = dayOfWeek === 0 || dayOfWeek === 6;

      const dayTasks       = tasks.filter(t => t.date === dStr);
      const completedTasks = dayTasks.filter(t => t.status === 'completed');
      const dayGym         = gymLogs?.find(g => g.date === dStr);
      const dayHabits      = habitLogs?.filter(l => l.date === dStr) || [];

      const hadAnyActivity = completedTasks.length > 0 || !!dayGym || dayHabits.length > 0;

      // BUG-H2 FIX: Only break the streak on weekdays that had scheduled tasks
      // but ZERO completions. Weekend days and days with no tasks are treated as
      // rest days and never penalize the streak.
      const hadUnfinishedWeekday = !isWeekend && dayTasks.length > 0 && completedTasks.length === 0 && !dayGym && dayHabits.length === 0;

      if (hadAnyActivity) {
        currentStreak++;
      } else if (hadUnfinishedWeekday && i > 0) {
        break; // Only penalize weekdays with ignored scheduled tasks
      }
      // Weekend or no-schedule days: continue without incrementing (rest day, not a break)
    }

    const streakAtRisk = currentStreak > 0 && !tasks.some(t => t.date === todayStr && t.status === 'completed')
      && !gymLogs?.find(g => g.date === todayStr)
      && !habitLogs?.find(l => l.date === todayStr)
      && hour >= 18;

    const activeHabits     = allHabits.filter(h => !h.archived);
    const todayHabitLogs   = habitLogs.filter(l => l.date === todayStr);
    const positiveActiveHabits = activeHabits.filter(h => h.type !== 'negative');
    const habitsCompleted = positiveActiveHabits.filter(h => {
      const log = todayHabitLogs.find(l => l.habitId === h.id && !l.isFreeze);
      if (!log) return false;
      if (h.targetCount && h.targetCount > 0) return (log.count || 0) >= h.targetCount;
      return true;
    }).length;
    const habitsTotal = positiveActiveHabits.length;

    const waterCompleted = (waterLogs || []).filter(w => w.date === todayStr).reduce((sum, log) => sum + log.amountMl, 0);
    // waterTotal is now from state
    const sleepInfo = (sleepLogs || []).sort((a,b) => b.date.localeCompare(a.date))[0];
    const lastNightSleep = sleepInfo ? sleepInfo.hours : null;

    const levelInfo = getLevel(xp);

    const in3days    = new Date();
    in3days.setDate(in3days.getDate() + 3);
    const in3daysStr = in3days.toISOString().slice(0, 10);
    const urgentAssignments = (assignments || [])
      .filter(a => a.status !== 'submitted' && a.status !== 'graded'
        && a.dueDate && a.dueDate >= todayStr && a.dueDate <= in3daysStr)
      .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''))
      .slice(0, 2);

    const formatTimeStr = (tStr: string): string => {
      if (!tStr) return '';
      if (tStr.includes('-')) return tStr.split('-').map(s => formatTimeStr(s.trim())).join(' - ');
      const lower = tStr.toLowerCase();
      if (lower.includes('am') || lower.includes('pm')) return lower.replace(/\s+/g, '');
      const parts = tStr.split(':');
      if (parts.length < 2) return tStr;
      const h = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      if (isNaN(h) || isNaN(m)) return tStr;
      const ampm = h >= 12 ? 'pm' : 'am';
      const hr   = h % 12 || 12;
      return `${hr}:${m.toString().padStart(2, '0')}${ampm}`;
    };

    const dayOfWeek  = today.getDay().toString();
    const DAY_NAMES  = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const todayClasses = attendance?.flatMap(subj => {
      const sch = subj.schedule?.[dayOfWeek] || subj.schedule?.[Number(dayOfWeek)]
        || subj.schedule?.[DAY_NAMES[today.getDay()]]
        || subj.schedule?.[DAY_NAMES[today.getDay()].toLowerCase()];
      if (!sch) return [];
      const cls: any[] = [];
      if (sch.classes) sch.classes.forEach((c: any) => c.time && cls.push({ id: `${subj.id}-class-${c.time}`, title: `${subj.name} Class`, time: c.time, type: 'class', subjectId: subj.id }));
      if (sch.labs)    sch.labs.forEach((l: any)    => l.time && cls.push({ id: `${subj.id}-lab-${l.time}`,   title: `${subj.name} Lab`,   time: l.time, type: 'lab', subjectId: subj.id }));
      return cls;
    }) || [];

    todayClasses.forEach(c => {
      const hasLog = (attendanceLogs || []).some(l => l.date === todayStr && l.subjectId === c.subjectId && l.type === c.type);
      c.isCompleted = hasLog;
    });

    const parseTimeToMins = (tStr: string): number => {
      if (!tStr) return 0;
      const startStr = tStr.split('-')[0].trim().toLowerCase();
      let h = 0;
      let m = 0;
      const isPM = startStr.includes('pm');
      const isAM = startStr.includes('am');
      const cleanStr = startStr.replace(/[a-z\s]/g, '');
      const parts = cleanStr.split(':');
      if (parts.length >= 2) {
        h = parseInt(parts[0], 10) || 0;
        m = parseInt(parts[1], 10) || 0;
      } else {
        h = parseInt(parts[0], 10) || 0;
      }
      if (isPM && h < 12) h += 12;
      if (isAM && h === 12) h = 0;
      return h * 60 + m;
    };

    todayClasses.sort((a, b) => parseTimeToMins(a.time) - parseTimeToMins(b.time));

    let nextClass = null;
    const currentMins = hour * 60 + today.getMinutes();
    for (const c of todayClasses) {
      if (c.time && parseTimeToMins(c.time) > currentMins) {
        nextClass = c;
        break;
      }
    }

    const todayGym      = gymLogs?.find(g => g.date === todayStr);
    const planDayIndex  = WEEKDAY_TO_PLAN[today.getDay()];
    // FIX: Use the user's custom plan day if they have one customised,
    // falling back to the static template. This is the same pattern used
    // everywhere else in the gym module (useGymLog, ExerciseDetailScreen, etc.).
    const plannedDay    = getCustomPlanDay(userGymPlan?.customDays, planDayIndex) ||
                          GYM_PLAN.find(p => p.dayIndex === planDayIndex);
    const isGymScheduled = plannedDay && !plannedDay.isRest;
    const hasAgenda     = todayGym || isGymScheduled || todayClasses.length > 0 || todayTasks.length > 0;

    return {
      todayTasks, doneTasksCount, currentStreak, streakAtRisk,
      habitsCompleted, habitsTotal, waterCompleted, lastNightSleep,
      levelInfo, urgentAssignments, nextClass,
      todayClasses, todayGym, plannedDay, isGymScheduled, hasAgenda, formatTimeStr
    };
  // O7 FIX: Removed 'hour' from dependencies, relying on 'todayStr' instead which updates via the new interval
  }, [tasks, gymLogs, userGymPlan, habitLogs, waterLogs, sleepLogs, allHabits, xp, assignments, attendance, attendanceLogs, todayStr]);

  const {
    todayTasks, doneTasksCount, currentStreak, streakAtRisk,
    habitsCompleted, habitsTotal, waterCompleted, lastNightSleep,
    levelInfo, urgentAssignments, nextClass,
    todayClasses, todayGym, plannedDay, isGymScheduled, hasAgenda, formatTimeStr
  } = stats;

  // Derive in3daysStr outside memo for use in JSX
  const in3days = new Date();
  in3days.setDate(in3days.getDate() + 3);
  const in3daysStr = in3days.toISOString().slice(0, 10);

  // ── Placement Hub — Block Calendar data ──
  const { config: placementConfig } = usePlacementData();

  // ── Safe area bottom ──
  const paddingBottom = insets.bottom + 80;

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      {/* Cap 5: PSI surface banner */}
      <SaraHUDBanner
        message={surfaceMessage || ''}
        visible={!!surfaceMessage}
        onDismiss={dismissBanner}
        actionLabel={surfaceActionLabel || undefined}
      />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[s.scroll, { paddingBottom }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* XP Pop-up overlay */}
          {xpGain !== null && (
            <XPPopup amount={xpGain} onDone={() => setXpGain(null)} />
          )}

          {/* ── Greeting ── */}
          <Animated.View entering={FadeInDown.delay(100).duration(400)} style={s.greetingContainer}>
            <View>
              <Text style={s.greetingGood}>Good</Text>
              <Text style={s.greetingTime}>{timeGreeting}</Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              <AnimatedPressable
                style={s.avatarCircle}
                onPress={() => setLayoutSheetVisible(true)}
              >
                <Ionicons name="options-outline" size={22} color={colors.textPrimary} />
              </AnimatedPressable>
              <AnimatedPressable
                style={s.avatarCircle}
                onPress={() => navigation.navigate('MoreStack', { screen: 'Settings' })}
              >
                {user?.photoURL ? (
                  <Image source={{ uri: user.photoURL }} style={{ width: 36, height: 36, borderRadius: 18 }} />
                ) : (
                  <Text style={s.avatarText}>{avatarLetter}</Text>
                )}
              </AnimatedPressable>
            </View>
          </Animated.View>

          {layout.map((layoutItem) => {
            if (layoutItem.hidden) return null;

            if (layoutItem.id === 'quote') {
              return (
                <View key="quote">
                  {/* ── Daily Quote ── */}
                  <Animated.View entering={FadeInDown.delay(200).duration(400)} style={{
                    marginTop: SPACE.xxl,
                    marginBottom: SPACE.sm,
                  }}>
                    <Text style={s.quoteText}>"{quote.text}"</Text>
                    <Text style={s.quoteAuthor}>— {quote.author}</Text>
                  </Animated.View>
                </View>
              );
            }

            if (layoutItem.id === 'stats') {
              return (
                <View key="stats">
                  {/* ── Active Stats Ribbon ── */}
          <Animated.View entering={FadeInDown.delay(300).duration(400)} style={s.statsContainer}>
            {/* Streak */}
            <AnimatedPressable 
              style={s.statBox}
              activeOpacity={0.7}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                navigation.navigate('MoreStack', { screen: 'StreakDetail' });
              }}
            >
              <Text style={s.statLabel}>STREAK</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={s.statValue}>{currentStreak}d</Text>
                {streakAtRisk && <Text style={{ fontSize: 14 }}>🧊</Text>}
              </View>
              <Text style={s.statTapHint}>tap for history</Text>
            </AnimatedPressable>
            <View style={s.hairlineVertical} />

            {/* Habit Ring — tappable → navigate to Habits */}
            <AnimatedPressable
              style={s.statBox}
              activeOpacity={0.7}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                navigation.navigate('Habits');
              }}
            >
              <Text style={s.statLabel}>HABITS</Text>
              <HabitRing completed={habitsCompleted} total={habitsTotal} />
              {habitsTotal > 0 && (
                <Text style={s.statTapHint}>tap to open</Text>
              )}
            </AnimatedPressable>
            <View style={s.hairlineVertical} />

            {/* Tasks done */}
            <View style={s.statBox}>
              <Text style={s.statLabel}>DONE</Text>
              <Text style={s.statValue}>{doneTasksCount}/{todayTasks.length}</Text>
            </View>
          </Animated.View>

          {/* ── Health & Utilities Row ── */}
          <Animated.View entering={FadeInDown.delay(350).duration(400)} style={s.healthWidgetsRow}>
            {/* Water */}
            <AnimatedPressable
              style={s.healthCard}
              activeOpacity={0.7}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setWaterLogVisible(true);
              }}
            >
              <Text style={s.statLabel}>WATER</Text>
              <WaterRing completed={waterCompleted} total={waterTotal} />
            </AnimatedPressable>

            {/* Sleep */}
            <AnimatedPressable 
              style={s.healthCard}
              activeOpacity={0.7}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setSleepLogVisible(true);
              }}
            >
              <Text style={s.statLabel}>SLEEP</Text>
              <Text style={s.statValue}>{lastNightSleep !== null ? `${lastNightSleep}h` : '--'}</Text>
            </AnimatedPressable>

            {/* Next Class */}
            {nextClass && (
              <View style={s.healthCard}>
                <Text style={s.statLabel}>NEXT CLASS</Text>
                <Text style={[s.statValue, { fontSize: 16 }]}>{formatTimeStr(nextClass.time)}</Text>
                <Text style={[s.statTapHint, { fontSize: 8 }]} numberOfLines={1}>{nextClass.title}</Text>
              </View>
            )}
          </Animated.View>
                </View>
              );
            }

            if (layoutItem.id === 'xp') {
              return (
                <View key="xp">
                  {/* ── Hairline divider between stats and XP bar ── */}
          <View style={s.sectionDivider} />

          {/* ── Bottom Widgets ── */}
          <Animated.View entering={FadeInDown.delay(400).duration(400)}>
            <View style={s.xpContainer}>
              <View style={s.xpRow}>
                <Text style={s.xpLabel}>{levelInfo.label}</Text>
                <Text style={s.xpXpText}>{levelInfo.xp} / {levelInfo.nextXP} XP</Text>
              </View>
              <View style={s.xpBarBg}>
                <View style={[s.xpBarFill, { width: `${levelInfo.progress * 100}%` as any }]} />
              </View>
            </View>

            {/* ── Quick Capture Bar ── */}
            <AnimatedPressable
              style={s.captureBar}
              activeOpacity={0.75}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setCaptureVisible(true);
              }}
            >
              <Ionicons name="add-circle-outline" size={20} color={colors.accentPrimary} />
              <Text style={s.capturePlaceholder}>Capture anything… task, note, habit</Text>
              <Ionicons name="flash-outline" size={16} color={colors.textTertiary} />
            </AnimatedPressable>

            {/* ── Urgent Assignments Banner ── */}
            {urgentAssignments.length > 0 && (
              <AnimatedPressable
                style={s.urgentBanner}
                activeOpacity={0.8}
                onPress={() => navigation.navigate('Assignments')}
              >
                <Ionicons name="warning-outline" size={14} color={colors.accentAmber} style={{ marginRight: 8 }} />
                <View style={{ flex: 1 }}>
                  <Text style={s.urgentTitle}>Due soon</Text>
                  {urgentAssignments.map(a => (
                    <Text key={a.id} style={s.urgentItem} numberOfLines={1}>
                      · {a.title} — {a.dueDate === todayStr ? 'Today' : a.dueDate === in3daysStr ? 'in 3 days' : a.dueDate}
                    </Text>
                  ))}
                </View>
                <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} />
              </AnimatedPressable>
            )}
                </Animated.View>
                </View>
              );
            }

            if (layoutItem.id === 'agenda') {
              return (
                <View key="agenda">
                  <Animated.View entering={FadeInDown.delay(450).duration(400)}>
                    {/* ── Agenda Section ── */}
            {hasAgenda && (
              <View style={{ marginTop: SPACE.xxl }}>
                <Text style={s.sectionLabel}>TODAY'S AGENDA</Text>

                {(todayGym || isGymScheduled) && (
                  <AnimatedPressable style={s.agendaRow} activeOpacity={0.7} onPress={() => navigation.navigate('Gym')}>
                    <Ionicons
                      name={todayGym?.workoutDurationMinutes ? 'checkmark-circle' : 'barbell-outline'}
                      size={16}
                      color={todayGym?.workoutDurationMinutes ? colors.accentGreen : colors.accentPrimary}
                      style={{ marginRight: 12 }}
                    />
                    <Text style={[s.agendaRowText,
                      !!todayGym?.workoutDurationMinutes && { color: colors.textTertiary, textDecorationLine: 'line-through' },
                      { flex: 1 },
                    ]}>
                      {todayGym?.workoutStartTime && !todayGym.workoutDurationMinutes
                        ? 'Gym Workout (In Progress)'
                        : todayGym?.workoutDurationMinutes
                          ? 'Gym Workout (Completed)'
                          : `Gym: ${plannedDay?.name || 'Workout'}`}
                    </Text>
                  </AnimatedPressable>
                )}

                {todayClasses.map(c => (
                  <AnimatedPressable key={c.id} style={s.agendaRow} activeOpacity={0.7} onPress={() => navigation.navigate('Attendance')}>
                    <Ionicons
                      name={c.isCompleted ? 'checkmark-circle' : (c.type === 'lab' ? 'flask-outline' : 'library-outline')}
                      size={16}
                      color={c.isCompleted ? colors.accentGreen : colors.accentAmber}
                      style={{ marginRight: 12 }}
                    />
                    <Text style={[s.agendaRowText, c.isCompleted && { color: colors.textTertiary, textDecorationLine: 'line-through' }, { flex: 1 }]}>{c.title}</Text>
                    <Text style={s.agendaRowTime}>{formatTimeStr(c.time)}</Text>
                  </AnimatedPressable>
                ))}

                {todayTasks.map(t => (
                  <AnimatedPressable key={t.id} style={s.agendaRow} activeOpacity={0.7} onPress={() => navigation.navigate('Tasks')}>
                    <Ionicons
                      name={t.status === 'completed' ? 'checkmark-circle' : 'ellipse-outline'}
                      size={16}
                      color={t.status === 'completed' ? colors.accentGreen : colors.textTertiary}
                      style={{ marginRight: 12 }}
                    />
                    <Text style={[s.agendaRowText,
                      t.status === 'completed' && { color: colors.textTertiary, textDecorationLine: 'line-through' },
                      { flex: 1 },
                    ]} numberOfLines={1}>{t.title}</Text>
                    {t.timeSlot && <Text style={s.agendaRowTime}>{formatTimeStr(t.timeSlot)}</Text>}
                  </AnimatedPressable>
                ))}
              </View>
            )}
                  </Animated.View>
                </View>
              );
            }

            return null;
          })}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Quick Capture Sheet */}
      <QuickCaptureSheet
        visible={captureVisible}
        onClose={() => setCaptureVisible(false)}
      />

      {/* Dashboard Layout Sheet */}
      <DashboardLayoutSheet
        visible={layoutSheetVisible}
        onClose={() => setLayoutSheetVisible(false)}
        layout={layout}
        setLayout={setLayout}
      />

      {/* Logging Sheets */}
      <WaterLogSheet 
        visible={waterLogVisible} 
        onClose={() => setWaterLogVisible(false)} 
        userId={user?.uid || ''}
        target={waterTotal}
        onUpdateTarget={(val) => {
          setWaterTotal(val);
          AsyncStorage.setItem('@zentrack_water_target', String(val));
        }}
      />
      <SleepLogSheet 
        visible={sleepLogVisible} 
        onClose={() => setSleepLogVisible(false)} 
        userId={user?.uid || ''} 
      />
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const makeStyles = (colors: any) => StyleSheet.create({
      root:   { flex: 1, backgroundColor: colors.background },
      scroll: { paddingHorizontal: SPACE.lg, paddingTop: SPACE.xs },

      greetingContainer: { 
        marginTop: 0,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center'
      },
      greetingGood: { fontFamily: FONT_FAMILY.bold, fontSize: 34, color: colors.textPrimary, lineHeight: 40 },
      greetingTime: { fontFamily: FONT_FAMILY.title, fontSize: 34, color: colors.accentPrimary, lineHeight: 40 },

      avatarCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.accentPrimary, alignItems: 'center', justifyContent: 'center' },
      avatarText:   { fontSize: 16, fontFamily: FONT_FAMILY.bold, color: colors.background },

      quoteText:   {
        fontFamily: FONT_FAMILY.body,
        fontStyle: 'italic',
        fontSize: FONT_SIZE.base,
        color: colors.textPrimary,
        lineHeight: 23,
      },
      quoteAuthor: {
        fontFamily: FONT_FAMILY.bold,
        fontSize: FONT_SIZE.xs,
        color: colors.accentPrimary,
        marginTop: SPACE.sm,
        letterSpacing: 1,
        textTransform: 'uppercase',
      },

      statsContainer: {
        flexDirection: 'row',
        marginTop: SPACE.xxl,
        alignItems: 'center',
        justifyContent: 'space-around',
        paddingHorizontal: SPACE.sm,
        paddingVertical: SPACE.md,
        backgroundColor: colors.surface,
        borderRadius: RADIUS.xl,
        borderWidth: 1,
        borderColor: colors.border,
      },
      healthWidgetsRow: {
        flexDirection: 'row',
        marginTop: SPACE.md,
        gap: SPACE.sm,
      },
      healthCard: {
        flex: 1,
        backgroundColor: colors.surface,
        borderRadius: RADIUS.xl,
        padding: SPACE.md,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: 'center',
        justifyContent: 'center'
      },
      statBox:    { alignItems: 'center', minWidth: 70 },
      statLabel:  {
        fontFamily: FONT_FAMILY.bold,
        fontSize: 9,
        color: colors.textTertiary,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: SPACE.xs,
      },
      statValue: {
        fontFamily: FONT_FAMILY.bold,
        fontSize: FONT_SIZE.base,
        color: colors.textSecondary,
      },
      hairlineVertical: { width: 1, height: 28, backgroundColor: colors.border },
      statTapHint: {
        fontFamily: FONT_FAMILY.body,
        fontSize: 7,
        color: colors.textTertiary,
        marginTop: 3,
        letterSpacing: 0.3,
      },

      sectionDivider: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: colors.border,
        marginVertical: SPACE.lg,
        marginHorizontal: SPACE.sm,
      },

      xpContainer: { marginBottom: SPACE.md, paddingHorizontal: SPACE.xs },
      xpRow:       { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
      xpLabel:     { fontFamily: FONT_FAMILY.bold, fontSize: 10, color: colors.accentPrimary, letterSpacing: 0.5 },
      xpXpText:    { fontFamily: FONT_FAMILY.body, fontSize: 10, color: colors.textTertiary },
      xpBarBg:     { height: 3, backgroundColor: colors.border, borderRadius: 2, overflow: 'hidden' },
      xpBarFill:   { height: '100%', backgroundColor: colors.accentPrimary, borderRadius: 2 },

      captureBar: {
        marginTop: SPACE.md,
        marginBottom: SPACE.md,
        backgroundColor: colors.surface,
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
        marginTop: SPACE.xl,
        backgroundColor: 'rgba(255,159,77,0.08)',
        borderWidth: 1,
        borderColor: 'rgba(255,159,77,0.25)',
        borderRadius: RADIUS.lg,
        padding: SPACE.lg,
      },
      urgentTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 11, color: colors.accentAmber, letterSpacing: 0.5, marginBottom: 4 },
      urgentItem:  { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: colors.textMuted, lineHeight: 18 },

      sectionLabel: {
        fontFamily: FONT_FAMILY.bold,
        fontSize: 11,
        letterSpacing: 1,
        color: colors.textTertiary,
        marginBottom: SPACE.lg,
        textTransform: 'uppercase',
      },

      agendaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: SPACE.md,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
      },
      agendaRowText: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.md, color: colors.textPrimary },
      agendaRowTime: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: colors.textTertiary },

      // XP Pop-up
      xpPopup: {
        position: 'absolute',
        top: 20,
        alignSelf: 'center',
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.surface,
        borderRadius: RADIUS.full,
        paddingHorizontal: SPACE.md,
        paddingVertical: SPACE.xs,
        borderWidth: 1,
        borderColor: colors.accentPrimary,
        zIndex: 999,
        shadowColor: colors.accentPrimary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.4,
        shadowRadius: 10,
        elevation: 10,
      },
      xpPopupText: {
        fontFamily: FONT_FAMILY.bold,
        fontSize: FONT_SIZE.sm,
        color: colors.accentPrimary,
      },
    });
