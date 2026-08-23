/**
 * ZenGymAiModal — ZenTrack Mobile
 *
 * Elite GYM-GPT coaching modal.
 * Passes full athlete profile + last 10 sessions + live workout to the AI.
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Platform,
  ScrollView,
  Animated,
  Keyboard,
  Image,
  Alert,
  Pressable,
  PanResponder,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Speech from 'expo-speech';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS, SHADOW } from '../../theme/tokens';
import { processGymChat, compressMemoryToSummary, parseOptionsFromText } from '../../agent/saraAgent';
import { useMobileData } from '../../contexts/MobileDataContext';
import { GYM_PLAN, WEEKDAY_TO_PLAN } from '../../data/gymPlan';
import { getCustomPlanDay } from '../../hooks/useGymLog';
import { UserGymPlanDoc, GymPlanDay } from '../../types/gym.types';
import { feedback } from '../../utils/haptics';
import ActionConfirmationCard from '../SARA/ActionConfirmationCard';
import { useTheme } from '../../contexts/ThemeContext';
import { useGymProfile } from '../../hooks/useGymProfile';
import { GymProfileModal } from './GymProfileModal';
import Markdown from 'react-native-markdown-display';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

export interface MultiDayPlanEntry {
  dayIndex: number;
  dayName: string;
  focus: string;
  exercises: { name: string; targetSets: number; targetReps: string; muscle?: string }[];
}

interface Props {
  visible: boolean;
  onClose: () => void;
  workoutData?: {
    activeMuscles?: string;
    doneSets?: number;
    totalSets?: number;
    exerciseName?: string;
    currentWeight?: number;
  };
  onAddExercise?: (name: string, targetSets: number, targetReps: string) => void;
  onDeleteExercise?: (exerciseId: string) => void;
  onLogSet?: (exerciseIndex: number, setIndex: number, weightKg: number, reps: number) => void;
  onGenerateWorkoutPlan?: (planName: string, exercises: { name: string, sets: number, reps: string }[]) => void;
  onAutoregulateDeload?: () => void;
  /** Import AI-generated plan into recurring gym calendar (permanent for all future weeks) */
  onImportMultiDayPlan?: (planName: string, days: MultiDayPlanEntry[]) => Promise<void>;
  /** Add a single exercise to a specific recurring plan day (permanent) */
  onAddExerciseToPlanDay?: (dayIndex: number, dayName: string, exercise: { name: string; targetSets: number; targetReps: string; muscle?: string }) => Promise<void>;
  /** User's full custom gym plan â€” used to feed real plan data to GYM-GPT */
  userGymPlan?: UserGymPlanDoc | null;
  /** Today's resolved plan day from useGymLog (already custom-plan-aware) */
  currentPlanDay?: GymPlanDay | null;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'gains' | 'thinking';
  text: string;
  actionCard?: any;
  /** Interactive option chips emitted by [[OPTIONS:[...]]] in AI response */
  options?: string[];
}

export interface GymPreferences {
  preferredSplit?: string | null;
  exercisesPerDay?: number | null;
  preferredFocus?: string | null;
  trainingDaysPerWeek?: number | null;
  otherNotes?: string | null;
}

export interface StoredChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  history: { role: string; content: string }[];
}

const STORAGE_KEY_SESSIONS = '@gym_gpt_sessions_v1';
const STORAGE_KEY_PREFS = '@gym_gpt_preferences_v1';

// ── Interactive Option Chips ──────────────────────────────────────────────────
// Renders after a GYM-GPT preference question. Tapping auto-sends the option.
function OptionsChips({
  options,
  onSelect,
  onWriteOwn,
  disabled,
}: {
  options: string[];
  onSelect: (opt: string) => void;
  onWriteOwn: () => void;
  disabled: boolean;
}) {
  const { colors, isDark } = useTheme();
  const scaleAnims = useRef(options.map(() => new Animated.Value(1))).current;

  const pressIn = (i: number) =>
    Animated.spring(scaleAnims[i], { toValue: 0.94, useNativeDriver: true, speed: 40 }).start();
  const pressOut = (i: number) =>
    Animated.spring(scaleAnims[i], { toValue: 1, useNativeDriver: true, speed: 20 }).start();

  return (
    <View style={optChipStyles.wrapper}>
      <View style={optChipStyles.row}>
        {options.map((opt, i) => (
          <Animated.View key={i} style={{ transform: [{ scale: scaleAnims[i] }] }}>
            <TouchableOpacity
              style={[
                optChipStyles.chip,
                {
                  backgroundColor: isDark ? 'rgba(165,153,255,0.12)' : 'rgba(108,92,231,0.08)',
                  borderColor: isDark ? 'rgba(165,153,255,0.35)' : 'rgba(108,92,231,0.25)',
                },
                disabled && optChipStyles.chipDisabled
              ]}
              onPress={() => { if (!disabled) { feedback.tap(); onSelect(opt); } }}
              onPressIn={() => pressIn(i)}
              onPressOut={() => pressOut(i)}
              activeOpacity={1}
              disabled={disabled}
            >
              <Text style={[optChipStyles.chipText, { color: colors.accentPrimary }]}>{opt}</Text>
            </TouchableOpacity>
          </Animated.View>
        ))}
        <TouchableOpacity
          style={[
            optChipStyles.chip,
            optChipStyles.chipWrite,
            {
              backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : colors.surface,
              borderColor: colors.border,
            },
            disabled && optChipStyles.chipDisabled
          ]}
          onPress={() => { if (!disabled) { feedback.tap(); onWriteOwn(); } }}
          disabled={disabled}
          activeOpacity={0.8}
        >
          <Ionicons name="create-outline" size={12} color={colors.textSecondary} />
          <Text style={[optChipStyles.chipText, { color: colors.textSecondary }]}>Write my own</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const optChipStyles = StyleSheet.create({
  wrapper: { marginTop: 10, marginBottom: 2 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 13,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  chipWrite: {},
  chipDisabled: { opacity: 0.4 },
  chipText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 12.5,
    letterSpacing: 0.1,
  },
});

function TypingDots() {
  const { colors } = useTheme();
  const dot1 = useRef(new Animated.Value(0.3)).current;
  const dot2 = useRef(new Animated.Value(0.3)).current;
  const dot3 = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animateDot = (anim: Animated.Value, delay: number) => {
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(anim, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(anim, { toValue: 0.3, duration: 300, useNativeDriver: true }),
          Animated.delay(600 - delay)
        ])
      ).start();
    };
    animateDot(dot1, 0);
    animateDot(dot2, 200);
    animateDot(dot3, 400);
  }, []);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8 }}>
      <Animated.View style={[{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: colors.accentPrimary }, { opacity: dot1 }]} />
      <Animated.View style={[{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: colors.accentPrimary }, { opacity: dot2 }]} />
      <Animated.View style={[{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: colors.accentPrimary }, { opacity: dot3 }]} />
    </View>
  );
}

// ─── Multi-Day Plan Import Card ─────────────────────────────────────────────

const DAY_NAMES = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_COLORS: Record<number, string> = {
  1: '#a599ff', 2: '#7ec8e3', 3: '#f9c74f', 4: '#90be6d',
  5: '#f8961e', 6: '#e88', 7: '#aaa'
};

