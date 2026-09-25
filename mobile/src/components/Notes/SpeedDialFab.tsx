/**
 * SpeedDialFab.tsx — ZenTrack Mobile
 *
 * Authentic Floating Speed Dial with fluid 60/120fps Reanimated rotation & morphing.
 * - Persistent FAB rotates 45° from '+' to '×' with smooth spring physics
 * - Background color morphs between accent primary and charcoal close state
 * - Staggered blooming of action circles and pill labels on open
 * - Smooth reverse collapse into FAB on close
 * - Touch-dismiss backdrop with animated opacity
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  interpolate,
  interpolateColor,
  Extrapolation,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { feedback } from '../../utils/haptics';
import { FONT_FAMILY } from '../../theme/tokens';

interface SpeedDialFabProps {
  visible?: boolean;
  onUploadFile: () => void;
  onNewNote: () => void;
  onNewFolder: () => void;
  colors: any;
  isDark: boolean;
  bottomOffset?: number;
}

export default function SpeedDialFab({
  visible = true,
  onUploadFile,
  onNewNote,
  onNewFolder,
  colors,
  isDark,
  bottomOffset = 84,
}: SpeedDialFabProps) {
  const [isOpen, setIsOpen] = useState(false);
  const progress = useSharedValue(0);

  const handleClose = useCallback(() => {
    feedback.tap();
    progress.value = withTiming(0, { duration: 200, easing: Easing.bezier(0.25, 1, 0.5, 1) }, (finished) => {
      if (finished) {
        runOnJS(setIsOpen)(false);
      }
    });
  }, [progress]);

  const handleOpen = useCallback(() => {
    feedback.tap();
    setIsOpen(true);
    progress.value = withSpring(1, {
      damping: 15,
      stiffness: 180,
      mass: 0.8,
    });
  }, [progress]);

  const handleToggle = useCallback(() => {
    if (isOpen) {
      handleClose();
    } else {
      handleOpen();
    }
  }, [isOpen, handleClose, handleOpen]);

  const handleAction = useCallback(
    (callback: () => void) => {
      feedback.tap();
      progress.value = withTiming(0, { duration: 180, easing: Easing.out(Easing.quad) }, (finished) => {
        if (finished) {
          runOnJS(setIsOpen)(false);
        }
      });
      callback();
    },
    [progress]
  );

  // ── Backdrop Animation ───────────────────────────────────────────────────
  const backdropAnimatedStyle = useAnimatedStyle(() => {
    const opacity = interpolate(progress.value, [0, 1], [0, 1], Extrapolation.CLAMP);
    return {
      opacity,
    };
  });

  // ── Main FAB Morph Animation ─────────────────────────────────────────────
  const fabBgAnimatedStyle = useAnimatedStyle(() => {
    const backgroundColor = interpolateColor(
      progress.value,
      [0, 1],
      [colors.accentPrimary, isDark ? '#2C2C2E' : '#E5E5EA']
    );
    return { backgroundColor };
  });

  const fabRotationAnimatedStyle = useAnimatedStyle(() => {
    // 0deg ('+') to 45deg ('×')
    const rotate = interpolate(progress.value, [0, 1], [0, 45]);
    const scale = interpolate(progress.value, [0, 0.5, 1], [1, 0.88, 1]);
    return {
      transform: [
        { scale },
        { rotate: `${rotate}deg` },
      ],
    };
  });

  const plusIconAnimatedStyle = useAnimatedStyle(() => {
    const opacity = interpolate(progress.value, [0, 0.4], [1, 0], Extrapolation.CLAMP);
    return { opacity };
  });

  const closeIconAnimatedStyle = useAnimatedStyle(() => {
    const opacity = interpolate(progress.value, [0.4, 1], [0, 1], Extrapolation.CLAMP);
    return { opacity };
  });

  // ── Action Items Animations (Staggered Bloom) ────────────────────────────
  // Index 0: New folder (bottom)
  const itemFolderAnimatedStyle = useAnimatedStyle(() => {
    const p = interpolate(progress.value, [0, 0.75], [0, 1], Extrapolation.CLAMP);
    const translateY = interpolate(p, [0, 1], [20, 0]);
    const scale = interpolate(p, [0, 1], [0.3, 1]);
    const opacity = interpolate(p, [0, 0.3, 1], [0, 0.7, 1]);
    return {
      opacity,
      transform: [{ translateY }, { scale }],
    };
  });

  // Index 1: New note (middle)
  const itemNoteAnimatedStyle = useAnimatedStyle(() => {
    const p = interpolate(progress.value, [0.1, 0.88], [0, 1], Extrapolation.CLAMP);
    const translateY = interpolate(p, [0, 1], [34, 0]);
    const scale = interpolate(p, [0, 1], [0.3, 1]);
    const opacity = interpolate(p, [0, 0.3, 1], [0, 0.7, 1]);
    return {
      opacity,
      transform: [{ translateY }, { scale }],
    };
  });

  // Index 2: Upload file (top)
  const itemUploadAnimatedStyle = useAnimatedStyle(() => {
    const p = interpolate(progress.value, [0.2, 1], [0, 1], Extrapolation.CLAMP);
    const translateY = interpolate(p, [0, 1], [48, 0]);
    const scale = interpolate(p, [0, 1], [0.3, 1]);
    const opacity = interpolate(p, [0, 0.3, 1], [0, 0.7, 1]);
    return {
      opacity,
      transform: [{ translateY }, { scale }],
    };
  });

  if (!visible) return null;

  return (
    <>
      {/* ── Dimmed Full-Screen Backdrop ── */}
      <Animated.View
        pointerEvents={isOpen ? 'auto' : 'none'}
        style={[styles.backdrop, backdropAnimatedStyle]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
      </Animated.View>

      {/* ── Speed Dial Actions & Persistent Main FAB ── */}
      <View
        style={[
          styles.speedDialWrapper,
          { bottom: bottomOffset, right: 16 },
        ]}
        pointerEvents="box-none"
      >
        {/* Actions Stack (Rendered when open) */}
        {isOpen && (
          <View style={styles.actionsStack} pointerEvents="box-none">
            {/* 1. Upload File (Top) */}
            <Animated.View style={[styles.actionRow, itemUploadAnimatedStyle]}>
              <TouchableOpacity
                activeOpacity={0.7}
                style={[
                  styles.labelPill,
                  {
                    backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF',
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)',
                  },
                ]}
                onPress={() => handleAction(onUploadFile)}
              >
                <Text style={[styles.labelText, { color: colors.textPrimary }]}>
                  Upload file
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.75}
                style={[
                  styles.actionCircle,
                  {
                    backgroundColor: isDark ? 'rgba(165, 153, 255, 0.18)' : 'rgba(108, 92, 231, 0.12)',
                    borderColor: isDark ? 'rgba(165, 153, 255, 0.35)' : 'rgba(108, 92, 231, 0.25)',
                  },
                ]}
                onPress={() => handleAction(onUploadFile)}
              >
                <Ionicons name="cloud-upload" size={19} color={colors.accentPrimary} />
              </TouchableOpacity>
            </Animated.View>

            {/* 2. New Note (Middle) */}
            <Animated.View style={[styles.actionRow, itemNoteAnimatedStyle]}>
              <TouchableOpacity
                activeOpacity={0.7}
                style={[
                  styles.labelPill,
                  {
                    backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF',
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)',
                  },
                ]}
                onPress={() => handleAction(onNewNote)}
              >
                <Text style={[styles.labelText, { color: colors.textPrimary }]}>
                  New note
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.75}
                style={[
                  styles.actionCircle,
                  {
                    backgroundColor: isDark ? 'rgba(165, 153, 255, 0.18)' : 'rgba(108, 92, 231, 0.12)',
                    borderColor: isDark ? 'rgba(165, 153, 255, 0.35)' : 'rgba(108, 92, 231, 0.25)',
                  },
                ]}
                onPress={() => handleAction(onNewNote)}
              >
                <Ionicons name="document-text" size={19} color={colors.accentPrimary} />
              </TouchableOpacity>
            </Animated.View>

            {/* 3. New Folder (Bottom) */}
            <Animated.View style={[styles.actionRow, itemFolderAnimatedStyle]}>
              <TouchableOpacity
                activeOpacity={0.7}
                style={[
                  styles.labelPill,
                  {
                    backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF',
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)',
                  },
                ]}
                onPress={() => handleAction(onNewFolder)}
              >
                <Text style={[styles.labelText, { color: colors.textPrimary }]}>
                  New folder
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.75}
                style={[
                  styles.actionCircle,
                  {
                    backgroundColor: isDark ? 'rgba(10, 132, 255, 0.18)' : 'rgba(2, 132, 199, 0.12)',
                    borderColor: isDark ? 'rgba(10, 132, 255, 0.35)' : 'rgba(2, 132, 199, 0.25)',
                  },
                ]}
                onPress={() => handleAction(onNewFolder)}
              >
                <Ionicons name="folder" size={19} color={isDark ? '#0A84FF' : '#0284C7'} />
              </TouchableOpacity>
            </Animated.View>
          </View>
        )}

        {/* ── Persistent Morphing Main FAB ── */}
        <Animated.View style={[styles.fabShadowWrap, fabBgAnimatedStyle]}>
          <TouchableOpacity
            activeOpacity={0.85}
            style={styles.fabTouchable}
            onPress={handleToggle}
          >
            <Animated.View style={[styles.fabIconContainer, fabRotationAnimatedStyle]}>
              {/* Closed State Icon: '+' in dark (light mode: white) */}
              <Animated.View style={[styles.iconAbsoluteCenter, plusIconAnimatedStyle]}>
                <Ionicons
                  name="add"
                  size={28}
                  color={isDark ? '#000000' : '#FFFFFF'}
                />
              </Animated.View>

              {/* Open State Icon: '+' rotated to '×' in white (light mode: dark) */}
              <Animated.View style={[styles.iconAbsoluteCenter, closeIconAnimatedStyle]}>
                <Ionicons
                  name="add"
                  size={28}
                  color={isDark ? '#FFFFFF' : '#1C1C1E'}
                />
              </Animated.View>
            </Animated.View>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: -120,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.52)',
    zIndex: 60,
  },
  speedDialWrapper: {
    position: 'absolute',
    alignItems: 'flex-end',
    zIndex: 70,
  },
  actionsStack: {
    alignItems: 'flex-end',
    gap: 13,
    marginBottom: 14,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  labelPill: {
    paddingHorizontal: 14,
    paddingVertical: 7.5,
    borderRadius: 10,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  labelText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 13.5,
    letterSpacing: -0.1,
  },
  actionCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    marginRight: 4, // Aligns center of 44px circle with 52px main FAB
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  fabShadowWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.32,
    shadowRadius: 9,
    elevation: 7,
  },
  fabTouchable: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabIconContainer: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconAbsoluteCenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
