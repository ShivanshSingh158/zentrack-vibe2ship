/**
 * OnboardingScreen — ZenTrack Mobile
 * Editorial Luxury Minimalist Design (Obsidian Cosmos Dark / Frost Quartz Light)
 *
 * ╔═════════════════════════════════════════════════════════════════════════╗
 * ║  🔴 BUG-H6 SAFETY CONSTRAINT — READ THIS BEFORE EDITING               ║
 * ║                                                                         ║
 * ║  OnboardingScreen renders OUTSIDE all Stack/Tab navigators in          ║
 * ║  AppNavigator.tsx. It is returned as a standalone component when       ║
 * ║  authLoading=false and hasOnboarded=false, BEFORE the main navigator. ║
 * ║                                                                         ║
 * ║  NEVER call useNavigation() inside this file. It will throw:          ║
 * ║    "Couldn't find a navigation object. Is your component inside       ║
 * ║     NavigationContainer?"                                              ║
 * ║  ...crashing the app for EVERY new user on first launch.              ║
 * ║                                                                         ║
 * ║  Navigation callbacks must be passed as PROPS from AppNavigator.tsx.  ║
 * ║  The existing pattern (calling onComplete() prop after onboarding) is   ║
 * ║  the correct approach. Do not change this pattern.                    ║
 * ╚═════════════════════════════════════════════════════════════════════════╝
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated,
  Dimensions, ScrollView, Image, Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, setDoc } from 'firebase/firestore';
import { db, auth } from '../services/firebase';
import { awardXP } from '../services/xpSystem';
import { requestNotificationPermissions } from '../services/notifications';
import * as Notifications from 'expo-notifications';
import Reanimated, {
  FadeIn, FadeOut,
  SlideInRight, SlideOutLeft,
  SlideInLeft, SlideOutRight,
  Layout
} from 'react-native-reanimated';

// Fonts & Theme
import { useFonts, Inter_400Regular, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { PlayfairDisplay_600SemiBold, PlayfairDisplay_600SemiBold_Italic } from '@expo-google-fonts/playfair-display';
import { useTheme } from '../contexts/ThemeContext';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS, SHADOW } from '../theme/tokens';
import { updateL1Cache } from '../utils/bootManifest';

const { width } = Dimensions.get('window');

export const ONBOARDING_KEY = 'zentrack_onboarded_v2';

// ── Archetypes & Personas ───────────────────────────────────────────────────
interface PersonaConfig {
  id: string;
  label: string;
  icon: string;
  tagline: string;
  defaultModules: string[];
}

const PERSONAS: PersonaConfig[] = [
  {
    id: 'scholar',
    label: 'The Scholar',
    icon: '🎓',
    tagline: 'Attendance, timetable, grades & study goals',
    defaultModules: ['Tasks', 'Attendance', 'Calendar', 'Notes'],
  },
  {
    id: 'builder',
    label: 'The Builder',
    icon: '⚡',
    tagline: 'Deep work, habit streaks & daily execution',
    defaultModules: ['Tasks', 'Habits', 'Learning', 'Notes'],
  },
  {
    id: 'athlete',
    label: 'The Athlete',
    icon: '🏋️',
    tagline: 'PPL workouts, progressive overload & rest',
    defaultModules: ['Gym', 'Habits', 'Tasks', 'Calendar'],
  },
  {
    id: 'allrounder',
    label: 'The All-Rounder',
    icon: '👑',
    tagline: 'Balanced life matrix across work, fitness & study',
    defaultModules: ['Tasks', 'Gym', 'Calendar', 'Attendance'],
  },
];

// ── Module Catalog ──────────────────────────────────────────────────────────
export interface ModuleItem {
  id: string;
  name: string;
  activeIcon: keyof typeof Ionicons.glyphMap;
  inactiveIcon: keyof typeof Ionicons.glyphMap;
  desc: string;
}

export const MODULE_CATALOG: ModuleItem[] = [
  { id: 'Tasks',       name: 'Tasks',      activeIcon: 'checkmark-circle', inactiveIcon: 'checkmark-circle-outline', desc: 'Matrix & 24h Timeline' },
  { id: 'Gym',         name: 'Gym',        activeIcon: 'barbell',          inactiveIcon: 'barbell-outline',          desc: 'PPL Overload Tracker' },
  { id: 'Attendance',  name: 'Attend',     activeIcon: 'id-card',          inactiveIcon: 'id-card-outline',          desc: 'Timetable & Bunk Safety' },
  { id: 'Habits',      name: 'Habits',     activeIcon: 'flame',            inactiveIcon: 'flame-outline',            desc: 'Dopamine Streaks' },
  { id: 'Calendar',    name: 'Calendar',   activeIcon: 'calendar-clear',   inactiveIcon: 'calendar-clear-outline',   desc: 'Unified Agenda' },
  { id: 'Notes',       name: 'Notes',      activeIcon: 'document-text',    inactiveIcon: 'document-text-outline',    desc: 'Markdown & AI Notes' },
  { id: 'Learning',    name: 'Learn',      activeIcon: 'library',          inactiveIcon: 'library-outline',          desc: 'Video Lectures & MindMap' },
  { id: 'Grades',      name: 'Grades',     activeIcon: 'calculator',       inactiveIcon: 'calculator-outline',       desc: 'SGPA/CGPA Forecast' },
  { id: 'Analytics',   name: 'Stats',      activeIcon: 'bar-chart',        inactiveIcon: 'bar-chart-outline',        desc: 'XP & Discipline Radar' },
];

export default function OnboardingScreen({ onComplete }: { onComplete: () => void }) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_600SemiBold,
    Inter_700Bold,
    PlayfairDisplay_600SemiBold,
    PlayfairDisplay_600SemiBold_Italic,
  });

  // Flow State (3 rapid steps)
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState<'forward' | 'backward'>('forward');
  const [selectedPersona, setPersona] = useState<string>('allrounder');
  const [pinnedModules, setPinned] = useState<string[]>(['Tasks', 'Gym', 'Calendar', 'Attendance']);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    return () => {
      Speech.stop().catch(() => {});
    };
  }, []);

  if (!fontsLoaded) return <View style={styles.root} />;

  const next = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDirection('forward');
    setStep(s => s + 1);
  };

  const prev = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDirection('backward');
    setStep(s => Math.max(0, s - 1));
  };

  // Step 0: Select Persona
  const handleSelectPersona = (persona: PersonaConfig) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPersona(persona.id);
    setPinned(persona.defaultModules);
  };

  // Step 1: Toggle Module in 4-Slot Dock
  const handleToggleModule = (moduleId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPinned(prev => {
      if (prev.includes(moduleId)) {
        if (prev.length <= 1) return prev; // Keep at least 1
        return prev.filter(id => id !== moduleId);
      } else {
        if (prev.length >= 4) {
          return [...prev.slice(1), moduleId];
        }
        return [...prev, moduleId];
      }
    });
  };

  // SARA Voice Preview
  const handleVoicePreview = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsSpeaking(true);
    Speech.speak("I am Sara. Your life operating system is armed and ready. Let's make today count.", {
      language: 'en-US',
      pitch: 1.05,
      rate: 0.95,
      onDone: () => setIsSpeaking(false),
      onError: () => setIsSpeaking(false),
    });
  };

  // Final Genesis Launch
  const handleGenesisLaunch = async () => {
    setSaving(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try {
      const uid = auth.currentUser?.uid;
      
      // Request notifications in background
      requestNotificationPermissions().then(granted => {
        if (granted) {
          Notifications.scheduleNotificationAsync({
            content: {
              title: "ZenTrack Genesis Complete ⭐",
              body: "+100 XP awarded. Your custom Life OS is online.",
              sound: true,
            },
            trigger: null,
          });
        }
      }).catch(() => {});

      // Persist chosen 4 pinned modules to L1 & AsyncStorage
      updateL1Cache('pinnedModules', pinnedModules);
      await AsyncStorage.setItem('@zentrack_pinned_modules', JSON.stringify(pinnedModules));
      await AsyncStorage.multiSet([
        ['@zentrack_onboarding_completed', 'true'],
        [ONBOARDING_KEY, 'true'],
      ]);

      // Save identity to Firestore in background
      if (uid) {
        setDoc(doc(db, 'users', uid, 'profile', 'identity'), {
          persona: selectedPersona,
          pinnedModules,
          onboardedAt: Date.now(),
        }, { merge: true }).catch(() => {});
      }

      // Award +100 Genesis XP
      awardXP('ONBOARDING').catch(() => {});

      onComplete();
    } catch (e) {
      console.error('[Onboarding] Error:', e);
      await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
      onComplete();
    }
  };

  // ── Render Steps ──────────────────────────────────────────────────────────
  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <StepPersona
            selected={selectedPersona}
            onSelect={handleSelectPersona}
            onNext={next}
            styles={styles}
            colors={colors}
            isDark={isDark}
          />
        );
      case 1:
        return (
          <StepFocusMatrix
            pinned={pinnedModules}
            onToggle={handleToggleModule}
            onNext={next}
            styles={styles}
            colors={colors}
            isDark={isDark}
          />
        );
      case 2:
        return (
          <StepGenesisLaunch
            persona={selectedPersona}
            pinned={pinnedModules}
            saving={saving}
            isSpeaking={isSpeaking}
            onVoicePreview={handleVoicePreview}
            onLaunch={handleGenesisLaunch}
            styles={styles}
            colors={colors}
            isDark={isDark}
          />
        );
      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      {/* Top Header */}
      <View style={styles.globalHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={styles.globalBrand}>ZENTRACK</Text>
          <View style={styles.brandDot} />
        </View>
        <Reanimated.Text
          key={step}
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(150)}
          style={styles.globalStep}
        >
          0{step + 1} / 03
        </Reanimated.Text>
      </View>

      {/* Main Animated View with Pure Horizontal Slide (Zero Vertical Bounce) */}
      <View style={styles.sliderContainer}>
        <Reanimated.View
          key={`step-${step}`}
          entering={
            direction === 'forward'
              ? SlideInRight.duration(280)
              : SlideInLeft.duration(280)
          }
          exiting={
            direction === 'forward'
              ? SlideOutLeft.duration(200)
              : SlideOutRight.duration(200)
          }
          style={styles.stepContainer}
        >
          {renderStep()}
        </Reanimated.View>
      </View>

      {/* Footer Nav Bar with Back & Dots */}
      <View style={styles.footerRow}>
        {step > 0 ? (
          <TouchableOpacity onPress={prev} style={styles.backBtn} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={16} color={colors.textSecondary} />
            <Text style={styles.backBtnText}>Back</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 60 }} />
        )}

        <View style={styles.dots}>
          {[0, 1, 2].map(i => (
            <Reanimated.View
              key={i}
              layout={Layout.springify()}
              style={[styles.dot, i === step && styles.dotActive]}
            />
          ))}
        </View>

        <View style={{ width: 60 }} />
      </View>
    </SafeAreaView>
  );
}

