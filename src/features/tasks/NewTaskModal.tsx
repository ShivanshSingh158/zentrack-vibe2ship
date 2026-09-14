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
  Timer
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
  formatHoursDisplay
} from '../../utils/dateUtils';
import type { NLPToken } from '../../utils/dateUtils';
import type { TodoItem, TodoSubtask, RecurrenceRule } from '../../types';

interface NewTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialDate: string;
  onSave: (task: any) => Promise<void>;
}

const DEFAULT_TAG_LIBRARY = ['study', 'work', 'gym', 'exam', 'project', 'health', 'reading', 'errand'];

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

export const NewTaskModal: React.FC<NewTaskModalProps> = ({
  isOpen,
  onClose,
  initialDate,
  onSave,
}) => {
  const [rawInput, setRawInput] = useState('');
  const [title, setTitle] = useState('');
  const [date, setDate] = useState<string | null>(initialDate || getLocalDateString());
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
  const [oneTimeDates, setOneTimeDates] = useState<string[] | undefined>(undefined);
  const [nlpTokens, setNlpTokens] = useState<NLPToken[]>([]);
  const [saving, setSaving] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  // Real-Time NLP Parsing Engine
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
    if (parsed.oneTimeDates && parsed.oneTimeDates.length > 1) {
      setOneTimeDates(parsed.oneTimeDates);
    } else {
      setOneTimeDates(undefined);
    }
    if (parsed.tags && parsed.tags.length > 0) {
      setSelectedTags(prev => Array.from(new Set([...prev, ...parsed.tags!])));
    }
    if (parsed.durationMinutes != null) {
      setDurationMinutes(parsed.durationMinutes);
    }
    if (parsed.subtasks && parsed.subtasks.length > 0) {
      setIsSubtasksOpen(true);
      setSubtasks(parsed.subtasks.map((st, idx) => ({
        id: `st-${Date.now()}-${idx}`,
        title: st,
        completed: false,
        status: 'pending',
      })));
    }
  }, []);

  // Voice Dictation (Web Speech API)
  const toggleVoiceListening = useCallback(() => {
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      alert('Speech recognition is not supported in this browser. Please use Chrome, Edge, or Safari.');
      return;
    }

    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRec();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        const transcript = event.results[0]?.[0]?.transcript;
        if (transcript) {
          setRawInput(prev => {
            const next = prev ? `${prev} ${transcript}` : transcript;
            handleInputChange(next);
            return next;
          });
        }
      };

      recognition.onerror = () => {
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.error('Speech recognition error:', err);
      setIsListening(false);
    }
  }, [isListening, handleInputChange]);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  // Popover state
  const [activePopover, setActivePopover] = useState<'date' | 'priority' | 'time' | 'tags' | 'repeat' | null>(null);
  const [dateSearchQuery, setDateSearchQuery] = useState('');

  // Mini calendar state
  const [currentCalMonth, setCurrentCalMonth] = useState<Date>(() => {
    return date ? new Date(date + 'T00:00:00') : new Date();
  });

  const inputRef = useRef<HTMLInputElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const dateBtnRef = useRef<HTMLButtonElement | null>(null);
  const timeBtnRef = useRef<HTMLButtonElement | null>(null);
  const priorityBtnRef = useRef<HTMLButtonElement | null>(null);
  const repeatBtnRef = useRef<HTMLButtonElement | null>(null);
  const tagsBtnRef = useRef<HTMLButtonElement | null>(null);

  const [popoverAnchorLeft, setPopoverAnchorLeft] = useState<number>(16);

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
      time: 220,
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

  // Today & presets strings
  const todayStr = useMemo(() => getLocalDateString(new Date()), []);
  const tomorrowStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return getLocalDateString(d);
  }, []);

  const nextMondayDate = useMemo(() => nextWeekday(1, true), []);
  const nextMondayStr = useMemo(() => getLocalDateString(nextMondayDate), [nextMondayDate]);

  const nextSaturdayDate = useMemo(() => nextWeekday(6, false), []);
  const nextSaturdayStr = useMemo(() => getLocalDateString(nextSaturdayDate), [nextSaturdayDate]);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setRawInput('');
      setTitle('');
      setDate(initialDate || getLocalDateString());
      setPriority('medium');
      setStartTime('');
      setEndTime('');
      setSubtasks([]);
      setIsSubtasksOpen(false);
      setNewSubtaskInput('');
      setSelectedTags([]);
      setRecurrenceRule({ type: 'once' });
      setDurationMinutes(null);
      setOneTimeDates(undefined);
      setNlpTokens([]);
      setActivePopover(null);
      setDateSearchQuery('');
      setCurrentCalMonth(new Date());
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [isOpen, initialDate]);

  // Handle outside click to close active popover
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

  // Escape to dismiss popover or modal
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


  // Dismiss a recognized token and restore corresponding state
  const handleDismissToken = (tok: NLPToken) => {
    const cleaned = (rawInput.slice(0, tok.start) + rawInput.slice(tok.end)).replace(/\s{2,}/g, ' ').trim();
    if (tok.type === 'date') setDate(initialDate || getLocalDateString());
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

  // Subtask helpers
  const handleAddSubtask = () => {
    if (!newSubtaskInput.trim()) return;
    setSubtasks(prev => [
      ...prev,
      {
        id: Date.now().toString(),
        title: newSubtaskInput.trim(),
        completed: false,
        status: 'pending',
      },
    ]);
    setNewSubtaskInput('');
  };

  const handleRemoveSubtask = (id: string) => {
    setSubtasks(prev => prev.filter(st => st.id !== id));
  };

  // Submit Handler
  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanTitle = (title || rawInput).trim();
    if (!cleanTitle || saving) return;

    // Synchronously parse to ensure latest NLP state
    const finalParsed = parseNLTask(rawInput || cleanTitle);
    const resolvedTitle = (cleanTaskTitle(finalParsed.title || cleanTitle) || cleanTitle).trim();
    const finalDate = (finalParsed.tokens.some(t => t.type === 'date') && finalParsed.date) ? finalParsed.date : (date || null);
    const finalPriority = finalParsed.tokens.some(t => t.type === 'priority') ? finalParsed.priority : (priority || 'medium');
    const finalStartTime = (finalParsed.tokens.some(t => t.type === 'time') && finalParsed.timeSlot)
      ? (finalParsed.timeSlot.includes('-') ? finalParsed.timeSlot.split(/[-–]/)[0].trim() : finalParsed.timeSlot)
      : (startTime || null);
    const finalEndTime = (finalParsed.tokens.some(t => t.type === 'time') && finalParsed.endTimeSlot)
      ? finalParsed.endTimeSlot
      : (endTime || null);
    const finalTimeSlot = finalStartTime
      ? (finalEndTime ? `${finalStartTime} - ${finalEndTime}` : finalStartTime)
      : (finalParsed.timeSlot || null);
    const finalDuration = finalParsed.durationMinutes
      || durationMinutes
      || (finalTimeSlot ? extractTaskDurationMinutes(null, finalTimeSlot, resolvedTitle) : null);
    const finalRecurrence = (finalParsed.tokens.some(t => t.type === 'recurrence') && finalParsed.recurrenceRule) ? finalParsed.recurrenceRule : recurrenceRule;
    const finalTags = Array.from(new Set([...selectedTags, ...(finalParsed.tags || [])]));

    setSaving(true);
    try {
      await onSave({
        title: resolvedTitle,
        text: resolvedTitle,
        date: finalDate,
        priority: finalPriority,
        timeSlot: finalTimeSlot,
        subtasks: subtasks.length > 0 ? subtasks : [],
        tags: finalTags,
        isRecurring: finalRecurrence && finalRecurrence.type !== 'once',
        recurrenceRule: finalRecurrence && finalRecurrence.type !== 'once' ? finalRecurrence : null,
        oneTimeDates: finalParsed.oneTimeDates && finalParsed.oneTimeDates.length > 1 ? finalParsed.oneTimeDates : oneTimeDates,
        durationMinutes: finalDuration || null,
      });
      onClose();
    } catch (err) {
      console.error('Failed to create task:', err);
    } finally {
      setSaving(false);
    }
  };

  // Mini Calendar Generation
  const calendarDays = useMemo(() => {
    const year = currentCalMonth.getFullYear();
    const month = currentCalMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    // Monday as 0 ... Sunday as 6
    const startDayOfWeek = (firstDay.getDay() + 6) % 7;
    const totalDays = lastDay.getDate();

    const days: Array<{ day: number; dateStr: string; isCurrentMonth: boolean }> = [];

    // Prev month padding
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const d = prevMonthLastDay - i;
      const prevDate = new Date(year, month - 1, d);
      days.push({ day: d, dateStr: toYMD(prevDate), isCurrentMonth: false });
    }

    // Current month days
    for (let d = 1; d <= totalDays; d++) {
      const currDate = new Date(year, month, d);
      days.push({ day: d, dateStr: toYMD(currDate), isCurrentMonth: true });
    }

    // Next month padding to make full multiple of 7
    const remaining = (7 - (days.length % 7)) % 7;
    for (let d = 1; d <= remaining; d++) {
      const nextDate = new Date(year, month + 1, d);
      days.push({ day: d, dateStr: toYMD(nextDate), isCurrentMonth: false });
    }

    return days;
  }, [currentCalMonth]);

  // Date pill label display
  const datePillLabel = useMemo(() => {
    if (!date) return 'Date';
    if (date === todayStr) return 'Today';
    if (date === tomorrowStr) return 'Tomorrow';
    if (date === nextMondayStr) return 'Next week';
    const parts = date.split('-');
    if (parts.length === 3) {
      const mIdx = parseInt(parts[1], 10) - 1;
      return `${parseInt(parts[2], 10)} ${MONTH_NAMES[mIdx] || ''}`;
    }
    return date;
  }, [date, todayStr, tomorrowStr, nextMondayStr]);

  const datePillColor = useMemo(() => {
    if (!date) return undefined;
    if (date === todayStr) return '#10b981'; // Green
    if (date === tomorrowStr) return '#f59e0b'; // Amber
    return '#6366f1'; // Indigo
  }, [date, todayStr, tomorrowStr]);

  // Priority metadata
  const priorityInfo = useMemo(() => {
    switch (priority) {
      case 'high':
        return { label: 'Priority 1', flagClass: 'flag-red', level: 1 };
      case 'medium':
        return { label: 'Priority 2', flagClass: 'flag-orange', level: 2 };
      case 'low':
        return { label: 'Priority 3', flagClass: 'flag-blue', level: 3 };
      default:
        return { label: 'Priority', flagClass: 'flag-grey', level: 0 };
    }
  }, [priority]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="todoist-quick-add-overlay"
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          role="dialog"
          aria-modal="true"
        >
          <motion.div
            ref={cardRef}
            className="todoist-quick-add-card"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{
              duration: 0.18,
              ease: [0.16, 1, 0.3, 1]
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
                  <CheckSquare size={13} style={{ color: '#a1a1aa' }} />
                  <span className="todoist-subtask-text">{st.title}</span>
                  <button
                    type="button"
                    className="todoist-subtask-del-btn"
                    onClick={() => handleRemoveSubtask(st.id)}
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

          {/* Bottom Action Bar — Single Line Layout */}
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

              {/* Date Pill (Todoist-style dismissible pill) */}
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
              {/* Close Button */}
              <button
                type="button"
                className="todoist-btn-cancel"
                onClick={onClose}
                title="Cancel"
              >
                <X size={16} />
              </button>

              {/* Submit Button (Signature Todoist red with white up arrow) */}
              <button
                type="button"
                className="todoist-submit-btn"
                onClick={() => handleSubmit()}
                disabled={!title.trim() && !rawInput.trim()}
                title="Add task"
              >
                <ArrowUp size={17} strokeWidth={2.6} />
              </button>
            </div>
          </div>

          {/* ── POPOVER 1: DATE PICKER (Screenshot 2 Match) ── */}
          {activePopover === 'date' && (
            <div className="todoist-popover todoist-date-popover" style={{ left: `${popoverAnchorLeft}px` }}>
              {/* Type a date input */}
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

              {/* Quick Presets List */}
              <div className="todoist-presets-list">
                {/* Today */}
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
                    {new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(new Date())}
                  </span>
                </button>

                {/* Tomorrow */}
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
                    {new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(new Date(Date.now() + 86400000))}
                  </span>
                </button>

                {/* Next week */}
                <button
                  type="button"
                  className="todoist-preset-item"
                  onClick={() => {
                    setDate(nextMondayStr);
                    setActivePopover(null);
                  }}
                >
                  <div className="todoist-preset-left">
                    <CalendarDays size={14} style={{ color: '#8b5cf6' }} />
                    <span>Next week</span>
                  </div>
                  <span className="todoist-preset-right">
                    {new Intl.DateTimeFormat('en-US', { weekday: 'short', day: 'numeric', month: 'short' }).format(nextMondayDate)}
                  </span>
                </button>

                {/* Next weekend */}
                <button
                  type="button"
                  className="todoist-preset-item"
                  onClick={() => {
                    setDate(nextSaturdayStr);
                    setActivePopover(null);
                  }}
                >
                  <div className="todoist-preset-left">
                    <CalendarDays size={14} style={{ color: '#3b82f6' }} />
                    <span>Next weekend</span>
                  </div>
                  <span className="todoist-preset-right">
                    {new Intl.DateTimeFormat('en-US', { weekday: 'short', day: 'numeric', month: 'short' }).format(nextSaturdayDate)}
                  </span>
                </button>
              </div>

              {/* Mini Calendar Header */}
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

                {/* Weekday headers */}
                <div className="todoist-cal-weekdays">
                  <span>M</span>
                  <span>T</span>
                  <span>W</span>
                  <span>T</span>
                  <span>F</span>
                  <span>S</span>
                  <span>S</span>
                </div>

                {/* Calendar Day Grid */}
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

              {/* Bottom Toolbar in Date Popover */}
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

          {/* ── POPOVER 2: PRIORITY (3 ZenTrack Priorities) ── */}
          {activePopover === 'priority' && (
            <div className="todoist-popover todoist-priority-popover" style={{ left: `${popoverAnchorLeft}px` }}>
              {/* Priority 1 */}
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
                {priority === 'high' && <Check size={14} className="flag-red" />}
              </button>

              {/* Priority 2 */}
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
                {priority === 'medium' && <Check size={14} className="flag-orange" />}
              </button>

              {/* Priority 3 */}
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
                {priority === 'low' && <Check size={14} className="flag-blue" />}
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

              {/* Start & End Time Inputs */}
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
                  <span>Daily</span>
                  {recurrenceRule?.type === 'daily' && <Check size={14} style={{ color: '#10b981' }} />}
                </button>
                <button
                  type="button"
                  className="todoist-preset-item"
                  onClick={() => {
                    setRecurrenceRule({ type: 'weekly', interval: 1, daysOfWeek: [1, 2, 3, 4, 5, 6] });
                    setActivePopover(null);
                  }}
                >
                  <span>Mon – Sat</span>
                </button>
                <button
                  type="button"
                  className="todoist-preset-item"
                  onClick={() => {
                    setRecurrenceRule({ type: 'weekly', interval: 1, daysOfWeek: [1, 2, 3, 4, 5] });
                    setActivePopover(null);
                  }}
                >
                  <span>Weekdays (Mon–Fri)</span>
                </button>
                <button
                  type="button"
                  className="todoist-preset-item"
                  onClick={() => {
                    setRecurrenceRule({ type: 'weekly', interval: 1, daysOfWeek: [0, 6] });
                    setActivePopover(null);
                  }}
                >
                  <span>Weekends</span>
                </button>
                <button
                  type="button"
                  className="todoist-preset-item"
                  onClick={() => {
                    setRecurrenceRule({ type: 'monthly', interval: 1 });
                    setActivePopover(null);
                  }}
                >
                  <span>Monthly</span>
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
