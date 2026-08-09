/**
 * CalendarDayView.tsx
 * Renders the 24h timeline grid for the selected day.
 */
import React from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { getEventColors, format12Hour, HOUR_HEIGHT } from './calendarUtils';

interface CalendarDayViewProps {
  styles: any;
  colors: any;
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
}

export function CalendarDayView({
  styles, colors, unscheduledDayEvents, processedEvents, DYNAMIC_HOURS,
  minHour, maxHour, isToday, indicatorTop, scrollViewRef,
  setInitialTime, setSelectedEvent, setShowAddModal, setShowEventModal,
  setSelectedGymLog, setGymStartTimeInput, setGymEndTimeInput, setShowGymModal, gymLogs
}: CalendarDayViewProps) {
  return (
    <View style={{ flex: 1 }}>
      {/* Unscheduled strip */}
      {unscheduledDayEvents.length > 0 && (
        <View style={styles.unscheduledStrip}>
          <Text style={styles.unscheduledLabel}>UNSCHEDULED</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {unscheduledDayEvents.map(evt => {
              const typeColor = getEventColors(colors)[evt.type]?.bg || '#a599ff';
              return (
                <View key={evt.id} style={[styles.unscheduledChip, { backgroundColor: `${typeColor}30`, borderColor: typeColor }]}>
                  <View style={[styles.unscheduledDot, { backgroundColor: typeColor }]} />
                  <Text style={[styles.unscheduledChipText, { color: typeColor }]} numberOfLines={1}>{evt.title}</Text>
                </View>
              );
            })}
          </ScrollView>
        </View>
      )}

      <ScrollView ref={scrollViewRef} style={styles.timelineScroll} showsVerticalScrollIndicator={false}>
        <View style={[styles.timelineInner, { height: (maxHour - minHour + 1) * HOUR_HEIGHT + 100, marginTop: 20 }]}>
          {/* Hour Grid Lines */}
          {DYNAMIC_HOURS.map(hour => (
            <TouchableOpacity 
              key={hour} 
              style={[styles.hourRow, { top: (hour - minHour) * HOUR_HEIGHT }]}
              onPress={() => {
                setInitialTime(`${hour.toString().padStart(2, '0')}:00`);
                setSelectedEvent(null);
                setShowAddModal(true);
              }}
            >
              <Text style={styles.hourText}>{format12Hour(`${hour.toString().padStart(2, '0')}:00`)}</Text>
              <View style={styles.hourLine} />
            </TouchableOpacity>
          ))}

          {/* Render Absolute Events */}
          <View style={styles.eventsContainer}>
            {processedEvents.map((event) => {
              const typeColor = getEventColors(colors)[event.type]?.bg || '#a599ff';
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
                      backgroundColor: `${typeColor}40`,
                      borderLeftColor: typeColor
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
                  <Text style={[styles.eventBlockTitle, { color: typeColor }]} numberOfLines={1}>{event.title}</Text>
                  <Text style={[styles.eventBlockLocation, { color: typeColor }]} numberOfLines={1}>
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
}
