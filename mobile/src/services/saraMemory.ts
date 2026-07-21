/**
 * saraMemory.ts — ZenTrack Mobile
 *
 * SARA Engine v2: Contextual Memory Graph (CMG) + Behavioral Fingerprint Engine (BFE)
 *
 * Capability 1 — Contextual Memory Graph:
 *   A lightweight JSON graph stored in AsyncStorage under @sara_cmg_v1.
 *   After each Sara interaction, extractAndStore() fires asynchronously (via setTimeout 0)
 *   and classifies whether the conversation produced a persistable insight.
 *   Nodes decay by relevanceScore over time (30-day half-life).
 *
 * Capability 7 — Behavioral Fingerprint Engine:
 *   Silently observes every app interaction (task complete, habit log, gym session, Sara chat)
 *   to build a BehavioralFingerprint stored in @sara_fingerprint_v1.
 *   This fingerprint shapes: dashboard quotes, Sara's tone, MoreScreen module order.
 *
 * Design constraints:
 *   - ALL storage is on-device AsyncStorage — no server required
 *   - extractAndStore() is ALWAYS called via setTimeout(fn,0) — never blocks UI
 *   - getFingerprint() is cached in-memory after first load — zero-cost subsequent reads
 *   - Max 50 memory nodes — oldest/lowest relevance pruned automatically
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { callProxy } from './geminiProxy';
import { STORAGE_KEYS } from '../config/constants';

// ─── Types ────────────────────────────────────────────────────────────────────

export type MemoryNodeType =
  | 'preference'
  | 'pattern'
  | 'goal_context'
  | 'stress_marker'
  | 'schedule_anchor';

export interface MemoryNode {
  id: string;
  type: MemoryNodeType;
  content: string;            // "User has ML exam on Thursday, anxiety around it"
  relevanceScore: number;     // 0-1, decays over time
  createdAt: number;          // Unix timestamp ms
  lastAccessedAt: number;     // Updated on every read
  linkedEntityIds: string[];  // Firebase doc IDs this relates to
}

export interface ContextualMemoryGraph {
  userId: string;
  nodes: MemoryNode[];
  updatedAt: number;
}

export type DayOfWeek = 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
export type StreakPersonality = 'momentum-builder' | 'binge-worker' | 'consistent';

export interface BehavioralFingerprint {
  userId: string;
  updatedAt: number;

  // Temporal patterns
  mostProductiveHour: number;           // 21 = 9 PM (derived from task completion times)
  consistentGymDays: DayOfWeek[];       // ['monday', 'wednesday', 'friday']
  avgSleepDebtHours: number;            // derived from late-night task activity

  // Academic patterns
  subjectsAtRisk: string[];             // subject names with attendance < 75%
  upcomingDeadlineStress: boolean;      // exam/assignment within 7 days + pending tasks

  // Psychological signals
  streakPersonality: StreakPersonality; // 'momentum-builder' | 'binge-worker' | 'consistent'
  nudgeResponseRate: number;            // 0.4 = responds to 40% of SARA nudges
  totalSaraInteractions: number;        // session interaction count

  // Preference signals
  preferredTaskLength: 'micro' | 'macro'; // tasks typically < 30min vs > 2h
  goalAmbitionLevel: 'conservative' | 'aggressive';
  dominantStressPattern: 'deadline-driven' | 'anxiety-prone' | 'structured' | 'flow-state';
  preferredResponseStyle: 'concise' | 'detailed' | 'bullet';
  languagePreference: 'en-IN' | 'hi-IN' | 'mixed';

  // Completion rates
  avgTaskCompletionRate: number;        // 0.73 = 73%
  habitConsistencyScore: number;        // 0-1, rolling 30-day
  gymConsistencyScore: number;          // 0-1, rolling 30-day

  // Engagement
  peakProductivityHour: number;         // same as mostProductiveHour but more semantic name
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CMG_KEY = STORAGE_KEYS.SARA_CMG;
const FINGERPRINT_KEY = STORAGE_KEYS.SARA_FINGERPRINT;
const MAX_NODES = 50;
const DECAY_RATE_PER_DAY = 0.02; // relevance drops 2% per day

// ─── In-memory cache ─────────────────────────────────────────────────────────

let _fingerprintCache: BehavioralFingerprint | null = null;
let _cmgCache: ContextualMemoryGraph | null = null;

// ─── CMG: Load / Save ────────────────────────────────────────────────────────

export async function loadCMG(userId: string): Promise<ContextualMemoryGraph> {
  if (_cmgCache && _cmgCache.userId === userId) return _cmgCache;

  try {
    const raw = await AsyncStorage.getItem(CMG_KEY);
    if (raw) {
      const parsed: ContextualMemoryGraph = JSON.parse(raw);
      if (parsed.userId === userId) {
        const decayed = decayMemoryNodes(parsed);
        _cmgCache = decayed;
        return decayed;
      }
    }
  } catch (e) {
    console.warn('[CMG] Failed to load:', e);
  }

  const empty: ContextualMemoryGraph = { userId, nodes: [], updatedAt: Date.now() };
  _cmgCache = empty;
  return empty;
}

export async function saveCMG(graph: ContextualMemoryGraph): Promise<void> {
  _cmgCache = graph;
  try {
    await AsyncStorage.setItem(CMG_KEY, JSON.stringify(graph));
  } catch (e) {
    console.warn('[CMG] Failed to save:', e);
  }
}

// ─── CMG: Decay ───────────────────────────────────────────────────────────────

export function decayMemoryNodes(graph: ContextualMemoryGraph): ContextualMemoryGraph {
  const now = Date.now();
  const decayed = graph.nodes.map(node => {
    const ageMs = now - node.lastAccessedAt;
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    const newScore = Math.max(0.05, node.relevanceScore - DECAY_RATE_PER_DAY * ageDays);
    return { ...node, relevanceScore: newScore };
  });

  // Prune dead nodes (< 0.08) and keep top MAX_NODES by relevance
  const pruned = decayed
    .filter(n => n.relevanceScore > 0.08)
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, MAX_NODES);

  return { ...graph, nodes: pruned };
}

// ─── CMG: Append Node ─────────────────────────────────────────────────────────

export async function appendMemoryNode(
  userId: string,
  node: Omit<MemoryNode, 'id' | 'createdAt' | 'lastAccessedAt'>
): Promise<void> {
  const graph = await loadCMG(userId);

  // Deduplicate: if very similar content exists, boost its score instead of adding
  const existing = graph.nodes.find(n =>
    n.type === node.type &&
    n.content.toLowerCase().substring(0, 40) === node.content.toLowerCase().substring(0, 40)
  );

  if (existing) {
    existing.relevanceScore = Math.min(1.0, existing.relevanceScore + 0.15);
    existing.lastAccessedAt = Date.now();
    await saveCMG(graph);
    return;
  }

  const newNode: MemoryNode = {
    ...node,
    id: `cmg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: Date.now(),
    lastAccessedAt: Date.now(),
  };

  const updated: ContextualMemoryGraph = {
    ...graph,
    nodes: [...graph.nodes, newNode],
    updatedAt: Date.now(),
  };

  await saveCMG(decayMemoryNodes(updated));
}

// ─── CMG: Extract & Store (async post-interaction, never blocks UI) ───────────

/**
 * Run after every Sara interaction. Uses a TINY Gemini call (~50 tokens) to
 * classify whether this conversation produced any persistable insight.
 * ALWAYS called via setTimeout(fn, 0) — never awaited by the caller.
 */
