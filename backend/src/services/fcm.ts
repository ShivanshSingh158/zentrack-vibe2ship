/**
 * src/services/fcm.ts
 * (Backend Version)
 * Only contains sendPushNotification which queues the push into Firestore.
 */

import { collection, addDoc, serverTimestamp } from './firebase';
import { db } from './firebase';

export async function sendPushNotification(payload: {
  userIds: string[];
  title: string;
  body: string;
  url?: string;
  tag?: string;
}) {
  try {
    const queueRef = collection(db, 'pushNotificationQueue');
    await addDoc(queueRef, {
      ...payload,
      status: 'pending',
      createdAt: serverTimestamp()
    });
  } catch (err) {
    console.error('[FCM] Network error queuing notification:', err);
  }
}
