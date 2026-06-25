import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

// Make sure admin is initialized (this is usually done in index.ts or other services)
if (!admin.apps.length) {
  admin.initializeApp();
}

/**
 * Listens for new documents in the `pushNotificationQueue` collection.
 * When a request is queued by the frontend, this cloud function picks it up,
 * retrieves the target users' FCM tokens from their user records,
 * and securely sends the push notification via Firebase Admin SDK.
 */
export const processPushNotificationQueue = functions.firestore
  .document('pushNotificationQueue/{docId}')
  .onCreate(async (snap, context) => {
    const payload = snap.data();
    
    if (!payload.userIds || !Array.isArray(payload.userIds) || payload.userIds.length === 0) {
      console.log('No userIds provided in notification payload');
      return snap.ref.update({ status: 'error', error: 'No userIds provided' });
    }

    try {
      const tokens: string[] = [];
      
      // Fetch FCM tokens for all target users
      for (const userId of payload.userIds) {
        const tokenDoc = await admin.firestore().collection('fcm_tokens').doc(userId).get();
        if (tokenDoc.exists) {
          const tokenData = tokenDoc.data();
          if (tokenData && tokenData.token) {
            tokens.push(tokenData.token);
          }
        }
      }

      if (tokens.length === 0) {
        console.log('No valid FCM tokens found for target users');
        return snap.ref.update({ status: 'error', error: 'No valid tokens found' });
      }

      const message: admin.messaging.MulticastMessage = {
        notification: {
          title: payload.title || 'ZenTrack Alert',
          body: payload.body || '',
        },
        data: {
          url: payload.url || '/',
          tag: payload.tag || 'general'
        },
        tokens: tokens,
      };

      const response = await admin.messaging().sendEachForMulticast(message);
      
      console.log(`Successfully sent ${response.successCount} messages; ${response.failureCount} failed.`);
      
      return snap.ref.update({ 
        status: 'processed', 
        successCount: response.successCount,
        failureCount: response.failureCount,
        processedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
    } catch (error: any) {
      console.error('Error processing push notification queue:', error);
      return snap.ref.update({ status: 'error', error: error.message });
    }
  });

/**
 * Runs every minute to process scheduled reminders.
 */
export const processScheduledReminders = functions.pubsub
  .schedule('every 1 minutes').onRun(async () => {
    const now = new Date().toISOString();
    const due = await admin.firestore().collection('scheduledReminders')
      .where('status', '==', 'pending')
      .where('fireAt', '<=', now).get();

    const promises = due.docs.map(async (rem) => {
      try {
        const d = rem.data();
        const tokenDoc = await admin.firestore().collection('fcm_tokens').doc(d.userId).get();
        if (tokenDoc.exists) {
          const token = tokenDoc.data()?.token;
          if (token) {
            await admin.messaging().send({
              token: token,
              notification: { title: '🧠 Zen AI Reminder', body: d.message }
            });
          }
        }
        await rem.ref.update({ status: 'sent', sentAt: admin.firestore.FieldValue.serverTimestamp() });
      } catch (e: any) {
        console.error(`Failed to process reminder ${rem.id}:`, e);
        // Mark as error so it doesn't poison the queue infinitely
        await rem.ref.update({ status: 'error', error: e.message, failedAt: admin.firestore.FieldValue.serverTimestamp() }).catch(console.error);
      }
    });

    await Promise.allSettled(promises);
  });
