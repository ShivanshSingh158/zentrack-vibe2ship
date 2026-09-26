import React from 'react';
import { View, StyleSheet } from 'react-native';

/**
 * withTabEntrance
 *
 * Wraps a tab screen with a zero-overhead, stable container.
 * In Apple iOS (and top tier apps like Telegram & Instagram), tab switching
 * is instantaneous (0ms layout latency) with rock-solid screen positioning.
 * Screen content stays anchored at translateY: 0 without jumping or black flashing,
 * while the Telegram bottom tab bar pill and icon bounce provide the fluid motion.
 */
export function withTabEntrance<T extends object>(
  Component: React.ComponentType<T>,
): React.ComponentType<T> {
  const WrappedScreen = (props: T) => {
    return (
      <View style={styles.container}>
        <Component {...props} />
      </View>
    );
  };

  WrappedScreen.displayName = `withTabEntrance(${
    Component.displayName || Component.name || 'Component'
  })`;

  return React.memo(WrappedScreen);
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
