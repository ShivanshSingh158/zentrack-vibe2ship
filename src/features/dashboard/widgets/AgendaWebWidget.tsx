/**
 * AgendaWebWidget.tsx — Web twin of mobile AgendaWidget
 * Time-sorted today's tasks/classes/gym rows with left color bars
 * Exact mobile design language, adapted for desktop
 */
import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Plus, Clock } from 'lucide-react';
import { formatTimeRangeDisplay } from '../../../utils/dateUtils';

interface AgendaTask {
  id: string;
  title: string;
  timeSlot?: string;
  status?: string;
  priority?: 'high' | 'medium' | 'low';
  type?: 'task' | 'class' | 'gym' | 'lab';
}

interface AgendaWebWidgetProps {
  tasks: any[];
  calendarEvents?: any[];
  gymLogs?: any[];
  attendanceSubjects?: any[];
  todayStr: string;
  nowDate: Date;
  onAddTask?: (text: string) => void;
}

function parseTimeToMins(tStr: string): number {
  if (!tStr) return 9999;
  const startStr = tStr.split('-')[0].trim().toLowerCase();
  let h = 0; let m = 0;
  const isPM = startStr.includes('pm');
  const isAM = startStr.includes('am');
  const cleanStr = startStr.replace(/[a-z\s]/g, '');
  const parts = cleanStr.split(':');
  if (parts.length >= 2) {
    h = parseInt(parts[0], 10) || 0; m = parseInt(parts[1], 10) || 0;
  } else {
    h = parseInt(parts[0], 10) || 0;
  }
  if (isPM && h < 12) h += 12;
  if (isAM && h === 12) h = 0;
  return h * 60 + m;
}

function formatTimeStr(tStr: string): string {
  if (!tStr) return '';
  if (tStr.includes('-')) return tStr.split('-').map(s => formatTimeStr(s.trim())).join(' – ');
  const lower = tStr.toLowerCase();
  if (lower.includes('am') || lower.includes('pm')) return lower.replace(/\s+/g, '');
  const parts = tStr.split(':');
  if (parts.length < 2) return tStr;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return tStr;
  const ampm = h >= 12 ? 'pm' : 'am';
  const hr = h % 12 || 12;
  return `${hr}:${m.toString().padStart(2, '0')}${ampm}`;
}

const TYPE_COLOR: Record<string, string> = {
  task: '#a599ff',
  class: '#89dceb',
  lab: '#38bdf8',
  gym: '#ff6961',
};

export function AgendaWebWidget({
  tasks,
  calendarEvents = [],
  gymLogs = [],
  attendanceSubjects = [],
  todayStr,
  nowDate,
  onAddTask,
}: AgendaWebWidgetProps) {
  const navigate = useNavigate();
  const [addText, setAddText] = useState('');

  const agendaItems = useMemo<AgendaTask[]>(() => {
    const items: AgendaTask[] = [];

    // Today's tasks
    for (const t of tasks) {
      if (t.date === todayStr) {
        items.push({
          id: t.id,
          title: t.title,
          timeSlot: t.timeSlot || '',
          status: t.status,
          priority: t.priority,
          type: 'task',
        });
      }
    }

    // Today's classes from attendance subjects
    const dayOfWeek = nowDate.getDay().toString();
    const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    for (const subj of attendanceSubjects) {
      const sch =
        subj.schedule?.[dayOfWeek] ||
        subj.schedule?.[Number(dayOfWeek)] ||
        subj.schedule?.[DAY_NAMES[nowDate.getDay()]] ||
        subj.schedule?.[DAY_NAMES[nowDate.getDay()].toLowerCase()];
      if (!sch) continue;
      (sch.classes || []).forEach((c: any) => {
        if (c.time) items.push({ id: `${subj.id}-class-${c.time}`, title: `${subj.name} Lecture`, timeSlot: c.time, type: 'class' });
      });
      (sch.labs || []).forEach((l: any) => {
        if (l.time) items.push({ id: `${subj.id}-lab-${l.time}`, title: `${subj.name} Lab`, timeSlot: l.time, type: 'lab' });
      });
    }

    // Sort by time
    items.sort((a, b) => parseTimeToMins(a.timeSlot || '') - parseTimeToMins(b.timeSlot || ''));
    return items;
  }, [tasks, attendanceSubjects, todayStr, nowDate]);

  const nowMins = nowDate.getHours() * 60 + nowDate.getMinutes();

  const handleAddKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && addText.trim()) {
      onAddTask?.(addText.trim());
      setAddText('');
    }
  };

  return (
    <div className="agenda-card">
      {/* Header */}
      <div className="agenda-header">
        <span className="agenda-section-label">Today's Agenda</span>
        <button className="agenda-all-link" onClick={() => navigate('/tasks')}>
          All tasks →
        </button>
      </div>

      {/* Task rows */}
      <div className="agenda-rows">
        {agendaItems.length === 0 && (
          <div className="agenda-empty">
            <Clock size={16} style={{ opacity: 0.3 }} />
            <span>No agenda items for today</span>
          </div>
        )}
        {agendaItems.map((item, i) => {
          const timeMins = parseTimeToMins(item.timeSlot || '');
          const isActive = timeMins <= nowMins && nowMins <= timeMins + 60;
          const isDone = item.status === 'completed';
          const accentColor = TYPE_COLOR[item.type || 'task'];

          return (
            <motion.div
              key={item.id}
              className={`agenda-row${isActive ? ' agenda-row--active' : ''}${isDone ? ' agenda-row--done' : ''}`}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04, duration: 0.25 }}
              onClick={() => navigate('/tasks')}
              title={item.title}
            >
              {/* Left color bar */}
              <div
                className={`agenda-row-bar${isActive ? ' agenda-row-bar--pulse' : ''}`}
                style={{ background: isActive ? accentColor : (isDone ? '#5eda9e' : accentColor) }}
              />

              {/* Content */}
              <div className="agenda-row-content">
                <span
                  className="agenda-row-title"
                  style={{
                    color: isDone ? '#636366' : '#f2f2f7',
                    textDecoration: isDone ? 'line-through' : 'none',
                  }}
                >
                  {item.title}
                </span>
                {item.timeSlot && (
                  <span className="agenda-row-time" style={{ color: isActive ? accentColor : '#636366' }}>
                    {formatTimeRangeDisplay(item.timeSlot)}
                  </span>
                )}
              </div>

              {/* Status icon */}
              {isDone ? (
                <span className="agenda-row-done-icon">✓</span>
              ) : (
                <span className="agenda-row-clock-icon">🕐</span>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Quick add */}
      <div className="agenda-add-bar">
        <Plus size={14} color="#636366" />
        <input
          className="agenda-add-input"
          placeholder="+ Add task for today…"
          value={addText}
          onChange={e => setAddText(e.target.value)}
          onKeyDown={handleAddKeyDown}
        />
      </div>
    </div>
  );
}
