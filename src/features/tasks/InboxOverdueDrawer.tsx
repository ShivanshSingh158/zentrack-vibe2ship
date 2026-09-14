import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Inbox, AlertCircle, X, Calendar, CheckCircle2 } from 'lucide-react';
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

  // Escape key to smoothly dismiss
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="task-modal-overlay"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          role="dialog"
          aria-modal="true"
        >
          <motion.div
            className="inbox-overdue-drawer"
            onClick={e => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.95, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{
              type: 'spring',
              damping: 28,
              stiffness: 340,
              mass: 0.75,
            }}
          >
            {/* Header */}
            <div className="drawer-header">
              <div className="drawer-tabs">
                <button
                  type="button"
                  className={`drawer-tab ${activeTab === 'overdue' ? 'active overdue-tab' : ''}`}
                  onClick={() => setActiveTab('overdue')}
                >
                  <AlertCircle size={15} />
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
                  <Inbox size={15} />
                  <span>Unscheduled Inbox</span>
                  {inboxTasks.length > 0 && (
                    <span className="tab-badge inbox-badge">{inboxTasks.length}</span>
                  )}
                </button>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={onClose}
                aria-label="Close"
              >
                <X size={17} />
              </button>
            </div>

            {/* Content Body */}
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
                      <div className="empty-state-icon-wrap overdue-clean">
                        <CheckCircle2 size={32} color="#10b981" />
                      </div>
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
                            aria-label="Toggle complete"
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
                            <Calendar size={13} />
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
                      <div className="empty-state-icon-wrap inbox-clean">
                        <Inbox size={32} color="#818cf8" />
                      </div>
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
                            aria-label="Toggle complete"
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
                            <Calendar size={13} />
                            <span>Schedule</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
