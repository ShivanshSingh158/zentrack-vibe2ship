import React, { useRef, useMemo, useEffect } from 'react';
import { View, Text, TouchableOpacity, TextInput, Animated, PanResponder, Keyboard } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GymSet } from '../../types/gym.types';

export interface SwipeableSetRowProps {
  set: GymSet;
  idx: number;
  isActive: boolean;
  isCompleted: boolean;
  displayWeight: string;
  displayReps: string;
  colors: any;
  isDark: boolean;
  styles: any;
  onTextChange: (field: 'weight' | 'reps', text: string) => void;
  onBlur: () => void;
  onToggleComplete: () => void;
  onLongPress: () => void;
  onSwipeComplete: () => void;
}

export const SwipeableSetRow: React.FC<SwipeableSetRowProps> = React.memo(({
  set,
  idx,
  isActive,
  isCompleted,
  displayWeight,
  displayReps,
  colors,
  isDark,
  styles,
  onTextChange,
  onBlur,
  onToggleComplete,
  onLongPress,
  onSwipeComplete,
}) => {
  const translateX = useRef(new Animated.Value(0)).current;
  const isTriggeringRef = useRef(false);

  useEffect(() => {
    if (isCompleted) {
      translateX.setValue(0);
      isTriggeringRef.current = false;
    }
  }, [isCompleted]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) => {
          // Accurate horizontal gesture detection that never interferes with vertical scrolling
          return (
            !isCompleted &&
            !isTriggeringRef.current &&
            gestureState.dx > 8 &&
            Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.3
          );
        },
        onPanResponderGrant: () => {
          Keyboard.dismiss();
        },
        onPanResponderMove: (_, gestureState) => {
          if (gestureState.dx > 0 && !isTriggeringRef.current) {
            // Smooth resistance curve
            const dx = gestureState.dx > 70 ? 70 + (gestureState.dx - 70) * 0.35 : gestureState.dx;
            translateX.setValue(Math.min(dx, 120));
          }
        },
        onPanResponderRelease: (_, gestureState) => {
          if (isTriggeringRef.current) return;

          // Threshold: 45px rightward drag or fast swipe velocity
          if (gestureState.dx > 45 || gestureState.vx > 0.35) {
            isTriggeringRef.current = true;
            Animated.timing(translateX, {
              toValue: 130,
              duration: 110,
              useNativeDriver: true,
            }).start(() => {
              translateX.setValue(0);
              onSwipeComplete();
              setTimeout(() => {
                isTriggeringRef.current = false;
              }, 250);
            });
          } else {
            Animated.spring(translateX, {
              toValue: 0,
              tension: 140,
              friction: 12,
              useNativeDriver: true,
            }).start();
          }
        },
        onPanResponderTerminate: () => {
          if (!isTriggeringRef.current) {
            Animated.spring(translateX, {
              toValue: 0,
              tension: 140,
              friction: 12,
              useNativeDriver: true,
            }).start();
          }
        },
      }),
    [isCompleted, onSwipeComplete]
  );

  const trackOpacity = translateX.interpolate({
    inputRange: [0, 40, 90],
    outputRange: [0.4, 0.85, 1],
    extrapolate: 'clamp',
  });

  const iconScale = translateX.interpolate({
    inputRange: [0, 45, 90],
    outputRange: [0.85, 1.15, 1.25],
    extrapolate: 'clamp',
  });

  return (
    <View style={[styles.setRowWrapper, isActive && styles.setRowWrapperActive]}>
      {/* Background Animated Swipe Track */}
      {!isCompleted && (
        <Animated.View style={[styles.swipeTrack, { opacity: trackOpacity }]}>
          <Animated.View style={[styles.swipeTrackContent, { transform: [{ scale: iconScale }] }]}>
            <Ionicons name="checkmark-circle" size={20} color="#34C759" />
            <Text style={styles.swipeTrackText}>Release to log</Text>
          </Animated.View>
        </Animated.View>
      )}

      {isActive && <View style={styles.activeIndicator} />}

      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.setRow,
          isCompleted && styles.setRowCompleted,
          isActive && styles.setRowActive,
          { transform: [{ translateX }] },
        ]}
      >
        {/* Tap checkmark circle to toggle completed, long-press to delete */}
        <TouchableOpacity
          onPress={onToggleComplete}
          onLongPress={onLongPress}
          style={styles.setIndexArea}
        >
          {isCompleted ? (
            <Ionicons name="checkmark-circle" size={20} color={colors.accentPrimary} />
          ) : (
            <Text style={[styles.setIndexText, isActive && { color: colors.accentPrimary }]}>{set.setNumber}</Text>
          )}
        </TouchableOpacity>

        {/* Controlled inputs with local state - locked when completed */}
        <View style={styles.inputGroup}>
          {displayWeight === '' && (
            <View style={styles.fakePlaceholder} pointerEvents="none">
              <Text style={styles.fakePlaceholderText}>kg</Text>
            </View>
          )}
          <TextInput
            style={[styles.textInput, isCompleted && { opacity: 0.85, color: colors.textPrimary }]}
            value={displayWeight}
            keyboardType="numeric"
            editable={!isCompleted}
            onChangeText={(text) => onTextChange('weight', text)}
            onBlur={onBlur}
          />
        </View>

        <View style={styles.inputGroup}>
          {displayReps === '' && (
            <View style={styles.fakePlaceholder} pointerEvents="none">
              <Text style={styles.fakePlaceholderText}>reps</Text>
            </View>
          )}
          <TextInput
            style={[styles.textInput, isCompleted && { opacity: 0.85, color: colors.textPrimary }]}
            value={displayReps}
            keyboardType="numeric"
            editable={!isCompleted}
            onChangeText={(text) => onTextChange('reps', text)}
            onBlur={onBlur}
          />
        </View>

        {/* Right Action / Subtle Swipe Hint */}
        <View style={{ width: 28, alignItems: 'center', justifyContent: 'center' }}>
          {!isCompleted ? (
            <Ionicons name="chevron-forward" size={14} color={isActive ? colors.accentPrimary : colors.textMuted} style={{ opacity: 0.4 }} />
          ) : (
            <Ionicons name="lock-closed-outline" size={12} color={colors.textMuted} style={{ opacity: 0.35 }} />
          )}
        </View>
      </Animated.View>
    </View>
  );
});

export default SwipeableSetRow;
