import React, { useMemo, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated,
  Dimensions, Image, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useFonts, Inter_400Regular, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { PlayfairDisplay_600SemiBold, PlayfairDisplay_600SemiBold_Italic } from '@expo-google-fonts/playfair-display';
import { useTheme } from '../contexts/ThemeContext';
import { FONT_FAMILY, FONT_SIZE, RADIUS, SPACE } from '../theme/tokens';
import { formatDateWithDay } from '../utils/dateUtils';

const { width } = Dimensions.get('window');

export default function LandingScreen() {
  const navigation = useNavigation<any>();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_600SemiBold,
    Inter_700Bold,
    PlayfairDisplay_600SemiBold,
    PlayfairDisplay_600SemiBold_Italic,
  });

  // Entrance Animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const orbScale = useRef(new Animated.Value(0.92)).current;
  const orbPulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (fontsLoaded) {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, tension: 50, friction: 10, useNativeDriver: true }),
        Animated.spring(orbScale, { toValue: 1, tension: 40, friction: 8, useNativeDriver: true }),
      ]).start();

      // Continuous ambient orb pulse
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(orbPulse, { toValue: 1.05, duration: 2400, useNativeDriver: true }),
          Animated.timing(orbPulse, { toValue: 1, duration: 2400, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return <View style={styles.container} />;
  }

  const today = new Date();
  const dateStr = formatDateWithDay(today.toISOString().slice(0, 10));

  const handleGetStarted = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    navigation.navigate('Auth');
  };

  const handleTryDemo = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate('GuestDashboard');
  };

  return (
    <SafeAreaView style={styles.container}>
      <Animated.View style={[styles.mainContent, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
        
        {/* Top Header */}
        <View style={styles.header}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={styles.headerBrandText}>ZENTRACK</Text>
            <View style={styles.brandDot} />
          </View>
          <View style={styles.versionBadge}>
            <Text style={styles.versionBadgeText}>LIFE OS 2.0</Text>
          </View>
        </View>

        {/* Hero Section */}
        <View style={styles.heroSection}>
          {/* Logo Container */}
          <Animated.View
            style={[
              styles.logoContainer,
              {
                transform: [
                  { scale: Animated.multiply(orbScale, orbPulse) }
                ]
              }
            ]}
          >
            <View style={styles.logoInnerGlow}>
              <Image
                source={require('../../assets/logo_white.png')}
                style={styles.logoImage}
                resizeMode="contain"
              />
            </View>
          </Animated.View>

          {/* Minimal Tag Pill */}
          <View style={styles.welcomePill}>
            <Text style={styles.welcomePillText}>AUTONOMOUS LIFE OS</Text>
          </View>

          {/* Editorial Title */}
          <View style={styles.heroTextContainer}>
            <Text style={styles.heroTitleItalic}>Quietly</Text>
            <Text style={styles.heroTitleBold}>orchestrated.</Text>

            <Text style={styles.heroSubtitle}>
              Tasks, time, academics, and habits, handled alongside you. No dashboard clutter. Zero cognitive friction.
            </Text>
          </View>
        </View>

        {/* Footer CTAs */}
        <View style={styles.footer}>
          <View style={styles.footerLine} />
          
          <View style={styles.ctaGroup}>
            {/* Primary Action Button */}
            <TouchableOpacity
              style={styles.primaryCta}
              onPress={handleGetStarted}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryCtaText}>Get Started</Text>
              <Ionicons name="arrow-forward" size={16} color={isDark ? '#000000' : '#FFFFFF'} />
            </TouchableOpacity>

            {/* Secondary Action: Demo Mode */}
            <TouchableOpacity
              style={styles.secondaryCta}
              onPress={handleTryDemo}
              activeOpacity={0.75}
            >
              <Ionicons name="play-outline" size={15} color={colors.textSecondary} />
              <Text style={styles.secondaryCtaText}>Try Demo Mode</Text>
            </TouchableOpacity>
          </View>

          {/* Date & Meta */}
          <View style={styles.footerMeta}>
            <Text style={styles.dateText}>{dateStr}</Text>
            <Text style={styles.metaSubText}>Private • Local-First • Encrypted</Text>
          </View>
        </View>

      </Animated.View>
    </SafeAreaView>
  );
}

const makeStyles = (colors: any, isDark: boolean) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  mainContent: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 24,
    justifyContent: 'space-between',
  },
  header: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerBrandText: {
    color: colors.textPrimary,
    fontFamily: FONT_FAMILY.bold,
    fontSize: 13,
    letterSpacing: 2.2,
  },
  brandDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.accentPrimary,
  },
  versionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
    backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  versionBadgeText: {
    color: colors.textMuted,
    fontFamily: FONT_FAMILY.bold,
    fontSize: 9.5,
    letterSpacing: 1,
  },

  // Hero Section
  heroSection: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'flex-start',
    marginTop: -20,
  },
  logoContainer: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: isDark ? 'rgba(165,153,255,0.10)' : 'rgba(108,92,231,0.06)',
    borderWidth: 1.5,
    borderColor: isDark ? 'rgba(165,153,255,0.25)' : 'rgba(108,92,231,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  logoInnerGlow: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: isDark ? 'rgba(165,153,255,0.16)' : 'rgba(108,92,231,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoImage: {
    width: 28,
    height: 28,
  },
  welcomePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    backgroundColor: isDark ? 'rgba(165,153,255,0.10)' : 'rgba(108,92,231,0.06)',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(165,153,255,0.20)' : 'rgba(108,92,231,0.16)',
    marginBottom: 16,
  },
  welcomePillText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 9.5,
    letterSpacing: 0.8,
    color: colors.accentPrimary,
  },
  heroTextContainer: {
    width: '100%',
  },
  heroTitleItalic: {
    color: colors.accentPrimary,
    fontFamily: 'PlayfairDisplay_600SemiBold_Italic',
    fontSize: 52,
    lineHeight: 58,
  },
  heroTitleBold: {
    color: colors.textPrimary,
    fontFamily: 'PlayfairDisplay_600SemiBold',
    fontSize: 42,
    lineHeight: 48,
    letterSpacing: -0.8,
    marginBottom: 18,
  },
  heroSubtitle: {
    color: colors.textSecondary,
    fontFamily: FONT_FAMILY.body,
    fontSize: 14,
    lineHeight: 22,
    maxWidth: width - 64,
  },

  // Footer & CTAs
  footer: {
    width: '100%',
  },
  footerLine: {
    height: 1,
    backgroundColor: colors.border,
    marginBottom: 18,
  },
  ctaGroup: {
    gap: 10,
    marginBottom: 16,
  },
  primaryCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 50,
    borderRadius: RADIUS.full,
    backgroundColor: colors.accentPrimary,
  },
  primaryCtaText: {
    color: isDark ? '#000000' : '#FFFFFF',
    fontFamily: FONT_FAMILY.bold,
    fontSize: 14.5,
  },
  secondaryCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    borderRadius: RADIUS.full,
    backgroundColor: isDark ? colors.surface : '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryCtaText: {
    color: colors.textSecondary,
    fontFamily: FONT_FAMILY.medium,
    fontSize: 13,
  },
  footerMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  dateText: {
    color: colors.textMuted,
    fontFamily: FONT_FAMILY.medium,
    fontSize: 11.5,
  },
  metaSubText: {
    color: colors.textMuted,
    fontFamily: FONT_FAMILY.body,
    fontSize: 10.5,
  },
});
