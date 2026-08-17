import React, { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Layers, 
  Calendar as CalendarIcon, 
  CalendarDays, 
  CheckCircle2, 
  Clock, 
  ListChecks, 
  MoreVertical,
  ArrowRight,
  Plus
} from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { getLocalDateString } from '../../utils/dateUtils';
import type { TodoItem } from '../../types';

interface KanbanViewProps {
  tasks: TodoItem[];
  onTaskClick: (task: TodoItem) => void;
  onAddTaskToColumn?: (columnId: 'backlog' | 'today' | 'week') => void;
}

const PRIORITY_COLORS: Record<string, string> = {
  high: '#ff6961',
  P1: '#ff6961',
  medium: '#ff9f4d',
  P2: '#ff9f4d',
  low: '#5eda9e',
  P3: '#5eda9e',
};

const TAG_PALETTE = ['#a599ff', '#60a5fa', '#34d399', '#f87171', '#fb923c', '#e879f9', '#facc15', '#38bdf8'];
function tagColor(tag: string): string {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  return TAG_PALETTE[Math.abs(hash) % TAG_PALETTE.length];
}

interface ColumnDef {
  id: 'backlog' | 'today' | 'week' | 'done';
  label: string;
  icon: any;
  accent: string;
  tasks: TodoItem[];
}

export const KanbanView: React.FC<KanbanViewProps> = ({ tasks, onTaskClick, onAddTaskToColumn }) => {
  const [activeMenuTaskId, setActiveMenuTaskId] = useState<string | null>(null);

  const todayStr = useMemo(() => getLocalDateString(new Date()), []);
  const weekEndStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + (7 - d.getDay()));
    return getLocalDateString(d);
  }, []);

  const columns: ColumnDef[] = useMemo(() => {
    const backlog: TodoItem[] = [];
    const today: TodoItem[] = [];
    const week: TodoItem[] = [];
    const done: TodoItem[] = [];

    for (const t of tasks) {
      if (t.status === 'completed') {
        done.push(t);
      } else if (!t.date || t.date < todayStr) {
        backlog.push(t);
      } else if (t.date === todayStr) {
        today.push(t);
      } else if (t.date <= weekEndStr) {
        week.push(t);
      }
    }

    return [
      { id: 'backlog', label: 'Backlog', icon: Layers, accent: '#8e8e93', tasks: backlog },
      { id: 'today', label: 'Today', icon: CalendarIcon, accent: '#a599ff', tasks: today },
      { id: 'week', label: 'This Week', icon: CalendarDays, accent: '#89dceb', tasks: week },
      { id: 'done', label: 'Done', icon: CheckCircle2, accent: '#5eda9e', tasks: done },
    ];
  }, [tasks, todayStr, weekEndStr]);

  const moveTask = useCallback(async (task: TodoItem, targetColumnId: ColumnDef['id']) => {
    if (!task.id) return;
    let updates: Partial<TodoItem> = {};
    if (targetColumnId === 'today') {
      updates = { date: todayStr, status: 'pending' };
    } else if (targetColumnId === 'done') {
      updates = { status: 'completed' };
    } else if (targetColumnId === 'backlog') {
      updates = { date: '', status: 'pending' };
    } else if (targetColumnId === 'week') {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      updates = { date: getLocalDateString(d), status: 'pending' };
    }

    try {
      await updateDoc(doc(db, 'todos', task.id), updates as any);
    } catch (e) {
      console.error('Failed to update task column in Firestore:', e);
    }
  }, [todayStr]);

  return (
    <div className="kanban-board-container">
      <div className="kanban-columns-grid">
        {columns.map((col) => {
          const Icon = col.icon;
          return (
            <div key={col.id} className="kanban-column">
              {/* Column Header */}
              <div className="kanban-col-header" style={{ borderColor: `${col.accent}30` }}>
                <div className="kanban-col-header-left">
                  <span className="kanban-col-dot" style={{ backgroundColor: col.accent }} />
                  <Icon size={16} color={col.accent} />
                  <span className="kanban-col-title">{col.label}</span>
                </div>
                <div className="kanban-col-count" style={{ backgroundColor: `${col.accent}18`, color: col.accent }}>
                  {col.tasks.length}
                </div>
              </div>

              {/* Cards Container */}
              <div className="kanban-cards-list">
                {col.tasks.length === 0 ? (
                  <div className="kanban-empty-column">
                    <Icon size={24} color={`${col.accent}40`} />
                    <span className="kanban-empty-text">No tasks in {col.label}</span>
                  </div>
                ) : (
                  col.tasks.map((task) => {
                    const priorityColor = PRIORITY_COLORS[task.priority || 'medium'] || '#a599ff';
                    const subtaskCount = task.subtasks?.length || 0;
                    const doneSubtasks = task.subtasks?.filter(s => s.completed || s.status === 'completed').length || 0;
                    const isMenuOpen = activeMenuTaskId === task.id;

                    return (
                      <div key={task.id} className="kanban-card-wrapper">
                        <div
                          className="kanban-card"
                          onClick={() => onTaskClick(task)}
                        >
                          {/* Priority stripe */}
                          <div className="kanban-card-priority" style={{ backgroundColor: priorityColor }} />

                          <div className="kanban-card-content">
                            {/* Tags */}
                            {task.tags && task.tags.length > 0 && (
                              <div className="kanban-tag-row">
                                {task.tags.slice(0, 3).map((tag) => (
                                  <span
                                    key={tag}
                                    className="kanban-tag-pill"
                                    style={{
                                      backgroundColor: `${tagColor(tag)}20`,
                                      color: tagColor(tag),
                                      borderColor: `${tagColor(tag)}40`,
                                    }}
                                  >
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}

                            {/* Title */}
                            <div className="kanban-card-title-row">
                              <span className={`kanban-card-title ${task.status === 'completed' ? 'completed' : ''}`}>
                                {task.title || task.text}
                              </span>
                              <button
                                type="button"
                                className="kanban-move-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveMenuTaskId(isMenuOpen ? null : (task.id || null));
                                }}
                                title="Move to..."
                              >
                                <MoreVertical size={14} />
                              </button>
                            </div>

                            {/* Footer chips */}
                            <div className="kanban-card-footer">
                              {task.timeSlot && (
                                <div className="kanban-footer-chip">
                                  <Clock size={11} />
                                  <span>{task.timeSlot}</span>
                                </div>
                              )}
                              {subtaskCount > 0 && (
                                <div className="kanban-footer-chip">
                                  <ListChecks size={11} />
                                  <span>{doneSubtasks}/{subtaskCount}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Move To Dropdown Menu */}
                        <AnimatePresence>
                          {isMenuOpen && (
                            <motion.div
                              initial={{ opacity: 0, y: -4 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -4 }}
                              className="kanban-move-menu"
                            >
                              <div className="kanban-move-menu-title">Move to:</div>
                              {columns.filter(c => c.id !== col.id).map(targetCol => (
                                <button
                                  type="button"
                                  key={targetCol.id}
                                  className="kanban-move-menu-item"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveMenuTaskId(null);
                                    moveTask(task, targetCol.id);
                                  }}
                                >
                                  <span className="kanban-col-dot" style={{ backgroundColor: targetCol.accent }} />
                                  <span>{targetCol.label}</span>
                                  <ArrowRight size={12} className="kanban-menu-arrow" />
                                </button>
                              ))}
                              <button
                                type="button"
                                className="kanban-move-menu-cancel"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveMenuTaskId(null);
                                }}
                              >
                                Cancel
                              </button>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
