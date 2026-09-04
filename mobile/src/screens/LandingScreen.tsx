import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Dimensions,
  ScrollView, NativeSyntheticEvent, NativeScrollEvent
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import Animated, {
  FadeInDown,
  FadeInUp,
} from 'react-native-reanimated';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { PlayfairDisplay_600SemiBold, PlayfairDisplay_600SemiBold_Italic } from '@expo-google-fonts/playfair-display';
import { useTheme } from '../contexts/ThemeContext';
import { FONT_FAMILY, FONT_SIZE, RADIUS, SHADOW } from '../theme/tokens';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 18;

const MODULE_PILLARS = [
  {
    id: 'sara',
    step: '01 / S.A.R.A INTELLIGENCE',
    badge: 'VOICE AGENT',
    title: 'Voice-First AI Companion',
    desc: 'Hands-free execution for scheduling, logging, reminders & telemetry',
    features: ['Natural voice command parsing', 'Proactive timetable alerts', 'Zero-latency actions'],
    preview: '🗣️ “SARA, log 250ml water & remind DSA at 10 AM”',
    status: '100% On-Device Voice Flow',
  },
  {
    id: 'tasks',
    step: '02 / TASKS & NLP',
    badge: 'NLP ENGINE',
    title: 'Smart Task Management',
    desc: 'Frictionless capture with intelligent deadline parsing & recurring cadence',
    features: ['Natural language time parsing', 'Checklist subtasks', 'Priority & tag filters'],
    preview: '⚡ Quick Capture · Auto-scheduled for 6:00 PM',
    status: 'Offline-First Local Sync',
  },
  {
    id: 'attendance',
    step: '03 / ACADEMIC RADAR',
    badge: 'SAFE ZONE',
    title: 'Timetable & Attendance',
    desc: 'Live college schedule radar with automated bunk safety calculations',
    features: ['75% safe-zone threshold', 'Bunk availability predictor', 'Timetable slot alerts'],
    preview: '🎓 Data Structures · 84.2% · 2 Bunks Safe',
    status: 'Bunk Safeguard Active',
  },
  {
    id: 'gym',
    step: '04 / GYM & OVERLOAD',
    badge: 'PROGRESSION',
    title: 'Gym & Progressive Overload',
    desc: 'Log sets, calculate 1RM velocity, track muscle splits and rest intervals',
    features: ['Push / Pull / Legs tracking', 'Auto rest interval timer', 'Volume & 1RM history'],
    preview: '🏋️ Push Day A · Bench Press: 80kg × 8 reps',
    status: 'Volume PR Tracked',
  },
  {
    id: 'habits',
    step: '05 / DISCIPLINE & XP',
    badge: 'MYTHIC TIER',
    title: 'Habit Constellations & Water',
    desc: 'Gamified consistency streaks, hydration targets, and character XP',
    features: ['Multi-day streak shields', 'Dynamic hydration dial', 'XP level progression'],
    preview: '💧 Hydration: 2.8 / 3.0L · 🔥 42-Day Streak',
    status: 'Level 14 · Mythic Rank',
  },
  {
    id: 'vault',
    step: '06 / VAULT & ANALYTICS',
    badge: 'ENCRYPTED',
    title: 'Analytics & Secure Vault',
    desc: 'Life balance telemetry, focus velocity, and encrypted markdown notes',
    features: ['Discipline balance index', 'Weekly productivity curves', 'Private encrypted notes'],
    preview: '🔒 Private Notes · 94% Focus Velocity Index',
    status: 'End-to-End Encrypted',
  },
];

