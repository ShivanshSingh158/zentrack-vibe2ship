/**
 * @file navigation.executor.ts
 */
import { addDoc, collection, updateDoc, doc, deleteDoc, query, where, getDocs } from 'firebase/firestore';
import { db, auth } from '../../services/firebase';
import { addEventToGoogleCalendar, deleteGoogleCalendarEvent } from '../../services/googleCalendar';
import { getLocalDateString } from '../../utils/dateUtils';
import { logApi, logWebSocket } from '../../utils/networkLogger';
import { recordApprovalRejection, recordApprovalTimeout, recordApprovalGrant, recordEmailSent, recordGhostTaskCreated } from '../../services/agentMemoryPersistence';
import { userLearningStore } from '../../services/userLearningStore';
import {
  fetchUnreadEmails,
  fetchEmailThread,
  sendEmail,
  replyToEmail,
  archiveEmail,
  trashEmail,
  createGoogleDoc,
  writeToGoogleDoc,
  readGoogleDoc,
  searchGoogleDrive,
  trashDriveFile,
  listDriveFiles,
  openDriveFile,
  getFilePdfLink,
  createGoogleMeet,
  createDraftEmail,
  listCalendarEventsOnDate,
  updateCalendarEvent,
} from '../../services/googleWorkspace';
import { requireGoogleAuth, requestApproval } from './shared';
import type { ToolResult } from './shared';


export const executeNavigationTools = async (
  toolName: string,
  args: any,
  appContext: any,
  signal?: AbortSignal,
  depth: number = 0
): Promise<ToolResult | null> => {
  const user = auth.currentUser;
  if (!user) return { success: false, data: null, message: "Not authenticated. User is not logged in." };
  const today = getLocalDateString(new Date());

  switch (toolName) {
case 'navigate_to_module': {
      const route = args.route as string;
      if (!route) return { success: false, data: null, message: 'route is required for navigate_to_module' };

      // ✅ FEAT-6 FIX: Detect external-intent routes and open them in a new tab.
      // Previously NAVIGATOR would dispatch agent-navigate for routes like "gmail" or "drive"
      // which the React Router ignored, leaving the user confused with no visual feedback.
      const EXTERNAL_ROUTES: Record<string, string> = {
        'gmail': 'https://mail.google.com',
        'drive': 'https://drive.google.com',
        'calendar-web': 'https://calendar.google.com',
        'docs': 'https://docs.google.com',
        'sheets': 'https://sheets.google.com',
        'meet': 'https://meet.google.com',
        'youtube': 'https://youtube.com',
      };
      const externalUrl = EXTERNAL_ROUTES[route.replace('/', '').toLowerCase()];
      if (externalUrl) {
        if (typeof window !== 'undefined') window.open(externalUrl, '_blank', 'noopener,noreferrer');
        return { success: true, data: { url: externalUrl }, message: `✅ Opened ${route} in a new browser tab: ${externalUrl}` };
      }

      // Dispatch event for React Router to pick up
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('agent-navigate', {
          detail: {
            route,
            subView: args.subView,
            lectureTopicTitle: args.lectureTopicTitle,
            lectureTitle: args.lectureTitle,
          }
        }));
      }

      logApi('POST', `/api/v1/navigate${route}`, {}, 'success');
      const moduleName = route.replace('/', '').charAt(0).toUpperCase() + route.slice(2);
      return {
        success: true,
        data: { route, lectureTopicTitle: args.lectureTopicTitle, lectureTitle: args.lectureTitle },
        message: `✅ Navigated to ${moduleName} module.${args.lectureTitle ? ` Opening lecture: "${args.lectureTitle}"` : ''}${args.reason ? ` Reason: ${args.reason}` : ''}`
      };
    }

case 'open_gym_workout': {
      return {
        success: true,
        data: { route: '/home' },
        message: `ℹ️ The Gym module has been removed from the platform.`
      };
    }

case 'search_and_play_youtube': {
      const searchQuery = args.query as string;
      if (!searchQuery) {
        return { success: false, data: null, message: 'query is required for search_and_play_youtube' };
      }

      try {
        logApi('GET', `/api/search?type=youtube&q=${encodeURIComponent(searchQuery)}`, {}, 'pending');
        
        // Use our combined search endpoint
        const res = await fetch(`/api/search?type=youtube&q=${encodeURIComponent(searchQuery)}`);
        const data = await res.json();

        if (!res.ok || !data.topResult) {
          return {
            success: false,
            data: null,
            message: data.error || `No YouTube videos found for: "${searchQuery}"`
          };
        }

        const { videoId, title, channelTitle } = data.topResult;

        // Navigate to learning module and fire play event
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('agent-navigate', {
            detail: { route: '/learning' }
          }));
          setTimeout(() => {
            window.dispatchEvent(new CustomEvent('agent-play-video', {
              detail: { videoId, title, channelTitle, query: searchQuery, playlistContext: args.playlistContext || null }
            }));
          }, 400);
        }

        logApi('GET', `/api/search?type=youtube&q=${encodeURIComponent(searchQuery)}`, {}, 'success');
        return {
          success: true,
          data: { videoId, title, channelTitle },
          message: `✅ Playing "${title}" by ${channelTitle} in the app player.\nSPOKEN_SUMMARY: Now playing ${title.substring(0, 60)}.`
        };

      } catch (err: any) {
        return { success: false, data: null, message: `YouTube search failed: ${err.message}` };
      }
    }

