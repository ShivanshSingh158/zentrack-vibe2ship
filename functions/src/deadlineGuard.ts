import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

// Initialize admin app if not already initialized
if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = admin.firestore();

const pad = (n: number) => n.toString().padStart(2, '0');
const toDateStr = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * PROACTIVE-GAP-3 FIX: Scheduled Background Deadline Watchdog
 *
 * Runs every 30 minutes via Cloud Scheduler — regardless of whether the tab is open.
 * Sends FCM push notifications for:
 *   1. Tasks due in the next 2 hours (approaching deadline)
 *   2. Tasks that became overdue since the last check (missed deadline)
 *   3. Assignments due in the next 24 hours (student reminder)
 *
 * This turns ZenTrack from "app that helps when you're using it"
 * → "agent that watches out for you even when the tab is closed"
 *
 * Architecture:
 *   - Queries Firestore by userId across all users (collectionGroup or per-user subcollection)
 *   - Throttle: stores last-notified timestamp per task to prevent repeated notifications
 *   - Batches FCM sends to avoid hitting rate limits (max 500 tokens per send)
 */
export const deadlineWatchdog = functions.pubsub
  .schedule('every 30 minutes')
  .onRun(async (_context) => {
    const now = new Date();
    const nowStr = toDateStr(now);

    // 2 hours from now
    const in2h = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    const in2hStr = toDateStr(in2h);

    // 24 hours from now (for assignment reminders)
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const in24hStr = toDateStr(in24h);

    // Throttle: track last notification per task to avoid spam
    const THROTTLE_COLLECTION = 'notification_throttle';
    const THROTTLE_TTL_MS = 3 * 60 * 60 * 1000; // don't re-notify same task for 3h

    // ── Helper: check + update throttle ──────────────────────────────────────
    const isThrottled = async (userId: string, itemId: string): Promise<boolean> => {
      const ref = db.collection(THROTTLE_COLLECTION).doc(`${userId}_${itemId}`);
      const doc = await ref.get();
      if (!doc.exists) return false;
      const lastSent = doc.data()?.lastSentAt?.toMillis() || 0;
      return Date.now() - lastSent < THROTTLE_TTL_MS;
    };

    const markThrottled = async (userId: string, itemId: string): Promise<void> => {
      const ref = db.collection(THROTTLE_COLLECTION).doc(`${userId}_${itemId}`);
      await ref.set({ lastSentAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    };

    // ── Helper: send FCM to a user ────────────────────────────────────────────
    const sendFCM = async (
      userId: string,
      title: string,
      body: string,
      data?: Record<string, string>
    ): Promise<void> => {
      try {
        const tokenDoc = await db.collection('fcm_tokens').doc(userId).get();
        const token = tokenDoc.data()?.token as string | undefined;
        if (!token) return;

        await admin.messaging().send({
          token,
          notification: { title, body },
          data: { userId, ...data },
          android: { priority: 'high' },
          apns: { payload: { aps: { sound: 'default', badge: 1 } } },
        });
        console.log(`[DeadlineWatchdog] FCM sent to user ${userId}: ${title}`);
      } catch (err) {
        console.warn(`[DeadlineWatchdog] FCM failed for user ${userId}:`, err);
      }
    };

    // ── Fetch all users with FCM tokens ────────────────────────────────────────
    const tokenDocs = await db.collection('fcm_tokens').get();
    const userIds = tokenDocs.docs.map(d => d.id);

    console.log(`[DeadlineWatchdog] Checking ${userIds.length} users at ${now.toISOString()}`);

    await Promise.allSettled(userIds.map(async (userId) => {
      // ── 1. Tasks due in the next 2 hours ───────────────────────────────────
      const approachingQuery = await db
        .collection('todos')
        .where('userId', '==', userId)
        .where('status', '==', 'pending')
        .where('date', '>=', nowStr)
        .where('date', '<=', in2hStr)
        .get();

      for (const taskDoc of approachingQuery.docs) {
        const task = taskDoc.data();
        if (await isThrottled(userId, taskDoc.id)) continue;
        const hoursUntil = Math.max(0, Math.round((new Date(task.date + 'T23:59:00').getTime() - Date.now()) / 3_600_000));
        await sendFCM(
          userId,
          `⏰ Deadline in ${hoursUntil}h: ${task.title || task.text}`,
          `"${task.title || task.text}" is due ${hoursUntil === 0 ? 'today' : 'soon'}. Tap to open ZenTrack.`,
          { taskId: taskDoc.id, type: 'approaching_deadline' }
        );
        await markThrottled(userId, taskDoc.id);
      }

      // ── 2. Overdue tasks (became overdue since last check) ─────────────────
      const overdueQuery = await db
        .collection('todos')
        .where('userId', '==', userId)
        .where('status', '==', 'pending')
        .where('date', '<', nowStr)
        .limit(5) // cap — send at most 5 overdue alerts
        .get();

      const overdueCount = overdueQuery.size;
      if (overdueCount > 0) {
        const batchKey = `overdue_batch_${userId}`;
        if (!(await isThrottled(userId, batchKey))) {
          await sendFCM(
            userId,
            `🚨 ${overdueCount} Overdue Task${overdueCount > 1 ? 's' : ''} Need Attention`,
            `You have ${overdueCount} past-due items. Open ZenTrack to triage or use Panic Mode.`,
            { type: 'overdue_batch', count: overdueCount.toString() }
          );
          await markThrottled(userId, batchKey);
        }
      }

      // ── 3. Assignments due in the next 24 hours ────────────────────────────
      const assignmentsQuery = await db
        .collection('assignments')
        .where('userId', '==', userId)
        .where('completed', '==', false)
        .where('dueDate', '>=', nowStr)
        .where('dueDate', '<=', in24hStr)
        .get();

      for (const assignDoc of assignmentsQuery.docs) {
        const assignment = assignDoc.data();
        if (await isThrottled(userId, assignDoc.id)) continue;
        await sendFCM(
          userId,
          `📚 Assignment Due Tomorrow: ${assignment.title}`,
          `"${assignment.title}" for ${assignment.subject} is due ${assignment.dueDate}. Have you started?`,
          { assignmentId: assignDoc.id, type: 'assignment_reminder' }
        );
        await markThrottled(userId, assignDoc.id);
      }

      // ── 4. Morning briefing trigger (7:30am in UTC+5:30 = 2:00 UTC) ────────
      // Send a morning brief trigger push at 2:00-2:30 UTC (= 7:30-8:00 IST)
      // The app handles the actual LLM call when opened
      const utcHour = now.getUTCHours();
      const utcMin = now.getUTCMinutes();
      const isMorningWindow = utcHour === 2 && utcMin < 30;
      if (isMorningWindow) {
        const morningKey = `morning_brief_${userId}_${nowStr}`;
        if (!(await isThrottled(userId, morningKey))) {
          // Count today's tasks
          const todayTasksQ = await db
            .collection('todos')
            .where('userId', '==', userId)
            .where('status', '==', 'pending')
            .where('date', '==', nowStr)
            .get();
          const overdueQ = await db
            .collection('todos')
            .where('userId', '==', userId)
            .where('status', '==', 'pending')
            .where('date', '<', nowStr)
            .get();
          await sendFCM(
            userId,
            '☀️ Good morning! Your ZenTrack briefing is ready.',
            `${todayTasksQ.size} tasks today${overdueQ.size > 0 ? `, ${overdueQ.size} overdue` : ''}. Open app for your AI morning briefing.`,
            { type: 'morning_brief', todayCount: todayTasksQ.size.toString(), overdueCount: overdueQ.size.toString() }
          );
          await markThrottled(userId, morningKey);
        }
      }
    }));

    console.log(`[DeadlineWatchdog] Completed run at ${new Date().toISOString()}`);
  });

// Legacy export name kept for backwards compatibility
export const deadlineGuard = deadlineWatchdog;
