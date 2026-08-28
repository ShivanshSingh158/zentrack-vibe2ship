import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { View, Text, ScrollView, KeyboardAvoidingView, Platform, Image, Pressable, StyleSheet, TouchableOpacity, BackHandler, InteractionManager, Modal } from 'react-native';
import Animated, {
  FadeInDown,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
  Easing,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { LEVEL_THRESHOLDS } from '../services/xpSystem';
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
import { areItemsEqual } from '../utils/schemaGuards';

export default function DashboardScreen() {
  const { colors, isDark, toggleTheme } = useTheme();
  const s = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { isOffline, queueCount, recentlySynced } = useOfflineStatus();

  const data = useDashboardData();
  const paddingBottom = insets.bottom + 80;
  const levelInfo = getLevel(data.xp);

  // ── Flashcards State ──
  const [dueFlashcards, setDueFlashcards] = useState<Flashcard[]>([]);
  const [flashcardModalVisible, setFlashcardModalVisible] = useState(false);
  const [isBannerDismissed, setIsBannerDismissed] = useState(false);

  // Pre-seed due flashcards on Frame 0 from local storage so the banner doesn't jump the layout at 3.0s
  useEffect(() => {
    AsyncStorage.getItem('@zentrack_cache_due_flashcards').then(raw => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setDueFlashcards(parsed);
          }
        } catch (_) {}
      }
    }).catch(() => {});
  }, []);

  const refreshFlashcards = useCallback(async () => {
    if (data.user?.uid) {
      const cards = await getDueFlashcards(data.user.uid);
      setDueFlashcards(prev => areItemsEqual(prev, cards) ? prev : cards);
      AsyncStorage.setItem('@zentrack_cache_due_flashcards', JSON.stringify(cards)).catch(() => {});
      
      // Check if current cards have been dismissed
      try {
        const savedDismissed = await AsyncStorage.getItem('@flashcard_banner_dismissed_ids');
        if (savedDismissed && cards.length > 0) {
          const dismissedIds: string[] = JSON.parse(savedDismissed);
          const currentIds = cards.map(c => c.id || c.question);
          // If all current cards are already in dismissedIds, hide the banner
          const allDismissed = currentIds.every(id => dismissedIds.includes(id));
          setIsBannerDismissed(prev => prev === allDismissed ? prev : allDismissed);
        } else {
          setIsBannerDismissed(prev => prev === false ? prev : false);
        }
      } catch {
        setIsBannerDismissed(prev => prev === false ? prev : false);
      }
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

  // PERF: Deferred behind InteractionManager + 3s timer — removes a live Firestore getDocs()
  // call from Frame 1 where it competed with auth and initial tab switching.
  useEffect(() => {
    const handle = InteractionManager.runAfterInteractions(() => {
      const timer = setTimeout(() => {
        refreshFlashcards();
      }, 3000);
      return () => clearTimeout(timer);
    });
    return () => handle.cancel();
  }, [refreshFlashcards]);

  const { todayTasksCount, doneTasksCount, habitsCompleted, waterCompleted } = useMemo(() => {
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
      if (l.date === data.todayStr) {
        todayHabitLogMap.set(l.habitId, l.count ?? 0);
      }
    }

    let completedHabits = 0;
    for (const h of data.allHabits) {
      const count = todayHabitLogMap.get(h.id) ?? 0;
      if (count >= (h.targetCount || 1)) completedHabits++;
    }

    let waterSum = 0;
    for (const w of data.waterLogs || []) {
      if (w.date === data.todayStr) waterSum += w.amountMl;
    }

    return {
      todayTasksCount: todayCount,
      doneTasksCount: doneCount,
      habitsCompleted: completedHabits,
      waterCompleted: waterSum,
    };
  }, [data.tasks, data.allHabits, data.habitLogs, data.waterLogs, data.todayStr]);

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

  // ── Floating Action Menu State & Motion (Smooth Linear / Non-Bouncy) ────────
  const [menuOpen, setMenuOpen] = useState(false);
  const avatarRef = useRef<View>(null);
  const rotateVal = useSharedValue(0);
  const animVal = useSharedValue(0);

  const closeMenu = useCallback(() => {
    if (menuOpen) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      rotateVal.value = withTiming(0, { duration: 200, easing: Easing.bezier(0.25, 0.1, 0.25, 1) });
      animVal.value = withTiming(0, { duration: 180, easing: Easing.bezier(0.25, 0.1, 0.25, 1) });
      setTimeout(() => {
        setMenuOpen(false);
      }, 190);
    }
  }, [menuOpen, rotateVal, animVal]);

  const toggleMenu = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (menuOpen) {
      closeMenu();
    } else {
      setMenuOpen(true);
      rotateVal.value = withTiming(180, { duration: 220, easing: Easing.bezier(0.25, 0.1, 0.25, 1) });
      animVal.value = withTiming(1, { duration: 200, easing: Easing.bezier(0.25, 0.1, 0.25, 1) });
    }
  }, [menuOpen, closeMenu, rotateVal, animVal]);

  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (menuOpen) {
        closeMenu();
        return true;
      }
      return false;
    });
    return () => backHandler.remove();
  }, [menuOpen, closeMenu]);

  const avatarAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotateVal.value}deg` }],
  }));

  const layoutBtnStyle = useAnimatedStyle(() => ({
    opacity: animVal.value,
    transform: [
      { translateY: interpolate(animVal.value, [0, 1], [-8, 0]) },
      { scale: interpolate(animVal.value, [0, 1], [0.8, 1]) },
    ],
  }));

  const settingsBtnStyle = useAnimatedStyle(() => ({
    opacity: animVal.value,
    transform: [
      { translateY: interpolate(animVal.value, [0, 1], [-14, 0]) },
      { scale: interpolate(animVal.value, [0, 1], [0.8, 1]) },
    ],
  }));

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <SaraHUDBanner
        message={data.surfaceMessage || ''}
        visible={!!data.surfaceMessage}
        onDismiss={data.dismissBanner}
        actionLabel={data.surfaceActionLabel || undefined}
      />
      
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView scrollEnabled={!menuOpen} contentContainerStyle={[s.scroll, { paddingBottom }]} showsVerticalScrollIndicator={false}>
          {/* Tap-outside transparent backdrop to dismiss dropdown */}
          {menuOpen && (
            <Pressable
              style={[StyleSheet.absoluteFillObject, { zIndex: 1 }]}
              onPress={closeMenu}
            />
          )}
          
          <Animated.View entering={FadeInDown.duration(200)} style={[s.greetingContainer, { zIndex: 99999, elevation: 9999 }]}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={s.greetingGood}>Good</Text>
              <Text style={s.greetingTime}>{data.timeGreeting}</Text>
            </View>

            {/* Unified Header Action Pill Capsule */}
            <View style={[s.headerActionPill, { zIndex: 99999, elevation: 9999 }]}>
              {/* Flame streak pill */}
              <AnimatedPressable
                style={s.headerPillSection}
                onPress={() => navigation.navigate('MoreStack', { screen: 'StreakDetail' })}
                haptic="light"
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

              {/* Anchored Vertical Speed Dial Container directly on Avatar */}
              <View collapsable={false} style={{ position: 'relative', width: 30, height: 34, alignItems: 'center', justifyContent: 'center', zIndex: 99999, elevation: 9999 }}>
                {/* Rotating Trigger Avatar / Close Button in-place */}
                <Animated.View style={avatarAnimatedStyle}>
                  <AnimatedPressable
                    style={[
                      s.headerPillAvatar,
                      menuOpen && {
                        backgroundColor: isDark ? '#3a3a3c' : '#d1d1d6',
                      },
                    ]}
                    onPress={toggleMenu}
                    accessibilityLabel={menuOpen ? "Close menu" : "Open settings and customize menu"}
                    accessibilityRole="button"
                  >
                    {menuOpen ? (
                      <Ionicons name="close" size={16} color={colors.textPrimary} />
                    ) : data.user?.photoURL ? (
                      <Image source={{ uri: data.user.photoURL }} style={{ width: 28, height: 28, borderRadius: 14 }} />
                    ) : (
                      <Text style={s.headerPillAvatarText}>{data.avatarLetter}</Text>
                    )}
                  </AnimatedPressable>
                </Animated.View>

                {/* Speed Dial Menu Buttons anchored directly below avatar */}
                {menuOpen && (
                  <View
                    pointerEvents="box-none"
                    style={{
                      position: 'absolute',
                      top: 44,
                      right: -1,
                      width: 36,
                      alignItems: 'center',
                      gap: 8,
                      zIndex: 99999,
                      elevation: 9999,
                    }}
                  >
                    {/* Icon 1: Customize Layout */}
                    <Animated.View style={layoutBtnStyle}>
                      <TouchableOpacity
                        activeOpacity={0.7}
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 18,
                          backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderWidth: 1,
                          borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : '#E2E1EA',
                          shadowColor: '#000000',
                          shadowOffset: { width: 0, height: 4 },
                          shadowOpacity: isDark ? 0.35 : 0.15,
                          shadowRadius: 8,
                          elevation: 12,
                        }}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          closeMenu();
                          data.setLayoutSheetVisible(true);
                        }}
                      >
                        <Ionicons name="color-palette-outline" size={18} color={isDark ? '#f2f2f7' : colors.textPrimary} />
                      </TouchableOpacity>
                    </Animated.View>

                    {/* Icon 2: App Settings */}
                    <Animated.View style={settingsBtnStyle}>
                      <TouchableOpacity
                        activeOpacity={0.7}
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 18,
                          backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderWidth: 1,
                          borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : '#E2E1EA',
                          shadowColor: '#000000',
                          shadowOffset: { width: 0, height: 4 },
                          shadowOpacity: isDark ? 0.35 : 0.15,
                          shadowRadius: 8,
                          elevation: 12,
                        }}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          closeMenu();
                          navigation.navigate('MoreStack', { screen: 'Settings' });
                        }}
                      >
                        <Ionicons name="settings-outline" size={18} color={isDark ? '#38bdf8' : '#0284C7'} />
                      </TouchableOpacity>
                    </Animated.View>
                  </View>
                )}
              </View>
            </View>
          </Animated.View>

          {/* ⚡ 3-Minute Active Recall Due Widget */}
          <ActiveRecallBanner
            dueFlashcards={dueFlashcards}
            isBannerDismissed={isBannerDismissed}
            onPressReview={() => setFlashcardModalVisible(true)}
            onDismiss={handleDismissBanner}
            colors={colors}
            isDark={isDark}
          />

          {data.layout.map((layoutItem) => {
            if (layoutItem.hidden) return null;

            if (layoutItem.id === 'quote') {
              return (
                <Animated.View key={"quote" as any} entering={FadeInDown.duration(200)} style={{ marginTop: 6, marginBottom: 12 }}>
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      data.shuffleQuote();
                    }}
                    hitSlop={10}
                  >
                    <Text style={s.quoteText}>"{data.quote.text}"</Text>
                    <Text style={s.quoteAuthor}>— {data.quote.author}</Text>
                  </Pressable>
                </Animated.View>
              );
            }

            if (layoutItem.id === 'stats') {
              return (
                <Animated.View key={"stats" as any} entering={FadeInDown.duration(200)}>
                  <UnifiedLifeWidget
                    currentStreak={data.appStreak}
                    streakAtRisk={false}
                    agendaCompleted={doneTasksCount}
                    agendaTotal={todayTasksCount}
                    habitsCompleted={habitsCompleted}
                    habitsTotal={data.allHabits.length}
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
                    urgentAssignments={[]}
                    nextClass={data.nextClass}
                    onPressStreak={handlePressStreak}
                    onPressHabits={handlePressHabits}
                    onPressWater={handlePressWater}
                    onPressAttendance={handlePressAttendance}
                    onPressXP={handlePressXP}
                    onPressRing={handlePressRing}
                    onCapture={handleCapture}
                  />
                </Animated.View>
              );
            }

            if (layoutItem.id === 'agenda') {
              return (
                <Animated.View key={"agenda" as any} entering={FadeInDown.duration(200)}>
                  <AgendaWidget
                    tasks={data.tasks}
                    gymLogs={data.gymLogs}
                    userGymPlan={data.userGymPlan}
                    attendance={data.attendance}
                    attendanceLogs={data.attendanceLogs}
                    todayStr={data.todayStr}
                    nowDate={data.nowDate}
                  />
                </Animated.View>
              );
            }
            return null;
          })}
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
    </SafeAreaView>
  );
}
