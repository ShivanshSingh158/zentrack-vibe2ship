import React, { useRef } from 'react';
import { Animated, Pressable, PressableProps, StyleProp, ViewStyle, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';

interface AnimatedPressableProps extends PressableProps {
  style?: StyleProp<ViewStyle>;
  scaleTo?: number;
  activeOpacity?: number;
  haptic?: 'light' | 'medium' | 'heavy' | 'none';
  children: React.ReactNode;
}

const AnimatedPressableCore = Animated.createAnimatedComponent(Pressable);

export default function AnimatedPressable({
  style,
  scaleTo = 0.96,
  activeOpacity = 0.8,
  haptic = 'light',
  children,
  onPressIn,
  onPressOut,
  onPress,
  ...props
}: AnimatedPressableProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  const handlePressIn = (e: any) => {
    Animated.parallel([
      Animated.timing(scale, {
        toValue: scaleTo,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: activeOpacity,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();
    
    if (haptic === 'light') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    else if (haptic === 'medium') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    else if (haptic === 'heavy') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    
    if (onPressIn) onPressIn(e);
  };

  const handlePressOut = (e: any) => {
    Animated.parallel([
      Animated.spring(scale, {
        toValue: 1,
        tension: 150,
        friction: 12,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();
    
    if (onPressOut) onPressOut(e);
  };

  return (
    <AnimatedPressableCore
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={onPress}
      style={[style, { transform: [{ scale }], opacity }]}
      {...props}
    >
      {children}
    </AnimatedPressableCore>
  );
}
