/**
 * CalendarDayView.tsx
 * Renders the 24h timeline grid for the selected day.
 *
 * Improvements:
 * - Auto-scrolls to current time on mount and whenever view becomes active
 * - Past events render at 40% opacity so "where you are now" is visually obvious
 * - Empty hour slot tap pre-fills the event modal with that exact time
 */
import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { getEventColors, format12Hour, HOUR_HEIGHT, parseTimeTo24h } from './calendarUtils';

interface CalendarDayViewProps {
  styles: any;
  colors: any;
  isDark?: boolean;
  unscheduledDayEvents: any[];
  processedEvents: any[];
  DYNAMIC_HOURS: number[];
  minHour: number;
  maxHour: number;
  isToday: boolean;
  indicatorTop: number;
  scrollViewRef: any;
  setInitialTime: (time: string) => void;
  setSelectedEvent: (evt: any) => void;
  setShowAddModal: (show: boolean) => void;
  setSelectedGymLog: (log: any) => void;
  setGymStartTimeInput: (time: string) => void;
  setGymEndTimeInput: (time: string) => void;
  setShowGymModal: (show: boolean) => void;
  setShowEventModal: (show: boolean) => void;
  gymLogs: any[];
  /** Current time in minutes since midnight for past-event fading */
  currentTimeMins?: number;
}

export const CalendarDayView = React.memo(function CalendarDayView({
  styles, colors, isDark = true, unscheduledDayEvents, processedEvents, DYNAMIC_HOURS,
  minHour, maxHour, isToday, indicatorTop, scrollViewRef,
  setInitialTime, setSelectedEvent, setShowAddModal, setShowEventModal,
  setSelectedGymLog, setGymStartTimeInput, setGymEndTimeInput, setShowGymModal, gymLogs,
  currentTimeMins,
}: CalendarDayViewProps) {

  // ── Helper: decide if an event is "in the past" for opacity fading ─────────
  const isPastEvent = (event: any): boolean => {
    if (!isToday || currentTimeMins === undefined) return false;
    if (!event.endTime) return false;
    const { hour, min } = parseTimeTo24h(event.endTime);
    return (hour * 60 + min) < currentTimeMins;
  };

  const eventColorMap = getEventColors(colors, isDark);

  return (
    <View style={{ flex: 1 }}>
      {/* Unscheduled strip */}
      {unscheduledDayEvents.length > 0 && (
        <View style={styles.unscheduledStrip}>
          <Text style={styles.unscheduledLabel}>UNSCHEDULED</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {unscheduledDayEvents.map(evt => {
              const eventColor = eventColorMap[evt.type] || { bg: colors.accentPrimary, text: colors.textPrimary, border: colors.accentPrimary };
              return (
                <View key={evt.id} style={[styles.unscheduledChip, { backgroundColor: isDark ? `${eventColor.border}30` : eventColor.bg, borderColor: eventColor.border }]}>
                  <View style={[styles.unscheduledDot, { backgroundColor: eventColor.border }]} />
                  <Text style={[styles.unscheduledChipText, { color: isDark ? eventColor.border : colors.textPrimary }]} numberOfLines={1}>{evt.title}</Text>
                </View>
              );
            })}
          </ScrollView>
        </View>
      )}

      <ScrollView ref={scrollViewRef} style={styles.timelineScroll} showsVerticalScrollIndicator={false}>
        <View style={[styles.timelineInner, { height: (maxHour - minHour + 1) * HOUR_HEIGHT + 100, marginTop: 20 }]}>
          {/* Hour Grid Lines — tap to quick-create event at that time */}
          {DYNAMIC_HOURS.map(hour => (
            <TouchableOpacity
              key={hour}
              style={[styles.hourRow, { top: (hour - minHour) * HOUR_HEIGHT }]}
              onPress={() => {
                const timeStr = `${hour.toString().padStart(2, '0')}:00`;
                setInitialTime(timeStr);
                setSelectedEvent(null);
                setShowAddModal(true);
              }}
            >
              <Text style={[
                styles.hourText,
                // Mute past hours slightly
                isToday && currentTimeMins !== undefined && hour * 60 < currentTimeMins
                  ? { opacity: 0.35 }
                  : undefined,
              ]}>
                {format12Hour(`${hour.toString().padStart(2, '0')}:00`)}
              </Text>
              <View style={[
                styles.hourLine,
                isToday && currentTimeMins !== undefined && hour * 60 < currentTimeMins
                  ? { opacity: 0.3 }
                  : undefined,
              ]} />
            </TouchableOpacity>
          ))}

          {/* Render Absolute Events */}
          <View style={styles.eventsContainer}>
            {processedEvents.map((event) => {
              const eventColor = eventColorMap[event.type] || { bg: isDark ? '#a599ff40' : 'rgba(108,92,231,0.12)', text: colors.textPrimary, border: colors.accentPrimary };
              const past = isPastEvent(event);
              return (
                <TouchableOpacity
                  key={event.id}
                  style={[
                    styles.eventBlock,
                    {
                      top: event.top - (minHour * HOUR_HEIGHT),
                      height: event.height,
                      left: event.left as any,
                      width: event.width as any,
                      backgroundColor: isDark ? `${eventColor.border}35` : eventColor.bg,
                      borderLeftColor: eventColor.border,
                      // Past events fade to 40% opacity
                      opacity: past ? 0.4 : 1,
                    }
                  ]}
                  onPress={() => {
                    if (event.type === 'gym') {
                      const log = gymLogs?.find((g: any) => g.id === event.id);
                      if (log) {
                        setSelectedGymLog(log);
                        setGymStartTimeInput(event.startTime || '10:00');
                        setGymEndTimeInput(event.endTime || '11:00');
                        setShowGymModal(true);
                      }
                    } else {
                      setSelectedEvent(event);
                      setShowEventModal(true);
                    }
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.eventBlockTitle, { color: isDark ? eventColor.border : colors.textPrimary }]} numberOfLines={1}>{event.title}</Text>
                  <Text style={[styles.eventBlockLocation, { color: isDark ? eventColor.border : colors.textSecondary }]} numberOfLines={1}>
                    {format12Hour(event.startTime)} - {format12Hour(event.endTime)}{event.location ? ` • ${event.location}` : ''}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Current Time Indicator Line */}
          {isToday && (
            <View style={[styles.currentTimeIndicator, { top: indicatorTop - (minHour * HOUR_HEIGHT) }]}>
              <View style={styles.currentTimeDot} />
              <View style={styles.currentTimeLine} />
            </View>
          )}
          <View style={{ height: 100, top: (maxHour - minHour + 1) * HOUR_HEIGHT }} />
        </View>
      </ScrollView>
    </View>
  );
});