case 'start_pomodoro': {
      if (!args.taskTitle) return { success: false, data: null, message: 'taskTitle is required for start_pomodoro' };
      const duration = args.durationMinutes || 25;
      window.dispatchEvent(new CustomEvent('start-pomodoro', {
        detail: { taskId: args.taskId, taskTitle: args.taskTitle, durationMinutes: duration }
      }));
      logApi('POST', '/api/v1/pomodoro/start', { taskId: args.taskId, taskTitle: args.taskTitle, durationMinutes: duration }, 'success');
      return { success: true, data: {}, message: `✅ Started ${duration}-minute Pomodoro focus session for "${args.taskTitle}". Timer is now running!` };
    }

case 'delegate_task': {

      try {
        // ✅ Delegation depth guard: prevents recursive agent death spirals.
        // TITAN → HERMES → CHRONOS is depth 2 (max). Depth 3+ is always a hallucination loop.
        const currentDepth = depth;
        if (currentDepth >= 2) {
          console.warn(`[delegate_task] Max delegation depth (2) reached for role ${args.agentRole}. Returning context to parent.`);
          return {
            success: false, data: null,
            message: `Max delegation depth reached. Cannot spawn ${args.agentRole} further. Use the data already in context to complete the task.`
          };
        }

        // Dynamically import to avoid circular dependency
        const { runAgentLoop } = await import('../runAgentLoop');
        const { getAgentPromptByRole } = await import('../orchestrator');
        const subAgentSystem = getAgentPromptByRole(args.agentRole);
        if (!subAgentSystem) {
          return { success: false, data: null, message: `Unknown agent role: "${args.agentRole}". Valid roles: ORACLE, ENIGMA, HERMES, CHRONOS, MEET, ARCHIVE, SCRIBE, HEPHAESTUS, ATLAS, ARGUS, SPECTRE, TITAN, AEGIS` };
        }
        // apiKey deprecated \u2014 keys moved server-side. runAgentLoop ignores this parameter.
        logApi('POST', `/api/v1/agent/delegate/${args.agentRole}`, { instruction: args.instruction, depth: currentDepth + 1 }, 'pending');
        // ✅ FIX: Inject accumulated fleet context so sub-agents don't re-do prior agents' work (PROBLEM 4)
        const fleetCtx = (appContext as any)?._completedAgentResults
          ? `\n\n[FLEET CONTEXT: Prior agents have already fetched this data. Use it directly:\n${JSON.stringify((appContext as any)._completedAgentResults).substring(0, 2000)}]`
          : '';
        const instructionWithDepth = `${args.instruction}${fleetCtx}`;
        const result = await runAgentLoop(
          instructionWithDepth,
          appContext,
          '', // apiKey deprecated — keys are server-side
          () => {}, // silent onStep — sub-agent runs in background

          subAgentSystem,
          undefined,
          undefined,
          true, // ✅ isSubAgent: true -> bypasses semaphore to prevent deadlock
          currentDepth + 1,
          args.agentRole !== 'AEGIS'
        );
        
        if (result.startsWith('Agent Loop Failed:')) {
          logApi('POST', `/api/v1/agent/delegate/${args.agentRole}`, { error: result }, 'error');
          return {
            success: false,
            data: null,
            message: `❌ Delegation to ${args.agentRole} failed: ${result}`
          };
        }

        logApi('POST', `/api/v1/agent/delegate/${args.agentRole}`, {}, 'success');
        logWebSocket('agent.delegated', { role: args.agentRole, result: result.substring(0, 100) });
        return {
          success: true,
          data: { agentRole: args.agentRole, result: result.substring(0, 500) },
          message: `✅ [${args.agentRole}] sub-agent completed: ${result.substring(0, 200)}`
        };
      } catch (e: unknown) {
        return { success: false, data: null, message: `Delegation to ${args.agentRole} failed: ${(e as { message?: string }).message}` };
      }
    }

    default:
      return null; // Tool not handled by this executor
  }
};
