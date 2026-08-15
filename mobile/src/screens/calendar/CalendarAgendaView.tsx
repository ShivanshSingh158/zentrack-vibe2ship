/**
 * CalendarAgendaView.tsx
 * Renders the Foldable / Expandable Month View.
 *
 * Improvements:
 * - Month Density Heat Map: day cells are color-tinted by event count
 *   (0 = none, 1-2 = faint, 3-5 = medium, 6+ = bright/hot)
 * - Today circle outline + selected day fill
 */
import React from 'react';
import { View, Text, TouchableOpacity, FlatList } from 'react-native';
import { CalendarProvider, ExpandableCalendar } from 'react-native-calendars';
import { getEventColors, format12Hour } from './calendarUtils';
import { formatDateFull } from '../../utils/dateUtils';
import { FONT_FAMILY } from '../../theme/tokens';

interface CalendarAgendaViewProps {
  styles: any;
  colors: any;
  currentView: 'Day' | 'Week' | 'Month';
  isMonthDropdownOpen?: boolean;
  selectedDate: string;
  markedDates: any;
  dayEvents: any[];
  ALL_MONTHS?: string[];
  currentMonthIdx?: number;
  setSelectedDate: (date: string) => void;
  setIsMonthDropdownOpen?: (open: boolean) => void;
  agendaScrollRef?: any;
  setSelectedEvent: (evt: any) => void;
  setShowEventModal: (show: boolean) => void;
  setSelectedGymLog: (log: any) => void;
  setGymStartTimeInput: (time: string) => void;
  setGymEndTimeInput: (time: string) => void;
  setShowGymModal: (show: boolean) => void;
  gymLogs: any[];
  /** event count per date string — drives heat map coloring */
  eventCountByDate?: Record<string, number>;
}

// ── Heat map color tier based on event count ───────────────────────────────────
function getDensityTint(count: number): string | undefined {
  if (count === 0 || count === undefined) return undefined;
  if (count <= 2) return 'rgba(165,153,255,0.10)'; // faint purple
  if (count <= 5) return 'rgba(165,153,255,0.22)'; // medium purple
  return 'rgba(165,153,255,0.38)';                  // hot purple — very busy day
}

