import AsyncStorage from '@react-native-async-storage/async-storage';

const VERSION = 1; // bump if cached shape ever changes

export interface CacheEnvelope<T> {
  v: number;
  savedAt: number;
  data: T;
}

export async function readCache<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const parsed: CacheEnvelope<T> = JSON.parse(raw);
    if (parsed.v !== VERSION) return null;
    return parsed.data;
  } catch {
    return null; // corrupt entry — miss gracefully, don't crash
  }
}

export async function writeCache<T>(key: string, data: T): Promise<void> {
  try {
    const envelope: CacheEnvelope<T> = { v: VERSION, savedAt: Date.now(), data };
    await AsyncStorage.setItem(key, JSON.stringify(envelope));
  } catch {
    // Non-fatal — next cold start just won't have this domain warm.
  }
}

export async function clearCache(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch {}
}
