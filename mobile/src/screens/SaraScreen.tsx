/**
 * SaraScreen — ChatGPT-style AI assistant interface for ZenTrack.
 *
 * Two modes:
 *   1. TEXT MODE (default) — chat thread with bubbles, starter chips, streaming
 *   2. VOICE MODE (modal overlay) — full-screen orb, live caption, 3 controls
 *
 * Design principles applied:
 *   - Purple (#a599ff) = Sara's UI identity (matches app-wide accent)
 *   - Green (#5eda9e) = success/completion ONLY, never Sara's identity
 *   - Warm personality: "Hey, what's on your mind?" not "Awaiting Command"
 *   - One conversation thread — voice + text are two modes of the same thread
 *   - Actions deep-link directly into the relevant screen, never dead-ends
 */

import { SafeAreaView } from 'react-native-safe-area-context';
import { FONT_FAMILY, FONT_SIZE, RADIUS } from '../theme/tokens';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Animated, TextInput, Modal, Platform, KeyboardAvoidingView,
  Pressable, StatusBar, Keyboard, FlatList, PanResponder
} from 'react-native';
import AnimatedPressable from '../components/AnimatedPressable';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';

import VoiceOrb from '../components/SARA/VoiceOrb';
import VoiceMicButton from '../components/SARA/VoiceMicButton';
import SaraBubble, { ActionCardData, QuickReplyData } from '../components/SARA/SaraBubble';
import StreamingText from '../components/SARA/StreamingText';
import { useSaraNavigation } from '../hooks/useSaraNavigation';
import { parseActionFromText, compressMemoryToSummary } from '../agent/saraAgent';
import BatchActionCard, { parseBatchActions, BatchAction } from '../components/SARA/BatchActionCard';
import { orchestrateAgent } from '../agent/orchestrator';

import { callGeminiProxy } from '../services/geminiProxy';
import { COLLECTION } from '../config/constants';
import * as Crypto from 'expo-crypto';
import { db } from '../services/firebase';
import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  serverTimestamp, increment
} from 'firebase/firestore';
import { useMobileData } from '../contexts/MobileDataContext';
import {
  startVoiceRecording,
  startVADRecording,
  stopAndTranscribe,
  cancelVoiceRecording,
} from '../services/voiceEngine';
import { speakWithSarvam } from '../services/sarvamProxy';
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

// ── Design tokens ─────────────────────────────────────────────────────────

// ── Starter prompts ───────────────────────────────────────────────────────
const STARTER_PROMPTS = [
  { label: 'Plan my day',         icon: 'sunny-outline' as const },
  { label: "Log today's workout", icon: 'barbell-outline' as const },
  { label: "What's due this week",icon: 'calendar-outline' as const },
];

// ── Message type ──────────────────────────────────────────────────────────
interface ChatMessage {
  id: string;
  sender: 'sara' | 'user';
  text: string;
  isStreaming?: boolean;
  actionCard?: ActionCardData;
  quickReplies?: QuickReplyData[];
  batchActions?: BatchAction[];
}

// ── Quick-reply suggestion logic ──────────────────────────────────────────
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

// ── Deep-link action card extraction ─────────────────────────────────────
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

// ── Main component ────────────────────────────────────────────────────────
export interface SaraProps {
  visible?: boolean;
  onClose?: () => void;
  isGlobalModal?: boolean;
}

