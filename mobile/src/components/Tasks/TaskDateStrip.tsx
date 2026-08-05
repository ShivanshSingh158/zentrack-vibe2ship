import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import AnimatedPressable from '../AnimatedPressable';

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

export const TaskDateStrip = React.memo(function TaskDateStrip({ selectedDate, onSelectDate, taskDates, style }: TaskDateStripProps) {
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
        {dates.map((d, i) => {
          const isActive = d.active;
          return (
            <AnimatedPressable
              key={i}
              style={[styles.dateItem, isActive && styles.dateItemActive]}
              onPress={() => onSelectDate(d.dateStr)}
            >
              <Text style={[styles.dateDay, isActive && styles.dateDayActive]}>
                {d.dayShort}
              </Text>
              <Text style={[styles.dateNum, isActive && styles.dateNumActive]}>
                {d.dateNum}
              </Text>
              {/* Dot indicator */}
              <View style={[styles.dot, isActive ? styles.dotActive : null, taskDates?.has(d.dateStr) ? styles.dotVisible : null]} />
            </AnimatedPressable>
          );
        })}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    paddingTop: 8,
    paddingBottom: 16,
    backgroundColor: '#000000',
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
    color: '#FFFFFF',
  },
  monthYearText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    color: '#8E8E93',
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
    backgroundColor: '#141416',
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  dateItemActive: {
    backgroundColor: '#A599FF',
    borderColor: '#A599FF',
  },
  dateDay: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    color: '#8E8E93',
    marginBottom: 4,
  },
  dateDayActive: {
    color: '#000000',
  },
  dateNum: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: '#F2F2F7',
  },
  dateNumActive: {
    color: '#000000',
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#636366',
    marginTop: 4,
    opacity: 0, // hidden by default, can be toggled
  },
  dotVisible: {
    opacity: 1,
  },
  dotActive: {
    backgroundColor: '#000000',
  }
});
