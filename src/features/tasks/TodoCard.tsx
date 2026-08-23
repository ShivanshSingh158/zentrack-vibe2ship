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
            {/* Priority Indicator Stripe */}
            <div className="todo-priority-stripe" style={{ backgroundColor: priorityColor }} />

            {/* Main Row Content */}
            <div className="todo-row-main">
              {/* Drag Handle */}
              {!isBulkEdit && (
                <div {...provided.dragHandleProps} className="todo-drag-handle" onClick={e => e.stopPropagation()}>
                  <GripVertical size={14} />
                </div>
              )}

              {/* Checkbox */}
              {isBulkEdit ? (
                <button
                  type="button"
                  className={`todo-circular-checkbox bulk ${isSelected ? 'checked' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleSelection(todo.id!);
                  }}
                >
                  {isSelected && <Check size={12} strokeWidth={3} />}
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
                  {isDone && <Check size={12} strokeWidth={3} />}
                </button>
              )}

              {/* Title & Metadata Column */}
              <div className="todo-title-and-meta">
                <div className="todo-title-line">
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
                </div>

                {/* Meta Badges Row */}
                <div className="todo-meta-badges">
                  {/* Priority Dot */}
                  <span
                    className="priority-dot-badge"
                    style={{ backgroundColor: priorityColor }}
                    title={`Priority: ${todo.priority || 'medium'}`}
                  />

                  {/* Subtask count */}
                  {subtasks.length > 0 && (
                    <span className="meta-subtask-badge">
                      ☑ {stDone}/{subtasks.length}
                    </span>
                  )}

                  {/* Tags */}
                  {todo.tags && todo.tags.map(tag => (
                    <span
                      key={tag}
                      className="meta-tag-chip"
                      style={{
                        backgroundColor: `${tagColor(tag)}18`,
                        color: tagColor(tag),
                        borderColor: `${tagColor(tag)}30`,
                      }}
                    >
                      #{tag}
                    </span>
                  ))}

                  {/* Time Slot */}
                  {todo.timeSlot && (
                    <span className="meta-time-badge">
                      <Clock size={11} />
                      <span>{todo.timeSlot}</span>
                    </span>
                  )}

                  {/* Estimate */}
                  {computedMinutes ? (
                    <span className="meta-estimate-badge">
                      <Timer size={11} />
                      <span>{formatHoursDisplay(computedMinutes / 60)}</span>
                    </span>
                  ) : null}
                </div>

                {/* Subtask Progress Track */}
                {subtasks.length > 0 && (
                  <div className="todo-subtask-track">
                    <div
                      className="todo-subtask-progress"
                      style={{ width: `${(stDone / subtasks.length) * 100}%` }}
                    />
                  </div>
                )}
              </div>

              {/* Action Buttons Right */}
              {!isBulkEdit && (
                <div className="todo-actions-cluster" onClick={e => e.stopPropagation()}>
                  {subtasks.length > 0 && (
                    <button
                      type="button"
                      className="todo-action-icon-btn"
                      onClick={() => setExpandedTaskId(isExpanded ? null : todo.id!)}
                      title="Toggle Subtasks"
                    >
                      {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                  )}
                  <button
                    type="button"
                    className="todo-action-icon-btn edit-btn"
                    onClick={() => onEdit(todo)}
                    title="Edit Task"
                  >
                    <Edit2 size={13} />
                  </button>
                  {!isDone && (
                    <button
                      type="button"
                      className="todo-action-icon-btn timer-btn"
                      onClick={() => startTimer(todo.id!, todo.title || todo.text || 'Task', undefined, undefined, computedMinutes)}
                      title="Focus Timer"
                    >
                      <Timer size={13} />
                    </button>
                  )}
                  <button
                    type="button"
                    className="todo-action-icon-btn delete-btn"
                    onClick={() => handleDeleteTask(todo.id!)}
                    title="Delete Task"
                  >
                    <Trash2 size={13} />
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

