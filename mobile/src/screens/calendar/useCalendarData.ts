/**
 * useCalendarData.ts
 * Core logic and state management for CalendarScreen.
 * Handles fetching, parsing, and merging of events, tasks, classes, and gym logs.
 */
import { useState, useEffect, useMemo, useRef } from 'react';
import { ScrollView } from 'react-native';
import type { CustomEvent } from '../../contexts/MobileDataContext';
import { usePlannerData } from '../../contexts/domains/PlannerContext';
import { useCoreData } from '../../contexts/domains/CoreDataContext';
import { useAcademicData } from '../../contexts/domains/AcademicContext';
import { useWellnessData } from '../../contexts/domains/WellnessContext';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { COLLECTION } from '../../config/constants';
import { GYM_PLAN } from '../../data/gymPlan';
import { getCustomPlanDay, planDayIndexForDate } from '../../hooks/useGymLog';
import { parseTimeTo24h, parseTaskTimeSlot, HOUR_HEIGHT } from './calendarUtils';
import { useDeferredMemo } from '../../hooks/useDeferredMemo';

export function useCalendarData() {
  const { customEvents } = usePlannerData();
  const { tasks, user, googleAccessToken } = useCoreData();
  const { attendance } = useAcademicData();
  const { gymLogs, userGymPlan } = useWellnessData();

  // Stable reference to mount time — never changes across renders
  const nowRef = useRef(new Date());
  const now = nowRef.current;
  const [selectedDate, setSelectedDate] = useState(now.toISOString().slice(0, 10));

  const [showEventModal, setShowEventModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showGymModal, setShowGymModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CustomEvent | null>(null);
  const [selectedGymLog, setSelectedGymLog] = useState<any>(null);
  const [gymStartTimeInput, setGymStartTimeInput] = useState('');
  const [gymEndTimeInput, setGymEndTimeInput] = useState('');
  const [isMonthDropdownOpen, setIsMonthDropdownOpen] = useState(false);
  const [initialTime, setInitialTime] = useState<string>('');
  const [gcalEvents, setGcalEvents] = useState<CustomEvent[]>([]);

  const scrollViewRef = useRef<ScrollView>(null);
  const agendaScrollRef = useRef<ScrollView>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [currentView, setCurrentView] = useState<'Day'|'Week'|'Month'>('Day');

  const handleSaveGymTime = async () => {
    if (!selectedGymLog || !user) return;
    try {
      const docRef = doc(db, COLLECTION.GYM_LOGS, selectedGymLog.id);
      await updateDoc(docRef, {
        startTime: gymStartTimeInput,
        endTime: gymEndTimeInput,
      });
      setShowGymModal(false);
    } catch (e) {
      console.warn('Failed to update gym time', e);
    }
  };

  // Update current time indicator every minute
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Fetch Google Calendar events
  useEffect(() => {
    if (!googleAccessToken) return;
    const fetchGcal = async () => {
      try {
        const start = new Date(selectedDate);
        start.setHours(0,0,0,0);
        const end = new Date(selectedDate);
        end.setHours(23,59,59,999);
        const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${start.toISOString()}&timeMax=${end.toISOString()}&singleEvents=true`, {
          headers: { Authorization: `Bearer ${googleAccessToken}` }
        });
        const data = await res.json();
        if (data.items) {
          const mapped = data.items.map((item: any) => {
            const dtStart = new Date(item.start.dateTime || item.start.date);
            const dtEnd = new Date(item.end.dateTime || item.end.date);
            return {
              id: item.id,
              title: item.summary || 'Busy',
              date: selectedDate,
              type: 'gcal',
              startTime: dtStart.getHours().toString().padStart(2, '0') + ':' + dtStart.getMinutes().toString().padStart(2, '0'),
              endTime: dtEnd.getHours().toString().padStart(2, '0') + ':' + dtEnd.getMinutes().toString().padStart(2, '0'),
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
  }, [googleAccessToken, selectedDate]);

  // Combine custom events, tasks, and gcal events for the day
  const { timedDayEvents, unscheduledDayEvents } = useMemo(() => {
    const events = customEvents.filter((e: any) => e.date === selectedDate);
    const timedTasks: any[] = [];
    const unscheduledTasks: any[] = [];
    
    tasks.filter((t: any) => t.date === selectedDate).forEach((t: any) => {
      if (t.timeSlot && t.timeSlot.trim() !== '') {
        const { startTime, endTime } = parseTaskTimeSlot(t.timeSlot);
        timedTasks.push({ id: t.id, title: t.title, type: 'todo' as const, date: t.date, startTime, endTime, isCompleted: t.status === 'completed' });
      } else {
        unscheduledTasks.push({ id: t.id, title: t.title, type: 'todo' as const, date: t.date, startTime: '', endTime: '', isCompleted: t.status === 'completed' });
      }
    });

    const dayOfWeek = new Date(selectedDate + 'T00:00:00').getDay().toString();
    const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const timedClasses: any[] = [];
    const unscheduledClasses: any[] = [];

    attendance?.forEach((subj: any) => {
      const sch = subj.schedule?.[dayOfWeek] || subj.schedule?.[Number(dayOfWeek)] || subj.schedule?.[DAY_NAMES[new Date(selectedDate + 'T00:00:00').getDay()]] || subj.schedule?.[DAY_NAMES[new Date(selectedDate + 'T00:00:00').getDay()].toLowerCase()];
      if (!sch) return;

      if (sch.classes && Array.isArray(sch.classes)) {
        sch.classes.forEach((c: any, i: number) => {
          if (c.time && c.time.trim() !== '') {
            const { hour: sh, min: sm } = parseTimeTo24h(c.time);
            const endH = Math.min(23, sh + 1);
            timedClasses.push({ id: `${subj.id}-class-${i}`, title: `${subj.name} (Class)`, type: 'class', date: selectedDate, startTime: c.time, endTime: `${endH.toString().padStart(2, '0')}:${sm.toString().padStart(2, '0')}`, location: c.room || '' });
          } else {
            unscheduledClasses.push({ id: `${subj.id}-class-${i}`, title: `${subj.name} (Class)`, type: 'class', date: selectedDate, startTime: '', endTime: '', location: c.room || '' });
          }
        });
      }
      if (sch.labs && Array.isArray(sch.labs)) {
        sch.labs.forEach((l: any, i: number) => {
          if (l.time && l.time.trim() !== '') {
            const { hour: sh, min: sm } = parseTimeTo24h(l.time);
            const endH = Math.min(23, sh + 2);
            timedClasses.push({ id: `${subj.id}-lab-${i}`, title: `${subj.name} (Lab)`, type: 'lab', date: selectedDate, startTime: l.time, endTime: `${endH.toString().padStart(2, '0')}:${sm.toString().padStart(2, '0')}`, location: l.room || '' });
          } else {
            unscheduledClasses.push({ id: `${subj.id}-lab-${i}`, title: `${subj.name} (Lab)`, type: 'lab', date: selectedDate, startTime: '', endTime: '', location: l.room || '' });
          }
        });
      }
    });

    const gLog = (gymLogs || []).find((g: any) => g.date === selectedDate);
    const planIdx = planDayIndexForDate(selectedDate);
    const gPlan = getCustomPlanDay(userGymPlan?.customDays, planIdx) || GYM_PLAN.find((d: any) => d.dayIndex === planIdx);
    
    const startTimeStr = gLog?.startTime || gPlan?.startTime;
    const endTimeStr = gLog?.endTime || gPlan?.endTime;
    
    const gymEvts = [];
    if (startTimeStr && (gLog?.startTime || !gPlan?.isRest)) {
      gymEvts.push({ id: `gym-${selectedDate}`, title: gPlan?.focus ? `Workout: ${gPlan.focus}` : 'Gym Workout', type: 'gym' as any, date: selectedDate, startTime: startTimeStr, endTime: endTimeStr || '18:00', location: 'Gym' });
    }

    return {
      timedDayEvents: [...events, ...timedTasks, ...timedClasses, ...gymEvts, ...gcalEvents] as CustomEvent[],
      unscheduledDayEvents: [...unscheduledTasks, ...unscheduledClasses] as CustomEvent[],
    };
  }, [customEvents, tasks, attendance, gymLogs, userGymPlan, gcalEvents, selectedDate]);

  const dayEvents = useMemo(() => {
    const sortedTimed = [...timedDayEvents].sort((a, b) => {
      const aStart = parseTimeTo24h(a.startTime);
      const bStart = parseTimeTo24h(b.startTime);
      return (aStart.hour * 60 + aStart.min) - (bStart.hour * 60 + bStart.min);
    });
    return [...sortedTimed, ...unscheduledDayEvents];
  }, [timedDayEvents, unscheduledDayEvents]);

  const processedEvents = useDeferredMemo(() => {
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
  }, [timedDayEvents], []);

  const weekEvents = useDeferredMemo(() => {
    if (currentView !== 'Week') return [];
    const [selY, selM, selD] = selectedDate.split('-').map(Number);
    const d = new Date(selY, (selM || 1) - 1, selD || 1);
    d.setDate(d.getDate() - d.getDay());
    let allWeekEvents: any[] = [];

    for (let i = 0; i < 7; i++) {
      const cur = new Date(d.getFullYear(), d.getMonth(), d.getDate() + i);
      const dateStr = [
        cur.getFullYear(),
        String(cur.getMonth() + 1).padStart(2, '0'),
        String(cur.getDate()).padStart(2, '0')
      ].join('-');
      
      const events = customEvents.filter((e: any) => e.date === dateStr);
      const dayTasks = tasks.filter((t: any) => t.date === dateStr).map((t: any) => {
        const { startTime, endTime } = parseTaskTimeSlot(t.timeSlot);
        return { id: t.id, title: t.title, type: 'todo', date: dateStr, startTime, endTime };
      });
      
      const dayOfWeek = cur.getDay().toString();
      const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      
      const classEvents = attendance?.flatMap((subj: any) => {
        const sch = subj.schedule?.[dayOfWeek] || subj.schedule?.[Number(dayOfWeek)] || subj.schedule?.[DAY_NAMES[cur.getDay()]] || subj.schedule?.[DAY_NAMES[cur.getDay()].toLowerCase()];
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

      const gcals = gcalEvents.filter((e: any) => e.date === dateStr);
      
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
  }, [currentView, selectedDate, customEvents, tasks, attendance, gymLogs, userGymPlan, gcalEvents], []);

  const { minHour, maxHour } = useMemo(() => {
    let min = 5; let max = 22;
    const allEvents = currentView === 'Week' ? weekEvents : timedDayEvents;
    if (allEvents && allEvents.length > 0) {
      allEvents.forEach((ev: any) => {
        if (ev.startTime) { const parsedStart = parseTimeTo24h(ev.startTime); if (parsedStart.hour < min) min = parsedStart.hour; }
        if (ev.endTime) { const parsedEnd = parseTimeTo24h(ev.endTime); if (parsedEnd.hour > max) max = parsedEnd.hour; }
      });
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
    if (selectedDate !== now.toISOString().slice(0, 10)) return;
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
    tasks, attendance, customEvents, gymLogs, userGymPlan
  };
}
