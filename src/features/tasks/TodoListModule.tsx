import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useGlobalData } from '../../contexts/GlobalDataContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Check, Trash2, Calendar as CalendarIcon, X, ChevronDown, ChevronRight, Timer, Maximize, GripVertical, Search, ListChecks, Edit2, Inbox, Clock, MoreHorizontal, Filter, Copy, Play } from 'lucide-react';
import { toast } from 'sonner';
import { collection, addDoc, updateDoc, deleteDoc, doc, writeBatch } from 'firebase/firestore';
import { db, auth } from '../../services/firebase';
import type { TodoItem, TodoSubtask } from '../../types/index';
import { playPopSound } from '../../utils/sound';
import { usePomodoroContext } from '../../contexts/PomodoroContext';
import { DragDropContext, Droppable } from '@hello-pangea/dnd';
import { getLocalDateString, formatDisplayDate, formatHoursDisplay } from '../../utils/dateUtils';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EditTodoModal } from './EditTodoModal';
import { getUrgencyLevel, getCountdownText } from '../../hooks/useDeadlineWatcher';
// import { RecoveryPlannerModal } from '../crisis/RecoveryPlannerModal';
// import { ExtensionDraftModal } from '../crisis/ExtensionDraftModal';
import { TodoCard, CompletedTodoItem } from './TodoCard';
import { TimelineView } from './TimelineView';

