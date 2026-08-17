import React from 'react';
import { Sparkles } from 'lucide-react';
import type { TodoItem } from '../../types';

interface ProgressRingProps {
  tasks: TodoItem[];
  selectedDate: string;
}

export const ProgressRing: React.FC<ProgressRingProps> = ({ tasks, selectedDate }) => {
  const dayTasks = tasks.filter(t => t.date === selectedDate);
  const totalCount = dayTasks.length;
  const doneCount = dayTasks.filter(t => t.status === 'completed').length;
  const remainingCount = totalCount - doneCount;
  const percentage = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  // Next pending task with time slot
  const nextPending = dayTasks
    .filter(t => t.status !== 'completed' && t.timeSlot)
    .sort((a, b) => (a.timeSlot || '').localeCompare(b.timeSlot || ''))[0];

  const size = 46;
  const strokeWidth = 3.5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  if (totalCount === 0) {
    return (
      <div className="task-progress-card empty">
        <div className="progress-info">
          <span className="progress-title">No tasks scheduled for this day</span>
          <span className="progress-sub">Click + Add Task to plan your day</span>
        </div>
      </div>
    );
  }

  return (
    <div className="task-progress-card">
      <div className="progress-ring-wrapper">
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="progress-ring-svg"
          style={{ overflow: 'visible' }}
        >
          {/* Background track */}
          <circle
            className="progress-ring-track"
            stroke="rgba(255, 255, 255, 0.08)"
            fill="transparent"
            strokeWidth={strokeWidth}
            r={radius}
            cx={size / 2}
            cy={size / 2}
          />
          {/* Animated Fill */}
          <circle
            className="progress-ring-fill"
            stroke={percentage === 100 ? '#5eda9e' : '#a599ff'}
            fill="transparent"
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            r={radius}
            cx={size / 2}
            cy={size / 2}
            style={{
              transition: 'stroke-dashoffset 0.6s cubic-bezier(0.16, 1, 0.3, 1), stroke 0.3s ease',
              transform: 'rotate(-90deg)',
              transformOrigin: '50% 50%',
            }}
          />
        </svg>
        <span className="progress-ring-text">{percentage}%</span>
      </div>

      <div className="progress-info">
        <div className="progress-headline">
          <span className="progress-count-text">
            <strong>{doneCount}</strong> of <strong>{totalCount}</strong> done today
          </span>
          {percentage === 100 && (
            <span className="all-done-badge">
              <Sparkles size={11} />
              <span>Complete!</span>
            </span>
          )}
        </div>
        <div className="progress-sub">
          {remainingCount === 0 ? (
            <span className="all-done-sub">You have conquered all tasks for today!</span>
          ) : nextPending ? (
            <span>
              {remainingCount} remaining · next at <strong className="next-time-highlight">{nextPending.timeSlot}</strong>
            </span>
          ) : (
            <span>{remainingCount} remaining {remainingCount === 1 ? 'task' : 'tasks'} for today</span>
          )}
        </div>
      </div>
    </div>
  );
};
