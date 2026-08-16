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
import React, { createContext, useContext, useEffect, useState, useMemo, useRef } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { InteractionManager } from 'react-native';
import { db } from "../../services/firebase";
import { COLLECTION } from "../../config/constants";
import type { StorageNode, Note, LearningTopic, JobApplication, ContentLog } from "../MobileDataContext";
import { readCreativeCache, writeCreativeCache } from "../../utils/domainCache";

// ─── Context Shape ─────────────────────────────────────────────────────────────
export interface CreativeContextType {
  storageNodes: StorageNode[];
  notes: Note[];   // derived from storageNodes where type === 'note'
  learningTopics: LearningTopic[];
  jobs: JobApplication[];
  contentLogs: ContentLog[];
  ensureSubscribed: () => void;
}

const DEFAULT_CREATIVE_DATA: CreativeContextType = {
  storageNodes: [],
  notes: [],
  learningTopics: [],
  jobs: [],
  contentLogs: [],
  ensureSubscribed: () => {},
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

  // ── Offline-first boot: seed from AsyncStorage before Firestore responds ──
  useEffect(() => {
    let cancelled = false;
    readCreativeCache().then(cached => {
      if (cancelled) return;
      if (cached.storageNodes   && cached.storageNodes.length > 0)   setStorageNodes(prev   => prev.length === 0 ? cached.storageNodes!   : prev);
      if (cached.learningTopics && cached.learningTopics.length > 0) setLearningTopics(prev => prev.length === 0 ? cached.learningTopics! : prev);
      if (cached.jobs           && cached.jobs.length > 0)           setJobs(prev           => prev.length === 0 ? cached.jobs!           : prev);
      if (cached.contentLogs    && cached.contentLogs.length > 0)    setContentLogs(prev    => prev.length === 0 ? cached.contentLogs!    : prev);
    });
    return () => { cancelled = true; };
  }, []);

  const openSubscriptions = (uid: string) => {
    if (subscribedRef.current) return;
    subscribedRef.current = true;

    unsubsRef.current.push(onSnapshot(
      query(collection(db, COLLECTION.STORAGE_NODES), where("userId", "==", uid)),
      snap => { const fresh = snap.docs.map(d => ({ id: d.id, ...d.data() } as StorageNode)); setStorageNodes(fresh); writeCreativeCache({ storageNodes: fresh }); },
      err => console.error("[Creative] storageNodes", err)
    ));
    unsubsRef.current.push(onSnapshot(
      query(collection(db, COLLECTION.LEARNING_TOPICS), where("userId", "==", uid)),
      snap => { const fresh = snap.docs.map(d => ({ id: d.id, ...d.data() } as LearningTopic)); setLearningTopics(fresh); writeCreativeCache({ learningTopics: fresh }); },
      err => console.error("[Creative] learningTopics", err)
    ));
    unsubsRef.current.push(onSnapshot(
      query(collection(db, COLLECTION.JOBS), where("userId", "==", uid)),
      snap => { const fresh = snap.docs.map(d => ({ id: d.id, ...d.data() } as JobApplication)); setJobs(fresh); writeCreativeCache({ jobs: fresh }); },
      err => console.error("[Creative] jobs", err)
    ));
    unsubsRef.current.push(onSnapshot(
      query(collection(db, COLLECTION.CONTENT_LOGS), where("userId", "==", uid)),
      snap => { const fresh = snap.docs.map(d => ({ id: d.id, ...d.data() } as ContentLog)); setContentLogs(fresh); writeCreativeCache({ contentLogs: fresh }); },
      err => console.error("[Creative] contentLogs", err)
    ));
  };

  useEffect(() => {
    if (user) {
      openSubscriptions(user.uid);
    } else {
      unsubsRef.current.forEach(u => u());
      unsubsRef.current = [];
      subscribedRef.current = false;
    }
  }, [user]);

  useEffect(() => () => { unsubsRef.current.forEach(u => u()); }, []);

  const ensureSubscribed = () => {
    if (user && !subscribedRef.current) openSubscriptions(user.uid);
  };

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

  const value = useMemo(() => ({
    storageNodes, notes, learningTopics, jobs, contentLogs, ensureSubscribed
  }), [
    storageNodes, notes, learningTopics, jobs, contentLogs, ensureSubscribed
  ]);

  return (
    <CreativeContext.Provider value={value}>
      {children}
    </CreativeContext.Provider>
  );
}
