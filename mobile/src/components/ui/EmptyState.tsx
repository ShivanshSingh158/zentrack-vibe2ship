import React from 'react';
import { View, Text, StyleSheet, Image, ViewStyle, Pressable } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useTheme } from '../../contexts/ThemeContext';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS } from '../../theme/tokens';
import * as Haptics from 'expo-haptics';

export type MascotType = 'idle' | 'running';

interface EmptyStateProps {
  mascot: MascotType;
  title: string;
  subtitle: string;
  mascotSize?: number;
  action?: {
    label: string;
    onPress: () => void;
  };
  style?: ViewStyle;
}

export default function EmptyState({ mascot, title, subtitle, mascotSize, action, style }: EmptyStateProps) {
  const { colors } = useTheme();

  const imageSource = mascot === 'running' 
    ? require('../../../assets/images/sara-running.png')
    : require('../../../assets/images/sara-idle.png');

  return (
    <Animated.View 
      entering={FadeInDown.duration(400).springify().damping(14)}
      style={[styles.container, style]}
    >
      <Image 
        source={imageSource} 
        style={[styles.mascot, mascotSize ? { width: mascotSize, height: mascotSize } : null]} 
        resizeMode="contain" 
      />
      
      <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
      <Text style={[styles.subtitle, { color: colors.textMuted }]}>{subtitle}</Text>

      {action && (
        <Pressable 
          style={({ pressed }) => [
            styles.button, 
            { backgroundColor: colors.accentPrimary },
            pressed && { opacity: 0.8 }
          ]}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            action.onPress();
          }}
        >
          <Text style={styles.buttonText}>{action.label}</Text>
        </Pressable>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACE.lg,
    paddingVertical: SPACE.sm,
  },
  mascot: {
    width: 140,
    height: 140,
    marginBottom: SPACE.sm,
    opacity: 0.95,
  },
  title: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.xl,
    marginBottom: SPACE.xs,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: FONT_FAMILY.regular,
    fontSize: FONT_SIZE.md,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: SPACE.xl,
    paddingHorizontal: SPACE.lg,
  },
  button: {
    paddingHorizontal: SPACE.xl,
    paddingVertical: SPACE.md,
    borderRadius: RADIUS.full,
    shadowColor: '#a599ff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonText: {
    color: '#000',
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.md,
  }
});
