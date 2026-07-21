import React, { useEffect, useRef } from 'react';
import { TouchableOpacity, Animated, StyleSheet, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { RADIUS, SHADOW } from '../../theme/tokens';
import { getPressHandlers } from '../../theme/animations';
import { useTheme } from "../../contexts/ThemeContext";

interface FABProps {
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  color?: string;
  style?: ViewStyle;
  size?: number;
}

/**
 * FloatingActionButton — the glassmorphic + button used in Tasks, Notes, Calendar.
 */
export default function FloatingActionButton({
  icon = 'add',
  onPress,
  color,
  style,
  size = 56,
}: FABProps) {
    const { colors, isDark } = useTheme();
    const styles = makeStyles(colors);
    const resolvedColor = color ?? colors.accentPrimary;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const { onPressIn, onPressOut } = getPressHandlers(scaleAnim);

  return (
    <Animated.View
      style={[
        styles.container,
        { width: size, height: size, borderRadius: size / 2 },
        SHADOW.accent(resolvedColor),
        { transform: [{ scale: scaleAnim }] },
        style,
      ]}
    >
      
      <TouchableOpacity
        onPress={onPress}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        activeOpacity={1}
        style={[styles.button, { width: size, height: size, borderRadius: size / 2 }]}
      >
        <Ionicons name={icon} size={size * 0.45} color={resolvedColor} />
      </TouchableOpacity>
    </Animated.View>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
      container: {
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.12)',
        backgroundColor: 'rgba(10, 9, 12, 0.5)',
      },
      button: {
        alignItems: 'center',
        justifyContent: 'center',
      },
    });
