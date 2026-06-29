/**
 * api/cron-watchdog.js
 *
 * ZenTrack Background Intelligence — The Main Watchdog
 *
 * Called every 5 minutes by GitHub Actions (even when app tab is closed).
 * Performs a 3-channel alert system:
 *
 *   CHANNEL 1 — Twilio SMS (for high-priority / overdue tasks)
 *     → Sends a real SMS with task name, priority, deadline
 *     → Only fires for HIGH priority or tasks overdue >2h
 *     → Throttled to avoid SMS spam (3h window per task)
 *
 *   CHANNEL 2 — FCM Push Notification (for all reminders)
 *     → Browser/PWA push notifications
 *     → Works when tab is closed but browser is running
 *
 *   CHANNEL 3 — Class Start Alerts (student-specific)
 *     → Sends class start notification 5-10 min before class
 *
 * Throttle: A Firestore collection `notification_throttle` tracks the
 *   last-sent timestamp per (userId, itemId) so users never get
 *   duplicate alerts within the throttle window.
 *
 * Required environment variables (set in Vercel dashboard):
 *   FIREBASE_SERVICE_ACCOUNT_JSON  — Firebase service account JSON
 *   CRON_SECRET                    — Shared secret for GitHub Actions auth
 *   TWILIO_ACCOUNT_SID             — Twilio account SID
 *   TWILIO_AUTH_TOKEN              — Twilio auth token
 *   TWILIO_PHONE_NUMBER            — Your Twilio number (from)
 *
 * Each user document in Firestore must have a `phoneNumber` field for
 * SMS to reach them. The watchdog reads this from `user_profiles/{uid}`.
 */

import admin from 'firebase-admin';
import twilio from 'twilio';

// ── Firebase Admin Init ────────────────────────────────────────────────────────
if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '{}');
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  } catch (err) {
    console.error('[watchdog] Firebase Admin init failed:', err.message);
  }
}

const db = admin.firestore();
const messaging = admin.messaging();

// ── Helpers ───────────────────────────────────────────────────────────────────
const pad = (n) => n.toString().padStart(2, '0');
const toDateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const THROTTLE_COL = 'notification_throttle';
const SMS_THROTTLE_MS   = 3  * 60 * 60 * 1000; // 3h between SMS for same task
const PUSH_THROTTLE_MS  = 2  * 60 * 60 * 1000; // 2h between push for same task
const MORNING_THROTTLE  = 23 * 60 * 60 * 1000; // once per day for morning brief

const isThrottled = async (userId, itemId, windowMs) => {
  const ref = db.collection(THROTTLE_COL).doc(`${userId}_${itemId}`);
  const doc = await ref.get();
  if (!doc.exists) return false;
  const lastSent = doc.data()?.lastSentAt?.toMillis() || 0;
  return (Date.now() - lastSent) < windowMs;
};

