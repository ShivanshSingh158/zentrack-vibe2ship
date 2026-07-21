/**
 * InlineActionPill.tsx — ZenTrack Mobile SARA Engine v2
 *
 * Capability 3 — Tier 2 compact inline action pill.
 * A single-line pill rendered inside the chat bubble for medium-confidence actions.
 * One tap confirms, swipe/X rejects.
 */

import React, { useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { FONT_FAMILY, FONT_SIZE, RADIUS, SPACE } from '../../theme/tokens';

export interface InlineActionPillProps {
  text: string;             // e.g. 'Add "ML Exam" on Thursday?'
  onConfirm: () => void;
  onReject: () => void;
  confirmed?: boolean;      // true = show "✓ Done" state
  rejected?: boolean;       // true = show dismissed state
}

export default function InlineActionPill({
  text,
  onConfirm,
  onReject,
  confirmed,
  rejected,
}: InlineActionPillProps) {
  const { colors } = useTheme();
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handleConfirm = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 0.95, duration: 80, useNativeDriver: true }),
      Animated.timing(scaleAnim, { toValue: 1, duration: 80, useNativeDriver: true }),
    ]).start(() => onConfirm());
  };

  const handleReject = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onReject();
  };

  if (confirmed) {
    return (
      <View style={[styles.pill, styles.confirmedPill, { borderColor: colors.accentGreen + '50' }]}>
        <Ionicons name="checkmark-circle" size={14} color={colors.accentGreen} />
        <Text style={[styles.text, { color: colors.accentGreen }]}>Done</Text>
      </View>
    );
  }

  if (rejected) {
    return null; // silently hide rejected pills
  }

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <View style={[styles.pill, { backgroundColor: colors.surface2, borderColor: colors.accentPrimary + '40' }]}>
        <Ionicons name="flash-outline" size={13} color={colors.accentPrimary} />
        <Text style={[styles.text, { color: colors.textPrimary, flex: 1 }]} numberOfLines={1}>
          {text}
        </Text>
        <TouchableOpacity
          style={[styles.confirmBtn, { backgroundColor: colors.accentPrimary }]}
          onPress={handleConfirm}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="checkmark" size={14} color="#fff" />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleReject}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="close" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    marginTop: SPACE.sm,
    maxWidth: 320,
  },
  confirmedPill: {
    backgroundColor: 'transparent',
    marginTop: SPACE.sm,
  },
  text: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: FONT_SIZE.sm,
  },
  confirmBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
