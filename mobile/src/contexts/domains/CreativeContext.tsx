/**
 * CreativeContext — ZenTrack Mobile
 *
 * Owns: storageNodes, notes (derived), learningTopics, jobs.
 *
 * Subscription strategy: DEMAND-BASED + OFFLINE-FIRST.
 * On mount: reads all creative data from AsyncStorage instantly (~5ms).
 * Notes, Learning, and Jobs screens show real data immediately, even when offline.
 * Firestore snapshots silently update the cache when online.
 */
import React, { createContext, useContext, useEffect, useState, useMemo, useRef, useCallback } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { InteractionManager, DeviceEventEmitter, unstable_batchedUpdates } from 'react-native';
import { db } from "../../services/firebase";
import { COLLECTION } from "../../config/constants";
import type { StorageNode, Note, LearningTopic, JobApplication, ContentLog } from "../MobileDataContext";
import { readCreativeCache, writeCreativeCache } from "../../utils/domainCache";
import { loadBootManifest, getBootManifestSync } from "../../utils/bootManifest";
import { parseStorageNode, parseLearningTopic, areItemsEqual } from "../../utils/schemaGuards";


// ─── Context Shape ─────────────────────────────────────────────────────────────
export interface CreativeContextType {
  storageNodes: StorageNode[];
  notes: Note[];   // derived from storageNodes where type === 'note'
  learningTopics: LearningTopic[];
  jobs: JobApplication[];
  contentLogs: ContentLog[];
  ensureSubscribed: () => void;
  optimisticUpdateLearningTopic: (id: string, updates: Partial<LearningTopic>) => void;
  optimisticToggleSubtask: (topicId: string, subtaskId: string, isCompleted: boolean) => void;
  optimisticAddStorageNode: (node: StorageNode) => void;
  optimisticUpdateStorageNode: (id: string, updates: Partial<StorageNode>) => void;
  optimisticDeleteStorageNode: (id: string) => void;
  optimisticBatchDeleteStorageNodes: (ids: string[]) => void;
}

const DEFAULT_CREATIVE_DATA: CreativeContextType = {
  storageNodes: [],
  notes: [],
  learningTopics: [],
  jobs: [],
  contentLogs: [],
  ensureSubscribed: () => {},
  optimisticUpdateLearningTopic: () => {},
  optimisticToggleSubtask: () => {},
  optimisticAddStorageNode: () => {},
  optimisticUpdateStorageNode: () => {},
  optimisticDeleteStorageNode: () => {},
  optimisticBatchDeleteStorageNodes: () => {},
};

const CreativeContext = createContext<CreativeContextType | null>(null);

export function useCreativeData(): CreativeContextType {
  const ctx = useContext(CreativeContext);
  if (!ctx) {
    return DEFAULT_CREATIVE_DATA;
  }
  return ctx;
}

