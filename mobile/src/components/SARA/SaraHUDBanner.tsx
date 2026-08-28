/**
 * SaraHUDBanner.tsx — ZenTrack Mobile SARA Engine v2
 *
 * Capability 5 — Predictive Surface Injection (PSI)
 *
 * A 44px dismissable AI-context banner that appears at the top of screens
 * when SARA has something relevant to say about the current screen context.
 *
 * Design:
 *   - Slides in from top on screen focus
 *   - Sara avatar dot + message text + dismiss X
 *   - Optional [action] button for quick 1-tap responses
 *   - Theme-aware (dark/light)
 *   - pointerEvents respects underlying content
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { FONT_FAMILY, FONT_SIZE, RADIUS, SPACE } from '../../theme/tokens';

export interface SaraHUDBannerProps {
  message: string;
  visible: boolean;
  onDismiss: () => void;
  actionLabel?: string;
  onAction?: () => void;
}

export default function SaraHUDBanner({
  message,
  visible,
  onDismiss,
  actionLabel,
  onAction,
}: SaraHUDBannerProps) {
  const { colors } = useTheme();
  const heightAnim = useRef(new Animated.Value(visible ? 46 : 0)).current;
  const opacity = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const [isHidden, setIsHidden] = React.useState(!visible);

  useEffect(() => {
    if (visible) {
      setIsHidden(false);
      Animated.parallel([
        Animated.timing(heightAnim, {
          toValue: 46,
          duration: 240,
          useNativeDriver: false,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: false,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(heightAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: false,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 180,
          useNativeDriver: false,
        }),
      ]).start(() => {
        setIsHidden(true);
      });
    }
  }, [visible]);

  if (isHidden) return null;

  const handleDismiss = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onDismiss();
  };

  const handleAction = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    onAction?.();
    onDismiss();
  };

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: colors.surface,
          borderBottomColor: colors.accentPrimary + '30',
          maxHeight: heightAnim,
          opacity,
          overflow: 'hidden',
        },
      ]}
    >
      {/* Sara avatar indicator */}
      <View style={[styles.saraOrb, { backgroundColor: colors.accentPrimary + '25' }]}>
        <View style={[styles.saraOrbCore, { backgroundColor: colors.accentPrimary }]} />
      </View>

      {/* Message */}
      <Text
        style={[styles.message, { color: colors.textSecondary }]}
        numberOfLines={2}
      >
        {message}
      </Text>

      {/* Action button */}
      {actionLabel && onAction && (
        <TouchableOpacity
          style={[styles.actionBtn, { borderColor: colors.accentPrimary + '60' }]}
          onPress={handleAction}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
        >
          <Text style={[styles.actionBtnText, { color: colors.accentPrimary }]}>
            {actionLabel}
          </Text>
        </TouchableOpacity>
      )}

      {/* Dismiss */}
      <TouchableOpacity
        onPress={handleDismiss}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        <Ionicons name="close" size={16} color={colors.textMuted} />
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACE.md,
    paddingVertical: SPACE.sm,
    minHeight: 44,
    gap: SPACE.sm,
    borderBottomWidth: 1,
    zIndex: 100,
  },
  saraOrb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  saraOrbCore: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  message: {
    flex: 1,
    fontFamily: FONT_FAMILY.body,
    fontSize: FONT_SIZE.sm,
    lineHeight: 18,
  },
  actionBtn: {
    paddingHorizontal: SPACE.sm,
    paddingVertical: 3,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    flexShrink: 0,
  },
  actionBtnText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 11,
  },
});
