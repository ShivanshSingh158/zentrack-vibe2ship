/**
 * FocusScreen — ZenTrack Mobile Pomodoro Timer
 *
 * Fixes applied:
 *  - Reanimated (UI thread) pulse instead of JS-thread Animated
 *  - Session counter (Session N of 4)
 *  - Auto long-break after 4 sessions
 *  - Custom durations (25/50/90 min focus, 5/10 min break)
 *  - expo-av bell sound on completion
 *  - Timer persists across navigation (AsyncStorage startedAt)
 *  - pomodoro_sessions is still written (data is now consumed by Dashboard via MobileDataContext)
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, AppState, AppStateStatus } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withSequence,
  withTiming, Easing as REasing, cancelAnimation,
} from 'react-native-reanimated';
import { COLORS, FONT_FAMILY, FONT_SIZE, SPACE, RADIUS } from '../theme/tokens';
import { useMobileData } from '../contexts/MobileDataContext';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../services/firebase';

// Duration presets
const FOCUS_PRESETS = [25, 50, 90];
const BREAK_SHORT_PRESETS = [5, 10];
const SESSIONS_BEFORE_LONG_BREAK = 4;

type Mode = 'POMODORO' | 'SHORT_BREAK' | 'LONG_BREAK';

const STORAGE_KEY = 'zentrack_focus_timer_v1';

async function playBell() {
  try {
    await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
    const { sound } = await Audio.Sound.createAsync(
      // Use a reliable remote bell sound — replace with local asset if you add assets/bell.mp3
      { uri: 'https://actions.google.com/sounds/v1/alarms/beep_short_10.ogg' },
      { shouldPlay: true, volume: 0.8 }
    );
    sound.setOnPlaybackStatusUpdate(status => {
      if (status.isLoaded && status.didJustFinish) sound.unloadAsync();
    });
  } catch {
    // Silently fail if network unavailable — haptic still fires
  }
}

export default function FocusScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { user } = useMobileData();
  const task = route.params?.task;

  // Config
  const [focusMins, setFocusMins] = useState(25);
  const [breakMins, setBreakMins] = useState(5);
  const [showConfig, setShowConfig] = useState(false);

  // Timer state
  const [mode, setMode] = useState<Mode>('POMODORO');
  const [timeLeft, setTimeLeft] = useState(focusMins * 60);
  const [isActive, setIsActive] = useState(false);
  const [sessionCount, setSessionCount] = useState(0);

  // Interval ref for cleanup
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // AppState ref for background persistence
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const startedAtRef = useRef<number | null>(null);

  // Reanimated pulse (UI thread — zero JS involvement)
  const pulseScale = useSharedValue(1);
  const animatedOuter = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  // Start/stop pulse on UI thread
  useEffect(() => {
    if (isActive) {
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.04, { duration: 1000, easing: REasing.inOut(REasing.ease) }),
          withTiming(1.0,  { duration: 1000, easing: REasing.inOut(REasing.ease) }),
        ),
        -1, // infinite
        false
      );
    } else {
      cancelAnimation(pulseScale);
      pulseScale.value = withTiming(1, { duration: 200 });
    }
  }, [isActive]);

  // Main countdown interval
  const startInterval = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(intervalRef.current!);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const stopInterval = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Timer completion
  const handleComplete = useCallback(async () => {
    stopInterval();
    setIsActive(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await playBell();

    if (mode === 'POMODORO') {
      const newCount = sessionCount + 1;
      setSessionCount(newCount);

      // Log to Firestore
      if (user) {
        addDoc(collection(db, 'pomodoro_sessions'), {
          userId: user.uid,
          taskId: task?.id || null,
          taskTitle: task?.title || null,
          durationMinutes: focusMins,
          date: new Date().toISOString().slice(0, 10),
          createdAt: serverTimestamp(),
        }).catch(console.error);
        
        // Smart Habit Stacking
        AsyncStorage.getItem('zentrack_notif_habit_stacking').then(val => {
          if (val !== 'false') { // Default true
            import('expo-notifications').then(Notifications => {
              Notifications.scheduleNotificationAsync({
                content: {
                  title: 'Great Focus Session! 🧠',
                  body: `You just finished ${focusMins} minutes. Stand up, stretch, and drink some water.`,
                  sound: 'default'
                },
                trigger: null,
              });
            });
          }
        });
      }

      // Auto-switch to long break every 4 sessions, short break otherwise
      if (newCount % SESSIONS_BEFORE_LONG_BREAK === 0) {
        const longBreakSecs = 15 * 60;
        setMode('LONG_BREAK');
        setTimeLeft(longBreakSecs);
      } else {
        setMode('SHORT_BREAK');
        setTimeLeft(breakMins * 60);
      }
    } else {
      // Break finished — go back to pomodoro
      setMode('POMODORO');
      setTimeLeft(focusMins * 60);
    }
  }, [mode, sessionCount, user, task, focusMins, breakMins]);

  // Watch timeLeft for completion
  useEffect(() => {
    if (timeLeft === 0 && isActive) {
      setIsActive(false);
      handleComplete();
    }
  }, [timeLeft, isActive]);

  // Toggle
  const toggleTimer = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsActive(prev => {
      const next = !prev;
      if (next) {
        startedAtRef.current = Date.now();
        startInterval();
      } else {
        stopInterval();
      }
      return next;
    });
  }, [startInterval, stopInterval]);

  const resetTimer = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    stopInterval();
    setIsActive(false);
    setTimeLeft(mode === 'POMODORO' ? focusMins * 60 : mode === 'SHORT_BREAK' ? breakMins * 60 : 15 * 60);
  }, [mode, focusMins, breakMins, stopInterval]);

  const switchMode = useCallback((newMode: Mode) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    stopInterval();
    setIsActive(false);
    setMode(newMode);
    if (newMode === 'POMODORO') setTimeLeft(focusMins * 60);
    else if (newMode === 'SHORT_BREAK') setTimeLeft(breakMins * 60);
    else setTimeLeft(15 * 60);
  }, [focusMins, breakMins, stopInterval]);

  // Background persistence — save/restore startedAt from AsyncStorage
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (nextState) => {
      const prev = appStateRef.current;
      appStateRef.current = nextState;

      if (prev === 'active' && nextState === 'background' && isActive && startedAtRef.current) {
        // Save remaining time + start timestamp
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({
          startedAt: startedAtRef.current,
          timeLeft,
          mode,
          focusMins,
          breakMins,
          sessionCount,
        }));
      }

      if (prev !== 'active' && nextState === 'active') {
        // Restore and compute elapsed
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved) {
          try {
            const data = JSON.parse(saved);
            const elapsed = Math.floor((Date.now() - data.startedAt) / 1000);
            const remaining = Math.max(0, data.timeLeft - elapsed);
            setMode(data.mode);
            setFocusMins(data.focusMins);
            setBreakMins(data.breakMins);
            setSessionCount(data.sessionCount);
            if (remaining > 0) {
              setTimeLeft(remaining);
              setIsActive(true);
              startInterval();
            } else {
              setTimeLeft(0);
            }
          } catch {}
          await AsyncStorage.removeItem(STORAGE_KEY);
        }
      }
    });
    return () => sub.remove();
  }, [isActive, timeLeft, mode, focusMins, breakMins, sessionCount]);

  // Cleanup on unmount
  useEffect(() => () => stopInterval(), []);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const totalSecs = mode === 'POMODORO' ? focusMins * 60 : mode === 'SHORT_BREAK' ? breakMins * 60 : 15 * 60;
  const progress = 1 - (timeLeft / totalSecs);
  const sessionDots = Array.from({ length: SESSIONS_BEFORE_LONG_BREAK });

  return (
    <SafeAreaView style={styles.root}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-down" size={24} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Focus Mode</Text>
        <TouchableOpacity onPress={() => setShowConfig(v => !v)} style={styles.backBtn}>
          <Ionicons name="settings-outline" size={20} color={COLORS.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Config panel (durations) */}
      {showConfig && (
        <View style={styles.configPanel}>
          <Text style={styles.configLabel}>FOCUS DURATION</Text>
          <View style={styles.configRow}>
            {FOCUS_PRESETS.map(m => (
              <TouchableOpacity
                key={m}
                style={[styles.configChip, focusMins === m && styles.configChipActive]}
                onPress={() => {
                  setFocusMins(m);
                  if (mode === 'POMODORO') { setTimeLeft(m * 60); setIsActive(false); stopInterval(); }
                }}
              >
                <Text style={[styles.configChipText, focusMins === m && styles.configChipTextActive]}>{m}m</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={[styles.configLabel, { marginTop: 12 }]}>BREAK DURATION</Text>
          <View style={styles.configRow}>
            {BREAK_SHORT_PRESETS.map(m => (
              <TouchableOpacity
                key={m}
                style={[styles.configChip, breakMins === m && styles.configChipActive]}
                onPress={() => {
                  setBreakMins(m);
                  if (mode === 'SHORT_BREAK') { setTimeLeft(m * 60); setIsActive(false); stopInterval(); }
                }}
              >
                <Text style={[styles.configChipText, breakMins === m && styles.configChipTextActive]}>{m}m</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Task Context */}
      {task && !showConfig && (
        <View style={styles.taskCard}>
          <Text style={styles.taskLabel}>CURRENTLY FOCUSING ON</Text>
          <Text style={styles.taskTitle}>{task.title}</Text>
        </View>
      )}

      {/* Mode Selector */}
      <View style={styles.modeSelector}>
        {(['POMODORO', 'SHORT_BREAK', 'LONG_BREAK'] as const).map(m => (
          <TouchableOpacity
            key={m}
            style={[styles.modeBtn, mode === m && styles.modeBtnActive]}
            onPress={() => switchMode(m)}
          >
            <Text style={[styles.modeBtnText, mode === m && styles.modeBtnTextActive]}>
              {m === 'POMODORO' ? 'Focus' : m === 'SHORT_BREAK' ? 'Short Break' : 'Long Break'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Session dots */}
      <View style={styles.sessionRow}>
        {sessionDots.map((_, i) => {
          const filled = (sessionCount % SESSIONS_BEFORE_LONG_BREAK) > i
            || (sessionCount > 0 && sessionCount % SESSIONS_BEFORE_LONG_BREAK === 0);
          return (
            <View
              key={i}
              style={[styles.sessionDot, filled && styles.sessionDotFilled]}
            />
          );
        })}
        <Text style={styles.sessionLabel}>
          Session {(sessionCount % SESSIONS_BEFORE_LONG_BREAK) + 1} of {SESSIONS_BEFORE_LONG_BREAK}
        </Text>
      </View>

      {/* Timer Circle */}
      <View style={styles.timerContainer}>
        <Animated.View style={[styles.timerOuter, animatedOuter]}>
          <View style={styles.timerInner}>
            <Text style={styles.timeText}>{formatTime(timeLeft)}</Text>
            <Text style={styles.modeText}>
              {mode === 'POMODORO' ? 'STAY FOCUSED' : mode === 'SHORT_BREAK' ? 'SHORT BREAK' : 'LONG BREAK'}
            </Text>
          </View>
        </Animated.View>
        
        {/* Simple Progress Bar */}
        <View style={styles.progressBarBg}>
          <View style={[styles.progressBarFill, { width: `${progress * 100}%` as any }]} />
        </View>
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        <TouchableOpacity style={styles.resetBtn} onPress={resetTimer}>
          <Ionicons name="refresh" size={22} color={COLORS.textPrimary} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.playBtn} onPress={toggleTimer}>
          <Ionicons name={isActive ? "pause" : "play"} size={32} color={COLORS.background} />
        </TouchableOpacity>
        <View style={{ width: 50 }} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACE.xl,
    paddingTop: SPACE.sm,
    paddingBottom: SPACE.md,
  },
  backBtn: {
    width: 40, height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.md,
    color: COLORS.textPrimary,
  },

  // Config panel
  configPanel: {
    marginHorizontal: SPACE.xl,
    marginBottom: SPACE.md,
    padding: SPACE.lg,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  configLabel: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 10,
    color: COLORS.textMuted,
    letterSpacing: 1,
    marginBottom: 8,
  },
  configRow: { flexDirection: 'row', gap: SPACE.sm },
  configChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  configChipActive: { backgroundColor: COLORS.accentPrimary, borderColor: COLORS.accentPrimary },
  configChipText: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.textMuted },
  configChipTextActive: { fontFamily: FONT_FAMILY.bold, color: COLORS.background },

  taskCard: {
    marginHorizontal: SPACE.xl,
    marginTop: SPACE.sm,
    padding: SPACE.lg,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  taskLabel: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 10,
    color: COLORS.textMuted,
    letterSpacing: 1,
    marginBottom: 4,
  },
  taskTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.md,
    color: COLORS.textPrimary,
    textAlign: 'center',
  },

  modeSelector: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: SPACE.sm,
    marginTop: SPACE.lg,
    paddingHorizontal: SPACE.xl,
  },
  modeBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surface,
  },
  modeBtnActive: { backgroundColor: COLORS.accentPrimary },
  modeBtnText: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: COLORS.textMuted },
  modeBtnTextActive: { fontFamily: FONT_FAMILY.bold, color: COLORS.background },

  // Session dots
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 16,
  },
  sessionDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sessionDotFilled: { backgroundColor: COLORS.accentPrimary, borderColor: COLORS.accentPrimary },
  sessionLabel: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 11,
    color: COLORS.textMuted,
    marginLeft: 8,
  },

  timerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerOuter: {
    width: 270,
    height: 270,
    borderRadius: 135,
    backgroundColor: 'rgba(165,153,255,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(165,153,255,0.2)',
  },
  timerInner: {
    width: 230,
    height: 230,
    borderRadius: 115,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  timeText: {
    fontFamily: FONT_FAMILY.title,
    fontSize: 64,
    color: COLORS.textPrimary,
    lineHeight: 70,
  },
  modeText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.sm,
    color: COLORS.accentPrimary,
    letterSpacing: 2,
    marginTop: 8,
  },
  progressBarBg: {
    width: 180,
    height: 5,
    backgroundColor: COLORS.surface2,
    borderRadius: 3,
    marginTop: 36,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: COLORS.accentPrimary,
    borderRadius: 3,
  },

  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 56,
    gap: SPACE.xl,
  },
  playBtn: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: COLORS.accentPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.accentPrimary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 8,
  },
  resetBtn: {
    width: 50, height: 50, borderRadius: 25,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
});
