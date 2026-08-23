import React, { useMemo, useEffect, useState, useRef } from 'react';
import { useGlobalData } from '../../contexts/GlobalDataContext';
import { getLocalDateString } from '../../utils/dateUtils';
import type { TodoItem } from '../../types';
import { Clock, Book, FlaskConical, CheckCircle2, AlertCircle, Dumbbell, Sparkles, Navigation } from 'lucide-react';
import { WEEKDAY_TO_PLAN } from '../../features/gym/data/gymPlan';

interface TimelineViewProps {
  tasks: TodoItem[];
  selectedDate: string;
  onTaskClick: (task: TodoItem) => void;
}

const END_HOUR = 23;
const HOUR_HEIGHT = 60; // Compact ergonomic height for PC desktop screens
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];


function parseTime(timeStr?: string | null): number | null {
  if (!timeStr) return null;
  const upper = timeStr.trim().toUpperCase();
  const isPM = upper.includes('PM');
  const isAM = upper.includes('AM');
  const cleaned = upper.replace(/[APM\s]+$/i, '').trim();
  const parts = cleaned.split(':');
  let h = parseInt(parts[0], 10);
  if (isNaN(h)) return null;
  const m = parts.length >= 2 ? (parseInt(parts[1], 10) || 0) : 0;
  if (isPM || isAM) {
    if (isPM && h !== 12) h += 12;
    if (isAM && h === 12) h = 0;
  }
  return h + m / 60;
}

