import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { hapticLight } from '../../utils/haptics';

export interface SchedulePatternCardProps {
  patternId: 'mon_sun' | 'tue_mon' | 'wed_sun' | 'mon_fri';
  selectedPattern: string;
  onSelect: (p: 'mon_sun' | 'tue_mon' | 'wed_sun' | 'mon_fri') => void;
  title: string;
  restLabel: string;
  subtitle: string;
  styles: any;
  colors: any;
}

export const SchedulePatternCard: React.FC<SchedulePatternCardProps> = React.memo(({
  patternId,
  selectedPattern,
  onSelect,
  title,
  restLabel,
  subtitle,
  styles,
  colors,
}) => {
  const isSelected = selectedPattern === patternId;

  return (
    <TouchableOpacity
      style={[styles.scheduleCard, isSelected && styles.scheduleCardActive]}
      onPress={() => {
        hapticLight();
        onSelect(patternId);
      }}
      activeOpacity={0.8}
    >
      <View style={styles.scheduleHeader}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {isSelected ? (
            <Ionicons name="radio-button-on" size={16} color={colors.accentPrimary} />
          ) : (
            <Ionicons name="radio-button-off" size={16} color={colors.textTertiary} />
          )}
          <Text style={styles.scheduleTitle}>{title}</Text>
        </View>
        <View style={styles.restPill}>
          <Text style={styles.restPillText}>{restLabel}</Text>
        </View>
      </View>
      <Text style={styles.scheduleSub}>{subtitle}</Text>
    </TouchableOpacity>
  );
});

export default SchedulePatternCard;
