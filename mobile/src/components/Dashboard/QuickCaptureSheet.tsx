/**
 * QuickCaptureSheet — ZenTrack Mobile
 *
 * Slide-up bottom sheet for instant capture from Dashboard.
 * Supports: Task (with NL date parsing) | Note | Habit
 *
 * NL Date Parser handles:
 *   "today", "tomorrow", "monday" / "next monday"
 *   "in 3 days", "in 2 weeks"
 *   "at 5pm", "at 17:30", "5:30pm" — sets timeSlot
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, runOnJS, useAnimatedKeyboard } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { getFirestore, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { queueWrite } from '../../services/offlineSync';
import { useMobileData } from '../../contexts/MobileDataContext';
import { parseNLTask } from '../../utils/dateUtils';
import { COLLECTION } from '../../config/constants';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS } from '../../theme/tokens';
import { useTheme } from "../../contexts/ThemeContext";
import { callProxy, parseProxyResponse } from '../../services/geminiProxy';
import { startVADRecording, stopAndTranscribe, cancelVoiceRecording, isSilenceOrNoise, VoiceState } from '../../services/voiceEngine';
import { Portal } from '../../contexts/PortalContext';
import NLPTaskInput from '../Tasks/NLPTaskInput';

// ─── NL Date Parser ──────────────────────────────────────────────────────────

// ─── Types ────────────────────────────────────────────────────────────────────

type CaptureType = 'task' | 'note' | 'habit';

interface Props {
  visible: boolean;
  onClose: () => void;
}

const TABS: { key: CaptureType; label: string; icon: string }[] = [
  { key: 'task',  label: 'Task',  icon: 'checkmark-circle-outline' },
  { key: 'note',  label: 'Note',  icon: 'document-text-outline'    },
  { key: 'habit', label: 'Habit', icon: 'flame-outline'            },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function QuickCaptureSheet({ visible, onClose }: Props) {
    const { colors, isDark } = useTheme();
    const s = makeStyles(colors);
  const { user } = useMobileData();
  const insets = useSafeAreaInsets();
  const [type, setType] = useState<CaptureType>('task');
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const translateY = useSharedValue(1000);
  const keyboard = useAnimatedKeyboard();
  const inputRef = useRef<TextInput>(null);

  // Parsed result (live, for tasks only)
  const parsed = type === 'task' ? (text.length > 2 ? parseNLTask(text) : { tokens: [], text, priority: 'none' } as any) : null;
  const hasChips = parsed && parsed.tokens.length > 0;

  const focusInput = () => {
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  const [mounted, setMounted] = useState(visible);
  const backdropOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      setSaved(false);
      setText('');
      setVoiceState('idle');
      backdropOpacity.value = withTiming(1, { duration: 180 });
      translateY.value = withTiming(0, { duration: 180, easing: Easing.out(Easing.quad) }, (finished) => {
        if (finished) runOnJS(focusInput)();
      });
    } else if (mounted) {
      cancelVoiceRecording();
      backdropOpacity.value = withTiming(0, { duration: 150 });
      translateY.value = withTiming(1000, { duration: 150, easing: Easing.in(Easing.quad) }, (finished) => {
        if (finished) runOnJS(setMounted)(false);
      });
    }
  }, [visible]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: translateY.value }],
      paddingBottom: Math.max(insets.bottom + SPACE.lg, keyboard.height.value + SPACE.lg),
    };
  });

  const backdropStyle = useAnimatedStyle(() => {
    return {
      opacity: backdropOpacity.value,
    };
  });

  const handleToggleVoice = async () => {
    if (voiceState === 'recording') {
      await stopAndTranscribe({
        onStateChange: setVoiceState,
        onTranscript: (t) => {
          if (!t || !t.trim() || isSilenceOrNoise(t)) return;
          setText(t);
        },
        onError: (err) => console.log('Voice error', err)
      });
      return;
    }
    
    await startVADRecording({
      onStateChange: setVoiceState,
      onTranscript: async (t) => {
        if (!t || !t.trim() || isSilenceOrNoise(t)) return;
        setText(t);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        await handleSave(t);
      },
      onError: (err) => {
        console.log('Voice error', err);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    });
  };

  const handleSave = async (overrideText?: string) => {
    const textToSave = typeof overrideText === 'string' ? overrideText : text;
    if (!textToSave.trim() || isSilenceOrNoise(textToSave) || !user || saving) return;
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // Close immediately for instant UI feedback
    Keyboard.dismiss();
    onClose();
    setText('');

    try {
      if (type === 'task') {
        const prompt = `Parse this task description into JSON: "${textToSave.trim()}"
IMPORTANT: Extract ONLY the core task name for 'title', removing any time, date, priority, or recurrence words (e.g., "dsa at 6 30 am" -> "dsa").
The user might ask for multiple tasks (e.g., "for next 5 days", "every day this week").
If it implies multiple tasks, return an array of tasks. If it's a single task, return an array of 1 task.
Return ONLY a JSON array: [{"title": str, "date": "YYYY-MM-DD", "timeSlot": "HH:MM or null", "priority": "P1|P2|P3", "isRecurring": bool, "frequency": "daily|weekly|monthly or null"}]
Today's date is ${new Date().toISOString().slice(0, 10)}.`;
        
        const response = await callProxy({
          model: 'gemini-2.5-flash',
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json' }
        });
        
        let parsedData: any[] = [];
        try {
          const parsed = parseProxyResponse(response);
          parsedData = JSON.parse(parsed.text || '[]');
        } catch(e) {
          const cleanJson = (response.text || '').replace(/```json/g, '').replace(/```/g, '').trim();
          parsedData = JSON.parse(cleanJson);
        }
        
        if (!Array.isArray(parsedData)) {
          parsedData = [parsedData];
        }

        // Bulletproof fix: if Gemini only returns 1 task but we know it's multiDays, manually unroll it
        if (parsedData.length === 1 && parsed?.multiDays && parsed.multiDays > 1) {
          const baseTask = parsedData[0];
          const baseDate = new Date(baseTask.date || new Date().toISOString().slice(0, 10));
          parsedData = Array.from({ length: parsed.multiDays }).map((_, i) => {
            const d = new Date(baseDate);
            d.setDate(d.getDate() + i);
            return { ...baseTask, date: d.toISOString().slice(0, 10) };
          });
        }

        for (const t of parsedData) {
          await queueWrite(COLLECTION.TASKS, 'add', {
            userId: user.uid,
            title: t.title || textToSave.trim(),
            status: 'pending',
            priority: t.priority || 'P2',
            date: t.date || new Date().toISOString().slice(0, 10),
            timeSlot: t.timeSlot || null,
            isRecurring: !!t.isRecurring,
            frequency: t.frequency || null,
            createdAt: serverTimestamp(),
          });
        }
      } else if (type === 'note') {
        await queueWrite(COLLECTION.STORAGE_NODES, 'add', {
          type: 'note',
          title: textToSave.trim().substring(0, 40) + (textToSave.length > 40 ? '...' : ''),
          content: textToSave.trim(),
          userId: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else if (type === 'habit') {
        await queueWrite(COLLECTION.HABITS, 'add', {
          userId: user.uid,
          title: textToSave.trim(),
          frequency: 'daily',
          createdAt: serverTimestamp(),
          streak: 0,
          isActive: true
        });
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      console.error('[QuickCapture] save error', e);
    } finally {
      setSaving(false);
    }
  };

  const placeholders: Record<CaptureType, string> = {
    task:  'e.g. "Submit report tomorrow at 5pm"',
    note:  'Start typing your note...',
    habit: 'e.g. "Read 20 pages" or "Meditate"',
  };

  if (!mounted) return null;

  return (
    <Portal name="quick-capture-sheet">
      {/* Backdrop */}
      <Animated.View style={[s.backdrop, backdropStyle]}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
      </Animated.View>

      {/* Sheet */}
      <View style={[StyleSheet.absoluteFill, { justifyContent: 'flex-end' }]} pointerEvents="box-none">
        <Animated.View style={[s.sheet, animatedStyle]}>
          {/* Handle */}
          <View style={s.handle} />

          {/* Title row */}
          <View style={s.titleRow}>
            <Text style={s.title}>Quick Capture</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Type tabs */}
          <View style={s.tabs}>
            {TABS.map(tab => (
              <TouchableOpacity
                key={tab.key}
                style={[s.tab, type === tab.key && s.tabActive]}
                onPress={() => { setType(tab.key); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              >
                <Ionicons
                  name={tab.icon as any}
                  size={14}
                  color={type === tab.key ? '#080510' : (isDark ? 'rgba(255,255,255,0.6)' : colors.textMuted)}
                  style={{ marginRight: 5 }}
                />
                <Text style={[s.tabText, type === tab.key && s.tabTextActive]}>{tab.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Quick Capture Input View */}
          <View style={s.unifiedInputContainer}>
            {type === 'task' ? (
              <NLPTaskInput
                value={text}
                onChangeText={setText}
                parsed={parsed!}
                onDismissToken={(_tok) => {}}
                placeholder={placeholders.task}
                autoFocus={true}
                onSubmitEditing={() => handleSave()}
                onAutoSubmit={() => handleSave()}
                hideMic={true}
              />
            ) : (
              <TextInput
                ref={inputRef}
                style={s.unifiedTextInput}
                placeholder={placeholders[type]}
                placeholderTextColor={isDark ? 'rgba(255,255,255,0.35)' : colors.textMuted}
                value={text}
                onChangeText={setText}
                multiline
                maxLength={200}
                keyboardAppearance={isDark ? 'dark' : 'light'}
              />
            )}
            
            {/* Quick Actions (e.g. mic, save) */}
            <View style={s.unifiedActionsRow}>
              <TouchableOpacity 
                style={[s.iconBtn, voiceState === 'recording' && s.iconBtnRecording]} 
                onPress={handleToggleVoice}
              >
                {voiceState === 'processing' ? (
                  <ActivityIndicator size="small" color={colors.accentPrimary} />
                ) : (
                  <Ionicons 
                    name={voiceState === 'recording' ? "stop" : "mic"} 
                    size={20} 
                    color={voiceState === 'recording' ? '#ff6961' : (isDark ? '#a599ff' : colors.textSecondary)} 
                  />
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.saveBtn, (!text.trim() || saving) && s.saveBtnDisabled]}
                onPress={() => handleSave()}
                disabled={!text.trim() || saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#080510" />
                ) : saved ? (
                  <Ionicons name="checkmark" size={20} color="#080510" />
                ) : (
                  <Ionicons name="arrow-up" size={20} color="#080510" />
                )}
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      </View>
    </Portal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const makeStyles = (colors: any) => StyleSheet.create({
      backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.75)',
      },
      kavWrapper: {
        flex: 1,
        justifyContent: 'flex-end',
      },
      sheet: {
        backgroundColor: '#000000',
        borderTopLeftRadius: RADIUS.xxl,
        borderTopRightRadius: RADIUS.xxl,
        paddingTop: SPACE.md,
        paddingHorizontal: SPACE.xl,
        borderWidth: 1,
        borderColor: 'rgba(165,153,255,0.22)',
        borderBottomWidth: 0,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -8 },
        shadowOpacity: 0.5,
        shadowRadius: 24,
        elevation: 16,
      },
      handle: {
        width: 38,
        height: 4,
        borderRadius: 2,
        backgroundColor: 'rgba(255,255,255,0.22)',
        alignSelf: 'center',
        marginBottom: SPACE.md,
      },
      titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: SPACE.md,
      },
      title: {
        fontFamily: FONT_FAMILY.bold,
        fontSize: FONT_SIZE.lg,
        color: '#ffffff',
        letterSpacing: -0.3,
      },
      tabs: {
        flexDirection: 'row',
        gap: SPACE.sm,
        marginBottom: SPACE.md,
      },
      tab: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: SPACE.lg,
        paddingVertical: 8,
        borderRadius: RADIUS.full,
        backgroundColor: 'rgba(255,255,255,0.06)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
      },
      tabActive: {
        backgroundColor: '#a599ff',
        borderColor: '#a599ff',
        shadowColor: '#a599ff',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.35,
        shadowRadius: 8,
        elevation: 4,
      },
      tabText: {
        fontFamily: FONT_FAMILY.medium,
        fontSize: 13,
        color: 'rgba(255,255,255,0.6)',
      },
      tabTextActive: {
        color: '#080510',
        fontFamily: FONT_FAMILY.bold,
      },
      unifiedInputContainer: {
        backgroundColor: '#1c1a26',
        borderRadius: RADIUS.xxl,
        borderWidth: 1,
        borderColor: 'rgba(165,153,255,0.25)',
        padding: SPACE.md,
        minHeight: 140,
        marginBottom: SPACE.md,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
        elevation: 4,
      },
      unifiedTextInput: {
        fontFamily: FONT_FAMILY.body,
        fontSize: 16,
        lineHeight: 24,
        color: '#ffffff',
        minHeight: 64,
        textAlignVertical: 'top',
        paddingHorizontal: SPACE.xs,
      },
      unifiedActionsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        marginTop: SPACE.sm,
      },
      confirmView: {
        paddingTop: SPACE.md,
      },
      confirmLabel: {
        fontFamily: FONT_FAMILY.medium,
        fontSize: 14,
        color: colors.textSecondary,
        marginBottom: SPACE.sm,
      },
      confirmValue: {
        fontFamily: FONT_FAMILY.bold,
        color: colors.textPrimary,
      },
      confirmActions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        alignItems: 'center',
        marginTop: SPACE.md,
        gap: SPACE.md,
      },
      editBtn: {
        paddingVertical: SPACE.sm,
        paddingHorizontal: SPACE.md,
      },
      editBtnText: {
        fontFamily: FONT_FAMILY.medium,
        fontSize: 14,
        color: colors.textMuted,
      },
      confirmBtn: {
        backgroundColor: colors.accentPrimary,
        borderRadius: RADIUS.md,
        paddingVertical: SPACE.sm,
        paddingHorizontal: SPACE.md,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
      },
      confirmBtnText: {
        fontFamily: FONT_FAMILY.medium,
        fontSize: 14,
        color: colors.background,
      },
      iconBtn: {
        width: 42,
        height: 42,
        borderRadius: 21,
        backgroundColor: 'rgba(255,255,255,0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        alignItems: 'center',
        justifyContent: 'center',
      },
      iconBtnRecording: {
        backgroundColor: 'rgba(255, 105, 97, 0.2)',
        borderColor: '#ff6961',
      },
      nlHintRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        paddingHorizontal: SPACE.xs,
        marginBottom: SPACE.sm,
        gap: SPACE.xs,
      },
      nlHintText: {
        marginLeft: SPACE.xs,
        fontSize: FONT_SIZE.sm,
        color: colors.accentPrimary,
        fontFamily: FONT_FAMILY.medium,
      },
      nlChip: {
        paddingHorizontal: SPACE.sm,
        paddingVertical: 4,
        borderRadius: RADIUS.full,
      },
      nlChipText: {
        fontFamily: FONT_FAMILY.medium,
        fontSize: 12,
      },
      saveBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#a599ff',
        shadowColor: '#a599ff',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.45,
        shadowRadius: 10,
        elevation: 6,
      },
      saveBtnDisabled: {
        opacity: 0.35,
        shadowOpacity: 0,
        elevation: 0,
      },
      saveBtnText: {
        fontFamily: FONT_FAMILY.bold,
        fontSize: FONT_SIZE.base,
        color: '#080510',
      },
    });
