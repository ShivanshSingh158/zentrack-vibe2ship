import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Dimensions,
  ScrollView, NativeSyntheticEvent, NativeScrollEvent, Animated, Pressable
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Reanimated, {
  FadeInDown,
  FadeInUp,
} from 'react-native-reanimated';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { PlayfairDisplay_600SemiBold, PlayfairDisplay_600SemiBold_Italic } from '@expo-google-fonts/playfair-display';
import { useTheme } from '../contexts/ThemeContext';
import { FONT_FAMILY, RADIUS, SHADOW } from '../theme/tokens';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const HORIZONTAL_MARGIN = 20;
const CARD_WIDTH = SCREEN_WIDTH - (HORIZONTAL_MARGIN * 2);
const CARD_SPACING = 12;

interface ModulePillar {
  id: string;
  category: string;
  icon: string;
  iconSet?: 'ionicons' | 'mci';
  iconSize?: number;
  title: string;
  desc: string;
  preview: string;
  accentColor: string;
}

const MODULE_PILLARS: ModulePillar[] = [
  {
    id: 'voice_nlp',
    category: 'VOICE INTELLIGENCE',
    icon: 'mic',
    iconSet: 'ionicons',
    iconSize: 21,
    title: 'Speak to plan your day.',
    desc: 'Dictate tasks, schedule routines, or log habits hands-free. Instant local parsing with zero friction.',
    preview: '🎙️ "Study physics at 9am, gym at 6pm"',
    accentColor: '#A599FF',
  },
  {
    id: 'tasks',
    category: 'SMART TASKS',
    icon: 'checkmark-circle',
    iconSet: 'ionicons',
    iconSize: 22,
    title: 'Capture tasks in seconds.',
    desc: 'Natural language deadlines, Eisenhower priority tagging, and subtasks — 100% offline-first.',
    preview: '⚡ Deep Work · Today 4:00 PM · High Priority',
    accentColor: '#34C759',
  },
  {
    id: 'attendance',
    category: 'ACADEMIC RADAR',
    icon: 'id-card',
    iconSet: 'ionicons',
    iconSize: 21,
    title: 'Never drop below 75% attendance.',
    desc: 'Live timetable schedule with automatic bunk safety calculations and proactive attendance alerts.',
    preview: '🎓 Data Structures · 84.2% · 2 Bunks Safe',
    accentColor: '#6C5CE7',
  },
  {
    id: 'gym',
    category: 'GYM & WORKOUTS',
    icon: 'arm-flex',
    iconSet: 'mci',
    iconSize: 23,
    title: 'Progressive overload, tracked.',
    desc: 'Log sets, track 1RM progression, and optimize rest intervals across your Push / Pull / Legs split.',
    preview: '🏋️ Bench Press · 80kg × 8 reps (New PR)',
    accentColor: '#38BDF8',
  },
  {
    id: 'habits',
    category: 'HABITS & DISCIPLINE',
    icon: 'sync',
    iconSet: 'ionicons',
    iconSize: 21,
    title: 'Build streaks that stick.',
    desc: 'Daily habit streaks, hydration goals, and gamified XP rewards to keep you consistent every day.',
    preview: '🔥 42-Day Streak · 💧 2.8L Water Logged',
    accentColor: '#FF9500',
  },
];

