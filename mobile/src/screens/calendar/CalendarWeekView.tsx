/**
 * CalendarWeekView.tsx
 * Renders the 7-day timeline grid for the selected week with column headers.
 *
 * Improvements:
 * - Past day columns fade to 40% opacity (days before today)
 * - Week event blocks show 1 line title + time sub-text (proper truncation)
 * - Today column has a soft purple tint highlight
 */
import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { getEventColors, format12Hour, HOUR_HEIGHT } from './calendarUtils';
import { FONT_FAMILY } from '../../theme/tokens';

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

export const CalendarWeekView = React.memo(function CalendarWeekView({
  styles, colors, weekEvents, minHour, maxHour, DYNAMIC_HOURS,
  indicatorTop, selectedDate, nowDateStr, setSelectedDate, setCurrentView
}: CalendarWeekViewProps) {
  const weekDays = useMemo(() => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    const sel = new Date(y, m - 1, d);
    const sunday = new Date(sel);
    sunday.setDate(sel.getDate() - sel.getDay());

    return Array.from({ length: 7 }, (_, i) => {
      const cur = new Date(sunday);
      cur.setDate(sunday.getDate() + i);
      const yyyy = cur.getFullYear();
      const mm = (cur.getMonth() + 1).toString().padStart(2, '0');
      const dd = cur.getDate().toString().padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;
      return {
        dateStr,
        dateNum: cur.getDate(),
        isToday: dateStr === nowDateStr,
        isSelected: dateStr === selectedDate,
        isPast: dateStr < nowDateStr,
      };
    });
  }, [selectedDate, nowDateStr]);

  const DAY_LABELS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

  return (
    <View style={{ flex: 1 }}>
      {/* 7-Day Column Header Row */}
      <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border || 'rgba(255,255,255,0.06)', paddingBottom: 6, paddingTop: 4 }}>
        <View style={{ width: 40 }} />
        <View style={{ flex: 1, flexDirection: 'row' }}>
          {weekDays.map((wd, i) => (
            <TouchableOpacity
              key={i}
              style={{ flex: 1, alignItems: 'center', gap: 2, opacity: wd.isPast ? 0.45 : 1 }}
              onPress={() => {
                setSelectedDate(wd.dateStr);
                setCurrentView('Day');
              }}
              activeOpacity={0.7}
            >
              <Text style={{ fontSize: 9.5, color: colors.textMuted || '#8e8e93', fontFamily: FONT_FAMILY.bold }}>
                {DAY_LABELS[i]}
              </Text>
              <View style={{
                width: 24,
                height: 24,
                borderRadius: 12,
                backgroundColor: wd.isSelected ? (colors.accentPrimary || '#a599ff') : 'transparent',
                borderWidth: wd.isToday && !wd.isSelected ? 1.5 : 0,
                borderColor: colors.accentPrimary || '#a599ff',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <Text style={{
                  fontSize: 11.5,
                  fontFamily: FONT_FAMILY.bold,
                  color: wd.isSelected ? '#000000' : (wd.isToday ? (colors.accentPrimary || '#a599ff') : colors.textPrimary),
                }}>
                  {wd.dateNum}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <ScrollView style={styles.timelineScroll} showsVerticalScrollIndicator={false}>
        <View style={[styles.timelineInner, { flexDirection: 'row', height: (maxHour - minHour + 1) * HOUR_HEIGHT + 100, marginTop: 10 }]}>
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
              const colDay = weekDays[i];
              const isTodayCol = colDay?.isToday ?? false;
              const isPastCol = colDay?.isPast ?? false;

              return (
                <View
                  key={i}
                  style={[
                    styles.weekCol,
                    isTodayCol && styles.weekColToday,
                    // Past columns get subtle opacity reduction
                    isPastCol && { opacity: 0.4 },
                  ]}
                >
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
                    const timeLabel = event.startTime ? format12Hour(event.startTime).replace(' AM','a').replace(' PM','p') : '';
                    return (
                      <TouchableOpacity
                        key={event.id}
                        style={[
                          styles.weekEventBlock,
                          {
                            top: event.top - (minHour * HOUR_HEIGHT),
                            height: event.height,
                            backgroundColor: `${typeColor}40`,
                            borderLeftColor: typeColor,
                          }
                        ]}
                        onPress={() => { setSelectedDate(event.dateStr); setCurrentView('Day'); }}
                        activeOpacity={0.8}
                      >
                        {/* Title — 1 line, bold */}
                        <Text
                          style={[styles.weekEventTitle, { color: typeColor }]}
                          numberOfLines={1}
                          ellipsizeMode="tail"
                        >
                          {event.title}
                        </Text>
                        {/* Time sub-label — only show if block tall enough */}
                        {event.height >= 28 && timeLabel ? (
                          <Text
                            style={{ fontSize: 8, color: typeColor, opacity: 0.75, fontFamily: FONT_FAMILY.body }}
                            numberOfLines={1}
                          >
                            {timeLabel}
                          </Text>
                        ) : null}
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
});
