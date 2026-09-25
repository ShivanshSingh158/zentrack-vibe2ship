/**
 * BatchActionBar.tsx — ZenTrack Mobile
 *
 * Floating bottom action bar for multi-item selection in the Cloud Vault.
 * Provides Select All, Move (N), Delete (N), and Dismiss controls.
 */

import React, { useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  SlideInDown,
  SlideOutDown,
  useSharedValue,
  useAnimatedStyle,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS, SHADOW } from '../../theme/tokens';
import { feedback } from '../../utils/haptics';

interface BatchActionBarProps {
  visible: boolean;
  selectedCount: number;
  totalCount: number;
  onToggleSelectAll: () => void;
  onBatchMove: () => void;
  onNewFolderWithSelection?: () => void;
  onBatchDelete: () => void;
  onCancel: () => void;
  colors: any;
  isDark: boolean;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function SpringScaleButton({
  onPress,
  disabled,
  children,
  style,
  hitSlop,
}: {
  onPress: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  style?: any;
  hitSlop?: any;
}) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = useCallback(() => {
    if (disabled) return;
    scale.value = withTiming(0.94, { duration: 70 });
  }, [disabled, scale]);

  const handlePressOut = useCallback(() => {
    if (disabled) return;
    scale.value = withTiming(1.0, { duration: 120 });
  }, [disabled, scale]);

  return (
    <AnimatedPressable
      disabled={disabled}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={onPress}
      style={[style, animatedStyle]}
      hitSlop={hitSlop}
    >
      {children}
    </AnimatedPressable>
  );
}

export const BatchActionBar = React.memo(function BatchActionBar({
  visible,
  selectedCount,
  totalCount,
  onToggleSelectAll,
  onBatchMove,
  onNewFolderWithSelection,
  onBatchDelete,
  onCancel,
  colors,
  isDark,
}: BatchActionBarProps) {
  const insets = useSafeAreaInsets();
  const badgeScale = useSharedValue(1);

  useEffect(() => {
    if (selectedCount > 0) {
      badgeScale.value = withSequence(
        withTiming(1.10, { duration: 80 }),
        withTiming(1.0, { duration: 100 })
      );
    }
  }, [selectedCount, badgeScale]);

  const animatedBadgeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: badgeScale.value }],
  }));

  if (!visible) return null;

  const bottomOffset = Math.max(insets.bottom, 12) + 74;
  const isAllSelected = totalCount > 0 && selectedCount === totalCount;

  return (
    <Animated.View
      entering={SlideInDown.duration(200)}
      exiting={SlideOutDown.duration(160)}
      style={[
        styles.barContainer,
        {
          bottom: bottomOffset,
          backgroundColor: isDark ? '#141416' : '#FFFFFF',
          borderColor: colors.border,
        },
      ]}
    >
      {/* Selection count badge & Select All */}
      <View style={styles.leftSection}>
        <Animated.View style={[styles.countBadge, { backgroundColor: colors.accentPrimary }, animatedBadgeStyle]}>
          <Text style={[styles.countText, { color: isDark ? '#000000' : '#FFFFFF' }]}>
            {selectedCount}
          </Text>
        </Animated.View>
        <SpringScaleButton
          style={styles.actionBtn}
          onPress={() => {
            feedback.tap();
            onToggleSelectAll();
          }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={[styles.actionBtnText, { color: colors.accentPrimary }]}>
            {isAllSelected ? 'Deselect All' : 'Select All'}
          </Text>
        </SpringScaleButton>
      </View>

      {/* Action Buttons */}
      <View style={styles.rightSection}>
        {/* New Folder with Selection */}
        {onNewFolderWithSelection && (
          <SpringScaleButton
            disabled={selectedCount === 0}
            style={[
              styles.iconBtn,
              {
                backgroundColor: isDark ? '#1C1C1E' : '#F0EFF7',
                opacity: selectedCount === 0 ? 0.4 : 1,
              },
            ]}
            onPress={() => {
              feedback.tap();
              onNewFolderWithSelection();
            }}
          >
            <View style={styles.newFolderIconWrap}>
              <Ionicons name="folder-outline" size={17} color={isDark ? '#A78BFA' : '#7C3AED'} />
              <View
                style={[
                  styles.plusBadge,
                  { backgroundColor: isDark ? '#A78BFA' : '#7C3AED' },
                ]}
              >
                <Ionicons name="add" size={8} color={isDark ? '#000000' : '#FFFFFF'} />
              </View>
            </View>
          </SpringScaleButton>
        )}

        {/* Move */}
        <SpringScaleButton
          disabled={selectedCount === 0}
          style={[
            styles.iconBtn,
            {
              backgroundColor: isDark ? '#1C1C1E' : '#F0EFF7',
              opacity: selectedCount === 0 ? 0.4 : 1,
            },
          ]}
          onPress={() => {
            feedback.tap();
            onBatchMove();
          }}
        >
          <Ionicons name="move" size={18} color={isDark ? '#0A84FF' : '#0284C7'} />
        </SpringScaleButton>

        {/* Delete */}
        <SpringScaleButton
          disabled={selectedCount === 0}
          style={[
            styles.iconBtn,
            {
              backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : 'rgba(220, 38, 38, 0.10)',
              opacity: selectedCount === 0 ? 0.4 : 1,
            },
          ]}
          onPress={() => {
            feedback.tap();
            onBatchDelete();
          }}
        >
          <Ionicons name="trash" size={18} color={isDark ? '#ef4444' : '#DC2626'} />
        </SpringScaleButton>

        {/* Exit / Done */}
        <SpringScaleButton
          style={[styles.doneBtn, { backgroundColor: isDark ? '#27272A' : '#E2E1EA' }]}
          onPress={() => {
            feedback.tap();
            onCancel();
          }}
        >
          <Ionicons name="close" size={18} color={colors.textPrimary} />
        </SpringScaleButton>
      </View>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  barContainer: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: SPACE.md,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    ...SHADOW.lg,
    zIndex: 150,
    elevation: 20,
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
  },
  countBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: RADIUS.full,
  },
  countText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 12,
  },
  actionBtn: {
    paddingVertical: 4,
  },
  actionBtnText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 13,
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newFolderIconWrap: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  plusBadge: {
    position: 'absolute',
    bottom: -2,
    right: -4,
    borderRadius: 5,
    width: 10,
    height: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default BatchActionBar;
