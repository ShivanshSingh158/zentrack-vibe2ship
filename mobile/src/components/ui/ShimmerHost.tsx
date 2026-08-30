/**
 * ShimmerHost.tsx — ZenTrack Mobile
 *
 * High-performance, worklet-driven Skeleton & Shimmer system:
 * - Runs 100% on the native GPU UI thread via Reanimated worklets (60/120 FPS).
 * - Synchronizes all child skeleton placeholders to the same 800ms pulsing phase.
 * - Supports Obsidian Cosmos (Dark) & Frost Quartz (Light) adaptive palettes.
 * - Exports: <ShimmerHost>, <SkeletonBox>, <SkeletonCircle>, <SkeletonText>, <SkeletonCard>, <SkeletonPill>.
 */

import React, { createContext, useContext, useEffect, useMemo } from 'react';
import { View, StyleSheet, ViewStyle, DimensionValue } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  SharedValue,
} from 'react-native-reanimated';
import { useTheme } from '../../contexts/ThemeContext';

interface ShimmerContextType {
  shimmerOpacity: SharedValue<number>;
  isDark: boolean;
  baseColor: string;
}

const ShimmerContext = createContext<ShimmerContextType | null>(null);

export interface ShimmerHostProps {
  children: React.ReactNode;
  style?: ViewStyle;
  duration?: number;
}

/**
 * Root container providing synchronized shimmer pulse timing to all nested skeletons.
 */
export function ShimmerHost({ children, style, duration = 850 }: ShimmerHostProps) {
  const { isDark } = useTheme();
  const shimmerOpacity = useSharedValue(isDark ? 0.25 : 0.45);

  useEffect(() => {
    shimmerOpacity.value = withRepeat(
      withTiming(isDark ? 0.65 : 0.85, {
        duration,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      true
    );
  }, [duration, isDark, shimmerOpacity]);

  const baseColor = useMemo(
    () => (isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)'),
    [isDark]
  );

  const contextValue = useMemo(
    () => ({
      shimmerOpacity,
      isDark,
      baseColor,
    }),
    [shimmerOpacity, isDark, baseColor]
  );

  return (
    <ShimmerContext.Provider value={contextValue}>
      <View style={style}>{children}</View>
    </ShimmerContext.Provider>
  );
}

export interface SkeletonBoxProps {
  width?: DimensionValue;
  height?: DimensionValue;
  borderRadius?: number;
  style?: ViewStyle;
}

/**
 * Basic rectangular or rounded skeleton placeholder.
 */
export function SkeletonBox({
  width = '100%',
  height = 20,
  borderRadius = 8,
  style,
}: SkeletonBoxProps) {
  const ctx = useContext(ShimmerContext);
  const localOpacity = useSharedValue(0.25);

  useEffect(() => {
    if (!ctx) {
      localOpacity.value = withRepeat(
        withTiming(0.65, { duration: 850, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      );
    }
  }, [ctx, localOpacity]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: ctx ? ctx.shimmerOpacity.value : localOpacity.value,
  }));

  const backgroundColor = ctx ? ctx.baseColor : 'rgba(255, 255, 255, 0.08)';

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor,
        },
        animStyle,
        style,
      ]}
    />
  );
}

export interface SkeletonCircleProps {
  size: number;
  style?: ViewStyle;
}

/**
 * Circular skeleton placeholder for avatars, badges, and icon buttons.
 */
export function SkeletonCircle({ size, style }: SkeletonCircleProps) {
  return (
    <SkeletonBox
      width={size}
      height={size}
      borderRadius={size / 2}
      style={style}
    />
  );
}

export interface SkeletonTextProps {
  width?: DimensionValue;
  height?: number;
  lines?: number;
  lineGap?: number;
  style?: ViewStyle;
}

/**
 * Multi-line paragraph skeleton placeholder with variable line widths.
 */
export function SkeletonText({
  width = '100%',
  height = 14,
  lines = 1,
  lineGap = 8,
  style,
}: SkeletonTextProps) {
  if (lines <= 1) {
    return <SkeletonBox width={width} height={height} borderRadius={6} style={style} />;
  }

  return (
    <View style={style}>
      {Array.from({ length: lines }).map((_, index) => {
        // Last line slightly shorter for natural typographic appearance
        const lineWidth =
          index === lines - 1 && typeof width === 'string' && width === '100%'
            ? '65%'
            : width;

        return (
          <SkeletonBox
            key={index}
            width={lineWidth}
            height={height}
            borderRadius={6}
            style={index > 0 ? { marginTop: lineGap } : undefined}
          />
        );
      })}
    </View>
  );
}

export interface SkeletonPillProps {
  width?: DimensionValue;
  height?: number;
  style?: ViewStyle;
}

/**
 * Capsule/Pill skeleton placeholder for filter chips, tags, and badges.
 */
export function SkeletonPill({ width = 70, height = 30, style }: SkeletonPillProps) {
  return <SkeletonBox width={width} height={height} borderRadius={height / 2} style={style} />;
}

export interface SkeletonCardProps {
  children?: React.ReactNode;
  height?: DimensionValue;
  borderRadius?: number;
  style?: ViewStyle;
}

/**
 * Glass card container skeleton that mirrors Obsidian Cosmos card containers.
 */
export function SkeletonCard({
  children,
  height,
  borderRadius = 18,
  style,
}: SkeletonCardProps) {
  const { isDark } = useTheme();

  return (
    <View
      style={[
        styles.skeletonCard,
        {
          borderRadius,
          height,
          backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : 'rgba(0, 0, 0, 0.02)',
          borderColor: isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)',
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  skeletonCard: {
    borderWidth: 1,
    padding: 16,
    overflow: 'hidden',
  },
});
