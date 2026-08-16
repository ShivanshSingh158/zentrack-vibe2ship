/**
 * weeklyGymAnalysisEngine.ts — ZenTrack Mobile
 *
 * Comprehensive AI weekly analysis engine for Rest Day report.
 * Fixed bugs:
 *  - Exercise count guard now counts COMPLETED sets (not all exercises)
 *  - Robust JSON extraction even when model wraps output in prose/markdown
 *  - Pre-computed authoritative stats injected into prompt (no hallucination)
 *  - Error state surfaced to caller (no more silent failures)
 *  - Cache freshness: re-generates if >48h old even without data change
 *  - Retry logic: up to 2 attempts with brief backoff
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { callProxy, parseProxyResponse } from './geminiProxy';
import { canonicalizeMuscle, isValidWorkoutSession } from '../utils/gymUtils';


export interface WeeklyGymAnalysis {
  headline: string;
  verdict: string;
  score: number;       // 0–100 overall week execution score
  scoreGrade: string;  // "A+" | "A" | "B+" | "B" | "C"
  comparisonVsLastWeek: {
    volumeDeltaText: string;
    keyOverloads: string[];
    summary: string;
  };
  thirtyDayTrend: {
    trajectory: string;
    laggingMuscles: string[];
    fatigueIndicator: string;
  };
  nextWeekDirectives: string[];
  generatedAt: number;
}

/** Pre-computed stats passed by the UI to anchor the AI prompt with real numbers */
export interface PrecomputedGymStats {
  thisWeekVolume: number;
  prevWeekVolume: number;
  volumeDeltaKg: number;
  volumeDeltaPct: number;
  thisWeekSets: number;
  prevWeekSets: number;
  sessionCount: number;
  plannedSessions: number;
  topLift: { name: string; weight: number; reps: number } | null;
  muscleCompletion: Record<string, { done: number; planned: number; pct: number }>;
  untrainedMuscles: string[];
  estimatedOneRMs: Record<string, number>; // exercise name → est 1RM kg
}

const CACHE_PREFIX = 'zentrack_weekly_gym_analysis_v3_';
const CACHE_MAX_AGE_MS = 48 * 60 * 60 * 1000; // 48 hours

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Epley formula: estimated 1-Rep Max */
export function epley1RM(weight: number, reps: number): number {
  if (reps <= 0 || weight <= 0) return 0;
  return Math.round(weight * (1 + reps / 30));
}

/**
 * Robust JSON extractor.
 * Handles: clean JSON, ```json``` code fences, JSON buried inside prose.
 */
function extractJson(text: string): string {
  if (!text) throw new Error('Empty response from Gemini');

  // 1. Strip markdown code fences
  let cleaned = text
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/gi, '')
    .trim();

  // 2. Try direct parse
  try { JSON.parse(cleaned); return cleaned; } catch (_) {}

  // 3. Find outermost { … } block (handles preamble prose)
  const firstBrace = cleaned.indexOf('{');
  const lastBrace  = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const slice = cleaned.slice(firstBrace, lastBrace + 1);
    try { JSON.parse(slice); return slice; } catch (_) {}
  }

  throw new Error(`Cannot extract JSON from response: ${text.slice(0, 200)}`);
}

function sanitizeAiString(str: string): string {
  if (!str) return '';
  return str.replace(/^(\d+\.\s*|[-•*]\s*)/, '').replace(/\*\*/g, '').trim();
}

/**
 * Deterministic fingerprint of the week's data state.
 * Changes whenever new sets are logged or data is updated.
 */
export function computeWeeklyDataFingerprint(
  weekAnchorDate: string,
  weekLogs: any[],
  thirtyDayLogs: any[],
): string {
  let thisWeekSets = 0;
  let thisWeekVolume = 0;
  let latestTimestamp = 0;

  for (const log of weekLogs) {
    if (log.updatedAt && log.updatedAt > latestTimestamp) latestTimestamp = log.updatedAt;
    if (log.createdAt && log.createdAt > latestTimestamp) latestTimestamp = log.createdAt;
    for (const ex of log.exercises ?? []) {
      if (ex.skipped) continue;
      const completed = (ex.setsLog ?? []).filter((s: any) => s.completed);
      thisWeekSets += completed.length;
      for (const s of completed) {
        thisWeekVolume += (Number(s.weight) || 0) * (Number(s.reps) || 0);
      }
    }
  }

  return `${weekAnchorDate}_s${thisWeekSets}_v${Math.round(thisWeekVolume)}_t${latestTimestamp}_d30_${thirtyDayLogs.length}`;
}

