/**
 * OnboardingScreen — ZenTrack Mobile
 * Editorial Dual-Theme Design (Obsidian Cosmos Dark / Frost Quartz Light)
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

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated,
  Dimensions, ScrollView, Platform
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
import Reanimated, { FadeIn, FadeOut, Layout } from 'react-native-reanimated';

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
    tagline: 'Master exams, attendance & study goals',
    defaultModules: ['Tasks', 'Attendance', 'Calendar', 'Notes'],
  },
  {
    id: 'builder',
    label: 'The Builder',
    icon: '⚡',
    tagline: 'Ship projects, build habits & learn daily',
    defaultModules: ['Tasks', 'Habits', 'Learning', 'Notes'],
  },
  {
    id: 'athlete',
    label: 'The Athlete',
    icon: '🏋️',
    tagline: 'Crush PPL gym workouts & recovery',
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
  category: 'core' | 'fitness' | 'academic' | 'creative';
}

export const MODULE_CATALOG: ModuleItem[] = [
  { id: 'Tasks',       name: 'Tasks',      activeIcon: 'checkmark-circle', inactiveIcon: 'checkmark-circle-outline', desc: 'Eisenhower & 24h Timeline', category: 'core' },
  { id: 'Gym',         name: 'Gym',        activeIcon: 'barbell',          inactiveIcon: 'barbell-outline',          desc: 'PPL & Progressive Overload',category: 'fitness' },
  { id: 'Attendance',  name: 'Attend',     activeIcon: 'id-card',          inactiveIcon: 'id-card-outline',          desc: 'Timetable & Bunk Safety',  category: 'academic' },
  { id: 'Habits',      name: 'Habits',     activeIcon: 'flame',            inactiveIcon: 'flame-outline',            desc: 'Dopamine Streaks',         category: 'core' },
  { id: 'Calendar',    name: 'Calendar',   activeIcon: 'calendar-clear',   inactiveIcon: 'calendar-clear-outline',   desc: 'Unified Agenda Matrix',    category: 'core' },
  { id: 'Notes',       name: 'Notes',      activeIcon: 'document-text',    inactiveIcon: 'document-text-outline',    desc: 'Markdown & AI Co-Writer',  category: 'creative' },
  { id: 'Learning',    name: 'Learn',      activeIcon: 'library',          inactiveIcon: 'library-outline',          desc: 'Lecture Summaries & Maps', category: 'creative' },
  { id: 'Grades',      name: 'Grades',     activeIcon: 'calculator',       inactiveIcon: 'calculator-outline',       desc: 'SGPA & CGPA Projections',  category: 'academic' },
  { id: 'Analytics',   name: 'Stats',      activeIcon: 'bar-chart',        inactiveIcon: 'bar-chart-outline',        desc: 'Productivity & XP Radar',  category: 'core' },
];

// ── SARA AI Coaching Modes ──────────────────────────────────────────────────
const SARA_COACHES = [
  { id: 'discipline', label: 'Discipline Coach', icon: '🎯', desc: 'Direct, concise, and focused on keeping your streaks and workouts alive.' },
  { id: 'strategist', label: 'Calm Strategist',  icon: '🧘', desc: 'Thoughtful, balanced, and focused on sustainable recovery and deep work.' },
  { id: 'highoutput', label: 'High-Output Copilot', icon: '⚡', desc: 'Fast, data-driven, and proactive with calendar conflicts and exam prep.' },
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

  // Flow State
  const [step, setStep] = useState(0);
  const [selectedPersona, setPersona] = useState<string>('allrounder');
  const [pinnedModules, setPinned] = useState<string[]>(['Tasks', 'Gym', 'Calendar', 'Attendance']);
  const [saraCoach, setSaraCoach] = useState<string>('discipline');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [saving, setSaving] = useState(false);

  // Transitions
  const stepFade = useRef(new Animated.Value(0)).current;
  const stepSlide = useRef(new Animated.Value(20)).current;

  const animateIn = useCallback(() => {
    stepFade.setValue(0);
    stepSlide.setValue(20);
    Animated.parallel([
      Animated.timing(stepFade,  { toValue: 1, duration: 380, useNativeDriver: true }),
      Animated.spring(stepSlide, { toValue: 0, tension: 65, friction: 11, useNativeDriver: true }),
    ]).start();
  }, [stepFade, stepSlide]);

  useEffect(() => {
    if (fontsLoaded) {
      animateIn();
    }
  }, [step, fontsLoaded, animateIn]);

  // Clean up speech on unmount
  useEffect(() => {
    return () => {
      Speech.stop().catch(() => {});
    };
  }, []);

  if (!fontsLoaded) return <View style={styles.root} />;

  const next = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setStep(s => s + 1);
  };

  const prev = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setStep(s => Math.max(0, s - 1));
  };

  // Step 1: Select Persona
  const handleSelectPersona = (persona: PersonaConfig) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPersona(persona.id);
    setPinned(persona.defaultModules);
  };

  // Step 2: Toggle Module in 4-Slot Dock
  const handleToggleModule = (moduleId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPinned(prev => {
      if (prev.includes(moduleId)) {
        if (prev.length <= 1) return prev; // Keep at least 1
        return prev.filter(id => id !== moduleId);
      } else {
        if (prev.length >= 4) {
          // Replace last one if 4 are already selected
          return [...prev.slice(1), moduleId];
        }
        return [...prev, moduleId];
      }
    });
  };

  // Step 3: Test SARA Voice
  const handleVoicePreview = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsSpeaking(true);
    const selectedCoach = SARA_COACHES.find(c => c.id === saraCoach);
    const message = selectedCoach?.id === 'discipline'
      ? "I am Sara. Your life operating system is armed. Let's build your streak."
      : selectedCoach?.id === 'strategist'
      ? "Welcome to ZenTrack. I will ensure your balance and focus remain unbreakable."
      : "Sara online. High-output mode active. All systems ready to execute.";

    Speech.speak(message, {
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
      await AsyncStorage.setItem('zentrack_sara_coach_style', saraCoach);

      // Save identity to Firestore in background
      if (uid) {
        setDoc(doc(db, 'users', uid, 'profile', 'identity'), {
          persona: selectedPersona,
          pinnedModules,
          saraCoachStyle: saraCoach,
          onboardedAt: Date.now(),
        }, { merge: true }).catch(() => {});
      }

      // Award +100 Genesis XP
      awardXP('ONBOARDING').catch(() => {});

      // Mark onboarded
      await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
      onComplete();
    } catch (e) {
      console.error('[Onboarding] Error:', e);
      await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
      onComplete();
    }
  };

  // ── Render Step Component ─────────────────────────────────────────────────
  const renderStep = () => {
    switch (step) {
      case 0:
        return <StepWelcome onNext={next} styles={styles} colors={colors} isDark={isDark} />;
      case 1:
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
      case 2:
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
      case 3:
        return (
          <StepSaraAlignment
            selectedCoach={saraCoach}
            onSelectCoach={setSaraCoach}
            onVoicePreview={handleVoicePreview}
            isSpeaking={isSpeaking}
            onNext={next}
            styles={styles}
            colors={colors}
            isDark={isDark}
          />
        );
      case 4:
        return (
          <StepGenesisLaunch
            persona={selectedPersona}
            pinned={pinnedModules}
            saving={saving}
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
        <Text style={styles.globalStep}>
          {step === 0 ? 'GENESIS' : `0${step} / 04`}
        </Text>
      </View>

      {/* Main Animated View */}
      <Animated.View style={[styles.stepContainer, { opacity: stepFade, transform: [{ translateY: stepSlide }] }]}>
        {renderStep()}
      </Animated.View>

      {/* Footer Nav Bar with Back & Dots */}
      {step > 0 && step < 4 && (
        <View style={styles.footerRow}>
          <TouchableOpacity onPress={prev} style={styles.backBtn} activeOpacity={0.7}>
            <Ionicons name="arrow-back" size={18} color={colors.textSecondary} />
            <Text style={styles.backBtnText}>Back</Text>
          </TouchableOpacity>

          <View style={styles.dots}>
            {[1, 2, 3].map(i => (
              <View key={i} style={[styles.dot, i === step && styles.dotActive]} />
            ))}
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

// ─── Step 0: Welcome Promise ──────────────────────────────────────────────────
function StepWelcome({ onNext, styles, colors, isDark }: any) {
  return (
    <View style={styles.centeredStep}>
      <View style={styles.welcomePill}>
        <Ionicons name="sparkles" size={13} color={colors.accentPrimary} />
        <Text style={styles.welcomePillText}>AUTONOMOUS LIFE OPERATING SYSTEM</Text>
      </View>

      <Text style={styles.titleSerif}>
        Every high achiever{'\n'}
        <Text style={styles.titleSerifItalic}>started here.</Text>
      </Text>

      <Text style={styles.subText}>
        We aren't just tracking your life.{'\n'}
        We're engineering the complete system to compound and upgrade it.
      </Text>

      <View style={styles.featureGrid}>
        <View style={styles.featureItem}>
          <View style={[styles.featureIconBox, { backgroundColor: isDark ? 'rgba(165,153,255,0.12)' : 'rgba(108,92,231,0.08)' }]}>
            <Ionicons name="flash-outline" size={18} color={colors.accentPrimary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.featureTitle}>S.A.R.A Autonomous AI</Text>
            <Text style={styles.featureSub}>Voice agent, schedule management & auto-coaching</Text>
          </View>
        </View>

        <View style={styles.featureItem}>
          <View style={[styles.featureIconBox, { backgroundColor: isDark ? 'rgba(52,199,89,0.12)' : 'rgba(16,185,129,0.08)' }]}>
            <Ionicons name="barbell-outline" size={18} color={colors.accentGreen || '#34C759'} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.featureTitle}>PPL Gym & Strength Engine</Text>
            <Text style={styles.featureSub}>Auto progressive overload & rest timers</Text>
          </View>
        </View>

        <View style={styles.featureItem}>
          <View style={[styles.featureIconBox, { backgroundColor: isDark ? 'rgba(255,149,0,0.12)' : 'rgba(217,119,6,0.08)' }]}>
            <Ionicons name="grid-outline" size={18} color={colors.accentAmber || '#FF9500'} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.featureTitle}>Dynamic Morphing Navigation</Text>
            <Text style={styles.featureSub}>Personalized dock tailored to your exact focus</Text>
          </View>
        </View>
      </View>

      <TouchableOpacity style={styles.primaryBtn} onPress={onNext} activeOpacity={0.85}>
        <Text style={styles.primaryBtnText}>Begin Setup</Text>
        <Ionicons name="arrow-forward" size={16} color={isDark ? '#000000' : '#FFFFFF'} />
      </TouchableOpacity>
    </View>
  );
}