function MultiDayPlanCard({ card }: { card: any }) {
  const { colors, isDark } = useTheme();
  const [confirmed, setConfirmed] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await card.onConfirm?.();
      setConfirmed(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[planCardStyles.container, { backgroundColor: colors.surface, borderColor: isDark ? 'rgba(165,153,255,0.2)' : colors.border }]}>
      <View style={planCardStyles.header}>
        <View style={[planCardStyles.headerIcon, { backgroundColor: isDark ? 'rgba(165,153,255,0.15)' : 'rgba(108,92,231,0.10)' }]}>
          <Ionicons name="calendar-outline" size={16} color={colors.accentPrimary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[planCardStyles.title, { color: colors.textPrimary }]}>{card.planName}</Text>
          <Text style={[planCardStyles.subtitle, { color: colors.textMuted }]}>{card.days?.length || 0} training days</Text>
        </View>
        {confirmed && (
          <View style={planCardStyles.confirmedBadge}>
            <Ionicons name="checkmark-circle" size={16} color={colors.accentGreen || '#4ade80'} />
            <Text style={[planCardStyles.confirmedText, { color: colors.accentGreen || '#4ade80' }]}>Imported</Text>
          </View>
        )}
      </View>

      <View style={[planCardStyles.divider, { backgroundColor: colors.border }]} />

      <View style={planCardStyles.dayList}>
        {(card.days || []).map((day: MultiDayPlanEntry) => (
          <View key={day.dayIndex} style={planCardStyles.dayRow}>
            <View style={[planCardStyles.dayChip, { backgroundColor: (DAY_COLORS[day.dayIndex] || colors.accentPrimary) + '22', borderColor: (DAY_COLORS[day.dayIndex] || colors.accentPrimary) + '66' }]}>
              <Text style={[planCardStyles.dayChipText, { color: DAY_COLORS[day.dayIndex] || colors.accentPrimary }]}>{DAY_NAMES[day.dayIndex] || day.dayName}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[planCardStyles.dayFocus, { color: colors.textPrimary }]} numberOfLines={1}>{day.focus || day.dayName}</Text>
              <Text style={[planCardStyles.dayExCount, { color: colors.textMuted }]}>{day.exercises?.length || 0} exercises</Text>
            </View>
          </View>
        ))}
      </View>

      {!confirmed && (
        <TouchableOpacity
          style={[planCardStyles.importBtn, { backgroundColor: colors.accentPrimary }, loading && { opacity: 0.6 }]}
          onPress={handleConfirm}
          disabled={loading}
          activeOpacity={0.75}
        >
          {loading ? (
            <Text style={planCardStyles.importBtnText}>Importing…</Text>
          ) : (
            <>
              <Ionicons name="cloud-upload-outline" size={15} color="#fff" />
              <Text style={planCardStyles.importBtnText}>Import Plan to Calendar</Text>
            </>
          )}
        </TouchableOpacity>
      )}

      <Text style={[planCardStyles.disclaimer, { color: colors.textMuted }]}>
        {confirmed
          ? '✅ Applied to your gym calendar. Will repeat every week.'
          : 'This will overwrite your recurring plan for these days permanently.'}
      </Text>
    </View>
  );
}

// ─── Add-to-Plan-Day Card ───────────────────────────────────────────────────

function AddToPlanDayCard({ card }: { card: any }) {
  const { colors, isDark } = useTheme();
  const [confirmed, setConfirmed] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await card.onConfirm?.();
      setConfirmed(true);
    } finally {
      setLoading(false);
    }
  };

  const ex = card.exercise || {};
  const dayColor = DAY_COLORS[card.dayIndex] || colors.accentPrimary;

  return (
    <View style={[addDayCardStyles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={addDayCardStyles.row}>
        <View style={[addDayCardStyles.dayPill, { backgroundColor: dayColor + '22', borderColor: dayColor + '66' }]}>
          <Text style={[addDayCardStyles.dayPillText, { color: dayColor }]}>{card.dayName}</Text>
        </View>
        <Ionicons name="add-circle-outline" size={14} color={colors.textMuted} style={{ marginHorizontal: 6 }} />
        <Text style={[addDayCardStyles.exName, { color: colors.textPrimary }]} numberOfLines={1}>{ex.name}</Text>
      </View>
      <Text style={[addDayCardStyles.exMeta, { color: colors.textMuted }]}>{ex.targetSets} sets × {ex.targetReps} reps{ex.muscle ? ` · ${ex.muscle}` : ''}</Text>

      {!confirmed ? (
        <TouchableOpacity
          style={[addDayCardStyles.addBtn, { backgroundColor: dayColor + '22', borderColor: dayColor + '55' }, loading && { opacity: 0.6 }]}
          onPress={handleConfirm}
          disabled={loading}
          activeOpacity={0.75}
        >
          <Ionicons name={loading ? 'hourglass-outline' : 'checkmark-outline'} size={14} color={dayColor} />
          <Text style={[addDayCardStyles.addBtnText, { color: dayColor }]}>
            {loading ? 'Adding…' : `Add to ${card.dayName} Plan`}
          </Text>
        </TouchableOpacity>
      ) : (
        <View style={addDayCardStyles.doneRow}>
          <Ionicons name="checkmark-circle" size={14} color={colors.accentGreen || '#4ade80'} />
          <Text style={[addDayCardStyles.doneText, { color: colors.textMuted }]}>Added to {card.dayName} — active every week</Text>
        </View>
      )}
    </View>
  );
}

const planCardStyles = StyleSheet.create({
  container: { borderRadius: 14, borderWidth: 1, padding: 14, marginTop: 2 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  headerIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: 'Inter_600SemiBold', fontSize: 14, lineHeight: 18 },
  subtitle: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 1 },
  confirmedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(74, 222, 128, 0.12)', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 4 },
  confirmedText: { fontFamily: 'Inter_600SemiBold', fontSize: 11 },
  divider: { height: 1, marginBottom: 10 },
  dayList: { gap: 6, marginBottom: 12 },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dayChip: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 3, minWidth: 38, alignItems: 'center' },
  dayChipText: { fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 0.5 },
  dayFocus: { fontFamily: 'Inter_500Medium', fontSize: 12, lineHeight: 16 },
  dayExCount: { fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 1 },
  importBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 10, paddingVertical: 11, marginBottom: 8 },
  importBtnText: { fontFamily: 'Inter_700Bold', fontSize: 13, color: '#fff', letterSpacing: 0.3 },
  disclaimer: { fontFamily: 'Inter_400Regular', fontSize: 10, textAlign: 'center', lineHeight: 14 },
});

const addDayCardStyles = StyleSheet.create({
  container: { borderRadius: 12, borderWidth: 1, padding: 12 },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 5 },
  dayPill: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 3 },
  dayPillText: { fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 0.3 },
  exName: { fontFamily: 'Inter_600SemiBold', fontSize: 13, flex: 1 },
  exMeta: { fontFamily: 'Inter_400Regular', fontSize: 11, marginBottom: 10, paddingLeft: 2 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 8, borderWidth: 1, paddingVertical: 8, paddingHorizontal: 12 },
  addBtnText: { fontFamily: 'Inter_600SemiBold', fontSize: 12 },
  doneRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  doneText: { fontFamily: 'Inter_400Regular', fontSize: 11 },
});

