import { SafeAreaView } from 'react-native-safe-area-context';
/**
 * HabitsScreen ΓÇö ZenTrack Mobile
 * Full CRUD habits tracking matching web app HabitsModule.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TextInput, Modal, KeyboardAvoidingView, Platform, Alert, Animated, TouchableOpacity, DeviceEventEmitter, InteractionManager
} from 'react-native';
import Reanimated, { useSharedValue, useAnimatedStyle, withSpring, FadeInDown, withSequence, withTiming } from 'react-native-reanimated';
import AnimatedPressable from '../components/AnimatedPressable';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { collection, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { safeWrite } from '../utils/safeWrite';
import { db } from '../services/firebase';
import { useCoreData } from '../contexts/domains/CoreDataContext';
import type { Habit, HabitLog } from '../contexts/MobileDataContext';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS, SHADOW } from '../theme/tokens';
import { animateFadeInUp } from '../theme/animations';
import * as Haptics from 'expo-haptics';
import { awardXP } from '../services/xpSystem';
import ConfettiCannon from 'react-native-confetti-cannon';
import { COLLECTION } from '../config/constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from "../contexts/ThemeContext";
import { HabitReminderModal } from '../components/Habits/HabitReminderModal';
import { handleSyncError } from '../utils/errorUtils';
import EmptyState from '../components/ui/EmptyState';
import { formatLocalDateStr } from '../utils/dateUtils';
import BottomSheet from '../components/ui/BottomSheet';
import HabitsSkeleton from '../components/Habits/HabitsSkeleton';

const getTodayStr = () => formatLocalDateStr(new Date());
// IMPORTANT: never use a module-level `today` constant here — it gets frozen at app launch
// and breaks habit date tracking when the app is left open past midnight.
// Always call getTodayStr() so the date is re-evaluated each time it's used.

// Helper for heat map dates
const getPastDays = (numDays: number) => {
  const dates = [];
  const d = new Date();
  for (let i = numDays - 1; i >= 0; i--) {
    const temp = new Date(d);
    temp.setDate(temp.getDate() - i);
    dates.push(formatLocalDateStr(temp));
  }
  return dates;
};

// ─── Create Habit Modal ────────────────────────────────────────────────────────

function CreateHabitModal({ visible, userId, onClose }: {
  visible: boolean; userId: string; onClose: () => void;
}) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const [type, setType] = useState<'positive' | 'negative'>('positive');
  const [cost, setCost] = useState('');
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('⭐');
  const [frequency, setFrequency] = useState('daily');
  const [customDays, setCustomDays] = useState<string[]>([]);
  const [color, setColor] = useState(isDark ? colors.accentPrimary : '#6C5CE7');
  const [targetCount, setTargetCount] = useState('');
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const HABIT_COLORS = isDark 
    ? ['#a599ff', '#5eda9e', '#ff9f4d', '#ff6961', '#38bdf8', '#c084fc']
    : ['#6C5CE7', '#059669', '#D97706', '#E11D48', '#0284C7', '#7C3AED'];
  const EMOJI_PRESETS = type === 'positive' 
    ? ['⭐', '💧', '📚', '🏃', '🧘', '🍎', '💤', '🎯']
    : ['🚫', '🚭', '🍫', '📱', '🎮', '☕', '🍔', '💸'];
  const [saving, setSaving] = useState(false);

  const handleSave = () => {
    if (!name.trim()) return;
    
    // Optimistic UI update: instantly close modal and trigger haptic
    import('expo-haptics').then(Haptics => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
    
    // Fire-and-forget network request, deferred to prevent animation frame drops
    setTimeout(() => {
      const todayStr = getTodayStr();
      addDoc(collection(db, COLLECTION.HABITS), {
        userId,
        name: name.trim(),
        emoji: emoji.trim() || (type === 'positive' ? '⭐' : '🚫'),
        frequency: frequency === 'custom' && customDays.length > 0 ? customDays.join(', ') : frequency,
        streak: 0,
        longestStreak: 0,
        color,
        type,
        startDate: todayStr,
        costPerDay: type === 'negative' && cost.trim() ? parseFloat(cost.trim()) : 0,
        targetCount: type === 'positive' && targetCount.trim() ? parseInt(targetCount.trim()) : null,
        createdAt: serverTimestamp(),
      }).catch(handleSyncError);
    }, 150);

    setName('');
    setEmoji('⭐');
    setColor(isDark ? colors.accentPrimary : '#6C5CE7');
    setType('positive');
    setCost('');
    setTargetCount('');
    onClose();
  };

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={{ width: '100%' }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <Text style={styles.modalTitle}>New Habit</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} style={styles.modalCloseBtn}>
            <Ionicons name="close" size={20} color={colors.textPrimary} />
          </TouchableOpacity>
        </View>
        
        <View style={{ flexDirection: 'row', gap: SPACE.sm, marginBottom: SPACE.lg }}>
          <AnimatedPressable 
            style={[styles.typeBtn, type === 'positive' && styles.typeBtnActivePos]}
            onPress={() => {
              setType('positive');
              if (emoji === '🚫') setEmoji('⭐');
            }}
          >
            <Text style={[styles.typeBtnText, type === 'positive' && styles.typeBtnTextActivePos]}>Building (Do)</Text>
          </AnimatedPressable>
          <AnimatedPressable 
            style={[styles.typeBtn, type === 'negative' && styles.typeBtnActiveNeg]}
            onPress={() => {
              setType('negative');
              if (emoji === '⭐') setEmoji('🚫');
            }}
          >
            <Text style={[styles.typeBtnText, type === 'negative' && styles.typeBtnTextActiveNeg]}>Avoiding (Quit)</Text>
          </AnimatedPressable>
        </View>
        
        <TextInput
            style={styles.modalInput}
            placeholder={type === 'positive' ? "Name (e.g. Meditate, Read, Workout)" : "Name (e.g. Junk Food, Smoking, Doomscrolling)"}
            placeholderTextColor={colors.textMuted}
            value={name}
            onChangeText={setName}
        />

        {/* Quick Emoji Presets */}
        <View style={{ marginBottom: SPACE.md }}>
          <Text style={styles.sectionTitle}>Icon</Text>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {EMOJI_PRESETS.map((em) => (
              <TouchableOpacity
                key={em}
                style={[
                  styles.emojiChip,
                  emoji === em && styles.emojiChipActive,
                ]}
                onPress={() => setEmoji(em)}
              >
                <Text style={{ fontSize: 18 }}>{em}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Color Palette Chips */}
        <View style={{ marginBottom: SPACE.md }}>
          <Text style={styles.sectionTitle}>Color Accent</Text>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            {HABIT_COLORS.map((c) => (
              <TouchableOpacity
                key={c}
                style={[
                  styles.colorDot,
                  { backgroundColor: c },
                  color === c && styles.colorDotActive,
                ]}
                onPress={() => setColor(c)}
              >
                {color === c && <Ionicons name="checkmark" size={12} color="#FFFFFF" />}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {type === 'positive' && (
          <TextInput
              style={styles.modalInput}
              placeholder="Daily Target (optional, e.g. 8 for 8 glasses)"
              placeholderTextColor={colors.textMuted}
              value={targetCount}
              onChangeText={setTargetCount}
              keyboardType="numeric"
          />
        )}

        {type === 'negative' && (
          <TextInput
              style={styles.modalInput}
              placeholder="Cost per day (Optional, e.g. 10 for $10)"
              placeholderTextColor={colors.textMuted}
              value={cost}
              onChangeText={setCost}
              keyboardType="numeric"
          />
        )}

        <Text style={styles.sectionTitle}>Frequency</Text>
        <View style={styles.frequencyRow}>
          {['daily', 'weekly', '3x/week', 'custom'].map(f => (
            <AnimatedPressable 
              key={f} 
              style={[styles.freqBtn, frequency === f && styles.freqBtnActive]}
              onPress={() => setFrequency(f)}
            >
              <Text style={[styles.freqBtnText, frequency === f && styles.freqBtnTextActive]}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </Text>
            </AnimatedPressable>
          ))}
        </View>

        <View style={styles.modalActions}>
          <AnimatedPressable style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </AnimatedPressable>
          <AnimatedPressable
            style={[styles.saveBtn, (!name.trim() || saving) && { opacity: 0.5 }]}
            onPress={handleSave}
            disabled={!name.trim() || saving}
          >
            <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Create Habit'}</Text>
          </AnimatedPressable>
        </View>
      </View>
    </BottomSheet>
  );
}

// ─── Habit Card (Redesigned iOS Design) ──────────────────────────────────────

const HabitCard = React.memo(function HabitCard({ habit, isCompleted, todayLog, onToggle, onArchive, onDelete, habitLogs, onFireConfetti, freezesLeft }: {
  habit: Habit;
  isCompleted: boolean;
  todayLog?: HabitLog;
  onToggle: (x?: number, y?: number) => void;
  onArchive: () => void;
  onDelete: () => void;
  habitLogs: HabitLog[];
  onFireConfetti: (x: number, y: number, color: string) => void;
  freezesLeft?: number;
}) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const checkScale = useSharedValue(1);
  const emojiScale = useSharedValue(1);
  const isNegative = habit.type === 'negative';
  const habitColor = habit.color || (isDark ? colors.accentPrimary : '#6C5CE7');
  const today = getTodayStr();

  let daysClean = 0;
  let moneySaved = 0;
  if (isNegative) {
    if (habitLogs.length > 0) {
      const mostRecentLog = habitLogs.reduce((latest, log) => log.date > latest.date ? log : latest, habitLogs[0]);
      const msPerDay = 1000 * 60 * 60 * 24;
      daysClean = Math.floor((new Date(today).getTime() - new Date(mostRecentLog.date).getTime()) / msPerDay);
    } else if (habit.startDate) {
      const msPerDay = 1000 * 60 * 60 * 24;
      daysClean = Math.floor((new Date(today).getTime() - new Date(habit.startDate).getTime()) / msPerDay);
    }
    if (daysClean < 0) daysClean = 0;
    if (habit.costPerDay) moneySaved = daysClean * habit.costPerDay;
  }

  // Calculate 7-Day Week History (Clean iOS Rolling Week Strip)
  const weekHistory = useMemo(() => {
    if (isNegative) return null;
    const logDateMap = new Map<string, HabitLog>();
    for (const l of habitLogs) {
      if (l.date) logDateMap.set((l.date || '').slice(0, 10), l);
    }

    const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    const days = [];
    const now = new Date();
    
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = formatLocalDateStr(d);
      const dayOfWeek = d.getDay();
      const dayLabel = DAY_LABELS[dayOfWeek];
      const isToday = i === 0;
      const log = logDateMap.get(dateStr);
      
      let status: 'completed' | 'missed' | 'freeze' | 'future' = 'missed';
      if (log) {
        if (log.isFreeze) status = 'freeze';
        else if (habit.targetCount && habit.targetCount > 0) {
          status = (log.count || 0) >= habit.targetCount ? 'completed' : 'missed';
        } else {
          status = 'completed';
        }
      } else if (isToday) {
        status = 'future';
      } else if (habit.startDate && dateStr < habit.startDate) {
        status = 'future';
      }
      
      days.push({
        dateStr,
        dayLabel,
        dayNum: d.getDate(),
        isToday,
        status,
      });
    }
    return days;
  }, [isNegative, habitLogs, habit.targetCount, habit.startDate]);

  const animatedCheckStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
  }));

  const handlePress = useCallback((e: any) => {
    const pageX = e.nativeEvent?.pageX;
    const pageY = e.nativeEvent?.pageY;
    if (isNegative) {
      if (isCompleted) {
        Alert.alert("Undo Relapse", "Remove the relapse logged for today?", [
          { text: "Cancel", style: "cancel" },
          { text: "Remove", onPress: () => onToggle(pageX, pageY) }
        ]);
      } else {
        Alert.alert(
          "Relapse?",
          `Did you slip up with ${habit.name}? Logging this will reset your Days Clean to 0.`,
          [
            { text: "Cancel", style: "cancel" },
            { 
              text: "Yes, I relapsed", 
              style: "destructive",
              onPress: () => {
                onToggle(pageX, pageY);
                import('expo-haptics').then(Haptics => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
              }
            }
          ]
        );
      }
      return;
    }

    onToggle(pageX, pageY);
    import('expo-haptics').then(Haptics => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
    checkScale.value = withSpring(1.25, { damping: 10, stiffness: 300 }, () => {
      checkScale.value = withSpring(1, { damping: 14, stiffness: 200 });
    });
    emojiScale.value = withSequence(
      withTiming(0.85, { duration: 80 }),
      withSpring(1.2, { damping: 8, stiffness: 250 }),
      withSpring(1.0, { damping: 14, stiffness: 200 })
    );
  }, [isNegative, isCompleted, onToggle, habit.name, checkScale, emojiScale]);

  const handleLongPress = useCallback(() => {
    import('expo-haptics').then(Haptics => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
    Alert.alert(
      "Manage Habit",
      habit.name,
      [
        { text: "Archive", onPress: onArchive },
        { text: "Delete", onPress: onDelete, style: 'destructive' },
        { text: "Cancel", style: 'cancel' }
      ]
    );
  }, [habit.name, onArchive, onDelete]);

  return (
    <AnimatedPressable 
      activeOpacity={0.9} 
      onLongPress={handleLongPress} 
      delayLongPress={300}
      onPress={handlePress}
      style={[
        styles.habitCard, 
        {
          borderColor: isCompleted 
            ? (isNegative ? 'rgba(239,68,68,0.4)' : `${habitColor}50`) 
            : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'),
          backgroundColor: isDark ? colors.surface : '#FFFFFF',
        }
      ]}
    >
      {/* ── TOP SECTION: Icon, Title, Streak & Check Action Button ── */}
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {/* Emoji Avatar */}
        <View style={[
          styles.avatar, 
          { 
            backgroundColor: isNegative 
              ? (isDark ? 'rgba(239,68,68,0.14)' : 'rgba(239,68,68,0.10)') 
              : (isDark ? `${habitColor}22` : `${habitColor}14`),
            borderColor: isNegative 
              ? (isDark ? 'rgba(239,68,68,0.3)' : 'rgba(239,68,68,0.2)') 
              : (isDark ? `${habitColor}40` : `${habitColor}30`),
            borderWidth: 1,
          }
        ]}>
          <Reanimated.Text style={[styles.avatarEmoji, { transform: [{ scale: emojiScale }] }]}>
            {habit.emoji || (isNegative ? '🚫' : '⭐')}
          </Reanimated.Text>
        </View>

        {/* Title & Streak Badge */}
        <View style={{ flex: 1, marginLeft: 12, marginRight: 8 }}>
          <Text style={[styles.habitName, isCompleted && !isNegative && styles.habitNameCompleted]} numberOfLines={1}>
            {habit.name}
          </Text>
          
          {isNegative ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 6 }}>
              <View style={[styles.streakBadge, { backgroundColor: isCompleted ? 'rgba(239,68,68,0.14)' : (isDark ? 'rgba(16,185,129,0.14)' : 'rgba(16,185,129,0.10)') }]}>
                <Text style={{ color: isCompleted ? '#EF4444' : (isDark ? '#5EDA9E' : '#059669'), fontSize: 11, fontFamily: FONT_FAMILY.bold }}>
                  {isCompleted ? 'Relapsed Today' : `🌿 ${daysClean} days clean`}
                </Text>
              </View>
              {moneySaved > 0 && !isCompleted && (
                <Text style={{ fontSize: 11, fontFamily: FONT_FAMILY.bold, color: isDark ? '#5EDA9E' : '#059669' }}>
                  +${moneySaved.toFixed(0)} saved
                </Text>
              )}
            </View>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 6 }}>
              <View style={[
                styles.streakBadge, 
                { backgroundColor: isCompleted ? (isDark ? 'rgba(94,218,158,0.15)' : 'rgba(16,185,129,0.12)') : (isDark ? 'rgba(245,158,11,0.15)' : 'rgba(245,158,11,0.10)') }
              ]}>
                <Text style={{ 
                  color: isCompleted ? (isDark ? '#5EDA9E' : '#059669') : (isDark ? '#FBBF24' : '#D97706'), 
                  fontSize: 11, 
                  fontFamily: FONT_FAMILY.bold 
                }}>
                  {isCompleted ? '✓ Completed today' : `🔥 ${habit.streak || 0} day streak`}
                </Text>
              </View>
              {habit.targetCount && habit.targetCount > 0 && (
                <Text style={{ fontSize: 11, fontFamily: FONT_FAMILY.medium, color: colors.textSecondary }}>
                  {todayLog?.count || 0}/{habit.targetCount}
                </Text>
              )}
            </View>
          )}
        </View>

        {/* Big iOS Action Check Ring */}
        {!isNegative ? (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handlePress}
            style={[
              styles.actionCheckRing,
              {
                backgroundColor: isCompleted ? habitColor : (isDark ? 'rgba(255,255,255,0.06)' : '#F5F4FA'),
                borderColor: isCompleted ? habitColor : (isDark ? 'rgba(255,255,255,0.15)' : '#D1D1D6'),
              }
            ]}
          >
            <Reanimated.View style={animatedCheckStyle}>
              <Ionicons
                name={isCompleted ? "checkmark-sharp" : "add"}
                size={isCompleted ? 18 : 16}
                color={isCompleted ? (isDark ? '#000000' : '#FFFFFF') : colors.textMuted}
              />
            </Reanimated.View>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handlePress}
            style={[
              styles.actionCheckRing,
              {
                backgroundColor: isCompleted ? '#EF4444' : (isDark ? 'rgba(255,255,255,0.06)' : '#F5F4FA'),
                borderColor: isCompleted ? '#EF4444' : (isDark ? 'rgba(255,255,255,0.15)' : '#D1D1D6'),
              }
            ]}
          >
            <Ionicons
              name={isCompleted ? "close" : "shield-checkmark-outline"}
              size={16}
              color={isCompleted ? '#FFFFFF' : (isDark ? '#5EDA9E' : '#059669')}
            />
          </TouchableOpacity>
        )}
      </View>

      {/* ── BOTTOM SECTION: 7-Day Clean Rolling Week Strip ── */}
      {!isNegative && weekHistory && (
        <View style={styles.weekStripContainer}>
          {weekHistory.map((item, idx) => {
            const isDone = item.status === 'completed';
            const isFreeze = item.status === 'freeze';
            const isCurrentDay = item.isToday;

            return (
              <View key={idx} style={styles.weekDayColumn}>
                <Text style={[
                  styles.weekDayLabel,
                  isCurrentDay && { color: colors.accentPrimary, fontFamily: FONT_FAMILY.bold }
                ]}>
                  {item.dayLabel}
                </Text>
                <View style={[
                  styles.weekDayDot,
                  isDone && { backgroundColor: habitColor, borderColor: habitColor },
                  isFreeze && { backgroundColor: '#06B6D4', borderColor: '#06B6D4' },
                  !isDone && !isFreeze && isCurrentDay && { 
                    backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#F0EFF7', 
                    borderWidth: 1.5, 
                    borderColor: habitColor,
                  },
                  !isDone && !isFreeze && !isCurrentDay && {
                    backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#ECEBF2',
                    borderColor: 'transparent'
                  }
                ]}>
                  {isDone && <Ionicons name="checkmark" size={11} color={isDark ? '#000000' : '#FFFFFF'} />}
                  {isFreeze && <Ionicons name="snow" size={10} color="#FFFFFF" />}
                </View>
              </View>
            );
          })}
        </View>
      )}
    </AnimatedPressable>
  );
});