// ─── Step 1: Persona Selection ────────────────────────────────────────────────
function StepPersona({ selected, onSelect, onNext, styles, colors, isDark }: any) {
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollStep} showsVerticalScrollIndicator={false}>
      <Text style={styles.stepIndicator}>STEP 01</Text>
      <Text style={styles.titleSerif}>
        Who are you{'\n'}
        <Text style={styles.titleSerifItalic}>building in 90 days?</Text>
      </Text>
      <Text style={styles.subText}>Select your primary archetype to tailor your daily operating system.</Text>

      <View style={styles.personaList}>
        {PERSONAS.map(p => {
          const active = selected === p.id;
          return (
            <TouchableOpacity
              key={p.id}
              onPress={() => onSelect(p)}
              activeOpacity={0.8}
              style={[styles.personaRow, active && styles.personaRowActive]}
            >
              <Text style={styles.personaEmoji}>{p.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.personaTitle, active && { color: colors.accentPrimary }]}>{p.label}</Text>
                <Text style={styles.personaTagline}>{p.tagline}</Text>
              </View>
              {active && (
                <View style={styles.activeCheckCircle}>
                  <Ionicons name="checkmark" size={12} color={isDark ? '#000000' : '#FFFFFF'} />
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity style={styles.primaryBtn} onPress={onNext} activeOpacity={0.85}>
        <Text style={styles.primaryBtnText}>Continue to Dock</Text>
        <Ionicons name="arrow-forward" size={16} color={isDark ? '#000000' : '#FFFFFF'} />
      </TouchableOpacity>
    </ScrollView>
  );
}

// ─── Step 2: Focus Matrix & LIVE DOCK PREVIEW ─────────────────────────────────
function StepFocusMatrix({ pinned, onToggle, onNext, styles, colors, isDark }: any) {
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollStep} showsVerticalScrollIndicator={false}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={styles.stepIndicator}>STEP 02</Text>
        <View style={styles.slotCountBadge}>
          <Text style={styles.slotCountText}>{pinned.length} / 4 Pinned</Text>
        </View>
      </View>

      <Text style={styles.titleSerif}>
        Choose your 4{'\n'}
        <Text style={styles.titleSerifItalic}>core pillars.</Text>
      </Text>
      <Text style={styles.subText}>Tap to select 4 modules. Watch your bottom dock morph in real time below.</Text>

      {/* 3x3 Module Grid */}
      <View style={styles.moduleGrid}>
        {MODULE_CATALOG.map(mod => {
          const isSelected = pinned.includes(mod.id);
          return (
            <TouchableOpacity
              key={mod.id}
              onPress={() => onToggle(mod.id)}
              activeOpacity={0.75}
              style={[styles.moduleTile, isSelected && styles.moduleTileSelected]}
            >
              <Ionicons
                name={isSelected ? mod.activeIcon : mod.inactiveIcon}
                size={22}
                color={isSelected ? colors.accentPrimary : colors.textSecondary}
              />
              <Text style={[styles.moduleTileLabel, isSelected && { color: colors.accentPrimary }]}>
                {mod.name}
              </Text>
              {isSelected && (
                <View style={styles.moduleTileBadge}>
                  <Text style={styles.moduleTileBadgeText}>{pinned.indexOf(mod.id) + 1}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── LIVE MORPHING DOCK PREVIEW ── */}
      <View style={styles.dockPreviewWrapper}>
        <Text style={styles.dockPreviewLabel}>LIVE BOTTOM DOCK PREVIEW</Text>
        <View style={styles.dockPreviewBar}>
          {/* Permanent Home */}
          <View style={styles.dockPreviewItem}>
            <Ionicons name="home" size={17} color={colors.textMuted} />
            <Text style={styles.dockPreviewItemText}>Home</Text>
          </View>

          {/* 4 Dynamic Slots */}
          {pinned.slice(0, 4).map((modId: string) => {
            const modObj = MODULE_CATALOG.find(m => m.id === modId);
            if (!modObj) return null;
            return (
              <Reanimated.View
                key={modId}
                layout={Layout.springify()}
                entering={FadeIn.duration(180)}
                exiting={FadeOut.duration(120)}
                style={styles.dockPreviewItem}
              >
                <Ionicons name={modObj.activeIcon} size={17} color={colors.accentPrimary} />
                <Text style={[styles.dockPreviewItemText, { color: colors.accentPrimary, fontFamily: FONT_FAMILY.bold }]}>
                  {modObj.name}
                </Text>
              </Reanimated.View>
            );
          })}

          {/* Permanent More */}
          <View style={styles.dockPreviewItem}>
            <Ionicons name="apps" size={17} color={colors.textMuted} />
            <Text style={styles.dockPreviewItemText}>More</Text>
          </View>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.primaryBtn, pinned.length < 4 && { opacity: 0.85 }]}
        onPress={onNext}
        activeOpacity={0.85}
      >
        <Text style={styles.primaryBtnText}>Confirm Dock ({pinned.length}/4)</Text>
        <Ionicons name="arrow-forward" size={16} color={isDark ? '#000000' : '#FFFFFF'} />
      </TouchableOpacity>
    </ScrollView>
  );
}

// ─── Step 3: Genesis XP & Floating Seeker Mascot ──────────────────────────────
function StepGenesisLaunch({ persona, pinned, saving, isSpeaking, onVoicePreview, onLaunch, styles, colors, isDark }: any) {
  const personaObj = PERSONAS.find(p => p.id === persona);

  // Floating Seeker Mascot Physics
  const floatAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const float = Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, { toValue: -7, duration: 1800, useNativeDriver: true }),
        Animated.timing(floatAnim, { toValue: 0, duration: 1800, useNativeDriver: true }),
      ])
    );
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 1800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1.0, duration: 1800, useNativeDriver: true }),
      ])
    );
    float.start();
    pulse.start();
    return () => {
      float.stop();
      pulse.stop();
    };
  }, [floatAnim, pulseAnim]);

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollStep} showsVerticalScrollIndicator={false}>
      {/* SARA Voice Test Pill */}
      <TouchableOpacity
        style={[styles.voicePill, isSpeaking && { borderColor: colors.accentPrimary }]}
        onPress={onVoicePreview}
        activeOpacity={0.8}
      >
        <Ionicons name={isSpeaking ? "volume-high" : "mic-outline"} size={16} color={colors.accentPrimary} />
        <Text style={styles.voicePillText}>{isSpeaking ? "SARA is speaking..." : "Test SARA's Voice"}</Text>
      </TouchableOpacity>

      {/* Luxury Genesis Initiation Card */}
      <View style={styles.genesisCard}>
        {/* Floating Seeker Mascot with Emerald Nature Cosmic Aura */}
        <View style={styles.mascotWrapper}>
          <Animated.View
            style={[
              styles.seekerMascotOrb,
              {
                transform: [
                  { translateY: floatAnim },
                  { scale: pulseAnim }
                ]
              }
            ]}
          >
            <Ionicons name="compass-outline" size={36} color="#34d399" />
          </Animated.View>
          {/* Subtle Ground Shadow */}
          <View style={styles.mascotGroundShadow} />
        </View>

        {/* Level Rank Badge from XP Constellation */}
        <View style={styles.rankPill}>
          <Text style={styles.rankPillText}>RANK: SEEKER • LEVEL 1</Text>
        </View>
        <Text style={styles.realmSubText}>Initiate Realm • Wind & Discovery</Text>

        {/* Genesis Reward */}
        <Text style={styles.genesisRewardText}>+100 GENESIS XP</Text>

        {/* Level Progress Bar */}
        <View style={styles.xpProgressWrapper}>
          <View style={styles.xpProgressBg}>
            <View style={[styles.xpProgressFill, { width: '10%' }]} />
          </View>
          <View style={styles.xpProgressLabels}>
            <Text style={styles.xpProgressText}>100 / 1,000 XP</Text>
            <Text style={styles.xpNextLevelText}>Next: Level 2 Warden</Text>
          </View>
        </View>

        <View style={styles.genesisDivider} />

        {/* Archetype Row */}
        <View style={styles.genesisSummaryRow}>
          <Text style={styles.genesisSummaryLabel}>Archetype</Text>
          <Text style={styles.genesisSummaryVal}>{personaObj?.icon} {personaObj?.label || 'The Scholar'}</Text>
        </View>

        {/* Pinned Pillars Row with Real Icons */}
        <View style={styles.pillarChipsRow}>
          {pinned.map((modId: string) => {
            const modObj = MODULE_CATALOG.find(m => m.id === modId);
            return (
              <View key={modId} style={styles.pillarChip}>
                <Ionicons name={modObj?.activeIcon || 'star'} size={12} color={colors.accentPrimary} />
                <Text style={styles.pillarChipText}>{modObj?.name || modId}</Text>
              </View>
            );
          })}
        </View>
      </View>

      <Text style={styles.genesisHeadline}>Your Life OS is Ready.</Text>
      <Text style={styles.genesisSub}>
        S.A.R.A is online. All 4 core modules are configured and synchronized.
      </Text>

      <TouchableOpacity
        style={styles.primaryBtn}
        onPress={onLaunch}
        disabled={saving}
        activeOpacity={0.85}
      >
        <Text style={styles.primaryBtnText}>
          {saving ? 'Forging System...' : 'Launch ZenTrack (0ms)'}
        </Text>
        <Ionicons name="rocket-outline" size={18} color={isDark ? '#000000' : '#FFFFFF'} />
      </TouchableOpacity>
    </ScrollView>
  );
}

