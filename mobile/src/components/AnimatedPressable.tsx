import React from 'react';
import { Pressable, PressableProps, StyleProp, ViewStyle } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withSpring, EntryOrExitLayoutType } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

interface AnimatedPressableProps extends PressableProps {
  style?: StyleProp<ViewStyle>;
  scaleTo?: number;
  activeOpacity?: number;
  haptic?: 'light' | 'medium' | 'heavy' | 'none';
  children: React.ReactNode;
  entering?: EntryOrExitLayoutType;
  exiting?: EntryOrExitLayoutType;
}

const AnimatedPressableCore = Animated.createAnimatedComponent(Pressable);

export default function AnimatedPressable({
  style,
  scaleTo = 0.96,
  activeOpacity = 0.8,
  haptic = 'light',
  children,
  entering,
  exiting,
  onPressIn,
  onPressOut,
  onPress,
  ...props
}: AnimatedPressableProps) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const handlePressIn = (e: any) => {
    scale.value = withTiming(scaleTo, { duration: 100 });
    opacity.value = withTiming(activeOpacity, { duration: 100 });
    
    if (haptic === 'light') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    else if (haptic === 'medium') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    else if (haptic === 'heavy') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    
    if (onPressIn) onPressIn(e);
  };

  const handlePressOut = (e: any) => {
    scale.value = withSpring(1, { damping: 12, stiffness: 150 });
    opacity.value = withTiming(1, { duration: 200 });
    
    if (onPressOut) onPressOut(e);
  };

  return (
    <AnimatedPressableCore
      entering={entering}
      exiting={exiting}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={onPress}
      style={[style, animatedStyle]}
      {...props}
    >
      {children}
    </AnimatedPressableCore>
  );
}
