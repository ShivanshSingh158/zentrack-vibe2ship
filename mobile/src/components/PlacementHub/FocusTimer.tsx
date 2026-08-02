/**
 * FocusTimer.tsx — Pomodoro Focus Timer with Topic Tagging
 *
 * Pre-session: category + topic + duration selection.
 * Active: full-screen countdown, minimal UI.
 * Post-session: quality rating → saved to Firestore.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, AppState,
} from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming,
  withSequence, Easing, FadeIn, FadeOut,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { FONT_FAMILY, FONT_SIZE, RADIUS, SPACE } from '../../theme/tokens';
import { FocusCategory, FocusQuality, usePlacementData } from '../../hooks/usePlacementData';
import { feedback } from '../../utils/haptics';

// ─── Constants ────────────────────────────────────────────────────────────────

const DSA_TOPICS = [
  'Arrays', 'Strings', 'HashMap', 'Sorting', 'LinkedList',
  'Stack', 'Queue', 'Recursion', 'BinarySearch', 'Trees',
  'BST', 'Heaps', 'Graphs', 'DP', 'Tries', 'Backtracking', 'Mixed',
];

const DEV_TOPICS = [
  'JavaScript', 'TypeScript', 'React', 'Node.js', 'Express',
  'PostgreSQL', 'Redis', 'WebSockets', 'GraphQL', 'Docker',
  'SystemDesign', 'Testing', 'Security', 'MachineLearning', 'Other',
];

const COLLEGE_TOPICS = [
  'Maths', 'Physics', 'Electronics', 'Signals', 'Control Systems',
  'Power Systems', 'Machines', 'VLSI', 'Assignments', 'Lab', 'Other',
];

const DURATIONS = [
  { label: '25m', mins: 25 },
  { label: '45m', mins: 45 },
  { label: '90m', mins: 90 },
  { label: '2h', mins: 120 },
];

const CATEGORY_COLOR: Record<FocusCategory, string> = {
  DSA: '#a599ff',
  Dev: '#34d399',
  College: '#f59e0b',
};

// ─── Timer State Machine ──────────────────────────────────────────────────────

type TimerState = 'setup' | 'running' | 'paused' | 'rating' | 'done';

// ─── Sub-components ───────────────────────────────────────────────────────────

function ChipRow<T extends string>({ options, selected, onSelect, color }: {
  options: T[];
  selected: T;
  onSelect: (v: T) => void;
  color: string;
}) {
  const { colors } = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: SPACE.md }}>
      <View style={{ flexDirection: 'row', gap: SPACE.xs }}>
        {options.map(o => (
          <TouchableOpacity
            key={o}
            style={[styles.chip, {
              backgroundColor: selected === o ? `${color}25` : colors.surface2,
              borderColor: selected === o ? color : colors.border,
            }]}
            onPress={() => { onSelect(o); feedback.tap(); }}
          >
            <Text style={[styles.chipText, { color: selected === o ? color : colors.textMuted }]}>{o}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

// ─── Circular progress ring ───────────────────────────────────────────────────

function CircleTimer({ pct, totalMins, remainingMins, color }: {
  pct: number; totalMins: number; remainingMins: number; color: string;
}) {
  const { colors } = useTheme();
  const mins = Math.floor(remainingMins);
  const secs = Math.round((remainingMins - mins) * 60);
  const pulse = useSharedValue(1);

  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.03, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.97, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
      ), -1, false,
    );
  }, []);

  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  return (
    <Animated.View style={[styles.circleWrapper, pulseStyle]}>
      <View style={[styles.circleOuter, { borderColor: `${color}30` }]}>
        <View style={[styles.circleInner, { borderColor: color }]}>
          <Text style={[styles.timerMins, { color }]}>
            {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
          </Text>
          <Text style={[styles.timerLabel, { color: colors.textMuted }]}>remaining</Text>
        </View>
      </View>
    </Animated.View>
  );
}

// ─── Main FocusTimer ──────────────────────────────────────────────────────────

export default function FocusTimer() {
  const { colors } = useTheme();
  const { addFocusSession, focusHoursThisWeek, config } = usePlacementData();

  const [state, setState] = useState<TimerState>('setup');
  const [category, setCategory] = useState<FocusCategory>('DSA');
  const [topic, setTopic] = useState('Arrays');
  const [durationMins, setDurationMins] = useState(25);

  const [remainingSecs, setRemainingSecs] = useState(0);
  const startedAt = useRef<Date | null>(null);
  const endedAt = useRef<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appState = useRef(AppState.currentState);
  const backgroundedAt = useRef<number | null>(null);

  const topicOptions = category === 'DSA' ? DSA_TOPICS : category === 'Dev' ? DEV_TOPICS : COLLEGE_TOPICS;
  const color = CATEGORY_COLOR[category];

  // Handle app backgrounding (keep timer running)
  useEffect(() => {
    const sub = AppState.addEventListener('change', nextState => {
      if (nextState === 'background' && state === 'running') {
        backgroundedAt.current = Date.now();
      } else if (nextState === 'active' && backgroundedAt.current !== null && state === 'running') {
        const elapsed = Math.floor((Date.now() - backgroundedAt.current) / 1000);
        setRemainingSecs(s => Math.max(0, s - elapsed));
        backgroundedAt.current = null;
      }
    });
    return () => sub.remove();
  }, [state]);

  const startTimer = useCallback(() => {
    startedAt.current = new Date();
    setRemainingSecs(durationMins * 60);
    setState('running');
    feedback.commit();
  }, [durationMins]);

  useEffect(() => {
    if (state !== 'running') {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(() => {
      setRemainingSecs(s => {
        if (s <= 1) {
          clearInterval(intervalRef.current!);
          endedAt.current = new Date();
          feedback.success();
          setState('rating');
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [state]);

  const handleRate = async (quality: FocusQuality) => {
    feedback.commit();
    try {
      await addFocusSession({
        category,
        topic,
        durationMins,
        quality,
        startedAt: startedAt.current!,
        endedAt: endedAt.current ?? new Date(),
      });
    } catch (e) {}
    setState('done');
  };

  const reset = () => {
    setState('setup');
    setRemainingSecs(0);
    startedAt.current = null;
    endedAt.current = null;
  };

  const pct = state === 'running' || state === 'paused'
    ? 1 - remainingSecs / (durationMins * 60)
    : 0;

  // ── Render ────────────────────────────────────────────────────────────────

  if (state === 'running' || state === 'paused') {
    return (
      <Animated.View entering={FadeIn} exiting={FadeOut} style={[styles.fullscreen, { backgroundColor: colors.background }]}>
        <Text style={[styles.sessionLabel, { color: color }]}>{category} · {topic}</Text>

        <CircleTimer
          pct={pct}
          totalMins={durationMins}
          remainingMins={remainingSecs / 60}
          color={color}
        />

        <View style={styles.timerControls}>
          <TouchableOpacity
            style={[styles.timerBtn, { backgroundColor: colors.surface2, borderColor: colors.border }]}
            onPress={() => { setState(s => s === 'running' ? 'paused' : 'running'); feedback.tap(); }}
          >
            <Ionicons name={state === 'running' ? 'pause' : 'play'} size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.timerBtn, { backgroundColor: '#ef444415', borderColor: '#ef444440' }]}
            onPress={() => {
              if (intervalRef.current) clearInterval(intervalRef.current);
              endedAt.current = new Date();
              setState('rating');
              feedback.warning();
            }}
          >
            <Ionicons name="stop" size={24} color="#ef4444" />
          </TouchableOpacity>
        </View>
      </Animated.View>
    );
  }

  if (state === 'rating') {
    return (
      <Animated.View entering={FadeIn} style={[styles.ratingContainer]}>
        <Ionicons name="checkmark-circle" size={56} color="#22c55e" />
        <Text style={[styles.ratingTitle, { color: colors.textPrimary }]}>Session complete!</Text>
        <Text style={[styles.ratingSubtitle, { color: colors.textMuted }]}>How focused were you?</Text>
        <View style={styles.ratingBtns}>
          {([
            { quality: 'focused' as FocusQuality, label: 'Focused 🟢', color: '#22c55e' },
            { quality: 'distracted' as FocusQuality, label: 'Distracted 🟡', color: '#f59e0b' },
            { quality: 'interrupted' as FocusQuality, label: 'Interrupted 🔴', color: '#ef4444' },
          ]).map(({ quality, label, color: c }) => (
            <TouchableOpacity
              key={quality}
              style={[styles.ratingBtn, { backgroundColor: `${c}18`, borderColor: `${c}50` }]}
              onPress={() => handleRate(quality)}
            >
              <Text style={[styles.ratingBtnText, { color: c }]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </Animated.View>
    );
  }

  if (state === 'done') {
    return (
      <Animated.View entering={FadeIn} style={styles.ratingContainer}>
        <Ionicons name="rocket" size={56} color={colors.accentPrimary} />
        <Text style={[styles.ratingTitle, { color: colors.textPrimary }]}>Logged! Keep going.</Text>
        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: colors.accentPrimary }]}
          onPress={reset}
        >
          <Text style={styles.saveBtnText}>Start Another Session</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  }

  // Setup screen
  return (
    <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
      {/* Hours logged this week */}
      <View style={styles.weekSummary}>
        {(['DSA', 'Dev', 'College'] as FocusCategory[]).map(cat => (
          <View key={cat} style={[styles.weekCard, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
            <Text style={[styles.weekVal, { color: CATEGORY_COLOR[cat] }]}>
              {focusHoursThisWeek[cat].toFixed(1)}h
            </Text>
            <Text style={[styles.weekLbl, { color: colors.textMuted }]}>{cat}</Text>
            {cat === 'Dev' && (
              <View style={[styles.weekTrack, { backgroundColor: colors.border }]}>
                <View style={[styles.weekFill, {
                  width: `${Math.min((focusHoursThisWeek[cat] / config.weeklyDevHours) * 100, 100)}%` as any,
                  backgroundColor: CATEGORY_COLOR[cat],
                }]} />
              </View>
            )}
          </View>
        ))}
      </View>

      {/* Category selector */}
      <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>CATEGORY</Text>
      <View style={[styles.chips, { marginBottom: SPACE.lg }]}>
        {(['DSA', 'Dev', 'College'] as FocusCategory[]).map(cat => (
          <TouchableOpacity
            key={cat}
            style={[styles.catChip, {
              backgroundColor: category === cat ? `${CATEGORY_COLOR[cat]}20` : colors.surface2,
              borderColor: category === cat ? CATEGORY_COLOR[cat] : colors.border,
            }]}
            onPress={() => { setCategory(cat); setTopic(cat === 'DSA' ? 'Arrays' : cat === 'Dev' ? 'JavaScript' : 'Maths'); feedback.tap(); }}
          >
            <Text style={[styles.catChipText, { color: category === cat ? CATEGORY_COLOR[cat] : colors.textMuted }]}>{cat}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Topic selector */}
      <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>TOPIC</Text>
      <ChipRow options={topicOptions as any} selected={topic as any} onSelect={setTopic as any} color={color} />

      {/* Duration selector */}
      <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>DURATION</Text>
      <View style={[styles.chips, { marginBottom: SPACE.xl }]}>
        {DURATIONS.map(d => (
          <TouchableOpacity
            key={d.label}
            style={[styles.chip, {
              backgroundColor: durationMins === d.mins ? `${color}20` : colors.surface2,
              borderColor: durationMins === d.mins ? color : colors.border,
            }]}
            onPress={() => { setDurationMins(d.mins); feedback.tap(); }}
          >
            <Text style={[styles.chipText, { color: durationMins === d.mins ? color : colors.textMuted }]}>{d.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Start button */}
      <TouchableOpacity
        style={[styles.startBtn, { backgroundColor: color }]}
        onPress={startTimer}
      >
        <Ionicons name="play-circle" size={22} color="#fff" />
        <Text style={styles.startBtnText}>Start {durationMins}m Session</Text>
      </TouchableOpacity>

      <View style={{ height: 120 }} />
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  fieldLabel: { fontFamily: FONT_FAMILY.bold, fontSize: 9, letterSpacing: 2, marginBottom: SPACE.sm },
  chips: { flexDirection: 'row', gap: SPACE.xs, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: RADIUS.xl, borderWidth: 1 },
  chipText: { fontFamily: FONT_FAMILY.medium, fontSize: FONT_SIZE.xs },
  catChip: { flex: 1, paddingVertical: 12, borderRadius: RADIUS.lg, borderWidth: 1.5, alignItems: 'center' },
  catChipText: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.sm },
  weekSummary: { flexDirection: 'row', gap: SPACE.sm, marginBottom: SPACE.xl },
  weekCard: { flex: 1, borderRadius: RADIUS.lg, borderWidth: 1, padding: SPACE.md, alignItems: 'center' },
  weekVal: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.lg },
  weekLbl: { fontFamily: FONT_FAMILY.body, fontSize: 10, marginTop: 2 },
  weekTrack: { height: 3, width: '100%', borderRadius: 2, overflow: 'hidden', marginTop: 6 },
  weekFill: { height: '100%', borderRadius: 2 },
  startBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: SPACE.sm, borderRadius: RADIUS.xxl, padding: SPACE.lg,
  },
  startBtnText: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.lg, color: '#fff' },
  // Running
  fullscreen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACE.xl },
  sessionLabel: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.md, letterSpacing: 2 },
  circleWrapper: { alignItems: 'center', justifyContent: 'center' },
  circleOuter: { width: 220, height: 220, borderRadius: 110, borderWidth: 12, alignItems: 'center', justifyContent: 'center' },
  circleInner: { width: 180, height: 180, borderRadius: 90, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  timerMins: { fontFamily: FONT_FAMILY.bold, fontSize: 48 },
  timerLabel: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm },
  timerControls: { flexDirection: 'row', gap: SPACE.xl },
  timerBtn: { width: 64, height: 64, borderRadius: 32, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  // Rating
  ratingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACE.lg, padding: SPACE.xl },
  ratingTitle: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.xxl },
  ratingSubtitle: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.md },
  ratingBtns: { gap: SPACE.sm, width: '100%' },
  ratingBtn: { borderRadius: RADIUS.xl, borderWidth: 1.5, padding: SPACE.md, alignItems: 'center' },
  ratingBtnText: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.md },
  saveBtn: { borderRadius: RADIUS.xl, paddingHorizontal: SPACE.xxl, paddingVertical: SPACE.md },
  saveBtnText: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.md, color: '#fff' },
});

