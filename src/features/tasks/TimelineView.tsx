import React, { useMemo } from 'react';
import { useGlobalData } from '../../contexts/GlobalDataContext';
import type { TodoItem } from '../../types';
import { Clock, Book, FlaskConical, CheckCircle, AlertCircle } from 'lucide-react';

interface TimelineViewProps {
  tasks: TodoItem[];
  selectedDate: string;
  onTaskClick: (task: TodoItem) => void;
}

const DEFAULT_START_HOUR = 6;
const END_HOUR = 23;
const HOUR_HEIGHT = 80;
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function parseTime(timeStr?: string): number | null {
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
  const { attendanceSubjects } = useGlobalData();

  const START_HOUR = useMemo(() => {
    const floats: number[] = [];
    tasks.filter(t => t.timeSlot).forEach(t => {
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

    if (floats.length === 0) return DEFAULT_START_HOUR;
    const minFloat = Math.min(...floats);
    return Math.min(DEFAULT_START_HOUR, Math.floor(minFloat - 0.1));
  }, [tasks, attendanceSubjects, selectedDate]);

  const hours = useMemo(() => {
    const arr = [];
    for (let i = START_HOUR; i <= END_HOUR; i++) {
      const ampm = i >= 12 ? 'PM' : 'AM';
      const displayHour = i % 12 || 12;
      arr.push({ hour: i, label: `${displayHour}:00 ${ampm}` });
    }
    return arr;
  }, [START_HOUR]);

  const positionedTasks = useMemo(() => {
    return tasks
      .filter(t => t.timeSlot)
      .map(task => {
        const startText = task.timeSlot!.split(/[-–]/)[0];
        const endText = task.timeSlot!.split(/[-–]/)[1];

        const startFloat = parseTime(startText);
        const endFloat = endText ? parseTime(endText) : (startFloat ? startFloat + 1 : null);

        if (startFloat === null || startFloat > END_HOUR) return null;

        const top = (startFloat - START_HOUR) * HOUR_HEIGHT;
        const durationFloat = endFloat && endFloat > startFloat ? endFloat - startFloat : 0.75;
        const height = durationFloat * HOUR_HEIGHT;

        const nowHours = new Date().getHours() + new Date().getMinutes() / 60;
        const isMissed = task.status === 'pending' && endFloat !== null && endFloat < nowHours;
        const isDone = task.status === 'completed';

        return {
          task,
          top,
          height: Math.max(height, HOUR_HEIGHT * 0.5),
          startFloat,
          endFloat: endFloat || (startFloat + 0.75),
          isMissed,
          isDone
        };
      }).filter(Boolean) as any[];
  }, [tasks, START_HOUR]);

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
          if (startFloat === null || startFloat > END_HOUR) return;
          const endFloat = Math.min(END_HOUR, startFloat + 1);
          const top = (startFloat - START_HOUR) * HOUR_HEIGHT;
          const height = (endFloat - startFloat) * HOUR_HEIGHT;
          blocks.push({ id: `${subject.id}-c-${i}`, title: subject.name, type: 'class', top, height: Math.max(height - 4, 36), time: c.time, room: c.room, endFloat });
        });
      }
      if (sch.labs && Array.isArray(sch.labs)) {
        sch.labs.forEach((l: any, i: number) => {
          if (!l.time) return;
          const startFloat = parseTime(l.time);
          if (startFloat === null || startFloat > END_HOUR) return;
          const endFloat = Math.min(END_HOUR, startFloat + 2);
          const top = (startFloat - START_HOUR) * HOUR_HEIGHT;
          const height = (endFloat - startFloat) * HOUR_HEIGHT;
          blocks.push({ id: `${subject.id}-l-${i}`, title: `${subject.name} (Lab)`, type: 'lab', top, height: Math.max(height - 4, 36), time: l.time, room: l.room, endFloat });
        });
      }
    });
    return blocks;
  }, [attendanceSubjects, selectedDate, START_HOUR]);

  return (
    <div style={{ position: 'relative', paddingRight: '1rem', marginTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
      <div style={{ position: 'relative', minHeight: `${(END_HOUR - START_HOUR + 1) * HOUR_HEIGHT}px` }}>
        {/* Background Grid */}
        {hours.map(h => (
          <div key={h.hour} style={{ height: `${HOUR_HEIGHT}px`, position: 'relative', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex' }}>
            <span style={{ position: 'absolute', top: '-10px', left: 0, fontSize: '0.75rem', color: 'var(--text-muted)', background: 'var(--bg-primary)', padding: '0 0.5rem', zIndex: 2 }}>{h.label}</span>
          </div>
        ))}

        {/* Classes */}
        <div style={{ position: 'absolute', top: 0, left: '60px', right: 0, bottom: 0 }}>
          {classBlocks.map(cb => {
            const isLab = cb.type === 'lab';
            const nowHours = new Date().getHours() + new Date().getMinutes() / 60;
            const isPast = cb.endFloat < nowHours;
            const bgColor = isPast ? 'rgba(100,100,100,0.1)' : isLab ? 'rgba(250, 215, 161, 0.12)' : 'rgba(137, 220, 235, 0.12)';
            const borderColor = isPast ? 'rgba(160,160,160,0.4)' : isLab ? '#FAD7A1' : '#89dceb';

            return (
              <div key={cb.id} style={{ position: 'absolute', top: `${cb.top}px`, height: `${cb.height}px`, left: '10px', right: '10px', background: bgColor, borderLeft: `3px solid ${borderColor}`, borderRadius: '0 8px 8px 0', padding: '0.5rem', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginBottom: '0.25rem' }}>
                  {isLab ? <FlaskConical size={12} color={borderColor} /> : <Book size={12} color={borderColor} />}
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, color: borderColor, textTransform: 'uppercase' }}>{isPast ? 'PAST' : (isLab ? 'LAB' : 'CLASS')}</span>
                </div>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: isPast ? 'var(--text-muted)' : 'var(--text-primary)', textDecoration: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cb.title}</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}><Clock size={10} /> {cb.time} {cb.room ? `• ${cb.room}` : ''}</span>
              </div>
            );
          })}

          {/* Tasks */}
          {positionedTasks.map(pt => {
            const isHigh = pt.task.priority === 'high' || pt.task.priority === 'P1';
            const isMed = pt.task.priority === 'medium' || pt.task.priority === 'P2';
            
            const bgColor = pt.isDone ? 'rgba(94, 218, 158, 0.10)' : pt.isMissed ? 'rgba(255, 105, 97, 0.12)' : isHigh ? 'rgba(255, 105, 97, 0.15)' : isMed ? 'rgba(255, 159, 77, 0.15)' : 'rgba(255,255,255,0.05)';
            const borderColor = pt.isDone ? '#5eda9e' : pt.isMissed ? 'rgba(255,105,97,0.6)' : isHigh ? '#ff6961' : isMed ? '#ff9f4d' : 'rgba(255,255,255,0.2)';

            return (
              <div 
                key={pt.task.id} 
                onClick={() => onTaskClick(pt.task)}
                style={{ position: 'absolute', top: `${pt.top}px`, height: `${pt.height}px`, left: '30px', right: '0px', background: bgColor, border: `1px solid ${borderColor}`, borderRadius: '8px', padding: '0.5rem', cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', overflow: 'hidden' }}
                className="timeline-task-hover"
              >
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: (pt.isDone || pt.isMissed) ? 'var(--text-muted)' : 'var(--text-primary)', textDecoration: pt.isDone ? 'line-through' : 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', paddingRight: '1rem' }}>{pt.task.title}</span>
                  {pt.isDone && <CheckCircle size={14} color="#5eda9e" style={{ flexShrink: 0 }} />}
                  {pt.isMissed && <AlertCircle size={14} color="#ff6961" style={{ flexShrink: 0 }} />}
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.25rem' }}><Clock size={10} /> {pt.task.timeSlot}</span>
              </div>
            );
          })}
        </div>
      </div>
      <style>{`
        .timeline-task-hover:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(0,0,0,0.2) !important;
          z-index: 10;
        }
      `}</style>
    </div>
  );
};
