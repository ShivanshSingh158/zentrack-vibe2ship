/**
 * PomodoroSheet.tsx — ZenTrack Mobile
 *
 * Ultra-Modern 90 FPS Subtle Pomodoro Timer:
 * - Powered by global persistent `PomodoroContext` (survives app restarts & backgrounding).
 * - Smooth SVG progress ring with linear gradient and subtle dual-layer breathing aura.
 * - Tabular monospace digits for 0-jitter countdown rendering.
 * - Dynamic task duration calculation and auto-linking.
 */
import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  View, Text, Modal, Pressable, ScrollView, StyleSheet,
} from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withRepeat, withSequence,
  Easing, useAnimatedProps, withSpring,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../../contexts/ThemeContext';
import { useCoreData } from '../../contexts/domains/CoreDataContext';
import { usePomodoro } from '../../contexts/PomodoroContext';
import { feedback } from '../../utils/haptics';
import { formatLocalDateStr } from '../../utils/dateUtils';
import { SPACE } from '../../theme/tokens';

import {
  PomodoroMode,
  calculateTaskDurationSeconds,
  formatTime,
  formatDurationLabel,
  FOCUS_DEPTH_PRESETS,
  FOCUS_MANTRAS,
  FocusDepthPreset,
} from './pomodoroTimeMath';
import {
  RING_SIZE,
  RING_STROKE,
  RING_RADIUS,
  RING_CIRCUM,
  modeLabel,
  modeIconName,
  modeAccentDark,
  modeAccentLight,
  makeStyles,
} from './pomodoroStyles';
import PomodoroTaskPicker from './PomodoroTaskPicker';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface PomodoroSheetProps {
  visible?: boolean;
  onClose?: () => void;
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

export default function PomodoroSheet({
  visible: propVisible,
  onClose: propOnClose,
  tasks = [],
  selectedDate,
}: PomodoroSheetProps) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { tasks: coreTasks } = useCoreData();
  const {
    status,
    mode,
    timeLeft,
    totalDuration,
    sessionCount,
    completedToday,
    linkedTaskId,
    config,
    isSheetOpen,
    setIsSheetOpen,
    toggleTimer,
    resetTimer,
    skipSession,
    extendTime,
    switchMode,
    setConfig,
    setLinkedTask,
    unlinkTask,
  } = usePomodoro();

  const isVisible = propVisible !== undefined ? propVisible : isSheetOpen;
  const handleClose = useCallback(() => {
    if (propOnClose) propOnClose();
    setIsSheetOpen(false);
  }, [propOnClose, setIsSheetOpen]);

  const accentFn = isDark ? modeAccentDark : modeAccentLight;
  const currentAccent = accentFn(mode);

  const [showTaskPicker, setShowTaskPicker] = useState<boolean>(false);

  const slideY = useSharedValue(600);
  const sheetOpacity = useSharedValue(0);

  // 90 FPS Breathing aura animations
  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0.10);
  const playBtnScale = useSharedValue(1);

  useEffect(() => {
    if (isVisible) {
      sheetOpacity.value = withTiming(1, { duration: 180, easing: Easing.out(Easing.cubic) });
      slideY.value = withTiming(0, { duration: 220, easing: Easing.out(Easing.cubic) });
    } else {
      sheetOpacity.value = withTiming(0, { duration: 140, easing: Easing.in(Easing.quad) });
      slideY.value = withTiming(600, { duration: 160, easing: Easing.in(Easing.quad) });
    }
  }, [isVisible]);

  useEffect(() => {
    if (status === 'running') {
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.08, { duration: 1600, easing: Easing.inOut(Easing.sin) }),
          withTiming(1.0, { duration: 1600, easing: Easing.inOut(Easing.sin) })
        ),
        -1,
        true
      );
      pulseOpacity.value = withRepeat(
        withSequence(
          withTiming(0.26, { duration: 1600, easing: Easing.inOut(Easing.sin) }),
          withTiming(0.08, { duration: 1600, easing: Easing.inOut(Easing.sin) })
        ),
        -1,
        true
      );
    } else {
      pulseScale.value = withTiming(1, { duration: 300 });
      pulseOpacity.value = withTiming(0.08, { duration: 300 });
    }
  }, [status]);

  const sheetAnimStyle = useAnimatedStyle(() => ({ transform: [{ translateY: slideY.value }] }));
  const backdropAnimStyle = useAnimatedStyle(() => ({ opacity: sheetOpacity.value }));
  const auraAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
  }));
  const playBtnAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: playBtnScale.value }],
  }));

  const progress = useSharedValue(1);
  const currentTotal = totalDuration > 0 ? totalDuration : config[mode];

  useEffect(() => {
    const pct = currentTotal > 0 ? timeLeft / currentTotal : 0;
    progress.value = withTiming(pct, { duration: 300, easing: Easing.out(Easing.quad) });
  }, [timeLeft, currentTotal]);

  const animatedRingProps = useAnimatedProps(() => ({
    strokeDashoffset: RING_CIRCUM * (1 - progress.value),
  }));

  const handlePlayPause = () => {
    playBtnScale.value = withSequence(
      withSpring(0.92, { damping: 15, stiffness: 300 }),
      withSpring(1, { damping: 12, stiffness: 200 })
    );
    toggleTimer();
  };

  const [mantraIndex, setMantraIndex] = useState<number>(0);
  const cycleMantra = useCallback(() => {
    feedback.tap();
    setMantraIndex(i => (i + 1) % FOCUS_MANTRAS.length);
  }, []);

  const handleSelectDepth = useCallback((durationMins: number) => {
    feedback.tap();
    const durationSecs = durationMins * 60;
    switchMode('focus', durationSecs);
  }, [switchMode]);

  // Tasks source for task picker
  const allTasks = tasks.length > 0 ? tasks : coreTasks;
  const targetDateStr = useMemo(() => selectedDate || formatLocalDateStr(new Date()), [selectedDate]);
  const pendingTasks = useMemo(() => {
    return allTasks.filter((t: any) => {
      const isPending = t.status === 'pending' || t.status === 'in_progress';
      if (!isPending) return false;
      return t.date === targetDateStr;
    });
  }, [allTasks, targetDateStr]);

  const linkedTask = useMemo(() => allTasks.find((t: any) => t.id === linkedTaskId), [allTasks, linkedTaskId]);

  const handleSelectTask = useCallback((taskId: string) => {
    const targetTask = allTasks.find((t: any) => t.id === taskId);
    setShowTaskPicker(false);
    feedback.commit();

    if (targetTask) {
      const calculatedSecs = calculateTaskDurationSeconds(targetTask);
      setLinkedTask(taskId, targetTask.title || (targetTask as any)?.text || '', calculatedSecs);
    } else {
      setLinkedTask(taskId, null);
    }
  }, [allTasks, setLinkedTask]);

  const completionPct = useMemo(() => {
    if (!currentTotal || currentTotal <= 0) return 0;
    return Math.min(100, Math.max(0, Math.round(((currentTotal - timeLeft) / currentTotal) * 100)));
  }, [timeLeft, currentTotal]);

  const calculatedTaskDurationText = useMemo(() => {
    if (!linkedTask) return null;
    const s = calculateTaskDurationSeconds(linkedTask);
    return formatDurationLabel(s);
  }, [linkedTask]);

  const s = makeStyles(colors, isDark, currentAccent, insets);

  if (!isVisible) return null;

  return (
    <Modal transparent visible={isVisible} onRequestClose={handleClose} statusBarTranslucent animationType="none">
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
            <Text style={s.headerTitle}>Focus Flow</Text>
            <Text style={s.headerSub}>
              {completedToday} {completedToday === 1 ? 'session' : 'sessions'} completed today • {Math.max(0, Math.round((completedToday * config.focus) / 60))}m focused
            </Text>
          </View>
          <Pressable onPress={handleClose} style={s.closeBtn} hitSlop={12}>
            <Ionicons name="close" size={18} color={colors.textMuted} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + SPACE.xxl }} showsVerticalScrollIndicator={false}>
          {/* Best-in-Class Mode Switcher */}
          <View style={s.modeSwitcherCapsule}>
            <Pressable
              style={[s.modeSwitcherTab, mode === 'focus' && s.modeSwitcherTabActive]}
              onPress={() => switchMode('focus')}
            >
              <Ionicons
                name="flame"
                size={14}
                color={mode === 'focus' ? currentAccent : colors.textMuted}
              />
              <Text
                style={[
                  s.modeSwitcherText,
                  mode === 'focus' && { color: currentAccent, fontFamily: 'Inter_700Bold' },
                ]}
              >
                Deep Focus
              </Text>
            </Pressable>

            <Pressable
              style={[s.modeSwitcherTab, (mode === 'shortBreak' || mode === 'longBreak') && s.modeSwitcherTabActive]}
              onPress={() => switchMode('shortBreak', 5 * 60)}
            >
              <Ionicons
                name="leaf"
                size={14}
                color={mode !== 'focus' ? currentAccent : colors.textMuted}
              />
              <Text
                style={[
                  s.modeSwitcherText,
                  mode !== 'focus' && { color: currentAccent, fontFamily: 'Inter_700Bold' },
                ]}
              >
                Zen Recharge
              </Text>
            </Pressable>
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
                <View
                  style={[
                    s.statusDot,
                    { backgroundColor: status === 'running' ? currentAccent : colors.textTertiary },
                  ]}
                />
                <Text style={[s.statusPillText, { color: status === 'running' ? currentAccent : colors.textMuted }]}>
                  {status === 'paused' ? 'PAUSED' : status === 'running' ? modeLabel(mode) : 'READY'}
                </Text>
              </View>

              {/* Ultra-Clean Tabular Digits */}
              <Text style={s.timerDigits}>{formatTime(timeLeft)}</Text>

              {/* Completion & Time Remaining Meta */}
              <Text style={s.timerMeta}>
                {status === 'running'
                  ? `${completionPct}% completed`
                  : status === 'paused'
                  ? `Paused • Tap play to resume`
                  : `Tap play to start`}
              </Text>
            </View>
          </View>

          {/* Mindful Focus Mantra */}
          <Pressable onPress={cycleMantra} style={s.mantraBox}>
            <Ionicons name="sparkles" size={12} color={currentAccent} />
            <Text style={s.mantraText}>"{FOCUS_MANTRAS[mantraIndex]}"</Text>
          </Pressable>

          {/* Daily Performance HUD Bar (replaces generic pips) */}
          <View style={s.dailyHudCard}>
            <View style={s.dailyHudRow}>
              <View style={s.dailyHudItem}>
                <Text style={s.dailyHudVal}>
                  {Math.max(0, Math.round((completedToday * config.focus) / 60))}m
                </Text>
                <Text style={s.dailyHudLbl}>Focus Today</Text>
              </View>

              <View style={s.dailyHudDivider} />

              <View style={s.dailyHudItem}>
                <Text style={s.dailyHudVal}>{completedToday}</Text>
                <Text style={s.dailyHudLbl}>Sessions</Text>
              </View>

              <View style={s.dailyHudDivider} />

              <View style={s.dailyHudItem}>
                <Text style={[s.dailyHudVal, { color: currentAccent }]}>
                  {mode === 'focus' ? formatDurationLabel(config.focus) : '5m'}
                </Text>
                <Text style={s.dailyHudLbl}>{mode === 'focus' ? 'Flow Depth' : 'Rest'}</Text>
              </View>
            </View>
          </View>

          {/* Controls Bar: Reset • Play/Pause • Skip */}
          <View style={s.controlsContainer}>
            <Pressable style={s.secondaryControlBtn} onPress={resetTimer} hitSlop={8}>
              <Ionicons name="refresh-outline" size={20} color={colors.textSecondary} />
            </Pressable>

            <Animated.View style={playBtnAnimStyle}>
              <Pressable
                style={[s.primaryPlayBtn, { backgroundColor: currentAccent, shadowColor: currentAccent }]}
                onPress={handlePlayPause}
              >
                <Ionicons
                  name={status === 'running' ? 'pause' : 'play'}
                  size={30}
                  color={isDark ? '#000000' : '#ffffff'}
                  style={status === 'running' ? undefined : { marginLeft: 3 }}
                />
              </Pressable>
            </Animated.View>

            <Pressable style={s.secondaryControlBtn} onPress={skipSession} hitSlop={8}>
              <Ionicons name="play-skip-forward-outline" size={20} color={colors.textSecondary} />
            </Pressable>
          </View>

          {/* Quick Boost Row (+5m / +15m) */}
          <View style={s.dualBoostRow}>
            <Pressable style={s.boostBtn} onPress={() => extendTime(300)}>
              <Ionicons name="add" size={13} color={colors.textSecondary} />
              <Text style={s.boostBtnText}>+5m flow</Text>
            </Pressable>

            <Pressable style={s.boostBtn} onPress={() => extendTime(900)}>
              <Ionicons name="add" size={13} color={colors.textSecondary} />
              <Text style={s.boostBtnText}>+15m deep</Text>
            </Pressable>
          </View>

          {/* Linked Task Picker (100% UNCHANGED AND PRESERVED) */}
          <PomodoroTaskPicker
            s={s}
            colors={colors}
            currentAccent={currentAccent}
            calculatedTaskDurationText={calculatedTaskDurationText}
            linkedTask={linkedTask}
            linkedTaskId={linkedTaskId}
            showTaskPicker={showTaskPicker}
            setShowTaskPicker={setShowTaskPicker}
            handleUnlinkTask={unlinkTask}
            handleSelectTask={handleSelectTask}
            pendingTasks={pendingTasks}
            formatDurationLabel={formatDurationLabel}
          />

          {/* Flow Depth Presets (replaces generic 3-box footer) */}
          {mode === 'focus' ? (
            <View style={s.focusDepthSection}>
              <View style={s.focusDepthHeaderRow}>
                <Text style={s.focusDepthTitle}>FOCUS DEPTH</Text>
                <View style={s.focusDepthBadge}>
                  <Ionicons name="timer-outline" size={11} color={colors.textMuted} />
                  <Text style={s.focusDepthBadgeText}>Select your cadence</Text>
                </View>
              </View>

              <View style={s.depthGrid}>
                {FOCUS_DEPTH_PRESETS.map(preset => {
                  const presetSecs = preset.durationMinutes * 60;
                  const isActive = config.focus === presetSecs && !linkedTask;
                  return (
                    <Pressable
                      key={preset.id}
                      style={[s.depthCard, isActive && s.depthCardActive]}
                      onPress={() => handleSelectDepth(preset.durationMinutes)}
                    >
                      <View
                        style={[
                          s.depthCardIconWrap,
                          isActive && { backgroundColor: currentAccent + '25' },
                        ]}
                      >
                        <Ionicons
                          name={preset.icon as any}
                          size={14}
                          color={isActive ? currentAccent : colors.textMuted}
                        />
                      </View>
                      <Text
                        style={[
                          s.depthCardDurationText,
                          isActive && { color: currentAccent },
                        ]}
                      >
                        {preset.tag}
                      </Text>
                      <Text
                        style={[
                          s.depthCardTitle,
                          isActive && { color: colors.textPrimary, fontWeight: '600' },
                        ]}
                        numberOfLines={1}
                      >
                        {preset.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : (
            <View style={s.rechargeCard}>
              <Ionicons name="leaf-outline" size={24} color="#34D399" style={{ marginBottom: 6 }} />
              <Text style={s.rechargeTitle}>Mindful Breather (5m)</Text>
              <Text style={s.rechargeDesc}>
                Step away from your screen. Inhale deeply for 4 seconds, hold for 4, and exhale for 6. Hydrate and reset your posture.
              </Text>
            </View>
          )}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}
