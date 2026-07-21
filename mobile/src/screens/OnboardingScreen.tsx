/**
 * OnboardingScreen — ZenTrack Mobile
 * Editorial Design Rewrite
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  🔴 BUG-H6 SAFETY CONSTRAINT — READ THIS BEFORE EDITING               ║
 * ║                                                                          ║
 * ║  OnboardingScreen renders OUTSIDE all Stack/Tab navigators in           ║
 * ║  AppNavigator.tsx. It is returned as a standalone component when        ║
 * ║  authLoading=false and hasOnboarded=false, BEFORE the main navigator.  ║
 * ║                                                                          ║
 * ║  NEVER call useNavigation() inside this file. It will throw:           ║
 * ║    "Couldn't find a navigation object. Is your component inside        ║
 * ║     NavigationContainer?"                                               ║
 * ║  ...crashing the app for EVERY new user on first launch.               ║
 * ║                                                                          ║
 * ║  Navigation callbacks must be passed as PROPS from AppNavigator.tsx.   ║
 * ║  The existing pattern (calling onFinish() prop after onboarding) is    ║
 * ║  the correct approach. Do not change this pattern.                     ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated,
  Dimensions, TextInput, KeyboardAvoidingView, Platform, StatusBar, ScrollView
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

// Fonts
import { useFonts, Inter_400Regular, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { PlayfairDisplay_600SemiBold, PlayfairDisplay_600SemiBold_Italic } from '@expo-google-fonts/playfair-display';
import { COLLECTION } from '../config/constants';

const { width } = Dimensions.get('window');

export const ONBOARDING_KEY = 'zentrack_onboarded_v2';

const IDENTITIES = [
  { id: 'student',  label: 'Student',  icon: '📚', sub: 'Master your academics' },
  { id: 'athlete',  label: 'Athlete',  icon: '🏋️', sub: 'Train with purpose'    },
  { id: 'creator',  label: 'Creator',  icon: '🎨', sub: 'Build what matters'    },
  { id: 'builder',  label: 'Builder',  icon: '🔧', sub: 'Ship every day'        },
  { id: 'founder',  label: 'Founder',  icon: '🚀', sub: 'Lead with clarity'     },
  { id: 'explorer', label: 'Explorer', icon: '🌍', sub: 'Grow every day'        },
];

const FOCUS_WORDS = [
  'Momentum', 'Clarity', 'Grit', 'Focus', 'Execute', 'Build',
  'Rise', 'Deep Work', 'Ship', 'Compound', 'Discipline', 'Edge',
];

export default function OnboardingScreen({ onComplete }: { onComplete: () => void }) {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_600SemiBold,
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
      Animated.timing(stepFade,  { toValue: 1, duration: 450, useNativeDriver: true }),
      Animated.spring(stepSlide, { toValue: 0, tension: 55, friction: 12, useNativeDriver: true }),
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
        }, 1500);
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
    setTimeout(() => next(), 1200);
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
      case 0: return <StepPromise onNext={next} />;
      case 1: return <StepIdentity selected={selectedIdentities} onToggle={toggleIdentity} onNext={() => selectedIdentities.length > 0 && next()} />;
      case 2: return <StepDiscipline score={disciplineScore} onSelect={selectScore} onNext={() => disciplineScore !== null && next()} />;
      case 3: return <StepGoal goal={goal} submitted={goalSubmitted} onChangeText={setGoal} onSubmit={handleGoalSubmit} />;
      case 4: return <StepDone identity={selectedIdentities[0]} saving={saving} onFinish={handleFinish} />;
      default: return null;
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" />

      {/* Top Header */}
      <View style={styles.globalHeader}>
        <Text style={styles.globalBrand}>ZENTRACK</Text>
        <Text style={styles.globalStep}>03 / onboarding</Text>
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

// ─── Steps ─────────────────────────────────────────────────────────────────

function StepPromise({ onNext }: { onNext: () => void }) {
  return (
    <View style={styles.centeredStep}>
      <Text style={styles.titleSerif}>
        Every high achiever{'\n'}
        <Text style={styles.titleSerifItalic}>started here.</Text>
      </Text>
      <Text style={styles.subText}>
        We aren't just tracking your life.{'\n'}
        We're building the system to upgrade it.
      </Text>
      <TouchableOpacity style={styles.ctaLink} onPress={onNext}>
        <Text style={styles.ctaLinkText}>Begin onboarding  →</Text>
      </TouchableOpacity>
    </View>
  );
}

