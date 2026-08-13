/**
 * ZenGymAiModal — ZenTrack Mobile
 *
 * Elite GYM-GPT coaching modal.
 * Passes full athlete profile + last 10 sessions + live workout to the AI.
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Animated,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Speech from 'expo-speech';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS, SHADOW } from '../../theme/tokens';
import { processGymChat, compressMemoryToSummary } from '../../agent/saraAgent';
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
  onDeleteExercise?: (exerciseIndex: number) => void;
  onLogSet?: (exerciseIndex: number, setIndex: number, weightKg: number, reps: number) => void;
  onGenerateWorkoutPlan?: (planName: string, exercises: { name: string, sets: number, reps: string }[]) => void;
  onAutoregulateDeload?: () => void;
  /** User's full custom gym plan — used to feed real plan data to GYM-GPT */
  userGymPlan?: UserGymPlanDoc | null;
  /** Today's resolved plan day from useGymLog (already custom-plan-aware) */
  currentPlanDay?: GymPlanDay | null;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'gains' | 'thinking';
  text: string;
  actionCard?: any;
}

const QUICK_PROMPTS = [
  "Give me a warm-up routine 🔥",
  "Should I increase weight today?",
  "Cool-down stretches for today 🧘",
  "Am I overtraining?",
  "Break down my next exercise",
  "Today's fatigue score?",
];

