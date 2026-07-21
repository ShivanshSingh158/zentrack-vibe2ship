import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { RADIUS, SHADOW } from '../../theme/tokens';
import { useTheme } from "../../contexts/ThemeContext";

interface GlassCardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  intensity?: number;
  padding?: number;
  borderRadius?: number;
  noBorder?: boolean;
}

/**
 * GlassCard — reusable glassmorphic container.
 * Used by every card, modal, widget, and overlay in the app.
 */
export default function GlassCard({
  children,
  style,
  intensity = 25,
  padding = 20,
  borderRadius = RADIUS.md,
  noBorder = false,
}: GlassCardProps) {
    const { colors, isDark } = useTheme();
    const styles = makeStyles(colors);
  return (
    <View
      style={[
        styles.container,
        { borderRadius, borderWidth: noBorder ? 0 : 1 },
        SHADOW.md,
        style,
      ]}
    >
      <BlurView experimentalBlurMethod="dimezisBlurView"
        intensity={intensity}
        tint="dark"
        style={[StyleSheet.absoluteFillObject, { borderRadius }]}
      />
      <View style={{ padding }}>{children}</View>
    </View>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
      container: {
        overflow: 'hidden',
        borderColor: colors.border,
        backgroundColor: 'rgba(10, 9, 12, 0.4)',
      },
    });
