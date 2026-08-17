import { SafeAreaView } from 'react-native-safe-area-context';
/**
 * HabitsScreen ΓÇö ZenTrack Mobile
 * Full CRUD habits tracking matching web app HabitsModule.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet,
  TextInput, Modal, KeyboardAvoidingView, Platform, Alert, Animated, TouchableOpacity, DeviceEventEmitter
} from 'react-native';
import Reanimated, { useSharedValue, useAnimatedStyle, withSpring, FadeInDown, withSequence, withTiming } from 'react-native-reanimated';
import AnimatedPressable from '../components/AnimatedPressable';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { collection, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore';
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

const getTodayStr = () => formatLocalDateStr(new Date());
const today = formatLocalDateStr(new Date());

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

// ─── Habit Card ────────────────────────────────────────────────────────ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

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

  // Calculate 15-day heatmap (for positive habits only) — O(1) indexed lookup
  const heatmapSquares = useMemo(() => {
    if (isNegative) return null;
    const logDateMap = new Map<string, HabitLog>();
    for (const l of habitLogs) {
      if (l.date) logDateMap.set(l.date, l);
    }

    const squares = [];
    const nowMs = new Date().getTime();
    for (let i = 14; i >= 0; i--) {
      const d = new Date(nowMs - i * 24 * 60 * 60 * 1000);
      const dateStr = formatLocalDateStr(d);
      const log = logDateMap.get(dateStr);
      let status: 'completed' | 'missed' | 'freeze' | 'future' = 'missed';

      if (log) {
        if (log.isFreeze) status = 'freeze';
        else if (habit.targetCount && habit.targetCount > 0) {
          status = (log.count || 0) >= habit.targetCount ? 'completed' : 'missed';
        } else {
          status = 'completed';
        }
      } else if (dateStr >= today) {
        status = 'future';
      } else {
        if (habit.startDate && dateStr < habit.startDate) {
          status = 'future';
        }
      }
      squares.push({ date: dateStr, status });
    }
    return squares;
  }, [isNegative, habitLogs, habit.targetCount, habit.startDate]);

  const animatedCheckStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
  }));

  const handlePress = useCallback((e: any) => {
    const pageX = e.nativeEvent?.pageX;
    const pageY = e.nativeEvent?.pageY;
    if (isNegative) {
      if (isCompleted) {
        // Undo relapse
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
    checkScale.value = withSpring(1.2, { damping: 10, stiffness: 300 }, () => {
      checkScale.value = withSpring(1, { damping: 14, stiffness: 200 });
    });
    emojiScale.value = withSequence(
      withTiming(0.8, { duration: 100 }),
      withSpring(1.2, { damping: 8, stiffness: 250 }),
      withSpring(1.0, { damping: 14, stiffness: 200 })
    );
  }, [isNegative, isCompleted, onToggle, habit.name, checkScale]);

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
      activeOpacity={0.7} 
      onLongPress={handleLongPress} 
      delayLongPress={300}
      onPress={handlePress}
      style={[
        styles.habitCard, 
        isCompleted && !isNegative && styles.habitCardCompleted,
        isNegative && { 
          borderColor: isCompleted 
            ? (isDark ? 'rgba(255,105,97,0.3)' : '#FCA5A5') 
            : (isDark ? 'rgba(255,255,255,0.05)' : '#E2E1EA'), 
          backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF' 
        },
        !isNegative && { 
          backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF',
          borderColor: isCompleted && !isDark 
            ? 'rgba(16, 185, 129, 0.35)' 
            : (isDark ? 'rgba(255,255,255,0.05)' : '#E2E1EA')
        }
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%' }}>
        
        {!isNegative && (
          <View style={{ paddingRight: SPACE.md }}>
            {habit.targetCount && habit.targetCount > 0 ? (
              <View style={[
                styles.checkCircle, 
                { 
                  borderColor: isCompleted 
                    ? (isDark ? colors.accentPrimary : colors.accentGreen) 
                    : (isDark ? 'rgba(255,255,255,0.2)' : '#D1D1D6'), 
                  backgroundColor: isCompleted 
                    ? (isDark ? 'rgba(94, 218, 158, 0.15)' : 'rgba(16, 185, 129, 0.12)') 
                    : (isDark ? 'transparent' : '#F4F3F8') 
                }
              ]}>
                <Text style={{ color: isCompleted ? (isDark ? colors.accentPrimary : colors.accentGreen) : colors.textPrimary, fontSize: 10, fontFamily: FONT_FAMILY.bold }}>
                  {todayLog?.count || 0}/{habit.targetCount}
                </Text>
              </View>
            ) : (
              <Reanimated.View style={[
                styles.checkCircle,
                isCompleted && { 
                  backgroundColor: isDark ? colors.accentPrimary : colors.accentGreen, 
                  borderColor: isDark ? colors.accentPrimary : colors.accentGreen 
                },
                animatedCheckStyle,
              ]}>
                {isCompleted && <Ionicons name="checkmark" size={12} color={isDark ? '#000000' : '#FFFFFF'} />}
              </Reanimated.View>
            )}
          </View>
        )}

        <View style={[
          styles.avatar, 
          isNegative 
            ? { backgroundColor: isDark ? 'rgba(255,105,97,0.12)' : 'rgba(239,68,68,0.10)' } 
            : { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : (habit.color ? `${habit.color}15` : 'rgba(108,92,231,0.10)') }
        ]}>
          <Reanimated.Text style={[styles.avatarEmoji, { transform: [{ scale: emojiScale }] }]}>{habit.emoji}</Reanimated.Text>
        </View>

        <View style={{ flex: 1, marginLeft: 12, justifyContent: 'center' }}>
          <Text style={[styles.habitName, isCompleted && !isNegative && styles.habitNameCompleted]} numberOfLines={1}>{habit.name}</Text>
          
          {isNegative ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 8 }}>
              {isCompleted ? (
                <Text style={[styles.habitStreak, { color: '#ff6961' }]}>Relapsed today</Text>
              ) : (
                <Text style={[styles.habitStreak, { color: isDark ? '#ff6961' : '#DC2626', fontFamily: FONT_FAMILY.bold }]}>{daysClean} days clean</Text>
              )}
              {moneySaved > 0 && !isCompleted && (
                <Text style={[styles.habitStreak, { color: isDark ? colors.accentGreen : '#059669', fontFamily: FONT_FAMILY.bold }]}>+${moneySaved.toFixed(0)} saved</Text>
              )}
            </View>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
              {isCompleted ? (
                <Text style={styles.completedSub}>✓ Completed today</Text>
              ) : (
                <Text style={styles.habitStreak}>
                  {habitLogs.some(l => l.date === new Date(new Date().getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0] && l.isFreeze)
                    ? `❄️ Streak saved! ${freezesLeft || 0} freeze(s) left`
                    : `🔥 ${habit.streak || 0} day streak`
                  }
                </Text>
              )}
            </View>
          )}

          {!isNegative && heatmapSquares && (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 4 }}>
              {heatmapSquares.map((sq, idx) => (
                <View 
                  key={idx}
                  style={{
                    width: 11, 
                    height: 11, 
                    borderRadius: 2.5,
                    backgroundColor: sq.status === 'completed' ? (isDark ? (habit.color || colors.accentPrimary) : (habit.color || '#6C5CE7')) :
                                     sq.status === 'freeze' ? '#06B6D4' :
                                     sq.status === 'missed' ? (isDark ? 'rgba(255,255,255,0.06)' : '#E5E4EE') : 'transparent',
                    borderWidth: sq.status === 'future' ? 1 : 0,
                    borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#D1D1D6'
                  }} 
                />
              ))}
            </View>
          )}
        </View>
      </View>
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

  // ΓöÇΓöÇ Streak Freeze Evaluator ΓöÇΓöÇ
  const [freezes, setFreezes] = useState<number>(0);
  const evaluatorRan = useRef(false);

  useEffect(() => {
    if (!user || loading || evaluatorRan.current) return;
    evaluatorRan.current = true;

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
        const yesterday = new Date(nowMs - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        // Evaluate misses for active daily positive habits
        for (const habit of allHabits) {
          if (habit.type === 'negative' || habit.archived || habit.frequency !== 'daily') continue;
          
          const logs = habitLogs.filter(l => l.habitId === habit.id).sort((a, b) => b.date.localeCompare(a.date));
          if (logs.length === 0) continue;

          const latestLog = logs[0];
          // Did we miss yesterday? (Latest log is older than yesterday)
          if (latestLog.date < yesterday) {
            if (updatedFreezes > 0) {
              updatedFreezes -= 1;
              const freezeDocId = `${habit.id}_${yesterday}`;
              await setDoc(doc(db, COLLECTION.HABIT_LOGS, freezeDocId), {
                habitId: habit.id, userId: user.uid,
                date: yesterday, isFreeze: true, count: 1,
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
  }, [user, loading, allHabits, habitLogs]);

  useEffect(() => {
    animateFadeInUp(headerFade, headerSlide, 0).start();
  }, []);

  const todayLogs = React.useMemo(
    () => habitLogs.filter(l => l.date === today),
    [habitLogs]
  );
  
  // Calculate completed count for the badge (positives only). For quantitative, count >= targetCount
  const completedCount = todayLogs.filter(l => {
    const h = allHabits.find(hx => hx.id === l.habitId);
    if (!h || h.type === 'negative') return false;
    if (h.targetCount && h.targetCount > 0) return (l.count || 1) >= h.targetCount;
    return true;
  }).length;
  
  const handleQuantitativeUndo = (habit: Habit, existingLog: HabitLog) => {
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
  };

  const toggleHabit = (habit: Habit, x?: number, y?: number) => {
    if (!user) return;
    const existingLog = todayLogs.find(l => l.habitId === habit.id);
    const isQuantitative = typeof habit.targetCount === 'number' && habit.targetCount > 0;

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

       // Optimistic UI: use deterministic doc id so snapshot replacement is seamless
       const logDocId = `${habit.id}_${today}`;
       if (existingLog) {
          optimisticUpdateHabitLog(existingLog.id, { count: newCount });
       } else {
          // Use deterministic id for optimistic log ΓÇö matches the Firestore doc id we'll create
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
           // ROOT FIX: Use setDoc with deterministic ID.
           // This is a pure upsert ΓÇö no delete+recreate, no stale IDs, no race conditions.
           // On first tap: Firestore creates the doc (ownsNewDoc() passes).
           // On subsequent taps: Firestore updates it (ownsDoc() passes because userId matches).
           const isFirstTap = !existingLog;
           if (isFirstTap) await awardXP('HABIT_LOG');
           await setDoc(doc(db, COLLECTION.HABIT_LOGS, logDocId), {
             habitId: habit.id, userId: user.uid,
             date: today, count: newCount,
             timestamp: serverTimestamp(),
           });
           if (isNowComplete) {
             const newStreak = (habit.streak || 0) + 1;
             await updateDoc(doc(db, COLLECTION.HABITS, habit.id), { 
               streak: newStreak,
               longestStreak: Math.max(newStreak, habit.longestStreak || 0)
             });
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

    // 2. Background Sync
    (async () => {
      try {
        if (existingLog) {
          await deleteDoc(doc(db, COLLECTION.HABIT_LOGS, logDocId));
          await updateDoc(doc(db, COLLECTION.HABITS, habit.id), { streak: Math.max(0, (habit.streak || 1) - 1) });
        } else {
          await awardXP('HABIT_LOG');
          await setDoc(doc(db, COLLECTION.HABIT_LOGS, logDocId), {
            habitId: habit.id,
            userId: user.uid,
            date: today,
            count: 1,
            timestamp: serverTimestamp(),
          });
          const newStreak = (habit.streak || 0) + 1;
          await updateDoc(doc(db, COLLECTION.HABITS, habit.id), { 
            streak: newStreak,
            longestStreak: Math.max(newStreak, habit.longestStreak || 0)
          });
        }
      } catch (e) {
        console.error('[HabitsScreen] Error toggling habit', e);
      }
    })();
  };

  const handleArchive = async (habitId: string) => {
    try {
      await updateDoc(doc(db, COLLECTION.HABITS, habitId), { archived: true });
    } catch (e) {
      console.error('Error archiving habit', e);
    }
  };

  const handleDelete = async (habitId: string) => {
    try {
      await deleteDoc(doc(db, COLLECTION.HABITS, habitId));
    } catch (e) {
      console.error('Error deleting habit', e);
    }
  };

  const activeHabits = allHabits.filter(h => !h.archived);
  const positiveHabits = activeHabits.filter(h => h.type !== 'negative');
  const negativeHabits = activeHabits.filter(h => h.type === 'negative');

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      {/* ΓöÇΓöÇ Header ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ */}
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
      <FlashList
        data={positiveHabits.length === 0 && negativeHabits.length === 0 
          ? [] 
          : [{ type: 'header' }, ...positiveHabits, { type: 'divider' }, ...negativeHabits]}
        keyExtractor={(item: any, i) => item.id || `type-${i}`}
        renderItem={({ item, index }: any) => {
          if (item.type === 'header' && positiveHabits.length > 0) {
            return <Text style={styles.sectionHeader}>Building</Text>;
          }
          if (item.type === 'divider' && negativeHabits.length > 0) {
            return <Text style={[styles.sectionHeader, { marginTop: SPACE.xl }]}>Avoiding</Text>;
          }
          if (item.type === 'header' || item.type === 'divider') return null;

          const h = item as Habit;
          const todayLog = todayLogs.find(l => l.habitId === h.id);
          const isCompleted = h.targetCount && h.targetCount > 0 ? (todayLog?.count || 0) >= h.targetCount : !!todayLog;
          const logsForHabit = habitLogs.filter(l => l.habitId === h.id);

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
                onFireConfetti={(x, y, color) => setConfettiOpts({ x, y, color })}
                freezesLeft={freezes} // Pass to habit card
              />
            </Reanimated.View>
          );
        }}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <EmptyState
            mascot="running"
            title="No habits yet"
            subtitle="Start building your routines today."
          />
        }
      />

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
    backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF',
    padding: 16,
    borderRadius: RADIUS.lg,
    marginBottom: 10,
    borderWidth: 1, 
    borderColor: isDark ? 'rgba(255,255,255,0.05)' : '#E2E1EA',
    flexDirection: 'column',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: isDark ? 0.3 : 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  habitCardCompleted: {
    opacity: isDark ? 0.7 : 0.8,
  },
  checkCircle: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 1.5, borderColor: isDark ? colors.border : '#D1D1D6',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: isDark ? 'transparent' : '#F4F3F8',
  },
  burstEffect: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 10,
  },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: isDark ? colors.accentDim : 'rgba(108,92,231,0.10)',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarEmoji: { fontSize: 20 },
  habitName: { fontFamily: FONT_FAMILY.bold, fontSize: 15, color: colors.textPrimary },
  habitNameCompleted: { fontFamily: FONT_FAMILY.medium, fontSize: 15, color: colors.textMuted, textDecorationLine: 'line-through' },
  habitStreak: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: FONT_SIZE.xs,
    color: isDark ? colors.textMuted : '#B45309',
    marginTop: 2,
  },
  completedSub: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.xs,
    color: isDark ? colors.accentGreen : '#059669',
    marginTop: 2,
  },
  freqBadge: {
  },
  heatMapSquare: {
    width: 11, height: 11,
    borderRadius: 2.5,
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
    position: 'absolute', bottom: 100, right: 20,
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
