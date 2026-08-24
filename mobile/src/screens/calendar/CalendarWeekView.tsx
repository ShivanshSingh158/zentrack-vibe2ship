/**
 * CalendarWeekView.tsx
 * Renders the 7-day timeline grid for the selected week with column headers.
 *
 * Performance improvements:
 * - Memoized weekDays calculation and event color map
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
  isDark?: boolean;
  weekEvents: any[];
  DYNAMIC_HOURS: number[];
  minHour: number;
  maxHour: number;
  indicatorTop: number;
  selectedDate: string;
  nowDateStr: string;
  setSelectedDate: (date: string) => void;
  setCurrentView: (view: 'Day'|'Week'|'Month') => void;
  markedDates?: Record<string, { dots?: Array<{ key: string; color: string }> }>;
}

const DAY_LABELS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

export const CalendarWeekView = React.memo(function CalendarWeekView({
  styles, colors, isDark = true, weekEvents, minHour, maxHour, DYNAMIC_HOURS,
  indicatorTop, selectedDate, nowDateStr, setSelectedDate, setCurrentView,
  markedDates = {}
}: CalendarWeekViewProps) {
  const weekDays = useMemo(() => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    const sel = new Date(y, (m || 1) - 1, d || 1);
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

  const eventColorMap = useMemo(() => getEventColors(colors, isDark), [colors, isDark]);
  const timelineHeight = useMemo(() => (maxHour - minHour + 1) * HOUR_HEIGHT + 100, [maxHour, minHour]);

  return (
    <View style={{ flex: 1 }}>
      {/* 7-Day Column Header Row matching CalendarWeekStripPager */}
      <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border || 'rgba(255,255,255,0.06)', paddingBottom: 6, paddingTop: 4 }}>
        <View style={{ width: 40 }} />
        <View style={{ flex: 1, flexDirection: 'row' }}>
          {weekDays.map((wd, i) => {
            const dots = markedDates[wd.dateStr]?.dots || [];
            return (
              <TouchableOpacity
                key={wd.dateStr}
                style={{ flex: 1, alignItems: 'center', gap: 3, opacity: wd.isPast ? 0.45 : 1 }}
                onPress={() => {
                  setSelectedDate(wd.dateStr);
                  setCurrentView('Day');
                }}
                activeOpacity={0.7}
              >
                <Text style={{
                  fontSize: 10,
                  color: wd.isSelected ? colors.textPrimary : (colors.textMuted || '#8e8e93'),
                  fontFamily: FONT_FAMILY.bold,
                  letterSpacing: 0.5,
                }}>
                  {DAY_LABELS[i]}
                </Text>
                <View style={{
                  width: 36,
                  height: 40,
                  borderRadius: 12,
                  backgroundColor: wd.isSelected ? (colors.accentPrimary || '#a599ff') : 'transparent',
                  borderWidth: wd.isToday && !wd.isSelected ? 1.5 : 0,
                  borderColor: colors.accentPrimary ? `${colors.accentPrimary}80` : '#a599ff',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                }}>
                  <Text style={{
                    fontSize: 14,
                    fontFamily: wd.isSelected || wd.isToday ? FONT_FAMILY.bold : FONT_FAMILY.body,
                    color: wd.isSelected ? (isDark ? '#000000' : '#FFFFFF') : (wd.isToday ? (colors.accentPrimary || '#a599ff') : colors.textPrimary),
                  }}>
                    {wd.dateNum}
                  </Text>
                  {/* Event Dots */}
                  {dots.length > 0 && (
                    <View style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 2,
                      position: 'absolute',
                      bottom: 3,
                    }}>
                      {dots.slice(0, 3).map((dot, dotIdx) => (
                        <View
                          key={dot.key || dotIdx}
                          style={{
                            width: 3.5,
                            height: 3.5,
                            borderRadius: 2,
                            backgroundColor: wd.isSelected ? (isDark ? '#000000' : '#FFFFFF') : (dot.color || colors.accentPrimary),
                          }}
                        />
                      ))}
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <ScrollView style={styles.timelineScroll} showsVerticalScrollIndicator={false}>
        <View style={[styles.timelineInner, { flexDirection: 'row', height: timelineHeight, marginTop: 10 }]}>
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
                    const eventColor = eventColorMap[event.type] || { bg: isDark ? '#a599ff40' : 'rgba(108,92,231,0.12)', text: colors.textPrimary, border: colors.accentPrimary };
                    const timeLabel = event.startTime ? format12Hour(event.startTime).replace(' AM','a').replace(' PM','p') : '';
                    return (
                      <TouchableOpacity
                        key={event.id}
                        style={[
                          styles.weekEventBlock,
                          {
                            top: event.top - (minHour * HOUR_HEIGHT),
                            height: event.height,
                            backgroundColor: isDark ? `${eventColor.border}35` : eventColor.bg,
                            borderLeftColor: eventColor.border,
                          }
                        ]}
                        onPress={() => { setSelectedDate(event.dateStr); setCurrentView('Day'); }}
                        activeOpacity={0.8}
                      >
                        {/* Title — 1 line, bold */}
                        <Text
                          style={[styles.weekEventTitle, { color: isDark ? eventColor.border : colors.textPrimary }]}
                          numberOfLines={1}
                          ellipsizeMode="tail"
                        >
                          {event.title}
                        </Text>
                        {/* Time sub-label — only show if block tall enough */}
                        {event.height >= 28 && timeLabel ? (
                          <Text
                            style={{ fontSize: 8, color: isDark ? eventColor.border : colors.textSecondary, opacity: 0.85, fontFamily: FONT_FAMILY.body }}
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
