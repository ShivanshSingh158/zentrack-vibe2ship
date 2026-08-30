/**
 * ZenGymAiModal — ZenTrack Mobile
 *
 * Elite GYM-GPT coaching modal powered by S.A.R.A.
 * Modularized for fast rendering, conversation history persistence,
 * and 1-tap multi-day workout plan importation.
 */
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  Modal, View, Text, TouchableOpacity, TextInput, Platform,
  ScrollView, ActivityIndicator, Alert, Pressable, KeyboardAvoidingView,
  Keyboard, KeyboardEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';

import { FONT_FAMILY } from '../../theme/tokens';
import { processGymChat, parseOptionsFromText } from '../../agent/saraAgent';
import { useCoreData } from '../../contexts/domains/CoreDataContext';
import { useWellnessData } from '../../contexts/domains/WellnessContext';
import { useCreativeData } from '../../contexts/domains/CreativeContext';
import { UserGymPlanDoc, GymPlanDay } from '../../types/gym.types';
import { feedback } from '../../utils/haptics';
import { useTheme } from '../../contexts/ThemeContext';
import { useGymProfile } from '../../hooks/useGymProfile';
import { GymProfileModal } from './GymProfileModal';

// Extracted Subcomponents, Types & Styles
import { makeZenGymAiStyles } from './zenGymAiStyles';
import GymAiChatBubble, { ChatMessage } from './GymAiChatBubble';
import { MultiDayPlanEntry } from './GymAiMultiDayPlanTypes';

export type { MultiDayPlanEntry };

export interface Props {
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
  onGenerateWorkoutPlan?: (planName: string, exercises: { name: string; sets: number; reps: string }[]) => void;
  onAutoregulateDeload?: () => void;
  onImportMultiDayPlan?: (planName: string, days: MultiDayPlanEntry[]) => Promise<void>;
  onAddExerciseToPlanDay?: (dayIndex: number, dayName: string, exercise: { name: string; targetSets: number; targetReps: string; muscle?: string }) => Promise<void>;
  userGymPlan?: UserGymPlanDoc | null;
  currentPlanDay?: GymPlanDay | null;
}

const STORAGE_KEY_SESSIONS = '@gym_gpt_sessions_v1';

const QUICK_PROMPTS = [
  '🔥 Form check & tips for my current exercise',
  '💪 Suggest an exercise swap for today',
  '📊 Rate my workout volume this week',
  '⚡ Give me a 5-day PPL routine',
  '🛡️ Deload recommendations',
];