function StepIdentity({ selected, onToggle, onNext }: { selected: string[]; onToggle: (id: string) => void; onNext: () => void }) {
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.centeredStep} showsVerticalScrollIndicator={false}>
      <Text style={styles.stepIndicator}>STEP 1 OF 3</Text>
      <Text style={styles.titleSerif}>What kind of person{'\n'}do you want to become{'\n'}in 90 days?</Text>
      <Text style={styles.subText}>Select all that apply. This shapes your experience.</Text>

      <View style={styles.identityGrid}>
        {IDENTITIES.map(id => {
          const active = selected.includes(id.id);
          return (
            <TouchableOpacity key={id.id} style={[styles.identityTile, active && styles.identityTileActive]} onPress={() => onToggle(id.id)} activeOpacity={0.7}>
              <Text style={styles.identityEmoji}>{id.icon}</Text>
              <Text style={[styles.identityLabel, active && styles.identityLabelActive]}>{id.label}</Text>
              <Text style={[styles.identitySub, active && styles.identityLabelActive]}>{id.sub}</Text>
              {active && (
                <View style={styles.identityCheck}>
                  <Ionicons name="checkmark" size={12} color="#050505" />
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity style={[styles.ctaLink, selected.length === 0 && { opacity: 0.3 }]} onPress={onNext} disabled={selected.length === 0}>
        <Text style={styles.ctaLinkText}>This is me  →</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function StepDiscipline({ score, onSelect, onNext }: { score: number | null; onSelect: (n: number) => void; onNext: () => void }) {
  const getResponse = (s: number) => {
    if (s <= 3) return "That's why you're here. We'll rebuild from the ground up — together.";
    if (s <= 5) return "You've got the awareness. That's the hardest part. Let's build the system.";
    if (s <= 7) return "Strong foundation. We'll sharpen the edges and push to the next level.";
    if (s <= 9) return "You already have the discipline. We're here to amplify it.";
    return "Rare. You're already elite. Let's stay there.";
  };

  return (
    <View style={styles.centeredStep}>
      <Text style={styles.stepIndicator}>STEP 2 OF 3</Text>
      <Text style={styles.titleSerif}>How satisfied are you{'\n'}with your current{'\n'}daily discipline?</Text>
      <Text style={styles.subText}>Be honest. This shapes your starting point.</Text>

      <View style={styles.scoreRow}>
        {[1,2,3,4,5,6,7,8,9,10].map(n => (
          <TouchableOpacity key={n} style={[styles.scoreBtn, score === n && styles.scoreBtnActive]} onPress={() => onSelect(n)} activeOpacity={0.7}>
            <Text style={[styles.scoreBtnText, score === n && styles.scoreBtnTextActive]}>{n}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.scoreLabels}>
        <Text style={styles.scoreLabelText}>Not at all</Text>
        <Text style={styles.scoreLabelText}>Perfectly</Text>
      </View>

      <View style={{ height: 60, justifyContent: 'center', marginVertical: 20 }}>
        {score !== null && (
          <Text style={styles.responseText}>{getResponse(score)}</Text>
        )}
      </View>

      <TouchableOpacity style={[styles.ctaLink, score === null && { opacity: 0.3 }]} onPress={onNext} disabled={score === null}>
        <Text style={styles.ctaLinkText}>Honest answer: {score ?? '?'}  →</Text>
      </TouchableOpacity>
    </View>
  );
}

function StepGoal({ goal, submitted, onChangeText, onSubmit }: { goal: string; submitted: boolean; onChangeText: (t: string) => void; onSubmit: () => void }) {
  if (submitted) {
    return (
      <View style={styles.centeredStep}>
        <Text style={styles.titleSerif}>Goal locked in.</Text>
        <Text style={styles.subText}>The mission starts now.</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <View style={styles.centeredStep}>
        <Text style={styles.stepIndicator}>STEP 3 OF 3</Text>
        <Text style={styles.titleSerif}>What is your most{'\n'}important goal{'\n'}right now?</Text>
        <Text style={styles.subText}>One sentence. Your north star for the next 90 days.</Text>

        <View style={styles.goalInputWrapper}>
          <TextInput
            style={styles.goalInput}
            placeholder="e.g., Ship my MVP by November 1st"
            placeholderTextColor="rgba(255,255,255,0.3)"
            value={goal}
            onChangeText={onChangeText}
            multiline
            onSubmitEditing={onSubmit}
            returnKeyType="done"
          />
        </View>

        <TouchableOpacity style={[styles.ctaLink, !goal.trim() && { opacity: 0.3 }]} onPress={onSubmit} disabled={!goal.trim()}>
          <Text style={styles.ctaLinkText}>Set this goal  →</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.skipLink} onPress={() => onSubmit()}>
          <Text style={styles.skipLinkText}>Skip for now</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

function StepDone({ identity, saving, onFinish }: { identity?: string; saving: boolean; onFinish: (allow: boolean) => void }) {
  const identityObj = IDENTITIES.find(i => i.id === identity);

  return (
    <View style={styles.centeredStep}>
      <Text style={styles.titleSerif}>You're set up.</Text>
      <Text style={styles.subText}>
        Your goal is locked. Your identity is anchored.{'\n'}
        You're already ahead of <Text style={{ color: '#ffffff', fontFamily: 'Inter_600SemiBold' }}>80%</Text> of people who downloaded this.
      </Text>

      {identityObj && (
        <View style={styles.identityConfirmBadge}>
          <Text style={styles.identityConfirmEmoji}>{identityObj.icon}</Text>
          <Text style={styles.identityConfirmLabel}>{identityObj.label} — {identityObj.sub}</Text>
        </View>
      )}

      <Text style={styles.notifTitle}>One last thing.</Text>
      <Text style={styles.notifSub}>
        We'll remind you at exactly the right moment — never spam. Enable notifications to get personalised reminders.
      </Text>

      <TouchableOpacity style={[styles.whiteBtn, saving && { opacity: 0.6 }]} onPress={() => onFinish(true)} disabled={saving} activeOpacity={0.8}>
        <Text style={styles.whiteBtnText}>{saving ? 'Setting up...' : 'Allow Notifications'}</Text>
        <Ionicons name="flash" size={16} color="#a599ff" />
      </TouchableOpacity>

      <TouchableOpacity style={styles.skipLink} onPress={() => onFinish(false)} disabled={saving}>
        <Text style={styles.skipLinkText}>Maybe later</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
  },
  globalHeader: {
    paddingHorizontal: 32,
    paddingTop: 24,
  },
  globalBrand: {
    color: 'rgba(255, 255, 255, 0.4)',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    letterSpacing: 2,
    marginBottom: 4,
  },
  globalStep: {
    color: 'rgba(255, 255, 255, 0.3)',
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
  },
  stepContainer: {
    flex: 1,
    paddingHorizontal: 32,
  },
  centeredStep: {
    flex: 1,
    justifyContent: 'flex-start',
    paddingTop: 24,
    paddingBottom: 120, // Increased to ensure the bottom button scrolls fully into view above the dots
  },
  stepIndicator: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    color: '#a599ff',
    letterSpacing: 2,
    marginBottom: 16,
    textTransform: 'uppercase',
  },
  titleSerif: {
    fontFamily: 'PlayfairDisplay_600SemiBold',
    fontSize: 28,
    color: '#ffffff',
    lineHeight: 36,
    marginBottom: 12,
  },
  titleSerifItalic: {
    fontFamily: 'PlayfairDisplay_600SemiBold_Italic',
    color: '#a599ff',
  },
  subText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
    lineHeight: 22,
    marginBottom: 24,
  },
  ctaLink: {
    alignSelf: 'flex-end', // Moved to far right
    paddingVertical: 12,
    marginTop: 16,
  },
  ctaLinkText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    color: '#ffffff',
  },
  
  // Identity Grid
  identityGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 12,
    marginBottom: 24,
  },
  identityTile: {
    width: '48%', // Flexible 2 columns
    backgroundColor: '#0a0a0a',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  identityTileActive: {
    backgroundColor: '#161520',
    borderColor: 'rgba(165,153,255,0.4)',
  },
  identityEmoji: {
    fontSize: 24,
    marginBottom: 12,
  },
  identityLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 4,
  },
  identityLabelActive: {
    color: '#ffffff',
  },
  identitySub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: 'rgba(255,255,255,0.4)',
  },
  identityCheck: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#a599ff',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Score Row
  scoreRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  scoreBtn: {
    width: (width - 64 - 36) / 10,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
  },
  scoreBtnActive: {
    backgroundColor: '#a599ff',
  },
  scoreBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
  },
  scoreBtnTextActive: {
    color: '#000000',
  },
  scoreLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  scoreLabelText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: 'rgba(255,255,255,0.3)',
  },
  responseText: {
    fontFamily: 'PlayfairDisplay_600SemiBold_Italic',
    fontSize: 20,
    color: '#ffffff',
    lineHeight: 28,
  },

  // Goal
  goalInputWrapper: {
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    paddingBottom: 8,
    marginBottom: 32,
  },
  goalInput: {
    fontFamily: 'PlayfairDisplay_600SemiBold',
    fontSize: 24,
    color: '#ffffff',
    minHeight: 40,
  },

  // Done Step
  identityConfirmBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#0a0a0a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    alignSelf: 'flex-start',
    marginBottom: 40,
  },
  identityConfirmEmoji: {
    fontSize: 16,
    marginRight: 12,
  },
  identityConfirmLabel: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
  },
  notifTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 18,
    color: '#ffffff',
    marginBottom: 8,
  },
  notifSub: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    lineHeight: 22,
    marginBottom: 32,
  },
  whiteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    paddingVertical: 14,
    borderRadius: 8,
    width: '100%',
    gap: 8,
    marginBottom: 16,
  },
  whiteBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: '#000000',
  },
  skipLink: {
    alignSelf: 'center',
    paddingVertical: 12,
  },
  skipLinkText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: 'rgba(255,255,255,0.4)',
  },

  // Nav Dots
  dots: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    paddingHorizontal: 32,
    paddingBottom: 40,
    gap: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  dotActive: {
    backgroundColor: '#ffffff',
  },
});
