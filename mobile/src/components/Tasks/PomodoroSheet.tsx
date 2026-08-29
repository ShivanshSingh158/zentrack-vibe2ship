/**
 * PomodoroSheet.tsx - ZenTrack Mobile
 *
 * Ultra-Modern 90 FPS Pomodoro Timer with subtle typography,
 * dynamic auto-calculated task duration, smooth SVG progress ring,
 * breathing ambient aura, and pure OLED black aesthetics.
 */
import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  View, Text, Modal, Pressable, ScrollView, Platform, Vibration, StyleSheet,
} from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withRepeat, withSequence,
  Easing, useAnimatedProps,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';

import { useTheme } from '../../contexts/ThemeContext';
import { useCoreData } from '../../contexts/domains/CoreDataContext';
import { db } from '../../services/firebase';
import { feedback } from '../../utils/haptics';
import { formatLocalDateStr } from '../../utils/dateUtils';
import { FONT_FAMILY, FONT_SIZE, RADIUS, SPACE } from '../../theme/tokens';

// Extracted math, subcomponents & styles
import {
  PomodoroMode, PomodoroConfig, DEFAULT_CONFIG,
  calculateTaskDurationSeconds, parseTimeToMinutes, formatTime, formatDurationLabel,
} from './pomodoroTimeMath';
import {
  RING_SIZE, RING_STROKE, RING_RADIUS, RING_CIRCUM,
  modeLabel, modeIconName, modeAccentDark, modeAccentLight, makeStyles,
} from './pomodoroStyles';
import PomodoroTaskPicker from './PomodoroTaskPicker';

export type { PomodoroMode, PomodoroConfig };

