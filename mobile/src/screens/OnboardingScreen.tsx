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
  Dimensions, TextInput, KeyboardAvoidingView, Platform, ScrollView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, addDoc, doc, setDoc } from 'firebase/firestore';
import { db, auth } from '../services/firebase';
import { awardXP } from '../services/xpSystem';
import { requestNotificationPermissions } from '../services/notifications';
import * as Notifications from 'expo-notifications';
import Reanimated from 'react-native-reanimated';

// Fonts & Theme
import { useFonts, Inter_400Regular, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { PlayfairDisplay_600SemiBold, PlayfairDisplay_600SemiBold_Italic } from '@expo-google-fonts/playfair-display';
import { COLLECTION } from '../config/constants';
import { useTheme } from '../contexts/ThemeContext';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS, SHADOW } from '../theme/tokens';

const { width } = Dimensions.get('window');

export const ONBOARDING_KEY = 'zentrack_onboarded_v2';

const IDENTITIES = [
  { id: 'student',  label: 'Student',  icon: '📚', sub: 'Master your academics' },
  { id: 'athlete',  label: 'Athlete',  icon: '🏋️', sub: 'Train with purpose'    },
  { id: 'creator',  label: 'Creator',  icon: '🎨', sub: 'Build what matters'    },
  { id: 'builder',  label: 'Builder',  icon: '🔧', sub: 'Ship every single day' },
  { id: 'founder',  label: 'Founder',  icon: '🚀', sub: 'Lead with extreme clarity' },
  { id: 'explorer', label: 'Explorer', icon: '🌐', sub: 'Compound and evolve'  },
];

const FOCUS_WORDS = [
  'Momentum', 'Clarity', 'Grit', 'Focus', 'Execute', 'Build',
  'Rise', 'Deep Work', 'Ship', 'Compound', 'Discipline', 'Edge',
];

