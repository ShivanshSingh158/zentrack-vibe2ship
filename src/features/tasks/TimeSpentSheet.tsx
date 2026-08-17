import React, { useMemo } from 'react';
import { Timer, X, CheckCircle2, Calendar, ArrowRight } from 'lucide-react';
import type { TodoItem } from '../../types';

interface TimeSpentSheetProps {
  isOpen: boolean;
  onClose: () => void;
  tasks: TodoItem[];
  selectedDate: string;
}

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

function getPlannedMinutes(task: TodoItem): number | null {
  if (task.estimatedMinutes) return task.estimatedMinutes;
  if (task.timeSlot) {
    const parts = task.timeSlot.split(/[-–]/).map(s => s.trim());
    const startMin = parseTimeStrMinutes(parts[0]);
    const endMin = parts.length > 1 ? parseTimeStrMinutes(parts[1]) : null;
    if (startMin !== null && endMin !== null) {
      let duration = endMin - startMin;
      if (duration < 0) duration += 24 * 60;
      return duration > 0 ? duration : null;
    }
  }
  return null;
}

function formatMinutes(min: number): string {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function priorityColor(priority?: string): string {
  if (priority === 'high' || priority === 'P1') return '#ff6961';
  if (priority === 'medium' || priority === 'P2') return '#ff9f4d';
  return '#a599ff';
}

export const TimeSpentSheet: React.FC<TimeSpentSheetProps> = ({
  isOpen,
  onClose,
  tasks,
  selectedDate,
}) => {
  const dateTasks = useMemo(() =>
    tasks.filter(t => t.date === selectedDate),
    [tasks, selectedDate]
  );

  const trackedTasks = useMemo(() =>
    dateTasks.filter(t => getPlannedMinutes(t) || t.actualMinutes),
    [dateTasks]
  );

  const untrackedTasks = useMemo(() =>
    dateTasks.filter(t => !getPlannedMinutes(t) && !t.actualMinutes),
    [dateTasks]
  );

  const totalPlanned = useMemo(() =>
    trackedTasks.reduce((sum, t) => sum + (getPlannedMinutes(t) || 0), 0),
    [trackedTasks]
  );

  const totalActual = useMemo(() =>
    trackedTasks.reduce((sum, t) => sum + (t.actualMinutes || 0), 0),
    [trackedTasks]
  );

  const formattedDate = useMemo(() => {
    const d = new Date(selectedDate + 'T12:00:00');
    if (isNaN(d.getTime())) return selectedDate;
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }, [selectedDate]);

  const isOver = totalActual > totalPlanned;

  if (!isOpen) return null;

  return (
    <div className="task-modal-overlay" onClick={onClose}>
      <div className="task-modal-card time-spent-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="time-spent-header">
          <div className="time-spent-header-left">
            <Timer size={22} color="#a599ff" />
            <div>
              <h3>Time Spent Analytics</h3>
              <p className="time-spent-sub">{formattedDate}</p>
            </div>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Summary Boxes */}
        {(totalPlanned > 0 || totalActual > 0) && (
          <div className="time-spent-summary-row">
            <div className="summary-stat-box planned-box">
              <span className="stat-box-label">PLANNED</span>
              <span className="stat-box-val">{totalPlanned > 0 ? formatMinutes(totalPlanned) : '–'}</span>
            </div>
            <div className={`summary-stat-box actual-box ${isOver ? 'over-budget' : 'on-track'}`}>
              <span className="stat-box-label">ACTUAL</span>
              <span className="stat-box-val">{totalActual > 0 ? formatMinutes(totalActual) : '–'}</span>
            </div>
          </div>
        )}

        <div className="time-spent-list-container">
          {/* Tracked tasks */}
          {trackedTasks.length > 0 && (
            <div className="time-spent-group">
              <div className="group-header-label">TRACKED COMMITMENTS</div>
              {trackedTasks.map(task => {
                const actual = task.actualMinutes;
                const planned = getPlannedMinutes(task);
                const maxRef = Math.max(planned || 0, actual || 0, 30);
                const plannedPct = planned ? Math.min((planned / maxRef) * 100, 100) : 0;
                const actualPct = actual ? Math.min((actual / maxRef) * 100, 100) : 0;
                const taskIsOver = actual && planned && actual > planned;

                return (
                  <div key={task.id} className="time-spent-card">
                    <div className="time-spent-card-stripe" style={{ backgroundColor: priorityColor(task.priority) }} />
                    <div className="time-spent-card-body">
                      <div className="time-spent-title-row">
                        <span className="time-spent-title">{task.title || task.text}</span>
                        {task.status === 'completed' && (
                          <CheckCircle2 size={16} color="#5eda9e" />
                        )}
                      </div>

                      {(task.timeSlot || task.actualStartTime) && (
                        <div className="time-spent-slot-meta">
                          {task.timeSlot && <span>Planned slot: {task.timeSlot}</span>}
                          {task.timeSlot && task.actualStartTime && <span> · </span>}
                          {task.actualStartTime && <span>Started: {task.actualStartTime}</span>}
                        </div>
                      )}

                      {/* Dual Bars */}
                      <div className="time-spent-dual-bars">
                        {planned && (
                          <div className="dual-bar-row">
                            <span className="dual-bar-label">Plan</span>
                            <div className="dual-bar-track">
                              <div className="dual-bar-fill plan-fill" style={{ width: `${plannedPct}%` }} />
                            </div>
                            <span className="dual-bar-val plan-val">{formatMinutes(planned)}</span>
                          </div>
                        )}
                        {actual && (
                          <div className="dual-bar-row">
                            <span className="dual-bar-label">Real</span>
                            <div className="dual-bar-track">
                              <div className={`dual-bar-fill ${taskIsOver ? 'over-fill' : 'good-fill'}`} style={{ width: `${actualPct}%` }} />
                            </div>
                            <span className={`dual-bar-val ${taskIsOver ? 'over-val' : 'good-val'}`}>{formatMinutes(actual)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Untracked tasks */}
          {untrackedTasks.length > 0 && (
            <div className="time-spent-group">
              <div className="group-header-label">UNTRACKED</div>
              {untrackedTasks.map(task => (
                <div key={task.id} className="time-spent-untracked-row">
                  <div className="time-spent-card-stripe" style={{ backgroundColor: priorityColor(task.priority) }} />
                  <span className="untracked-title">{task.title || task.text}</span>
                  <span className="untracked-hint">No time logged</span>
                </div>
              ))}
            </div>
          )}

          {dateTasks.length === 0 && (
            <div className="time-spent-empty">
              <Timer size={36} color="rgba(255,255,255,0.2)" />
              <p>No tasks found for this day.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
