/**
 * weeklyGymAnalysisEngine.ts — ZenTrack Mobile
 *
 * Comprehensive AI weekly analysis engine for Rest Day report:
 *  - Analyzes current week's sets, reps, weights, and muscle targets
 *  - Compares directly against last week's performance (overloads, volume delta)
 *  - Evaluates 30-day mesocycle trends (plateaus, lagging muscles, fatigue indicators)
 *  - Generates 3 precise, actionable directives for the upcoming week
 *
 * Caching & Fingerprinting:
 *  - Computes a deterministic data fingerprint from the week's completed sets, volume,
 *    and latest log timestamp.
 *  - Never makes unnecessary API calls on screen open — loads from AsyncStorage cache in 0ms.
 *  - Only re-analyzes when new exercises/sets are logged or underlying data changes.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { callProxy, parseProxyResponse } from './geminiProxy';
import { canonicalizeMuscle, isValidWorkoutSession } from '../utils/gymUtils';

export interface WeeklyGymAnalysis {
  headline: string;
  verdict: string;
  score: number; // 0-100 overall week execution score
  scoreGrade: string; // e.g. "A+", "A", "B+"
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

const CACHE_PREFIX = 'zentrack_weekly_gym_analysis_v2_';

/**
 * Computes a deterministic hash fingerprint representing the exact state of the weekly data.
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

/**
 * Clean string utility to strip unnecessary markdown markers
 */
function sanitizeAiString(str: string): string {
  if (!str) return '';
  // Remove markdown bullet points, numeric prefixes (1., 2., etc.), and clean stray quotes
  return str
    .replace(/^(\d+\.\s*|[-•*]\s*)/, '')
    .trim();
}

/**
 * Retrieves cached analysis or generates a new one via Gemini if data has changed.
 */
