import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import dotenv from 'dotenv';
import { AsyncLocalStorage } from 'async_hooks';

dotenv.config();

if (getApps().length === 0) {
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      initializeApp({ credential: cert(serviceAccount) });
    } else {
      initializeApp();
    }
  } catch (e) {
    console.warn('Firebase Admin initialization failed.', e);
  }
}

export const db = getFirestore();
export const adminAuth = getAuth();

// --- AsyncLocalStorage Context for Multi-Tenant Auth & Tokens ---
import type { Socket } from 'socket.io';
export const contextStorage = new AsyncLocalStorage<{ user?: { uid: string }, googleAccessToken?: string, socket?: Socket }>();

export const auth = {
  get currentUser() {
    return contextStorage.getStore()?.user || null;
  }
};

// --- Firebase Client SDK v9 Adapter for Firebase Admin ---
export const collection = (dbInstance: any, path: string) => dbInstance.collection(path);
export const doc = (dbInstance: any, colPath: string, docId: string) => dbInstance.collection(colPath).doc(docId);
export const serverTimestamp = () => require('firebase-admin/firestore').FieldValue.serverTimestamp();
export const addDoc = (colRef: any, data: any) => colRef.add(data);
export const updateDoc = (docRef: any, data: any) => docRef.update(data);
export const deleteDoc = (docRef: any) => docRef.delete();
export const getDoc = async (docRef: any) => {
  const snapshot = await docRef.get();
  return {
    exists: () => snapshot.exists,
    data: () => snapshot.data(),
    id: snapshot.id
  };
};
export const getDocs = async (queryRef: any) => {
  const snapshot = await queryRef.get();
  return {
    docs: snapshot.docs.map((d: any) => ({
      id: d.id,
      data: () => d.data()
    })),
    empty: snapshot.empty,
    size: snapshot.size
  };
};
export const query = (colRef: any, ...clauses: any[]) => {
  let q = colRef;
  for (const clause of clauses) {
    q = clause(q);
  }
  return q;
};
export const where = (fieldPath: string, opStr: string, value: any) => {
  return (q: any) => q.where(fieldPath, opStr, value);
};
export const writeBatch = (dbInstance: any) => {
  const batch = dbInstance.batch();
  return {
    set: (docRef: any, data: any, options: any) => { batch.set(docRef, data, options); },
    update: (docRef: any, data: any) => { batch.update(docRef, data); },
    delete: (docRef: any) => { batch.delete(docRef); },
    commit: () => batch.commit()
  };
};
export const setDoc = (docRef: any, data: any, options?: any) => docRef.set(data, options);
export const orderBy = (fieldPath: string, directionStr?: string) => (q: any) => q.orderBy(fieldPath, directionStr);
export const limit = (limitNum: number) => (q: any) => q.limit(limitNum);
