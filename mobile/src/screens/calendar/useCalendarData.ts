/**
 * useCalendarData.ts
 * Core logic and state management for CalendarScreen.
 * Handles fetching, parsing, and merging of events, tasks, classes, and gym logs.
 *
 * Performance optimizations:
 * - Single consolidated 60s interval timer for current time updates (removed redundant 30s interval)
 * - Conditional calculation of weekEvents (only computed when currentView === 'Week')
 * - Efficient timetable schedule indexing for O(1) day lookups
 * - Stabilized empty array defaults and memoized calculations
 */
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { ScrollView } from 'react-native';
import type { CustomEvent } from '../../contexts/MobileDataContext';
import { usePlannerData } from '../../contexts/domains/PlannerContext';
import { useCoreData } from '../../contexts/domains/CoreDataContext';
import { useAcademicData } from '../../contexts/domains/AcademicContext';
import { useWellnessData } from '../../contexts/domains/WellnessContext';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { COLLECTION } from '../../config/constants';
import { safeUpdate } from '../../utils/safeWrite';
import { GYM_PLAN } from '../../data/gymPlan';
import { getCustomPlanDay, planDayIndexForDate } from '../../hooks/useGymLog';
import { parseTimeTo24h, parseTaskTimeSlot, HOUR_HEIGHT } from './calendarUtils';
import { useDeferredMemo } from '../../hooks/useDeferredMemo';
import { formatLocalDateStr } from '../../utils/dateUtils';

