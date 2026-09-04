/**
 * VoiceMicButton — Red gradient circle mic button matching the VoiceDictationOverlay orb style.
 *
 * Idle:      Red gradient circle (#FF453A → #B30006) with white mic-outline icon
 * Recording: Same circle with filled mic icon + pulsing glow ring
 * Processing: Dimmed with hourglass icon
 */

import React, { useRef, useEffect } from 'react';
import { Animated, TouchableOpacity, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';

interface VoiceMicButtonProps {
  onToggleRecord: () => void;
  isRecording?: boolean;
  isProcessing?: boolean;
  disabled?: boolean;
  /** Size of the orb in px. Default: 44 */
  size?: number;
}

export default function VoiceMicButton({
  onToggleRecord,
  isRecording = false,
  isProcessing = false,
  disabled = false,
  size = 44,
}: VoiceMicButtonProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const glowAnim  = useRef(new Animated.Value(0.3)).current;

  // Pulsing glow ring when recording
  useEffect(() => {
    if (isRecording) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, { toValue: 0.85, duration: 700, useNativeDriver: true }),
          Animated.timing(glowAnim, { toValue: 0.25, duration: 700, useNativeDriver: true }),
        ])
      ).start();
    } else {
      glowAnim.stopAnimation();
      Animated.timing(glowAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start();
    }
  }, [isRecording]);

  const handlePress = () => {
    if (disabled || isProcessing) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    Animated.sequence([
      Animated.spring(scaleAnim, { toValue: 0.84, useNativeDriver: true, tension: 250, friction: 5 }),
      Animated.spring(scaleAnim, { toValue: 1,    useNativeDriver: true, tension: 200, friction: 6 }),
    ]).start();

    onToggleRecord();
  };

  const orbRadius = size / 2;
  const glowSize  = size + 12;

  const iconName = isProcessing
    ? 'hourglass-outline'
    : isRecording
    ? 'mic'
    : 'mic-outline';

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }], opacity: disabled ? 0.4 : 1 }}>
      {/* Glow ring — behind the orb */}
      <Animated.View
        style={[
          styles.glow,
          {
            width:        glowSize,
            height:       glowSize,
            borderRadius: glowSize / 2,
            top:          -(glowSize - size) / 2,
            left:         -(glowSize - size) / 2,
            opacity:      glowAnim,
          },
        ]}
      />

      <TouchableOpacity
        onPress={handlePress}
        disabled={disabled || isProcessing}
        activeOpacity={0.82}
      >
        <LinearGradient
          colors={isRecording ? ['#FF6961', '#B30006'] : ['#FF453A', '#B30006']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.orb,
            {
              width:        size,
              height:       size,
              borderRadius: orbRadius,
              shadowColor:  '#FF453A',
              shadowOpacity: isRecording ? 0.55 : 0.35,
              shadowRadius:  isRecording ? 12 : 8,
              shadowOffset:  { width: 0, height: 3 },
              elevation:     isRecording ? 8 : 5,
            },
          ]}
        >
          <Ionicons
            name={iconName}
            size={size * 0.48}
            color="#FFFFFF"
          />
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  orb: {
    alignItems:      'center',
    justifyContent:  'center',
  },
  glow: {
    position:        'absolute',
    backgroundColor: '#FF453A',
  },
});
