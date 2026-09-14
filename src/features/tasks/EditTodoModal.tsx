import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Calendar as CalendarIcon,
  Clock,
  Repeat,
  Tag,
  Plus,
  Trash2,
  Check,
  ChevronLeft,
  ChevronRight,
  ArrowUp,
  Flag,
  Sun,
  CalendarDays,
  CheckSquare,
  Mic,
} from 'lucide-react';
import {
  parseNLTask,
  cleanTaskTitle,
  getLocalDateString,
  formatDisplayDate,
  formatRecurrenceLabel,
  toYMD,
  nextWeekday,
  formatTimeRangeDisplay,
  extractTaskDurationMinutes,
  formatHoursDisplay,
} from '../../utils/dateUtils';
import type { NLPToken } from '../../utils/dateUtils';
import type { TodoItem, TodoSubtask, RecurrenceRule } from '../../types';

interface EditTodoModalProps {
  isOpen: boolean;
  onClose: () => void;
  todo: TodoItem | null;
  onSave: (updated: TodoItem) => Promise<void>;
  onDelete?: (id: string) => void;
}

const DEFAULT_TAG_LIBRARY = ['study', 'work', 'gym', 'exam', 'project', 'health', 'reading', 'errand'];

export const EditTodoModal: React.FC<EditTodoModalProps> = ({
  isOpen,
  onClose,
  todo,
  onSave,
  onDelete,
}) => {
  const [rawInput, setRawInput] = useState('');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState<string | null>(null);
  const [priority, setPriority] = useState<TodoItem['priority']>('medium');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [subtasks, setSubtasks] = useState<TodoSubtask[]>([]);
  const [isSubtasksOpen, setIsSubtasksOpen] = useState(false);
  const [newSubtaskInput, setNewSubtaskInput] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState('');
  const [recurrenceRule, setRecurrenceRule] = useState<RecurrenceRule>({ type: 'once' });
  const [durationMinutes, setDurationMinutes] = useState<number | null>(null);
  const [nlpTokens, setNlpTokens] = useState<NLPToken[]>([]);
  const [saving, setSaving] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  // Popover state
  const [activePopover, setActivePopover] = useState<'date' | 'time' | 'priority' | 'repeat' | 'tags' | null>(null);
  const [popoverAnchorLeft, setPopoverAnchorLeft] = useState<number>(16);
  const [dateSearchQuery, setDateSearchQuery] = useState('');
  const [currentCalMonth, setCurrentCalMonth] = useState<Date>(new Date());

  const cardRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dateBtnRef = useRef<HTMLButtonElement>(null);
  const timeBtnRef = useRef<HTMLButtonElement>(null);
  const priorityBtnRef = useRef<HTMLButtonElement>(null);
  const repeatBtnRef = useRef<HTMLButtonElement>(null);
  const tagsBtnRef = useRef<HTMLButtonElement>(null);

  // Initialize from existing todo
  useEffect(() => {
    if (todo && isOpen) {
      const initialText = todo.title || todo.text || '';
      setRawInput(initialText);
      setTitle(initialText);
      setDate(todo.date || null);
      setPriority(todo.priority || 'medium');
      setSubtasks(todo.subtasks ? JSON.parse(JSON.stringify(todo.subtasks)) : []);
      setIsSubtasksOpen(!!(todo.subtasks && todo.subtasks.length > 0));
      setSelectedTags(todo.tags || []);
      setRecurrenceRule(todo.recurrenceRule || (todo.isRecurring ? { type: 'daily' } : { type: 'once' }));
      setDurationMinutes(todo.estimatedMinutes || null);
      setNlpTokens([]);
      setActivePopover(null);
      setDateSearchQuery('');
      setCurrentCalMonth(todo.date ? new Date(todo.date) : new Date());

      if (todo.timeSlot) {
        const parts = todo.timeSlot.split('-');
        setStartTime(parts[0]?.trim() || '');
        setEndTime(parts[1]?.trim() || '');
      } else {
        setStartTime('');
        setEndTime('');
      }

      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [todo, isOpen]);

  // Real-time NLP parsing when user edits input
  const handleInputChange = useCallback((text: string) => {
    setRawInput(text);

    if (!text.trim()) {
      setTitle('');
      setNlpTokens([]);
      return;
    }

    const parsed = parseNLTask(text);
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

  // Voice dictation setup
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => setIsListening(false);
      recognition.onerror = () => setIsListening(false);

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          handleInputChange(rawInput ? `${rawInput} ${transcript}` : transcript);
        }
      };

      recognitionRef.current = recognition;
    }
  }, [rawInput, handleInputChange]);

  const toggleVoiceListening = () => {
    if (!recognitionRef.current) return;
    if (isListening) {
      recognitionRef.current.stop();
    } else {
      try {
        recognitionRef.current.start();
      } catch (e) {
        console.error('Speech recognition error:', e);
      }
    }
  };

  // Dynamic popover positioning
  const updatePopoverPosition = useCallback((type: 'date' | 'priority' | 'time' | 'tags' | 'repeat') => {
    const refMap: Record<string, React.RefObject<HTMLButtonElement | null>> = {
      date: dateBtnRef,
      time: timeBtnRef,
      priority: priorityBtnRef,
      repeat: repeatBtnRef,
      tags: tagsBtnRef,
    };

    const btn = refMap[type]?.current;
    if (!btn || !cardRef.current) return;

    const cardRect = cardRef.current.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();

    const popoverWidths: Record<string, number> = {
      date: 290,
      priority: 180,
      time: 250,
      tags: 240,
      repeat: 220,
    };

    const popWidth = popoverWidths[type] || 220;
    const padding = 12;

    const relativeLeft = btnRect.left - cardRect.left;
    const maxLeft = Math.max(padding, cardRect.width - popWidth - padding);
    const clampedLeft = Math.max(padding, Math.min(relativeLeft, maxLeft));

    setPopoverAnchorLeft(Math.round(clampedLeft));
  }, []);

  useEffect(() => {
    if (activePopover) {
      updatePopoverPosition(activePopover);
      const onResize = () => updatePopoverPosition(activePopover);
      window.addEventListener('resize', onResize);
      return () => window.removeEventListener('resize', onResize);
    }
  }, [activePopover, updatePopoverPosition]);

  const togglePopover = useCallback((type: 'date' | 'priority' | 'time' | 'tags' | 'repeat') => {
    if (activePopover === type) {
      setActivePopover(null);
    } else {
      updatePopoverPosition(type);
      setActivePopover(type);
    }
  }, [activePopover, updatePopoverPosition]);

  // Outside click to dismiss popovers
  useEffect(() => {
    if (!activePopover) return;
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.todoist-popover') && !target.closest('.todoist-pill-btn')) {
        setActivePopover(null);
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [activePopover]);

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (activePopover) {
          setActivePopover(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, activePopover, onClose]);

  // Calendar helpers
  const todayStr = useMemo(() => getLocalDateString(new Date()), []);
  const tomorrowStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return getLocalDateString(d);
  }, []);
  const nextMondayDate = useMemo(() => nextWeekday(1, true), []);
  const nextMondayStr = useMemo(() => getLocalDateString(nextMondayDate), [nextMondayDate]);

  const calendarDays = useMemo(() => {
    const year = currentCalMonth.getFullYear();
    const month = currentCalMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const startingDay = (firstDay.getDay() + 6) % 7; // Monday = 0
    const totalDays = new Date(year, month + 1, 0).getDate();

    const days: Array<{ day: number; dateStr: string; isCurrentMonth: boolean }> = [];
    const prevMonthTotalDays = new Date(year, month, 0).getDate();
    for (let i = startingDay - 1; i >= 0; i--) {
      const d = prevMonthTotalDays - i;
      const prevDate = new Date(year, month - 1, d);
      days.push({ day: d, dateStr: toYMD(prevDate), isCurrentMonth: false });
    }
    for (let i = 1; i <= totalDays; i++) {
      const currDate = new Date(year, month, i);
      days.push({ day: i, dateStr: toYMD(currDate), isCurrentMonth: true });
    }
    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      const nextDate = new Date(year, month + 1, i);
      days.push({ day: i, dateStr: toYMD(nextDate), isCurrentMonth: false });
    }
    return days;
  }, [currentCalMonth]);

  // Dismiss token helper
  const handleDismissToken = (tok: NLPToken) => {
    const cleaned = (rawInput.slice(0, tok.start) + rawInput.slice(tok.end)).replace(/\s{2,}/g, ' ').trim();
    if (tok.type === 'date') setDate(null);
    if (tok.type === 'time') {
      setStartTime('');
      setEndTime('');
    }
    if (tok.type === 'priority') setPriority('medium');
    if (tok.type === 'recurrence') setRecurrenceRule({ type: 'once' });
    if (tok.type === 'tag') {
      const tagClean = tok.value.replace(/^#/, '').toLowerCase();
      setSelectedTags(prev => prev.filter(t => t.toLowerCase() !== tagClean));
    }
    handleInputChange(cleaned);
  };

  // Subtasks helpers
  const handleAddSubtask = () => {
    if (!newSubtaskInput.trim()) return;
    setSubtasks(prev => [
      ...prev,
      {
        id: `st-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title: newSubtaskInput.trim(),
        completed: false,
        status: 'pending',
      },
    ]);
    setNewSubtaskInput('');
  };

  const handleRemoveSubtask = (id: string) => {
    setSubtasks(prev => prev.filter(s => s.id !== id));
  };

  const handleToggleSubtask = (id: string) => {
    setSubtasks(prev =>
      prev.map(st =>
        st.id === id ? { ...st, completed: !st.completed, status: !st.completed ? 'completed' : 'pending' } : st
      )
    );
  };

  const handleUpdateSubtaskText = (id: string, text: string) => {
    setSubtasks(prev =>
      prev.map(st =>
        st.id === id ? { ...st, title: text } : st
      )
    );
  };

  // Pill visual labels
  const datePillLabel = useMemo(() => {
    if (!date) return 'Date';
    if (date === todayStr) return 'Today';
    if (date === tomorrowStr) return 'Tomorrow';
    if (date === nextMondayStr) return 'Next Mon';
    return formatDisplayDate(date);
  }, [date, todayStr, tomorrowStr, nextMondayStr]);

  const datePillColor = useMemo(() => {
    if (!date) return undefined;
    if (date === todayStr) return '#10b981';
    if (date === tomorrowStr) return '#f59e0b';
    if (date === nextMondayStr) return '#a855f7';
    return '#3b82f6';
  }, [date, todayStr, tomorrowStr, nextMondayStr]);

  const priorityInfo = useMemo(() => {
    const pr = (priority || '').toLowerCase();
    if (pr === 'high' || pr === 'p1') {
      return { label: 'Priority 1', flagClass: 'flag-red' };
    }
    if (pr === 'medium' || pr === 'p2') {
      return { label: 'Priority 2', flagClass: 'flag-orange' };
    }
    if (pr === 'low' || pr === 'p3') {
      return { label: 'Priority 3', flagClass: 'flag-blue' };
    }
    return { label: 'Priority', flagClass: 'flag-grey' };
  }, [priority]);

  // Submit / Save
  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!rawInput.trim() || saving || !todo) return;

    setSaving(true);
    try {
      const parsed = parseNLTask(rawInput);
      const cleanTitle = (cleanTaskTitle(parsed.title || title || rawInput) || rawInput).trim();

      let fullTimeSlot: string | null = null;
      if (startTime) {
        fullTimeSlot = endTime ? `${startTime} - ${endTime}` : startTime;
      }

      const resolvedDuration = durationMinutes
        || (fullTimeSlot ? extractTaskDurationMinutes(null, fullTimeSlot, cleanTitle) : undefined);

      const isRec = recurrenceRule && recurrenceRule.type !== 'once';

      await onSave({
        ...todo,
        title: cleanTitle,
        text: cleanTitle,
        date: date || null,
        priority: priority || 'medium',
        timeSlot: fullTimeSlot,
        estimatedMinutes: resolvedDuration ? Number(resolvedDuration) : undefined,
        subtasks,
        tags: selectedTags,
        isRecurring: isRec,
        recurrenceRule: isRec ? recurrenceRule : null,
      });
    } finally {
      setSaving(false);
    }
  };

  if (!todo) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="edit-todoist-overlay"
          className="todoist-quick-add-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          onClick={onClose}
        >
          <motion.div
            ref={cardRef}
            key="edit-todoist-card"
            className="todoist-quick-add-card"
            initial={{ opacity: 0, scale: 0.96, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{
              opacity: 0,
              scale: 0.96,
              y: -8,
              transition: { duration: 0.12, ease: [0.4, 0, 0.2, 1] },
            }}
            transition={{
              type: 'spring',
              damping: 28,
              stiffness: 350,
              mass: 0.8,
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Main Title Input Area with Mic Button on the Far Right */}
            <form onSubmit={handleSubmit} className="todoist-quick-add-input-wrapper">
              <input
                ref={inputRef}
                type="text"
                value={rawInput}
                onChange={e => handleInputChange(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                placeholder="e.g. Read chapter 3 tomorrow at 5pm !p1 #study"
                className="todoist-quick-add-input"
                autoFocus
              />
              <button
                type="button"
                className={`todoist-mic-btn ${isListening ? 'listening' : ''}`}
                onClick={toggleVoiceListening}
                title={isListening ? 'Listening... click to stop' : 'Voice dictation'}
              >
                <Mic size={15} />
              </button>
            </form>

            {/* Inline Subtasks Expansion */}
            {isSubtasksOpen && (
              <div className="todoist-subtasks-section">
                {subtasks.map(st => (
                  <div key={st.id} className="todoist-subtask-row">
                    <button
                      type="button"
                      onClick={() => handleToggleSubtask(st.id)}
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}
                      title={st.completed ? 'Mark pending' : 'Mark completed'}
                    >
                      {st.completed ? (
                        <CheckSquare size={13} style={{ color: '#10b981' }} />
                      ) : (
                        <CheckSquare size={13} style={{ color: '#a1a1aa' }} />
                      )}
                    </button>
                    <input
                      type="text"
                      value={st.title}
                      onChange={e => handleUpdateSubtaskText(st.id, e.target.value)}
                      className="todoist-subtask-text"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        outline: 'none',
                        color: 'inherit',
                        fontSize: 13,
                        flex: 1,
                        textDecoration: st.completed ? 'line-through' : 'none',
                        opacity: st.completed ? 0.6 : 1,
                      }}
                    />
                    <button
                      type="button"
                      className="todoist-subtask-del-btn"
                      onClick={() => handleRemoveSubtask(st.id)}
                      title="Delete subtask"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
                <div className="todoist-subtask-add-row">
                  <Plus size={13} style={{ color: '#71717a' }} />
                  <input
                    type="text"
                    placeholder="Add a subtask..."
                    value={newSubtaskInput}
                    onChange={e => setNewSubtaskInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddSubtask();
                      }
                    }}
                    className="todoist-subtask-quick-input"
                  />
                </div>
              </div>
            )}

            {/* Bottom Action Bar — Single Line Layout (Screenshot 2 Match) */}
            <div className="todoist-quick-add-bottom-row">
              {/* Left Action Pills */}
              <div className="todoist-pills-group">
                {/* + Subtask Toggle Button */}
                <button
                  type="button"
                  className={`todoist-pill-btn todoist-pill-icon-only ${isSubtasksOpen ? 'active' : ''}`}
                  onClick={() => setIsSubtasksOpen(v => !v)}
                  title="Add subtasks"
                >
                  <Plus size={14} strokeWidth={2.2} />
                </button>

                {/* Date Pill */}
                <button
                  ref={dateBtnRef}
                  type="button"
                  className={`todoist-pill-btn ${date ? 'active' : ''}`}
                  onClick={() => togglePopover('date')}
                  title="Set date"
                  style={datePillColor ? { color: datePillColor } : {}}
                >
                  <CalendarIcon size={13} style={datePillColor ? { color: datePillColor } : {}} />
                  <span>{datePillLabel}</span>
                  {date && (
                    <span
                      className="todoist-pill-clear"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDate(null);
                        const tok = nlpTokens.find(t => t.type === 'date');
                        if (tok) handleDismissToken(tok);
                      }}
                      title="Clear date"
                    >
                      <X size={11} />
                    </span>
                  )}
                </button>

                {/* Time Pill */}
                <button
                  ref={timeBtnRef}
                  type="button"
                  className={`todoist-pill-btn ${startTime ? 'active' : ''}`}
                  onClick={() => togglePopover('time')}
                  title="Set time"
                >
                  <Clock size={13} />
                  <span>
                    {startTime ? formatTimeRangeDisplay(endTime ? `${startTime} - ${endTime}` : startTime) : 'Time'}
                    {durationMinutes ? ` (${formatHoursDisplay(durationMinutes / 60)})` : ''}
                  </span>
                  {startTime && (
                    <span
                      className="todoist-pill-clear"
                      onClick={(e) => {
                        e.stopPropagation();
                        setStartTime('');
                        setEndTime('');
                        setDurationMinutes(null);
                        const tok = nlpTokens.find(t => t.type === 'time');
                        if (tok) handleDismissToken(tok);
                      }}
                      title="Clear time"
                    >
                      <X size={11} />
                    </span>
                  )}
                </button>

                {/* Priority Pill */}
                <button
                  ref={priorityBtnRef}
                  type="button"
                  className={`todoist-pill-btn ${priority !== 'medium' ? 'active' : ''}`}
                  onClick={() => togglePopover('priority')}
                  title="Set priority"
                >
                  <Flag size={13} className={priorityInfo.flagClass} />
                  <span>{priorityInfo.label}</span>
                  {priority !== 'medium' && (
                    <span
                      className="todoist-pill-clear"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPriority('medium');
                        const tok = nlpTokens.find(t => t.type === 'priority');
                        if (tok) handleDismissToken(tok);
                      }}
                      title="Clear priority"
                    >
                      <X size={11} />
                    </span>
                  )}
                </button>

                {/* Repeat Pill */}
                <button
                  ref={repeatBtnRef}
                  type="button"
                  className={`todoist-pill-btn ${recurrenceRule?.type !== 'once' ? 'active' : ''}`}
                  onClick={() => togglePopover('repeat')}
                  title="Repeat schedule"
                >
                  <Repeat size={13} />
                  <span>
                    {recurrenceRule?.type !== 'once'
                      ? formatRecurrenceLabel(recurrenceRule)
                      : 'Repeat'}
                  </span>
                  {recurrenceRule?.type !== 'once' && (
                    <span
                      className="todoist-pill-clear"
                      onClick={(e) => {
                        e.stopPropagation();
                        setRecurrenceRule({ type: 'once' });
                        const tok = nlpTokens.find(t => t.type === 'recurrence');
                        if (tok) handleDismissToken(tok);
                      }}
                      title="Clear repeat"
                    >
                      <X size={11} />
                    </span>
                  )}
                </button>

                {/* Tags Pill */}
                <button
                  ref={tagsBtnRef}
                  type="button"
                  className={`todoist-pill-btn ${selectedTags.length > 0 ? 'active' : ''}`}
                  onClick={() => togglePopover('tags')}
                  title="Tags"
                >
                  <Tag size={13} />
                  <span>
                    {selectedTags.length > 0
                      ? `#${selectedTags[0]}${selectedTags.length > 1 ? ` +${selectedTags.length - 1}` : ''}`
                      : 'Tags'}
                  </span>
                  {selectedTags.length > 0 && (
                    <span
                      className="todoist-pill-clear"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedTags([]);
                      }}
                      title="Clear tags"
                    >
                      <X size={11} />
                    </span>
                  )}
                </button>
              </div>

              {/* Right Action Controls */}
              <div className="todoist-actions-right">
                {/* Delete Task Button */}
                {onDelete && todo.id && (
                  <button
                    type="button"
                    className="todoist-btn-delete"
                    onClick={() => {
                      onDelete(todo.id!);
                      onClose();
                    }}
                    title="Delete task"
                  >
                    <Trash2 size={16} />
                  </button>
                )}

                {/* Close / Cancel Button */}
                <button
                  type="button"
                  className="todoist-btn-cancel"
                  onClick={onClose}
                  title="Cancel"
                >
                  <X size={16} />
                </button>

                {/* Submit / Save Button */}
                <button
                  type="button"
                  className="todoist-submit-btn"
                  onClick={() => handleSubmit()}
                  disabled={!rawInput.trim() || saving}
                  title="Save changes"
                >
                  <ArrowUp size={17} strokeWidth={2.6} />
                </button>
              </div>
            </div>

            {/* ── POPOVER 1: DATE PICKER ── */}
            {activePopover === 'date' && (
              <div className="todoist-popover todoist-date-popover" style={{ left: `${popoverAnchorLeft}px` }}>
                <div className="todoist-date-search-wrap">
                  <input
                    type="text"
                    placeholder="Type a date"
                    value={dateSearchQuery}
                    onChange={e => {
                      const val = e.target.value;
                      setDateSearchQuery(val);
                      if (val.trim()) {
                        const p = parseNLTask(val);
                        if (p.date) {
                          setDate(p.date);
                        }
                      }
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && date) {
                        e.preventDefault();
                        setActivePopover(null);
                      }
                    }}
                    className="todoist-date-search-input"
                    autoFocus
                  />
                </div>

                <div className="todoist-presets-list">
                  <button
                    type="button"
                    className="todoist-preset-item"
                    onClick={() => {
                      setDate(todayStr);
                      setActivePopover(null);
                    }}
                  >
                    <div className="todoist-preset-left">
                      <CalendarIcon size={14} style={{ color: '#10b981' }} />
                      <span>Today</span>
                    </div>
                    <span className="todoist-preset-right">
                      {new Date().toLocaleDateString('en-US', { weekday: 'short' })}
                    </span>
                  </button>

                  <button
                    type="button"
                    className="todoist-preset-item"
                    onClick={() => {
                      setDate(tomorrowStr);
                      setActivePopover(null);
                    }}
                  >
                    <div className="todoist-preset-left">
                      <Sun size={14} style={{ color: '#f59e0b' }} />
                      <span>Tomorrow</span>
                    </div>
                    <span className="todoist-preset-right">
                      {new Date(Date.now() + 86400000).toLocaleDateString('en-US', { weekday: 'short' })}
                    </span>
                  </button>

                  <button
                    type="button"
                    className="todoist-preset-item"
                    onClick={() => {
                      setDate(nextMondayStr);
                      setActivePopover(null);
                    }}
                  >
                    <div className="todoist-preset-left">
                      <CalendarDays size={14} style={{ color: '#a855f7' }} />
                      <span>Next week</span>
                    </div>
                    <span className="todoist-preset-right">Mon</span>
                  </button>

                  <button
                    type="button"
                    className="todoist-preset-item"
                    onClick={() => {
                      setDate(null);
                      setActivePopover(null);
                    }}
                  >
                    <div className="todoist-preset-left">
                      <X size={14} style={{ color: '#71717a' }} />
                      <span>No Date</span>
                    </div>
                  </button>
                </div>

                {/* Mini Calendar Month */}
                <div className="todoist-mini-cal">
                  <div className="todoist-cal-header">
                    <span className="todoist-cal-month-title">
                      {currentCalMonth.toLocaleString('en-US', { month: 'short', year: 'numeric' })}
                    </span>
                    <div className="todoist-cal-nav-group">
                      <button
                        type="button"
                        className="todoist-cal-nav-btn"
                        onClick={() => setCurrentCalMonth(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
                      >
                        <ChevronLeft size={14} />
                      </button>
                      <button
                        type="button"
                        className="todoist-cal-nav-btn"
                        onClick={() => setCurrentCalMonth(new Date())}
                        title="Current month"
                      >
                        <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
                      </button>
                      <button
                        type="button"
                        className="todoist-cal-nav-btn"
                        onClick={() => setCurrentCalMonth(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
                      >
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>

                  <div className="todoist-cal-weekdays">
                    <span>M</span>
                    <span>T</span>
                    <span>W</span>
                    <span>T</span>
                    <span>F</span>
                    <span>S</span>
                    <span>S</span>
                  </div>

                  <div className="todoist-cal-grid">
                    {calendarDays.map((cell, idx) => {
                      const isSelected = date === cell.dateStr;
                      const isToday = cell.dateStr === todayStr;
                      return (
                        <button
                          key={`${cell.dateStr}-${idx}`}
                          type="button"
                          className={`todoist-cal-day ${!cell.isCurrentMonth ? 'disabled' : ''} ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}`}
                          onClick={() => {
                            setDate(cell.dateStr);
                            setActivePopover(null);
                          }}
                        >
                          {cell.day}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="todoist-date-popover-bottom">
                  <button
                    type="button"
                    className="todoist-popover-sub-btn"
                    onClick={() => togglePopover('time')}
                  >
                    <Clock size={13} />
                    <span>{startTime ? `Time: ${formatTimeRangeDisplay(startTime)}` : 'Time'}</span>
                  </button>
                  <button
                    type="button"
                    className="todoist-popover-sub-btn"
                    onClick={() => togglePopover('repeat')}
                  >
                    <Repeat size={13} />
                    <span>{recurrenceRule?.type !== 'once' ? formatRecurrenceLabel(recurrenceRule) : 'Repeat'}</span>
                  </button>
                </div>
              </div>
            )}

            {/* ── POPOVER 2: PRIORITY ── */}
            {activePopover === 'priority' && (
              <div className="todoist-popover todoist-priority-popover" style={{ left: `${popoverAnchorLeft}px` }}>
                <button
                  type="button"
                  className="todoist-priority-item"
                  onClick={() => {
                    setPriority('high');
                    setActivePopover(null);
                  }}
                >
                  <div className="todoist-priority-item-left">
                    <Flag size={14} className="flag-red" />
                    <span>Priority 1</span>
                  </div>
                  {(priority === 'high' || priority === 'P1') && <Check size={14} className="flag-red" />}
                </button>

                <button
                  type="button"
                  className="todoist-priority-item"
                  onClick={() => {
                    setPriority('medium');
                    setActivePopover(null);
                  }}
                >
                  <div className="todoist-priority-item-left">
                    <Flag size={14} className="flag-orange" />
                    <span>Priority 2</span>
                  </div>
                  {(priority === 'medium' || priority === 'P2') && <Check size={14} className="flag-orange" />}
                </button>

                <button
                  type="button"
                  className="todoist-priority-item"
                  onClick={() => {
                    setPriority('low');
                    setActivePopover(null);
                  }}
                >
                  <div className="todoist-priority-item-left">
                    <Flag size={14} className="flag-blue" />
                    <span>Priority 3</span>
                  </div>
                  {(priority === 'low' || priority === 'P3') && <Check size={14} className="flag-blue" />}
                </button>
              </div>
            )}

            {/* ── POPOVER 3: TIME PICKER ── */}
            {activePopover === 'time' && (
              <div className="todoist-popover todoist-time-popover" style={{ width: 250, padding: 10, left: `${popoverAnchorLeft}px` }}>
                <div className="todoist-presets-list">
                  <button
                    type="button"
                    className="todoist-preset-item"
                    onClick={() => {
                      setStartTime('09:00');
                      setEndTime('10:00');
                      setDurationMinutes(60);
                      setActivePopover(null);
                    }}
                  >
                    <span>🌅 Morning</span>
                    <span className="todoist-preset-right">9:00 AM</span>
                  </button>
                  <button
                    type="button"
                    className="todoist-preset-item"
                    onClick={() => {
                      setStartTime('14:00');
                      setEndTime('15:00');
                      setDurationMinutes(60);
                      setActivePopover(null);
                    }}
                  >
                    <span>☀️ Afternoon</span>
                    <span className="todoist-preset-right">2:00 PM</span>
                  </button>
                  <button
                    type="button"
                    className="todoist-preset-item"
                    onClick={() => {
                      setStartTime('18:00');
                      setEndTime('19:00');
                      setDurationMinutes(60);
                      setActivePopover(null);
                    }}
                  >
                    <span>🌆 Evening</span>
                    <span className="todoist-preset-right">6:00 PM</span>
                  </button>
                  <button
                    type="button"
                    className="todoist-preset-item"
                    onClick={() => {
                      setStartTime('21:00');
                      setEndTime('22:00');
                      setDurationMinutes(60);
                      setActivePopover(null);
                    }}
                  >
                    <span>🌙 Night</span>
                    <span className="todoist-preset-right">9:00 PM</span>
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8, padding: '6px 0', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, color: 'var(--color-text-3)', width: 32 }}>Start:</span>
                    <input
                      type="time"
                      value={startTime}
                      onChange={e => {
                        const newStart = e.target.value;
                        setStartTime(newStart);
                        if (newStart && endTime) {
                          const dur = extractTaskDurationMinutes(null, `${newStart} - ${endTime}`);
                          if (dur > 0) setDurationMinutes(dur);
                        }
                      }}
                      style={{
                        flex: 1,
                        padding: '4px 6px',
                        borderRadius: 4,
                        border: '1px solid rgba(255,255,255,0.15)',
                        background: 'transparent',
                        color: 'inherit',
                        fontSize: 12
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, color: 'var(--color-text-3)', width: 32 }}>End:</span>
                    <input
                      type="time"
                      value={endTime}
                      onChange={e => {
                        const newEnd = e.target.value;
                        setEndTime(newEnd);
                        if (startTime && newEnd) {
                          const dur = extractTaskDurationMinutes(null, `${startTime} - ${newEnd}`);
                          if (dur > 0) setDurationMinutes(dur);
                        }
                      }}
                      style={{
                        flex: 1,
                        padding: '4px 6px',
                        borderRadius: 4,
                        border: '1px solid rgba(255,255,255,0.15)',
                        background: 'transparent',
                        color: 'inherit',
                        fontSize: 12
                      }}
                    />
                  </div>
                </div>

                {/* Duration Block Presets */}
                <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ fontSize: 11, color: 'var(--color-text-3)', marginBottom: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Block Time:</span>
                    {durationMinutes ? (
                      <span style={{ color: '#818cf8', fontWeight: 600 }}>{durationMinutes}m ({formatHoursDisplay(durationMinutes / 60)})</span>
                    ) : null}
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {[25, 45, 60, 90, 120].map(mins => (
                      <button
                        key={mins}
                        type="button"
                        onClick={() => {
                          setDurationMinutes(mins);
                          const baseStart = startTime || '09:00';
                          if (!startTime) setStartTime(baseStart);
                          const [sh, sm] = baseStart.split(':').map(Number);
                          const totalEnd = sh * 60 + sm + mins;
                          const eh = Math.floor(totalEnd / 60) % 24;
                          const em = totalEnd % 60;
                          setEndTime(`${eh.toString().padStart(2, '0')}:${em.toString().padStart(2, '0')}`);
                        }}
                        style={{
                          flex: 1,
                          padding: '3px 4px',
                          borderRadius: 4,
                          border: durationMinutes === mins ? '1px solid #818cf8' : '1px solid rgba(255,255,255,0.1)',
                          background: durationMinutes === mins ? 'rgba(99,102,241,0.2)' : 'rgba(255,255,255,0.04)',
                          color: durationMinutes === mins ? '#818cf8' : 'inherit',
                          fontSize: 11,
                          cursor: 'pointer',
                          textAlign: 'center'
                        }}
                      >
                        {mins === 60 ? '1h' : mins === 120 ? '2h' : `${mins}m`}
                      </button>
                    ))}
                  </div>
                </div>

                {startTime && (
                  <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      onClick={() => {
                        setStartTime('');
                        setEndTime('');
                        setDurationMinutes(null);
                        setActivePopover(null);
                      }}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        color: '#ef4444',
                        fontSize: 11,
                        cursor: 'pointer',
                        padding: '2px 6px'
                      }}
                    >
                      Clear Time
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── POPOVER 4: TAGS SELECTOR ── */}
            {activePopover === 'tags' && (
              <div className="todoist-popover todoist-tags-popover" style={{ left: `${popoverAnchorLeft}px` }}>
                <div className="todoist-tags-wrap">
                  {DEFAULT_TAG_LIBRARY.map(tag => {
                    const isSelected = selectedTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        className={`todoist-tag-toggle-pill ${isSelected ? 'selected' : ''}`}
                        onClick={() => {
                          setSelectedTags(prev =>
                            isSelected ? prev.filter(t => t !== tag) : [...prev, tag]
                          );
                        }}
                      >
                        #{tag}
                      </button>
                    );
                  })}
                </div>

                <div className="todoist-tag-custom-row">
                  <input
                    type="text"
                    placeholder="Custom tag..."
                    value={newTagInput}
                    onChange={e => setNewTagInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && newTagInput.trim()) {
                        e.preventDefault();
                        const clean = newTagInput.trim().toLowerCase().replace(/^#/, '');
                        if (!selectedTags.includes(clean)) {
                          setSelectedTags(prev => [...prev, clean]);
                        }
                        setNewTagInput('');
                      }
                    }}
                    className="todoist-tag-custom-input"
                  />
                  <button
                    type="button"
                    className="todoist-tag-custom-add-btn"
                    onClick={() => {
                      if (newTagInput.trim()) {
                        const clean = newTagInput.trim().toLowerCase().replace(/^#/, '');
                        if (!selectedTags.includes(clean)) {
                          setSelectedTags(prev => [...prev, clean]);
                        }
                        setNewTagInput('');
                      }
                    }}
                  >
                    Add
                  </button>
                </div>
              </div>
            )}

            {/* ── POPOVER 5: REPEAT / RECURRENCE ── */}
            {activePopover === 'repeat' && (
              <div className="todoist-popover todoist-repeat-popover" style={{ width: 220, padding: 6, left: `${popoverAnchorLeft}px` }}>
                <div className="todoist-presets-list" style={{ borderBottom: 'none', marginBottom: 0 }}>
                  <button
                    type="button"
                    className="todoist-preset-item"
                    onClick={() => {
                      setRecurrenceRule({ type: 'once' });
                      setActivePopover(null);
                    }}
                  >
                    <span>Does not repeat</span>
                    {(!recurrenceRule || recurrenceRule.type === 'once') && <Check size={14} style={{ color: '#10b981' }} />}
                  </button>
                  <button
                    type="button"
                    className="todoist-preset-item"
                    onClick={() => {
                      setRecurrenceRule({ type: 'daily', interval: 1 });
                      setActivePopover(null);
                    }}
                  >
                    <span>Every day</span>
                    {recurrenceRule?.type === 'daily' && <Check size={14} style={{ color: '#10b981' }} />}
                  </button>
                  <button
                    type="button"
                    className="todoist-preset-item"
                    onClick={() => {
                      setRecurrenceRule({ type: 'weekly', interval: 1, daysOfWeek: [1, 2, 3, 4, 5] });
                      setActivePopover(null);
                    }}
                  >
                    <span>Every weekday (Mon - Fri)</span>
                    {recurrenceRule?.type === 'weekly' && recurrenceRule.daysOfWeek?.length === 5 && (
                      <Check size={14} style={{ color: '#10b981' }} />
                    )}
                  </button>
                  <button
                    type="button"
                    className="todoist-preset-item"
                    onClick={() => {
                      const d = date ? new Date(date).getDay() : new Date().getDay();
                      setRecurrenceRule({ type: 'weekly', interval: 1, daysOfWeek: [d] });
                      setActivePopover(null);
                    }}
                  >
                    <span>Every week</span>
                    {recurrenceRule?.type === 'weekly' && recurrenceRule.daysOfWeek?.length === 1 && (
                      <Check size={14} style={{ color: '#10b981' }} />
                    )}
                  </button>
                  <button
                    type="button"
                    className="todoist-preset-item"
                    onClick={() => {
                      setRecurrenceRule({ type: 'monthly', interval: 1 });
                      setActivePopover(null);
                    }}
                  >
                    <span>Every month</span>
                    {recurrenceRule?.type === 'monthly' && <Check size={14} style={{ color: '#10b981' }} />}
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
