import React, { memo } from 'react';
import { View, Text } from 'react-native';
import { FONT_FAMILY } from '../../theme/tokens';

export const DynamicCalendarIcon = memo(function DynamicCalendarIcon({
  size = 24,
  color,
  isFilled = false,
}: { size?: number; color: string; isFilled?: boolean }) {
  const day = new Date().getDate();
  const radius = Math.round(size * 0.22);
  const fontSize = Math.round(size * 0.42);

  return (
    <View style={{ width: size, height: size, borderRadius: radius, borderWidth: 1.5, borderColor: color, overflow: 'hidden', backgroundColor: isFilled ? color : 'transparent' }}>
      <View style={{ width: '100%', height: Math.round(size * 0.26), backgroundColor: color }} />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize, fontFamily: FONT_FAMILY.bold, color: isFilled ? '#FFFFFF' : color, includeFontPadding: false }}>
          {day}
        </Text>
      </View>
    </View>
  );
});

export default DynamicCalendarIcon;
