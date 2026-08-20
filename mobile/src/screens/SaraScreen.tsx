/**
 * SaraScreen ΓÇö ChatGPT-style AI assistant interface for ZenTrack.
 *
 * Two modes:
 *   1. TEXT MODE (default) ΓÇö chat thread with bubbles, starter chips, streaming
 *   2. VOICE MODE (modal overlay) ΓÇö full-screen orb, live caption, 3 controls
 *
 * Design principles applied:
 *   - Purple (#a599ff) = Sara's UI identity (matches app-wide accent)
 *   - Green (#5eda9e) = success/completion ONLY, never Sara's identity
 *   - Warm personality: "Hey, what's on your mind?" not "Awaiting Command"
 *   - One conversation thread ΓÇö voice + text are two modes of the same thread
 *   - Actions deep-link directly into the relevant screen, never dead-ends
 */

import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { FONT_FAMILY, FONT_SIZE, RADIUS } from '../theme/tokens';
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useSafeTimeout } from '../hooks/useSafeTimeout';

import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Modal, Platform,
  Pressable, StatusBar, Keyboard, FlatList, PanResponder, Alert, Dimensions, Animated, Easing
} from 'react-native';
import Reanimated, { useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';
import AnimatedPressable from '../components/AnimatedPressable';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GYM_PLAN, WEEKDAY_TO_PLAN } from '../data/gymPlan';
import { getAppNotificationSettings, scheduleAllNotifications } from '../services/notifications';

import VoiceOrb, { VoiceStatus } from '../components/SARA/VoiceOrb';
import VoiceMicButton from '../components/SARA/VoiceMicButton';
import SaraBubble, { ActionCardData, QuickReplyData } from '../components/SARA/SaraBubble';
import StreamingText from '../components/SARA/StreamingText';
import { useSaraNavigation } from '../hooks/useSaraNavigation';
import { parseActionFromText, compressMemoryToSummary } from '../agent/saraAgent';
import BatchActionCard, { parseBatchActions, BatchAction } from '../components/SARA/BatchActionCard';
import { orchestrateAgent, generateInitialGreeting } from '../agent/orchestrator';

import { callGeminiProxy } from '../services/geminiProxy';
import { COLLECTION } from '../config/constants';
import * as Crypto from 'expo-crypto';
import { db } from '../services/firebase';
import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  serverTimestamp, increment, setDoc
} from 'firebase/firestore';
import { formatLocalDateStr } from '../utils/dateUtils';
import { safeWrite, safeAdd, safeUpdate, safeDelete } from '../utils/safeWrite';
import { useMobileData } from '../contexts/MobileDataContext';
import {
  startVoiceRecording,
  startVADRecording,
  stopAndTranscribe,
  cancelVoiceRecording,
  isSilenceOrNoise,
} from '../services/voiceEngine';
import { speakWithSarvam, stopSpeech } from '../services/sarvamProxy';
import { useTheme } from "../contexts/ThemeContext";
// SARA Engine v2 components
import ReasoningFeed, { ReasoningStep } from '../components/SARA/ReasoningFeed';
import SaraHUDToast from '../components/SARA/SaraHUDToast';
import InlineActionPill from '../components/SARA/InlineActionPill';
import {
  getActionTier,
  estimateActionConfidence,
  getAutoExecuteToastText,
  getInlinePillText,
} from '../config/saraActionPolicy';
import { updateFingerprint } from '../services/saraMemory';
import { logAgentAction } from '../services/agentHistory';

// ΓöÇΓöÇ Design tokens ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ

// ΓöÇΓöÇ Starter prompts (empty state) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
const STARTER_PROMPTS = [
  { label: 'Plan my day',         icon: 'sunny-outline' as const },
  { label: "Log today's workout", icon: 'barbell-outline' as const },
  { label: "What's due this week",icon: 'calendar-outline' as const },
];

// ΓöÇΓöÇ Quick Commands (input bar shortcut row) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
// One-tap dispatch for the most common morning interactions.
// Reduces friction from ~12 sec (type) ΓåÆ ~1 sec (tap).
const QUICK_COMMANDS = [
  {
    label: "Today's Plan",
    icon: 'today-outline' as const,
    command: "What are my priorities for today? Give me a quick overview of tasks, habits and any gym session.",
  },
  {
    label: 'Log Workout',
    icon: 'barbell-outline' as const,
    command: "Open gym and start today's workout ΓÇö tell me what exercises I have planned.",
  },
  {
    label: 'Attendance Risk',
    icon: 'school-outline' as const,
    command: "Which of my subjects am I at risk of failing attendance in? Show the percentages.",
  },
  {
    label: 'Quick Task',
    icon: 'add-circle-outline' as const,
    command: "Create a high priority task for today ΓÇö ask me for the title.",
  },
  {
    label: 'Habits Check',
    icon: 'checkmark-circle-outline' as const,
    command: "How are my habits tracking this week? Which ones am I falling behind on?",
  },
];

// ΓöÇΓöÇ Message type ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
interface ChatMessage {
  id: string;
  sender: 'sara' | 'user';
  text: string;
  isStreaming?: boolean;
  actionCard?: ActionCardData;
  quickReplies?: QuickReplyData[];
  batchActions?: BatchAction[];
}

// ΓöÇΓöÇ Quick-reply suggestion logic ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
function deriveQuickReplies(
  response: string,
  onSend: (text: string) => void
): QuickReplyData[] {
  const lower = response.toLowerCase();
  const chips: QuickReplyData[] = [];

  if (lower.includes('assignment') || lower.includes('due') || lower.includes('task')) {
    chips.push({ label: 'Block time for it', onPress: () => onSend('Block time for my assignment') });
  }
  if (lower.includes('gym') || lower.includes('workout')) {
    chips.push({ label: 'Show my gym days', onPress: () => onSend('Show my gym days this week') });
  }
  if (lower.includes('plan') || lower.includes('schedule')) {
    chips.push({ label: 'Show full schedule', onPress: () => onSend('Show me my full schedule') });
  }
  if (chips.length === 0 && lower.length > 50) {
    chips.push({ label: 'Tell me more', onPress: () => onSend('Tell me more') });
  }

  return chips.slice(0, 2); // max 2
}

// ΓöÇΓöÇ Deep-link action card extraction ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
function extractActionCard(
  response: string,
  tasks: any[],
  navigation: any
): ActionCardData | undefined {
  // Look for any task title mentioned in Sara's response
  for (const task of tasks) {
    if (!task.title) continue;
    if (response.toLowerCase().includes(task.title.toLowerCase())) {
      const dueLabel = task.timeSlot || (task.date ? task.date : 'No time set');
      return {
        icon: 'document-text-outline',
        title: task.title,
        subtitle: dueLabel,
        onPress: () => navigation.navigate('Tasks'),
      };
    }
  }
  return undefined;
}

// ΓöÇΓöÇ Main component ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
export interface SaraProps {
  visible?: boolean;
  onClose?: () => void;
  isGlobalModal?: boolean;
}

export default function SaraScreen(props: SaraProps) {
    const insets = useSafeAreaInsets();
    const { colors, isDark } = useTheme();
    const s = makeStyles(colors);
  if (props.isGlobalModal) {
    return <SaraScreenInner {...props} isModal={true} />;
  }
  return <SaraScreenWithRoute {...props} />;
}

function SaraScreenWithRoute(props: SaraProps) {
    const { colors, isDark } = useTheme();
    const s = makeStyles(colors);
  const route = useRoute<any>();
  return (
    <SaraScreenInner 
      {...props} 
      isModal={route?.name === 'SaraModal'} 
      initialRoutePrompt={route.params?.initialPrompt} 
    />
  );
}

interface SaraInnerProps extends SaraProps {
  isModal: boolean;
  initialRoutePrompt?: string;
}

