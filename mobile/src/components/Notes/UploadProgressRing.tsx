import React from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTheme } from '../../contexts/ThemeContext';

interface UploadProgressRingProps {
  progress: number;
}

export const UploadProgressRing = React.memo(function UploadProgressRing({ progress }: UploadProgressRingProps) {
  const { colors, isDark } = useTheme();
  const radius = 12;
  const stroke = 3;
  const normalizedRadius = radius - stroke * 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <View style={{ width: 32, height: 32, alignItems: 'center', justifyContent: 'center' }}>
      <Svg height="32" width="32" viewBox="0 0 32 32">
        <Circle
          stroke={isDark ? '#2c2c2e' : '#E2E1EA'}
          fill="transparent"
          strokeWidth={stroke}
          r={normalizedRadius}
          cx="16"
          cy="16"
        />
        <Circle
          stroke={colors.accentPrimary}
          fill="transparent"
          strokeWidth={stroke}
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          r={normalizedRadius}
          cx="16"
          cy="16"
          strokeLinecap="round"
          transform="rotate(-90 16 16)"
        />
      </Svg>
    </View>
  );
});

export default UploadProgressRing;
