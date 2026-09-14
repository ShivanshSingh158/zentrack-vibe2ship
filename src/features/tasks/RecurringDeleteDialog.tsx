import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Repeat, Calendar, Trash2, X, AlertTriangle } from 'lucide-react';
import type { TodoItem } from '../../types';
import { formatDisplayDate } from '../../utils/dateUtils';

interface RecurringDeleteDialogProps {
  isOpen: boolean;
  onClose: () => void;
  task: TodoItem | null;
  futureCount?: number;
  onDeleteOnlyThis: () => void;
  onDeleteAll: () => void;
}

export const RecurringDeleteDialog: React.FC<RecurringDeleteDialogProps> = ({
  isOpen,
  onClose,
  task,
  futureCount = 1,
  onDeleteOnlyThis,
  onDeleteAll,
}) => {
  // Escape key listener
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

  const dateLabel = task?.date ? formatDisplayDate(task.date) : 'today';
  const displayTitle = task?.title || task?.text || 'Recurring Task';

  return (
    <AnimatePresence>
      {isOpen && task && (
        <motion.div
          className="confirm-dialog-overlay"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        >
          <motion.div
            className="confirm-dialog-card recurring-delete-card"
            initial={{ opacity: 0, scale: 0.95, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{
              type: 'spring',
              damping: 28,
              stiffness: 340,
              mass: 0.75,
            }}
            onClick={e => e.stopPropagation()}
          >
          {/* Header Row */}
          <div className="confirm-dialog-header-row">
            <div className="confirm-dialog-icon-wrap recurring-warn-icon">
              <Repeat size={19} strokeWidth={2.4} />
            </div>
            <div className="confirm-dialog-content" style={{ flex: 1 }}>
              <div className="confirm-dialog-title-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 className="confirm-dialog-title">Delete Recurring Task</h3>
                <button
                  type="button"
                  className="confirm-dialog-close-btn"
                  onClick={onClose}
                  aria-label="Close dialog"
                >
                  <X size={16} />
                </button>
              </div>
              <p className="confirm-dialog-message" style={{ marginTop: '0.35rem', fontSize: '0.875rem', lineHeight: '1.45' }}>
                <strong style={{ color: 'inherit' }}>"{displayTitle}"</strong> is part of a recurring schedule.
                How would you like to delete it?
              </p>
            </div>
          </div>

          {/* Action Choice Cards */}
          <div className="recurring-delete-options" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {/* Option 1: Only this occurrence */}
            <button
              type="button"
              className="recurring-choice-btn choice-single"
              onClick={() => {
                onDeleteOnlyThis();
                onClose();
              }}
            >
              <div className="choice-icon-wrap">
                <Calendar size={18} />
              </div>
              <div className="choice-copy">
                <span className="choice-title">Delete only this task</span>
                <span className="choice-desc">
                  Removes only the task on {dateLabel}. All other upcoming instances stay intact.
                </span>
              </div>
            </button>

            {/* Option 2: This and all future occurrences */}
            <button
              type="button"
              className="recurring-choice-btn choice-all"
              onClick={() => {
                onDeleteAll();
                onClose();
              }}
            >
              <div className="choice-icon-wrap danger-wrap">
                <Trash2 size={18} />
              </div>
              <div className="choice-copy">
                <span className="choice-title danger-text">Delete this and all future tasks</span>
                <span className="choice-desc">
                  Permanently deletes this task and {futureCount > 1 ? `all ${futureCount - 1} upcoming occurrences` : 'all subsequent occurrences'}.
                </span>
              </div>
            </button>
          </div>

          {/* Footer with Cancel */}
          <div className="confirm-dialog-actions" style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.25rem' }}>
            <button
              type="button"
              className="confirm-dialog-btn cancel-btn"
              onClick={onClose}
            >
              Cancel
            </button>
          </div>
        </motion.div>
      </motion.div>
      )}
    </AnimatePresence>
  );
};
