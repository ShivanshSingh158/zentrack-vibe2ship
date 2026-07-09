/**
 * @file drive.executor.ts
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


export const executeDriveTools = async (
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
case 'search_google_drive': {
      const authErr = await requireGoogleAuth(signal);
      if (authErr) return authErr;
      logApi('GET', '/api/v1/google/drive/search', { query: args.query }, 'pending');
      try {
        const files = await searchGoogleDrive(args.query, signal);
        logApi('GET', '/api/v1/google/drive/search', { query: args.query }, 'success');
        return {
          success: true,
          data: { files },
          message: `Found ${files.length} files in Drive matching '${args.query}'`
        };
      } catch (e: unknown) {
        return { success: false, data: null, message: `Drive API Error: ${(e as { message?: string }).message}` };
      }
    }

case 'list_drive_files': {
      const authErr = await requireGoogleAuth(signal);
      if (authErr) return authErr;
      try {
        const files = await listDriveFiles(args.limit || 15);
        return { success: true, data: { files }, message: `Listed ${files.length} recent Drive files` };
      } catch (e: unknown) {
        return { success: false, data: null, message: `Drive API Error: ${(e as { message?: string }).message}` };
      }
    }

case 'open_drive_file': {
      const authErr = await requireGoogleAuth(signal);
      if (authErr) return authErr;
      try {
        if (args.openAsPdf === 'true') {
          const pdfUrl = await getFilePdfLink(args.fileId);
          if (typeof window !== 'undefined') window.open(pdfUrl, '_blank');
          return { success: true, data: { url: pdfUrl }, message: `✅ File opened as PDF in new browser tab: ${pdfUrl}` };
        }
        const result = await openDriveFile(args.fileId);
        return { success: true, data: result, message: `✅ Opened "${result.name}" in browser. URL: ${result.url}` };
      } catch (e: unknown) {
        return { success: false, data: null, message: `Drive Open Error: ${(e as { message?: string }).message}` };
      }
    }

case 'create_google_doc': {
      const authErr = await requireGoogleAuth(signal);
      if (authErr) return authErr;
      logApi('POST', '/api/v1/google/docs/create', { title: args.title }, 'pending');
      try {
        const docInfo = await createGoogleDoc(args.title);
        logApi('POST', '/api/v1/google/docs/create', { title: args.title }, 'success');
        return { success: true, data: docInfo, message: `✅ Created Google Document: "${args.title}" → ${docInfo.url}` };
      } catch (e: unknown) {
        return { success: false, data: null, message: `Docs API Error: ${(e as { message?: string }).message}` };
      }
    }

case 'write_google_doc': {
      const authErr = await requireGoogleAuth(signal);
      if (authErr) return authErr;
      try {
        const result = await writeToGoogleDoc(args.docId, args.content as string || '');
        return { success: true, data: result, message: `✅ Content written to Google Doc (formatted). View: ${result.url}` };
      } catch (e: unknown) {
        return { success: false, data: null, message: `Docs Write Error: ${(e as { message?: string }).message}` };
      }
    }

case 'read_google_doc': {
      const authErr = await requireGoogleAuth(signal);
      if (authErr) return authErr;
      if (!args.fileId) return { success: false, data: null, message: 'fileId is required for read_google_doc' };
      logApi('GET', `/api/v1/drive/docs/${args.fileId}/read`, {}, 'pending');
      try {
        const docData = await readGoogleDoc(args.fileId as string, signal);
        logApi('GET', `/api/v1/drive/docs/${args.fileId}/read`, {}, 'success');
        // Truncate content to 15,000 chars to stay within safe context limits
        const preview = docData.content.length > 15000
          ? docData.content.slice(0, 15000) + `\n\n[... truncated — ${docData.charCount - 15000} more characters not shown ...]`
          : docData.content;
        return {
          success: true,
          data: { title: docData.title, content: preview, charCount: docData.charCount },
          message: `📄 **${docData.title}** (${docData.charCount.toLocaleString()} characters)\n\n${preview.slice(0, 500)}${docData.content.length > 500 ? '...' : ''}`,
        };
      } catch (e: unknown) {
        return { success: false, data: null, message: `Google Docs API Error: ${(e as { message?: string }).message}` };
      }
    }

case 'trash_drive_file': {
      const authErr = await requireGoogleAuth(signal);
      if (authErr) return authErr;
      if (!args.fileId) return { success: false, data: null, message: 'fileId is required' };
      // ✅ BUG FIX: Added approval gate — was missing unlike all other destructive tools
      const driveApproved = await requestApproval('trash_drive_file', `Move Drive file to trash permanently?`, signal);
      if (!driveApproved) return { success: false, data: null, message: '🚫 Cancelled by user — Drive file was NOT trashed.' };
      logApi('DELETE', `/api/v1/drive/files/${args.fileId}/trash`, {}, 'success');
      try {
        await trashDriveFile(args.fileId, signal);
        return { success: true, data: {}, message: `✅ Drive file successfully moved to trash` };
      } catch (e: any) {
        return { success: false, data: null, message: `Failed to trash file: ${e.message}` };
      }
    }

    default:
      return null; // Tool not handled by this executor
  }
};