export const TodoListModule = () => {
  const { tasks: globalTodos, isLoading } = useGlobalData();
  const todayStr = getLocalDateString(new Date());
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);

  const todos = useMemo(() => {
    return globalTodos.filter(t => t.date === selectedDate);
  }, [globalTodos, selectedDate]);
  
  const inboxTasks = useMemo(() => globalTodos.filter(t => !t.date && t.status !== 'completed').sort((a,b) => (a.order||0) - (b.order||0)), [globalTodos]);
  const overdueTasks = useMemo(() => globalTodos.filter(t => t.date && t.date < todayStr && t.status !== 'completed').sort((a,b) => (a.order||0) - (b.order||0)), [globalTodos, todayStr]);
  
  const [newTaskText, setNewTaskText] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<TodoItem['priority']>('medium');
  type RecurrenceRule = { type: 'once' | 'daily' | 'weekly' | 'monthly' | 'custom', interval?: number, daysOfWeek?: number[] };
  const [recurrenceRule, setRecurrenceRule] = useState<RecurrenceRule>({ type: 'once' });
  const [showRecurrencePicker, setShowRecurrencePicker] = useState(false);
  const [newTaskEstimate, setNewTaskEstimate] = useState('');
  const [newTaskStartTime, setNewTaskStartTime] = useState('');
  const [newTaskEndTime, setNewTaskEndTime] = useState('');
  const [newTaskSubject, setNewTaskSubject] = useState('');
  const [newTaskCommitment, setNewTaskCommitment] = useState('');

  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [newSubtaskTexts, setNewSubtaskTexts] = useState<Record<string, string>>({});
  const [editingTask, setEditingTask] = useState<TodoItem | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'all' | 'high' | 'recurring'>('all');
  
  // New Mobile Parity Features State
  const [viewMode, setViewMode] = useState<'list' | 'timeline'>('list');
  const [isInboxOpen, setIsInboxOpen] = useState(false);
  const [isTimeLogOpen, setIsTimeLogOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [sortBy, setSortBy] = useState<'default' | 'priority'>('default');

  const [isBulkEdit, setIsBulkEdit] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [bulkRescheduleDate, setBulkRescheduleDate] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; type: 'task' | 'subtask'; id: string; parentId?: string }>({ isOpen: false, type: 'task', id: '' });

  const [recoveryTask, setRecoveryTask] = useState<TodoItem | null>(null);
  const [extensionTask, setExtensionTask] = useState<TodoItem | null>(null);

  useEffect(() => {
    const handleRecovery = (e: any) => setRecoveryTask(e.detail);
    const handleExtension = (e: any) => setExtensionTask(e.detail);
    window.addEventListener('simulate-recovery-plan', handleRecovery);
    window.addEventListener('simulate-extension-request', handleExtension);
    
    const handleGCalEvents = (e: any) => {
      const addedGcal = e.detail || [];
      const todayStr = new Date().toLocaleDateString('en-CA');
      
      for (const gcalEvent of addedGcal) {
         if (!gcalEvent.start?.dateTime) continue;
         const d = new Date(gcalEvent.start.dateTime);
         const evDateStr = d.toLocaleDateString('en-CA');
         if (evDateStr !== todayStr) continue;

         const hourStr = d.getHours().toString().padStart(2, '0') + ':00';
         // Check if any todo has this exact timeSlot today
         const conflictTask = globalTodos.find(t => t.status !== 'completed' && (t.date === todayStr || !t.date) && t.timeSlot === hourStr);
         if (conflictTask) {
             window.dispatchEvent(new CustomEvent('guardian-calendar-conflict', { detail: { task: conflictTask, gcalEvent } }));
             break; // only handle one conflict at a time for now
         }
      }
    };
    window.addEventListener('gcal-events-added', handleGCalEvents);

    return () => {
      window.removeEventListener('simulate-recovery-plan', handleRecovery);
      window.removeEventListener('simulate-extension-request', handleExtension);
      window.removeEventListener('gcal-events-added', handleGCalEvents);
    };
  }, [todos]);

  const { startTimer, state: pomodoroState, pauseTimer, resumeTimer, resetTimer, dismissTimer, formatTime, toggleFocusMode } = usePomodoroContext();
  const user = auth.currentUser;

  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const mobileJumpRef = useRef<HTMLInputElement>(null);
  const [showSubjectSuggest, setShowSubjectSuggest] = useState(false);
  const [showTaskOptions, setShowTaskOptions] = useState(false);
  const [isNewTaskFormOpen, setIsNewTaskFormOpen] = useState(false);

  // Derive all previously-used subjects from all todos (no Firestore query needed)
  const allSubjects = useMemo(() => {
    const s = new Set<string>();
    globalTodos.forEach(t => { if (t.subject) s.add(t.subject); });
    return Array.from(s).sort();
  }, [globalTodos]);

  // Recurring task auto-generation: on mount, for each isRecurring task, ensure today's copy exists
  useEffect(() => {
    if (!user || isLoading || globalTodos.length === 0) return;
    const alreadyRan = sessionStorage.getItem(`recurring_gen_${todayStr}`);
    if (alreadyRan) return;
    sessionStorage.setItem(`recurring_gen_${todayStr}`, 'true');

    const recurringTemplates = globalTodos.filter(t => t.isRecurring && t.date < todayStr);
    // ✅ BUG FIX: Use (t.title || t.text) — new tasks store 'title', old tasks store 'text'
    const todayTexts = new Set(globalTodos.filter(t => t.date === todayStr).map(t => (t.title || t.text || '').trim().toLowerCase()));

    const missing = recurringTemplates.filter(t => !todayTexts.has((t.title || t.text || '').trim().toLowerCase()));
    if (missing.length === 0) return;

    Promise.all(missing.map(t =>
      addDoc(collection(db, 'todos'), {
        userId: user.uid,
        title: t.text,
        date: todayStr,
        status: 'pending',
        priority: t.priority,
        isRecurring: true,
        subtasks: [],
        estimatedMinutes: t.estimatedMinutes || null,
        subject: t.subject || null,
        createdAt: Date.now(),
        order: Date.now(),
      })
    )).then(() => {
      if (missing.length > 0) toast.success(`↻ ${missing.length} daily task${missing.length !== 1 ? 's' : ''} added for today!`);
    }).catch(console.error);
  }, [isLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (newTaskStartTime && newTaskEndTime) {
      const [startH, startM] = newTaskStartTime.split(':').map(Number);
      const [endH, endM] = newTaskEndTime.split(':').map(Number);
      
      let duration = (endH * 60 + endM) - (startH * 60 + startM);
      if (duration < 0) duration += 24 * 60; 
      
      setNewTaskEstimate(duration.toString());
    }
  }, [newTaskStartTime, newTaskEndTime]);

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newTaskText.trim()) return;

    const incompleteCount = todos.filter(t => t.status !== 'completed').length;

    const newTodo: any = {
      userId: user.uid,
      title: newTaskText.trim(),
      text: newTaskText.trim(), // ✅ BUG FIX: Add 'text' field for legacy search/filter/recurring/DnD compatibility
      date: selectedDate,
      status: 'pending',
      priority: newTaskPriority,
      isRecurring: recurrenceRule.type !== 'once',
      timeSlot: newTaskStartTime || null,
      subtasks: [],
      createdAt: Date.now(),
      order: incompleteCount,
    };

    if (recurrenceRule.type !== 'once') {
      newTodo.recurrenceRule = recurrenceRule;
    }

    if (newTaskSubject.trim()) {
      newTodo.subject = newTaskSubject.trim();
    }
    if (newTaskCommitment.trim()) {
      newTodo.commitmentTo = newTaskCommitment.trim();
    }

    if (newTaskEstimate) {
      newTodo.estimatedMinutes = parseInt(newTaskEstimate);
    }

    try {
      await addDoc(collection(db, 'todos'), newTodo);
      setNewTaskText('');
      setNewTaskSubject('');
      setNewTaskCommitment('');
      setNewTaskStartTime('');
      setNewTaskEndTime('');
      setRecurrenceRule({ type: 'once' });
    } catch (error) {
      console.error('Error adding task:', error);
      toast.error('Failed to add task');
    }
  };

  const toggleTodoComplete = useCallback(async (todo: TodoItem) => {
    if (!todo.id) return;
    const newStatus = todo.status !== 'completed';
    if (newStatus) {
      playPopSound();
      import('../../utils/notifications').then(({ sendSystemNotification }) => {
        sendSystemNotification('Task Completed! 🎉', { body: `You finished: "${todo.title}". Keep it up!` }, true);
      });
    }

    try {
      await updateDoc(doc(db, 'todos', todo.id), { status: newStatus ? 'completed' : 'pending' });
    } catch (error) {
      console.error('Error updating task:', error);
      toast.error('Failed to update task status');
    }
  }, []);

  const handleUpdateTask = useCallback(async (editingTask: TodoItem) => {
    try {
      await updateDoc(doc(db, 'todos', editingTask.id!), { ...editingTask });
      setEditingTask(null);
    } catch (error) {
      console.error('Error updating task:', error);
      toast.error('Failed to update task');
    }
  }, []);

  const toggleSelection = useCallback((id: string) => {
    setSelectedTaskIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const handleDeleteTask = useCallback((id: string) => {
    setDeleteConfirm({ isOpen: true, type: 'task', id });
  }, []);

  const confirmDeleteTask = async () => {
    try {
      await deleteDoc(doc(db, 'todos', deleteConfirm.id));
      toast.success('Task deleted');
      setDeleteConfirm({ isOpen: false, type: 'task', id: '' });
      if (pomodoroState.taskId === deleteConfirm.id) dismissTimer();
    } catch (error) {
      console.error('Error deleting task:', error);
      toast.error('Failed to delete task');
    }
  };

  const addSubtask = useCallback(async (todoId: string, title: string) => {
    // ✅ BUG FIX: was using undefined 'text' variable instead of the 'title' parameter
    const trimmedText = title?.trim();
    if (!trimmedText) return;
    
    const todo = globalTodos.find(t => t.id === todoId);
    if (!todo) return;

    const newSt: TodoSubtask = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
      title: trimmedText,
      status: 'pending'
    };
    const updated = [...(todo.subtasks || []), newSt];

    try {
      await updateDoc(doc(db, 'todos', todoId), { subtasks: updated });
      setNewSubtaskTexts(prev => ({ ...prev, [todoId]: '' }));
    } catch (err) {
      console.error(err);
      toast.error('Failed to add subtask');
    }
  }, [todos]);

  const toggleSubtask = useCallback(async (todoId: string, subtaskId: string) => {
    const todo = globalTodos.find(t => t.id === todoId);
    if (!todo) return;
    
    // ✅ BUG FIX: standardize schema — write 'status' field, not 'isCompleted'
    // Old code wrote isCompleted but addSubtask creates with status:'pending', causing permanent mismatch
    const wasCompleted = (todo.subtasks || []).find((s: any) => s.id === subtaskId)?.status === 'completed';
    const updated = (todo.subtasks || []).map((st: any) =>
      st.id === subtaskId 
        ? { ...st, status: wasCompleted ? 'pending' : 'completed' } 
        : st
    );
    
    if (!wasCompleted) playPopSound();

    try {
      await updateDoc(doc(db, 'todos', todoId), { subtasks: updated });
    } catch (err) { console.error(err); }
  }, [todos]);

  const handleDeleteSubtask = useCallback((todoId: string, subtaskId: string) => {
    setDeleteConfirm({ isOpen: true, type: 'subtask', id: subtaskId, parentId: todoId });
  }, []);

  const confirmDeleteSubtask = async () => {
    const todoId = deleteConfirm.parentId!;
    const subtaskId = deleteConfirm.id;
    const todo = globalTodos.find(t => t.id === todoId);
    if (!todo) return;
    const updated = (todo.subtasks || []).filter((st: any) => st.id !== subtaskId);
    try {
      await updateDoc(doc(db, 'todos', todoId), { subtasks: updated });
      setDeleteConfirm({ isOpen: false, type: 'task', id: '' });
    } catch (err) { console.error(err); }
  };

  const clearCompleted = async () => {
    const completed = todos.filter(t => t.status === 'completed');
    if (completed.length === 0) return;
    try {
      const batch = writeBatch(db);
      completed.forEach(t => batch.delete(doc(db, 'todos', t.id!)));
      await batch.commit();
      toast.success('Cleared all completed tasks');
    } catch (err) {
      console.error(err);
      toast.error('Failed to clear completed tasks');
    }
  };

  const handleBulkDelete = async () => {
    if (selectedTaskIds.size === 0) return;
    try {
      const batch = writeBatch(db);
      selectedTaskIds.forEach(id => batch.delete(doc(db, 'todos', id)));
      await batch.commit();
      setSelectedTaskIds(new Set());
      setIsBulkEdit(false);
      toast.success(`Deleted ${selectedTaskIds.size} tasks`);
    } catch (err) {
      toast.error('Failed to delete selected tasks');
    }
  };

  const handleBulkReschedule = async () => {
    if (selectedTaskIds.size === 0 || !bulkRescheduleDate) return;
    try {
      const batch = writeBatch(db);
      selectedTaskIds.forEach(id => batch.update(doc(db, 'todos', id), { date: bulkRescheduleDate }));
      await batch.commit();
      setSelectedTaskIds(new Set());
      setBulkRescheduleDate('');
      setIsBulkEdit(false);
      toast.success(`Rescheduled ${selectedTaskIds.size} tasks`);
    } catch (err) {
      toast.error('Failed to reschedule tasks');
    }
  };

  const onDragEnd = useCallback(async (result: any) => {
    if (!result.destination) return;
    const { source, destination } = result;
    if (source.index === destination.index) return;
    
    // Dragging is disabled when bulk edit is active
    if (isBulkEdit) return;
    
    // Reordering logic
    const filtered = todos.filter(t => {
      // ✅ BUG FIX: Use (t.title || t.text) for DnD reorder filter as well
      if (searchTerm && !(t.title || t.text || '').toLowerCase().includes(searchTerm.toLowerCase())) return false;
      if (filter === 'high' && t.priority !== 'high') return false;
      if (filter === 'recurring' && !t.isRecurring) return false;
      return true;
    });
    const sorted = [...filtered].sort((a, b) => {
      if (a.status === 'completed' !== b.status === 'completed') return a.status === 'completed' ? 1 : -1;
      return (a.order ?? a.createdAt) - (b.order ?? b.createdAt);
    });
    const incomplete = sorted.filter(t => t.status !== 'completed');
    
    if (destination.index >= incomplete.length || source.index >= incomplete.length) return;
    
    const reordered = Array.from(incomplete);
    const [removed] = reordered.splice(source.index, 1);
    reordered.splice(destination.index, 0, removed);
    
    // Fire off database update async
    try {
      const batch = writeBatch(db);
      reordered.forEach((todo, index) => {
        if (todo.id) {
          batch.update(doc(db, 'todos', todo.id), { order: index });
        }
      });
      await batch.commit(); // ✅ BUG FIX: was not awaited — rapid drags could race and corrupt order
    } catch (err) {
      console.error("Reorder failed", err);
    }
  }, [isBulkEdit, todos, searchTerm, filter]);

  const handleUpdateNewSubtaskText = useCallback((todoId: string, title: string) => {
    // ✅ BUG FIX: was using undefined 'text' variable instead of the 'title' parameter
    setNewSubtaskTexts(prev => ({ ...prev, [todoId]: title }));
  }, []);

  const filteredTodos = todos.filter(t => {
    // ✅ BUG FIX: Use (t.title || t.text) — agent-created tasks use 'title', old tasks use 'text'
    if (searchTerm && !(t.title || t.text || '').toLowerCase().includes(searchTerm.toLowerCase())) return false;
    if (filter === 'high' && t.priority !== 'high') return false;
    if (filter === 'recurring' && !t.isRecurring) return false;
    return true;
  });

  const sortedTodos = [...filteredTodos].sort((a, b) => {
    if (a.status === 'completed' !== b.status === 'completed') return a.status === 'completed' ? 1 : -1;

    if (a.timeSlot && b.timeSlot) {
      const parseTime = (t: string) => {
        const m = t.split(/[-–]/)[0].trim().match(/(\d+):(\d+)/);
        if (!m) return 0;
        return parseInt(m[1]) * 60 + parseInt(m[2]);
      };
      const valA = parseTime(a.timeSlot);
      const valB = parseTime(b.timeSlot);
      if (valA !== valB) return valA - valB;
    }
    if (a.timeSlot && !b.timeSlot) return -1;
    if (!a.timeSlot && b.timeSlot) return 1;
    
    // Sort by Urgency x Priority
    const getUrgScore = (date: string) => {
      const u = getUrgencyLevel(date);
      if (u === 'overdue') return 5;
      if (u === 'critical') return 4;
      if (u === 'urgent') return 3;
      if (u === 'upcoming') return 2;
      return 1;
    };
    const getPriScore = (p: string) => p === 'high' ? 3 : p === 'medium' ? 2 : 1;
    
    const scoreA = getUrgScore(a.date) * getPriScore(a.priority);
    const scoreB = getUrgScore(b.date) * getPriScore(b.priority);
    
    if (scoreA !== scoreB) return scoreB - scoreA; // Descending score
    return (a.order ?? a.createdAt) - (b.order ?? b.createdAt);
  });

  const incompleteTodos = sortedTodos.filter(t => t.status !== 'completed');
  const completedTodos = sortedTodos.filter(t => t.status === 'completed');

  const [y, m, d] = selectedDate.split('-').map(Number);
  const selectedDateObj = new Date(y, m - 1, d);
  const startOfWeek = new Date(selectedDateObj);
  startOfWeek.setDate(selectedDateObj.getDate() - selectedDateObj.getDay());

  const weekDates = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    return d;
  });

  const completedCount = todos.filter(t => t.status === 'completed').length;
  const totalEstimate = todos.filter(t => t.status !== 'completed').reduce((acc, t) => acc + (t.estimatedMinutes || 0), 0);

  return (
    <div className="module-container" style={{ position: 'relative', marginTop: '-2rem' }}>
      <div className="calendar-sidebar">
        <div className="calendar-header hide-on-mobile">
          <CalendarIcon size={18} />
          <h2>Calendar</h2>
        </div>
        <div className="calendar-dates">
          {weekDates.map((dateObj) => {
            const dateStr = getLocalDateString(dateObj);
            const isSelected = dateStr === selectedDate;
            const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
            const dayNum = dateObj.getDate();
            const dateTodos = globalTodos.filter(t => t.date === dateStr);
            const hasTasks = dateTodos.length > 0;
            return (
              <button 
                key={dateStr}
                onClick={() => setSelectedDate(dateStr)}
                className={`date-btn ${isSelected ? 'selected' : ''}`}
                aria-selected={isSelected}
                aria-current={isSelected ? 'date' : undefined}
              >
                <span className="date-day">{dayName}</span>
                <span className="date-num">{dayNum}</span>
                {hasTasks && (
                  <span className={`date-dot ${isSelected ? 'selected-dot' : ''}`} />
                )}
              </button>
            );
          })}
        </div>
        <div className="calendar-picker hide-on-mobile">
           <label>Jump to date:</label>
           <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} style={{ marginTop: '0.5rem' }} />
        </div>
        {/* Mobile date jump button */}
        <div className="show-on-mobile-only" style={{ padding: '0.5rem 0 0' }}>
          <input
            ref={mobileJumpRef}
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 0, height: 0 }}
          />
          <button
            onClick={() => mobileJumpRef.current?.showPicker?.()}
            style={{ width: '100%', padding: '0.4rem', borderRadius: '8px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-muted)', fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}
          >
            <CalendarIcon size={12} /> Jump to date
          </button>
        </div>
      </div>

      <div className="todo-content liquid-panel" style={{ padding: '1rem 1.5rem', border: 'none', display: 'flex', flexDirection: 'column', flex: 1 }}>
        <div className="module-header" style={{ marginBottom: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.25rem', '--module-accent': 'var(--accent-gradient)' } as React.CSSProperties}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'nowrap', gap: '0.5rem' }}>
            <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 400, fontFamily: "'Instrument Serif', serif", color: 'white', letterSpacing: '-0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {selectedDate === todayStr ? "Today's Tasks" : new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </h1>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <button onClick={() => setIsInboxOpen(true)} title="Overdue Inbox" style={{ padding: '0.4rem', borderRadius: '50%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-primary)', cursor: 'pointer', display: 'flex' }}><Inbox size={16} /></button>
              <button onClick={() => setIsTimeLogOpen(true)} title="Time Spent" style={{ padding: '0.4rem', borderRadius: '50%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-primary)', cursor: 'pointer', display: 'flex' }}><Timer size={16} /></button>
              <button onClick={() => setViewMode(v => v === 'timeline' ? 'list' : 'timeline')} title="Timeline View" style={{ padding: '0.4rem', borderRadius: '50%', background: viewMode === 'timeline' ? 'rgba(165,153,255,0.2)' : 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: viewMode === 'timeline' ? '#a599ff' : 'var(--text-primary)', cursor: 'pointer', display: 'flex' }}><Clock size={16} /></button>
              <button 
                className={`btn-secondary ${isBulkEdit ? 'active' : ''}`} 
                onClick={() => { setIsBulkEdit(!isBulkEdit); setSelectedTaskIds(new Set()); }}
                style={{ background: isBulkEdit ? 'var(--accent-primary)' : 'rgba(0,0,0,0.3)', color: isBulkEdit ? 'white' : 'var(--text-primary)', border: '1px solid rgba(255,255,255,0.1)', padding: '0.35rem 0.6rem', borderRadius: '8px', fontSize: '0.8rem', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '0.25rem', cursor: 'pointer' }}
              >
                <ListChecks size={14} /> <span className="hide-on-mobile">{isBulkEdit ? (selectedTaskIds.size > 0 ? `${selectedTaskIds.size} selected · Cancel` : 'Cancel') : 'Bulk Edit'}</span>
              </button>
              <button onClick={() => setIsMenuOpen(true)} title="More Options" style={{ padding: '0.4rem', borderRadius: '50%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-primary)', cursor: 'pointer', display: 'flex' }}><MoreHorizontal size={16} /></button>
            </div>
          </div>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: '0.5rem' }}>
            <p className="subtitle" style={{ display: 'flex', gap: '1rem', margin: 0, fontSize: '0.85rem' }}>
              <span>{completedCount}/{todos.length} done</span>
              {totalEstimate > 0 && <span>• ~{formatHoursDisplay(totalEstimate / 60)} estimated</span>}
            </p>
            <button 
              onClick={() => setIsNewTaskFormOpen(o => !o)}
              style={{
                width: '36px', height: '36px', borderRadius: '50%',
                background: isNewTaskFormOpen ? 'rgba(255,255,255,0.1)' : 'var(--accent-primary)', 
                color: 'white',
                border: 'none', cursor: 'pointer', display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                boxShadow: isNewTaskFormOpen ? 'none' : '0 4px 12px rgba(165,153,255,0.3)',
                transform: isNewTaskFormOpen ? 'rotate(45deg)' : 'rotate(0deg)',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                flexShrink: 0
              }}
              title="Add New Task"
            >
              <Plus size={20} />
            </button>
          </div>
        </div>

        {/* Quick Add Task — progressive disclosure */}
        <AnimatePresence initial={false}>
          {isNewTaskFormOpen && (
            <motion.form 
              onSubmit={handleAddTask} 
              style={{ background: 'rgba(20,20,25,0.6)', backdropFilter: 'blur(12px)', borderRadius: '24px', border: '1px solid rgba(168,85,247,0.2)', padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.05), 0 8px 32px rgba(0,0,0,0.3)', position: 'relative', overflow: 'hidden', marginBottom: '1.25rem' }} 
              initial={{ opacity: 0, height: 0, marginBottom: 0 }} 
              animate={{ opacity: 1, height: 'auto', marginBottom: '1.25rem' }}
              exit={{ opacity: 0, height: 0, marginBottom: 0, padding: 0, overflow: 'hidden' }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
            >
              <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: '60%', height: '1px', background: 'linear-gradient(90deg, transparent, rgba(168,85,247,0.5), transparent)' }} />
          
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: 'rgba(168,85,247,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Plus size={16} style={{ color: '#c084fc' }} />
              </div>
              <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.05em' }}>New Task</span>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <button type="button" onClick={() => setShowTaskOptions(s => !s)} style={{ padding: '0.5rem 0.75rem', borderRadius: '10px', background: showTaskOptions ? 'rgba(168,85,247,0.2)' : 'rgba(255,255,255,0.05)', border: `1px solid ${showTaskOptions ? 'rgba(168,85,247,0.4)' : 'rgba(255,255,255,0.08)'}`, color: showTaskOptions ? '#c084fc' : 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem', whiteSpace: 'nowrap', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '0.3rem' }} title="More options">
                <ListChecks size={14} /> <span className="hide-on-mobile">{showTaskOptions ? 'Less' : 'Options'}</span>
              </button>
              <button type="submit" disabled={!newTaskText.trim()} className="btn-add-task" style={{ padding: '0.5rem 1rem', whiteSpace: 'nowrap' }}>
                Add Task
              </button>
            </div>
          </div>

          {/* Row 1: text */}
          <div style={{ display: 'flex', width: '100%' }}>
            <input 
              className="input"
              type="text" 
              placeholder="What needs to get done…" 
              value={newTaskText} 
              onChange={e => setNewTaskText(e.target.value)} 
              style={{ flex: 1, minWidth: 0, width: '100%' }} 
            />
          </div>

          {/* Row 2: options (collapsible) */}
          <AnimatePresence>
            {showTaskOptions && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }} 
                animate={{ height: 'auto', opacity: 1 }} 
                exit={{ height: 0, opacity: 0 }} 
                transition={{ duration: 0.2 }}
                style={{ overflow: 'hidden' }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '1rem', background: 'rgba(0,0,0,0.15)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.03)', marginTop: '0.5rem' }}>
                  
                  {/* Row 1: Priority */}
                  <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    
                    {/* Priority Group */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', width: '55px' }}>Priority</span>
                      <div style={{ display: 'flex', background: 'rgba(0,0,0,0.3)', borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.05)' }}>
                        {(['low', 'medium', 'high'] as const).map(p => (
                          <button type="button" key={p} onClick={() => setNewTaskPriority(p)} style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', border: 'none', borderRight: p !== 'high' ? '1px solid rgba(255,255,255,0.05)' : 'none', background: newTaskPriority === p ? (p === 'high' ? 'rgba(239,68,68,0.15)' : p === 'medium' ? 'rgba(245,158,11,0.15)' : 'rgba(16,185,129,0.15)') : 'transparent', color: newTaskPriority === p ? (p === 'high' ? '#ef4444' : p === 'medium' ? '#f59e0b' : '#10b981') : 'var(--text-muted)', textTransform: 'capitalize', transition: 'all 0.2s' }}>
                            {p}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Row 2: Text inputs (Subject & Commitment) */}
                  <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: '150px', background: 'rgba(0,0,0,0.3)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', padding: '0 0.75rem' }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginRight: '0.5rem' }}>📚</span>
                      <input 
                        type="text" 
                        placeholder="Subject (e.g. CS101, Work)" 
                        value={newTaskSubject}
                        onChange={e => setNewTaskSubject(e.target.value)}
                        style={{ flex: 1, padding: '0.5rem 0', background: 'transparent', border: 'none', color: '#fff', fontSize: '0.8rem', outline: 'none' }} 
                      />
                    </div>
                    <div style={{ flex: 1, minWidth: '150px', background: 'rgba(0,0,0,0.3)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', padding: '0 0.75rem' }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginRight: '0.5rem' }}>🤝</span>
                      <input 
                        type="text" 
                        placeholder="Promised to (e.g. Boss, Mom)" 
                        value={newTaskCommitment}
                        onChange={e => setNewTaskCommitment(e.target.value)}
                        style={{ flex: 1, padding: '0.5rem 0', background: 'transparent', border: 'none', color: '#fff', fontSize: '0.8rem', outline: 'none' }} 
                      />
                    </div>
                  </div>

                  {/* Row 3: Time & Recurring */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', overflow: 'hidden' }}>
                      <input 
                        type={newTaskStartTime ? "time" : "text"} 
                        placeholder="Start"
                        value={newTaskStartTime} 
                        onChange={e => {
                          setNewTaskStartTime(e.target.value);
                          if (e.target.value && newTaskEndTime) {
                            const [sH, sM] = e.target.value.split(':').map(Number);
                            const [eH, eM] = newTaskEndTime.split(':').map(Number);
                            let diff = (eH * 60 + eM) - (sH * 60 + sM);
                            if (diff < 0) diff += 24 * 60;
                            setNewTaskEstimate(diff.toString());
                          }
                        }}
                        onFocus={e => { e.target.type = "time"; try { e.target.showPicker() } catch(err){} }}
                        onBlur={e => { if (!e.target.value) e.target.type = "text"; }}
                        onClick={e => { e.currentTarget.type = "time"; try { e.currentTarget.showPicker() } catch(err){} }}
                        style={{ padding: '0.45rem 0.5rem', background: 'transparent', border: 'none', color: '#fff', outline: 'none', fontSize: '0.82rem', width: '85px', cursor: 'pointer', textAlign: 'center' }} 
                        title="Start Time" 
                      />
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', padding: '0 0.1rem' }}>→</span>
                      <input 
                        type={newTaskEndTime ? "time" : "text"} 
                        placeholder="End"
                        value={newTaskEndTime} 
                        onChange={e => {
                          setNewTaskEndTime(e.target.value);
                          if (newTaskStartTime && e.target.value) {
                            const [sH, sM] = newTaskStartTime.split(':').map(Number);
                            const [eH, eM] = e.target.value.split(':').map(Number);
                            let diff = (eH * 60 + eM) - (sH * 60 + sM);
                            if (diff < 0) diff += 24 * 60;
                            setNewTaskEstimate(diff.toString());
                          }
                        }} 
                        onFocus={e => { e.target.type = "time"; try { e.target.showPicker() } catch(err){} }}
                        onBlur={e => { if (!e.target.value) e.target.type = "text"; }}
                        onClick={e => { e.currentTarget.type = "time"; try { e.currentTarget.showPicker() } catch(err){} }}
                        style={{ padding: '0.45rem 0.5rem', background: 'transparent', border: 'none', color: '#fff', outline: 'none', fontSize: '0.82rem', width: '85px', cursor: 'pointer', textAlign: 'center' }} 
                        title="End Time" 
                      />
                      <div style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.1)', margin: '0 0.2rem' }} />
                      <div style={{ display: 'flex', alignItems: 'center', padding: '0 0.4rem', width: '70px' }}>
                        <Timer size={13} color="rgba(255,255,255,0.5)" />
                        <input 
                          type="number" 
                          value={newTaskEstimate} 
                          onChange={e => setNewTaskEstimate(e.target.value)} 
                          min="1" max="480" 
                          style={{ width: '100%', padding: '0.45rem 0 0.45rem 0.3rem', background: 'transparent', border: 'none', color: '#fff', fontSize: '0.82rem', outline: 'none' }} 
                          placeholder="min"
                          title="Duration (mins)" 
                        />
                      </div>
                    </div>
                    
                    <div style={{ position: 'relative' }}>
                      <button
                        type="button"
                        onClick={() => setShowRecurrencePicker(!showRecurrencePicker)}
                        style={{
                          padding: '0.45rem 0.8rem',
                          border: '1px solid rgba(255,255,255,0.08)',
                          borderRadius: '8px',
                          background: recurrenceRule.type !== 'once' ? 'rgba(165, 153, 255, 0.15)' : 'rgba(0,0,0,0.3)',
                          color: recurrenceRule.type !== 'once' ? '#a599ff' : 'var(--text-muted)',
                          cursor: 'pointer',
                          fontSize: '0.82rem',
                          fontWeight: 600,
                          transition: 'all 0.2s',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.4rem'
                        }}
                      >
                        ↻ {recurrenceRule.type === 'once' ? 'Does not repeat' : recurrenceRule.type === 'custom' ? 'Custom Repeat' : `Repeats ${recurrenceRule.type}`}
                      </button>

                      <AnimatePresence>
                        {showRecurrencePicker && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            style={{ overflow: 'hidden', marginTop: '0.5rem', minWidth: '220px' }}
                          >
                            <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                              {(['once', 'daily', 'weekly', 'monthly', 'custom'] as const).map(rt => (
                                <button
                                  key={rt}
                                  type="button"
                                  onClick={() => {
                                    setRecurrenceRule(prev => ({ ...prev, type: rt, interval: rt === 'custom' ? prev.interval || 1 : undefined }));
                                    if (rt !== 'custom' && rt !== 'weekly') setShowRecurrencePicker(false);
                                  }}
                                  style={{ padding: '0.5rem 0.75rem', textAlign: 'left', background: recurrenceRule.type === rt ? 'rgba(165, 153, 255, 0.15)' : 'transparent', color: recurrenceRule.type === rt ? '#a599ff' : 'var(--text-primary)', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem', textTransform: 'capitalize' }}
                                >
                                  {rt === 'once' ? 'Does not repeat' : rt}
                                </button>
                              ))}

                              {/* Custom recurrence inline editor */}
                              {recurrenceRule.type === 'custom' && (
                                <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Every</span>
                                    <input 
                                      type="number" 
                                      value={recurrenceRule.interval || 1} 
                                      onChange={e => setRecurrenceRule(prev => ({ ...prev, interval: Math.max(1, parseInt(e.target.value) || 1) }))}
                                      style={{ width: '40px', padding: '0.25rem', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', borderRadius: '4px', textAlign: 'center', outline: 'none' }}
                                    />
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>days</span>
                                  </div>
                                </div>
                              )}
                              
                              {recurrenceRule.type === 'weekly' && (
                                <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem', display: 'block' }}>Repeat on:</span>
                                  <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
                                    {[{id: 1, l: 'M'}, {id: 2, l: 'T'}, {id: 3, l: 'W'}, {id: 4, l: 'T'}, {id: 5, l: 'F'}, {id: 6, l: 'S'}, {id: 0, l: 'S'}].map(d => {
                                      const active = (recurrenceRule.daysOfWeek || []).includes(d.id);
                                      return (
                                        <button
                                          key={d.id}
                                          type="button"
                                          onClick={() => {
                                            setRecurrenceRule(prev => {
                                              const current = prev.daysOfWeek || [];
                                              const updated = active ? current.filter(x => x !== d.id) : [...current, d.id];
                                              return { ...prev, daysOfWeek: updated };
                                            });
                                          }}
                                          style={{ width: '22px', height: '22px', borderRadius: '50%', background: active ? '#a599ff' : 'transparent', border: active ? 'none' : '1px solid rgba(255,255,255,0.2)', color: active ? '#000' : 'var(--text-muted)', fontSize: '0.65rem', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                                        >
                                          {d.l}
                                        </button>
                                      )
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>

                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.form>
          )}
        </AnimatePresence>

        <div className="todo-list" aria-live="polite">
          {isLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="skeleton" style={{ padding: '1rem 1.25rem', borderRadius: 'var(--radius-md)' }}>
                  <div className="skeleton-line medium" />
                  <div className="skeleton-line short" />
                </div>
              ))}
            </div>
          ) : sortedTodos.length === 0 ? (
            <div className="empty-state" style={{ marginTop: '2rem' }}>
              No tasks match your criteria.
            </div>
          ) : viewMode === 'timeline' ? (
            <TimelineView tasks={todos} selectedDate={selectedDate} onTaskClick={setEditingTask} />
          ) : (
            <DragDropContext onDragEnd={onDragEnd}>
              <Droppable droppableId="todos">
                {(provided) => (
                  <div {...provided.droppableProps} ref={provided.innerRef} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {incompleteTodos.map((todo, index) => {
                      const isTaskBlocked = todo.blockedBy?.some((id: string) => globalTodos.find((t: any) => t.id === id && t.status !== 'completed'));
                      return (
                        <TodoCard 
                          key={todo.id!}
                          todo={todo}
                          index={index}
                          isExpanded={expandedTaskId === todo.id}
                          isSelected={selectedTaskIds.has(todo.id!)}
                          isBulkEdit={isBulkEdit}
                          isBlocked={isTaskBlocked}
                          newSubtaskText={newSubtaskTexts[todo.id!] || ''}
                          toggleSelection={toggleSelection}
                          toggleTodoComplete={toggleTodoComplete}
                          setExpandedTaskId={setExpandedTaskId}
                          onEdit={(task: TodoItem) => setEditingTask(task)}
                          handleDeleteTask={handleDeleteTask}
                          toggleSubtask={toggleSubtask}
                          handleDeleteSubtask={handleDeleteSubtask}
                          addSubtask={addSubtask}
                          setNewSubtaskText={handleUpdateNewSubtaskText}
                          startTimer={startTimer}
                        />
                      );
                    })}
                    {provided.placeholder}
                    
                    {completedTodos.length > 0 && (
                      <div style={{ marginTop: '1.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                          <h4 style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>Completed</h4>
                          {!isBulkEdit && (
                            <button onClick={() => setShowClearConfirm(true)} style={{ fontSize: '0.8rem', color: '#ef4444', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                              <Trash2 size={12} /> Clear all
                            </button>
                          )}
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                          {completedTodos.map(todo => {
                            const isSelected = selectedTaskIds.has(todo.id!);
                            return (
                              <CompletedTodoItem 
                                key={todo.id}
                                todo={todo}
                                isSelected={isSelected}
                                isBulkEdit={isBulkEdit}
                                toggleSelection={toggleSelection}
                                toggleTodoComplete={toggleTodoComplete}
                                handleDeleteTask={handleDeleteTask}
                              />
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          )}
        </div>
      </div>

      {/* Bulk Action Footer Bar */}
      {isBulkEdit && selectedTaskIds.size > 0 && (
        <div style={{
          position: 'fixed',
          bottom: '2rem',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'var(--bg-surface)',
          border: '1px solid var(--accent-primary)',
          borderRadius: 'var(--radius-full)',
          padding: '0.75rem 1.5rem',
          boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          gap: '1.5rem',
          zIndex: 50,
          animation: 'slideUp 0.3s ease-out'
        }}>
          <span style={{ fontWeight: 600, color: 'var(--accent-primary)' }}>{selectedTaskIds.size} selected</span>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', borderLeft: '1px solid var(--border-subtle)', paddingLeft: '1.5rem' }}>
            <input 
              type="date" 
              value={bulkRescheduleDate} 
              onChange={e => setBulkRescheduleDate(e.target.value)}
              style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '0.4rem', color: 'var(--text-primary)' }}
            />
            <button className="btn-secondary" style={{ padding: '0.4rem 0.6rem', fontSize: '0.8rem' }} onClick={handleBulkReschedule} disabled={!bulkRescheduleDate}>Reschedule</button>
            <button className="btn-danger" style={{ padding: '0.4rem 0.6rem', fontSize: '0.8rem' }} onClick={handleBulkDelete}>
              <Trash2 size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Mini Pomodoro Widget */}
      {pomodoroState.taskId && (
        <motion.div 
          drag
          dragMomentum={false}
          className="hide-on-mobile pomodoro-widget" 
          style={{
            position: 'fixed',
            bottom: '2rem',
            right: '2rem',
            background: 'rgba(18, 18, 20, 0.95)',
            backdropFilter: 'blur(24px) saturate(180%)',
            border: '1px solid var(--accent-primary)',
            borderRadius: 'var(--radius-xl)',
            padding: '1.5rem',
            boxShadow: '0 24px 48px -12px rgba(0, 0, 0, 0.5), 0 0 32px rgba(99, 102, 241, 0.15)',
            zIndex: 1100,
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
            width: '320px',
            animation: 'slideUp 0.4s var(--spring-bouncy)',
            cursor: 'grab'
          }}
          whileDrag={{ cursor: 'grabbing', scale: 1.02 }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <h4 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Focusing On</h4>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button className="btn-icon" onClick={toggleFocusMode} aria-label="Enter Focus Mode"><Maximize size={16}/></button>
              <button className="btn-icon" onClick={dismissTimer} aria-label="Close timer"><X size={16}/></button>
            </div>
          </div>
          
          <p style={{ 
            margin: 0, 
            fontWeight: 500, 
            fontSize: '1.05rem', 
            textAlign: 'left',
            maxWidth: '100%',
            lineHeight: 1.2
          }}>
            {pomodoroState.taskText}
          </p>
          
          <div style={{ 
            fontSize: '3.5rem', 
            fontFamily: 'var(--font-display)', 
            fontWeight: 800, 
            textAlign: 'center', 
            color: pomodoroState.isRunning ? '#fff' : 'var(--text-muted)',
            lineHeight: 1,
            textShadow: pomodoroState.isRunning ? '0 0 25px rgba(168,85,247,0.6)' : 'none',
            letterSpacing: '-0.02em',
            transition: 'all 0.5s ease'
          }}>
            {formatTime(pomodoroState.timeLeft)}
          </div>
          
          <div style={{ 
            display: 'flex', 
            gap: '0.75rem', 
            justifyContent: 'center', 
            marginTop: '0.5rem' 
          }}>
            <button 
              className="btn-primary" 
              onClick={() => pomodoroState.isRunning ? pauseTimer() : resumeTimer()}
              style={{ flex: 1 }}
            >
              {pomodoroState.isRunning ? '⏸ Pause Focus' : '▶ Start Focus'}
            </button>
            <button 
              className="btn-secondary" 
              onClick={resetTimer}
              style={{ padding: '0 1rem' }}
            >
              ↻ Reset
            </button>
          </div>
        </motion.div>
      )}
      <ConfirmDialog 
        open={deleteConfirm.isOpen}
        title={deleteConfirm.type === 'task' ? 'Delete Task' : 'Delete Subtask'}
        message={`Are you sure you want to delete this ${deleteConfirm.type}? This cannot be undone.`}
        onConfirm={deleteConfirm.type === 'task' ? confirmDeleteTask : confirmDeleteSubtask}
        onCancel={() => setDeleteConfirm({ isOpen: false, type: 'task', id: '' })}
      />
      <ConfirmDialog
        open={showClearConfirm}
        title="Clear Completed Tasks"
        message={`This will permanently delete all ${completedTodos.length} completed task${completedTodos.length !== 1 ? 's' : ''}. This cannot be undone.`}
        onConfirm={() => { clearCompleted(); setShowClearConfirm(false); }}
        onCancel={() => setShowClearConfirm(false)}
      />
      <EditTodoModal 
        isOpen={!!editingTask} 
        onClose={() => setEditingTask(null)} 
        todo={editingTask} 
        onUpdate={handleUpdateTask} 
      />

      {/* Inbox & Overdue Modal */}
      <AnimatePresence>
        {isInboxOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={(e) => e.target === e.currentTarget && setIsInboxOpen(false)}
          >
            <motion.div
              initial={{ y: 50, opacity: 0, scale: 0.95 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 20, opacity: 0, scale: 0.95 }}
              style={{ background: 'var(--bg-panel)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '1.5rem', width: '90%', maxWidth: '600px', maxHeight: '80vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '1rem', boxShadow: '0 24px 48px rgba(0,0,0,0.5)' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Inbox size={20} color="#a599ff" /> Inbox & Overdue</h2>
                <button onClick={() => setIsInboxOpen(false)} className="btn-icon"><X size={20} /></button>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                {overdueTasks.length > 0 && (
                  <div>
                    <h3 style={{ color: '#ff6961', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Overdue Tasks</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {overdueTasks.map(t => (
                        <div key={t.id} style={{ padding: '0.75rem', background: 'rgba(255,105,97,0.1)', border: '1px solid rgba(255,105,97,0.2)', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.9rem' }}>{t.title}</span>
                          <span style={{ fontSize: '0.75rem', color: '#ff6961' }}>{t.date}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {inboxTasks.length > 0 && (
                  <div>
                    <h3 style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Unscheduled Inbox</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {inboxTasks.map(t => (
                        <div key={t.id} style={{ padding: '0.75rem', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.9rem' }}>{t.title}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {overdueTasks.length === 0 && inboxTasks.length === 0 && (
                  <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem 0' }}>All clear! No overdue or inbox tasks.</p>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Options Menu Popover */}
      <AnimatePresence>
        {isMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
            onClick={() => setIsMenuOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: -10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: -10 }}
              style={{ position: 'absolute', top: '120px', right: '40px', background: '#1c1c1d', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '0.5rem', minWidth: '220px', boxShadow: '0 10px 30px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', zIndex: 9999 }}
              onClick={e => e.stopPropagation()}
            >
              <button onClick={() => { setSortBy(sortBy === 'priority' ? 'default' : 'priority'); setIsMenuOpen(false); }} style={{ padding: '0.75rem 1rem', textAlign: 'left', background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderRadius: '8px' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}><Filter size={16} /> Sort by Priority</span>
                {sortBy === 'priority' && <Check size={16} color="#a599ff" />}
              </button>
              <div style={{ height: '1px', background: 'rgba(255,255,255,0.05)', margin: '0.25rem 0' }} />
              <button onClick={() => { setIsBulkEdit(true); setIsMenuOpen(false); }} style={{ padding: '0.75rem 1rem', textAlign: 'left', background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.75rem', borderRadius: '8px' }}>
                <ListChecks size={16} /> Select Multiple
              </button>
              <div style={{ height: '1px', background: 'rgba(255,255,255,0.05)', margin: '0.25rem 0' }} />
              {/* Note: In this component, clearCompleted triggers showClearConfirm */}
              <button onClick={() => { (window as any).setShowClearConfirm?.(true); setIsMenuOpen(false); }} style={{ padding: '0.75rem 1rem', textAlign: 'left', background: 'transparent', border: 'none', color: '#ff6961', cursor: 'pointer', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.75rem', borderRadius: '8px' }}>
                <Trash2 size={16} color="#ff6961" /> Clear Completed
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Time Spent Modal */}
      <AnimatePresence>
        {isTimeLogOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={(e) => e.target === e.currentTarget && setIsTimeLogOpen(false)}
          >
            <motion.div
              initial={{ y: 50, opacity: 0, scale: 0.95 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: 20, opacity: 0, scale: 0.95 }}
              style={{ background: 'var(--bg-panel)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '1.5rem', width: '90%', maxWidth: '400px', display: 'flex', flexDirection: 'column', gap: '1rem', boxShadow: '0 24px 48px rgba(0,0,0,0.5)' }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Timer size={20} color="#a599ff" /> Time Spent</h2>
                <button onClick={() => setIsTimeLogOpen(false)} className="btn-icon"><X size={20} /></button>
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: 0 }}>
                Total estimated time today: <strong>{formatHoursDisplay(todos.reduce((a, t) => a + (t.estimatedMinutes || 0), 0) / 60)}</strong>
              </p>
              <div style={{ padding: '1rem', background: 'rgba(165,153,255,0.1)', border: '1px solid rgba(165,153,255,0.2)', borderRadius: '8px', textAlign: 'center', marginTop: '1rem' }}>
                <h3 style={{ margin: '0 0 0.5rem 0', color: '#a599ff', fontSize: '1.5rem' }}>Coming Soon</h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>Detailed time tracking and manual logs will be available here.</p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
};
