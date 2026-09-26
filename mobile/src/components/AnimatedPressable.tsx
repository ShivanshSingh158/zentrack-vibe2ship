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
import * as Haptics from 'expo-haptics';

// ── Variant system — semantic press depths matching iOS / WhatsApp conventions ──
// row:         list rows, agenda items, settings items → ultra-subtle 0.985 (zero layout jump)
// card:        cards, dashboard widgets, hero surfaces  → solid 0.980
// button:      standard buttons, action chips          → crisp 0.960
// cta:         FAB, primary submit action buttons      → pronounced 0.930
// destructive: delete, reset, danger actions           → firm 0.940
// subtle:      icon-only buttons, small badge chips    → light 0.975
export type PressableVariant = 'row' | 'card' | 'button' | 'default' | 'cta' | 'destructive' | 'subtle';

const SCALE_MAP: Record<PressableVariant, number> = {
  row:         0.985,
  card:        0.980,
  button:      0.960,
  default:     0.960,
  cta:         0.930,
  destructive: 0.940,
  subtle:      0.975,
};

const OPACITY_MAP: Record<PressableVariant, number> = {
  row:         0.92,
  card:        0.95,
  button:      0.88,
  default:     0.88,
  cta:         0.90,
  destructive: 0.82,
  subtle:      0.80,
};

// Press-in spring config — overshootClamping=true so compression is instant with NO bounce on the way down
const SPRING_IN = {
  damping: 18,
  stiffness: 450,
  mass: 0.35,
  overshootClamping: true,
} as const;

// Press-out spring config — subtle overshoot on release = the "snap back" Apple iOS feel
const SPRING_OUT = {
  damping: 15,
  stiffness: 350,
  mass: 0.45,
} as const;

export interface AnimatedPressableProps extends PressableProps {
  style?: StyleProp<ViewStyle>;
  /** Override the target scale directly (takes priority over variant) */
  scaleTo?: number;
  activeOpacity?: number;
  /** Synchronized touch-down micro-haptic. Defaults to 'light'. Use 'none' to disable */
  haptic?: 'light' | 'selection' | 'medium' | 'heavy' | 'success' | 'none';
  variant?: PressableVariant;
  children: React.ReactNode;
  entering?: EntryOrExitLayoutType;
  exiting?: EntryOrExitLayoutType;
}

const AnimatedPressableCore = Animated.createAnimatedComponent(Pressable);

export function AnimatedPressable({
  style,
  scaleTo,
  activeOpacity,
  haptic = 'light',
  variant = 'default',
  children,
  entering,
  exiting,
  onPressIn,
  onPressOut,
  onPress,
  disabled,
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
    if (!disabled) {
      // 1. Frame-0 Spring compression on UI thread
      scale.value   = withSpring(targetScale, SPRING_IN);
      opacity.value = withTiming(targetOpacity, { duration: 40, easing: Easing.out(Easing.quad) });

      // 2. Synchronized micro-haptic strike on touch-down (Telegram / iOS native feel)
      if (haptic !== 'none') {
        if (haptic === 'selection') {
          Haptics.selectionAsync();
        } else if (haptic === 'medium') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        } else if (haptic === 'heavy') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        } else if (haptic === 'success') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
      }
    }
    onPressIn?.(e);
  };

  const handlePressOut = (e: any) => {
    if (!disabled) {
      // Spring release: subtle overshoot on the way back = iOS native snap
      scale.value   = withSpring(1, SPRING_OUT);
      opacity.value = withTiming(1, { duration: 110, easing: Easing.out(Easing.quad) });
    }
    onPressOut?.(e);
  };

  return (
    <AnimatedPressableCore
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={onPress}
      disabled={disabled}
      unstable_pressDelay={0}
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

export default AnimatedPressable;
