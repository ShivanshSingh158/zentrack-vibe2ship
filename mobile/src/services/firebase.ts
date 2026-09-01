import { initializeApp } from 'firebase/app';
import { GoogleAuthProvider, initializeAuth } from 'firebase/auth';
// @ts-ignore
import { getReactNativePersistence } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentSingleTabManager,
  memoryLocalCache,
  memoryLruGarbageCollector
} from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey:            process.env.EXPO_PUBLIC_FIREBASE_API_KEY            || 'AIzaSyCWZ_tUzZynf60lxC3-RweGfZRGlcHBz_s',
  authDomain:        process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN        || 'job-tracker-6b672.firebaseapp.com',
  projectId:         process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID         || 'job-tracker-6b672',
  storageBucket:     process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET     || 'job-tracker-6b672.firebasestorage.app',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '336719988763',
  appId:             process.env.EXPO_PUBLIC_FIREBASE_APP_ID             || '1:336719988763:web:7da94195ccd2272d6990be',
};

const app = initializeApp(firebaseConfig);

// Enable React Native Persistence for Auth
// @ts-ignore
export const auth = initializeAuth(app, {
  // @ts-ignore
  persistence: getReactNativePersistence ? getReactNativePersistence(AsyncStorage) : undefined
});

// React Native (Hermes) does not have browser IndexedDB.
// ZenTrack manages its own full offline persistence via AsyncStorage & domain caches.
// Using memoryLocalCache prevents Firebase from attempting and failing an IndexedDB initialization.
const localCacheSetting = memoryLocalCache({ garbageCollector: memoryLruGarbageCollector() });

export const db = initializeFirestore(app, {
  localCache: localCacheSetting,
  experimentalAutoDetectLongPolling: true,
});

export const googleProvider = new GoogleAuthProvider();
