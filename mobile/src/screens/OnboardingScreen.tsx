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
import { LinearGradient } from 'expo-linear-gradient';
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
import { FONT_FAMILY, RADIUS, SHADOW } from '../theme/tokens';
import { updateL1Cache, getBootManifestSync } from '../utils/bootManifest';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const HORIZONTAL_MARGIN = 20;

export const ONBOARDING_KEY = 'zentrack_onboarded_v2';

// ── Archetypes & Personas ───────────────────────────────────────────────────
interface PersonaConfig {
  id: string;
  label: string;
  icon: string;
  iconSet?: 'ionicons' | 'mci';
  tagline: string;
  defaultModules: string[];
}

const PERSONAS: PersonaConfig[] = [
  {
    id: 'scholar',
    label: 'The Scholar',
    icon: 'school-outline',
    iconSet: 'ionicons',
    tagline: 'Attendance, timetable, grades & study goals',
    defaultModules: ['Tasks', 'Attendance', 'Calendar', 'Notes'],
  },
  {
    id: 'builder',
    label: 'The Builder',
    icon: 'flash-outline',
    iconSet: 'ionicons',
    tagline: 'Deep work, habit streaks & daily execution',
    defaultModules: ['Tasks', 'Habits', 'Learning', 'Notes'],
  },
  {
    id: 'athlete',
    label: 'The Athlete',
    icon: 'arm-flex',
    iconSet: 'mci',
    tagline: 'PPL workouts, progressive overload & rest',
    defaultModules: ['Gym', 'Habits', 'Tasks', 'Calendar'],
  },
  {
    id: 'allrounder',
    label: 'The All-Rounder',
    icon: 'infinite-outline',
    iconSet: 'ionicons',
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
  { id: 'Habits',      name: 'Habits',     activeIcon: 'sync',             inactiveIcon: 'sync-outline',             desc: 'Dopamine Streaks' },
  { id: 'Calendar',    name: 'Calendar',   activeIcon: 'calendar-clear',   inactiveIcon: 'calendar-clear-outline',   desc: 'Unified Agenda' },
  { id: 'Notes',       name: 'Notes',      activeIcon: 'folder',           inactiveIcon: 'folder-outline',           desc: 'Markdown & AI Notes' },
  { id: 'Learning',    name: 'Learn',      activeIcon: 'library',          inactiveIcon: 'library-outline',          desc: 'Video Lectures & MindMap' },
  { id: 'Analytics',   name: 'Stats',      activeIcon: 'bar-chart',        inactiveIcon: 'bar-chart-outline',        desc: 'XP & Discipline Radar' },
];

// ── Shared Spring CTA Button ────────────────────────────────────────────────
interface SpringButtonProps {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  isDark: boolean;
  loading?: boolean;
  iconName?: keyof typeof Ionicons.glyphMap;
  style?: any;
}

function SpringButton({
  title,
  onPress,
  disabled = false,
  isDark,
  loading = false,
  iconName = 'arrow-forward',
  style,
}: SpringButtonProps) {
  const btnScale = useRef(new Animated.Value(1)).current;

  const pressIn = () => {
    Animated.spring(btnScale, { toValue: 0.97, useNativeDriver: true, tension: 100, friction: 8 }).start();
  };

  const pressOut = () => {
    Animated.spring(btnScale, { toValue: 1, useNativeDriver: true, tension: 100, friction: 8 }).start();
  };

  return (
    <TouchableOpacity
      onPressIn={pressIn}
      onPressOut={pressOut}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      disabled={disabled || loading}
      activeOpacity={0.9}
      style={[styles.btnWrapper, style]}
    >
      <Animated.View
        style={[
          styles.primaryBtn,
          {
            backgroundColor: isDark ? '#FFFFFF' : '#0A0A0E',
            borderColor: isDark ? '#FFFFFF' : '#0A0A0E',
            opacity: disabled ? 0.6 : 1,
            transform: [{ scale: btnScale }],
          },
        ]}
      >
        <Text style={[styles.primaryBtnText, { color: isDark ? '#0A0A0E' : '#FFFFFF' }]}>
          {loading ? 'Initializing...' : title}
        </Text>
        {!loading && (
          <Ionicons
            name={iconName}
            size={16}
            color={isDark ? '#0A0A0E' : '#FFFFFF'}
            style={{ marginLeft: 8 }}
          />
        )}
      </Animated.View>
    </TouchableOpacity>
  );
}

export default function OnboardingScreen({ onComplete }: { onComplete: () => void }) {
  const { colors, isDark } = useTheme();

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
    Haptics.selectionAsync();
    setPersona(persona.id);
    setPinned(persona.defaultModules);
  };

  // Step 1: Toggle Module in 4-Slot Dock
  const handleToggleModule = (moduleId: string) => {
    Haptics.selectionAsync();
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
      {/* Subtle Ambient Cosmic Violet Aura matching LandingScreen */}
      <LinearGradient
        colors={isDark ? ['rgba(165,153,255,0.07)', 'rgba(0,0,0,0)'] : ['rgba(108,92,231,0.05)', 'rgba(255,255,255,0)']}
        style={StyleSheet.absoluteFillObject}
        locations={[0, 0.45]}
        pointerEvents="none"
      />

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

        {/* ── Footer Navigation & Pagination Dots (Centered & Apple-Grade) ─ */}
        <View style={styles.footerRow}>
          {step > 0 ? (
            <TouchableOpacity
              onPress={prev}
              style={styles.backBtn}
              activeOpacity={0.7}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="arrow-back" size={15} color={colors.textSecondary} />
              <Text style={[styles.backBtnText, { color: colors.textSecondary }]}>Back</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.footerPlaceholder} />
          )}

          <View style={styles.paginationRow}>
            {[0, 1, 2].map(i => {
              const isActive = i === step;
              return (
                <View
                  key={i}
                  style={[
                    styles.paginationDot,
                    {
                      backgroundColor: isActive
                        ? (isDark ? '#FFFFFF' : '#0A0A0E')
                        : (isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.14)'),
                      width: isActive ? 20 : 6,
                    },
                  ]}
                />
              );
            })}
          </View>

          <View style={styles.footerPlaceholder} />
        </View>

      </View>
    </SafeAreaView>
  );
}