// ─── Step 1: Persona Selection ────────────────────────────────────────────────
function StepPersona({ selected, onSelect, onNext, styles, colors, isDark }: any) {
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollStep} showsVerticalScrollIndicator={false}>
      <Text style={styles.stepIndicator}>STEP 1 OF 3</Text>
      <Text style={styles.titleSerif}>
        Who are you{'\n'}building in 90 days?
      </Text>
      <Text style={styles.subText}>Select your primary archetype. This automatically shapes your bottom dock and recommendations.</Text>

      <View style={styles.personaGrid}>
        {PERSONAS.map(p => {
          const active = selected === p.id;
          return (
            <TouchableOpacity
              key={p.id}
              onPress={() => onSelect(p)}
              activeOpacity={0.8}
              style={[styles.personaCard, active && styles.personaCardActive]}
            >
              <View style={styles.personaHeader}>
                <Text style={styles.personaEmoji}>{p.icon}</Text>
                {active && (
                  <View style={styles.activeCheckCircle}>
                    <Ionicons name="checkmark" size={12} color={isDark ? '#000000' : '#FFFFFF'} />
                  </View>
                )}
              </View>
              <Text style={[styles.personaTitle, active && { color: colors.accentPrimary }]}>{p.label}</Text>
              <Text style={styles.personaTagline}>{p.tagline}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity style={styles.primaryBtn} onPress={onNext} activeOpacity={0.85}>
        <Text style={styles.primaryBtnText}>Continue to Dock Setup</Text>
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
        <Text style={styles.stepIndicator}>STEP 2 OF 3</Text>
        <View style={styles.slotCountBadge}>
          <Text style={styles.slotCountText}>{pinned.length} / 4 Pinned</Text>
        </View>
      </View>

      <Text style={styles.titleSerif}>
        Choose your 4{'\n'}core pillars.
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
            <Ionicons name="home" size={18} color={colors.textMuted} />
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
                entering={FadeIn.duration(200)}
                exiting={FadeOut.duration(150)}
                style={styles.dockPreviewItem}
              >
                <Ionicons name={modObj.activeIcon} size={18} color={colors.accentPrimary} />
                <Text style={[styles.dockPreviewItemText, { color: colors.accentPrimary, fontFamily: FONT_FAMILY.bold }]}>
                  {modObj.name}
                </Text>
              </Reanimated.View>
            );
          })}

          {/* Permanent More */}
          <View style={styles.dockPreviewItem}>
            <Ionicons name="apps" size={18} color={colors.textMuted} />
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

