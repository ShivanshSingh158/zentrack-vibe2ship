import React, { useEffect, useRef, useMemo } from 'react';
import { getEventColors, format12Hour, HOUR_HEIGHT, parseTimeTo24h } from './calendarUtils';
import { getLocalDateString } from '../../utils/dateUtils';
import { Clock, MapPin, CheckCircle2, Video, BookOpen, Dumbbell, CheckSquare, Sparkles } from 'lucide-react';

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
    const timer = setInterval(() => setCurrentTime(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  const todayStr = getLocalDateString();
  const isToday = selectedDate === todayStr;

  const currentHour = currentTime.getHours();
  const currentMin = currentTime.getMinutes();
  const currentTimeMins = currentHour * 60 + currentMin;

  // Dynamic smart START_HOUR & END_HOUR (default 7am to 10pm, auto-expands for early/late events)
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

    let minH = 7;
    if (candidates.length > 0) {
      const minFloat = Math.min(...candidates);
      minH = Math.max(0, Math.min(7, Math.floor(minFloat) - 1));
    }

    let maxH = 22;
    if (candidates.length > 0) {
      const maxFloat = Math.max(...candidates);
      maxH = Math.min(23, Math.max(22, Math.ceil(maxFloat) + 1));
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
      const targetH = isToday ? Math.max(minHour, currentHour - 0.5) : Math.max(minHour, 8);
      const targetScroll = (targetH - minHour) * HOUR_HEIGHT;
      scrollContainerRef.current.scrollTop = targetScroll;
    }
  }, [selectedDate, isToday, minHour, currentHour]);

  // Native non-passive wheel isolation
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

  // Smart Collision Layout Algorithm (Side-by-side positioning for overlapping events)
  const positionedEvents = useMemo(() => {
    // 1. Calculate raw start and end in minutes from minHour
    const items = timedEvents.map(event => {
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

      const startMinTotal = startH * 60 + startM;
      const endMinTotal = Math.max(startMinTotal + 30, endH * 60 + endM);

      const top = ((startMinTotal - minHour * 60) / 60) * HOUR_HEIGHT;
      const height = Math.max(32, ((endMinTotal - startMinTotal) / 60) * HOUR_HEIGHT);
      const isPast = isToday && endMinTotal < currentTimeMins;

      return {
        event,
        startMin: startMinTotal,
        endMin: endMinTotal,
        top,
        height,
        isPast,
        colIndex: 0,
        totalCols: 1,
      };
    });

    // Sort items by startMin ascending, then duration descending
    items.sort((a, b) => a.startMin - b.startMin || (b.endMin - b.startMin) - (a.endMin - a.startMin));

    // Overlap clustering algorithm
    const clusters: (typeof items)[] = [];
    let currentCluster: typeof items = [];
    let clusterEnd = -1;

    items.forEach(item => {
      if (currentCluster.length === 0 || item.startMin < clusterEnd) {
        currentCluster.push(item);
        clusterEnd = Math.max(clusterEnd, item.endMin);
      } else {
        clusters.push(currentCluster);
        currentCluster = [item];
        clusterEnd = item.endMin;
      }
    });
    if (currentCluster.length > 0) {
      clusters.push(currentCluster);
    }

    // Assign column index and total columns within each cluster
    clusters.forEach(cluster => {
      const columns: (typeof items)[] = [];
      cluster.forEach(item => {
        let placed = false;
        for (let i = 0; i < columns.length; i++) {
          const lastInCol = columns[i][columns[i].length - 1];
          if (lastInCol.endMin <= item.startMin) {
            columns[i].push(item);
            item.colIndex = i;
            placed = true;
            break;
          }
        }
        if (!placed) {
          item.colIndex = columns.length;
          columns.push([item]);
        }
      });
      const totalCols = columns.length;
      cluster.forEach(item => {
        item.totalCols = totalCols;
      });
    });

    return items;
  }, [timedEvents, minHour, isToday, currentTimeMins]);

  const currentLineTop = ((currentHour * 60 + currentMin - minHour * 60) / 60) * HOUR_HEIGHT;
  const isCurrentTimeInRange = isToday && currentHour >= minHour && currentHour <= maxHour;

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'class':
      case 'lab':
        return <BookOpen size={12} />;
      case 'gym':
        return <Dumbbell size={12} />;
      case 'todo':
        return <CheckSquare size={12} />;
      default:
        return <Clock size={12} />;
    }
  };

  return (
    <div className="calendar-day-view-container">
      {/* ── Day Header Meta Bar ── */}
      <div className="calendar-day-header-meta">
        <div className="day-header-meta-left">
          <Clock size={14} color="#a599ff" />
          <span className="day-meta-label">
            {timedEvents.length} Timed • {unscheduledEvents.length} All-Day
          </span>
        </div>

        {isToday && (
          <button type="button" className="timeline-now-pill" onClick={scrollToNow} title="Jump to active time">
            <span className="now-pulsing-dot" />
            <span>Now ({format12Hour(`${currentHour.toString().padStart(2, '0')}:${currentMin.toString().padStart(2, '0')}`)})</span>
          </button>
        )}
      </div>

      {/* ── All-Day / Unscheduled Drawer ── */}
      {unscheduledEvents.length > 0 && (
        <div className="calendar-unscheduled-bar">
          <span className="unscheduled-label">ALL-DAY / TASKS</span>
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
                  {evt.isCompleted && <CheckCircle2 size={11} color="#5eda9e" />}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 24-Hour Time Grid ── */}
      <div className="calendar-day-timeline-scroll" ref={scrollContainerRef}>
        <div
          className="calendar-day-grid"
          style={{ minHeight: `${(maxHour - minHour + 1) * HOUR_HEIGHT + 30}px` }}
        >
          {/* Hourly Slots */}
          {dynamicHours.map(hour => {
            const timeStr = `${hour.toString().padStart(2, '0')}:00`;
            const isPastHour = isToday && (hour * 60) < currentTimeMins;

            return (
              <div
                key={hour}
                className={`calendar-hour-slot ${isPastHour ? 'past-hour' : ''}`}
                style={{ height: `${HOUR_HEIGHT}px` }}
                onClick={() => onQuickAddAtTime(timeStr)}
                title={`Click to schedule event at ${format12Hour(timeStr)}`}
              >
                <span className="calendar-hour-label">
                  {format12Hour(timeStr)}
                </span>
                <div className="calendar-hour-line" />
              </div>
            );
          })}

          {/* Cron-Style Live Crimson Laser Current Time Marker */}
          {isCurrentTimeInRange && (
            <div
              className="calendar-current-time-line"
              style={{ top: `${currentLineTop}px` }}
            >
              <div className="current-time-dot" />
              <div className="current-time-bar" />
            </div>
          )}

          {/* Positioned Events Layer with Multi-Column Overlap */}
          <div className="calendar-events-layer">
            {positionedEvents.map(({ event, top, height, isPast, colIndex, totalCols }) => {
              const colorSpec = colorMap[event.type] || colorMap.todo;
              const widthPct = (100 / totalCols) - 0.5;
              const leftPct = (colIndex * (100 / totalCols));

              return (
                <div
                  key={event.id}
                  className={`calendar-event-card ${isPast ? 'faded-past' : ''} ${event.isCompleted ? 'completed-card' : ''}`}
                  style={{
                    top: `${top}px`,
                    height: `${height}px`,
                    left: `calc(58px + ${leftPct}% * 0.92)`,
                    width: `calc(${widthPct}% * 0.92)`,
                    backgroundColor: colorSpec.bg,
                    borderLeftColor: colorSpec.border,
                    borderColor: `${colorSpec.border}45`,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectEvent(event);
                  }}
                >
                  <div className="event-card-header">
                    <div className="event-card-title-wrap">
                      <span className="event-card-icon" style={{ color: colorSpec.border }}>
                        {getEventIcon(event.type)}
                      </span>
                      <span className="event-card-title" style={{ color: colorSpec.border }}>
                        {event.title}
                      </span>
                    </div>

                    {event.meetLink && (
                      <a
                        href={event.meetLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="event-card-quick-meet-chip"
                        onClick={e => e.stopPropagation()}
                        title="Join Google Meet"
                      >
                        <Video size={10} />
                        <span>Join</span>
                      </a>
                    )}

                    {event.isCompleted && (
                      <CheckCircle2 size={12} color="#5eda9e" />
                    )}
                  </div>

                  <div className="event-card-meta">
                    <span className="event-card-time" style={{ color: isDark ? '#a1a1aa' : '#4b5563' }}>
                      <Clock size={10} />
                      {format12Hour(event.startTime)} – {format12Hour(event.endTime)}
                    </span>
                    {event.location && (
                      <span className="event-card-location">
                        <MapPin size={10} />
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
