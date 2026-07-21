/**
 * CreativeContext — ZenTrack Mobile
 *
 * Owns: storageNodes, notes (derived), learningTopics, jobs.
 *
 * Subscription strategy: DEMAND-BASED.
 * Opens when the user first visits Notes, Learning, or Jobs screen.
 */
import React, { createContext, useContext, useEffect, useState, useMemo, useRef } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "../../services/firebase";
import { COLLECTION } from "../../config/constants";
import type { StorageNode, Note, LearningTopic, JobApplication } from "../MobileDataContext";

// ─── Context Shape ─────────────────────────────────────────────────────────────
export interface CreativeContextType {
  storageNodes: StorageNode[];
  notes: Note[];   // derived from storageNodes where type === 'note'
  learningTopics: LearningTopic[];
  jobs: JobApplication[];
  ensureSubscribed: () => void;
}

const CreativeContext = createContext<CreativeContextType | null>(null);

export function useCreativeData(): CreativeContextType {
  const ctx = useContext(CreativeContext);
  if (!ctx) throw new Error("useCreativeData must be inside CreativeProvider");
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
  const subscribedRef = useRef(false);
  const unsubsRef     = useRef<(() => void)[]>([]);

  const openSubscriptions = (uid: string) => {
    if (subscribedRef.current) return;
    subscribedRef.current = true;

    unsubsRef.current.push(onSnapshot(
      query(collection(db, COLLECTION.STORAGE_NODES), where("userId", "==", uid)),
      snap => setStorageNodes(snap.docs.map(d => ({ id: d.id, ...d.data() } as StorageNode))),
      err => console.error("[Creative] storageNodes", err)
    ));
    unsubsRef.current.push(onSnapshot(
      query(collection(db, COLLECTION.LEARNING_TOPICS), where("userId", "==", uid)),
      snap => setLearningTopics(snap.docs.map(d => ({ id: d.id, ...d.data() } as LearningTopic))),
      err => console.error("[Creative] learningTopics", err)
    ));
    unsubsRef.current.push(onSnapshot(
      query(collection(db, COLLECTION.JOBS), where("userId", "==", uid)),
      snap => setJobs(snap.docs.map(d => ({ id: d.id, ...d.data() } as JobApplication))),
      err => console.error("[Creative] jobs", err)
    ));
  };

  useEffect(() => {
    if (!user) {
      unsubsRef.current.forEach(u => u());
      unsubsRef.current = [];
      subscribedRef.current = false;
      setStorageNodes([]); setLearningTopics([]); setJobs([]);
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

  return (
    <CreativeContext.Provider value={{ storageNodes, notes, learningTopics, jobs, ensureSubscribed }}>
      {children}
    </CreativeContext.Provider>
  );
}