export async function getOrGenerateWeeklyGymAnalysis(
  gymLogs: any[],
  weekAnchorDate: string,
  userGymPlan?: any,
  gymProfile?: any,
  forceRefresh: boolean = false,
): Promise<{ analysis: WeeklyGymAnalysis | null; fromCache: boolean }> {
  if (!gymLogs || gymLogs.length === 0) {
    return { analysis: null, fromCache: false };
  }

  // 1. Calculate Date Ranges (Local Timezone)
  const [y, m, day] = weekAnchorDate.split('-').map(Number);
  const d = new Date(y, m - 1, day);
  const dow = d.getDay(); // 0=Sun
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((dow + 6) % 7));

  const weekDates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const dt = new Date(monday);
    dt.setDate(monday.getDate() + i);
    const yr = dt.getFullYear();
    const mo = String(dt.getMonth() + 1).padStart(2, '0');
    const da = String(dt.getDate()).padStart(2, '0');
    weekDates.push(`${yr}-${mo}-${da}`);
  }

  // Prev week (7 days before)
  const prevWeekDates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const dt = new Date(monday);
    dt.setDate(monday.getDate() - 7 + i);
    const yr = dt.getFullYear();
    const mo = String(dt.getMonth() + 1).padStart(2, '0');
    const da = String(dt.getDate()).padStart(2, '0');
    prevWeekDates.push(`${yr}-${mo}-${da}`);
  }

  // 30 days threshold
  const thirtyDaysAgo = new Date(monday);
  thirtyDaysAgo.setDate(monday.getDate() - 30);
  const thirtyDaysAgoStr = `${thirtyDaysAgo.getFullYear()}-${String(thirtyDaysAgo.getMonth() + 1).padStart(2, '0')}-${String(thirtyDaysAgo.getDate()).padStart(2, '0')}`;

  const weekLogs = gymLogs.filter(l => weekDates.includes(l.date));
  const prevLogs = gymLogs.filter(l => prevWeekDates.includes(l.date));
  const thirtyDayLogs = gymLogs.filter(l => l.date >= thirtyDaysAgoStr && l.date <= weekDates[6]);

  // If no workouts this week, skip AI generation
  const thisWeekExerciseCount = weekLogs.reduce((sum, l) => sum + (l.exercises?.length || 0), 0);
  if (thisWeekExerciseCount === 0) {
    return { analysis: null, fromCache: false };
  }

  const fingerprint = computeWeeklyDataFingerprint(weekAnchorDate, weekLogs, thirtyDayLogs);
  const cacheKey = `${CACHE_PREFIX}${weekAnchorDate}`;

  // 2. Check Cache
  if (!forceRefresh) {
    try {
      const raw = await AsyncStorage.getItem(cacheKey);
      if (raw) {
        const cached = JSON.parse(raw);
        if (cached && cached.fingerprint === fingerprint && cached.analysis) {
          return { analysis: cached.analysis as WeeklyGymAnalysis, fromCache: true };
        }
      }
    } catch (_) {
      // ignore storage error, proceed to generate
    }
  }

  // 3. Prepare Structured Data Payload for Gemini
  const formatSession = (log: any) => ({
    date: log.date,
    durationMinutes: log.workoutDurationMinutes || null,
    exercises: (log.exercises || [])
      .filter((e: any) => !e.skipped)
      .map((ex: any) => {
        const completedSets = (ex.setsLog || []).filter((s: any) => s.completed);
        const maxWeight = Math.max(0, ...completedSets.map((s: any) => Number(s.weight) || 0));
        return {
          name: ex.name,
          muscle: canonicalizeMuscle(ex.muscle),
          targetSets: ex.targetSets || 3,
          completedSets: completedSets.length,
          maxWeightKg: maxWeight > 0 ? maxWeight : null,
          setsDetail: completedSets.map((s: any) => ({
            weight: Number(s.weight) || 0,
            reps: Number(s.reps) || 0,
          })),
        };
      }),
    cardio: (log.cardio || [])
      .filter((c: any) => c.completed)
      .map((c: any) => ({
        type: c.type || 'Cardio',
        durationMinutes: c.durationMinutes || 0,
        distanceKm: c.distanceKm || 0,
      })),
  });

  const thisWeekData = weekLogs.filter(isValidWorkoutSession).map(formatSession);
  const prevWeekData = prevLogs.filter(isValidWorkoutSession).map(formatSession);

  // 30-day top lifts history per exercise
  const thirtyDayProgression: Record<string, { dates: string[]; maxWeights: number[]; totalVolumes: number[] }> = {};
  for (const log of thirtyDayLogs) {
    for (const ex of log.exercises || []) {
      if (ex.skipped) continue;
      const completed = (ex.setsLog || []).filter((s: any) => s.completed);
      if (completed.length === 0) continue;
      const maxW = Math.max(0, ...completed.map((s: any) => Number(s.weight) || 0));
      const vol = completed.reduce((sum: number, s: any) => sum + (Number(s.weight) || 0) * (Number(s.reps) || 0), 0);
      if (!thirtyDayProgression[ex.name]) {
        thirtyDayProgression[ex.name] = { dates: [], maxWeights: [], totalVolumes: [] };
      }
      thirtyDayProgression[ex.name].dates.push(log.date);
      thirtyDayProgression[ex.name].maxWeights.push(maxW);
      thirtyDayProgression[ex.name].totalVolumes.push(vol);
    }
  }

  const athleteContext = gymProfile
    ? `ATHLETE: Weight: ${gymProfile.weightKg || 'N/A'}kg, Goal: ${gymProfile.goal || 'Hypertrophy/Strength'}, Exp: ${gymProfile.experience || 'Intermediate'}`
    : `ATHLETE: Standard Hypertrophy / Strength Focus`;

  const prompt = `You are GAINS / S.A.R.A, an elite sports scientist, biomechanics coach, and hyper-precise gym analyst.
Analyze this athlete's completed training week (${weekDates[0]} to ${weekDates[6]}), compare against the previous week, and contextualize with their 30-day historical progression.

${athleteContext}

THIS WEEK'S TRAINING DATA (${weekDates[0]} to ${weekDates[6]}):
${JSON.stringify(thisWeekData, null, 2)}

PREVIOUS WEEK'S DATA (${prevWeekDates[0]} to ${prevWeekDates[6]}):
${JSON.stringify(prevWeekData, null, 2)}

30-DAY PROGRESSION SAMPLES:
${JSON.stringify(thirtyDayProgression, null, 2)}

Generate a clean, high-conviction JSON response with EXACTLY this schema (raw JSON only, no markdown codeblocks):
{
  "headline": "<Punchy 4-7 word headline summarizing the week's training theme & progressive overload state>",
  "verdict": "<2-3 sentence executive assessment of volume, target set completion, and intensity balance>",
  "score": <0-100 number score reflecting consistency and progressive overload>,
  "scoreGrade": <"A+" | "A" | "B+" | "B" | "C">,
  "comparisonVsLastWeek": {
    "volumeDeltaText": "<e.g. '+3,200 kg (+8.4%) load increase' or '-1,100 kg (-4.2%) recovery delta'>",
    "keyOverloads": [
      "<Exercise Name: exact weight/rep delta vs last week, e.g. Incline DB Press: 30kg → 32kg (+2kg for 8 reps)>",
      "<Another specific exercise progressive overload or volume note>"
    ],
    "summary": "<1-2 sentence comparison of session frequency and intensity changes vs last week>"
  },
  "thirtyDayTrend": {
    "trajectory": "<1 sentence on the 30-day progressive overload trajectory & strength curve>",
    "laggingMuscles": [
      "<Specific muscle or exercise with lower frequency/stagnation in the last 30 days, or 'Balanced distribution across all muscle groups'>"
    ],
    "fatigueIndicator": "<Brief note on CNS/muscular fatigue state based on 30-day frequency & volume spikes>"
  },
  "nextWeekDirectives": [
    "<Direct actionable coaching sentence for next week's primary compound lift without leading numbers or markdown>",
    "<Specific accessory or volume adjustment for mid-week without leading numbers>",
    "<Form/cadence or recovery directive for the upcoming training cycle without leading numbers>"
  ]
}

CRITICAL RULES:
- Do NOT use markdown asterisks (** or *) in strings.
- Do NOT prefix nextWeekDirectives with numbers like '1.' or '2.' — provide clean sentence strings.
- Be concise, athletic, scientific, and direct. Quote real exercises, weights in kg, and rep counts.
- Output ONLY valid raw JSON.`;

  try {
    const response = await callProxy({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.35,
        maxOutputTokens: 1800,
        responseMimeType: 'application/json',
      },
    });

    const { text } = parseProxyResponse(response);
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned) as WeeklyGymAnalysis;
    parsed.generatedAt = Date.now();

    // Clean directives from any stray prefixes or markdown
    if (Array.isArray(parsed.nextWeekDirectives)) {
      parsed.nextWeekDirectives = parsed.nextWeekDirectives.map(sanitizeAiString);
    }
    if (parsed.comparisonVsLastWeek?.keyOverloads) {
      parsed.comparisonVsLastWeek.keyOverloads = parsed.comparisonVsLastWeek.keyOverloads.map(sanitizeAiString);
    }

    // Cache the result with the deterministic fingerprint
    await AsyncStorage.setItem(
      cacheKey,
      JSON.stringify({ fingerprint, analysis: parsed, timestamp: Date.now() }),
    );

    return { analysis: parsed, fromCache: false };
  } catch (err: any) {
    console.warn('[WeeklyGymAnalysis] Generation error:', err.message);
    return { analysis: null, fromCache: false };
  }
}