export function ZenGymAiModal({
  visible,
  onClose,
  workoutData,
  userGymPlan,
  currentPlanDay,
}: Props) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeZenGymAiStyles(colors, isDark), [colors, isDark]);

  const { tasks } = useCoreData();
  const { gymLogs } = useWellnessData();
  const { notes } = useCreativeData();
  const { gymProfile } = useGymProfile();

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'gains',
      text: "👋 Hey! I'm **S.A.R.A Gym AI**.\n\nI can analyze your sets, suggest biomechanical exercise swaps, build personalized multi-day training splits, or adjust your deload volume. What's on your mind?",
    },
  ]);
  const [androidKeyboardPadding, setAndroidKeyboardPadding] = useState(0);

  // Dynamic Keyboard Height Tracking for Standalone Android APKs & iOS
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const showSub = Keyboard.addListener('keyboardDidShow', (e: any) => {
      setAndroidKeyboardPadding(e?.endCoordinates?.height || 0);
      setTimeout(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
      }, 100);
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      setAndroidKeyboardPadding(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const scrollRef = useRef<ScrollView>(null);

  // Load latest chat session from AsyncStorage
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY_SESSIONS)
      .then(raw => {
        if (raw) {
          const sessions = JSON.parse(raw);
          if (Array.isArray(sessions) && sessions.length > 0) {
            setMessages(sessions[0].messages || []);
          }
        }
      })
      .catch(() => {});
  }, []);

  const saveChatSession = useCallback((msgs: ChatMessage[]) => {
    AsyncStorage.setItem(
      STORAGE_KEY_SESSIONS,
      JSON.stringify([{ id: 'default', title: 'Gym Chat', updatedAt: Date.now(), messages: msgs }])
    ).catch(() => {});
  }, []);

  const scrollToBottom = () => {
    setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 100);
  };

  const handleSend = async (overrideText?: string) => {
    const textToSend = overrideText || input;
    if (!textToSend.trim() || loading) return;

    feedback.tap();
    const userMsg: ChatMessage = {
      id: String(Date.now()),
      role: 'user',
      text: textToSend.trim(),
    };

    const nextMsgs = [...messages, userMsg];
    setMessages(nextMsgs);
    setInput('');
    setLoading(true);
    scrollToBottom();

    try {
      const response = await processGymChat(
        textToSend,
        messages.map(m => ({ role: m.role === 'user' ? 'user' : 'model', content: m.text })),
        {
          gymLogs,
          tasks,
          notes,
          gymProfile,
          userGymPlan,
          gymPlanDay: currentPlanDay,
        }
      );

      const { cleanText, options: parsedOptions } = parseOptionsFromText(response?.text || '');
      const aiMsg: ChatMessage = {
        id: String(Date.now() + 1),
        role: 'gains',
        text: cleanText || response?.text || 'I analyzed your training profile.',
        actionCard: (response as any)?.actionCard,
        options: parsedOptions.length > 0 ? parsedOptions : undefined,
      };

      const updated = [...nextMsgs, aiMsg];
      setMessages(updated);
      saveChatSession(updated);
      scrollToBottom();
    } catch (err) {
      console.warn('[ZenGymAiModal] Chat error:', err);
      const errMsg: ChatMessage = {
        id: String(Date.now() + 1),
        role: 'gains',
        text: '⚠️ I ran into an issue connecting to the AI coach. Please try again.',
      };
      setMessages([...nextMsgs, errMsg]);
    } finally {
      setLoading(false);
      scrollToBottom();
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true} statusBarTranslucent={true} onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[
            styles.modalOverlay,
            Platform.OS === 'android' && androidKeyboardPadding > 0 && {
              paddingBottom: androidKeyboardPadding,
            },
          ]}>
          <Pressable style={styles.backdrop} onPress={onClose} />
          <View style={styles.container}>
            {/* Drag Handle */}
            <View style={styles.handleWrap}>
              <View style={styles.handle} />
            </View>

          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.avatarBox}>
                <Ionicons name="fitness" size={20} color={colors.accentPrimary} />
              </View>
              <View>
                <Text style={styles.title}>GYM-GPT Coach</Text>
                <Text style={styles.subtitle}>S.A.R.A Biomechanical AI</Text>
              </View>
            </View>

            <View style={styles.headerActions}>
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={() => setShowProfile(true)}
                activeOpacity={0.7}
              >
                <Ionicons name="person-circle-outline" size={22} color={colors.textPrimary} />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.iconBtn}
                onPress={() => {
                  Alert.alert('Clear Chat', 'Reset all conversation history?', [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Clear',
                      style: 'destructive',
                      onPress: () => {
                        setMessages([]);
                        AsyncStorage.removeItem(STORAGE_KEY_SESSIONS);
                      },
                    },
                  ]);
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
              </TouchableOpacity>

              <TouchableOpacity style={styles.iconBtn} onPress={onClose} activeOpacity={0.7}>
                <Ionicons name="close" size={20} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Chat Area */}
          <ScrollView
            ref={scrollRef}
            style={styles.chatArea}
            contentContainerStyle={{ paddingBottom: 24 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          >
            {messages.map(msg => (
              <GymAiChatBubble
                key={msg.id}
                msg={msg}
                onSelectOption={opt => handleSend(opt)}
                onWriteOwn={() => {}}
                styles={styles}
                colors={colors}
                isDark={isDark}
              />
            ))}

            {loading && (
              <View style={[styles.msgRow, styles.msgRowAi]}>
                <View style={[styles.msgBubbleAi, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
                  <ActivityIndicator size="small" color={colors.accentPrimary} />
                  <Text style={{ fontFamily: FONT_FAMILY.medium, fontSize: 13, color: colors.textMuted }}>
                    S.A.R.A is analyzing biomechanics...
                  </Text>
                </View>
              </View>
            )}
          </ScrollView>

          {/* Quick Prompts Strip */}
          <View style={{ paddingHorizontal: 12 }}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.quickChipsScroll}
              keyboardShouldPersistTaps="handled"
            >
              {QUICK_PROMPTS.map(p => (
                <TouchableOpacity
                  key={p}
                  style={styles.quickChip}
                  onPress={() => handleSend(p)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.quickChipText}>{p}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Input Bar */}
          <View style={styles.inputBarWrapper}>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.textInput}
                value={input}
                onChangeText={setInput}
                placeholder="Ask S.A.R.A anything about gym, diet, recovery..."
                placeholderTextColor={colors.textMuted}
                multiline
                returnKeyType="send"
                onSubmitEditing={() => handleSend()}
              />
              <TouchableOpacity
                style={[styles.sendBtn, !input.trim() && { opacity: 0.4 }]}
                disabled={!input.trim() || loading}
                onPress={() => handleSend()}
                activeOpacity={0.8}
              >
                <Ionicons name="arrow-up" size={18} color={isDark ? '#000000' : '#ffffff'} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>

      {/* Gym Athlete Profile Modal */}
      <GymProfileModal visible={showProfile} onClose={() => setShowProfile(false)} />
    </Modal>
  );
}

export default ZenGymAiModal;
