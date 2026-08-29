import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { resolveMuscleColor, hexToRgba } from '../../utils/gymUtils';

export interface TemplateSwapCardProps {
  item: any;
  styles: any;
  onSwap: (item: any) => void;
}

export const TemplateSwapCard: React.FC<TemplateSwapCardProps> = React.memo(({
  item,
  styles,
  onSwap,
}) => {
  return (
    <TouchableOpacity
      style={[
        styles.templateSwapCard,
        item.isExactMuscleMatch && styles.templateSwapCardExact,
      ]}
      onPress={() => onSwap(item)}
      activeOpacity={0.75}
    >
      <View style={styles.templateCardTop}>
        <View style={styles.dayOriginPill}>
          <Ionicons name="calendar-outline" size={11} color="#a599ff" />
          <Text style={styles.dayOriginText}>{item.dayName}</Text>
        </View>
        <View style={[styles.musclePill, { backgroundColor: hexToRgba(resolveMuscleColor(item.muscle), 0.15) }]}>
          <View style={[styles.muscleDot, { backgroundColor: resolveMuscleColor(item.muscle) }]} />
          <Text style={[styles.muscleText, { color: resolveMuscleColor(item.muscle) }]}>{item.muscle}</Text>
        </View>
      </View>

      <View style={styles.templateCardBody}>
        <Text style={styles.templateExName}>{item.name}</Text>
        <Text style={styles.templateExMeta}>
          {item.targetSets} Sets × {item.targetReps} Reps • {item.restTimeSecs}s Rest
        </Text>
      </View>

      <View style={styles.templateCardFooter}>
        <Text style={styles.templateTapHint}>Tap to Swap with {item.name} →</Text>
      </View>
    </TouchableOpacity>
  );
});

export default TemplateSwapCard;
