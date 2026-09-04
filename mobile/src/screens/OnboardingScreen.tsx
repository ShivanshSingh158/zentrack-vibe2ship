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
  Dimensions, ScrollView, Platform, DeviceEventEmitter
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { DynamicCalendarIcon } from '../components/ui/DynamicCalendarIcon';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, setDoc } from 'firebase/firestore';
import { db, auth } from '../services/firebase';
import { awardXP, getXP, getLevel, XPState, XP_SOURCES } from '../services/xpSystem';
import { MASCOT_IMAGES, getGradientForLevel } from '../components/Dashboard/mascotConstants';
import { requestNotificationPermissions } from '../services/notifications';
import * as Notifications from 'expo-notifications';
import Reanimated, {
  FadeIn, FadeOut,
  SlideInRight, SlideOutLeft,
  SlideInLeft, SlideOutRight,
  Layout
} from 'react-native-reanimated';

// Fonts & Theme
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { PlayfairDisplay_600SemiBold, PlayfairDisplay_600SemiBold_Italic } from '@expo-google-fonts/playfair-display';
import { useTheme } from '../contexts/ThemeContext';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS, SHADOW } from '../theme/tokens';
import { updateL1Cache, getBootManifestSync } from '../utils/bootManifest';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export const ONBOARDING_KEY = 'zentrack_onboarded_v2';

// ── Archetypes & Personas ───────────────────────────────────────────────────
interface PersonaConfig {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  tagline: string;
  defaultModules: string[];
}

const PERSONAS: PersonaConfig[] = [
  {
    id: 'scholar',
    label: 'The Scholar',
    icon: 'school-outline',
    tagline: 'Attendance, timetable, grades & study goals',
    defaultModules: ['Tasks', 'Attendance', 'Calendar', 'Notes'],
  },
  {
    id: 'builder',
    label: 'The Builder',
    icon: 'flash-outline',
    tagline: 'Deep work, habit streaks & daily execution',
    defaultModules: ['Tasks', 'Habits', 'Learning', 'Notes'],
  },
  {
    id: 'athlete',
    label: 'The Athlete',
    icon: 'barbell-outline',
    tagline: 'PPL workouts, progressive overload & rest',
    defaultModules: ['Gym', 'Habits', 'Tasks', 'Calendar'],
  },
  {
    id: 'allrounder',
    label: 'The All-Rounder',
    icon: 'infinite-outline',
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
  { id: 'Assignments', name: 'Assign',     activeIcon: 'clipboard',        inactiveIcon: 'clipboard-outline',        desc: 'Coursework & Deadlines' },
  { id: 'Habits',      name: 'Habits',     activeIcon: 'flame',            inactiveIcon: 'flame-outline',            desc: 'Dopamine Streaks' },
  { id: 'Calendar',    name: 'Calendar',   activeIcon: 'calendar-clear',   inactiveIcon: 'calendar-clear-outline',   desc: 'Unified Agenda' },
  { id: 'Notes',       name: 'Notes',      activeIcon: 'document-text',    inactiveIcon: 'document-text-outline',    desc: 'Markdown & AI Notes' },
  { id: 'Learning',    name: 'Learn',      activeIcon: 'library',          inactiveIcon: 'library-outline',          desc: 'Video Lectures & MindMap' },
  { id: 'Analytics',   name: 'Stats',      activeIcon: 'bar-chart',        inactiveIcon: 'bar-chart-outline',        desc: 'XP & Discipline Radar' },
];

export default function OnboardingScreen({ onComplete }: { onComplete: () => void }) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
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
  const [saving, setSaving] = useState(false);

  if (!fontsLoaded) return <View style={[styles.root, { backgroundColor: colors.background }]} />;

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
              body: "+500 XP awarded. Your custom Life OS is online.",
              sound: true,
            },
            trigger: null,
          });
        }
      }).catch(() => {});

      // Persist chosen 4 pinned modules to L1 & AsyncStorage
      const finalPinned = pinnedModules.length > 0 ? pinnedModules.slice(0, 4) : ['Tasks', 'Gym', 'Calendar', 'Attendance'];
      updateL1Cache('pinnedModules', finalPinned);
      await AsyncStorage.setItem('@zentrack_pinned_modules', JSON.stringify(finalPinned));
      await AsyncStorage.multiSet([
        ['@zentrack_onboarding_completed', 'true'],
        [ONBOARDING_KEY, 'true'],
      ]);

      // Emit event so CoreDataContext and TabNavigator update immediately in memory
      DeviceEventEmitter.emit('pinned_modules_changed', finalPinned);

      // Save identity & pinned modules to Firestore in background
      if (uid) {
        setDoc(doc(db, 'users', uid, 'profile', 'identity'), {
          persona: selectedPersona,
          pinnedModules: finalPinned,
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

  const getStepSubtitle = () => {
    if (step === 0) return '01 / archetype';
    if (step === 1) return '02 / dock';
    return '03 / genesis';
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
    <SafeAreaView style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        
        {/* ── Top Header (Matching LandingScreen & AuthScreen) ─────────── */}
        <View style={styles.topHeader}>
          <Text style={[styles.brand, { color: colors.textPrimary }]}>ZENTRACK</Text>
          <Reanimated.Text
            key={step}
            entering={FadeIn.duration(200)}
            exiting={FadeOut.duration(150)}
            style={[styles.step, { color: colors.textMuted }]}
          >
            {getStepSubtitle()}
          </Reanimated.Text>
        </View>

        {/* ── Main Animated Content Slide ────────────────────────────── */}
        <View style={styles.sliderContainer}>
          <Reanimated.View
            key={`step-${step}`}
            entering={
              direction === 'forward'
                ? SlideInRight.duration(260)
                : SlideInLeft.duration(260)
            }
            exiting={
              direction === 'forward'
                ? SlideOutLeft.duration(180)
                : SlideOutRight.duration(180)
            }
            style={styles.stepContainer}
          >
            {renderStep()}
          </Reanimated.View>
        </View>

        {/* ── Footer Navigation & Pagination Dots ─────────────────────── */}
        <View style={styles.footerRow}>
          {step > 0 ? (
            <TouchableOpacity onPress={prev} style={styles.backBtn} activeOpacity={0.7} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="arrow-back" size={15} color={colors.textSecondary} />
              <Text style={[styles.backBtnText, { color: colors.textSecondary }]}>Back</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ width: 50 }} />
          )}

          <View style={styles.dots}>
            {[0, 1, 2].map(i => (
              <View
                key={i}
                style={[
                  styles.dot,
                  {
                    backgroundColor: i === step
                      ? (isDark ? '#FFFFFF' : '#0A0A0E')
                      : (isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.15)'),
                    width: i === step ? 16 : 4.5,
                  },
                ]}
              />
            ))}
          </View>

          <View style={{ width: 50 }} />
        </View>

      </View>
    </SafeAreaView>
  );
}