interface PomodoroSheetProps {
  visible: boolean;
  onClose: () => void;
  tasks?: Array<{
    id?: string;
    title?: string;
    status?: string;
    timeSlot?: string;
    estimatedMinutes?: number;
    text?: string;
    date?: string;
  }>;
  selectedDate?: string;
}

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export default function PomodoroSheet({ visible, onClose, tasks = [], selectedDate }: PomodoroSheetProps) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useCoreData();
  const accent = isDark ? modeAccentDark : modeAccentLight;

  const [mode, setMode] = useState<PomodoroMode>('focus');
  const [config, setConfig] = useState<PomodoroConfig>(DEFAULT_CONFIG);
  const [timeLeft, setTimeLeft] = useState<number>(config.focus);
  const [running, setRunning] = useState<boolean>(false);
  const [sessionCount, setSessionCount] = useState<number>(0);
  const [completedToday, setCompletedToday] = useState<number>(0);
  const [linkedTaskId, setLinkedTaskId] = useState<string | null>(null);
  const [showTaskPicker, setShowTaskPicker] = useState<boolean>(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const slideY = useSharedValue(600);
  const sheetOpacity = useSharedValue(0);

  // 90 FPS Breathing aura animations
  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0.12);

  useEffect(() => {
    if (visible) {
      sheetOpacity.value = withTiming(1, { duration: 180, easing: Easing.out(Easing.cubic) });
      slideY.value = withTiming(0, { duration: 200, easing: Easing.out(Easing.cubic) });
    } else {
      sheetOpacity.value = withTiming(0, { duration: 140, easing: Easing.in(Easing.quad) });
      slideY.value = withTiming(600, { duration: 150, easing: Easing.in(Easing.quad) });
    }
  }, [visible]);

  useEffect(() => {
    if (running) {
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.06, { duration: 1600, easing: Easing.inOut(Easing.sin) }),
          withTiming(1.0, { duration: 1600, easing: Easing.inOut(Easing.sin) })
        ),
        -1,
        true
      );
      pulseOpacity.value = withRepeat(
        withSequence(
          withTiming(0.24, { duration: 1600, easing: Easing.inOut(Easing.sin) }),
          withTiming(0.08, { duration: 1600, easing: Easing.inOut(Easing.sin) })
        ),
        -1,
        true
      );
    } else {
      pulseScale.value = withTiming(1, { duration: 300 });
      pulseOpacity.value = withTiming(0.08, { duration: 300 });
    }
  }, [running]);

  const sheetAnimStyle = useAnimatedStyle(() => ({ transform: [{ translateY: slideY.value }] }));
  const backdropAnimStyle = useAnimatedStyle(() => ({ opacity: sheetOpacity.value }));
  const auraAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
  }));

  const progress = useSharedValue(1);
  const totalTime = useMemo(() => config[mode], [mode, config]);

  useEffect(() => {
    const pct = totalTime > 0 ? timeLeft / totalTime : 0;
    progress.value = withTiming(pct, { duration: 350, easing: Easing.out(Easing.quad) });
  }, [timeLeft, totalTime]);

  const animatedRingProps = useAnimatedProps(() => ({
    strokeDashoffset: RING_CIRCUM * (1 - progress.value),
  }));

  const switchMode = useCallback((newMode: PomodoroMode) => {
    feedback.tap();
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
    setRunning(false);
    setMode(newMode);
    setTimeLeft(config[newMode]);
    progress.value = withTiming(1, { duration: 250 });
  }, [config]);

  const handleSessionComplete = useCallback(async (completedMode: PomodoroMode) => {
    setRunning(false);
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
    if (Platform.OS === 'android') Vibration.vibrate([0, 300, 200, 300]);
    feedback.success();

    if (completedMode === 'focus') {
      const newCount = sessionCount + 1;
      setSessionCount(newCount);
      setCompletedToday(c => c + 1);
      if (user?.uid) {
        try {
          await addDoc(collection(db, 'pomodoro_sessions'), {
            userId: user.uid,
            startTime: serverTimestamp(),
            duration: config.focus,
            taskId: linkedTaskId ?? null,
            mode: 'focus',
          });
        } catch { /* non-blocking */ }
      }
      switchMode(newCount % config.sessionsUntilLong === 0 ? 'longBreak' : 'shortBreak');
    } else {
      switchMode('focus');
    }
  }, [sessionCount, config, linkedTaskId, user, switchMode]);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) { setTimeout(() => handleSessionComplete(mode), 0); return 0; }
          return prev - 1;
        });
      }, 1000);
    } else {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running, mode]);

  const handleStartPause = useCallback(() => {
    feedback.commit();
    setRunning(r => !r);
  }, []);

  const handleReset = useCallback(() => {
    feedback.tap();
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
    setRunning(false);
    setTimeLeft(config[mode]);
    progress.value = withTiming(1, { duration: 250 });
  }, [mode, config]);

  const handleSkip = useCallback(() => {
    feedback.tap();
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
    setRunning(false);
    handleSessionComplete(mode);
  }, [mode, handleSessionComplete]);

  const handleAddFiveMin = useCallback(() => {
    feedback.tap();
    setTimeLeft(prev => prev + 5 * 60);
  }, []);

  const handleToggleDuration = useCallback((targetMode: PomodoroMode, options: number[]) => {
    feedback.tap();
    const currentMins = Math.round(config[targetMode] / 60);
    const currentIndex = options.indexOf(currentMins);
    const nextMins = options[(currentIndex + 1) % options.length];
    const newConfig = { ...config, [targetMode]: nextMins * 60 };
    setConfig(newConfig);
    if (mode === targetMode) {
      setTimeLeft(nextMins * 60);
    }
  }, [config, mode]);

  const handleSelectTask = useCallback((taskId: string) => {
    const targetTask = tasks.find(t => t.id === taskId);
    setLinkedTaskId(taskId);
    setShowTaskPicker(false);
    feedback.commit();

    if (targetTask) {
      const calculatedSecs = calculateTaskDurationSeconds(targetTask);
      setConfig(prev => ({ ...prev, focus: calculatedSecs }));
      if (mode === 'focus' && !running) {
        setTimeLeft(calculatedSecs);
        progress.value = withTiming(1, { duration: 250 });
      }
    }
  }, [tasks, mode, running]);

  const handleUnlinkTask = useCallback(() => {
    setLinkedTaskId(null);
    feedback.tap();
    setConfig(prev => ({ ...prev, focus: DEFAULT_CONFIG.focus }));
    if (mode === 'focus' && !running) {
      setTimeLeft(DEFAULT_CONFIG.focus);
      progress.value = withTiming(1, { duration: 250 });
    }
  }, [mode, running]);

  const handleClose = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
    setRunning(false);
    onClose();
  }, [onClose]);

  const currentAccent = accent(mode);
  const targetDateStr = useMemo(() => selectedDate || formatLocalDateStr(new Date()), [selectedDate]);
  const pendingTasks = useMemo(() => {
    return tasks.filter(t => {
      const isPending = t.status === 'pending' || t.status === 'in_progress';
      if (!isPending) return false;
      return t.date === targetDateStr;
    });
  }, [tasks, targetDateStr]);
  const linkedTask = useMemo(() => tasks.find(t => t.id === linkedTaskId), [tasks, linkedTaskId]);

  // Auto-detect when linked task is completed externally
  useEffect(() => {
    if (linkedTaskId) {
      const isStillPending = tasks.some(t => t.id === linkedTaskId && t.status !== 'completed');
      if (!isStillPending) {
        setLinkedTaskId(null);
        setConfig(prev => ({ ...prev, focus: DEFAULT_CONFIG.focus }));
        feedback.success();
      }
    }
  }, [tasks, linkedTaskId]);

  const completionPct = useMemo(() => {
    if (!totalTime || totalTime <= 0) return 0;
    return Math.min(100, Math.max(0, Math.round(((totalTime - timeLeft) / totalTime) * 100)));
  }, [timeLeft, totalTime]);

  const calculatedTaskDurationText = useMemo(() => {
    if (!linkedTask) return null;
    const s = calculateTaskDurationSeconds(linkedTask);
    return formatDurationLabel(s);
  }, [linkedTask]);

  const s = makeStyles(colors, isDark, currentAccent, insets);

  if (!visible) return null;

  return (
    <Modal transparent visible={visible} onRequestClose={handleClose} statusBarTranslucent animationType="none">
      <Animated.View style={[s.backdrop, backdropAnimStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
      </Animated.View>

      <Animated.View style={[s.sheet, sheetAnimStyle]}>
        {/* Handle Bar */}
        <View style={s.handleWrap}>
          <View style={s.handle} />
        </View>

        {/* Header */}
        <View style={s.header}>
          <View>
            <Text style={s.headerTitle}>Pomodoro</Text>
            <Text style={s.headerSub}>{completedToday} {completedToday === 1 ? 'session' : 'sessions'} completed today</Text>
          </View>
          <Pressable onPress={handleClose} style={s.closeBtn} hitSlop={12}>
            <Ionicons name="close" size={18} color={colors.textMuted} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + SPACE.xxl }} showsVerticalScrollIndicator={false}>
          {/* Segmented Mode Selector */}
          <View style={s.segmentedCapsule}>
            {(['focus', 'shortBreak', 'longBreak'] as PomodoroMode[]).map(m => {
              const active = mode === m;
              return (
                <Pressable
                  key={m}
                  style={[s.segmentedTab, active && s.segmentedTabActive]}
                  onPress={() => switchMode(m)}
                >
                  <Ionicons
                    name={modeIconName(m)}
                    size={13}
                    color={active ? currentAccent : colors.textMuted}
                    style={{ marginRight: 5 }}
                  />
                  <Text style={[s.segmentedTabText, active && { color: currentAccent, fontWeight: '700' }]}>
                    {m === 'focus' ? 'Focus' : m === 'shortBreak' ? 'Short' : 'Long'}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* 90 FPS Circular Timer Ring */}
          <View style={s.ringContainer}>
            {/* Ambient Breathing Aura */}
            <Animated.View style={[s.ringAura, { backgroundColor: currentAccent }, auraAnimStyle]} />

            <Svg width={RING_SIZE} height={RING_SIZE}>
              <Defs>
                <LinearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <Stop offset="0%" stopColor={currentAccent} />
                  <Stop offset="100%" stopColor={currentAccent + 'CC'} />
                </LinearGradient>
              </Defs>

              {/* Background Track */}
              <Circle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RING_RADIUS}
                stroke={isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.06)'}
                strokeWidth={RING_STROKE}
                fill="none"
              />

              {/* Active Animated Progress Stroke */}
              <AnimatedCircle
                cx={RING_SIZE / 2}
                cy={RING_SIZE / 2}
                r={RING_RADIUS}
                stroke="url(#ringGrad)"
                strokeWidth={RING_STROKE}
                fill="none"
                strokeDasharray={`${RING_CIRCUM} ${RING_CIRCUM}`}
                animatedProps={animatedRingProps}
                strokeLinecap="round"
                transform={`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`}
              />
            </Svg>

            {/* Inner Center Display */}
            <View style={s.ringCenterContent}>
              {/* Subtle Status Pill */}
              <View style={s.statusPill}>
                <View style={[s.statusDot, { backgroundColor: running ? currentAccent : colors.textTertiary }]} />
                <Text style={[s.statusPillText, { color: running ? currentAccent : colors.textMuted }]}>
                  {running ? modeLabel(mode) : 'PAUSED'}
                </Text>
              </View>

              {/* Ultra-Clean Tabular Digits */}
              <Text style={s.timerDigits}>{formatTime(timeLeft)}</Text>

              {/* Completion & Time Remaining Meta */}
              <Text style={s.timerMeta}>
                {running ? `${completionPct}% completed` : `Tap play to start`}
              </Text>
            </View>
          </View>

          {/* 4-Session Capsule Progress Indicator */}
          <View style={s.pipsSection}>
            <View style={s.pipsRow}>
              {Array.from({ length: config.sessionsUntilLong }, (_, i) => {
                const isCompleted = i < (sessionCount % config.sessionsUntilLong);
                return (
                  <View
                    key={i}
                    style={[
                      s.pipCapsule,
                      isCompleted && { backgroundColor: currentAccent, shadowColor: currentAccent, shadowOpacity: 0.5, shadowRadius: 6 },
                    ]}
                  />
                );
              })}
            </View>
            <Text style={s.pipsSubtext}>
              Session {((sessionCount % config.sessionsUntilLong) + 1)} of {config.sessionsUntilLong} until long break
            </Text>
          </View>

          {/* Controls Bar: Reset • Play/Pause • Skip • +5m */}
          <View style={s.controlsContainer}>
            <Pressable style={s.secondaryControlBtn} onPress={handleReset} hitSlop={8}>
              <Ionicons name="refresh-outline" size={20} color={colors.textSecondary} />
            </Pressable>

            <Pressable
              style={[s.primaryPlayBtn, { backgroundColor: currentAccent, shadowColor: currentAccent }]}
              onPress={handleStartPause}
            >
              <Ionicons
                name={running ? 'pause' : 'play'}
                size={28}
                color={isDark ? '#000000' : '#ffffff'}
                style={running ? undefined : { marginLeft: 3 }}
              />
            </Pressable>

            <Pressable style={s.secondaryControlBtn} onPress={handleSkip} hitSlop={8}>
              <Ionicons name="play-skip-forward-outline" size={20} color={colors.textSecondary} />
            </Pressable>
          </View>

          {/* Quick +5 Min Extension Pill */}
          <View style={s.quickBoostRow}>
            <Pressable style={s.quickBoostBtn} onPress={handleAddFiveMin}>
              <Ionicons name="add" size={13} color={colors.textSecondary} />
              <Text style={s.quickBoostText}>+5 min extend</Text>
            </Pressable>
          </View>

          <PomodoroTaskPicker
            s={s}
            colors={colors}
            currentAccent={currentAccent}
            calculatedTaskDurationText={calculatedTaskDurationText}
            linkedTask={linkedTask}
            linkedTaskId={linkedTaskId}
            showTaskPicker={showTaskPicker}
            setShowTaskPicker={setShowTaskPicker}
            handleUnlinkTask={handleUnlinkTask}
            handleSelectTask={handleSelectTask}
            pendingTasks={pendingTasks}
            formatDurationLabel={formatDurationLabel}
          />

          {/* Duration Presets Footer */}
          <View style={s.presetsGrid}>
            <Pressable
              style={[s.presetItem, mode === 'focus' && s.presetItemActive]}
              onPress={() => handleToggleDuration('focus', [25, 45, 50, 60, 120])}
            >
              <Text style={s.presetValue}>{formatDurationLabel(config.focus)}</Text>
              <Text style={s.presetLabel}>Focus (tap)</Text>
            </Pressable>

            <View style={s.presetDivider} />

            <Pressable
              style={[s.presetItem, mode === 'shortBreak' && s.presetItemActive]}
              onPress={() => handleToggleDuration('shortBreak', [5, 10, 15])}
            >
              <Text style={s.presetValue}>{Math.round(config.shortBreak / 60)}m</Text>
              <Text style={s.presetLabel}>Short break</Text>
            </Pressable>

            <View style={s.presetDivider} />

            <Pressable
              style={[s.presetItem, mode === 'longBreak' && s.presetItemActive]}
              onPress={() => handleToggleDuration('longBreak', [15, 20, 30])}
            >
              <Text style={s.presetValue}>{Math.round(config.longBreak / 60)}m</Text>
              <Text style={s.presetLabel}>Long break</Text>
            </Pressable>
          </View>
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}
