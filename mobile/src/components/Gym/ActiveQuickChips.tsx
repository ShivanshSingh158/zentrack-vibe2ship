import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export interface ActiveQuickChipsProps {
  activeSetIndex: number;
  styles: any;
  onRepeatPrevious: () => void;
  onAdjustWeight: (delta: number) => void;
  onAdjustReps: (delta: number) => void;
}

export const ActiveQuickChips: React.FC<ActiveQuickChipsProps> = React.memo(({
  activeSetIndex,
  styles,
  onRepeatPrevious,
  onAdjustWeight,
  onAdjustReps,
}) => {
  return (
    <View style={styles.quickChipsContainer}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickChipsScroll}>
        <TouchableOpacity
          activeOpacity={0.75}
          style={styles.quickChipRepeat}
          onPress={onRepeatPrevious}
        >
          <Ionicons name="flash" size={12} color="#a599ff" />
          <Text style={styles.quickChipTextHighlight}>
            {activeSetIndex > 0 ? `Same as Set ${activeSetIndex}` : 'Match Target'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.75}
          style={styles.quickChip}
          onPress={() => onAdjustWeight(2.5)}
        >
          <Text style={styles.quickChipText}>+2.5 kg</Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.75}
          style={styles.quickChip}
          onPress={() => onAdjustWeight(5)}
        >
          <Text style={styles.quickChipText}>+5 kg</Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.75}
          style={styles.quickChip}
          onPress={() => onAdjustWeight(-2.5)}
        >
          <Text style={styles.quickChipText}>-2.5 kg</Text>
        </TouchableOpacity>

        <View style={styles.quickChipDivider} />

        <TouchableOpacity
          activeOpacity={0.75}
          style={styles.quickChip}
          onPress={() => onAdjustReps(1)}
        >
          <Text style={styles.quickChipText}>+1 Rep</Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.75}
          style={styles.quickChip}
          onPress={() => onAdjustReps(2)}
        >
          <Text style={styles.quickChipText}>+2 Reps</Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.75}
          style={styles.quickChip}
          onPress={() => onAdjustReps(-1)}
        >
          <Text style={styles.quickChipText}>-1 Rep</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
});

export default ActiveQuickChips;
