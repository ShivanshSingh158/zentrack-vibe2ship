/**
 * WorkoutTimer.tsx
 * Isolated countdown timer — only this component re-renders every second,
 * not the whole GymHomeScreen. Extracted from inline memo in GymHomeScreen.tsx.
 */
import React, { memo, useEffect, useState } from 'react';
import { Text, Platform } from 'react-native';
import { FONT_FAMILY } from '../../theme/tokens';
import { useTheme } from '../../contexts/ThemeContext';

const WorkoutTimer = memo(function WorkoutTimer({ startTime }: { startTime: number }) {
  const { colors, isDark } = useTheme();
  const [elapsed, setElapsed] = useState(Math.floor((Date.now() - startTime) / 1000));

  useEffect(() => {
    setElapsed(Math.floor((Date.now() - startTime) / 1000));
    const iv = setInterval(() => setElapsed(Math.floor((Date.now() - startTime) / 1000)), 1000);
    return () => clearInterval(iv);
  }, [startTime]);

  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  const label = h > 0
    ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
    : `${m}:${s.toString().padStart(2, '0')}`;

  return (
    <Text style={{
      fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
      fontSize: 13,
      fontWeight: 'bold',
      color: isDark ? colors.accentPrimary : (colors.accentAmber || '#D97706'),
    }}>
      {label}
    </Text>
  );
});

export default WorkoutTimer;