// ─── Step 3: SARA AI Coaching Alignment ───────────────────────────────────────
function StepSaraAlignment({ selectedCoach, onSelectCoach, onVoicePreview, isSpeaking, onNext, styles, colors, isDark }: any) {
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollStep} showsVerticalScrollIndicator={false}>
      <Text style={styles.stepIndicator}>STEP 3 OF 3</Text>
      <Text style={styles.titleSerif}>
        Align your AI copilot,{'\n'}S.A.R.A.
      </Text>
      <Text style={styles.subText}>Choose how SARA coaches and manages your daily schedule.</Text>

      <View style={{ gap: 12, marginBottom: 20 }}>
        {SARA_COACHES.map(c => {
          const active = selectedCoach === c.id;
          return (
            <TouchableOpacity
              key={c.id}
              onPress={() => onSelectCoach(c.id)}
              activeOpacity={0.8}
              style={[styles.coachCard, active && styles.coachCardActive]}
            >
              <View style={styles.coachHeader}>
                <Text style={styles.coachEmoji}>{c.icon}</Text>
                <Text style={[styles.coachTitle, active && { color: colors.accentPrimary }]}>{c.label}</Text>
                {active && (
                  <View style={styles.activeCheckCircle}>
                    <Ionicons name="checkmark" size={12} color={isDark ? '#000000' : '#FFFFFF'} />
                  </View>
                )}
              </View>
              <Text style={styles.coachDesc}>{c.desc}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Voice Audio Preview Button */}
      <TouchableOpacity
        style={[styles.voicePreviewBtn, isSpeaking && { borderColor: colors.accentPrimary }]}
        onPress={onVoicePreview}
        activeOpacity={0.8}
      >
        <Ionicons
          name={isSpeaking ? "volume-high" : "mic-outline"}
          size={18}
          color={colors.accentPrimary}
        />
        <Text style={styles.voicePreviewBtnText}>
          {isSpeaking ? "SARA is speaking..." : "Test SARA's Voice Output"}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.primaryBtn} onPress={onNext} activeOpacity={0.85}>
        <Text style={styles.primaryBtnText}>Review Genesis OS</Text>
        <Ionicons name="arrow-forward" size={16} color={isDark ? '#000000' : '#FFFFFF'} />
      </TouchableOpacity>
    </ScrollView>
  );
}

