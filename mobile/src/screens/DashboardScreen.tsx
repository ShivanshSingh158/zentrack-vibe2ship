import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { View, Text, ScrollView, KeyboardAvoidingView, Platform, Image, Pressable, StyleSheet, TouchableOpacity, BackHandler } from 'react-native';
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
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../contexts/ThemeContext';
import { FONT_FAMILY } from '../theme/tokens';
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
import { getDueFlashcards, Flashcard } from '../services/flashcardService';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function DashboardScreen() {
  const { colors, isDark, toggleTheme } = useTheme();
  const s = makeStyles(colors);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();

  const data = useDashboardData();
  const paddingBottom = insets.bottom + 80;
  const levelInfo = getLevel(data.xp);

  // ── Flashcards State ──
  const [dueFlashcards, setDueFlashcards] = useState<Flashcard[]>([]);
  const [flashcardModalVisible, setFlashcardModalVisible] = useState(false);
  const [isBannerDismissed, setIsBannerDismissed] = useState(false);

  const refreshFlashcards = useCallback(async () => {
    if (data.user?.uid) {
      const cards = await getDueFlashcards(data.user.uid);
      setDueFlashcards(cards);
      
      // Check if current cards have been dismissed
      try {
        const savedDismissed = await AsyncStorage.getItem('@flashcard_banner_dismissed_ids');
        if (savedDismissed && cards.length > 0) {
          const dismissedIds: string[] = JSON.parse(savedDismissed);
          const currentIds = cards.map(c => c.id || c.question);
          // If all current cards are already in dismissedIds, hide the banner
          const allDismissed = currentIds.every(id => dismissedIds.includes(id));
          setIsBannerDismissed(allDismissed);
        } else {
          setIsBannerDismissed(false);
        }
      } catch {
        setIsBannerDismissed(false);
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

  useEffect(() => {
    refreshFlashcards();
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
      {/* Tap-outside transparent backdrop to dismiss dropdown */}
      {menuOpen && (
        <Pressable
          style={[StyleSheet.absoluteFillObject, { zIndex: 9998 }]}
          onPress={closeMenu}
        />
      )}

      <SaraHUDBanner
        message={data.surfaceMessage || ''}
        visible={!!data.surfaceMessage}
        onDismiss={data.dismissBanner}
        actionLabel={data.surfaceActionLabel || undefined}
      />
      
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView scrollEnabled={!menuOpen} contentContainerStyle={[s.scroll, { paddingBottom }]} showsVerticalScrollIndicator={false}>
          
          <Animated.View entering={FadeInDown.delay(100).duration(400)} style={[s.greetingContainer, { zIndex: 9999 }]}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={s.greetingGood}>Good</Text>
              <Text style={s.greetingTime}>{data.timeGreeting}</Text>
            </View>

            {/* Header Action Bar */}
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', zIndex: 9999 }}>
              {/* Flame streak pill */}
              <AnimatedPressable
                style={s.headerStreakPill}
                onPress={() => navigation.navigate('MoreStack', { screen: 'StreakDetail' })}
              >
                <Text style={{ fontSize: 14 }}>🔥</Text>
                <Text style={s.headerStreakText}>
                  {data.appStreak}
                </Text>
              </AnimatedPressable>

              {/* Circular Dark Mode / Light Mode Switcher */}
              <AnimatedPressable
                style={[
                  s.themeToggleCircle,
                  {
                    backgroundColor: isDark ? colors.surface : '#FFFFFF',
                    borderColor: colors.border,
                  },
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  toggleTheme();
                }}
                accessibilityLabel={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
                accessibilityRole="button"
              >
                <Ionicons
                  name={isDark ? "sunny" : "moon"}
                  size={18}
                  color={isDark ? "#FFB300" : colors.accentPrimary}
                />
              </AnimatedPressable>

              {/* Anchored Vertical Speed Dial Container */}
              <View collapsable={false} ref={avatarRef} style={{ position: 'relative', width: 36, height: 36, alignItems: 'center', justifyContent: 'center', zIndex: 99999, elevation: 9999 }}>
                {/* Rotating Trigger Avatar / Close Button */}
                <Animated.View style={avatarAnimatedStyle}>
                  <AnimatedPressable
                    style={[
                      s.avatarCircle,
                      menuOpen && {
                        backgroundColor: isDark ? '#2c2c2e' : '#e5e5ea',
                        borderWidth: 1,
                        borderColor: colors.border,
                      },
                    ]}
                    onPress={toggleMenu}
                  >
                    {menuOpen ? (
                      <Ionicons name="close" size={20} color={colors.textPrimary} />
                    ) : data.user?.photoURL ? (
                      <Image source={{ uri: data.user.photoURL }} style={{ width: 36, height: 36, borderRadius: 18 }} />
                    ) : (
                      <Text style={s.avatarText}>{data.avatarLetter}</Text>
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
                      right: 0,
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
                          shadowColor: colors.accentPrimary,
                          shadowOffset: { width: 0, height: 4 },
                          shadowOpacity: isDark ? 0.35 : 0.15,
                          shadowRadius: 8,
                          elevation: 12,
                        }}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          closeMenu();
                          setTimeout(() => {
                            data.setLayoutSheetVisible(true);
                          }, 120);
                        }}
                      >
                        <Ionicons name="color-palette-outline" size={18} color={isDark ? '#a599ff' : colors.accentPrimary} />
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
                          shadowColor: colors.accentBlue,
                          shadowOffset: { width: 0, height: 4 },
                          shadowOpacity: isDark ? 0.35 : 0.15,
                          shadowRadius: 8,
                          elevation: 12,
                        }}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          closeMenu();
                          setTimeout(() => {
                            navigation.navigate('MoreStack', { screen: 'Settings' });
                          }, 120);
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
          {dueFlashcards.length > 0 && !isBannerDismissed && (
            <Animated.View entering={FadeInDown.delay(180).duration(400)} style={{ marginTop: 12, marginBottom: 6 }}>
              <View
                style={{
                  backgroundColor: colors.surface,
                  borderRadius: 18,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  flexDirection: 'row',
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: colors.border,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: isDark ? 0.3 : 0.06,
                  shadowRadius: 8,
                  elevation: 4,
                }}
              >
                {/* Left Flash Icon */}
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setFlashcardModalVisible(true);
                  }}
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 12,
                    backgroundColor: colors.accentDim,
                    borderWidth: 1,
                    borderColor: colors.accentPrimary + '30',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 12,
                  }}
                >
                  <Ionicons name="flash" size={18} color={colors.accentPrimary} />
                </TouchableOpacity>

                {/* Middle Text Column (Generous space, no XP badge overlap) */}
                <TouchableOpacity
                  activeOpacity={0.8}
                  style={{ flex: 1, minWidth: 0, paddingRight: 6 }}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setFlashcardModalVisible(true);
                  }}
                >
                  <Text style={{ fontFamily: FONT_FAMILY.bold, color: colors.textPrimary, fontSize: 13.5, letterSpacing: -0.2 }}>
                    3-Min Active Recall
                  </Text>
                  <Text style={{ color: colors.textTertiary, fontSize: 11.5, fontFamily: FONT_FAMILY.body, marginTop: 2 }} numberOfLines={1}>
                    {dueFlashcards.length} flashcard{dueFlashcards.length > 1 ? 's' : ''} scheduled
                  </Text>
                </TouchableOpacity>

                {/* Right Action Cluster: Review Button + Close (✕) Button */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={{
                      backgroundColor: isDark ? '#FFFFFF' : colors.accentPrimary,
                      paddingHorizontal: 12,
                      paddingVertical: 7,
                      borderRadius: 12,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 3,
                    }}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setFlashcardModalVisible(true);
                    }}
                  >
                    <Text style={{ color: isDark ? '#000000' : '#FFFFFF', fontFamily: FONT_FAMILY.bold, fontSize: 12 }}>Review</Text>
                    <Ionicons name="chevron-forward" size={12} color={isDark ? '#000000' : '#FFFFFF'} />
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.7}
                    hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 13,
                      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    onPress={handleDismissBanner}
                  >
                    <Ionicons name="close" size={14} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
              </View>
            </Animated.View>
          )}

          {data.layout.map((layoutItem) => {
            if (layoutItem.hidden) return null;

            if (layoutItem.id === 'quote') {
              return (
                <Animated.View key={"quote" as any} entering={FadeInDown.delay(200).duration(400)} style={{ marginTop: 18, marginBottom: 14 }}>
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
                <Animated.View key={"stats" as any} entering={FadeInDown.delay(300).duration(400)}>
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
                <Animated.View key={"agenda" as any} entering={FadeInDown.delay(400).duration(400)}>
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
