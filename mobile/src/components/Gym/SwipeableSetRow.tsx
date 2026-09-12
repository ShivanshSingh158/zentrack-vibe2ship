import React, { useCallback } from 'react';
import { View, Text, TouchableOpacity, TextInput } from 'react-native';
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
  /** @deprecated Swipe to log has been removed. Use onToggleComplete or bottom log button instead. */
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
  onAction,
}) => {
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

  return (
    <View style={[styles.setRowWrapper, isActive && styles.setRowWrapperActive]}>
      {isActive && <View style={styles.activeIndicator} />}

      <View
        style={[
          styles.setRow,
          isCompleted && styles.setRowCompleted,
          isActive && styles.setRowActive,
        ]}
      >
        {/* Left: Set number / warmup tag (tap to toggle complete, long-press to delete) */}
        <TouchableOpacity
          onPress={handleToggleCompleteInternal}
          onLongPress={handleLongPressInternal}
          style={styles.setIndexArea}
          hitSlop={4}
        >
          <Text
            style={[
              styles.setIndexText,
              set.isWarmup && { color: '#ff9f4d', fontWeight: '700', fontSize: 13 },
              isActive && { color: set.isWarmup ? '#ff9f4d' : colors.accentPrimary },
              isCompleted && { color: colors.textMuted },
            ]}
          >
            {set.warmupLabel || (set.isWarmup ? `W${set.setNumber}` : set.setNumber)}
          </Text>
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

        {/* Right Action: Clean checkmark button to log / toggle complete */}
        <TouchableOpacity
          onPress={handleToggleCompleteInternal}
          style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}
          hitSlop={6}
          activeOpacity={0.7}
        >
          {isCompleted ? (
            <Ionicons
              name="checkmark-circle"
              size={22}
              color={set.isWarmup ? '#ff9f4d' : (colors.accentPrimary || '#34C759')}
            />
          ) : (
            <Ionicons
              name="checkmark-circle-outline"
              size={22}
              color={isActive ? colors.accentPrimary : (isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)')}
            />
          )}
        </TouchableOpacity>
      </View>
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
  prev.onLongPress === next.onLongPress
);

export default SwipeableSetRow;
