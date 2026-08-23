import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Calendar as CalendarIcon,
  Clock,
  Tag,
  Plus,
  Trash2,
  Check,
  Zap,
  Repeat,
  AlertCircle
} from 'lucide-react';
import type { TodoItem, TodoSubtask } from '../../types';
import { formatDisplayDate } from '../../utils/dateUtils';

interface EditTodoModalProps {
  isOpen: boolean;
  onClose: () => void;
  todo: TodoItem | null;
  onSave: (updated: TodoItem) => Promise<void>;
  onDelete?: (id: string) => void;
}

const DEFAULT_TAG_LIBRARY = ['study', 'work', 'gym', 'exam', 'project', 'health', 'reading', 'errand'];

const TAG_PALETTE = ['#a599ff', '#38bdf8', '#5eda9e', '#f59e0b', '#ff6961', '#f472b6', '#818cf8', '#fbbf24'];
function tagColorFor(tag: string): string {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  return TAG_PALETTE[Math.abs(hash) % TAG_PALETTE.length];
}

export const EditTodoModal: React.FC<EditTodoModalProps> = ({
  isOpen,
  onClose,
  todo,
  onSave,
  onDelete,
}) => {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [priority, setPriority] = useState<TodoItem['priority']>('medium');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [estimatedMinutes, setEstimatedMinutes] = useState<number | undefined>(undefined);
  const [subtasks, setSubtasks] = useState<TodoSubtask[]>([]);
  const [newSubtaskText, setNewSubtaskText] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState('');
  const [showNewTagInput, setShowNewTagInput] = useState(false);
  const [isRecurring, setIsRecurring] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (todo && isOpen) {
      setTitle(todo.title || todo.text || '');
      setDate(todo.date || '');
      setPriority(todo.priority || 'medium');
      setEstimatedMinutes(todo.estimatedMinutes);
      setSubtasks(todo.subtasks || []);
      setSelectedTags(todo.tags || []);
      setIsRecurring(!!todo.isRecurring);

      if (todo.timeSlot) {
        const parts = todo.timeSlot.split('-');
        setStartTime(parts[0]?.trim() || '');
        setEndTime(parts[1]?.trim() || '');
      } else {
        setStartTime('');
        setEndTime('');
      }
    }
  }, [todo, isOpen]);

  if (!isOpen || !todo) return null;

  const addSubtask = () => {
    if (!newSubtaskText.trim()) return;
    setSubtasks(prev => [
      ...prev,
      {
        id: Date.now().toString(),
        title: newSubtaskText.trim(),
        completed: false,
        status: 'pending',
      },
    ]);
    setNewSubtaskText('');
  };

  const removeSubtask = (id: string) => {
    setSubtasks(prev => prev.filter(st => st.id !== id));
  };

  const toggleTag = (tag: string) => {
    const clean = tag.trim().toLowerCase();
    setSelectedTags(prev =>
      prev.includes(clean) ? prev.filter(t => t !== clean) : [...prev, clean]
    );
  };

  const createCustomTag = () => {
    const clean = newTagInput.trim().toLowerCase().replace(/\s+/g, '-');
    if (!clean) return;
    if (!selectedTags.includes(clean)) {
      setSelectedTags(prev => [...prev, clean]);
    }
    setNewTagInput('');
    setShowNewTagInput(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || saving) return;

    setSaving(true);
    try {
      let timeSlotString: string | null = null;
      if (startTime) {
        timeSlotString = endTime ? `${startTime} - ${endTime}` : startTime;
      }

      await onSave({
        ...todo,
        title: title.trim(),
        text: title.trim(),
        date: date || todo.date,
        priority: priority || 'medium',
        timeSlot: timeSlotString,
        estimatedMinutes: estimatedMinutes || undefined,
        subtasks,
        tags: selectedTags,
        isRecurring,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      <div className="task-modal-overlay" onClick={onClose}>
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 16 }}
          transition={{ type: 'spring', damping: 28, stiffness: 350 }}
          className="task-modal-studio-container"
          onClick={e => e.stopPropagation()}
        >
          {/* ── HEADER ── */}
          <div className="task-modal-studio-header">
            <div className="modal-title-group">
              <h2 className="modal-headline">Edit Task</h2>
              <span className="modal-subtitle">Update schedule, priority, and subtasks</span>
            </div>
            <button type="button" className="modal-close-icon-btn" onClick={onClose}>
              <X size={18} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="task-modal-studio-form">
            {/* Title Input */}
            <div className="task-smart-input-wrapper">
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Task description..."
                className="task-smart-input"
                autoFocus
                required
              />
            </div>

            {/* Priority Selector Pills */}
            <div className="task-modal-control-row">
              <label className="control-label">Priority</label>
              <div className="priority-pills-cluster">
                {(['low', 'medium', 'high'] as const).map(p => {
                  const isActive = priority === p;
                  const pColor = p === 'high' ? '#ff6961' : p === 'medium' ? '#f59e0b' : '#5eda9e';
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPriority(p)}
                      className={`priority-pill-btn ${isActive ? 'active' : ''}`}
                      style={{
                        borderColor: isActive ? pColor : 'var(--color-border)',
                        backgroundColor: isActive ? `${pColor}18` : 'transparent',
                        color: isActive ? pColor : 'var(--color-text-3)',
                      }}
                    >
                      <span className="priority-pill-dot" style={{ backgroundColor: pColor }} />
                      <span className="priority-pill-label">{p.charAt(0).toUpperCase() + p.slice(1)}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Date & Time Grid */}
            <div className="schedule-inputs-grid">
              <div className="schedule-input-group">
                <label className="input-sublabel">Date</label>
                <div className="input-with-icon">
                  <CalendarIcon size={14} className="input-icon" />
                  <input
                    type="date"
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    className="studio-native-input"
                  />
                </div>
              </div>

              <div className="schedule-input-group">
                <label className="input-sublabel">Start Time</label>
                <div className="input-with-icon">
                  <Clock size={14} className="input-icon" />
                  <input
                    type="time"
                    value={startTime}
                    onChange={e => setStartTime(e.target.value)}
                    className="studio-native-input"
                  />
                </div>
              </div>

              <div className="schedule-input-group">
                <label className="input-sublabel">End Time</label>
                <div className="input-with-icon">
                  <Clock size={14} className="input-icon" />
                  <input
                    type="time"
                    value={endTime}
                    onChange={e => setEndTime(e.target.value)}
                    className="studio-native-input"
                  />
                </div>
              </div>
            </div>

            {/* Tags Cloud */}
            <div className="edit-tags-section">
              <label className="input-sublabel">Tags</label>
              <div className="tags-cloud-cluster">
                {Array.from(new Set([...DEFAULT_TAG_LIBRARY, ...selectedTags])).map(t => {
                  const isSelected = selectedTags.includes(t);
                  const color = tagColorFor(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => toggleTag(t)}
                      className={`tag-selectable-chip ${isSelected ? 'selected' : ''}`}
                      style={{
                        color: isSelected ? color : 'var(--color-text-3)',
                        backgroundColor: isSelected ? `${color}18` : 'rgba(255,255,255,0.04)',
                        borderColor: isSelected ? `${color}40` : 'var(--color-border)',
                      }}
                    >
                      <span>#{t}</span>
                      {isSelected && <Check size={12} strokeWidth={2.5} />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Subtasks Section */}
            <div className="edit-subtasks-section">
              <label className="input-sublabel">Subtasks ({subtasks.length})</label>
              <div className="subtask-add-row">
                <input
                  type="text"
                  value={newSubtaskText}
                  onChange={e => setNewSubtaskText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addSubtask();
                    }
                  }}
                  placeholder="Add step / checklist item..."
                  className="subtask-inline-input"
                />
                <button type="button" className="subtask-add-btn" onClick={addSubtask}>
                  <Plus size={15} />
                  <span>Add</span>
                </button>
              </div>

              {subtasks.length > 0 && (
                <div className="subtasks-list-stack">
                  {subtasks.map((st, idx) => (
                    <div key={st.id} className="subtask-item-row">
                      <span className="subtask-idx-badge">{idx + 1}</span>
                      <span className="subtask-item-text">{st.title}</span>
                      <button
                        type="button"
                        className="subtask-delete-btn"
                        onClick={() => removeSubtask(st.id)}
                        title="Remove subtask"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recurrence Toggle */}
            <label className="recurrence-toggle-box">
              <input
                type="checkbox"
                checked={isRecurring}
                onChange={e => setIsRecurring(e.target.checked)}
                className="studio-checkbox"
              />
              <div className="recurrence-toggle-copy">
                <span className="rec-toggle-title">
                  <Repeat size={14} /> Make this a daily recurring habit
                </span>
                <span className="rec-toggle-sub">Automatically respawns tomorrow when completed</span>
              </div>
            </label>

            {/* Footer Actions */}
            <div className="task-modal-studio-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              {onDelete && todo.id ? (
                <button
                  type="button"
                  className="studio-btn-danger"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    color: '#ef4444',
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.25)',
                    padding: '0.5rem 0.85rem',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    fontWeight: 600
                  }}
                  onClick={() => {
                    onDelete(todo.id!);
                    onClose();
                  }}
                >
                  <Trash2 size={14} />
                  <span>Delete Task</span>
                </button>
              ) : <div />}
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button type="button" className="studio-btn-cancel" onClick={onClose}>
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="studio-btn-primary">
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
