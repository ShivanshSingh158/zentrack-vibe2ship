import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { View, Text, ScrollView, KeyboardAvoidingView, Platform, Image, Pressable, StyleSheet, TouchableOpacity, BackHandler, InteractionManager } from 'react-native';
import Animated, {
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { LEVEL_THRESHOLDS, awardXP } from '../services/xpSystem';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { COLLECTION } from '../config/constants';
import { formatLocalDateStr } from '../utils/dateUtils';
import { safeUpdate } from '../utils/safeWrite';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, Feather } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../contexts/ThemeContext';
import { FONT_FAMILY, SPACE } from '../theme/tokens';
import { makeStyles } from './dashboard/dashboardStyles';
import { useDashboardData } from './dashboard/useDashboardData';
import { getLevel } from './dashboard/useXPLevel';
import { UnifiedLifeWidget } from '../components/Dashboard/UnifiedLifeWidget';
import { AgendaWidget } from '../components/Dashboard/AgendaWidget';
import AnimatedPressable from '../components/AnimatedPressable';
import SaraHUDBanner from '../components/SARA/SaraHUDBanner';
import QuickCaptureSheet from '../components/Dashboard/QuickCaptureSheet';
import DashboardLayoutSheet from '../components/Dashboard/DashboardLayoutSheet';
import WaterLogSheet from '../components/Dashboard/WaterLogSheet';
import FlashcardReviewModal from '../components/Learning/FlashcardReviewModal';
import { ActiveRecallBanner } from '../components/Dashboard/ActiveRecallBanner';
import { getDueFlashcards, Flashcard } from '../services/flashcardService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useOfflineStatus } from '../hooks/useOfflineStatus';
import { useWidgetSync } from '../hooks/useWidgetSync';
import { areItemsEqual } from '../utils/schemaGuards';
import DashboardSkeleton from '../components/Dashboard/DashboardSkeleton';
import { LinearGradient } from 'expo-linear-gradient';
import VoiceDictationOverlay from '../components/Tasks/VoiceDictationOverlay';
import UserAvatar from '../components/ui/UserAvatar';
import BottomSheet from '../components/ui/BottomSheet';

