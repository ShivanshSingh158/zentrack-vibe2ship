import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, setPersistence, browserLocalPersistence } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCWZ_tUzZynf60lxC3-RweGfZRGlcHBz_s",
  authDomain: typeof window !== 'undefined' ? window.location.host : "job-tracker-6b672.firebaseapp.com",
  projectId: "job-tracker-6b672",
  storageBucket: "job-tracker-6b672.firebasestorage.app",
  messagingSenderId: "336719988763",
  appId: "1:336719988763:web:7da94195ccd2272d6990be",
  measurementId: "G-FF0W5YR1CM"
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
