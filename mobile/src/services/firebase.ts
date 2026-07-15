import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, initializeAuth } from 'firebase/auth';
// @ts-ignore
import { getReactNativePersistence } from 'firebase/auth';
import { getFirestore, initializeFirestore, persistentLocalCache } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey:            process.env.EXPO_PUBLIC_FIREBASE_API_KEY            as string,
  authDomain:        process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN        as string,
  projectId:         process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID         as string,
  storageBucket:     process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET     as string,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID as string,
  appId:             process.env.EXPO_PUBLIC_FIREBASE_APP_ID             as string,
};

const app = initializeApp(firebaseConfig);

// Enable React Native Persistence for Auth
// @ts-ignore
export const auth = initializeAuth(app, {
  // @ts-ignore
  persistence: getReactNativePersistence ? getReactNativePersistence(AsyncStorage) : undefined
});

// Enable Offline Persistence for Firestore
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache(),
  experimentalAutoDetectLongPolling: true,
});

export const googleProvider = new GoogleAuthProvider();
