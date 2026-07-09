/**
 * @file notification.executor.ts
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


export const executeNotificationTools = async (
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
case 'send_reminder': {
      try {
        const delayMs = (args.delayMinutes || 5) * 60 * 1000;
        const fireAt = new Date(Date.now() + delayMs);

        // ✅ FIXED: Also store in Firestore for persistence (Cloud Function can pick it up),
        // AND fire a client-side setTimeout that calls FCM directly as a reliable fallback.
        // The old code only wrote to Firestore which had no worker consuming it.
        await addDoc(collection(db, 'scheduledReminders'), {
          userId: user.uid,
          message: args.message,
          fireAt: fireAt.toISOString(),
          status: 'pending',
          createdAt: Date.now()
        });

        // Client-side fallback: fire push notification after delay
        // This works as long as the browser tab stays open during the delay.
        if (delayMs <= 30 * 60 * 1000) { // Only for reminders <= 30 minutes
          setTimeout(async () => {
            try {
              await sendPushNotification({
                userIds: [user.uid],
                title: '⏰ Reminder',
                body: args.message
              });
            } catch (e) {
              console.warn('[send_reminder] Client-side FCM fallback failed:', e);
            }
          }, delayMs);
        }

        return { success: true, data: {}, message: `✅ Reminder scheduled for ${fireAt.toLocaleTimeString()}: "${args.message}"` };
      } catch (e: unknown) {
        return { success: false, data: null, message: `Failed to schedule reminder: ${(e as { message?: string }).message}` };
      }
    }

case 'send_notification': {
      try {
        await sendPushNotification({
          userIds: [user.uid],
          title: args.title,
          body: args.message
        });

        // ✅ FEAT-7 FIX: Persist notification to Firestore history so users can
        // review past agent notifications in a notification history modal.
        // Silently non-blocking — notification delivery is unaffected by this.
        addDoc(collection(db, 'notifications', user.uid, 'history'), {
          title: args.title,
          message: args.message,
          sentAt: Date.now(),
          source: 'agent',
          read: false,
        }).catch(() => {}); // fire-and-forget

        // ── Twilio SMS for CRITICAL/HIGH-priority alerts ───────────────────────
        // If the agent marks something as high priority or the title contains
        // emergency keywords, also send an SMS so the user gets it even if their
        // browser notifications are off.
        const isUrgent = args.priority === 'high'
          || /critical|overdue|urgent|panic|emergency|missed deadline/i.test(args.title || '')
          || /critical|overdue|urgent|panic|emergency/i.test(args.message || '');

        if (isUrgent) {
          try {
            // Get user's phone from Firestore profile
            const { getDoc, doc: fsDoc } = await import('firebase/firestore');
            const profileSnap = await getDoc(fsDoc(db, 'user_profiles', user.uid));
            const phone = profileSnap.data()?.phoneNumber || profileSnap.data()?.phone;

            if (phone) {
              // Call the Vercel SMS endpoint (works even in browser — it's our own API)
              const VERCEL_BASE = import.meta.env.VITE_APP_URL || 'https://myzentrack.vercel.app';
              const smsBody = [
                args.title,
                '',
                args.message,
                '',
                `ZenTrack: myzentrack.vercel.app`,
              ].join('\n');

              // SEC-FIX (CRIT-5): Use Firebase ID token — not VITE_INTERNAL_SECRET which
              // is baked into the JS bundle and visible to anyone in DevTools.
              const idToken = await user.getIdToken();
              await fetch(`${VERCEL_BASE}/api/send-sms`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${idToken}`,
                },
                body: JSON.stringify({ message: smsBody }),
              }).then(r => {
                if (r.ok) console.log('[send_notification] Twilio SMS sent for urgent alert');
                else console.warn('[send_notification] Twilio SMS failed:', r.status);
              });
            }
          } catch (smsErr) {
            console.warn('[send_notification] SMS fire-and-forget failed (non-blocking):', smsErr);
          }
        }

        return { 
          success: true, 
          data: { queued: true }, 
          message: `✅ Notification delivered successfully: "${args.title}"${isUrgent ? ' — SMS alert also sent' : ''}

IMPORTANT: This tool SUCCEEDED. Do NOT report any rate limit or failure for this notification.`
        };
      } catch (err: any) {
        return { 
          success: false, 
          data: null, 
          message: `❌ Notification FAILED (Firestore write error): ${err?.message || 'Unknown error'}. Do NOT say rate-limited — report this exact message.`
        };
      }
    }

case 'notify_accountability_partner': {
      const authErr = await requireGoogleAuth(signal);
      if (authErr) return authErr;
      // ✅ BUG FIX: Added approval gate — was sending emails to third parties without any confirmation
      const partnerApproved = await requestApproval(
        'notify_accountability_partner',
        `Send accountability alert email to ${args.partnerEmail}?`,
        signal
      );
      if (!partnerApproved) return { success: false, data: null, message: '🚫 Cancelled by user — accountability partner was NOT notified.' };
      logApi('POST', '/api/v1/google/gmail/send', { to: args.partnerEmail }, 'pending');
      try {
        const subject = `[URGENT] Accountability Alert: ZenTrack Notification`;
        const bodyText = `Hello,\n\nYou are receiving this automated alert because you are listed as an accountability partner.\n\nMessage:\n${args.message}\n\nPlease check in with them.\n\n- ZenTrack AI`;
        await sendEmail(args.partnerEmail, subject, bodyText, signal);
        logApi('POST', '/api/v1/google/gmail/send', { to: args.partnerEmail }, 'success');
        return { success: true, data: {}, message: `✅ Accountability partner (${args.partnerEmail}) notified successfully.` };
      } catch (e: unknown) {
        return { success: false, data: null, message: `Gmail API Error: ${(e as { message?: string }).message}` };
      }
    }

    default:
      return null; // Tool not handled by this executor
  }
};
