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

const REPAIR_FLAG_KEY = 'zentrack_attendance_dedup_repair_v2_done';
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

export async function repairDuplicateAttendanceLogs(
  uid: string
): Promise<RepairResult> {
  const result: RepairResult = { fixed: 0, deleted: 0, errors: [] };

  try {
    // Idempotency: skip if already done this session
    const flag = await AsyncStorage.getItem(REPAIR_FLAG_KEY).catch(() => null);
    if (flag === 'done') return result;

    // ── 1. Load all non-extra scheduled logs for this user ─────────────────
    const logsSnap = await getDocs(query(
      collection(db, COLLECTION.ATTENDANCE_LOGS),
      where('userId',  '==', uid),
      where('isExtra', '==', false),
    ));

    if (logsSnap.empty) {
      await AsyncStorage.setItem(REPAIR_FLAG_KEY, 'done').catch(() => {});
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

    // ── 3. Identify extras and compute counter deltas ──────────────────────
    const subjectDeltas = new Map<string, {
      attendedDelta: number; totalDelta: number;
      attendedKey: string;   totalKey: string;
    }>();
    const docsToDelete: string[] = [];

    for (const [, docs] of groups) {
      if (docs.length <= 1) continue;

      const sample = docs[0].data;
      const logType: 'class' | 'lab' = sample.type === 'lab' ? 'lab' : 'class';
      const expectedId = buildDeterministicId(
        uid,
        String(sample.subjectId || ''),
        String(sample.date || ''),
        logType,
        typeof sample.idx === 'number' ? sample.idx : 0
      );

      // Keep the deterministic-ID doc if it exists, otherwise keep newest
      const keepDoc =
        docs.find(d => d.id === expectedId) ??
        docs.sort((a, b) => (b.data.timestamp ?? 0) - (a.data.timestamp ?? 0))[0];

      const extras = docs.filter(d => d.id !== keepDoc.id);
      result.fixed++;
      result.deleted += extras.length;

      extras.forEach(extra => {
        const subjectId = String(extra.data.subjectId || '').trim();
        if (!subjectId) return;
        const et      = extra.data.type === 'lab' ? 'lab' : 'class';
        const attKey  = et === 'lab' ? 'labsAttended'  : 'classesAttended';
        const totKey  = et === 'lab' ? 'labsTotal'     : 'classesTotal';
        const action  = String(extra.data.action || '');
        const attContrib = action === 'attended'  ? 1 : 0;
        const totContrib = action === 'cancelled' ? 0 : 1;

        const existing = subjectDeltas.get(subjectId) ??
          { attendedDelta: 0, totalDelta: 0, attendedKey: attKey, totalKey: totKey };
        existing.attendedDelta -= attContrib;
        existing.totalDelta    -= totContrib;
        existing.attendedKey    = attKey;
        existing.totalKey       = totKey;
        subjectDeltas.set(subjectId, existing);
        docsToDelete.push(extra.id);
      });
    }

    if (docsToDelete.length === 0) {
      await AsyncStorage.setItem(REPAIR_FLAG_KEY, 'done').catch(() => {});
      return result;
    }

    // ── 4a. Delete extra log docs in batches ────────────────────────────────
    for (let i = 0; i < docsToDelete.length; i += BATCH_SIZE) {
      const batch = writeBatch(db);
      docsToDelete.slice(i, i + BATCH_SIZE).forEach(id =>
        batch.delete(doc(db, COLLECTION.ATTENDANCE_LOGS, id))
      );
      await batch.commit();
    }

    // ── 4b. Correct inflated subject counters ───────────────────────────────
    // Must read current values first to clamp at 0 (increment(-N) can go negative).
    for (const [subjectId, delta] of subjectDeltas) {
      if (delta.attendedDelta === 0 && delta.totalDelta === 0) continue;
      try {
        const snap = await getDoc(doc(db, COLLECTION.ATTENDANCE, subjectId));
        if (!snap.exists()) continue;
        const current = snap.data() as Record<string, any>;
        const newAtt  = Math.max(0, (Number(current[delta.attendedKey]) || 0) + delta.attendedDelta);
        const newTot  = Math.max(0, (Number(current[delta.totalKey])   || 0) + delta.totalDelta);
        await updateDoc(doc(db, COLLECTION.ATTENDANCE, subjectId), {
          [delta.attendedKey]: newAtt,
          [delta.totalKey]:    newTot,
          lastUpdated: Date.now(),
        });
      } catch (e: any) {
        result.errors.push(`Subject ${subjectId}: ${e?.message ?? 'unknown'}`);
      }
    }

    // ── 5. Mark done ────────────────────────────────────────────────────────
    await AsyncStorage.setItem(REPAIR_FLAG_KEY, 'done').catch(() => {});
    console.log(
      `[AttendanceRepair] Done. Fixed ${result.fixed} groups, deleted ${result.deleted} extra logs.`
    );
  } catch (e: any) {
    result.errors.push(`Repair aborted: ${e?.message ?? 'unknown'}`);
    console.warn('[AttendanceRepair] Failed:', e);
    // Do NOT mark done — let it retry next session
  }

  return result;
}
