// Reusable animation presets — import these in any screen for consistent motion
import { Animated, Easing } from 'react-native';

/** Fade in + slide up from 40px below */
export const animateFadeInUp = (
  fadeAnim: Animated.Value,
  slideAnim: Animated.Value,
  delay = 0
) =>
  Animated.parallel([
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }),
    Animated.spring(slideAnim, {
      toValue: 0,
      delay,
      tension: 60,
      friction: 10,
      useNativeDriver: true,
    }),
  ]);

/** Spring press — scale 0.96 on press in, back to 1 on release */
export const getPressHandlers = (scaleAnim: Animated.Value) => ({
  onPressIn: () =>
    Animated.spring(scaleAnim, { toValue: 0.96, useNativeDriver: true }).start(),
  onPressOut: () =>
    Animated.spring(scaleAnim, { toValue: 1, friction: 4, useNativeDriver: true }).start(),
});

/** Pulsing idle animation for orb / loading states */
export const startPulse = (
  anim: Animated.Value,
  min = 0.9,
  max = 1.1,
  duration = 1200
): Animated.CompositeAnimation => {
  const loop = Animated.loop(
    Animated.sequence([
      Animated.timing(anim, {
        toValue: max,
        duration,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(anim, {
        toValue: min,
        duration,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    ])
  );
  loop.start();
  return loop;
};

/** Fast speaking pulse — for when Sara is actively speaking */
export const startSpeakingPulse = (anim: Animated.Value): Animated.CompositeAnimation => {
  return startPulse(anim, 0.88, 1.2, 280);
};

/** Slide up from bottom — for bottom sheets */
export const slideUpAnim = (anim: Animated.Value, toValue: number = 0) =>
  Animated.spring(anim, {
    toValue,
    tension: 65,
    friction: 11,
    useNativeDriver: true,
  });

/** Stagger animation for list items appearing */
export const staggerIn = (anims: Animated.Value[], delay = 60) =>
  Animated.stagger(
    delay,
    anims.map((a) =>
      Animated.spring(a, {
        toValue: 1,
        tension: 50,
        friction: 8,
        useNativeDriver: true,
      })
    )
  );

import { LayoutAnimation, Platform, UIManager } from 'react-native';
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) { UIManager.setLayoutAnimationEnabledExperimental(true); }
export const triggerLayoutAnimation = () => { LayoutAnimation.configureNext({ duration: 250, update: { type: 'spring', springDamping: 0.7 }, create: { type: 'easeInEaseOut', property: 'opacity' }, delete: { type: 'easeOut', property: 'opacity' } }); };
