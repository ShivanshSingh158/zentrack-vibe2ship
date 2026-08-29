import React, { useRef } from 'react';
import { View, Text, TouchableOpacity, Animated, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONT_FAMILY } from '../../theme/tokens';
import { feedback } from '../../utils/haptics';
import { useTheme } from '../../contexts/ThemeContext';

export interface GymAiOptionsChipsProps {
  options: string[];
  onSelect: (opt: string) => void;
  onWriteOwn: () => void;
  disabled: boolean;
}

export const GymAiOptionsChips: React.FC<GymAiOptionsChipsProps> = React.memo(({
  options,
  onSelect,
  onWriteOwn,
  disabled,
}) => {
  const { colors, isDark } = useTheme();
  const scaleAnims = useRef(options.map(() => new Animated.Value(1))).current;

  const pressIn = (i: number) =>
    Animated.spring(scaleAnims[i], { toValue: 0.94, useNativeDriver: true, speed: 40 }).start();
  const pressOut = (i: number) =>
    Animated.spring(scaleAnims[i], { toValue: 1, useNativeDriver: true, speed: 20 }).start();

  return (
    <View style={styles.wrapper}>
      <View style={styles.row}>
        {options.map((opt, i) => (
          <Animated.View key={i} style={{ transform: [{ scale: scaleAnims[i] }] }}>
            <TouchableOpacity
              style={[
                styles.chip,
                {
                  backgroundColor: isDark ? 'rgba(165,153,255,0.12)' : 'rgba(108,92,231,0.08)',
                  borderColor: isDark ? 'rgba(165,153,255,0.35)' : 'rgba(108,92,231,0.25)',
                },
                disabled && styles.chipDisabled,
              ]}
              onPress={() => {
                if (!disabled) {
                  feedback.tap();
                  onSelect(opt);
                }
              }}
              onPressIn={() => pressIn(i)}
              onPressOut={() => pressOut(i)}
              activeOpacity={1}
              disabled={disabled}
            >
              <Text style={[styles.chipText, { color: colors.accentPrimary }]}>{opt}</Text>
            </TouchableOpacity>
          </Animated.View>
        ))}
        <TouchableOpacity
          style={[
            styles.chip,
            {
              backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : colors.surface,
              borderColor: colors.border,
            },
            disabled && styles.chipDisabled,
          ]}
          onPress={() => {
            if (!disabled) {
              feedback.tap();
              onWriteOwn();
            }
          }}
          disabled={disabled}
          activeOpacity={0.8}
        >
          <Ionicons name="create-outline" size={12} color={colors.textSecondary} />
          <Text style={[styles.chipText, { color: colors.textSecondary }]}>Write my own</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrapper: { marginTop: 10, marginBottom: 2 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 13,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  chipDisabled: { opacity: 0.4 },
  chipText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 12.5,
    letterSpacing: 0.1,
  },
});

export default GymAiOptionsChips;
