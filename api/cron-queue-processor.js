/**
 * api/cron-queue-processor.js
 *
 * ZenTrack — Push Notification Queue Processor
 *
 * Processes documents from the `pushNotificationQueue` Firestore collection.
 * The client writes to this queue (via fcm.ts sendPushNotification), and
 * this cron picks them up and delivers them via FCM — ensuring pushes work
 * even when the browser is closed.
 *
 * Called by GitHub Actions every 5 minutes alongside cron-watchdog.
 *
 * REQUIRED ENV VARS:
 *   FIREBASE_SERVICE_ACCOUNT_JSON  — Firebase service account JSON
 *   CRON_SECRET                    — Shared secret for GitHub Actions auth
 */

import admin from 'firebase-admin';

if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '{}');
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  } catch (err) {
    console.error('[queue-processor] Firebase Admin init failed:', err.message);
  }
}

const db = admin.firestore();
const messaging = admin.messaging();

export default async function handler(req, res) {
  // ── Auth ──────────────────────────────────────────────────────────────────────
  const expectedSecret = process.env.CRON_SECRET;
  if (!expectedSecret) {
    return res.status(500).json({ error: 'CRON_SECRET not configured.' });
  }
  if (req.headers['authorization'] !== `Bearer ${expectedSecret}`) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }

  try {
    // ── Fetch up to 20 pending items (process in small batches) ──────────────────
    const pendingSnap = await db.collection('pushNotificationQueue')
      .where('status', '==', 'pending')
      .orderBy('createdAt')
      .limit(20)
      .get();

    if (pendingSnap.empty) {
      return res.status(200).json({ success: true, processed: 0, sent: 0 });
    }

    let sent = 0;
    let failed = 0;

    for (const queueDoc of pendingSnap.docs) {
      const item = queueDoc.data();

      // Mark as 'processing' immediately to prevent duplicate delivery from parallel runs
      await queueDoc.ref.update({ status: 'processing' });

      try {
        // Validate required fields
        if (!item.userIds || !Array.isArray(item.userIds) || !item.title || !item.body) {
          await queueDoc.ref.update({ status: 'failed', error: 'Missing required fields' });
          failed++;
          continue;
        }

        // Fetch FCM tokens for the target users
        const tokenResults = await Promise.allSettled(
          item.userIds.map(uid => db.collection('fcm_tokens').doc(uid).get())
        );

        const tokens = tokenResults
          .filter(r => r.status === 'fulfilled' && r.value.exists)
          .map(r => r.value.data()?.token)
          .filter(Boolean);

        if (tokens.length === 0) {
          // No registered tokens — mark as sent (nothing to deliver)
          await queueDoc.ref.update({
            status: 'sent',
            sentAt: admin.firestore.FieldValue.serverTimestamp(),
            note: 'No FCM tokens registered for target users',
          });
          continue;
        }

        // Send via FCM — data-only payload so SW handles display in background
        const payload = {
          data: {
            title: String(item.title).slice(0, 200),
            body: String(item.body).slice(0, 500),
            tag: String(item.tag || 'zentrack'),
            url: String(item.url || '/'),
          },
          android: { priority: 'high' },
          webpush: { headers: { Urgency: 'high' } },
          tokens,
        };

        const batchResp = await messaging.sendEachForMulticast(payload);

        // Clean up stale tokens
        const staleTokens = [];
        batchResp.responses.forEach((r, idx) => {
          if (!r.success && r.error?.code === 'messaging/registration-token-not-registered') {
            staleTokens.push(tokens[idx]);
          }
        });
        if (staleTokens.length > 0) {
          const staleSnap = await db.collection('fcm_tokens').where('token', 'in', staleTokens).get();
          const batch = db.batch();
          staleSnap.docs.forEach(d => batch.delete(d.ref));
          await batch.commit();
          console.info(`[queue-processor] Cleaned ${staleTokens.length} stale FCM token(s)`);
        }

        await queueDoc.ref.update({
          status: 'sent',
          sentAt: admin.firestore.FieldValue.serverTimestamp(),
          successCount: batchResp.successCount,
          failureCount: batchResp.failureCount,
        });
        sent++;

      } catch (itemErr) {
        console.error(`[queue-processor] Failed to process ${queueDoc.id}:`, itemErr.message);
        await queueDoc.ref.update({
          status: 'failed',
          error: itemErr.message.slice(0, 200),
        });
        failed++;
      }
    }

    console.log(`[queue-processor] Done. Sent: ${sent}, Failed: ${failed}, Total: ${pendingSnap.size}`);
    return res.status(200).json({ success: true, processed: pendingSnap.size, sent, failed });

  } catch (err) {
    console.error('[queue-processor] Fatal:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
