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

  const buildQueryRef = useRef(buildQuery);
  const mapSnapshotRef = useRef(mapSnapshot);
  useEffect(() => {
    buildQueryRef.current = buildQuery;
    mapSnapshotRef.current = mapSnapshot;
  });

  useEffect(() => {
    let cancelled = false;
    setIsHydrating(true);
    readCache<T>(cacheKey)
      .then((cached) => {
        if (cancelled) return;
        if (cached !== null) setData(cached);
        setIsHydrating(false);
      })
      .catch(() => {
        if (!cancelled) setIsHydrating(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cacheKey]);

  const attach = useCallback((isCancelled: () => boolean) => {
    try {
      unsubRef.current?.();
      const q = buildQueryRef.current();
      unsubRef.current = onSnapshot(
        q,
        (snapshot) => {
          if (isCancelled()) return;
          const mapped = mapSnapshotRef.current(snapshot);
          setData(mapped);
          setIsLive(true);
          writeCache(cacheKey, mapped);
        },
        (err) => {
          if (!isCancelled()) setError(err as Error);
        }
      );
    } catch (err) {
      if (!isCancelled()) setError(err as Error);
    }
  }, [cacheKey]);

  useEffect(() => {
    if (!enabled) {
      setIsLive(false);
      return;
    }
    let cancelled = false;
    const isCancelled = () => cancelled;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

    const interactionHandle = InteractionManager.runAfterInteractions(() => {
      if (cancelled) return;
      if (attachDelayMs > 0) {
        timeoutHandle = setTimeout(() => {
          if (!cancelled) attach(isCancelled);
        }, attachDelayMs);
      } else {
        attach(isCancelled);
      }
    });

    return () => {
      cancelled = true;
      interactionHandle.cancel();
      if (timeoutHandle) clearTimeout(timeoutHandle);
      unsubRef.current?.();
      unsubRef.current = null;
    };
  }, [enabled, attach, attachDelayMs]);

  return { data, isHydrating, isLive, error };
}
