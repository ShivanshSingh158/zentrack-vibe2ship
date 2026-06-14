// firebase-messaging-sw.js
// This service worker receives push notifications from FCM when the app is
// in the background or completely closed.

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyCWZ_tUzZynf60lxC3-RweGfZRGlcHBz_s",
  authDomain: "myzentrack.vercel.app",
  projectId: "job-tracker-6b672",
  storageBucket: "job-tracker-6b672.firebasestorage.app",
  messagingSenderId: "336719988763",
  appId: "1:336719988763:web:7da94195ccd2272d6990be",
});

const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Background message received:', payload);

  const { title, body, icon, data } = payload.notification || {};
  const notificationTitle = title || 'Zentrack';
  const notificationOptions = {
    body: body || '',
    icon: icon || '/icon-192.png',
    badge: '/icon-192.png',
    data: data || {},
    tag: data?.tag || 'zentrack-notification',
    renotify: true,
    requireInteraction: false,
    actions: data?.actions ? JSON.parse(data.actions) : [],
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

// When user clicks the notification, open the app and navigate
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
