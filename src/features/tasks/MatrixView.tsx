import React from 'react';
import { Flame, Calendar as CalendarIcon, Users, Trash2 } from 'lucide-react';
import { getLocalDateString } from '../../utils/dateUtils';
import type { TodoItem } from '../../types';

interface MatrixViewProps {
  tasks: TodoItem[];
  onTaskClick: (task: TodoItem) => void;
}

export const MatrixView: React.FC<MatrixViewProps> = ({ tasks, onTaskClick }) => {
  const todayStr = getLocalDateString(new Date());
  const tomorrowObj = new Date();
  tomorrowObj.setDate(tomorrowObj.getDate() + 1);
  const tomorrowStr = getLocalDateString(tomorrowObj);

  const isUrgentDate = (date?: string) => {
    if (!date) return true; // Inbox/No date = urgent
    return date <= tomorrowStr;
  };

  const isImportant = (priority?: string) => {
    return priority === 'high' || priority === 'P1';
  };

  const priorityIs = (p: string | undefined, str1: string, str2: string) => {
    return p === str1 || p === str2;
  };

  // Q1: Urgent & Important
  const q1 = tasks.filter(t => t.status !== 'completed' && isImportant(t.priority) && isUrgentDate(t.date));

  // Q2: Not Urgent & Important OR Medium priority
  const q2 = tasks.filter(t => t.status !== 'completed' && ((isImportant(t.priority) && !isUrgentDate(t.date)) || priorityIs(t.priority, 'medium', 'P2')));

  // Q3: Urgent & Not Important
  const q3 = tasks.filter(t => t.status !== 'completed' && priorityIs(t.priority, 'low', 'P3') && isUrgentDate(t.date));

  // Q4: Not Urgent & Not Important
  const q4 = tasks.filter(t => t.status !== 'completed' && priorityIs(t.priority, 'low', 'P3') && !isUrgentDate(t.date));

  const renderQuadrant = (
    title: string,
    sub: string,
    quadrantTasks: TodoItem[],
    bgColor: string,
    Icon: any,
    color: string
  ) => (
    <div className="matrix-quadrant" style={{ borderColor: `${color}30` }}>
      <div className="matrix-quadrant-header" style={{ backgroundColor: bgColor }}>
        <div className="matrix-quadrant-header-left">
          <Icon size={16} color={color} />
          <div>
            <div className="matrix-quadrant-title" style={{ color }}>{title}</div>
            <div className="matrix-quadrant-sub">{sub}</div>
          </div>
        </div>
        <div className="matrix-count-badge" style={{ backgroundColor: `${color}20`, color }}>
          {quadrantTasks.length}
        </div>
      </div>

      <div className="matrix-quadrant-body">
        {quadrantTasks.length === 0 ? (
          <div className="matrix-empty-text">No tasks in this quadrant</div>
        ) : (
          quadrantTasks.map((task) => (
            <div
              key={task.id}
              className="matrix-task-item"
              onClick={() => onTaskClick(task)}
              style={{ borderLeftColor: color }}
            >
              <span className="matrix-task-title">{task.title || task.text}</span>
              {task.date && (
                <span className="matrix-task-date">
                  {task.date === todayStr ? 'Today' : task.date === tomorrowStr ? 'Tomorrow' : task.date}
                </span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );

  return (
    <div className="matrix-grid-container">
      <div className="matrix-grid-row">
        {renderQuadrant('DO FIRST', 'Urgent & Important', q1, 'rgba(255, 105, 97, 0.08)', Flame, '#FF6961')}
        {renderQuadrant('SCHEDULE', 'Not Urgent & Important', q2, 'rgba(165, 153, 255, 0.08)', CalendarIcon, '#A599FF')}
      </div>
      <div className="matrix-grid-row">
        {renderQuadrant('DELEGATE', 'Urgent & Not Important', q3, 'rgba(255, 159, 77, 0.08)', Users, '#FF9F4D')}
        {renderQuadrant('ELIMINATE', 'Not Urgent & Not Important', q4, 'rgba(94, 218, 158, 0.08)', Trash2, '#5EDA9E')}
      </div>
    </div>
  );
};
