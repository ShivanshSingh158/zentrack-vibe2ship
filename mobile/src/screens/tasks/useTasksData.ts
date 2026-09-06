/**
 * useTasksData.ts — ZenTrack Tasks Module
 *
 * All state declarations, useMemo derivations, and pure data
 * computations extracted from TasksScreen.tsx.
 * The screen coordinator imports this single hook for all data.
 */
import { useState, useMemo, useEffect } from 'react';
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

  // Listen to midnight date transitions
  useEffect(() => {
    const interval = setInterval(() => {
      const liveToday = getToday();
      setSelectedDate(prev => {
        const oldToday = new Date(Date.now() - 60000);
        const oldTodayStr = `${oldToday.getFullYear()}-${String(oldToday.getMonth() + 1).padStart(2, '0')}-${String(oldToday.getDate()).padStart(2, '0')}`;
        if (prev === oldTodayStr) {
          return liveToday;
        }
        return prev;
      });
    }, 30000);
    return () => clearInterval(interval);
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

  // ── Derived / Memoized Data (Optimized Single-Pass O(N) Partitioning) ─────
  const { overdueTasks, inboxTasks, selectedDateTasks, upcomingTasks, taskDates } = useMemo(() => {
    const todayStr = getToday();
    const overdue: Task[] = [];
    const inbox: Task[] = [];
    const selected: Array<{ task: Task; timeVal: number; prio: number; isCompleted: boolean; order: number }> = [];
    const upcoming: Task[] = [];
    const dates = new Set<string>();

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
      
      if (t.date === selectedDate) {
        let timeVal = Infinity;
        if (t.timeSlot) {
          const start = t.timeSlot.split(/[-–—•]| to /i)[0]?.trim();
          timeVal = parseTimeFloat(start);
        }
        selected.push({
          task: t,
          timeVal,
          prio: priorityWeight(t.priority),
          isCompleted,
          order: t.order || 0,
        });
      } else if (t.date && t.date > selectedDate && !isCompleted && (t.priority === 'high' || t.priority === 'P1')) {
        upcoming.push(t);
      }
    }

    overdue.sort((a, b) => (a.order || 0) - (b.order || 0));
    inbox.sort((a, b) => (a.order || 0) - (b.order || 0));
    upcoming.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    selected.sort((a, b) => {
      if (a.isCompleted !== b.isCompleted) return a.isCompleted ? 1 : -1;
      if (sortBy === 'priority' && a.prio !== b.prio) return b.prio - a.prio;
      if (a.timeVal !== b.timeVal) return a.timeVal - b.timeVal;
      return a.order - b.order;
    });

    return {
      overdueTasks: overdue,
      inboxTasks: inbox,
      selectedDateTasks: selected.map(s => s.task),
      upcomingTasks: upcoming,
      taskDates: dates,
    };
  }, [tasks, selectedDate, sortBy]);

  const toggleTaskSelection = (id: string) => {
    setSelectedTaskIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id); else newSet.add(id);
      return newSet;
    });
  };

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
