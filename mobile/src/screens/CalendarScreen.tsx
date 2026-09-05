import React, { useState, useMemo, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Dimensions, LayoutAnimation, UIManager, Platform, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Calendar } from 'react-native-calendars';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS, SHADOW } from '../theme/tokens';
import { AddEventModal } from '../components/Calendar/AddEventModal';
import { CalendarWeekStripPager } from '../components/Calendar/CalendarWeekStripPager';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { callGeminiProxy } from '../services/geminiProxy';
import { useTheme } from "../contexts/ThemeContext";
import AnimatedPressable from '../components/AnimatedPressable';

import * as Haptics from 'expo-haptics';
import { useCalendarData } from './calendar/useCalendarData';
import { CalendarDayView } from './calendar/CalendarDayView';
import { CalendarWeekView } from './calendar/CalendarWeekView';
import CalendarAgendaView from './calendar/CalendarAgendaView';
import { CalendarGymModal } from './calendar/CalendarGymModal';
import { EventDetailSheet } from './calendar/EventDetailSheet';
import { makeStyles } from './calendar/calendarStyles';
import { getEventColors, format12Hour, parseTimeTo24h, HOUR_HEIGHT } from './calendar/calendarUtils';
import { formatLocalDateStr } from '../utils/dateUtils';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const ALL_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function CalendarScreen() {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const navigation = useNavigation<any>();
  const [findingSlots, setFindingSlots] = useState(false);
  const [aiSlotResult, setAiSlotResult] = useState<string | null>(null);

  const data = useCalendarData();
  const {
    now, selectedDate, setSelectedDate,
    showEventModal, setShowEventModal,
    showAddModal, setShowAddModal,
    showGymModal, setShowGymModal,
    selectedEvent, setSelectedEvent,
    selectedGymLog, setSelectedGymLog,
    gymStartTimeInput, setGymStartTimeInput,
    gymEndTimeInput, setGymEndTimeInput,
    isMonthDropdownOpen, setIsMonthDropdownOpen,
    initialTime, setInitialTime,
    scrollViewRef, agendaScrollRef,
    currentTime, currentView, setCurrentView,
    timedDayEvents, unscheduledDayEvents, dayEvents, processedEvents, weekEvents,
    minHour, maxHour, DYNAMIC_HOURS,
    handleSaveGymTime,
    tasks, attendance, customEvents, gymLogs, userGymPlan,
    scrollToCurrentTime,
  } = data;

  const todayStr = useMemo(() => formatLocalDateStr(currentTime), [currentTime]);
  const isToday = selectedDate === todayStr;

  useFocusEffect(
    useCallback(() => {
      if (currentView === 'Day' && isToday) {
        const timer1 = setTimeout(() => {
          scrollToCurrentTime(false);
        }, 120);
        const timer2 = setTimeout(() => {
          scrollToCurrentTime(false);
        }, 320);
        return () => {
          clearTimeout(timer1);
          clearTimeout(timer2);
        };
      }
    }, [currentView, isToday, scrollToCurrentTime])
  );

  const [selY, selM, selD] = useMemo(() => selectedDate.split('-').map(Number), [selectedDate]);
  const selectedLocalDate = useMemo(() => new Date(selY, (selM || 1) - 1, selD || 1), [selY, selM, selD]);
  const currentMonthIdx = selectedLocalDate.getMonth();
  const monthName = useMemo(() => selectedLocalDate.toLocaleString('default', { month: 'long' }), [selectedLocalDate]);

  const toggleMonthDropdown = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setIsMonthDropdownOpen((prev) => !prev);
  }, [setIsMonthDropdownOpen]);

  const currentHour = currentTime.getHours();
  const currentMinutes = currentTime.getMinutes();
  const indicatorTop = (currentHour * HOUR_HEIGHT) + ((currentMinutes / 60) * HOUR_HEIGHT);
  const currentTimeMins = currentHour * 60 + currentMinutes;

  // Pre-indexed timetable cache: computes which day indices (0-6) have classes/labs
  const daysWithClasses = useMemo(() => {
    const hasClasses = new Array(7).fill(false);
    if (!attendance || attendance.length === 0) return hasClasses;

    for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
      for (let s = 0; s < attendance.length; s++) {
        const subj = attendance[s];
        const sch =
          subj.schedule?.[dayIdx.toString()] ||
          subj.schedule?.[dayIdx] ||
          subj.schedule?.[DAY_NAMES[dayIdx]] ||
          subj.schedule?.[DAY_NAMES[dayIdx].toLowerCase()];
        if (
          sch &&
          ((sch.classes && sch.classes.length > 0) ||
            (sch.labs && sch.labs.length > 0) ||
            (sch.classCount || 0) > 0 ||
            (sch.labCount || 0) > 0)
        ) {
          hasClasses[dayIdx] = true;
          break;
        }
      }
    }
    return hasClasses;
  }, [attendance]);

  // Pre-computed class date strings for the visible month (recalculates ONLY when month or timetable changes)
  const currentYearMonth = selectedDate.slice(0, 7); // "YYYY-MM"
  const monthClassDates = useMemo(() => {
    if (!daysWithClasses.some(Boolean)) return [];
    const [yStr, mStr] = currentYearMonth.split('-');
    const y = parseInt(yStr, 10);
    const m = parseInt(mStr, 10) - 1;

    const numDays = new Date(y, m + 1, 0).getDate();
    const firstDayOfWeek = new Date(y, m, 1).getDay();

    const dates: string[] = [];
    for (let d = 1; d <= numDays; d++) {
      const dayOfWeek = (firstDayOfWeek + d - 1) % 7;
      if (daysWithClasses[dayOfWeek]) {
        const dd = d < 10 ? `0${d}` : `${d}`;
        dates.push(`${currentYearMonth}-${dd}`);
      }
    }
    return dates;
  }, [currentYearMonth, daysWithClasses]);

  // Static base event dots map — stable across date selections to eliminate re-renders
  const baseMarkedDots = useMemo(() => {
    const marks: Record<string, { dots: Array<{ key: string; color: string }> }> = {};
    const MAX_DOTS = 3;
    const colorMap = getEventColors(colors, isDark);

    const addDot = (dateStr: string, color: string, key: string) => {
      if (!marks[dateStr]) marks[dateStr] = { dots: [] };
      if (!marks[dateStr].dots.find((d) => d.color === color) && marks[dateStr].dots.length < MAX_DOTS) {
        marks[dateStr].dots.push({ key, color });
      }
    };

    for (let i = 0; i < customEvents.length; i++) {
      const e = customEvents[i];
      if (e.date) addDot(e.date, colorMap[e.type]?.border || colors.accentPrimary, e.id);
    }
    for (let i = 0; i < tasks.length; i++) {
      const t = tasks[i];
      if (t.date) addDot(t.date, isDark ? '#f59e0b' : '#D97706', t.id);
    }
    if (gymLogs) {
      for (let i = 0; i < gymLogs.length; i++) {
        const g = gymLogs[i];
        if (g.date) addDot(g.date, isDark ? '#10b981' : '#059669', g.id);
      }
    }
    for (let i = 0; i < monthClassDates.length; i++) {
      const dStr = monthClassDates[i];
      addDot(dStr, isDark ? '#3390ec' : '#2563EB', 'class-' + dStr);
    }
    return marks;
  }, [customEvents, tasks, monthClassDates, gymLogs, colors, isDark]);

  // Dynamic markedDates with selected day highlight
  const markedDates = useMemo(() => {
    const marks: Record<string, any> = { ...baseMarkedDots };
    const existing = marks[selectedDate];
    marks[selectedDate] = {
      ...(existing || {}),
      dots: existing?.dots || [],
      selected: true,
      selectedColor: colors.accentPrimary,
      selectedTextColor: isDark ? '#000000' : '#FFFFFF',
    };
    return marks;
  }, [baseMarkedDots, selectedDate, colors.accentPrimary, isDark]);

  // Month Density Heat Map: count events per date
  const eventCountByDate = useMemo(() => {
    const counts: Record<string, number> = {};
    const bump = (date: string) => {
      counts[date] = (counts[date] || 0) + 1;
    };
    for (let i = 0; i < customEvents.length; i++) {
      const d = customEvents[i].date;
      if (d) bump(d);
    }
    for (let i = 0; i < tasks.length; i++) {
      const d = tasks[i].date;
      if (d) bump(d);
    }
    if (gymLogs) {
      for (let i = 0; i < gymLogs.length; i++) {
        const d = gymLogs[i]?.date;
        if (d) bump(d);
      }
    }
    for (let i = 0; i < monthClassDates.length; i++) {
      bump(monthClassDates[i]);
    }
    return counts;
  }, [customEvents, tasks, gymLogs, monthClassDates]);

  // In-memory cache for AI Free Slot results keyed by date + events fingerprint
  const slotCacheRef = useRef<Record<string, string>>({});

  const handleFindFreeSlots = useCallback(async () => {
    const scheduleFingerprint = `${selectedDate}_${dayEvents.map(e => `${e.id}_${e.startTime}_${e.endTime}`).join(';')}`;
    if (slotCacheRef.current[scheduleFingerprint]) {
      setAiSlotResult(slotCacheRef.current[scheduleFingerprint]);
      return;
    }

    setFindingSlots(true);
    try {
      const prompt = `Here are my events for today: ${JSON.stringify(dayEvents.map(e => ({title: e.title, start: e.startTime, end: e.endTime})))}\nFind the best 1-2 hour continuous free slot during working hours (9 AM - 6 PM). Output a brief, energetic message with the time slot and why it's the best choice.`;
      const text = await callGeminiProxy(
        [{ role: 'user', parts: [{ text: prompt }] }],
        { maxOutputTokens: 250, temperature: 0.5 }
      );
      const resultText = text || 'No free slots found.';
      slotCacheRef.current[scheduleFingerprint] = resultText;
      setAiSlotResult(resultText);
    } catch(e) {
      setAiSlotResult('Unable to find free slots. Please try again.');
    }
    setFindingSlots(false);
  }, [selectedDate, dayEvents]);

  const handlePrevMonth = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const [curY, curM, curD] = selectedDate.split('-').map(Number);
    const prev = new Date(curY, (curM || 1) - 2, 1);
    const maxDay = new Date(prev.getFullYear(), prev.getMonth() + 1, 0).getDate();
    const targetDay = Math.min(curD || 1, maxDay);
    const newDateStr = [
      prev.getFullYear(),
      String(prev.getMonth() + 1).padStart(2, '0'),
      String(targetDay).padStart(2, '0')
    ].join('-');
    setSelectedDate(newDateStr);
  }, [selectedDate, setSelectedDate]);

  const handleNextMonth = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const [curY, curM, curD] = selectedDate.split('-').map(Number);
    const next = new Date(curY, curM || 1, 1);
    const maxDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
    const targetDay = Math.min(curD || 1, maxDay);
    const newDateStr = [
      next.getFullYear(),
      String(next.getMonth() + 1).padStart(2, '0'),
      String(targetDay).padStart(2, '0')
    ].join('-');
    setSelectedDate(newDateStr);
  }, [selectedDate, setSelectedDate]);

  return (
    <SafeAreaView style={styles.root}>

      {/* ── AI Slot Result Bottom Sheet ── */}
      {!!aiSlotResult && (
        <Modal
          visible={!!aiSlotResult}
          transparent
          animationType="slide"
          onRequestClose={() => setAiSlotResult(null)}
        >
          <TouchableOpacity
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }}
            activeOpacity={1}
            onPress={() => setAiSlotResult(null)}
          >
            <View style={{
              backgroundColor: colors.surface,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: 24,
              paddingBottom: 40,
              borderTopWidth: 1,
              borderTopColor: colors.border,
            }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)', alignSelf: 'center', marginBottom: 20 }} />
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 10 }}>
                <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: isDark ? 'rgba(165,153,255,0.15)' : 'rgba(108,92,231,0.12)', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 16 }}>✨</Text>
                </View>
                <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 18, color: colors.textPrimary }}>AI Free Slot</Text>
              </View>
              <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 15, color: colors.textSecondary, lineHeight: 22 }}>
                {aiSlotResult}
              </Text>
              <TouchableOpacity
                onPress={() => setAiSlotResult(null)}
                style={{ marginTop: 24, paddingVertical: 14, backgroundColor: colors.accentPrimary, borderRadius: 14, alignItems: 'center' }}
              >
                <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 15, color: isDark ? '#000000' : '#FFFFFF' }}>Got it</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
      )}

      {/* 1.5. SUB HEADER (Month + View Selector) */}
      <View style={styles.subHeader}>
        {currentView === 'Month' ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1 }}>
            <TouchableOpacity 
              onPress={handlePrevMonth} 
              style={{ paddingVertical: 4, paddingHorizontal: 6 }}
              activeOpacity={0.6}
            >
              <Ionicons name="caret-back" size={16} color={colors.accentPrimary} />
            </TouchableOpacity>
            <Text style={[styles.monthText, { fontSize: 18, marginHorizontal: 2 }]} numberOfLines={1} adjustsFontSizeToFit>
              {monthName.slice(0, 3)} {selectedLocalDate.getFullYear()}
            </Text>
            <TouchableOpacity 
              onPress={handleNextMonth} 
              style={{ paddingVertical: 4, paddingHorizontal: 6 }}
              activeOpacity={0.6}
            >
              <Ionicons name="caret-forward" size={16} color={colors.accentPrimary} />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity 
            style={styles.monthSelector} 
            onPress={toggleMonthDropdown}
            activeOpacity={0.7}
          >
            <Text style={styles.monthText}>{monthName}</Text>
            <Ionicons name={isMonthDropdownOpen ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textMuted} style={{ marginLeft: 4, marginTop: 4 }} />
          </TouchableOpacity>
        )}

        {/* "Today" jump button — only visible when user navigated away from today */}
        {!isToday && (
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setSelectedDate(todayStr);
              setTimeout(() => {
                scrollToCurrentTime(true);
              }, 120);
            }}
            style={{
              paddingVertical: 5,
              paddingHorizontal: 12,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: colors.accentPrimary || '#a599ff',
              marginRight: 8,
            }}
            activeOpacity={0.7}
          >
            <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 12, color: colors.accentPrimary || '#a599ff' }}>
              Today
            </Text>
          </TouchableOpacity>
        )}

        <View style={styles.viewSelector}>
          {(['Day', 'Week', 'Month'] as const).map(view => (
            <TouchableOpacity 
              key={view}
              style={[styles.viewSelectorBtn, currentView === view && styles.viewSelectorBtnActive]}
              onPress={() => setCurrentView(view)}
            >
              <Text style={[styles.viewSelectorText, currentView === view && styles.viewSelectorTextActive]}>{view}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* MONTH DROPDOWN */}
      {isMonthDropdownOpen && (
        <View style={styles.monthDropdownContainer}>
          <Calendar
            current={selectedDate}
            onDayPress={(day: any) => {
               setSelectedDate(day.dateString);
               setIsMonthDropdownOpen(false);
               setTimeout(() => {
                 agendaScrollRef.current?.scrollTo({ y: 0, animated: true });
               }, 100);
            }}
            markingType={'multi-dot'}
            markedDates={markedDates}
            hideExtraDays={true}
            renderHeader={() => null}
            theme={{
              backgroundColor: 'transparent',
              calendarBackground: 'transparent',
              textSectionTitleColor: colors.textMuted,
              selectedDayBackgroundColor: colors.accentPrimary,
              selectedDayTextColor: isDark ? '#000000' : '#FFFFFF',
              todayTextColor: colors.accentPrimary,
              dayTextColor: colors.textPrimary,
              textDisabledColor: colors.border,
              dotColor: colors.accentPrimary,
              selectedDotColor: isDark ? '#000000' : '#FFFFFF',
              arrowColor: 'transparent',
              monthTextColor: 'transparent',
              textDayFontFamily: FONT_FAMILY.body,
              textDayHeaderFontFamily: FONT_FAMILY.body,
              textDayFontSize: 16,
              textDayHeaderFontSize: 13,
              'stylesheet.calendar.header': {
                header: { height: 0, opacity: 0 },
                week: { marginTop: 0, flexDirection: 'row', justifyContent: 'space-around' }
              }
            } as any}
          />
          {/* Month Chips row */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.monthChipsContainer}>
            {ALL_MONTHS.map((m, idx) => (
               <TouchableOpacity 
                 key={m} 
                 style={[styles.monthChip, currentMonthIdx === idx && styles.monthChipActive]}
                 onPress={() => {
                   const [y, m, day] = selectedDate.split('-').map(Number);
                   const d = new Date(y, idx, Math.min(day, new Date(y, idx + 1, 0).getDate()));
                   setSelectedDate(formatLocalDateStr(d));
                 }}
               >
                 <Text style={[styles.monthChipText, currentMonthIdx === idx && styles.monthChipTextActive]}>{m}</Text>
               </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* 2. DATE SELECTOR (Horizontal Paging Week Strip — only in Day view) */}
      {!isMonthDropdownOpen && currentView === 'Day' && (
        <CalendarWeekStripPager
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          markedDates={baseMarkedDots}
        />
      )}
      
      {/* 3. TIMELINE GRID (DAY VIEW) — conditional mount */}
      {currentView === 'Day' && (
        <View style={{ flex: 1 }}>
          <CalendarDayView
            styles={styles} colors={colors} isDark={isDark}
            unscheduledDayEvents={unscheduledDayEvents} processedEvents={processedEvents}
            DYNAMIC_HOURS={DYNAMIC_HOURS} minHour={minHour} maxHour={maxHour}
            isToday={isToday} indicatorTop={indicatorTop} scrollViewRef={scrollViewRef}
            setInitialTime={setInitialTime} setSelectedEvent={setSelectedEvent}
            setShowAddModal={setShowAddModal} setSelectedGymLog={setSelectedGymLog}
            setGymStartTimeInput={setGymStartTimeInput} setGymEndTimeInput={setGymEndTimeInput}
            setShowGymModal={setShowGymModal} setShowEventModal={setShowEventModal} gymLogs={gymLogs}
            currentTimeMins={isToday ? currentTimeMins : undefined}
          />
        </View>
      )}

      {/* 4. WEEK VIEW GRID — conditional mount */}
      {currentView === 'Week' && (
        <View style={{ flex: 1 }}>
          <CalendarWeekView
            styles={styles} colors={colors} isDark={isDark} weekEvents={weekEvents}
            DYNAMIC_HOURS={DYNAMIC_HOURS} minHour={minHour} maxHour={maxHour}
            indicatorTop={indicatorTop} selectedDate={selectedDate} nowDateStr={todayStr}
            setSelectedDate={setSelectedDate} setCurrentView={setCurrentView}
            markedDates={baseMarkedDots}
          />
        </View>
      )}

      {/* 5. MONTH VIEW */}
      {currentView === 'Month' && (
        <View style={styles.monthViewContainer}>
          <CalendarAgendaView
            styles={styles} colors={colors} isDark={isDark} selectedDate={selectedDate}
            currentView={currentView}
            setSelectedDate={setSelectedDate} markedDates={markedDates}
            dayEvents={dayEvents} setSelectedGymLog={setSelectedGymLog}
            setGymStartTimeInput={setGymStartTimeInput} setGymEndTimeInput={setGymEndTimeInput}
            setShowGymModal={setShowGymModal} setSelectedEvent={setSelectedEvent}
            setShowEventModal={setShowEventModal} gymLogs={gymLogs}
            eventCountByDate={eventCountByDate}
          />
        </View>
      )}

      {/* Event Details Sheet */}
      {showEventModal && (
        <EventDetailSheet 
          visible={showEventModal}
          selectedEvent={selectedEvent} 
          selectedDate={selectedDate}
          styles={styles}
          colors={colors}
          isDark={isDark}
          onClose={() => setShowEventModal(false)}
          onEdit={() => {
            setShowEventModal(false);
            if (selectedEvent) {
              navigation.navigate('AddEvent', { event: selectedEvent });
            }
          }}
        />
      )}

      {/* Add Event Modal */}
      {showAddModal && (
        <AddEventModal
          visible={showAddModal}
          onClose={() => setShowAddModal(false)}
          selectedDate={selectedDate}
          initialStartTime={initialTime}
        />
      )}

      {/* Gym Modal */}
      {showGymModal && (
        <CalendarGymModal 
          visible={showGymModal}
          styles={styles}
          gymStartTimeInput={gymStartTimeInput} 
          setGymStartTimeInput={setGymStartTimeInput} 
          gymEndTimeInput={gymEndTimeInput} 
          setGymEndTimeInput={setGymEndTimeInput} 
          onClose={() => setShowGymModal(false)}
          onSave={handleSaveGymTime} 
        />
      )}

      {/* Floating Add Event Button */}
      <AnimatedPressable
        style={{
          position: 'absolute',
          bottom: 110,
          right: 20,
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: colors.accentPrimary,
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: colors.accentPrimary,
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.4,
          shadowRadius: 12,
          elevation: 8,
          zIndex: 100,
        }}
        onPress={() => {
          setInitialTime('');
          setShowAddModal(true);
        }}
      >
        <Ionicons name="add" size={32} color={isDark ? '#000000' : '#ffffff'} />
      </AnimatedPressable>
    </SafeAreaView>
  );
}