// ΓöÇΓöÇΓöÇ Main Screen ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

export default function HabitsScreen() {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const { allHabits, habitLogs, user, loading, optimisticUpdateHabit, optimisticAddHabitLog, optimisticRemoveHabitLog, optimisticUpdateHabitLog } = useCoreData();
  const [createVisible, setCreateVisible] = useState(false);
  const [showReminderModal, setShowReminderModal] = useState(false);
  
  const [confettiOpts, setConfettiOpts] = useState<{ x: number, y: number, color: string } | null>(null);

  const headerFade = useRef(new Animated.Value(0)).current;
  const headerSlide = useRef(new Animated.Value(-10)).current;
  const today = getTodayStr();

  // ── Streak Freeze Evaluator ──
  const [freezes, setFreezes] = useState<number>(0);
  const evaluatorRan = useRef(false);
  // IDEMPOTENCY GUARD: Per-habit action timestamp lock prevents multi-tap race conditions
  const inFlightHabitLocks = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (!user || loading || evaluatorRan.current) return;
    evaluatorRan.current = true;

    InteractionManager.runAfterInteractions(() => {
      (async () => {
        try {
          const storedFreezes = await AsyncStorage.getItem('zentrack_habit_freezes');
          const lastGrant = await AsyncStorage.getItem('zentrack_last_freeze_grant');
          let currentFreezes = storedFreezes ? parseInt(storedFreezes, 10) : 1;

          const msPerWeek = 7 * 24 * 60 * 60 * 1000;
          const nowMs = new Date().getTime();
          const grantMs = lastGrant ? new Date(lastGrant).getTime() : 0;
          let didGrant = false;
          
          if (nowMs - grantMs > msPerWeek) {
            currentFreezes += 1;
            didGrant = true;
            await AsyncStorage.setItem('zentrack_last_freeze_grant', new Date().toISOString());
          }

          let updatedFreezes = currentFreezes;
          const yesterdayDate = new Date(nowMs - 24 * 60 * 60 * 1000);
          const yesterday = yesterdayDate.toISOString().split('T')[0];
          const isYesterdaySunday = yesterdayDate.getDay() === 0;
          const saturdayDate = new Date(nowMs - 48 * 60 * 60 * 1000).toISOString().split('T')[0];

          // O(N) pre-indexing of latest log per habit for O(1) evaluation
          const latestLogByHabit = new Map<string, HabitLog>();
          for (const log of habitLogs) {
            const current = latestLogByHabit.get(log.habitId);
            if (!current || log.date > current.date) {
              latestLogByHabit.set(log.habitId, log);
            }
          }

          // Evaluate misses for active daily positive habits
          for (const habit of allHabits) {
            if (habit.type === 'negative' || habit.archived || habit.frequency !== 'daily') continue;
            
            const latestLog = latestLogByHabit.get(habit.id);
            if (!latestLog) continue;
            
            // 🏖️ SUNDAY RELAXATION: If yesterday was Sunday, Sunday is an approved rest day.
            // We only evaluate a streak break if Saturday was ALSO missed.
            const targetMissDate = isYesterdaySunday ? saturdayDate : yesterday;

            if (latestLog.date < targetMissDate) {
              if (updatedFreezes > 0) {
                updatedFreezes -= 1;
                const freezeDocId = `${habit.id}_${targetMissDate}`;
                await setDoc(doc(db, COLLECTION.HABIT_LOGS, freezeDocId), {
                  habitId: habit.id, userId: user.uid,
                  date: targetMissDate, isFreeze: true, count: 1,
                  timestamp: serverTimestamp(),
                });
                // Streak is protected!
              } else if ((habit.streak || 0) > 0) {
                await updateDoc(doc(db, COLLECTION.HABITS, habit.id), { streak: 0 });
              }
            }
          }

          if (updatedFreezes !== currentFreezes || didGrant) {
            await AsyncStorage.setItem('zentrack_habit_freezes', updatedFreezes.toString());
          }
          setFreezes(updatedFreezes);
        } catch (e) {
          console.error("[HabitsScreen] Evaluator error", e);
        }
      })();
    });
  }, [user, loading, allHabits, habitLogs]);

  useEffect(() => {
    animateFadeInUp(headerFade, headerSlide, 0).start();
  }, []);

  const habitMap = useMemo(() => {
    const map = new Map<string, Habit>();
    for (const h of allHabits) {
      map.set(h.id, h);
    }
    return map;
  }, [allHabits]);

  const activeHabits = useMemo(() => allHabits.filter(h => !h.archived), [allHabits]);
  const positiveHabits = useMemo(() => activeHabits.filter(h => h.type !== 'negative'), [activeHabits]);
  const negativeHabits = useMemo(() => activeHabits.filter(h => h.type === 'negative'), [activeHabits]);

  const todayLogs = useMemo(
    () => habitLogs.filter(l => l.date === today),
    [habitLogs, today]
  );

  const todayLogsByHabitId = useMemo(() => {
    const map = new Map<string, HabitLog>();
    for (const l of todayLogs) {
      map.set(l.habitId, l);
    }
    return map;
  }, [todayLogs]);

  const logsByHabitId = useMemo(() => {
    const map = new Map<string, HabitLog[]>();
    for (const l of habitLogs) {
      const existing = map.get(l.habitId);
      if (existing) {
        existing.push(l);
      } else {
        map.set(l.habitId, [l]);
      }
    }
    return map;
  }, [habitLogs]);
  
  // Calculate completed count for the badge (positives only). For quantitative, count >= targetCount
  const completedCount = useMemo(() => {
    let count = 0;
    for (const l of todayLogs) {
      const h = habitMap.get(l.habitId);
      if (!h || h.type === 'negative') continue;
      if (h.targetCount && h.targetCount > 0) {
        if ((l.count || 1) >= h.targetCount) count++;
      } else {
        count++;
      }
    }
    return count;
  }, [todayLogs, habitMap]);
  
  const handleQuantitativeUndo = useCallback((habit: Habit, existingLog: HabitLog) => {
    const newCount = (existingLog.count || 1) - 1;
    const wasComplete = (existingLog.count || 1) >= habit.targetCount!;

    // Optimistic UI update
    if (newCount <= 0) {
      optimisticRemoveHabitLog(habit.id, today);
    } else {
      optimisticUpdateHabitLog(existingLog.id, { count: newCount });
    }
    if (wasComplete && newCount < habit.targetCount!) {
      optimisticUpdateHabit(habit.id, { streak: Math.max(0, (habit.streak || 1) - 1) });
    }

    (async () => {
      try {
        // Use deterministic doc ID: no stale-ID race conditions ever
        const logDocId = `${habit.id}_${today}`;
        if (newCount <= 0) {
          await deleteDoc(doc(db, COLLECTION.HABIT_LOGS, logDocId));
        } else {
          await setDoc(doc(db, COLLECTION.HABIT_LOGS, logDocId), {
            habitId: habit.id, userId: user!.uid,
            date: today, count: newCount,
            timestamp: serverTimestamp(),
          });
        }
        if (wasComplete && newCount < habit.targetCount!) {
          await updateDoc(doc(db, COLLECTION.HABITS, habit.id), {
            streak: Math.max(0, (habit.streak || 1) - 1)
          });
        }
      } catch (e) { console.error('[Habits] Undo quantitative error', e); }
    })();
  }, [today, user, optimisticRemoveHabitLog, optimisticUpdateHabitLog, optimisticUpdateHabit]);

  const toggleHabit = useCallback((habit: Habit, x?: number, y?: number) => {
    if (!user) return;
    const now = Date.now();
    const lastTap = inFlightHabitLocks.current.get(habit.id) || 0;
    const isQuantitative = typeof habit.targetCount === 'number' && habit.targetCount > 0;

    // IDEMPOTENCY GUARD: 280ms lock for binary toggles, 140ms for quantitative taps
    const minDelay = isQuantitative ? 140 : 280;
    if (now - lastTap < minDelay) {
      return;
    }
    inFlightHabitLocks.current.set(habit.id, now);

    const existingLog = todayLogsByHabitId.get(habit.id);

    if (isQuantitative) {
       const currentCount = existingLog ? (existingLog.count || 1) : 0;
       
       if (currentCount >= habit.targetCount!) {
          Alert.alert("Undo Completion", `Remove a logged action for ${habit.name}?`, [
            { text: "Cancel", style: "cancel" },
            { text: "Remove", style: "destructive", onPress: () => handleQuantitativeUndo(habit, existingLog!) }
          ]);
          return;
       }
       
       const newCount = currentCount + 1;
       const isNowComplete = newCount >= habit.targetCount!;
       
       if (isNowComplete) {
         import('expo-haptics').then(Haptics => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
       } else {
         import('expo-haptics').then(Haptics => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
       }

       const logDocId = `${habit.id}_${today}`;
       if (existingLog) {
          optimisticUpdateHabitLog(existingLog.id, { count: newCount });
       } else {
          optimisticAddHabitLog({ id: logDocId, habitId: habit.id, userId: user.uid, date: today, count: newCount });
       }
       if (isNowComplete) {
          const newStreak = (habit.streak || 0) + 1;
          optimisticUpdateHabit(habit.id, { 
            streak: newStreak, 
            longestStreak: Math.max(newStreak, habit.longestStreak || 0) 
          });
       }

       (async () => {
         try {
           const isFirstTap = !existingLog;
           if (isFirstTap) await awardXP('HABIT_LOG');
           const logData = { habitId: habit.id, userId: user.uid, date: today, count: newCount };
           await safeWrite(
             () => setDoc(doc(db, COLLECTION.HABIT_LOGS, logDocId), { ...logData, timestamp: serverTimestamp() }),
             COLLECTION.HABIT_LOGS, 'set', logData, logDocId,
           );
           if (isNowComplete) {
             const newStreak = (habit.streak || 0) + 1;
             const streakData = { streak: newStreak, longestStreak: Math.max(newStreak, habit.longestStreak || 0) };
             await safeWrite(
               () => updateDoc(doc(db, COLLECTION.HABITS, habit.id), streakData),
               COLLECTION.HABITS, 'update', streakData, habit.id,
             );
             // Streak milestone bonuses (matches web HabitsModule logic)
             if (newStreak === 7) {
               await awardXP('HABIT_STREAK_7');
             } else if (newStreak === 30) {
               await awardXP('HABIT_STREAK_30');
             }
             // PERFECT_DAY — check if every positive non-archived habit is done today
             const perfectDayKey = `zentrack_perfect_day_${today}`;
             const alreadyClaimed = await AsyncStorage.getItem(perfectDayKey);
             if (!alreadyClaimed) {
               const posHabits = allHabits.filter(h => h.type !== 'negative' && !h.archived);
               const updatedLogsMap = new Map<string, HabitLog | { habitId: string; date: string; count?: number }>();
               for (const l of todayLogs) {
                 updatedLogsMap.set(l.habitId, l);
               }
               updatedLogsMap.set(habit.id, { habitId: habit.id, date: today, count: newCount });
               const allDone = posHabits.every(h => {
                 const log = updatedLogsMap.get(h.id);
                 if (!log) return false;
                 if (h.targetCount && h.targetCount > 0) return (log.count || 1) >= h.targetCount;
                 return true;
               });
               if (allDone && posHabits.length > 0) {
                 await AsyncStorage.setItem(perfectDayKey, '1');
                 await awardXP('PERFECT_DAY');
                 import('expo-haptics').then(H => H.notificationAsync(H.NotificationFeedbackType.Success));
                 DeviceEventEmitter.emit('zentrack_perfect_day', { date: today });
               }
             }
           }
         } catch (e) {
           console.error('[HabitsScreen] Error updating quantitative habit', e);
         }
       })();
       
       return;
    }
    
    // 1. Optimistic Update (Instant UI) for binary habits
    const logDocId = `${habit.id}_${today}`;
    if (existingLog) {
      import('expo-haptics').then(Haptics => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
      optimisticRemoveHabitLog(habit.id, today);
      optimisticUpdateHabit(habit.id, { streak: Math.max(0, (habit.streak || 1) - 1) });
    } else {
      import('expo-haptics').then(Haptics => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
      optimisticAddHabitLog({ id: logDocId, habitId: habit.id, userId: user.uid, date: today, count: 1 });
      const newStreak = (habit.streak || 0) + 1;
      optimisticUpdateHabit(habit.id, { 
        streak: newStreak, 
        longestStreak: Math.max(newStreak, habit.longestStreak || 0) 
      });
    }

    // 2. Background Sync — via safeWrite so offline writes survive force-kills
    (async () => {
      try {
        if (existingLog) {
          // Unlog: delete the log doc and decrement streak
          await safeWrite(
            () => deleteDoc(doc(db, COLLECTION.HABIT_LOGS, logDocId)),
            COLLECTION.HABIT_LOGS, 'delete', null, logDocId,
          );
          const streakData = { streak: Math.max(0, (habit.streak || 1) - 1) };
          await safeWrite(
            () => updateDoc(doc(db, COLLECTION.HABITS, habit.id), streakData),
            COLLECTION.HABITS, 'update', streakData, habit.id,
          );
        } else {
          // Log: set the log doc (upsert with deterministic ID) and increment streak
          await awardXP('HABIT_LOG');
          const logData = { habitId: habit.id, userId: user.uid, date: today, count: 1 };
          await safeWrite(
            () => setDoc(doc(db, COLLECTION.HABIT_LOGS, logDocId), { ...logData, timestamp: serverTimestamp() }),
            COLLECTION.HABIT_LOGS, 'set', logData, logDocId,
          );
          const newStreak = (habit.streak || 0) + 1;
          const streakData = { streak: newStreak, longestStreak: Math.max(newStreak, habit.longestStreak || 0) };
          await safeWrite(
            () => updateDoc(doc(db, COLLECTION.HABITS, habit.id), streakData),
            COLLECTION.HABITS, 'update', streakData, habit.id,
          );
          // Streak milestone bonuses (matches web HabitsModule logic)
          if (newStreak === 7) {
            await awardXP('HABIT_STREAK_7');
          } else if (newStreak === 30) {
            await awardXP('HABIT_STREAK_30');
          }
          // PERFECT_DAY — check if every positive non-archived habit is done today
          const perfectDayKey = `zentrack_perfect_day_${today}`;
          const alreadyClaimed = await AsyncStorage.getItem(perfectDayKey);
          if (!alreadyClaimed) {
            const posHabits = allHabits.filter(h => h.type !== 'negative' && !h.archived);
            const updatedLogsMap = new Map<string, HabitLog | { habitId: string; date: string; count?: number }>();
            for (const l of todayLogs) {
              updatedLogsMap.set(l.habitId, l);
            }
            updatedLogsMap.set(habit.id, { habitId: habit.id, date: today, count: 1 });
            const allDone = posHabits.every(h => {
              const log = updatedLogsMap.get(h.id);
              if (!log) return false;
              if (h.targetCount && h.targetCount > 0) return (log.count || 1) >= h.targetCount;
              return true;
            });
            if (allDone && posHabits.length > 0) {
              await AsyncStorage.setItem(perfectDayKey, '1');
              await awardXP('PERFECT_DAY');
              import('expo-haptics').then(H => H.notificationAsync(H.NotificationFeedbackType.Success));
              DeviceEventEmitter.emit('zentrack_perfect_day', { date: today });
            }
          }
        }
      } catch (e) {
        console.error('[HabitsScreen] Error toggling habit', e);
      }
    })();
  }, [user, today, todayLogs, todayLogsByHabitId, handleQuantitativeUndo, optimisticUpdateHabitLog, optimisticAddHabitLog, optimisticUpdateHabit, optimisticRemoveHabitLog, allHabits]);

  const handleArchive = useCallback(async (habitId: string) => {
    try {
      await updateDoc(doc(db, COLLECTION.HABITS, habitId), { archived: true });
    } catch (e) {
      console.error('Error archiving habit', e);
    }
  }, []);

  const handleDelete = useCallback(async (habitId: string) => {
    try {
      await deleteDoc(doc(db, COLLECTION.HABITS, habitId));
    } catch (e) {
      console.error('Error deleting habit', e);
    }
  }, []);

  const handleFireConfetti = useCallback((x: number, y: number, color: string) => {
    setConfettiOpts({ x, y, color });
  }, []);

  const listData = useMemo(() => {
    if (positiveHabits.length === 0 && negativeHabits.length === 0) return [];
    return [{ type: 'header' }, ...positiveHabits, { type: 'divider' }, ...negativeHabits];
  }, [positiveHabits, negativeHabits]);

  const keyExtractor = useCallback((item: any, i: number) => item.id || `type-${i}`, []);

  const renderItem = useCallback(({ item, index }: { item: any; index: number }) => {
    if (item.type === 'header' && positiveHabits.length > 0) {
      return <Text style={styles.sectionHeader}>Building</Text>;
    }
    if (item.type === 'divider' && negativeHabits.length > 0) {
      return <Text style={[styles.sectionHeader, { marginTop: SPACE.xl }]}>Avoiding</Text>;
    }
    if (item.type === 'header' || item.type === 'divider') return null;

    const h = item as Habit;
    const todayLog = todayLogsByHabitId.get(h.id);
    const isCompleted = h.targetCount && h.targetCount > 0 ? (todayLog?.count || 0) >= h.targetCount : !!todayLog;
    const logsForHabit = logsByHabitId.get(h.id) || [];

    return (
      <Reanimated.View entering={FadeInDown.delay(index * 40).springify()}>
        <HabitCard
          habit={h}
          isCompleted={isCompleted}
          todayLog={todayLog}
          habitLogs={logsForHabit}
          onToggle={(x, y) => toggleHabit(h, x, y)}
          onArchive={() => handleArchive(h.id)}
          onDelete={() => handleDelete(h.id)}
          onFireConfetti={handleFireConfetti}
          freezesLeft={freezes}
        />
      </Reanimated.View>
    );
  }, [positiveHabits.length, negativeHabits.length, styles.sectionHeader, todayLogsByHabitId, logsByHabitId, toggleHabit, handleArchive, handleDelete, handleFireConfetti, freezes]);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <Animated.View style={[styles.header, { opacity: headerFade, transform: [{ translateY: headerSlide }] }]}>
        <View>
          <Text style={styles.eyebrow}>Today's Progress</Text>
          <Text style={styles.headerTitle}>Habits</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <TouchableOpacity style={styles.headerIconBtn} onPress={() => setShowReminderModal(true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="notifications-outline" size={18} color={isDark ? '#f2f2f7' : colors.textPrimary} />
          </TouchableOpacity>
          <View style={styles.statBadge}>
            <Text style={styles.statNum}>{completedCount}/{positiveHabits.length}</Text>
          </View>
        </View>
      </Animated.View>

      {/* —————————————————————————————————————————————————————————————————————— */}
      {loading && allHabits.length === 0 ? (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
          <HabitsSkeleton />
        </ScrollView>
      ) : (
        <FlashList
          data={listData}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <EmptyState
              mascot="running"
              title="No habits yet"
              subtitle="Start building your routines today."
            />
          }
        />
      )}

      <AnimatedPressable style={styles.fab} onPress={() => setCreateVisible(true)} activeOpacity={0.85}>
        <Ionicons name="add" size={26} color="#FFFFFF" />
      </AnimatedPressable>

      {user && createVisible && (
        <CreateHabitModal
          visible={createVisible}
          userId={user.uid}
          onClose={() => setCreateVisible(false)}
        />
      )}

      {showReminderModal && (
        <HabitReminderModal
          visible={showReminderModal}
          onClose={() => setShowReminderModal(false)}
          habits={activeHabits}
        />
      )}

      {confettiOpts && (
        <ConfettiCannon
          count={100}
          origin={{ x: confettiOpts.x, y: confettiOpts.y }}
          colors={[confettiOpts.color, '#FFFFFF', colors.accentAmber]}
          explosionSpeed={350}
          fadeOut={true}
          autoStart={true}
          onAnimationEnd={() => setConfettiOpts(null)}
        />
      )}
    </SafeAreaView>
  );
}

const makeStyles = (colors: any, isDark: boolean = true) => StyleSheet.create({
  root: { flex: 1, backgroundColor: isDark ? '#000000' : colors.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12,
  },
  headerIconBtn: {
    width: 36, height: 36,
    borderRadius: 18,
    backgroundColor: isDark ? colors.surface : '#FFFFFF',
    borderWidth: 1,
    borderColor: isDark ? colors.border : '#E2E1EA',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: isDark ? 0.2 : 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  eyebrow: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 11,
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  headerTitle: { fontFamily: FONT_FAMILY.title, fontSize: 26, color: colors.textPrimary },
  statBadge: { 
    backgroundColor: isDark ? colors.accentGreenDim : 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1,
    borderColor: isDark ? 'transparent' : 'rgba(16, 185, 129, 0.25)',
    paddingHorizontal: 12, paddingVertical: 8, 
    borderRadius: 10,
    alignItems: 'center', justifyContent: 'center'
  },
  statNum: { color: isDark ? colors.accentGreen : '#059669', fontSize: 14, fontFamily: FONT_FAMILY.bold },
  statLabel: { color: isDark ? colors.accentGreen : '#059669', fontSize: 9, fontFamily: FONT_FAMILY.body, marginTop: 2 },

  list: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 120 },

  sectionHeader: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 11,
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 14,
    marginLeft: 2,
  },

  habitCard: {
    backgroundColor: isDark ? colors.surface : '#FFFFFF',
    padding: 16,
    borderRadius: 20,
    marginBottom: 12,
    borderWidth: 1, 
    borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
    flexDirection: 'column',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: isDark ? 0.35 : 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  habitCardCompleted: {
    opacity: isDark ? 0.85 : 0.9,
  },
  avatar: {
    width: 46, height: 46, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarEmoji: { fontSize: 24 },
  habitName: { 
    fontFamily: FONT_FAMILY.bold, 
    fontSize: 16, 
    color: colors.textPrimary,
    letterSpacing: -0.2,
  },
  habitNameCompleted: { 
    fontFamily: FONT_FAMILY.medium, 
    fontSize: 16, 
    color: colors.textMuted,
  },
  streakBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  actionCheckRing: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekStripContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
  },
  weekDayColumn: {
    alignItems: 'center',
    gap: 5,
  },
  weekDayLabel: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 10,
    color: colors.textMuted,
    textTransform: 'uppercase',
  },
  weekDayDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },

  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyText: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.md, color: colors.textMuted },

  typeBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: RADIUS.md,
    backgroundColor: isDark ? 'transparent' : '#F5F4FA',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: isDark ? 'transparent' : '#E2E1EA',
  },
  typeBtnActivePos: {
    backgroundColor: isDark ? '#1b2a22' : 'rgba(16, 185, 129, 0.12)',
    borderColor: isDark ? '#5eda9e' : '#059669',
  },
  typeBtnActiveNeg: {
    backgroundColor: isDark ? '#2a1a1c' : 'rgba(239, 68, 68, 0.12)',
    borderColor: isDark ? '#ff6961' : '#DC2626',
  },
  typeBtnText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: FONT_SIZE.sm,
    color: colors.textMuted,
  },
  typeBtnTextActivePos: {
    color: isDark ? '#5eda9e' : '#059669',
    fontFamily: FONT_FAMILY.bold,
  },
  typeBtnTextActiveNeg: {
    color: isDark ? '#ff6961' : '#DC2626',
    fontFamily: FONT_FAMILY.bold,
  },

  emojiChip: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: isDark ? '#1c1c1e' : '#F5F4FA',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#E2E1EA',
  },
  emojiChipActive: {
    backgroundColor: isDark ? 'rgba(165,153,255,0.2)' : 'rgba(108,92,231,0.15)',
    borderColor: isDark ? '#a599ff' : '#6C5CE7',
    borderWidth: 1.5,
  },

  colorDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  colorDotActive: {
    borderWidth: 2.5,
    borderColor: isDark ? '#FFFFFF' : '#1F2937',
  },

  fab: {
    position: 'absolute', bottom: 84, right: 16,
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: colors.accentPrimary,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.accentPrimary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: isDark ? 0.4 : 0.3,
    shadowRadius: 10,
    elevation: 5,
    zIndex: 100,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalKAV: {
    width: '100%',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: isDark ? (colors.surfaceRaised || '#1C1C1E') : '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
    width: '100%',
    borderTopWidth: 1,
    borderColor: isDark ? colors.border : '#E2E1EA',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: isDark ? 0.5 : 0.1,
    shadowRadius: 16,
    elevation: 20,
  },
  modalTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 22,
    color: colors.textPrimary,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
  },
  modalInput: {
    backgroundColor: isDark ? (colors.surface2 || '#1C1C1E') : '#F8F7FC',
    borderRadius: RADIUS.md,
    padding: 14,
    color: colors.textPrimary,
    fontFamily: FONT_FAMILY.body,
    fontSize: 15,
    borderWidth: 1,
    borderColor: isDark ? colors.border : '#E2E1EA',
    marginBottom: 16,
  },
  sectionTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 11,
    color: colors.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  frequencyRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24,
  },
  freqBtn: {
    flex: 1,
    backgroundColor: isDark ? (colors.surface2 || '#1C1C1E') : '#F5F4FA',
    paddingVertical: 11,
    borderRadius: RADIUS.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: isDark ? colors.border : '#E2E1EA',
  },
  freqBtnActive: {
    backgroundColor: isDark ? colors.accentDim : 'rgba(108, 92, 231, 0.12)',
    borderColor: colors.accentPrimary,
  },
  freqBtnText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 11,
    color: colors.textMuted,
  },
  freqBtnTextActive: {
    color: colors.accentPrimary,
    fontFamily: FONT_FAMILY.bold,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: isDark ? (colors.surface2 || '#1C1C1E') : '#F5F4FA',
    paddingVertical: 15,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: isDark ? colors.border : '#E2E1EA',
  },
  cancelBtnText: {
    color: colors.textMuted,
    fontFamily: FONT_FAMILY.medium,
    fontSize: 15,
  },
  saveBtn: {
    flex: 2,
    backgroundColor: isDark ? '#34C759' : '#059669',
    paddingVertical: 15,
    borderRadius: RADIUS.md,
    alignItems: 'center',
    shadowColor: isDark ? '#34C759' : '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  saveBtnText: {
    color: '#ffffff',
    fontFamily: FONT_FAMILY.bold,
    fontSize: 15,
  },
});
