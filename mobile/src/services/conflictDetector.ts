/**
 * Mobile Conflict Detector Engine
 * Ports the web app's proactive intelligence to React Native.
 */

export type ConflictSeverity = 'warning' | 'critical' | 'info';

export interface DetectedConflict {
  id: string;
  type: 
    | 'task_overload'
    | 'physical_double_load'
    | 'gym_timing'
    | 'assignment_overload'
    | 'no_time_for_high_priority'
    | 'attendance_risk'
    | 'exam_conflict';
  severity: ConflictSeverity;
  message: string;
  suggestion: string;
  modules: ('tasks' | 'gym' | 'academic' | 'habits')[];
}

export const detectConflicts = (appContext: any): DetectedConflict[] => {
  const conflicts: DetectedConflict[] = [];
  const { tasks = [], habitLogs = [], assignments = [], semesterSubjects = [] } = appContext;
  
  const today = new Date().toISOString().split('T')[0];
  
  // Basic Mocked Logic (as a placeholder for the full web engine)
  const todaysTasks = tasks.filter((t: any) => t.date === today && t.status !== 'completed');
  const estimatedMins = todaysTasks.reduce((acc: number, t: any) => acc + (t.estimatedMinutes || 0), 0);
  
  if (estimatedMins > 480) { // 8 hours
    conflicts.push({
      id: 'task_overload_today',
      type: 'task_overload',
      severity: 'warning',
      message: `You have ${Math.round(estimatedMins/60)} hours of work scheduled today.`,
      suggestion: 'Consider rescheduling low priority tasks to tomorrow.',
      modules: ['tasks']
    });
  }

  // More complex checks can be added here matching the web app precisely.
  
  return conflicts;
};