function SaraScreenInner({ visible, onClose, isGlobalModal, isModal, initialRoutePrompt }: SaraInnerProps) {
  const insets = useSafeAreaInsets();
  const safeSetTimeout = useSafeTimeout();
  const { colors, isDark } = useTheme();
  const s = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const {
    tasks, habits, habitLogs, notes, goals, gymLogs,
    attendance, assignments, customEvents, learningTopics,
    jobs, weeklyReviews,
    googleAccessToken, user,
  } = useMobileData();
  const { processAnswerForNavigation } = useSaraNavigation();
  const navigation = useNavigation<any>();

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  // Memory: persisted cross-session summary injected into Sara's system prompt
  const [memorySummary, setMemorySummary] = useState<string | null>(null);
  // Live Notification & App Settings Summary for Sara
  const [notifSettingsSummary, setNotifSettingsSummary] = useState<string | null>(null);
  // Cap 4 ΓÇö Reasoning Transparency
  const [reasoningSteps, setReasoningSteps] = useState<ReasoningStep[]>([]);
  const [showReasoningFeed, setShowReasoningFeed] = useState(false);
  // Cap 3 ΓÇö HUD Toast state (Tier 1 silent auto-execute)
  const [hudToast, setHudToast] = useState<{ message: string; visible: boolean }>({ message: '', visible: false });
  // Cap 3 ΓÇö Inline pill states per message id
  const [pillStates, setPillStates] = useState<Record<string, 'pending' | 'confirmed' | 'rejected'>>({});
  
  const [dynamicGreeting, setDynamicGreeting] = useState("What do you need to get done?");
  const greetingGeneratedRef = useRef(false);

  // Dynamic personalized starter prompts based on live user data
  const starterPrompts = React.useMemo(() => {
    const list: { title: string; subtitle: string; command: string; icon: string; accent: string }[] = [];
    const now = new Date();
    const hour = now.getHours();
    const todayISO = formatLocalDateStr(now);

    // 1. Task/Planning Prompt
    const pendingTasks = (tasks || []).filter((t: any) => t.status !== 'completed');
    const overdueTasks = pendingTasks.filter((t: any) => t.date && t.date < todayISO);

    if (overdueTasks.length > 0) {
      list.push({
        title: `Clear ${overdueTasks.length} overdue task${overdueTasks.length > 1 ? 's' : ''}`,
        subtitle: `Reschedule or complete past due items`,
        command: `Show my ${overdueTasks.length} overdue tasks and help me reschedule or finish them.`,
        icon: 'warning-outline',
        accent: '#FF6B6B',
      });
    } else if (hour >= 5 && hour < 12) {
      list.push({
        title: 'Plan my day & morning priorities',
        subtitle: `${pendingTasks.length} tasks scheduled for today`,
        command: `What are my top priorities for today? Help me structure my morning and set my focus areas.`,
        icon: 'sunny-outline',
        accent: '#FF9F0A',
      });
    } else if (hour >= 17) {
      list.push({
        title: 'Evening review & tomorrow prep',
        subtitle: 'Review accomplishments & prep for tomorrow',
        command: `Give me an evening summary of what I accomplished today and prep my schedule for tomorrow.`,
        icon: 'moon-outline',
        accent: '#a599ff',
      });
    } else {
      list.push({
        title: 'Plan my day & focus areas',
        subtitle: `${pendingTasks.length} pending tasks ┬╖ Optimize workflow`,
        command: `Analyze my tasks and schedule for today. What should I tackle next?`,
        icon: 'sparkles-outline',
        accent: '#a599ff',
      });
    }

    // 2. Gym Workout Prompt
    const todayLog = (gymLogs || []).find((l: any) => l.date === todayISO);
    const dayOfWeek = now.getDay();
    const todayPlanIndex = WEEKDAY_TO_PLAN[dayOfWeek] || 7;
    const todayPlan = GYM_PLAN.find((p: any) => p.dayIndex === todayPlanIndex);

    if (todayLog && todayLog.exercises?.some((e: any) => e.setsLog?.some((s: any) => s.completed))) {
      list.push({
        title: `Analyze today's ${(todayLog as any).dayName || 'workout'}`,
        subtitle: `${todayLog.exercises.length} exercises logged ┬╖ Performance check`,
        command: `Analyze my performance in today's workout. Check my loads, sets, and give coaching feedback.`,
        icon: 'analytics-outline',
        accent: '#34C759',
      });
    } else if (todayPlan) {
      list.push({
        title: `Log today's ${todayPlan.name}`,
        subtitle: `Focus: ${todayPlan.focus} ┬╖ Start live session`,
        command: `Guide me through today's ${todayPlan.name} workout. What exercises and warm-up do I have?`,
        icon: 'barbell-outline',
        accent: '#34C759',
      });
    } else {
      list.push({
        title: "Log today's workout",
        subtitle: 'Track sets, weights & progressive overload',
        command: "Open gym and help me log today's workout session.",
        icon: 'barbell-outline',
        accent: '#34C759',
      });
    }

    // 3. Academic / Assignments / Attendance Prompt
    const atRiskSubject = (attendance || []).find((s: any) => {
      const pct = s.classesTotal > 0 ? (s.classesAttended / s.classesTotal) * 100 : 100;
      return pct < (s.targetPercentage || 75);
    });
    const upcomingAssignment = (assignments || [])
      .filter((a: any) => a.status !== 'submitted' && a.status !== 'graded' && a.dueDate >= todayISO)
      .sort((a: any, b: any) => a.dueDate.localeCompare(b.dueDate))[0];

    if (atRiskSubject) {
      const pct = Math.round((atRiskSubject.classesAttended / atRiskSubject.classesTotal) * 100);
      list.push({
        title: `Fix ${atRiskSubject.name} attendance (${pct}%)`,
        subtitle: `Target: ${atRiskSubject.targetPercentage || 75}% · Calculate target classes`,
        command: `How many consecutive classes of ${atRiskSubject.name} do I need to attend to reach ${atRiskSubject.targetPercentage || 75}%?`,
        icon: 'school-outline',
        accent: '#FF9F0A',
      });
    } else if (upcomingAssignment) {
      list.push({
        title: `Review assignment: ${upcomingAssignment.title}`,
        subtitle: `Due: ${upcomingAssignment.dueDate} · ${upcomingAssignment.subjectName || 'Academic'}`,
        command: `Give me a study & execution plan for my upcoming assignment "${upcomingAssignment.title}" due on ${upcomingAssignment.dueDate}.`,
        icon: 'document-text-outline',
        accent: '#64D2FF',
      });
    } else {
      list.push({
        title: "What's due this week",
        subtitle: 'Check upcoming assignments, exams & deadlines',
        command: "What assignments, exams, and key deadlines do I have coming up this week?",
        icon: 'calendar-outline',
        accent: '#64D2FF',
      });
    }

    // 4. Habits Prompt
    const uncompletedHabits = (habits || []).filter((h: any) => {
      const done = (habitLogs || []).some((l: any) => l.habitId === h.id && l.date === todayISO);
      return !done;
    });

    if (uncompletedHabits.length > 0) {
      list.push({
        title: `Check off ${uncompletedHabits.length} pending habit${uncompletedHabits.length > 1 ? 's' : ''}`,
        subtitle: `Next up: ${uncompletedHabits[0].name} ┬╖ Protect your streak`,
        command: `Which of my habits are pending for today? Help me log them to keep my streak alive.`,
        icon: 'checkmark-circle-outline',
        accent: '#a599ff',
      });
    }

    return list.slice(0, 4);
  }, [tasks, gymLogs, attendance, assignments, habits, habitLogs]);

  // ── Context-aware Personalized Nudges (Input Bar shortcuts) ───────────────
  const personalizedNudges = useMemo(() => {
    const now = new Date();
    const todayY = now.getFullYear();
    const todayM = String(now.getMonth() + 1).padStart(2, '0');
    const todayD = String(now.getDate()).padStart(2, '0');
    const todayStr = `${todayY}-${todayM}-${todayD}`;
    const dayOfWeek = now.getDay();
    const currentHour = now.getHours();

    const nudges: { label: string; icon: any; command: string }[] = [];

    // 1. Overdue or Today's tasks
    const activeTasks = (tasks || []).filter((t: any) => t.status !== 'done' && !t.completed);
    const overdueTasks = activeTasks.filter((t: any) => t.date && t.date < todayStr);
    const todayTasks = activeTasks.filter((t: any) => t.date === todayStr);

    if (overdueTasks.length > 0) {
      nudges.push({
        label: `${overdueTasks.length} Overdue Task${overdueTasks.length > 1 ? 's' : ''}`,
        icon: 'alert-circle-outline',
        command: `Show my ${overdueTasks.length} overdue tasks and help me prioritize or reschedule them.`,
      });
    } else if (todayTasks.length > 0) {
      nudges.push({
        label: `${todayTasks.length} Task${todayTasks.length > 1 ? 's' : ''} Today`,
        icon: 'checkbox-outline',
        command: `Review my ${todayTasks.length} tasks scheduled for today and give me an action plan.`,
      });
    }

    // 2. Gym / Workout status
    const todayGymLog = (gymLogs || []).find((l: any) => l.date === todayStr);
    const hasWorkedOut = todayGymLog?.exercises?.some((e: any) => e.setsLog?.some((s: any) => s.completed));
    const defaultPlanDay = (GYM_PLAN as any[])?.find((d: any) => d.dayIndex === (WEEKDAY_TO_PLAN[dayOfWeek] ?? 7));
    const workoutName = defaultPlanDay?.name || "Today's Workout";

    if (hasWorkedOut && todayGymLog?.exercises) {
      const completedSets = todayGymLog.exercises.reduce((acc: number, ex: any) => acc + (ex.setsLog?.filter((s: any) => s.completed).length || 0), 0);
      nudges.push({
        label: `Workout Done (${completedSets} sets)`,
        icon: 'checkmark-done-circle-outline',
        command: `Analyze my workout performance from today (${completedSets} sets completed) and give me recovery & nutrition advice.`,
      });
    } else if (defaultPlanDay && !defaultPlanDay.isRest) {
      nudges.push({
        label: workoutName,
        icon: 'barbell-outline',
        command: `What exercises do I have planned for ${workoutName} today? Give me target weights and warm-up recommendations.`,
      });
    }

    // 3. Attendance Risk
    const lowAttendance = (attendance || []).find((a: any) => {
      const total = a.classesTotal || 0;
      const attended = a.classesAttended || 0;
      if (total < 3) return false;
      return ((attended / total) * 100) < (a.targetPercentage || 75);
    });

    if (lowAttendance) {
      const pct = Math.round(((lowAttendance.classesAttended || 0) / (lowAttendance.classesTotal || 1)) * 100);
      nudges.push({
        label: `${lowAttendance.name} (${pct}%)`,
        icon: 'school-outline',
        command: `My attendance in ${lowAttendance.name} is at ${pct}%. How many consecutive classes do I need to attend to get above ${lowAttendance.targetPercentage || 75}%?`,
      });
    }

    // 4. Pending Habits
    const activeHabits = (habits || []).filter((h: any) => !h.archived);
    if (activeHabits.length > 0) {
      const completedHabitIds = new Set(
        (habitLogs || []).filter((hl: any) => hl.date === todayStr).map((hl: any) => hl.habitId)
      );
      const pendingHabits = activeHabits.filter((h: any) => !completedHabitIds.has(h.id));
      if (pendingHabits.length > 0) {
        nudges.push({
          label: `${pendingHabits.length} Habit${pendingHabits.length > 1 ? 's' : ''} Left`,
          icon: 'flame-outline',
          command: `Which habits do I still have left to complete today? Remind me.`,
        });
      } else {
        nudges.push({
          label: 'Habits 100% Done 🔥',
          icon: 'sparkles-outline',
          command: `Check my habit streaks and show how consistent I've been this week.`,
        });
      }
    }

    // 5. Time of Day Context
    if (currentHour < 12) {
      nudges.push({
        label: 'Morning Priorities',
        icon: 'sunny-outline',
        command: "Give me my morning briefing — what are my top priorities, schedule, and goals today?",
      });
    } else if (currentHour >= 18) {
      nudges.push({
        label: 'Evening Review',
        icon: 'moon-outline',
        command: "Summarize what I accomplished today, review my habit progress, and help me prep for tomorrow.",
      });
    } else {
      nudges.push({
        label: "Midday Focus",
        icon: 'compass-outline',
        command: "What should I focus on right now to make the most progress today?",
      });
    }

    // 6. Active Learning / Course
    const activeTopic = (learningTopics || []).find((t: any) => (t.progress || 0) < 100 && t.lectures?.length > 0);
    if (activeTopic) {
      nudges.push({
        label: `Study ${activeTopic.title.slice(0, 14)}...`,
        icon: 'book-outline',
        command: `What is the next lecture in ${activeTopic.title} and what should I study next?`,
      });
    }

    return nudges.slice(0, 6);
  }, [tasks, habits, habitLogs, gymLogs, attendance, assignments, learningTopics]);

  // Load chat history + memory summary + notification settings from storage
  useEffect(() => {
    AsyncStorage.multiGet(['sara_chat_history', 'sara_memory_summary']).then(pairs => {
      const [histEntry, memEntry] = pairs;
      if (histEntry[1]) {
        try {
          const parsed = JSON.parse(histEntry[1]);
          if (parsed.messages) {
            // Strip quickReplies on restore ΓÇö they have no onPress callbacks in storage.
            // Live chips created during the current session always have valid onPress closures.
            setMessages(parsed.messages.map((m: any) => ({ ...m, quickReplies: undefined })));
          }
          if (parsed.history) setHistory(parsed.history);
        } catch (e) {
          console.error('Failed to parse sara chat history', e);
        }
      }
      if (memEntry[1]) setMemorySummary(memEntry[1]);
      setIsLoaded(true);
    }).catch(err => {
      console.error('Failed to load Sara storage data:', err);
      setIsLoaded(true); // Ensure we don't get stuck on the grey loading screen
    });

    getAppNotificationSettings().then(res => setNotifSettingsSummary(res.summary));
  }, []);

  // Generate dynamic greeting if history is empty
  useEffect(() => {
    if (isLoaded && messages.length === 0 && !greetingGeneratedRef.current && !initialRoutePrompt) {
      greetingGeneratedRef.current = true;
      let isMounted = true;
      generateInitialGreeting({
        tasks, habits, habitLogs, notes, goals, gymLogs,
        attendance, assignments, customEvents, learningTopics,
        jobs, weeklyReviews, userId: user?.uid, memorySummary: memorySummary ?? undefined
      }).then(greeting => {
        if (isMounted && greeting) setDynamicGreeting(greeting);
      }).catch(() => {});
      return () => { isMounted = false; };
    }
  }, [isLoaded, messages.length, initialRoutePrompt, tasks, habits, user, memorySummary]);

  // FIX #14 + PERF: Save chat history only when a full response is received (isRunning: trueΓåÆfalse).
  useEffect(() => {
    if (!isLoaded || isRunning) return;
    const serializableMessages = messages.map(m => ({
      ...m,
      actionCard: m.actionCard ? { ...m.actionCard, onConfirm: undefined, onEdit: undefined } : undefined,
      quickReplies: m.quickReplies ? m.quickReplies.map(q => ({ label: q.label })) : undefined,
      batchActions: undefined, // never serialize batch actions (callbacks inside)
    }));
    AsyncStorage.setItem('sara_chat_history', JSON.stringify({ messages: serializableMessages, history }));
  }, [isRunning, isLoaded]);

  // Hardware & Audio Resource Cleanup on Unmount (Microphone, VAD timers, and TTS sound)
  useEffect(() => {
    return () => {
      cancelVoiceRecording().catch(() => {});
      stopSpeech().catch(() => {});
    };
  }, []);

  // Voice mode state
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [voiceCaption, setVoiceCaption] = useState('');
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>('listening');
  const [isMuted, setIsMuted] = useState(false);
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);
  const [isKeyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [aboutModalOpen, setAboutModalOpen] = useState(false);

  const keyboard = useAnimatedKeyboard();
  const chatKeyboardStyle = useAnimatedStyle(() => ({
    flex: 1,
    paddingBottom: keyboard.height.value,
  }));

  // Custom animation and pan responder for global modal
  const translateY = useRef(new Animated.Value(Dimensions.get('window').height)).current;
  const [internalVisible, setInternalVisible] = useState(visible || false);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) translateY.setValue(gestureState.dy);
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 120 || gestureState.vy > 0.8) {
          // Instant fluid close matching BottomSheet (140ms)
          Animated.timing(translateY, {
            toValue: Dimensions.get('window').height,
            duration: 140,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
          }).start(() => {
            if (onClose) onClose();
          });
        } else {
          // Snap back
          Animated.timing(translateY, {
            toValue: 0,
            duration: 160,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  useEffect(() => {
    if (isGlobalModal) {
      if (visible) {
        setInternalVisible(true);
        translateY.setValue(Dimensions.get('window').height);
        Animated.timing(translateY, {
          toValue: 0,
          duration: 180,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start();
      } else {
        Animated.timing(translateY, {
          toValue: Dimensions.get('window').height,
          duration: 140,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }).start(() => setInternalVisible(false));
      }
    }
  }, [visible, isGlobalModal, translateY]);

  // Trigger initial prompt if passed via navigation
  useEffect(() => {
    if (initialRoutePrompt && messages.length === 0 && !isRunning && isLoaded) {
      sendMessage(initialRoutePrompt);
      if (navigation.setParams) {
        navigation.setParams({ initialPrompt: undefined });
      }
    }
  }, [initialRoutePrompt, messages.length, isRunning, isLoaded]);

  // Keyboard listener — instant show/hide
  useEffect(() => {
    const s1 = Keyboard.addListener('keyboardWillShow', () => setKeyboardVisible(true));
    const s2 = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const s3 = Keyboard.addListener('keyboardWillHide', () => setKeyboardVisible(false));
    const s4 = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));

    return () => {
      s1.remove();
      s2.remove();
      s3.remove();
      s4.remove();
    };
  }, []);

  // Overflow menu
  const scrollRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);

  const scrollToBottom = () => {
    safeSetTimeout(() => scrollRef.current?.scrollToOffset({ offset: 0, animated: true }), 80);
  };

  // ΓöÇΓöÇ Send a message ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  const sendMessage = useCallback(async (instruction: string) => {
    if (!instruction.trim() || isRunning) return;

    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    setInput('');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    // Add user bubble
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      sender: 'user',
      text: instruction.trim(),
    };

    // Add Sara's pending (streaming) bubble
    const saraMsgId = `s-${Date.now()}`;
    const saraMsg: ChatMessage = {
      id: saraMsgId,
      sender: 'sara',
      text: '',
      isStreaming: true,
    };

    setMessages(prev => [...prev, userMsg, saraMsg]);
    scrollToBottom();

    const newHistory = [...history, { role: 'user', text: instruction.trim() }];
    setHistory(newHistory);
    setIsRunning(true);

    // Collect the final step result from orchestrateAgent's onStep callbacks
    let _finalStep: any = null;

    // Cap 4: Reset reasoning steps for new message
    setReasoningSteps([]);
    setShowReasoningFeed(true);

    try {
      await orchestrateAgent(
        instruction.trim(),
        {
          tasks, habits, habitLogs, notes, goals, gymLogs,
          attendance, assignments, customEvents, learningTopics,
          jobs, weeklyReviews,
          googleAccessToken: googleAccessToken ?? undefined, userId: user?.uid,
          memorySummary: memorySummary ?? undefined,
          notifSettingsSummary: notifSettingsSummary ?? undefined,
        },
        (step) => {
          if (step.type === 'thinking') {
            // Cap 4: Add as reasoning step
            setReasoningSteps(prev => [
              ...prev,
              { id: `rs-${Date.now()}-${Math.random()}`, label: step.title, timestamp: Date.now() }
            ]);
            setMessages(prev => prev.map(m =>
              m.id === saraMsgId ? { ...m, text: step.title, isStreaming: true } : m
            ));
          } else if (step.type === 'reasoning_step') {
            // Cap 4: Pure reasoning step ΓÇö only updates reasoning feed, not bubble text
            setReasoningSteps(prev => [
              ...prev,
              { id: `rs-${Date.now()}-${Math.random()}`, label: step.title, timestamp: Date.now() }
            ]);
          } else if (step.type === 'stream') {
            setMessages(prev => prev.map(m =>
              m.id === saraMsgId ? { ...m, text: step.text, isStreaming: true } : m
            ));
          } else if (step.type === 'voice_sentence_ready') {
            // Cap 6: First sentence ready ΓÇö start TTS immediately without waiting for full response
            if (isVoiceMode && step.sentence) {
              speakWithSarvam(step.sentence).catch(() => {});
            }
          } else {
            _finalStep = step;
          }
        },
        history,
        isVoiceMode, // Cap 6: signal voice mode for sentence streaming
      );

      // Cap 4: Hide reasoning feed when answer arrives
      setShowReasoningFeed(false);

      // Build a result-like object from the final step (mirrors processSaraChat shape)
      const step = _finalStep || { type: 'answer', title: "I'm here ΓÇö what's on your mind?" };
      const isAction = step.type === 'proposed_action';

      // Cap 3: Confidence-gated action tier classification
      if (isAction && step.action) {
        const confidence = estimateActionConfidence(step.action);
        const tier = getActionTier(step.action.type, confidence);

        if (tier === 1) {
          // Tier 1: Silent auto-execute ΓÇö fire the action immediately
          const toastText = getAutoExecuteToastText(step.action.type, step.action);
          // Auto-execute the action (BFE event tracking)
          try {
            if (step.action.type === 'logHabit' && step.action.habitId && user?.uid) {
              const todayDate = formatLocalDateStr(new Date());
              const logDocId = `${step.action.habitId}_${todayDate}`;
              const logData = { userId: user.uid, habitId: step.action.habitId, date: todayDate };
              await safeWrite(
                () => setDoc(doc(db, COLLECTION.HABIT_LOGS, logDocId), { ...logData, createdAt: serverTimestamp() }),
                COLLECTION.HABIT_LOGS, 'set', logData, logDocId
              );
              if (user?.uid) updateFingerprint(user.uid, { type: 'habit_logged' });
            } else if (step.action.type === 'completeTask' && step.action.taskId) {
              await safeUpdate(
                step.action.taskId,
                COLLECTION.TASKS,
                { status: 'completed', completedAt: new Date().toISOString() },
                () => updateDoc(doc(db, COLLECTION.TASKS, step.action.taskId), {
                  status: 'completed', completedAt: new Date().toISOString(),
                })
              );
              if (user?.uid) updateFingerprint(user.uid, {
                type: 'task_completed', completedAt: Date.now()
              });
            } else if (step.action.type === 'markAttendance' && step.action.subjectId) {
              const subRef = doc(db, COLLECTION.ATTENDANCE, step.action.subjectId);
              if (step.action.status === 'present') {
                await updateDoc(subRef, { classesAttended: increment(1), classesTotal: increment(1) });
              } else {
                await updateDoc(subRef, { classesTotal: increment(1) });
              }
            } else if (step.action.type === 'updateNotificationSetting' && step.action.settingKey) {
              const settingKey = step.action.settingKey;
              const isGymSetting = settingKey.startsWith('@gym_');
              const fullKey = isGymSetting ? settingKey : `zentrack_notif_${settingKey}`;
              await AsyncStorage.setItem(fullKey, String(step.action.value));
              scheduleAllNotifications({ tasks: tasks || [], customEvents: customEvents || [], gymLogs: gymLogs || [], attendance: attendance || [], habitLogs: habitLogs || [], allHabits: habits || [], assignments: assignments || [] });
              getAppNotificationSettings().then(res => setNotifSettingsSummary(res.summary));
            } else {
              // Tier 1 failed (unknown type) ΓÇö demote to Tier 3
              setIsRunning(false);
              // Fall through to normal action handling
            }
            // ✅ Tier 1 committed: persist to action history
            logAgentAction({
              type: step.action.type,
              tier: 1,
              description: toastText,
              entityLabel: step.action.habitName || step.action.taskTitle || step.action.subjectName || '',
            });
            // Show HUD toast on success
              setHudToast({ message: toastText, visible: true });
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
              
              if (isVoiceMode) {
                setVoiceStatus('success');
                setTimeout(() => setVoiceStatus('listening'), 1500);
              }
            // Show a simple text confirmation in the bubble
            setMessages(prev => prev.map(m =>
              m.id === saraMsgId ? { ...m, text: step.title || toastText, isStreaming: false } : m
            ));
            setIsRunning(false);
            return step.title || '';
          } catch (e: any) {
            console.warn('[Sara/Tier1] Auto-execute failed, demoting to Tier 3:', e.message);
            // Fall through to normal Tier 3 handling below
          }
        } else if (tier === 2) {
          // Tier 2: Inline pill ΓÇö show in chat but no full card
          const pillText = getInlinePillText(step.action.type, step.action);
          const pillMsgId = saraMsgId;
          const cleanStepText = step.title || '';
          setPillStates(prev => ({ ...prev, [pillMsgId]: 'pending' }));
          setMessages(prev => prev.map(m =>
            m.id === saraMsgId
              ? { ...m, text: cleanStepText, isStreaming: false,
                  // Store pill info in actionCard for rendering
                  actionCard: {
                    icon: 'flash-outline',
                    title: pillText,
                    subtitle: '1-tap confirm',
                    _tier2: true,
                    _tier2Action: step.action,
                    _tier2PillId: pillMsgId,
                    onConfirm: async () => {
                      // Execute on confirm
                      setPillStates(prev => ({ ...prev, [pillMsgId]: 'confirmed' }));
                      // ✅ Tier 2 committed: persist to action history
                      logAgentAction({
                        type: step.action.type,
                        tier: 2,
                        description: pillText,
                        entityLabel: step.action.taskTitle || step.action.habitName || '',
                      });
                      // The existing full handler in the action block below will handle execution
                    },
                  } as any }
              : m
          ));
          // For Tier 2, still pass through to action card building below
          // but with reduced friction (the pill handles it)
        }
        // Tier 3: falls through to normal action card building below
      }

      const result = {
        type: isAction ? 'function_call' : 'text',
        name: isAction ? step.action?.type : undefined,
        args: isAction ? step.action : undefined,
        text: step.title || '',
        rawText: step.title || '',
        suggestions: step.suggestions || [],
      };

      let cleanText = result.text || 'Got it.';
      let actionCard: ActionCardData | undefined = undefined;

      // Map function call to actionCard
      if (result.type === 'function_call' && result.name && result.args) {
        const { name, args } = result;
        
        if (name === 'createTask') {
          const dueDisplay = args.dueTime ? `${args.dueDate}, ${args.dueTime}` : args.dueDate;
          actionCard = {
            icon: 'checkmark-circle-outline',
            title: args.title || 'New Task',
            subtitle: `Due: ${dueDisplay}  ┬╖  ${args.priority || 'medium'} priority`,
            onConfirm: async () => {
              try {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                // ✅ FIXED: use COLLECTION.TASKS
                await addDoc(collection(db, COLLECTION.TASKS), {
                  userId: user!.uid,
                  title: args.title,
                  date: args.dueDate,
                  timeSlot: args.dueTime || null,
                  priority: args.priority || 'medium',
                  status: 'pending',
                  createdAt: serverTimestamp(),
                  order: 0,
                  subtasks: [],
                });
                // ✅ Tier 3 committed: persist to action history
                logAgentAction({
                  type: 'createTask',
                  tier: 3,
                  description: `Created task: "${args.title}"`,
                  entityLabel: args.title,
                });
                setMessages(prev => prev.map(m =>
                  m.id === saraMsgId
                    ? { ...m, actionCard: { ...m.actionCard!, onConfirm: undefined, subtitle: 'Γ£ô Task created' } }
                    : m
                ));
              } catch (e: any) {
                alert('Failed to save task: ' + e.message);
              }
            },
            onEditTime: () => navigation.navigate('Tasks'),
          };

        } else if (name === 'deleteTask') {
          actionCard = {
            icon: 'trash-outline',
            title: `Delete: ${args.taskTitle}`,
            subtitle: 'This cannot be undone',
            onConfirm: async () => {
              try {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                await deleteDoc(doc(db, COLLECTION.TASKS, args.taskId));
                // ✅ Tier 3 committed: persist to action history
                logAgentAction({
                  type: 'deleteTask',
                  tier: 3,
                  description: `Deleted task: "${args.taskTitle}"`,
                  entityLabel: args.taskTitle,
                });
                setMessages(prev => prev.map(m =>
                  m.id === saraMsgId
                    ? { ...m, actionCard: { ...m.actionCard!, onConfirm: undefined, subtitle: 'Γ£ô Task deleted' } }
                    : m
                ));
              } catch (e: any) {
                alert('Failed to delete task: ' + e.message);
              }
            },
          };

        } else if (name === 'completeTask') {
          actionCard = {
            icon: 'checkmark-done-outline',
            title: `Complete: ${args.taskTitle}`,
            subtitle: 'Mark as done',
            onConfirm: async () => {
              try {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                await updateDoc(doc(db, COLLECTION.TASKS, args.taskId), {
                  status: 'completed',
                  completedAt: new Date().toISOString(),
                });
                setMessages(prev => prev.map(m =>
                  m.id === saraMsgId
                    ? { ...m, actionCard: { ...m.actionCard!, onConfirm: undefined, subtitle: 'Γ£ô Marked complete' } }
                    : m
                ));
              } catch (e: any) {
                alert('Failed to update task: ' + e.message);
              }
            },
          };

        } else if (name === 'updateTask') {
          const updates: any = {};
          const changes: string[] = [];
          if (args.newDate) { updates.date = args.newDate; changes.push(`Date: ${args.newDate}`); }
          if (args.newTime) { updates.timeSlot = args.newTime; changes.push(`Time: ${args.newTime}`); }
          if (args.newPriority) { updates.priority = args.newPriority; changes.push(`Priority: ${args.newPriority}`); }
          if (args.newTitle) { updates.title = args.newTitle; changes.push(`Title: ${args.newTitle}`); }

          actionCard = {
            icon: 'create-outline',
            title: `Update: ${args.taskTitle}`,
            subtitle: changes.join('  ┬╖  ') || 'No changes specified',
            onConfirm: async () => {
              if (Object.keys(updates).length === 0) return;
              try {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                await updateDoc(doc(db, COLLECTION.TASKS, args.taskId), updates);
                setMessages(prev => prev.map(m =>
                  m.id === saraMsgId
                    ? { ...m, actionCard: { ...m.actionCard!, onConfirm: undefined, subtitle: 'Γ£ô Task updated' } }
                    : m
                ));
              } catch (e: any) {
                alert('Failed to update task: ' + e.message);
              }
            },
          };

        } else if (name === 'logHabit') {
          const todayDate = formatLocalDateStr(new Date());
          actionCard = {
            icon: 'flame-outline',
            title: `Log habit: ${args.habitName}`,
            subtitle: `Mark done for today (${todayDate})`,
            onConfirm: async () => {
              try {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                const logDocId = `${args.habitId}_${todayDate}`;
                const logData = { userId: user!.uid, habitId: args.habitId, date: todayDate };
                await safeWrite(
                  () => setDoc(doc(db, COLLECTION.HABIT_LOGS, logDocId), { ...logData, createdAt: serverTimestamp() }),
                  COLLECTION.HABIT_LOGS, 'set', logData, logDocId
                );
                setMessages(prev => prev.map(m =>
                  m.id === saraMsgId
                    ? { ...m, actionCard: { ...m.actionCard!, onConfirm: undefined, subtitle: '✓ Habit logged!' } }
                    : m
                ));
              } catch (e: any) {
                alert('Failed to log habit: ' + e.message);
              }
            },
          };

        } else if (name === 'markAttendance') {
          const subjectName = args.subjectName || args.subject;
          const status = args.status as 'present' | 'absent';
          actionCard = {
            icon: 'school-outline',
            title: subjectName,
            subtitle: `Mark ${status} ┬╖ ${args.date || 'today'}`,
            onConfirm: async () => {
              try {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                // ✅ FIXED: actually increments attendance counter in Firestore
                const subRef = doc(db, COLLECTION.ATTENDANCE, args.subjectId);
                if (status === 'present') {
                  await updateDoc(subRef, {
                    classesAttended: increment(1),
                    classesTotal: increment(1),
                  });
                } else {
                  await updateDoc(subRef, {
                    classesTotal: increment(1),
                  });
                }
                setMessages(prev => prev.map(m =>
                  m.id === saraMsgId
                    ? { ...m, actionCard: { ...m.actionCard!, onConfirm: undefined, subtitle: `Γ£ô Marked ${status}` } }
                    : m
                ));
              } catch (e: any) {
                alert('Failed to update attendance: ' + e.message);
              }
            },
          };

        } else if (name === 'createNote') {
          actionCard = {
            icon: 'document-text-outline',
            title: args.title || 'Quick Note',
            subtitle: (args.content || '').substring(0, 50) + (args.content?.length > 50 ? '...' : ''),
            onConfirm: async () => {
              try {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                // ✅ FIXED: save to STORAGE_NODES so it appears in Notes app
                await addDoc(collection(db, COLLECTION.STORAGE_NODES), {
                  type: 'note',
                  parentId: null,
                  userId: user!.uid,
                  name: args.title || 'Quick Note',
                  content: args.content,
                  tags: [],
                  createdAt: serverTimestamp(),
                  updatedAt: serverTimestamp(),
                });
                setMessages(prev => prev.map(m =>
                  m.id === saraMsgId
                    ? { ...m, actionCard: { ...m.actionCard!, onConfirm: undefined, subtitle: 'Γ£ô Note saved' } }
                    : m
                ));
              } catch (e: any) {
                alert('Failed to save note: ' + e.message);
              }
            },
          };

        } else if (name === 'addCalendarEvent') {
          actionCard = {
            icon: 'calendar-outline',
            title: args.title,
            subtitle: `${args.date}${args.startTime ? ' ┬╖ ' + args.startTime : ''}  ${args.type || ''}`,
            onConfirm: async () => {
              try {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                await addDoc(collection(db, COLLECTION.CALENDAR_EVENTS), {
                  userId: user!.uid,
                  title: args.title,
                  date: args.date,
                  startTime: args.startTime || null,
                  endTime: args.endTime || null,
                  type: args.type || 'todo',
                  createdAt: serverTimestamp(),
                });
                setMessages(prev => prev.map(m =>
                  m.id === saraMsgId
                    ? { ...m, actionCard: { ...m.actionCard!, onConfirm: undefined, subtitle: 'Γ£ô Event added' } }
                    : m
                ));
              } catch (e: any) {
                alert('Failed to add event: ' + e.message);
              }
            },
          };
        } else if (name === 'deleteCalendarEvent') {
          actionCard = {
            icon: 'trash-outline',
            title: 'Delete Event',
            subtitle: 'This cannot be undone',
            onConfirm: async () => {
              try {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                await deleteDoc(doc(db, COLLECTION.CALENDAR_EVENTS, args.eventId));
                setMessages(prev => prev.map(m => m.id === saraMsgId ? { ...m, actionCard: { ...m.actionCard!, onConfirm: undefined, subtitle: 'Γ£ô Event deleted' } } : m));
              } catch (e: any) { alert('Failed to delete event: ' + e.message); }
            },
          };
        } else if (name === 'createHabit') {
          actionCard = {
            icon: 'flame-outline',
            title: args.name || 'New Habit',
            subtitle: `${args.frequency || 'daily'} ${args.emoji || 'Γ¡É'}`,
            onConfirm: async () => {
              try {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                await addDoc(collection(db, COLLECTION.HABITS), {
                  userId: user!.uid,
                  name: args.name,
                  emoji: args.emoji || 'Γ¡É',
                  frequency: args.frequency || 'daily',
                  streak: 0,
                  longestStreak: 0,
                  color: args.color || colors.accentPrimary,
                  createdAt: serverTimestamp(),
                });
                setMessages(prev => prev.map(m => m.id === saraMsgId ? { ...m, actionCard: { ...m.actionCard!, onConfirm: undefined, subtitle: 'Γ£ô Habit created' } } : m));
              } catch (e: any) { alert('Failed to create habit: ' + e.message); }
            },
          };
        } else if (name === 'createSubject') {
          actionCard = {
            icon: 'school-outline',
            title: args.name || 'New Subject',
            subtitle: `Target: ${args.targetPercentage || 75}%`,
            onConfirm: async () => {
              try {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                const defaultSchedule = {
                  '0': { classes: [], labs: [], classCount: 0, labCount: 0 },
                  '1': { classes: [], labs: [], classCount: 0, labCount: 0 },
                  '2': { classes: [], labs: [], classCount: 0, labCount: 0 },
                  '3': { classes: [], labs: [], classCount: 0, labCount: 0 },
                  '4': { classes: [], labs: [], classCount: 0, labCount: 0 },
                  '5': { classes: [], labs: [], classCount: 0, labCount: 0 },
                  '6': { classes: [], labs: [], classCount: 0, labCount: 0 },
                };
                const DAY_MAP: Record<string, string> = {
                  'sunday': '0', 'monday': '1', 'tuesday': '2', 'wednesday': '3',
                  'thursday': '4', 'friday': '5', 'saturday': '6'
                };
                
                if (args.schedule && Array.isArray(args.schedule)) {
                  args.schedule.forEach((s: any) => {
                    if (!s.day) return;
                    const d = DAY_MAP[s.day.toLowerCase()] || '1';
                    const targetDay = defaultSchedule[d as keyof typeof defaultSchedule];
                    const session = { time: s.time || '', room: s.room || '' };
                    
                    if (s.type === 'lab') {
                      targetDay.labs.push(session as never);
                      targetDay.labCount++;
                    } else {
                      targetDay.classes.push(session as never);
                      targetDay.classCount++;
                    }
                  });
                }

                await addDoc(collection(db, COLLECTION.ATTENDANCE), {
                  userId: user!.uid,
                  name: args.name,
                  code: args.code || '',
                  classesAttended: 0,
                  classesTotal: 0,
                  targetPercentage: args.targetPercentage || 75,
                  schedule: defaultSchedule,
                  schemaVersion: 1,
                  createdAt: serverTimestamp(),
                });
                setMessages(prev => prev.map(m => m.id === saraMsgId ? { ...m, actionCard: { ...m.actionCard!, onConfirm: undefined, subtitle: 'Γ£ô Subject created' } } : m));
              } catch (e: any) { alert('Failed to create subject: ' + e.message); }
            },
          };
        } else if (name === 'createWeeklyReview') {
          actionCard = {
            icon: 'analytics-outline',
            title: 'Weekly Review',
            subtitle: `Log review for ${args.weekStart} to ${args.weekEnd}`,
            onConfirm: async () => {
              try {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                await addDoc(collection(db, COLLECTION.WEEKLY_REVIEWS), {
                  userId: user!.uid,
                  weekStart: args.weekStart,
                  weekEnd: args.weekEnd,
                  wentWell: args.wentWell || '',
                  toImprove: args.toImprove || '',
                  nextWeekPriorities: args.nextWeekPriorities || '',
                  gratitude: args.gratitude || '',
                  createdAt: serverTimestamp(),
                });
                setMessages(prev => prev.map(m => m.id === saraMsgId ? { ...m, actionCard: { ...m.actionCard!, onConfirm: undefined, subtitle: 'Γ£ô Review saved' } } : m));
              } catch (e: any) { alert('Failed to save review: ' + e.message); }
            },
          };
        } else if (name === 'updateNotificationSetting') {
          const settingKey = args.settingKey || args.key;
          const val = args.value;
          const displayLabel = args.settingLabel || args.label || `Setting: ${settingKey}`;
          const isGymSetting = settingKey.startsWith('@gym_');
          const fullStorageKey = isGymSetting ? settingKey : `zentrack_notif_${settingKey}`;

          actionCard = {
            icon: 'notifications-outline',
            title: 'Update Notification Setting',
            subtitle: `${displayLabel} ΓåÆ ${String(val)}`,
            onConfirm: async () => {
              try {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                await AsyncStorage.setItem(fullStorageKey, String(val));
                
                // Reschedule notifications in real time
                scheduleAllNotifications({
                  tasks: tasks || [],
                  customEvents: customEvents || [],
                  gymLogs: gymLogs || [],
                  attendance: attendance || [],
                  habitLogs: habitLogs || [],
                  allHabits: habits || [],
                  assignments: assignments || [],
                });

                // Refresh live settings summary in Sara's memory
                getAppNotificationSettings().then(res => setNotifSettingsSummary(res.summary));

                setMessages(prev => prev.map(m =>
                  m.id === saraMsgId
                    ? { ...m, actionCard: { ...m.actionCard!, onConfirm: undefined, subtitle: `Γ£ô Updated: ${displayLabel}` } }
                    : m
                ));
              } catch (e: any) {
                alert('Failed to update notification setting: ' + e.message);
              }
            },
          };
        }
      } else {
        // Fallback to extraction if no function call
        actionCard = extractActionCard(cleanText, tasks ?? [], navigation);
      }

      let quickReplies = (result as any).suggestions?.map((s: string) => ({
        label: s,
        onPress: () => sendMessage(s)
      })) || [];
      if (quickReplies.length === 0) {
        quickReplies = deriveQuickReplies(cleanText, sendMessage);
      }

      // Parse BATCH_ACTIONS if present (multi-action from Sara)
      let batchActions = null;
      let textAfterBatch = cleanText;
      if (cleanText.includes('[[BATCH_ACTIONS:')) {
        const { cleanText: textNoBatch, batchActions: parsed } = parseBatchActions(cleanText);
        textAfterBatch = textNoBatch;
        batchActions = parsed;
      }

      // Replace the streaming Sara bubble with the final response
      setMessages(prev =>
        prev.map(m =>
          m.id === saraMsgId
            ? { ...m, text: textAfterBatch, isStreaming: false, actionCard, quickReplies, batchActions: batchActions ?? undefined }
            : m
        )
      );

      const newModel = { role: 'model', text: result.rawText || cleanText };
      const updatedHistory = [...newHistory, newModel];
      setHistory(prev => [...prev, newModel]);
      scrollToBottom();

      // Memory compression: compress when history exceeds 20 messages
      if (updatedHistory.length > 20 && !isRunning) {
        compressMemoryToSummary(updatedHistory).then(summary => {
          setMemorySummary(summary);
          AsyncStorage.setItem('sara_memory_summary', summary);
          // Trim history to last 10 turns after compression
          setHistory(updatedHistory.slice(-10));
        }).catch(e => console.warn('[Sara] Memory compression failed:', e.message));
      }

      if (isVoiceMode) {
        setVoiceStatus('listening');
        // ✅ FIXED: 30-second idle auto-stop (was a no-op empty callback before)
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        idleTimerRef.current = setTimeout(() => {
          closeVoiceMode();
        }, 30000);
      }

    } catch (err: any) {
      console.error('[Sara] Chat error:', err?.message || err);
      setMessages(prev =>
        prev.map(m =>
          m.id === saraMsgId
            ? {
                ...m,
                text: `Sorry, I ran into an error: ${err?.message || 'unknown error'}. Please try again.`,
                isStreaming: false,
              }
            : m
        )
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setIsRunning(false);
      setShowReasoningFeed(false);
    }
  }, [isRunning, history, tasks, habits, habitLogs, notes, goals, gymLogs,
      attendance, assignments, customEvents, learningTopics,
      jobs, weeklyReviews,
      googleAccessToken, user, isVoiceMode, navigation]);

  // ΓöÇΓöÇ Voice mode: open (Cap 6 ΓÇö uses VAD for auto-submit) ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  const openVoiceMode = useCallback(() => {
    Keyboard.dismiss();
    setIsVoiceMode(true);
    setVoiceCaption('');
    setVoiceStatus('listening');
    setIsMuted(false);

    // Cap 6: Use VAD recording instead of manual tap-to-stop
    startVADRecording(
      {
        onStateChange: (state) => {
          if (state === 'recording') setIsVoiceRecording(true);
          if (state === 'idle') setIsVoiceRecording(false);
          if (state === 'processing') setVoiceStatus('processing');
        },
        onTranscript: (text) => {
          if (!text || !text.trim() || isSilenceOrNoise(text)) return;
          setVoiceCaption(text);
          sendMessage(text);
        },
        onError: (msg) => {
          setVoiceCaption(msg);
          safeSetTimeout(() => setVoiceStatus('listening'), 2000);
        }
      },
      () => {
        // Voice detected callback ΓÇö update UI to show Sara is listening actively
        setVoiceStatus('listening');
      }
    );
  }, [sendMessage]);

  const inlineDictationToggle = useCallback(() => {
    Keyboard.dismiss();
    
    if (isVoiceRecording) {
      setIsVoiceRecording(false);
      setIsRunning(true);
      stopAndTranscribe({
        onStateChange: () => {},
        onTranscript: (text) => {
          setIsRunning(false);
          setInput(prev => prev ? prev + ' ' + text : text);
          // Small delay to ensure state updates before focusing
          safeSetTimeout(() => inputRef.current?.focus(), 100);
        },
        onError: (msg) => {
          setIsRunning(false);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          setInput(`[Error: ${msg}]`);
          safeSetTimeout(() => setInput(''), 2000);
        }
      });
    } else {
      setIsVoiceRecording(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      startVoiceRecording({
        onStateChange: () => {},
        onTranscript: () => {},
        onError: () => {
          setIsVoiceRecording(false);
        }
      });
    }
  }, [isVoiceRecording, sendMessage]);

  // ΓöÇΓöÇ Voice mode: close ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  const closeVoiceMode = async () => {
    await cancelVoiceRecording();
    setIsVoiceMode(false);
    setIsVoiceRecording(false);
    setVoiceCaption('');
  };

  // ΓöÇΓöÇ Voice mode: stop recording ΓåÆ transcribe ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  const endVoiceCall = async () => {
    setVoiceStatus('processing');
    await stopAndTranscribe({
      onStateChange: (state) => {
        if (state === 'idle') setIsVoiceRecording(false);
      },
      onTranscript: async (text) => {
        setVoiceCaption(text);
        setIsVoiceMode(false);
        await sendMessage(text);
      },
      onError: () => {
        setVoiceCaption('');
        setIsVoiceMode(false);
      },
    });
  };

  const hasMessages = messages.length > 0;

  // ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  // RENDER
  // ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
  const content = (
    <>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} />

      {/* ΓöÇΓöÇ Header ΓöÇΓöÇ */}
      <View style={s.header}>
        <TouchableOpacity 
          onPress={() => {
            if (isGlobalModal && onClose) {
              onClose();
            } else {
              navigation.goBack();
            }
          }} 
          style={s.headerBtn} 
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="close" size={22} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Sara</Text>
        <TouchableOpacity onPress={() => setMenuOpen(true)} style={s.headerBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="ellipsis-horizontal" size={18} color={colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* ΓöÇΓöÇ Text / Voice Segmented Control ΓöÇΓöÇ */}
      <View style={s.modeSegment}>
        <TouchableOpacity
          style={[s.modeSegmentBtn, !isVoiceMode && s.modeSegmentBtnActive]}
          onPress={() => { if (isVoiceMode) setIsVoiceMode(false); }}
        >
          <Ionicons
            name="chatbubble-outline" size={13}
            color={!isVoiceMode ? colors.background : colors.textMuted}
            style={{ marginRight: 4 }}
          />
          <Text style={[s.modeSegmentText, !isVoiceMode && s.modeSegmentTextActive]}>Text</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.modeSegmentBtn, isVoiceMode && s.modeSegmentBtnActive]}
          activeOpacity={0.7}
          onPress={() => {
            Haptics.selectionAsync();
            if (!isVoiceMode) setIsVoiceMode(true);
          }}
        >
          <Ionicons
            name="mic-outline" size={13}
            color={isVoiceMode ? colors.background : colors.textMuted}
            style={{ marginRight: 4 }}
          />
          <Text style={[s.modeSegmentText, isVoiceMode && s.modeSegmentTextActive]}>Voice</Text>
        </TouchableOpacity>
      </View>

      {/* ── Chat Area (Fluid 60fps Keyboard-Synchronous Container) ── */}
      <Reanimated.View style={chatKeyboardStyle}>
        {!hasMessages ? (
          /* ── Empty state ── */
          <ScrollView
            contentContainerStyle={[
              s.emptyState,
              { paddingBottom: Math.max(insets.bottom, 14) + (!isKeyboardVisible && personalizedNudges.length > 0 && !isRunning ? 115 : 70) }
            ]}
            keyboardShouldPersistTaps="handled"
          >
            {!isKeyboardVisible && (
              <>
                <VoiceOrb size="small" status={isRunning ? 'processing' : 'idle'} />
                <Text style={s.emptyGreeting}>{dynamicGreeting}</Text>
                <Text style={s.emptySub}>No fluff. Just tell me what needs to happen.</Text>
                
                <View style={[s.starterList, { marginTop: 10 }]}>
                  {starterPrompts.map((p, i) => (
                    <TouchableOpacity
                      key={i}
                      style={s.starterChip}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        sendMessage(p.command);
                      }}
                      activeOpacity={0.75}
                    >
                      <View style={[s.starterIconBadge, { backgroundColor: p.accent + '12' }]}>
                        <Ionicons name={p.icon as any} size={14} color={p.accent} />
                      </View>
                      <View style={{ flex: 1, justifyContent: 'center' }}>
                        <Text style={s.starterChipTitle}>{p.title}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={14} color={colors.textMuted} style={{ opacity: 0.4 }} />
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}
          </ScrollView>
        ) : (
          /* ── Message thread ── */
          <FlatList
            ref={scrollRef}
            style={s.thread}
            contentContainerStyle={[
              s.threadContent,
              {
                paddingTop: isKeyboardVisible
                  ? 70
                  : Math.max(insets.bottom, 14) + (personalizedNudges.length > 0 && !isRunning ? 115 : 68),
                paddingBottom: 20,
              }
            ]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            inverted={true}
            removeClippedSubviews={true}
            data={[...messages].reverse()}
            keyExtractor={item => item.id}
            getItemLayout={(_, index) => ({ length: 80, offset: 80 * index, index })}
            ListHeaderComponent={
              <View style={{ height: 16 }}>
                {/* Cap 4: Reasoning Feed — shown above the streaming bubble during thinking */}
                <ReasoningFeed steps={reasoningSteps} visible={showReasoningFeed && isRunning} />
              </View>
            }
            renderItem={({ item, index }) => {
              const isLast = index === 0;
              return (
                <SaraBubble
                  sender={item.sender}
                  text={item.text}
                  isStreaming={item.isStreaming && isLast}
                  actionCard={item.actionCard}
                  quickReplies={isLast ? item.quickReplies : undefined}
                />
              );
            }}
          />
        )}

        {/* ── Input bar ── */}
        <View style={[s.inputBar, { paddingBottom: isKeyboardVisible ? 10 : Math.max(insets.bottom, 14) }]}>
          {/* Quick Command chips - hidden during processing and when keyboard is up */}
          {!isRunning && !isKeyboardVisible && personalizedNudges.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={s.quickChipsContainer}
              contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingBottom: 2 }}
              keyboardShouldPersistTaps="handled"
            >
              {personalizedNudges.map((cmd) => (
                <AnimatedPressable
                  key={cmd.label}
                  style={s.quickChip}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    sendMessage(cmd.command);
                  }}
                >
                  <Ionicons name={cmd.icon} size={13} color="#a599ff" style={s.quickChipIcon} />
                  <Text style={s.quickChipLabel}>{cmd.label}</Text>
                </AnimatedPressable>
              ))}
            </ScrollView>
          )}
          <View style={[s.inputRow, { paddingHorizontal: 16 }]}>
            <View style={s.inputCapsule}>
              <TextInput
                ref={inputRef}
                style={s.textInput}
                placeholder="Message Sara..."
                placeholderTextColor={colors.textMuted}
                value={input}
                onChangeText={setInput}
                onFocus={() => setKeyboardVisible(true)}
                onBlur={() => setKeyboardVisible(false)}
                onSubmitEditing={() => sendMessage(input)}
                returnKeyType="send"
                editable={!isRunning}
                multiline
                maxLength={500}
              />
              {input.trim().length > 0 ? (
                <TouchableOpacity 
                  style={[s.sendBtn, isRunning && { opacity: 0.5 }]}
                  onPress={() => sendMessage(input)}
                  disabled={isRunning}
                  activeOpacity={0.8}
                >
                  <Ionicons name="arrow-up" size={18} color={isDark ? '#000000' : '#ffffff'} />
                </TouchableOpacity>
              ) : (
                <VoiceMicButton
                  onToggleRecord={inlineDictationToggle}
                  isRecording={isVoiceRecording}
                  isProcessing={isRunning}
                  disabled={isRunning}
                />
              )}
            </View>
          </View>
        </View>

        {/* Cap 3: Tier-1 silent auto-execute HUD toast */}
        <SaraHUDToast
          message={hudToast.message}
          visible={hudToast.visible}
          onDismiss={() => setHudToast(prev => ({ ...prev, visible: false }))}
        />
      </Reanimated.View>

      {/* ΓöÇΓöÇ Voice Mode Overlay ΓöÇΓöÇ */}
      <Modal visible={isVoiceMode} animationType="fade" transparent={false} statusBarTranslucent>
        <View style={s.voiceOverlay}>
          {/* Close X */}
          <TouchableOpacity style={s.voiceClose} onPress={closeVoiceMode} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="close" size={20} color={colors.textPrimary} />
          </TouchableOpacity>

          {/* Orb */}
          <View style={s.voiceOrbArea}>
            <VoiceOrb
              size="large"
              status={voiceStatus === 'listening' ? (isVoiceRecording ? 'listening' : 'idle') : voiceStatus}
            />
          </View>

          {/* Status */}
          <Text style={s.voiceStatus}>
            {voiceStatus === 'listening' ? 'Listening...' : 
             voiceStatus === 'processing' ? 'Processing...' : 
             voiceStatus === 'success' ? 'Done' : 
             voiceStatus === 'idle' ? 'Tap to speak' :
             'Speaking...'}
          </Text>

          {/* Live caption */}
          {voiceCaption ? (
            <Text style={s.voiceCaption}>{voiceCaption}</Text>
          ) : null}

          {/* 3 Controls */}
          <View style={s.voiceControls}>
            {/* Mute */}
            <TouchableOpacity
              style={[s.voiceControlBtn, isMuted && s.voiceControlBtnActive]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setIsMuted(v => !v);
              }}
            >
              <Ionicons name={isMuted ? 'mic-off' : 'mic-off-outline'} size={22} color={isMuted ? colors.accentPrimary : colors.textMuted} />
            </TouchableOpacity>

            {/* End call ΓÇö large red button */}
            <TouchableOpacity style={s.voiceEndBtn} onPress={endVoiceCall}>
              <View style={s.voiceEndBtnInner} />
            </TouchableOpacity>

            {/* Switch to keyboard */}
            <TouchableOpacity
              style={s.voiceControlBtn}
              onPress={() => {
                closeVoiceMode();
                safeSetTimeout(() => inputRef.current?.focus(), 300);
              }}
            >
              <Ionicons name="keypad-outline" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ΓöÇΓöÇ Overflow Menu Overlay ΓöÇΓöÇ */}
      {menuOpen && (
        <Pressable style={[StyleSheet.absoluteFill, { zIndex: 999, elevation: 999 }]} onPress={() => setMenuOpen(false)}>
          <View style={s.menuOverlayWrapper}>
            <View style={[s.menuCard, { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 8 }]}>
              {[
                { label: 'Clear conversation', icon: 'trash-outline', action: () => { setMessages([]); setHistory([]); setMenuOpen(false); } },
                { label: 'Settings', icon: 'settings-outline', action: () => { setMenuOpen(false); navigation.navigate('MoreStack', { screen: 'Settings' }); } },
                { label: 'About Sara', icon: 'information-circle-outline', action: () => { setMenuOpen(false); setAboutModalOpen(true); } },
              ].map((item, i) => (
                <TouchableOpacity key={i} style={s.menuRow} onPress={item.action}>
                  <Ionicons name={item.icon as any} size={18} color={colors.textSecondary} />
                  <Text style={s.menuRowText}>{item.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </Pressable>
      )}

      {/* ΓöÇΓöÇ About Sara Modal ΓöÇΓöÇ */}
      <Modal visible={aboutModalOpen} transparent animationType="fade">
        <View style={s.aboutOverlay}>
          <View style={s.aboutCard}>
            {/* Header */}
            <View style={s.aboutHeader}>
              <View style={s.aboutOrbBadge}>
                <Ionicons name="planet" size={26} color={colors.accentPrimary} />
              </View>
              <Text style={s.aboutTitle}>S.A.R.A.</Text>
              <Text style={s.aboutSubtitle}>Systematic AI Resource Agent ┬╖ Engine v2</Text>
            </View>

            <ScrollView style={s.aboutScroll} showsVerticalScrollIndicator={false}>

              {/* ΓöÇΓöÇ Live Capabilities ΓöÇΓöÇ */}
              <Text style={s.aboutSectionTitle}>What I can do right now</Text>
              {[
                { icon: 'calendar-outline', color: '#89dceb', label: 'Bulk scheduling', desc: 'Create 5+ tasks or events in one command via parallel DAG execution' },
                { icon: 'flash-outline', color: colors.accentPrimary, label: 'Instant actions', desc: 'Log habits, mark attendance, complete tasks ΓÇö confirmed with a single tap' },
                { icon: 'analytics-outline', color: '#5eda9e', label: 'Cross-module insights', desc: 'Connects your tasks, attendance, gym & goals into one daily picture' },
                { icon: 'navigate-outline', color: '#ff9f4d', label: 'Deep navigation', desc: 'Navigate and pre-fill any screen in the app with [NAVIGATE:X] tokens' },
                { icon: 'search-outline', color: '#64D2FF', label: 'Live web search', desc: 'Searches the internet and uses results to answer or create context' },
                { icon: 'mic-outline', color: '#a599ff', label: 'Voice capture', desc: 'Tap mic in chat ΓÇö speak, transcribe, send. No manual typing needed' },
                { icon: 'notifications-outline', color: '#ff9f4d', label: 'Notification control', desc: 'Ask Sara to adjust any reminder or schedule setting by name' },
              ].map((cap, i) => (
                <View key={i} style={s.aboutCapRow}>
                  <View style={[s.aboutCapIcon, { backgroundColor: cap.color + '1A' }]}>
                    <Ionicons name={cap.icon as any} size={16} color={cap.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.aboutCapLabel}>{cap.label}</Text>
                    <Text style={s.aboutCapDesc}>{cap.desc}</Text>
                  </View>
                </View>
              ))}

              {/* ΓöÇΓöÇ Engine v2 Intelligence ΓöÇΓöÇ */}
              <Text style={s.aboutSectionTitle}>Intelligence Architecture</Text>
              {[
                { icon: 'git-branch-outline', color: '#a599ff', label: 'Cap 1 ┬╖ Contextual Memory Graph', desc: 'Remembers patterns, stress markers, and preferences across sessions via on-device graph' },
                { icon: 'filter-outline', color: '#5eda9e', label: 'Cap 2 ┬╖ Intent-Ranked Context', desc: 'Detects your intent in <5ms and injects only the relevant data ΓÇö zero wasted tokens' },
                { icon: 'shield-checkmark-outline', color: '#89dceb', label: 'Cap 3 ┬╖ Confidence-Gated Actions', desc: '3-tier gateway: silent auto-execute (Tier 1), 1-tap pill (Tier 2), full card (Tier 3)' },
                { icon: 'eye-outline', color: '#ff9f4d', label: 'Cap 4 ┬╖ Reasoning Transparency', desc: 'Live step-by-step reasoning feed shows you exactly what Sara is thinking' },
                { icon: 'bulb-outline', color: '#a599ff', label: 'Cap 5 ┬╖ Predictive Surface Injection', desc: 'Proactively surfaces banners on each screen before you even open Sara' },
                { icon: 'pulse-outline', color: '#5eda9e', label: 'Cap 6 ┬╖ Dual-Stream Voice', desc: 'VAD auto-detects speech end; sentence-level TTS starts speaking before response finishes' },
                { icon: 'person-outline', color: '#64D2FF', label: 'Cap 7 ┬╖ Behavioral Fingerprint', desc: 'Silently adapts tone, module order, and quote style based on your real usage patterns' },
              ].map((eng, i) => (
                <View key={i} style={s.aboutCapRow}>
                  <View style={[s.aboutCapIcon, { backgroundColor: eng.color + '1A' }]}>
                    <Ionicons name={eng.icon as any} size={16} color={eng.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.aboutCapLabel}>{eng.label}</Text>
                    <Text style={s.aboutCapDesc}>{eng.desc}</Text>
                  </View>
                </View>
              ))}

              {/* ΓöÇΓöÇ Ecosystem Reach ΓöÇΓöÇ */}
              <Text style={s.aboutSectionTitle}>Ecosystem reach ΓÇö 12 modules</Text>
              <View style={s.aboutModuleGrid}>
                {[
                  { icon: 'checkmark-done-outline', label: 'Tasks' },
                  { icon: 'flame-outline', label: 'Habits' },
                  { icon: 'calendar-outline', label: 'Calendar' },
                  { icon: 'document-text-outline', label: 'Notes' },
                  { icon: 'trophy-outline', label: 'Goals' },
                  { icon: 'barbell-outline', label: 'Gym' },
                  { icon: 'school-outline', label: 'Attendance' },
                  { icon: 'reader-outline', label: 'Assignments' },
                  { icon: 'book-outline', label: 'Learning' },
                  { icon: 'briefcase-outline', label: 'Jobs' },
                  { icon: 'analytics-outline', label: 'Analytics' },
                  { icon: 'notifications-outline', label: 'Notifications' },
                ].map((mod, i) => (
                  <View key={i} style={s.aboutModuleChip}>
                    <Ionicons name={mod.icon as any} size={12} color={colors.accentPrimary} />
                    <Text style={s.aboutModuleLabel}>{mod.label}</Text>
                  </View>
                ))}
              </View>

              {/* ΓöÇΓöÇ Future Roadmap ΓöÇΓöÇ */}
              <Text style={s.aboutSectionTitle}>Coming next</Text>
              {[
                { icon: 'radio-outline', color: '#ff9f4d', label: 'Ambient voice mode', desc: 'Always-on wake-word detection ΓÇö talk hands-free anywhere in the app' },
                { icon: 'git-merge-outline', color: '#a599ff', label: 'Proactive mission planner', desc: 'Sara autonomously plans your entire week based on deadlines, energy, and goals' },
                { icon: 'trending-up-outline', color: '#5eda9e', label: 'Predictive habit correction', desc: 'Detects streak-break risk 48h ahead and intervenes with a micro-challenge' },
                { icon: 'globe-outline', color: '#89dceb', label: 'Google Workspace sync', desc: 'Read/write Gmail, Calendar, Drive and Docs directly from Sara chat' },
                { icon: 'aperture-outline', color: '#64D2FF', label: 'Gemini Live real-time', desc: 'Sub-200ms conversational AI with vision ΓÇö Sara sees your screen and reacts' },
              ].map((fut, i) => (
                <View key={i} style={s.aboutCapRow}>
                  <View style={[s.aboutCapIcon, { backgroundColor: fut.color + '1A' }]}>
                    <Ionicons name={fut.icon as any} size={16} color={fut.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.aboutCapLabel}>{fut.label}</Text>
                    <Text style={s.aboutCapDesc}>{fut.desc}</Text>
                  </View>
                </View>
              ))}

              {/* ΓöÇΓöÇ Live Stats ΓöÇΓöÇ */}
              <Text style={s.aboutSectionTitle}>Sara's current view of your world</Text>
              <View style={s.aboutStatsRow}>
                <View style={s.aboutStatChip}>
                  <Text style={s.aboutStatNum}>{(tasks || []).length}</Text>
                  <Text style={s.aboutStatLabel}>Tasks</Text>
                </View>
                <View style={s.aboutStatChip}>
                  <Text style={s.aboutStatNum}>{(habits || []).length}</Text>
                  <Text style={s.aboutStatLabel}>Habits</Text>
                </View>
                <View style={s.aboutStatChip}>
                  <Text style={s.aboutStatNum}>{(goals || []).length}</Text>
                  <Text style={s.aboutStatLabel}>Goals</Text>
                </View>
                <View style={s.aboutStatChip}>
                  <Text style={s.aboutStatNum}>{(gymLogs || []).length}</Text>
                  <Text style={s.aboutStatLabel}>Gym logs</Text>
                </View>
              </View>
              <View style={{ height: 8 }} />
            </ScrollView>

            <TouchableOpacity style={s.aboutCloseBtn} activeOpacity={0.8} onPress={() => setAboutModalOpen(false)}>
              <Text style={s.aboutCloseBtnText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );

  if (isGlobalModal) {
    return (
      <Modal visible={internalVisible} transparent animationType="fade" onRequestClose={onClose}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }} />
        </Pressable>
        <Animated.View style={[{ flex: 1, marginTop: '15%' }, { transform: [{ translateY }] }]}>
          <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
            <View {...panResponder.panHandlers} style={{ alignItems: 'center', paddingTop: 16, paddingBottom: 16 }}>
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: isDark ? '#3a3a3c' : '#D1D1D6' }} />
            </View>
            {content}
          </SafeAreaView>
        </Animated.View>
      </Modal>
    );
  }

  if (isModal) {
    return (
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => { if (onClose) onClose(); else navigation.goBack(); }} />
        <SafeAreaView edges={['bottom']} style={{ flex: 1, marginTop: isKeyboardVisible ? 0 : '15%', backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' }}>
          <View style={{ alignItems: 'center', marginTop: 12, marginBottom: 4 }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: isDark ? '#3a3a3c' : '#D1D1D6' }} />
          </View>
          {content}
        </SafeAreaView>
      </View>
    );
  }

  return (
    <SafeAreaView style={s.root}>
      {content}
    </SafeAreaView>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────
const makeStyles = (colors: any, isDark: boolean = true) => StyleSheet.create({
      root: { flex: 1, backgroundColor: colors.background },

      // Header
      header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
      },
      headerBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)',
        alignItems: 'center',
        justifyContent: 'center',
      },
      headerTitle: { fontSize: 16, fontWeight: '600', color: colors.textPrimary },

      // Text/Voice mode segmented control
      modeSegment: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
        gap: 6,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
      },
      modeSegmentBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 7,
        borderRadius: RADIUS.full,
        backgroundColor: colors.surface2,
        borderWidth: 1,
        borderColor: colors.border,
      },
      modeSegmentBtnActive: {
        backgroundColor: colors.accentPrimary,
        borderColor: colors.accentPrimary,
      },
      modeSegmentText: {
        fontFamily: FONT_FAMILY.medium,
        fontSize: FONT_SIZE.sm,
        color: colors.textMuted,
      },
      modeSegmentTextActive: {
        color: isDark ? colors.background : '#ffffff',
        fontFamily: FONT_FAMILY.bold,
      },


      // Empty state
      emptyState: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 24,
        paddingBottom: 40,
      },
      emptyGreeting: {
        fontSize: 22,
        fontFamily: FONT_FAMILY.bold,
        color: colors.textPrimary,
        textAlign: 'center',
        marginTop: 20,
        marginBottom: 6,
        letterSpacing: 0.2,
      },
      emptySub: {
        fontSize: 13.5,
        fontFamily: FONT_FAMILY.body,
        color: colors.textSecondary,
        textAlign: 'center',
        lineHeight: 20,
        marginBottom: 28,
      },
      starterList: { width: '100%', gap: 10 },
      starterChip: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.surface,
        borderRadius: 14,
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderWidth: 1,
        borderColor: colors.border,
        gap: 12,
        shadowColor: isDark ? '#000000' : 'rgba(0,0,0,0.05)',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: isDark ? 0.3 : 0.1,
        shadowRadius: 4,
        elevation: 2,
      },
      starterIconBadge: {
        width: 30,
        height: 30,
        borderRadius: 15,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(108,92,231,0.08)',
      },
      starterChipTitle: {
        fontFamily: FONT_FAMILY.medium,
        fontSize: 13.5,
        color: colors.textPrimary,
      },

      // Thread
      thread: { flex: 1 },
      threadContent: { paddingBottom: 8 },

      // Input bar
      inputBar: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        flexDirection: 'column',
        paddingTop: 4,
        backgroundColor: 'transparent',
        borderTopWidth: 0,
        zIndex: 10,
      },
      // Row within input bar (TextInput + send/mic button)
      inputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 0,
      },
      // Quick command chips scroller
      quickChipsContainer: {
        flexGrow: 0,
        marginBottom: 4,
      },
      quickChip: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.surface,
        borderRadius: 18,
        paddingVertical: 7,
        paddingHorizontal: 13,
        borderWidth: 1,
        borderColor: colors.border,
        gap: 6,
        shadowColor: isDark ? '#000000' : 'rgba(0,0,0,0.04)',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 1,
      },
      quickChipIcon: {
        // Inline with label
      },
      quickChipLabel: {
        fontFamily: FONT_FAMILY.medium,
        fontSize: 12.5,
        color: colors.textPrimary,
        letterSpacing: 0.1,
      },
      inputCapsule: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.surface,
        borderRadius: 25,
        borderWidth: 1,
        borderColor: isDark ? 'rgba(255,255,255,0.12)' : colors.border,
        paddingLeft: 16,
        paddingRight: 6,
        minHeight: 48,
        shadowColor: isDark ? '#000000' : 'rgba(0,0,0,0.06)',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 6,
        elevation: 3,
      },
      textInput: {
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

      // ── Voice overlay ────────────────────────────────────────────────────────
      voiceOverlay: {
        flex: 1,
        backgroundColor: colors.background,
        alignItems: 'center',
        justifyContent: 'center',
        paddingBottom: 60,
      },
      voiceClose: {
        position: 'absolute',
        top: Platform.OS === 'ios' ? 56 : 40,
        right: 24,
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
        borderWidth: 1,
        borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
      },
      voiceOrbArea: {
        marginBottom: 32,
      },
      voiceStatus: {
        fontSize: 14,
        fontWeight: '400',
        color: colors.textMuted,
        marginBottom: 16,
        letterSpacing: 0.3,
      },
      voiceCaption: {
        fontSize: 16,
        fontWeight: '400',
        color: colors.accentPrimary,
        fontStyle: 'italic',
        textAlign: 'center',
        paddingHorizontal: 40,
        lineHeight: 24,
        marginBottom: 8,
      },
      voiceControls: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 36,
        position: 'absolute',
        bottom: 64,
      },
      voiceControlBtn: {
        width: 52,
        height: 52,
        borderRadius: 26,
        backgroundColor: colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: colors.border,
      },
      voiceControlBtnActive: {
        backgroundColor: colors.accentDim,
        borderWidth: 1,
        borderColor: colors.accentPrimary,
      },
      // Large red end-call button
      voiceEndBtn: {
        width: 68,
        height: 68,
        borderRadius: 34,
        backgroundColor: colors.error || '#ff453a',
        alignItems: 'center',
        justifyContent: 'center',
      },
      voiceEndBtnInner: {
        width: 24,
        height: 24,
        borderRadius: 4,
        backgroundColor: '#ffffff',
      },

      // ── Overflow menu ────────────────────────────────────────────────────────
      menuOverlayWrapper: {
        position: 'absolute',
        top: 56,
        right: 16,
        zIndex: 1000,
      },
      menuCard: {
        backgroundColor: colors.surface,
        borderRadius: 14,
        minWidth: 200,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: colors.border,
        shadowColor: isDark ? '#000000' : 'rgba(0,0,0,0.1)',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 10,
        elevation: 6,
      },
      menuRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingVertical: 13,
        paddingHorizontal: 16,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
      },
      menuRowText: { fontSize: 15, fontWeight: '400', color: colors.textSecondary },

      // ── About Modal ──────────────────────────────────────────────────────────
      aboutOverlay: {
        flex: 1,
        backgroundColor: isDark ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.35)',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 20,
      },
      aboutCard: {
        width: '100%',
        maxHeight: '88%',
        backgroundColor: colors.surfaceRaised || colors.surface,
        borderRadius: 24,
        padding: 22,
        borderWidth: 1,
        borderColor: colors.border,
        shadowColor: colors.accentPrimary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 24,
        elevation: 14,
      },
      aboutHeader: {
        alignItems: 'center',
        marginBottom: 20,
      },
      aboutIconBadge: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: colors.surface2,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 12,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
      },
      aboutOrbBadge: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: colors.accentDim,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 12,
        borderWidth: 1,
        borderColor: colors.accentPrimary,
        shadowColor: colors.accentPrimary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.4,
        shadowRadius: 12,
      },
      aboutTitle: {
        fontSize: 22,
        fontFamily: FONT_FAMILY.bold,
        color: colors.textPrimary,
        letterSpacing: 0.5,
      },
      aboutSubtitle: {
        fontSize: 11,
        fontFamily: FONT_FAMILY.medium,
        color: colors.accentPrimary,
        marginTop: 4,
        textTransform: 'uppercase',
        letterSpacing: 1.2,
        opacity: 0.8,
      },
      aboutScroll: {
        marginBottom: 16,
      },
      aboutSectionTitle: {
        fontSize: 11,
        fontFamily: FONT_FAMILY.bold,
        color: colors.textMuted,
        marginTop: 20,
        marginBottom: 10,
        textTransform: 'uppercase',
        letterSpacing: 1.2,
      },
      aboutBody: {
        fontSize: 14,
        fontFamily: FONT_FAMILY.body,
        color: colors.textMuted,
        lineHeight: 22,
      },
      aboutCapRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
        marginBottom: 10,
      },
      aboutCapIcon: {
        width: 32,
        height: 32,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      },
      aboutCapLabel: {
        fontSize: 13,
        fontFamily: FONT_FAMILY.bold,
        color: colors.textPrimary,
        marginBottom: 2,
      },
      aboutCapDesc: {
        fontSize: 12,
        fontFamily: FONT_FAMILY.body,
        color: colors.textMuted,
        lineHeight: 17,
      },
      aboutModuleGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
      },
      aboutModuleChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        backgroundColor: colors.accentDim,
        borderRadius: 20,
        paddingVertical: 5,
        paddingHorizontal: 10,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
      },
      aboutModuleLabel: {
        fontSize: 11,
        fontFamily: FONT_FAMILY.medium,
        color: colors.accentPrimary,
        opacity: 0.9,
      },
      aboutStatsRow: {
        flexDirection: 'row',
        gap: 8,
      },
      aboutStatChip: {
        flex: 1,
        backgroundColor: colors.surface2 || colors.surface,
        borderRadius: 12,
        paddingVertical: 10,
        alignItems: 'center',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
      },
      aboutStatNum: {
        fontSize: 20,
        fontFamily: FONT_FAMILY.bold,
        color: colors.accentPrimary,
      },
      aboutStatLabel: {
        fontSize: 10,
        fontFamily: FONT_FAMILY.medium,
        color: colors.textMuted,
        marginTop: 2,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
      },
      aboutCloseBtn: {
        backgroundColor: 'transparent',
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
      },
      aboutCloseBtnText: {
        color: colors.textPrimary,
        fontSize: 15,
        fontFamily: FONT_FAMILY.medium,
      },
    });
