import React, { useEffect } from 'react';
import { useIsFocused } from '@react-navigation/native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
} from 'react-native-reanimated';

/**
 * withTabEntrance
 *
 * HOC that wraps a tab screen with a WhatsApp / Telegram-grade entrance animation:
 *   Focus  → opacity 0→1 (180ms ease-out) + translateY 8→0 (spring, damping 20)
 *   Blur   → instant reset (no exit animation — avoids visible outgoing content)
 *
 * The transition runs entirely on the UI thread via Reanimated worklets.
 * It does NOT cancel or interfere with the tab navigator's own `animation: 'none'` setting.
 *
 * Usage:
 *   const SafeDashboard = withTabEntrance(withErrorBoundary(DashboardScreen, 'Dashboard'));
 */
export function withTabEntrance<T extends object>(
  Component: React.ComponentType<T>,
): React.ComponentType<T> {
  const WrappedScreen = (props: T) => {
    const isFocused   = useIsFocused();
    const opacity     = useSharedValue(0);
    const translateY  = useSharedValue(8);

    useEffect(() => {
      if (isFocused) {
        // Entrance: fade + lift (UI thread, 60fps on all Android versions)
        opacity.value    = withTiming(1, { duration: 180, easing: Easing.out(Easing.quad) });
        translateY.value = withSpring(0, { damping: 20, stiffness: 280, mass: 0.7 });
      } else {
        // Reset instantly so there's no "ghost" of the previous screen bleeding through
        opacity.value    = 0;
        translateY.value = 8;
      }
    }, [isFocused]);

    const animatedStyle = useAnimatedStyle(() => ({
      flex:      1,
      opacity:   opacity.value,
      transform: [{ translateY: translateY.value }],
    }));

    return (
      <Animated.View style={animatedStyle}>
        <Component {...props} />
      </Animated.View>
    );
  };

  WrappedScreen.displayName = `withTabEntrance(${
    Component.displayName || Component.name || 'Component'
  })`;

  return WrappedScreen;
}
