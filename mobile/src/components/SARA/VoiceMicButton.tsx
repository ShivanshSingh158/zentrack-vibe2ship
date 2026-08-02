/**
 * VoiceMicButton — Compact 44px purple mic button for the Sara chat input bar.
 *
 * Behavior:
 *   - Single tap → calls onVoiceModeOpen() to open the voice overlay
 *   - No label, no cancel — minimal footprint in the input row
 *   - Shows mic icon normally, hourglass while processing
 *
 * Color: always #a599ff (purple accent, not green).
 */

import React, { useRef } from 'react';
import { Animated, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

interface VoiceMicButtonProps {
  onToggleRecord: () => void;
  isRecording?: boolean;
  isProcessing?: boolean;
  disabled?: boolean;
}

const PURPLE = '#a599ff';
const RED = '#ff4d4f';
const SIZE = 44;

export default function VoiceMicButton({
  onToggleRecord,
  isRecording = false,
  isProcessing = false,
  disabled = false,
}: VoiceMicButtonProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    if (disabled || isProcessing) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    Animated.sequence([
      Animated.spring(scaleAnim, { toValue: 0.88, useNativeDriver: true, tension: 200 }),
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 200 }),
    ]).start();

    onToggleRecord();
  };

  return (
    <Animated.View style={[s.button, {
      transform: [{ scale: scaleAnim }],
      opacity: disabled ? 0.5 : 1,
      backgroundColor: isRecording ? 'rgba(255, 77, 79, 0.15)' : 'rgba(165,153,255,0.15)',
      borderColor: isRecording ? 'rgba(255, 77, 79, 0.4)' : 'rgba(165,153,255,0.4)',
    }]}>
      <TouchableOpacity
        onPress={handlePress}
        disabled={disabled || isProcessing}
        style={s.touch}
        activeOpacity={0.85}
      >
        <Ionicons
          name={isProcessing ? 'hourglass-outline' : isRecording ? 'square' : 'mic'}
          size={isRecording ? 16 : 20}
          color={isRecording ? RED : PURPLE}
        />
      </TouchableOpacity>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  button: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: 'rgba(165,153,255,0.15)',
    borderWidth: 1.5,
    borderColor: 'rgba(165,153,255,0.4)',
    overflow: 'hidden',
  },
  touch: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
