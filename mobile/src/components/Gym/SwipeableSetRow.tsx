import React, { useRef, useMemo, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, TextInput, Animated, PanResponder, Keyboard } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GymSet } from '../../types/gym.types';
import { hapticLight } from '../../utils/haptics';

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
  onTextChange?: (field: 'weight' | 'reps', text: string) => void;
  onBlur?: () => void;
  onToggleComplete?: () => void;
  onLongPress?: () => void;
  onSwipeComplete?: () => void;
  // Stable unified set action dispatcher - allows passing a single stable function
  // from parent without inline arrow closures, enabling React.memo bailouts.
  onAction?: (idx: number, action: 'textChange' | 'blur' | 'toggle' | 'delete' | 'swipe', payload?: any) => void;
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
  onAction,
}) => {
  const translateX = useRef(new Animated.Value(0)).current;
  const isTriggeringRef = useRef(false);

  useEffect(() => {
    if (isCompleted) {
      translateX.setValue(0);
      isTriggeringRef.current = false;
    }
  }, [isCompleted]);

  // Unified callback delegator
  const handleTextChangeInternal = useCallback((field: 'weight' | 'reps', text: string) => {
    if (onAction) {
      onAction(idx, 'textChange', { field, text });
    } else if (onTextChange) {
      onTextChange(field, text);
    }
  }, [idx, onAction, onTextChange]);

  const handleBlurInternal = useCallback(() => {
    if (onAction) {
      onAction(idx, 'blur');
    } else if (onBlur) {
      onBlur();
    }
  }, [idx, onAction, onBlur]);

  const handleToggleCompleteInternal = useCallback(() => {
    if (onAction) {
      onAction(idx, 'toggle');
    } else if (onToggleComplete) {
      onToggleComplete();
    }
  }, [idx, onAction, onToggleComplete]);

  const handleLongPressInternal = useCallback(() => {
    if (onAction) {
      onAction(idx, 'delete');
    } else if (onLongPress) {
      onLongPress();
    }
  }, [idx, onAction, onLongPress]);

  const handleSwipeCompleteInternal = useCallback(() => {
    if (onAction) {
      onAction(idx, 'swipe');
    } else if (onSwipeComplete) {
      onSwipeComplete();
    }
  }, [idx, onAction, onSwipeComplete]);

  // Stepper Handlers (+/- 2.5kg for Weight up to 1000kg, +/- 1 for Reps up to 50)
  const handleWeightAdjust = useCallback((delta: number) => {
    if (isCompleted) return;
    hapticLight();
    const currentVal = parseFloat(displayWeight) || 0;
    const newVal = Math.min(1000, Math.max(0, Math.round((currentVal + delta) * 10) / 10));
    handleTextChangeInternal('weight', newVal === 0 ? '' : String(newVal));
  }, [isCompleted, displayWeight, handleTextChangeInternal]);

  const handleRepsAdjust = useCallback((delta: number) => {
    if (isCompleted) return;
    hapticLight();
    const currentVal = parseInt(displayReps, 10) || 0;
    const newVal = Math.min(50, Math.max(0, currentVal + delta));
    handleTextChangeInternal('reps', newVal === 0 ? '' : String(newVal));
  }, [isCompleted, displayReps, handleTextChangeInternal]);

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
              handleSwipeCompleteInternal();
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
    [isCompleted, handleSwipeCompleteInternal]
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
          onPress={handleToggleCompleteInternal}
          onLongPress={handleLongPressInternal}
          style={styles.setIndexArea}
        >
          {isCompleted ? (
            <Ionicons
              name="checkmark-circle"
              size={20}
              color={set.isWarmup ? '#ff9f4d' : colors.accentPrimary}
            />
          ) : (
            <Text
              style={[
                styles.setIndexText,
                set.isWarmup && { color: '#ff9f4d', fontWeight: '700', fontSize: 13 },
                isActive && { color: set.isWarmup ? '#ff9f4d' : colors.accentPrimary },
              ]}
            >
              {set.warmupLabel || (set.isWarmup ? `W${set.setNumber}` : set.setNumber)}
            </Text>
          )}
        </TouchableOpacity>

        {/* Weight Stepper: [- 25 +] (+/- 2.5 kg) */}
        <View style={[styles.stepperContainer, isCompleted && { opacity: 0.7 }]}>
          <TouchableOpacity
            style={styles.stepperBtn}
            onPress={() => handleWeightAdjust(-2.5)}
            disabled={isCompleted}
            hitSlop={6}
          >
            <Ionicons name="remove" size={17} color={isCompleted ? colors.textMuted : colors.textSecondary} />
          </TouchableOpacity>

          <View style={styles.stepperInputWrapper}>
            {displayWeight === '' && (
              <View style={styles.fakePlaceholder} pointerEvents="none">
                <Text style={styles.fakePlaceholderText}>kg</Text>
              </View>
            )}
            <TextInput
              style={[styles.stepperTextInput, isCompleted && { color: colors.textPrimary }]}
              value={displayWeight}
              keyboardType="decimal-pad"
              editable={!isCompleted}
              onChangeText={(text) => handleTextChangeInternal('weight', text)}
              onBlur={handleBlurInternal}
              selectTextOnFocus
            />
          </View>

          <TouchableOpacity
            style={styles.stepperBtn}
            onPress={() => handleWeightAdjust(2.5)}
            disabled={isCompleted}
            hitSlop={6}
          >
            <Ionicons name="add" size={17} color={isCompleted ? colors.textMuted : colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Reps Stepper: [- 8 +] (+/- 1 rep) */}
        <View style={[styles.stepperContainer, isCompleted && { opacity: 0.7 }]}>
          <TouchableOpacity
            style={styles.stepperBtn}
            onPress={() => handleRepsAdjust(-1)}
            disabled={isCompleted}
            hitSlop={6}
          >
            <Ionicons name="remove" size={17} color={isCompleted ? colors.textMuted : colors.textSecondary} />
          </TouchableOpacity>

          <View style={styles.stepperInputWrapper}>
            {displayReps === '' && (
              <View style={styles.fakePlaceholder} pointerEvents="none">
                <Text style={styles.fakePlaceholderText}>reps</Text>
              </View>
            )}
            <TextInput
              style={[styles.stepperTextInput, isCompleted && { color: colors.textPrimary }]}
              value={displayReps}
              keyboardType="number-pad"
              editable={!isCompleted}
              onChangeText={(text) => handleTextChangeInternal('reps', text)}
              onBlur={handleBlurInternal}
              selectTextOnFocus
            />
          </View>

          <TouchableOpacity
            style={styles.stepperBtn}
            onPress={() => handleRepsAdjust(1)}
            disabled={isCompleted}
            hitSlop={6}
          >
            <Ionicons name="add" size={17} color={isCompleted ? colors.textMuted : colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Right Action / Subtle Swipe Hint */}
        <View style={{ width: 22, alignItems: 'center', justifyContent: 'center' }}>
          {!isCompleted ? (
            <Ionicons name="chevron-forward" size={14} color={isActive ? colors.accentPrimary : colors.textMuted} style={{ opacity: 0.4 }} />
          ) : (
            <Ionicons name="lock-closed-outline" size={12} color={colors.textMuted} style={{ opacity: 0.35 }} />
          )}
        </View>
      </Animated.View>
    </View>
  );
}, (prev, next) =>
  prev.set === next.set &&
  prev.idx === next.idx &&
  prev.isActive === next.isActive &&
  prev.isCompleted === next.isCompleted &&
  prev.displayWeight === next.displayWeight &&
  prev.displayReps === next.displayReps &&
  prev.isDark === next.isDark &&
  prev.colors === next.colors &&
  prev.styles === next.styles &&
  prev.onAction === next.onAction &&
  prev.onTextChange === next.onTextChange &&
  prev.onBlur === next.onBlur &&
  prev.onToggleComplete === next.onToggleComplete &&
  prev.onLongPress === next.onLongPress &&
  prev.onSwipeComplete === next.onSwipeComplete
);

export default SwipeableSetRow;
