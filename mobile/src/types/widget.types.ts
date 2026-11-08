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
  status: 'attended' | 'missed' | 'cancelled' | 'pending';
  idx: number;
}

export interface WidgetAgendaTask {
  id: string;
  title: string;
  timeSlot?: string;
  status: 'pending' | 'completed';
  priority?: 'urgent' | 'high' | 'medium' | 'low';
}

export interface WidgetAgendaItem {
  id: string;
  type: 'class' | 'lab' | 'task' ;
  title: string;
  subtitle?: string;
  timeStr: string;
  timeMins: number;
  status: 'attended' | 'missed' | 'cancelled' | 'completed' | 'pending';
  subjectId?: string;
  subjectName?: string;
  sessionIdx?: number;
  taskId?: string;
}

export interface TodayAgendaWidgetData {
  dateStr: string;        // YYYY-MM-DD
  displayDate: string;    // "Wed, Sep 1"
  zenScore: number;       // 0–100
  streak?: number;        // Active consistency day streak (e.g. 7)
  isHoliday?: boolean;
  items: WidgetAgendaItem[];
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
  | 'mark_class_undo'
  | 'open_app'
          ;

export interface WidgetClickActionPayload {
  action: WidgetClickActionType;
  taskId?: string;
  subjectId?: string;
  subjectName?: string;
  sessionIdx?: number;
  dateStr?: string;
  type?: 'class' | 'lab';
  target?: string;
  }

