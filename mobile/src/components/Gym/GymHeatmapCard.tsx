import React, { useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';

export interface HeatmapDay {
  date: Date;
  dateStr: string;
  isFuture: boolean;
  intensity: number;
  log: any;
}

export interface GymHeatmapCardProps {
  heatmapData: HeatmapDay[][];
  onSelectDay: (dateStr: string) => void;
  styles: any;
  isDark: boolean;
}

export const GymHeatmapCard: React.FC<GymHeatmapCardProps> = React.memo(({
  heatmapData,
  onSelectDay,
  styles,
  isDark,
}) => {
  const scrollViewRef = useRef<ScrollView>(null);

  return (
    <View style={styles.heatmapCard}>
      <Text style={styles.heatmapTitle}>Activity</Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 10 }}
        ref={scrollViewRef}
        onContentSizeChange={() => {
          scrollViewRef.current?.scrollToEnd({ animated: false });
        }}
      >
        <View style={styles.gridContainer}>
          {/* Day Labels */}
          <View style={styles.dayLabels}>
            <Text style={styles.dayLabelText}>S</Text>
            <Text style={styles.dayLabelText}>M</Text>
            <Text style={styles.dayLabelText}>T</Text>
            <Text style={styles.dayLabelText}>W</Text>
            <Text style={styles.dayLabelText}>T</Text>
            <Text style={styles.dayLabelText}>F</Text>
            <Text style={styles.dayLabelText}>S</Text>
          </View>

          {/* Grid */}
          <View style={styles.grid}>
            {heatmapData.map((week, wIdx) => (
              <View key={`w-${wIdx}`} style={styles.column}>
                {week.map((day, dIdx) => (
                  <TouchableOpacity
                    key={`d-${dIdx}`}
                    disabled={!day.log || day.isFuture}
                    onPress={() => {
                      if (day.log) {
                        onSelectDay(day.log.date);
                      }
                    }}
                    style={[
                      styles.square,
                      day.isFuture && { backgroundColor: 'transparent' },
                      !day.isFuture && day.intensity === 0 && {
                        backgroundColor: isDark ? '#2C2C2E' : '#E2E1EA',
                      },
                      !day.isFuture && day.intensity > 0 && {
                        backgroundColor: isDark
                          ? `rgba(196, 144, 255, ${day.intensity})`
                          : `rgba(108, 92, 231, ${day.intensity})`,
                      },
                    ]}
                  />
                ))}
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      {/* Legend */}
      <View style={styles.legendRow}>
        <Text style={styles.legendText}>Less</Text>
        <View style={[styles.legendSquare, { backgroundColor: isDark ? '#2C2C2E' : '#E2E1EA' }]} />
        <View style={[styles.legendSquare, { backgroundColor: isDark ? 'rgba(196, 144, 255, 0.3)' : 'rgba(108, 92, 231, 0.3)' }]} />
        <View style={[styles.legendSquare, { backgroundColor: isDark ? 'rgba(196, 144, 255, 0.6)' : 'rgba(108, 92, 231, 0.6)' }]} />
        <View style={[styles.legendSquare, { backgroundColor: isDark ? 'rgba(196, 144, 255, 1.0)' : 'rgba(108, 92, 231, 1.0)' }]} />
        <Text style={styles.legendText}>More</Text>
      </View>
    </View>
  );
});

export default GymHeatmapCard;
