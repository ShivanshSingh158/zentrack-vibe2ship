import React from 'react';
import { GripVertical, Check, ChevronDown, ChevronRight, Edit2, Timer, Trash2, Calendar as CalendarIcon, X } from 'lucide-react';
import { Draggable } from '@hello-pangea/dnd';
import { toast } from 'sonner';

import { getUrgencyLevel, getCountdownText, useLiveTick } from '../../hooks/useDeadlineWatcher';
import { useEscalation } from '../../hooks/useEscalation';
import { formatHoursDisplay } from '../../utils/dateUtils';
import type { TodoItem } from '../../types';

interface TodoCardProps {
  todo: any; // We'll type this as any to avoid tight coupling right now, ideally TodoItem
  index: number;
  isExpanded: boolean;
  isSelected: boolean;
  isBulkEdit: boolean;
  newSubtaskText: string;
  isBlocked: boolean;
  toggleSelection: (id: string) => void;
  toggleTodoComplete: (todo: any) => void;
  setExpandedTaskId: (id: string | null) => void;
  handleDeleteTask: (id: string) => void;
  toggleSubtask: (taskId: string, subtaskId: string) => void;
  handleDeleteSubtask: (taskId: string, subtaskId: string) => void;
  addSubtask: (taskId: string, text: string) => void;
  setNewSubtaskText: (taskId: string, text: string) => void;
  startTimer: (taskId: string, title: string, x?: any, y?: any, estimatedMinutes?: number) => void;
  onEdit: (todo: any) => void;
}

