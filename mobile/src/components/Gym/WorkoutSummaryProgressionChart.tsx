import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LineChart } from 'react-native-chart-kit';
import Animated from 'react-native-reanimated';
import { feedback } from '../../utils/haptics';

export interface WorkoutSummaryProgressionChartProps {
  availableLifts: string[];
  selectedLift: string;
  setSelectedLift: (lift: string) => void;
  selectedMetric: '1RM' | 'Volume';
  setSelectedMetric: (m: '1RM' | 'Volume') => void;
  chartData: any;
  streakStyle: any;
  styles: any;
  isDark: boolean;
}

export const WorkoutSummaryProgressionChart: React.FC<WorkoutSummaryProgressionChartProps> = React.memo(({
  availableLifts,
  selectedLift,
  setSelectedLift,
  selectedMetric,
  setSelectedMetric,
  chartData,
  streakStyle,
  styles,
  isDark,
}) => {
  const screenWidth = Dimensions.get('window').width;

  return (
    <Animated.View style={[styles.progressionCard, streakStyle]}>
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>90-DAY PROGRESSION</Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.pillRow}
        style={{ marginBottom: 14 }}
      >
        {availableLifts.map(lift => {
          const isActive = selectedLift.toLowerCase() === lift.toLowerCase();
          return (
            <TouchableOpacity
              key={lift}
              style={[styles.liftPill, isActive && styles.liftPillActive]}
              onPress={() => {
                feedback.tap();
                setSelectedLift(lift);
              }}
              activeOpacity={0.7}
            >
              <Text style={[styles.liftPillText, isActive && styles.liftPillTextActive]}>{lift}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={styles.segmentedControl}>
        <TouchableOpacity
          style={[styles.segmentBtn, selectedMetric === '1RM' && styles.segmentBtnActive]}
          onPress={() => {
            feedback.tap();
            setSelectedMetric('1RM');
          }}
          activeOpacity={0.7}
        >
          <Text style={[styles.segmentText, selectedMetric === '1RM' && styles.segmentTextActive]}>
            Est. 1RM (kg)
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.segmentBtn, selectedMetric === 'Volume' && styles.segmentBtnActive]}
          onPress={() => {
            feedback.tap();
            setSelectedMetric('Volume');
          }}
          activeOpacity={0.7}
        >
          <Text style={[styles.segmentText, selectedMetric === 'Volume' && styles.segmentTextActive]}>
            Total Volume (kg)
          </Text>
        </TouchableOpacity>
      </View>

      {chartData ? (
        <View style={styles.chartWrapper}>
          <LineChart
            data={chartData}
            width={screenWidth - 48}
            height={160}
            withDots={true}
            withInnerLines={true}
            withOuterLines={false}
            withVerticalLines={false}
            chartConfig={{
              backgroundColor: 'transparent',
              backgroundGradientFrom: isDark ? '#1C1C1E' : '#FFFFFF',
              backgroundGradientTo: isDark ? '#1C1C1E' : '#FFFFFF',
              decimalPlaces: 0,
              color: (opacity = 1) => isDark ? `rgba(255, 255, 255, ${opacity})` : `rgba(108, 92, 231, ${opacity})`,
              labelColor: (opacity = 1) => isDark ? `rgba(255, 255, 255, ${opacity * 0.45})` : `rgba(28, 28, 30, ${opacity * 0.6})`,
              style: { borderRadius: 12 },
              propsForBackgroundLines: { strokeDasharray: '4 4', stroke: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)' },
              propsForDots: { r: '3.5', strokeWidth: '1.5', stroke: isDark ? '#1C1C1E' : '#FFFFFF' },
            }}
            bezier
            style={styles.chartStyle}
          />
        </View>
      ) : (
        <View style={styles.emptyChartBox}>
          <View style={styles.emptyIconBadge}>
            <Ionicons name="barbell-outline" size={18} color="#8E8E93" />
          </View>
          <Text style={styles.emptyChartTitle}>No Lift History</Text>
          <Text style={styles.emptyChartText}>
            Log sets for {selectedLift} across multiple workouts to plot your 90-day strength curve.
          </Text>
        </View>
      )}
    </Animated.View>
  );
});

export default WorkoutSummaryProgressionChart;
