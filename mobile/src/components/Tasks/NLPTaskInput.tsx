/**
 * NLPTaskInput — ZenTrack Mobile
 *
 * Todoist-style natural language task input with LIVE token highlighting.
 *
 * As the user types:
 *   "Submit lab report next Tuesday at 3pm high priority"
 *
 * The parser detects tokens (date, time, priority, recurrence) and renders
 * them as colored inline highlights inside the text field — exactly like Todoist.
 *
 * Below the input, detected tokens appear as dismissible chips showing
 * the human-readable interpretation.
 */

import React, { useCallback, useRef, useState, useEffect, useMemo } from 'react';
import {
  View, Text, TextInput, StyleSheet, ScrollView,
  TouchableOpacity, Platform, TextInputSelectionChangeEventData,
  NativeSyntheticEvent,
} from 'react-native';
import Animated, { FadeInDown, FadeOutUp, useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { parseNLTask, ParsedTask, NLPToken } from '../../utils/dateUtils';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS } from '../../theme/tokens';
import { useTheme } from '../../contexts/ThemeContext';
import { startVADRecording, stopAndTranscribe, cancelVoiceRecording, isSilenceOrNoise, VoiceState } from '../../services/voiceEngine';
import { ActivityIndicator } from 'react-native';
import VoiceMicButton from '../SARA/VoiceMicButton';

// ─── Token color map ───────────────────────────────────────────────────────────
const getTokenColors = (isDark: boolean): Record<NLPToken['type'], { bg: string; text: string; border: string }> => ({
  date: isDark 
    ? { bg: '#1a2e4a', text: '#60a5fa', border: '#3b82f6' }
    : { bg: 'rgba(2, 132, 199, 0.08)', text: '#0284C7', border: 'rgba(2, 132, 199, 0.25)' },
  time: isDark
    ? { bg: '#1a3a2a', text: '#34d399', border: '#10b981' }
    : { bg: 'rgba(5, 150, 105, 0.08)', text: '#059669', border: 'rgba(5, 150, 105, 0.25)' },
  priority: isDark
    ? { bg: '#3a1a1a', text: '#f87171', border: '#ef4444' }
    : { bg: 'rgba(220, 38, 38, 0.08)', text: '#DC2626', border: 'rgba(220, 38, 38, 0.25)' },
  recurrence: isDark
    ? { bg: '#2a1a3a', text: '#c084fc', border: '#a855f7' }
    : { bg: 'rgba(108, 92, 231, 0.08)', text: '#6C5CE7', border: 'rgba(108, 92, 231, 0.25)' },
  tag: isDark
    ? { bg: '#1a2a3a', text: '#38bdf8', border: '#0ea5e9' }
    : { bg: 'rgba(2, 132, 199, 0.08)', text: '#0284C7', border: 'rgba(2, 132, 199, 0.25)' },
  duration: isDark
    ? { bg: '#2a2a1a', text: '#fbbf24', border: '#f59e0b' }
    : { bg: 'rgba(217, 119, 6, 0.08)', text: '#D97706', border: 'rgba(217, 119, 6, 0.25)' },
  reminder: isDark
    ? { bg: '#3a2010', text: '#f59e0b', border: '#d97706' }
    : { bg: 'rgba(245, 158, 11, 0.08)', text: '#D97706', border: 'rgba(245, 158, 11, 0.25)' },
  subtask: isDark
    ? { bg: '#231c38', text: '#a599ff', border: '#7c3aed' }
    : { bg: 'rgba(124, 58, 237, 0.08)', text: '#7C3AED', border: 'rgba(124, 58, 237, 0.25)' },
  location: isDark
    ? { bg: '#1c2e28', text: '#34d399', border: '#10b981' }
    : { bg: 'rgba(16, 185, 129, 0.08)', text: '#10B981', border: 'rgba(16, 185, 129, 0.25)' },
});

// Priority → accent color map for the priority chip icon
const PRIORITY_ICON_COLORS = { high: '#ef4444', medium: '#f97316', low: '#22c55e' };

interface Props {
  value: string;
  onChangeText: (text: string) => void;
  parsed: ParsedTask;
  onDismissToken: (token: NLPToken) => void;
  autoFocus?: boolean;
  placeholder?: string;
  onSubmitEditing?: () => void;
  onAutoSubmit?: (text: string) => void;
  hideMic?: boolean;
  onMicPress?: () => void;
}

