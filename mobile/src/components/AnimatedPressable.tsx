import React from 'react';
import { Pressable, PressableProps, StyleProp, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  Easing,
  EntryOrExitLayoutType,
} from 'react-native-reanimated';

// ── Variant system — semantic press depths matching iOS / WhatsApp conventions ──
// default:     row presses, list items, cards           → subtle 0.95
// cta:         FAB, primary action buttons              → pronounced 0.91
// destructive: delete, reset, danger actions            → firm 0.93
// subtle:      secondary buttons, icon-only presses     → barely perceptible 0.97
export type PressableVariant = 'default' | 'cta' | 'destructive' | 'subtle';

const SCALE_MAP: Record<PressableVariant, number> = {
  default:     0.95,
  cta:         0.91,
  destructive: 0.93,
  subtle:      0.97,
};

const OPACITY_MAP: Record<PressableVariant, number> = {
  default:     0.88,
  cta:         0.92,
  destructive: 0.80,
  subtle:      0.75,
};

// Press-in spring config — overshootClamping=true so compress has NO bounce (iOS feel)
const SPRING_IN = {
  damping: 15,
  stiffness: 400,
  mass: 0.4,
  overshootClamping: true,
} as const;

// Press-out spring config — subtle overshoot on release = the "snap back" iOS feel
const SPRING_OUT = {
  damping: 14,
  stiffness: 320,
  mass: 0.5,
} as const;

interface AnimatedPressableProps extends PressableProps {
  style?: StyleProp<ViewStyle>;
  /** Override the target scale directly (takes priority over variant) */
  scaleTo?: number;
  activeOpacity?: number;
  /** @deprecated No longer fires haptics — kept for API compatibility */
  haptic?: 'light' | 'medium' | 'heavy' | 'none';
  variant?: PressableVariant;
  children: React.ReactNode;
  entering?: EntryOrExitLayoutType;
  exiting?: EntryOrExitLayoutType;
}

const AnimatedPressableCore = Animated.createAnimatedComponent(Pressable);

export default function AnimatedPressable({
  style,
  scaleTo,
  activeOpacity,
  haptic,        // accepted but intentionally unused — no haptics per directive
  variant = 'default',
  children,
  entering,
  exiting,
  onPressIn,
  onPressOut,
  onPress,
  ...props
}: AnimatedPressableProps) {
  const scale   = useSharedValue(1);
  const opacity = useSharedValue(1);

  // Resolve final scale and opacity from variant (explicit scaleTo overrides variant)
  const targetScale   = scaleTo   ?? SCALE_MAP[variant];
  const targetOpacity = activeOpacity ?? OPACITY_MAP[variant];

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity:   opacity.value,
  }));

  const handlePressIn = (e: any) => {
    // Spring compression: instant feel, no bounce on the way down (overshootClamping)
    scale.value   = withSpring(targetScale, SPRING_IN);
    opacity.value = withTiming(targetOpacity, { duration: 50, easing: Easing.out(Easing.quad) });
    onPressIn?.(e);
  };

  const handlePressOut = (e: any) => {
    // Spring release: subtle overshoot on the way back = iOS native snap
    scale.value   = withSpring(1, SPRING_OUT);
    opacity.value = withTiming(1, { duration: 100, easing: Easing.out(Easing.quad) });
    onPressOut?.(e);
  };

  return (
    <AnimatedPressableCore
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={onPress}
      android_ripple={null}
      style={[style, animatedStyle]}
      entering={entering}
      exiting={exiting}
      {...props}
    >
      {children}
    </AnimatedPressableCore>
  );
}