// ─── Step 1: Persona Selection ────────────────────────────────────────────────
function StepPersona({ selected, onSelect, onNext, styles, colors, isDark }: any) {
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollStep} showsVerticalScrollIndicator={false}>
      <View style={styles.heroTextContainer}>
        <Text style={[styles.heroTitleSerif, { color: colors.textPrimary }]}>Who are you</Text>
        <Text style={[styles.heroTitleItalic, { color: colors.accentPrimary }]}>building in 90 days?</Text>
      </View>
      <Text style={[styles.subText, { color: colors.textSecondary }]}>
        Select your primary archetype to calibrate your daily operating system.
      </Text>

      <View style={styles.personaList}>
        {PERSONAS.map(p => {
          const active = selected === p.id;
          return (
            <TouchableOpacity
              key={p.id}
              onPress={() => onSelect(p)}
              activeOpacity={0.84}
              style={[
                styles.personaRow,
                {
                  borderColor: active
                    ? colors.accentPrimary
                    : isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
                  backgroundColor: active
                    ? isDark ? 'rgba(165,153,255,0.08)' : 'rgba(108,92,231,0.06)'
                    : isDark ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.02)',
                },
              ]}
            >
              <View style={[
                styles.personaIconWrap,
                {
                  backgroundColor: active
                    ? isDark ? 'rgba(165,153,255,0.18)' : 'rgba(108,92,231,0.12)'
                    : isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
                }
              ]}>
                <Ionicons
                  name={p.icon}
                  size={19}
                  color={active ? colors.accentPrimary : colors.textSecondary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.personaTitle, { color: active ? colors.accentPrimary : colors.textPrimary }]}>
                  {p.label}
                </Text>
                <Text style={[styles.personaTagline, { color: colors.textMuted }]}>{p.tagline}</Text>
              </View>
              {active && (
                <View style={[styles.activeCheckCircle, { backgroundColor: colors.accentPrimary }]}>
                  <Ionicons name="checkmark" size={11} color={isDark ? '#000000' : '#FFFFFF'} />
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity
        style={[
          styles.primaryBtn,
          {
            backgroundColor: isDark ? '#FFFFFF' : '#0A0A0E',
            borderColor: isDark ? '#FFFFFF' : '#0A0A0E',
          }
        ]}
        onPress={onNext}
        activeOpacity={0.88}
      >
        <Text style={[styles.primaryBtnText, { color: isDark ? '#0A0A0E' : '#FFFFFF' }]}>
          Continue to Dock  →
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ─── Authentic Navigation Icon Resolver ──────────────────────────────────────
const renderModuleNavIcon = (modId: string, isSelected: boolean, color: string, size = 20) => {
  if (modId === 'Calendar') {
    return <DynamicCalendarIcon size={size} color={color} isFilled={isSelected} />;
  }
  if (modId === 'Gym') {
    return (
      <MaterialCommunityIcons
        name={isSelected ? 'arm-flex' : 'arm-flex-outline'}
        size={size}
        color={color}
      />
    );
  }
  if (modId === 'Attendance') {
    return (
      <Ionicons
        name={isSelected ? 'id-card' : 'id-card-outline'}
        size={size}
        color={color}
      />
    );
  }
  if (modId === 'Notes') {
    return (
      <Ionicons
        name={isSelected ? 'folder' : 'folder-outline'}
        size={size}
        color={color}
      />
    );
  }
  if (modId === 'Habits') {
    return (
      <Ionicons
        name={isSelected ? 'sync' : 'sync-outline'}
        size={size}
        color={color}
      />
    );
  }
  if (modId === 'Tasks') {
    return (
      <Ionicons
        name={isSelected ? 'checkmark-circle' : 'checkmark-circle-outline'}
        size={size}
        color={color}
      />
    );
  }
  if (modId === 'Assignments') {
    return (
      <Ionicons
        name={isSelected ? 'clipboard' : 'clipboard-outline'}
        size={size}
        color={color}
      />
    );
  }
  if (modId === 'Learning') {
    return (
      <Ionicons
        name={isSelected ? 'library' : 'library-outline'}
        size={size}
        color={color}
      />
    );
  }
  if (modId === 'Analytics') {
    return (
      <Ionicons
        name={isSelected ? 'bar-chart' : 'bar-chart-outline'}
        size={size}
        color={color}
      />
    );
  }
  return <Ionicons name="ellipse" size={size} color={color} />;
};

// ─── Step 2: Focus Matrix & LIVE DOCK PREVIEW ─────────────────────────────────
function StepFocusMatrix({ pinned, onToggle, onNext, styles, colors, isDark }: any) {
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollStep} showsVerticalScrollIndicator={false}>
      <View style={styles.heroTextContainer}>
        <Text style={[styles.heroTitleSerif, { color: colors.textPrimary }]}>Choose your 4</Text>
        <Text style={[styles.heroTitleItalic, { color: colors.accentPrimary }]}>core pillars.</Text>
      </View>
      <Text style={[styles.subText, { color: colors.textSecondary }]}>
        Tap to customize your 4 bottom dock shortcuts. Changes reflect below in real time.
      </Text>

      {/* 3x3 Module Grid */}
      <View style={styles.moduleGrid}>
        {MODULE_CATALOG.map(mod => {
          const isSelected = pinned.includes(mod.id);
          const iconColor = isSelected ? colors.accentPrimary : colors.textSecondary;
          return (
            <TouchableOpacity
              key={mod.id}
              onPress={() => onToggle(mod.id)}
              activeOpacity={0.75}
              style={[
                styles.moduleTile,
                {
                  borderColor: isSelected
                    ? colors.accentPrimary
                    : isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
                  backgroundColor: isSelected
                    ? isDark ? 'rgba(165,153,255,0.08)' : 'rgba(108,92,231,0.06)'
                    : isDark ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.02)',
                }
              ]}
            >
              <View style={{ height: 24, alignItems: 'center', justifyContent: 'center' }}>
                {renderModuleNavIcon(mod.id, isSelected, iconColor, 21)}
              </View>
              <Text style={[styles.moduleTileLabel, { color: isSelected ? colors.accentPrimary : colors.textPrimary }]}>
                {mod.name}
              </Text>
              {isSelected && (
                <View style={[styles.moduleTileBadge, { backgroundColor: colors.accentPrimary }]}>
                  <Text style={[styles.moduleTileBadgeText, { color: isDark ? '#000000' : '#FFFFFF' }]}>
                    {pinned.indexOf(mod.id) + 1}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── LIVE MORPHING DOCK PREVIEW ── */}
      <View style={[styles.dockPreviewWrapper, { borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)', backgroundColor: isDark ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.02)' }]}>
        <Text style={[styles.dockPreviewLabel, { color: colors.textMuted }]}>LIVE BOTTOM DOCK PREVIEW</Text>
        <View style={[styles.dockPreviewBar, { backgroundColor: isDark ? '#000000' : '#F1F1F5', borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)' }]}>
          {/* Permanent Home */}
          <View style={styles.dockPreviewItem}>
            <Ionicons name="home" size={16} color={colors.textMuted} />
            <Text style={[styles.dockPreviewItemText, { color: colors.textMuted }]}>Home</Text>
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
                <View style={{ height: 18, alignItems: 'center', justifyContent: 'center' }}>
                  {renderModuleNavIcon(modId, true, colors.accentPrimary, 16)}
                </View>
                <Text style={[styles.dockPreviewItemText, { color: colors.accentPrimary, fontFamily: FONT_FAMILY.bold }]}>
                  {modObj.name}
                </Text>
              </Reanimated.View>
            );
          })}

          {/* Permanent More */}
          <View style={styles.dockPreviewItem}>
            <Ionicons name="apps" size={16} color={colors.textMuted} />
            <Text style={[styles.dockPreviewItemText, { color: colors.textMuted }]}>More</Text>
          </View>
        </View>
      </View>

      <TouchableOpacity
        style={[
          styles.primaryBtn,
          {
            backgroundColor: isDark ? '#FFFFFF' : '#0A0A0E',
            borderColor: isDark ? '#FFFFFF' : '#0A0A0E',
            opacity: pinned.length < 4 ? 0.85 : 1,
          }
        ]}
        onPress={onNext}
        activeOpacity={0.88}
      >
        <Text style={[styles.primaryBtnText, { color: isDark ? '#0A0A0E' : '#FFFFFF' }]}>
          Confirm Dock ({pinned.length}/4)  →
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ─── Mascot Asset Catalog ───────────────────────────────────────────────────
const getMascotForLevel = (title: string) => {
  return MASCOT_IMAGES[title] || MASCOT_IMAGES['Seeker'];
};

// ─── Step 3: Genesis XP & Mascot Launch ───────────────────────────────────────
function StepGenesisLaunch({ persona, pinned, saving, onLaunch, styles, colors, isDark }: any) {
  const personaObj = PERSONAS.find(p => p.id === persona);

  // Live user XP & Level state (instant synchronous L1 cache read, background getXP verification)
  const [xpState, setXpState] = useState<XPState>(() => {
    const cachedXP = getBootManifestSync()?.xp;
    return getLevel(cachedXP ?? 0);
  });

  useEffect(() => {
    getXP().then(xp => {
      setXpState(getLevel(xp));
    }).catch(() => {});
  }, []);

  // Dynamic rank palette matching user level
  const rankColors = useMemo(() => getGradientForLevel(xpState.title), [xpState.title]);

  // Floating Seeker Mascot Physics
  const floatAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const float = Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, { toValue: -10, duration: 2200, useNativeDriver: true }),
        Animated.timing(floatAnim, { toValue: 0, duration: 2200, useNativeDriver: true }),
      ])
    );
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.05, duration: 2200, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1.0, duration: 2200, useNativeDriver: true }),
      ])
    );
    float.start();
    pulse.start();
    return () => {
      float.stop();
      pulse.stop();
    };
  }, [floatAnim, pulseAnim]);

  const mascotSource = getMascotForLevel(xpState.title);

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'space-between', paddingBottom: 4 }}
        showsVerticalScrollIndicator={false}
      >
        <View>
          <View style={styles.heroTextContainer}>
            <Text style={[styles.heroTitleSerif, { color: colors.textPrimary }]}>Genesis calibration</Text>
            <Text style={[styles.heroTitleItalic, { color: colors.accentPrimary }]}>complete.</Text>
          </View>
          <Text style={[styles.subText, { color: colors.textSecondary }]}>
            Your customized archetype and navigation matrix are loaded. Welcome to ZenTrack.
          </Text>

          {/* Floating Large Animated Mascot Hero */}
          <View style={styles.mascotDisplayContainer}>
            <Animated.Image
              source={mascotSource}
              blurRadius={Platform.OS === 'ios' ? 14 : 8}
              style={[
                styles.mascotAuraImage,
                {
                  tintColor: rankColors[0],
                  transform: [
                    { translateY: floatAnim },
                    { scale: pulseAnim }
                  ]
                }
              ]}
              resizeMode="contain"
            />
            <Animated.Image
              source={mascotSource}
              style={[
                styles.mascotHeroImage,
                {
                  transform: [
                    { translateY: floatAnim },
                    { scale: pulseAnim }
                  ]
                }
              ]}
              resizeMode="contain"
            />
          </View>

          {/* Genesis Initiation Spec Card */}
          <View style={[styles.genesisCard, { borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)', backgroundColor: isDark ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.02)' }]}>
            <View style={styles.genesisBadgeRow}>
              <View style={[styles.rankPill, { backgroundColor: isDark ? `${rankColors[0]}22` : `${rankColors[0]}15`, borderColor: rankColors[0] }]}>
                <Text style={[styles.rankPillText, { color: rankColors[0] }]}>⭐ {xpState.title.toUpperCase()} · LEVEL {xpState.level}</Text>
              </View>
              <Text style={[styles.genesisRewardText, { color: isDark ? '#FFD60A' : '#D97706' }]}>
                +{XP_SOURCES.ONBOARDING.base} XP
              </Text>
            </View>

            {/* Level XP Progress Meter */}
            <View style={styles.xpProgressWrapper}>
              <View style={[styles.xpProgressBg, { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }]}>
                <View
                  style={[
                    styles.xpProgressFill,
                    {
                      width: `${Math.max(10, Math.min(100, Math.round(xpState.progress * 100)))}%`,
                      backgroundColor: rankColors[0],
                    }
                  ]}
                />
              </View>
              <View style={styles.xpProgressLabels}>
                <Text style={[styles.xpProgressText, { color: rankColors[0] }]}>
                  {xpState.xp} XP (Active)
                </Text>
                <Text style={[styles.xpNextLevelText, { color: colors.textMuted }]}>
                  Next: {xpState.nextThreshold} XP
                </Text>
              </View>
            </View>

            <View style={styles.genesisConfigRows}>
              <View style={styles.configItem}>
                <Text style={[styles.configItemLabel, { color: colors.textMuted }]}>Archetype Profile</Text>
                <Text style={[styles.configItemValue, { color: colors.textPrimary }]}>{personaObj?.label}</Text>
              </View>
              <View style={[styles.configDivider, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }]} />
              
              <View style={styles.configColumnItem}>
                <Text style={[styles.configItemLabel, { color: colors.textMuted, marginBottom: 6 }]}>Pinned Dock (4 Pillars)</Text>
                <View style={styles.pinnedPillsWrap}>
                  {pinned.slice(0, 4).map((modId: string) => {
                    const shortLabel = modId === 'Assignments' ? 'Assign' : modId === 'Attendance' ? 'Attend' : modId;
                    return (
                      <View
                        key={modId}
                        style={[
                          styles.pinnedMicroPill,
                          {
                            backgroundColor: isDark ? 'rgba(165,153,255,0.08)' : 'rgba(108,92,231,0.06)',
                            borderColor: isDark ? 'rgba(165,153,255,0.28)' : 'rgba(108,92,231,0.2)',
                          }
                        ]}
                      >
                        <View style={{ marginRight: 3 }}>
                          {renderModuleNavIcon(modId, true, colors.accentPrimary, 12)}
                        </View>
                        <Text
                          numberOfLines={1}
                          ellipsizeMode="tail"
                          style={[styles.pinnedMicroPillText, { color: colors.accentPrimary }]}
                        >
                          {shortLabel}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>
              <View style={[styles.configDivider, { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }]} />

              <View style={styles.configItem}>
                <Text style={[styles.configItemLabel, { color: colors.textMuted }]}>Storage Architecture</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#34d399' }} />
                  <Text style={[styles.configItemValue, { color: '#34d399' }]}>100% Local-First Sync</Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={[
            styles.primaryBtn,
            {
              backgroundColor: isDark ? '#FFFFFF' : '#0A0A0E',
              borderColor: isDark ? '#FFFFFF' : '#0A0A0E',
              marginTop: 10,
            },
            saving && { opacity: 0.6 }
          ]}
          onPress={onLaunch}
          disabled={saving}
          activeOpacity={0.88}
        >
          <Text style={[styles.primaryBtnText, { color: isDark ? '#0A0A0E' : '#FFFFFF' }]}>
            {saving ? 'Initializing...' : 'Initialize Life OS  →'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const makeStyles = (colors: any, isDark: boolean = true) => StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 5,
    justifyContent: 'space-between',
    paddingTop: 8,
    paddingBottom: 16,
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
  sliderContainer: {
    flex: 1,
    overflow: 'hidden',
    marginTop: 6,
  },
  stepContainer: {
    flex: 1,
    paddingHorizontal: 4,
  },
  scrollStep: {
    paddingBottom: 16,
  },
  heroTextContainer: {
    marginBottom: 4,
  },
  heroTitleSerif: {
    fontFamily: 'PlayfairDisplay_600SemiBold',
    fontSize: 34,
    lineHeight: 40,
    paddingLeft: 4,
  },
  heroTitleItalic: {
    fontFamily: 'PlayfairDisplay_600SemiBold_Italic',
    fontSize: 38,
    lineHeight: 44,
    paddingLeft: 4,
    paddingRight: 16,
    paddingVertical: 1,
  },
  subText: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 10,
    paddingHorizontal: 4,
  },

  // Step 1: Sleek Persona List
  personaList: {
    gap: 8,
    marginBottom: 20,
  },
  personaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
  },
  personaIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeCheckCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  personaTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 14.5,
  },
  personaTagline: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 11.5,
    marginTop: 2,
  },

  // Step 2: Module Grid
  moduleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 14,
  },
  moduleTile: {
    width: '31.8%',
    paddingVertical: 10,
    paddingHorizontal: 2,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moduleTileLabel: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 10.5,
    marginTop: 3,
    textAlign: 'center',
  },
  moduleTileBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 14,
    height: 14,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moduleTileBadgeText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 8,
  },

  // Live Dock Preview Bar
  dockPreviewWrapper: {
    marginBottom: 18,
    padding: 12,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
  },
  dockPreviewLabel: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 9.5,
    letterSpacing: 1,
    marginBottom: 8,
    textAlign: 'center',
  },
  dockPreviewBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    height: 48,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    paddingHorizontal: 4,
  },
  dockPreviewItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dockPreviewItemText: {
    fontSize: 9,
    fontFamily: FONT_FAMILY.medium,
    marginTop: 2,
  },

  // Step 3: Mascot Display & Genesis Card
  mascotDisplayContainer: {
    width: '100%',
    height: 150,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    position: 'relative',
  },
  mascotAuraImage: {
    position: 'absolute',
    width: 160,
    height: 160,
    opacity: 0.35,
  },
  mascotHeroImage: {
    width: 140,
    height: 140,
  },
  genesisCard: {
    padding: 14,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    marginBottom: 8,
  },
  genesisBadgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  rankPill: {
    paddingHorizontal: 11,
    paddingVertical: 4.5,
    borderRadius: RADIUS.full,
    borderWidth: 1,
  },
  rankPillText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 10,
    letterSpacing: 0.8,
    color: '#34d399',
  },
  genesisRewardText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 18,
    letterSpacing: 0.5,
  },
  xpProgressWrapper: {
    width: '100%',
    marginBottom: 10,
  },
  xpProgressBg: {
    height: 5,
    borderRadius: 2.5,
    overflow: 'hidden',
    marginBottom: 4,
  },
  xpProgressFill: {
    height: '100%',
    borderRadius: 2.5,
  },
  xpProgressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  xpProgressText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 10,
  },
  xpNextLevelText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 10,
  },
  genesisConfigRows: {
    gap: 7,
  },
  configItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 3.5,
  },
  configColumnItem: {
    paddingVertical: 3.5,
  },
  configItemLabel: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 12,
  },
  configItemValue: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 12.5,
  },
  pinnedPillsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 5,
    marginTop: 2,
  },
  pinnedMicroPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
    paddingVertical: 5,
    borderRadius: RADIUS.md,
    borderWidth: 1,
  },
  pinnedMicroPillText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 9.5,
  },
  configDivider: {
    height: StyleSheet.hairlineWidth,
    width: '100%',
  },

  // Primary Button
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADIUS.lg,
    paddingVertical: 14,
    width: '100%',
    borderWidth: 1,
    marginBottom: 6,
    ...SHADOW.sm,
  },
  primaryBtnText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 15.5,
    letterSpacing: 0.2,
  },

  // Footer Row
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 6,
  },
  backBtnText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 12,
  },
  dots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  dot: {
    height: 3.5,
    borderRadius: 2,
  },
});
