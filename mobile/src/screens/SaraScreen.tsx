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
import { COLORS } from '../theme/tokens';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Animated, TextInput, Modal, Platform, KeyboardAvoidingView,
  Pressable, StatusBar, Keyboard
} from 'react-native';
import AnimatedPressable from '../components/AnimatedPressable';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';

import VoiceOrb from '../components/SARA/VoiceOrb';
import VoiceMicButton from '../components/SARA/VoiceMicButton';
import SaraBubble, { ActionCardData, QuickReplyData } from '../components/SARA/SaraBubble';
import StreamingText from '../components/SARA/StreamingText';
import { useMobileData } from '../contexts/MobileDataContext';
import { parseActionFromText } from '../agent/saraAgent';
import { orchestrateAgent } from '../agent/orchestrator';

import { db } from '../services/firebase';
import {
  collection, addDoc, updateDoc, deleteDoc, doc,
  serverTimestamp, increment
} from 'firebase/firestore';
import { useSaraNavigation } from '../hooks/useSaraNavigation';
import {
  startVoiceRecording,
  stopAndTranscribe,
  cancelVoiceRecording,
} from '../services/voiceEngine';
import { speakWithSarvam } from '../services/sarvaProxy';

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
        onPress: () => navigation.navigate('MoreStack', { screen: 'Tasks' }),
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
  if (props.isGlobalModal) {
    return <SaraScreenInner {...props} isModal={true} />;
  }
  return <SaraScreenWithRoute {...props} />;
}

