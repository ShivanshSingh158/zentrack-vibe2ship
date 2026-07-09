/**
 * @file meet.executor.ts
 */
import { addDoc, collection, updateDoc, doc, deleteDoc, query, where, getDocs } from 'firebase/firestore';
import { db, auth } from '../../services/firebase';
import { addEventToGoogleCalendar, deleteGoogleCalendarEvent } from '../../services/googleCalendar';
import { sendPushNotification } from '../../services/fcm';
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


export const executeMeetTools = async (
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
case 'create_google_meet': {
      const authErr = await requireGoogleAuth(signal);
      if (authErr) return authErr;
      logApi('POST', '/api/v1/google/meet/create', { title: args.title }, 'pending');
      try {
        const startDT = new Date(args.startDateTime);
        const durationMs = (args.durationMinutes || 60) * 60 * 1000;
        const endDT = new Date(startDT.getTime() + durationMs);
        const attendeesList = args.attendees
          ? args.attendees.split(',').map((e: string) => e.trim())
          : [];

        const result = await createGoogleMeet({
          title: args.title,
          startDateTime: startDT.toISOString(),
          endDateTime: endDT.toISOString(),
          description: args.description,
          attendees: attendeesList,
        }, signal);
        logApi('POST', '/api/v1/google/meet/create', { title: args.title }, 'success');
        return {
          success: true,
          data: result,
          message: `✅ Google Meet created: "${args.title}"\n🔗 Meet Link: ${result.meetLink}\n📅 Calendar: ${result.calendarLink}${attendeesList.length > 0 ? `\n👥 Invited: ${attendeesList.join(', ')}` : ''}`
        };
      } catch (e: unknown) {
        return { success: false, data: null, message: `Google Meet API Error: ${(e as { message?: string }).message}` };
      }
    }

case 'schedule_google_meet': {
      // Alias for create_google_meet
      return executeTool('create_google_meet', args, appContext, signal);
    }

    default:
      return null; // Tool not handled by this executor
  }
};
