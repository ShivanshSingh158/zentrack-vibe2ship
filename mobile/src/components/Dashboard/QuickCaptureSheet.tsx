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
  Animated,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { getFirestore, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { queueWrite } from '../../services/offlineSync';
import { useMobileData } from '../../contexts/MobileDataContext';
import { parseNLDate } from '../../utils/dateUtils';
import { COLLECTION } from '../../config/constants';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS } from '../../theme/tokens';
import { useTheme } from "../../contexts/ThemeContext";
import { callProxy, parseProxyResponse } from '../../services/geminiProxy';

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
  const translateY = useRef(new Animated.Value(400)).current;
  const inputRef = useRef<TextInput>(null);

  // Parsed date preview (live, for tasks only)
  const parsed = type === 'task' && text.length > 2 ? parseNLDate(text) : null;
  const hasDateHint = parsed && (parsed.date || parsed.timeSlot);

  useEffect(() => {
    if (visible) {
      setSaved(false);
      setText('');
      Animated.spring(translateY, {
        toValue: 0,
        stiffness: 280,
        damping: 24,
        mass: 0.7,
        useNativeDriver: true,
      }).start(() => {
        setTimeout(() => inputRef.current?.focus(), 100);
      });
    } else {
      Animated.timing(translateY, {
        toValue: 400,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  const handleSave = async () => {
    if (!text.trim() || !user || saving) return;
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      if (type === 'task') {
        const prompt = `Parse this task description into JSON: "${text.trim()}"
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
            title: t.title || text.trim(),
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
          title: text.trim().substring(0, 40) + (text.length > 40 ? '...' : ''),
          content: text.trim(),
          userId: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else if (type === 'habit') {
        await queueWrite(COLLECTION.HABITS, 'add', {
          userId: user.uid,
          title: text.trim(),
          frequency: 'daily',
          createdAt: serverTimestamp(),
          streak: 0,
          isActive: true
        });
      }
      setSaved(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => {
        onClose();
        setText('');
      }, 600);
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

  if (!visible) return null;

  return (
    <Modal transparent animationType="none" visible={visible} onRequestClose={onClose}>
      {/* Backdrop */}
      <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={onClose} />

      {/* Sheet */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={s.kavWrapper}
        pointerEvents="box-none"
      >
        <Animated.View
          style={[
            s.sheet,
            { paddingBottom: insets.bottom + SPACE.lg, transform: [{ translateY }] },
          ]}
        >
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
                  color={type === tab.key ? colors.background : colors.textMuted}
                  style={{ marginRight: 4 }}
                />
                <Text style={[s.tabText, type === tab.key && s.tabTextActive]}>{tab.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Quick Capture Input View */}
          <View style={s.inputContainer}>
            <TextInput
              ref={inputRef}
              style={s.input}
              placeholder={placeholders[type]}
              placeholderTextColor={colors.textMuted}
              value={text}
              onChangeText={setText}
              multiline
              maxLength={200}
              keyboardAppearance={isDark ? 'dark' : 'light'}
            />
            
            {/* Natural language hint for tasks */}
            {type === 'task' && hasDateHint && (
              <View style={s.nlHintRow}>
                <Ionicons name="calendar" size={12} color={colors.accentPrimary} />
                <Text style={s.nlHintText}>
                  {parsed?.multiDays ? `Next ${parsed.multiDays} days` : (parsed?.date || 'Today')}
                  {parsed?.timeSlot ? ` at ${parsed.timeSlot}` : ''}
                </Text>
              </View>
            )}

              {/* Quick Actions (e.g. mic, save) */}
              <View style={s.actionsRow}>
                <TouchableOpacity style={s.iconBtn}>
                  <Ionicons name="mic" size={20} color={colors.textSecondary} />
                </TouchableOpacity>

                <TouchableOpacity
                  style={[s.saveBtn, (!text.trim() || saving) && s.saveBtnDisabled]}
                  onPress={handleSave}
                  disabled={!text.trim() || saving}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color={colors.background} />
                  ) : saved ? (
                    <Ionicons name="checkmark" size={20} color={colors.background} />
                  ) : (
                    <Ionicons name="arrow-up" size={20} color={colors.background} />
                  )}
                </TouchableOpacity>
              </View>
            </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const makeStyles = (colors: any) => StyleSheet.create({
      backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.55)',
      },
      kavWrapper: {
        flex: 1,
        justifyContent: 'flex-end',
      },
      sheet: {
        backgroundColor: colors.surfaceRaised,
        borderTopLeftRadius: RADIUS.xxl,
        borderTopRightRadius: RADIUS.xxl,
        paddingTop: SPACE.md,
        paddingHorizontal: SPACE.xl,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.08)',
        borderBottomWidth: 0,
      },
      handle: {
        width: 36,
        height: 4,
        borderRadius: 2,
        backgroundColor: colors.border,
        alignSelf: 'center',
        marginBottom: SPACE.lg,
      },
      titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: SPACE.lg,
      },
      title: {
        fontFamily: FONT_FAMILY.bold,
        fontSize: FONT_SIZE.lg,
        color: colors.textPrimary,
      },
      tabs: {
        flexDirection: 'row',
        gap: SPACE.sm,
        marginBottom: SPACE.lg,
      },
      tab: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: SPACE.md,
        paddingVertical: SPACE.sm,
        borderRadius: RADIUS.full,
        backgroundColor: colors.surface2,
        borderWidth: 1,
        borderColor: colors.border,
      },
      tabActive: {
        backgroundColor: colors.accentPrimary,
        borderColor: colors.accentPrimary,
      },
      tabText: {
        fontFamily: FONT_FAMILY.medium,
        fontSize: FONT_SIZE.sm,
        color: colors.textMuted,
      },
      tabTextActive: {
        color: colors.background,
        fontFamily: FONT_FAMILY.bold,
      },
      input: {
        fontFamily: FONT_FAMILY.body,
        fontSize: FONT_SIZE.base,
        color: colors.textPrimary,
        backgroundColor: colors.surface,
        borderRadius: RADIUS.lg,
        borderWidth: 1,
        borderColor: colors.border,
        padding: SPACE.lg,
        minHeight: 90,
        textAlignVertical: 'top',
        marginBottom: SPACE.sm,
      },
      inputContainer: { marginTop: SPACE.md },
  actionsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: SPACE.md,
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
        width: 44, height: 44, borderRadius: 22,
        backgroundColor: colors.surface2,
        alignItems: 'center', justifyContent: 'center',
      },
      nlHintRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: SPACE.xs,
        marginBottom: SPACE.sm,
      },
      nlHintText: {
        marginLeft: SPACE.xs,
        fontSize: FONT_SIZE.sm,
        color: colors.accentPrimary,
        fontFamily: FONT_FAMILY.medium,
      },
      saveBtn: {
        width: 44, height: 44, borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.accentPrimary,
        shadowColor: colors.accentPrimary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 10,
        elevation: 6,
      },
      saveBtnDisabled: {
        opacity: 0.45,
        shadowOpacity: 0,
        elevation: 0,
      },
      saveBtnText: {
        fontFamily: FONT_FAMILY.bold,
        fontSize: FONT_SIZE.base,
        color: colors.background,
      },
    });