// ─── Step 1: Persona Selection ────────────────────────────────────────────────
function StepPersona({ selected, onSelect, onNext, colors, isDark }: any) {
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
              activeOpacity={0.85}
              style={[
                styles.personaRow,
                {
                  borderColor: active
                    ? (isDark ? 'rgba(165,153,255,0.38)' : 'rgba(108,92,231,0.32)')
                    : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'),
                  backgroundColor: active
                    ? (isDark ? 'rgba(165,153,255,0.08)' : 'rgba(108,92,231,0.06)')
                    : (isDark ? '#10121A' : '#FFFFFF'),
                },
              ]}
            >
              {/* Apple-style squircle badge container */}
              <View
                style={[
                  styles.personaIconWrap,
                  {
                    backgroundColor: active
                      ? (isDark ? 'rgba(165,153,255,0.18)' : 'rgba(108,92,231,0.12)')
                      : (isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)'),
                    borderColor: active
                      ? (isDark ? 'rgba(165,153,255,0.35)' : 'rgba(108,92,231,0.25)')
                      : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'),
                  },
                ]}
              >
                {p.iconSet === 'mci' ? (
                  <MaterialCommunityIcons
                    name={p.icon as any}
                    size={22}
                    color={active ? colors.accentPrimary : colors.textSecondary}
                  />
                ) : (
                  <Ionicons
                    name={p.icon as any}
                    size={20}
                    color={active ? colors.accentPrimary : colors.textSecondary}
                  />
                )}
              </View>

              <View style={{ flex: 1 }}>
                <Text style={[styles.personaTitle, { color: active ? colors.accentPrimary : colors.textPrimary }]}>
                  {p.label}
                </Text>
                <Text style={[styles.personaTagline, { color: colors.textSecondary }]}>{p.tagline}</Text>
              </View>

              {active ? (
                <View style={[styles.activeCheckCircle, { backgroundColor: colors.accentPrimary }]}>
                  <Ionicons name="checkmark" size={12} color={isDark ? '#0A0A0E' : '#FFFFFF'} />
                </View>
              ) : (
                <View
                  style={[
                    styles.inactiveCheckCircle,
                    { borderColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.12)' }
                  ]}
                />
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      <SpringButton
        title="Continue to Dock"
        onPress={onNext}
        isDark={isDark}
        iconName="arrow-forward"
      />
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
function StepFocusMatrix({ pinned, onToggle, onNext, colors, isDark }: any) {
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
          const orderNum = pinned.indexOf(mod.id) + 1;

          return (
            <TouchableOpacity
              key={mod.id}
              onPress={() => onToggle(mod.id)}
              activeOpacity={0.78}
              style={[
                styles.moduleTile,
                {
                  borderColor: isSelected
                    ? (isDark ? 'rgba(165,153,255,0.38)' : 'rgba(108,92,231,0.32)')
                    : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'),
                  backgroundColor: isSelected
                    ? (isDark ? 'rgba(165,153,255,0.10)' : 'rgba(108,92,231,0.08)')
                    : (isDark ? '#10121A' : '#FFFFFF'),
                }
              ]}
            >
              <View style={styles.moduleIconContainer}>
                {renderModuleNavIcon(mod.id, isSelected, iconColor, 22)}
              </View>
              <Text
                numberOfLines={1}
                style={[
                  styles.moduleTileLabel,
                  { color: isSelected ? colors.accentPrimary : colors.textPrimary }
                ]}
              >
                {mod.name}
              </Text>

              {isSelected && (
                <View style={[styles.moduleTileBadge, { backgroundColor: colors.accentPrimary }]}>
                  <Text style={[styles.moduleTileBadgeText, { color: isDark ? '#0A0A0E' : '#FFFFFF' }]}>
                    {orderNum}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── LIVE MORPHING DOCK PREVIEW CARD ── */}
      <View
        style={[
          styles.dockPreviewWrapper,
          {
            borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
            backgroundColor: isDark ? '#10121A' : '#FFFFFF',
          }
        ]}
      >
        <View style={styles.dockHeaderRow}>
          <View
            style={[
              styles.dockLivePill,
              { backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)' }
            ]}
          >
            <View style={styles.dockLiveDot} />
            <Text style={[styles.dockLiveText, { color: colors.textMuted }]}>LIVE DOCK PREVIEW</Text>
          </View>
          <Text style={[styles.dockCountText, { color: colors.textMuted }]}>
            {pinned.length}/4 Selected
          </Text>
        </View>

        <View
          style={[
            styles.dockPreviewBar,
            {
              backgroundColor: isDark ? '#08090D' : '#F2F2F7',
              borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
            }
          ]}
        >
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
                <Text
                  numberOfLines={1}
                  style={[
                    styles.dockPreviewItemText,
                    { color: colors.accentPrimary, fontFamily: FONT_FAMILY.bold }
                  ]}
                >
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

      <SpringButton
        title={`Confirm Dock (${pinned.length}/4)`}
        onPress={onNext}
        isDark={isDark}
        iconName="arrow-forward"
        disabled={pinned.length === 0}
      />
    </ScrollView>
  );
}

// ─── Mascot Asset Catalog ───────────────────────────────────────────────────
const getMascotForLevel = (title: string) => {
  return MASCOT_IMAGES[title] || MASCOT_IMAGES['Seeker'];
};

// ─── Step 3: Genesis XP & Mascot Launch ───────────────────────────────────────
function StepGenesisLaunch({ persona, pinned, saving, onLaunch, colors, isDark }: any) {
  const personaObj = PERSONAS.find(p => p.id === persona);

  // Live user XP & Level state
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
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={styles.scrollStep}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.heroTextContainer}>
        <Text style={[styles.heroTitleSerif, { color: colors.textPrimary }]}>Genesis calibration</Text>
        <Text style={[styles.heroTitleItalic, { color: colors.accentPrimary }]}>complete.</Text>
      </View>
      <Text style={[styles.subText, { color: colors.textSecondary }]}>
        Your customized archetype and navigation matrix are loaded. Welcome to ZenTrack.
      </Text>

      {/* Floating Animated Mascot Hero */}
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
      <View
        style={[
          styles.genesisCard,
          {
            borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
            backgroundColor: isDark ? '#10121A' : '#FFFFFF',
          }
        ]}
      >
        <View style={styles.genesisBadgeRow}>
          <View
            style={[
              styles.rankPill,
              {
                backgroundColor: isDark ? `${rankColors[0]}22` : `${rankColors[0]}15`,
                borderColor: rankColors[0]
              }
            ]}
          >
            <Text style={[styles.rankPillText, { color: rankColors[0] }]}>
              ⭐ {xpState.title.toUpperCase()} · LEVEL {xpState.level}
            </Text>
          </View>
          <Text style={[styles.genesisRewardText, { color: isDark ? '#FFD60A' : '#D97706' }]}>
            +{XP_SOURCES.ONBOARDING.base} XP
          </Text>
        </View>

        {/* Level XP Progress Meter */}
        <View style={styles.xpProgressWrapper}>
          <View
            style={[
              styles.xpProgressBg,
              { backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)' }
            ]}
          >
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

        {/* Configuration summary */}
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
                    <View style={{ marginRight: 4 }}>
                      {renderModuleNavIcon(modId, true, colors.accentPrimary, 13)}
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

      <SpringButton
        title="Initialize Life OS"
        onPress={onLaunch}
        isDark={isDark}
        loading={saving}
        iconName="arrow-forward"
      />
    </ScrollView>
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
    paddingBottom: 16,
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
  sliderContainer: {
    flex: 1,
    overflow: 'hidden',
    marginTop: 6,
  },
  stepContainer: {
    flex: 1,
  },
  scrollStep: {
    paddingBottom: 12,
  },
  heroTextContainer: {
    marginBottom: 6,
    overflow: 'visible',
  },
  heroTitleSerif: {
    fontFamily: 'PlayfairDisplay_600SemiBold',
    fontSize: 34,
    lineHeight: 40,
    letterSpacing: -0.6,
  },
  heroTitleItalic: {
    fontFamily: 'PlayfairDisplay_600SemiBold_Italic',
    fontSize: 38,
    lineHeight: 44,
    paddingRight: 8,
  },
  subText: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 13.5,
    lineHeight: 20,
    marginBottom: 16,
    opacity: 0.85,
  },

  // ── Step 1: Sleek Persona List ──
  personaList: {
    gap: 10,
    marginBottom: 18,
  },
  personaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 22,
    borderWidth: 1,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 2,
  },
  personaIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  personaTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 15.5,
    letterSpacing: -0.2,
  },
  personaTagline: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  activeCheckCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inactiveCheckCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
  },

  // ── Step 2: Module Grid ──
  moduleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
    justifyContent: 'space-between',
  },
  moduleTile: {
    width: '31.5%',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 2,
  },
  moduleIconContainer: {
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moduleTileLabel: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 11.5,
    marginTop: 5,
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  moduleTileBadge: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 17,
    height: 17,
    borderRadius: 8.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moduleTileBadgeText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 9.5,
  },

  // ── Live Dock Preview Bar ──
  dockPreviewWrapper: {
    marginBottom: 16,
    padding: 14,
    borderRadius: 22,
    borderWidth: 1,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 2,
  },
  dockHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  dockLivePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: RADIUS.full,
  },
  dockLiveDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#34D399',
  },
  dockLiveText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 9.5,
    letterSpacing: 0.8,
  },
  dockCountText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 11,
  },
  dockPreviewBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    height: 54,
    borderRadius: 18,
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

  // ── Step 3: Mascot Display & Genesis Card ──
  mascotDisplayContainer: {
    width: '100%',
    height: 135,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    position: 'relative',
  },
  mascotAuraImage: {
    position: 'absolute',
    width: 145,
    height: 145,
    opacity: 0.35,
  },
  mascotHeroImage: {
    width: 125,
    height: 125,
  },
  genesisCard: {
    padding: 16,
    borderRadius: 24,
    borderWidth: 1,
    marginBottom: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 3,
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
  },
  genesisRewardText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 17,
    letterSpacing: 0.5,
  },
  xpProgressWrapper: {
    width: '100%',
    marginBottom: 12,
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
    gap: 8,
  },
  configItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 3,
  },
  configColumnItem: {
    paddingVertical: 3,
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
    gap: 6,
    marginTop: 4,
  },
  pinnedMicroPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    paddingVertical: 6,
    borderRadius: RADIUS.md,
    borderWidth: 1,
  },
  pinnedMicroPillText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 10,
  },
  configDivider: {
    height: StyleSheet.hairlineWidth,
    width: '100%',
  },

  // ── Shared Primary Button ──
  btnWrapper: {
    width: '100%',
    marginBottom: 8,
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

  // ── Footer Navigation Row ──
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  backBtn: {
    width: 55,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
  },
  backBtnText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 12.5,
  },
  footerPlaceholder: {
    width: 55,
  },
  paginationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  paginationDot: {
    height: 4,
    borderRadius: 2,
  },
});