const GOAL_SUGGESTIONS = [
  '🎯 9.0+ CGPA & Ace Semester Exams',
  '💻 Master DSA & Land Dream Tech Role',
  '🚀 Build & Launch my MVP to 100 Users',
  '🏋️ 5-Day Weekly Gym Streak & Lean Bulk',
  '📚 Read 12 High-Impact Books in 90 Days',
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

  const [step, setStep] = useState(0);
  const [selectedIdentities, setIdentities] = useState<string[]>([]);
  const [disciplineScore, setScore] = useState<number | null>(null);
  const [goal, setGoal] = useState('');
  const [goalSubmitted, setGoalSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  const stepFade = useRef(new Animated.Value(0)).current;
  const stepSlide = useRef(new Animated.Value(24)).current;
  const identityTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const animateIn = useCallback(() => {
    stepFade.setValue(0);
    stepSlide.setValue(24);
    Animated.parallel([
      Animated.timing(stepFade,  { toValue: 1, duration: 420, useNativeDriver: true }),
      Animated.spring(stepSlide, { toValue: 0, tension: 60, friction: 12, useNativeDriver: true }),
    ]).start();
  }, [stepFade, stepSlide]);

  useEffect(() => {
    if (fontsLoaded) {
      animateIn();
    }
    return () => {
      if (identityTimeoutRef.current) clearTimeout(identityTimeoutRef.current);
    };
  }, [step, fontsLoaded, animateIn]);

  if (!fontsLoaded) return <View style={styles.root} />;

  const next = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setStep(s => s + 1);
  };

  const toggleIdentity = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIdentities(prev => {
      const nextArr = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
      
      if (identityTimeoutRef.current) clearTimeout(identityTimeoutRef.current);
      
      if (nextArr.length > 0) {
        identityTimeoutRef.current = setTimeout(() => {
          next();
        }, 1200);
      }
      
      return nextArr;
    });
  };

  const selectScore = (n: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setScore(n);
  };

  const handleGoalSubmit = () => {
    if (!goal.trim()) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setGoalSubmitted(true);
    setTimeout(() => next(), 1000);
  };

  const handleFinish = async (allowNotifs: boolean) => {
    setSaving(true);
    try {
      const uid = auth.currentUser?.uid;
      if (allowNotifs) {
        const granted = await requestNotificationPermissions();
        if (granted) {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: "ZenTrack ⚡",
              body: "Notifications are active. The system is armed.",
              sound: true,
            },
            trigger: null,
          });
        }
      }
      if (uid) {
        // Fire and forget database writes so they don't block the UI on slow networks
        setDoc(doc(db, 'users', uid, 'profile', 'identity'), {
          identities: selectedIdentities,
          disciplineScore,
          focusWord: FOCUS_WORDS[Math.floor(Math.random() * FOCUS_WORDS.length)],
          onboardedAt: Date.now(),
        }, { merge: true }).catch(e => console.log('Identity save issue:', e));

        if (goal.trim()) {
          addDoc(collection(db, COLLECTION.GOALS), {
            userId: uid,
            title: goal.trim(),
            status: 'active',
            progress: 0,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            source: 'onboarding',
          }).catch(e => console.log('Goal save issue:', e));
        }
      }
      
      // Fire and forget XP award
      awardXP('ONBOARDING').catch(e => console.log('XP save issue:', e));

      await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
      onComplete();
    } catch (e) {
      console.error('[Onboarding] Save error:', e);
      await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
      onComplete();
    }
  };

  const renderStep = () => {
    switch (step) {
      case 0: return <StepPromise onNext={next} styles={styles} colors={colors} isDark={isDark} />;
      case 1: return <StepIdentity selected={selectedIdentities} onToggle={toggleIdentity} onNext={() => selectedIdentities.length > 0 && next()} styles={styles} colors={colors} isDark={isDark} />;
      case 2: return <StepDiscipline identity={selectedIdentities[0]} score={disciplineScore} onSelect={selectScore} onNext={() => disciplineScore !== null && next()} styles={styles} colors={colors} isDark={isDark} />;
      case 3: return <StepGoal identity={selectedIdentities[0]} goal={goal} submitted={goalSubmitted} onChangeText={setGoal} onSubmit={handleGoalSubmit} onSelectSuggestion={(s) => setGoal(s)} styles={styles} colors={colors} isDark={isDark} />;
      case 4: return <StepDone identity={selectedIdentities[0]} goal={goal} saving={saving} onFinish={handleFinish} styles={styles} colors={colors} isDark={isDark} />;
      default: return null;
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
          {step === 0 ? 'START' : `0${step} / 04`}
        </Text>
      </View>

      <Animated.View style={[styles.stepContainer, { opacity: stepFade, transform: [{ translateY: stepSlide }] }]}>
        {renderStep()}
      </Animated.View>
      
      {/* Footer Nav Dots */}
      {step > 0 && step < 4 && (
        <View style={styles.dots}>
          {[1, 2, 3].map(i => (
            <View key={i} style={[styles.dot, i === step && styles.dotActive]} />
          ))}
        </View>
      )}
    </SafeAreaView>
  );
}

// ─── Top Identity Badge ───────────────────────────────────────────────────────

function TopBadge({ identity, styles }: { identity?: string; styles: any }) {
  const identityObj = IDENTITIES.find(i => i.id === identity);
  if (!identityObj) return null;
  return (
    <Reanimated.View style={styles.topBadge}>
      <Text style={styles.topBadgeEmoji}>{identityObj.icon}</Text>
      <Text style={styles.topBadgeLabel}>{identityObj.label}</Text>
    </Reanimated.View>
  );
}

// ─── Step 0: Editorial Promise ────────────────────────────────────────────────