const CalendarAgendaView = React.memo(function CalendarAgendaView({
  styles, colors, selectedDate, currentView,
  setSelectedDate, markedDates, dayEvents, setSelectedGymLog,
  setGymStartTimeInput, setGymEndTimeInput, setShowGymModal,
  setShowEventModal, setSelectedEvent, gymLogs,
  eventCountByDate = {},
}: CalendarAgendaViewProps) {

  const todayStr = new Date().toISOString().slice(0, 10);

  // ── Custom Day Cell with heat map tint ────────────────────────────────────
  const renderDay = (dayProps: any) => {
    const dateStr = dayProps.date?.dateString as string | undefined;
    if (!dateStr) return <View style={{ width: 32, height: 32 }} />;

    const count = eventCountByDate[dateStr] || 0;
    const tint = getDensityTint(count);
    const isSelected = dateStr === selectedDate;
    const isToday = dateStr === todayStr;
    const marked = markedDates[dateStr];
    const dots: any[] = marked?.dots || [];

    return (
      <TouchableOpacity
        onPress={() => setSelectedDate(dateStr)}
        activeOpacity={0.7}
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          alignItems: 'center',
          justifyContent: 'center',
          // Selected: solid accent fill
          backgroundColor: isSelected
            ? (colors.accentPrimary || '#a599ff')
            : (tint || 'transparent'),
          // Today: accent border outline (only when not selected)
          borderWidth: isToday && !isSelected ? 1.5 : 0,
          borderColor: colors.accentPrimary || '#a599ff',
        }}
      >
        <Text style={{
          fontSize: 13,
          fontFamily: FONT_FAMILY.bold,
          color: isSelected
            ? '#000000'
            : (isToday ? (colors.accentPrimary || '#a599ff') : (colors.textPrimary || '#fff')),
        }}>
          {dayProps.date?.day}
        </Text>
        {/* Dot row for events */}
        {dots.length > 0 && !isSelected && (
          <View style={{ flexDirection: 'row', gap: 2, marginTop: 1 }}>
            {dots.slice(0, 3).map((dot: any, i: number) => (
              <View
                key={i}
                style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: dot.color || '#a599ff' }}
              />
            ))}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderMonthEventItem = ({ item }: { item: any }) => {
    const typeColor = getEventColors(colors)[item.type]?.bg || '#a599ff';
    return (
      <TouchableOpacity
        style={[styles.monthEventRow, { borderLeftColor: typeColor }]}
        activeOpacity={0.7}
        onPress={() => {
          if (item.type === 'gym') {
            const log = gymLogs?.find(g => g.id === item.id);
            if (log) {
              setSelectedGymLog(log);
              setGymStartTimeInput(item.startTime || '10:00');
              setGymEndTimeInput(item.endTime || '11:00');
              setShowGymModal(true);
            }
          } else {
            setSelectedEvent(item); setShowEventModal(true);
          }
        }}
      >
        <Text style={[styles.monthEventTitle, { color: typeColor }]} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.monthEventTime}>{format12Hour(item.startTime)} - {format12Hour(item.endTime)}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <CalendarProvider
        date={selectedDate}
        onDateChanged={(date: string) => setSelectedDate(date)}
        showTodayButton={false}
        theme={{ todayButtonTextColor: colors.accentPrimary }}
      >
        <ExpandableCalendar
          initialPosition={ExpandableCalendar.positions.OPEN}
          allowShadow={false}
          firstDay={1}
          horizontal={true}
          enableSwipeMonths={true}
          onMonthChange={(month: any) => {
            if (month?.dateString) setSelectedDate(month.dateString);
          }}
          markingType={'multi-dot'}
          markedDates={markedDates}
          hideKnob={false}
          renderHeader={() => null}
          // Custom day component — renders density heat map tint + dots
          dayComponent={renderDay}
          theme={{
            backgroundColor: colors.background,
            calendarBackground: colors.background,
            textSectionTitleColor: colors.textMuted,
            selectedDayBackgroundColor: colors.accentPrimary,
            selectedDayTextColor: '#000000',
            todayTextColor: colors.accentPrimary,
            dayTextColor: colors.textPrimary,
            textDisabledColor: colors.border,
            dotColor: colors.accentPrimary,
            selectedDotColor: '#000000',
            arrowColor: colors.accentPrimary,
            monthTextColor: colors.textPrimary,
            textDayFontFamily: FONT_FAMILY.body,
            textDayHeaderFontFamily: FONT_FAMILY.medium,
            textDayFontSize: 15,
            textDayHeaderFontSize: 12,
            'stylesheet.expandable.main': {
              knob: {
                width: 38,
                height: 4,
                borderRadius: 2,
                backgroundColor: 'rgba(255, 255, 255, 0.2)',
                alignSelf: 'center',
                marginVertical: 6,
              },
              knobContainer: {
                height: 20,
                justifyContent: 'center',
                alignItems: 'center',
                backgroundColor: colors.background,
              },
            },
            'stylesheet.calendar.header': {
              header: { height: 0, opacity: 0, margin: 0, padding: 0 },
              week: { marginTop: 4, marginBottom: 6, flexDirection: 'row', justifyContent: 'space-around' }
            }
          } as any}
        />
        <View style={styles.monthEventListContainer}>
          <Text style={styles.monthEventListHeader}>{formatDateFull(selectedDate).toUpperCase()}</Text>
          <FlatList
            data={dayEvents}
            keyExtractor={item => item.id}
            renderItem={renderMonthEventItem}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 100 }}
            ListEmptyComponent={<Text style={styles.emptyText}>No events on this day.</Text>}
          />
        </View>
      </CalendarProvider>
    </View>
  );
});

export default CalendarAgendaView;
