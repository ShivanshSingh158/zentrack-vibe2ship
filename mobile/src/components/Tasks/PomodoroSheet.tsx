/**
 * PomodoroSheet.tsx — ZenTrack Mobile
 *
 * Authentic Apple iOS Focus Experience:
 * - Powered by global persistent `PomodoroContext` (survives app restarts & backgrounding).
 * - Distraction-free: Pure Focus Flow with authentic iOS breathing space and zero redundant metric cascades.
 * - Responsive Apple Form Sheet: Automatically adapts between an iPadOS two-column split modal on wide screens/tablets
 *   and an elegant, spacious single-column sheet on phones.
 * - Full-Screen Immersive StandBy Focus Mode: OLED pitch-black StandBy canvas with breathing aura,
 *   massive tabular numbers, dynamic focus status pill, floating linked task banner, and distraction-free controls.
 * - Smooth 60/120 FPS Reanimated springs and native tactile haptics.
 */
import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  View, Text, Modal, Pressable, ScrollView, StyleSheet, StatusBar, useWindowDimensions,
} from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withRepeat, withSequence,
  Easing, useAnimatedProps, withSpring, FadeIn, FadeOut,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

import { useTheme } from '../../contexts/ThemeContext';
import { useCoreData } from '../../contexts/domains/CoreDataContext';
import { usePomodoro } from '../../contexts/PomodoroContext';
import { feedback } from '../../utils/haptics';
import { formatLocalDateStr } from '../../utils/dateUtils';

