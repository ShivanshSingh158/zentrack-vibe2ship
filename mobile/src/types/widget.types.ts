/**
 * widget.types.ts — ZenTrack Android Home Screen Widget Types
 */

export interface WidgetAgendaClass {
  id: string;
  subjectId: string;
  subjectName: string;
  time: string;
  room?: string;
  type: 'class' | 'lab';
  status: 'attended' | 'missed' | 'pending';
  idx: number;
}

export interface WidgetAgendaTask {
  id: string;
  title: string;
  timeSlot?: string;
  status: 'pending' | 'completed';
  priority?: 'urgent' | 'high' | 'medium' | 'low';
}

export interface TodayAgendaWidgetData {
  dateStr: string;        // YYYY-MM-DD
  displayDate: string;    // "Wed, Sep 1"
  zenScore: number;       // 0–100
  classes: WidgetAgendaClass[];
  tasks: WidgetAgendaTask[];
  totalClasses: number;
  attendedClasses: number;
  totalTasks: number;
  doneTasks: number;
  lastUpdated: number;
}

export type WidgetClickActionType =
  | 'mark_task_done'
  | 'mark_task_undone'
  | 'mark_class_present'
  | 'mark_class_absent'
  | 'open_app';

export interface WidgetClickActionPayload {
  action: WidgetClickActionType;
  taskId?: string;
  subjectId?: string;
  subjectName?: string;
  sessionIdx?: number;
  dateStr?: string;
  type?: 'class' | 'lab';
}
