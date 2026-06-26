import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useGlobalData } from '../../contexts/GlobalDataContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Check, Trash2, Calendar as CalendarIcon, X, ChevronDown, ChevronRight, Timer, Maximize, GripVertical, Search, ListChecks, Edit2 } from 'lucide-react';
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
import { RecoveryPlannerModal } from '../crisis/RecoveryPlannerModal';
import { ExtensionDraftModal } from '../crisis/ExtensionDraftModal';
import { TodoCard, CompletedTodoItem } from './TodoCard';

export const TodoListModule = () => {
  const { tasks: globalTodos, isLoading } = useGlobalData();
  const todayStr = getLocalDateString(new Date());
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);

  const todos = useMemo(() => {
    return globalTodos.filter(t => t.date === selectedDate);
  }, [globalTodos, selectedDate]);
  
  const [newTaskText, setNewTaskText] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<TodoItem['priority']>('medium');
  const [newTaskRecurring, setNewTaskRecurring] = useState(false);
  const [newTaskEstimate, setNewTaskEstimate] = useState('');
  const [newTaskStartTime, setNewTaskStartTime] = useState('');
  const [newTaskEndTime, setNewTaskEndTime] = useState('');
  const [newTaskSubject, setNewTaskSubject] = useState('');

  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [newSubtaskTexts, setNewSubtaskTexts] = useState<Record<string, string>>({});
  const [editingTask, setEditingTask] = useState<TodoItem | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'all' | 'high' | 'recurring'>('all');
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
    const todayTexts = new Set(globalTodos.filter(t => t.date === todayStr).map(t => t.text.trim().toLowerCase()));

    const missing = recurringTemplates.filter(t => !todayTexts.has(t.text.trim().toLowerCase()));
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
      date: selectedDate,
      status: 'pending',
      priority: newTaskPriority,
      isRecurring: newTaskRecurring,
      timeSlot: newTaskStartTime || null,
      subtasks: [],
      createdAt: Date.now(),
      order: incompleteCount,
    };

    if (newTaskSubject.trim()) {
      newTodo.subject = newTaskSubject.trim();
    }

    if (newTaskEstimate) {
      newTodo.estimatedMinutes = parseInt(newTaskEstimate);
    }

    try {
      await addDoc(collection(db, 'todos'), newTodo);
      setNewTaskText('');
      setNewTaskSubject('');
      setNewTaskStartTime('');
      setNewTaskEndTime('');
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
    const trimmedText = text?.trim();
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
    
    const updated = (todo.subtasks || []).map((st: any) =>
      st.id === subtaskId ? { ...st, isCompleted: st.status !== 'completed' } : st
    );
    
    const wasCompleted = (todo.subtasks || []).find((s: any) => s.id === subtaskId)?.status === 'completed';
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
      if (searchTerm && !t.text.toLowerCase().includes(searchTerm.toLowerCase())) return false;
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
      batch.commit();
    } catch (err) {
      console.error("Reorder failed", err);
    }
  }, [isBulkEdit, todos, searchTerm, filter]);

  const handleUpdateNewSubtaskText = useCallback((todoId: string, title: string) => {
    setNewSubtaskTexts(prev => ({ ...prev, [todoId]: text }));
  }, []);

  const filteredTodos = todos.filter(t => {
    if (searchTerm && !t.text.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    if (filter === 'high' && t.priority !== 'high') return false;
    if (filter === 'recurring' && !t.isRecurring) return false;
    return true;
  });

  const sortedTodos = [...filteredTodos].sort((a, b) => {
    if (a.status === 'completed' !== b.status === 'completed') return a.status === 'completed' ? 1 : -1;
    
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
    <div className="module-container" style={{ position: 'relative' }}>
      <div className="calendar-sidebar">
        <div className="calendar-header">
          <CalendarIcon size={18} />
          <h2>Calendar</h2>
        </div>
        <div className="calendar-dates">
          {weekDates.map((dateObj) => {
            const dateStr = getLocalDateString(dateObj);
            const isSelected = dateStr === selectedDate;
            const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
            const dayNum = dateObj.getDate();
            const monthName = dateObj.toLocaleDateString('en-US', { month: 'short' });
            // Dot indicator: does this date have tasks?
            const dateTodos = globalTodos.filter(t => t.date === dateStr);
            const hasOverdue = dateTodos.some(t => t.status !== 'completed' && dateStr < todayStr);
            const hasTasks = dateTodos.length > 0;
            return (
              <button 
                key={dateStr}
                onClick={() => setSelectedDate(dateStr)}
                className={`date-btn ${isSelected ? 'selected' : ''}`}
                aria-selected={isSelected}
                aria-current={isSelected ? 'date' : undefined}
              >
                <span className="date-month">{monthName}</span>
                <span className="date-num">{dayNum}</span>
                <span className="date-day">{dayName}</span>
                {hasTasks && (
                  <span style={{
                    display: 'block', width: '5px', height: '5px', borderRadius: '50%',
                    background: hasOverdue ? '#ef4444' : isSelected ? '#fff' : '#a855f7',
                    margin: '2px auto 0',
                    flexShrink: 0,
                    boxShadow: hasOverdue ? '0 0 4px rgba(239,68,68,0.6)' : 'none',
                  }} />
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

      <div className="todo-content liquid-panel" style={{ padding: '1rem 1.5rem', border: 'none' }}>
        <div style={{ marginBottom: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'nowrap', gap: '0.5rem' }}>
            <h1 style={{ margin: 0, fontSize: '1.5rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {selectedDate === todayStr ? "Today's Tasks" : `Tasks for ${formatDisplayDate(selectedDate)}`}
            </h1>
            
            <button 
              className={`btn-secondary ${isBulkEdit ? 'active' : ''}`} 
              onClick={() => { setIsBulkEdit(!isBulkEdit); setSelectedTaskIds(new Set()); }}
              style={{ background: isBulkEdit ? 'var(--accent-primary)' : 'rgba(0,0,0,0.3)', color: isBulkEdit ? 'white' : 'var(--text-primary)', border: '1px solid rgba(255,255,255,0.1)', padding: '0.35rem 0.6rem', borderRadius: '8px', fontSize: '0.8rem', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '0.25rem' }}
            >
              <ListChecks size={14} /> {isBulkEdit ? (selectedTaskIds.size > 0 ? `${selectedTaskIds.size} selected · Cancel` : 'Cancel') : 'Bulk Edit'}
            </button>
          </div>
          
          <p className="subtitle" style={{ display: 'flex', gap: '1rem', margin: 0, fontSize: '0.85rem' }}>
            <span>{completedCount}/{todos.length} done</span>
            {totalEstimate > 0 && <span>• ~{formatHoursDisplay(totalEstimate / 60)} estimated</span>}
          </p>
        </div>

        {/* Desktop Search & Filters */}
        <div className="hide-on-mobile" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem', background: 'var(--bg-surface)', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
          <div 
            style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '0 0.75rem', flex: '1 1 200px', minWidth: 0, transition: 'all 0.2s ease' }}
            onFocus={e => { e.currentTarget.style.boxShadow = '0 0 0 2px rgba(168, 85, 247, 0.4)'; e.currentTarget.style.borderColor = 'rgba(168, 85, 247, 0.8)'; }}
            onBlur={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = 'var(--border-subtle)'; }}
          >
            <Search size={16} color="var(--text-muted)" />
            <input 
              type="text" 
              placeholder="Search tasks..." 
              value={searchTerm} 
              onChange={e => setSearchTerm(e.target.value)} 
              style={{ border: 'none', background: 'transparent', padding: '0.5rem', width: '100%', color: 'var(--text-primary)', outline: 'none', boxShadow: 'none' }}
            />
          </div>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            <button className={`btn-secondary ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')} style={{ padding: '0.35rem 0.6rem', fontSize: '0.78rem' }}>All</button>
            <button className={`btn-secondary ${filter === 'high' ? 'active' : ''}`} onClick={() => setFilter(filter === 'high' ? 'all' : 'high')} style={{ padding: '0.35rem 0.6rem', fontSize: '0.78rem' }}>🔴 High</button>
            <button className={`btn-secondary ${filter === 'recurring' ? 'active' : ''}`} onClick={() => setFilter(filter === 'recurring' ? 'all' : 'recurring')} style={{ padding: '0.35rem 0.6rem', fontSize: '0.78rem' }}>↻ Daily</button>
          </div>
        </div>

        {/* Mobile Search & Filters */}
        <div className="show-on-mobile-only" style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
            <button
              onClick={() => setShowMobileSearch(s => !s)}
              style={{ padding: '0.4rem 0.6rem', borderRadius: '8px', background: showMobileSearch ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.05)', border: `1px solid ${showMobileSearch ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.1)'}`, color: showMobileSearch ? 'var(--accent-primary)' : 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.78rem' }}
            >
              <Search size={14} />
            </button>
            <button className={`btn-secondary ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')} style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}>All</button>
            <button className={`btn-secondary ${filter === 'high' ? 'active' : ''}`} onClick={() => setFilter(filter === 'high' ? 'all' : 'high')} style={{ padding: '0.3rem 0.5rem', fontSize: '0.75rem' }}>🔴</button>
            <button className={`btn-secondary ${filter === 'recurring' ? 'active' : ''}`} onClick={() => setFilter(filter === 'recurring' ? 'all' : 'recurring')} style={{ padding: '0.3rem 0.5rem', fontSize: '0.75rem' }}>↻</button>
          </div>
          {showMobileSearch && (
            <div style={{ marginTop: '0.4rem', display: 'flex', alignItems: 'center', background: 'var(--bg-base)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '8px', padding: '0 0.75rem' }}>
              <Search size={14} color="var(--text-muted)" />
              <input
                autoFocus
                type="text"
                placeholder="Search tasks..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{ border: 'none', background: 'transparent', padding: '0.5rem', width: '100%', color: 'var(--text-primary)', outline: 'none', fontSize: '0.9rem' }}
              />
              {searchTerm && <button onClick={() => setSearchTerm('')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0.2rem', display: 'flex' }}><X size={14} /></button>}
            </div>
          )}
        </div>

        {/* Quick Add Task — progressive disclosure */}
        <motion.form 
          onSubmit={handleAddTask} 
          style={{ background: 'rgba(20,20,25,0.6)', backdropFilter: 'blur(12px)', borderRadius: '24px', border: '1px solid rgba(168,85,247,0.2)', padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.05), 0 8px 32px rgba(0,0,0,0.3)', position: 'relative', overflow: 'hidden', marginBottom: '1.25rem' }} 
          initial={{ opacity: 0, y: 10 }} 
          animate={{ opacity: 1, y: 0 }}
        >
          <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: '60%', height: '1px', background: 'linear-gradient(90deg, transparent, rgba(168,85,247,0.5), transparent)' }} />
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: 'rgba(168,85,247,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Plus size={16} style={{ color: '#c084fc' }} />
            </div>
            <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.05em' }}>New Task</span>
          </div>

          {/* Row 1: text + add */}
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <input 
              type="text" 
              placeholder="What needs to get done…" 
              value={newTaskText} 
              onChange={e => setNewTaskText(e.target.value)} 
              style={{ flex: 1, minWidth: '200px', padding: '0.65rem 0.9rem', borderRadius: '10px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)', color: '#fff', fontSize: '0.95rem', outline: 'none' }} 
              onFocus={e => (e.currentTarget.style.borderColor = 'rgba(168,85,247,0.5)')} 
              onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)')} 
            />
            
            <button type="button" onClick={() => setShowTaskOptions(s => !s)} style={{ padding: '0.65rem 0.75rem', borderRadius: '10px', background: showTaskOptions ? 'rgba(168,85,247,0.2)' : 'rgba(255,255,255,0.05)', border: `1px solid ${showTaskOptions ? 'rgba(168,85,247,0.4)' : 'rgba(255,255,255,0.08)'}`, color: showTaskOptions ? '#c084fc' : 'var(--text-muted)', cursor: 'pointer', fontSize: '0.8rem', whiteSpace: 'nowrap', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '0.3rem' }} title="More options">
              <ListChecks size={14} /> {showTaskOptions ? 'Less' : 'Options'}
            </button>
            <button type="submit" disabled={!newTaskText.trim()} style={{ padding: '0.65rem 1.25rem', borderRadius: '10px', background: newTaskText.trim() ? 'linear-gradient(135deg, #a855f7, #ec4899)' : 'rgba(255,255,255,0.05)', border: 'none', color: newTaskText.trim() ? '#fff' : 'var(--text-muted)', fontSize: '0.9rem', fontWeight: 700, cursor: newTaskText.trim() ? 'pointer' : 'not-allowed', boxShadow: newTaskText.trim() ? '0 4px 15px rgba(168,85,247,0.4)' : 'none', whiteSpace: 'nowrap' }}>
              Add Task
            </button>
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
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', padding: '0.6rem 0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.05)', marginTop: '0.25rem' }}>
                  
                  {/* Priority pills */}
                  <div style={{ display: 'flex', gap: '0.3rem' }}>
                    {(['low', 'medium', 'high'] as const).map(p => (
                      <button type="button" key={p} onClick={() => setNewTaskPriority(p)} style={{ padding: '0.3rem 0.65rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', border: '1px solid', borderColor: newTaskPriority === p ? (p === 'high' ? '#ef4444' : p === 'medium' ? '#f59e0b' : '#10b981') : 'rgba(255,255,255,0.1)', background: newTaskPriority === p ? (p === 'high' ? 'rgba(239,68,68,0.15)' : p === 'medium' ? 'rgba(245,158,11,0.15)' : 'rgba(16,185,129,0.15)') : 'transparent', color: newTaskPriority === p ? (p === 'high' ? '#ef4444' : p === 'medium' ? '#f59e0b' : '#10b981') : 'var(--text-muted)', textTransform: 'capitalize', transition: 'all 0.15s' }}>
                        {p === 'high' ? '🔴' : p === 'medium' ? '🟡' : '🟢'} {p}
                      </button>
                    ))}
                  </div>

                  {/* Subject autocomplete */}
                  <div className="hide-on-mobile" style={{ position: 'relative' }}>
                    <input
                      type="text"
                      placeholder="Subject"
                      value={newTaskSubject}
                      onChange={e => { setNewTaskSubject(e.target.value); setShowSubjectSuggest(true); }}
                      onFocus={() => setShowSubjectSuggest(true)}
                      onBlur={() => setTimeout(() => setShowSubjectSuggest(false), 150)}
                      style={{ width: '80px', padding: '0.35rem 0.5rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.3)', color: '#fff', fontSize: '0.82rem', outline: 'none' }}
                      onFocusCapture={e => (e.currentTarget.style.borderColor = 'rgba(168,85,247,0.5)')} 
                    />
                    {showSubjectSuggest && allSubjects.filter(s => s.toLowerCase().includes(newTaskSubject.toLowerCase()) && s !== newTaskSubject).length > 0 && (
                      <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 50, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '8px', boxShadow: '0 8px 24px rgba(0,0,0,0.4)', minWidth: '120px', overflow: 'hidden', marginTop: '2px' }}>
                        {allSubjects.filter(s => s.toLowerCase().includes(newTaskSubject.toLowerCase()) && s !== newTaskSubject).slice(0, 6).map(s => (
                          <button type="button" key={s} onMouseDown={() => { setNewTaskSubject(s); setShowSubjectSuggest(false); }} style={{ display: 'block', width: '100%', padding: '0.4rem 0.75rem', background: 'none', border: 'none', color: 'var(--text-primary)', fontSize: '0.82rem', textAlign: 'left', cursor: 'pointer' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(99,102,241,0.1)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                            {s}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Time range */}
                  <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', overflow: 'hidden' }}>
                    <input type="time" value={newTaskStartTime} onChange={e => setNewTaskStartTime(e.target.value)} style={{ padding: '0.35rem 0.5rem', background: 'transparent', border: 'none', color: '#fff', outline: 'none', fontSize: '0.82rem', width: '80px' }} title="Start Time" />
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', padding: '0 0.2rem' }}>→</span>
                    <input type="time" value={newTaskEndTime} onChange={e => setNewTaskEndTime(e.target.value)} style={{ padding: '0.35rem 0.5rem', background: 'transparent', border: 'none', color: '#fff', outline: 'none', fontSize: '0.82rem', width: '80px' }} title="End Time" />
                  </div>

                  {/* Duration */}
                  <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '0 0.4rem', width: '60px' }}>
                    <Timer size={12} color="rgba(255,255,255,0.5)" />
                    <input type="number" value={newTaskEstimate} onChange={e => setNewTaskEstimate(e.target.value)} min="1" max="480" style={{ width: '100%', padding: '0.35rem 0 0.35rem 0.2rem', background: 'transparent', border: 'none', color: '#fff', fontSize: '0.82rem', outline: 'none' }} title="Duration (mins)" />
                  </div>

                  {/* Recurring Toggle */}
                  <button
                    type="button"
                    onClick={() => setNewTaskRecurring(!newTaskRecurring)}
                    style={{
                      padding: '0.35rem 0.6rem',
                      borderRadius: '8px',
                      border: newTaskRecurring ? '1px solid var(--accent-primary)' : '1px solid rgba(255,255,255,0.08)',
                      background: newTaskRecurring ? 'rgba(99, 102, 241, 0.15)' : 'rgba(0,0,0,0.3)',
                      color: newTaskRecurring ? 'var(--accent-primary)' : 'var(--text-muted)',
                      cursor: 'pointer',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      transition: 'all 0.2s',
                    }}
                  >
                    ↻ {newTaskRecurring ? 'Daily' : 'Once'}
                  </button>

                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.form>

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
      />
      <AnimatePresence>
        {recoveryTask && (
          <RecoveryPlannerModal task={recoveryTask} onClose={() => setRecoveryTask(null)} />
        )}
        {extensionTask && (
          <ExtensionDraftModal task={extensionTask} onClose={() => setExtensionTask(null)} />
        )}
      </AnimatePresence>
    </div>
  );
};