// ─── Step 4: Genesis XP & Launch ──────────────────────────────────────────────
function StepGenesisLaunch({ persona, pinned, saving, onLaunch, styles, colors, isDark }: any) {
  const personaObj = PERSONAS.find(p => p.id === persona);

  return (
    <View style={styles.centeredStep}>
      {/* Golden Particle Card */}
      <View style={styles.genesisCard}>
        <View style={styles.genesisStarGlow}>
          <Text style={{ fontSize: 36 }}>⭐</Text>
        </View>

        <Text style={styles.genesisRewardText}>+100 GENESIS XP</Text>
        <Text style={styles.genesisTierText}>Rank: Cosmos Initiate • Level 1</Text>

        <View style={styles.genesisDivider} />

        <View style={styles.genesisSummaryRow}>
          <Text style={styles.genesisSummaryLabel}>Archetype</Text>
          <Text style={styles.genesisSummaryVal}>{personaObj?.label || 'Scholar'}</Text>
        </View>

        <View style={styles.genesisSummaryRow}>
          <Text style={styles.genesisSummaryLabel}>Dock Pillars</Text>
          <Text style={styles.genesisSummaryVal}>{pinned.join(' • ')}</Text>
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
    </View>
  );
}

// ─── Styles & Design System Tokens ────────────────────────────────────────────
const makeStyles = (colors: any, isDark: boolean = true) => StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  globalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 28,
    paddingTop: 12,
    paddingBottom: 16,
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
  stepContainer: {
    flex: 1,
    paddingHorizontal: 24,
  },
  centeredStep: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: 24,
  },
  scrollStep: {
    paddingBottom: 32,
  },

  // Typography
  welcomePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    backgroundColor: isDark ? 'rgba(165,153,255,0.12)' : 'rgba(108,92,231,0.08)',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(165,153,255,0.25)' : 'rgba(108,92,231,0.2)',
    marginBottom: 16,
  },
  welcomePillText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 9.5,
    letterSpacing: 0.8,
    color: colors.accentPrimary,
  },
  stepIndicator: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 10.5,
    letterSpacing: 1.5,
    color: colors.accentPrimary,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  titleSerif: {
    fontFamily: 'PlayfairDisplay_600SemiBold',
    fontSize: 28,
    lineHeight: 34,
    color: colors.textPrimary,
    marginBottom: 8,
  },
  titleSerifItalic: {
    fontFamily: 'PlayfairDisplay_600SemiBold_Italic',
    color: colors.accentPrimary,
  },
  subText: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 19,
    marginBottom: 24,
  },

  // Step 0 Feature Items
  featureGrid: {
    gap: 12,
    marginBottom: 32,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: RADIUS.lg,
    backgroundColor: isDark ? colors.surface : '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.border,
  },
  featureIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 13.5,
    color: colors.textPrimary,
  },
  featureSub: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 11.5,
    color: colors.textMuted,
    marginTop: 2,
  },

  // Step 1 Persona Cards
  personaGrid: {
    gap: 10,
    marginBottom: 24,
  },
  personaCard: {
    padding: 16,
    borderRadius: RADIUS.lg,
    backgroundColor: isDark ? colors.surface : '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.border,
  },
  personaCardActive: {
    borderColor: colors.accentPrimary,
    backgroundColor: isDark ? (colors.surfaceRaised || '#161424') : '#F5F3FF',
    borderWidth: 1.5,
  },
  personaHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  personaEmoji: {
    fontSize: 24,
  },
  activeCheckCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.accentPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  personaTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 15,
    color: colors.textPrimary,
    marginBottom: 3,
  },
  personaTagline: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 12,
    color: colors.textMuted,
    lineHeight: 16,
  },

  // Step 2 Module Grid & Dock Preview
  slotCountBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
    backgroundColor: isDark ? 'rgba(165,153,255,0.15)' : 'rgba(108,92,231,0.1)',
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
    gap: 8,
    marginBottom: 20,
  },
  moduleTile: {
    width: (width - 48 - 16) / 3,
    paddingVertical: 14,
    paddingHorizontal: 6,
    borderRadius: RADIUS.md,
    backgroundColor: isDark ? colors.surface : '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.border,
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
    fontSize: 11.5,
    color: colors.textPrimary,
    marginTop: 6,
    textAlign: 'center',
  },
  moduleTileBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.accentPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moduleTileBadgeText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 9,
    color: isDark ? '#000000' : '#FFFFFF',
  },

  // Live Dock Preview Bar
  dockPreviewWrapper: {
    marginBottom: 24,
    padding: 12,
    borderRadius: RADIUS.lg,
    backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  dockPreviewLabel: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 9.5,
    letterSpacing: 1,
    color: colors.textMuted,
    marginBottom: 10,
    textAlign: 'center',
  },
  dockPreviewBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    height: 48,
    borderRadius: RADIUS.md,
    backgroundColor: isDark ? '#0F0D18' : '#F0EEF8',
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 6,
  },
  dockPreviewItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dockPreviewItemText: {
    fontSize: 9,
    fontFamily: FONT_FAMILY.medium,
    color: colors.textMuted,
    marginTop: 2,
  },

  // Step 3 SARA Coaching Cards
  coachCard: {
    padding: 14,
    borderRadius: RADIUS.lg,
    backgroundColor: isDark ? colors.surface : '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.border,
  },
  coachCardActive: {
    borderColor: colors.accentPrimary,
    backgroundColor: isDark ? (colors.surfaceRaised || '#161424') : '#F5F3FF',
    borderWidth: 1.5,
  },
  coachHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  coachEmoji: {
    fontSize: 18,
  },
  coachTitle: {
    flex: 1,
    fontFamily: FONT_FAMILY.bold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  coachDesc: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 11.5,
    color: colors.textSecondary,
    lineHeight: 16,
    paddingLeft: 26,
  },
  voicePreviewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: isDark ? colors.surface : '#FFFFFF',
    marginBottom: 24,
  },
  voicePreviewBtnText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 12.5,
    color: colors.accentPrimary,
  },

  // Step 4 Genesis Card
  genesisCard: {
    padding: 20,
    borderRadius: RADIUS.xl,
    backgroundColor: isDark ? colors.surface : '#FFFFFF',
    borderWidth: 1.5,
    borderColor: isDark ? 'rgba(255,214,10,0.3)' : 'rgba(217,119,6,0.3)',
    alignItems: 'center',
    marginBottom: 24,
  },
  genesisStarGlow: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: isDark ? 'rgba(255,214,10,0.15)' : 'rgba(255,214,10,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  genesisRewardText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 20,
    letterSpacing: 0.5,
    color: isDark ? '#FFD60A' : '#D97706',
    marginBottom: 4,
  },
  genesisTierText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 14,
  },
  genesisDivider: {
    width: '100%',
    height: 1,
    backgroundColor: colors.border,
    marginBottom: 14,
  },
  genesisSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 6,
  },
  genesisSummaryLabel: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 11.5,
    color: colors.textMuted,
  },
  genesisSummaryVal: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 11.5,
    color: colors.textPrimary,
  },
  genesisHeadline: {
    fontFamily: 'PlayfairDisplay_600SemiBold',
    fontSize: 24,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 6,
  },
  genesisSub: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 12.5,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 28,
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
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  backBtnText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 12.5,
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
    backgroundColor: colors.border,
  },
  dotActive: {
    width: 18,
    backgroundColor: colors.accentPrimary,
  },
});
