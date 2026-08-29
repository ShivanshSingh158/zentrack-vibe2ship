import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

export interface CardioTypeOption {
  label: string;
  icon: string;
}

export const CARDIO_TYPES: CardioTypeOption[] = [
  { label: 'Treadmill', icon: 'walk-outline' },
  { label: 'Cycling', icon: 'bicycle-outline' },
  { label: 'Rowing', icon: 'boat-outline' },
  { label: 'Stairmaster', icon: 'trending-up-outline' },
  { label: 'Elliptical', icon: 'sync-outline' },
  { label: 'Outdoor Run', icon: 'footsteps-outline' },
  { label: 'Jump Rope', icon: 'infinite-outline' },
  { label: 'Swimming', icon: 'water-outline' },
  { label: 'Other', icon: 'fitness-outline' },
];

export interface CardioTypeSelectorProps {
  selectedType: string | null;
  onSelect: (type: string) => void;
  styles: any;
  colors: any;
  isDark: boolean;
}

export const CardioTypeSelector: React.FC<CardioTypeSelectorProps> = React.memo(({
  selectedType,
  onSelect,
  styles,
  colors,
  isDark,
}) => {
  return (
    <View style={styles.grid}>
      {CARDIO_TYPES.map(({ label, icon }) => {
        const isSelected = selectedType === label;
        const isFullWidth = label === 'Other';

        return (
          <TouchableOpacity
            key={label}
            style={[
              styles.chip,
              isFullWidth && styles.chipFullWidth,
              isSelected && styles.chipSelected,
            ]}
            onPress={() => {
              Haptics.selectionAsync();
              onSelect(label);
            }}
            activeOpacity={0.75}
          >
            <View style={[styles.chipIcon, isSelected && styles.chipIconSelected]}>
              <Ionicons
                name={icon as any}
                size={18}
                color={isSelected ? (isDark ? '#000000' : '#FFFFFF') : colors.accentPrimary}
              />
            </View>
            <Text style={[styles.chipLabel, isSelected && styles.chipLabelSelected]}>
              {label}
            </Text>
            {isSelected && (
              <Ionicons name="checkmark-circle" size={16} color={colors.accentPrimary} />
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
});

export default CardioTypeSelector;
