/**
 * attendanceRepair.ts — ZenTrack Mobile
 *
 * One-time Firestore repair that de-duplicates attendance_logs and
 * corrects inflated attendance counters caused by:
 *  - Old notification action handlers using addDoc (random IDs)
 *  - Offline write queue double-execution
 *  - Any other path that bypassed the deterministic ID system
 *
 * Strategy:
 *  1. Load all attendance_logs for the user.
 *  2. Group by natural key: (subjectId, date, type, sessionIdx, isExtra=false).
 *  3. For each group with > 1 doc:
 *     - Prefer the doc whose ID matches the deterministic format.
 *     - Delete all other docs in the group (extras).
 *     - Compute the correct counter delta and update the subject doc.
 *  4. Write everything in batches (max 400 ops / batch).
 *  5. Mark the repair done in AsyncStorage so it never re-runs.
 *
 * Safe to call on every login — idempotent after first successful run.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  collection, query, where, getDocs, writeBatch,
  doc, getDoc, updateDoc,
} from 'firebase/firestore';
import { db } from '../services/firebase';
import { COLLECTION } from '../config/constants';

const REPAIR_FLAG_PREFIX = 'zentrack_attendance_dedup_repair_v3_done_';
const BATCH_SIZE = 400; // Well under Firestore 500-op limit

/**
 * Builds the same deterministic ID that useAttendanceFirestore generates.
 * Must stay in sync with getScheduledAttendanceLogDocId in attendanceConstants.ts.
 */
function buildDeterministicId(
  userId: string,
  subjectId: string,
  dateStr: string,
  type: 'class' | 'lab',
  idx: number = 0
): string {
  const cleanDate = (dateStr || '').slice(0, 10);
  return `${userId}_${subjectId}_${cleanDate}_${type}_${idx}`;
}

interface RepairResult {
  fixed: number;    // groups that had duplicates
  deleted: number;  // extra docs deleted
  errors: string[];
}

let isRepairRunning = false;
let lastRepairRunMs = 0;