function StepPromise({ onNext, styles, colors, isDark }: { onNext: () => void; styles: any; colors: any; isDark: boolean }) {
  return (
    <View style={styles.centeredStep}>
      <View style={styles.welcomePill}>
        <Ionicons name="sparkles" size={14} color={colors.accentPrimary} />
        <Text style={styles.welcomePillText}>THE OPERATING SYSTEM FOR HIGH ACHIEVERS</Text>
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
            <Text style={styles.featureSub}>Proactive schedule management & tutoring</Text>
          </View>
        </View>

        <View style={styles.featureItem}>
          <View style={[styles.featureIconBox, { backgroundColor: isDark ? 'rgba(52,199,89,0.12)' : 'rgba(16,185,129,0.08)' }]}>
            <Ionicons name="barbell-outline" size={18} color={colors.accentGreen} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.featureTitle}>PPL Gym & Strength Engine</Text>
            <Text style={styles.featureSub}>Auto progressive overload & rest timers</Text>
          </View>
        </View>

        <View style={styles.featureItem}>
          <View style={[styles.featureIconBox, { backgroundColor: isDark ? 'rgba(255,149,0,0.12)' : 'rgba(217,119,6,0.08)' }]}>
            <Ionicons name="calendar-outline" size={18} color={colors.accentAmber} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.featureTitle}>Unified Multi-View Calendar</Text>
            <Text style={styles.featureSub}>Classes, tasks, and routines in sync</Text>
          </View>
        </View>
      </View>

      <TouchableOpacity style={styles.primaryBtn} onPress={onNext} activeOpacity={0.8}>
        <Text style={styles.primaryBtnText}>Begin Onboarding</Text>
        <Ionicons name="arrow-forward" size={16} color={isDark ? '#000000' : '#FFFFFF'} />
      </TouchableOpacity>
    </View>
  );
}

// ─── Step 1: Identity Selection ───────────────────────────────────────────────

