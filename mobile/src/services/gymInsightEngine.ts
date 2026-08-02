/**
 * gymInsightEngine.ts — ZenTrack Mobile
 *
 * Generates a one-per-session AI workout insight by analysing:
 *   - Last 5-10 gym sessions (full setsLog detail)
 *   - Today's planned exercises
 *   - User's gym profile (height, weight, goal, experience, limitations)
 *
 * Called once per workout day when the rest timer first starts.
 * Result is cached in AsyncStorage so the AI call only fires once.
 *
 * Key: 'gym_insight_YYYY-MM-DD'
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { callProxy, parseProxyResponse } from './geminiProxy';
import { GymProfile } from '../hooks/useGymProfile';

export interface WorkoutInsight {
  /** 0-10 fatigue score */
  fatigueScore: number;
  /** Short human label for fatigue */
  fatigueLabel: string;
  /** Per-exercise load trend */
  loadTrends: { name: string; trend: 'increasing' | 'plateau' | 'declining'; note: string }[];
  /** Today's pre-workout warm-up suggestions */
  warmup: { exercise: string; sets: number; reps: string; note: string }[];
  /** Post-workout cool-down / stretches */
  cooldown: { stretch: string; duration: string; side?: string }[];
  /** Single most important personalised coaching tip for today */
  coachingTip: string;
  /** Session summary headline */
  headline: string;
}

const INSIGHT_PREFIX = 'gym_insight_';
const TRIGGER_PREFIX = 'gym_insight_triggered_v2_';

/**
 * Checks whether insight has already been triggered today.
 */
export async function hasInsightFiredToday(dateStr: string): Promise<boolean> {
  const val = await AsyncStorage.getItem(TRIGGER_PREFIX + dateStr);
  return val === 'true';
}

/**
 * Marks insight as triggered for today (prevents repeat firing).
 */
export async function markInsightFiredToday(dateStr: string): Promise<void> {
  await AsyncStorage.setItem(TRIGGER_PREFIX + dateStr, 'true');
}

/**
 * Generates the workout insight via Gemini.
 * Returns cached result if available for today.
 */
export async function generateWorkoutInsight(
  gymLogs: any[],
  gymProfile: GymProfile,
  todayExercises: any[],
  dateStr: string
): Promise<WorkoutInsight | null> {
  const cacheKey = INSIGHT_PREFIX + dateStr;

  // Return cached if available
  try {
    const cached = await AsyncStorage.getItem(cacheKey);
    if (cached) return JSON.parse(cached) as WorkoutInsight;
  } catch (_) {}

  // Build last 10 sessions summary with full setsLog detail
  const recent = (gymLogs || [])
    .filter(l => l.date < dateStr && (l.exercises?.length > 0))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 10);

  const sessionSummaries = recent.map(log => ({
    date: log.date,
    exercises: (log.exercises || []).map((ex: any) => ({
      name: ex.name,
      muscle: ex.muscle,
      sets: (ex.setsLog || []).filter((s: any) => s.completed).map((s: any) => ({
        reps: s.reps,
        weight: s.weight,
      })),
    })),
  }));

  const todayPlan = (todayExercises || []).map((ex: any) => ({
    name: ex.name,
    targetSets: ex.targetSets,
    targetReps: ex.targetReps,
    muscle: ex.muscle,
  }));

  // Build profile string
  const profileStr = [
    gymProfile.weightKg ? `Bodyweight: ${gymProfile.weightKg}kg` : '',
    gymProfile.heightCm ? `Height: ${gymProfile.heightCm}cm` : '',
    gymProfile.age ? `Age: ${gymProfile.age}` : '',
    gymProfile.gender ? `Gender: ${gymProfile.gender}` : '',
    gymProfile.goal ? `Goal: ${gymProfile.goal}` : '',
    gymProfile.experience ? `Experience: ${gymProfile.experience}` : '',
    gymProfile.equipment ? `Equipment: ${gymProfile.equipment}` : '',
    gymProfile.limitations ? `Limitations: ${gymProfile.limitations}` : '',
    gymProfile.exercisesToAvoid ? `Avoid: ${gymProfile.exercisesToAvoid}` : '',
  ].filter(Boolean).join(', ');

  const prompt = `You are an elite AI personal trainer. Analyse this athlete's last ${recent.length} sessions and generate a personalised pre-workout insight for today (${dateStr}).

ATHLETE PROFILE: ${profileStr || 'Unknown'}

TODAY'S PLANNED EXERCISES:
${JSON.stringify(todayPlan, null, 2)}

LAST ${recent.length} SESSIONS (most recent first):
${JSON.stringify(sessionSummaries, null, 2)}

Generate a JSON object with EXACTLY this structure (no markdown, raw JSON only):
{
  "fatigueScore": <0-10 number, 10=completely exhausted>,
  "fatigueLabel": <"Fresh" | "Recovered" | "Moderate Fatigue" | "Fatigued" | "Overtrained">,
  "loadTrends": [
    {
      "name": "<exercise name>",
      "trend": <"increasing" | "plateau" | "declining">,
      "note": "<1 short sentence about this exercise trend>"
    }
  ],
  "warmup": [
    {
      "exercise": "<warm-up exercise name>",
      "sets": <number>,
      "reps": "<rep range or duration>",
      "note": "<why this warm-up>"
    }
  ],
  "cooldown": [
    {
      "stretch": "<stretch name>",
      "duration": "<e.g. 30 seconds>",
      "side": "<optional: left/right/both>"
    }
  ],
  "coachingTip": "<The single most important personalised advice for this exact session — specific, actionable, based on the data>",
  "headline": "<Short motivating session headline e.g. 'Strong Push Day Ahead' or 'Recovery Mode: Go Smart Today'>"
}

Rules:
- loadTrends: only include exercises from today's plan that appear in recent history
- warmup: 3-5 exercises specific to today's muscle groups (e.g. if bench press → band pull-aparts, arm circles)
- cooldown: 4-6 stretches matching today's worked muscles
- fatigueScore: calculate from session frequency, volume load, days since last rest day
- coachingTip: be SPECIFIC, reference actual exercises and weights if visible
- Output ONLY valid JSON, no markdown, no explanation`;

  try {
    const data = await callProxy({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 2048, responseMimeType: 'application/json' },
    });

    const { text } = parseProxyResponse(data);
    // Strip any markdown code fences if present
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const insight: WorkoutInsight = JSON.parse(cleaned);

    // Cache for today
    await AsyncStorage.setItem(cacheKey, JSON.stringify(insight));

    return insight;
  } catch (err: any) {
    console.warn('[GymInsight] Failed to generate insight:', err.message);
    return null;
  }
}