export function extractAndStore(
  userId: string,
  instruction: string,
  response: string
): void {
  // Fire-and-forget: schedule for next tick so it NEVER blocks the UI
  setTimeout(async () => {
    try {
      const extractPrompt = `Analyze this brief exchange and determine if it contains information worth remembering about the user's life, schedule, stress points, or preferences. If yes, classify it.

User: "${instruction.slice(0, 200)}"
Sara: "${response.slice(0, 300)}"

Reply ONLY with valid JSON or the word "none":
{
  "type": "preference"|"pattern"|"goal_context"|"stress_marker"|"schedule_anchor",
  "content": "one sentence summary of what to remember",
  "relevanceScore": 0.0-1.0
}

Examples of "none": greetings, chitchat, questions about general facts, anything not about the user's personal life or schedule.`;

      const data = await callProxy({
        model: 'gemini-2.0-flash-lite',
        contents: [{ role: 'user', parts: [{ text: extractPrompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 100 },
      });

      const candidate = data?.candidates?.[0];
      const text = candidate?.content?.parts?.[0]?.text?.trim() || '';

      if (!text || text.toLowerCase() === 'none') return;

      // Parse JSON
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return;

      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.type && parsed.content && typeof parsed.relevanceScore === 'number') {
        await appendMemoryNode(userId, {
          type: parsed.type as MemoryNodeType,
          content: parsed.content,
          relevanceScore: Math.min(1.0, Math.max(0.1, parsed.relevanceScore)),
          linkedEntityIds: [],
        });
      }
    } catch (e) {
      // Silent fail — memory extraction is best-effort
      console.warn('[CMG] extractAndStore failed (non-critical):', e);
    }
  }, 0);
}

// ─── CMG: Build Memory Summary for System Prompt ─────────────────────────────

/**
 * Returns a compact, readable string of the top memory nodes.
 * Injected into Sara's system prompt. Zero API calls — reads local cache only.
 */
export async function buildMemorySummary(userId: string): Promise<string> {
  const graph = await loadCMG(userId);
  if (graph.nodes.length === 0) return '';

  const topNodes = graph.nodes
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, 8);

  const lines = topNodes.map(n => `• [${n.type}] ${n.content} (score: ${n.relevanceScore.toFixed(2)})`);
  return `SARA MEMORY (from past sessions):\n${lines.join('\n')}`;
}

// ─── BFE: Load / Save ─────────────────────────────────────────────────────────

function defaultFingerprint(userId: string): BehavioralFingerprint {
  return {
    userId,
    updatedAt: Date.now(),
    mostProductiveHour: 21,
    consistentGymDays: [],
    avgSleepDebtHours: 0,
    subjectsAtRisk: [],
    upcomingDeadlineStress: false,
    streakPersonality: 'consistent',
    nudgeResponseRate: 0.5,
    totalSaraInteractions: 0,
    preferredTaskLength: 'micro',
    goalAmbitionLevel: 'conservative',
    dominantStressPattern: 'structured',
    preferredResponseStyle: 'concise',
    languagePreference: 'en-IN',
    avgTaskCompletionRate: 0.5,
    habitConsistencyScore: 0.5,
    gymConsistencyScore: 0.0,
    peakProductivityHour: 21,
  };
}

export async function getFingerprint(userId: string): Promise<BehavioralFingerprint> {
  if (_fingerprintCache && _fingerprintCache.userId === userId) {
    return _fingerprintCache;
  }

  try {
    const raw = await AsyncStorage.getItem(FINGERPRINT_KEY);
    if (raw) {
      const parsed: BehavioralFingerprint = JSON.parse(raw);
      if (parsed.userId === userId) {
        _fingerprintCache = parsed;
        return parsed;
      }
    }
  } catch (e) {
    console.warn('[BFE] Failed to load fingerprint:', e);
  }

  const fp = defaultFingerprint(userId);
  _fingerprintCache = fp;
  return fp;
}

export async function saveFingerprint(fp: BehavioralFingerprint): Promise<void> {
  _fingerprintCache = fp;
  try {
    await AsyncStorage.setItem(FINGERPRINT_KEY, JSON.stringify(fp));
  } catch (e) {
    console.warn('[BFE] Failed to save fingerprint:', e);
  }
}

// ─── BFE: Update from App Events ──────────────────────────────────────────────

export type BFEEvent =
  | { type: 'task_completed'; completedAt: number }
  | { type: 'habit_logged' }
  | { type: 'gym_session'; dayOfWeek: DayOfWeek }
  | { type: 'sara_interaction'; languageCode: 'en-IN' | 'hi-IN' | 'mixed' }
  | { type: 'nudge_responded' }
  | { type: 'app_data_refresh'; appData: FingerPrintAppData };

export interface FingerPrintAppData {
  tasks?: any[];
  habits?: any[];
  habitLogs?: any[];
  gymLogs?: any[];
  attendance?: any[];
  assignments?: any[];
  customEvents?: any[];
}

/**
 * Update the behavioral fingerprint based on an app event.
 * This is always called via setTimeout(fn, 0) — fire-and-forget.
 */
export function updateFingerprint(userId: string, event: BFEEvent): void {
  setTimeout(async () => {
    try {
      const fp = await getFingerprint(userId);
      const updated = { ...fp, updatedAt: Date.now() };

      switch (event.type) {
        case 'task_completed': {
          const hour = new Date(event.completedAt).getHours();
          // Exponential moving average toward this hour
          updated.mostProductiveHour = Math.round(updated.mostProductiveHour * 0.85 + hour * 0.15);
          updated.peakProductivityHour = updated.mostProductiveHour;
          break;
        }

        case 'gym_session': {
          if (!updated.consistentGymDays.includes(event.dayOfWeek)) {
            updated.consistentGymDays = [...updated.consistentGymDays, event.dayOfWeek].slice(-4);
          }
          updated.gymConsistencyScore = Math.min(1.0, updated.gymConsistencyScore + 0.05);
          break;
        }

        case 'habit_logged': {
          updated.habitConsistencyScore = Math.min(1.0, updated.habitConsistencyScore + 0.03);
          break;
        }

        case 'sara_interaction': {
          updated.totalSaraInteractions += 1;
          if (event.languageCode !== 'en-IN') {
            updated.languagePreference = 'mixed';
          }
          break;
        }

        case 'nudge_responded': {
          // Increment nudge response rate with EMA
          updated.nudgeResponseRate = Math.min(1.0, updated.nudgeResponseRate * 0.9 + 0.1);
          break;
        }

        case 'app_data_refresh': {
          _refreshFingerprintFromData(updated, event.appData);
          break;
        }
      }

      // Recalculate streak personality
      updated.streakPersonality = _deriveStreakPersonality(updated);

      await saveFingerprint(updated);
    } catch (e) {
      console.warn('[BFE] updateFingerprint failed (non-critical):', e);
    }
  }, 0);
}

function _refreshFingerprintFromData(fp: BehavioralFingerprint, data: FingerPrintAppData): void {
  const now = new Date();
  const todayISO = now.toISOString().slice(0, 10);

  // Task completion rate (last 30 days)
  if (data.tasks && data.tasks.length > 0) {
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const recent = data.tasks.filter(t => t.createdAt >= thirtyDaysAgo || t.date >= thirtyDaysAgo.slice(0,10));
    const completed = recent.filter(t => t.status === 'completed').length;
    if (recent.length > 0) {
      fp.avgTaskCompletionRate = completed / recent.length;
    }

    // Goal ambition: are they setting aggressive deadlines?
    const highPriTasks = data.tasks.filter(t => t.priority === 'P1' || t.priority === 'high').length;
    fp.goalAmbitionLevel = highPriTasks > data.tasks.length * 0.3 ? 'aggressive' : 'conservative';

    // BUG-M6 FIX: Removed title-length heuristic for preferredTaskLength.
    // Previously: avg title length > 40 chars → 'macro'. This is completely backwards.
    // A user who writes "Complete Chapter 5 exercises before Thursday" is NOT a macro planner.
    // Now uses subtask count as the proxy: tasks with subtasks = macro planner.
    const tasksWithSubtasks = data.tasks.filter(t => (t.subtasks?.length || t.subTasks?.length || 0) > 0).length;
    fp.preferredTaskLength = tasksWithSubtasks > data.tasks.length * 0.2 ? 'macro' : 'micro';
  }

  // Subjects at risk
  if (data.attendance) {
    fp.subjectsAtRisk = data.attendance
      .filter(s => s.classesTotal > 0 && (s.classesAttended / s.classesTotal) < 0.75)
      .map(s => s.name);
  }

  // Upcoming deadline stress
  if (data.assignments || data.customEvents) {
    const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const urgentAssignments = (data.assignments || []).filter(
      a => a.dueDate >= todayISO && a.dueDate <= sevenDaysLater && a.status === 'pending'
    );
    const urgentExams = (data.customEvents || []).filter(
      e => e.date >= todayISO && e.date <= sevenDaysLater && e.type === 'exam'
    );
    fp.upcomingDeadlineStress = urgentAssignments.length > 0 || urgentExams.length > 0;
    fp.dominantStressPattern = fp.upcomingDeadlineStress ? 'deadline-driven' : 'structured';
  }

  // Gym consistency
  if (data.gymLogs) {
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const recentGym = data.gymLogs.filter(g => g.date >= thirtyDaysAgo);
    fp.gymConsistencyScore = Math.min(1.0, recentGym.length / 20); // 20 sessions in 30d = perfect
  }

  // Habit consistency
  if (data.habitLogs) {
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const recentLogs = (data.habitLogs as any[]).filter((l: any) => l.date >= thirtyDaysAgo);
    fp.habitConsistencyScore = Math.min(1.0, recentLogs.length / 30); // 30 logs = perfect
  }
}

function _deriveStreakPersonality(fp: BehavioralFingerprint): StreakPersonality {
  if (fp.habitConsistencyScore > 0.75 && fp.avgTaskCompletionRate > 0.7) {
    return 'consistent';
  }
  if (fp.avgTaskCompletionRate > 0.6 && fp.gymConsistencyScore > 0.5) {
    return 'momentum-builder';
  }
  return 'binge-worker';
}

// ─── BFE: Get Sara Tone from Fingerprint ─────────────────────────────────────

/**
 * Returns a terse tone directive injected into Sara's system prompt.
 * Zero API calls — pure computation from cached fingerprint.
 */
export function getSaraToneDirective(fp: BehavioralFingerprint): string {
  if (fp.dominantStressPattern === 'deadline-driven') {
    return 'Tone: direct, punchy, no fluff. This user is deadline-driven — get to the point fast.';
  }
  // BUG-M8 FIX: Removed 'anxiety-prone' branch — this value is NEVER set in
  // _refreshFingerprintFromData(). Only 'deadline-driven' and 'structured' are set.
  // Added 'binge-worker' branch which IS derived by _deriveStreakPersonality().
  if (fp.streakPersonality === 'binge-worker') {
    return 'Tone: direct and challenging, slightly provocative. This user needs a push, not reassurance.';
  }
  if (fp.streakPersonality === 'momentum-builder') {
    return 'Tone: energetic, motivating, emphasize progress. Celebrate wins briefly.';
  }
  if (fp.streakPersonality === 'consistent') {
    return 'Tone: calm, analytical, Stoic. Provide clear structure. Minimal encouragement needed.';
  }
  return 'Tone: balanced, warm, helpful.';
}

/**
 * Returns the suggested response style from fingerprint.
 */
export function getSaraResponseStyle(fp: BehavioralFingerprint): string {
  if (fp.preferredResponseStyle === 'bullet') return 'Format: use bullet points. Keep bullets brief.';
  if (fp.preferredResponseStyle === 'detailed') return 'Format: detailed paragraphs with context.';
  return 'Format: 1-3 sentences max. Concise.';
}

// ─── Cache invalidation (call on sign-out) ───────────────────────────────────

export function clearSaraMemoryCache(): void {
  _fingerprintCache = null;
  _cmgCache = null;
}
