import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  PanResponder,
  InteractionManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { hapticLight, hapticMedium } from '../../utils/haptics';
import { useTheme } from "../../contexts/ThemeContext";
import { FONT_FAMILY } from '../../theme/tokens';

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
  const { colors } = useTheme();
  const [isExpanded, setIsExpanded] = useState(false);

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
      },
    })
  ).current;

  const [remSecs, setRemSecs] = useState(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    return Math.max(0, durationSecs - elapsed);
  });

  useEffect(() => {
    let skipped = false;
    const updateTimer = () => {
      if (skipped) return;
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      const rem = Math.max(0, durationSecs - elapsed);
      setRemSecs(rem);

      if (rem <= 0) {
        skipped = true;
        // Defer the skip to prevent layout crashes if the timer finishes exactly
        // as the app is waking up from the background and re-rendering.
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
        /* Collapsed State: Sleek circular/pill badge showing ⏱ 2:52 */
        <TouchableOpacity
          onPress={toggleExpand}
          activeOpacity={0.8}
          style={styles.collapsedBadge}
        >
          <Ionicons name="timer-outline" size={15} color="#a599ff" style={{ marginRight: 5 }} />
          <Text style={styles.collapsedTimeText}>{timeDisplay}</Text>
        </TouchableOpacity>
      ) : (
        /* Expanded State: Horizontal control capsule = - ⏱ 2:52 + | Skip */
        <View style={styles.expandedCapsule}>
          {/* Drag handle / collapse icon */}
          <TouchableOpacity onPress={toggleExpand} style={styles.dragGrip} activeOpacity={0.7}>
            <Ionicons name="reorder-two" size={16} color="rgba(255,255,255,0.35)" />
          </TouchableOpacity>

          {/* Minus 30s */}
          <TouchableOpacity
            onPress={() => {
              hapticLight();
              onSubtract();
            }}
            style={styles.actionBtn}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="remove-circle-outline" size={18} color="#8e8e93" />
          </TouchableOpacity>

          {/* Timer Display button (tap to collapse) */}
          <TouchableOpacity
            onPress={toggleExpand}
            style={styles.timeContainer}
            activeOpacity={0.8}
          >
            <Ionicons name="timer-outline" size={13} color="#a599ff" style={{ marginRight: 4 }} />
            <Text style={styles.timeText}>{timeDisplay}</Text>
          </TouchableOpacity>

          {/* Plus 30s */}
          <TouchableOpacity
            onPress={() => {
              hapticLight();
              onAdd();
            }}
            style={styles.actionBtn}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="add-circle-outline" size={18} color="#a599ff" />
          </TouchableOpacity>

          <View style={styles.divider} />

          {/* Skip button */}
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

const styles = StyleSheet.create({
  wrapper: {
    zIndex: 9999,
    alignSelf: 'center',
  },
  collapsedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#141416',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(165,153,255,0.35)',
    paddingHorizontal: 13,
    paddingVertical: 7,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 10,
  },
  collapsedTimeText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 14,
    color: '#a599ff',
    letterSpacing: 0.5,
  },
  expandedCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#141416',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(165,153,255,0.3)',
    paddingHorizontal: 10,
    paddingVertical: 7,
    gap: 6,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 12,
  },
  dragGrip: {
    paddingRight: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionBtn: {
    padding: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  timeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(165,153,255,0.1)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(165,153,255,0.2)',
  },
  timeText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 14,
    color: '#a599ff',
    letterSpacing: 0.5,
  },
  divider: {
    width: 1,
    height: 16,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginHorizontal: 2,
  },
  skipBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  skipText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 11,
    color: '#8e8e93',
  },
});
