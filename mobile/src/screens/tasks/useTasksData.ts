/**
 * useTasksData.ts — ZenTrack Tasks Module
 *
 * All state declarations, useMemo derivations, and pure data
 * computations extracted from TasksScreen.tsx.
 * The screen coordinator imports this single hook for all data.
 */
import { useState, useMemo, useEffect, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { Task } from '../../contexts/MobileDataContext';
import { getToday, parseTimeFloat } from './taskConstants';

export type ViewMode = 'list' | 'timeline' | 'kanban';
export type SortBy = 'default' | 'priority';

export interface TasksUIState {
  selectedDate: string;
  viewMode: ViewMode;
  filterTag: string | null;
  isCalendarOpen: boolean;
  isTemplatesSheetOpen: boolean;
  isNewTaskOpen: boolean;
  isBulkEdit: boolean;
  selectedTaskIds: Set<string>;
  bulkRescheduleModal: boolean;
  isOverdueModalOpen: boolean;
  isInboxModalOpen: boolean;
  isMenuOpen: boolean;
  sortBy: SortBy;
  timeLogTask: Task | null;
  isTimeSpentOpen: boolean;
  editingTask: Task | null;
  conflicts: any[];
}

export function useTasksData(tasks: Task[]) {
  // ── UI State ────────────────────────────────────────────────────────────────
  const [selectedDate, setSelectedDate] = useState(() => getToday());

  // Listen to midnight date transitions via single setTimeout + AppState foreground resume
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const scheduleMidnightCheck = () => {
      const now = new Date();
      const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
      const msUntilMidnight = Math.max(1000, midnight.getTime() - now.getTime());

      timer = setTimeout(() => {
        const liveToday = getToday();
        setSelectedDate(prev => {
          const oldToday = new Date(Date.now() - 60000);
          const oldTodayStr = `${oldToday.getFullYear()}-${String(oldToday.getMonth() + 1).padStart(2, '0')}-${String(oldToday.getDate()).padStart(2, '0')}`;
          return prev === oldTodayStr ? liveToday : prev;
        });
        scheduleMidnightCheck();
      }, msUntilMidnight);
    };

    scheduleMidnightCheck();

    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        const liveToday = getToday();
        setSelectedDate(prev => {
          const oldToday = new Date(Date.now() - 86400000);
          const oldTodayStr = `${oldToday.getFullYear()}-${String(oldToday.getMonth() + 1).padStart(2, '0')}-${String(oldToday.getDate()).padStart(2, '0')}`;
          return prev === oldTodayStr ? liveToday : prev;
        });
      }
    });

    return () => {
      if (timer) clearTimeout(timer);
      subscription.remove();
    };
  }, []);

  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isTemplatesSheetOpen, setIsTemplatesSheetOpen] = useState(false);
  const [isNewTaskOpen, setIsNewTaskOpen] = useState(false);
  const [isBulkEdit, setIsBulkEdit] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [bulkRescheduleModal, setBulkRescheduleModal] = useState(false);
  const [isOverdueModalOpen, setIsOverdueModalOpen] = useState(false);
  const [isInboxModalOpen, setIsInboxModalOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [sortBy, setSortBy] = useState<SortBy>('default');
  const [timeLogTask, setTimeLogTask] = useState<Task | null>(null);
  const [isTimeSpentOpen, setIsTimeSpentOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [conflicts, setConflicts] = useState<any[]>([]);

  // ── Derived Data Stage 1: Partition tasks, dates, and precompute timeVal (Depends ONLY on [tasks]) ─────
  const { overdueTasks, inboxTasks, taskDates, tasksByDate } = useMemo(() => {
    const todayStr = getToday();
    const overdue: Task[] = [];
    const inbox: Task[] = [];
    const dates = new Set<string>();
    const byDate = new Map<string, Array<{ task: Task; timeVal: number; prio: number; isCompleted: boolean; order: number }>>();

    const priorityWeight = (p?: string) => (p === 'high' || p === 'P1' ? 3 : (p === 'medium' || p === 'P2' ? 2 : 1));

    for (let i = 0; i < tasks.length; i++) {
      const t = tasks[i];
      const isCompleted = t.status === 'completed';
      if (t.date && !isCompleted) {
        dates.add(t.date);
      }

      if (!t.date && !isCompleted) {
        inbox.push(t);
      } else if (t.date && t.date < todayStr && !isCompleted) {
        overdue.push(t);
      }

      if (t.date) {
        let timeVal = Infinity;
        if (t.timeSlot) {
          const start = t.timeSlot.split(/[-–—•]| to /i)[0]?.trim();
          timeVal = parseTimeFloat(start);
        }
        const item = {
          task: t,
          timeVal,
          prio: priorityWeight(t.priority),
          isCompleted,
          order: t.order || 0,
        };
        const existing = byDate.get(t.date);
        if (existing) {
          existing.push(item);
        } else {
          byDate.set(t.date, [item]);
        }
      }
    }

    overdue.sort((a, b) => (a.order || 0) - (b.order || 0));
    inbox.sort((a, b) => (a.order || 0) - (b.order || 0));

    return {
      overdueTasks: overdue,
      inboxTasks: inbox,
      taskDates: dates,
      tasksByDate: byDate,
    };
  }, [tasks]);

  // ── Derived Data Stage 2: Fast O(1) day-slice sort (Depends on [tasksByDate, selectedDate, sortBy]) ─────
  const selectedDateTasks = useMemo(() => {
    const dayItems = tasksByDate.get(selectedDate);
    if (!dayItems || dayItems.length === 0) return [];

    const sorted = [...dayItems];
    sorted.sort((a, b) => {
      if (a.isCompleted !== b.isCompleted) return a.isCompleted ? 1 : -1;
      if (sortBy === 'priority' && a.prio !== b.prio) return b.prio - a.prio;
      if (a.timeVal !== b.timeVal) return a.timeVal - b.timeVal;
      return a.order - b.order;
    });

    return sorted.map(s => s.task);
  }, [tasksByDate, selectedDate, sortBy]);

  const upcomingTasks = useMemo(() => {
    const upcoming: Task[] = [];
    tasksByDate.forEach((items, date) => {
      if (date > selectedDate) {
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (!item.isCompleted && item.prio === 3) {
            upcoming.push(item.task);
          }
        }
      }
    });
    upcoming.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    return upcoming;
  }, [tasksByDate, selectedDate]);

  const toggleTaskSelection = useCallback((id: string) => {
    setSelectedTaskIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id); else newSet.add(id);
      return newSet;
    });
  }, []);

  return {
    // State values
    selectedDate, viewMode, filterTag, isCalendarOpen, isTemplatesSheetOpen,
    isNewTaskOpen, isBulkEdit, selectedTaskIds, bulkRescheduleModal,
    isOverdueModalOpen, isInboxModalOpen, isMenuOpen, sortBy,
    timeLogTask, isTimeSpentOpen, editingTask, conflicts,
    // Derived data
    overdueTasks, inboxTasks, selectedDateTasks, upcomingTasks, taskDates,
    // Setters
    setSelectedDate, setViewMode, setFilterTag, setIsCalendarOpen,
    setIsTemplatesSheetOpen, setIsNewTaskOpen, setIsBulkEdit,
    setSelectedTaskIds, setBulkRescheduleModal, setIsOverdueModalOpen,
    setIsInboxModalOpen, setIsMenuOpen, setSortBy, setTimeLogTask,
    setIsTimeSpentOpen, setEditingTask, setConflicts,
    // Helpers
    toggleTaskSelection,
  };
}
