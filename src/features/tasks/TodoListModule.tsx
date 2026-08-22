import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useGlobalData } from '../../contexts/GlobalDataContext';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Plus, 
  Check, 
  Trash2, 
  Calendar as CalendarIcon, 
  X, 
  ChevronDown, 
  ChevronRight, 
  Timer, 
  Search, 
  ListChecks, 
  Edit2, 
  Inbox, 
  Clock, 
  MoreHorizontal, 
  Filter, 
  Copy, 
  Play,
  Layers,
  LayoutGrid,
  Columns,
  List as ListIcon,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { collection, addDoc, updateDoc, deleteDoc, doc, writeBatch } from 'firebase/firestore';
import { db, auth } from '../../services/firebase';
import type { TodoItem, TodoSubtask, TaskTemplate } from '../../types';
import { playPopSound } from '../../utils/sound';
import { usePomodoroContext } from '../../contexts/PomodoroContext';
import { DragDropContext, Droppable } from '@hello-pangea/dnd';
import { awardXP } from '../../services/xpSystem';
import { getLocalDateString, formatDisplayDate } from '../../utils/dateUtils';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EditTodoModal } from './EditTodoModal';
import { TodoCard, CompletedTodoItem } from './TodoCard';
import { TimelineView } from './TimelineView';
import { KanbanView } from './KanbanView';
import { MatrixView } from './MatrixView';
import { TaskDateStrip } from './TaskDateStrip';
import { ProgressRing } from './ProgressRing';
import { NewTaskModal } from './NewTaskModal';
import { TaskTimeLogSheet } from './TaskTimeLogSheet';
import { TimeSpentSheet } from './TimeSpentSheet';
import { TaskTemplatesSheet } from './TaskTemplatesSheet';
import { BulkRescheduleSheet } from './BulkRescheduleSheet';
import { InboxOverdueDrawer } from './InboxOverdueDrawer';

