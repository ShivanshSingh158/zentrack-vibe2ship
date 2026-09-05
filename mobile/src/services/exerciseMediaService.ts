/**
 * exerciseMediaService.ts — ZenTrack Mobile
 *
 * 1,324 Exercise Dataset & Offline Media Engine:
 * - Powered by the curated hasaneyldrm/exercises-dataset (MIT + GymVisual).
 * - Instant in-memory search and fuzzy matching with synonym expansion & stemming.
 * - Disk-caching engine using Expo FileSystem for 100% offline gym workouts.
 * - Auto pre-caching for scheduled weekly gym plans.
 */
import * as FileSystem from 'expo-file-system/legacy';
import rawExercises from '../data/exercises.json';

export interface ExerciseDefinition {
  id: string;
  name: string;
  category: string;
  bodyPart: string;
  equipment: string;
  target: string;
  secondaryMuscles: string[];
  instruction: string;
  instructionHi: string;
  steps: string[];
  image: string;
  gifUrl: string;
  mediaId: string;
}

const EXERCISES: ExerciseDefinition[] = rawExercises as ExerciseDefinition[];

// Fast normalized lookup maps
const EXERCISE_BY_ID = new Map<string, ExerciseDefinition>();
const EXERCISE_BY_NORM_NAME = new Map<string, ExerciseDefinition>();

const KNOWN_SYNONYMS: Record<string, string> = {
  rdl: 'romanian deadlift',
  rdls: 'romanian deadlift',
  ghr: 'glute ham raise',
  db: 'dumbbell',
  bb: 'barbell',
  ohp: 'overhead press',
  dips: 'dip',
  'pull ups': 'pull up',
  'chin ups': 'chin up',
  'skull crushers': 'skull crusher',
  pushdowns: 'pushdown',
  pulldowns: 'pulldown',
  deadlifts: 'deadlift',
  squats: 'squat',
  curls: 'curl',
  raises: 'raise',
  extensions: 'extension',
  presses: 'press',
  shrugs: 'shrug',
  crunches: 'crunch',
  twists: 'twist',
  rows: 'row',
  swings: 'swing',
  thrusts: 'glute bridge',
  bridges: 'bridge',
  flys: 'fly',
  flyes: 'fly',
  woodchopper: 'cable standing up woodchop',
  woodchoppers: 'cable standing up woodchop',
  woodchop: 'cable standing up woodchop',
  'plate pinch': 'farmers walk',
  'plate pinches': 'farmers walk',
  'pinch hold': 'farmers walk',
  'stomach vacuum': 'alternate heel touchers',
  'hammer strength': 'lever',
  'pec deck': 'lever seated fly',
  preacher: 'preacher curl',
};

function normalize(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
}

