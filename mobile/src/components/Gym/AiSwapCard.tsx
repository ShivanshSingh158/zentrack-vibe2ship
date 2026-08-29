import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { resolveMuscleColor, hexToRgba } from '../../utils/gymUtils';

export interface AiSwapCardProps {
  item: any;
  styles: any;
  onSwap: (item: any) => void;
}

export const AiSwapCard: React.FC<AiSwapCardProps> = React.memo(({
  item,
  styles,
  onSwap,
}) => {
  return (
    <TouchableOpacity
      style={styles.exerciseRow}
      onPress={() => onSwap(item)}
      activeOpacity={0.75}
    >
      <View style={styles.exInfo}>
        <Text style={styles.exName}>{item.name}</Text>
        <Text style={styles.exTarget}>
          {item.targetSets} Sets × {item.targetReps} Reps • {item.restTimeSecs}s Rest
        </Text>
        {!!item.reason && (
          <Text style={styles.exReason} numberOfLines={1}>{item.reason}</Text>
        )}
      </View>
      <View style={[styles.musclePill, { backgroundColor: hexToRgba(resolveMuscleColor(item.muscle), 0.1) }]}>
        <View style={[styles.muscleDot, { backgroundColor: resolveMuscleColor(item.muscle) }]} />
        <Text style={[styles.muscleText, { color: resolveMuscleColor(item.muscle) }]}>{item.muscle}</Text>
      </View>
    </TouchableOpacity>
  );
});

export default AiSwapCard;
