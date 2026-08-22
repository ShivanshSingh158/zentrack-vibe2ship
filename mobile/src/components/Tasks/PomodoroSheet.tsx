/**
 * PomodoroSheet.tsx - ZenTrack Mobile
 *
 * Ultra-Modern 90 FPS Pomodoro Timer with subtle typography,
 * dynamic auto-calculated task duration, smooth SVG progress ring,
 * breathing ambient aura, and pure OLED black aesthetics.
 */
import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  View, Text, Modal, Pressable, StyleSheet, ScrollView, Platform, Vibration,
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

type PomodoroMode = 'focus' | 'shortBreak' | 'longBreak';

interface PomodoroConfig {
  focus: number;
  shortBreak: number;
  longBreak: number;
  sessionsUntilLong: number;
}

const DEFAULT_CONFIG: PomodoroConfig = {
  focus: 25 * 60,
  shortBreak: 5 * 60,
  longBreak: 15 * 60,
  sessionsUntilLong: 4,
};

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

const RING_SIZE = 256;
const RING_STROKE = 4.5;
const RING_RADIUS = (RING_SIZE - RING_STROKE * 2) / 2;
const RING_CIRCUM = RING_RADIUS * 2 * Math.PI;
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function modeLabel(mode: PomodoroMode): string {
  if (mode === 'focus') return 'FOCUS';
  if (mode === 'shortBreak') return 'SHORT BREAK';
  return 'LONG BREAK';
}

function modeIconName(mode: PomodoroMode): any {
  if (mode === 'focus') return 'flame';
  if (mode === 'shortBreak') return 'cafe';
  return 'moon';
}

function modeAccentDark(mode: PomodoroMode): string {
  if (mode === 'focus') return '#a599ff';
  if (mode === 'shortBreak') return '#5eda9e';
  return '#89dceb';
}

function modeAccentLight(mode: PomodoroMode): string {
  if (mode === 'focus') return '#6C5CE7';
  if (mode === 'shortBreak') return '#059669';
  return '#0284C7';
}

/** Parses time strings like "5:00 PM", "5pm", "17:00", "5" to minutes from midnight (0..1439) */
function parseTimeToMinutes(tStr: string, defaultPM?: boolean): number | null {
  if (!tStr) return null;
  const raw = tStr.trim().toLowerCase();
  const isPM = raw.includes('pm') || (defaultPM && !raw.includes('am'));
  const isAM = raw.includes('am');

  const clean = raw.replace(/[apm\s]/g, '');
  const parts = clean.split(':');
  if (parts.length === 0 || parts[0] === '') return null;

  let hours = parseInt(parts[0], 10);
  let minutes = parts.length > 1 ? parseInt(parts[1], 10) : 0;
  if (isNaN(hours)) return null;
  if (isNaN(minutes)) minutes = 0;

  if (isPM && hours < 12) hours += 12;
  if (isAM && hours === 12) hours = 0;

  return hours * 60 + minutes;
}

/**
 * Auto-calculates task duration in seconds:
 * - If timeSlot has a range (e.g., "5 to 7 pm", "5:00 PM - 7:00 PM", "17:00-19:00") -> computes exact difference (e.g. 2 hours).
 * - If title has duration (e.g., "Dsa 2 hours", "1.5h study", "45 mins") -> computes duration.
 * - If estimatedMinutes is set -> uses estimatedMinutes * 60.
 * - If only single time point (e.g. "5:00 PM") or unspecified -> defaults to standard 25 mins (1500s).
 */