// ─── Provider ──────────────────────────────────────────────────────────────────
export function CreativeProvider({
  children,
  user,
}: {
  children: React.ReactNode;
  user: { uid: string } | null;
}) {
  const initialManifest = getBootManifestSync();
  const [storageNodes, setStorageNodes]     = useState<StorageNode[]>(initialManifest?.storageNodes ?? []);
  const [learningTopics, setLearningTopics] = useState<LearningTopic[]>(initialManifest?.learningTopics ?? []);
  const [jobs, setJobs]                     = useState<JobApplication[]>(initialManifest?.jobs ?? []);
  const [contentLogs, setContentLogs]       = useState<ContentLog[]>(initialManifest?.contentLogs ?? []);
  const subscribedRef = useRef(false);
  const unsubsRef     = useRef<(() => void)[]>([]);
  // OFFLINE-FIRST GUARD: ignore empty memoryLocalCache snapshots when cache is seeded.
  const hasCachedDataRef = useRef(
    (initialManifest?.storageNodes?.length ?? 0) > 0 ||
    (initialManifest?.learningTopics?.length ?? 0) > 0 ||
    (initialManifest?.jobs?.length ?? 0) > 0
  );

  // Fallback hydration: handles cold-start race conditions seamlessly
  useEffect(() => {
    let isCancelled = false;
    loadBootManifest().then(manifest => {
      if (isCancelled || !manifest) return;
      unstable_batchedUpdates(() => {
        setStorageNodes(prev => prev.length === 0 && (manifest.storageNodes?.length ?? 0) > 0 ? manifest.storageNodes : prev);
        setLearningTopics(prev => prev.length === 0 && (manifest.learningTopics?.length ?? 0) > 0 ? manifest.learningTopics : prev);
        setJobs(prev => prev.length === 0 && (manifest.jobs?.length ?? 0) > 0 ? manifest.jobs : prev);
        setContentLogs(prev => prev.length === 0 && (manifest.contentLogs?.length ?? 0) > 0 ? manifest.contentLogs : prev);
        if ((manifest.storageNodes?.length ?? 0) > 0 || (manifest.learningTopics?.length ?? 0) > 0) {
          hasCachedDataRef.current = true;
        }
      });
    }).catch(() => {});
    return () => { isCancelled = true; };
  }, []);

  // ── Listener auto-restart on error ───────────────────────────────────────
  const [subscriptionVersion, setSubscriptionVersion] = useState(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleListenerRestart = useCallback((context: string) => (err: Error) => {
    console.warn(`[Creative] ${context} listener error — restarting in 5s`, err.message);
    if (retryTimerRef.current) return;
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      subscribedRef.current = false;
      unsubsRef.current.forEach(u => u());
      unsubsRef.current = [];
      setSubscriptionVersion(v => v + 1);
    }, 5000);
  }, []);

  // ── Foreground reconnect: restart listeners after long background ─────────
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener('firestore_force_reconnect', () => {
      if (user) {
        console.log('[Creative] foreground reconnect — restarting Firestore listeners');
        unsubsRef.current.forEach(u => u());
        unsubsRef.current = [];
        subscribedRef.current = false;
        setSubscriptionVersion(v => v + 1);
      }
    });
    return () => sub.remove();
  }, [user?.uid]);

  // ── Offline-first boot: seed ALL creative collections from boot manifest ──
  // If getBootManifestSync() already populated state on Frame 0, this does 0 re-renders.
  useEffect(() => {
    let cancelled = false;
    loadBootManifest().then(cached => {
      if (cancelled) return;
      unstable_batchedUpdates(() => {
        let seeded = false;
        if (storageNodes.length === 0 && Array.isArray(cached.storageNodes) && cached.storageNodes.length > 0)     { setStorageNodes(cached.storageNodes); seeded = true; }
        if (learningTopics.length === 0 && Array.isArray(cached.learningTopics) && cached.learningTopics.length > 0) { setLearningTopics(cached.learningTopics); seeded = true; }
        if (jobs.length === 0 && Array.isArray(cached.jobs) && cached.jobs.length > 0)                     { setJobs(cached.jobs); seeded = true; }
        if (contentLogs.length === 0 && Array.isArray(cached.contentLogs) && cached.contentLogs.length > 0)       { setContentLogs(cached.contentLogs); seeded = true; }
        if (seeded) hasCachedDataRef.current = true;
      });
    });
    return () => { cancelled = true; };
  }, [user?.uid]);

  const openSubscriptions = useCallback((uid: string) => {
    if (subscribedRef.current) return;
    subscribedRef.current = true;

    unsubsRef.current.push(onSnapshot(
      query(collection(db, COLLECTION.STORAGE_NODES), where("userId", "==", uid)),
      snap => {
        if (snap.docs.length === 0 && hasCachedDataRef.current) return;
        unstable_batchedUpdates(() => {
          const fresh = snap.docs.map(d => parseStorageNode(d.data(), d.id));
          setStorageNodes(prev => areItemsEqual(prev, fresh) ? prev : fresh);
          InteractionManager.runAfterInteractions(() => writeCreativeCache({ storageNodes: fresh }));
        });
      },
      scheduleListenerRestart("storageNodes")
    ));
    unsubsRef.current.push(onSnapshot(
      query(collection(db, COLLECTION.LEARNING_TOPICS), where("userId", "==", uid)),
      snap => {
        if (snap.docs.length === 0 && hasCachedDataRef.current) return;
        unstable_batchedUpdates(() => {
          const fresh = snap.docs.map(d => parseLearningTopic(d.data(), d.id));
          setLearningTopics(prev => areItemsEqual(prev, fresh) ? prev : fresh);
          InteractionManager.runAfterInteractions(() => writeCreativeCache({ learningTopics: fresh }));
        });
      },
      scheduleListenerRestart("learningTopics")
    ));
    unsubsRef.current.push(onSnapshot(
      query(collection(db, COLLECTION.JOBS), where("userId", "==", uid)),
      snap => {
        if (snap.docs.length === 0 && hasCachedDataRef.current) return;
        unstable_batchedUpdates(() => {
          const fresh = snap.docs.map(d => ({ id: d.id, ...d.data() } as JobApplication));
          setJobs(prev => areItemsEqual(prev, fresh) ? prev : fresh);
          InteractionManager.runAfterInteractions(() => writeCreativeCache({ jobs: fresh }));
        });
      },
      scheduleListenerRestart("jobs")
    ));
    unsubsRef.current.push(onSnapshot(
      query(collection(db, COLLECTION.CONTENT_LOGS), where("userId", "==", uid)),
      snap => {
        if (snap.docs.length === 0 && hasCachedDataRef.current) return;
        unstable_batchedUpdates(() => {
          const fresh = snap.docs.map(d => ({ id: d.id, ...d.data() } as ContentLog));
          setContentLogs(prev => areItemsEqual(prev, fresh) ? prev : fresh);
          InteractionManager.runAfterInteractions(() => writeCreativeCache({ contentLogs: fresh }));
        });
      },
      scheduleListenerRestart("contentLogs")
    ));
  }, [scheduleListenerRestart]);

  const wasSubscribedRef = useRef(false);

  useEffect(() => {
    if (user && (subscribedRef.current || wasSubscribedRef.current)) {
      subscribedRef.current = false;
      openSubscriptions(user.uid);
      wasSubscribedRef.current = true;
    } else if (!user) {
      unsubsRef.current.forEach(u => u());
      unsubsRef.current = [];
      subscribedRef.current = false;
      wasSubscribedRef.current = false;
      if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
    }
    return () => {
      unsubsRef.current.forEach(u => u());
      unsubsRef.current = [];
      subscribedRef.current = false;
    };
  }, [user?.uid, subscriptionVersion, openSubscriptions]);

  useEffect(() => () => {
    unsubsRef.current.forEach(u => u());
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
  }, []);

  const ensureSubscribed = useCallback(() => {
    if (user && !subscribedRef.current) {
      wasSubscribedRef.current = true;
      openSubscriptions(user.uid);
    }
  }, [user?.uid, openSubscriptions]);

  // Notes are derived from storageNodes — no extra subscription needed
  const notes = useMemo(() =>
    storageNodes
      .filter(n => n.type === "note")
      .map(n => ({
        id: n.id || "",
        title: n.name,
        content: n.content || "",
        tags: n.tags || [],
        createdAt: n.createdAt,
        userId: n.userId,
      } as Note)),
    [storageNodes]
  );

  const optimisticUpdateLearningTopic = useCallback((id: string, updates: Partial<LearningTopic>) => {
    setLearningTopics(prev => {
      const fresh = prev.map(t => t.id === id ? { ...t, ...updates } : t);
      writeCreativeCache({ learningTopics: fresh }, true); // immediate: optimistic update
      return fresh;
    });
  }, []);

  const optimisticToggleSubtask = useCallback((topicId: string, subtaskId: string, isCompleted: boolean) => {
    const todayIso = new Date().toISOString().slice(0, 10);
    setLearningTopics(prev => {
      const fresh = prev.map(topic => {
        if (topic.id !== topicId) return topic;
        const updatedSubs = (topic.subTasks || []).map(sub => {
          if (sub.id !== subtaskId) return sub;
          return {
            ...sub,
            isCompleted,
            completedDate: isCompleted ? todayIso : undefined,
          };
        });
        return { ...topic, subTasks: updatedSubs };
      });
      writeCreativeCache({ learningTopics: fresh }, true); // immediate: optimistic toggle
      return fresh;
    });
  }, []);

  const optimisticAddStorageNode = useCallback((node: StorageNode) => {
    setStorageNodes(prev => {
      const filtered = node.id ? prev.filter(n => n.id !== node.id) : prev;
      const fresh = [node, ...filtered];
      writeCreativeCache({ storageNodes: fresh }, true);
      return fresh;
    });
  }, []);

  const optimisticUpdateStorageNode = useCallback((id: string, updates: Partial<StorageNode>) => {
    setStorageNodes(prev => {
      const fresh = prev.map(n => n.id === id ? { ...n, ...updates } : n);
      writeCreativeCache({ storageNodes: fresh }, true);
      return fresh;
    });
  }, []);

  const optimisticDeleteStorageNode = useCallback((id: string) => {
    setStorageNodes(prev => {
      const fresh = prev.filter(n => n.id !== id);
      writeCreativeCache({ storageNodes: fresh }, true);
      return fresh;
    });
  }, []);

  const optimisticBatchDeleteStorageNodes = useCallback((ids: string[]) => {
    const idSet = new Set(ids);
    setStorageNodes(prev => {
      const fresh = prev.filter(n => !n.id || !idSet.has(n.id));
      writeCreativeCache({ storageNodes: fresh }, true);
      return fresh;
    });
  }, []);

  const value = useMemo(() => ({
    storageNodes, notes, learningTopics, jobs, contentLogs, ensureSubscribed,
    optimisticUpdateLearningTopic, optimisticToggleSubtask,
    optimisticAddStorageNode, optimisticUpdateStorageNode, optimisticDeleteStorageNode, optimisticBatchDeleteStorageNodes,
  }), [
    storageNodes, notes, learningTopics, jobs, contentLogs, ensureSubscribed,
    optimisticUpdateLearningTopic, optimisticToggleSubtask,
    optimisticAddStorageNode, optimisticUpdateStorageNode, optimisticDeleteStorageNode, optimisticBatchDeleteStorageNodes,
  ]);

  return (
    <CreativeContext.Provider value={value}>
      {children}
    </CreativeContext.Provider>
  );
}