import {
  PomodoroMode,
  calculateTaskDurationSeconds,
  formatTime,
  formatDurationLabel,
  formatFocusTime,
  FOCUS_DEPTH_PRESETS,
  FOCUS_MANTRAS,
} from './pomodoroTimeMath';
import {
  RING_SIZE,
  RING_STROKE,
  RING_RADIUS,
  RING_CIRCUM,
  FULLSCREEN_RING_SIZE,
  FULLSCREEN_RING_STROKE,
  FULLSCREEN_RING_RADIUS,
  FULLSCREEN_RING_CIRCUM,
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
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isWide = windowWidth >= 700;
  const isLandscape = windowWidth > windowHeight && windowWidth >= 640;

  const { tasks: coreTasks } = useCoreData();
  const {
    status,
    mode,
    timeLeft,
    totalDuration,
    completedToday,
    totalSecondsToday,
    linkedTaskId,
    config,
    isSheetOpen,
    setIsSheetOpen,
    toggleTimer,
    resetTimer,
    skipSession,
    extendTime,
    switchMode,
    setLinkedTask,
    unlinkTask,
    keepAwakeEnabled,
    toggleKeepAwake,
  } = usePomodoro();

  const isVisible = propVisible !== undefined ? propVisible : isSheetOpen;

  // Full Screen Immersive Focus Mode State
  const [isFullScreen, setIsFullScreen] = useState<boolean>(false);

  const handleClose = useCallback(() => {
    if (isFullScreen) {
      StatusBar.setHidden(false, 'fade');
      setIsFullScreen(false);
    }
    if (propOnClose) propOnClose();
    setIsSheetOpen(false);
  }, [isFullScreen, propOnClose, setIsSheetOpen]);

  const handleToggleFullScreen = useCallback(() => {
    feedback.tap();
    const next = !isFullScreen;
    setIsFullScreen(next);
    StatusBar.setHidden(next, 'fade');
  }, [isFullScreen]);

  const handleExitFullScreen = useCallback(() => {
    feedback.tap();
    setIsFullScreen(false);
    StatusBar.setHidden(false, 'fade');
  }, []);

  // Cleanup status bar when unmounting
  useEffect(() => {
    return () => {
      StatusBar.setHidden(false, 'fade');
    };
  }, []);

  // Screen Keep-Awake Engine: Screen never sleeps when timer sheet is open OR in full-screen mode
  useEffect(() => {
    const TAG = 'ZenTrackPomodoroKeepAwake';
    if (isVisible && keepAwakeEnabled) {
      activateKeepAwakeAsync(TAG).catch(() => {});
    } else {
      deactivateKeepAwake(TAG).catch(() => {});
    }

    return () => {
      deactivateKeepAwake(TAG).catch(() => {});
    };
  }, [isVisible, keepAwakeEnabled]);

  const accentFn = isDark ? modeAccentDark : modeAccentLight;
  const currentAccent = accentFn(mode);

  const [showTaskPicker, setShowTaskPicker] = useState<boolean>(false);

  const slideY = useSharedValue(600);
  const sheetOpacity = useSharedValue(0);

  // Breathing aura & live indicator animations
  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0.08);
  const playBtnScale = useSharedValue(1);
  const liveDotOpacity = useSharedValue(1);
  const centerScale = useSharedValue(1);

  // Focus Mode Center Display: 'time' (default) or 'percentage'
  const [displayMode, setDisplayMode] = useState<'time' | 'percentage'>('time');

  const handleToggleDisplayMode = useCallback(() => {
    feedback.selectionChange();
    centerScale.value = withSequence(
      withSpring(0.93, { damping: 14, stiffness: 360 }),
      withSpring(1, { damping: 12, stiffness: 220 })
    );
    setDisplayMode(prev => (prev === 'percentage' ? 'time' : 'percentage'));
  }, []);

  const handlePlayPause = () => {
    playBtnScale.value = withSequence(
      withSpring(0.90, { damping: 15, stiffness: 320 }),
      withSpring(1, { damping: 12, stiffness: 220 })
    );
    toggleTimer();
  };

  const handleCenterPress = useCallback(() => {
    if (status === 'idle') {
      handlePlayPause();
    } else {
      handleToggleDisplayMode();
    }
  }, [status, handlePlayPause, handleToggleDisplayMode]);

  useEffect(() => {
    if (isVisible) {
      sheetOpacity.value = withTiming(1, { duration: 180, easing: Easing.out(Easing.cubic) });
      slideY.value = withTiming(0, { duration: 240, easing: Easing.out(Easing.cubic) });
    } else {
      sheetOpacity.value = withTiming(0, { duration: 140, easing: Easing.in(Easing.quad) });
      slideY.value = withTiming(600, { duration: 160, easing: Easing.in(Easing.quad) });
    }
  }, [isVisible]);

  useEffect(() => {
    if (status === 'running') {
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.10, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
          withTiming(1.0, { duration: 1800, easing: Easing.inOut(Easing.sin) })
        ),
        -1,
        true
      );
      pulseOpacity.value = withRepeat(
        withSequence(
          withTiming(0.24, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
          withTiming(0.08, { duration: 1800, easing: Easing.inOut(Easing.sin) })
        ),
        -1,
        true
      );
      liveDotOpacity.value = withRepeat(
        withSequence(
          withTiming(0.25, { duration: 800, easing: Easing.inOut(Easing.ease) }),
          withTiming(1.0, { duration: 800, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
    } else {
      pulseScale.value = withTiming(1, { duration: 300 });
      pulseOpacity.value = withTiming(0.08, { duration: 300 });
      liveDotOpacity.value = withTiming(1, { duration: 250 });
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
  const centerAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: centerScale.value }],
  }));
  const liveDotAnimStyle = useAnimatedStyle(() => ({
    opacity: liveDotOpacity.value,
  }));

  const progress = useSharedValue(0);
  const currentTotal = totalDuration > 0 ? totalDuration : config[mode] || 1500;

  const progressRatio = useMemo(() => {
    const effectiveTotal = Math.max(currentTotal, timeLeft);
    if (!effectiveTotal || effectiveTotal <= 0) return 0;
    if (displayMode === 'percentage') {
      const elapsed = Math.max(0, effectiveTotal - timeLeft);
      return Math.min(1, Math.max(0, elapsed / effectiveTotal));
    } else {
      return Math.min(1, Math.max(0, timeLeft / effectiveTotal));
    }
  }, [displayMode, timeLeft, currentTotal]);

  useEffect(() => {
    progress.value = withTiming(progressRatio, { duration: 350, easing: Easing.out(Easing.cubic) });
  }, [progressRatio]);

  const animatedRingProps = useAnimatedProps(() => ({
    strokeDashoffset: RING_CIRCUM * (1 - progress.value),
  }));

  const animatedFullScreenRingProps = useAnimatedProps(() => ({
    strokeDashoffset: FULLSCREEN_RING_CIRCUM * (1 - progress.value),
  }));

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
    const effectiveTotal = Math.max(currentTotal, timeLeft);
    if (!effectiveTotal || effectiveTotal <= 0) return 0;
    const elapsed = Math.max(0, effectiveTotal - timeLeft);
    return Math.min(100, Math.max(0, Math.round((elapsed / effectiveTotal) * 100)));
  }, [timeLeft, currentTotal]);

  const calculatedTaskDurationText = useMemo(() => {
    if (!linkedTask) return null;
    const s = calculateTaskDurationSeconds(linkedTask);
    return formatDurationLabel(s);
  }, [linkedTask]);

  // Format today's accumulated focus time accurately
  const todayFocusFormatted = useMemo(() => {
    return formatFocusTime(totalSecondsToday);
  }, [totalSecondsToday]);

  const s = useMemo(
    () => makeStyles(colors, isDark, currentAccent, insets, { width: windowWidth, height: windowHeight }),
    [colors, isDark, currentAccent, insets, windowWidth, windowHeight]
  );

  // Dynamic non-redundant header subtitle
  const headerSubtitleText = useMemo(() => {
    if (status === 'running') {
      if (linkedTask) {
        return `Focusing on: ${linkedTask.title || (linkedTask as any).text}`;
      }
      return `${formatDurationLabel(currentTotal)} Focus Session in Progress`;
    }
    if (status === 'paused') {
      if (linkedTask) {
        return `Session Paused • ${linkedTask.title || (linkedTask as any).text}`;
      }
      return 'Session Paused • Tap to Resume';
    }
    if (linkedTask) {
      return `Ready to focus • ${linkedTask.title || (linkedTask as any).text}`;
    }
    return `Deep Work & Flow State • ${formatDurationLabel(config.focus)} cadence`;
  }, [status, linkedTask, currentTotal, timeLeft, config.focus]);

  if (!isVisible) return null;

  /* ─────────────────────────────────────────────────────────────────────────
     SHARED INNER COMPONENTS: Timer Ring + Controls Dock
     ───────────────────────────────────────────────────────────────────────── */
  const renderTimerRing = () => (
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
          stroke={isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)'}
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
      <Pressable
        style={s.ringCenterContent}
        onPress={handleCenterPress}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={`Displaying ${displayMode === 'percentage' ? 'percentage' : 'time'}. Tap to toggle.`}
      >
        {/* Subtle Status Pill */}
        <View style={s.statusPill}>
          <View
            style={[
              s.statusDot,
              {
                backgroundColor:
                  status === 'running'
                    ? '#34D399'
                    : status === 'paused'
                    ? '#FBBF24'
                    : currentAccent,
              },
            ]}
          />
          <Text style={[s.statusPillText, { color: status === 'running' ? currentAccent : colors.textMuted }]}>
            {status === 'paused' ? 'PAUSED' : status === 'running' ? 'FOCUS' : 'READY'}
          </Text>
        </View>

        {/* Ultra-Clean Hero Tabular Digits */}
        <Animated.View style={[s.sheetHeroRow, centerAnimStyle]}>
          {displayMode === 'percentage' ? (
            <View style={s.percentContainer}>
              <Text style={s.timerDigits}>{completionPct}</Text>
              <Text style={s.timerPercentSign}>%</Text>
            </View>
          ) : (
            <Text style={s.timerDigits}>{formatTime(timeLeft)}</Text>
          )}
        </Animated.View>

        {/* Non-redundant Completion & Time Remaining Meta */}
        <View style={s.sheetMetaContainer}>
          {status === 'running' ? (
            <View style={s.sheetMetaRow}>
              <Animated.View style={[s.sheetLiveDot, liveDotAnimStyle]} />
              <Text style={s.timerMeta}>
                {displayMode === 'percentage'
                  ? `${formatTime(timeLeft)} remaining`
                  : `${completionPct}% completed`}
              </Text>
            </View>
          ) : status === 'paused' ? (
            <View style={s.sheetMetaRow}>
              <View style={[s.sheetLiveDot, { backgroundColor: '#FBBF24' }]} />
              <Text style={s.timerMeta}>
                {displayMode === 'percentage'
                  ? `Paused • ${formatTime(timeLeft)} remaining`
                  : 'Session Paused'}
              </Text>
            </View>
          ) : (
            <Text style={s.timerMeta}>
              {formatDurationLabel(currentTotal)} • Tap to start
            </Text>
          )}
        </View>
      </Pressable>
    </View>
  );

  const renderControlsDock = () => (
    <>
      {/* Primary Controls Bar: Reset • Play/Pause • Complete */}
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
              color={isDark ? '#000000' : '#FFFFFF'}
              style={status === 'running' ? undefined : { marginLeft: 3 }}
            />
          </Pressable>
        </Animated.View>

        <Pressable style={s.secondaryControlBtn} onPress={skipSession} hitSlop={8}>
          <Ionicons name="checkmark-outline" size={22} color={colors.textSecondary} />
        </Pressable>
      </View>

      {/* Quick Boost Row (+5m / +15m) */}
      <View style={s.dualBoostRow}>
        <Pressable style={s.boostBtn} onPress={() => extendTime(300)}>
          <Ionicons name="add" size={13} color={colors.textSecondary} />
          <Text style={s.boostBtnText}>+5m</Text>
        </Pressable>

        <Pressable style={s.boostBtn} onPress={() => extendTime(900)}>
          <Ionicons name="add" size={13} color={colors.textSecondary} />
          <Text style={s.boostBtnText}>+15m</Text>
        </Pressable>
      </View>
    </>
  );

  const renderTodaySummary = () => (
    <View style={s.todaySummaryCard}>
      <View style={s.todaySummaryGrid}>
        {/* Tile 1: Time Focused Today */}
        <View style={s.todaySummaryTile}>
          <View style={s.todaySummaryIconWrap}>
            <Ionicons name="hourglass-outline" size={18} color={currentAccent} />
          </View>
          <View>
            <Text style={s.todaySummaryVal}>{todayFocusFormatted}</Text>
            <Text style={s.todaySummaryLbl}>Focus Today</Text>
          </View>
        </View>

        <View style={s.todaySummaryTileDivider} />

        {/* Tile 2: Sessions Completed */}
        <View style={s.todaySummaryTile}>
          <View style={s.todaySummaryIconWrap}>
            <Ionicons name="flame-outline" size={18} color="#FBBF24" />
          </View>
          <View>
            <Text style={s.todaySummaryVal}>{completedToday}</Text>
            <Text style={s.todaySummaryLbl}>{completedToday === 1 ? 'Session' : 'Sessions Done'}</Text>
          </View>
        </View>
      </View>
    </View>
  );

  const renderFocusDepthPresets = () => (
    <View style={s.focusDepthSection}>
      <View style={s.focusDepthHeaderRow}>
        <Text style={s.focusDepthTitle}>FOCUS DEPTH</Text>
        <View style={s.focusDepthBadge}>
          <Ionicons name="timer-outline" size={11} color={colors.textMuted} />
          <Text style={s.focusDepthBadgeText}>Select cadence</Text>
        </View>
      </View>

      <View style={s.depthGrid}>
        {FOCUS_DEPTH_PRESETS.map((preset) => {
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
                  isActive && { backgroundColor: isDark ? 'rgba(165, 153, 255, 0.20)' : 'rgba(108, 92, 231, 0.15)' },
                ]}
              >
                <Ionicons
                  name={preset.icon as any}
                  size={16}
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
                  isActive && { color: colors.textPrimary, fontFamily: 'Inter_600SemiBold' },
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
  );

  const renderMantraBanner = () => (
    <Pressable onPress={cycleMantra} style={s.mantraBox} hitSlop={12}>
      <Text style={s.mantraText}>“{FOCUS_MANTRAS[mantraIndex]}”</Text>
    </Pressable>
  );

  return (
    <Modal
      transparent
      visible={isVisible}
      onRequestClose={() => {
        if (isFullScreen) {
          handleExitFullScreen();
        } else {
          handleClose();
        }
      }}
      statusBarTranslucent
      animationType="none"
    >
      {/* ═══════════════════════════════════════════════════════════════════════
          IMMERSIVE APPLE iOS FULL-SCREEN STANDBY FOCUS MODE
          ═══════════════════════════════════════════════════════════════════════ */}
      {isFullScreen ? (
        <Animated.View entering={FadeIn.duration(240)} exiting={FadeOut.duration(200)} style={s.fullScreenContainer}>
          {/* Top Bar with Safe Area */}
          <View style={s.fullScreenHeader}>
            <View style={s.fullScreenHeaderLeft}>
              <View style={s.fullScreenStatusPill}>
                <View
                  style={[
                    s.fullScreenStatusDot,
                    { backgroundColor: status === 'running' ? '#34D399' : status === 'paused' ? '#FBBF24' : '#A599FF' },
                  ]}
                />
                <Text style={s.fullScreenStatusText}>
                  {status === 'running' ? 'FOCUS' : status === 'paused' ? 'PAUSED' : 'READY'}
                </Text>
              </View>

              {/* Keep Awake Badge & Toggle */}
              <Pressable
                onPress={toggleKeepAwake}
                style={[
                  s.fullScreenKeepAwakePill,
                  keepAwakeEnabled && s.fullScreenKeepAwakePillActive,
                ]}
                hitSlop={8}
                accessibilityLabel="Toggle Screen Always On"
              >
                <Ionicons
                  name={keepAwakeEnabled ? 'sunny' : 'sunny-outline'}
                  size={12}
                  color={keepAwakeEnabled ? '#FBBF24' : 'rgba(255, 255, 255, 0.45)'}
                />
                <Text
                  style={[
                    s.fullScreenKeepAwakeText,
                    keepAwakeEnabled && { color: '#FDE68A' },
                  ]}
                >
                  {keepAwakeEnabled ? 'Always On' : 'Auto Sleep'}
                </Text>
              </Pressable>
            </View>

            {/* Exit Full Screen Button */}
            <Pressable onPress={handleExitFullScreen} style={s.fullScreenCloseBtn} hitSlop={12}>
              <Ionicons name="contract-outline" size={20} color="#FFFFFF" />
            </Pressable>
          </View>

          {/* Floating Linked Task Banner */}
          {linkedTask && (
            <View style={s.fullScreenTaskBanner}>
              <Ionicons name="pin" size={13} color="#A599FF" />
              <Text style={s.fullScreenTaskText} numberOfLines={1}>
                {linkedTask.title || (linkedTask as any).text}
              </Text>
            </View>
          )}

          {/* Center Immersive StandBy Ring */}
          <View style={s.fullScreenCenter}>
            <View style={s.fullScreenRingContainer}>
              {/* Breathing Glow Aura */}
              <Animated.View
                style={[s.fullScreenRingAura, { backgroundColor: currentAccent }, auraAnimStyle]}
              />

              <Svg width={FULLSCREEN_RING_SIZE} height={FULLSCREEN_RING_SIZE}>
                <Defs>
                  <LinearGradient id="fsRingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <Stop offset="0%" stopColor="#818CF8" />
                    <Stop offset="50%" stopColor="#A599FF" />
                    <Stop offset="100%" stopColor="#C4B5FD" />
                  </LinearGradient>
                </Defs>

                {/* Ambient Background Track */}
                <Circle
                  cx={FULLSCREEN_RING_SIZE / 2}
                  cy={FULLSCREEN_RING_SIZE / 2}
                  r={FULLSCREEN_RING_RADIUS}
                  stroke="rgba(255, 255, 255, 0.08)"
                  strokeWidth={FULLSCREEN_RING_STROKE}
                  fill="none"
                />

                {/* Animated Progress Stroke */}
                <AnimatedCircle
                  cx={FULLSCREEN_RING_SIZE / 2}
                  cy={FULLSCREEN_RING_SIZE / 2}
                  r={FULLSCREEN_RING_RADIUS}
                  stroke="url(#fsRingGrad)"
                  strokeWidth={FULLSCREEN_RING_STROKE}
                  fill="none"
                  strokeDasharray={`${FULLSCREEN_RING_CIRCUM} ${FULLSCREEN_RING_CIRCUM}`}
                  animatedProps={animatedFullScreenRingProps}
                  strokeLinecap="round"
                  transform={`rotate(-90 ${FULLSCREEN_RING_SIZE / 2} ${FULLSCREEN_RING_SIZE / 2})`}
                />
              </Svg>

              {/* StandBy Numerals & Progress */}
              <Pressable
                style={s.fullScreenCenterContent}
                onPress={handleCenterPress}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel={`Timer center. Displaying ${displayMode === 'percentage' ? 'percentage completed' : 'time remaining'}. Tap to toggle.`}
              >
                {/* Grand Apple iOS Hero Digits */}
                <Animated.View style={[s.heroRow, centerAnimStyle]}>
                  {displayMode === 'percentage' ? (
                    <View style={s.percentContainer}>
                      <Text style={s.fullScreenDigits}>{completionPct}</Text>
                      <Text style={s.fullScreenPercentSign}>%</Text>
                    </View>
                  ) : (
                    <Text style={s.fullScreenDigits}>{formatTime(timeLeft)}</Text>
                  )}
                </Animated.View>

                {/* Non-redundant Dynamic Flow Meta */}
                <View style={s.fullScreenMetaContainer}>
                  {status === 'running' ? (
                    <View style={s.fullScreenMetaRow}>
                      <Animated.View style={[s.liveDot, liveDotAnimStyle]} />
                      <Text style={s.fullScreenMetaText}>
                        {displayMode === 'percentage'
                          ? `${formatTime(timeLeft)} remaining`
                          : `${completionPct}% completed`}
                      </Text>
                    </View>
                  ) : status === 'paused' ? (
                    <View style={s.fullScreenMetaRow}>
                      <View style={[s.liveDot, { backgroundColor: '#FBBF24' }]} />
                      <Text style={s.fullScreenMetaText}>
                        {displayMode === 'percentage'
                          ? `Paused • ${formatTime(timeLeft)} remaining`
                          : 'Session Paused'}
                      </Text>
                    </View>
                  ) : (
                    <Text style={s.fullScreenMetaText}>
                      {displayMode === 'percentage'
                        ? `${formatDurationLabel(currentTotal)} session • Tap to start`
                        : 'Tap to start session'}
                    </Text>
                  )}
                </View>
              </Pressable>
            </View>

            {/* Mindful Ambient Inspiration Quote */}
            <Pressable onPress={cycleMantra} style={s.fullScreenMantraCard} hitSlop={12}>
              <Text style={s.fullScreenMantraText}>“{FOCUS_MANTRAS[mantraIndex]}”</Text>
            </Pressable>
          </View>

          {/* Bottom Floating Minimalist Controls */}
          <View style={s.fullScreenControlsWrap}>
            <View style={s.fullScreenControlsRow}>
              {/* Reset */}
              <Pressable style={s.fullScreenSecondaryBtn} onPress={resetTimer} hitSlop={10}>
                <Ionicons name="refresh-outline" size={22} color="#FFFFFF" />
              </Pressable>

              {/* Giant Play/Pause */}
              <Animated.View style={playBtnAnimStyle}>
                <Pressable
                  style={[s.fullScreenPlayBtn, { backgroundColor: '#A599FF', shadowColor: '#A599FF' }]}
                  onPress={handlePlayPause}
                >
                  <Ionicons
                    name={status === 'running' ? 'pause' : 'play'}
                    size={34}
                    color="#000000"
                    style={status === 'running' ? undefined : { marginLeft: 3 }}
                  />
                </Pressable>
              </Animated.View>

              {/* Complete / Skip */}
              <Pressable style={s.fullScreenSecondaryBtn} onPress={skipSession} hitSlop={10}>
                <Ionicons name="checkmark-outline" size={24} color="#FFFFFF" />
              </Pressable>
            </View>

            {/* Quick Extension Chips */}
            <View style={s.fullScreenBoostRow}>
              <Pressable style={s.fullScreenBoostBtn} onPress={() => extendTime(300)}>
                <Ionicons name="add" size={13} color="#FFFFFF" />
                <Text style={s.fullScreenBoostBtnText}>+5m</Text>
              </Pressable>

              <Pressable style={s.fullScreenBoostBtn} onPress={() => extendTime(900)}>
                <Ionicons name="add" size={13} color="#FFFFFF" />
                <Text style={s.fullScreenBoostBtnText}>+15m</Text>
              </Pressable>
            </View>
          </View>
        </Animated.View>
      ) : (
        /* ═══════════════════════════════════════════════════════════════════════
            STANDARD APPLE iOS FOCUS SHEET (ADAPTIVE MOBILE + TABLET)
            ═══════════════════════════════════════════════════════════════════════ */
        <>
          <Animated.View style={[s.backdrop, backdropAnimStyle]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
          </Animated.View>

          <Animated.View style={[s.sheet, sheetAnimStyle]}>
            {/* Grab Handle */}
            <View style={s.handleWrap}>
              <View style={s.handle} />
            </View>

            {/* Header: Title, Mindful Context, Full-Screen & Close buttons */}
            <View style={s.header}>
              <View style={s.headerLeft}>
                <View style={s.headerTitleRow}>
                  <Text style={s.headerTitle}>Focus Flow</Text>
                  {/* Keep Awake Badge & Toggle */}
                  <Pressable
                    onPress={toggleKeepAwake}
                    style={[s.sheetKeepAwakePill, keepAwakeEnabled && s.sheetKeepAwakePillActive]}
                    hitSlop={8}
                    accessibilityLabel="Toggle Screen Always On"
                  >
                    <Ionicons
                      name={keepAwakeEnabled ? 'sunny' : 'sunny-outline'}
                      size={11}
                      color={keepAwakeEnabled ? (isDark ? '#FBBF24' : '#D97706') : colors.textMuted}
                    />
                    <Text style={[s.sheetKeepAwakeText, keepAwakeEnabled && { color: isDark ? '#FDE68A' : '#B45309' }]}>
                      {keepAwakeEnabled ? 'Always On' : 'Sleep'}
                    </Text>
                  </Pressable>
                </View>
                <Text style={s.headerSub} numberOfLines={1}>
                  {headerSubtitleText}
                </Text>
              </View>

              <View style={s.headerActions}>
                {/* Full Screen Expand Button */}
                <Pressable
                  onPress={handleToggleFullScreen}
                  style={s.headerActionBtn}
                  hitSlop={10}
                  accessibilityLabel="Full Screen Timer"
                >
                  <Ionicons name="expand-outline" size={18} color={colors.textSecondary} />
                </Pressable>

                {/* Close Button */}
                <Pressable onPress={handleClose} style={s.closeBtn} hitSlop={10}>
                  <Ionicons name="close" size={18} color={colors.textMuted} />
                </Pressable>
              </View>
            </View>

            <ScrollView
              contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 24) + 40 }}
              showsVerticalScrollIndicator={false}
            >
              {isWide ? (
                /* ── TABLET / WIDE LANDSCAPE: 2-COLUMN BALANCED IPADOS FORM SHEET ── */
                <View style={s.tabletSplitRow}>
                  {/* Left Column: Ring, Controls Dock, Ambient Mantra */}
                  <View style={s.tabletColLeft}>
                    {renderTimerRing()}
                    {renderControlsDock()}
                    {renderMantraBanner()}
                  </View>

                  {/* Right Column: Today's Summary Card, Linked Task, Focus Depth */}
                  <View style={s.tabletColRight}>
                    {renderTodaySummary()}

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

                    {renderFocusDepthPresets()}
                  </View>
                </View>
              ) : (
                /* ── PHONE / PORTRAIT: SPACIOUS APPLE IOS SINGLE-COLUMN FLOW ── */
                <>
                  {/* Mindful Ambient Focus Mantra Banner */}
                  {renderMantraBanner()}

                  {/* 60/120 FPS Circular Timer Ring */}
                  {renderTimerRing()}

                  {/* Primary Controls Bar: Reset • Play/Pause • Complete */}
                  {renderControlsDock()}

                  {/* Apple iOS Grouped Performance Summary */}
                  {renderTodaySummary()}

                  {/* Linked Task Picker */}
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

                  {/* Focus Depth Presets (Sprint, Classic, Deep, Flow) */}
                  {renderFocusDepthPresets()}
                </>
              )}
            </ScrollView>
          </Animated.View>
        </>
      )}
    </Modal>
  );
}
