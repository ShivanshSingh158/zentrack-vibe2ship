import React, { useMemo, useRef, useEffect } from 'react';
import { getEventColors, format12Hour, HOUR_HEIGHT, parseTimeTo24h } from './calendarUtils';
import type { MergedCalendarEvent } from './CalendarDayView';
import { Clock } from 'lucide-react';

interface CalendarWeekViewProps {
  selectedDate: string;
  allEvents: MergedCalendarEvent[];
  isDark?: boolean;
  onSelectDate: (dateStr: string) => void;
  onSelectEvent: (event: MergedCalendarEvent) => void;
  onQuickAddAtDateTime: (dateStr: string, timeStr: string) => void;
}

const DAY_LABELS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

export const CalendarWeekView: React.FC<CalendarWeekViewProps> = ({
  selectedDate,
  allEvents,
  isDark = true,
  onSelectDate,
  onSelectEvent,
  onQuickAddAtDateTime,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const colorMap = useMemo(() => getEventColors(isDark), [isDark]);

  const todayStr = new Date().toISOString().split('T')[0];
  const currentTime = new Date();
  const currentHour = currentTime.getHours();
  const currentMin = currentTime.getMinutes();

  // Compute 7 days of the week for selectedDate (Sun to Sat)
  const weekDays = useMemo(() => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    const sel = new Date(y, (m || 1) - 1, d || 1);
    const sunday = new Date(sel);
    sunday.setDate(sel.getDate() - sel.getDay());

    return Array.from({ length: 7 }, (_, i) => {
      const cur = new Date(sunday);
      cur.setDate(sunday.getDate() + i);
      const yyyy = cur.getFullYear();
      const mm = String(cur.getMonth() + 1).padStart(2, '0');
      const dd = String(cur.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;
      return {
        dateStr,
        dayLabel: DAY_LABELS[i],
        dateNum: cur.getDate(),
        isToday: dateStr === todayStr,
        isSelected: dateStr === selectedDate,
        isPast: dateStr < todayStr,
      };
    });
  }, [selectedDate, todayStr]);

  // Hours: 7 AM to 10 PM
  const START_HOUR = 7;
  const END_HOUR = 22;
  const hours = useMemo(() => {
    const arr = [];
    for (let h = START_HOUR; h <= END_HOUR; h++) {
      arr.push(h);
    }
    return arr;
  }, []);

  // Filter events belonging to this week
  const weekDatesSet = useMemo(() => new Set(weekDays.map(w => w.dateStr)), [weekDays]);
  const weekEvents = useMemo(() => {
    return allEvents.filter(e => e.date && weekDatesSet.has(e.date));
  }, [allEvents, weekDatesSet]);

  // Auto-scroll near current time or 9 AM
  useEffect(() => {
    if (scrollContainerRef.current) {
      const targetScroll = Math.max(0, (currentHour - START_HOUR - 1) * HOUR_HEIGHT);
      scrollContainerRef.current.scrollTop = targetScroll;
    }
  }, [selectedDate, currentHour]);

  // Native non-passive wheel isolation — detaches week time grid from outer page scroll.
  // scrollBy with behavior:'auto' prevents animation queuing from any CSS smooth-scroll.
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      let delta = e.deltaY;
      if (e.deltaMode === 1) delta *= 20;
      else if (e.deltaMode === 2) delta *= el.clientHeight;

      const { scrollTop, scrollHeight, clientHeight } = el;
      const canScrollDown = scrollTop + clientHeight < scrollHeight - 1;
      const canScrollUp = scrollTop > 0;
      if ((delta > 0 && canScrollDown) || (delta < 0 && canScrollUp)) {
        e.preventDefault();
        el.scrollBy({ top: delta, behavior: 'auto' });
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  return (
    <div className="calendar-week-view-container">
      {/* ── 7-Day Column Headers ── */}
      <div className="calendar-week-header-row">
        <div className="week-time-gutter-header" />
        <div className="week-columns-header-track">
          {weekDays.map((wd) => {
            const dayEventsCount = weekEvents.filter(e => e.date === wd.dateStr).length;

            return (
              <div
                key={wd.dateStr}
                className={`week-col-header ${wd.isSelected ? 'selected' : ''} ${wd.isToday ? 'today' : ''} ${wd.isPast ? 'past' : ''}`}
                onClick={() => onSelectDate(wd.dateStr)}
              >
                <span className="week-day-name">{wd.dayLabel}</span>
                <span className="week-date-badge">{wd.dateNum}</span>
                {dayEventsCount > 0 && (
                  <div className="week-dots-indicator">
                    {Array.from({ length: Math.min(3, dayEventsCount) }).map((_, di) => (
                      <span key={di} className="week-dot" />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── 7-Day Timeline Scroll Area ── */}
      <div className="calendar-week-scroll-area" ref={scrollContainerRef}>
        <div
          className="calendar-week-grid"
          style={{ height: `${(END_HOUR - START_HOUR + 1) * HOUR_HEIGHT + 20}px` }}
        >
          {/* Hour Labels Gutter */}
          <div className="week-hour-gutter">
            {hours.map(hour => (
              <div
                key={hour}
                className="week-hour-gutter-label"
                style={{ top: `${(hour - START_HOUR) * HOUR_HEIGHT}px` }}
              >
                {format12Hour(`${hour.toString().padStart(2, '0')}:00`).replace(':00', '')}
              </div>
            ))}
          </div>

          {/* 7 Columns Grid */}
          <div className="week-columns-grid">
            {weekDays.map((wd, dayIdx) => {
              const dayEvts = weekEvents.filter(e => e.date === wd.dateStr);

              return (
                <div
                  key={wd.dateStr}
                  className={`week-day-column ${wd.isToday ? 'today-col' : ''} ${wd.isPast ? 'past-col' : ''}`}
                >
                  {/* Grid Lines */}
                  {hours.map(hour => {
                    const timeStr = `${hour.toString().padStart(2, '0')}:00`;
                    return (
                      <div
                        key={hour}
                        className="week-hour-cell"
                        style={{
                          top: `${(hour - START_HOUR) * HOUR_HEIGHT}px`,
                          height: `${HOUR_HEIGHT}px`,
                        }}
                        onClick={() => onQuickAddAtDateTime(wd.dateStr, timeStr)}
                        title={`Click to add event on ${wd.dateStr} at ${format12Hour(timeStr)}`}
                      />
                    );
                  })}

                  {/* Day Events Overlay */}
                  {dayEvts.map(evt => {
                    const { hour: sh, min: sm } = parseTimeTo24h(evt.startTime);
                    const { hour: eh, min: em } = parseTimeTo24h(evt.endTime || `${Math.min(23, sh + 1)}:00`);

                    const startFloat = sh + sm / 60;
                    const endFloat = Math.max(startFloat + 0.45, eh + em / 60);

                    if (startFloat > END_HOUR || endFloat < START_HOUR) return null;

                    const top = (Math.max(START_HOUR, startFloat) - START_HOUR) * HOUR_HEIGHT;
                    const height = Math.max(26, (endFloat - Math.max(START_HOUR, startFloat)) * HOUR_HEIGHT);

                    const colorSpec = colorMap[evt.type] || colorMap.todo;

                    return (
                      <div
                        key={evt.id}
                        className="week-event-card"
                        style={{
                          top: `${top}px`,
                          height: `${height}px`,
                          backgroundColor: colorSpec.bg,
                          borderLeftColor: colorSpec.border,
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectEvent(evt);
                        }}
                        title={`${evt.title} (${format12Hour(evt.startTime)} - ${format12Hour(evt.endTime)})`}
                      >
                        <span className="week-event-title" style={{ color: colorSpec.border }}>
                          {evt.title}
                        </span>
                        {height > 36 && (
                          <span className="week-event-time">
                            {format12Hour(evt.startTime)}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
