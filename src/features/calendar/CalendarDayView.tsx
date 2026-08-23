import React, { useEffect, useRef, useMemo } from 'react';
import { getEventColors, format12Hour, HOUR_HEIGHT, parseTimeTo24h } from './calendarUtils';
import { getLocalDateString } from '../../utils/dateUtils';
import { Clock, MapPin, CheckCircle2, AlertCircle, Sparkles, Plus } from 'lucide-react';


export interface MergedCalendarEvent {
  id: string;
  title: string;
  date: string;
  type: string;
  startTime?: string;
  endTime?: string;
  location?: string;
  description?: string;
  isCompleted?: boolean;
  fromGCal?: boolean;
  gcalEventId?: string;
  guests?: string[];
  meetLink?: string;
}

interface CalendarDayViewProps {
  selectedDate: string;
  timedEvents: MergedCalendarEvent[];
  unscheduledEvents: MergedCalendarEvent[];
  isDark?: boolean;
  onSelectEvent: (event: MergedCalendarEvent) => void;
  onQuickAddAtTime: (timeStr: string) => void;
}

export const CalendarDayView: React.FC<CalendarDayViewProps> = ({
  selectedDate,
  timedEvents,
  unscheduledEvents,
  isDark = true,
  onSelectEvent,
  onQuickAddAtTime,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const colorMap = useMemo(() => getEventColors(isDark), [isDark]);

  const [currentTime, setCurrentTime] = React.useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const todayStr = getLocalDateString();
  const isToday = selectedDate === todayStr;

  const currentHour = currentTime.getHours();
  const currentMin = currentTime.getMinutes();
  const currentTimeMins = currentHour * 60 + currentMin;

  // Dynamic smart START_HOUR & END_HOUR: tightly frames active events and current time
  const { minHour, maxHour, dynamicHours } = useMemo(() => {
    const hours: number[] = [];
    timedEvents.forEach(e => {
      if (e.startTime) {
        const { hour, min } = parseTimeTo24h(e.startTime);
        hours.push(hour + min / 60);
      }
    });

    const candidates = [...hours];
    if (isToday) {
      candidates.push(currentHour + currentMin / 60);
    }

    let minH = 8;
    if (candidates.length > 0) {
      const minFloat = Math.min(...candidates);
      const dynamicStart = Math.floor(minFloat) - 1;
      minH = Math.max(minFloat < 6 ? Math.floor(minFloat) : 6, Math.min(10, dynamicStart));
    }

    let maxH = 22;
    if (candidates.length > 0) {
      const maxFloat = Math.max(...candidates);
      maxH = Math.min(23, Math.max(18, Math.ceil(maxFloat) + 1));
    }

    const arr: number[] = [];
    for (let i = minH; i <= maxH; i++) {
      arr.push(i);
    }
    return { minHour: minH, maxHour: maxH, dynamicHours: arr };
  }, [timedEvents, isToday, currentHour, currentMin]);

  // Jump to active current time
  const scrollToNow = () => {
    if (scrollContainerRef.current) {
      const targetH = Math.max(minHour, currentHour - 0.5);
      const targetScroll = (targetH - minHour) * HOUR_HEIGHT;
      scrollContainerRef.current.scrollTo({ top: targetScroll, behavior: 'smooth' });
    }
  };

  // Auto-scroll near current time on load
  useEffect(() => {
    if (scrollContainerRef.current) {
      const targetH = isToday ? Math.max(minHour, currentHour - 0.5) : minHour;
      const targetScroll = (targetH - minHour) * HOUR_HEIGHT;
      scrollContainerRef.current.scrollTop = targetScroll;
    }
  }, [selectedDate, isToday, minHour, currentHour]);

  // Native non-passive wheel isolation — detaches time grid from outer page scroll.
  // Uses scrollBy with behavior:'auto' to bypass any CSS smooth-scroll queuing
  // (which causes the stutter when scroll-behavior:smooth conflicts with rapid events).
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      // Normalize deltaMode: 0=pixels, 1=lines(~20px), 2=pages(clientHeight)
      let delta = e.deltaY;
      if (e.deltaMode === 1) delta *= 20;
      else if (e.deltaMode === 2) delta *= el.clientHeight;

      const { scrollTop, scrollHeight, clientHeight } = el;
      const canScrollDown = scrollTop + clientHeight < scrollHeight - 1;
      const canScrollUp = scrollTop > 0;
      if ((delta > 0 && canScrollDown) || (delta < 0 && canScrollUp)) {
        e.preventDefault();
        // behavior:'auto' = instant, no animation queuing = smooth native feel
        el.scrollBy({ top: delta, behavior: 'auto' });
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Positioned events
  const positionedEvents = useMemo(() => {
    return timedEvents.map(event => {
      let startH = 9;
      let startM = 0;
      let endH = 10;
      let endM = 0;

      if (event.startTime) {
        const parsed = parseTimeTo24h(event.startTime);
        startH = parsed.hour;
        startM = parsed.min;
      }
      if (event.endTime) {
        const parsed = parseTimeTo24h(event.endTime);
        endH = parsed.hour;
        endM = parsed.min;
      } else {
        endH = Math.min(23, startH + 1);
        endM = startM;
      }

      const startFloat = startH + startM / 60;
      const endFloat = Math.max(startFloat + 0.5, endH + endM / 60);

      const top = (startFloat - minHour) * HOUR_HEIGHT;
      const height = Math.max(34, (endFloat - startFloat) * HOUR_HEIGHT);

      const isPast = isToday && (endH * 60 + endM) < currentTimeMins;

      return {
        event,
        top,
        height,
        isPast,
      };
    });
  }, [timedEvents, minHour, isToday, currentTimeMins]);

  const currentLineTop = (currentHour + currentMin / 60 - minHour) * HOUR_HEIGHT;
  const isCurrentTimeInRange = isToday && currentHour >= minHour && currentHour <= maxHour;

  return (
    <div className="calendar-day-view-container">
      {/* ── Day Header Bar with Now Button ── */}
      <div className="calendar-day-header-meta">
        <div className="day-header-meta-left">
          <Clock size={15} color="#a599ff" />
          <span className="day-meta-label">
            {timedEvents.length + unscheduledEvents.length} Events Scheduled
          </span>
        </div>
        {isToday && (
          <button type="button" className="timeline-now-pill" onClick={scrollToNow} title="Jump to current time">
            <span className="now-pulsing-dot" />
            <span>Now ({format12Hour(`${currentHour.toString().padStart(2, '0')}:${currentMin.toString().padStart(2, '0')}`)})</span>
          </button>
        )}

      </div>
      {/* ── Unscheduled Events Horizontal Strip ── */}
      {unscheduledEvents.length > 0 && (
        <div className="calendar-unscheduled-bar">
          <span className="unscheduled-label">UNSCHEDULED</span>
          <div className="unscheduled-scroll-track">
            {unscheduledEvents.map(evt => {
              const colorSpec = colorMap[evt.type] || colorMap.todo;
              return (
                <div
                  key={evt.id}
                  className="unscheduled-chip"
                  style={{
                    backgroundColor: colorSpec.bg,
                    borderColor: `${colorSpec.border}60`,
                  }}
                  onClick={() => onSelectEvent(evt)}
                >
                  <span className="unscheduled-dot" style={{ backgroundColor: colorSpec.border }} />
                  <span className="unscheduled-chip-title" style={{ color: colorSpec.border }}>
                    {evt.title}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 24h Timeline Scroll Area ── */}
      <div className="calendar-day-timeline-scroll" ref={scrollContainerRef}>
        <div
          className="calendar-day-grid"
          style={{ minHeight: `${(maxHour - minHour + 1) * HOUR_HEIGHT + 40}px` }}
        >
          {/* Hourly Slots in Normal Document Flow */}
          {dynamicHours.map(hour => {
            const timeStr = `${hour.toString().padStart(2, '0')}:00`;
            const isPastHour = isToday && (hour * 60) < currentTimeMins;

            return (
              <div
                key={hour}
                className={`calendar-hour-slot ${isPastHour ? 'past-hour' : ''}`}
                style={{ height: `${HOUR_HEIGHT}px` }}
                onClick={() => onQuickAddAtTime(timeStr)}
                title={`Click to add event at ${format12Hour(timeStr)}`}
              >
                <span className="calendar-hour-label">
                  {format12Hour(timeStr)}
                </span>
                <div className="calendar-hour-line" />
              </div>
            );
          })}

          {/* Current Time Indicator Line */}
          {isCurrentTimeInRange && (
            <div
              className="calendar-current-time-line"
              style={{ top: `${currentLineTop}px` }}
            >
              <div className="current-time-dot" />
              <div className="current-time-bar" />
            </div>
          )}


          {/* Positioned Event Blocks */}
          <div className="calendar-events-layer">
            {positionedEvents.map(({ event, top, height, isPast }) => {
              const colorSpec = colorMap[event.type] || colorMap.todo;
              return (
                <div
                  key={event.id}
                  className={`calendar-event-card ${isPast ? 'faded-past' : ''} ${event.isCompleted ? 'completed-card' : ''}`}
                  style={{
                    top: `${top}px`,
                    height: `${height}px`,
                    backgroundColor: colorSpec.bg,
                    borderLeftColor: colorSpec.border,
                    borderColor: `${colorSpec.border}40`,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectEvent(event);
                  }}
                >
                  <div className="event-card-header">
                    <span className="event-card-title" style={{ color: colorSpec.border }}>
                      {event.title}
                    </span>
                    {event.isCompleted && (
                      <CheckCircle2 size={13} color="#5eda9e" />
                    )}
                  </div>
                  <div className="event-card-meta">
                    <span className="event-card-time" style={{ color: isDark ? '#a1a1aa' : '#4b5563' }}>
                      <Clock size={11} />
                      {format12Hour(event.startTime)} - {format12Hour(event.endTime)}
                    </span>
                    {event.location && (
                      <span className="event-card-location">
                        <MapPin size={11} />
                        {event.location}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