function StepIdentity({
  selected, onToggle, onNext, styles, colors, isDark
}: {
  selected: string[]; onToggle: (id: string) => void; onNext: () => void; styles: any; colors: any; isDark: boolean
}) {
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.centeredStep} showsVerticalScrollIndicator={false}>
      <Text style={styles.stepIndicator}>STEP 1 OF 3</Text>
      <Text style={styles.titleSerif}>
        What kind of person{'\n'}do you want to become{'\n'}in 90 days?
      </Text>
      <Text style={styles.subText}>Select all that resonate. This shapes your daily experience.</Text>

      <View style={styles.identityGrid}>
        {IDENTITIES.map(id => {
          const active = selected.includes(id.id);
          return (
            <TouchableOpacity key={id.id} onPress={() => onToggle(id.id)} activeOpacity={0.7} style={{ width: '48%' }}>
              <Reanimated.View 
                style={[styles.identityTile, active && styles.identityTileActive]}
              >
                <Text style={styles.identityEmoji}>{id.icon}</Text>
                <Text style={[styles.identityLabel, active && styles.identityLabelActive]}>{id.label}</Text>
                <Text style={[styles.identitySub, active && styles.identitySubActive]}>{id.sub}</Text>
                {active && (
                  <View style={styles.identityCheck}>
                    <Ionicons name="checkmark" size={12} color={isDark ? '#000000' : '#FFFFFF'} />
                  </View>
                )}
              </Reanimated.View>
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity
        style={[styles.primaryBtn, selected.length === 0 && { opacity: 0.35 }]}
        onPress={onNext}
        disabled={selected.length === 0}
        activeOpacity={0.8}
      >
        <Text style={styles.primaryBtnText}>
          {selected.length === 0 ? 'Select at least one identity' : `This is me (${selected.length})`}
        </Text>
        <Ionicons name="arrow-forward" size={16} color={isDark ? '#000000' : '#FFFFFF'} />
      </TouchableOpacity>
    </ScrollView>
  );
}

// ─── Step 2: Discipline Assessment ───────────────────────────────────────────

function StepDiscipline({
  identity, score, onSelect, onNext, styles, colors, isDark
}: {
  identity?: string; score: number | null; onSelect: (n: number) => void; onNext: () => void; styles: any; colors: any; isDark: boolean
}) {
  const getResponse = (s: number) => {
    if (s <= 3) return "That's why you're here. We'll rebuild the system from the ground up — together.";
    if (s <= 5) return "You have honest self-awareness. That's the hardest step. Let's install the habits.";
    if (s <= 7) return "Solid foundation. We'll sharpen the edges and push you into peak execution.";
    if (s <= 9) return "You already have serious momentum. We're here to amplify and safeguard it.";
    return "Rare tier. You operate at elite consistency. Let's maintain dominance.";
  };

  return (
    <View style={styles.centeredStep}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Text style={[styles.stepIndicator, { marginBottom: 0 }]}>STEP 2 OF 3</Text>
        <TopBadge identity={identity} styles={styles} />
      </View>

      <Text style={styles.titleSerif}>
        How satisfied are you{'\n'}with your current{'\n'}daily discipline?
      </Text>
      <Text style={styles.subText}>Be brutally honest. This shapes your baseline starting point.</Text>

      <View style={styles.scoreRow}>
        {[1,2,3,4,5,6,7,8,9,10].map(n => (
          <TouchableOpacity key={n} style={[styles.scoreBtn, score === n && styles.scoreBtnActive]} onPress={() => onSelect(n)} activeOpacity={0.7}>
            <Text style={[styles.scoreBtnText, score === n && styles.scoreBtnTextActive]}>{n}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.scoreLabels}>
        <Text style={styles.scoreLabelText}>Struggling (1)</Text>
        <Text style={styles.scoreLabelText}>Unstoppable (10)</Text>
      </View>

      <View style={styles.responseCard}>
        {score !== null ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.accentPrimary} />
            <Text style={styles.responseText}>{getResponse(score)}</Text>
          </View>
        ) : (
          <Text style={{ fontFamily: FONT_FAMILY.body, fontSize: 13, color: colors.textMuted, textAlign: 'center' }}>
            Tap a number from 1 to 10 above
          </Text>
        )}
      </View>

      <TouchableOpacity
        style={[styles.primaryBtn, score === null && { opacity: 0.35 }]}
        onPress={onNext}
        disabled={score === null}
        activeOpacity={0.8}
      >
        <Text style={styles.primaryBtnText}>
          {score === null ? 'Select your rating' : `Lock in rating: ${score}/10`}
        </Text>
        <Ionicons name="arrow-forward" size={16} color={isDark ? '#000000' : '#FFFFFF'} />
      </TouchableOpacity>
    </View>
  );
}

// ─── Step 3: North Star Goal ──────────────────────────────────────────────────

function StepGoal({
  identity, goal, submitted, onChangeText, onSubmit, onSelectSuggestion, styles, colors, isDark
}: {
  identity?: string; goal: string; submitted: boolean; onChangeText: (t: string) => void; onSubmit: () => void; onSelectSuggestion: (s: string) => void; styles: any; colors: any; isDark: boolean
}) {
  if (submitted) {
    return (
      <View style={styles.centeredStep}>
        <View style={styles.successIconBox}>
          <Ionicons name="checkmark-circle" size={48} color={colors.accentGreen} />
        </View>
        <Text style={styles.titleSerif}>Goal locked in.</Text>
        <Text style={styles.subText}>The mission officially starts now.</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={styles.centeredStep} showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <Text style={[styles.stepIndicator, { marginBottom: 0 }]}>STEP 3 OF 3</Text>
          <TopBadge identity={identity} styles={styles} />
        </View>

        <Text style={styles.titleSerif}>
          What is your most{'\n'}important goal{'\n'}right now?
        </Text>
        <Text style={styles.subText}>One sentence. Your north star for the next 90 days.</Text>

        <View style={styles.goalInputWrapper}>
          <TextInput
            style={styles.goalInput}
            placeholder="e.g., Ship my MVP and crack 9.0 CGPA"
            placeholderTextColor={colors.textMuted}
            value={goal}
            onChangeText={onChangeText}
            multiline
            onSubmitEditing={onSubmit}
            returnKeyType="done"
          />
        </View>

        {/* Quick Inspiration Chips */}
        <View style={{ marginBottom: 24 }}>
          <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 11, color: colors.textMuted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Or pick from high-achiever goals:
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {GOAL_SUGGESTIONS.map((item, idx) => (
              <TouchableOpacity
                key={idx}
                style={styles.suggestionChip}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onSelectSuggestion(item.replace(/^[^\s]+\s/, ''));
                }}
              >
                <Text style={styles.suggestionChipText}>{item}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <TouchableOpacity
          style={[styles.primaryBtn, !goal.trim() && { opacity: 0.35 }]}
          onPress={onSubmit}
          disabled={!goal.trim()}
          activeOpacity={0.8}
        >
          <Text style={styles.primaryBtnText}>Set this North Star</Text>
          <Ionicons name="arrow-forward" size={16} color={isDark ? '#000000' : '#FFFFFF'} />
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.skipLink} onPress={() => onSubmit()}>
          <Text style={styles.skipLinkText}>Skip for now</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Step 4: Setup Confirmation & Notifications ───────────────────────────────

function StepDone({
  identity, goal, saving, onFinish, styles, colors, isDark
}: {
  identity?: string; goal: string; saving: boolean; onFinish: (allow: boolean) => void; styles: any; colors: any; isDark: boolean
}) {
  const identityObj = IDENTITIES.find(i => i.id === identity);

  return (
    <View style={styles.centeredStep}>
      <Text style={styles.titleSerif}>You're set up.</Text>
      <Text style={styles.subText}>
        Your profile is anchored. Your goals are configured.{'\n'}
        You're already ahead of <Text style={{ color: colors.accentPrimary, fontFamily: FONT_FAMILY.bold }}>80%</Text> of people who started today.
      </Text>

      {/* Confirmation Capsule */}
      <View style={styles.identityConfirmCard}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: goal ? 8 : 0 }}>
          <View style={styles.confirmIconBox}>
            <Text style={{ fontSize: 18 }}>{identityObj?.icon || '⚡'}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.confirmIdentityTitle}>{identityObj?.label || 'Zen Track Master'}</Text>
            <Text style={styles.confirmIdentitySub}>{identityObj?.sub || 'Ready to execute'}</Text>
          </View>
          <Ionicons name="checkmark-circle" size={20} color={colors.accentGreen} />
        </View>
        {goal ? (
          <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8, marginTop: 4 }}>
            <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 11, color: colors.textMuted, textTransform: 'uppercase' }}>North Star:</Text>
            <Text style={{ fontFamily: FONT_FAMILY.medium, fontSize: 13, color: colors.textPrimary, marginTop: 2 }}>{goal}</Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.notifTitle}>One last thing.</Text>
      <Text style={styles.notifSub}>
        We'll alert you at the optimal moments — never spam. Enable notifications to arm the proactive system.
      </Text>

      <TouchableOpacity
        style={[styles.primaryBtn, saving && { opacity: 0.6 }]}
        onPress={() => onFinish(true)}
        disabled={saving}
        activeOpacity={0.8}
      >
        <Text style={styles.primaryBtnText}>{saving ? 'Setting up system...' : 'Enable Smart Notifications'}</Text>
        <Ionicons name="notifications" size={16} color={isDark ? '#000000' : '#FFFFFF'} />
      </TouchableOpacity>

      <TouchableOpacity style={styles.skipLink} onPress={() => onFinish(false)} disabled={saving}>
        <Text style={styles.skipLinkText}>Maybe later</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

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
    paddingTop: 16,
    paddingBottom: 8,
  },
  globalBrand: {
    color: colors.textPrimary,
    fontFamily: FONT_FAMILY.bold,
    fontSize: 12,
    letterSpacing: 2,
  },
  brandDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.accentPrimary,
  },
  globalStep: {
    color: colors.textMuted,
    fontFamily: FONT_FAMILY.medium,
    fontSize: 11,
    letterSpacing: 1,
  },
  stepContainer: {
    flex: 1,
    paddingHorizontal: 28,
  },
  centeredStep: {
    flexGrow: 1,
    justifyContent: 'flex-start',
    paddingTop: 20,
    paddingBottom: 100,
  },
  welcomePill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    backgroundColor: isDark ? 'rgba(165,153,255,0.12)' : 'rgba(108,92,231,0.08)',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(165,153,255,0.25)' : 'rgba(108,92,231,0.20)',
    marginBottom: 16,
  },
  welcomePillText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 10,
    color: colors.accentPrimary,
    letterSpacing: 1,
  },
  stepIndicator: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 11,
    color: colors.accentPrimary,
    letterSpacing: 2,
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  titleSerif: {
    fontFamily: 'PlayfairDisplay_600SemiBold',
    fontSize: 28,
    color: colors.textPrimary,
    lineHeight: 36,
    marginBottom: 12,
  },
  titleSerifItalic: {
    fontFamily: 'PlayfairDisplay_600SemiBold_Italic',
    color: colors.accentPrimary,
  },
  subText: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 22,
    marginBottom: 24,
  },
  topBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? colors.surface : '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  topBadgeEmoji: {
    fontSize: 12,
    marginRight: 6,
  },
  topBadgeLabel: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 11,
    color: colors.textPrimary,
  },
  
  // Feature Grid
  featureGrid: {
    gap: 12,
    marginBottom: 32,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: isDark ? colors.surface : '#FFFFFF',
    padding: 14,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  featureIconBox: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  featureSub: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },

  // Primary Button
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentPrimary,
    paddingVertical: 16,
    borderRadius: RADIUS.lg,
    gap: 8,
    ...SHADOW.md,
  },
  primaryBtnText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 15,
    color: isDark ? '#000000' : '#FFFFFF',
  },

  // Identity Grid
  identityGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 12,
    marginBottom: 28,
  },
  identityTile: {
    backgroundColor: isDark ? colors.surface : '#FFFFFF',
    borderRadius: RADIUS.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 110,
  },
  identityTileActive: {
    backgroundColor: isDark ? (colors.surfaceRaised || '#18181b') : '#F5F3FF',
    borderColor: colors.accentPrimary,
    borderWidth: 1.5,
  },
  identityEmoji: {
    fontSize: 26,
    marginBottom: 10,
  },
  identityLabel: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 14,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  identityLabelActive: {
    color: colors.accentPrimary,
  },
  identitySub: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 11,
    color: colors.textMuted,
    lineHeight: 15,
  },
  identitySubActive: {
    color: colors.textSecondary,
  },
  identityCheck: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.accentPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Score Row
  scoreRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  scoreBtn: {
    width: (width - 56 - 36) / 10,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
    backgroundColor: isDark ? colors.surface : '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.border,
  },
  scoreBtnActive: {
    backgroundColor: colors.accentPrimary,
    borderColor: colors.accentPrimary,
  },
  scoreBtnText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 13,
    color: colors.textSecondary,
  },
  scoreBtnTextActive: {
    color: isDark ? '#000000' : '#FFFFFF',
  },
  scoreLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  scoreLabelText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 11,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  responseCard: {
    minHeight: 80,
    justifyContent: 'center',
    padding: 16,
    borderRadius: RADIUS.lg,
    backgroundColor: isDark ? colors.surface : '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 28,
  },
  responseText: {
    flex: 1,
    fontFamily: 'PlayfairDisplay_600SemiBold_Italic',
    fontSize: 15,
    color: colors.textPrimary,
    lineHeight: 22,
  },

  // Goal
  goalInputWrapper: {
    borderBottomWidth: 2,
    borderColor: colors.accentPrimary,
    paddingBottom: 10,
    marginBottom: 20,
  },
  goalInput: {
    fontFamily: 'PlayfairDisplay_600SemiBold',
    fontSize: 20,
    color: colors.textPrimary,
    minHeight: 48,
  },
  suggestionChip: {
    backgroundColor: isDark ? colors.surface : '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  suggestionChipText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 12,
    color: colors.textSecondary,
  },
  successIconBox: {
    alignSelf: 'center',
    marginBottom: 16,
  },

  // Done Step
  identityConfirmCard: {
    backgroundColor: isDark ? colors.surface : '#FFFFFF',
    borderRadius: RADIUS.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 28,
  },
  confirmIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: isDark ? (colors.surface2 || '#1c1c1f') : '#F5F4FA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmIdentityTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 14,
    color: colors.textPrimary,
  },
  confirmIdentitySub: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  notifTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 18,
    color: colors.textPrimary,
    marginBottom: 6,
  },
  notifSub: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: 28,
  },
  skipLink: {
    alignSelf: 'center',
    paddingVertical: 14,
  },
  skipLinkText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 13,
    color: colors.textMuted,
  },

  // Nav Dots
  dots: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    paddingHorizontal: 28,
    paddingBottom: 28,
    gap: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
  },
  dotActive: {
    width: 20,
    backgroundColor: colors.accentPrimary,
  },
});
