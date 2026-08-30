import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, Animated, PanResponder, InteractionManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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

export default function AnimatedRestTimer({
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

  // Draggable position state (PanResponder)
  const pan = useRef(new Animated.ValueXY()).current;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) =>
        Math.abs(gestureState.dx) > 3 || Math.abs(gestureState.dy) > 3,
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
        // Guarantee timer never settles below the safe docked baseline
        if ((pan.y as any)._value > 0) {
          Animated.spring(pan.y, {
            toValue: 0,
            useNativeDriver: false,
            bounciness: 6,
          }).start();
        }
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
        <TouchableOpacity
          onPress={toggleExpand}
          activeOpacity={0.8}
          style={styles.collapsedBadge}
        >
          <Ionicons name="timer-outline" size={15} color={colors.accentPrimary} style={{ marginRight: 5 }} />
          <Text style={styles.collapsedTimeText}>{timeDisplay}</Text>
        </TouchableOpacity>
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
}
