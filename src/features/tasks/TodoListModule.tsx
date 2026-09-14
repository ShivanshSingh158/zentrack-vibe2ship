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
import { getLocalDateString, formatDisplayDate, parseNLTask, cleanTaskTitle, toYMD, parseLocalDate, extractTaskDurationMinutes } from '../../utils/dateUtils';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { RecurringDeleteDialog } from './RecurringDeleteDialog';
import { useRecurringSpawn } from './useRecurringSpawn';
import { EditTodoModal } from './EditTodoModal';
import { TodoCard, CompletedTodoItem } from './TodoCard';
import { TimelineView } from './TimelineView';
import { KanbanView } from './KanbanView';
import { MatrixView } from './MatrixView';
import { TaskDateStrip } from './TaskDateStrip';
import { ProgressRing } from './ProgressRing';
import { TimeSpentSheet } from './TimeSpentSheet';
import { TaskTemplatesSheet } from './TaskTemplatesSheet';
import { BulkRescheduleSheet } from './BulkRescheduleSheet';
import { InboxOverdueDrawer } from './InboxOverdueDrawer';

export const TodoListModule: React.FC = () => {
  const { tasks: globalTodos, habits: rawHabits, habitLogs: rawHabitLogs, isLoading } = useGlobalData();
  const user = auth.currentUser;
  const todayStr = useMemo(() => getLocalDateString(new Date()), []);
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);

  // Cross-device recurring task spawner: auto-creates today's occurrence for active daily habits/tasks
  useRecurringSpawn(globalTodos, user?.uid);

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

  // Optimistic deletion state: instantly removes deleted tasks from UI with background sync
  const [optimisticDeletedIds, setOptimisticDeletedIds] = useState<Set<string>>(new Set());

  // Active tasks excluding any pending background deletions
  const activeGlobalTodos = useMemo(() => {
    if (optimisticDeletedIds.size === 0) return globalTodos;
    return globalTodos.filter(t => !optimisticDeletedIds.has(t.id));
  }, [globalTodos, optimisticDeletedIds]);

  // Clean up optimistic IDs once Firestore snapshot confirms deletion
  useEffect(() => {
    if (optimisticDeletedIds.size === 0) return;
    const currentIds = new Set(globalTodos.map(t => t.id));
    let hasStale = false;
    optimisticDeletedIds.forEach(id => {
      if (!currentIds.has(id)) {
        hasStale = true;
      }
    });
    if (hasStale) {
      setOptimisticDeletedIds(prev => {
        const next = new Set<string>();
        prev.forEach(id => {
          if (currentIds.has(id)) next.add(id);
        });
        return next;
      });
    }
  }, [globalTodos, optimisticDeletedIds]);

  // Filter tasks for selected date
  const todos = useMemo(() => {
    return activeGlobalTodos.filter(t => t.date === selectedDate);
  }, [activeGlobalTodos, selectedDate]);

  const inboxTasks = useMemo(() => 
    activeGlobalTodos.filter(t => !t.date && t.status !== 'completed').sort((a, b) => (a.order || 0) - (b.order || 0)),
    [activeGlobalTodos]
  );
  
  const overdueTasks = useMemo(() => 
    activeGlobalTodos.filter(t => t.date && t.date < todayStr && t.status !== 'completed').sort((a, b) => (a.order || 0) - (b.order || 0)),
    [activeGlobalTodos, todayStr]
  );

  // Active View Mode: 'list' | 'timeline' | 'kanban' | 'matrix'
  const [viewMode, setViewMode] = useState<'list' | 'timeline' | 'kanban' | 'matrix'>('list');
  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);

  // Modals & Sheets State
  const [isInboxDrawerOpen, setIsInboxDrawerOpen] = useState(false);
  const [isTimeSpentSheetOpen, setIsTimeSpentSheetOpen] = useState(false);
  const [isTemplatesSheetOpen, setIsTemplatesSheetOpen] = useState(false);
  const [isBulkRescheduleOpen, setIsBulkRescheduleOpen] = useState(false);


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

  // Recurring Delete Dialog
  const [recurringDeleteTarget, setRecurringDeleteTarget] = useState<{
    task: TodoItem;
    futureCount: number;
  } | null>(null);

  const { startTimer } = usePomodoroContext();

  // Filter states
  const [priorityFilter, setPriorityFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [selectedTagFilter, setSelectedTagFilter] = useState<string>('all');
  const [quickInput, setQuickInput] = useState('');

  // Extract all unique tags across tasks
  const allAvailableTags = useMemo(() => {
    const set = new Set<string>();
    activeGlobalTodos.forEach(t => {
      (t.tags || []).forEach(tag => set.add(tag));
    });
    return Array.from(set);
  }, [activeGlobalTodos]);

  // Handle Raycast-Style Fast Natural Language Quick Capture with Full NLP
  const handleQuickCapture = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickInput.trim() || !user) return;

    const parsed = parseNLTask(quickInput);
    const finalTitle = cleanTaskTitle(parsed.title || quickInput.trim());
    const count = todos.filter(t => t.status !== 'completed').length;
    const fullTimeSlot = parsed.timeSlot
      ? (parsed.endTimeSlot && !parsed.timeSlot.includes('-') ? `${parsed.timeSlot} - ${parsed.endTimeSlot}` : parsed.timeSlot)
      : null;
    const resolvedDuration = parsed.durationMinutes
      || (fullTimeSlot ? extractTaskDurationMinutes(null, fullTimeSlot, finalTitle) : null);

    // 1. Multi-day one-time dates (e.g. "submit report on monday and wednesday")
    if (parsed.oneTimeDates && parsed.oneTimeDates.length > 1) {
      const batch = writeBatch(db);
      for (const d of parsed.oneTimeDates) {
        const docRef = doc(collection(db, 'todos'));
        batch.set(docRef, {
          userId: user.uid,
          title: finalTitle,
          text: finalTitle,
          date: d,
          status: 'pending',
          priority: parsed.priority || 'medium',
          timeSlot: fullTimeSlot,
          estimatedMinutes: resolvedDuration,
          subtasks: (parsed.subtasks || []).map((s, idx) => ({ id: `st-${Date.now()}-${idx}`, title: s, completed: false, status: 'pending' })),
          tags: parsed.tags || [],
          isRecurring: false,
          createdAt: Date.now(),
          order: count,
        });
      }
      try {
        await batch.commit();
        playPopSound();
        toast.success(`Created ${parsed.oneTimeDates.length} tasks across scheduled days ⚡`);
        setQuickInput('');
      } catch (err) {
        console.error(err);
        toast.error('Failed to create multi-day tasks');
      }
      return;
    }

    // 2. Recurring tasks (e.g. "go for run daily at 7am")
    if (parsed.isRecurring && parsed.recurrenceRule) {
      const rule = parsed.recurrenceRule;
      const sourceId = `rec_${Date.now()}`;
      const baseDateStr = parsed.date || selectedDate || getLocalDateString();
      let curr = parseLocalDate(baseDateStr);
      const end = rule.endDate
        ? parseLocalDate(rule.endDate)
        : new Date(curr.getTime() + 60 * 24 * 60 * 60 * 1000); // 60 days window

      if (rule.type === 'weekly' && rule.daysOfWeek && rule.daysOfWeek.length > 0) {
        while (!rule.daysOfWeek.includes(curr.getDay())) {
          curr.setDate(curr.getDate() + 1);
        }
      }

      const batch = writeBatch(db);
      let instancesCount = 0;
      const MAX_INSTANCES = 60;

      while (curr <= end && instancesCount < MAX_INSTANCES) {
        const docRef = doc(collection(db, 'todos'));
        const dateStr = toYMD(curr);
        batch.set(docRef, {
          userId: user.uid,
          title: finalTitle,
          text: finalTitle,
          date: dateStr,
          status: 'pending',
          priority: parsed.priority || 'medium',
          timeSlot: fullTimeSlot,
          estimatedMinutes: resolvedDuration,
          subtasks: (parsed.subtasks || []).map((s, idx) => ({ id: `st-${Date.now()}-${idx}`, title: s, completed: false, status: 'pending' })),
          tags: parsed.tags || [],
          isRecurring: true,
          recurrenceRule: rule,
          recurringSourceId: sourceId,
          createdAt: Date.now(),
          order: count,
        });
        instancesCount++;

        if (rule.type === 'daily' || rule.type === 'custom') {
          curr.setDate(curr.getDate() + (rule.interval || 1));
        } else if (rule.type === 'weekly') {
          if (rule.daysOfWeek && rule.daysOfWeek.length > 0) {
            do {
              curr.setDate(curr.getDate() + 1);
            } while (curr <= end && !rule.daysOfWeek.includes(curr.getDay()));
          } else {
            curr.setDate(curr.getDate() + 7 * (rule.interval || 1));
          }
        } else if (rule.type === 'monthly') {
          curr.setMonth(curr.getMonth() + (rule.interval || 1));
        } else {
          break;
        }
      }

      try {
        await batch.commit();
        playPopSound();
        toast.success(`Created recurring task: "${finalTitle}" (${instancesCount} instances) ⚡`);
        setQuickInput('');
      } catch (err) {
        console.error(err);
        toast.error('Failed to create recurring tasks');
      }
      return;
    }

    // 3. Standard task
    const newDoc: any = {
      userId: user.uid,
      title: finalTitle,
      text: finalTitle,
      date: parsed.date || selectedDate,
      status: 'pending',
      priority: parsed.priority || 'medium',
      timeSlot: fullTimeSlot,
      estimatedMinutes: resolvedDuration,
      subtasks: (parsed.subtasks || []).map((s, idx) => ({ id: `st-${Date.now()}-${idx}`, title: s, completed: false, status: 'pending' })),
      tags: parsed.tags || [],
      isRecurring: false,
      createdAt: Date.now(),
      order: count,
    };

    try {
      await addDoc(collection(db, 'todos'), newDoc);
      playPopSound();
      toast.success(`Task added: "${finalTitle}" ⚡`);
      setQuickInput('');
    } catch (err) {
      console.error(err);
      toast.error('Failed to add task');
    }
  };

  // Sort & Filter todos for list view
  const pendingTodos = useMemo(() => {
    let list = todos.filter(t => t.status !== 'completed');

    // Search term
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter(t => (t.title || t.text || '').toLowerCase().includes(q) || (t.tags || []).some(tag => tag.toLowerCase().includes(q)));
    }

    // Priority filter
    if (priorityFilter !== 'all') {
      if (priorityFilter === 'high') {
        list = list.filter(t => t.priority === 'high' || t.priority === 'P1');
      } else if (priorityFilter === 'medium') {
        list = list.filter(t => t.priority === 'medium' || t.priority === 'P2');
      } else if (priorityFilter === 'low') {
        list = list.filter(t => t.priority === 'low' || t.priority === 'P3' || t.priority === 'P4' || !t.priority);
      }
    }

    // Tag filter
    if (selectedTagFilter !== 'all') {
      list = list.filter(t => (t.tags || []).includes(selectedTagFilter));
    }

    if (sortBy === 'priority') {
      const pOrder: Record<string, number> = { high: 1, P1: 1, medium: 2, P2: 2, low: 3, P3: 3 };
      list.sort((a, b) => (pOrder[a.priority || 'medium'] || 2) - (pOrder[b.priority || 'medium'] || 2));
    } else {
      list.sort((a, b) => (a.order || 0) - (b.order || 0));
    }
    return list;
  }, [todos, searchTerm, priorityFilter, selectedTagFilter, sortBy]);

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

  const handleBulkDelete = () => {
    if (selectedTaskIds.size === 0) return;
    const idsToDelete = Array.from(selectedTaskIds);
    const count = idsToDelete.length;

    // 1. Instantly update UI (0ms delay)
    setSelectedTaskIds(new Set());
    setIsBulkEdit(false);
    setOptimisticDeletedIds(prev => new Set([...prev, ...idsToDelete]));
    toast.success(`Deleted ${count} task${count === 1 ? '' : 's'}.`);

    // 2. Asynchronous background deletion in Firestore
    const batch = writeBatch(db);
    idsToDelete.forEach(id => {
      batch.delete(doc(db, 'todos', id));
    });
    batch.commit().catch(err => {
      console.error('Background bulk delete failed:', err);
      toast.error('Failed to delete tasks. Restoring...');
      // Rollback
      setOptimisticDeletedIds(prev => {
        const next = new Set(prev);
        idsToDelete.forEach(id => next.delete(id));
        return next;
      });
    });
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

  // Helper to find all matching tasks in a recurring series
  const getMatchingRecurringTasks = useCallback((task: TodoItem) => {
    return globalTodos.filter(t => {
      const inSameGroup = task.recurringSourceId
        ? t.recurringSourceId === task.recurringSourceId
        : (t.title?.toLowerCase().trim() === task.title?.toLowerCase().trim() && (t.isRecurring || task.isRecurring));
      // Same group and future/same date (or all if either has no date)
      const isFutureOrSame = !task.date || !t.date || t.date >= task.date;
      return inSameGroup && isFutureOrSame;
    });
  }, [globalTodos]);

  const handleDeleteTask = useCallback((id: string) => {
    const task = globalTodos.find(t => t.id === id);
    if (!task) return;

    const matching = getMatchingRecurringTasks(task);
    const isRecurring = Boolean(
      task.isRecurring ||
      task.recurringSourceId ||
      (task.recurrenceRule && task.recurrenceRule.type !== 'once') ||
      matching.length > 1
    );

    // If it's a recurring task with multiple occurrences, ask the user!
    if (isRecurring && matching.length > 1) {
      setRecurringDeleteTarget({ task, futureCount: matching.length });
    } else {
      setDeleteConfirm({ isOpen: true, type: 'task', id });
    }
  }, [globalTodos, getMatchingRecurringTasks]);

  const handleDeleteOnlyThis = useCallback(async () => {
    if (!recurringDeleteTarget?.task?.id) return;
    const { task } = recurringDeleteTarget;
    const id = task.id!;
    setRecurringDeleteTarget(null);

    // 1. Instantly remove from UI (0ms delay)
    setOptimisticDeletedIds(prev => new Set([...prev, id]));
    toast.success('Deleted task occurrence');

    // 2. Asynchronous background deletion
    try {
      await deleteDoc(doc(db, 'todos', id));
    } catch (err) {
      console.error('Failed to delete single recurring task:', err);
      toast.error('Failed to delete task. Restoring...');
      setOptimisticDeletedIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }, [recurringDeleteTarget]);

  const handleDeleteAllFuture = useCallback(async () => {
    if (!recurringDeleteTarget?.task) return;
    const { task } = recurringDeleteTarget;
    const matching = getMatchingRecurringTasks(task);
    const idsToDelete = matching.map(t => t.id).filter(Boolean) as string[];
    setRecurringDeleteTarget(null);

    if (idsToDelete.length === 0) return;

    // 1. Instantly remove all from UI (0ms delay)
    setOptimisticDeletedIds(prev => new Set([...prev, ...idsToDelete]));
    toast.success(`Deleted ${idsToDelete.length} recurring occurrences`);

    // 2. Asynchronous background batch deletion
    try {
      const batch = writeBatch(db);
      idsToDelete.forEach(id => {
        batch.delete(doc(db, 'todos', id));
      });
      await batch.commit();
    } catch (err) {
      console.error('Failed to batch delete recurring tasks:', err);
      toast.error('Failed to delete recurring tasks. Restoring...');
      setOptimisticDeletedIds(prev => {
        const next = new Set(prev);
        idsToDelete.forEach(id => next.delete(id));
        return next;
      });
    }
  }, [recurringDeleteTarget, getMatchingRecurringTasks]);

  const confirmDelete = () => {
    const { type, id } = deleteConfirm;

    // 1. Immediately dismiss confirmation dialog (0ms delay)
    setDeleteConfirm({ isOpen: false, type: 'task', id: '' });

    if (type === 'completed') {
      const idsToDelete = completedTodos.map(t => t.id).filter(Boolean) as string[];
      if (idsToDelete.length === 0) return;

      // 2. Instantly remove from UI
      setOptimisticDeletedIds(prev => new Set([...prev, ...idsToDelete]));
      toast.success('Cleared completed tasks');

      // 3. Asynchronous background deletion
      const batch = writeBatch(db);
      idsToDelete.forEach(taskId => {
        batch.delete(doc(db, 'todos', taskId));
      });
      batch.commit().catch(err => {
        console.error('Failed to clear completed tasks:', err);
        toast.error('Failed to clear completed tasks. Restoring...');
        setOptimisticDeletedIds(prev => {
          const next = new Set(prev);
          idsToDelete.forEach(taskId => next.delete(taskId));
          return next;
        });
      });
    } else if (id) {
      // 2. Instantly remove from UI (0ms delay)
      setOptimisticDeletedIds(prev => new Set([...prev, id]));
      toast.success('Task deleted');

      // 3. Asynchronous background deletion
      deleteDoc(doc(db, 'todos', id)).catch(err => {
        console.error('Failed to delete task:', err);
        toast.error('Failed to delete task. Restoring...');
        setOptimisticDeletedIds(prev => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      });
    }
  };

  const clearAllCompleted = () => {
    if (completedTodos.length === 0) return;
    setDeleteConfirm({ isOpen: true, type: 'completed', id: 'all' });
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

          {/* Linear-Style Segmented View Switcher */}
          <div className="tasks-view-segmented-bar">
            <button
              type="button"
              className={`segmented-view-btn ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode('list')}
              title="List View"
            >
              <ListIcon size={14} />
              <span>List</span>
            </button>
            <button
              type="button"
              className={`segmented-view-btn ${viewMode === 'timeline' ? 'active' : ''}`}
              onClick={() => setViewMode('timeline')}
              title="24h Timeline"
            >
              <Clock size={14} />
              <span>Timeline</span>
            </button>
            <button
              type="button"
              className={`segmented-view-btn ${viewMode === 'kanban' ? 'active' : ''}`}
              onClick={() => setViewMode('kanban')}
              title="Kanban Board"
            >
              <Columns size={14} />
              <span>Kanban</span>
            </button>
            <button
              type="button"
              className={`segmented-view-btn ${viewMode === 'matrix' ? 'active' : ''}`}
              onClick={() => setViewMode('matrix')}
              title="Eisenhower Matrix"
            >
              <LayoutGrid size={14} />
              <span>Matrix</span>
            </button>
          </div>

          {/* + Add Task Button */}
          <button
            type="button"
            className="tasks-primary-add-btn"
            onClick={() => window.dispatchEvent(new CustomEvent('open-new-task-modal', { detail: { date: selectedDate } }))}
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
            {/* Linear-Style Unified Command Toolbar (One Full-Width Structured Line) */}
            <div className="tasks-filter-toolbar">
              {/* Left: Priority Filter Pills & Tags */}
              <div className="tasks-filter-pills-group">
                <button
                  type="button"
                  className={`filter-pill-btn ${priorityFilter === 'all' ? 'active' : ''}`}
                  onClick={() => setPriorityFilter('all')}
                >
                  All
                </button>
                <button
                  type="button"
                  className={`filter-pill-btn p1 ${priorityFilter === 'high' ? 'active' : ''}`}
                  onClick={() => setPriorityFilter(priorityFilter === 'high' ? 'all' : 'high')}
                >
                  <span className="priority-dot p1" />
                  <span>P1 Urgent</span>
                </button>
                <button
                  type="button"
                  className={`filter-pill-btn p2 ${priorityFilter === 'medium' ? 'active' : ''}`}
                  onClick={() => setPriorityFilter(priorityFilter === 'medium' ? 'all' : 'medium')}
                >
                  <span className="priority-dot p2" />
                  <span>P2 High</span>
                </button>
                <button
                  type="button"
                  className={`filter-pill-btn p3 ${priorityFilter === 'low' ? 'active' : ''}`}
                  onClick={() => setPriorityFilter(priorityFilter === 'low' ? 'all' : 'low')}
                >
                  <span className="priority-dot p3" />
                  <span>P3 Normal</span>
                </button>

                {allAvailableTags.length > 0 && (
                  <select
                    value={selectedTagFilter}
                    onChange={e => setSelectedTagFilter(e.target.value)}
                    className="tasks-tag-filter-select"
                  >
                    <option value="all">🏷️ All Tags</option>
                    {allAvailableTags.map(tag => (
                      <option key={tag} value={tag}>#{tag}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Center: Search Bar filling all remaining space */}
              <div className="tasks-search-wrap">
                <Search size={14} color="#8e8e93" />
                <input
                  type="text"
                  placeholder="Search tasks, subtasks, or #tags..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="tasks-search-input"
                />
                {searchTerm && (
                  <button type="button" onClick={() => setSearchTerm('')} className="search-clear-btn" title="Clear search">
                    <X size={13} />
                  </button>
                )}
              </div>

              {/* Right: Quick Sort Dropdown & Task Counter Badge */}
              <div className="tasks-toolbar-right-group">
                <button
                  type="button"
                  className="toolbar-sort-btn"
                  onClick={() => setSortBy(s => s === 'priority' ? 'default' : 'priority')}
                  title={`Current sort: ${sortBy === 'priority' ? 'Priority' : 'Manual Order'}`}
                >
                  <Filter size={13} />
                  <span>{sortBy === 'priority' ? 'Priority' : 'Custom'}</span>
                </button>
                <div className="toolbar-count-badge">
                  <span>{pendingTodos.length} Tasks</span>
                </div>
              </div>
            </div>

            {/* Pending Tasks DragDrop List */}
            {pendingTodos.length === 0 && completedTodos.length === 0 ? (
              <div className="tasks-empty-placeholder">
                <CheckCircle2 size={48} color="rgba(165,153,255,0.3)" />
                <h3>No tasks for this day</h3>
                <p>Plan your day by adding a task or applying a routine template.</p>
                <button
                  type="button"
                  className="empty-create-btn"
                  onClick={() => window.dispatchEvent(new CustomEvent('open-new-task-modal', { detail: { date: selectedDate } }))}
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
            tasks={activeGlobalTodos}
            selectedDate={selectedDate}
            onTaskClick={setEditingTask}
          />
        )}

        {viewMode === 'kanban' && (
          <KanbanView
            tasks={activeGlobalTodos}
            onTaskClick={setEditingTask}
          />
        )}

        {viewMode === 'matrix' && (
          <MatrixView
            tasks={activeGlobalTodos}
            onTaskClick={setEditingTask}
          />
        )}
      </div>

      {/* ── MODALS & SHEETS ── */}
      {/* 1. Edit Task Modal */}
      {editingTask && (
        <EditTodoModal
          isOpen={!!editingTask}
          onClose={() => setEditingTask(null)}
          todo={editingTask}
          onDelete={(id) => {
            setEditingTask(null);
            handleDeleteTask(id);
          }}
          onSave={async (updated) => {
            if (updated.id) {
              await updateDoc(doc(db, 'todos', updated.id), { ...updated });
              setEditingTask(null);
              toast.success('Task updated');
            }
          }}
        />
      )}


      {/* 4. Time Spent Analytics Sheet */}
      <TimeSpentSheet
        isOpen={isTimeSpentSheetOpen}
        onClose={() => setIsTimeSpentSheetOpen(false)}
        tasks={activeGlobalTodos}
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
        allTasks={activeGlobalTodos}
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

      {/* 8. Recurring Delete Dialog */}
      <RecurringDeleteDialog
        isOpen={!!recurringDeleteTarget}
        onClose={() => setRecurringDeleteTarget(null)}
        task={recurringDeleteTarget?.task || null}
        futureCount={recurringDeleteTarget?.futureCount || 1}
        onDeleteOnlyThis={handleDeleteOnlyThis}
        onDeleteAll={handleDeleteAllFuture}
      />

      {/* 9. Confirm Delete Dialog */}
      <ConfirmDialog
        open={deleteConfirm.isOpen}
        isOpen={deleteConfirm.isOpen}
        title={deleteConfirm.type === 'completed' ? 'Clear Completed Tasks' : 'Delete Task'}
        message={
          deleteConfirm.type === 'completed'
            ? 'Are you sure you want to permanently clear all completed tasks?'
            : 'Are you sure you want to delete this task? This action cannot be undone.'
        }
        confirmText="Delete"
        confirmLabel="Delete"
        cancelText="Cancel"
        cancelLabel="Cancel"
        variant="danger"
        danger={true}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirm({ isOpen: false, type: 'task', id: '' })}
      />
    </div>
  );
};