export function ZenGymAiModal({
  visible, 
  onClose, 
  workoutData,
  onAddExercise,
  onDeleteExercise,
  onLogSet,
  onGenerateWorkoutPlan,
  onAutoregulateDeload,
  onImportMultiDayPlan,
  onAddExerciseToPlanDay,
  userGymPlan,
  currentPlanDay,
}: Props) {

  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const mdStyles = useMemo(() => makeMdStyles(colors, isDark), [colors, isDark]);
  const { tasks, habits, gymLogs, waterLogs, sleepLogs, user, notes, goals, googleAccessToken } = useMobileData();
  const { gymProfile } = useGymProfile();
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [sessions, setSessions] = useState<StoredChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>(() => `gym_sess_${Date.now()}`);
  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  const historyRef = useRef<{ role: string; content: string }[]>([]);
  const [memorySummary, setMemorySummary] = useState<string | null>(null);
  const [gymPreferences, setGymPreferences] = useState<GymPreferences | null>(null);

  // â”€â”€ Persist a preference update â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const savePreferences = async (prefs: GymPreferences) => {
    const merged = { ...gymPreferences, ...prefs };
    setGymPreferences(merged);
    await AsyncStorage.setItem(STORAGE_KEY_PREFS, JSON.stringify(merged));
  };

  // â”€â”€ Parse user's reply to a preference question and persist it â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Called every time the user sends a message (chip tap or typed).
  const extractAndSavePref = (userText: string) => {
    const t = userText.toLowerCase();
    // Split detection
    const splitMap: Record<string, string> = {
      'ppl': 'PPL', 'push pull legs': 'PPL',
      'upper/lower': 'Upper/Lower', 'upper lower': 'Upper/Lower',
      'arnold': 'Arnold Split', 'bro split': 'Bro Split',
      'full body': 'Full Body', 'push/pull': 'Push/Pull',
      '3 day': 'Full Body (3 days)', '4 day': 'Upper/Lower',
      '5 day': 'Push/Pull (5 days)', '6 day': 'PPL',
    };
    for (const [key, val] of Object.entries(splitMap)) {
      if (t.includes(key)) { savePreferences({ preferredSplit: val }); break; }
    }
    // Exercises/day detection
    const exMatch = t.match(/(\d+)\s*exercises?/);
    if (exMatch) savePreferences({ exercisesPerDay: parseInt(exMatch[1]) });
    // Focus detection
    if (t.includes('hypertrophy') || t.includes('muscle')) savePreferences({ preferredFocus: 'hypertrophy' });
    else if (t.includes('strength') || t.includes('heavy')) savePreferences({ preferredFocus: 'strength' });
    else if (t.includes('fat loss') || t.includes('cut')) savePreferences({ preferredFocus: 'fat loss' });
    // Days/week detection
    const daysMatch = t.match(/(\d+)\s*days?\s*(a|per)?\s*week/);
    if (daysMatch) savePreferences({ trainingDaysPerWeek: parseInt(daysMatch[1]) });
  };
  // â”€â”€ Context-aware personalised nudges â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Derives the user's workout phase from real data and picks the right pills.
  const smartNudges = useMemo(() => {
    const muscles = workoutData?.activeMuscles || '';
    const doneSets = workoutData?.doneSets ?? 0;
    const totalSets = workoutData?.totalSets ?? 0;
    const planName = currentPlanDay?.name || '';
    const exercises = currentPlanDay?.exercises || [];
    const firstEx = exercises[0]?.name || 'your first exercise';
    const lastEx = exercises[exercises.length - 1]?.name || 'last exercise';
    const focus = currentPlanDay?.focus || muscles || 'today\'s session';

    // Determine workout phase
    const isPreWorkout = doneSets === 0;
    const isPostWorkout = totalSets > 0 && doneSets >= totalSets;
    const isMidWorkout = !isPreWorkout && !isPostWorkout;

    // Last session: find the most recent completed gymLog
    const now = new Date();
    const todayY = now.getFullYear();
    const todayM = String(now.getMonth() + 1).padStart(2, '0');
    const todayD = String(now.getDate()).padStart(2, '0');
    const todayStr = `${todayY}-${todayM}-${todayD}`;
    const recentLog = (gymLogs || [])
      .filter((l: any) => l.date < todayStr && l.exercises?.some((e: any) => e.setsLog?.some((s: any) => s.completed)))
      .sort((a: any, b: any) => b.date.localeCompare(a.date))[0];
    const lastMuscles = recentLog?.exercises?.map((e: any) => e.muscle).filter(Boolean).join(', ') || '';
    const lastDuration = recentLog?.workoutDurationMinutes ? `${recentLog.workoutDurationMinutes}min` : null;

    const profileGoal = gymProfile?.goal || '';
    const experience = gymProfile?.experience || '';

    if (isPreWorkout) {
      // ── BEFORE workout ──────────────────────────────────────────────
      return [
        planName ? `Warm-up protocol for ${planName} 🔥` : `Give me a warm-up routine 🔥`,
        focus ? `Best S-Tier exercises for ${focus}` : `What are the best exercises for today?`,
        lastDuration ? `Last session was ${lastDuration} — am I recovered?` : `Am I recovered and ready to train hard?`,
        profileGoal === 'hypertrophy' ? `Optimal rep ranges for hypertrophy today` : profileGoal === 'strength' ? `How to set up my heavy sets today?` : `Today's training strategy for my goal`,
        `What should I eat before training now?`,
        firstEx ? `Break down ${firstEx} technique` : `How should I approach my first exercise?`,
        `Check my fatigue level based on recent sessions`,
        experience === 'beginner' ? `Beginner tips for today` : `How hard should I push today?`,
      ].slice(0, 7);
    } else if (isMidWorkout) {
      // ── MID workout ─────────────────────────────────────────────────
      const completedRatio = totalSets > 0 ? Math.round((doneSets / totalSets) * 100) : 0;
      return [
        `I'm ${completedRatio}% done — should I push harder or conserve?`,
        muscles ? `Should I increase weight on ${muscles} today?` : `Should I increase my working weight?`,
        `Diagnose my rep falloff — am I resting enough?`,
        lastEx ? `Breakdown technique for ${lastEx}` : `Break down my next exercise`,
        `Give me a superset to pair with what I'm doing now`,
        `How long should I rest right now?`,
        muscles ? `S-Tier swaps for ${muscles} if I'm fatigued` : `Best exercise to swap if I'm fatigued`,
        `Am I approaching junk volume? Should I cut sets?`,
      ].slice(0, 7);
    } else {
      // ── POST workout ────────────────────────────────────────────────
      return [
        focus ? `Best cooldown + stretches for ${focus} 🧘` : `Best cooldown stretches for today 🧘`,
        `Rate my session performance and give a diagnosis`,
        `What should I eat now for optimal recovery?`,
        `How many rest days do I need before hitting ${focus || 'this muscle'} again?`,
        lastMuscles ? `I just trained ${focus} — what should I train next session?` : `What should my next workout be?`,
        `Check if I'm at risk of overtraining this week`,
        profileGoal === 'hypertrophy' ? `Am I accumulating enough volume for hypertrophy?` : `Am I progressing optimally toward my goal?`,
        `Build me a recovery plan for the next 24 hours`,
      ].slice(0, 7);
    }
  }, [workoutData?.doneSets, workoutData?.totalSets, workoutData?.activeMuscles, currentPlanDay?.name, currentPlanDay?.focus, gymLogs, gymProfile?.goal, gymProfile?.experience]);


  const [selectedModel, setSelectedModel] = useState<string>('gemini-3.7-flash');

  useEffect(() => {
    AsyncStorage.getItem('zen_preferred_gym_model').then(m => { if (m) setSelectedModel(m); });
    AsyncStorage.getItem('gym_memory_summary').then(s => { if (s) setMemorySummary(s); });
    AsyncStorage.getItem(STORAGE_KEY_PREFS).then(s => { if (s) setGymPreferences(JSON.parse(s)); });
    loadStoredSessions();
  }, []);

  const toggleModel = () => {
    feedback.selectionChange();
    const nextModel = selectedModel === 'gemini-3.7-flash' ? 'gemini-2.5-flash' : 'gemini-3.7-flash';
    setSelectedModel(nextModel);
    AsyncStorage.setItem('zen_preferred_gym_model', nextModel).catch(console.error);
  };

  const loadStoredSessions = async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY_SESSIONS);
      if (raw) {
        const parsed: StoredChatSession[] = JSON.parse(raw);
        setSessions(parsed);
      }
    } catch (e) {
      console.warn('[GymGPT] Failed to load chat history:', e);
    }
  };

  const persistSession = async (updatedMessages: ChatMessage[], updatedHistory: { role: string; content: string }[]) => {
    if (updatedMessages.length === 0) return;
    try {
      const firstUserMsg = updatedMessages.find(m => m.role === 'user');
      const title = firstUserMsg ? (firstUserMsg.text.length > 32 ? firstUserMsg.text.slice(0, 32) + '...' : firstUserMsg.text) : 'Coaching Session';
      
      const sessionObj: StoredChatSession = {
        id: currentSessionId,
        title,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: updatedMessages,
        history: updatedHistory,
      };

      setSessions(prev => {
        const existingIdx = prev.findIndex(s => s.id === currentSessionId);
        let newSessions: StoredChatSession[];
        if (existingIdx >= 0) {
          newSessions = [...prev];
          newSessions[existingIdx] = { ...newSessions[existingIdx], updatedAt: Date.now(), messages: updatedMessages, history: updatedHistory };
        } else {
          newSessions = [sessionObj, ...prev];
        }
        AsyncStorage.setItem(STORAGE_KEY_SESSIONS, JSON.stringify(newSessions)).catch(console.error);
        return newSessions;
      });
    } catch (e) {
      console.warn('[GymGPT] Failed to save session:', e);
    }
  };

  // Auto-send session overview when modal first opens (visible becomes true)
  const hasAutoGreetedRef = useRef(false);
  useEffect(() => {
    if (visible && !hasAutoGreetedRef.current && gymLogs && gymLogs.length > 0 && messages.length === 0) {
      hasAutoGreetedRef.current = true;
      const today = new Date().toISOString().split('T')[0];
      const todayLog = gymLogs.find((l: any) => l.date === today);
      const sessionsDone = todayLog?.exercises?.filter((e: any) => e.setsLog?.some((s: any) => s.completed))?.length || 0;
      const greet = sessionsDone > 0
        ? `Give me a quick personalised session overview: what I've done so far today and your top recommendation for the rest of this workout.`
        : `Give me a personalised pre-workout briefing for today: fatigue assessment based on my recent sessions, top coaching tip, and recommended warm-up.`;
      setTimeout(() => handleAsk(greet), 500);
    }
  }, [visible]);

  // â”€â”€ Keyboard lift animation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Drives inputArea bottom padding. Using direct Keyboard events instead of
  // KeyboardAvoidingView because KAV inside a full-screen Modal with SafeAreaView
  // edges=['top'] causes the input to float mid-screen after keyboard dismissal.
  const keyboardOffsetAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const onShow = (e: any) => {
      Animated.timing(keyboardOffsetAnim, {
        toValue: e.endCoordinates.height,
        duration: Platform.OS === 'ios' ? (e.duration || 250) : 160,
        useNativeDriver: false,
      }).start();
    };

    const onHide = (e: any) => {
      Animated.timing(keyboardOffsetAnim, {
        toValue: 0,
        duration: Platform.OS === 'ios' ? (e.duration || 250) : 160,
        useNativeDriver: false,
      }).start();
    };

    const subShow = Keyboard.addListener(showEvent, onShow);
    const subHide = Keyboard.addListener(hideEvent, onHide);
    return () => { subShow.remove(); subHide.remove(); };
  }, []);


  const handleAsk = async (overridePrompt?: string) => {
    const question = (overridePrompt || prompt).trim();
    if (!question || loading) return;

    feedback.commit();
    setPrompt('');

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: question,
    };

    // Silently extract any preference signals from what user typed/tapped
    extractAndSavePref(question);
    const thinkingMsg: ChatMessage = {
      id: `t-${Date.now()}`,
      role: 'thinking',
      text: 'GYM-GPT is analyzing...',
    };

    const newMessages = [...messages, userMsg, thinkingMsg];
    setMessages(newMessages);
    setLoading(true);

    const newHistory = [
      ...historyRef.current,
      { role: 'user', content: question },
    ];
    historyRef.current = newHistory;

    // Build rich context including gym profile and last 10 sessions
    // Use local date (not UTC) to avoid IST midnight off-by-one
    const nowLocal = new Date();
    const todayY = nowLocal.getFullYear();
    const todayM = String(nowLocal.getMonth() + 1).padStart(2, '0');
    const todayD = String(nowLocal.getDate()).padStart(2, '0');
    const today = `${todayY}-${todayM}-${todayD}`;
    const todayLog = gymLogs?.find((l: any) => l.date === today);
    const dayOfWeek = nowLocal.getDay();
    const todayPlanIndex = WEEKDAY_TO_PLAN[dayOfWeek] || 7;
    // FIX: Use currentPlanDay (from useGymLog â€” already custom-plan-aware) first,
    // then fallback to getCustomPlanDay, then fallback to static template.
    const todayPlan = currentPlanDay ||
      getCustomPlanDay(userGymPlan?.customDays, todayPlanIndex) ||
      GYM_PLAN.find(p => p.dayIndex === todayPlanIndex);

    try {
      const appContext = {
        tasks: tasks ?? [],
        habits: habits ?? [],
        notes: notes ?? [],
        goals: goals ?? [],
        gymLogs: gymLogs ?? [],
        waterLogs: waterLogs ?? [],
        sleepLogs: sleepLogs ?? [],
        gymPreferences: gymPreferences ?? undefined,
        // FIX: Use live log exercises first; fallback to today's CUSTOM plan (not static)
        exercises: todayLog?.exercises ?? (todayPlan?.exercises ?? []),
        workoutDayName: (todayLog as any)?.dayName || todayPlan?.name || "Today's Session",
        googleAccessToken: googleAccessToken ?? '',
        userId: user?.uid ?? '',
        memorySummary: memorySummary ?? undefined,
        gymProfile: gymProfile ?? null,
        // NEW: Pass full custom plan and today's resolved plan day
        userGymPlan: userGymPlan ?? null,
        gymPlanDay: todayPlan ?? null,
      };

      const result = await processGymChat(
        question,
        historyRef.current,
        appContext,
        selectedModel
      );

      let responseText = '';
      let generatedActionCard: any = undefined;
      if (result.type === 'function_call') {
        const actionType = result.name || result.args?.type;
        const { args } = result;

        if (actionType === 'addExerciseToWorkout' && onAddExercise) {
          onAddExercise(args.exerciseName, args.targetSets, args.targetReps);
          responseText = `âœ… Added **${args.exerciseName}** (${args.targetSets}Ã—${args.targetReps}) to today's workout.`;

        } else if ((actionType === 'removeExercise' || actionType === 'deleteExercise') && onDeleteExercise) {
          const exId: string = args.exerciseId || args.exerciseName || '';
          if (exId) onDeleteExercise(exId);
          responseText = `âœ… Removed **${args.exerciseName || 'exercise'}** from your workout.`;

        } else if (actionType === 'logWorkoutSet' && onLogSet) {
          const setIdx = (args.setNumber || 1) - 1;
          onLogSet(args.exerciseIndex ?? 0, setIdx, args.weightKg ?? 0, args.reps);
          responseText = `âœ… Logged set ${args.setNumber}: \`${args.weightKg}kg\` Ã— \`${args.reps} reps\``;

        } else if (actionType === 'importMultiDayPlan') {
          // Multi-day plan import â†’ renders a Confirm Card; actual write happens on user tap
          const days: MultiDayPlanEntry[] = args.days || [];
          const totalExercises = days.reduce((s: number, d: MultiDayPlanEntry) => s + (d.exercises?.length || 0), 0);
          responseText = result.text || `I've built your **${args.planName || 'Training Plan'}** â€” ${days.length} day${days.length !== 1 ? 's' : ''}, ${totalExercises} exercises total. Tap **Import Plan** to apply this to your gym calendar permanently.`;
          generatedActionCard = {
            actionType: 'multiDayPlan',
            planName: args.planName || 'Training Plan',
            days,
            onConfirm: async () => {
              if (onImportMultiDayPlan) await onImportMultiDayPlan(args.planName || 'Training Plan', days);
            },
          };

        } else if (actionType === 'addExerciseToPlanDay') {
          // Add exercise to a specific recurring plan day â†’ Confirm Card
          const exName = args.exerciseName;
          const dayName = args.dayName || `Day ${args.dayIndex}`;
          responseText = result.text || `Ready to add **${exName}** to your **${dayName}** plan permanently.`;
          generatedActionCard = {
            actionType: 'addToPlanDay',
            dayIndex: args.dayIndex,
            dayName,
            exercise: { name: exName, targetSets: args.targetSets, targetReps: args.targetReps, muscle: args.muscle },
            onConfirm: async () => {
              if (onAddExerciseToPlanDay) await onAddExerciseToPlanDay(args.dayIndex, dayName, { name: exName, targetSets: args.targetSets, targetReps: args.targetReps, muscle: args.muscle });
            },
          };

        } else if (actionType === 'generateWorkoutPlan' && onGenerateWorkoutPlan) {
          responseText = result.text || "I've assembled your optimized workout plan for today.";
          generatedActionCard = {
            actionType: 'gym',
            title: `Today's Plan: ${args.planName}`,
            description: `${args.exercises?.length || 0} exercises for today's session.`,
            meta: args.exercises,
            onConfirm: () => { onGenerateWorkoutPlan(args.planName, args.exercises); },
          };

        } else if (actionType === 'autoregulateDeload' && onAutoregulateDeload) {
          onAutoregulateDeload();
          responseText = `ðŸ›¡ï¸ **Autoregulated Deload Activated:** Reduced working volume across all exercises to safeguard CNS recovery.`;
        } else {
          responseText = result.text || 'Action completed.';
        }
      } else {
        responseText = result.text;
      }

      const finalMessages = messages
        .filter(m => m.role !== 'thinking')
        .concat([
          userMsg,
          {
            id: `g-${Date.now()}`,
            role: 'gains',
            text: responseText,
            actionCard: generatedActionCard,
            options: result.options && result.options.length > 0 ? result.options : undefined,
          }
        ]);

      setMessages(finalMessages);

      historyRef.current = [
        ...newHistory,
        { role: 'model', content: responseText },
      ];

      // Persist session to history
      persistSession(finalMessages, historyRef.current);

      // Compress memory if history gets long (>15 messages)
      if (historyRef.current.length > 15) {
        compressMemoryToSummary(historyRef.current).then(sum => {
          AsyncStorage.setItem('gym_memory_summary', sum);
          setMemorySummary(sum);
        }).catch(console.error);
      }
    } catch (err: any) {
      setMessages(prev =>
        prev
          .filter(m => m.role !== 'thinking')
          .concat({
            id: `err-${Date.now()}`,
            role: 'gains',
            text: `âš ï¸ Error: ${err?.message || 'Failed to connect. Check internet.'}`,
          })
      );
    } finally {
      setLoading(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  const toggleSpeak = (text: string) => {
    if (isSpeaking) {
      Speech.stop();
      setIsSpeaking(false);
    } else {
      setIsSpeaking(true);
      Speech.speak(text, {
        onDone: () => setIsSpeaking(false),
        onError: () => setIsSpeaking(false),
      });
    }
  };

  const handleStartNewChat = () => {
    feedback.tap();
    setMessages([]);
    historyRef.current = [];
    setCurrentSessionId(`gym_sess_${Date.now()}`);
    setShowHistoryModal(false);
  };

  const handleSelectSession = (session: StoredChatSession) => {
    feedback.tap();
    setCurrentSessionId(session.id);
    setMessages(session.messages || []);
    historyRef.current = session.history || [];
    setShowHistoryModal(false);
  };

  const handleDeleteSession = async (sessionId: string) => {
    feedback.tap();
    const updated = sessions.filter(s => s.id !== sessionId);
    setSessions(updated);
    await AsyncStorage.setItem(STORAGE_KEY_SESSIONS, JSON.stringify(updated));
    if (currentSessionId === sessionId) {
      handleStartNewChat();
    }
  };

  const handleClearAllHistory = async () => {
    feedback.tap();
    setSessions([]);
    await AsyncStorage.removeItem(STORAGE_KEY_SESSIONS);
    handleStartNewChat();
  };

  const handleClearCurrentChat = () => {
    feedback.tap();
    setMessages([]);
    historyRef.current = [];
    setCurrentSessionId(`gym_sess_${Date.now()}`);
  };

  // ── Drag-to-fullscreen gesture ──────────────────────────────────────────────
  const SCREEN_HEIGHT = Dimensions.get('window').height;
  const SNAP_PARTIAL = 0.85;  // 85% height
  const SNAP_FULL   = 1.0;    // 100% height

  // Use a ref so the PanResponder closure always reads the latest value
  const [isFullScreen, setIsFullScreen] = React.useState(false);
  const isFullScreenRef = useRef(false);
  const sheetTranslateY = useRef(new Animated.Value(0)).current;

  const setFullScreen = (val: boolean) => {
    isFullScreenRef.current = val;
    setIsFullScreen(val);
  };

  // Reset when modal becomes visible
  useEffect(() => {
    if (visible) {
      setFullScreen(false);
      sheetTranslateY.setValue(0);
    }
  }, [visible]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, { dy, dx }) => {
        // Only capture significant vertical swipes
        return Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx);
      },
      onPanResponderGrant: () => {
        sheetTranslateY.stopAnimation();
      },
      onPanResponderMove: (_, { dy }) => {
        // Read from ref — never stale
        if (isFullScreenRef.current) {
          sheetTranslateY.setValue(Math.max(0, dy));
        } else {
          // Allow pull-up (negative) and pull-down
          sheetTranslateY.setValue(dy);
        }
      },
      onPanResponderRelease: (_, { dy, vy }) => {
        if (isFullScreenRef.current) {
          if (dy > 80 || vy > 0.6) {
            // Pull-down → collapse back to 85%
            Animated.spring(sheetTranslateY, {
              toValue: 0,
              useNativeDriver: true,
              damping: 20,
              stiffness: 180,
            }).start(() => {
              setFullScreen(false);
              sheetTranslateY.setValue(0);
            });
          } else {
            // Snap back to full-screen
            Animated.spring(sheetTranslateY, {
              toValue: 0,
              useNativeDriver: true,
              damping: 20,
              stiffness: 200,
            }).start();
          }
        } else {
          if (dy < -60 || vy < -0.5) {
            // Pull-up → expand to full screen
            const expandDelta = -(SCREEN_HEIGHT * (SNAP_FULL - SNAP_PARTIAL));
            Animated.spring(sheetTranslateY, {
              toValue: expandDelta,
              useNativeDriver: true,
              damping: 20,
              stiffness: 180,
            }).start(() => {
              setFullScreen(true);
              sheetTranslateY.setValue(0);
            });
          } else if (dy > 100 || vy > 0.8) {
            // Big pull-down → close modal
            Animated.timing(sheetTranslateY, {
              toValue: SCREEN_HEIGHT,
              duration: 260,
              useNativeDriver: true,
            }).start(() => {
              sheetTranslateY.setValue(0);
              setFullScreen(false);
              onClose();
            });
          } else {
            // Snap back to 85%
            Animated.spring(sheetTranslateY, {
              toValue: 0,
              useNativeDriver: true,
              damping: 20,
              stiffness: 200,
            }).start();
          }
        }
      },
    })
  ).current;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      transparent={true}
      statusBarTranslucent
    >
      <View style={styles.modalOverlay}>
        <StatusBar style="light" />
        {/* Backdrop – tap to close */}
        <Pressable style={styles.backdrop} onPress={onClose} />
        {/* Animated sheet */}
        <Animated.View
          style={[
            styles.sheetContainer,
            isFullScreen && styles.sheetContainerFull,
            { transform: [{ translateY: sheetTranslateY }] },
          ]}
        >
          <View style={styles.keyboardContainer}>
            {/* Compact Header: drag handle + title + actions all in one row */}
            <View
              style={[
                styles.header,
                isFullScreen && {
                  paddingTop: Math.max(insets.top, Platform.OS === 'android' ? 24 : 0) + 2,
                },
              ]}
            >
              {/* Left: close button */}
              <TouchableOpacity onPress={onClose} style={styles.headerIconBtn} activeOpacity={0.7}>
                <Ionicons name="chevron-down" size={16} color="#a1a1aa" />
              </TouchableOpacity>

              {/* Center: drag handle (in partial mode) + title */}
              <View style={styles.headerCenter}>
                {!isFullScreen && <View style={styles.dragHandle} />}
                <View style={styles.titleRow}>
                  <Text style={styles.headerTitle}>GYM-GPT</Text>
                  <View style={styles.onlineDot} />
                </View>
              </View>

              {/* Right: expand + history + clear + profile */}
              <View style={styles.headerRight}>
                {/* Fullscreen toggle */}
                <TouchableOpacity
                  onPress={() => {
                    feedback.tap();
                    setFullScreen(!isFullScreenRef.current);
                    sheetTranslateY.setValue(0);
                  }}
                  style={styles.headerIconBtn}
                  activeOpacity={0.7}
                  accessibilityLabel={isFullScreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                >
                  <Ionicons
                    name={isFullScreen ? 'contract-outline' : 'expand-outline'}
                    size={15}
                    color="#a599ff"
                  />
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => { feedback.tap(); setShowHistoryModal(true); }}
                  style={styles.headerIconBtn}
                  activeOpacity={0.7}
                  accessibilityLabel="Chat History"
                >
                  <Ionicons name="time-outline" size={15} color="#d4d4d8" />
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    feedback.tap();
                    if (messages.length > 0) {
                      Alert.alert(
                        'Clear Conversation',
                        'Start a fresh chat with GYM-GPT? Previous messages will remain in your history.',
                        [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Clear Chat', style: 'destructive', onPress: handleStartNewChat },
                        ]
                      );
                    } else {
                      handleStartNewChat();
                    }
                  }}
                  style={styles.headerIconBtn}
                  activeOpacity={0.7}
                  accessibilityLabel="Clear Conversation"
                >
                  <Ionicons
                    name={messages.length > 0 ? 'trash-outline' : 'create-outline'}
                    size={14}
                    color={messages.length > 0 ? '#f87171' : '#d4d4d8'}
                  />
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={toggleModel}
                  style={styles.modelToggleBtn}
                  activeOpacity={0.7}
                  accessibilityLabel="Toggle Gemini Model"
                >
                  <Text style={styles.modelToggleText}>
                    {selectedModel === 'gemini-3.7-flash' ? '👑 3.7' : '⚡ 2.5'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => { feedback.tap(); setShowProfileModal(true); }}
                  style={styles.profileBtn}
                  activeOpacity={0.7}
                  accessibilityLabel="Coach Settings"
                >
                  <Ionicons name="person-outline" size={13} color="#a599ff" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Quick Prompts Horizontal Carousel */}
            <View style={styles.quickPromptsWrapper}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.quickPrompts}
              >
                {smartNudges.map((q, i) => (
                  <TouchableOpacity
                    key={i}
                    style={styles.quickPill}
                    onPress={() => handleAsk(q)}
                    disabled={loading}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.quickPillText}>{q}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            {/* Chat Conversation Area */}
            <ScrollView
              ref={scrollRef}
              style={styles.chatArea}
              contentContainerStyle={styles.chatContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
            >
              {messages.length === 0 && (
                <View style={styles.emptyState}>
                  <View style={styles.emptyLogo}>
                    <Image
                      source={require('../../../assets/images/sara-idle.png')}
                      style={{ width: 48, height: 48 }}
                      resizeMode="contain"
                    />
                  </View>
                  <Text style={styles.emptyTitle}>GYM-GPT</Text>
                  <Text style={styles.emptySubtitle}>Science-backed hypertrophy, progressive overload, & biomechanics intelligence.</Text>
                </View>
              )}

              {messages.map(msg => (
                <View key={msg.id} style={msg.role === 'user' ? styles.userRow : styles.assistantRow}>
                  {msg.role === 'user' ? (
                    <View style={styles.userBubble}>
                      <Text style={styles.userBubbleText}>{msg.text}</Text>
                    </View>
                  ) : (
                    <View style={styles.assistantMessageContainer}>
                      <View style={styles.assistantHeader}>
                        <View style={styles.assistantAvatar}>
                          <Image
                            source={require('../../../assets/images/sara-idle.png')}
                            style={{ width: 16, height: 16 }}
                            resizeMode="contain"
                          />
                        </View>
                        <Text style={styles.assistantName}>GYM-GPT</Text>
                      </View>

                      {msg.role === 'thinking' ? (
                        <View style={styles.thinkingContainer}>
                          <TypingDots />
                        </View>
                      ) : (
                        <View style={styles.markdownWrapper}>
                          <Markdown style={mdStyles}>{msg.text}</Markdown>

                          <View style={styles.assistantActions}>
                            <TouchableOpacity
                              onPress={() => toggleSpeak(msg.text)}
                              style={styles.actionIconBtn}
                              activeOpacity={0.7}
                            >
                              <Ionicons
                                name={isSpeaking ? 'pause-circle-outline' : 'volume-medium-outline'}
                                size={17}
                                color="#71717a"
                              />
                            </TouchableOpacity>
                          </View>
                        </View>
                      )}

                      {msg.actionCard && (
                        <View style={{ marginTop: 14, width: '100%' }}>
                          {msg.actionCard.actionType === 'multiDayPlan' ? (
                            <MultiDayPlanCard card={msg.actionCard} />
                          ) : msg.actionCard.actionType === 'addToPlanDay' ? (
                            <AddToPlanDayCard card={msg.actionCard} />
                          ) : (
                            <ActionConfirmationCard {...msg.actionCard} />
                          )}
                        </View>
                      )}

                      {/* Option Chips â€” interactive preference selection */}
                      {msg.options && msg.options.length > 0 && (
                        <OptionsChips
                          options={msg.options}
                          onSelect={(opt) => handleAsk(opt)}
                          onWriteOwn={() => {
                            // Focus the TextInput so user can type their own answer
                            inputRef.current?.focus();
                          }}
                          disabled={loading}
                        />
                      )}
                    </View>
                  )}
                </View>
              ))}
            </ScrollView>

            {/* ChatGPT Capsule Input */}
            <Animated.View
              style={[
                styles.inputArea,
                {
                  bottom: keyboardOffsetAnim,
                  paddingBottom: Math.max(insets.bottom, 12),
                },
              ]}
            >
              <View style={styles.inputCapsule}>
                <TextInput
                  ref={inputRef}
                  style={styles.input}
                  placeholder="Ask GYM-GPT anything..."
                  placeholderTextColor="#71717a"
                  value={prompt}
                  onChangeText={setPrompt}
                  onSubmitEditing={() => handleAsk()}
                  multiline
                  maxLength={500}
                  editable={!loading}
                />
                <TouchableOpacity
                  style={[styles.sendBtn, (!prompt.trim() || loading) && styles.sendBtnDisabled]}
                  onPress={() => handleAsk()}
                  disabled={loading || !prompt.trim()}
                  activeOpacity={0.8}
                >
                  <Ionicons name="arrow-up" size={20} color="#000000" />
                </TouchableOpacity>
              </View>
            </Animated.View>
          </View>
        </Animated.View>
      </View>

      {/* Gym Chat History Modal */}
      <Modal 
        visible={showHistoryModal} 
        animationType="slide" 
        onRequestClose={() => setShowHistoryModal(false)}
        statusBarTranslucent
      >
        <View style={styles.historyRoot}>
          <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
            <View style={styles.historyHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ionicons name="time" size={20} color="#a599ff" />
                <Text style={styles.historyHeaderTitle}>Chat History</Text>
              </View>
              
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <TouchableOpacity 
                  onPress={handleStartNewChat} 
                  style={styles.newChatBtn}
                  activeOpacity={0.7}
                >
                  <Ionicons name="add" size={16} color="#000000" />
                  <Text style={styles.newChatBtnText}>New Chat</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  onPress={() => setShowHistoryModal(false)} 
                  style={styles.historyCloseBtn}
                  activeOpacity={0.7}
                >
                  <Ionicons name="close" size={22} color="#ffffff" />
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView 
              style={styles.historyList}
              contentContainerStyle={styles.historyListContent}
              showsVerticalScrollIndicator={false}
            >
              {sessions.length === 0 ? (
                <View style={styles.historyEmptyState}>
                  <View style={styles.historyEmptyIcon}>
                    <Ionicons name="chatbubbles-outline" size={36} color={colors.textMuted} />
                  </View>
                  <Text style={styles.historyEmptyTitle}>No Past Chats</Text>
                  <Text style={styles.historyEmptySubtitle}>
                    Your conversations with GYM-GPT will be automatically saved here so you can review your training logs and coaching history anytime.
                  </Text>
                </View>
              ) : (
                <>
                  {sessions.map(session => {
                    const isCurrent = session.id === currentSessionId;
                    const dateStr = new Date(session.updatedAt).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    });
                    const lastMsg = session.messages && session.messages.length > 0 
                      ? session.messages[session.messages.length - 1].text 
                      : 'No messages';

                    return (
                      <TouchableOpacity
                        key={session.id}
                        style={[styles.historyCard, isCurrent && styles.historyCardActive]}
                        onPress={() => handleSelectSession(session)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.historyCardHeader}>
                          <Text style={styles.historyCardTitle} numberOfLines={1}>
                            {session.title || 'Coaching Session'}
                          </Text>
                          <TouchableOpacity 
                            onPress={() => handleDeleteSession(session.id)}
                            style={styles.historyDeleteBtn}
                            activeOpacity={0.7}
                          >
                            <Ionicons name="trash-outline" size={16} color={colors.textMuted} />
                          </TouchableOpacity>
                        </View>

                        <Text style={styles.historyCardSnippet} numberOfLines={2}>
                          {lastMsg}
                        </Text>

                        <View style={styles.historyCardFooter}>
                          <Text style={styles.historyCardDate}>{dateStr}</Text>
                          <View style={styles.historyMsgBadge}>
                            <Text style={styles.historyMsgBadgeText}>
                              {session.messages?.length || 0} msgs
                            </Text>
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  })}

                  <TouchableOpacity 
                    onPress={handleClearAllHistory}
                    style={styles.clearAllBtn}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="trash-bin-outline" size={15} color={colors.error || "#ef4444"} />
                    <Text style={styles.clearAllBtnText}>Clear All History</Text>
                  </TouchableOpacity>
                </>
              )}
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>

      {/* Gym Profile Modal */}
      <GymProfileModal visible={showProfileModal} onClose={() => setShowProfileModal(false)} />
    </Modal>
  );
}

const makeStyles = (colors: any, isDark: boolean = true) => StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: isDark ? 'rgba(0, 0, 0, 0.65)' : 'rgba(0, 0, 0, 0.35)',
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheetContainer: {
    height: '85%',
    backgroundColor: colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    shadowColor: isDark ? '#000' : 'rgba(0,0,0,0.1)',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: isDark ? 0.5 : 0.15,
    shadowRadius: 16,
    elevation: 24,
  },
  sheetContainerFull: {
    height: '100%',
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderWidth: 0,
  },
  dragHandle: {
    width: 32,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: isDark ? 'rgba(255, 255, 255, 0.25)' : 'rgba(0, 0, 0, 0.2)',
    marginBottom: 2,
  },
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  keyboardContainer: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 6,
    paddingTop: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: 'transparent',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  headerIconBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  headerTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 14,
    color: colors.textPrimary,
    letterSpacing: 0.3,
  },
  onlineDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#22c55e',
  },
  headerSub: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 1,
    letterSpacing: 0.2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  modelToggleBtn: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modelToggleText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 10.5,
    color: colors.textPrimary,
  },
  profileBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: isDark ? 'rgba(165,153,255,0.12)' : 'rgba(108,92,231,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: isDark ? 'rgba(165,153,255,0.25)' : 'rgba(108,92,231,0.2)',
  },

  quickPromptsWrapper: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  quickPrompts: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
    alignItems: 'center',
  },
  quickPill: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
    shadowColor: isDark ? '#000' : 'rgba(0,0,0,0.03)',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  quickPillText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 11.5,
    color: colors.textPrimary,
  },

  chatArea: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  chatContent: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 88,
    gap: 14,
  },

  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 32,
  },
  emptyLogo: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 20,
    color: colors.textPrimary,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 13.5,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },

  userRow: {
    alignItems: 'flex-end',
    width: '100%',
  },
  userBubble: {
    backgroundColor: isDark ? '#27272a' : (colors.accentAmber || colors.accentPrimary),
    borderRadius: 20,
    borderBottomRightRadius: 6,
    paddingHorizontal: 15,
    paddingVertical: 10,
    maxWidth: '88%',
    shadowColor: isDark ? '#000' : colors.accentAmber,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  userBubbleText: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 15,
    color: '#ffffff',
    lineHeight: 22,
  },

  assistantRow: {
    width: '100%',
  },
  assistantMessageContainer: {
    width: '100%',
  },
  assistantHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  assistantAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: isDark ? 'rgba(165,153,255,0.15)' : 'rgba(108,92,231,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  assistantName: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 12.5,
    color: colors.accentPrimary,
    letterSpacing: 0.2,
  },
  markdownWrapper: {
    width: '100%',
    paddingLeft: 0,
  },
  thinkingContainer: {
    paddingLeft: 0,
    paddingVertical: 4,
  },
  assistantActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
  },
  actionIconBtn: {
    padding: 4,
  },

  inputArea: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 14,
    paddingTop: 6,
    backgroundColor: 'transparent',
    zIndex: 10,
  },
  inputCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: colors.border,
    paddingLeft: 16,
    paddingRight: 6,
    minHeight: 46,
    shadowColor: isDark ? '#000' : 'rgba(0,0,0,0.06)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  input: {
    flex: 1,
    fontFamily: FONT_FAMILY.body,
    fontSize: 15,
    color: colors.textPrimary,
    maxHeight: 100,
    paddingVertical: 10,
  },
  sendBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.accentPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.3,
  },

  /* History Modal Styles */
  historyRoot: {
    flex: 1,
    backgroundColor: colors.background,
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  historyHeaderTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 17,
    color: colors.textPrimary,
  },
  newChatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.accentPrimary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  newChatBtnText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 12,
    color: '#ffffff',
  },
  historyCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyList: {
    flex: 1,
    backgroundColor: colors.background,
  },
  historyListContent: {
    padding: 16,
    gap: 12,
    paddingBottom: 40,
  },
  historyEmptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    paddingHorizontal: 32,
  },
  historyEmptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  historyEmptyTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 18,
    color: colors.textPrimary,
    marginBottom: 8,
  },
  historyEmptySubtitle: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 13.5,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  historyCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  historyCardActive: {
    borderColor: colors.accentPrimary,
    backgroundColor: isDark ? '#181822' : '#F0EFF7',
  },
  historyCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  historyCardTitle: {
    flex: 1,
    fontFamily: FONT_FAMILY.bold,
    fontSize: 15,
    color: colors.textPrimary,
  },
  historyDeleteBtn: {
    padding: 4,
  },
  historyCardSnippet: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 18,
  },
  historyCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  historyCardDate: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 11.5,
    color: colors.textMuted,
  },
  historyMsgBadge: {
    backgroundColor: isDark ? 'rgba(165,153,255,0.12)' : 'rgba(108,92,231,0.08)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  historyMsgBadgeText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 11,
    color: colors.accentPrimary,
  },
  clearAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    marginTop: 12,
  },
  clearAllBtnText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 13,
    color: colors.error || '#ef4444',
  },
});

