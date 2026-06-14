/**
 * src/services/fcm.ts
 *
 * Firebase Cloud Messaging — client-side token management.
 *
 * Responsibilities:
 *  1. Initialize Firebase Messaging (lazy — only when needed)
 *  2. Request notification permission from the user
 *  3. Get the FCM registration token
 *  4. Save/refresh the token in Firestore under the user's document
 *  5. Handle foreground messages (app is open)
 */

import { getMessaging, getToken, onMessage, type Messaging } from 'firebase/messaging';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from './firebase';

// VAPID key — must be set as VITE_FIREBASE_VAPID_KEY in Vercel env vars (never hardcode)
const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY ||
  'BIt2pkWP54tAYxUN_U1Hbs4ZyQjgJRQ8h8rN0l0QWxJsmJaOWCRb_ywr1W8xcJ2LMdjGJdkT0wihc57CS6VwEOE';

let messagingInstance: Messaging | null = null;

function getMessagingInstance(): Messaging | null {
  try {
    if (!messagingInstance) {
      messagingInstance = getMessaging();
    }
    return messagingInstance;
  } catch (err) {
    console.warn('[FCM] Messaging not supported in this environment:', err);
    return null;
  }
}

/**
 * Request notification permission and register the FCM token.
 * Call this once after the user is authenticated.
 * Returns the token string or null if permission was denied / not supported.
 */
export async function registerFCMToken(): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;

  // Check browser support
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    console.warn('[FCM] Notifications or Service Workers not supported');
    return null;
  }

  // Request permission
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    console.info('[FCM] Notification permission denied');
    return null;
  }

  const messaging = getMessagingInstance();
  if (!messaging) return null;

  try {
    // Register the FCM service worker at a specific scope so it DOES NOT fight with
    // the main PWA service worker (sw.js) which is registered at the root '/'
    const swRegistration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
      scope: '/firebase-push-scope/',
    });

    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swRegistration,
    });

    if (token) {
      // Persist token in Firestore so the server can send notifications
      await setDoc(
        doc(db, 'fcm_tokens', user.uid),
        {
          token,
          userId: user.uid,
          userEmail: user.email,
          updatedAt: serverTimestamp(),
          platform: 'web',
          userAgent: navigator.userAgent.slice(0, 200),
        },
        { merge: true }
      );
      console.info('[FCM] Token registered:', token.slice(0, 20) + '...');
      return token;
    }
  } catch (err) {
    console.error('[FCM] Failed to get token:', err);
  }
  return null;
}

/**
 * Listen for foreground messages (when the app tab is open and focused).
 * Pass a callback to handle the message (e.g. show a toast).
 */
export function onForegroundMessage(
  callback: (payload: { title: string; body: string; data?: Record<string, string> }) => void
) {
  const messaging = getMessagingInstance();
  if (!messaging) return () => {};

  const unsubscribe = onMessage(messaging, (payload) => {
    const { title = 'Zentrack', body = '' } = payload.notification || {};
    const data = (payload.data || {}) as Record<string, string>;
    callback({ title, body, data });
  });

  return unsubscribe;
}

/**
 * Send a push notification to one or more users via the /api/send-notification endpoint.
 * Use this from the client to trigger server-side pushes (e.g. pomodoro done).
 */
export async function sendPushNotification(payload: {
  userIds: string[];
  title: string;
  body: string;
  url?: string;
  tag?: string;
}) {
  try {
    const res = await fetch('/api/send-notification', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Internal secret prevents unauthenticated callers from using this endpoint
        'X-Internal-Secret': import.meta.env.VITE_INTERNAL_SECRET || '',
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error('[FCM] Send failed:', err);
    }
  } catch (err) {
    console.error('[FCM] Network error sending notification:', err);
  }
}