const markThrottled = async (userId, itemId) => {
  const ref = db.collection(THROTTLE_COL).doc(`${userId}_${itemId}`);
  await ref.set({ lastSentAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
};

// ── FCM Push ──────────────────────────────────────────────────────────────────
const sendFCM = async (tokens, title, body, data = {}) => {
  if (!tokens || tokens.length === 0) return { sent: 0, failed: 0 };
  try {
    const payload = {
      data: { title, body, tag: data.tag || 'zentrack', url: data.url || '/', ...Object.fromEntries(Object.entries(data).map(([k,v]) => [k, String(v)])) },
      android: { priority: 'high' },
      webpush: { headers: { Urgency: 'high' } },
      tokens,
    };
    const resp = await messaging.sendEachForMulticast(payload);
    console.log(`[watchdog] FCM sent ${resp.successCount}/${tokens.length}: "${title}"`);
    return { sent: resp.successCount, failed: resp.failureCount };
  } catch (err) {
    console.warn('[watchdog] FCM error:', err.message);
    return { sent: 0, failed: 1 };
  }
};

// ── Twilio SMS ────────────────────────────────────────────────────────────────
const sendSMS = async (toPhone, message) => {
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const auth  = process.env.TWILIO_AUTH_TOKEN;
  const from  = process.env.TWILIO_PHONE_NUMBER;

  if (!sid || !auth || !from) {
    console.warn('[watchdog] Twilio env vars missing — SMS skipped');
    return false;
  }
  if (!toPhone) {
    console.warn('[watchdog] No phone number for user — SMS skipped');
    return false;
  }

  try {
    const client = twilio(sid, auth);
    const msg = await client.messages.create({ body: message, from, to: toPhone });
    console.log(`[watchdog] SMS sent to ${toPhone} — SID: ${msg.sid}`);
    return true;
  } catch (err) {
    console.error(`[watchdog] SMS failed to ${toPhone}:`, err.message);
    return false;
  }
};

// ── SMS Message Formatters ─────────────────────────────────────────────────────
const formatOverdueSMS = (task, hoursOverdue) => {
  const priority = (task.priority || 'medium').toUpperCase();
  const name = task.title || task.text || 'Unnamed Task';
  const emoji = priority === 'HIGH' ? '🚨' : priority === 'MEDIUM' ? '⚠️' : '📌';
  return `${emoji} ZenTrack ALERT\n\n"${name}"\nPriority: ${priority}\nStatus: OVERDUE by ${hoursOverdue}h\n\nOpen ZenTrack now to take action.\nmyzentrack.vercel.app`;
};

const formatApproachingSMS = (task, minutesUntil) => {
  const priority = (task.priority || 'medium').toUpperCase();
  const name = task.title || task.text || 'Unnamed Task';
  const timeStr = minutesUntil < 60
    ? `${minutesUntil} min`
    : `${Math.round(minutesUntil / 60)}h`;
  return `⏰ ZenTrack REMINDER\n\n"${name}"\nPriority: ${priority}\nDue in: ${timeStr}\n\nOpen ZenTrack to start.\nmyzentrack.vercel.app`;
};

const formatMorningSMS = (todayCount, overdueCount) => {
  return `☀️ Good morning!\n\nYour ZenTrack day:\n📋 ${todayCount} task${todayCount !== 1 ? 's' : ''} today${overdueCount > 0 ? `\n🚨 ${overdueCount} overdue` : ''}\n\nOpen your AI briefing:\nmyzentrack.vercel.app`;
};

// ── Main Handler ───────────────────────────────────────────────────────────────
export default async function handler(req, res) {

  // ── Auth ────────────────────────────────────────────────────────────────────
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) {
    console.error('[watchdog] CRON_SECRET not configured');
    return res.status(500).json({ error: 'Server misconfiguration.' });
  }
  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${expectedSecret}`) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  const now     = new Date();
  const nowStr  = toDateStr(now);
  const in2h    = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const in2hStr = toDateStr(in2h);
  const in24h   = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const in24hStr = toDateStr(in24h);

  // IST offset for class schedule matching
  const istNow = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
  const dayIndex = istNow.getDay().toString();
  const istMinutes = istNow.getHours() * 60 + istNow.getMinutes();

  let stats = { smsSent: 0, pushSent: 0, usersProcessed: 0 };

  try {
    // ── Fetch all users with FCM tokens ────────────────────────────────────────
    const tokenDocs = await db.collection('fcm_tokens').get();
    const userIds = tokenDocs.docs.map(d => d.id);
    console.log(`[watchdog] Processing ${userIds.length} users at ${now.toISOString()}`);

    await Promise.allSettled(userIds.map(async (userId) => {
      stats.usersProcessed++;

      // Get FCM token(s) for this user
      const tokenDoc = tokenDocs.docs.find(d => d.id === userId);
      const fcmToken = tokenDoc?.data()?.token;
      const tokens = fcmToken ? [fcmToken] : [];

      // Get user profile for phone number + persona
      let phoneNumber = null;
      let userPersona = 'general';
      try {
        const profileDoc = await db.collection('user_profiles').doc(userId).get();
        if (profileDoc.exists) {
          const profile = profileDoc.data();
          phoneNumber = profile?.phoneNumber || profile?.phone || null;
          userPersona = profile?.behaviorProfile?.userPersona || 'general';
        }
      } catch (e) {
        console.warn(`[watchdog] Could not load profile for ${userId}:`, e.message);
      }

      // ────────────────────────────────────────────────────────────────────────
      // CHANNEL A: OVERDUE TASKS — SMS for high priority, Push for all
      // ────────────────────────────────────────────────────────────────────────
      const overdueQuery = await db.collection('todos')
        .where('userId', '==', userId)
        .where('status', '==', 'pending')
        .where('date', '<', nowStr)
        .limit(5)
        .get();

      for (const taskDoc of overdueQuery.docs) {
        const task = taskDoc.data();
        const taskId = taskDoc.id;
        const hoursOverdue = Math.round(
          (now.getTime() - new Date(task.date + 'T23:59:00').getTime()) / 3_600_000
        );
        const isHighPriority = task.priority === 'high';

        // SMS: only for HIGH priority tasks overdue >30 min
        if (isHighPriority && hoursOverdue > 0 && phoneNumber) {
          const smsKey = `sms_overdue_${taskId}`;
          if (!(await isThrottled(userId, smsKey, SMS_THROTTLE_MS))) {
            const sent = await sendSMS(phoneNumber, formatOverdueSMS(task, hoursOverdue));
            if (sent) {
              await markThrottled(userId, smsKey);
              stats.smsSent++;
            }
          }
        }

        // Push: for all overdue tasks (batched)
        const pushKey = `push_overdue_batch_${userId}`;
        if (overdueQuery.size > 0 && !(await isThrottled(userId, pushKey, PUSH_THROTTLE_MS))) {
          const highCount = overdueQuery.docs.filter(d => d.data().priority === 'high').length;
          await sendFCM(
            tokens,
            `🚨 ${overdueQuery.size} Overdue Task${overdueQuery.size > 1 ? 's' : ''}`,
            `${highCount > 0 ? `${highCount} HIGH priority. ` : ''}Open ZenTrack to take action.`,
            { type: 'overdue_batch', count: String(overdueQuery.size), url: '/' }
          );
          await markThrottled(userId, pushKey);
          stats.pushSent++;
          break; // Only send one batch push per user
        }
      }

      // ────────────────────────────────────────────────────────────────────────
      // CHANNEL B: APPROACHING DEADLINE — Due within 2 hours
      // ────────────────────────────────────────────────────────────────────────
      const approachingQuery = await db.collection('todos')
        .where('userId', '==', userId)
        .where('status', '==', 'pending')
        .where('date', '>=', nowStr)
        .where('date', '<=', in2hStr)
        .get();

      for (const taskDoc of approachingQuery.docs) {
        const task = taskDoc.data();
        const taskId = taskDoc.id;
        const minutesUntil = Math.max(0, Math.round(
          (new Date(task.date + 'T23:59:00').getTime() - now.getTime()) / 60000
        ));
        const isHighPriority = task.priority === 'high';

        // SMS: for HIGH priority tasks approaching
        if (isHighPriority && phoneNumber) {
          const smsKey = `sms_approaching_${taskId}`;
          if (!(await isThrottled(userId, smsKey, SMS_THROTTLE_MS))) {
            const sent = await sendSMS(phoneNumber, formatApproachingSMS(task, minutesUntil));
            if (sent) {
              await markThrottled(userId, smsKey);
              stats.smsSent++;
            }
          }
        }

        // Push: for all approaching tasks
        const pushKey = `push_approaching_${taskId}`;
        if (!(await isThrottled(userId, pushKey, PUSH_THROTTLE_MS))) {
          const hoursStr = minutesUntil < 60 ? `${minutesUntil}min` : `${Math.round(minutesUntil / 60)}h`;
          await sendFCM(
            tokens,
            `⏰ Due in ${hoursStr}: ${task.title || task.text}`,
            `Priority: ${(task.priority || 'medium').toUpperCase()}. Tap to open ZenTrack.`,
            { type: 'approaching', taskId, url: '/' }
          );
          await markThrottled(userId, pushKey);
          stats.pushSent++;
        }
      }

      // ────────────────────────────────────────────────────────────────────────
      // CHANNEL C: MORNING BRIEFING — 7:30–8:00am IST (2:00–2:30 UTC)
      // ────────────────────────────────────────────────────────────────────────
      const utcHour = now.getUTCHours();
      const utcMin  = now.getUTCMinutes();
      const isMorningWindow = (utcHour === 2 && utcMin < 30);

      if (isMorningWindow) {
        const morningKey = `morning_${userId}_${nowStr}`;
        if (!(await isThrottled(userId, morningKey, MORNING_THROTTLE))) {
          const [todayQ, overdueQ] = await Promise.all([
            db.collection('todos').where('userId', '==', userId).where('status', '==', 'pending').where('date', '==', nowStr).get(),
            db.collection('todos').where('userId', '==', userId).where('status', '==', 'pending').where('date', '<', nowStr).get(),
          ]);

          // Push notification
          await sendFCM(
            tokens,
            '☀️ Good morning! ZenTrack briefing ready.',
            `${todayQ.size} task${todayQ.size !== 1 ? 's' : ''} today${overdueQ.size > 0 ? `, ${overdueQ.size} overdue` : ''}. Open for AI briefing.`,
            { type: 'morning_brief', todayCount: String(todayQ.size), overdueCount: String(overdueQ.size), url: '/' }
          );
          stats.pushSent++;

          // SMS morning briefing (always send regardless of priority)
          if (phoneNumber) {
            const sent = await sendSMS(phoneNumber, formatMorningSMS(todayQ.size, overdueQ.size));
            if (sent) stats.smsSent++;
          }

          await markThrottled(userId, morningKey);
        }
      }

      // ────────────────────────────────────────────────────────────────────────
      // CHANNEL D: CLASS START ALERTS (student persona)
      // ────────────────────────────────────────────────────────────────────────
      if (userPersona === 'student') {
        const subjectsSnap = await db.collection('attendance_subjects')
          .where('userId', '==', userId).get();

        for (const subDoc of subjectsSnap.docs) {
          const subject = subDoc.data();
          const slot = subject.schedule?.[dayIndex];
          if (!slot?.startTimes) continue;

          for (const timeStr of slot.startTimes) {
            if (!timeStr) continue;
            const [hh, mm] = timeStr.split(':').map(Number);
            const startInMinutes = hh * 60 + mm;
            const diff = startInMinutes - istMinutes;

            // Alert 6–10 min before class
            if (diff > 5 && diff <= 10) {
              const classKey = `class_${subDoc.id}_${timeStr}_${nowStr}`;
              if (!(await isThrottled(userId, classKey, PUSH_THROTTLE_MS))) {
                await sendFCM(
                  tokens,
                  `🎓 Class in ${diff} min: ${subject.name}`,
                  `Starts at ${timeStr}. Get ready!`,
                  { type: 'class_alert', subjectId: subDoc.id, url: '/attendance' }
                );
                stats.pushSent++;
                await markThrottled(userId, classKey);
              }
            }
          }
        }
      }

      // ────────────────────────────────────────────────────────────────────────
      // CHANNEL E: ASSIGNMENT REMINDER — Due within 24h
      // ────────────────────────────────────────────────────────────────────────
      const assignSnap = await db.collection('assignments')
        .where('userId', '==', userId)
        .where('completed', '==', false)
        .where('dueDate', '>=', nowStr)
        .where('dueDate', '<=', in24hStr)
        .get();

      for (const assignDoc of assignSnap.docs) {
        const a = assignDoc.data();
        const pushKey = `push_assign_${assignDoc.id}`;
        if (await isThrottled(userId, pushKey, PUSH_THROTTLE_MS)) continue;

        await sendFCM(
          tokens,
          `📚 Assignment Due Soon: ${a.title}`,
          `"${a.title}" for ${a.subject} due ${a.dueDate}. Have you started?`,
          { type: 'assignment', assignmentId: assignDoc.id, url: '/attendance' }
        );
        stats.pushSent++;
        await markThrottled(userId, pushKey);

        // SMS if high-priority assignment
        if (phoneNumber && a.priority === 'high') {
          const smsKey = `sms_assign_${assignDoc.id}`;
          if (!(await isThrottled(userId, smsKey, SMS_THROTTLE_MS))) {
            const sent = await sendSMS(phoneNumber, `📚 ZenTrack: Assignment due soon\n\n"${a.title}"\nSubject: ${a.subject}\nDue: ${a.dueDate}\n\nmyzentrack.vercel.app`);
            if (sent) { await markThrottled(userId, smsKey); stats.smsSent++; }
          }
        }
      }
    }));

    console.log(`[watchdog] Done. SMS: ${stats.smsSent}, Push: ${stats.pushSent}, Users: ${stats.usersProcessed}`);
    return res.status(200).json({ success: true, ...stats });

  } catch (err) {
    console.error('[watchdog] Fatal error:', err);
    return res.status(500).json({ error: err.message });
  }
}