// ─── Styles & Tokens ──────────────────────────────────────────────────────────
const makeStyles = (colors: any, isDark: boolean = true) => StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  globalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
  },
  globalBrand: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 13,
    letterSpacing: 2.2,
    color: colors.textPrimary,
  },
  brandDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.accentPrimary,
  },
  globalStep: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 11,
    letterSpacing: 1.2,
    color: colors.textMuted,
  },
  sliderContainer: {
    flex: 1,
    overflow: 'hidden',
  },
  stepContainer: {
    flex: 1,
    paddingHorizontal: 12,
  },
  scrollStep: {
    paddingBottom: 28,
  },

  // Typography
  stepIndicator: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 10.5,
    letterSpacing: 1.5,
    color: colors.accentPrimary,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  titleSerif: {
    fontFamily: 'PlayfairDisplay_600SemiBold',
    fontSize: 30,
    lineHeight: 36,
    color: colors.textPrimary,
    marginBottom: 6,
  },
  titleSerifItalic: {
    fontFamily: 'PlayfairDisplay_600SemiBold_Italic',
    color: colors.accentPrimary,
  },
  subText: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
    marginBottom: 20,
  },

  // Step 1: Sleek Persona List
  personaList: {
    gap: 8,
    marginBottom: 24,
  },
  personaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: RADIUS.lg,
    backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#FFFFFF',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
  },
  personaRowActive: {
    borderColor: colors.accentPrimary,
    backgroundColor: isDark ? (colors.surfaceRaised || '#161424') : '#F5F3FF',
    borderWidth: 1.5,
  },
  personaEmoji: {
    fontSize: 22,
  },
  activeCheckCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.accentPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  personaTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 14.5,
    color: colors.textPrimary,
  },
  personaTagline: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 11.5,
    color: colors.textMuted,
    marginTop: 2,
  },

  // Step 2: Module Grid
  slotCountBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
    backgroundColor: isDark ? 'rgba(165,153,255,0.12)' : 'rgba(108,92,231,0.08)',
    borderWidth: 1,
    borderColor: colors.accentPrimary,
  },
  slotCountText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 11,
    color: colors.accentPrimary,
  },
  moduleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 16,
  },
  moduleTile: {
    width: (width - 24 - 12) / 3,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderRadius: RADIUS.md,
    backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#FFFFFF',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  moduleTileSelected: {
    borderColor: colors.accentPrimary,
    backgroundColor: isDark ? (colors.surfaceRaised || '#181628') : '#F5F3FF',
    borderWidth: 1.5,
  },
  moduleTileLabel: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 11,
    color: colors.textPrimary,
    marginTop: 4,
    textAlign: 'center',
  },
  moduleTileBadge: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.accentPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moduleTileBadgeText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 8.5,
    color: isDark ? '#000000' : '#FFFFFF',
  },

  // Live Dock Preview Bar
  dockPreviewWrapper: {
    marginBottom: 20,
    padding: 10,
    borderRadius: RADIUS.lg,
    backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
  },
  dockPreviewLabel: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 9,
    letterSpacing: 1,
    color: colors.textMuted,
    marginBottom: 8,
    textAlign: 'center',
  },
  dockPreviewBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    height: 44,
    borderRadius: RADIUS.md,
    backgroundColor: isDark ? '#0D0B14' : '#F0EEF8',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
    paddingHorizontal: 4,
  },
  dockPreviewItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dockPreviewItemText: {
    fontSize: 8.5,
    fontFamily: FONT_FAMILY.medium,
    color: colors.textMuted,
    marginTop: 2,
  },

  // Step 3: Genesis Card & Floating Seeker Mascot
  voicePill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(165,153,255,0.3)' : 'rgba(108,92,231,0.25)',
    backgroundColor: isDark ? 'rgba(165,153,255,0.1)' : 'rgba(108,92,231,0.06)',
    alignSelf: 'center',
    marginBottom: 16,
  },
  voicePillText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 12,
    color: colors.accentPrimary,
  },
  genesisCard: {
    padding: 18,
    borderRadius: RADIUS.xl,
    backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#FFFFFF',
    borderWidth: 1.5,
    borderColor: isDark ? 'rgba(165,153,255,0.25)' : 'rgba(108,92,231,0.2)',
    alignItems: 'center',
    marginBottom: 20,
  },
  mascotWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  seekerMascotOrb: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: isDark ? 'rgba(52,211,153,0.12)' : 'rgba(16,185,129,0.08)',
    borderWidth: 1.5,
    borderColor: isDark ? 'rgba(52,211,153,0.35)' : 'rgba(16,185,129,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#34d399',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 8,
  },
  mascotGroundShadow: {
    width: 32,
    height: 4,
    borderRadius: 2,
    backgroundColor: isDark ? 'rgba(52,211,153,0.22)' : 'rgba(0,0,0,0.08)',
    marginTop: 6,
  },
  rankPill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
    backgroundColor: isDark ? 'rgba(52,211,153,0.15)' : 'rgba(16,185,129,0.1)',
    borderWidth: 1,
    borderColor: '#34d399',
    marginBottom: 4,
  },
  rankPillText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 10,
    letterSpacing: 0.8,
    color: '#34d399',
  },
  realmSubText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 11,
    color: colors.textMuted,
    marginBottom: 8,
  },
  genesisRewardText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 22,
    letterSpacing: 0.5,
    color: isDark ? '#FFD60A' : '#D97706',
    marginBottom: 12,
  },
  xpProgressWrapper: {
    width: '100%',
    marginBottom: 14,
  },
  xpProgressBg: {
    height: 6,
    borderRadius: 3,
    backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
    overflow: 'hidden',
    marginBottom: 6,
  },
  xpProgressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: colors.accentPrimary,
  },
  xpProgressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  xpProgressText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 10.5,
    color: colors.accentPrimary,
  },
  xpNextLevelText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 10.5,
    color: colors.textMuted,
  },
  genesisDivider: {
    width: '100%',
    height: 1,
    backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
    marginBottom: 12,
  },
  genesisSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 10,
  },
  genesisSummaryLabel: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 12,
    color: colors.textMuted,
  },
  genesisSummaryVal: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 12,
    color: colors.textPrimary,
  },
  pillarChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    width: '100%',
    justifyContent: 'center',
  },
  pillarChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    backgroundColor: isDark ? 'rgba(165,153,255,0.1)' : 'rgba(108,92,231,0.08)',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(165,153,255,0.2)' : 'rgba(108,92,231,0.15)',
  },
  pillarChipText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 10.5,
    color: colors.accentPrimary,
  },
  genesisHeadline: {
    fontFamily: 'PlayfairDisplay_600SemiBold',
    fontSize: 22,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 4,
  },
  genesisSub: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 17,
    marginBottom: 24,
  },

  // Primary Button
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 50,
    borderRadius: RADIUS.full,
    backgroundColor: colors.accentPrimary,
    marginTop: 'auto',
  },
  primaryBtnText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 14,
    color: isDark ? '#000000' : '#FFFFFF',
  },

  // Footer Row
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  backBtnText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 12,
    color: colors.textSecondary,
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)',
  },
  dotActive: {
    width: 18,
    backgroundColor: colors.accentPrimary,
  },
});
