import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Timer, Calendar, Check, X, ArrowRight, Sparkles } from 'lucide-react';
import type { TodoItem } from '../../types';

interface TaskTimeLogSheetProps {
  task: TodoItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (taskId: string, actualMinutes: number, actualStartTime: string) => void;
}

const DEFAULT_DURATION_CHIPS = [
  { label: '5m', minutes: 5 },
  { label: '15m', minutes: 15 },
  { label: '30m', minutes: 30 },
  { label: '45m', minutes: 45 },
  { label: '1h', minutes: 60 },
  { label: '1.5h', minutes: 90 },
  { label: '2h', minutes: 120 },
  { label: '2.5h', minutes: 150 },
  { label: '3h', minutes: 180 },
];

function parseTimeStrMinutes(str?: string | null): number | null {
  if (!str) return null;
  const upper = str.trim().toUpperCase();
  const isPM = upper.includes('PM');
  const isAM = upper.includes('AM');
  const cleaned = upper.replace(/[APM\s]+$/i, '').trim();
  if (!cleaned) return null;
  const parts = cleaned.split(':');
  let h = parseInt(parts[0], 10);
  if (isNaN(h)) return null;
  const m = parts.length >= 2 ? (parseInt(parts[1], 10) || 0) : 0;
  if (isPM && h !== 12) h += 12;
  if (isAM && h === 12) h = 0;
  return h * 60 + m;
}

