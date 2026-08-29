import React from 'react';
import { View, Text } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';

export interface DonutItem {
  muscle: string;
  volume: number;
  color: string;
  percent: number;
}

export interface GymProgressDonutProps {
  donutData: DonutItem[];
  totalVolumeKg: number;
  styles: any;
}

export const GymProgressDonut: React.FC<GymProgressDonutProps> = React.memo(({
  donutData,
  totalVolumeKg,
  styles,
}) => {
  if (donutData.length === 0) {
    return (
      <View style={styles.emptyBox}>
        <Ionicons name="pie-chart-outline" size={24} color="rgba(255,255,255,0.2)" />
        <Text style={styles.emptyText}>No muscle data logged in this period.</Text>
      </View>
    );
  }

  const CIRCUMFERENCE = 2 * Math.PI * 52;
  let cumulativePercent = 0;

  return (
    <View style={styles.donutContainer}>
      <View style={styles.donutSvgWrapper}>
        <Svg width={150} height={150} viewBox="0 0 150 150">
          {donutData.map((item, i) => {
            const strokeDasharray = `${(item.percent / 100) * CIRCUMFERENCE} ${CIRCUMFERENCE}`;
            const strokeDashoffset = -((cumulativePercent / 100) * CIRCUMFERENCE);
            cumulativePercent += item.percent;
            return (
              <Circle
                key={i}
                cx={75}
                cy={75}
                r={52}
                stroke={item.color}
                strokeWidth={16}
                strokeDasharray={strokeDasharray}
                strokeDashoffset={strokeDashoffset}
                fill="none"
                strokeLinecap="round"
              />
            );
          })}
        </Svg>
        <View style={styles.donutCenterLabel}>
          <Text style={styles.donutCenterValue}>
            {totalVolumeKg >= 1000 ? `${(totalVolumeKg / 1000).toFixed(1)}k` : totalVolumeKg}
          </Text>
          <Text style={styles.donutCenterSub}>kg Total</Text>
        </View>
      </View>
      <View style={styles.donutLegend}>
        {donutData.map((item, idx) => (
          <View key={idx} style={styles.donutLegendRow}>
            <View style={[styles.donutDot, { backgroundColor: item.color }]} />
            <Text style={styles.donutLegendName} numberOfLines={1}>{item.muscle}</Text>
            <Text style={styles.donutLegendPercent}>{item.percent}%</Text>
          </View>
        ))}
      </View>
    </View>
  );
});

export default GymProgressDonut;
