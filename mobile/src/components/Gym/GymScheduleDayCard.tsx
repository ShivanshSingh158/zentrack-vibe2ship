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
  isDark?: boolean;
}

export const GymScheduleDayCard: React.FC<GymScheduleDayCardProps> = React.memo(({
  dayName,
  dayIndex,
  planDay,
  onPress,
  formatTime,
  styles,
  colors,
  isDark = true,
}) => {
  const isRest = planDay.isRest;
  const hasTime = Boolean(planDay.startTime);

  return (
    <TouchableOpacity
      style={[styles.dayRow, isRest && styles.dayRowRest]}
      onPress={() => onPress(dayIndex)}
      activeOpacity={0.7}
    >
      {/* Icon Badge */}
      <View
        style={[
          styles.dayIconBox,
          {
            backgroundColor: isRest
              ? isDark
                ? 'rgba(255,159,77,0.12)'
                : 'rgba(234,88,12,0.08)'
              : isDark
              ? 'rgba(165,153,255,0.12)'
              : 'rgba(108,92,231,0.08)',
          },
        ]}
      >
        <Ionicons
          name={isRest ? 'moon-outline' : 'barbell-outline'}
          size={17}
          color={isRest ? (isDark ? '#FF9F4D' : '#EA580C') : colors.accentPrimary}
        />
      </View>

      {/* Info Column */}
      <View style={styles.dayInfo}>
        <Text style={[styles.dayName, isRest && styles.dayNameRest]}>{dayName}</Text>
        <Text style={[styles.planFocus, isRest && styles.planFocusRest]} numberOfLines={1}>
          {isRest ? 'Rest & Recovery' : planDay.name || planDay.focus || 'Workout'}
        </Text>
      </View>

      {/* Right Time / Status Badge */}
      {isRest ? (
        <View
          style={{
            backgroundColor: isDark ? 'rgba(255,159,77,0.12)' : 'rgba(234,88,12,0.08)',
            paddingHorizontal: 9,
            paddingVertical: 4,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: isDark ? 'rgba(255,159,77,0.25)' : 'rgba(234,88,12,0.2)',
          }}
        >
          <Text style={{ fontSize: 10.5, fontWeight: '700', color: isDark ? '#FF9F4D' : '#EA580C', letterSpacing: 0.5 }}>
            REST
          </Text>
        </View>
      ) : (
        <View style={styles.timeBlock}>
          {hasTime ? (
            <View
              style={{
                backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#F3F4F6',
                paddingHorizontal: 9,
                paddingVertical: 4,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#E5E7EB',
                alignItems: 'flex-end',
              }}
            >
              <Text style={styles.timeText}>{formatTime(planDay.startTime)}</Text>
              <Text style={styles.timeSubText}>to {formatTime(planDay.endTime)}</Text>
            </View>
          ) : (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#F9FAFB',
                paddingHorizontal: 9,
                paddingVertical: 4,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: isDark ? 'rgba(255,255,255,0.06)' : '#E5E7EB',
              }}
            >
              <Ionicons name="time-outline" size={12} color={colors.textTertiary} />
              <Text style={styles.notSetText}>Tap to set time</Text>
            </View>
          )}
          <Ionicons name="chevron-forward" size={15} color={colors.textTertiary} style={{ marginLeft: 6 }} />
        </View>
      )}
    </TouchableOpacity>
  );
});

export default GymScheduleDayCard;