const EMPTY_ARRAY: any[] = [];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function useCalendarData() {
  const { customEvents, ensureSubscribed } = usePlannerData();
  const { tasks, user, googleAccessToken } = useCoreData();
  const { attendance, holidays } = useAcademicData();
  const { gymLogs, userGymPlan } = useWellnessData();

  useEffect(() => {
    ensureSubscribed?.();
  }, [ensureSubscribed]);

  // Stable reference to mount time & single consolidated 60s minute tick
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const now = currentTime;
  const [selectedDate, setSelectedDate] = useState(() => formatLocalDateStr(new Date()));

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const [showEventModal, setShowEventModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showGymModal, setShowGymModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CustomEvent | null>(null);
  const [selectedGymLog, setSelectedGymLog] = useState<any>(null);
  const [gymStartTimeInput, setGymStartTimeInput] = useState('');
  const [gymEndTimeInput, setGymEndTimeInput] = useState('');
  const [isMonthDropdownOpen, setIsMonthDropdownOpen] = useState(false);
  const [initialTime, setInitialTime] = useState<string>('');
  const [gcalEvents, setGcalEvents] = useState<CustomEvent[]>(EMPTY_ARRAY);

  const scrollViewRef = useRef<ScrollView>(null);
  const agendaScrollRef = useRef<ScrollView>(null);
  const [currentView, setCurrentView] = useState<'Day'|'Week'|'Month'>('Day');

  const handleSaveGymTime = useCallback(async () => {
    if (!selectedGymLog || !user) return;
    const updates = { startTime: gymStartTimeInput, endTime: gymEndTimeInput };
    await safeUpdate(
      selectedGymLog.id,
      COLLECTION.GYM_LOGS,
      updates,
      () => updateDoc(doc(db, COLLECTION.GYM_LOGS, selectedGymLog.id), updates)
    );
    setShowGymModal(false);
  }, [selectedGymLog, user, gymStartTimeInput, gymEndTimeInput]);

  // Google Calendar Integration (only fetches if access token present)
  useEffect(() => {
    if (!googleAccessToken) {
      if (gcalEvents.length > 0) setGcalEvents(EMPTY_ARRAY);
      return;
    }
    let isCancelled = false;

    const fetchGcal = async () => {
      try {
        const timeMin = new Date(selectedDate + 'T00:00:00Z').toISOString();
        const timeMax = new Date(selectedDate + 'T23:59:59Z').toISOString();
        const res = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true`,
          {
            headers: { Authorization: `Bearer ${googleAccessToken}` },
          }
        );
        const data = await res.json();
        if (!isCancelled && data.items) {
          const mapped = data.items.map((item: any) => {
            const startRaw = item.start?.dateTime || item.start?.date;
            const endRaw = item.end?.dateTime || item.end?.date;
            const startD = new Date(startRaw);
            const endD = new Date(endRaw);
            const isAllDay = !item.start?.dateTime;
            const startTime = isAllDay
              ? ''
              : `${startD.getHours().toString().padStart(2, '0')}:${startD.getMinutes().toString().padStart(2, '0')}`;
            const endTime = isAllDay
              ? ''
              : `${endD.getHours().toString().padStart(2, '0')}:${endD.getMinutes().toString().padStart(2, '0')}`;
            return {
              id: item.id,
              title: item.summary || 'Google Event',
              type: 'gcal' as const,
              date: selectedDate,
              startTime,
              endTime,
              location: item.location,
            } as CustomEvent;
          });
          setGcalEvents(mapped);
        }
      } catch (e) {
        console.warn('GCal fetch error', e);
      }
    };

    fetchGcal();
    return () => {
      isCancelled = true;
    };
  }, [googleAccessToken, selectedDate]);

  // Combine custom events, tasks, timetable classes, gym logs, and gcal events for the selected day
  const { timedDayEvents, unscheduledDayEvents } = useMemo(() => {
    const selDateObj = new Date(selectedDate + 'T00:00:00');
    const selDayOfWeek = selDateObj.getDay();
    const selDayOfMonth = selDateObj.getDate();

    const events = customEvents.filter((e: any) => {
      if (e.date === selectedDate) return true;
      if (!e.recurrenceRule || e.recurrenceRule === 'none') return false;
      if (e.date > selectedDate) return false; // Event starts in the future

      const origDateObj = new Date(e.date + 'T00:00:00');
      if (e.recurrenceRule === 'daily') return true;
      if (e.recurrenceRule === 'weekly') return origDateObj.getDay() === selDayOfWeek;
      if (e.recurrenceRule === 'monthly') return origDateObj.getDate() === selDayOfMonth;
      return false;
    });

    const timedTasks: any[] = [];
    const unscheduledTasks: any[] = [];
    
    for (let i = 0; i < tasks.length; i++) {
      const t = tasks[i];
      if (t.date === selectedDate) {
        if (t.timeSlot && t.timeSlot.trim() !== '') {
          const { startTime, endTime } = parseTaskTimeSlot(t.timeSlot);
          timedTasks.push({
            id: t.id,
            title: t.title,
            type: 'todo' as const,
            date: t.date,
            startTime,
            endTime,
            isCompleted: t.status === 'completed',
          });
        } else {
          unscheduledTasks.push({
            id: t.id,
            title: t.title,
            type: 'todo' as const,
            date: t.date,
            startTime: '',
            endTime: '',
            isCompleted: t.status === 'completed',
          });
        }
      }
    }

    const isHoliday = holidays?.includes(selectedDate);
    const holidayEvents: any[] = [];
    if (isHoliday) {
      holidayEvents.push({
        id: `holiday-${selectedDate}`,
        title: '🌴 Holiday / College Off',
        type: 'holiday' as any,
        date: selectedDate,
        startTime: '',
        endTime: '',
        location: '',
      });
    }

    const dayOfWeek = selDayOfWeek.toString();
    const dayName = DAY_NAMES[selDayOfWeek];
    const dayNameLower = dayName.toLowerCase();
    const timedClasses: any[] = [];
    const unscheduledClasses: any[] = [];

    if (!isHoliday && attendance && attendance.length > 0) {
      for (let sIdx = 0; sIdx < attendance.length; sIdx++) {
        const subj = attendance[sIdx];
        const sch =
          subj.schedule?.[dayOfWeek] ||
          subj.schedule?.[selDayOfWeek] ||
          subj.schedule?.[dayName] ||
          subj.schedule?.[dayNameLower];
        if (!sch) continue;

        if (sch.classes && Array.isArray(sch.classes)) {
          for (let i = 0; i < sch.classes.length; i++) {
            const c = sch.classes[i];
            if (c.time && c.time.trim() !== '') {
              const { hour: sh, min: sm } = parseTimeTo24h(c.time);
              const endH = Math.min(23, sh + 1);
              timedClasses.push({
                id: `${subj.id}-class-${i}`,
                title: `${subj.name} (Class)`,
                type: 'class',
                date: selectedDate,
                startTime: c.time,
                endTime: `${endH.toString().padStart(2, '0')}:${sm.toString().padStart(2, '0')}`,
                location: c.room || '',
                subjectId: subj.id,
                subjectName: subj.name,
                sessionType: 'class',
                sessionIdx: i,
              });
            } else {
              unscheduledClasses.push({
                id: `${subj.id}-class-${i}`,
                title: `${subj.name} (Class)`,
                type: 'class',
                date: selectedDate,
                startTime: '',
                endTime: '',
                location: c.room || '',
                subjectId: subj.id,
                subjectName: subj.name,
                sessionType: 'class',
                sessionIdx: i,
              });
            }
          }
        }

        if (sch.labs && Array.isArray(sch.labs)) {
          for (let i = 0; i < sch.labs.length; i++) {
            const l = sch.labs[i];
            if (l.time && l.time.trim() !== '') {
              const { hour: sh, min: sm } = parseTimeTo24h(l.time);
              const endH = Math.min(23, sh + 2);
              timedClasses.push({
                id: `${subj.id}-lab-${i}`,
                title: `${subj.name} (Lab)`,
                type: 'lab',
                date: selectedDate,
                startTime: l.time,
                endTime: `${endH.toString().padStart(2, '0')}:${sm.toString().padStart(2, '0')}`,
                location: l.room || '',
                subjectId: subj.id,
                subjectName: subj.name,
                sessionType: 'lab',
                sessionIdx: i,
              });
            } else {
              unscheduledClasses.push({
                id: `${subj.id}-lab-${i}`,
                title: `${subj.name} (Lab)`,
                type: 'lab',
                date: selectedDate,
                startTime: '',
                endTime: '',
                location: l.room || '',
                subjectId: subj.id,
                subjectName: subj.name,
                sessionType: 'lab',
                sessionIdx: i,
              });
            }
          }
        }
      }
    }

    const gLog = (gymLogs || []).find((g: any) => g.date === selectedDate);
    const planIdx = planDayIndexForDate(selectedDate);
    const gPlan = getCustomPlanDay(userGymPlan?.customDays, planIdx) || GYM_PLAN.find((d: any) => d.dayIndex === planIdx);
    
    const startTimeStr = gLog?.startTime || gPlan?.startTime;
    const endTimeStr = gLog?.endTime || gPlan?.endTime;
    
    const gymEvts = [];
    if (startTimeStr && (gLog?.startTime || !gPlan?.isRest)) {
      const hasCompletedSets = gLog?.exercises?.some((ex: any) =>
        ex.setsLog?.some((s: any) => s.completed)
      );
      const isCompleted = gLog?.completed || hasCompletedSets;
      const baseTitle = gPlan?.focus ? `Workout: ${gPlan.focus}` : 'Gym Workout';
      const gymTitle = isCompleted ? `✓ ${baseTitle}` : baseTitle;
      gymEvts.push({
        id: `gym-${selectedDate}`,
        title: gymTitle,
        type: 'gym' as any,
        date: selectedDate,
        startTime: startTimeStr,
        endTime: endTimeStr || '18:00',
        location: 'Gym',
      });
    }

    return {
      timedDayEvents: [...events, ...timedTasks, ...timedClasses, ...gymEvts, ...gcalEvents] as CustomEvent[],
      unscheduledDayEvents: [...holidayEvents, ...unscheduledTasks, ...unscheduledClasses] as CustomEvent[],
    };
  }, [customEvents, tasks, attendance, gymLogs, userGymPlan, gcalEvents, holidays, selectedDate]);

  const dayEvents = useMemo(() => {
    const sortedTimed = [...timedDayEvents].sort((a, b) => {
      const aStart = parseTimeTo24h(a.startTime);
      const bStart = parseTimeTo24h(b.startTime);
      return (aStart.hour * 60 + aStart.min) - (bStart.hour * 60 + bStart.min);
    });
    return [...sortedTimed, ...unscheduledDayEvents];
  }, [timedDayEvents, unscheduledDayEvents]);

  const processedEvents = useDeferredMemo(() => {
    if (timedDayEvents.length === 0) return EMPTY_ARRAY;

    const timedEvents = timedDayEvents.map((event, index) => {
      let startHour = 9, startMin = 0, endHour = 10, endMin = 0;
      if (event.startTime) {
        const parsed = parseTimeTo24h(event.startTime);
        startHour = parsed.hour; startMin = parsed.min;
      } else {
        startHour = 9 + (index % 5);
      }
      if (event.endTime && event.startTime) {
        const parsed = parseTimeTo24h(event.endTime);
        endHour = parsed.hour; endMin = parsed.min;
      } else {
        endHour = startHour + 1; endMin = startMin;
      }

      const top = (startHour * HOUR_HEIGHT) + ((startMin / 60) * HOUR_HEIGHT);
      let height = ((endHour - startHour) * HOUR_HEIGHT) + ((endMin - startMin) / 60) * HOUR_HEIGHT;
      if (height < 40) height = 40;

      return { ...event, top, height, startTotalMins: startHour * 60 + startMin, endTotalMins: endHour * 60 + endMin };
    }).sort((a, b) => a.startTotalMins - b.startTotalMins);

    const eventGroups: (typeof timedEvents[number])[][] = [];
    let currentGroup: (typeof timedEvents[number])[] = [];
    let lastEventEnd = 0;

    timedEvents.forEach(ev => {
      if (currentGroup.length === 0) {
        currentGroup.push(ev);
        lastEventEnd = ev.endTotalMins;
      } else if (ev.startTotalMins < lastEventEnd) {
        currentGroup.push(ev);
        lastEventEnd = Math.max(lastEventEnd, ev.endTotalMins);
      } else {
        eventGroups.push(currentGroup);
        currentGroup = [ev];
        lastEventEnd = ev.endTotalMins;
      }
    });
    if (currentGroup.length > 0) eventGroups.push(currentGroup);

    const finalEvents: (typeof timedEvents[0] & { left: string, width: string })[] = [];
    eventGroups.forEach(group => {
      group.forEach((ev, i) => {
        finalEvents.push({ ...ev, left: `${(i / group.length) * 100}%`, width: `${100 / group.length}%` });
      });
    });
    return finalEvents;
  }, [timedDayEvents], EMPTY_ARRAY);

  const weekEvents = useDeferredMemo(() => {
    // Only compute when currentView is 'Week'
    if (currentView !== 'Week') return EMPTY_ARRAY;

    const [selY, selM, selD] = selectedDate.split('-').map(Number);
    const d = new Date(selY, (selM || 1) - 1, selD || 1);
    d.setDate(d.getDate() - d.getDay());
    let allWeekEvents: any[] = [];

    // Pre-group custom events, tasks, and gcal by date in single pass
    const customEventsByDate: Record<string, any[]> = {};
    for (let i = 0; i < customEvents.length; i++) {
      const e = customEvents[i];
      if (e.date) {
        if (!customEventsByDate[e.date]) customEventsByDate[e.date] = [];
        customEventsByDate[e.date].push(e);
      }
    }

    const tasksByDate: Record<string, any[]> = {};
    for (let i = 0; i < tasks.length; i++) {
      const t = tasks[i];
      if (t.date) {
        if (!tasksByDate[t.date]) tasksByDate[t.date] = [];
        tasksByDate[t.date].push(t);
      }
    }

    const gcalByDate: Record<string, any[]> = {};
    for (let i = 0; i < gcalEvents.length; i++) {
      const g = gcalEvents[i];
      if (g.date) {
        if (!gcalByDate[g.date]) gcalByDate[g.date] = [];
        gcalByDate[g.date].push(g);
      }
    }

    for (let i = 0; i < 7; i++) {
      const cur = new Date(d.getFullYear(), d.getMonth(), d.getDate() + i);
      const dateStr = [
        cur.getFullYear(),
        String(cur.getMonth() + 1).padStart(2, '0'),
        String(cur.getDate()).padStart(2, '0')
      ].join('-');
      
      const events = customEventsByDate[dateStr] || [];
      const dayTasks = (tasksByDate[dateStr] || []).map((t: any) => {
        const { startTime, endTime } = parseTaskTimeSlot(t.timeSlot);
        return { id: t.id, title: t.title, type: 'todo', date: dateStr, startTime, endTime };
      });
      
      const curDayOfWeekNum = cur.getDay();
      const dayOfWeek = curDayOfWeekNum.toString();
      const dayName = DAY_NAMES[curDayOfWeekNum];
      const dayNameLower = dayName.toLowerCase();
      
      const classEvents = attendance?.flatMap((subj: any) => {
        const sch = subj.schedule?.[dayOfWeek] || subj.schedule?.[curDayOfWeekNum] || subj.schedule?.[dayName] || subj.schedule?.[dayNameLower];
        if (!sch) return [];
        const evtList: any[] = [];
        if (sch.classes && Array.isArray(sch.classes)) {
          sch.classes.forEach((c: any, idx: number) => {
            if (c.time && c.time.trim() !== '') {
              const { hour: sh, min: sm } = parseTimeTo24h(c.time);
              const endH = Math.min(23, sh + 1);
              evtList.push({ id: `${subj.id}-class-${dateStr}-${idx}`, title: `${subj.name} (Class)`, type: 'class', date: dateStr, startTime: c.time, endTime: `${endH.toString().padStart(2, '0')}:${sm.toString().padStart(2, '0')}` });
            }
          });
        }
        if (sch.labs && Array.isArray(sch.labs)) {
          sch.labs.forEach((l: any, idx: number) => {
            if (l.time && l.time.trim() !== '') {
              const { hour: sh, min: sm } = parseTimeTo24h(l.time);
              const endH = Math.min(23, sh + 2);
              evtList.push({ id: `${subj.id}-lab-${dateStr}-${idx}`, title: `${subj.name} (Lab)`, type: 'lab', date: dateStr, startTime: l.time, endTime: `${endH.toString().padStart(2, '0')}:${sm.toString().padStart(2, '0')}` });
            }
          });
        }
        return evtList;
      }) || [];

      const gcals = gcalByDate[dateStr] || [];
      
      const gLog = (gymLogs || []).find((g: any) => g.date === dateStr);
      const planIdx = planDayIndexForDate(dateStr);
      const gPlan = getCustomPlanDay(userGymPlan?.customDays, planIdx) || GYM_PLAN.find((d: any) => d.dayIndex === planIdx);
      
      const startTimeStr = gLog?.startTime || gPlan?.startTime;
      const endTimeStr = gLog?.endTime || gPlan?.endTime;
      
      const gymEvts = [];
      if (startTimeStr && (gLog?.startTime || !gPlan?.isRest)) {
        gymEvts.push({ id: `gym-${dateStr}`, title: gPlan?.focus ? `Workout: ${gPlan.focus}` : 'Gym Workout', type: 'gym' as any, date: dateStr, startTime: startTimeStr, endTime: endTimeStr || '18:00', location: 'Gym' });
      }
      
      const dayCombined = [...events, ...dayTasks, ...classEvents, ...gymEvts, ...gcals];
      
      dayCombined.forEach(event => {
        let startHour = 9, startMin = 0, endHour = 10, endMin = 0;
        if (event.startTime) {
          const parsed = parseTimeTo24h(event.startTime);
          startHour = parsed.hour; startMin = parsed.min;
        }
        if (event.endTime && event.startTime) {
          const parsed = parseTimeTo24h(event.endTime);
          endHour = parsed.hour; endMin = parsed.min;
        } else {
          endHour = startHour + 1; endMin = startMin;
        }
        const top = (startHour * HOUR_HEIGHT) + ((startMin / 60) * HOUR_HEIGHT);
        let height = ((endHour - startHour) * HOUR_HEIGHT) + ((endMin - startMin) / 60) * HOUR_HEIGHT;
        if (height < 20) height = 20;

        allWeekEvents.push({ ...event, top, height, dayIndex: i, dateStr });
      });
    }
    return allWeekEvents;
  }, [currentView, selectedDate, customEvents, tasks, attendance, gymLogs, userGymPlan, gcalEvents], EMPTY_ARRAY);

  const { minHour, maxHour } = useMemo(() => {
    let min = 5; let max = 22;
    const allEvents = currentView === 'Week' ? weekEvents : timedDayEvents;
    if (allEvents && allEvents.length > 0) {
      for (let i = 0; i < allEvents.length; i++) {
        const ev = allEvents[i];
        if (ev.startTime) {
          const parsedStart = parseTimeTo24h(ev.startTime);
          if (parsedStart.hour < min) min = parsedStart.hour;
        }
        if (ev.endTime) {
          const parsedEnd = parseTimeTo24h(ev.endTime);
          if (parsedEnd.hour > max) max = parsedEnd.hour;
        }
      }
    }
    return { minHour: Math.max(0, Math.min(23, min)), maxHour: Math.max(0, Math.min(23, max)) };
  }, [weekEvents, timedDayEvents, currentView]);

  const DYNAMIC_HOURS = useMemo(() => {
    const hours = [];
    for (let i = minHour; i <= maxHour; i++) hours.push(i);
    return hours;
  }, [minHour, maxHour]);

  // Scroll to current time on mount and when switching to Day view on today
  useEffect(() => {
    if (currentView !== 'Day') return;
    if (selectedDate !== formatLocalDateStr(new Date())) return;
    if (!scrollViewRef.current) return;
    const currentHour = new Date().getHours();
    const currentMin  = new Date().getMinutes();
    const targetY = Math.max(0, (currentHour * HOUR_HEIGHT) + ((currentMin / 60) * HOUR_HEIGHT) - (minHour * HOUR_HEIGHT) - 100);
    const timer = setTimeout(() => {
      scrollViewRef.current?.scrollTo({ y: targetY, animated: true });
    }, 120);
    return () => clearTimeout(timer);
  }, [selectedDate, currentView, minHour]);

  return {
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
    tasks, attendance, customEvents, gymLogs, userGymPlan, holidays
  };
}
