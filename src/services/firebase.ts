import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, setPersistence, browserLocalPersistence } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';

/**
 * Firebase client config — uses VITE_ env vars so values can differ between
 * environments without changing source code.
 *
 * NOTE: Firebase `apiKey` is a PUBLIC identifier (it identifies your GCP project),
 * NOT a secret. It is safe to expose via VITE_ prefix. Actual security comes
 * from Firebase Security Rules + Firebase Auth, not from hiding the apiKey.
 *
 * Required .env entries:
 *   VITE_FIREBASE_API_KEY
 *   VITE_FIREBASE_AUTH_DOMAIN
 *   VITE_FIREBASE_PROJECT_ID
 *   VITE_FIREBASE_STORAGE_BUCKET
 *   VITE_FIREBASE_MESSAGING_SENDER_ID
 *   VITE_FIREBASE_APP_ID
 */
const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY            as string,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN         as string,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID         as string,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET     as string,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID             as string,
  measurementId:     import.meta.env.VITE_FIREBASE_MEASUREMENT_ID     as string | undefined,
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Explicitly set persistence to local to prevent unexpected logouts over time
setPersistence(auth, browserLocalPersistence).catch(console.error);

/**
 * Firebase v12 offline persistence + multi-tab sync.
 *
 * persistentLocalCache  → stores Firestore data in IndexedDB so reads work
 *                         offline and writes are queued until back online.
 * persistentMultipleTabManager → all open browser tabs share the same cache;
 *                         when Tab A writes, Tab B's onSnapshot fires instantly.
 *
 * This replaces the removed `enableMultiTabIndexedDbPersistence` API.
 */
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
});

export const googleProvider = new GoogleAuthProvider();
