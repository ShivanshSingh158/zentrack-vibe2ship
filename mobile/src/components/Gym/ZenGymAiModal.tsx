/**
 * ZenGymAiModal — ZenTrack Mobile
 *
 * AI Gym Coach powered by the full GAINS agent fleet via Socket.IO backend.
 * Replaces the previous single-key direct Gemini call with:
 *   orchestrateAgent() → Render backend → GAINS agent (full gym system prompt)
 *   → 10-key rotation → Gemini → streamed steps → TTS
 *
 * GAINS reads: todayGym plan, sets completed, overtraining check, PR history.
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
  ActivityIndicator,
  Animated,
  Image,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Speech from 'expo-speech';
import { COLORS, FONT_FAMILY, FONT_SIZE, SPACE, RADIUS, SHADOW } from '../../theme/tokens';
import { processGymChat } from '../../agent/saraAgent';
import { useMobileData } from '../../contexts/MobileDataContext';
import { GYM_PLAN, WEEKDAY_TO_PLAN } from '../../data/gymPlan';
import { feedback } from '../../utils/haptics';
import ActionConfirmationCard from '../SARA/ActionConfirmationCard';

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
}

interface ChatMessage {
  id: string;
  role: 'user' | 'gains' | 'thinking';
  text: string;
  actionCard?: any;
}

const QUICK_PROMPTS = [
  "How many more sets should I do?",
  "What muscles am I targeting?",
  "Should I increase weight today?",
  "Am I overtraining?",
  "Best rest time between sets?",
];

function TypingDots() {
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
  onGenerateWorkoutPlan
}: Props) {
  const { tasks, habits, gymLogs, user, notes, goals, googleAccessToken } = useMobileData();
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const historyRef = useRef<{ role: string; content: string }[]>([]);

  useEffect(() => {
    if (visible && messages.length === 0) {
      setMessages([{
        id: 'welcome',
        role: 'gains',
        text: "GYM-GPT online. I've analyzed your workout data. Ask me anything — form tips, load progression, recovery strategy.",
      }]);
    }
    if (!visible) {
      Speech.stop();
      setIsSpeaking(false);
    }
  }, [visible]);

  const buildGymContext = (): string => {
    const today = new Date().toISOString().split('T')[0];
    const todayLog = gymLogs?.find(l => l.date === today);
    const dayOfWeek = new Date().getDay();
    const todayPlanIndex = WEEKDAY_TO_PLAN[dayOfWeek] || 7;
    const todayPlan = GYM_PLAN.find(p => p.dayIndex === todayPlanIndex);

    let context = 'SYSTEM INSTRUCTIONS: You are GYM-GPT, a world-class bodybuilding AI coach. Answer concisely. ';
    
    // Provide weekly overview
    let weeklySummary = 'Weekly Program: ';
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    days.forEach((d, i) => {
      const pIdx = WEEKDAY_TO_PLAN[i] || 7;
      const p = GYM_PLAN.find(x => x.dayIndex === pIdx);
      weeklySummary += `${d}=${p ? p.name : 'Rest'}, `;
    });
    context += weeklySummary + '. ';

    // Provide detailed today info
    context += `Today is ${days[dayOfWeek]}. Scheduled workout: ${todayPlan ? todayPlan.name : 'Rest Day'}. `;
    if (todayPlan) {
      context += `Focus: ${todayPlan.focus}. `;
    }

    let liveLog = 'Live Progress Today: ';
    if (todayLog && todayLog.exercises && todayLog.exercises.length > 0) {
      todayLog.exercises.forEach((ex: any) => {
        const setsStr = ex.setsLog.map((s: any) => s.completed ? `[${s.weight}kg x ${s.reps}]` : `(pending ${s.weight}kg)`).join(', ');
        liveLog += `${ex.name}: ${setsStr}. `;
      });
    } else {
      liveLog += 'Workout not started yet.';
    }
    context += liveLog;

    const recentLogs = gymLogs?.slice(-3) ?? [];
    if (recentLogs.length > 0) {
      context += ` Past 3 sessions logged.`;
    }

    return context;
  };

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

    // Build context for the GAINS agent
    const gymContext = buildGymContext();
    const gymFocusedPrompt = `[GYM CONTEXT: ${gymContext}]\n\n${question}`;

    try {
      const appContext = {
        tasks: tasks ?? [],
        habits: habits ?? [],
        notes: notes ?? [],
        goals: goals ?? [],
        gymLogs: gymLogs ?? [],
        googleAccessToken: googleAccessToken ?? '',
        userId: user?.uid ?? '',
      };

      const result = await processGymChat(
        gymFocusedPrompt,
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

      setMessages(prev => prev.filter(m => m.role !== 'thinking').concat(gainsMsg));
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
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <View style={styles.sheet}>
          {/* Header */}
          <LinearGradient
            colors={['#1E0D3A', '#0D0B1A']}
            style={styles.header}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <View style={styles.headerLeft}>
              <View style={styles.gainsBadge}>
                <Image source={require('../../../assets/logo_white.png')} style={{ width: 18, height: 18, resizeMode: 'contain' }} />
              </View>
              <View>
                <Text style={styles.headerTitle}>GYM-GPT</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={COLORS.textMuted} />
            </TouchableOpacity>
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
                ]}
              >
                {msg.role === 'thinking' && (
                  <TypingDots />
                )}
                <Text
                  style={[
                    styles.bubbleText,
                    msg.role === 'user' && styles.userBubbleText,
                    msg.role === 'thinking' && styles.thinkingText,
                  ]}
                >
                  {msg.text}
                </Text>
                {msg.role === 'gains' && (
                  <TouchableOpacity
                    onPress={() => toggleSpeak(msg.text)}
                    style={[styles.speakBtn, { alignSelf: 'flex-end', marginTop: 4 }]}
                  >
                    <Ionicons
                      name={isSpeaking ? 'pause-circle-outline' : 'volume-medium-outline'}
                      size={16}
                      color={COLORS.textMuted}
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
              placeholderTextColor={COLORS.textMuted}
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
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
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
  },
  headerTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 17, color: COLORS.textPrimary },
  headerSub: { fontFamily: FONT_FAMILY.body, fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  closeBtn: { padding: SPACE.xs },

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
  chatContent: { padding: SPACE.lg, gap: SPACE.md, paddingBottom: 24 },
  bubble: {
    backgroundColor: '#1c1c1e',
    borderBottomLeftRadius: 4,
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
  thinkingText: { color: COLORS.textMuted, fontStyle: 'italic', display: 'none' },
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
    color: COLORS.textPrimary,
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
