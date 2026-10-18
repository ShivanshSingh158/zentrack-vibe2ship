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

import React, { useEffect, useRef, useState, useMemo } from 'react';
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
import { collection, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { queueWrite } from '../../services/offlineSync';
import { safeWrite } from '../../utils/safeWrite';
import { useCoreData } from '../../contexts/domains/CoreDataContext';
import { useCreativeData } from '../../contexts/domains/CreativeContext';
import { Task, Habit, StorageNode } from '../../contexts/MobileDataContext';
import { parseNLTask, cleanTaskTitle, formatLocalDateStr, offsetDateStr } from '../../utils/dateUtils';
import { COLLECTION } from '../../config/constants';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS } from '../../theme/tokens';
import { useTheme } from "../../contexts/ThemeContext";
import { callProxy, parseProxyResponse } from '../../services/geminiProxy';
import { isSilenceOrNoise, VoiceState } from '../../services/voiceEngine';
import { startNativeStt, stopNativeStt, abortNativeStt } from '../../services/nativeStt';
import { Portal } from '../../contexts/PortalContext';
import NLPTaskInput from '../Tasks/NLPTaskInput';
import { scheduleSingleTaskReminder } from '../../services/notifications';

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
    const s = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const { user, optimisticAddTask, optimisticAddHabit } = useCoreData();
  const { optimisticAddStorageNode } = useCreativeData();
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
  const parsed = useMemo(() => {
    if (type !== 'task') return null;
    return text.length > 2 ? parseNLTask(text) : ({ tokens: [], text, priority: 'none' } as any);
  }, [text, type]);
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
      abortNativeStt();
      backdropOpacity.value = withTiming(0, { duration: 150 });
      translateY.value = withTiming(1000, { duration: 150, easing: Easing.in(Easing.quad) }, (finished) => {
        if (finished) runOnJS(setMounted)(false);
      });
    }
  }, [visible]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: translateY.value - keyboard.height.value }],
      paddingBottom: insets.bottom + SPACE.lg,
    };
  });

  const backdropStyle = useAnimatedStyle(() => {
    return {
      opacity: backdropOpacity.value,
    };
  });

  const handleToggleVoice = async () => {
    if (voiceState === 'recording') {
      stopNativeStt();
      setVoiceState('idle');
      return;
    }

    // Start native OS SpeechRecognizer (Gboard-level quality)
    await startNativeStt({
      onStateChange: (state) => {
        if (state === 'listening') setVoiceState('recording');
        else if (state === 'idle') setVoiceState('idle');
        else if (state === 'error') setVoiceState('idle');
      },
      onResult: async (text, isFinal) => {
        if (!text || !text.trim()) return;
        // Show interim text live
        setText(text);
        if (isFinal) {
          if (isSilenceOrNoise(text)) return;
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          await handleSave(text);
        }
      },
      onError: (err) => {
        console.log('Voice error', err);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      },
    });
  };

  const handleSave = async (overrideText?: string) => {
    const textToSave = typeof overrideText === 'string' ? overrideText : text;
    if (!textToSave.trim() || isSilenceOrNoise(textToSave) || !user || saving) return;
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    Keyboard.dismiss();
    onClose();
    setText('');

    const todayLocal = formatLocalDateStr(new Date());

    try {
      if (type === 'task') {
        const localParsed = parseNLTask(textToSave.trim());
        let parsedData: any[] = [];

        // Try AI enrichment online, but ALWAYS fall back to 0ms on-device parseNLTask when offline!
        try {
          const prompt = `Parse this task description into JSON: "${textToSave.trim()}"
IMPORTANT: Extract ONLY the clean action-oriented task name for 'title', completely removing conversational commands (e.g. "create", "add", "make", "schedule", "remind me to") and any time, date, priority, or recurrence words.
If it implies multiple tasks, return an array of tasks. If it's a single task, return an array of 1 task.
Return ONLY a JSON array: [{"title": str, "date": "YYYY-MM-DD", "timeSlot": "HH:MM or null", "priority": "P1|P2|P3", "isRecurring": bool, "frequency": "daily|weekly|monthly or null"}]
Today's date is ${todayLocal}.`;

          const response = await callProxy({
            model: 'gemini-2.5-flash',
            timeoutMs: 6000,
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json' },
          });

          const proxyParsed = parseProxyResponse(response);
          const cleanJson = (proxyParsed.text || response.text || '[]')
            .replace(/```json/g, '')
            .replace(/```/g, '')
            .trim();
          const candidate = JSON.parse(cleanJson);
          parsedData = Array.isArray(candidate) ? candidate : [candidate];
        } catch {
          // Offline or AI timeout -> use instant on-device NLP parser
          if (localParsed.oneTimeDates && localParsed.oneTimeDates.length > 1) {
            parsedData = localParsed.oneTimeDates.map(dStr => ({
              title: localParsed.title,
              date: dStr,
              timeSlot: localParsed.timeSlot,
              priority: localParsed.priority,
              isRecurring: false,
            }));
          } else {
            parsedData = [
              {
                title: localParsed.title,
                date: localParsed.date || todayLocal,
                timeSlot: localParsed.timeSlot,
                priority: localParsed.priority,
                isRecurring: localParsed.isRecurring,
                recurrenceRule: localParsed.recurrenceRule,
              },
            ];
          }
        }

        if (parsedData.length === 1 && localParsed?.multiDays && localParsed.multiDays > 1) {
          const baseTask = parsedData[0];
          const baseDateStr = (baseTask.date || localParsed.date || todayLocal).slice(0, 10);
          parsedData = Array.from({ length: localParsed.multiDays }).map((_, i) => ({
            ...baseTask,
            date: offsetDateStr(baseDateStr, i),
          }));
        }

        for (const t of parsedData) {
          const docRef = doc(collection(db, COLLECTION.TASKS));
          const taskId = docRef.id;
          const taskDate = (t.date || localParsed?.date || todayLocal).slice(0, 10);
          const taskTime = t.timeSlot || localParsed?.timeSlot || undefined;
          const finalIsReminder = !!(t.isReminder || localParsed?.isReminder || taskTime);
          const resolvedRecurrence = t.recurrenceRule || (t.frequency ? { type: t.frequency, interval: 1 } : (localParsed?.recurrenceRule || undefined));

          const taskTitle = cleanTaskTitle(t.title || localParsed?.title || textToSave.trim());
          const taskObj: Task = {
            id: taskId,
            userId: user.uid,
            title: taskTitle,
            text: taskTitle,
            status: 'pending',
            priority: t.priority || localParsed?.priority || 'P2',
            date: taskDate,
            timeSlot: taskTime,
            isRecurring: Boolean(t.isRecurring || localParsed?.isRecurring),
            recurrenceRule: resolvedRecurrence,
            tags: localParsed?.tags?.length ? localParsed.tags : undefined,
            isReminder: finalIsReminder,
          };

          optimisticAddTask(taskObj);
          if (finalIsReminder || taskTime) {
            scheduleSingleTaskReminder(taskObj).catch(console.warn);
          }

          const firestorePayload = {
            id: taskId,
            userId: user.uid,
            title: taskObj.title,
            text: taskObj.title,
            status: 'pending',
            priority: taskObj.priority,
            date: taskDate,
            timeSlot: taskTime || null,
            isRecurring: taskObj.isRecurring || false,
            recurrenceRule: resolvedRecurrence || null,
            tags: taskObj.tags || [],
            isReminder: finalIsReminder,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };

          await safeWrite(
            () => setDoc(docRef, firestorePayload),
            COLLECTION.TASKS,
            'set',
            firestorePayload,
            taskId,
          );
        }
      } else if (type === 'note') {
        const now = Date.now();
        const noteRef = doc(collection(db, COLLECTION.STORAGE_NODES));
        const noteId = noteRef.id;
        const cleanContent = textToSave.trim();
        const noteName = cleanContent.split('\n')[0].substring(0, 45) + (cleanContent.length > 45 ? '...' : '');

        const newNoteNode: StorageNode = {
          id: noteId,
          userId: user.uid,
          type: 'note',
          name: noteName || 'Quick Note',
          parentId: null,
          content: cleanContent,
          size: cleanContent.length,
          tags: [],
          pinned: false,
          createdAt: now,
          updatedAt: now,
        };

        optimisticAddStorageNode(newNoteNode);
        await safeWrite(
          () => setDoc(noteRef, newNoteNode),
          COLLECTION.STORAGE_NODES,
          'set',
          newNoteNode,
          noteId,
        );
      } else if (type === 'habit') {
        const now = Date.now();
        const habitRef = doc(collection(db, COLLECTION.HABITS));
        const habitId = habitRef.id;
        const newHabit: Habit = {
          id: habitId,
          userId: user.uid,
          name: textToSave.trim(),
          emoji: '⚡',
          frequency: 'daily',
          streak: 0,
          longestStreak: 0,
          type: 'positive',
          startDate: todayLocal,
          archived: false,
          createdAt: new Date(now).toISOString(),
        };

        optimisticAddHabit(newHabit);
        await safeWrite(
          () => setDoc(habitRef, { ...newHabit, updatedAt: now }),
          COLLECTION.HABITS,
          'set',
          { ...newHabit, updatedAt: now },
          habitId,
        );
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
                autoFocus={false}
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

const makeStyles = (colors: any, isDark: boolean = true) => StyleSheet.create({
      backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: isDark ? 'rgba(0,0,0,0.75)' : 'rgba(0,0,0,0.40)',
      },
      kavWrapper: {
        flex: 1,
        justifyContent: 'flex-end',
      },
      sheet: {
        backgroundColor: isDark ? '#000000' : colors.surface,
        borderTopLeftRadius: RADIUS.xxl,
        borderTopRightRadius: RADIUS.xxl,
        paddingTop: SPACE.md,
        paddingHorizontal: SPACE.xl,
        borderWidth: 1,
        borderColor: colors.border,
        borderBottomWidth: 0,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -8 },
        shadowOpacity: isDark ? 0.5 : 0.15,
        shadowRadius: 24,
        elevation: 16,
      },
      handle: {
        width: 38,
        height: 4,
        borderRadius: 2,
        backgroundColor: isDark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.15)',
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
        color: colors.textPrimary,
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
        backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : colors.surface2,
        borderWidth: 1,
        borderColor: colors.border,
      },
      tabActive: {
        backgroundColor: colors.accentPrimary,
        borderColor: colors.accentPrimary,
        shadowColor: colors.accentPrimary,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.35,
        shadowRadius: 8,
        elevation: 4,
      },
      tabText: {
        fontFamily: FONT_FAMILY.medium,
        fontSize: 13,
        color: colors.textMuted,
      },
      tabTextActive: {
        color: isDark ? '#080510' : '#FFFFFF',
        fontFamily: FONT_FAMILY.bold,
      },
      unifiedInputContainer: {
        backgroundColor: isDark ? '#1c1a26' : colors.surface2,
        borderRadius: RADIUS.xxl,
        borderWidth: 1,
        borderColor: isDark ? 'rgba(165,153,255,0.25)' : colors.border,
        padding: SPACE.md,
        minHeight: 140,
        marginBottom: SPACE.md,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: isDark ? 0.3 : 0.05,
        shadowRadius: 12,
        elevation: 4,
      },
      unifiedTextInput: {
        fontFamily: FONT_FAMILY.body,
        fontSize: 16,
        lineHeight: 24,
        color: colors.textPrimary,
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
        color: isDark ? colors.background : '#FFFFFF',
      },
      iconBtn: {
        width: 42,
        height: 42,
        borderRadius: 21,
        backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : colors.surface2,
        borderWidth: 1,
        borderColor: colors.border,
        alignItems: 'center',
        justifyContent: 'center',
      },
      iconBtnRecording: {
        backgroundColor: colors.errorBg,
        borderColor: colors.error,
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
        backgroundColor: colors.accentPrimary,
        shadowColor: colors.accentPrimary,
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
        color: isDark ? '#080510' : '#FFFFFF',
      },
    });