function cleanString(str: string): string {
  let cleaned = str.toLowerCase();
  for (const [abbr, full] of Object.entries(KNOWN_SYNONYMS)) {
    const reg = new RegExp(`\\b${abbr}\\b`, 'gi');
    cleaned = cleaned.replace(reg, full);
  }
  return cleaned
    .replace(/[\(\)\/\,\-\–\—\.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(str: string): string[] {
  return cleanString(str)
    .split(' ')
    .filter(t => t.length > 1)
    .map(t => t.replace(/(s|es|ing)$/, '')); // stem
}

const EXERCISE_TOKENS = new Map<string, string[]>();

EXERCISES.forEach(ex => {
  EXERCISE_BY_ID.set(ex.id, ex);
  EXERCISE_BY_NORM_NAME.set(normalize(ex.name), ex);
  EXERCISE_TOKENS.set(ex.id, tokenize(ex.name));
});

// CDN Base URLs (jsDelivr for high-speed global edge distribution)
const CDN_PRIMARY_BASE = 'https://cdn.jsdelivr.net/gh/hasaneyldrm/exercises-dataset@main';
const CDN_FALLBACK_BASE = 'https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main';
const CACHE_DIR = `${FileSystem.cacheDirectory}exercise_gifs/`;

let isCacheDirEnsured = false;
async function ensureCacheDir() {
  if (isCacheDirEnsured) return;
  try {
    const info = await FileSystem.getInfoAsync(CACHE_DIR);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
    }
    isCacheDirEnsured = true;
  } catch (e) {
    console.warn('[ExerciseMediaService] Failed to create cache directory:', e);
  }
}

/**
 * Resolves full Exercise Definition from name or ID with advanced fuzzy matching,
 * synonym expansion, and token scoring.
 */
export function resolveExercise(nameOrId: string): ExerciseDefinition | null {
  if (!nameOrId) return null;
  const trimmed = nameOrId.trim();

  // 1. Direct ID match
  if (EXERCISE_BY_ID.has(trimmed)) {
    return EXERCISE_BY_ID.get(trimmed)!;
  }

  // 2. Direct normalized match
  const norm = normalize(trimmed);
  if (EXERCISE_BY_NORM_NAME.has(norm)) {
    return EXERCISE_BY_NORM_NAME.get(norm)!;
  }

  // 3. Cleaned string normalized match (synonyms expanded)
  const cleaned = cleanString(trimmed);
  const cleanNorm = normalize(cleaned);
  if (EXERCISE_BY_NORM_NAME.has(cleanNorm)) {
    return EXERCISE_BY_NORM_NAME.get(cleanNorm)!;
  }

  // 4. Substring matching
  for (const ex of EXERCISES) {
    const exNorm = normalize(ex.name);
    if (exNorm.includes(cleanNorm) || cleanNorm.includes(exNorm)) {
      return ex;
    }
  }

  // 5. Token overlap scoring with stemming
  const queryTokens = tokenize(trimmed);
  let bestMatch: ExerciseDefinition | null = null;
  let bestScore = 0;

  for (const ex of EXERCISES) {
    const exTokens = EXERCISE_TOKENS.get(ex.id) || [];
    let score = 0;
    for (const qt of queryTokens) {
      for (const et of exTokens) {
        if (qt === et) {
          score += 3; // exact token match
        } else if (et.includes(qt) || qt.includes(et)) {
          score += 1.5; // partial token match
        }
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = ex;
    }
  }

  if (bestScore >= 3 && bestMatch) {
    return bestMatch;
  }

  return null;
}

/**
 * Searches the 1,324 exercise dataset by query and optional bodyPart filter
 */
export function searchExercises(query: string, bodyPartFilter?: string, limit = 40): ExerciseDefinition[] {
  const normQuery = query.trim().toLowerCase();
  const normFilter = bodyPartFilter?.trim().toLowerCase();

  return EXERCISES.filter(ex => {
    if (normFilter && normFilter !== 'all' && ex.bodyPart.toLowerCase() !== normFilter && ex.category.toLowerCase() !== normFilter) {
      return false;
    }
    if (!normQuery) return true;
    return (
      ex.name.toLowerCase().includes(normQuery) ||
      ex.target.toLowerCase().includes(normQuery) ||
      ex.equipment.toLowerCase().includes(normQuery) ||
      ex.secondaryMuscles.some(m => m.toLowerCase().includes(normQuery))
    );
  }).slice(0, limit);
}

/**
 * Returns remote CDN URL for an exercise's animation GIF
 */
export function getExerciseGifCdnUrl(ex: ExerciseDefinition, useFallback = false): string {
  const base = useFallback ? CDN_FALLBACK_BASE : CDN_PRIMARY_BASE;
  if (ex.gifUrl.startsWith('http')) return ex.gifUrl;
  return `${base}/${ex.gifUrl}`;
}

/**
 * Returns remote CDN URL for an exercise's thumbnail image
 */
export function getExerciseThumbnailUrl(ex: ExerciseDefinition, useFallback = false): string {
  const base = useFallback ? CDN_FALLBACK_BASE : CDN_PRIMARY_BASE;
  if (ex.image.startsWith('http')) return ex.image;
  return `${base}/${ex.image}`;
}

/**
 * Returns local file URI if cached on disk, otherwise remote CDN URL
 */
export async function getExerciseMediaUri(nameOrId: string): Promise<{
  definition: ExerciseDefinition | null;
  gifUri: string | null;
  imageUri: string | null;
  isOffline: boolean;
}> {
  const def = resolveExercise(nameOrId);
  if (!def) {
    return { definition: null, gifUri: null, imageUri: null, isOffline: false };
  }

  await ensureCacheDir();

  const fileName = `${def.id}_${def.mediaId || 'anim'}.gif`;
  const localPath = `${CACHE_DIR}${fileName}`;

  try {
    const fileInfo = await FileSystem.getInfoAsync(localPath);
    if (fileInfo.exists && fileInfo.size > 1000) {
      return {
        definition: def,
        gifUri: localPath,
        imageUri: getExerciseThumbnailUrl(def),
        isOffline: true,
      };
    }
  } catch (e) {
    // Ignore and fallback to CDN
  }

  return {
    definition: def,
    gifUri: getExerciseGifCdnUrl(def),
    imageUri: getExerciseThumbnailUrl(def),
    isOffline: false,
  };
}

/**
 * Pre-caches an array of exercises to local disk storage for offline workouts
 */
export async function preCacheExercises(exerciseNames: string[]): Promise<number> {
  await ensureCacheDir();
  let cachedCount = 0;

  for (const name of exerciseNames) {
    const def = resolveExercise(name);
    if (!def || !def.gifUrl) continue;

    const fileName = `${def.id}_${def.mediaId || 'anim'}.gif`;
    const localPath = `${CACHE_DIR}${fileName}`;

    try {
      const fileInfo = await FileSystem.getInfoAsync(localPath);
      if (!fileInfo.exists || fileInfo.size < 1000) {
        const cdnUrl = getExerciseGifCdnUrl(def);
        await FileSystem.downloadAsync(cdnUrl, localPath);
        cachedCount++;
      }
    } catch (e) {
      console.warn(`[ExerciseMediaService] Failed to pre-cache ${def.name}:`, e);
    }
  }

  return cachedCount;
}

/**
 * Clears all cached exercise GIFs from disk
 */
export async function clearExerciseMediaCache(): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(CACHE_DIR);
    if (info.exists) {
      await FileSystem.deleteAsync(CACHE_DIR, { idempotent: true });
      isCacheDirEnsured = false;
    }
  } catch (e) {
    console.warn('[ExerciseMediaService] Failed to clear media cache:', e);
  }
}
