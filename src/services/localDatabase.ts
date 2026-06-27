export const DB_NAME = 'ZenTrackCacheDB';
const DB_VERSION = 1;

const STORE_CALENDAR = 'calendar_cache';
const STORE_GMAIL = 'gmail_cache';

export interface CacheEntry<T> {
  id: string;
  timestamp: number;
  data: T;
}

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_CALENDAR)) {
        db.createObjectStore(STORE_CALENDAR, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_GMAIL)) {
        db.createObjectStore(STORE_GMAIL, { keyPath: 'id' });
      }
    };
  });
};

const getFromStore = async <T>(storeName: string, id: string): Promise<CacheEntry<T> | null> => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn(`[IndexedDB] Error reading ${id} from ${storeName}:`, err);
    return null;
  }
};

const saveToStore = async <T>(storeName: string, id: string, data: T): Promise<void> => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const entry: CacheEntry<T> = { id, timestamp: Date.now(), data };
      const request = store.put(entry);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.warn(`[IndexedDB] Error saving ${id} to ${storeName}:`, err);
  }
};

export const localDatabase = {
  getCalendarCache: (id: string) => getFromStore<any>(STORE_CALENDAR, id),
  saveCalendarCache: (id: string, data: any) => saveToStore(STORE_CALENDAR, id, data),
  getGmailCache: (id: string) => getFromStore<any>(STORE_GMAIL, id),
  saveGmailCache: (id: string, data: any) => saveToStore(STORE_GMAIL, id, data),
};
