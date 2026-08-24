/**
 * CalendarAgendaView.tsx
 * Renders the Foldable / Expandable Month View.
 *
 * Performance improvements:
 * - Memoized AgendaDayCell component to avoid re-rendering all 35-42 calendar tiles on state changes
 * - Month Density Heat Map: day cells are color-tinted by event count (0 = none, 1-2 = faint, 3-5 = medium, 6+ = bright/hot)
 * - Today circle outline + selected day fill
 * - Virtualized FlatList with initialNumToRender=10 and windowSize=5
 */
import React, { useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, FlatList } from 'react-native';
import { CalendarProvider, ExpandableCalendar } from 'react-native-calendars';
import { getEventColors, format12Hour } from './calendarUtils';
import { formatDateFull, formatLocalDateStr } from '../../utils/dateUtils';
import { FONT_FAMILY } from '../../theme/tokens';

interface CalendarAgendaViewProps {
  styles: any;
  colors: any;
  isDark?: boolean;
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
function getDensityTint(count: number, isDark: boolean = true): string | undefined {
  if (count === 0 || count === undefined) return undefined;
  if (isDark) {
    if (count <= 2) return 'rgba(165,153,255,0.10)'; // faint purple
    if (count <= 5) return 'rgba(165,153,255,0.22)'; // medium purple
    return 'rgba(165,153,255,0.38)';                  // hot purple
  }
  if (count <= 2) return 'rgba(108,92,231,0.08)';  // faint lilac
  if (count <= 5) return 'rgba(108,92,231,0.18)';  // medium lilac
  return 'rgba(108,92,231,0.30)';                   // rich royal lilac
}

interface AgendaDayCellProps {
  dateStr?: string;
  dayNum?: number;
  count: number;
  isSelected: boolean;
  isToday: boolean;
  dots: any[];
  onPress: (dateStr: string) => void;
  colors: any;
  isDark: boolean;
}

const AgendaDayCell = React.memo(function AgendaDayCell({
  dateStr,
  dayNum,
  count,
  isSelected,
  isToday,
  dots,
  onPress,
  colors,
  isDark,
}: AgendaDayCellProps) {
  if (!dateStr) return <View style={{ width: 32, height: 32 }} />;

  const tint = getDensityTint(count, isDark);

  return (
    <TouchableOpacity
      onPress={() => onPress(dateStr)}
      activeOpacity={0.7}
      style={{
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: isSelected
          ? (colors.accentPrimary || '#a599ff')
          : (tint || 'transparent'),
        borderWidth: isToday && !isSelected ? 1.5 : 0,
        borderColor: colors.accentPrimary || '#a599ff',
      }}
    >
      <Text
        style={{
          fontSize: 13,
          fontFamily: FONT_FAMILY.bold,
          color: isSelected
            ? (isDark ? '#000000' : '#FFFFFF')
            : (isToday ? (colors.accentPrimary || '#a599ff') : (colors.textPrimary || '#fff')),
        }}
      >
        {dayNum}
      </Text>
      {dots.length > 0 && !isSelected && (
        <View style={{ flexDirection: 'row', gap: 2, marginTop: 1 }}>
          {dots.slice(0, 3).map((dot: any, i: number) => (
            <View
              key={dot.key || i}
              style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: dot.color || colors.accentPrimary }}
            />
          ))}
        </View>
      )}
    </TouchableOpacity>
  );
});

const CalendarAgendaView = React.memo(function CalendarAgendaView({
  styles, colors, isDark = true, selectedDate, currentView,
  setSelectedDate, markedDates, dayEvents, setSelectedGymLog,
  setGymStartTimeInput, setGymEndTimeInput, setShowGymModal,
  setShowEventModal, setSelectedEvent, gymLogs,
  eventCountByDate = {},
}: CalendarAgendaViewProps) {

  const todayStr = useMemo(() => formatLocalDateStr(new Date()), []);
  const eventColorMap = useMemo(() => getEventColors(colors, isDark), [colors, isDark]);

  const handleDayPress = useCallback((dateStr: string) => {
    setSelectedDate(dateStr);
  }, [setSelectedDate]);

  // ── Custom Day Cell with heat map tint (memoized) ─────────────────────────
  const renderDay = useCallback((dayProps: any) => {
    const dateStr = dayProps.date?.dateString as string | undefined;
    if (!dateStr) return <View style={{ width: 32, height: 32 }} />;

    const count = eventCountByDate[dateStr] || 0;
    const isSelected = dateStr === selectedDate;
    const isToday = dateStr === todayStr;
    const marked = markedDates[dateStr];
    const dots: any[] = marked?.dots || [];

    return (
      <AgendaDayCell
        dateStr={dateStr}
        dayNum={dayProps.date?.day}
        count={count}
        isSelected={isSelected}
        isToday={isToday}
        dots={dots}
        onPress={handleDayPress}
        colors={colors}
        isDark={isDark}
      />
    );
  }, [eventCountByDate, selectedDate, todayStr, markedDates, handleDayPress, colors, isDark]);

  const renderMonthEventItem = useCallback(({ item }: { item: any }) => {
    const eventColor = eventColorMap[item.type] || { bg: colors.surface, text: colors.textPrimary, border: colors.accentPrimary };
    return (
      <TouchableOpacity
        style={[styles.monthEventRow, { borderLeftColor: eventColor.border }]}
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
            setSelectedEvent(item);
            setShowEventModal(true);
          }
        }}
      >
        <Text style={[styles.monthEventTitle, { color: isDark ? eventColor.border : colors.textPrimary }]} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.monthEventTime}>
          {format12Hour(item.startTime)} - {format12Hour(item.endTime)}
        </Text>
      </TouchableOpacity>
    );
  }, [eventColorMap, colors.surface, colors.textPrimary, colors.accentPrimary, styles.monthEventRow, styles.monthEventTitle, styles.monthEventTime, isDark, gymLogs, setSelectedGymLog, setGymStartTimeInput, setGymEndTimeInput, setShowGymModal, setSelectedEvent, setShowEventModal]);

  const keyExtractor = useCallback((item: any) => item.id, []);

  const headerTitle = useMemo(() => formatDateFull(selectedDate).toUpperCase(), [selectedDate]);

  return (
    <View style={{ flex: 1 }}>
      <CalendarProvider
        date={selectedDate}
        onDateChanged={setSelectedDate}
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
          dayComponent={renderDay}
          theme={{
            backgroundColor: colors.background,
            calendarBackground: colors.background,
            textSectionTitleColor: colors.textMuted,
            selectedDayBackgroundColor: colors.accentPrimary,
            selectedDayTextColor: isDark ? '#000000' : '#FFFFFF',
            todayTextColor: colors.accentPrimary,
            dayTextColor: colors.textPrimary,
            textDisabledColor: colors.border,
            dotColor: colors.accentPrimary,
            selectedDotColor: isDark ? '#000000' : '#FFFFFF',
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
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)',
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
          <Text style={styles.monthEventListHeader}>{headerTitle}</Text>
          <FlatList
            data={dayEvents}
            keyExtractor={keyExtractor}
            renderItem={renderMonthEventItem}
            showsVerticalScrollIndicator={false}
            initialNumToRender={10}
            maxToRenderPerBatch={10}
            windowSize={5}
            contentContainerStyle={{ paddingBottom: 100 }}
            ListEmptyComponent={<Text style={styles.emptyText}>No events on this day.</Text>}
          />
        </View>
      </CalendarProvider>
    </View>
  );
});

export default CalendarAgendaView;