export default function LandingScreen() {
  const navigation = useNavigation<any>();
  const { colors, isDark } = useTheme();
  const [activeCardIndex, setActiveCardIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const [isUserInteracting, setIsUserInteracting] = useState(false);
  const userInteractTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Button Spring Press Animation
  const btnScale = useRef(new Animated.Value(1)).current;

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    PlayfairDisplay_600SemiBold,
    PlayfairDisplay_600SemiBold_Italic,
  });

  // Smooth Auto-Scroll Carousel
  useEffect(() => {
    if (isUserInteracting) return;

    const timer = setInterval(() => {
      setActiveCardIndex((prev) => {
        const nextIndex = (prev + 1) % MODULE_PILLARS.length;
        scrollRef.current?.scrollTo({
          x: nextIndex * (CARD_WIDTH + CARD_SPACING),
          animated: true,
        });
        return nextIndex;
      });
    }, 4500);

    return () => clearInterval(timer);
  }, [isUserInteracting]);

  if (!fontsLoaded) {
    return <View style={[styles.root, { backgroundColor: colors.background }]} />;
  }

  const handleGetStarted = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate('Auth');
  };

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    const index = Math.round(offsetX / (CARD_WIDTH + CARD_SPACING));
    if (index !== activeCardIndex && index >= 0 && index < MODULE_PILLARS.length) {
      setActiveCardIndex(index);
      Haptics.selectionAsync();
    }
  };

  const handleScrollBeginDrag = () => {
    setIsUserInteracting(true);
    if (userInteractTimeoutRef.current) clearTimeout(userInteractTimeoutRef.current);
  };

  const handleScrollEndDrag = () => {
    if (userInteractTimeoutRef.current) clearTimeout(userInteractTimeoutRef.current);
    userInteractTimeoutRef.current = setTimeout(() => {
      setIsUserInteracting(false);
    }, 5000);
  };

  const handleDotPress = (index: number) => {
    Haptics.selectionAsync();
    setActiveCardIndex(index);
    scrollRef.current?.scrollTo({
      x: index * (CARD_WIDTH + CARD_SPACING),
      animated: true,
    });
    setIsUserInteracting(true);
    if (userInteractTimeoutRef.current) clearTimeout(userInteractTimeoutRef.current);
    userInteractTimeoutRef.current = setTimeout(() => setIsUserInteracting(false), 5000);
  };

  const pressIn = () => {
    Animated.spring(btnScale, { toValue: 0.97, useNativeDriver: true, tension: 100, friction: 8 }).start();
  };

  const pressOut = () => {
    Animated.spring(btnScale, { toValue: 1, useNativeDriver: true, tension: 100, friction: 8 }).start();
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Subtle Ambient Cosmic Violet Aura */}
      <LinearGradient
        colors={isDark ? ['rgba(165,153,255,0.07)', 'rgba(0,0,0,0)'] : ['rgba(108,92,231,0.05)', 'rgba(255,255,255,0)']}
        style={StyleSheet.absoluteFillObject}
        locations={[0, 0.45]}
        pointerEvents="none"
      />

      <View style={styles.content}>
        {/* Top Header */}
        <Reanimated.View entering={FadeInDown.duration(500)} style={styles.topHeader}>
          <Text style={[styles.brand, { color: colors.textPrimary }]}>ZENTRACK</Text>
          <Text style={[styles.step, { color: colors.textMuted }]}>01 / welcome</Text>
        </Reanimated.View>

        {/* Main Editorial Hero Block */}
        <Reanimated.View entering={FadeInDown.delay(100).duration(600)} style={styles.mainBlock}>
          <View style={styles.heroTextContainer}>
            <Text style={[styles.heroTitleRow, { color: colors.accentPrimary }]}>
              <Text style={styles.modernGeometricQ}>Q</Text>
              <Text style={styles.heroTitleRest}>uietly</Text>
            </Text>
            <Text style={[styles.heroTitleBold, { color: colors.textPrimary }]}>orchestrated.</Text>
          </View>

          <Text style={[styles.sub, { color: colors.textSecondary }]}>
            Tasks, timetable, academics, and habits, handled alongside you. No dashboard clutter. Zero cognitive friction.
          </Text>

          {/* Minimalist Showcase Cards Carousel */}
          <View style={styles.carouselWrapper}>
            <ScrollView
              ref={scrollRef}
              horizontal
              pagingEnabled={false}
              showsHorizontalScrollIndicator={false}
              onScroll={handleScroll}
              onScrollBeginDrag={handleScrollBeginDrag}
              onScrollEndDrag={handleScrollEndDrag}
              onMomentumScrollEnd={handleScrollEndDrag}
              scrollEventThrottle={16}
              decelerationRate="fast"
              snapToInterval={CARD_WIDTH + CARD_SPACING}
              snapToAlignment="start"
              contentContainerStyle={styles.carouselContent}
            >
              {MODULE_PILLARS.map((item, index) => {
                const isSelected = activeCardIndex === index;
                return (
                  <View
                    key={item.id}
                    style={[
                      styles.showcaseCard,
                      {
                        width: CARD_WIDTH,
                        borderColor: isSelected
                          ? isDark ? 'rgba(165, 153, 255, 0.28)' : 'rgba(108, 92, 231, 0.24)'
                          : isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
                        backgroundColor: isDark ? '#10121A' : '#FFFFFF',
                      },
                    ]}
                  >
                    {/* Header Row: Icon Badge + Category Pill */}
                    <View style={styles.cardHeaderRow}>
                      <View
                        style={[
                          styles.iconBadge,
                          {
                            backgroundColor: `${item.accentColor}18`,
                            borderColor: `${item.accentColor}35`,
                          },
                        ]}
                      >
                        {item.iconSet === 'mci' ? (
                          <MaterialCommunityIcons name={item.icon as any} size={item.iconSize || 22} color={item.accentColor} />
                        ) : (
                          <Ionicons name={item.icon as any} size={item.iconSize || 21} color={item.accentColor} />
                        )}
                      </View>
                      <View
                        style={[
                          styles.categoryPill,
                          {
                            backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.04)',
                          },
                        ]}
                      >
                        <View style={[styles.dotIndicator, { backgroundColor: item.accentColor }]} />
                        <Text style={[styles.categoryPillText, { color: colors.textMuted }]}>
                          {item.category}
                        </Text>
                      </View>
                    </View>

                    {/* Bold Punchy Title */}
                    <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
                      {item.title}
                    </Text>

                    {/* Friendly Human Description */}
                    <Text style={[styles.cardDesc, { color: colors.textSecondary }]}>
                      {item.desc}
                    </Text>

                    {/* Clean Interactive Preview Capsule */}
                    <View
                      style={[
                        styles.previewCapsule,
                        {
                          backgroundColor: isDark ? 'rgba(255, 255, 255, 0.035)' : 'rgba(0, 0, 0, 0.03)',
                          borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
                        },
                      ]}
                    >
                      <Text style={[styles.previewText, { color: colors.textPrimary }]} numberOfLines={1}>
                        {item.preview}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </ScrollView>

            {/* iOS-Style Pagination Indicators */}
            <View style={styles.paginationRow}>
              {MODULE_PILLARS.map((_, idx) => {
                const isActive = activeCardIndex === idx;
                return (
                  <TouchableOpacity
                    key={idx}
                    onPress={() => handleDotPress(idx)}
                    hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
                    activeOpacity={0.7}
                  >
                    <View
                      style={[
                        styles.paginationDot,
                        {
                          backgroundColor: isActive
                            ? (isDark ? '#FFFFFF' : '#0A0A0E')
                            : (isDark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.14)'),
                          width: isActive ? 20 : 6,
                        },
                      ]}
                    />
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </Reanimated.View>

        {/* Bottom CTA Block */}
        <Reanimated.View entering={FadeInUp.delay(180).duration(600)} style={styles.bottomBlock}>
          <TouchableOpacity
            onPressIn={pressIn}
            onPressOut={pressOut}
            onPress={handleGetStarted}
            activeOpacity={0.9}
            style={styles.btnWrapper}
          >
            <Animated.View
              style={[
                styles.primaryBtn,
                {
                  backgroundColor: isDark ? '#FFFFFF' : '#0A0A0E',
                  borderColor: isDark ? '#FFFFFF' : '#0A0A0E',
                  transform: [{ scale: btnScale }],
                },
              ]}
            >
              <Text style={[styles.primaryBtnText, { color: isDark ? '#0A0A0E' : '#FFFFFF' }]}>
                Get Started
              </Text>
              <Ionicons
                name="arrow-forward"
                size={16}
                color={isDark ? '#0A0A0E' : '#FFFFFF'}
                style={{ marginLeft: 8 }}
              />
            </Animated.View>
          </TouchableOpacity>

          <Text style={[styles.trustText, { color: colors.textMuted }]}>
            Private · 100% Local-First · Encrypted
          </Text>
        </Reanimated.View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: HORIZONTAL_MARGIN,
    justifyContent: 'space-between',
    paddingTop: 8,
    paddingBottom: 20,
  },
  topHeader: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 12,
    letterSpacing: 2,
  },
  step: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 11,
    letterSpacing: 1,
  },
  mainBlock: {
    justifyContent: 'center',
    marginVertical: 4,
  },
  heroTextContainer: {
    marginBottom: 6,
    overflow: 'visible',
  },
  heroTitleRow: {
    fontSize: 44,
    lineHeight: 52,
  },
  modernGeometricQ: {
    fontFamily: 'Inter_700Bold',
    fontSize: 46,
    letterSpacing: 0.5,
  },
  heroTitleRest: {
    fontFamily: 'PlayfairDisplay_600SemiBold_Italic',
    fontSize: 44,
    lineHeight: 52,
  },
  heroTitleBold: {
    fontFamily: 'PlayfairDisplay_600SemiBold',
    fontSize: 34,
    lineHeight: 38,
    letterSpacing: -0.6,
  },
  sub: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 13.5,
    lineHeight: 20,
    marginBottom: 16,
    opacity: 0.85,
  },

  // Showcase Cards
  carouselWrapper: {
    width: '100%',
  },
  carouselContent: {
    gap: CARD_SPACING,
    paddingVertical: 4,
  },
  showcaseCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 18,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 3,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  iconBadge: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  categoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    gap: 5,
  },
  dotIndicator: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  categoryPillText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 9.5,
    letterSpacing: 0.8,
  },
  cardTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 18,
    lineHeight: 24,
    letterSpacing: -0.2,
    marginBottom: 6,
  },
  cardDesc: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 16,
    opacity: 0.8,
  },
  previewCapsule: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
  },
  previewText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 12.5,
  },
  paginationRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
  },
  paginationDot: {
    height: 4,
    borderRadius: 2,
  },

  // Footer & Button
  bottomBlock: {
    width: '100%',
    alignItems: 'center',
  },
  btnWrapper: {
    width: '100%',
    marginBottom: 12,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    height: 54,
    width: '100%',
    borderWidth: 1,
    ...SHADOW.sm,
  },
  primaryBtnText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 15.5,
    letterSpacing: 0.2,
  },
  trustText: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 11,
    opacity: 0.6,
    letterSpacing: 0.3,
    textAlign: 'center',
  },
});

