import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, Animated, PanResponder, InteractionManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Svg, Circle } from 'react-native-svg';
import { hapticLight, hapticMedium } from '../../utils/haptics';
import { useTheme } from "../../contexts/ThemeContext";

// Extracted Styles
import { makeAnimatedRestTimerStyles } from './animatedRestTimerStyles';

import { playCountdownTick, playTimerFinishChime } from '../../services/gymSoundSynthesizer';

interface AnimatedRestTimerProps {
  startTime: number;
  durationSecs: number;
  onAdd: () => void;
  onSubtract: () => void;
  onSkip: () => void;
}

export const AnimatedRestTimer: React.FC<AnimatedRestTimerProps> = React.memo(function AnimatedRestTimer({
  startTime,
  durationSecs,
  onAdd,
  onSubtract,
  onSkip,
}: AnimatedRestTimerProps) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeAnimatedRestTimerStyles(colors, isDark), [colors, isDark]);
  const [isExpanded, setIsExpanded] = useState(false);
  const lastBeepSecRef = useRef<number | null>(null);

  // Gentle breathing pulse animation for the floating rest pill
  const breatheAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breatheAnim, {
          toValue: 1.04,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(breatheAnim, {
          toValue: 1.0,
          duration: 900,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [breatheAnim]);

  // Draggable position state (PanResponder)
  const pan = useRef(new Animated.ValueXY()).current;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) =>
        Math.abs(gestureState.dx) > 6 || Math.abs(gestureState.dy) > 6,
      onPanResponderGrant: () => {
        pan.setOffset({
          x: (pan.x as any)._value || 0,
          y: (pan.y as any)._value || 0,
        });
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event(
        [null, { dx: pan.x, dy: pan.y }],
        { useNativeDriver: false }
      ),
      onPanResponderRelease: () => {
        pan.flattenOffset();
        // Always snap cleanly back to the docked baseline right above the nav bar so it sticks there
        Animated.spring(pan, {
          toValue: { x: 0, y: 0 },
          useNativeDriver: false,
          bounciness: 4,
        }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(pan, {
          toValue: { x: 0, y: 0 },
          useNativeDriver: false,
          bounciness: 4,
        }).start();
      },
    })
  ).current;

  const [remSecs, setRemSecs] = useState(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    return Math.max(0, durationSecs - elapsed);
  });

  useEffect(() => {
    // Reset position to default dock location whenever a new timer starts
    pan.setValue({ x: 0, y: 0 });
    pan.setOffset({ x: 0, y: 0 });
    lastBeepSecRef.current = null;
  }, [startTime]);

  useEffect(() => {
    let skipped = false;
    const updateTimer = () => {
      if (skipped) return;
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const rem = Math.max(0, durationSecs - elapsed);
      setRemSecs(rem);

      // Synthesizer Audio Cues: 3... 2... 1... Tick
      if (rem > 0 && rem <= 3 && lastBeepSecRef.current !== rem) {
        lastBeepSecRef.current = rem;
        playCountdownTick();
      }

      if (rem <= 0) {
        skipped = true;
        if (lastBeepSecRef.current !== 0) {
          lastBeepSecRef.current = 0;
          playTimerFinishChime();
        }
        setTimeout(() => {
          InteractionManager.runAfterInteractions(() => {
            onSkip();
          });
        }, 100);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 500);
    return () => clearInterval(interval);
  }, [startTime, durationSecs]);

  const m = Math.floor(remSecs / 60);
  const s = remSecs % 60;
  const timeDisplay = `${m}:${s.toString().padStart(2, '0')}`;

  const toggleExpand = () => {
    hapticLight();
    setIsExpanded(prev => !prev);
  };

  const progress = durationSecs > 0 ? Math.max(0, Math.min(1, remSecs / durationSecs)) : 0;
  const circumference = 53.4; // 2 * Math.PI * 8.5
  const strokeDashoffset = circumference * (1 - progress);

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={[
        styles.wrapper,
        {
          transform: [
            { translateX: pan.x },
            { translateY: pan.y },
          ],
        },
      ]}
    >
      {!isExpanded ? (
        <Animated.View style={{ transform: [{ scale: breatheAnim }] }}>
          <TouchableOpacity
            onPress={toggleExpand}
            activeOpacity={0.85}
            style={styles.collapsedBadge}
          >
            {/* Circular SVG Progress Ring */}
            <View style={{ width: 22, height: 22, alignItems: 'center', justifyContent: 'center', marginRight: 4 }}>
              <Svg width={22} height={22} style={{ transform: [{ rotate: '-90deg' }] }}>
                <Circle
                  cx={11}
                  cy={11}
                  r={8.5}
                  stroke={isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)'}
                  strokeWidth={2.4}
                  fill="none"
                />
                <Circle
                  cx={11}
                  cy={11}
                  r={8.5}
                  stroke={colors.accentPrimary || '#a599ff'}
                  strokeWidth={2.4}
                  strokeDasharray={`${circumference} ${circumference}`}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  fill="none"
                />
              </Svg>
              <View style={{ position: 'absolute' }}>
                <Ionicons name="timer-outline" size={10} color={colors.accentPrimary || '#a599ff'} />
              </View>
            </View>

            <Text style={styles.collapsedTimeText}>{timeDisplay}</Text>

            {/* Quick +30s Bump Pill */}
            <TouchableOpacity
              onPress={() => {
                hapticLight();
                onAdd();
              }}
              style={styles.quickAddPill}
              hitSlop={{ top: 6, bottom: 6, left: 4, right: 6 }}
            >
              <Text style={styles.quickAddText}>+30s</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </Animated.View>
      ) : (
        <View style={styles.expandedCapsule}>
          <View style={styles.dragGrip}>
            <Ionicons name="reorder-two-outline" size={16} color={colors.textTertiary} />
          </View>

          <TouchableOpacity
            onPress={() => {
              hapticLight();
              onSubtract();
            }}
            style={styles.actionBtn}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="remove-circle-outline" size={18} color={colors.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={toggleExpand}
            style={styles.timeContainer}
            activeOpacity={0.8}
          >
            <Text style={styles.timeText}>{timeDisplay}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => {
              hapticLight();
              onAdd();
            }}
            style={styles.actionBtn}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="add-circle-outline" size={18} color={colors.accentPrimary} />
          </TouchableOpacity>

          <View style={styles.divider} />

          <TouchableOpacity
            onPress={() => {
              hapticMedium();
              onSkip();
            }}
            style={styles.skipBtn}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        </View>
      )}
    </Animated.View>
  );
});

export default AnimatedRestTimer;
