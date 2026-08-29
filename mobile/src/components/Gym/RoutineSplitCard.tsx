import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GymPlanDay } from '../../types/gym.types';

export interface RoutineSplitCardProps {
  day: GymPlanDay;
  isSelected: boolean;
  onSelect: (dayIndex: number) => void;
  styles: any;
  colors: any;
}

export const RoutineSplitCard: React.FC<RoutineSplitCardProps> = React.memo(({
  day,
  isSelected,
  onSelect,
  styles,
  colors,
}) => {
  const isRest = day.isRest;

  return (
    <TouchableOpacity
      style={[styles.dayCard, isSelected && styles.dayCardActive]}
      onPress={() => onSelect(day.dayIndex)}
      activeOpacity={0.7}
    >
      <View style={styles.dayCardLeft}>
        <View style={[styles.dayBadge, isRest && styles.restBadge, isSelected && styles.dayBadgeActive]}>
          <Text style={[styles.dayBadgeText, isSelected && styles.dayBadgeTextActive]}>
            {isRest ? 'REST' : `D${day.dayIndex}`}
          </Text>
        </View>

        <View style={styles.dayInfo}>
          <Text style={[styles.dayName, isSelected && styles.dayNameActive]}>{day.name}</Text>
          {day.subtitle ? (
            <Text style={styles.daySubtitle}>{day.subtitle}</Text>
          ) : (
            <Text style={styles.daySubtitle}>
              {isRest ? 'Active recovery & rest' : `${day.exercises?.length || 0} Exercises`}
            </Text>
          )}
        </View>
      </View>

      <View style={styles.dayCardRight}>
        {isSelected ? (
          <View style={styles.activeCheckPill}>
            <Ionicons name="checkmark-circle" size={14} color="#ffffff" />
            <Text style={styles.activeCheckText}>Active</Text>
          </View>
        ) : (
          <Ionicons name="swap-horizontal" size={18} color={colors.textMuted} />
        )}
      </View>
    </TouchableOpacity>
  );
});

export default RoutineSplitCard;