export const TodoListModule: React.FC = () => {
  const { tasks: globalTodos, habits: rawHabits, habitLogs: rawHabitLogs, isLoading } = useGlobalData();
  const user = auth.currentUser;
  const todayStr = useMemo(() => getLocalDateString(new Date()), []);
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);

  // PERFECT_DAY: fires once per day when all today's tasks + all habits are done
  const checkPerfectDayAfterTask = useCallback(async (justCompletedId: string) => {
    const key = `zentrack_perfect_day_${todayStr}`;
    if (localStorage.getItem(key)) return;
    // All tasks for selectedDate must be done (include the one just optimistically completed)
    const todayTasks = globalTodos.filter(t => t.date === todayStr);
    const allTasksDone = todayTasks.every(t => t.status === 'completed' || t.id === justCompletedId);
    if (!allTasksDone || todayTasks.length === 0) return;
    // All positive non-archived habits must have a log for today
    const positiveHabits = ((rawHabits || []) as any[]).filter((h: any) => h.type !== 'negative' && !h.archived);
    if (positiveHabits.length === 0) return;
    const todayHabitLogs = ((rawHabitLogs || []) as any[]).filter((l: any) => l.date === todayStr);
    const allHabitsDone = positiveHabits.every((h: any) => {
      const log = todayHabitLogs.find((l: any) => l.habitId === h.id);
      if (!log) return false;
      if (h.targetCount && h.targetCount > 0) return (log.count || 1) >= h.targetCount;
      return true;
    });
    if (!allHabitsDone) return;
    localStorage.setItem(key, '1');
    const res = await awardXP('PERFECT_DAY');
    toast.success(`★ PERFECT DAY! All tasks + habits done! +${res.added} XP 🏆`);
    if (res.leveledUp) toast.success(`🏆 LEVEL UP! You reached ${res.newTitle} (Level ${res.newLevel})!`);
  }, [globalTodos, rawHabits, rawHabitLogs, todayStr]);

  // Filter tasks for selected date
  const todos = useMemo(() => {
    return globalTodos.filter(t => t.date === selectedDate);
  }, [globalTodos, selectedDate]);

  const inboxTasks = useMemo(() => 
    globalTodos.filter(t => !t.date && t.status !== 'completed').sort((a, b) => (a.order || 0) - (b.order || 0)),
    [globalTodos]
  );
  
  const overdueTasks = useMemo(() => 
    globalTodos.filter(t => t.date && t.date < todayStr && t.status !== 'completed').sort((a, b) => (a.order || 0) - (b.order || 0)),
    [globalTodos, todayStr]
  );

  // Active View Mode: 'list' | 'timeline' | 'kanban' | 'matrix'
  const [viewMode, setViewMode] = useState<'list' | 'timeline' | 'kanban' | 'matrix'>('list');
  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);

  // Modals & Sheets State
  const [isNewTaskModalOpen, setIsNewTaskModalOpen] = useState(false);
  const [isInboxDrawerOpen, setIsInboxDrawerOpen] = useState(false);
  const [isTimeSpentSheetOpen, setIsTimeSpentSheetOpen] = useState(false);
  const [isTemplatesSheetOpen, setIsTemplatesSheetOpen] = useState(false);
  const [isBulkRescheduleOpen, setIsBulkRescheduleOpen] = useState(false);

  // Task Completion Time Log prompt state
  const [justCompletedTask, setJustCompletedTask] = useState<TodoItem | null>(null);

  // List View Specific State
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [newSubtaskTexts, setNewSubtaskTexts] = useState<Record<string, string>>({});
  const [editingTask, setEditingTask] = useState<TodoItem | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'default' | 'priority'>('default');

  // Bulk Edit Mode
  const [isBulkEdit, setIsBulkEdit] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());

  // Confirm Delete Dialog
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    type: 'task' | 'subtask' | 'completed';
    id: string;
    parentId?: string;
  }>({ isOpen: false, type: 'task', id: '' });

  const { startTimer } = usePomodoroContext();

  // Sort & Filter todos for list view
  const pendingTodos = useMemo(() => {
    let list = todos.filter(t => t.status !== 'completed');
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter(t => (t.title || t.text || '').toLowerCase().includes(q) || (t.tags || []).some(tag => tag.toLowerCase().includes(q)));
    }
    if (sortBy === 'priority') {
      const pOrder: Record<string, number> = { high: 1, P1: 1, medium: 2, P2: 2, low: 3, P3: 3 };
      list.sort((a, b) => (pOrder[a.priority || 'medium'] || 2) - (pOrder[b.priority || 'medium'] || 2));
    } else {
      list.sort((a, b) => (a.order || 0) - (b.order || 0));
    }
    return list;
  }, [todos, searchTerm, sortBy]);

  const completedTodos = useMemo(() => {
    return todos.filter(t => t.status === 'completed');
  }, [todos]);

  // Handle Mark Complete & Open Time Log Sheet
  const toggleTodoComplete = useCallback(async (todo: TodoItem) => {
    if (!todo.id) return;
    const newStatus = todo.status !== 'completed';
    if (newStatus) {
      playPopSound();
      import('../../utils/notifications').then(({ sendSystemNotification }) => {
        sendSystemNotification('Task Completed! 🏁', { body: `You finished: "${todo.title || todo.text}". Keep it up!` }, true);
      });
      awardXP('TASK_COMPLETE').then(async (res) => {
        if (res.bonus) {
          toast.success(`Task completed! +${res.added} XP ⚡ Dopamine Bonus Triggered! 🏁`);
        } else {
          toast.success(`Task completed! +${res.added} XP 🏁`);
        }
        if (res.leveledUp) {
          toast.success(`🏆 LEVEL UP! You reached ${res.newTitle} (Level ${res.newLevel})!`);
        }
        // PERFECT_DAY check
        await checkPerfectDayAfterTask(todo.id!);
      });
      // Trigger time log sheet
      setJustCompletedTask(todo);
    }

    try {
      await updateDoc(doc(db, 'todos', todo.id), {
        status: newStatus ? 'completed' : 'pending',
        completedAt: newStatus ? Date.now() : null,
      });
    } catch (error) {
      console.error('Error updating task status:', error);
      toast.error('Failed to update task status');
    }
  }, []);

  const handleSaveTimeLog = useCallback(async (taskId: string, actualMinutes: number, actualStartTime: string) => {
    try {
      await updateDoc(doc(db, 'todos', taskId), {
        actualMinutes,
        actualStartTime,
      });
      toast.success(`Logged ${actualMinutes}m for completed task`);
    } catch (e) {
      console.error('Failed to log actual time:', e);
    }
  }, []);

  // Handle Create Task from NewTaskModal
  const handleCreateTask = async (taskData: Omit<TodoItem, 'id' | 'userId'>) => {
    if (!user) return;
    const count = todos.filter(t => t.status !== 'completed').length;
    const newDoc: any = {
      userId: user.uid,
      title: taskData.title,
      text: taskData.title,
      date: taskData.date || selectedDate,
      status: 'pending',
      priority: taskData.priority || 'medium',
      timeSlot: taskData.timeSlot || null,
      subtasks: taskData.subtasks || [],
      tags: taskData.tags || [],
      isRecurring: !!taskData.isRecurring,
      recurrenceRule: taskData.recurrenceRule || null,
      createdAt: Date.now(),
      order: count,
    };

    await addDoc(collection(db, 'todos'), newDoc);
    toast.success('Task created!');
  };

  // Handle Apply Template
  const handleApplyTemplate = async (template: TaskTemplate) => {
    if (!user) return;
    const newDoc: any = {
      userId: user.uid,
      title: template.title,
      text: template.title,
      date: selectedDate,
      status: 'pending',
      priority: template.priority || 'medium',
      timeSlot: template.timeSlot || null,
      subtasks: template.subtasks || [],
      isRecurring: !!template.isRecurring,
      createdAt: Date.now(),
      order: Date.now(),
    };
    await addDoc(collection(db, 'todos'), newDoc);
    toast.success(`Applied template: "${template.title}"`);
  };

  // Handle Subtask Actions
  const handleToggleSubtask = useCallback(async (taskId: string, subtaskId: string) => {
    const task = globalTodos.find(t => t.id === taskId);
    if (!task || !task.subtasks) return;

    const updatedSubtasks = task.subtasks.map(st => {
      if (st.id === subtaskId) {
        const isDone = st.completed || st.status === 'completed';
        return { ...st, completed: !isDone, status: !isDone ? ('completed' as const) : ('pending' as const) };
      }
      return st;
    });

    // Auto-complete parent if all subtasks are done
    const allDone = updatedSubtasks.length > 0 && updatedSubtasks.every(s => s.completed || s.status === 'completed');

    try {
      await updateDoc(doc(db, 'todos', taskId), {
        subtasks: updatedSubtasks,
        ...(allDone && task.status !== 'completed' ? { status: 'completed', completedAt: Date.now() } : {}),
      });
      if (allDone && task.status !== 'completed') {
        playPopSound();
        setJustCompletedTask(task);
        awardXP('TASK_COMPLETE').then((res) => {
          if (res.bonus) {
            toast.success(`All subtasks finished! +${res.added} XP ⚡ Dopamine Bonus! 🎉`);
          } else {
            toast.success(`All subtasks finished! +${res.added} XP 🎉`);
          }
          if (res.leveledUp) {
            toast.success(`🏆 LEVEL UP! You reached ${res.newTitle} (Level ${res.newLevel})!`);
          }
        });
      }
    } catch (e) {
      console.error('Failed to toggle subtask:', e);
    }
  }, [globalTodos]);

  const handleAddSubtask = useCallback(async (taskId: string, subtaskTitle: string) => {
    const task = globalTodos.find(t => t.id === taskId);
    if (!task) return;
    const currentSubtasks = task.subtasks || [];
    const newSubtask: TodoSubtask = {
      id: Date.now().toString(),
      title: subtaskTitle.trim(),
      completed: false,
      status: 'pending',
    };

    try {
      await updateDoc(doc(db, 'todos', taskId), {
        subtasks: [...currentSubtasks, newSubtask],
      });
    } catch (e) {
      console.error('Failed to add subtask:', e);
    }
  }, [globalTodos]);

  const handleDeleteSubtask = useCallback(async (taskId: string, subtaskId: string) => {
    const task = globalTodos.find(t => t.id === taskId);
    if (!task || !task.subtasks) return;

    try {
      await updateDoc(doc(db, 'todos', taskId), {
        subtasks: task.subtasks.filter(s => s.id !== subtaskId),
      });
    } catch (e) {
      console.error('Failed to delete subtask:', e);
    }
  }, [globalTodos]);

  // Bulk Operations
  const handleBulkReschedule = async (newDate: string, newTimeSlot?: string) => {
    if (selectedTaskIds.size === 0) return;
    const batch = writeBatch(db);
    selectedTaskIds.forEach(id => {
      const ref = doc(db, 'todos', id);
      const updates: any = { date: newDate };
      if (newTimeSlot) updates.timeSlot = newTimeSlot;
      batch.update(ref, updates);
    });

    await batch.commit();
    setSelectedTaskIds(new Set());
    setIsBulkEdit(false);
    toast.success(`Rescheduled ${selectedTaskIds.size} tasks to ${newDate}`);
  };

  const handleBulkComplete = async () => {
    if (selectedTaskIds.size === 0) return;
    const count = selectedTaskIds.size;
    const batch = writeBatch(db);
    selectedTaskIds.forEach(id => {
      const ref = doc(db, 'todos', id);
      batch.update(ref, { status: 'completed', completedAt: Date.now() });
    });
    await batch.commit();
    setSelectedTaskIds(new Set());
    setIsBulkEdit(false);
    awardXP('TASK_COMPLETE').then((res) => {
      toast.success(`Completed ${count} tasks! +${res.added} XP 🚀`);
      if (res.leveledUp) {
        toast.success(`🏆 LEVEL UP! You reached ${res.newTitle} (Level ${res.newLevel})!`);
      }
    });
  };

  const handleBulkDelete = async () => {
    if (selectedTaskIds.size === 0) return;
    const batch = writeBatch(db);
    selectedTaskIds.forEach(id => {
      const ref = doc(db, 'todos', id);
      batch.delete(ref);
    });
    await batch.commit();
    setSelectedTaskIds(new Set());
    setIsBulkEdit(false);
    toast.success(`Deleted ${selectedTaskIds.size} tasks.`);
  };

  // Drag & Drop Reordering
  const handleDragEnd = async (result: any) => {
    if (!result.destination) return;
    const reordered = Array.from(pendingTodos);
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);

    const batch = writeBatch(db);
    reordered.forEach((task, index) => {
      if (task.id) {
        batch.update(doc(db, 'todos', task.id), { order: index });
      }
    });
    try {
      await batch.commit();
    } catch (e) {
      console.error('Failed to commit drag order:', e);
    }
  };

  const handleDeleteTask = (id: string) => {
    setDeleteConfirm({ isOpen: true, type: 'task', id });
  };

  const confirmDelete = async () => {
    if (deleteConfirm.id) {
      await deleteDoc(doc(db, 'todos', deleteConfirm.id));
      toast.success('Task deleted');
    }
    setDeleteConfirm({ isOpen: false, type: 'task', id: '' });
  };

  const clearAllCompleted = async () => {
    const batch = writeBatch(db);
    completedTodos.forEach(t => {
      if (t.id) batch.delete(doc(db, 'todos', t.id));
    });
    await batch.commit();
    toast.success('Cleared completed tasks');
  };

  return (
    <div className="tasks-module-root">
      {/* ── TOP HEADER ── */}
      <div className="tasks-header-bar">
        <div className="tasks-header-left">
          <h1 className="tasks-hero-title">
            {isBulkEdit ? `${selectedTaskIds.size} Selected` : 'Tasks'}
          </h1>
          <span className="tasks-date-subtitle">
            {formatDisplayDate(selectedDate)}
          </span>
        </div>

        <div className="tasks-header-actions">
          {/* Inbox / Overdue Button */}
          <button
            type="button"
            className="tasks-action-pill-btn"
            onClick={() => setIsInboxDrawerOpen(true)}
            title="Inbox & Overdue"
          >
            <Inbox size={16} />
            <span>Inbox</span>
            {overdueTasks.length > 0 ? (
              <span className="pill-badge red">{overdueTasks.length}</span>
            ) : inboxTasks.length > 0 ? (
              <span className="pill-badge purple">{inboxTasks.length}</span>
            ) : null}
          </button>

          {/* Time Spent Analytics Button */}
          <button
            type="button"
            className="tasks-action-pill-btn"
            onClick={() => setIsTimeSpentSheetOpen(true)}
            title="Time Spent Analytics"
          >
            <Timer size={16} />
            <span>Analytics</span>
          </button>

          {/* View Mode Switcher Dropdown */}
          <div className="view-switcher-relative">
            <button
              type="button"
              className="tasks-action-pill-btn view-switch-btn"
              onClick={() => setIsViewMenuOpen(v => !v)}
            >
              {viewMode === 'list' && <ListIcon size={15} />}
              {viewMode === 'timeline' && <Clock size={15} />}
              {viewMode === 'kanban' && <Columns size={15} />}
              {viewMode === 'matrix' && <LayoutGrid size={15} />}
              <span className="view-mode-label">{viewMode.toUpperCase()}</span>
              <ChevronDown size={14} />
            </button>

            {isViewMenuOpen && (
              <div className="view-dropdown-menu" onClick={() => setIsViewMenuOpen(false)}>
                <button
                  type="button"
                  className={`view-menu-item ${viewMode === 'list' ? 'active' : ''}`}
                  onClick={() => setViewMode('list')}
                >
                  <ListIcon size={15} />
                  <span>List View</span>
                </button>
                <button
                  type="button"
                  className={`view-menu-item ${viewMode === 'timeline' ? 'active' : ''}`}
                  onClick={() => setViewMode('timeline')}
                >
                  <Clock size={15} />
                  <span>24h Timeline</span>
                </button>
                <button
                  type="button"
                  className={`view-menu-item ${viewMode === 'kanban' ? 'active' : ''}`}
                  onClick={() => setViewMode('kanban')}
                >
                  <Columns size={15} />
                  <span>Kanban Board</span>
                </button>
                <button
                  type="button"
                  className={`view-menu-item ${viewMode === 'matrix' ? 'active' : ''}`}
                  onClick={() => setViewMode('matrix')}
                >
                  <LayoutGrid size={15} />
                  <span>Eisenhower Matrix</span>
                </button>
              </div>
            )}
          </div>

          {/* + Add Task Button */}
          <button
            type="button"
            className="tasks-primary-add-btn"
            onClick={() => setIsNewTaskModalOpen(true)}
          >
            <Plus size={16} strokeWidth={2.5} />
            <span>Add Task</span>
          </button>

          {/* Overflow Menu */}
          <div className="view-switcher-relative">
            <button
              type="button"
              className="tasks-icon-overflow-btn"
              onClick={() => setIsMoreMenuOpen(v => !v)}
              title="More options"
            >
              <MoreHorizontal size={18} />
            </button>

            {isMoreMenuOpen && (
              <div className="view-dropdown-menu more-menu" onClick={() => setIsMoreMenuOpen(false)}>
                <button
                  type="button"
                  className="view-menu-item"
                  onClick={() => setSortBy(s => s === 'priority' ? 'default' : 'priority')}
                >
                  <Filter size={15} />
                  <span>Sort by: {sortBy === 'priority' ? 'Default Order' : 'Priority'}</span>
                </button>
                <button
                  type="button"
                  className="view-menu-item"
                  onClick={() => setIsTemplatesSheetOpen(true)}
                >
                  <Copy size={15} />
                  <span>Task Templates</span>
                </button>
                <button
                  type="button"
                  className="view-menu-item"
                  onClick={() => {
                    setIsBulkEdit(!isBulkEdit);
                    setSelectedTaskIds(new Set());
                  }}
                >
                  <ListChecks size={15} />
                  <span>{isBulkEdit ? 'Exit Select Mode' : 'Select Multiple'}</span>
                </button>
                {completedTodos.length > 0 && (
                  <button
                    type="button"
                    className="view-menu-item danger-item"
                    onClick={clearAllCompleted}
                  >
                    <Trash2 size={15} />
                    <span>Clear Completed ({completedTodos.length})</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── TOP CONTROLS ROW: DATE STRIP & PROGRESS RING ── */}
      <div className="tasks-controls-row">
        <TaskDateStrip
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          tasks={globalTodos}
        />

        <ProgressRing
          tasks={globalTodos}
          selectedDate={selectedDate}
        />
      </div>

      {/* ── BULK ACTION BAR (Floating) ── */}
      <AnimatePresence>
        {isBulkEdit && selectedTaskIds.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="bulk-action-floating-bar"
          >
            <span className="bulk-count-label">
              {selectedTaskIds.size} task{selectedTaskIds.size === 1 ? '' : 's'} selected
            </span>
            <div className="bulk-btns-cluster">
              <button
                type="button"
                className="bulk-action-btn complete-btn"
                onClick={handleBulkComplete}
              >
                <CheckCircle2 size={15} />
                <span>Complete</span>
              </button>
              <button
                type="button"
                className="bulk-action-btn reschedule-btn"
                onClick={() => setIsBulkRescheduleOpen(true)}
              >
                <CalendarIcon size={15} />
                <span>Reschedule</span>
              </button>
              <button
                type="button"
                className="bulk-action-btn delete-btn"
                onClick={handleBulkDelete}
              >
                <Trash2 size={15} />
                <span>Delete</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── VIEWPORT CONTAINER ── */}
      <div className="tasks-viewport-container">
        {viewMode === 'list' && (
          <div className="tasks-list-view">
            {/* Search filter if active */}
            {todos.length > 4 && (
              <div className="tasks-search-wrap">
                <Search size={14} color="#8e8e93" />
                <input
                  type="text"
                  placeholder="Search tasks or #tags..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="tasks-search-input"
                />
                {searchTerm && (
                  <button type="button" onClick={() => setSearchTerm('')} className="search-clear-btn">
                    <X size={13} />
                  </button>
                )}
              </div>
            )}

            {/* Pending Tasks DragDrop List */}
            {pendingTodos.length === 0 && completedTodos.length === 0 ? (
              <div className="tasks-empty-placeholder">
                <CheckCircle2 size={48} color="rgba(165,153,255,0.3)" />
                <h3>No tasks for this day</h3>
                <p>Plan your day by adding a task or applying a routine template.</p>
                <button
                  type="button"
                  className="empty-create-btn"
                  onClick={() => setIsNewTaskModalOpen(true)}
                >
                  <Plus size={16} /> Create Task
                </button>
              </div>
            ) : (
              <DragDropContext onDragEnd={handleDragEnd}>
                <Droppable droppableId="pending-tasks-list">
                  {(provided) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className="tasks-cards-stack"
                    >
                      {pendingTodos.map((todo, index) => (
                        <TodoCard
                          key={todo.id}
                          todo={todo}
                          index={index}
                          isExpanded={expandedTaskId === todo.id}
                          isSelected={selectedTaskIds.has(todo.id!)}
                          isBulkEdit={isBulkEdit}
                          newSubtaskText={newSubtaskTexts[todo.id!] || ''}
                          isBlocked={false}
                          toggleSelection={id => {
                            setSelectedTaskIds(prev => {
                              const s = new Set(prev);
                              if (s.has(id)) s.delete(id); else s.add(id);
                              return s;
                            });
                          }}
                          toggleTodoComplete={toggleTodoComplete}
                          setExpandedTaskId={setExpandedTaskId}
                          handleDeleteTask={handleDeleteTask}
                          toggleSubtask={handleToggleSubtask}
                          handleDeleteSubtask={handleDeleteSubtask}
                          addSubtask={handleAddSubtask}
                          setNewSubtaskText={(id, txt) => setNewSubtaskTexts(prev => ({ ...prev, [id]: txt }))}
                          startTimer={(id, title, x, y, est) => startTimer(id, title, x, y, est)}
                          onEdit={setEditingTask}
                        />
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>
            )}

            {/* Completed Tasks Section */}
            {completedTodos.length > 0 && (
              <div className="completed-tasks-section">
                <div className="completed-section-header">
                  <span>COMPLETED ({completedTodos.length})</span>
                  <button
                    type="button"
                    className="completed-clear-link"
                    onClick={clearAllCompleted}
                  >
                    Clear All
                  </button>
                </div>
                <div className="completed-tasks-list">
                  {completedTodos.map(todo => (
                    <CompletedTodoItem
                      key={todo.id}
                      todo={todo}
                      toggleTodoComplete={toggleTodoComplete}
                      handleDeleteTask={handleDeleteTask}
                      onEdit={setEditingTask}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {viewMode === 'timeline' && (
          <TimelineView
            tasks={globalTodos}
            selectedDate={selectedDate}
            onTaskClick={setEditingTask}
          />
        )}

        {viewMode === 'kanban' && (
          <KanbanView
            tasks={globalTodos}
            onTaskClick={setEditingTask}
          />
        )}

        {viewMode === 'matrix' && (
          <MatrixView
            tasks={globalTodos}
            onTaskClick={setEditingTask}
          />
        )}
      </div>

      {/* ── MODALS & SHEETS ── */}
      {/* 1. New Task Modal */}
      <NewTaskModal
        isOpen={isNewTaskModalOpen}
        onClose={() => setIsNewTaskModalOpen(false)}
        initialDate={selectedDate}
        onSave={handleCreateTask}
      />

      {/* 2. Edit Task Modal */}
      {editingTask && (
        <EditTodoModal
          isOpen={!!editingTask}
          onClose={() => setEditingTask(null)}
          todo={editingTask}
          onSave={async (updated) => {
            if (updated.id) {
              await updateDoc(doc(db, 'todos', updated.id), { ...updated });
              setEditingTask(null);
              toast.success('Task updated');
            }
          }}
        />
      )}

      {/* 3. Task Completion Time Log Sheet */}
      <TaskTimeLogSheet
        isOpen={!!justCompletedTask}
        task={justCompletedTask}
        onClose={() => setJustCompletedTask(null)}
        onSave={handleSaveTimeLog}
      />

      {/* 4. Time Spent Analytics Sheet */}
      <TimeSpentSheet
        isOpen={isTimeSpentSheetOpen}
        onClose={() => setIsTimeSpentSheetOpen(false)}
        tasks={globalTodos}
        selectedDate={selectedDate}
      />

      {/* 5. Task Templates Sheet */}
      <TaskTemplatesSheet
        isOpen={isTemplatesSheetOpen}
        onClose={() => setIsTemplatesSheetOpen(false)}
        onApplyTemplate={handleApplyTemplate}
      />

      {/* 6. Bulk Reschedule Sheet */}
      <BulkRescheduleSheet
        isOpen={isBulkRescheduleOpen}
        onClose={() => setIsBulkRescheduleOpen(false)}
        selectedTaskIds={selectedTaskIds}
        allTasks={globalTodos}
        onConfirm={handleBulkReschedule}
      />

      {/* 7. Inbox & Overdue Drawer */}
      <InboxOverdueDrawer
        isOpen={isInboxDrawerOpen}
        onClose={() => setIsInboxDrawerOpen(false)}
        inboxTasks={inboxTasks}
        overdueTasks={overdueTasks}
        onTaskClick={setEditingTask}
        onToggleComplete={toggleTodoComplete}
        onScheduleToday={async (task) => {
          if (task.id) {
            await updateDoc(doc(db, 'todos', task.id), { date: todayStr, status: 'pending' });
            toast.success(`Moved "${task.title || task.text}" to Today`);
          }
        }}
        onClearOverdue={async () => {
          const batch = writeBatch(db);
          overdueTasks.forEach(t => {
            if (t.id) batch.update(doc(db, 'todos', t.id), { date: todayStr, status: 'pending' });
          });
          await batch.commit();
          toast.success(`Rescheduled ${overdueTasks.length} overdue tasks to Today!`);
        }}
      />

      {/* 8. Confirm Delete Dialog */}
      <ConfirmDialog
        isOpen={deleteConfirm.isOpen}
        title="Delete Task"
        message="Are you sure you want to delete this task? This action cannot be undone."
        confirmText="Delete"
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirm({ isOpen: false, type: 'task', id: '' })}
      />
    </div>
  );
};