export default function NLPTaskInput({
  value, onChangeText, parsed, onDismissToken, autoFocus, placeholder, onSubmitEditing, onAutoSubmit, hideMic, onMicPress
}: Props) {
  const { colors, isDark } = useTheme();
  const tokenColors = useMemo(() => getTokenColors(isDark), [isDark]);
  const inputRef = useRef<TextInput>(null);
  const chipScale = useSharedValue(1);
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  
  // Local state to prevent keystroke dropping during heavy parent re-renders
  const [localText, setLocalText] = useState(value);
  const lastTypedText = useRef(value);

  useEffect(() => {
    // If the parent changed the value programmatically (not from our typing)
    if (value !== lastTypedText.current) {
      setLocalText(value);
      lastTypedText.current = value;
    }
  }, [value]);

  const handleLocalChangeText = (t: string) => {
    lastTypedText.current = t;
    setLocalText(t);
    onChangeText(t);
  };

  useEffect(() => {
    return () => {
      cancelVoiceRecording();
    };
  }, []);

  const handleToggleVoice = async () => {
    if (voiceState === 'recording') {
      await stopAndTranscribe({
        onStateChange: setVoiceState,
        onTranscript: (t) => {
          if (!t || !t.trim() || isSilenceOrNoise(t)) return;
          onChangeText(t);
          if (onAutoSubmit) onAutoSubmit(t);
        },
        onError: (err) => console.log('Voice error', err)
      });
      return;
    }
    
    await startVADRecording({
      onStateChange: setVoiceState,
      onTranscript: (t) => {
        if (!t || !t.trim() || isSilenceOrNoise(t)) return;
        handleLocalChangeText(t);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        if (onAutoSubmit) onAutoSubmit(t);
      },
      onError: (err) => {
        console.log('Voice error', err);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    });
  };

  // ─── Build highlighted text segments ─────────────────────────────────────
  // We render a transparent TextInput on top of a View that shows
  // colored text segments. This is the exact technique Todoist uses.
  const segments = buildSegments(value, parsed.tokens);

  // ─── Chips row below input ────────────────────────────────────────────────
  const visibleTokens = parsed.tokens.filter(
    t => t.type !== 'priority' || parsed.priority !== 'low'
  );
  const hasChips = visibleTokens.length > 0;

  return (
    <View style={styles.wrapper}>
      <View style={[styles.inputContainer, { borderRadius: 16 }]}>
        {/* ── Crisp, single-rendered TextInput ─────────────────────────────── */}
        <TextInput
          ref={inputRef}
          style={[styles.input, { color: voiceState === 'recording' ? colors.accentPrimary : colors.textPrimary, paddingRight: hideMic ? 16 : 48 }]}
          value={voiceState === 'recording' ? 'Listening...' : localText}
          onChangeText={handleLocalChangeText}
          placeholder={voiceState === 'recording' ? 'Listening...' : (placeholder || "Add a task... try 'report friday 3pm high'")}
          placeholderTextColor={voiceState === 'recording' ? colors.accentPrimary : colors.textMuted}
          autoFocus={autoFocus}
          editable={voiceState !== 'recording' && voiceState !== 'processing'}
          returnKeyType="default"
          multiline={true}
          blurOnSubmit={false}
          autoCorrect={false}
          spellCheck={false}
          autoCapitalize="sentences"
        />
        
        {!hideMic && (
          <View style={styles.micBtnContainer}>
            <VoiceMicButton 
              onToggleRecord={onMicPress || handleToggleVoice}
              isRecording={voiceState === 'recording'}
              isProcessing={voiceState === 'processing'}
              disabled={voiceState === 'processing'}
            />
          </View>
        )}
      </View>

      {/* ── Parsed token chips ───────────────────────────────────────────── */}
      {hasChips && (
        <Animated.View
          entering={FadeInDown.duration(180).springify()}
          exiting={FadeOutUp.duration(120)}
          style={styles.chipsRow}
        >
          {visibleTokens.map((tok, i) => (
            <Animated.View
              key={`${tok.type}-${i}`}
              entering={FadeInDown.delay(i * 40).duration(160).springify()}
            >
              <TouchableOpacity
                style={[styles.chip, {
                  backgroundColor: tokenColors[tok.type].bg,
                  borderColor: tokenColors[tok.type].border,
                }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onDismissToken(tok);
                }}
                activeOpacity={0.75}
              >
                <Text style={[styles.chipText, { color: tokenColors[tok.type].text }]}>
                  {tok.display}
                </Text>
                <Ionicons name="close" size={11} color={tokenColors[tok.type].text} style={{ marginLeft: 3, opacity: 0.7 }} />
              </TouchableOpacity>
            </Animated.View>
          ))}
        </Animated.View>
      )}
    </View>
  );
}

// ─── Build segments ──────────────────────────────────────────────────────────
// Split text into plain vs token spans for the highlighted render layer.
function buildSegments(text: string, tokens: NLPToken[]): Array<{ text: string; token?: NLPToken }> {
  if (!tokens.length || !text) return [{ text }];

  const sorted = [...tokens].sort((a, b) => a.start - b.start);
  const segs: Array<{ text: string; token?: NLPToken }> = [];
  let cursor = 0;

  for (const tok of sorted) {
    if (tok.start > cursor) {
      segs.push({ text: text.slice(cursor, tok.start) });
    }
    segs.push({ text: text.slice(tok.start, tok.end), token: tok });
    cursor = tok.end;
  }
  if (cursor < text.length) {
    segs.push({ text: text.slice(cursor) });
  }
  return segs;
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
  },
  inputContainer: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
  },
  micBtnContainer: {
    paddingRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    fontFamily: FONT_FAMILY.body,
    fontSize: 18, // increased font size to match EditTaskModal
    lineHeight: 26,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 16 : 14,
    minHeight: 50,
    backgroundColor: 'transparent',
    textAlignVertical: 'top',
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACE.xs,
    paddingHorizontal: SPACE.xs,
    paddingTop: SPACE.xs,
    paddingBottom: 2,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACE.sm,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    borderWidth: 1,
  },
  chipText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 12,
  },
});
