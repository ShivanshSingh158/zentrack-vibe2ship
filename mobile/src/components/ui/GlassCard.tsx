import React, { useMemo } from 'react';
import { View, StyleSheet, ViewStyle, StyleProp, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { RADIUS, SHADOW } from '../../theme/tokens';
import { useTheme } from "../../contexts/ThemeContext";

interface GlassCardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  intensity?: number;
  padding?: number;
  borderRadius?: number;
  noBorder?: boolean;
}

/**
 * GlassCard — reusable glassmorphic container.
 * High-performance hardware blur on iOS; smooth zero-cost translucent surface on Android.
 */
function GlassCardComponent({
  children,
  style,
  intensity = 25,
  padding = 20,
  borderRadius = RADIUS.md,
  noBorder = false,
}: GlassCardProps) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

  return (
    <View
      style={[
        styles.container,
        { borderRadius, borderWidth: noBorder ? 0 : 1 },
        SHADOW.md,
        style,
      ]}
    >
      {Platform.OS === 'ios' ? (
        <BlurView
          intensity={intensity}
          tint={isDark ? 'dark' : 'light'}
          style={[StyleSheet.absoluteFillObject, { borderRadius }]}
        />
      ) : (
        <View
          style={[
            StyleSheet.absoluteFillObject,
            {
              borderRadius,
              backgroundColor: isDark ? 'rgba(18, 18, 24, 0.82)' : 'rgba(255, 255, 255, 0.88)',
            },
          ]}
        />
      )}
      <View style={{ padding }}>{children}</View>
    </View>
  );
}

const makeStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    container: {
      overflow: 'hidden',
      borderColor: colors.border || (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'),
      backgroundColor: isDark ? 'rgba(12, 12, 16, 0.65)' : 'rgba(255, 255, 255, 0.75)',
    },
  });

export default React.memo(GlassCardComponent);
