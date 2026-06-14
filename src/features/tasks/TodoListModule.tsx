import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useGlobalData } from '../../contexts/GlobalDataContext';
import { motion } from 'framer-motion';
import { Plus, Check, Trash2, Calendar as CalendarIcon, AlertCircle, RefreshCw, X, ChevronDown, ChevronRight, Timer, Maximize, Minimize, GripVertical, Search, ListChecks, Play, Edit2 } from 'lucide-react';
import { toast } from 'sonner';
import { collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc, writeBatch } from 'firebase/firestore';
import { db, auth } from '../../services/firebase';
import type { TodoItem, TodoSubtask } from '../../types/index';
import { playPopSound } from '../../utils/sound';
import { usePomodoroContext } from '../../contexts/PomodoroContext';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { getLocalDateString, formatDisplayDate, formatHoursDisplay } from '../../utils/dateUtils';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EditTodoModal } from './EditTodoModal';

const TodoListItem = React.memo(({ todo, index, isExpanded, isSelected, isBulkEdit, newSubtaskText, toggleSelection, toggleTodoComplete, setExpandedTaskId, handleDeleteTask, toggleSubtask, handleDeleteSubtask, addSubtask, setNewSubtaskText, startTimer, onEdit }: any) => {
  const subtasks = todo.subtasks || [];
  const stDone = subtasks.filter((s: any) => s.isCompleted).length;

  return (
    <Draggable key={todo.id!} draggableId={todo.id!} index={index} isDragDisabled={isBulkEdit}>
      {(provided, snapshot) => (
        <div 
          ref={provided.innerRef} 
          {...provided.draggableProps} 
          style={{ 
            display: 'flex', flexDirection: 'column', gap: 0,
            opacity: snapshot.isDragging ? 0.8 : 1,
            ...provided.draggableProps.style 
          }}
        >
          <div className={`todo-item priority-${todo.priority} ${isSelected ? 'selected-item' : ''}`} style={{
            ...(isSelected ? { background: 'rgba(99, 102, 241, 0.1)', borderColor: 'var(--accent-primary)' } : {}),
            ...(todo.date && todo.date < new Date().toISOString().slice(0,10) && !todo.isCompleted ? { borderLeft: '3px solid #ef4444', background: 'rgba(239,68,68,0.03)' } : {}),
          }}>
            {!isBulkEdit && (
              <div {...provided.dragHandleProps} style={{ padding: '0.2rem', cursor: 'grab', color: 'var(--text-muted)' }}>
                <GripVertical size={14} />
              </div>
            )}
            
            {isBulkEdit ? (
              <button 
                className={`todo-checkbox ${isSelected ? 'checked' : ''}`}
                onClick={() => toggleSelection(todo.id!)}
                style={{ borderRadius: '4px' }}
              >
                {isSelected && <Check size={14} strokeWidth={3} />}
              </button>
            ) : (
              <button 
                className="todo-checkbox"
                onClick={() => toggleTodoComplete(todo)}
                aria-label="Mark complete"
                role="checkbox"
                aria-checked={false}
              ></button>
            )}
            
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', cursor: 'pointer' }} onClick={() => !isBulkEdit && setExpandedTaskId(isExpanded ? null : todo.id!)}>
              <span className="todo-text" onDoubleClick={() => onEdit(todo)} title="Double-click to edit">
                {todo.text}
              </span>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                {todo.subject && (
                  <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', borderRadius: '9999px', background: 'rgba(139,92,246,0.1)', color: '#8b5cf6', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                    {todo.subject}
                  </span>
                )}
                {todo.date && todo.date < new Date().toISOString().slice(0,10) && !todo.isCompleted && (
                  <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', borderRadius: '9999px', background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontWeight: 600 }}>
                    ⚠ Overdue
                  </span>
                )}
                {todo.isRecurring && <span style={{ fontSize: '0.7rem', color: 'var(--accent-primary)' }}>↻ Daily Habit</span>}
                {todo.timeSlot && (
                  <span style={{ fontSize: '0.7rem', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', gap: '0.2rem', padding: '0.1rem 0.4rem', background: 'rgba(99, 102, 241, 0.1)', borderRadius: '4px', fontWeight: 600 }}>
                    <CalendarIcon size={12} /> {todo.timeSlot}
                  </span>
                )}
                {todo.estimatedMinutes && (
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                    <Timer size={12} /> {formatHoursDisplay(todo.estimatedMinutes / 60)}
                  </span>
                )}
                {subtasks.length > 0 && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>☑ {stDone}/{subtasks.length} subtasks</span>}
              </div>
              {subtasks.length > 0 && (
                <div style={{ marginTop: '0.5rem', width: '100%', height: '4px', background: 'var(--bg-base)', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ width: `${(stDone / subtasks.length) * 100}%`, height: '100%', background: 'var(--accent-primary)', transition: 'width 0.3s ease' }} />
                </div>
              )}
            </div>
            
            <span className={`todo-priority ${todo.priority}`} title={todo.priority}>
            </span>

            {!isBulkEdit && (
              <>
                <button className="btn-icon" onClick={(e) => { e.stopPropagation(); setExpandedTaskId(isExpanded ? null : todo.id!); }} title="Subtasks">
                  {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>
                <button className="btn-icon" onClick={(e) => { e.stopPropagation(); onEdit(todo); }} title="Edit Task" aria-label="Edit Task">
                  <Edit2 size={15} />
                </button>
                {!todo.isCompleted && !isBulkEdit && (
                  <button className="btn-icon hide-on-mobile" onClick={(e) => { e.stopPropagation(); startTimer(todo.id!, todo.text, undefined, undefined, todo.estimatedMinutes); }} title="Start Pomodoro" aria-label="Start Pomodoro" style={{ color: 'var(--accent-primary)' }}>
                    <Timer size={14} />
                  </button>
                )}
                <button className="todo-delete" onClick={(e) => { e.stopPropagation(); handleDeleteTask(todo.id!); }} aria-label="Delete task">
                  <Trash2 size={16} />
                </button>
              </>
            )}
          </div>

          {isExpanded && !isBulkEdit && (
            <div style={{
              marginLeft: '4rem',
              padding: '0.75rem 1rem',
              background: 'rgba(0,0,0,0.15)',
              borderRadius: '0 0 var(--radius-md) var(--radius-md)',
              borderTop: 'none',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.4rem'
            }}>
              {subtasks.map((st: any) => (
                <div key={st.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.3rem 0' }}>
                  <button
                    className={`todo-checkbox ${st.isCompleted ? 'checked' : ''}`}
                    onClick={() => toggleSubtask(todo.id!, st.id)}
                    style={{ width: '18px', height: '18px', borderRadius: '4px' }}
                    role="checkbox"
                    aria-checked={st.isCompleted}
                    aria-label={`Mark subtask ${st.isCompleted ? 'incomplete' : 'complete'}`}
                  >
                    {st.isCompleted && <Check size={10} strokeWidth={3} />}
                  </button>
                  <span style={{ flex: 1, fontSize: '0.85rem', color: st.isCompleted ? 'var(--text-muted)' : 'var(--text-primary)', textDecoration: st.isCompleted ? 'line-through' : 'none' }}>
                    {st.text}
                  </span>
                  <button className="btn-icon" onClick={() => handleDeleteSubtask(todo.id!, st.id)} style={{ padding: '0.2rem' }} aria-label="Delete subtask">
                    <X size={12} />
                  </button>
                </div>
              ))}
              <form onSubmit={(e) => { e.preventDefault(); addSubtask(todo.id!, newSubtaskText); }} style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                <input
                  type="text"
                  placeholder="Add a subtask..."
                  value={newSubtaskText || ''}
                  onChange={e => setNewSubtaskText(todo.id!, e.target.value)}
                  style={{ flex: 1, background: 'transparent', border: '1px solid var(--border-subtle)', padding: '0.4rem 0.6rem', borderRadius: '6px', fontSize: '0.85rem', color: 'var(--text-primary)' }}
                />
                <button type="submit" className="btn-secondary" style={{ padding: '0.4rem 0.6rem', fontSize: '0.8rem' }} disabled={!(newSubtaskText || '').trim()}>
                  Add
                </button>
              </form>
            </div>
          )}
        </div>
      )}
    </Draggable>
  );
});
TodoListItem.displayName = 'TodoListItem';

const CompletedTodoItem = React.memo(({ todo, isSelected, isBulkEdit, toggleSelection, toggleTodoComplete, handleDeleteTask }: any) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <div className={`todo-item completed ${isSelected ? 'selected-item' : ''}`} style={isSelected ? { background: 'rgba(99, 102, 241, 0.1)', borderColor: 'var(--accent-primary)' } : {}}>
        <div style={{ padding: '0.2rem', width: '22px' }}></div>
        
        {isBulkEdit ? (
          <button 
            className={`todo-checkbox ${isSelected ? 'checked' : ''}`}
            onClick={() => toggleSelection(todo.id!)}
            style={{ borderRadius: '4px' }}
          >
            {isSelected && <Check size={14} strokeWidth={3} />}
          </button>
        ) : (
          <button 
            className="todo-checkbox checked"
            onClick={() => toggleTodoComplete(todo)}
            aria-label="Mark incomplete"
            role="checkbox"
            aria-checked={true}
          >
            <Check size={14} strokeWidth={3} />
          </button>
        )}
        
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <span className="todo-text">{todo.text}</span>
        </div>

        {!isBulkEdit && (
          <button className="todo-delete" onClick={() => handleDeleteTask(todo.id!)} aria-label="Delete task">
            <Trash2 size={16} />
          </button>
        )}
      </div>
    </div>
  );
});
CompletedTodoItem.displayName = 'CompletedTodoItem';

export const TodoListModule = () => {
  const { todos: globalTodos, isLoading } = useGlobalData();
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

  const { startTimer, state: pomodoroState, pauseTimer, resumeTimer, resetTimer, dismissTimer, formatTime, toggleFocusMode } = usePomodoroContext();
  const user = auth.currentUser;

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

    const incompleteCount = todos.filter(t => !t.isCompleted).length;

    const newTodo: any = {
      userId: user.uid,
      text: newTaskText.trim(),
      date: selectedDate,
      isCompleted: false,
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
    const newStatus = !todo.isCompleted;
    if (newStatus) {
      playPopSound();
      import('../../utils/notifications').then(({ sendSystemNotification }) => {
        sendSystemNotification('Task Completed! 🎉', { body: `You finished: "${todo.text}". Keep it up!` }, true);
      });
    }

    try {
      await updateDoc(doc(db, 'todos', todo.id), { isCompleted: newStatus });
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

  const addSubtask = useCallback(async (todoId: string, text: string) => {
    const trimmedText = text?.trim();
    if (!trimmedText) return;
    
    const todo = todos.find(t => t.id === todoId);
    if (!todo) return;

    const newSt: TodoSubtask = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
      text: trimmedText,
      isCompleted: false
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
    const todo = todos.find(t => t.id === todoId);
    if (!todo) return;
    
    const updated = (todo.subtasks || []).map((st: any) =>
      st.id === subtaskId ? { ...st, isCompleted: !st.isCompleted } : st
    );
    
    const wasCompleted = (todo.subtasks || []).find((s: any) => s.id === subtaskId)?.isCompleted;
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
    const todo = todos.find(t => t.id === todoId);
    if (!todo) return;
    const updated = (todo.subtasks || []).filter((st: any) => st.id !== subtaskId);
    try {
      await updateDoc(doc(db, 'todos', todoId), { subtasks: updated });
      setDeleteConfirm({ isOpen: false, type: 'task', id: '' });
    } catch (err) { console.error(err); }
  };

  const clearCompleted = async () => {
    const completed = todos.filter(t => t.isCompleted);
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
      if (a.isCompleted !== b.isCompleted) return a.isCompleted ? 1 : -1;
      return (a.order ?? a.createdAt) - (b.order ?? b.createdAt);
    });
    const incomplete = sorted.filter(t => !t.isCompleted);
    
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

  const handleUpdateNewSubtaskText = useCallback((todoId: string, text: string) => {
    setNewSubtaskTexts(prev => ({ ...prev, [todoId]: text }));
  }, []);

  const filteredTodos = todos.filter(t => {
    if (searchTerm && !t.text.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    if (filter === 'high' && t.priority !== 'high') return false;
    if (filter === 'recurring' && !t.isRecurring) return false;
    return true;
  });

  const sortedTodos = [...filteredTodos].sort((a, b) => {
    if (a.isCompleted !== b.isCompleted) return a.isCompleted ? 1 : -1;
    return (a.order ?? a.createdAt) - (b.order ?? b.createdAt);
  });

  const incompleteTodos = sortedTodos.filter(t => !t.isCompleted);
  const completedTodos = sortedTodos.filter(t => t.isCompleted);

  const [y, m, d] = selectedDate.split('-').map(Number);
  const selectedDateObj = new Date(y, m - 1, d);
  const startOfWeek = new Date(selectedDateObj);
  startOfWeek.setDate(selectedDateObj.getDate() - selectedDateObj.getDay());

  const weekDates = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    return d;
  });

  const completedCount = todos.filter(t => t.isCompleted).length;
  const totalEstimate = todos.filter(t => !t.isCompleted).reduce((acc, t) => acc + (t.estimatedMinutes || 0), 0);

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
              </button>
            );
          })}
        </div>
        <div className="calendar-picker hide-on-mobile">
           <label>Jump to date:</label>
           <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} style={{ marginTop: '0.5rem' }} />
        </div>
      </div>

      <div className="todo-content liquid-panel" style={{ padding: '1.5rem', marginTop: '1rem', border: 'none' }}>
        <div style={{ marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'nowrap', gap: '0.5rem' }}>
            <h1 style={{ margin: 0, fontSize: '1.5rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {selectedDate === todayStr ? "Today's Tasks" : `Tasks for ${formatDisplayDate(selectedDate)}`}
            </h1>
            
            <button 
              className={`btn-secondary ${isBulkEdit ? 'active' : ''}`} 
              onClick={() => { setIsBulkEdit(!isBulkEdit); setSelectedTaskIds(new Set()); }}
              style={{ background: isBulkEdit ? 'var(--accent-primary)' : 'rgba(0,0,0,0.3)', color: isBulkEdit ? 'white' : 'var(--text-primary)', border: '1px solid rgba(255,255,255,0.1)', padding: '0.35rem 0.6rem', borderRadius: '8px', fontSize: '0.8rem', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '0.25rem' }}
            >
              <ListChecks size={14} /> {isBulkEdit ? 'Cancel' : 'Bulk Edit'}
            </button>
          </div>
          
          <p className="subtitle" style={{ display: 'flex', gap: '1rem', margin: 0, fontSize: '0.85rem' }}>
            <span>{completedCount}/{todos.length} done</span>
            {totalEstimate > 0 && <span>• ~{formatHoursDisplay(totalEstimate / 60)} estimated</span>}
          </p>
        </div>

        {/* Search & Filters */}
        <div className="hide-on-mobile" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1.5rem', background: 'var(--bg-surface)', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '0 0.75rem', flex: '1 1 200px', minWidth: 0 }}>
            <Search size={16} color="var(--text-muted)" />
            <input 
              type="text" 
              placeholder="Search tasks..." 
              value={searchTerm} 
              onChange={e => setSearchTerm(e.target.value)} 
              style={{ border: 'none', background: 'transparent', padding: '0.5rem', width: '100%', color: 'var(--text-primary)', outline: 'none' }}
            />
          </div>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            <button className={`btn-secondary ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')} style={{ padding: '0.35rem 0.6rem', fontSize: '0.78rem' }}>All</button>
            <button className={`btn-secondary ${filter === 'high' ? 'active' : ''}`} onClick={() => setFilter(filter === 'high' ? 'all' : 'high')} style={{ padding: '0.35rem 0.6rem', fontSize: '0.78rem' }}>🔴 High</button>
            <button className={`btn-secondary ${filter === 'recurring' ? 'active' : ''}`} onClick={() => setFilter(filter === 'recurring' ? 'all' : 'recurring')} style={{ padding: '0.35rem 0.6rem', fontSize: '0.78rem' }}>↻ Daily</button>
          </div>
        </div>

        <form onSubmit={handleAddTask} className="add-todo-form" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '2rem', alignItems: 'center' }}>
          <input 
            type="text" 
            placeholder="Add a new task..." 
            value={newTaskText}
            onChange={e => setNewTaskText(e.target.value)}
            className="todo-input"
            style={{ flex: '1 1 100%', minWidth: 0 }}
          />
          <select 
            value={newTaskPriority} 
            onChange={e => setNewTaskPriority(e.target.value as TodoItem['priority'])}
            className="priority-select"
            style={{ fontSize: '0.82rem', padding: '0.4rem 0.5rem', flex: '0 0 auto' }}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>

          <input
            type="text"
            placeholder="Subject"
            value={newTaskSubject}
            onChange={e => setNewTaskSubject(e.target.value)}
            className="hide-on-mobile"
            style={{ width: '70px', padding: '0.4rem 0.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', background: 'var(--bg-base)', color: 'var(--text-primary)', fontSize: '0.82rem', flex: '0 0 auto' }}
          />
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flex: '0 0 auto' }}>
            <input
              type="time"
              value={newTaskStartTime}
              onChange={e => setNewTaskStartTime(e.target.value)}
              style={{ padding: '0.4rem 0.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', background: 'var(--bg-base)', color: 'var(--text-primary)', fontSize: '0.82rem' }}
              title="Start Time (Optional)"
            />
            <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>to</span>
            <input
              type="time"
              value={newTaskEndTime}
              onChange={e => setNewTaskEndTime(e.target.value)}
              style={{ padding: '0.4rem 0.5rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', background: 'var(--bg-base)', color: 'var(--text-primary)', fontSize: '0.82rem' }}
              title="End Time (Optional)"
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-base)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)', padding: '0 0.4rem', flex: '0 0 auto' }}>
            <Timer size={13} color="var(--text-muted)" />
            <input
              type="number"
              placeholder=""
              value={newTaskEstimate}
              onChange={e => setNewTaskEstimate(e.target.value)}
              min="1"
              max="480"
              style={{ width: '30px', background: 'transparent', border: 'none', padding: '0.4rem 0.2rem', color: 'var(--text-primary)', outline: 'none', fontSize: '0.82rem' }}
              title="Duration (mins)"
            />
          </div>

          <button
            type="button"
            onClick={() => setNewTaskRecurring(!newTaskRecurring)}
            style={{
              padding: '0.4rem 0.6rem',
              borderRadius: 'var(--radius-sm)',
              border: newTaskRecurring ? '1px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
              background: newTaskRecurring ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
              color: newTaskRecurring ? 'var(--accent-primary)' : 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: '0.82rem',
              fontWeight: 500,
              transition: 'all 0.2s',
              fontFamily: 'var(--font-sans)',
              whiteSpace: 'nowrap',
              flex: '0 0 auto'
            }}
          >
            ↻ {newTaskRecurring ? 'Daily' : 'Once'}
          </button>

          <div style={{ flex: '1 1 100%', display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
            <button type="submit" className="btn-primary" disabled={!newTaskText.trim()} style={{ padding: '0.5rem 1rem', fontSize: '0.85rem', whiteSpace: 'nowrap', width: '100%', justifyContent: 'center' }}>
              <Plus size={15} /> Add Task
            </button>
          </div>
        </form>

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
                      return (
                        <TodoListItem 
                          key={todo.id!}
                          todo={todo}
                          index={index}
                          isExpanded={expandedTaskId === todo.id}
                          isSelected={selectedTaskIds.has(todo.id!)}
                          isBulkEdit={isBulkEdit}
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
                            <button onClick={clearCompleted} style={{ fontSize: '0.8rem', color: '#ef4444', background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
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
      <EditTodoModal 
        isOpen={!!editingTask} 
        onClose={() => setEditingTask(null)} 
        todo={editingTask} 
      />
    </div>
  );
};