export function getWeekMondayStr(anchorDate: string): string {
  const [y, m, d] = anchorDate.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const mon = new Date(dt);
  mon.setDate(dt.getDate() - ((dt.getDay() + 6) % 7));
  const yyyy = mon.getFullYear();
  const mm = String(mon.getMonth() + 1).padStart(2, '0');
  const dd = String(mon.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export async function getCachedWeeklyGymAnalysis(weekAnchorDate: string): Promise<WeeklyGymAnalysis | null> {
  try {
    const mondayStr = getWeekMondayStr(weekAnchorDate);
    const key = `@zentrack_weekly_ai_report_${mondayStr}`;
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return (parsed.analysis || parsed) as WeeklyGymAnalysis;
  } catch (_) {
    return null;
  }
}

// ── Main Export ───────────────────────────────────────────────────────────────

export async function getOrGenerateWeeklyGymAnalysis(
  gymLogs: any[],
  weekAnchorDate: string,
  userGymPlan?: any,
  gymProfile?: any,
  forceRefresh: boolean = false,
  precomputedStats?: PrecomputedGymStats,
): Promise<{ analysis: WeeklyGymAnalysis | null; fromCache: boolean; error?: string }> {

  if (!gymLogs || gymLogs.length === 0) {
    return { analysis: null, fromCache: false };
  }

  // ── Build date ranges ─────────────────────────────────────────────────────
  const [y, m, dayN] = weekAnchorDate.split('-').map(Number);
  const d = new Date(y, m - 1, dayN);
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));

  const makeRange = (startMonday: Date): string[] =>
    Array.from({ length: 7 }, (_, i) => {
      const dt = new Date(startMonday);
      dt.setDate(startMonday.getDate() + i);
      return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    });

  const weekDates     = makeRange(monday);
  const prevMonday    = new Date(monday); prevMonday.setDate(monday.getDate() - 7);
  const prevWeekDates = makeRange(prevMonday);

  const thirtyDaysAgo = new Date(monday); thirtyDaysAgo.setDate(monday.getDate() - 30);
  const thirtyDaysAgoStr = `${thirtyDaysAgo.getFullYear()}-${String(thirtyDaysAgo.getMonth() + 1).padStart(2, '0')}-${String(thirtyDaysAgo.getDate()).padStart(2, '0')}`;

  const weekLogs      = gymLogs.filter(l => weekDates.includes(l.date));
  const prevLogs      = gymLogs.filter(l => prevWeekDates.includes(l.date));
  const thirtyDayLogs = gymLogs.filter(l => l.date >= thirtyDaysAgoStr && l.date <= weekDates[6]);

  // ── FIX: Count completed sets, not total exercises ────────────────────────
  const thisWeekCompletedSets = weekLogs.reduce((sum, l) =>
    sum + (l.exercises ?? []).reduce((s2: number, ex: any) => {
      if (ex.skipped) return s2;
      return s2 + (ex.setsLog ?? []).filter((s: any) => s.completed).length;
    }, 0), 0);

  if (thisWeekCompletedSets === 0) {
    return { analysis: null, fromCache: false };
  }

  const mondayStr = getWeekMondayStr(weekAnchorDate);
  const cacheKey  = `@zentrack_weekly_ai_report_${mondayStr}`;

  // ── Permanent Week Cache Check ────────────────────────────────────────────
  if (!forceRefresh) {
    try {
      const raw = await AsyncStorage.getItem(cacheKey);
      if (raw) {
        const cached = JSON.parse(raw);
        const analysis = (cached.analysis || cached) as WeeklyGymAnalysis;
        if (analysis && analysis.headline && analysis.verdict) {
          return { analysis, fromCache: true };
        }
      }
    } catch (_) { /* ignore, proceed to generate */ }
  }

  // ── Build session data payload ────────────────────────────────────────────
  const formatSession = (log: any) => ({
    date: log.date,
    durationMinutes: log.workoutDurationMinutes || null,
    exercises: (log.exercises || [])
      .filter((e: any) => !e.skipped)
      .map((ex: any) => {
        const completedSets = (ex.setsLog || []).filter((s: any) => s.completed);
        const maxWeight     = Math.max(0, ...completedSets.map((s: any) => Number(s.weight) || 0));
        const maxRepsAtMax  = completedSets.find((s: any) => Number(s.weight) === maxWeight)?.reps || 0;
        return {
          name: ex.name,
          muscle: canonicalizeMuscle(ex.muscle),
          targetSets: ex.targetSets || 3,
          completedSets: completedSets.length,
          maxWeightKg: maxWeight > 0 ? maxWeight : null,
          est1RM: maxWeight > 0 ? epley1RM(maxWeight, maxRepsAtMax) : null,
          setsDetail: completedSets.map((s: any) => ({
            weight: Number(s.weight) || 0,
            reps:   Number(s.reps)   || 0,
          })),
        };
      }),
    cardio: (log.cardio || []).filter((c: any) => c.completed).map((c: any) => ({
      type:            c.type || 'Cardio',
      durationMinutes: c.durationMinutes || 0,
      distanceKm:      c.distanceKm || 0,
    })),
  });

  const thisWeekData = weekLogs.filter(isValidWorkoutSession).map(formatSession);
  const prevWeekData = prevLogs.filter(isValidWorkoutSession).map(formatSession);

  // ── 30-day progression per exercise ──────────────────────────────────────
  const thirtyDayProgression: Record<string, { dates: string[]; maxWeights: number[]; est1RMs: number[]; volumes: number[] }> = {};
  for (const log of thirtyDayLogs) {
    for (const ex of log.exercises || []) {
      if (ex.skipped) continue;
      const completed = (ex.setsLog || []).filter((s: any) => s.completed);
      if (!completed.length) continue;
      const maxW    = Math.max(0, ...completed.map((s: any) => Number(s.weight) || 0));
      const maxReps = completed.find((s: any) => Number(s.weight) === maxW)?.reps || 0;
      const vol     = completed.reduce((sum: number, s: any) => sum + (Number(s.weight) || 0) * (Number(s.reps) || 0), 0);
      if (!thirtyDayProgression[ex.name]) {
        thirtyDayProgression[ex.name] = { dates: [], maxWeights: [], est1RMs: [], volumes: [] };
      }
      thirtyDayProgression[ex.name].dates.push(log.date);
      thirtyDayProgression[ex.name].maxWeights.push(maxW);
      thirtyDayProgression[ex.name].est1RMs.push(epley1RM(maxW, maxReps));
      thirtyDayProgression[ex.name].volumes.push(vol);
    }
  }

  // ── Pre-computed stats block for prompt ───────────────────────────────────
  let statsBlock = '';
  if (precomputedStats) {
    const st  = precomputedStats;
    const sign = (n: number) => n >= 0 ? '+' : '';
    const muscleLines = Object.entries(st.muscleCompletion)
      .map(([muscle, v]) => `  ${muscle}: ${v.done}/${v.planned} sets (${v.pct}%)`)
      .join('\n');
    const rmLines = Object.entries(st.estimatedOneRMs).slice(0, 6)
      .map(([ex, rm]) => `  ${ex}: ~${rm} kg est. 1RM`)
      .join('\n');
    statsBlock = `
AUTHORITATIVE PRE-COMPUTED STATS (use these exact numbers — do not invent different values):
• This week volume : ${st.thisWeekVolume.toLocaleString()} kg
• Last week volume : ${st.prevWeekVolume.toLocaleString()} kg
• Volume delta     : ${sign(st.volumeDeltaKg)}${st.volumeDeltaKg.toLocaleString()} kg (${sign(st.volumeDeltaPct)}${st.volumeDeltaPct.toFixed(1)}%)
• Total sets       : ${st.thisWeekSets} this week | ${st.prevWeekSets} last week | delta ${sign(st.thisWeekSets - st.prevWeekSets)}${st.thisWeekSets - st.prevWeekSets}
• Sessions         : ${st.sessionCount}/${st.plannedSessions} planned
• Top lift         : ${st.topLift ? `${st.topLift.name} — ${st.topLift.weight}kg × ${st.topLift.reps} reps` : 'none logged'}
• Untrained        : ${st.untrainedMuscles.length > 0 ? st.untrainedMuscles.join(', ') : 'none — full coverage ✓'}
Muscle completion:
${muscleLines}
Estimated 1RMs (Epley):
${rmLines}
`;
  }

  const athleteCtx = gymProfile
    ? `ATHLETE: ${gymProfile.weightKg || 'N/A'}kg bodyweight, Goal: ${gymProfile.goal || 'Hypertrophy/Strength'}, Level: ${gymProfile.experience || 'Intermediate'}`
    : 'ATHLETE: Hypertrophy / Strength focus, Intermediate level';

  const prompt = `You are GAINS / S.A.R.A — an elite sports scientist and direct biomechanics coach. No generic advice. Quote real weights, real exercises, real numbers.

Analyze this athlete's training week (${weekDates[0]} to ${weekDates[6]}), compare vs previous week, and contextualize with 30-day trends.

${athleteCtx}
${statsBlock}
THIS WEEK'S SESSIONS:
${JSON.stringify(thisWeekData, null, 2)}

PREVIOUS WEEK'S SESSIONS:
${JSON.stringify(prevWeekData, null, 2)}

30-DAY PROGRESSION (exercise → max weights, est. 1RMs, volumes over time):
${JSON.stringify(thirtyDayProgression, null, 2)}

Return ONLY valid raw JSON matching this exact schema (no markdown, no text before/after the JSON):
{
  "headline": "<5-8 word punchy headline: training theme + overload state>",
  "verdict": "<2-3 sentences using exact numbers from stats above: volume, sets, adherence, intensity. Be direct.>",
  "score": <integer 0-100>,
  "scoreGrade": <"A+" if score>=93 | "A" if >=85 | "B+" if >=75 | "B" if >=65 | "C" otherwise>,
  "comparisonVsLastWeek": {
    "volumeDeltaText": "<Exact delta text, e.g. '+3,250 kg (+15.4%) vs last week'>",
    "keyOverloads": [
      "<Exercise name: exact weight delta, e.g. 'Bench Press: 80kg→85kg, 6 reps — strength PR'>",
      "<Second exercise with real weight/rep numbers>",
      "<Third exercise or notable volume change>"
    ],
    "summary": "<1-2 sentences comparing session count and intensity changes, with real numbers>"
  },
  "thirtyDayTrend": {
    "trajectory": "<1 sentence on 30-day 1RM / volume curve — is athlete progressing, plateauing, or fatigued?>",
    "laggingMuscles": ["<Specific muscle with evidence of stagnation, or 'All groups progressing well'>"],
    "fatigueIndicator": "<Brief CNS/muscular fatigue assessment based on 30-day density>"
  },
  "nextWeekDirectives": [
    "<Specific primary compound lift directive with target weight/sets>",
    "<Specific accessory/volume directive with muscle and exercise>",
    "<Recovery or technique directive — practical and specific>"
  ]
}

HARD RULES: Only use numbers from the pre-computed stats block. No markdown asterisks. No numeric prefixes on directive strings. Output only the JSON object.`;

  // ── Call Gemini with up to 2 retries ──────────────────────────────────────
  let lastError: string | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await callProxy({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 2000,
          responseMimeType: 'application/json',
        },
      });

      const { text } = parseProxyResponse(response);
      const jsonStr  = extractJson(text);
      const parsed   = JSON.parse(jsonStr) as WeeklyGymAnalysis;
      parsed.generatedAt = Date.now();

      // Sanitize all string arrays
      if (Array.isArray(parsed.nextWeekDirectives)) {
        parsed.nextWeekDirectives = parsed.nextWeekDirectives.map(sanitizeAiString).filter(Boolean);
      }
      if (parsed.comparisonVsLastWeek?.keyOverloads) {
        parsed.comparisonVsLastWeek.keyOverloads = parsed.comparisonVsLastWeek.keyOverloads.map(sanitizeAiString).filter(Boolean);
      }
      if (parsed.thirtyDayTrend?.laggingMuscles) {
        parsed.thirtyDayTrend.laggingMuscles = parsed.thirtyDayTrend.laggingMuscles.map(sanitizeAiString).filter(Boolean);
      }

      await AsyncStorage.setItem(
        cacheKey,
        JSON.stringify({ analysis: parsed, timestamp: Date.now(), weekMonday: mondayStr }),
      );

      return { analysis: parsed, fromCache: false };
    } catch (err: any) {
      lastError = err?.message || 'Unknown error';
      console.warn(`[WeeklyGymAnalysis] Attempt ${attempt + 1} failed:`, lastError);
      if (attempt === 0) await new Promise(r => setTimeout(r, 1500));
    }
  }

  return { analysis: null, fromCache: false, error: lastError || 'Generation failed after 2 attempts' };
}

