import React, { useState, useCallback, useEffect, useRef } from 'react';
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

export default function DashboardScreen() {
  const { colors } = useTheme();
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

  const todayTasks = data.tasks.filter(t => t.date === data.todayStr);
  const doneTasksCount = todayTasks.filter(t => t.status === 'completed').length;
  
  const habitsCompleted = data.allHabits.filter(h => {
    const log = data.habitLogs.find(l => l.habitId === h.id && l.date === data.todayStr);
    return log && (log.count ?? 0) >= (h.targetCount || 1);
  }).length;
  
  const waterCompleted = (data.waterLogs || []).filter(w => w.date === data.todayStr).reduce((sum, log) => sum + log.amountMl, 0);

  // ── Floating Action Menu State & Motion (Smooth Linear / Non-Bouncy) ────────
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuLayout, setMenuLayout] = useState({ x: 0, y: 0, ready: false });
  const avatarRef = useRef<View>(null);
  const rotateVal = useSharedValue(0);
  const animVal = useSharedValue(0);

  const closeMenu = useCallback(() => {
    if (menuOpen) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      rotateVal.value = withTiming(0, { duration: 240, easing: Easing.bezier(0.25, 0.1, 0.25, 1) });
      animVal.value = withTiming(0, { duration: 200, easing: Easing.bezier(0.25, 0.1, 0.25, 1) });
      setTimeout(() => {
        setMenuOpen(false);
        setMenuLayout(prev => ({ ...prev, ready: false }));
      }, 220);
    }
  }, [menuOpen, rotateVal, animVal]);

  const toggleMenu = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (menuOpen) {
      closeMenu();
    } else {
      avatarRef.current?.measure((x, y, w, h, pageX, pageY) => {
        setMenuLayout({ x: pageX, y: pageY + h, ready: true });
        setMenuOpen(true);
        rotateVal.value = withTiming(180, { duration: 260, easing: Easing.bezier(0.25, 0.1, 0.25, 1) });
        animVal.value = withTiming(1, { duration: 240, easing: Easing.bezier(0.25, 0.1, 0.25, 1) });
      });
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

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: animVal.value,
  }));

  const layoutBtnStyle = useAnimatedStyle(() => ({
    opacity: animVal.value,
    transform: [
      { translateY: interpolate(animVal.value, [0, 1], [-44, 0]) },
      { scale: interpolate(animVal.value, [0, 1], [0.1, 1]) },
      { rotate: `${interpolate(animVal.value, [0, 1], [-180, 0])}deg` },
    ],
  }));

  const settingsBtnStyle = useAnimatedStyle(() => ({
    opacity: animVal.value,
    transform: [
      { translateY: interpolate(animVal.value, [0, 1], [-88, 0]) },
      { scale: interpolate(animVal.value, [0, 1], [0.1, 1]) },
      { rotate: `${interpolate(animVal.value, [0, 1], [-360, 0])}deg` },
    ],
  }));

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      {/* Root-Level Absolute Overlay for Dropdown Menu to bypass ScrollView touch issues */}
      <Animated.View
        pointerEvents={menuOpen ? 'auto' : 'none'}
        style={[StyleSheet.absoluteFillObject, { zIndex: 9999 }, backdropStyle]}
      >
        <Pressable
          style={StyleSheet.absoluteFillObject}
          onPress={closeMenu}
        />
        
        {/* Floating Action Menu Buttons */}
        {menuLayout.ready && (
          <View
            pointerEvents="box-none"
            style={{
              position: 'absolute',
              top: menuLayout.y + 8,
              left: menuLayout.x,
              width: 36,
              alignItems: 'center',
              gap: 8,
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
                  backgroundColor: '#1c1c1e',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.18)',
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.4,
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
                <Ionicons name="color-palette-outline" size={18} color="#a599ff" />
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
                  backgroundColor: '#1c1c1e',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: 'rgba(255,255,255,0.18)',
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.4,
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
                <Ionicons name="settings-outline" size={18} color="#38bdf8" />
              </TouchableOpacity>
            </Animated.View>
          </View>
        )}
      </Animated.View>

      <SaraHUDBanner
        message={data.surfaceMessage || ''}
        visible={!!data.surfaceMessage}
        onDismiss={data.dismissBanner}
        actionLabel={data.surfaceActionLabel || undefined}
      />
      
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView scrollEnabled={!menuOpen} contentContainerStyle={[s.scroll, { paddingBottom }]} showsVerticalScrollIndicator={false}>
          
          <Animated.View entering={FadeInDown.delay(100).duration(400)} style={[s.greetingContainer, { zIndex: 999 }]}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={s.greetingGood}>Good</Text>
              <Text style={s.greetingTime}>{data.timeGreeting}</Text>
            </View>

            {/* Header Action Bar */}
            <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center', zIndex: 999 }}>
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

              {/* Anchored Vertical Speed Dial Container */}
              <View collapsable={false} ref={avatarRef} style={{ position: 'relative', width: 36, height: 36, alignItems: 'center', justifyContent: 'center', zIndex: 1000, elevation: 10 }}>
                {/* Rotating Trigger Avatar / Close Button */}
                <Animated.View style={avatarAnimatedStyle}>
                  <AnimatedPressable
                    style={[
                      s.avatarCircle,
                      menuOpen && {
                        backgroundColor: '#2c2c2e',
                        borderWidth: 1,
                        borderColor: 'rgba(255,255,255,0.2)',
                      },
                    ]}
                    onPress={toggleMenu}
                  >
                    {menuOpen ? (
                      <Ionicons name="close" size={20} color="#ffffff" />
                    ) : data.user?.photoURL ? (
                      <Image source={{ uri: data.user.photoURL }} style={{ width: 36, height: 36, borderRadius: 18 }} />
                    ) : (
                      <Text style={s.avatarText}>{data.avatarLetter}</Text>
                    )}
                  </AnimatedPressable>
                </Animated.View>
              </View>
            </View>
          </Animated.View>

          {/* ⚡ 3-Minute Active Recall Due Widget */}
          {dueFlashcards.length > 0 && !isBannerDismissed && (
            <Animated.View entering={FadeInDown.delay(180).duration(400)} style={{ marginTop: 12, marginBottom: 6 }}>
              <View
                style={{
                  backgroundColor: '#121214',
                  borderRadius: 18,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  flexDirection: 'row',
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: 'rgba(255, 255, 255, 0.08)',
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.3,
                  shadowRadius: 8,
                  elevation: 6,
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
                    backgroundColor: 'rgba(165, 153, 255, 0.12)',
                    borderWidth: 1,
                    borderColor: 'rgba(165, 153, 255, 0.25)',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 12,
                  }}
                >
                  <Ionicons name="flash" size={18} color="#a599ff" />
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
                  <Text style={{ fontFamily: FONT_FAMILY.bold, color: '#FFFFFF', fontSize: 13.5, letterSpacing: -0.2 }}>
                    3-Min Active Recall
                  </Text>
                  <Text style={{ color: '#8e8e93', fontSize: 11.5, fontFamily: FONT_FAMILY.body, marginTop: 2 }} numberOfLines={1}>
                    {dueFlashcards.length} flashcard{dueFlashcards.length > 1 ? 's' : ''} scheduled
                  </Text>
                </TouchableOpacity>

                {/* Right Action Cluster: Review Button + Close (✕) Button */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={{
                      backgroundColor: '#FFFFFF',
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
                    <Text style={{ color: '#000000', fontFamily: FONT_FAMILY.bold, fontSize: 12 }}>Review</Text>
                    <Ionicons name="chevron-forward" size={12} color="#000000" />
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.7}
                    hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 13,
                      backgroundColor: 'rgba(255, 255, 255, 0.06)',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    onPress={handleDismissBanner}
                  >
                    <Ionicons name="close" size={14} color="#8e8e93" />
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
                  <Text style={s.quoteText}>"{data.quote.text}"</Text>
                  <Text style={s.quoteAuthor}>— {data.quote.author}</Text>
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
                    agendaTotal={todayTasks.length}
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
                    showXPSection={!data.layout.find(l => l.id === 'xp')?.hidden}
                    showCapture={!data.layout.find(l => l.id === 'capture')?.hidden}
                    urgentAssignments={[]}
                    nextClass={data.nextClass}
                    onPressStreak={() => navigation.navigate('MoreStack', { screen: 'StreakDetail' })}
                    onPressHabits={() => navigation.navigate('Habits')}
                    onPressWater={() => data.setWaterLogVisible(true)}
                    onPressAttendance={() => navigation.navigate('Attendance')}
                    onPressXP={() => navigation.navigate('MoreStack', { screen: 'XPConstellation' })}
                    onPressRing={() => navigation.navigate(data.nextClass ? 'Attendance' : 'Tasks')}
                    onCapture={() => data.setCaptureVisible(true)}
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

      <DashboardLayoutSheet 
        visible={data.layoutSheetVisible}
        onClose={() => data.setLayoutSheetVisible(false)}
        layout={data.layout}
        setLayout={data.setLayout}
      />
      <QuickCaptureSheet visible={data.captureVisible} onClose={() => data.setCaptureVisible(false)} />
      <WaterLogSheet 
        visible={data.waterLogVisible} 
        onClose={() => data.setWaterLogVisible(false)}
        userId={data.user?.uid || ''}
        target={data.waterTotal}
        onUpdateTarget={(val) => {
          data.setWaterTotal(val);
        }}
      />
      <FlashcardReviewModal
        visible={flashcardModalVisible}
        dueCards={dueFlashcards}
        onClose={() => setFlashcardModalVisible(false)}
        onSessionComplete={refreshFlashcards}
      />
    </SafeAreaView>
  );
}
