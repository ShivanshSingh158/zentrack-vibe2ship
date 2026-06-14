/**
 * api/cron-classes.js
 *
 * Backend Cron Job to send class start notifications.
 * Triggered by a GitHub Action every 5 minutes.
 *
 * It scans all users' `attendance_subjects`, finds classes starting
 * in ~10 minutes, and sends FCM push notifications directly.
 */

import admin from 'firebase-admin';

if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '{}');
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  } catch (err) {
    console.error('[cron-classes] Failed to initialize Firebase Admin:', err.message);
  }
}

const db = admin.firestore();
const messaging = admin.messaging();

export default async function handler(req, res) {
  // 1. Security Check: Only allow requests with the correct CRON_SECRET
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) {
    console.error('[cron-classes] CRON_SECRET is not configured in Vercel.');
    return res.status(500).json({ error: 'Server misconfiguration.' });
  }

  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${expectedSecret}`) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  try {
    const now = new Date();
    // Vercel server time is UTC. We need to handle timezones.
    // However, the `startTimes` stored in Firestore are just "HH:MM" strings 
    // local to the user. Without saving the user's timezone, this is tricky.
    // For now, we will assume IST (UTC+5:30) as a fallback, or we fetch the user's 
    // offset from their latest login if we have it. 
    // The previous implementation used the local machine time.
    // Let's assume the user is in India Standard Time for this personal project.
    const userTime = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
    
    const dayIndex = userTime.getDay().toString();
    const currentHours = userTime.getHours();
    const currentMinutes = userTime.getMinutes();
    const currentTimeInMinutes = currentHours * 60 + currentMinutes;

    let pushesSent = 0;

    // Fetch all subjects across all users (in a real app, you'd only fetch active ones, but fine for personal use)
    const snapshot = await db.collection('attendance_subjects').get();
    
    // Group subjects by userId to minimize DB calls for FCM tokens
    const userNotifications = {};

    snapshot.forEach(doc => {
      const subject = doc.data();
      const slot = subject.schedule?.[dayIndex];
      if (!slot || !slot.startTimes) return;

      slot.startTimes.forEach((timeStr) => {
        if (!timeStr) return;
        const [hh, mm] = timeStr.split(':').map(Number);
        const startInMinutes = hh * 60 + mm;
        const diff = startInMinutes - currentTimeInMinutes;

        // Trigger if class starts in 6 to 10 minutes (since cron runs every 5 minutes, this guarantees 1 trigger)
        if (diff > 5 && diff <= 10) {
          if (!userNotifications[subject.userId]) {
            userNotifications[subject.userId] = [];
          }
          userNotifications[subject.userId].push({
            title: `Class starting soon: ${subject.name}`,
            body: `Starts at ${timeStr}. Get ready!`,
            tag: `class-${doc.id}-${timeStr}`,
          });
        }
      });
    });

    // Send the pushes
    for (const [userId, notifications] of Object.entries(userNotifications)) {
      const tokensSnap = await db.collection('fcm_tokens').where('userId', '==', userId).get();
      const tokens = tokensSnap.docs.map(t => t.data().token);
      
      if (tokens.length === 0) continue;

      for (const notif of notifications) {
        // DATA-ONLY Payload! Removing 'notification' from root forces Android
        // to deliver this to our Service Worker in the background.
        const payload = {
          data: { 
            title: notif.title, 
            body: notif.body,
            tag: notif.tag,
            url: '/attendance'
          },
          android: {
            priority: 'high',
          },
          webpush: {
            headers: {
              Urgency: 'high'
            }
          },
          tokens,
        };

        const response = await messaging.sendEachForMulticast(payload);
        pushesSent += response.successCount;
      }
    }

    return res.status(200).json({ success: true, pushesSent });

  } catch (error) {
    console.error('[cron-classes] Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
