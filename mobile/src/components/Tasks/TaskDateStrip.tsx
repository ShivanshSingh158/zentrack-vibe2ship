import React, { useMemo, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import AnimatedPressable from '../AnimatedPressable';
import { useTheme } from '../../contexts/ThemeContext';

export interface DateObj {
  dateStr: string;
  month: string;
  year: string;
  dateNum: string;
  dayFull: string;
  dayShort: string;
  active: boolean;
  isToday: boolean;
}

interface TaskDateStripProps {
  selectedDate: string;
  onSelectDate: (date: string) => void;
  taskDates?: Set<string>;
  style?: any;
}

const generateDates = (baseDateStr: string) => {
  const dates: DateObj[] = [];
  const base = new Date(baseDateStr + 'T00:00:00');
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const dayFullNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayShortNames = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  
  // Find Sunday of the current week (or center around selected date)
  // The image shows a sequence of 7 days.
  for (let i = -3; i <= 3; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    
    dates.push({
      dateStr,
      month: months[d.getMonth()],
      year: d.getFullYear().toString(),
      dateNum: d.getDate().toString(),
      dayFull: dayFullNames[d.getDay()],
      dayShort: dayShortNames[d.getDay()],
      active: i === 0,
      isToday: dateStr === todayStr
    });
  }
  return dates;
};

const DatePillItem = React.memo(function DatePillItem({
  dateObj,
  taskDates,
  onSelectDate,
  colors,
  styles,
}: {
  dateObj: DateObj;
  taskDates?: Set<string>;
  onSelectDate: (dateStr: string) => void;
  colors: any;
  styles: any;
}) {
  const isActive = dateObj.active;
  const numScale = useSharedValue(isActive ? 1.08 : 1);

  React.useEffect(() => {
    if (isActive) {
      numScale.value = withSequence(
        withTiming(1.08, { duration: 100, easing: Easing.out(Easing.cubic) }),
        withSpring(1.0, { damping: 26, stiffness: 260 })
      );
    } else {
      numScale.value = withTiming(1, { duration: 140, easing: Easing.out(Easing.cubic) });
    }
  }, [isActive]);

  const animNumStyle = useAnimatedStyle(() => ({
    transform: [{ scale: numScale.value }],
  }));

  const handlePress = useCallback(() => {
    Haptics.selectionAsync();
    onSelectDate(dateObj.dateStr);
  }, [onSelectDate, dateObj.dateStr]);

  return (
    <AnimatedPressable
      style={[styles.dateItem, isActive && styles.dateItemActive]}
      scaleTo={0.95}
      onPress={handlePress}
    >
      <Text style={[styles.dateDay, isActive && styles.dateDayActive, dateObj.isToday && !isActive && { color: colors.accentPrimary }]}>
        {dateObj.dayShort}
      </Text>
      <Animated.Text
        style={[
          styles.dateNum,
          isActive && styles.dateNumActive,
          dateObj.isToday && !isActive && { color: colors.accentPrimary },
          animNumStyle,
        ]}
      >
        {dateObj.dateNum}
      </Animated.Text>
      {/* Dot indicator */}
      <View style={[
        styles.dot, 
        isActive ? styles.dotActive : null, 
        taskDates?.has(dateObj.dateStr) ? styles.dotVisible : null,
        dateObj.isToday && !isActive && { backgroundColor: colors.accentPrimary }
      ]} />
    </AnimatedPressable>
  );
});

export const TaskDateStrip = React.memo(function TaskDateStrip({ selectedDate, onSelectDate, taskDates, style }: TaskDateStripProps) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const dates = useMemo(() => generateDates(selectedDate), [selectedDate]);
  
  // Extract month and year from the selected date (which is at index 3 in our -3 to +3 array)
  const activeDateObj = dates[3];

  return (
    <View style={[styles.container, style]}>
      {/* Header Row: Friday  July 2026 */}
      <View style={styles.headerRow}>
        <Text style={styles.dayFullText}>{activeDateObj.dayFull}</Text>
        <Text style={styles.monthYearText}>{activeDateObj.month} {activeDateObj.year}</Text>
      </View>
      
      {/* Dates Row */}
      <View style={styles.dateRow}>
        {dates.map((d, i) => (
          <DatePillItem
            key={i}
            dateObj={d}
            taskDates={taskDates}
            onSelectDate={onSelectDate}
            colors={colors}
            styles={styles}
          />
        ))}
      </View>
    </View>
  );
});

const makeStyles = (colors: any, isDark: boolean = true) => StyleSheet.create({
  container: {
    paddingTop: 8,
    paddingBottom: 4,
    backgroundColor: 'transparent',
    width: '100%',
  },
  headerRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 12,
    paddingHorizontal: 8,
  },
  dayFullText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 16,
    color: colors.textPrimary,
  },
  monthYearText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: colors.textTertiary,
  },
  dateRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
    paddingHorizontal: 8,
  },
  dateItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: 56,
    borderRadius: 12,
    backgroundColor: isDark ? '#141416' : colors.surface,
    borderWidth: 1,
    borderColor: isDark ? '#2C2C2E' : colors.border,
  },
  dateItemActive: {
    backgroundColor: colors.accentPrimary,
    borderColor: colors.accentPrimary,
  },
  dateDay: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    color: colors.textTertiary,
    marginBottom: 4,
  },
  dateDayActive: {
    color: isDark ? '#000000' : '#FFFFFF',
    fontWeight: '700',
  },
  dateNum: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: colors.textPrimary,
  },
  dateNumActive: {
    color: isDark ? '#000000' : '#FFFFFF',
    fontWeight: '700',
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: colors.textTertiary,
    marginTop: 4,
    opacity: 0, // hidden by default, can be toggled
  },
  dotVisible: {
    opacity: 1,
  },
  dotActive: {
    backgroundColor: isDark ? '#000000' : '#FFFFFF',
  }
});