function minutesTo12HourStr(totalMin: number): string {
  const h24 = Math.floor(totalMin / 60) % 24;
  const m = Math.abs(totalMin % 60);
  const ampm = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function formatMinDisplay(min: number): string {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export const TaskTimeLogSheet: React.FC<TaskTimeLogSheetProps> = ({
  task,
  isOpen,
  onClose,
  onSave,
}) => {
  const timeSlotInfo = useMemo(() => {
    if (!task?.timeSlot) return null;
    const parts = task.timeSlot.split(/[-–]/).map(s => s.trim());
    const startMin = parseTimeStrMinutes(parts[0]);
    const endMin = parts.length > 1 ? parseTimeStrMinutes(parts[1]) : null;
    const durationMin = (startMin !== null && endMin !== null && endMin > startMin)
      ? (endMin - startMin)
      : null;
    return {
      startMin,
      endMin,
      durationMin,
      startStr: parts[0] || null,
      endStr: parts[1] || null,
      raw: task.timeSlot,
    };
  }, [task?.timeSlot]);

  const plannedMinutes = useMemo(() => {
    return task?.estimatedMinutes || timeSlotInfo?.durationMin || null;
  }, [task?.estimatedMinutes, timeSlotInfo?.durationMin]);

  const [selectedDuration, setSelectedDuration] = useState<number>(30);
  const [startOption, setStartOption] = useState<string>('ontime');
  const [customTimeStr, setCustomTimeStr] = useState<string>('09:00');

  const startChips = useMemo(() => {
    if (timeSlotInfo?.startMin !== null && timeSlotInfo?.startMin !== undefined) {
      const base = timeSlotInfo.startMin;
      return [
        { id: 'ontime', label: `On time (${minutesTo12HourStr(base)})`, offsetMin: 0 },
        { id: '+15', label: `+15m (${minutesTo12HourStr(base + 15)})`, offsetMin: 15 },
        { id: '+30', label: `+30m (${minutesTo12HourStr(base + 30)})`, offsetMin: 30 },
        { id: '+60', label: `+1h (${minutesTo12HourStr(base + 60)})`, offsetMin: 60 },
        { id: '-15', label: `-15m (${minutesTo12HourStr(base - 15)})`, offsetMin: -15 },
      ];
    } else {
      const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
      return [
        { id: 'now', label: `Just now (${minutesTo12HourStr(nowMin)})`, offsetMin: 0 },
        { id: '-15', label: `15m ago (${minutesTo12HourStr(nowMin - 15)})`, offsetMin: -15 },
        { id: '-30', label: `30m ago (${minutesTo12HourStr(nowMin - 30)})`, offsetMin: -30 },
        { id: '-60', label: `1h ago (${minutesTo12HourStr(nowMin - 60)})`, offsetMin: -60 },
      ];
    }
  }, [timeSlotInfo]);

  const durationChips = useMemo(() => {
    const list = [...DEFAULT_DURATION_CHIPS];
    if (plannedMinutes && !list.some(c => c.minutes === plannedMinutes)) {
      list.push({ label: formatMinDisplay(plannedMinutes), minutes: plannedMinutes });
      list.sort((a, b) => a.minutes - b.minutes);
    }
    return list;
  }, [plannedMinutes]);

  useEffect(() => {
    if (!isOpen || !task) return;
    const initialDur = plannedMinutes || 30;
    setSelectedDuration(initialDur);
    setStartOption(timeSlotInfo?.startMin !== null && timeSlotInfo?.startMin !== undefined ? 'ontime' : 'now');
    const now = new Date();
    setCustomTimeStr(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
  }, [isOpen, task, timeSlotInfo, plannedMinutes]);

  const handleSave = useCallback(() => {
    if (!task?.id) return;
    let actualStart: string;
    if (startOption === 'custom') {
      const parts = customTimeStr.split(':');
      const h = parseInt(parts[0], 10) || 0;
      const m = parseInt(parts[1], 10) || 0;
      actualStart = minutesTo12HourStr(h * 60 + m);
    } else {
      const selectedChip = startChips.find(c => c.id === startOption);
      if (timeSlotInfo?.startMin !== null && timeSlotInfo?.startMin !== undefined) {
        const offset = selectedChip ? selectedChip.offsetMin : 0;
        actualStart = minutesTo12HourStr(timeSlotInfo.startMin + offset);
      } else {
        const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
        const offset = selectedChip ? selectedChip.offsetMin : 0;
        actualStart = minutesTo12HourStr(nowMin + offset);
      }
    }

    onSave(task.id, selectedDuration, actualStart);
    onClose();
  }, [task, selectedDuration, startOption, customTimeStr, startChips, timeSlotInfo, onSave, onClose]);

  if (!isOpen || !task) return null;

  return (
    <div className="task-modal-overlay" onClick={onClose}>
      <div className="task-modal-card time-log-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="time-log-header">
          <div className="time-log-icon-badge">
            <Timer size={20} color="#a599ff" />
          </div>
          <div className="time-log-header-text">
            <h3>How long did it take?</h3>
            <p className="time-log-task-title">{task.title || task.text}</p>
            {timeSlotInfo?.raw && (
              <span className="time-log-planned-badge">
                <Calendar size={12} />
                <span>Planned: {timeSlotInfo.raw} {plannedMinutes ? `(${formatMinDisplay(plannedMinutes)})` : ''}</span>
              </span>
            )}
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Section 1: Duration */}
        <div className="time-log-section">
          <div className="time-log-section-label">
            <span>Duration Worked</span>
            {plannedMinutes && (
              <span className="planned-hint">Planned: {formatMinDisplay(plannedMinutes)}</span>
            )}
          </div>
          <div className="time-log-chips-grid">
            {durationChips.map(chip => {
              const isSelected = selectedDuration === chip.minutes;
              const isPlanned = chip.minutes === plannedMinutes;
              return (
                <button
                  type="button"
                  key={chip.minutes}
                  onClick={() => setSelectedDuration(chip.minutes)}
                  className={`duration-chip ${isSelected ? 'active-green' : ''} ${isPlanned && !isSelected ? 'planned-hint-chip' : ''}`}
                >
                  {isPlanned && !isSelected && <span className="planned-dot" />}
                  <span>{chip.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Section 2: Start Time */}
        <div className="time-log-section">
          <div className="time-log-section-label">When did you start?</div>
          <div className="time-log-start-chips-row">
            {startChips.map(chip => {
              const isSelected = startOption === chip.id;
              return (
                <button
                  type="button"
                  key={chip.id}
                  onClick={() => setStartOption(chip.id)}
                  className={`start-chip ${isSelected ? 'active' : ''}`}
                >
                  {chip.label}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setStartOption('custom')}
              className={`start-chip ${startOption === 'custom' ? 'active' : ''}`}
            >
              Custom...
            </button>
          </div>

          {startOption === 'custom' && (
            <div className="time-log-custom-input-wrap">
              <label>Enter Start Time (24h format HH:MM):</label>
              <input
                type="time"
                value={customTimeStr}
                onChange={e => setCustomTimeStr(e.target.value)}
                className="time-log-custom-input"
              />
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="time-log-footer">
          <button type="button" className="time-log-skip-btn" onClick={onClose}>
            Skip
          </button>
          <button type="button" className="time-log-save-btn" onClick={handleSave}>
            <Check size={16} />
            <span>Log {formatMinDisplay(selectedDuration)}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