export async function repairDuplicateAttendanceLogs(
  uid: string,
  force = false
): Promise<RepairResult> {
  const result: RepairResult = { fixed: 0, deleted: 0, errors: [] };
  if (!uid) return result;

  const now = Date.now();
  // Cooldown: prevent spamming repair loops more than once every 60s unless forced
  if (isRepairRunning || (!force && now - lastRepairRunMs < 60000)) {
    return result;
  }

  isRepairRunning = true;
  lastRepairRunMs = now;

  try {
    // ── 1. Load all non-extra scheduled logs for this user ─────────────────
    const logsSnap = await getDocs(query(
      collection(db, COLLECTION.ATTENDANCE_LOGS),
      where('userId',  '==', uid),
      where('isExtra', '==', false),
    ));

    if (logsSnap.empty) {
      return result;
    }

    // ── 2. Group by natural key ────────────────────────────────────────────
    type LogDoc = { id: string; data: Record<string, any> };
    const groups = new Map<string, LogDoc[]>();

    logsSnap.docs.forEach(d => {
      const data      = d.data() as Record<string, any>;
      const subjectId = String(data.subjectId || '').trim();
      const date      = String(data.date || '').trim().slice(0, 10);
      const type      = data.type === 'lab' ? 'lab' : 'class';
      const idx       = typeof data.idx === 'number' ? data.idx : 0;
      if (!subjectId || !date) return;
      const key = `${subjectId}|${date}|${type}|${idx}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push({ id: d.id, data });
    });

    // ── 3. Identify extras and compute separate class & lab deltas ──────────
    const subjectDeltas = new Map<string, {
      classAttDelta: number;
      classTotDelta: number;
      labAttDelta: number;
      labTotDelta: number;
    }>();
    const docsToDelete: string[] = [];
    const docsToMigrate: { id: string; data: Record<string, any> }[] = [];

    for (const [, docs] of groups) {
      if (docs.length <= 1) continue;

      const sample = docs[0].data;
      const logType: 'class' | 'lab' = sample.type === 'lab' ? 'lab' : 'class';
      const safeIdx = typeof sample.idx === 'number' ? sample.idx : 0;
      const expectedId = buildDeterministicId(
        uid,
        String(sample.subjectId || ''),
        String(sample.date || ''),
        logType,
        safeIdx
      );

      // Keep the deterministic-ID doc if it exists, otherwise keep newest
      const keepDoc =
        docs.find(d => d.id === expectedId) ??
        [...docs].sort((a, b) => (b.data.timestamp ?? 0) - (a.data.timestamp ?? 0))[0];

      // If the surviving doc does not have the deterministic ID, migrate it to expectedId
      if (keepDoc.id !== expectedId) {
        docsToMigrate.push({
          id: expectedId,
          data: {
            ...keepDoc.data,
            userId: uid,
            date: String(sample.date || '').slice(0, 10),
            type: logType,
            idx: safeIdx,
          },
        });
        docsToDelete.push(keepDoc.id);
      }

      const extras = docs.filter(d => d.id !== keepDoc.id);
      result.fixed++;
      result.deleted += extras.length;

      extras.forEach(extra => {
        const subjectId = String(extra.data.subjectId || '').trim();
        if (!subjectId) return;
        const isLab = extra.data.type === 'lab';
        const action = String(extra.data.action || '');
        const attContrib = action === 'attended' ? 1 : 0;
        const totContrib = action === 'cancelled' ? 0 : 1;

        const existing = subjectDeltas.get(subjectId) ?? {
          classAttDelta: 0,
          classTotDelta: 0,
          labAttDelta: 0,
          labTotDelta: 0,
        };
        if (isLab) {
          existing.labAttDelta -= attContrib;
          existing.labTotDelta -= totContrib;
        } else {
          existing.classAttDelta -= attContrib;
          existing.classTotDelta -= totContrib;
        }
        subjectDeltas.set(subjectId, existing);
        docsToDelete.push(extra.id);
      });
    }

    if (docsToDelete.length === 0 && docsToMigrate.length === 0) {
      return result;
    }

    // ── 4a. Batch migrate and delete log docs ──────────────────────────────
    const allOps: Array<{ type: 'set' | 'delete'; id: string; data?: Record<string, any> }> = [
      ...docsToMigrate.map(m => ({ type: 'set' as const, id: m.id, data: m.data })),
      ...docsToDelete.map(id => ({ type: 'delete' as const, id })),
    ];

    for (let i = 0; i < allOps.length; i += BATCH_SIZE) {
      const batch = writeBatch(db);
      allOps.slice(i, i + BATCH_SIZE).forEach(op => {
        const ref = doc(db, COLLECTION.ATTENDANCE_LOGS, op.id);
        if (op.type === 'set' && op.data) {
          batch.set(ref, op.data, { merge: true });
        } else {
          batch.delete(ref);
        }
      });
      await batch.commit();
    }

    // ── 4b. Correct inflated subject counters (separate class vs lab) ────────
    for (const [subjectId, delta] of subjectDeltas) {
      if (
        delta.classAttDelta === 0 &&
        delta.classTotDelta === 0 &&
        delta.labAttDelta === 0 &&
        delta.labTotDelta === 0
      ) continue;

      try {
        const snap = await getDoc(doc(db, COLLECTION.ATTENDANCE, subjectId));
        if (!snap.exists()) continue;
        const current = snap.data() as Record<string, any>;
        const newClassAtt = Math.max(0, (Number(current.classesAttended) || 0) + delta.classAttDelta);
        const newClassTot = Math.max(0, (Number(current.classesTotal) || 0) + delta.classTotDelta);
        const newLabAtt   = Math.max(0, (Number(current.labsAttended) || 0) + delta.labAttDelta);
        const newLabTot   = Math.max(0, (Number(current.labsTotal) || 0) + delta.labTotDelta);
        await updateDoc(doc(db, COLLECTION.ATTENDANCE, subjectId), {
          classesAttended: newClassAtt,
          classesTotal:    Math.max(newClassAtt, newClassTot),
          labsAttended:    newLabAtt,
          labsTotal:       Math.max(newLabAtt, newLabTot),
          lastUpdated:     Date.now(),
        });
      } catch (e: any) {
        result.errors.push(`Subject ${subjectId}: ${e?.message ?? 'unknown'}`);
      }
    }

    console.log(
      `[AttendanceRepair] Done. Fixed ${result.fixed} groups, deleted ${result.deleted} extra logs.`
    );
  } catch (e: any) {
    result.errors.push(`Repair aborted: ${e?.message ?? 'unknown'}`);
    console.warn('[AttendanceRepair] Failed:', e);
  } finally {
    isRepairRunning = false;
  }

  return result;
}

