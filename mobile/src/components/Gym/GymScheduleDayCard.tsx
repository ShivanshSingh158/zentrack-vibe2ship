import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GymPlanDay } from '../../types/gym.types';

export interface GymScheduleDayCardProps {
  dayName: string;
  dayIndex: number;
  planDay: GymPlanDay;
  onPress: (dayIndex: number) => void;
  formatTime: (timeStr?: string) => string;
  styles: any;
  colors: any;
}

export const GymScheduleDayCard: React.FC<GymScheduleDayCardProps> = React.memo(({
  dayName,
  dayIndex,
  planDay,
  onPress,
  formatTime,
  styles,
  colors,
}) => {
  const isRest = planDay.isRest;

  return (
    <TouchableOpacity
      style={[styles.dayRow, isRest && styles.dayRowRest]}
      onPress={() => onPress(dayIndex)}
      activeOpacity={0.7}
    >
      <View style={styles.dayInfo}>
        <Text style={[styles.dayName, isRest && styles.dayNameRest]}>{dayName}</Text>
        <Text style={[styles.planFocus, isRest && styles.planFocusRest]}>
          {isRest ? '🧘 Rest Day (Weekly Recap)' : planDay.name || planDay.focus || 'Workout'}
        </Text>
      </View>

      {isRest ? (
        <View
          style={{
            backgroundColor: 'rgba(255,159,77,0.12)',
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: 'rgba(255,159,77,0.25)',
          }}
        >
          <Text style={{ fontSize: 11, fontWeight: '700', color: '#ff9f4d' }}>REST</Text>
        </View>
      ) : (
        <View style={styles.timeBlock}>
          {planDay.startTime ? (
            <View>
              <Text style={styles.timeText}>{formatTime(planDay.startTime)}</Text>
              <Text style={styles.timeSubText}>to {formatTime(planDay.endTime)}</Text>
            </View>
          ) : (
            <Text style={styles.notSetText}>Tap to set time</Text>
          )}
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} style={{ marginLeft: 8 }} />
        </View>
      )}
    </TouchableOpacity>
  );
});

export default GymScheduleDayCard;