export function calculateTaskDurationSeconds(task?: any): number {
  if (!task) return 25 * 60;

  // 1. Check timeSlot for a range (e.g., "5 to 7 pm", "5:00 PM - 7:00 PM", "17:00-19:00")
  const slot = task.timeSlot || '';
  if (slot) {
    const rangeMatch = slot.split(/[-–—•]| to /i);
    if (rangeMatch.length >= 2) {
      const part1 = rangeMatch[0].trim();
      const part2 = rangeMatch[1].trim();

      const isPart2PM = part2.toLowerCase().includes('pm');
      const startMin = parseTimeToMinutes(part1, isPart2PM && !part1.toLowerCase().includes('am'));
      const endMin = parseTimeToMinutes(part2);

      if (startMin !== null && endMin !== null) {
        let diff = endMin - startMin;
        if (diff < 0) diff += 24 * 60; // wraps past midnight
        if (diff > 0 && diff <= 1440) {
          return diff * 60;
        }
      }
    }
  }

  // 2. Check title for time range embedded in text (e.g., "Study 5 to 7 pm", "Work 2pm - 4:30pm")
  const title = task.title || (task as any).text || '';
  if (title) {
    const titleRangeMatch = title.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:-|–|—|to)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm))/i);
    if (titleRangeMatch) {
      const part1 = titleRangeMatch[1].trim();
      const part2 = titleRangeMatch[2].trim();
      const isPart2PM = part2.toLowerCase().includes('pm');
      const startMin = parseTimeToMinutes(part1, isPart2PM && !part1.toLowerCase().includes('am'));
      const endMin = parseTimeToMinutes(part2);
      if (startMin !== null && endMin !== null) {
        let diff = endMin - startMin;
        if (diff < 0) diff += 24 * 60;
        if (diff > 0 && diff <= 1440) {
          return diff * 60;
        }
      }
    }

    // 3. Check title for natural language duration (e.g. "Dsa 2 hours", "1.5h study", "45 mins coding")
    const hoursMatch = title.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?|hr|h)\b/i);
    if (hoursMatch) {
      const h = parseFloat(hoursMatch[1]);
      if (!isNaN(h) && h > 0 && h <= 12) {
        return Math.round(h * 3600);
      }
    }

    const minsMatch = title.match(/(\d+)\s*(?:minutes?|mins?|min|m)\b/i);
    if (minsMatch) {
      const m = parseInt(minsMatch[1], 10);
      if (!isNaN(m) && m > 0 && m <= 720) {
        return m * 60;
      }
    }
  }

  // 4. Check estimatedMinutes on task document
  if (task.estimatedMinutes && typeof task.estimatedMinutes === 'number' && task.estimatedMinutes > 0) {
    return task.estimatedMinutes * 60;
  }

  // 5. Default single time slot (e.g. "5:00 PM") or unspecified -> normal 25 mins
  return 25 * 60;
}

function pad(n: number): string { return n.toString().padStart(2, '0'); }