// Markdown styles for GYM-GPT responses
const makeMdStyles = (colors: any, isDark: boolean = true) => StyleSheet.create({
  body: {
    color: colors.textPrimary,
    fontFamily: 'Inter_400Regular',
    fontSize: 14.5,
    lineHeight: 22,
  },
  heading1: {
    color: colors.textPrimary,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 17,
    fontWeight: '700',
    marginTop: 12,
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  heading2: {
    color: colors.accentPrimary,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 12,
    marginBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: isDark ? 'rgba(165,153,255,0.22)' : 'rgba(108,92,231,0.2)',
    paddingBottom: 4,
  },
  heading3: {
    color: colors.textPrimary,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13.5,
    fontWeight: '600',
    marginTop: 8,
    marginBottom: 3,
  },
  strong: {
    fontFamily: 'Inter_600SemiBold',
    fontWeight: '700',
    color: colors.textPrimary,
  },
  em: {
    fontStyle: 'italic',
    color: colors.accentPrimary,
  },
  bullet_list: {
    marginVertical: 3,
  },
  ordered_list: {
    marginVertical: 3,
  },
  list_item: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  bullet_list_icon: {
    color: colors.accentPrimary,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    lineHeight: 22,
    marginRight: 6,
    marginTop: 0,
  },
  ordered_list_icon: {
    color: colors.accentPrimary,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    lineHeight: 22,
    marginRight: 6,
    minWidth: 18,
  },
  bullet_list_content: {
    flex: 1,
    color: colors.textPrimary,
    fontFamily: 'Inter_400Regular',
    fontSize: 14.5,
    lineHeight: 22,
  },
  ordered_list_content: {
    flex: 1,
    color: colors.textPrimary,
    fontFamily: 'Inter_400Regular',
    fontSize: 14.5,
    lineHeight: 22,
  },
  hr: {
    backgroundColor: colors.border,
    height: 1,
    marginVertical: 10,
  },
  code_inline: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13.5,
    color: colors.accentPrimary,
    backgroundColor: isDark ? 'rgba(165,153,255,0.1)' : '#F0EFF7',
  },
  fence: {
    backgroundColor: isDark ? '#0d0d12' : '#F8F7FC',
    borderRadius: 10,
    padding: 12,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  blockquote: {
    backgroundColor: isDark ? 'rgba(165,153,255,0.08)' : 'rgba(108,92,231,0.06)',
    borderLeftWidth: 3.5,
    borderLeftColor: colors.accentPrimary,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    marginVertical: 6,
    borderWidth: 0.5,
    borderColor: colors.border,
  },
  paragraph: {
    marginTop: 0,
    marginBottom: 6,
    color: colors.textPrimary,
    fontFamily: 'Inter_400Regular',
    fontSize: 14.5,
    lineHeight: 22,
  },
  table: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    marginVertical: 8,
    overflow: 'hidden',
  },
  th: {
    backgroundColor: isDark ? 'rgba(165,153,255,0.16)' : 'rgba(108,92,231,0.10)',
    padding: 8,
    fontFamily: 'Inter_600SemiBold',
    color: colors.textPrimary,
    fontSize: 12.5,
  },
  td: {
    padding: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    color: colors.textPrimary,
    fontSize: 12.5,
  },
  link: {
    color: colors.accentPrimary,
    textDecorationLine: 'underline',
  },
  text: {
    color: colors.textPrimary,
  },
});