function TypingDots() {
    const { colors, isDark } = useTheme();
    const styles = makeStyles(colors);
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
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 4, paddingVertical: 6, marginRight: 8 }}>
      <Animated.View style={[{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#a599ff' }, { opacity: dot1 }]} />
      <Animated.View style={[{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#a599ff' }, { opacity: dot2 }]} />
      <Animated.View style={[{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#a599ff' }, { opacity: dot3 }]} />
    </View>
  );
}

export function ZenGymAiModal({ 
  visible, 
  onClose, 
  workoutData,
  onAddExercise,
  onDeleteExercise,
  onLogSet,
  onGenerateWorkoutPlan,
  onAutoregulateDeload,
  userGymPlan,
  currentPlanDay,
}: Props) {
  const { colors, isDark } = useTheme();
  const styles = makeStyles(colors);
  const { tasks, habits, gymLogs, waterLogs, sleepLogs, user, notes, goals, googleAccessToken } = useMobileData();
  const { gymProfile } = useGymProfile();
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const historyRef = useRef<{ role: string; content: string }[]>([]);
  const [memorySummary, setMemorySummary] = useState<string | null>(null);

  // Load memory summary on mount
  useEffect(() => {
    AsyncStorage.getItem('gym_memory_summary').then(s => { if (s) setMemorySummary(s); });
  }, []);

  // Auto-send session overview when modal first opens (visible becomes true)
  const hasAutoGreetedRef = useRef(false);
  useEffect(() => {
    if (visible && !hasAutoGreetedRef.current && gymLogs && gymLogs.length > 0) {
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
    const thinkingMsg: ChatMessage = {
      id: `t-${Date.now()}`,
      role: 'thinking',
      text: 'GYM-GPT is analyzing...',
    };

    setMessages(prev => [...prev, userMsg, thinkingMsg]);
    setLoading(true);

    historyRef.current = [
      ...historyRef.current,
      { role: 'user', content: question },
    ];

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
    // FIX: Use currentPlanDay (from useGymLog — already custom-plan-aware) first,
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
        appContext
      );

      let responseText = '';
      let generatedActionCard: any = undefined;
      if (result.type === 'function_call') {
        const actionType = result.name || result.args?.type;
        const { args } = result;

        if (actionType === 'addExerciseToWorkout' && onAddExercise) {
          onAddExercise(args.exerciseName, args.targetSets, args.targetReps);
          responseText = `✅ Added ${args.exerciseName} — ${args.targetSets}×${args.targetReps} to your workout!`;
        } else if ((actionType === 'removeExercise' || actionType === 'deleteExercise') && onDeleteExercise) {
          // Support both old and new action type names
          const idx = typeof args.exerciseIndex === 'number' ? args.exerciseIndex : 0;
          onDeleteExercise(idx);
          responseText = `✅ Removed ${args.exerciseName || 'exercise'} from your workout.`;
        } else if (actionType === 'logWorkoutSet' && onLogSet) {
          const setIdx = (args.setNumber || 1) - 1;
          onLogSet(args.exerciseIndex ?? 0, setIdx, args.weightKg ?? 0, args.reps);
          responseText = `✅ Logged set ${args.setNumber}: ${args.weightKg}kg × ${args.reps} reps!`;
        } else if (actionType === 'generateWorkoutPlan' && onGenerateWorkoutPlan) {
          const exercisesList = (args.exercises || [])
            .map((e: any) => `• ${e.name} (${e.sets}×${e.reps})`)
            .join('\n');
            
          responseText = "I've put together a new workout plan for you. Check it out below!";
          
          generatedActionCard = {
            actionType: 'gym',
            title: `New Plan: ${args.planName}`,
            details: exercisesList,
            onConfirm: () => {
              onGenerateWorkoutPlan(args.planName, args.exercises);
            }
          };
        } else if (actionType === 'swapExercise' && onAddExercise) {
          onAddExercise(args.newExerciseName, args.newTargetSets, args.newTargetReps);
          responseText = `✅ Swapped to ${args.newExerciseName} — ${args.newTargetSets}×${args.newTargetReps}`;
        } else if (actionType === 'autoregulateDeload' && onAutoregulateDeload) {
          onAutoregulateDeload();
          responseText = `✅ Autoregulated Deload applied: Dropped volume to protect your CNS today.`;
        } else {
          responseText = result.text || "I tried to update your workout but something went wrong.";
        }
        if (result.text && !responseText.includes(result.text)) responseText += `\n\n${result.text}`;
      } else {
        responseText = result.text;
      }

      // Replace thinking message with final result
      const gainsMsg: ChatMessage = {
        id: `g-${Date.now()}`,
        role: 'gains',
        text: responseText,
        actionCard: generatedActionCard,
      };

      setMessages(prev => prev.map(m => m.id === thinkingMsg.id ? gainsMsg : m));

      // Memory compression: compress when history exceeds 20 messages
      if (historyRef.current.length > 20) {
        compressMemoryToSummary(historyRef.current).then(summary => {
          setMemorySummary(summary);
          AsyncStorage.setItem('gym_memory_summary', summary);
          historyRef.current = historyRef.current.slice(-10);
        }).catch(e => console.warn('[GymGPT] Memory compression failed:', e.message));
      }

      historyRef.current = [...historyRef.current, { role: 'assistant', content: responseText }];

      // Auto-speak disabled by user preference
    } catch (err: any) {
      setMessages(prev =>
        prev
          .filter(m => m.role !== 'thinking')
          .concat({
            id: `e-${Date.now()}`,
            role: 'gains',
            text: `Coach error: ${err.message}. Check your backend connection.`,
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

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose}>
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.6)' }]} />
      </TouchableOpacity>
      <View style={styles.overlay}>
        <KeyboardAvoidingView 
          style={styles.sheet}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {/* Header */}
          <LinearGradient
            colors={['#1c1c1e', '#121214']}
            style={styles.header}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <View style={styles.headerLeft}>
              <View style={styles.gainsBadge}>
                <Image source={require('../../../assets/logo_white.png')} style={{ width: 36, height: 36, resizeMode: 'contain' }} />
              </View>
              <View>
                <Text style={styles.headerTitle}>GYM-GPT</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TouchableOpacity
                onPress={() => { feedback.tap(); setShowProfileModal(true); }}
                style={styles.profileBtn}
              >
                <Ionicons name="person" size={16} color="#a599ff" />
              </TouchableOpacity>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          </LinearGradient>

          {/* Quick Prompts */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flexGrow: 0 }}
            contentContainerStyle={styles.quickPrompts}
          >
            {QUICK_PROMPTS.map((q, i) => (
              <TouchableOpacity
                key={i}
                style={styles.quickPill}
                onPress={() => handleAsk(q)}
                disabled={loading}
              >
                <Text style={styles.quickPillText}>{q}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Chat */}
          <ScrollView
            ref={scrollRef}
            style={styles.chatArea}
            contentContainerStyle={styles.chatContent}
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
          >
            {messages.map(msg => (
              <View
                key={msg.id}
                style={[
                  styles.bubble,
                  msg.role === 'user' && styles.userBubble,
                  msg.role === 'thinking' && styles.thinkingBubble,
                  msg.role === 'gains' && styles.gainsBubble,
                ]}
              >
                {/* Thinking indicator */}
                {msg.role === 'thinking' && <TypingDots />}

                {/* Coach response — rendered as Markdown */}
                {msg.role === 'gains' && (
                  <Markdown style={mdStyles}>{msg.text}</Markdown>
                )}

                {/* User message — plain text */}
                {msg.role === 'user' && (
                  <Text style={styles.userBubbleText}>{msg.text}</Text>
                )}

                {/* Speak button for coach messages */}
                {msg.role === 'gains' && (
                  <TouchableOpacity
                    onPress={() => toggleSpeak(msg.text)}
                    style={[styles.speakBtn, { alignSelf: 'flex-end', marginTop: 4 }]}
                  >
                    <Ionicons
                      name={isSpeaking ? 'pause-circle-outline' : 'volume-medium-outline'}
                      size={16}
                      color={colors.textMuted}
                    />
                  </TouchableOpacity>
                )}

                {msg.actionCard && (
                  <View style={{ marginTop: 12, width: '100%' }}>
                    <ActionConfirmationCard 
                      {...msg.actionCard} 
                    />
                  </View>
                )}
              </View>
            ))}
          </ScrollView>

          {/* Input */}
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="Ask GYM-GPT anything..."
              placeholderTextColor={colors.textMuted}
              value={prompt}
              onChangeText={setPrompt}
              onSubmitEditing={() => handleAsk()}
              multiline
              maxLength={300}
              editable={!loading}
            />
            <TouchableOpacity
              style={[styles.sendBtn, loading && { opacity: 0.5 }]}
              onPress={() => handleAsk()}
              disabled={loading || !prompt.trim()}
            >
              <Ionicons name="send" size={18} color="#000" style={{ marginLeft: 2 }} />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
      {/* Gym Profile Modal */}
      <GymProfileModal visible={showProfileModal} onClose={() => setShowProfileModal(false)} />
    </Modal>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
      overlay: {
        flex: 1,
        justifyContent: 'flex-end',
      },
      sheet: {
        backgroundColor: '#121214',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        height: '85%',
        overflow: 'hidden',
      },
      header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 16,
        backgroundColor: 'transparent',
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: 'rgba(255,255,255,0.1)',
      },
      headerLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
      gainsBadge: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: 'rgba(165,153,255,0.15)',
        borderWidth: 1,
        borderColor: 'rgba(165,153,255,0.3)',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      },
      headerTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 17, color: colors.textPrimary },
      headerSub: { fontFamily: FONT_FAMILY.body, fontSize: 12, color: colors.textMuted, marginTop: 2 },
      closeBtn: { padding: SPACE.xs },
      profileBtn: {
        width: 34,
        height: 34,
        borderRadius: 17,
        backgroundColor: 'rgba(165,153,255,0.1)',
        alignItems: 'center',
        justifyContent: 'center',
      },

      quickPrompts: { paddingHorizontal: SPACE.lg, paddingVertical: 12, gap: 8, alignItems: 'center' },
      quickPill: {
        backgroundColor: '#1c1c1e',
        borderWidth: 1,
        borderColor: '#2c2c2e',
        borderRadius: 14,
        paddingHorizontal: 14,
        paddingVertical: 10,
        alignSelf: 'center',
      },
      quickPillText: { fontFamily: FONT_FAMILY.body, fontSize: 13, color: '#f2f2f7' },

      chatArea: { flex: 1 },
      chatContent: { paddingHorizontal: 14, paddingVertical: 12, gap: 10, paddingBottom: 24 },

      /* Coach bubble — full width, no right margin */
      gainsBubble: {
        alignSelf: 'stretch',
        maxWidth: '100%',
        backgroundColor: '#1a1a1f',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(165,153,255,0.12)',
        paddingVertical: 12,
        paddingHorizontal: 14,
      },
      bubble: {
        backgroundColor: '#1c1c1e',
        borderRadius: 18,
        paddingVertical: 10,
        paddingHorizontal: 14,
        flexDirection: 'column',
        alignItems: 'flex-start',
        alignSelf: 'flex-start',
        maxWidth: '85%',
      },
      thinkingBubble: {
        backgroundColor: 'transparent',
        borderBottomLeftRadius: 18,
      },
      userBubble: {
        backgroundColor: '#a599ff',
        borderBottomLeftRadius: 18,
        borderBottomRightRadius: 4,
        alignSelf: 'flex-end',
      },
      bubbleText: {
        flexShrink: 1,
        fontFamily: FONT_FAMILY.body,
        fontSize: 15,
        color: '#f2f2f7',
        lineHeight: 22,
      },
      userBubbleText: { color: '#000' },
      thinkingText: { color: colors.textMuted, fontStyle: 'italic', display: 'none' },
      speakBtn: { padding: 4, marginLeft: SPACE.sm, marginTop: 2 },

      inputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 10,
        gap: 10,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: 'rgba(255,255,255,0.1)',
        backgroundColor: 'transparent',
      },
      input: {
        flex: 1,
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderRadius: 22,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        paddingHorizontal: 16,
        height: 44,
        fontFamily: FONT_FAMILY.body,
        fontSize: 15,
        color: colors.textPrimary,
      },
      sendBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#a599ff',
        alignItems: 'center',
        justifyContent: 'center',
      },
    });

// ─── Markdown styles for GYM-GPT responses ────────────────────────────────────
const mdStyles = StyleSheet.create({
  body: {
    color: '#f2f2f7',
    fontFamily: 'Inter_400Regular',
    fontSize: 14.5,
    lineHeight: 22,
  },
  // Headings
  heading1: {
    color: '#a599ff',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 17,
    fontWeight: '700',
    marginTop: 12,
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  heading2: {
    color: '#f2f2f7',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    fontWeight: '700',
    marginTop: 10,
    marginBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(165,153,255,0.2)',
    paddingBottom: 4,
  },
  heading3: {
    color: '#a599ff',
    fontFamily: 'Inter_500Medium',
    fontSize: 13.5,
    fontWeight: '600',
    marginTop: 8,
    marginBottom: 2,
  },
  // Inline styles
  strong: {
    fontFamily: 'Inter_600SemiBold',
    fontWeight: '700',
    color: '#ffffff',
  },
  em: {
    fontStyle: 'italic',
    color: '#c8c4f0',
  },
  // Lists
  bullet_list: {
    marginVertical: 4,
  },
  ordered_list: {
    marginVertical: 4,
  },
  list_item: {
    flexDirection: 'row',
    marginBottom: 5,
  },
  bullet_list_icon: {
    color: '#a599ff',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    lineHeight: 22,
    marginRight: 8,
    marginTop: 0,
  },
  ordered_list_icon: {
    color: '#a599ff',
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    lineHeight: 22,
    marginRight: 8,
    minWidth: 20,
  },
  bullet_list_content: {
    flex: 1,
    color: '#f2f2f7',
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 21,
  },
  ordered_list_content: {
    flex: 1,
    color: '#f2f2f7',
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    lineHeight: 21,
  },
  // Divider
  hr: {
    backgroundColor: 'rgba(165,153,255,0.2)',
    height: 1,
    marginVertical: 10,
  },
  // Code
  code_inline: {
    fontFamily: 'Courier',
    fontSize: 13,
    color: '#FF9F0A',
    backgroundColor: 'rgba(255,159,10,0.1)',
    paddingHorizontal: 4,
    borderRadius: 4,
  },
  fence: {
    backgroundColor: '#0d0d10',
    borderRadius: 10,
    padding: 12,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  // Blockquote (used for tips/callouts)
  blockquote: {
    backgroundColor: 'rgba(165,153,255,0.06)',
    borderLeftWidth: 3,
    borderLeftColor: '#a599ff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    marginVertical: 6,
  },
  // Paragraph spacing
  paragraph: {
    marginTop: 0,
    marginBottom: 6,
    color: '#f2f2f7',
    fontFamily: 'Inter_400Regular',
    fontSize: 14.5,
    lineHeight: 22,
  },
  // Links
  link: {
    color: '#a599ff',
    textDecorationLine: 'underline',
  },
  text: {
    color: '#f2f2f7',
  },
});

