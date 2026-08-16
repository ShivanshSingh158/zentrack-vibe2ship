/**
 * useTasksData.ts — ZenTrack Tasks Module
 *
 * All state declarations, useMemo derivations, and pure data
 * computations extracted from TasksScreen.tsx.
 * The screen coordinator imports this single hook for all data.
 */
import { useState, useMemo } from 'react';
import { Task } from '../../contexts/MobileDataContext';
import { today } from './taskConstants';

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

function parseTimeFloat(timeStr?: string | null): number {
  if (!timeStr) return Infinity;
  const t = timeStr.trim().toUpperCase();
  const isPM = t.includes('PM'), isAM = t.includes('AM');
  const cleaned = t.replace(/[\sAPM]+$/i, '').trim();
  const parts = cleaned.split(':');
  let h = parseInt(parts[0], 10);
  if (isNaN(h)) return Infinity;
  const m = parts.length >= 2 ? (parseInt(parts[1], 10) || 0) : 0;
  if (isPM && h !== 12) h += 12;
  if (isAM && h === 12) h = 0;
  return h + m / 60;
}

export function useTasksData(tasks: Task[]) {
  // ── UI State ────────────────────────────────────────────────────────────────
  const [selectedDate, setSelectedDate] = useState(today);
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

  // ── Derived / Memoized Data ─────────────────────────────────────────────────
  const overdueTasks = useMemo(() =>
    tasks.filter(t => t.date && t.date < today && t.status !== 'completed')
      .sort((a, b) => (a.order || 0) - (b.order || 0)),
    [tasks]);

  const inboxTasks = useMemo(() =>
    tasks.filter(t => !t.date && t.status !== 'completed')
      .sort((a, b) => (a.order || 0) - (b.order || 0)),
    [tasks]);

  const selectedDateTasks = useMemo(() => {
    const dayTasks = tasks.filter(t => t.date === selectedDate);
    const priorityWeight = (p?: string) => (p === 'high' || p === 'P1' ? 3 : (p === 'medium' || p === 'P2' ? 2 : 1));

    // Pre-parse numerical timestamps once in O(N) to eliminate O(N log N) regex splits in sort
    const mapped = dayTasks.map(t => {
      let timeVal = Infinity;
      if (t.timeSlot) {
        const start = t.timeSlot.split(/[-–—•]| to /i)[0]?.trim();
        timeVal = parseTimeFloat(start);
      }
      return {
        task: t,
        timeVal,
        prio: priorityWeight(t.priority),
        isCompleted: t.status === 'completed',
        order: t.order || 0,
      };
    });

    mapped.sort((a, b) => {
      if (a.isCompleted && !b.isCompleted) return 1;
      if (!a.isCompleted && b.isCompleted) return -1;
      if (sortBy === 'priority') {
        if (a.prio !== b.prio) return b.prio - a.prio;
      }
      if (a.timeVal !== b.timeVal) return a.timeVal - b.timeVal;
      return a.order - b.order;
    });

    return mapped.map(m => m.task);
  }, [tasks, selectedDate, sortBy]);

  const upcomingTasks = useMemo(() =>
    tasks.filter(t => t.date && t.date > selectedDate && t.status !== 'completed' && (t.priority === 'high' || t.priority === 'P1'))
      .sort((a, b) => (a.date || '').localeCompare(b.date || '')),
    [tasks, selectedDate]);

  const taskDates = useMemo(() => {
    const dates = new Set<string>();
    tasks.forEach(t => { if (t.date && t.status !== 'completed') dates.add(t.date); });
    return dates;
  }, [tasks]);

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
