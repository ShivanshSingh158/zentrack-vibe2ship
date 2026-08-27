import React from 'react';
import { GripVertical, Check, ChevronDown, ChevronRight, Edit2, Timer, Trash2, Calendar as CalendarIcon, Clock, X, Plus } from 'lucide-react';
import { Draggable } from '@hello-pangea/dnd';
import { motion, AnimatePresence } from 'framer-motion';
import { formatHoursDisplay, extractTaskDurationMinutes } from '../../utils/dateUtils';
import type { TodoItem, TodoSubtask } from '../../types';

interface TodoCardProps {
  todo: TodoItem;
  index: number;
  isExpanded: boolean;
  isSelected: boolean;
  isBulkEdit: boolean;
  newSubtaskText: string;
  isBlocked: boolean;
  toggleSelection: (id: string) => void;
  toggleTodoComplete: (todo: TodoItem) => void;
  setExpandedTaskId: (id: string | null) => void;
  handleDeleteTask: (id: string) => void;
  toggleSubtask: (taskId: string, subtaskId: string) => void;
  handleDeleteSubtask: (taskId: string, subtaskId: string) => void;
  addSubtask: (taskId: string, text: string) => void;
  setNewSubtaskText: (taskId: string, text: string) => void;
  startTimer: (taskId: string, title: string, x?: any, y?: any, estimatedMinutes?: number) => void;
  onEdit: (todo: TodoItem) => void;
}

const TAG_PALETTE = ['#a599ff', '#60a5fa', '#34d399', '#f87171', '#fb923c', '#e879f9', '#facc15', '#38bdf8'];
function tagColor(tag: string): string {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  return TAG_PALETTE[Math.abs(hash) % TAG_PALETTE.length];
}