export const TodoCard = React.memo(({
  todo, index, isExpanded, isSelected, isBulkEdit, newSubtaskText, isBlocked,
  toggleSelection, toggleTodoComplete, setExpandedTaskId, handleDeleteTask,
  toggleSubtask, handleDeleteSubtask, addSubtask, setNewSubtaskText, startTimer, onEdit
}: TodoCardProps) => {
  const subtasks = todo.subtasks || [];
  const stDone = subtasks.filter((s: any) => s.status === 'completed').length;
  
  useLiveTick(); // forces re-render every minute
  const urgency = (todo.date && todo.status !== 'completed') ? getUrgencyLevel(todo.date) : 'normal';
  const escalation = useEscalation(todo.status === 'completed' ? null : todo.date);

  // ✅ FIX: Calculate real DeadlineDNA — was hardcoded to 100 (DEDUCTION 3.1)
  // Score = urgencyRatio × priorityWeight × (1 - subtaskCompletionBonus)
  // High score = task is urgent and needs attention
  const deadlineDNA: number = React.useMemo(() => {
    if (todo.status === 'completed' || !todo.date) return 0;
    const hoursLeft = (new Date(todo.date + 'T23:59:59').getTime() - Date.now()) / 3_600_000;
    if (hoursLeft < 0) return 100; // overdue = max urgency
    const estimatedH = (todo.estimatedMinutes || 60) / 60;
    const urgencyRatio = Math.max(0, Math.min(1, estimatedH / Math.max(0.1, hoursLeft)));
    const priorityMult = todo.priority === 'high' ? 1.5 : todo.priority === 'medium' ? 1.0 : 0.6;
    const subtaskCompletionBonus = subtasks.length > 0 ? (stDone / subtasks.length) * 0.3 : 0;
    return Math.round(Math.min(100, urgencyRatio * priorityMult * 100 * (1 - subtaskCompletionBonus)));
  }, [todo.date, todo.estimatedMinutes, todo.priority, todo.status, subtasks.length, stDone]);

  // --- Styling based on Urgency ---
  let containerStyle: React.CSSProperties = {
    flexDirection: 'column',
    gap: '0.5rem',
    padding: '0.7rem 0.9rem',
    position: 'relative',
    overflow: 'hidden',
    borderColor: escalation.border,
    background: escalation.background,
    animation: escalation.animation
  };
  
  if (isSelected) {
    containerStyle = { ...containerStyle, background: 'rgba(99,102,241,0.1)', borderColor: 'var(--accent-primary)' };
  }

  return (
    <Draggable key={todo.id!} draggableId={todo.id!} index={index} isDragDisabled={isBulkEdit}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          style={{
            display: 'flex', flexDirection: 'column', gap: 0,
            opacity: snapshot.isDragging ? 0.85 : 1,
            ...provided.draggableProps.style
          }}
        >
          <div
            className={`todo-item priority-${todo.priority} ${isSelected ? 'selected-item' : ''}`}
            style={containerStyle}
          >
            {/* Escalation Overlay Suggestion */}
            {(urgency === 'critical' || urgency === 'overdue') && (
               <div style={{ position: 'absolute', top: 0, left: 0, width: '3px', height: '100%', background: escalation.accent, boxShadow: `0 0 10px ${escalation.accent}` }} />
            )}
            
            {/* ── ROW 1: checkbox + single-line title ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', width: '100%', minWidth: 0 }}>
              {/* Drag handle */}
              {!isBulkEdit && (
                <div {...provided.dragHandleProps} style={{ flexShrink: 0, color: 'var(--text-muted)', opacity: 0.35, lineHeight: 0 }}>
                  <GripVertical size={13} />
                </div>
              )}

              {/* Checkbox */}
              {isBulkEdit ? (
                <button
                  className={`todo-checkbox ${isSelected ? 'checked' : ''}`}
                  onClick={() => toggleSelection(todo.id!)}
                  style={{ borderRadius: '4px', flexShrink: 0 }}
                >
                  {isSelected && <Check size={13} strokeWidth={3} />}
                </button>
              ) : (
                <button
                  className="todo-checkbox"
                  onClick={() => {
                    if (isBlocked) {
                      toast.error("This task is blocked by other tasks! Complete them first.");
                      return;
                    }
                    toggleTodoComplete(todo);
                  }}
                  aria-label="Mark complete"
                  style={{ flexShrink: 0, opacity: isBlocked ? 0.5 : 1, cursor: isBlocked ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  {isBlocked && <span style={{fontSize: '10px'}}>🔒</span>}
                </button>
              )}

              {/* Title — ONE line, truncates with ellipsis */}
              <span
                className="todo-text"
                onDoubleClick={() => onEdit(todo)}
                onClick={() => !isBulkEdit && setExpandedTaskId(isExpanded ? null : todo.id!)}
                title={todo.title}
                style={{
                  flex: 1, minWidth: 0, display: 'block', whiteSpace: 'nowrap',
                  overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '0.9rem',
                  fontWeight: 600, lineHeight: 1.3, cursor: 'pointer',
                }}
              >
                {todo.title}
              </span>
            </div>

            {/* ── ROW 2: priority dot + meta (left) · action buttons (right) ── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingLeft: isBulkEdit ? '1.5rem' : '2.1rem', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap', minWidth: 0, flex: 1 }}>
                <span className={`todo-priority ${todo.priority}`} title={todo.priority} style={{ flexShrink: 0 }} />

                {todo.subject && (
                  <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.45rem', borderRadius: '9999px', background: 'rgba(139,92,246,0.13)', color: '#a78bfa', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0 }}>
                    {todo.subject}
                  </span>
                )}
                {urgency === 'overdue' && (
                  <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', borderRadius: '9999px', background: 'rgba(239,68,68,0.12)', color: '#f87171', fontWeight: 700, flexShrink: 0 }}>
                    🚨 OVERDUE
                  </span>
                )}
                {(urgency === 'urgent' || urgency === 'critical') && (
                  <span style={{ fontSize: '0.65rem', color: urgency === 'critical' ? '#ef4444' : '#f97316', fontWeight: 700, flexShrink: 0 }}>
                    ⏱ {getCountdownText(todo.date)}
                  </span>
                )}
                {todo.commitmentTo && (
                  <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', borderRadius: '9999px', border: '1px solid rgba(236,72,153,0.3)', color: '#ec4899', display: 'flex', alignItems: 'center', gap: '0.2rem', flexShrink: 0 }}>
                    🤝 Promised to: {todo.commitmentTo}
                  </span>
                )}
                {isBlocked && (
                  <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', borderRadius: '9999px', background: 'rgba(107,114,128,0.2)', color: '#9ca3af', display: 'flex', alignItems: 'center', gap: '0.2rem', flexShrink: 0 }}>
                    🔒 Blocked
                  </span>
                )}
                {todo.energyRequirement && (
                  <span style={{ fontSize: '0.65rem', color: todo.energyRequirement === 'high' ? '#ef4444' : todo.energyRequirement === 'medium' ? '#f59e0b' : '#3b82f6', flexShrink: 0 }}>
                    ⚡ {todo.energyRequirement.toUpperCase()}
                  </span>
                )}
                {todo.isRecurring && (
                  <span style={{ fontSize: '0.65rem', color: 'var(--accent-primary)', fontWeight: 600, flexShrink: 0 }}>↻</span>
                )}
                {todo.timeSlot && (
                  <span style={{ fontSize: '0.7rem', color: '#818cf8', display: 'flex', alignItems: 'center', gap: '0.15rem', fontWeight: 600, flexShrink: 0 }}>
                    <CalendarIcon size={11} />{todo.timeSlot}
                  </span>
                )}
                {todo.estimatedMinutes && (
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.15rem', flexShrink: 0 }}>
                    <Timer size={11} />{formatHoursDisplay(todo.estimatedMinutes / 60)}
                  </span>
                )}
                {subtasks.length > 0 && (
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', flexShrink: 0 }}>
                    ☑ {stDone}/{subtasks.length}
                  </span>
                )}
              </div>

              {!isBulkEdit && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0', flexShrink: 0 }}>
                  <button className="btn-icon" onClick={(e) => { e.stopPropagation(); setExpandedTaskId(isExpanded ? null : todo.id!); }} title="Subtasks" style={{ padding: '0.25rem 0.3rem' }}>
                    {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                  </button>
                  <button className="btn-icon" onClick={(e) => { e.stopPropagation(); onEdit(todo); }} title="Edit" style={{ padding: '0.25rem 0.3rem' }}>
                    <Edit2 size={14} />
                  </button>
                  {todo.status !== 'completed' && (
                    <button className="btn-icon" onClick={(e) => { e.stopPropagation(); startTimer(todo.id!, todo.title, undefined, undefined, todo.estimatedMinutes); }} title="Pomodoro" style={{ padding: '0.25rem 0.3rem', color: 'var(--accent-primary)' }}>
                      <Timer size={14} />
                    </button>
                  )}
                  <button className="todo-delete" onClick={(e) => { e.stopPropagation(); handleDeleteTask(todo.id!); }} aria-label="Delete" style={{ padding: '0.25rem 0.3rem' }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </div>

            {subtasks.length > 0 && (
              <div style={{ paddingLeft: isBulkEdit ? '1.5rem' : '2.1rem' }}>
                <div style={{ height: '3px', background: 'var(--bg-base)', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ width: `${(stDone / subtasks.length) * 100}%`, height: '100%', background: 'var(--accent-primary)', transition: 'width 0.3s ease' }} />
                </div>
              </div>
            )}
          </div>

          {(urgency === 'critical' || urgency === 'overdue') && !isBulkEdit && !isExpanded && (
            <div style={{ padding: '0.5rem 0.9rem', background: 'rgba(239,68,68,0.05)', borderTop: `1px solid ${escalation.border}`, display: 'flex', gap: '0.5rem' }}>
              <button className="btn-primary" onClick={(e) => { e.stopPropagation(); window.dispatchEvent(new CustomEvent('simulate-recovery-plan', { detail: todo })); }} style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem', flex: 1, background: escalation.accent, color: '#fff' }}>
                Create Recovery Plan
              </button>
              {urgency === 'overdue' && (
                <button className="btn-secondary" onClick={(e) => { e.stopPropagation(); window.dispatchEvent(new CustomEvent('simulate-extension-request', { detail: todo })); }} style={{ fontSize: '0.75rem', padding: '0.3rem 0.6rem', flex: 1 }}>
                  Draft Extension Email
                </button>
              )}
            </div>
          )}

          {isExpanded && !isBulkEdit && (
            <div style={{ marginLeft: '4rem', padding: '0.75rem 1rem', background: 'rgba(0,0,0,0.15)', borderRadius: '0 0 var(--radius-md) var(--radius-md)', borderTop: 'none', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              {subtasks.map((st: any) => (
                <div key={st.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.3rem 0' }}>
                  <button
                    className={`todo-checkbox ${st.status === 'completed' ? 'checked' : ''}`}
                    onClick={() => toggleSubtask(todo.id!, st.id)}
                    style={{ width: '18px', height: '18px', borderRadius: '4px' }}
                    role="checkbox" aria-checked={st.status === 'completed'} aria-label={`Mark subtask ${st.status === 'completed' ? 'incomplete' : 'complete'}`}
                  >
                    {st.status === 'completed' && <Check size={10} strokeWidth={3} />}
                  </button>
                  <span style={{ flex: 1, fontSize: '0.85rem', color: st.status === 'completed' ? 'var(--text-muted)' : 'var(--text-primary)', textDecoration: st.status === 'completed' ? 'line-through' : 'none' }}>
                    {st.title || st.text}
                  </span>
                  <button className="btn-icon" onClick={() => handleDeleteSubtask(todo.id!, st.id)} style={{ padding: '0.2rem' }} aria-label="Delete subtask">
                    <X size={12} />
                  </button>
                </div>
              ))}
              {subtasks.length > 0 && stDone === subtasks.length && todo.status !== 'completed' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0.75rem', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: '8px', marginTop: '0.25rem', animation: 'pulse 2s ease-in-out infinite' }}>
                  <Check size={14} style={{ color: '#10b981', flexShrink: 0 }} />
                  <span style={{ fontSize: '0.8rem', color: '#10b981', fontWeight: 600, flex: 1 }}>All subtasks done! Mark task complete?</span>
                  <button onClick={() => toggleTodoComplete(todo)} style={{ padding: '0.2rem 0.6rem', borderRadius: '6px', background: 'rgba(16,185,129,0.2)', border: '1px solid rgba(16,185,129,0.4)', color: '#10b981', fontWeight: 700, cursor: 'pointer', fontSize: '0.78rem' }}>✓ Done</button>
                </div>
              )}
              <form onSubmit={(e) => { e.preventDefault(); addSubtask(todo.id!, newSubtaskText); }} style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                <input
                  type="text" placeholder="Add a subtask..." value={newSubtaskText || ''} onChange={e => setNewSubtaskText(todo.id!, e.target.value)}
                  style={{ flex: 1, background: 'transparent', border: '1px solid var(--border-subtle)', padding: '0.4rem 0.6rem', borderRadius: '6px', fontSize: '0.85rem', color: 'var(--text-primary)' }}
                />
                {todo.status !== 'completed' && (
                  <button type="button" onClick={() => startTimer(todo.id!, todo.title, undefined, undefined, todo.estimatedMinutes)} className="btn-secondary show-on-mobile-only" style={{ padding: '0.4rem 0.6rem', display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.78rem' }} title="Start Pomodoro">
                    <Timer size={13} /> Focus
                  </button>
                )}
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
TodoCard.displayName = 'TodoCard';

export const CompletedTodoItem = React.memo(({ todo, isSelected, isBulkEdit, toggleSelection, toggleTodoComplete, handleDeleteTask }: any) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      <div className={`todo-item completed ${isSelected ? 'selected-item' : ''}`} style={isSelected ? { background: 'rgba(99, 102, 241, 0.1)', borderColor: 'var(--accent-primary)' } : {}}>
        <div style={{ padding: '0.2rem', width: '22px' }}></div>
        
        {isBulkEdit ? (
          <button className={`todo-checkbox ${isSelected ? 'checked' : ''}`} onClick={() => toggleSelection(todo.id!)} style={{ borderRadius: '4px' }}>
            {isSelected && <Check size={14} strokeWidth={3} />}
          </button>
        ) : (
          <button className="todo-checkbox checked" onClick={() => toggleTodoComplete(todo)} aria-label="Mark incomplete" role="checkbox" aria-checked={true}>
            <Check size={14} strokeWidth={3} />
          </button>
        )}
        
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <span className="todo-text">{todo.title}</span>
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
