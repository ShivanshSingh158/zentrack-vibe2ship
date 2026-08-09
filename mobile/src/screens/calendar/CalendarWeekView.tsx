/**
 * CalendarWeekView.tsx
 * Renders the 7-day timeline grid for the selected week.
 */
import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { getEventColors, format12Hour, HOUR_HEIGHT } from './calendarUtils';

interface CalendarWeekViewProps {
  styles: any;
  colors: any;
  weekEvents: any[];
  DYNAMIC_HOURS: number[];
  minHour: number;
  maxHour: number;
  indicatorTop: number;
  selectedDate: string;
  nowDateStr: string;
  setSelectedDate: (date: string) => void;
  setCurrentView: (view: 'Day'|'Week'|'Month') => void;
}

export function CalendarWeekView({
  styles, colors, weekEvents, DYNAMIC_HOURS, minHour, maxHour,
  indicatorTop, selectedDate, nowDateStr, setSelectedDate, setCurrentView
}: CalendarWeekViewProps) {
  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={styles.timelineScroll} showsVerticalScrollIndicator={false}>
        <View style={[styles.timelineInner, { flexDirection: 'row', height: (maxHour - minHour + 1) * HOUR_HEIGHT + 100, marginTop: 20 }]}>
          {/* Hour Axis */}
          <View style={styles.weekHourAxis}>
            {DYNAMIC_HOURS.map(hour => (
              <View key={hour} style={[styles.hourRow, { top: (hour - minHour) * HOUR_HEIGHT }]}>
                <Text style={styles.weekHourText}>{format12Hour(hour + ':00').replace(' AM','a').replace(' PM','p')}</Text>
              </View>
            ))}
          </View>
          {/* 7 Columns */}
          <View style={styles.weekGrid}>
            {Array.from({length: 7}).map((_, i) => {
              const isTodayCol = new Date(selectedDate).getDay() === i && selectedDate === nowDateStr;
              return (
                <View key={i} style={[styles.weekCol, isTodayCol && styles.weekColToday]}>
                  {/* Hour Lines */}
                  {DYNAMIC_HOURS.map(hour => (
                    <View key={`hl-${hour}`} style={[styles.weekHourLine, { top: (hour - minHour) * HOUR_HEIGHT }]} />
                  ))}
                  {/* Current Time Tick */}
                  {isTodayCol && (
                    <View style={[styles.weekCurrentTimeTick, { top: indicatorTop - (minHour * HOUR_HEIGHT) }]} />
                  )}
                  {/* Events */}
                  {weekEvents.filter((e: any) => e.dayIndex === i).map((event: any) => {
                    const typeColor = getEventColors(colors)[event.type]?.bg || '#a599ff';
                    return (
                      <TouchableOpacity
                        key={event.id}
                        style={[styles.weekEventBlock, { top: event.top - (minHour * HOUR_HEIGHT), height: event.height, backgroundColor: `${typeColor}40`, borderLeftColor: typeColor }]}
                        onPress={() => { setSelectedDate(event.dateStr); setCurrentView('Day'); }}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.weekEventTitle, { color: typeColor }]} numberOfLines={1}>{event.title}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              );
            })}
          </View>
          <View style={{ height: 100, top: (maxHour - minHour + 1) * HOUR_HEIGHT, width: '100%', position: 'absolute' }} />
        </View>
      </ScrollView>
    </View>
  );
}