export default function SaraScreen(props: SaraProps) {
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
    const { colors, isDark } = useTheme();
    const s = makeStyles(colors);
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
  // Cap 4 — Reasoning Transparency
  const [reasoningSteps, setReasoningSteps] = useState<ReasoningStep[]>([]);
  const [showReasoningFeed, setShowReasoningFeed] = useState(false);
  // Cap 3 — HUD Toast state (Tier 1 silent auto-execute)
  const [hudToast, setHudToast] = useState<{ message: string; visible: boolean }>({ message: '', visible: false });
  // Cap 3 — Inline pill states per message id
  const [pillStates, setPillStates] = useState<Record<string, 'pending' | 'confirmed' | 'rejected'>>({});

  // Load chat history + memory summary from storage
  useEffect(() => {
    AsyncStorage.multiGet(['sara_chat_history', 'sara_memory_summary']).then(pairs => {
      const [histEntry, memEntry] = pairs;
      if (histEntry[1]) {
        try {
          const parsed = JSON.parse(histEntry[1]);
          if (parsed.messages) {
            // Strip quickReplies on restore — they have no onPress callbacks in storage.
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
    });
  }, []);

  // FIX #14 + PERF: Save chat history only when a full response is received (isRunning: true→false).
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

  // Voice mode state
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [voiceCaption, setVoiceCaption] = useState('');
  const [voiceStatus, setVoiceStatus] = useState<'listening' | 'processing' | 'speaking'>('listening');
  const [isMuted, setIsMuted] = useState(false);
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);
  const [isKeyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [aboutModalOpen, setAboutModalOpen] = useState(false);

  // Custom animation and pan responder for global modal
  const translateY = useRef(new Animated.Value(1000)).current;
  const [internalVisible, setInternalVisible] = useState(visible || false);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          translateY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 150 || gestureState.vy > 1) {
          // Close
          if (onClose) onClose();
        } else {
          // Snap back
          Animated.spring(translateY, {
            toValue: 0,
            stiffness: 250,
            damping: 30,
            mass: 0.8,
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
        Animated.spring(translateY, {
          toValue: 0,
          stiffness: 250,
          damping: 30,
          mass: 0.8,
          useNativeDriver: true,
        }).start();
      } else {
        Animated.timing(translateY, {
          toValue: 1000,
          duration: 250, // increased duration for smoother exit
          useNativeDriver: true,
        }).start(() => {
          setInternalVisible(false);
        });
      }
    }
  }, [visible, isGlobalModal]);

  // Trigger initial prompt if passed via navigation
  useEffect(() => {
    if (initialRoutePrompt && messages.length === 0 && !isRunning && isLoaded) {
      sendMessage(initialRoutePrompt);
      if (navigation.setParams) {
        navigation.setParams({ initialPrompt: undefined });
      }
    }
  }, [initialRoutePrompt, messages.length, isRunning, isLoaded]);

  // Keyboard listener
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    
    const showSub = Keyboard.addListener(showEvent, () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardVisible(false));
    
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Overflow menu
  const scrollRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);

  const scrollToBottom = () => {
    setTimeout(() => scrollRef.current?.scrollToOffset({ offset: 0, animated: true }), 80);
  };

  // ── Send a message ──────────────────────────────────────────────────────
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
            // Cap 4: Pure reasoning step — only updates reasoning feed, not bubble text
            setReasoningSteps(prev => [
              ...prev,
              { id: `rs-${Date.now()}-${Math.random()}`, label: step.title, timestamp: Date.now() }
            ]);
          } else if (step.type === 'stream') {
            setMessages(prev => prev.map(m =>
              m.id === saraMsgId ? { ...m, text: step.text, isStreaming: true } : m
            ));
          } else if (step.type === 'voice_sentence_ready') {
            // Cap 6: First sentence ready — start TTS immediately without waiting for full response
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
      const step = _finalStep || { type: 'answer', title: "I'm here — what's on your mind?" };
      const isAction = step.type === 'proposed_action';

      // Cap 3: Confidence-gated action tier classification
      if (isAction && step.action) {
        const confidence = estimateActionConfidence(step.action);
        const tier = getActionTier(step.action.type, confidence);

        if (tier === 1) {
          // Tier 1: Silent auto-execute — fire the action immediately
          const toastText = getAutoExecuteToastText(step.action.type, step.action);
          // Auto-execute the action (BFE event tracking)
          try {
            if (step.action.type === 'logHabit' && step.action.habitId && user?.uid) {
              const todayDate = new Date().toISOString().split('T')[0];
              await addDoc(collection(db, COLLECTION.HABIT_LOGS), {
                userId: user.uid, habitId: step.action.habitId,
                date: todayDate, createdAt: serverTimestamp(),
              });
              if (user?.uid) updateFingerprint(user.uid, { type: 'habit_logged' });
            } else if (step.action.type === 'completeTask' && step.action.taskId) {
              await updateDoc(doc(db, COLLECTION.TASKS, step.action.taskId), {
                status: 'completed', completedAt: new Date().toISOString(),
              });
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
            } else {
              // Tier 1 failed (unknown type) — demote to Tier 3
              setIsRunning(false);
              // Fall through to normal action handling
            }
            // Show HUD toast on success
            setHudToast({ message: toastText, visible: true });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
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
          // Tier 2: Inline pill — show in chat but no full card
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
            subtitle: `Due: ${dueDisplay}  ·  ${args.priority || 'medium'} priority`,
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
                setMessages(prev => prev.map(m =>
                  m.id === saraMsgId
                    ? { ...m, actionCard: { ...m.actionCard!, onConfirm: undefined, subtitle: '✓ Task created' } }
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
                setMessages(prev => prev.map(m =>
                  m.id === saraMsgId
                    ? { ...m, actionCard: { ...m.actionCard!, onConfirm: undefined, subtitle: '✓ Task deleted' } }
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
                    ? { ...m, actionCard: { ...m.actionCard!, onConfirm: undefined, subtitle: '✓ Marked complete' } }
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
            subtitle: changes.join('  ·  ') || 'No changes specified',
            onConfirm: async () => {
              if (Object.keys(updates).length === 0) return;
              try {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                await updateDoc(doc(db, COLLECTION.TASKS, args.taskId), updates);
                setMessages(prev => prev.map(m =>
                  m.id === saraMsgId
                    ? { ...m, actionCard: { ...m.actionCard!, onConfirm: undefined, subtitle: '✓ Task updated' } }
                    : m
                ));
              } catch (e: any) {
                alert('Failed to update task: ' + e.message);
              }
            },
          };

        } else if (name === 'logHabit') {
          const todayDate = new Date().toISOString().split('T')[0];
          actionCard = {
            icon: 'flame-outline',
            title: `Log habit: ${args.habitName}`,
            subtitle: `Mark done for today (${todayDate})`,
            onConfirm: async () => {
              try {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                await addDoc(collection(db, COLLECTION.HABIT_LOGS), {
                  userId: user!.uid,
                  habitId: args.habitId,
                  date: todayDate,
                  createdAt: serverTimestamp(),
                });
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
            subtitle: `Mark ${status} · ${args.date || 'today'}`,
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
                    ? { ...m, actionCard: { ...m.actionCard!, onConfirm: undefined, subtitle: `✓ Marked ${status}` } }
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
                    ? { ...m, actionCard: { ...m.actionCard!, onConfirm: undefined, subtitle: '✓ Note saved' } }
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
            subtitle: `${args.date}${args.startTime ? ' · ' + args.startTime : ''}  ${args.type || ''}`,
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
                    ? { ...m, actionCard: { ...m.actionCard!, onConfirm: undefined, subtitle: '✓ Event added' } }
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
                setMessages(prev => prev.map(m => m.id === saraMsgId ? { ...m, actionCard: { ...m.actionCard!, onConfirm: undefined, subtitle: '✓ Event deleted' } } : m));
              } catch (e: any) { alert('Failed to delete event: ' + e.message); }
            },
          };
        } else if (name === 'createHabit') {
          actionCard = {
            icon: 'flame-outline',
            title: args.name || 'New Habit',
            subtitle: `${args.frequency || 'daily'} ${args.emoji || '⭐'}`,
            onConfirm: async () => {
              try {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                await addDoc(collection(db, COLLECTION.HABITS), {
                  userId: user!.uid,
                  name: args.name,
                  emoji: args.emoji || '⭐',
                  frequency: args.frequency || 'daily',
                  streak: 0,
                  longestStreak: 0,
                  color: args.color || colors.accentPrimary,
                  createdAt: serverTimestamp(),
                });
                setMessages(prev => prev.map(m => m.id === saraMsgId ? { ...m, actionCard: { ...m.actionCard!, onConfirm: undefined, subtitle: '✓ Habit created' } } : m));
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
                setMessages(prev => prev.map(m => m.id === saraMsgId ? { ...m, actionCard: { ...m.actionCard!, onConfirm: undefined, subtitle: '✓ Subject created' } } : m));
              } catch (e: any) { alert('Failed to create subject: ' + e.message); }
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

  // ── Voice mode: open (Cap 6 — uses VAD for auto-submit) ──────────────────
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
          setVoiceCaption(text);
          sendMessage(text);
        },
        onError: (msg) => {
          setVoiceCaption(msg);
          setTimeout(() => setVoiceStatus('listening'), 2000);
        }
      },
      () => {
        // Voice detected callback — update UI to show Sara is listening actively
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
          setTimeout(() => inputRef.current?.focus(), 100);
        },
        onError: (msg) => {
          setIsRunning(false);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          setInput(`[Error: ${msg}]`);
          setTimeout(() => setInput(''), 2000);
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

  // ── Voice mode: close ────────────────────────────────────────────────────
  const closeVoiceMode = async () => {
    await cancelVoiceRecording();
    setIsVoiceMode(false);
    setIsVoiceRecording(false);
    setVoiceCaption('');
  };

  // ── Voice mode: stop recording → transcribe ───────────────────────────
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

  // ──────────────────────────────────────────────────────────────────────
  // RENDER
  // ──────────────────────────────────────────────────────────────────────
  const content = (
    <>
      <StatusBar barStyle="light-content" />

      {/* ── Header ── */}
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
          <Ionicons name="close" size={24} color={colors.textMuted} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Sara</Text>
        <TouchableOpacity onPress={() => setMenuOpen(true)} style={s.headerBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="ellipsis-horizontal" size={18} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {/* ── Text / Voice Segmented Control ── */}
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
          onPress={() => { if (!isVoiceMode) setIsVoiceMode(true); }}
        >
          <Ionicons
            name="mic-outline" size={13}
            color={isVoiceMode ? colors.background : colors.textMuted}
            style={{ marginRight: 4 }}
          />
          <Text style={[s.modeSegmentText, isVoiceMode && s.modeSegmentTextActive]}>Voice</Text>
        </TouchableOpacity>
      </View>

      {/* ── Chat Area ── */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"

        keyboardVerticalOffset={0}
      >
        {!hasMessages ? (
          /* ── Empty state ── */
          <ScrollView contentContainerStyle={s.emptyState} keyboardShouldPersistTaps="handled">
            {!isKeyboardVisible && (
              <>
                <VoiceOrb size="small" isActive={isRunning} />
                <Text style={s.emptyGreeting}>Hey, what's on your mind?</Text>
                <Text style={s.emptySub}>I can plan your day, log things, or just talk it through</Text>
                
                <View style={[s.starterList, { marginTop: 10 }]}>
                  {STARTER_PROMPTS.map((p, i) => (
                    <TouchableOpacity
                      key={i}
                      style={s.starterChip}
                      onPress={() => sendMessage(p.label)}
                      activeOpacity={0.72}
                    >
                      <Text style={s.starterChipText}>{p.label}</Text>
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
            contentContainerStyle={s.threadContent}
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
        <View style={[s.inputBar, { paddingBottom: isKeyboardVisible ? 10 : 16 }]}>
          <TouchableOpacity style={s.inputWrap} activeOpacity={1} onPress={() => inputRef.current?.focus()}>
            <TextInput
              ref={inputRef}
              style={s.textInput}
              placeholder="Message Sara"
              placeholderTextColor={colors.textTertiary}
              value={input}
              onChangeText={setInput}
              onSubmitEditing={() => sendMessage(input)}
              returnKeyType="send"
              editable={!isRunning}
              multiline={false}
            />
          </TouchableOpacity>
          {input.trim().length > 0 ? (
            <TouchableOpacity 
              style={[s.sendBtn, isRunning && { opacity: 0.5 }]}
              onPress={() => sendMessage(input)}
              disabled={isRunning}
            >
              <Ionicons name="send" size={18} color="#fff" style={{ marginLeft: 2 }} />
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

        {/* Cap 3: Tier-1 silent auto-execute HUD toast */}
        <SaraHUDToast
          message={hudToast.message}
          visible={hudToast.visible}
          onDismiss={() => setHudToast(prev => ({ ...prev, visible: false }))}
        />
      </KeyboardAvoidingView>

      {/* ── Voice Mode Overlay ── */}
      <Modal visible={isVoiceMode} animationType="fade" transparent={false} statusBarTranslucent>
        <View style={s.voiceOverlay}>
          {/* Close X */}
          <TouchableOpacity style={s.voiceClose} onPress={closeVoiceMode}>
            <Ionicons name="close" size={22} color={colors.textMuted} />
          </TouchableOpacity>

          {/* Orb */}
          <View style={s.voiceOrbArea}>
            <VoiceOrb
              size="large"
              isActive={voiceStatus === 'speaking' || voiceStatus === 'processing'}
              isListening={voiceStatus === 'listening' && isVoiceRecording}
            />
          </View>

          {/* Status */}
          <Text style={s.voiceStatus}>
            {voiceStatus === 'listening' ? 'Listening' : voiceStatus === 'processing' ? 'Processing...' : 'Speaking...'}
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

            {/* End call — large red button */}
            <TouchableOpacity style={s.voiceEndBtn} onPress={endVoiceCall}>
              <View style={s.voiceEndBtnInner} />
            </TouchableOpacity>

            {/* Switch to keyboard */}
            <TouchableOpacity
              style={s.voiceControlBtn}
              onPress={() => {
                closeVoiceMode();
                setTimeout(() => inputRef.current?.focus(), 300);
              }}
            >
              <Ionicons name="keypad-outline" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Overflow Menu Overlay ── */}
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

      {/* ── About Sara Modal ── */}
      <Modal visible={aboutModalOpen} transparent animationType="fade">
        <View style={s.aboutOverlay}>
          <View style={s.aboutCard}>
            <View style={s.aboutHeader}>
              <View style={s.aboutIconBadge}>
                <Ionicons name="planet" size={24} color={colors.textPrimary} />
              </View>
              <Text style={s.aboutTitle}>S.A.R.A.</Text>
              <Text style={s.aboutSubtitle}>Systematic AI Resource Agent</Text>
            </View>

            <ScrollView style={s.aboutScroll} showsVerticalScrollIndicator={false}>
              <Text style={s.aboutSectionTitle}>What I can do</Text>
              <Text style={s.aboutBody}>
                I am a deeply integrated AI assistant built directly into ZenTrack. I manage your entire life context seamlessly. You can ask me to:
                {'\n'}• Plan your day and restructure timelines.
                {'\n'}• Create, update, or delete tasks and events.
                {'\n'}• Track your habits and streak patterns.
                {'\n'}• Mark your university attendance.
                {'\n'}• Log your gym workouts, water, and sleep.
              </Text>

              <Text style={s.aboutSectionTitle}>Efficiency & Privacy</Text>
              <Text style={s.aboutBody}>
                I run via a direct, high-speed pipeline. Your data is analyzed instantly in-memory to generate context-aware responses, meaning I know your schedule before you even type a word. Everything stays securely within your ZenTrack ecosystem.
              </Text>

              <Text style={s.aboutSectionTitle}>Future Capabilities</Text>
              <Text style={s.aboutBody}>
                Soon, I will be capable of proactive nudging, voice-first ambient intelligence, autonomous habit correction, and deep predictive analytics to optimize your workflow before you even realize you're falling behind.
              </Text>
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
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
          <Animated.View style={{ flex: 1, transform: [{ translateY }] }} pointerEvents="box-none">
            <SafeAreaView edges={['bottom']} style={{ flex: 1, marginTop: isKeyboardVisible ? 0 : '15%', backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' }}>
              <View {...panResponder.panHandlers} style={{ alignItems: 'center', paddingTop: 16, paddingBottom: 16, marginTop: -4 }}>
                <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#3a3a3c' }} />
              </View>
              {content}
            </SafeAreaView>
          </Animated.View>
        </View>
      </Modal>
    );
  }

  if (isModal) {
    return (
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => { if (onClose) onClose(); else navigation.goBack(); }} />
        <SafeAreaView edges={['bottom']} style={{ flex: 1, marginTop: isKeyboardVisible ? 0 : '15%', backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' }}>
          <View style={{ alignItems: 'center', marginTop: 12, marginBottom: 4 }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#3a3a3c' }} />
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

// ── Styles ────────────────────────────────────────────────────────────────
const makeStyles = (colors: any) => StyleSheet.create({
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
      headerBtn: { width: 32, alignItems: 'center' },
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
        color: colors.background,
        fontFamily: FONT_FAMILY.bold,
      },


      // Empty state
      emptyState: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 28,
        paddingBottom: 40,
      },
      emptyGreeting: {
        fontSize: 20,
        fontWeight: '600',
        color: colors.textPrimary,
        textAlign: 'center',
        marginTop: 24,
        marginBottom: 8,
      },
      emptySub: {
        fontSize: 14,
        fontWeight: '400',
        color: colors.textMuted,
        textAlign: 'center',
        lineHeight: 20,
        marginBottom: 36,
      },
      starterList: { width: '100%', gap: 10 },
      starterChip: {
        backgroundColor: colors.surface,
        borderRadius: 14,
        paddingVertical: 14,
        paddingHorizontal: 18,
        borderWidth: 1,
        borderColor: colors.border,
      },
      starterChipText: { fontSize: 15, fontWeight: '500', color: colors.textSecondary },

      // Thread
      thread: { flex: 1 },
      threadContent: { paddingTop: 16, paddingBottom: 8 },

      // Input bar
      inputBar: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.border,
      },
      inputWrap: {
        flex: 1,
        backgroundColor: colors.accentDim,
        borderRadius: 22,
        borderWidth: 1,
        borderColor: colors.borderGlow,
        paddingHorizontal: 16,
        height: 44,
        justifyContent: 'center',
      },
      textInput: {
        fontSize: 15,
        fontWeight: '400',
        color: colors.textPrimary,
        height: '100%',
      },
      sendBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: colors.accentPrimary,
        alignItems: 'center',
        justifyContent: 'center',
      },

      // ── Voice overlay ──────────────────────────────────────────────────────
      voiceOverlay: {
        flex: 1,
        backgroundColor: '#000000',
        alignItems: 'center',
        justifyContent: 'center',
        paddingBottom: 60,
      },
      voiceClose: {
        position: 'absolute',
        top: 56,
        right: 24,
        padding: 8,
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
      },
      voiceControlBtnActive: {
        backgroundColor: 'rgba(165,153,255,0.15)',
        borderWidth: 1,
        borderColor: colors.accentPrimary,
      },
      // Large red end-call button
      voiceEndBtn: {
        width: 68,
        height: 68,
        borderRadius: 34,
        backgroundColor: '#ff453a',
        alignItems: 'center',
        justifyContent: 'center',
      },
      voiceEndBtnInner: {
        width: 24,
        height: 24,
        borderRadius: 4,
        backgroundColor: '#ffffff',
      },

      // ── Overflow menu ──────────────────────────────────────────────────────
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

      // ── About Modal ─────────────────────────────────────────────────────────
      aboutOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.7)',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 24,
      },
      aboutCard: {
        width: '100%',
        maxHeight: '80%',
        backgroundColor: '#1C1C1E', // Obsidian dark gray
        borderRadius: 20,
        padding: 24,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: 'rgba(255,255,255,0.08)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.8,
        shadowRadius: 20,
        elevation: 12,
      },
      aboutHeader: {
        alignItems: 'center',
        marginBottom: 24,
      },
      aboutIconBadge: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: 'rgba(255,255,255,0.05)',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 12,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: 'rgba(255,255,255,0.1)',
      },
      aboutTitle: {
        fontSize: 20,
        fontWeight: '600',
        color: colors.textPrimary,
        letterSpacing: 0.5,
      },
      aboutSubtitle: {
        fontSize: 11,
        fontWeight: '500',
        color: colors.textMuted,
        marginTop: 4,
        textTransform: 'uppercase',
        letterSpacing: 1.5,
      },
      aboutScroll: {
        marginBottom: 20,
      },
      aboutSectionTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.textPrimary,
        marginTop: 20,
        marginBottom: 8,
        textTransform: 'uppercase',
        letterSpacing: 1,
      },
      aboutBody: {
        fontSize: 14,
        fontWeight: '400',
        color: '#A0A0A5',
        lineHeight: 22,
      },
      aboutCloseBtn: {
        backgroundColor: 'transparent',
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: 'rgba(255,255,255,0.15)',
      },
      aboutCloseBtnText: {
        color: colors.textPrimary,
        fontSize: 15,
        fontWeight: '500',
      },
    });