export const TimelineView: React.FC<TimelineViewProps> = ({ tasks, selectedDate, onTaskClick }) => {
  const { attendanceSubjects, gymSchedule } = useGlobalData();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const [currentTimeFloat, setCurrentTimeFloat] = useState<number>(() => {
    const now = new Date();
    return now.getHours() + now.getMinutes() / 60;
  });

  // Update current time indicator every minute
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTimeFloat(now.getHours() + now.getMinutes() / 60);
    }, 60000);
    return () => clearInterval(timer);
  }, []);

  // Smart START_HOUR: tightly frames the actual events and current time, eliminating empty morning space
  const START_HOUR = useMemo(() => {
    const todayStr = getLocalDateString();
    const isToday = selectedDate === todayStr;
    const floats: number[] = [];


    tasks.filter(t => t.timeSlot && t.date === selectedDate).forEach(t => {
      const startText = t.timeSlot!.split(/[-–]/)[0];
      const f = parseTime(startText);
      if (f !== null && f <= END_HOUR) floats.push(f);
    });

    if (attendanceSubjects && selectedDate) {
      const dayOfWeek = new Date(selectedDate + 'T00:00:00').getDay();
      const dayKey = dayOfWeek.toString();
      attendanceSubjects.forEach(subject => {
        const sch = subject.schedule?.[dayKey] || subject.schedule?.[dayOfWeek as any] || subject.schedule?.[DAY_NAMES[dayOfWeek]] || subject.schedule?.[DAY_NAMES[dayOfWeek].toLowerCase()];
        if (!sch) return;
        (sch.classes || []).forEach((c: any) => {
          const f = parseTime(c.time);
          if (f !== null && f <= END_HOUR) floats.push(f);
        });
        (sch.labs || []).forEach((l: any) => {
          const f = parseTime(l.time);
          if (f !== null && f <= END_HOUR) floats.push(f);
        });
      });
    }

    const candidates = [...floats];
    if (isToday) {
      candidates.push(currentTimeFloat);
    }

    if (candidates.length === 0) return 8; // Default to 8 AM if no items

    const minFloat = Math.min(...candidates);
    // Start 1 hour before earliest item (e.g. 10 AM event -> 9 AM start)
    const dynamicStart = Math.floor(minFloat) - 1;
    return Math.max(minFloat < 6 ? Math.floor(minFloat) : 6, Math.min(10, dynamicStart));
  }, [tasks, attendanceSubjects, selectedDate, currentTimeFloat]);

  // Jump to active current time
  const scrollToNow = () => {
    if (scrollContainerRef.current) {
      const targetHour = Math.max(START_HOUR, currentTimeFloat - 0.75);
      const targetScroll = (targetHour - START_HOUR) * HOUR_HEIGHT;
      scrollContainerRef.current.scrollTo({ top: targetScroll, behavior: 'smooth' });
    }
  };

  // Auto-scroll on initial mount / date switch
  useEffect(() => {
    if (scrollContainerRef.current) {
      const targetHour = Math.max(START_HOUR, currentTimeFloat - 0.75);
      const targetScroll = (targetHour - START_HOUR) * HOUR_HEIGHT;
      scrollContainerRef.current.scrollTop = targetScroll;
    }
  }, [START_HOUR, selectedDate]);

  const hours = useMemo(() => {
    const arr = [];
    for (let i = START_HOUR; i <= END_HOUR; i++) {
      const ampm = i >= 12 ? 'PM' : 'AM';
      const displayHour = i % 12 || 12;
      arr.push({ hour: i, label: `${displayHour}:00 ${ampm}` });
    }
    return arr;
  }, [START_HOUR]);

  // Positioned Academic Class & Lab Blocks
  const classBlocks = useMemo(() => {
    if (!attendanceSubjects || !selectedDate) return [];
    const dayOfWeek = new Date(selectedDate + 'T00:00:00').getDay();
    const dayKey = dayOfWeek.toString();
    const blocks: any[] = [];

    attendanceSubjects.forEach(subject => {
      const sch = subject.schedule?.[dayKey] || subject.schedule?.[dayOfWeek as any] || subject.schedule?.[DAY_NAMES[dayOfWeek]] || subject.schedule?.[DAY_NAMES[dayOfWeek].toLowerCase()];
      if (!sch) return;

      if (sch.classes && Array.isArray(sch.classes)) {
        sch.classes.forEach((c: any, i: number) => {
          if (!c.time) return;
          const startFloat = parseTime(c.time);
          if (startFloat === null || startFloat > END_HOUR || startFloat < START_HOUR) return;
          const endFloat = Math.min(END_HOUR, startFloat + 1);
          const top = (startFloat - START_HOUR) * HOUR_HEIGHT;
          const height = (endFloat - startFloat) * HOUR_HEIGHT;
          blocks.push({
            id: `${subject.id}-c-${i}`,
            title: subject.name,
            type: 'class',
            top,
            height: Math.max(height - 4, 32),
            time: c.time,
            room: c.room,
            endFloat,
          });
        });
      }
      if (sch.labs && Array.isArray(sch.labs)) {
        sch.labs.forEach((l: any, i: number) => {
          if (!l.time) return;
          const startFloat = parseTime(l.time);
          if (startFloat === null || startFloat > END_HOUR || startFloat < START_HOUR) return;
          const endFloat = Math.min(END_HOUR, startFloat + 2);
          const top = (startFloat - START_HOUR) * HOUR_HEIGHT;
          const height = (endFloat - startFloat) * HOUR_HEIGHT;
          blocks.push({
            id: `${subject.id}-l-${i}`,
            title: `${subject.name} (Lab)`,
            type: 'lab',
            top,
            height: Math.max(height - 4, 32),
            time: l.time,
            room: l.room,
            endFloat,
          });
        });
      }
    });
    return blocks;
  }, [attendanceSubjects, selectedDate, START_HOUR]);

  // Positioned Tasks
  const positionedTasks = useMemo(() => {
    return tasks
      .filter(t => t.timeSlot && t.date === selectedDate)
      .map(task => {
        const parts = task.timeSlot!.split(/[-–]/).map(s => s.trim());
        const startFloat = parseTime(parts[0]);
        const endFloat = parts.length > 1 ? parseTime(parts[1]) : (startFloat ? startFloat + 1 : null);

        if (startFloat === null || startFloat > END_HOUR || startFloat < START_HOUR) return null;

        const top = (startFloat - START_HOUR) * HOUR_HEIGHT;
        const durationFloat = endFloat && endFloat > startFloat ? endFloat - startFloat : 0.75;
        const height = durationFloat * HOUR_HEIGHT;

        const isMissed = task.status === 'pending' && endFloat !== null && endFloat < currentTimeFloat;
        const isDone = task.status === 'completed';

        return {
          task,
          top,
          height: Math.max(height - 4, 32),
          startFloat,
          endFloat: endFloat || (startFloat + 0.75),
          isMissed,
          isDone,
        };
      }).filter(Boolean) as any[];
  }, [tasks, selectedDate, START_HOUR, currentTimeFloat]);

  // Current Time Line Top
  const currentLineTop = (currentTimeFloat - START_HOUR) * HOUR_HEIGHT;
  const isCurrentTimeInRange = currentTimeFloat >= START_HOUR && currentTimeFloat <= END_HOUR + 1;

  return (
    <div className="timeline-view-wrapper">
      {/* Timeline Mini Header with Jump to Now */}
      <div className="timeline-top-bar">
        <div className="timeline-top-bar-left">
          <Clock size={15} color="#a599ff" />
          <span className="timeline-top-title">24-Hour Schedule</span>
        </div>

        {isCurrentTimeInRange && (
          <button type="button" className="timeline-now-pill" onClick={scrollToNow} title="Scroll to current time">
            <span className="now-pulsing-dot" />
            <span>Now ({new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})</span>
          </button>
        )}
      </div>

      <div className="timeline-scroll-area" ref={scrollContainerRef}>
        <div className="timeline-grid-container" style={{ minHeight: `${(END_HOUR - START_HOUR + 1) * HOUR_HEIGHT + 40}px` }}>
          {/* Hour Grid Lines */}
          {hours.map(h => (
            <div key={h.hour} className="timeline-hour-slot" style={{ height: `${HOUR_HEIGHT}px` }}>
              <span className="timeline-hour-label">{h.label}</span>
              <div className="timeline-hour-line" />
            </div>
          ))}

          {/* Current Time Line Indicator */}
          {isCurrentTimeInRange && (
            <div className="timeline-current-time-line" style={{ top: `${currentLineTop}px` }}>
              <div className="current-time-dot" />
              <div className="current-time-bar" />
            </div>
          )}

          {/* Schedule Overlay Area */}
          <div className="timeline-events-overlay">
            {/* Academic Classes & Labs */}
            {classBlocks.map(cb => {
              const isLab = cb.type === 'lab';
              const isPast = cb.endFloat < currentTimeFloat;
              const borderColor = isPast ? '#636366' : isLab ? '#FAD7A1' : '#89dceb';
              const bgColor = isPast ? 'rgba(100,100,100,0.08)' : isLab ? 'rgba(250, 215, 161, 0.12)' : 'rgba(137, 220, 235, 0.12)';

              return (
                <div
                  key={cb.id}
                  className="timeline-event-block academic-block"
                  style={{
                    top: `${cb.top}px`,
                    height: `${cb.height}px`,
                    backgroundColor: bgColor,
                    borderLeftColor: borderColor,
                  }}
                >
                  <div className="event-block-header">
                    {isLab ? <FlaskConical size={12} color={borderColor} /> : <Book size={12} color={borderColor} />}
                    <span className="event-type-badge" style={{ color: borderColor }}>
                      {isPast ? 'PAST' : isLab ? 'LAB' : 'CLASS'}
                    </span>
                  </div>
                  <span className="event-block-title">{cb.title}</span>
                  <span className="event-block-time">
                    <Clock size={10} /> {cb.time} {cb.room ? `• ${cb.room}` : ''}
                  </span>
                </div>
              );
            })}

            {/* Tasks */}
            {positionedTasks.map(pt => {
              const isHigh = pt.task.priority === 'high' || pt.task.priority === 'P1';
              const isMed = pt.task.priority === 'medium' || pt.task.priority === 'P2';

              const borderColor = pt.isDone ? '#5eda9e' : pt.isMissed ? '#ff6961' : isHigh ? '#ff6961' : isMed ? '#ff9f4d' : '#a599ff';
              const bgColor = pt.isDone
                ? 'rgba(94, 218, 158, 0.10)'
                : pt.isMissed
                ? 'rgba(255, 105, 97, 0.12)'
                : isHigh
                ? 'rgba(255, 105, 97, 0.12)'
                : isMed
                ? 'rgba(255, 159, 77, 0.12)'
                : 'rgba(165, 153, 255, 0.10)';

              return (
                <div
                  key={pt.task.id}
                  onClick={() => onTaskClick(pt.task)}
                  className={`timeline-event-block task-block ${pt.isDone ? 'completed' : ''}`}
                  style={{
                    top: `${pt.top}px`,
                    height: `${pt.height}px`,
                    backgroundColor: bgColor,
                    borderColor: `${borderColor}50`,
                    borderLeftColor: borderColor,
                  }}
                >
                  <div className="event-block-header">
                    <span className={`event-block-title ${pt.isDone ? 'completed-title' : ''}`}>
                      {pt.task.title || pt.task.text}
                    </span>
                    {pt.isDone ? (
                      <CheckCircle2 size={13} color="#5eda9e" />
                    ) : pt.isMissed ? (
                      <AlertCircle size={13} color="#ff6961" />
                    ) : null}
                  </div>
                  <span className="event-block-time">
                    <Clock size={10} /> {pt.task.timeSlot}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
