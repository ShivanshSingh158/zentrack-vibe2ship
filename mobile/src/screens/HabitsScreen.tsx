import { SafeAreaView } from 'react-native-safe-area-context';
/**
 * HabitsScreen — ZenTrack Mobile
 * Full CRUD habits tracking matching web app HabitsModule.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet,
  TextInput, Modal, KeyboardAvoidingView, Platform, Alert, Animated
} from 'react-native';
import Reanimated, { useSharedValue, useAnimatedStyle, withSpring, FadeInDown } from 'react-native-reanimated';
import AnimatedPressable from '../components/AnimatedPressable';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { collection, addDoc, updateDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useMobileData, Habit, HabitLog } from '../contexts/MobileDataContext';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS, SHADOW } from '../theme/tokens';
import { animateFadeInUp } from '../theme/animations';
import * as Haptics from 'expo-haptics';
import { awardXP } from '../services/xpSystem';
import ConfettiCannon from 'react-native-confetti-cannon';
import { COLLECTION } from '../config/constants';
import { useTheme } from "../contexts/ThemeContext";

const today = new Date().toISOString().slice(0, 10);

// Helper for heat map dates
const getPastDays = (numDays: number) => {
  const dates = [];
  const d = new Date();
  for (let i = numDays - 1; i >= 0; i--) {
    const temp = new Date(d);
    temp.setDate(temp.getDate() - i);
    dates.push(temp.toISOString().slice(0, 10));
  }
  return dates;
};

// ─── Create Habit Modal ───────────────────────────────────────────────────────

function CreateHabitModal({ visible, userId, onClose }: {
  visible: boolean; userId: string; onClose: () => void;
}) {
    const { colors, isDark } = useTheme();
    const styles = makeStyles(colors);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('⭐');
  const [frequency, setFrequency] = useState('daily');
  const [customDays, setCustomDays] = useState<string[]>([]);
  const [color, setColor] = useState(colors.accentPrimary);
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const HABIT_COLORS = [colors.accentPrimary, colors.accentGreen, colors.accentAmber, '#FF3B30', '#34C759', '#007AFF'];
  const [saving, setSaving] = useState(false);
  const translateY = useSharedValue(300);
  const modalAnimStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }));

  useEffect(() => {
    if (visible) {
      translateY.value = withSpring(0, { damping: 18, stiffness: 150 });
    } else {
      translateY.value = 300;
    }
  }, [visible]);

  const handleSave = () => {
    if (!name.trim()) return;
    
    // Optimistic UI update: instantly close modal and trigger haptic
    import('expo-haptics').then(Haptics => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
    
    // Fire-and-forget network request, deferred to prevent animation frame drops
    setTimeout(() => {
      addDoc(collection(db, COLLECTION.HABITS), {
        userId,
        name: name.trim(),
        emoji: emoji.trim() || '⭐',
        frequency: frequency === 'custom' && customDays.length > 0 ? customDays.join(', ') : frequency,
        streak: 0,
        longestStreak: 0,
        color,
        createdAt: serverTimestamp(),
      }).catch(e => console.error('[Habits] create error', e));
    }, 150);

    setName('');
    setEmoji('⭐');
    setColor(colors.accentPrimary);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <AnimatedPressable style={styles.modalOverlay} activeOpacity={1} onPress={onClose}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalKAV}>
          <Reanimated.View style={[styles.modalCard, modalAnimStyle]} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>New Habit</Text>
            
            <TextInput
                style={styles.modalInput}
                placeholder="Name"
                placeholderTextColor={colors.textMuted}
                value={name}
                onChangeText={setName}
            />

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
          </Reanimated.View>
        </KeyboardAvoidingView>
      </AnimatedPressable>
    </Modal>
  );
}

// ─── Habit Card ───────────────────────────────────────────────────────────────

const HabitCard = React.memo(function HabitCard({ habit, isCompleted, onToggle, onArchive, onDelete, habitLogs, onFireConfetti }: {
  habit: Habit;
  isCompleted: boolean;
  onToggle: () => void;
  onArchive: () => void;
  onDelete: () => void;
  habitLogs: HabitLog[];
  onFireConfetti: (x: number, y: number, color: string) => void;
}) {
  const { colors, isDark } = useTheme();
  const styles = makeStyles(colors);
  const checkScale = useSharedValue(1);
  const burstOpacity = useSharedValue(0);
  const burstScale = useSharedValue(0);
  const checkRef = useRef<View>(null);

  const pastDays = getPastDays(30);
  const habitColor = habit.color || colors.accentPrimary;
  const monthlyLogsCount = habitLogs.filter(l => l.date >= pastDays[0]).length;

  const animatedCheckStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
  }));
  const animatedBurstStyle = useAnimatedStyle(() => ({
    opacity: burstOpacity.value,
    transform: [{ scale: burstScale.value }],
  }));

  const handlePress = useCallback(() => {
    // Fire instantly — no waiting for animation
    onToggle();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Bounce on UI thread via Reanimated worklet
    checkScale.value = withSpring(1.3, { damping: 5, stiffness: 400 }, () => {
      checkScale.value = withSpring(1, { damping: 14, stiffness: 200 });
    });
    if (!isCompleted) {
      burstOpacity.value = 1;
      burstScale.value = 0.5;
      burstOpacity.value = withSpring(0, { damping: 5, stiffness: 80 });
      burstScale.value = withSpring(2.2, { damping: 6, stiffness: 120 }, () => {
        burstOpacity.value = 0;
        burstScale.value = 0;
      });

      const newStreak = (habit.streak || 0) + 1;
      if (newStreak > 0 && newStreak % 7 === 0) {
        checkRef.current?.measureInWindow((x, y) => {
          onFireConfetti(x, y, habitColor);
        });
      }
    }
  }, [onToggle, isCompleted, habit.streak, habitColor]);

  const handleLongPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
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
      style={[styles.habitCard, isCompleted && styles.habitCardCompleted]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', width: '100%' }}>
        
        <AnimatedPressable onPress={handlePress} activeOpacity={0.8} style={{ paddingRight: SPACE.md, paddingTop: 4 }}>
          <View ref={checkRef} style={{ position: 'relative' }}>
            <Reanimated.View style={[
              styles.burstEffect,
              { backgroundColor: '#5eda9e' },
              animatedBurstStyle,
            ]} />
            <Reanimated.View style={[
              styles.checkCircle,
              isCompleted && { backgroundColor: '#5eda9e', borderColor: '#5eda9e' },
              animatedCheckStyle,
            ]}>
              {isCompleted && <Ionicons name="checkmark" size={12} color="#000000" />}
            </Reanimated.View>
          </View>
        </AnimatedPressable>

        <View style={styles.avatar}>
          <Text style={styles.avatarEmoji}>{habit.emoji}</Text>
        </View>

        <View style={{ flex: 1, marginLeft: 12, justifyContent: 'center' }}>
          
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Text style={[styles.habitName, isCompleted && styles.habitNameCompleted]} numberOfLines={1}>{habit.name}</Text>
            {habit.frequency && (
              <View style={styles.freqBadge}>
                <Text style={styles.freqBadgeText}>{habit.frequency}</Text>
              </View>
            )}
          </View>

          {isCompleted ? (
            <Text style={styles.completedSub}>Completed today</Text>
          ) : (
            <>
              {habit.streak === 0 ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                  <Ionicons name="flash" size={10} color="#5eda9e" />
                  <Text style={[styles.habitStreak, { color: '#5eda9e' }]}>
                    Recharge logged, 1 freeze left
                  </Text>
                </View>
              ) : (
                <Text style={styles.habitStreak}>🔥 {habit.streak || 0} day streak</Text>
              )}
            </>
          )}

        </View>
      </View>

      {!isCompleted && (
        <View style={{ width: '100%', marginTop: 20 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6, paddingHorizontal: 2 }}>
            <Text style={styles.statSubText}>Longest streak: {habit.longestStreak || habit.streak || 0}</Text>
            <Text style={styles.statSubText}>30-day: {monthlyLogsCount}/30</Text>
          </View>

          <View style={styles.heatMapContainer}>
            {pastDays.map(date => {
              const isDone = habitLogs.some(l => l.date === date);
              let bg = '#1c1c1e';
              if (isDone) bg = '#5eda9e';
              return (
                <View 
                  key={date} 
                  style={[styles.heatMapSquare, { backgroundColor: bg }]} 
                />
              );
            })}
          </View>
        </View>
      )}
    </AnimatedPressable>
  );
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function HabitsScreen() {
    const { colors, isDark } = useTheme();
    const styles = makeStyles(colors);
  const { allHabits, habitLogs, user, optimisticUpdateHabit, optimisticAddHabitLog, optimisticRemoveHabitLog } = useMobileData();
  const [createVisible, setCreateVisible] = useState(false);
  
  const [confettiOpts, setConfettiOpts] = useState<{ x: number, y: number, color: string } | null>(null);

  const headerFade = useRef(new Animated.Value(0)).current;
  const headerSlide = useRef(new Animated.Value(-10)).current;

  useEffect(() => {
    animateFadeInUp(headerFade, headerSlide, 0).start();
  }, []);

  const todayLogs = React.useMemo(
    () => habitLogs.filter(l => l.date === today),
    [habitLogs]
  );
  const completedCount = todayLogs.length;
  
  const toggleHabit = (habit: Habit) => {
    if (!user) return;
    const existingLog = todayLogs.find(l => l.habitId === habit.id);
    
    // 1. Optimistic Update (Instant UI)
    if (existingLog) {
      import('expo-haptics').then(Haptics => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
      optimisticRemoveHabitLog(habit.id, today);
      optimisticUpdateHabit(habit.id, { streak: Math.max(0, (habit.streak || 1) - 1) });
    } else {
      import('expo-haptics').then(Haptics => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
      const tempId = `temp_${Date.now()}`;
      optimisticAddHabitLog({ id: tempId, habitId: habit.id, userId: user.uid, date: today });
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
          await deleteDoc(doc(db, COLLECTION.HABIT_LOGS, existingLog.id));
          await updateDoc(doc(db, COLLECTION.HABITS, habit.id), { streak: Math.max(0, (habit.streak || 1) - 1) });
        } else {
          await awardXP('HABIT_LOG');
          await addDoc(collection(db, COLLECTION.HABIT_LOGS), {
            habitId: habit.id,
            userId: user.uid,
            date: today,
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

  const archiveHabit = async (habitId: string) => {
    try {
      await updateDoc(doc(db, COLLECTION.HABITS, habitId), { archived: true });
    } catch (e) {
      console.error('Error archiving habit', e);
    }
  };

  const deleteHabit = async (habitId: string) => {
    try {
      await deleteDoc(doc(db, COLLECTION.HABITS, habitId));
    } catch (e) {
      console.error('Error deleting habit', e);
    }
  };

  const visibleHabits = allHabits.filter(h => !h.archived);

  return (
    <SafeAreaView style={styles.root}>
      <Animated.View style={[styles.header, { opacity: headerFade, transform: [{ translateY: headerSlide }] }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>HABITS</Text>
          <Text style={styles.headerTitle}>Daily check-in</Text>
        </View>
        <View style={styles.statBadge}>
          <Text style={styles.statNum}>{completedCount}/{visibleHabits.length}</Text>
          <Text style={styles.statLabel}>done today</Text>
        </View>
      </Animated.View>

      <FlashList
        data={visibleHabits}
        keyExtractor={h => h.id}
        extraData={todayLogs}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <HabitCard
            habit={item}
            isCompleted={todayLogs.some(l => l.habitId === item.id)}
            onToggle={() => toggleHabit(item)}
            onArchive={() => archiveHabit(item.id)}
            onDelete={() => deleteHabit(item.id)}
            habitLogs={habitLogs.filter(l => l.habitId === item.id)}
            onFireConfetti={(x, y, color) => setConfettiOpts({ x, y, color })}
          />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={{ fontSize: 40, marginBottom: 10 }}>🌱</Text>
            <Text style={styles.emptyText}>No habits yet. Start small.</Text>
          </View>
        }
      />

      <AnimatedPressable style={styles.fab} onPress={() => setCreateVisible(true)} activeOpacity={0.85}>
        <Ionicons name="add" size={26} color={colors.background} />
      </AnimatedPressable>

      {user && (
        <CreateHabitModal
          visible={createVisible}
          userId={user.uid}
          onClose={() => setCreateVisible(false)}
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

const makeStyles = (colors: any) => StyleSheet.create({
      root: { flex: 1, backgroundColor: '#000000' },
      header: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16,
      },
      eyebrow: {
        fontFamily: FONT_FAMILY.bold,
        fontSize: 11,
        color: '#6e6e73',
        textTransform: 'uppercase',
        letterSpacing: 0.33,
        marginBottom: 4,
      },
      headerTitle: { fontFamily: FONT_FAMILY.title, fontSize: 26, color: '#ffffff' },
      statBadge: { 
        backgroundColor: 'rgba(94,218,158,0.12)',
        paddingHorizontal: 12, paddingVertical: 8, 
        borderRadius: 8,
        alignItems: 'center', justifyContent: 'center'
      },
      statNum: { color: '#5eda9e', fontSize: 15, fontFamily: FONT_FAMILY.bold },
      statLabel: { color: '#5eda9e', fontSize: 9, fontFamily: FONT_FAMILY.body, marginTop: 2 },

      list: { padding: 20, paddingBottom: 100 },

      habitCard: {
        backgroundColor: '#141416',
        padding: 15,
        borderRadius: 18,
        marginBottom: 16,
        borderWidth: 1, borderColor: '#2c2c2e',
        flexDirection: 'column',
      },
      habitCardCompleted: {
        padding: 15,
      },
      checkCircle: {
        width: 20, height: 20, borderRadius: 10,
        borderWidth: 2, borderColor: '#3a3a3c',
        alignItems: 'center', justifyContent: 'center',
      },
      burstEffect: {
        ...StyleSheet.absoluteFillObject,
        borderRadius: 10,
      },
      avatar: {
        width: 34, height: 34, borderRadius: 17,
        backgroundColor: 'rgba(165,153,255,0.15)',
        alignItems: 'center', justifyContent: 'center',
      },
      avatarEmoji: { fontSize: 16 },
      habitName: { fontFamily: FONT_FAMILY.bold, fontSize: 14, color: '#f2f2f7' },
      habitNameCompleted: { fontFamily: FONT_FAMILY.body, fontSize: 14, color: '#8e8e93' },
      freqBadge: {
        backgroundColor: '#2c2c2e',
        paddingHorizontal: 6, paddingVertical: 2,
        borderRadius: 4,
      },
      freqBadgeText: { fontFamily: FONT_FAMILY.body, fontSize: 9, color: '#8e8e93' },
      habitStreak: { fontFamily: FONT_FAMILY.body, fontSize: 10.5, color: '#636366', marginTop: 4 },
      completedSub: { fontFamily: FONT_FAMILY.body, fontSize: 10.5, color: '#8e8e93', marginTop: 4 },

      statSubText: { fontFamily: FONT_FAMILY.body, fontSize: 10.5, color: '#636366' },
      
      heatMapContainer: {
        flexDirection: 'row', flexWrap: 'wrap', gap: 3,
        justifyContent: 'flex-start',
      },
      heatMapSquare: {
        width: 10, height: 10,
        borderRadius: 2,
      },

      empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
      emptyText: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.md, color: colors.textMuted },

      fab: {
        position: 'absolute', bottom: 100, right: 20,
        width: 52, height: 52, borderRadius: 26,
        backgroundColor: '#a599ff',
        alignItems: 'center', justifyContent: 'center',
        ...SHADOW.md, zIndex: 100,
      },

      modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
      modalKAV: { width: '100%' },
      modalCard: {
        backgroundColor: colors.surface, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl,
        padding: SPACE.xl, paddingBottom: 40,
      },
      modalTitle: { fontFamily: FONT_FAMILY.title, fontSize: FONT_SIZE.xl, color: colors.textPrimary, marginBottom: SPACE.lg },
      modalInput: {
        backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
        borderRadius: RADIUS.md, padding: SPACE.md,
        fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.md, color: colors.textPrimary,
      },
      modalActions: { flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.xs },
      cancelBtn: { flex: 1, paddingVertical: SPACE.md, borderRadius: RADIUS.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
      cancelBtnText: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.md, color: colors.textMuted },
      saveBtn: { flex: 2, paddingVertical: SPACE.md, borderRadius: RADIUS.md, backgroundColor: colors.accentGreen, alignItems: 'center' },
      saveBtnText: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.md, color: '#1a110a' },

      sectionTitle: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.sm, color: colors.textMuted, marginTop: SPACE.xs },
      frequencyRow: { flexDirection: 'row', gap: SPACE.xs },
      freqBtn: { flex: 1, paddingVertical: SPACE.sm, alignItems: 'center', borderRadius: RADIUS.sm, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
      freqBtnActive: { backgroundColor: colors.accentPrimary + '20', borderColor: colors.accentPrimary },
      freqBtnText: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: colors.textMuted },
      freqBtnTextActive: { fontFamily: FONT_FAMILY.bold, color: colors.accentPrimary },
    });
