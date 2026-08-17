/**
 * @file gmail.executor.ts
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


export const executeGmailTools = async (
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
case 'read_gmail': {
      const authErr = await requireGoogleAuth(signal);
      if (authErr) return authErr;
      logApi('GET', '/api/v1/google/gmail/read', { query: args.query }, 'pending');
      try {
        const result = await fetchUnreadEmails(args.query, signal);
        logApi('GET', '/api/v1/google/gmail/read', { query: args.query }, 'success');
        const count = result.emails ? result.emails.length : 0;
        return { 
          success: true, 
          data: result, 
          message: `Fetched ${count} emails matching '${args.query || 'is:unread'}' (Account: ${result.emailAddress})` 
        };
      } catch (e: unknown) {
        return { success: false, data: null, message: `Gmail API Error: ${(e as { message?: string }).message}` };
      }
    }

case 'send_gmail': {
      const authErr = await requireGoogleAuth(signal);
      if (authErr) return authErr;
      // ✅ LOW-4 FIX: Detect probable-reply subjects before sending.
      // If the subject starts with 'Re:' or the body contains quoted text ('\n>'),
      // the agent should almost certainly be using reply_gmail (which threads the message).
      // We warn but do not block — the user may intentionally start a new thread.
      const looksLikeReply = /^re:/i.test(String(args.subject || '').trim())
        || (String(args.bodyText || '')).includes('\n>');
      const sendApproved = await requestApproval(
        'send_gmail',
        `Send email to ${args.to} — Subject: "${args.subject}"?${looksLikeReply ? '\n\n⚠️ Note: This looks like a reply (subject starts with "Re:" or contains quoted text). If replying to an existing thread, use reply_gmail(threadId, ...) instead to properly thread the message.' : ''}`,
        signal
      );
      if (!sendApproved) return { success: false, data: null, message: '🚫 Cancelled by user — email was NOT sent.' };
      logApi('POST', '/api/v1/google/gmail/send', { to: args.to }, 'pending');
      try {
        await sendEmail(args.to, args.subject, args.bodyText, signal);
        logApi('POST', '/api/v1/google/gmail/send', { to: args.to }, 'success');

        // ✅ ISSUE-T2 FIX: Deduplicate follow-up tasks before creating.
        // Previously every sent email created a follow-up task unconditionally.
        // 5 emails in one L3 mission = 5 phantom tasks. Same recipient on two missions = duplicates.
        // Now we check if a follow-up task for this recipient already exists before creating one.
        try {
          const followUpTitle = `Follow up with ${args.to} re: ${args.subject}`;
          const followUpDate = new Date();
          followUpDate.setDate(followUpDate.getDate() + 3);
          const followUpDateStr = getLocalDateString(followUpDate);

          // Check for existing follow-up task to this recipient (created in last 7 days)
          const sevenDaysAgo = getLocalDateString(new Date(Date.now() - 7 * 86400000));
          const existingQ = query(
            collection(db, 'todos'),
            where('userId', '==', user.uid),
            where('tags', 'array-contains', 'follow-up'),
          );
          const existingSnap = await getDocs(existingQ);
          const alreadyExists = existingSnap.docs.some(d => {
            const data = d.data();
            const recipientMatch = (data.linkedEmail?.to === args.to);
            const recentEnough = data.date >= sevenDaysAgo;
            return recipientMatch && recentEnough;
          });

          if (!alreadyExists) {
            await addDoc(collection(db, 'todos'), {
              userId: user.uid,
              title: followUpTitle,
              text: followUpTitle,
              priority: 'medium',
              date: followUpDateStr,
              status: 'pending',
              tags: ['follow-up', 'email'],
              linkedEmail: { to: args.to, subject: args.subject, sentAt: Date.now() },
              source: 'agent:HERMES',
              createdAt: Date.now(),
              order: Date.now(),
            });
          }
        } catch (followUpErr) {
          console.warn('[ToolExecutor] Follow-up task creation failed (non-blocking):', followUpErr);
        }

        // ✅ GAP-1: Record to persistent memory so agent won't re-send same email tomorrow
        recordEmailSent(args.to as string, args.subject as string);
        userLearningStore.recordEmailAction(60);
        return { success: true, data: {}, message: `✅ Email sent to ${args.to}. 📌 Follow-up task auto-created for 3 days from now (deduplicated — skipped if one already exists).` };


      } catch (e: unknown) {
        return { success: false, data: null, message: `Gmail API Error: ${(e as { message?: string }).message}` };
      }
    }

case 'reply_gmail': {
      const authErr = await requireGoogleAuth(signal);
      if (authErr) return authErr;
      logApi('POST', '/api/v1/google/gmail/reply', { to: args.to }, 'pending');
      try {
        await replyToEmail(args.threadId, args.to, args.subject, args.bodyText, signal);
        logApi('POST', '/api/v1/google/gmail/reply', { to: args.to }, 'success');
        return { success: true, data: {}, message: `✅ Reply sent to ${args.to} in thread` };
      } catch (e: unknown) {
        return { success: false, data: null, message: `Gmail Reply Error: ${(e as { message?: string }).message}` };
      }
    }

case 'archive_gmail': {
      const authErr = await requireGoogleAuth(signal);
      if (authErr) return authErr;
      try {
        await archiveEmail(args.messageId, signal);
        return { success: true, data: {}, message: `✅ Email archived successfully` };
      } catch (e: unknown) {
        return { success: false, data: null, message: `Gmail Archive Error: ${(e as { message?: string }).message}` };
      }
    }

case 'draft_email': {
      const authErr = await requireGoogleAuth(signal);
      if (authErr) return authErr;
      logApi('POST', '/api/v1/google/gmail/draft', { to: args.to }, 'pending');
      try {
        await createDraftEmail(args.to, args.subject, args.bodyText, signal);
        logApi('POST', '/api/v1/google/gmail/draft', { to: args.to }, 'success');
        return { success: true, data: {}, message: `✅ Draft email saved successfully for ${args.to}` };
      } catch (e: unknown) {
        return { success: false, data: null, message: `Gmail API Error: ${(e as { message?: string }).message}` };
      }
    }

case 'trash_email': {
      const authErr = await requireGoogleAuth(signal);
      if (authErr) return authErr;
      if (!args.messageId) return { success: false, data: null, message: 'messageId is required' };
      const trashApproved = await requestApproval('trash_email', `Move this email to trash?`, signal);
      if (!trashApproved) return { success: false, data: null, message: '🚫 Cancelled by user — email was NOT trashed.' };
      logApi('DELETE', `/api/v1/gmail/messages/${args.messageId}/trash`, {}, 'success');
      try {
        await trashEmail(args.messageId, signal);
        return { success: true, data: {}, message: `✅ Email successfully moved to trash` };
      } catch (e: any) {
        return { success: false, data: null, message: `Failed to trash email: ${e.message}` };
      }
    }

case 'smart_email_triage': {
      const authErr = await requireGoogleAuth(signal);
      if (authErr) return authErr;
      logApi('GET', '/api/v1/gmail/triage', {}, 'pending');
      try {
        const result = await fetchUnreadEmails('is:unread', signal);
        const emails = result.emails || [];
        // Classify each email by urgency keywords
        const classified = emails.map((email: any) => {
          const text = `${email.subject} ${email.snippet}`.toLowerCase();
          const isUrgent   = /urgent|asap|eod|end of day|immediately|action required|critical|deadline/.test(text);
          const isReply    = /re:|reply|response needed|waiting|following up|gentle reminder/.test(text);
          const isInfo     = /newsletter|digest|no-reply|unsubscribe|fyi|update/.test(text);
          const priority   = isUrgent ? 'critical' : isReply ? 'high' : isInfo ? 'low' : 'medium';
          return { ...email, triagePriority: priority };
        });
        const critical = classified.filter((e: any) => e.triagePriority === 'critical');
        const high     = classified.filter((e: any) => e.triagePriority === 'high');
        const low      = classified.filter((e: any) => e.triagePriority === 'low');
        logApi('GET', '/api/v1/gmail/triage', { total: emails.length }, 'success');
        return {
          success: true,
          data: { total: emails.length, critical, high, low, medium: classified.filter((e: any) => e.triagePriority === 'medium') },
          message: `📬 **Email Triage Complete — ${emails.length} emails processed**\n🔴 Critical (${critical.length}): ${critical.slice(0,3).map((e: any) => `"${e.subject}"`).join(', ')}\n🟠 Need Reply (${high.length}): ${high.slice(0,3).map((e: any) => `"${e.subject}"`).join(', ')}\n⬇️ Low priority / info (${low.length} — can archive)\n\nRecommendation: Draft responses to the ${Math.min(critical.length + high.length, 5)} top-priority emails using draft_email.`
        };
      } catch (e: unknown) {
        return { success: false, data: null, message: `Email Triage Error: ${(e as { message?: string }).message}` };
      }
    }

case 'get_email_thread': {
      const authErr = await requireGoogleAuth(signal);
      if (authErr) return authErr;
      const queryOrId = (args.threadId || args.query) as string;
      if (!queryOrId) return { success: false, data: null, message: 'Provide either threadId or a query (e.g. "from:rahul@company.com")' };
      logApi('GET', '/api/v1/google/gmail/thread', { query: queryOrId }, 'pending');
      try {
        const thread = await fetchEmailThread(queryOrId, signal);
        if (!thread.messages.length) return { success: false, data: null, message: `No emails found for: ${queryOrId}` };
        logApi('GET', '/api/v1/google/gmail/thread', { query: queryOrId }, 'success');
        return {
          success: true,
          data: thread,
          message: `📬 Thread found: ${thread.messageCount} message${thread.messageCount !== 1 ? 's' : ''}. Latest: "${thread.messages[thread.messages.length-1]?.subject}" from ${thread.messages[thread.messages.length-1]?.from}. Full conversation loaded for analysis.`
        };
      } catch (e: unknown) {
        return { success: false, data: null, message: `Gmail Thread API Error: ${(e as { message?: string }).message}` };
      }
    }

    default:
      return null; // Tool not handled by this executor
  }
};