export default function LandingScreen() {
  const navigation = useNavigation<any>();
  const { colors, isDark } = useTheme();
  const [activeCardIndex, setActiveCardIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const [isUserInteracting, setIsUserInteracting] = useState(false);
  const userInteractTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    PlayfairDisplay_600SemiBold,
    PlayfairDisplay_600SemiBold_Italic,
  });

  // ── Auto-Scroll Carousel with Seamless Loop ────────────────────────────────
  useEffect(() => {
    if (isUserInteracting) return;

    const timer = setInterval(() => {
      setActiveCardIndex((prev) => {
        const nextIndex = (prev + 1) % MODULE_PILLARS.length;
        scrollRef.current?.scrollTo({
          x: nextIndex * (CARD_WIDTH + 8),
          animated: true,
        });
        return nextIndex;
      });
    }, 3600);

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
    const index = Math.round(offsetX / (CARD_WIDTH + 8));
    if (index !== activeCardIndex && index >= 0 && index < MODULE_PILLARS.length) {
      setActiveCardIndex(index);
      Haptics.selectionAsync();
    }
  };

  const handleScrollBeginDrag = () => {
    setIsUserInteracting(true);
    if (userInteractTimeoutRef.current) {
      clearTimeout(userInteractTimeoutRef.current);
    }
  };

  const handleScrollEndDrag = () => {
    if (userInteractTimeoutRef.current) {
      clearTimeout(userInteractTimeoutRef.current);
    }
    userInteractTimeoutRef.current = setTimeout(() => {
      setIsUserInteracting(false);
    }, 4500);
  };

  const handleDotPress = (index: number) => {
    Haptics.selectionAsync();
    setActiveCardIndex(index);
    scrollRef.current?.scrollTo({
      x: index * (CARD_WIDTH + 8),
      animated: true,
    });
    setIsUserInteracting(true);
    if (userInteractTimeoutRef.current) clearTimeout(userInteractTimeoutRef.current);
    userInteractTimeoutRef.current = setTimeout(() => setIsUserInteracting(false), 4500);
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        
        {/* ── Top Header (Matching Step 02 in AuthScreen) ─────────────── */}
        <Animated.View entering={FadeInDown.duration(600)} style={styles.topHeader}>
          <Text style={[styles.brand, { color: colors.textPrimary }]}>ZENTRACK</Text>
          <Text style={[styles.step, { color: colors.textMuted }]}>01 / welcome</Text>
        </Animated.View>

        {/* ── Main Editorial Hero Block ───────────────────────────────── */}
        <Animated.View entering={FadeInDown.delay(120).duration(700)} style={styles.mainBlock}>
          <View style={styles.heroTextContainer}>
            <Text style={[styles.heroTitleItalic, { color: colors.accentPrimary }]}>Quietly</Text>
            <Text style={[styles.heroTitleBold, { color: colors.textPrimary }]}>orchestrated.</Text>
          </View>

          <Text style={[styles.sub, { color: colors.textSecondary }]}>
            Tasks, time, academics, and habits, handled alongside you. No dashboard clutter. Zero cognitive friction.
          </Text>

          {/* ── Sliding Minimalist Telemetry Cards / Pills ────────────── */}
          <View style={styles.carouselWrapper}>
            <ScrollView
              ref={scrollRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onScroll={handleScroll}
              onScrollBeginDrag={handleScrollBeginDrag}
              onScrollEndDrag={handleScrollEndDrag}
              onMomentumScrollEnd={handleScrollEndDrag}
              scrollEventThrottle={16}
              decelerationRate="fast"
              snapToInterval={CARD_WIDTH + 8}
              snapToAlignment="start"
              contentContainerStyle={styles.carouselContent}
            >
              {MODULE_PILLARS.map((item, index) => {
                const isSelected = activeCardIndex === index;
                return (
                  <View
                    key={item.id}
                    style={[
                      styles.slidingCard,
                      {
                        width: CARD_WIDTH,
                        borderColor: isSelected
                          ? isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.18)'
                          : isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
                        backgroundColor: isDark ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.02)',
                      },
                    ]}
                  >
                    {/* Card Top Label & Badge */}
                    <View style={styles.cardTopRow}>
                      <Text style={[styles.cardStepText, { color: colors.textMuted }]}>{item.step}</Text>
                      <View style={[styles.cardBadge, { borderColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.08)' }]}>
                        <Text style={[styles.cardBadgeText, { color: colors.textSecondary }]}>{item.badge}</Text>
                      </View>
                    </View>

                    {/* Card Title & Desc */}
                    <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{item.title}</Text>
                    <Text style={[styles.cardDesc, { color: colors.textSecondary }]}>{item.desc}</Text>

                    {/* Feature Micro-Bullets Row */}
                    <View style={styles.featuresRow}>
                      {item.features.map((feat, i) => (
                        <View key={i} style={styles.featureItem}>
                          <View style={[styles.featureDot, { backgroundColor: colors.accentPrimary }]} />
                          <Text style={[styles.featureText, { color: colors.textSecondary }]}>{feat}</Text>
                        </View>
                      ))}
                    </View>

                    {/* Monochromatic Preview Capsule */}
                    <View style={[styles.previewCapsule, { backgroundColor: isDark ? 'rgba(0,0,0,0.40)' : 'rgba(255,255,255,0.6)', borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }]}>
                      <Text style={[styles.previewText, { color: colors.textPrimary }]} numberOfLines={1}>
                        {item.preview}
                      </Text>
                    </View>

                    {/* Bottom Status Row */}
                    <View style={styles.cardStatusRow}>
                      <View style={[styles.statusDot, { backgroundColor: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }]} />
                      <Text style={[styles.statusText, { color: colors.textMuted }]}>{item.status}</Text>
                    </View>
                  </View>
                );
              })}
            </ScrollView>

            {/* Pagination Dots */}
            <View style={styles.paginationRow}>
              {MODULE_PILLARS.map((_, idx) => (
                <TouchableOpacity
                  key={idx}
                  onPress={() => handleDotPress(idx)}
                  hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      styles.paginationDot,
                      {
                        backgroundColor: activeCardIndex === idx
                          ? (isDark ? '#FFFFFF' : '#0A0A0E')
                          : (isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.15)'),
                        width: activeCardIndex === idx ? 16 : 4.5,
                      },
                    ]}
                  />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </Animated.View>

        {/* ── Bottom Actions (Matching AuthScreen Google Button) ──────── */}
        <Animated.View entering={FadeInUp.delay(200).duration(700)} style={styles.bottomBlock}>
          <TouchableOpacity
            style={[
              styles.primaryBtn,
              {
                backgroundColor: isDark ? '#FFFFFF' : '#0A0A0E',
                borderColor: isDark ? '#FFFFFF' : '#0A0A0E',
              }
            ]}
            onPress={handleGetStarted}
            activeOpacity={0.88}
          >
            <Text style={[styles.primaryBtnText, { color: isDark ? '#0A0A0E' : '#FFFFFF' }]}>
              Get Started  →
            </Text>
          </TouchableOpacity>

          <Text style={[styles.trustText, { color: colors.textMuted }]}>
            Private · 100% Local-First · Encrypted
          </Text>
        </Animated.View>

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
    paddingHorizontal: 5,
    justifyContent: 'space-between',
    paddingTop: 8,
    paddingBottom: 24,
  },
  topHeader: {
    marginTop: 8,
    paddingHorizontal: 6,
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
    paddingHorizontal: 4,
    marginTop: 4,
    marginBottom: 12,
  },
  heroTextContainer: {
    marginBottom: 10,
  },
  heroTitleItalic: {
    fontFamily: 'PlayfairDisplay_600SemiBold_Italic',
    fontSize: 46,
    lineHeight: 52,
    paddingLeft: 4,
    paddingRight: 16,
    paddingVertical: 2,
  },
  heroTitleBold: {
    fontFamily: 'PlayfairDisplay_600SemiBold',
    fontSize: 36,
    lineHeight: 42,
    letterSpacing: -0.5,
    paddingLeft: 4,
  },
  sub: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 16,
    paddingHorizontal: 4,
  },

  // Carousel & Sliding Cards
  carouselWrapper: {
    width: '100%',
  },
  carouselContent: {
    gap: 8,
  },
  slidingCard: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    padding: 15,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  cardStepText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 9.5,
    letterSpacing: 1,
  },
  cardBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  cardBadgeText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 8.5,
    letterSpacing: 0.8,
  },
  cardTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 16,
    letterSpacing: 0.2,
    marginBottom: 3,
  },
  cardDesc: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 10,
  },
  featuresRow: {
    marginBottom: 10,
    gap: 4,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  featureDot: {
    width: 3.5,
    height: 3.5,
    borderRadius: 2,
    marginRight: 6,
  },
  featureText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 11.5,
    lineHeight: 16,
  },
  previewCapsule: {
    paddingHorizontal: 12,
    paddingVertical: 7.5,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 8,
  },
  previewText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 11.5,
  },
  cardStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    marginRight: 6,
  },
  statusText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 10.5,
    letterSpacing: 0.2,
  },
  paginationRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 5,
    marginTop: 10,
  },
  paginationDot: {
    height: 3.5,
    borderRadius: 2,
  },

  // Footer & Button
  bottomBlock: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.lg,
    paddingVertical: 15,
    width: '100%',
    borderWidth: 1,
    marginBottom: 12,
    ...SHADOW.sm,
  },
  primaryBtnText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 15.5,
    letterSpacing: 0.2,
  },
  trustText: {
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.xs,
    opacity: 0.6,
    letterSpacing: 0.3,
    textAlign: 'center',
  },
});
