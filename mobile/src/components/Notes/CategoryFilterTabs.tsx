/**
 * CategoryFilterTabs.tsx — ZenTrack Mobile
 *
 * WhatsApp-Grade Magnetic Category Filter Strip with dynamic elastic count badges.
 * Provides smooth spring feedback on tap and elastic pop on active category count.
 * Supports compact mode inside folders for an ultra-clean, Apple-grade interface.
 */

import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  LinearTransition,
} from 'react-native-reanimated';
import { FONT_FAMILY, SPACE, RADIUS } from '../../theme/tokens';
import { feedback } from '../../utils/haptics';

export const FILTER_CATEGORIES = ['All', 'Documents', 'Images', 'Notes'] as const;
export type FilterCategory = typeof FILTER_CATEGORIES[number];

interface CategoryFilterTabsProps {
  categories?: readonly FilterCategory[];
  activeCategory: FilterCategory;
  categoryCounts: Record<FilterCategory, number>;
  onSelectCategory: (category: FilterCategory) => void;
  colors: any;
  isDark: boolean;
  compact?: boolean;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function FilterTabPill({
  category,
  count,
  isActive,
  onPress,
  colors,
  isDark,
  compact = false,
}: {
  category: FilterCategory;
  count: number;
  isActive: boolean;
  onPress: () => void;
  colors: any;
  isDark: boolean;
  compact?: boolean;
}) {
  const scale = useSharedValue(1);

  const animatedPillStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = useCallback(() => {
    scale.value = withTiming(0.96, { duration: 70 });
  }, [scale]);

  const handlePressOut = useCallback(() => {
    scale.value = withTiming(1.0, { duration: 120 });
  }, [scale]);

  return (
    <Animated.View layout={LinearTransition.duration(180)}>
      <AnimatedPressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={() => {
          feedback.tap();
          onPress();
        }}
        style={[
          styles.pillContainer,
          compact && styles.pillContainerCompact,
          {
            backgroundColor: isActive
              ? colors.accentPrimary
              : (isDark ? (colors.surface2 || '#1C1C1E') : '#FFFFFF'),
            borderColor: isActive ? colors.accentPrimary : colors.border,
          },
          animatedPillStyle,
        ]}
      >
        <Text
          style={[
            styles.pillText,
            compact && styles.pillTextCompact,
            {
              color: isActive
                ? (isDark ? '#000000' : '#FFFFFF')
                : colors.textSecondary,
              fontFamily: isActive ? FONT_FAMILY.bold : FONT_FAMILY.body,
            },
          ]}
        >
          {category}
        </Text>

        <View
          style={[
            styles.countBadge,
            compact && styles.countBadgeCompact,
            {
              backgroundColor: isActive
                ? (isDark ? 'rgba(0,0,0,0.22)' : 'rgba(255,255,255,0.30)')
                : (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'),
            },
          ]}
        >
          <Text
            style={[
              styles.countText,
              compact && styles.countTextCompact,
              {
                color: isActive
                  ? (isDark ? '#000000' : '#FFFFFF')
                  : colors.textMuted,
              },
            ]}
          >
            {count}
          </Text>
        </View>
      </AnimatedPressable>
    </Animated.View>
  );
}

export default React.memo(function CategoryFilterTabs({
  categories = FILTER_CATEGORIES,
  activeCategory,
  categoryCounts,
  onSelectCategory,
  colors,
  isDark,
  compact = false,
}: CategoryFilterTabsProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.scrollContent, compact && styles.scrollContentCompact]}
    >
      {categories.map((cat) => (
        <FilterTabPill
          key={cat}
          category={cat}
          count={categoryCounts[cat] ?? 0}
          isActive={activeCategory === cat}
          onPress={() => onSelectCategory(cat)}
          colors={colors}
          isDark={isDark}
          compact={compact}
        />
      ))}
    </ScrollView>
  );
});

const styles = StyleSheet.create({
  scrollContent: {
    gap: SPACE.sm,
  },
  scrollContentCompact: {
    gap: 6,
  },
  pillContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    gap: 6,
  },
  pillContainerCompact: {
    paddingHorizontal: 10,
    paddingVertical: 4.5,
    gap: 5,
  },
  pillText: {
    fontSize: 13,
  },
  pillTextCompact: {
    fontSize: 11.5,
  },
  countBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: RADIUS.full,
    minWidth: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadgeCompact: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    minWidth: 15,
  },
  countText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 11,
  },
  countTextCompact: {
    fontSize: 10,
  },
});
