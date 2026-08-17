import React, { useState } from 'react';
import { Inbox, AlertCircle, X, Calendar, CheckCircle2, Trash2, ArrowRight } from 'lucide-react';
import { getLocalDateString } from '../../utils/dateUtils';
import type { TodoItem } from '../../types';

interface InboxOverdueDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  inboxTasks: TodoItem[];
  overdueTasks: TodoItem[];
  onTaskClick: (task: TodoItem) => void;
  onToggleComplete: (task: TodoItem) => void;
  onScheduleToday: (task: TodoItem) => void;
  onClearOverdue: () => void;
}

export const InboxOverdueDrawer: React.FC<InboxOverdueDrawerProps> = ({
  isOpen,
  onClose,
  inboxTasks,
  overdueTasks,
  onTaskClick,
  onToggleComplete,
  onScheduleToday,
  onClearOverdue,
}) => {
  const [activeTab, setActiveTab] = useState<'overdue' | 'inbox'>('overdue');

  if (!isOpen) return null;

  return (
    <div className="task-modal-overlay" onClick={onClose}>
      <div className="inbox-overdue-drawer" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="drawer-header">
          <div className="drawer-tabs">
            <button
              type="button"
              className={`drawer-tab ${activeTab === 'overdue' ? 'active overdue-tab' : ''}`}
              onClick={() => setActiveTab('overdue')}
            >
              <AlertCircle size={16} />
              <span>Overdue</span>
              {overdueTasks.length > 0 && (
                <span className="tab-badge overdue-badge">{overdueTasks.length}</span>
              )}
            </button>
            <button
              type="button"
              className={`drawer-tab ${activeTab === 'inbox' ? 'active inbox-tab' : ''}`}
              onClick={() => setActiveTab('inbox')}
            >
              <Inbox size={16} />
              <span>Unscheduled Inbox</span>
              {inboxTasks.length > 0 && (
                <span className="tab-badge inbox-badge">{inboxTasks.length}</span>
              )}
            </button>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="drawer-body">
          {activeTab === 'overdue' ? (
            <div>
              {overdueTasks.length > 0 && (
                <div className="drawer-actions-bar">
                  <span className="overdue-warning-text">
                    {overdueTasks.length} task{overdueTasks.length === 1 ? '' : 's'} past their scheduled date
                  </span>
                  <button type="button" className="drawer-clear-btn" onClick={onClearOverdue}>
                    Reschedule All to Today
                  </button>
                </div>
              )}

              {overdueTasks.length === 0 ? (
                <div className="drawer-empty-state">
                  <CheckCircle2 size={40} color="#5eda9e" />
                  <h4>No Overdue Tasks!</h4>
                  <p>All your past tasks are completed or scheduled.</p>
                </div>
              ) : (
                <div className="drawer-tasks-list">
                  {overdueTasks.map(task => (
                    <div key={task.id} className="drawer-task-row overdue-row">
                      <button
                        type="button"
                        className="drawer-checkbox"
                        onClick={() => onToggleComplete(task)}
                      />
                      <div className="drawer-task-info" onClick={() => onTaskClick(task)}>
                        <span className="drawer-task-title">{task.title || task.text}</span>
                        <div className="drawer-task-meta">
                          <span className="overdue-date-pill">Due: {task.date}</span>
                          {task.timeSlot && <span> · {task.timeSlot}</span>}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="drawer-reschedule-quick-btn"
                        onClick={() => onScheduleToday(task)}
                        title="Move to Today"
                      >
                        <Calendar size={14} />
                        <span>Today</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div>
              {inboxTasks.length === 0 ? (
                <div className="drawer-empty-state">
                  <Inbox size={40} color="rgba(255,255,255,0.2)" />
                  <h4>Inbox Zero</h4>
                  <p>No unscheduled tasks floating around.</p>
                </div>
              ) : (
                <div className="drawer-tasks-list">
                  {inboxTasks.map(task => (
                    <div key={task.id} className="drawer-task-row">
                      <button
                        type="button"
                        className="drawer-checkbox"
                        onClick={() => onToggleComplete(task)}
                      />
                      <div className="drawer-task-info" onClick={() => onTaskClick(task)}>
                        <span className="drawer-task-title">{task.title || task.text}</span>
                        {task.priority && (
                          <span className={`priority-tag ${task.priority}`}>
                            {task.priority.toUpperCase()}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        className="drawer-reschedule-quick-btn"
                        onClick={() => onScheduleToday(task)}
                        title="Schedule for Today"
                      >
                        <Calendar size={14} />
                        <span>Schedule</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