function formatDateLabel(dateStr?: string): string {
  if (!dateStr) return '';
  const today = new Date().toISOString().split('T')[0];
  if (dateStr === today) return 'Today';
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

export const TodoCard = React.memo(({
  todo, index, isExpanded, isSelected, isBulkEdit, newSubtaskText, isBlocked,
  toggleSelection, toggleTodoComplete, setExpandedTaskId, handleDeleteTask,
  toggleSubtask, handleDeleteSubtask, addSubtask, setNewSubtaskText, startTimer, onEdit
}: TodoCardProps) => {
  const subtasks = todo.subtasks || [];
  const stDone = subtasks.filter(s => s.completed || s.status === 'completed').length;
  const isDone = todo.status === 'completed';

  const computedMinutes = React.useMemo(() => {
    return extractTaskDurationMinutes(
      todo.estimatedMinutes || (todo as any).durationMinutes || (todo as any).duration,
      todo.timeSlot,
      todo.title || todo.text
    );
  }, [todo.timeSlot, todo.estimatedMinutes, (todo as any).durationMinutes, (todo as any).duration, todo.title, todo.text]);

  const priorityColor = todo.priority === 'high' || todo.priority === 'P1'
    ? '#ff6961'
    : todo.priority === 'medium' || todo.priority === 'P2'
    ? '#ff9f4d'
    : '#5eda9e';

  return (
    <Draggable key={todo.id!} draggableId={todo.id!} index={index} isDragDisabled={isBulkEdit}>
      {(provided, snapshot) => (
        <motion.div
          layout
          initial={{ opacity: 0, y: 8, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.15 } }}
          transition={{ type: "spring", stiffness: 450, damping: 30 }}
          ref={provided.innerRef}
          {...provided.draggableProps}
          style={{
            display: 'flex', flexDirection: 'column', gap: 0,
            opacity: snapshot.isDragging ? 0.85 : 1,
            ...provided.draggableProps.style
          }}
        >
          <div
            className={`todo-card-row ${isSelected ? 'selected-row' : ''} ${isDone ? 'completed-row' : ''}`}
            onClick={() => !isBulkEdit && setExpandedTaskId(isExpanded ? null : todo.id!)}
          >
            {/* Main Things 3 / Designer Luxury Row */}
            <div className="todo-row-main">
              {/* Drag Handle */}
              {!isBulkEdit && (
                <div {...provided.dragHandleProps} className="todo-drag-handle" onClick={e => e.stopPropagation()} title="Drag to reorder">
                  <GripVertical size={13} />
                </div>
              )}

              {/* Tactile Circle Checkbox */}
              {isBulkEdit ? (
                <button
                  type="button"
                  className={`todo-circular-checkbox bulk ${isSelected ? 'checked' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleSelection(todo.id!);
                  }}
                >
                  {isSelected && <Check size={11} strokeWidth={3} />}
                </button>
              ) : (
                <button
                  type="button"
                  className={`todo-circular-checkbox ${isDone ? 'checked' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isBlocked) {
                      toast.error("This task is blocked by other tasks! Complete them first.");
                      return;
                    }
                    toggleTodoComplete(todo);
                  }}
                  aria-label="Mark complete"
                >
                  {isDone && <Check size={11} strokeWidth={3} />}
                </button>
              )}

              {/* Content Block (Title + Sub-Metadata Line) */}
              <div className="todo-content-block">
                {/* Line 1: Title & Priority */}
                <div className="todo-title-row">
                  <span
                    className={`todo-title-text ${isDone ? 'completed-text' : ''}`}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      onEdit(todo);
                    }}
                    title={todo.title || todo.text}
                  >
                    {todo.title || todo.text}
                  </span>
                  
                  {todo.priority && todo.priority !== 'low' && (
                    <span
                      className="priority-dot-badge"
                      style={{ backgroundColor: priorityColor }}
                      title={`Priority: ${todo.priority}`}
                    />
                  )}
                </div>

                {/* Line 2: Subtle Metadata (Time range, duration, recurrence, date, tags) */}
                <div className="todo-submeta-row">
                  {/* Time Slot / Range */}
                  {todo.timeSlot && (
                    <span className="submeta-time-text">
                      <Clock size={11} />
                      <span>{todo.timeSlot}</span>
                    </span>
                  )}

                  {/* Date or Recurrence */}
                  {todo.date && (
                    <span className="submeta-date-text">
                      <CalendarIcon size={11} />
                      <span>{formatDateLabel(todo.date)}</span>
                    </span>
                  )}

                  {/* Duration Focus */}
                  {computedMinutes ? (
                    <span className="submeta-duration-chip">
                      <Timer size={11} />
                      <span>{formatHoursDisplay(computedMinutes / 60)}</span>
                    </span>
                  ) : null}

                  {/* Subtask count */}
                  {subtasks.length > 0 && (
                    <span
                      className="submeta-subtasks-chip"
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedTaskId(isExpanded ? null : todo.id!);
                      }}
                      title="Click to view subtasks"
                    >
                      ☑ {stDone}/{subtasks.length} subtasks
                    </span>
                  )}

                  {/* Tags */}
                  {todo.tags && todo.tags.map(tag => (
                    <span
                      key={tag}
                      className="submeta-tag-chip"
                      style={{
                        color: tagColor(tag),
                        backgroundColor: `${tagColor(tag)}15`,
                        borderColor: `${tagColor(tag)}30`,
                      }}
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              </div>

              {/* Action Buttons Right (Hover Action Cluster) */}
              {!isBulkEdit && (
                <div className="todo-actions-cluster" onClick={e => e.stopPropagation()}>
                  {!isDone && (
                    <button
                      type="button"
                      className="todo-focus-play-btn"
                      onClick={() => startTimer(todo.id!, todo.title || todo.text || 'Task', undefined, undefined, computedMinutes)}
                      title="Launch Pomodoro Focus Timer"
                    >
                      <Timer size={12} />
                      <span>Focus</span>
                    </button>
                  )}
                  {subtasks.length > 0 && (
                    <button
                      type="button"
                      className="todo-action-icon-btn"
                      onClick={() => setExpandedTaskId(isExpanded ? null : todo.id!)}
                      title="Toggle Subtasks"
                    >
                      {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                    </button>
                  )}
                  <button
                    type="button"
                    className="todo-action-icon-btn edit-btn"
                    onClick={() => onEdit(todo)}
                    title="Edit Task"
                  >
                    <Edit2 size={12} />
                  </button>
                  <button
                    type="button"
                    className="todo-action-icon-btn delete-btn"
                    onClick={() => handleDeleteTask(todo.id!)}
                    title="Delete Task"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              )}
            </div>

            {/* Subtasks Expanded Drawer */}
            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="todo-subtasks-drawer"
                  onClick={e => e.stopPropagation()}
                >
                  <div className="subtasks-inner-container">
                    {subtasks.map((st) => {
                      const stCompleted = st.completed || st.status === 'completed';
                      return (
                        <div key={st.id} className="subtask-item-row">
                          <button
                            type="button"
                            className={`subtask-checkbox ${stCompleted ? 'checked' : ''}`}
                            onClick={() => toggleSubtask(todo.id!, st.id)}
                          >
                            {stCompleted && <Check size={10} strokeWidth={3} />}
                          </button>
                          <span className={`subtask-item-title ${stCompleted ? 'completed-subtask' : ''}`}>
                            {st.title}
                          </span>
                          <button
                            type="button"
                            className="subtask-item-delete"
                            onClick={() => handleDeleteSubtask(todo.id!, st.id)}
                            title="Delete Subtask"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      );
                    })}

                    {/* Inline Add Subtask Input */}
                    <div className="add-subtask-quick-wrap">
                      <input
                        type="text"
                        placeholder="Add subtask..."
                        value={newSubtaskText || ''}
                        onChange={e => setNewSubtaskText(todo.id!, e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && newSubtaskText?.trim()) {
                            e.preventDefault();
                            addSubtask(todo.id!, newSubtaskText.trim());
                            setNewSubtaskText(todo.id!, '');
                          }
                        }}
                        className="quick-subtask-input"
                      />
                      <button
                        type="button"
                        className="quick-subtask-btn"
                        onClick={() => {
                          if (newSubtaskText?.trim()) {
                            addSubtask(todo.id!, newSubtaskText.trim());
                            setNewSubtaskText(todo.id!, '');
                          }
                        }}
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </Draggable>
  );
});

export const CompletedTodoItem = React.memo(({
  todo,
  toggleTodoComplete,
  handleDeleteTask,
  onEdit,
}: {
  todo: TodoItem;
  toggleTodoComplete: (todo: TodoItem) => void;
  handleDeleteTask: (id: string) => void;
  onEdit: (todo: TodoItem) => void;
}) => {
  return (
    <div className="completed-todo-card">
      <button
        type="button"
        className="todo-circular-checkbox checked"
        onClick={() => toggleTodoComplete(todo)}
        title="Unmark completed"
      >
        <Check size={12} strokeWidth={3} />
      </button>

      <span
        className="completed-todo-title"
        onDoubleClick={() => onEdit(todo)}
      >
        {todo.title || todo.text}
      </span>

      {todo.actualMinutes ? (
        <span className="completed-time-logged-badge">
          {todo.actualMinutes}m logged
        </span>
      ) : null}

      <button
        type="button"
        className="completed-delete-btn"
        onClick={() => handleDeleteTask(todo.id!)}
        title="Delete"
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
});

