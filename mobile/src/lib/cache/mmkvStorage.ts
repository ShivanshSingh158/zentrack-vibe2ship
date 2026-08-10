// import { MMKV } from 'react-native-mmkv';

// MOCK FOR DEBUGGING
// export const storage = new MMKV();
export const storage = {
  getString: () => null,
  set: () => {},
  delete: () => {}
};

export function getItem<T>(key: string): T | null {
  return null;
}

export function setItem<T>(key: string, value: T): void {
}

export function removeItem(key: string): void {
}
