import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Calendar as CalendarIcon,
  Clock,
  ListChecks,
  Repeat,
  Tag,
  Plus,
  Trash2,
  Sparkles,
  Check,
  Zap,
  Flame,
  ChevronRight,
  AlertCircle
} from 'lucide-react';
import { parseNLTask, getLocalDateString, formatDisplayDate } from '../../utils/dateUtils';
import type { ParsedTask, NLPToken } from '../../utils/dateUtils';
import type { TodoItem, TodoSubtask, RecurrenceRule } from '../../types';

interface NewTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialDate: string;
  onSave: (task: Omit<TodoItem, 'id' | 'userId'>) => Promise<void>;
}

const DEFAULT_TAG_LIBRARY = ['study', 'work', 'gym', 'exam', 'project', 'health', 'reading', 'errand'];

const TAG_PALETTE = ['#a599ff', '#38bdf8', '#5eda9e', '#f59e0b', '#ff6961', '#f472b6', '#818cf8', '#fbbf24'];
function tagColorFor(tag: string): string {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  return TAG_PALETTE[Math.abs(hash) % TAG_PALETTE.length];
}

export const NewTaskModal: React.FC<NewTaskModalProps> = ({
  isOpen,
  onClose,
  initialDate,
  onSave,
}) => {
  const [rawInput, setRawInput] = useState('');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(initialDate);
  const [priority, setPriority] = useState<TodoItem['priority']>('medium');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [subtasks, setSubtasks] = useState<TodoSubtask[]>([]);
  const [newSubtaskText, setNewSubtaskText] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState('');
  const [showNewTagInput, setShowNewTagInput] = useState(false);
  const [recurrenceRule, setRecurrenceRule] = useState<RecurrenceRule>({ type: 'once' });
  const [durationMinutes, setDurationMinutes] = useState<number | null>(null);
  const [nlpTokens, setNlpTokens] = useState<NLPToken[]>([]);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'schedule' | 'subtasks' | 'tags'>('schedule');

  const inputRef = useRef<HTMLInputElement | null>(null);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setRawInput('');
      setTitle('');
      setDate(initialDate);
      setPriority('medium');
      setStartTime('');
      setEndTime('');
      setSubtasks([]);
      setSelectedTags([]);
      setRecurrenceRule({ type: 'once' });
      setDurationMinutes(null);
      setNlpTokens([]);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, initialDate]);

  // Real-Time NLP Parsing Engine
  const handleInputChange = useCallback((text: string) => {
    setRawInput(text);

    if (!text.trim()) {
      setTitle('');
      setNlpTokens([]);
      return;
    }

    const parsed: ParsedTask = parseNLTask(text);
    setTitle(parsed.title || text);
    setNlpTokens(parsed.tokens || []);

    if (parsed.date && parsed.tokens.some(t => t.type === 'date')) {
      setDate(parsed.date);
    }
    if (parsed.timeSlot && parsed.tokens.some(t => t.type === 'time')) {
      setStartTime(parsed.timeSlot);
      if (parsed.endTimeSlot) setEndTime(parsed.endTimeSlot);
    }
    if (parsed.tokens.some(t => t.type === 'priority')) {
      setPriority(parsed.priority);
    }
    if (parsed.tokens.some(t => t.type === 'recurrence') && parsed.recurrenceRule) {
      setRecurrenceRule(parsed.recurrenceRule as any);
    }
    if (parsed.tags && parsed.tags.length > 0) {
      setSelectedTags(prev => Array.from(new Set([...prev, ...parsed.tags!])));
    }
    if (parsed.durationMinutes != null) {
      setDurationMinutes(parsed.durationMinutes);
    }
  }, []);

  // Subtask Handlers
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

  // Tag Handlers
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

  // Quick Date Presets
  const setDatePreset = (preset: 'today' | 'tomorrow' | 'nextWeek') => {
    const d = new Date();
    if (preset === 'tomorrow') d.setDate(d.getDate() + 1);
    if (preset === 'nextWeek') d.setDate(d.getDate() + 7);
    setDate(getLocalDateString(d));
  };

  // Save Task
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalTitle = title.trim() || rawInput.trim();
    if (!finalTitle || saving) return;

    setSaving(true);
    try {
      let timeSlotString: string | null = null;
      if (startTime) {
        timeSlotString = endTime ? `${startTime} - ${endTime}` : startTime;
      }

      await onSave({
        title: finalTitle,
        text: finalTitle,
        date: date || initialDate,
        status: 'pending',
        priority: priority || 'medium',
        timeSlot: timeSlotString,
        estimatedMinutes: durationMinutes || undefined,
        subtasks,
        tags: selectedTags,
        isRecurring: recurrenceRule?.type !== 'once' && recurrenceRule?.type !== undefined,
        recurrenceRule: recurrenceRule?.type !== 'once' ? recurrenceRule : undefined,
        createdAt: Date.now(),
        order: Date.now(),
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

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
              <h2 className="modal-headline">New Task</h2>
              <div className="modal-ai-indicator">
                <Sparkles size={13} color="#a599ff" />
                <span>Natural Language Parsing Active</span>
              </div>
            </div>
            <button type="button" className="modal-close-icon-btn" onClick={onClose}>
              <X size={18} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="task-modal-studio-form">
            {/* ── PRIMARY SMART INPUT BOX ── */}
            <div className="task-smart-input-wrapper">
              <input
                ref={inputRef}
                type="text"
                value={rawInput}
                onChange={e => handleInputChange(e.target.value)}
                placeholder="e.g. Study OS #exam at 4pm tomorrow !high for 45m"
                className="task-smart-input"
                autoComplete="off"
              />

              {/* ── LIVE NLP TOKENS HIGHLIGHT BAR ── */}
              {nlpTokens.length > 0 && (
                <div className="nlp-tokens-preview-bar">
                  <span className="nlp-tokens-label">Detected:</span>
                  {nlpTokens.map((t, idx) => {
                    let color = '#a599ff';
                    let bg = 'rgba(165, 153, 255, 0.12)';
                    let border = 'rgba(165, 153, 255, 0.28)';

                    if (t.type === 'date') {
                      color = '#38bdf8';
                      bg = 'rgba(56, 189, 248, 0.12)';
                      border = 'rgba(56, 189, 248, 0.28)';
                    } else if (t.type === 'priority') {
                      color = t.display === 'High' ? '#ff6961' : t.display === 'Medium' ? '#f59e0b' : '#5eda9e';
                      bg = `${color}18`;
                      border = `${color}35`;
                    } else if (t.type === 'duration') {
                      color = '#f59e0b';
                      bg = 'rgba(245, 158, 11, 0.12)';
                      border = 'rgba(245, 158, 11, 0.28)';
                    } else if (t.type === 'tag') {
                      color = tagColorFor(t.display);
                      bg = `${color}18`;
                      border = `${color}35`;
                    } else if (t.type === 'recurrence') {
                      color = '#818cf8';
                      bg = 'rgba(129, 140, 248, 0.12)';
                      border = 'rgba(129, 140, 248, 0.28)';
                    }

                    return (
                      <span
                        key={idx}
                        className="nlp-token-chip"
                        style={{ color, backgroundColor: bg, borderColor: border }}
                      >
                        {t.display}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── PRIORITY SELECTOR PILLS ── */}
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

            {/* ── SECTION TABS (Schedule, Subtasks, Tags) ── */}
            <div className="modal-section-tabs-bar">
              <button
                type="button"
                className={`section-tab-btn ${activeTab === 'schedule' ? 'active' : ''}`}
                onClick={() => setActiveTab('schedule')}
              >
                <CalendarIcon size={14} />
                <span>Schedule & Time</span>
              </button>
              <button
                type="button"
                className={`section-tab-btn ${activeTab === 'subtasks' ? 'active' : ''}`}
                onClick={() => setActiveTab('subtasks')}
              >
                <ListChecks size={14} />
                <span>Subtasks {subtasks.length > 0 && `(${subtasks.length})`}</span>
              </button>
              <button
                type="button"
                className={`section-tab-btn ${activeTab === 'tags' ? 'active' : ''}`}
                onClick={() => setActiveTab('tags')}
              >
                <Tag size={14} />
                <span>Tags {selectedTags.length > 0 && `(${selectedTags.length})`}</span>
              </button>
            </div>

            {/* ── TAB CONTENT 1: SCHEDULE & TIME ── */}
            {activeTab === 'schedule' && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="modal-tab-content-panel"
              >
                {/* Date Presets */}
                <div className="schedule-presets-strip">
                  <button
                    type="button"
                    className={`preset-chip ${date === getLocalDateString(new Date()) ? 'selected' : ''}`}
                    onClick={() => setDatePreset('today')}
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    className="preset-chip"
                    onClick={() => setDatePreset('tomorrow')}
                  >
                    Tomorrow
                  </button>
                  <button
                    type="button"
                    className="preset-chip"
                    onClick={() => setDatePreset('nextWeek')}
                  >
                    Next Week
                  </button>
                </div>

                {/* Date & Time Input Grid */}
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

                {/* Recurrence Selector */}
                <div className="recurrence-inline-group">
                  <label className="input-sublabel">Repeat</label>
                  <div className="recurrence-pills-row">
                    {(['once', 'daily', 'weekly', 'monthly'] as const).map(rec => (
                      <button
                        key={rec}
                        type="button"
                        className={`rec-pill ${recurrenceRule?.type === rec ? 'active' : ''}`}
                        onClick={() => setRecurrenceRule({ type: rec as any })}
                      >
                        {rec === 'once' ? 'Does not repeat' : rec.charAt(0).toUpperCase() + rec.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {/* ── TAB CONTENT 2: SUBTASKS ── */}
            {activeTab === 'subtasks' && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="modal-tab-content-panel"
              >
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
                    placeholder="Add step / checklist item (press Enter)..."
                    className="subtask-inline-input"
                  />
                  <button type="button" className="subtask-add-btn" onClick={addSubtask}>
                    <Plus size={15} />
                    <span>Add</span>
                  </button>
                </div>

                <div className="subtasks-list-stack">
                  {subtasks.length === 0 ? (
                    <div className="subtasks-empty-hint">
                      <span>No subtasks added yet. Break down complex tasks into bite-sized steps.</span>
                    </div>
                  ) : (
                    subtasks.map((st, idx) => (
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
                    ))
                  )}
                </div>
              </motion.div>
            )}

            {/* ── TAB CONTENT 3: TAGS ── */}
            {activeTab === 'tags' && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="modal-tab-content-panel"
              >
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

                {/* Add Custom Tag */}
                <div className="custom-tag-adder-row">
                  {showNewTagInput ? (
                    <div className="new-tag-input-wrap">
                      <input
                        type="text"
                        value={newTagInput}
                        onChange={e => setNewTagInput(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            createCustomTag();
                          }
                        }}
                        placeholder="Tag name..."
                        className="custom-tag-input"
                        autoFocus
                      />
                      <button type="button" onClick={createCustomTag} className="custom-tag-submit-btn">
                        Add
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowNewTagInput(false)}
                        className="custom-tag-cancel-btn"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="add-custom-tag-trigger-btn"
                      onClick={() => setShowNewTagInput(true)}
                    >
                      <Plus size={13} />
                      <span>Create custom tag</span>
                    </button>
                  )}
                </div>
              </motion.div>
            )}

            {/* ── FOOTER ACTIONS ── */}
            <div className="task-modal-studio-footer">
              <button type="button" className="studio-btn-cancel" onClick={onClose}>
                Cancel
              </button>
              <button
                type="submit"
                disabled={!title.trim() && !rawInput.trim()}
                className="studio-btn-primary"
              >
                {saving ? 'Creating...' : 'Create Task'}
              </button>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
