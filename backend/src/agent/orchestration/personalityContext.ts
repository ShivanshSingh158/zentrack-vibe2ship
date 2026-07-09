import { buildContextMemory } from '../memory/ContextEngine';
import { userLearningStore } from '../../services/userLearningStore';

export const buildPersonalityContext = async (
  role: string | undefined,
  appContext: any,
  getAgentMemory: () => Promise<string>
): Promise<string> => {
  const allTasks = appContext.tasks || [];
  const today2 = new Date().toISOString().split('T')[0];

  const behavioralDirective = userLearningStore.getAgentContext(role || 'AEGIS');

  switch (role) {
    case 'ORACLE': {
      const mem = await getAgentMemory();
      const liveCtx = buildContextMemory(allTasks, appContext.calendarEvents || [], appContext, mem);
      return behavioralDirective + liveCtx;
    }
    case 'AEGIS': {
      const mem = await getAgentMemory();
      const full = buildContextMemory(allTasks, appContext.calendarEvents || [], appContext, mem);
      const capped = full.length > 3500 ? full.substring(0, 3500) + '\n...[context capped for synthesis efficiency]\n\n' : full;
      return behavioralDirective + capped;
    }
    case 'CHRONOS': {
      const overdue = allTasks.filter((t: any) => t.status !== 'completed' && t.date && t.date < today2).length;
      const dueToday = allTasks.filter((t: any) => t.status !== 'completed' && t.date === today2).length;
      const todayEvents = (appContext.calendarEvents || [])
        .filter((e: any) => (e.start?.dateTime || e.start?.date || '').startsWith(today2))
        .map((e: any) => `${e.summary} at ${e.start?.dateTime?.split('T')[1]?.slice(0, 5) || 'all-day'}`)
        .join(', ');
      
      const peakHours = userLearningStore.getProfile().actualPeakHours;
      const peakHoursStr = peakHours.length > 0
        ? peakHours.slice(0, 4).map(h => `${h}:00`).join(', ')
        : '9:00, 14:00';
      const snapshot = `[LIVE SNAPSHOT] ${overdue} overdue, ${dueToday} due today. Today's events: ${todayEvents || 'none'}. Timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}. USER PEAK PRODUCTIVE HOURS: ${peakHoursStr} — ALWAYS prefer scheduling within these windows.\n\n`;
      return behavioralDirective + snapshot;
    }
    case 'ARGUS': {
      const overdue = allTasks.filter((t: any) => t.status !== 'completed' && t.date && t.date < today2);
      const highPri = allTasks.filter((t: any) => t.status !== 'completed' && (t.priority === 'high'));
      const snapshot = `[LIVE SNAPSHOT] ${overdue.length} overdue: ${overdue.slice(0, 3).map((t: any) => `"${t.title||t.text}" (${t.priority||'medium'})`).join(', ') || 'none'}. High priority active: ${highPri.length}.\n\n`;
      return behavioralDirective + snapshot;
    }
    case 'HERMES': {
      const snapshot = `[LIVE SNAPSHOT] Pending tasks: ${allTasks.filter((t: any) => t.status !== 'completed').length}. Timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}.\n\n`;
      return behavioralDirective + snapshot;
    }
    case 'ATLAS': {
      const snapshot = `[LIVE SNAPSHOT] Total active tasks: ${allTasks.filter((t: any) => t.status !== 'completed').length}. Active goals: ${(appContext.goals || []).filter((g: any) => g.status === 'active').length}.\n\n`;
      return behavioralDirective + snapshot;
    }
    default:
      return behavioralDirective;
  }
};