function formatTime(secs: number): string {
  if (secs >= 3600) {
    const hours = Math.floor(secs / 3600);
    const minutes = Math.floor((secs % 3600) / 60);
    const seconds = secs % 60;
    return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(Math.floor(secs / 60))}:${pad(secs % 60)}`;
}

function formatDurationLabel(secs: number): string {
  if (secs >= 3600) {
    const h = (secs / 3600);
    return Number.isInteger(h) ? `${h}h` : `${h.toFixed(1)}h`;
  }
  return `${Math.round(secs / 60)}m`;
}

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

          {/* Linked Task Section */}
          <View style={s.linkedTaskCard}>
            <View style={s.linkedTaskHeaderRow}>
              <Text style={s.linkedTaskHeader}>LINKED TASK</Text>
              {calculatedTaskDurationText && (
                <View style={s.autoCalcBadge}>
                  <Ionicons name="flash" size={10} color={currentAccent} style={{ marginRight: 2 }} />
                  <Text style={[s.autoCalcText, { color: currentAccent }]}>
                    Auto: {calculatedTaskDurationText}
                  </Text>
                </View>
              )}
            </View>

            <Pressable
              style={[s.linkedTaskChip, linkedTask && { borderColor: currentAccent + '40', backgroundColor: currentAccent + '0F' }]}
              onPress={() => setShowTaskPicker(p => !p)}
            >
              <Ionicons
                name={linkedTask ? 'checkmark-circle' : 'add-circle-outline'}
                size={16}
                color={linkedTask ? currentAccent : colors.textMuted}
              />
              <Text style={[s.linkedTaskTitle, linkedTask && { color: colors.textPrimary, fontWeight: '600' }]} numberOfLines={1}>
                {linkedTask ? linkedTask.title : 'Link a task to auto-set timer...'}
              </Text>
              {linkedTask ? (
                <Pressable onPress={handleUnlinkTask} hitSlop={10}>
                  <Ionicons name="close-circle" size={16} color={colors.textTertiary} />
                </Pressable>
              ) : (
                <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} />
              )}
            </Pressable>

            {/* Task Picker Dropdown */}
            {showTaskPicker && (
              <View style={s.taskPickerList}>
                {pendingTasks.length === 0 ? (
                  <View style={{ paddingVertical: 14, paddingHorizontal: 16, alignItems: 'center' }}>
                    <Text style={{ color: colors.textMuted, fontFamily: 'Inter_400Regular', fontSize: 12.5 }}>
                      No pending tasks for today.
                    </Text>
                  </View>
                ) : (
                  pendingTasks.slice(0, 10).map(t => {
                    const itemSecs = calculateTaskDurationSeconds(t);
                    const isSelected = t.id === linkedTaskId;
                    return (
                      <Pressable
                        key={t.id}
                        style={[s.taskPickerItem, isSelected && { backgroundColor: currentAccent + '15' }]}
                        onPress={() => handleSelectTask(t.id!)}
                      >
                        <View style={[s.taskPickerBullet, isSelected && { backgroundColor: currentAccent }]} />
                        <Text style={[s.taskPickerLabel, isSelected && { color: currentAccent, fontWeight: '600' }]} numberOfLines={1}>
                          {t.title}
                        </Text>
                        <View style={s.taskDurationPill}>
                          <Text style={s.taskDurationPillText}>{formatDurationLabel(itemSecs)}</Text>
                        </View>
                      </Pressable>
                    );
                  })
                )}
              </View>
            )}
          </View>

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

function makeStyles(colors: any, isDark: boolean, accent: string, insets: { bottom: number; top: number }) {
  return StyleSheet.create({
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0, 0, 0, 0.78)',
    },
    sheet: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: isDark ? '#000000' : '#FFFFFF',
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      minHeight: 610,
      maxHeight: '94%' as any,
      paddingHorizontal: 20,
      paddingTop: 10,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: -6 },
      shadowOpacity: isDark ? 0.8 : 0.15,
      shadowRadius: 24,
      elevation: 28,
      borderWidth: 1,
      borderColor: isDark ? '#1c1c20' : colors.border,
      borderBottomWidth: 0,
    },
    handleWrap: {
      alignItems: 'center',
      paddingVertical: 8,
    },
    handle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.22)' : 'rgba(0, 0, 0, 0.15)',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 16,
      paddingHorizontal: 4,
    },
    headerTitle: {
      fontFamily: 'Inter_700Bold',
      fontSize: 22,
      color: colors.textPrimary,
      letterSpacing: -0.4,
    },
    headerSub: {
      fontFamily: 'Inter_400Regular',
      fontSize: 12.5,
      color: colors.textMuted,
      marginTop: 2,
    },
    closeBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: isDark ? '#121216' : '#F0EFF7',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: isDark ? '#1f1f26' : colors.border,
    },

    /* Segmented Mode Selector */
    segmentedCapsule: {
      flexDirection: 'row',
      backgroundColor: isDark ? '#0a0a0d' : '#F0EFF7',
      borderRadius: 14,
      padding: 3,
      borderWidth: 1,
      borderColor: isDark ? '#18181e' : colors.border,
      marginBottom: 20,
    },
    segmentedTab: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 8,
      borderRadius: 11,
    },
    segmentedTabActive: {
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#FFFFFF',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.15,
      shadowRadius: 4,
      elevation: 2,
    },
    segmentedTabText: {
      fontFamily: 'Inter_500Medium',
      fontSize: 12.5,
      color: colors.textMuted,
    },

    /* Ring & Center */
    ringContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      marginVertical: 4,
      position: 'relative',
    },
    ringAura: {
      position: 'absolute',
      width: RING_SIZE * 0.76,
      height: RING_SIZE * 0.76,
      borderRadius: (RING_SIZE * 0.76) / 2,
    },
    ringCenterContent: {
      position: 'absolute',
      alignItems: 'center',
      justifyContent: 'center',
    },
    statusPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: isDark ? '#0c0c10' : '#F4F3F8',
      paddingHorizontal: 9,
      paddingVertical: 3,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: isDark ? '#1a1a22' : colors.border,
      marginBottom: 6,
    },
    statusDot: {
      width: 5,
      height: 5,
      borderRadius: 2.5,
    },
    statusPillText: {
      fontFamily: 'Inter_700Bold',
      fontSize: 9.5,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
    },
    timerDigits: {
      fontFamily: 'Inter_700Bold',
      fontSize: 48,
      letterSpacing: -1.5,
      color: colors.textPrimary,
      fontVariant: ['tabular-nums'],
      lineHeight: 56,
    },
    timerMeta: {
      fontFamily: 'Inter_500Medium',
      fontSize: 11.5,
      color: colors.textMuted,
      marginTop: 2,
    },

    /* Pips / Cycle Progress */
    pipsSection: {
      alignItems: 'center',
      marginTop: 14,
      marginBottom: 18,
    },
    pipsRow: {
      flexDirection: 'row',
      gap: 6,
      marginBottom: 6,
    },
    pipCapsule: {
      width: 28,
      height: 4.5,
      borderRadius: 2.5,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)',
    },
    pipsSubtext: {
      fontFamily: 'Inter_400Regular',
      fontSize: 11,
      color: colors.textTertiary,
    },

    /* Controls Bar */
    controlsContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 24,
      marginBottom: 8,
    },
    secondaryControlBtn: {
      width: 46,
      height: 46,
      borderRadius: 23,
      backgroundColor: isDark ? '#0e0e12' : '#F0EFF7',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: isDark ? '#1c1c22' : colors.border,
    },
    primaryPlayBtn: {
      width: 68,
      height: 68,
      borderRadius: 34,
      alignItems: 'center',
      justifyContent: 'center',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.45,
      shadowRadius: 16,
      elevation: 8,
    },

    /* Quick Boost +5m */
    quickBoostRow: {
      alignItems: 'center',
      marginBottom: 18,
    },
    quickBoostBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      paddingHorizontal: 12,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor: isDark ? '#0c0c0f' : '#F0EFF7',
      borderWidth: 1,
      borderColor: isDark ? '#1a1a20' : colors.border,
    },
    quickBoostText: {
      fontFamily: 'Inter_500Medium',
      fontSize: 11,
      color: colors.textSecondary,
    },

    /* Linked Task */
    linkedTaskCard: {
      marginBottom: 14,
    },
    linkedTaskHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 6,
      paddingHorizontal: 2,
    },
    linkedTaskHeader: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 10.5,
      color: colors.textTertiary,
      letterSpacing: 0.8,
    },
    autoCalcBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(165,153,255,0.12)',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
    },
    autoCalcText: {
      fontFamily: 'Inter_700Bold',
      fontSize: 10,
    },
    linkedTaskChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: isDark ? '#09090c' : '#F8F7FC',
      borderWidth: 1,
      borderColor: isDark ? '#18181e' : colors.border,
    },
    linkedTaskTitle: {
      flex: 1,
      fontFamily: 'Inter_500Medium',
      fontSize: 13,
      color: colors.textMuted,
    },
    taskPickerList: {
      marginTop: 6,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: isDark ? '#1c1c22' : colors.border,
      backgroundColor: isDark ? '#08080a' : '#FFFFFF',
      overflow: 'hidden',
    },
    taskPickerItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 10,
      gap: 8,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? '#141418' : colors.border,
    },
    taskPickerBullet: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : colors.border,
    },
    taskPickerLabel: {
      flex: 1,
      fontFamily: 'Inter_400Regular',
      fontSize: 13,
      color: colors.textSecondary,
    },
    taskDurationPill: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    },
    taskDurationPillText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 10.5,
      color: colors.textTertiary,
    },

    /* Presets Grid */
    presetsGrid: {
      flexDirection: 'row',
      borderRadius: 14,
      borderWidth: 1,
      borderColor: isDark ? '#18181e' : colors.border,
      backgroundColor: isDark ? '#08080b' : '#F8F7FC',
      overflow: 'hidden',
    },
    presetItem: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 12,
    },
    presetItemActive: {
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : '#FFFFFF',
    },
    presetValue: {
      fontFamily: 'Inter_700Bold',
      fontSize: 15,
      color: colors.textPrimary,
    },
    presetLabel: {
      fontFamily: 'Inter_400Regular',
      fontSize: 10.5,
      color: colors.textMuted,
      marginTop: 2,
    },
    presetDivider: {
      width: 1,
      backgroundColor: isDark ? '#18181e' : colors.border,
      marginVertical: 8,
    },
  });
}