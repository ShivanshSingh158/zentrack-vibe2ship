import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { COLORS, FONT_FAMILY, FONT_SIZE, RADIUS, SPACE } from '../../../theme/tokens';
import { useTheme } from '../../../contexts/ThemeContext';

interface VolumeBarChartProps {
  data: { label: string; volume: number }[]; // volume in kg or lbs
  height?: number;
}

export default function VolumeBarChart({ data, height = 150 }: VolumeBarChartProps) {
  const { colors, isDark } = useTheme();
  const styles = makeStyles(colors);
  
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    anim.setValue(0);
    Animated.timing(anim, {
      toValue: 1,
      duration: 800,
      useNativeDriver: false, // height/width cannot use native driver
    }).start();
  }, [data]);

  if (!data || data.length === 0) {
    return (
      <View style={[styles.emptyContainer, { height }]}>
        <Text style={styles.emptyText}>No volume data available.</Text>
      </View>
    );
  }

  const maxVolume = Math.max(...data.map(d => d.volume), 1);
  const barWidth = 26;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Weekly Volume</Text>
      <Text style={styles.subtitle}>Total weight moved (Sets × Reps × Weight)</Text>

      <View style={{ height, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', marginTop: SPACE.md, paddingBottom: 6 }}>
        {/* Y-axis grid lines */}
        <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
          {[0.33, 0.66, 1].map((f, i) => (
            <View key={i} style={[styles.gridLine, { bottom: `${f * 100}%` as any }]} />
          ))}
        </View>

        {data.map((d, i) => {
          const curH = anim.interpolate({
            inputRange: [0, 1],
            outputRange: [4, Math.max(4, (d.volume / maxVolume) * (height - 45))], // 45px for top/bottom labels
          });

          const formattedVol = d.volume >= 1000 ? `${(d.volume / 1000).toFixed(1)}k` : `${d.volume}`;

          return (
            <View key={i} style={{ alignItems: 'center' }}>
              <Text style={styles.topVolumeLabel}>{formattedVol}</Text>
              <Animated.View style={{
                width: barWidth,
                height: curH,
                backgroundColor: '#a599ff',
                borderTopLeftRadius: 6,
                borderTopRightRadius: 6,
                shadowColor: '#a599ff',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.4,
                shadowRadius: 6,
                elevation: 4,
              }} />
              <Text style={styles.barLabel}>{d.label}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: RADIUS.lg,
    padding: SPACE.md,
    marginTop: SPACE.md,
  },
  title: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.md,
    color: '#ffffff',
    marginBottom: SPACE.xs,
  },
  subtitle: {
    fontFamily: FONT_FAMILY.regular,
    fontSize: FONT_SIZE.xs,
    color: 'rgba(255, 255, 255, 0.7)',
    marginBottom: SPACE.xs,
  },
  emptyContainer: {
    backgroundColor: colors.surface,
    borderRadius: RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: FONT_SIZE.sm,
    color: colors.textTertiary,
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  topVolumeLabel: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 11,
    color: '#a599ff',
    marginBottom: 4,
  },
  barLabel: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: 8,
  },
});