function SaraScreenWithRoute(props: SaraProps) {
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
  const {
    tasks, habits, habitLogs, notes, goals, gymLogs,
    attendance, assignments, customEvents, learningTopics,
    jobs, weeklyReviews, waterLogs, sleepLogs,
    googleAccessToken, user,
  } = useMobileData();
  const { processAnswerForNavigation } = useSaraNavigation();
  const navigation = useNavigation<any>();

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [history, setHistory] = useState<any[]>([]);

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

  // Fast custom animation for global modal
  const translateY = useRef(new Animated.Value(1000)).current;
  const [internalVisible, setInternalVisible] = useState(visible || false);

  useEffect(() => {
    if (isGlobalModal) {
      if (visible) {
        setInternalVisible(true);
        Animated.spring(translateY, {
          toValue: 0,
          stiffness: 300,
          damping: 25,
          mass: 0.5,
          useNativeDriver: true,
        }).start();
      } else {
        Animated.timing(translateY, {
          toValue: 1000,
          duration: 120,
          useNativeDriver: true,
        }).start(() => {
          setInternalVisible(false);
        });
      }
    }
  }, [visible, isGlobalModal]);

  // Trigger initial prompt if passed via navigation
  useEffect(() => {
    if (initialRoutePrompt && messages.length === 0 && !isRunning) {
      sendMessage(initialRoutePrompt);
      if (navigation.setParams) {
        navigation.setParams({ initialPrompt: undefined });
      }
    }
  }, [initialRoutePrompt, messages.length, isRunning]);

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
  const scrollRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);

  const scrollToBottom = () => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
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

    const newHistory = [...history, { role: 'user', content: instruction.trim() }];
    setHistory(newHistory);
    setIsRunning(true);

    // Collect the final step result from orchestrateAgent's onStep callbacks
    let _finalStep: any = null;

    try {
      await orchestrateAgent(
        instruction.trim(),
        {
          tasks, habits, habitLogs, notes, goals, gymLogs,
          attendance, assignments, customEvents, learningTopics,
          jobs, weeklyReviews, waterLogs, sleepLogs,
          googleAccessToken: googleAccessToken ?? undefined, userId: user?.uid,
        },
        (step) => {
          // Stream thinking steps into Sara bubble text
          if (step.type === 'thinking') {
            setMessages(prev => prev.map(m =>
              m.id === saraMsgId ? { ...m, text: step.title, isStreaming: true } : m
            ));
          } else {
            _finalStep = step;
          }
        },
        history
      );

      // Build a result-like object from the final step (mirrors processSaraChat shape)
      const step = _finalStep || { type: 'answer', title: "I'm here — what's on your mind?" };
      const isAction = step.type === 'proposed_action';
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
                // ✅ FIXED: top-level 'tasks' collection with userId field
                await addDoc(collection(db, 'todos'), {
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
            onEditTime: () => navigation.navigate('MoreStack', { screen: 'Tasks' }),
          };

        } else if (name === 'deleteTask') {
          actionCard = {
            icon: 'trash-outline',
            title: `Delete: ${args.taskTitle}`,
            subtitle: 'This cannot be undone',
            onConfirm: async () => {
              try {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                await deleteDoc(doc(db, 'todos', args.taskId));
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
                await updateDoc(doc(db, 'todos', args.taskId), {
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
                await updateDoc(doc(db, 'todos', args.taskId), updates);
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
                await addDoc(collection(db, 'habitLogs'), {
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
                const subRef = doc(db, 'attendance_subjects', args.subjectId);
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
                // ✅ FIXED: top-level 'notes' collection with userId field
                await addDoc(collection(db, 'notes'), {
                  userId: user!.uid,
                  title: args.title || 'Quick Note',
                  content: args.content,
                  tags: [],
                  createdAt: serverTimestamp(),
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
                await addDoc(collection(db, 'calendar_events'), {
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

      // Replace the streaming Sara bubble with the final response
      setMessages(prev =>
        prev.map(m =>
          m.id === saraMsgId
            ? { ...m, text: cleanText, isStreaming: false, actionCard, quickReplies }
            : m
        )
      );

      setHistory(prev => [...prev, { role: 'assistant', content: result.rawText || cleanText }]);
      scrollToBottom();

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
    }
  }, [isRunning, history, tasks, habits, habitLogs, notes, goals, gymLogs,
      attendance, assignments, customEvents, learningTopics,
      jobs, weeklyReviews, waterLogs, sleepLogs,
      googleAccessToken, user, isVoiceMode, navigation]);

  // ── Voice mode: open ────────────────────────────────────────────────────
  const openVoiceMode = useCallback(() => {
    Keyboard.dismiss();
    setIsVoiceMode(true);
    setVoiceCaption('');
    setVoiceStatus('listening');
    setIsMuted(false);

    startVoiceRecording({
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
    });
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
          setInput('');
          sendMessage(text);
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
          <Ionicons name="close" size={24} color={COLORS.textMuted} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Sara</Text>
        <TouchableOpacity onPress={() => setMenuOpen(true)} style={s.headerBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="ellipsis-horizontal" size={18} color={COLORS.textMuted} />
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
          <ScrollView
            ref={scrollRef}
            style={s.thread}
            contentContainerStyle={s.threadContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {messages.map((msg, idx) => {
              const isLast = idx === messages.length - 1;
              return (
                <SaraBubble
                  key={msg.id}
                  sender={msg.sender}
                  text={msg.text}
                  isStreaming={msg.isStreaming && isLast}
                  actionCard={msg.actionCard}
                  quickReplies={isLast ? msg.quickReplies : undefined}
                />
              );
            })}
            {/* Breathing space at bottom */}
            <View style={{ height: 16 }} />
          </ScrollView>
        )}

        {/* ── Input bar ── */}
        <View style={[s.inputBar, { paddingBottom: isKeyboardVisible ? 10 : 16 }]}>
          <TouchableOpacity style={s.inputWrap} activeOpacity={1} onPress={() => inputRef.current?.focus()}>
            <TextInput
              ref={inputRef}
              style={s.textInput}
              placeholder="Message Sara"
              placeholderTextColor={COLORS.textTertiary}
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
      </KeyboardAvoidingView>

      {/* ── Voice Mode Overlay ── */}
      <Modal visible={isVoiceMode} animationType="fade" transparent={false} statusBarTranslucent>
        <View style={s.voiceOverlay}>
          {/* Close X */}
          <TouchableOpacity style={s.voiceClose} onPress={closeVoiceMode}>
            <Ionicons name="close" size={22} color={COLORS.textMuted} />
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
              <Ionicons name={isMuted ? 'mic-off' : 'mic-off-outline'} size={22} color={isMuted ? COLORS.accentPrimary : COLORS.textMuted} />
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
              <Ionicons name="keypad-outline" size={22} color={COLORS.textMuted} />
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
                  <Ionicons name={item.icon as any} size={18} color={COLORS.textSecondary} />
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
                <Ionicons name="planet" size={24} color={COLORS.textPrimary} />
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
            <SafeAreaView edges={['bottom']} style={{ flex: 1, marginTop: isKeyboardVisible ? 0 : '15%', backgroundColor: COLORS.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' }}>
              <View style={{ alignItems: 'center', marginTop: 12, marginBottom: 4 }}>
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
        <SafeAreaView edges={['bottom']} style={{ flex: 1, marginTop: isKeyboardVisible ? 0 : '15%', backgroundColor: COLORS.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' }}>
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
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  headerBtn: { width: 32, alignItems: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '600', color: COLORS.textPrimary },

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
    color: COLORS.textPrimary,
    textAlign: 'center',
    marginTop: 24,
    marginBottom: 8,
  },
  emptySub: {
    fontSize: 14,
    fontWeight: '400',
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 36,
  },
  starterList: { width: '100%', gap: 10 },
  starterChip: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  starterChipText: { fontSize: 15, fontWeight: '500', color: COLORS.textSecondary },

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
    borderTopColor: COLORS.border,
  },
  inputWrap: {
    flex: 1,
    backgroundColor: COLORS.accentDim,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: COLORS.borderGlow,
    paddingHorizontal: 16,
    height: 44,
    justifyContent: 'center',
  },
  textInput: {
    fontSize: 15,
    fontWeight: '400',
    color: COLORS.textPrimary,
    height: '100%',
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.accentPrimary,
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
    color: COLORS.textMuted,
    marginBottom: 16,
    letterSpacing: 0.3,
  },
  voiceCaption: {
    fontSize: 16,
    fontWeight: '400',
    color: COLORS.accentPrimary,
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
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceControlBtnActive: {
    backgroundColor: 'rgba(165,153,255,0.15)',
    borderWidth: 1,
    borderColor: COLORS.accentPrimary,
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
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    minWidth: 200,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  menuRowText: { fontSize: 15, fontWeight: '400', color: COLORS.textSecondary },

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
    color: COLORS.textPrimary,
    letterSpacing: 0.5,
  },
  aboutSubtitle: {
    fontSize: 11,
    fontWeight: '500',
    color: COLORS.textMuted,
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
    color: COLORS.textPrimary,
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
    color: COLORS.textPrimary,
    fontSize: 15,
    fontWeight: '500',
  },
});
