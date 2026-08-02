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

import React, { useCallback, useRef, useState, useEffect } from 'react';
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
import { startVADRecording, stopAndTranscribe, cancelVoiceRecording, VoiceState } from '../../services/voiceEngine';
import { ActivityIndicator } from 'react-native';
import VoiceMicButton from '../SARA/VoiceMicButton';

// ─── Token color map ───────────────────────────────────────────────────────────
const TOKEN_COLORS: Record<NLPToken['type'], { bg: string; text: string; border: string }> = {
  date:       { bg: '#1a2e4a', text: '#60a5fa', border: '#3b82f6' },  // blue
  time:       { bg: '#1a3a2a', text: '#34d399', border: '#10b981' },  // green
  priority:   { bg: '#3a1a1a', text: '#f87171', border: '#ef4444' },  // red
  recurrence: { bg: '#2a1a3a', text: '#c084fc', border: '#a855f7' },  // purple
};

// Priority → accent color map for the priority chip icon
const PRIORITY_ICON_COLORS = { high: '#ef4444', medium: '#f97316', low: '#22c55e' };

interface Props {
  value: string;
  onChangeText: (text: string) => void;
  parsed: ParsedTask;
  onDismissToken: (type: NLPToken['type']) => void;
  autoFocus?: boolean;
  placeholder?: string;
  onSubmitEditing?: () => void;
  onAutoSubmit?: (text: string) => void;
}

export default function NLPTaskInput({
  value, onChangeText, parsed, onDismissToken, autoFocus, placeholder, onSubmitEditing, onAutoSubmit,
}: Props) {
  const { colors, isDark } = useTheme();
  const inputRef = useRef<TextInput>(null);
  const chipScale = useSharedValue(1);
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');

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
        onChangeText(t);
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
      <View style={styles.inputContainer}>
        {/* ── Crisp, single-rendered TextInput ─────────────────────────────── */}
        <TextInput
          ref={inputRef}
          style={[styles.input, { color: voiceState === 'recording' ? colors.accentPrimary : colors.textPrimary }]}
          value={voiceState === 'recording' ? 'Listening...' : value}
          onChangeText={onChangeText}
          placeholder={voiceState === 'recording' ? 'Listening...' : (placeholder || "Add a task... try 'report friday 3pm high'")}
          placeholderTextColor={voiceState === 'recording' ? colors.accentPrimary : colors.textMuted}
          autoFocus={autoFocus}
          editable={voiceState !== 'recording' && voiceState !== 'processing'}
          returnKeyType="done"
          onSubmitEditing={onSubmitEditing}
          multiline={false}
          blurOnSubmit
        />
        
        <View style={styles.micBtnContainer}>
          <VoiceMicButton 
            onToggleRecord={handleToggleVoice}
            isRecording={voiceState === 'recording'}
            isProcessing={voiceState === 'processing'}
            disabled={voiceState === 'processing'}
          />
        </View>
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
                  backgroundColor: TOKEN_COLORS[tok.type].bg,
                  borderColor: TOKEN_COLORS[tok.type].border,
                }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  onDismissToken(tok.type);
                }}
                activeOpacity={0.75}
              >
                <Text style={[styles.chipText, { color: TOKEN_COLORS[tok.type].text }]}>
                  {tok.display}
                </Text>
                <Ionicons name="close" size={11} color={TOKEN_COLORS[tok.type].text} style={{ marginLeft: 3, opacity: 0.7 }} />
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
    fontSize: FONT_SIZE.base,
    lineHeight: 22,
    paddingHorizontal: SPACE.lg,
    paddingVertical: Platform.OS === 'ios' ? 14 : 12,
    minHeight: 50,
    backgroundColor: 'transparent',
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