export default function DashboardScreen() {
  const { colors, isDark, toggleTheme } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { isOffline, queueCount, recentlySynced } = useOfflineStatus();

  const data = useDashboardData();
  useWidgetSync({
    tasks: data.tasks,
    subjects: data.attendance,
    attendanceLogs: data.attendanceLogs,
    holidays: data.holidays,
    zenScore: data.overallAttendancePct,
    streak: data.appStreak,
    gymLogs: data.gymLogs,
    userGymPlan: data.userGymPlan,
  });
  const paddingBottom = insets.bottom + 80;
  const levelInfo = getLevel(data.xp);

  // ── Flashcards State (checks on app load, only displays if cards are actually due) ──
  const [dueFlashcards, setDueFlashcards] = useState<Flashcard[]>([]);
  const [flashcardModalVisible, setFlashcardModalVisible] = useState(false);
  const [isBannerDismissed, setIsBannerDismissed] = useState(false);

  // ── Voice Task Dictation State (FAB replaces previous Sara button) ──
  const [isVoiceDictationOpen, setIsVoiceDictationOpen] = useState(false);
  // ── One-time entrance animation guard — prevents FadeInDown re-firing on
  //    every Firestore update that causes a parent re-render.
  const hasAnimatedRef = useRef(false);

  const refreshFlashcards = useCallback(async () => {
    if (!data.user?.uid) return;
    try {
      const cards = await getDueFlashcards(data.user.uid);
      
      // Check if current cards have been dismissed
      let allDismissed = false;
      if (cards.length > 0) {
        try {
          const savedDismissed = await AsyncStorage.getItem('@flashcard_banner_dismissed_ids');
          if (savedDismissed) {
            const dismissedIds: string[] = JSON.parse(savedDismissed);
            const currentIds = cards.map(c => c.id || c.question);
            allDismissed = currentIds.every(id => dismissedIds.includes(id));
          }
        } catch (_) {}
      }

      setIsBannerDismissed(allDismissed);
      setDueFlashcards(prev => areItemsEqual(prev, cards) ? prev : cards);
    } catch (err) {
      console.warn('[DashboardScreen] refreshFlashcards error:', err);
    }
  }, [data.user?.uid]);

  const handleDismissBanner = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsBannerDismissed(true);
    try {
      const currentIds = dueFlashcards.map(c => c.id || c.question);
      await AsyncStorage.setItem('@flashcard_banner_dismissed_ids', JSON.stringify(currentIds));
    } catch (_) {}
  }, [dueFlashcards]);

  // Check for due flashcards when authenticated user is loaded
  useEffect(() => {
    if (data.user?.uid) {
      const handle = InteractionManager.runAfterInteractions(() => {
        refreshFlashcards();
      });
      return () => handle.cancel();
    }
  }, [data.user?.uid, refreshFlashcards]);

  const { todayTasksCount, doneTasksCount, habitsCompleted, positiveHabitsCount, waterCompleted } = useMemo(() => {
    let todayCount = 0;
    let doneCount = 0;
    for (const t of data.tasks) {
      if (t.date === data.todayStr) {
        todayCount++;
        if (t.status === 'completed') doneCount++;
      }
    }

    const todayHabitLogMap = new Map<string, number>();
    for (const l of data.habitLogs) {
      if ((l.date || '').slice(0, 10) === data.todayStr && !l.isFreeze) {
        todayHabitLogMap.set(l.habitId, l.count ?? 1);
      }
    }

    let completedHabits = 0;
    let activePositiveTotal = 0;
    for (const h of data.allHabits) {
      if (h.archived || h.type === 'negative') continue;
      activePositiveTotal++;
      const count = todayHabitLogMap.get(h.id) ?? 0;
      if (count >= (h.targetCount || 1)) completedHabits++;
    }

    let waterSum = 0;
    for (const w of data.waterLogs || []) {
      if ((w.date || '').slice(0, 10) === data.todayStr) waterSum += w.amountMl;
    }

    return {
      todayTasksCount: todayCount,
      doneTasksCount: doneCount,
      habitsCompleted: completedHabits,
      positiveHabitsCount: activePositiveTotal,
      waterCompleted: waterSum,
    };
  }, [data.tasks, data.allHabits, data.habitLogs, data.waterLogs, data.todayStr]);

  const urgentAssignments = useMemo(() => {
    // 1. Gather all completed assignment IDs from linked tasks
    const completedLinkedTaskAsgIds = new Set(
      (data.tasks || [])
        .filter(t => t.status === 'completed' && t.id?.startsWith('task_asg_'))
        .map(t => t.id!.replace('task_', ''))
    );

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const items = (data.assignments || [])
      .filter((a: any) => {
        if (!a || !a.id) return false;
        // Checked off: submitted, graded, completed, done, or completed boolean
        if (a.status === 'submitted' || a.status === 'graded' || a.status === 'completed' || a.status === 'done') {
          return false;
        }
        if (a.completed === true) return false;
        if (completedLinkedTaskAsgIds.has(a.id)) return false;
        return true;
      })
      .map((a: any) => {
        const rawDate = a.dueDate || '';
        let diffDays = 0;
        let formattedDate = '';

        if (rawDate) {
          const parts = rawDate.split('T')[0].split('-').map(Number);
          if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
            const due = new Date(parts[0], parts[1] - 1, parts[2]);
            diffDays = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            const dayStr = String(parts[2]).padStart(2, '0');
            const monthName = MONTHS[parts[1] - 1] || '';
            formattedDate = `${dayStr} ${monthName}`;
          } else {
            formattedDate = rawDate;
          }
        } else {
          formattedDate = 'No date';
        }

        let urgency: 'overdue' | 'due_soon' | 'due_later' = 'due_later';
        let urgencyLabel = 'Due later';

        if (diffDays < 0) {
          urgency = 'overdue';
          urgencyLabel = 'Overdue';
        } else if (diffDays <= 3) {
          urgency = 'due_soon';
          urgencyLabel = 'Due soon';
        } else {
          urgency = 'due_later';
          urgencyLabel = 'Due later';
        }

        return {
          id: a.id as string,
          title: a.title || 'Assignment',
          dueDate: rawDate,
          formattedDate,
          diffDays,
          urgency,
          urgencyLabel,
        };
      });

    // Sort: Overdue first (most overdue first), then due soon, then due later
    items.sort((a, b) => a.diffDays - b.diffDays);

    return items;
  }, [data.assignments, data.tasks]);

  const { showXPSection, showCapture } = useMemo(() => {
    let xpVisible = true;
    let captureVisible = false;
    for (let i = 0; i < data.layout.length; i++) {
      const l = data.layout[i];
      if (l.id === 'xp') xpVisible = !l.hidden;
      if (l.id === 'capture') captureVisible = !l.hidden;
    }
    return { showXPSection: xpVisible, showCapture: captureVisible };
  }, [data.layout]);

  const handlePressStreak = useCallback(() => {
    navigation.navigate('MoreStack', { screen: 'StreakDetail' });
  }, [navigation]);

  const handlePressHabits = useCallback(() => {
    navigation.navigate('Habits');
  }, [navigation]);

  const handlePressWater = useCallback(() => {
    data.setWaterLogVisible(true);
  }, [data.setWaterLogVisible]);

  const handlePressAttendance = useCallback(() => {
    navigation.navigate('Attendance');
  }, [navigation]);

  const handlePressXP = useCallback(() => {
    navigation.navigate('MoreStack', { screen: 'XPConstellation' });
  }, [navigation]);

  const handlePressRing = useCallback(() => {
    navigation.navigate(data.nextClass ? 'Attendance' : 'Tasks');
  }, [navigation, data.nextClass]);

  const handleCapture = useCallback(() => {
    data.setCaptureVisible(true);
  }, [data.setCaptureVisible]);

  const handlePressAssignments = useCallback(() => {
    navigation.navigate('Assignments' as any);
  }, [navigation]);

  const handleToggleAssignment = useCallback((assignmentId: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    awardXP('TASK_COMPLETE').catch(() => {});

    // 1. Mark assignment as submitted
    data.optimisticUpdateAssignment?.(assignmentId, { status: 'submitted', updatedAt: Date.now() });
    safeUpdate(
      assignmentId,
      COLLECTION.ASSIGNMENTS,
      { status: 'submitted', updatedAt: Date.now() },
      () => updateDoc(doc(db, COLLECTION.ASSIGNMENTS, assignmentId), { status: 'submitted', updatedAt: Date.now() })
    ).catch(console.warn);

    // 2. Cross-sync: Mark linked task as completed if it exists
    const linkedTaskId = `task_${assignmentId}`;
    data.optimisticUpdateTask?.(linkedTaskId, { status: 'completed', completedAt: formatLocalDateStr(new Date()) });
    safeUpdate(
      linkedTaskId,
      COLLECTION.TASKS,
      { status: 'completed', completedAt: formatLocalDateStr(new Date()) },
      () => updateDoc(doc(db, COLLECTION.TASKS, linkedTaskId), { status: 'completed', completedAt: formatLocalDateStr(new Date()) })
    ).catch(console.warn);
  }, [data.optimisticUpdateAssignment, data.optimisticUpdateTask]);

  const handleToggleTask = useCallback((taskId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'completed' ? 'pending' : 'completed';
    const completedAt = newStatus === 'completed' ? formatLocalDateStr(new Date()) : null;
    data.optimisticUpdateTask(taskId, { status: newStatus, completedAt });
    if (newStatus === 'completed') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      awardXP('TASK_COMPLETE').catch(() => {});
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    safeUpdate(
      taskId,
      COLLECTION.TASKS,
      { status: newStatus, completedAt },
      () => updateDoc(doc(db, COLLECTION.TASKS, taskId), { status: newStatus, completedAt })
    ).catch(console.warn);

    // Cross-sync: If this task is linked to an assignment, update the assignment status
    if (taskId.startsWith('task_asg_')) {
      const asgId = taskId.replace('task_', '');
      const asgStatus = newStatus === 'completed' ? 'submitted' : 'not_started';
      data.optimisticUpdateAssignment?.(asgId, { status: asgStatus, updatedAt: Date.now() });
      safeUpdate(
        asgId,
        COLLECTION.ASSIGNMENTS,
        { status: asgStatus, updatedAt: Date.now() },
        () => updateDoc(doc(db, COLLECTION.ASSIGNMENTS, asgId), { status: asgStatus, updatedAt: Date.now() })
      ).catch(console.warn);
    }
  }, [data.optimisticUpdateTask, data.optimisticUpdateAssignment]);

  // ── Quick Profile BottomSheet State (Apple iOS 18 Grouped style) ──────────
  const [quickProfileVisible, setQuickProfileVisible] = useState(false);

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <SaraHUDBanner
        message={data.surfaceMessage || ''}
        visible={!!data.surfaceMessage}
        onDismiss={data.dismissBanner}
        actionLabel={data.surfaceActionLabel || undefined}
      />
      
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={[s.scroll, { paddingBottom }]} showsVerticalScrollIndicator={false}>
          <Animated.View entering={FadeInDown.duration(380).springify().damping(24).stiffness(210)} style={s.greetingContainer}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={s.greetingGood}>Good</Text>
              <Text style={s.greetingTime}>{data.timeGreeting}</Text>
            </View>

            {/* Unified Header Action Pill Capsule */}
            <View style={s.headerActionPill}>
              {/* Flame streak pill */}
              <AnimatedPressable
                style={s.headerPillSection}
                onPress={() => navigation.navigate('MoreStack', { screen: 'StreakDetail' })}
                haptic="light"
                accessibilityLabel={`${data.appStreak} day streak`}
                accessibilityRole="button"
              >
                <Text style={{ fontSize: 16 }}>🔥</Text>
                <Text style={s.headerStreakText}>
                  {data.appStreak}
                </Text>
              </AnimatedPressable>

              {/* Small Subtle Offline Indicator */}
              {isOffline && (
                <View style={[s.headerPillSection, { paddingHorizontal: 6, gap: 3 }]}>
                  <Ionicons name="cloud-offline-outline" size={13} color={isDark ? '#FBBF24' : '#B45309'} />
                  {queueCount > 0 && (
                    <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 10, color: isDark ? '#FBBF24' : '#B45309' }}>
                      {queueCount}
                    </Text>
                  )}
                </View>
              )}
              {recentlySynced && (
                <View style={[s.headerPillSection, { paddingHorizontal: 6 }]}>
                  <Ionicons name="checkmark-circle" size={13} color="#22C55E" />
                </View>
              )}

              {/* Theme Switcher */}
              <AnimatedPressable
                style={s.headerPillIconSection}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  toggleTheme();
                }}
                haptic="medium"
                accessibilityLabel={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
                accessibilityRole="button"
              >
                <Feather
                  name={isDark ? "sun" : "moon"}
                  size={16}
                  color={isDark ? "#f2f2f7" : colors.textPrimary}
                />
              </AnimatedPressable>

              {/* User Avatar — Tapping opens Apple Quick Profile & Settings Sheet */}
              <AnimatedPressable
                style={s.headerPillAvatar}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setQuickProfileVisible(true);
                }}
                haptic="light"
                accessibilityLabel="Open Quick Profile & Settings"
                accessibilityRole="button"
              >
                <UserAvatar
                  size={28}
                  uid={data.user?.uid}
                  photoURL={data.user?.photoURL}
                  fallbackLetter={data.avatarLetter}
                />
              </AnimatedPressable>
            </View>
          </Animated.View>

          {!data.user && !data.tasksReady ? (
            <DashboardSkeleton />
          ) : (
            <>
              {/* ⚡ 3-Minute Active Recall Due Widget */}
              <ActiveRecallBanner
                dueFlashcards={dueFlashcards}
                isBannerDismissed={isBannerDismissed}
                onPressReview={() => setFlashcardModalVisible(true)}
                onDismiss={handleDismissBanner}
                colors={colors}
                isDark={isDark}
              />

              {data.layout.map((layoutItem, layoutIndex) => {
            if (layoutItem.hidden) return null;

            // One-time entrance animation: only animate on the very first mount.
            // Prevents FadeInDown re-firing every time a Firestore update causes
            // a parent re-render (tasks, waterLogs, habitLogs, etc.).
            // Stagger: each visible widget enters 55ms after the previous one.
            // springify() adds Apple-grade spring physics to the Reanimated
            // entering animation instead of a flat linear fade.
            const entering = !hasAnimatedRef.current
              ? FadeInDown
                  .delay(layoutIndex * 55)
                  .duration(400)
                  .springify()
                  .damping(22)
                  .stiffness(200)
              : undefined;

            if (layoutItem.id === 'quote') {
              return (
                <Animated.View key={layoutItem.id} entering={entering} style={{ marginTop: 6, marginBottom: 12 }}>
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      data.shuffleQuote(true);
                    }}
                    style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
                    hitSlop={12}
                  >
                    <Text style={s.quoteText}>"{data.quote.text}"</Text>
                    <Text style={s.quoteAuthor}>— {data.quote.author}</Text>
                  </Pressable>
                </Animated.View>
              );
            }

            if (layoutItem.id === 'stats') {
              return (
                <Animated.View key={layoutItem.id} entering={entering}>
                  <UnifiedLifeWidget
                    currentStreak={data.appStreak}
                    streakAtRisk={false}
                    agendaCompleted={doneTasksCount}
                    agendaTotal={todayTasksCount}
                    habitsCompleted={habitsCompleted}
                    habitsTotal={positiveHabitsCount}
                    waterCompleted={waterCompleted}
                    waterTotal={data.waterTotal}
                    classesAttendedToday={data.classesAttendedToday}
                    classesTotalToday={data.classesTotalToday}
                    overallAttendancePct={data.overallAttendancePct}
                    levelLabel={levelInfo.label}
                    levelNextLabel={levelInfo.nextLabel}
                    levelXP={data.xp}
                    levelNextXP={levelInfo.nextXP}
                    levelProgress={levelInfo.progress}
                    showXPSection={showXPSection}
                    showCapture={showCapture}
                    urgentAssignments={urgentAssignments}
                    nextClass={data.nextClass}
                    onPressStreak={handlePressStreak}
                    onPressHabits={handlePressHabits}
                    onPressWater={handlePressWater}
                    onPressAttendance={handlePressAttendance}
                    onPressXP={handlePressXP}
                    onPressRing={handlePressRing}
                    onCapture={handleCapture}
                    onPressAssignments={handlePressAssignments}
                    onToggleAssignment={handleToggleAssignment}
                  />
                </Animated.View>
              );
            }

            if (layoutItem.id === 'agenda') {
              return (
                <Animated.View key={layoutItem.id} entering={entering}>
                  <AgendaWidget
                    tasks={data.tasks}
                    gymLogs={data.gymLogs}
                    userGymPlan={data.userGymPlan}
                    attendance={data.attendance}
                    attendanceLogs={data.attendanceLogs}
                    todayStr={data.todayStr}
                    nowDate={data.nowDate}
                    holidays={data.holidays}
                    userId={data.user?.uid}
                    onToggleTask={handleToggleTask}
                  />
                </Animated.View>
              );
            }
            return null;
          })}
          {/* Mark first render complete so subsequent re-renders skip entrance animations */}
          {!hasAnimatedRef.current && (() => { hasAnimatedRef.current = true; return null; })()}
          </>
        )}
        </ScrollView>
      </KeyboardAvoidingView>



      {/* PERF: All 3 overlay sheets are conditionally mounted only when opened.
           Saves evaluating 3 heavy component trees on every Frame 1 cold boot. */}
      {data.layoutSheetVisible && (
        <DashboardLayoutSheet
          visible={data.layoutSheetVisible}
          onClose={() => data.setLayoutSheetVisible(false)}
          layout={data.layout}
          setLayout={data.setLayout}
        />
      )}
      {data.captureVisible && (
        <QuickCaptureSheet visible={data.captureVisible} onClose={() => data.setCaptureVisible(false)} />
      )}
      {data.waterLogVisible && (
        <WaterLogSheet
          visible={data.waterLogVisible}
          onClose={() => data.setWaterLogVisible(false)}
          userId={data.user?.uid || ''}
          target={data.waterTotal}
          onUpdateTarget={(val) => {
            data.setWaterTotal(val);
          }}
        />
      )}
      {flashcardModalVisible && (
        <FlashcardReviewModal
          visible={flashcardModalVisible}
          dueCards={dueFlashcards}
          onClose={() => setFlashcardModalVisible(false)}
          onSessionComplete={refreshFlashcards}
        />
      )}
      {/* ── Apple iOS 18 Quick Profile & Dashboard Sheet ── */}
      {quickProfileVisible && (
        <BottomSheet
          visible={quickProfileVisible}
          onClose={() => setQuickProfileVisible(false)}
        >
          <View style={{ paddingBottom: insets.bottom + 12, paddingTop: 4 }}>
            {/* User Header Profile Hero Card */}
            <View style={s.profileHeaderCard}>
              <View style={s.profileHeaderTop}>
                <View style={s.profileAvatarRing}>
                  <UserAvatar
                    size={52}
                    uid={data.user?.uid}
                    photoURL={data.user?.photoURL}
                    fallbackLetter={data.avatarLetter}
                  />
                </View>
                <View style={s.profileInfoBox}>
                  <Text style={s.profileNameText} numberOfLines={1}>
                    {data.user?.displayName || 'Zen Pioneer'}
                  </Text>
                  <Text style={s.profileEmailText} numberOfLines={1}>
                    {data.user?.email || 'ZenTrack Member'}
                  </Text>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setQuickProfileVisible(false);
                      navigation.navigate('MoreStack', { screen: 'XPConstellation' });
                    }}
                    style={s.profileLevelPill}
                  >
                    <Ionicons name="sparkles" size={12} color={colors.accentPrimary} />
                    <Text style={s.profileLevelText}>
                      {levelInfo.label}
                    </Text>
                    <Ionicons name="chevron-forward" size={11} color={colors.accentPrimary} style={{ opacity: 0.7 }} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* XP Progress Track */}
              <View style={s.profileXpTrackContainer}>
                <View style={s.profileXpTrackLabels}>
                  <Text style={s.profileXpCurrentText}>
                    ⚡ {data.xp.toLocaleString()} XP
                  </Text>
                  <Text style={s.profileXpNextText}>
                    Next: {levelInfo.nextLabel} ({levelInfo.nextXP.toLocaleString()} XP)
                  </Text>
                </View>
                <View style={s.profileXpProgressBarBg}>
                  <View
                    style={[
                      s.profileXpProgressBarFill,
                      { width: `${Math.round(levelInfo.progress * 100)}%` },
                    ]}
                  />
                </View>
              </View>
            </View>

            {/* Section 1 Header */}
            <Text style={s.profileSectionHeader}>Preferences</Text>

            {/* Group 1: Dashboard Preferences */}
            <View style={s.profileGroupCard}>
              {/* Row 1: Customize Layout */}
              <TouchableOpacity
                style={s.profileGroupRow}
                activeOpacity={0.7}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setQuickProfileVisible(false);
                  setTimeout(() => data.setLayoutSheetVisible(true), 250);
                }}
              >
                <View style={[s.profileRowIconBox, { backgroundColor: colors.accentDim }]}>
                  <Ionicons name="color-palette-outline" size={18} color={colors.accentPrimary} />
                </View>
                <View style={{ flex: 1, marginLeft: 13 }}>
                  <Text style={s.profileRowTitle}>Customize Dashboard</Text>
                  <Text style={s.profileRowSubtitle}>Reorder or toggle home widgets</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
              </TouchableOpacity>

              <View style={s.profileRowDivider} />

              {/* Row 2: Theme Switcher */}
              <TouchableOpacity
                style={s.profileGroupRow}
                activeOpacity={0.7}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  toggleTheme();
                }}
              >
                <View style={[s.profileRowIconBox, { backgroundColor: isDark ? 'rgba(168,85,247,0.15)' : 'rgba(245,158,11,0.15)' }]}>
                  <Feather name={isDark ? "moon" : "sun"} size={17} color={isDark ? "#c084fc" : "#d97706"} />
                </View>
                <View style={{ flex: 1, marginLeft: 13 }}>
                  <Text style={s.profileRowTitle}>Appearance</Text>
                  <Text style={s.profileRowSubtitle}>{isDark ? "Obsidian Cosmos (Dark)" : "Frost Quartz (Light)"}</Text>
                </View>
                <View style={s.profileThemePill}>
                  <Feather name={isDark ? "moon" : "sun"} size={11} color={colors.textPrimary} />
                  <Text style={s.profileThemePillText}>{isDark ? "Dark" : "Light"}</Text>
                </View>
              </TouchableOpacity>

              <View style={s.profileRowDivider} />

              {/* Row 3: Streak Record */}
              <TouchableOpacity
                style={s.profileGroupRow}
                activeOpacity={0.7}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setQuickProfileVisible(false);
                  navigation.navigate('MoreStack', { screen: 'StreakDetail' });
                }}
              >
                <View style={[s.profileRowIconBox, { backgroundColor: colors.accentAmberDim }]}>
                  <Ionicons name="flame" size={18} color="#f59e0b" />
                </View>
                <View style={{ flex: 1, marginLeft: 13 }}>
                  <Text style={s.profileRowTitle}>Consistency Streak</Text>
                  <Text style={s.profileRowSubtitle}>{data.appStreak} consecutive days</Text>
                </View>
                <View style={s.profileStreakBadge}>
                  <Text style={s.profileStreakBadgeText}>🔥 {data.appStreak}d</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} style={{ marginLeft: 6 }} />
              </TouchableOpacity>
            </View>

            {/* Section 2 Header */}
            <Text style={s.profileSectionHeader}>System & Account</Text>

            {/* Group 2: App Settings & System */}
            <View style={s.profileGroupCard}>
              <TouchableOpacity
                style={s.profileGroupRow}
                activeOpacity={0.7}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setQuickProfileVisible(false);
                  navigation.navigate('MoreStack', { screen: 'Settings' });
                }}
              >
                <View style={[s.profileRowIconBox, { backgroundColor: 'rgba(56,189,248,0.15)' }]}>
                  <Ionicons name="settings-outline" size={18} color={isDark ? "#38bdf8" : "#0284c7"} />
                </View>
                <View style={{ flex: 1, marginLeft: 13 }}>
                  <Text style={s.profileRowTitle}>All Settings</Text>
                  <Text style={s.profileRowSubtitle}>Preferences, backups, and account</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
              </TouchableOpacity>
            </View>

            {/* Footer */}
            <Text style={s.profileFooterText}>
              ZenTrack • Level Up Every Day
            </Text>
          </View>
        </BottomSheet>
      )}

      {/* Voice Task Floating Action Button (replacing Sara button) */}
      <AnimatedPressable
        style={[
          s.voiceTaskFab,
          {
            bottom: Math.max(84, insets.bottom + 70),
          },
        ]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          setIsVoiceDictationOpen(true);
        }}
        accessibilityLabel="Add task by voice"
        accessibilityRole="button"
        haptic="medium"
      >
        <LinearGradient
          colors={['#FF5252', '#FF3B30']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={s.voiceTaskFabGradient}
        >
          <Ionicons name="mic" size={24} color="#FFFFFF" />
        </LinearGradient>
      </AnimatedPressable>

      {/* Voice Dictation Overlay Modal for Tasks */}
      {isVoiceDictationOpen && (
        <VoiceDictationOverlay
          visible={isVoiceDictationOpen}
          onClose={() => setIsVoiceDictationOpen(false)}
          selectedDate={data.todayStr}
          userId={data.user?.uid}
        />
      )}
    </SafeAreaView>
  );
}
