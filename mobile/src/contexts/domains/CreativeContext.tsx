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
import { InteractionManager, DeviceEventEmitter } from 'react-native';
import { db } from "../../services/firebase";
import { COLLECTION } from "../../config/constants";
import type { StorageNode, Note, LearningTopic, JobApplication, ContentLog } from "../MobileDataContext";
import { readCreativeCache, writeCreativeCache } from "../../utils/domainCache";
import { parseStorageNode, parseLearningTopic } from "../../utils/schemaGuards";

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
  const [storageNodes, setStorageNodes]   = useState<StorageNode[]>([]);
  const [learningTopics, setLearningTopics] = useState<LearningTopic[]>([]);
  const [jobs, setJobs]                   = useState<JobApplication[]>([]);
  const [contentLogs, setContentLogs]     = useState<ContentLog[]>([]);
  const subscribedRef = useRef(false);
  const unsubsRef     = useRef<(() => void)[]>([]);

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
  // AppNavigator emits 'firestore_force_reconnect' on every AppState: active.
  // Resets subscribedRef and bumps subscriptionVersion to force a clean
  // listener teardown and reopen after the app returns from 6+ hours background.
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
  }, [user]);

  // ── Offline-first boot: seed from AsyncStorage when user uid is available ──
  const userUid = user?.uid ?? null;
  useEffect(() => {
    if (!userUid) return;
    let cancelled = false;
    readCreativeCache().then(cached => {
      if (cancelled) return;
      if (Array.isArray(cached.storageNodes))   setStorageNodes(cached.storageNodes);
      if (Array.isArray(cached.learningTopics)) setLearningTopics(cached.learningTopics);
      if (Array.isArray(cached.jobs))           setJobs(cached.jobs);
      if (Array.isArray(cached.contentLogs))    setContentLogs(cached.contentLogs);
    });
    return () => { cancelled = true; };
  }, [userUid]);

  const openSubscriptions = useCallback((uid: string) => {
    if (subscribedRef.current) return;
    subscribedRef.current = true;

    unsubsRef.current.push(onSnapshot(
      query(collection(db, COLLECTION.STORAGE_NODES), where("userId", "==", uid)),
      snap => { const fresh = snap.docs.map(d => parseStorageNode(d.data(), d.id)); setStorageNodes(fresh); writeCreativeCache({ storageNodes: fresh }); },
      scheduleListenerRestart("storageNodes")
    ));
    unsubsRef.current.push(onSnapshot(
      query(collection(db, COLLECTION.LEARNING_TOPICS), where("userId", "==", uid)),
      snap => { const fresh = snap.docs.map(d => parseLearningTopic(d.data(), d.id)); setLearningTopics(fresh); writeCreativeCache({ learningTopics: fresh }); },
      scheduleListenerRestart("learningTopics")
    ));
    unsubsRef.current.push(onSnapshot(
      query(collection(db, COLLECTION.JOBS), where("userId", "==", uid)),
      snap => { const fresh = snap.docs.map(d => ({ id: d.id, ...d.data() } as JobApplication)); setJobs(fresh); writeCreativeCache({ jobs: fresh }); },
      scheduleListenerRestart("jobs")
    ));
    unsubsRef.current.push(onSnapshot(
      query(collection(db, COLLECTION.CONTENT_LOGS), where("userId", "==", uid)),
      snap => { const fresh = snap.docs.map(d => ({ id: d.id, ...d.data() } as ContentLog)); setContentLogs(fresh); writeCreativeCache({ contentLogs: fresh }); },
      scheduleListenerRestart("contentLogs")
    ));
  }, [scheduleListenerRestart]);

  useEffect(() => {
    if (user) {
      openSubscriptions(user.uid);
    } else {
      unsubsRef.current.forEach(u => u());
      unsubsRef.current = [];
      subscribedRef.current = false;
      if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
    }
    // BUG FIX: missing cleanup return — without this, subscriptionVersion bumps
    // cause new listeners to open WITHOUT tearing down the old (dead) ones first,
    // resulting in duplicate listener registrations.
    return () => {
      unsubsRef.current.forEach(u => u());
      unsubsRef.current = [];
      subscribedRef.current = false;
    };
  }, [user, subscriptionVersion, openSubscriptions]);

  useEffect(() => () => {
    unsubsRef.current.forEach(u => u());
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
  }, []);

  const ensureSubscribed = useCallback(() => {
    if (user && !subscribedRef.current) openSubscriptions(user.uid);
  }, [user, openSubscriptions]);

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
      writeCreativeCache({ learningTopics: fresh });
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
      writeCreativeCache({ learningTopics: fresh });
      return fresh;
    });
  }, []);

  const value = useMemo(() => ({
    storageNodes, notes, learningTopics, jobs, contentLogs, ensureSubscribed,
    optimisticUpdateLearningTopic, optimisticToggleSubtask,
  }), [
    storageNodes, notes, learningTopics, jobs, contentLogs, ensureSubscribed,
    optimisticUpdateLearningTopic, optimisticToggleSubtask,
  ]);

  return (
    <CreativeContext.Provider value={value}>
      {children}
    </CreativeContext.Provider>
  );
}
