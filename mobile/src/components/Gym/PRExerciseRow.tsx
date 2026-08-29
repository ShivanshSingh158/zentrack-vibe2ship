import React from 'react';
import { View, Text } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { formatDateShort } from '../../utils/dateUtils';

export interface PREntry {
  name: string;
  best1RM?: number;
  heaviestWeight?: number;
  bestReps?: number;
  achievedAt?: string;
}

export interface PRExerciseRowProps {
  item: PREntry;
  index: number;
  styles: any;
  colors: any;
}

export const PRExerciseRow: React.FC<PRExerciseRowProps> = React.memo(({
  item,
  index,
  styles,
  colors,
}) => {
  return (
    <Animated.View entering={FadeInDown.delay(index * 30).duration(200)}>
      <View style={[styles.row, { backgroundColor: colors.surfaceRaised || colors.surface, borderColor: colors.border }]}>
        <View style={styles.rankBadge}>
          <Text style={styles.rankText}>{index + 1}</Text>
        </View>
        <View style={styles.rowBody}>
          <Text style={[styles.exerciseName, { color: colors.textPrimary }]}>
            {item.name.charAt(0).toUpperCase() + item.name.slice(1)}
          </Text>
          <View style={styles.rowDetails}>
            <View style={styles.chip}>
              <Ionicons name="trophy-outline" size={11} color="#f59e0b" />
              <Text style={styles.chip1RM}>{item.best1RM} kg 1RM</Text>
            </View>
            <Text style={[styles.detail, { color: colors.textMuted }]}>
              {item.heaviestWeight} kg × {item.bestReps}
            </Text>
          </View>
        </View>
        <Text style={[styles.date, { color: colors.textMuted }]}>
          {item.achievedAt ? formatDateShort(item.achievedAt) : '—'}
        </Text>
      </View>
    </Animated.View>
  );
});

export default PRExerciseRow;
