import { useEffect, useRef, useState, useCallback } from 'react';
import { InteractionManager } from 'react-native';
import {
  Query,
  onSnapshot,
  QuerySnapshot,
  DocumentData,
} from 'firebase/firestore'; 
import { readCache, writeCache } from '../lib/cache/asyncCache';

export interface UseCachedFirestoreCollectionOptions<T> {
  cacheKey: string;
  buildQuery: () => Query<DocumentData>;
  mapSnapshot: (snapshot: QuerySnapshot<DocumentData>) => T;
  attachDelayMs?: number;
  enabled?: boolean;
}

export interface UseCachedFirestoreCollectionResult<T> {
  data: T | null;
  isHydrating: boolean;
  isLive: boolean;
  error: Error | null;
}

export function useCachedFirestoreCollection<T>({
  cacheKey,
  buildQuery,
  mapSnapshot,
  attachDelayMs = 0,
  enabled = true,
}: UseCachedFirestoreCollectionOptions<T>): UseCachedFirestoreCollectionResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [isHydrating, setIsHydrating] = useState(true);
  const [isLive, setIsLive] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let cancelled = false;
    readCache<T>(cacheKey).then((cached) => {
      if (cancelled) return;
      if (cached !== null) setData(cached);
      setIsHydrating(false);
    });
    return () => {
      cancelled = true;
    };
  }, [cacheKey]);

  const attach = useCallback(() => {
    try {
      const q = buildQuery();
      unsubRef.current = onSnapshot(
        q,
        (snapshot) => {
          const mapped = mapSnapshot(snapshot);
          setData(mapped);
          setIsLive(true);
          writeCache(cacheKey, mapped); 
        },
        (err) => setError(err as Error)
      );
    } catch (err) {
      setError(err as Error);
    }
  }, [buildQuery, mapSnapshot, cacheKey]);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    let interactionHandle: { cancel: () => void } | null = null;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

    interactionHandle = InteractionManager.runAfterInteractions(() => {
      if (cancelled) return;
      if (attachDelayMs > 0) {
        timeoutHandle = setTimeout(() => {
          if (!cancelled) attach();
        }, attachDelayMs);
      } else {
        attach();
      }
    });

    return () => {
      cancelled = true;
      interactionHandle?.cancel();
      if (timeoutHandle) clearTimeout(timeoutHandle);
      unsubRef.current?.();
      unsubRef.current = null;
    };
  }, [enabled, attach, attachDelayMs]);

  return { data, isHydrating, isLive, error };
}
