import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export interface ActiveQuickChipsProps {
  activeSetIndex: number;
  styles: any;
  onRepeatPrevious: () => void;
  onAdjustWeight?: (delta: number) => void;
  onAdjustReps?: (delta: number) => void;
}

export const ActiveQuickChips: React.FC<ActiveQuickChipsProps> = React.memo(({
  activeSetIndex,
  styles,
  onRepeatPrevious,
}) => {
  return (
    <View style={styles.quickChipsContainer}>
      <TouchableOpacity
        activeOpacity={0.75}
        style={styles.quickChipRepeat}
        onPress={onRepeatPrevious}
      >
        <Ionicons
          name={activeSetIndex > 0 ? "copy-outline" : "locate-outline"}
          size={13}
          color="#a599ff"
        />
        <Text style={styles.quickChipTextHighlight}>
          {activeSetIndex > 0 ? `Same as Set ${activeSetIndex}` : 'Match Target'}
        </Text>
      </TouchableOpacity>
    </View>
  );
});

export default ActiveQuickChips;
