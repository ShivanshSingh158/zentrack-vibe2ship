import React from 'react';
import { Pressable, PressableProps, StyleProp, ViewStyle } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, EntryOrExitLayoutType } from 'react-native-reanimated';
import { feedback } from '../utils/haptics';

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
    scale.value = withTiming(scaleTo, { duration: 80, easing: Easing.out(Easing.quad) });
    opacity.value = withTiming(activeOpacity, { duration: 80 });
    
    if (haptic === 'light') feedback.tap();
    else if (haptic === 'medium') feedback.tap();
    else if (haptic === 'heavy') feedback.commit();
    
    if (onPressIn) onPressIn(e);
  };

  const handlePressOut = (e: any) => {
    // iOS-style: clean, no bounce — withTiming feels premium
    scale.value = withTiming(1, { duration: 180, easing: Easing.out(Easing.quad) });
    opacity.value = withTiming(1, { duration: 180 });
    
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
