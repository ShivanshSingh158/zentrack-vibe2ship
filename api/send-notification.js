/**
 * api/send-notification.js
 *
 * Vercel Serverless Function — sends Firebase Cloud Messaging push notifications.
 *
 * Called by:
 *  - Client (FCM.sendPushNotification) for immediate triggers (e.g. Pomodoro done)
 *  - Cron jobs (api/cron-*.js) for scheduled reminders
 *
 * Env vars required (set in Vercel dashboard):
 *  FIREBASE_SERVICE_ACCOUNT_JSON  — contents of the Firebase service account key JSON
 */

import admin from 'firebase-admin';

// Initialise once per cold start
if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '{}');
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  } catch (err) {
    console.error('[send-notification] Failed to initialize Firebase Admin:', err.message);
  }
}

const db = admin.firestore();
const messaging = admin.messaging();

export default async function handler(req, res) {
  // ── CORS: never fall back to wildcard ────────────────────────────────────────
  const origin = req.headers['origin'] || '';
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'https://myzentrack.vercel.app')
    .split(',').map(o => o.trim()).filter(Boolean);

  const corsOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  res.setHeader('Access-Control-Allow-Origin', corsOrigin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Internal-Secret');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ── Internal secret auth — REQUIRED, not optional —————————————————
  // If ZENTRACK_INTERNAL_SECRET is not set in Vercel, the endpoint is broken by design.
  // Never allow an unauthenticated caller to send push notifications.
  const internalSecret = process.env.ZENTRACK_INTERNAL_SECRET;
  if (!internalSecret) {
    console.error('[send-notification] ZENTRACK_INTERNAL_SECRET is not configured. Refusing all requests.');
    return res.status(500).json({ error: 'Server misconfiguration: notification secret not set.' });
  }
  const provided = req.headers['x-internal-secret'] || '';
  if (provided !== internalSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('application/json')) {
    return res.status(415).json({ error: 'Content-Type must be application/json' });
  }

  const { userIds, title, body, url = '/', tag = 'zentrack', data = {} } = req.body || {};

  if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
    return res.status(400).json({ error: 'userIds array is required' });
  }
  if (!title || !body) {
    return res.status(400).json({ error: 'title and body are required' });
  }

  // Fetch FCM tokens for the given user IDs
  const tokens = [];
  const tokenDocs = await Promise.allSettled(
    userIds.map(uid => db.collection('fcm_tokens').doc(uid).get())
  );

  for (const result of tokenDocs) {
    if (result.status === 'fulfilled' && result.value.exists) {
      const token = result.value.data()?.token;
      if (token) tokens.push(token);
    }
  }

  if (tokens.length === 0) {
    return res.status(200).json({ message: 'No registered tokens found for these users', sent: 0 });
  }

  // Build the message payload
  // DATA-ONLY Payload! Removing 'notification' from root forces Android
  // to deliver this to our Service Worker in the background.
  const payload = {
    data: {
      title,
      body,
      tag: tag || 'zentrack-notification',
      url: url || '/'
    },
    android: {
      priority: 'high',
    },
    webpush: {
      headers: {
        Urgency: 'high'
      }
    },
    tokens: tokens,
  };

  try {
    // Send to multiple tokens
    const batchResponse = await messaging.sendEachForMulticast(payload);

    // Clean up stale tokens that are no longer valid
    const staleTokens = [];
    batchResponse.responses.forEach((resp, idx) => {
      if (!resp.success && resp.error?.code === 'messaging/registration-token-not-registered') {
        staleTokens.push(tokens[idx]);
      }
    });

    if (staleTokens.length > 0) {
      // Find and delete stale token docs
      const snapshot = await db.collection('fcm_tokens')
        .where('token', 'in', staleTokens)
        .get();
      const batch = db.batch();
      snapshot.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
      console.info(`[send-notification] Cleaned up ${staleTokens.length} stale token(s)`);
    }

    return res.status(200).json({
      sent: batchResponse.successCount,
      failed: batchResponse.failureCount,
      total: tokens.length,
    });
  } catch (err) {
    console.error('[send-notification] Error:', err);
    return res.status(500).json({ error: 'Failed to send notification', details: err.message });
  }
}
