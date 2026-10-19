/**
 * AddExerciseModal • ZenTrack Mobile (v2)
 *
 * Fast exercise catalogue search, auto-fill, custom exercise creation,
 * and AI fallback integration.
 */
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, TextInput,
  ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { FONT_FAMILY } from '../../theme/tokens';
import { GymExerciseLog, GymPlanDay } from '../../types/gym.types';
import { useWellnessData } from '../../contexts/domains/WellnessContext';
import { useTheme } from '../../contexts/ThemeContext';
import { getCustomPlanDay } from '../../hooks/useGymLog';
import { autoResolveExerciseVideoId } from '../../services/exerciseVideoResolver';
import { KNOWN_EXERCISE_VIDEOS, sanitizeName } from '../../services/exerciseVideoDatabase';
import { aiResolveExercise, AIExerciseInfo } from '../../services/geminiProxy';
import { GYM_PLAN } from '../../data/gymPlan';
import { EXERCISE_DATABASE } from '../../data/exerciseDatabase';
import { searchExercises } from '../../services/exerciseMediaService';
import { handleSyncError } from '../../utils/errorUtils';

// Extracted Subcomponents & Styles
import { makeAddExerciseStyles } from './addExerciseStyles';
import ExerciseSearchDropdown, { ExerciseCatalogEntry } from './ExerciseSearchDropdown';
import ExerciseCustomFields from './ExerciseCustomFields';
import { getBiomechanicalPrescription, normalizeExerciseKey, resolveExerciseTargetMuscle } from '../../utils/gymUtils';

/** Build a full deduplicated exercise catalogue from our database + plan + dataset with calibrated tiers. */
function buildCatalogue(): ExerciseCatalogEntry[] {
  const seen = new Set<string>();
  const result: ExerciseCatalogEntry[] = [];

  const add = (e: ExerciseCatalogEntry) => {
    const key = normalizeExerciseKey(e.name);
    if (!key) return;
    if (seen.has(key)) {
      const existing = result.find(r => normalizeExerciseKey(r.name) === key);
      if (existing && e.aliases && e.aliases.length > 0) {
        existing.aliases = Array.from(new Set([...(existing.aliases || []), ...e.aliases]));
      }
      return;
    }
    seen.add(key);
    result.push(e);
  };

  // 1. EXERCISE_DATABASE (Primary source with scientifically audited entries, unified aliases & tiers)
  for (const dbEntry of EXERCISE_DATABASE) {
    const rx = getBiomechanicalPrescription(dbEntry.name, dbEntry.muscle);
    add({
      id: dbEntry.id,
      name: dbEntry.name,
      muscle: dbEntry.muscle,
      tier: dbEntry.tier || 'C Tier',
      targetSets: rx.targetSets,
      targetReps: rx.targetReps,
      restTimeSecs: rx.restTimeSecs,
      videoId: (dbEntry as any).videoId || '',
      aliases: dbEntry.aliases,
    });
  }

  // 2. GYM_PLAN exercises
  for (const day of GYM_PLAN) {
    for (const ex of day.exercises) {
      const rx = getBiomechanicalPrescription(ex.name, ex.muscle);
      add({
        id: ex.id,
        name: ex.name,
        muscle: ex.muscle ?? 'Mixed',
        tier: (ex as any).tier || 'A Tier',
        targetSets: ex.targetSets ?? rx.targetSets,
        targetReps: ex.targetReps ?? rx.targetReps,
        restTimeSecs: (ex as any).restTimeSecs ?? rx.restTimeSecs,
        videoId: ex.videoId ?? '',
      });
    }
  }

  // 3. 1,324 Exercises Dataset integration (only appends genuinely new exercises)
  const datasetExercises = searchExercises('', 'all', 2000);
  for (const ex of datasetExercises) {
    const rawMuscle = ex.target || ex.bodyPart || 'Mixed';
    const cleanMuscle = rawMuscle.charAt(0).toUpperCase() + rawMuscle.slice(1);
    const rx = getBiomechanicalPrescription(ex.name, cleanMuscle);

    add({
      id: ex.id,
      name: ex.name,
      muscle: cleanMuscle,
      tier: 'C Tier',
      targetSets: rx.targetSets,
      targetReps: rx.targetReps,
      restTimeSecs: rx.restTimeSecs,
      videoId: '',
    });
  }

  return result;
}

// Lazy singleton — built once on first AddExerciseModal open, never at module parse time.
// Prevents the 4800-op buildCatalogue() (1600 items × 3 fn calls) from blocking the JS
// thread during React.lazy() module evaluation.
let _exerciseCatalogue: ExerciseCatalogEntry[] | null = null;
let _categoryMap: Record<string, ExerciseCatalogEntry[]> | null = null;

function getExerciseCatalogue(): ExerciseCatalogEntry[] {
  if (!_exerciseCatalogue) {
    _exerciseCatalogue = buildCatalogue();
    loadCustomExercisesToCatalogue().catch(() => {});
  }
  return _exerciseCatalogue;
}

function getCategoryMap(): Record<string, ExerciseCatalogEntry[]> {
  if (!_categoryMap) {
    const cat = getExerciseCatalogue();
    _categoryMap = {
      Chest:     sortTierWise(cat.filter(e => checkCategoryMatch(e.muscle, 'Chest'))),
      Back:      sortTierWise(cat.filter(e => checkCategoryMatch(e.muscle, 'Back'))),
      Legs:      sortTierWise(cat.filter(e => checkCategoryMatch(e.muscle, 'Legs'))),
      Shoulders: sortTierWise(cat.filter(e => checkCategoryMatch(e.muscle, 'Shoulders'))),
      Arms:      sortTierWise(cat.filter(e => checkCategoryMatch(e.muscle, 'Arms'))),
      Abs:       sortTierWise(cat.filter(e => checkCategoryMatch(e.muscle, 'Abs'))),
    };
  }
  return _categoryMap;
}

const CUSTOM_EXERCISES_KEY = '@zentrack_custom_exercises';

let _customExercisesMutex: Promise<void> = Promise.resolve();

async function loadCustomExercisesToCatalogue(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(CUSTOM_EXERCISES_KEY);
    if (!raw) return;
    const customs: ExerciseCatalogEntry[] = JSON.parse(raw);
    const catalogue = getExerciseCatalogue();
    for (const ex of customs) {
      const key = ex.name.toLowerCase().trim();
      const existing = catalogue.find(e => e.name.toLowerCase().trim() === key || (ex.id && e.id === ex.id));
      if (!existing) {
        catalogue.push(ex);
      } else if (ex.videoId && !existing.videoId) {
        existing.videoId = ex.videoId;
      }
    }
  } catch (_) {}
}

async function persistCustomExercise(entry: ExerciseCatalogEntry): Promise<void> {
  _customExercisesMutex = _customExercisesMutex.then(async () => {
    try {
      const raw = await AsyncStorage.getItem(CUSTOM_EXERCISES_KEY);
      const existing: ExerciseCatalogEntry[] = raw ? JSON.parse(raw) : [];
      const key = entry.name.toLowerCase().trim();
      const idx = existing.findIndex(e => e.name.toLowerCase().trim() === key || (entry.id && e.id === entry.id));
      if (idx >= 0) {
        // Update existing entry with any newly resolved properties (e.g., videoId)
        existing[idx] = {
          ...existing[idx],
          ...entry,
          videoId: entry.videoId || existing[idx].videoId || '',
        };
      } else {
        existing.push(entry);
      }
      await AsyncStorage.setItem(CUSTOM_EXERCISES_KEY, JSON.stringify(existing));

      // Also ensure live singleton catalogue stays synchronized
      const catalogue = getExerciseCatalogue();
      const live = catalogue.find(e => e.name.toLowerCase().trim() === key || (entry.id && e.id === entry.id));
      if (live) {
        if (entry.videoId) live.videoId = entry.videoId;
      } else {
        catalogue.push(entry);
      }
    } catch (_) {}
  }).catch(() => {});
  return _customExercisesMutex;
}

const extractVideoId = (urlOrId: string) => {
  if (!urlOrId) return '';
  const m = urlOrId.match(/^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/);
  return (m && m[2].length === 11) ? m[2] : urlOrId;
};

interface Props {
  visible: boolean;
  onClose: () => void;
  onAdd: (ex: GymExerciseLog) => void;
  planDay?: GymPlanDay;
  existingExerciseIds?: string[];
}

const TIER_SORT_WEIGHT: Record<string, number> = {
  'S Tier': 1,
  'A+ Tier': 2,
  'A Tier': 3,
  'B Tier': 4,
  'C Tier': 5,
};

const sortTierWise = (list: ExerciseCatalogEntry[]) => {
  return list.sort((a, b) => {
    const weightA = a.tier ? (TIER_SORT_WEIGHT[a.tier] ?? 5) : 5;
    const weightB = b.tier ? (TIER_SORT_WEIGHT[b.tier] ?? 5) : 5;
    if (weightA !== weightB) return weightA - weightB;
    return a.name.localeCompare(b.name);
  });
};

function checkCategoryMatch(m: string, category: string): boolean {
  const l = (m || '').toLowerCase();
  const cat = category.toLowerCase();

  if (cat === 'back') {
    if (l.includes('tricep') || l.includes('bicep') || l.includes('brach') || l.includes('delt')) return false;
    return (
      l.includes('back') ||
      l.includes('lat width') ||
      l.includes('latissimus') ||
      l.includes('lats') ||
      l.includes('rhomboid') ||
      l.includes('erector')
    );
  }
  if (cat === 'arms') {
    return (
      l.includes('bicep') ||
      l.includes('tricep') ||
      l.includes('brach') ||
      l.includes('forearm') ||
      l.includes('wrist')
    );
  }
  if (cat === 'legs') {
    return (
      l.includes('quad') ||
      l.includes('glute') ||
      l.includes('hamstring') ||
      l.includes('calf') ||
      l.includes('calves') ||
      l.includes('soleus') ||
      l.includes('tibialis') ||
      l.includes('vmo') ||
      l.includes('adductor') ||
      l.includes('abductor') ||
      l.includes('legs')
    );
  }
  if (cat === 'chest') {
    return l.includes('chest') || l.includes('pec') || l.includes('serratus');
  }
  if (cat === 'shoulders') {
    return l.includes('delt') || l.includes('shoulder') || l.includes('upper trap');
  }
  if (cat === 'abs') {
    return l.includes('abs') || l.includes('oblique') || l.includes('core') || l.includes('transverse') || l.includes('vacuum');
  }
  return l.includes(cat);
}

// ── Closest Word & Synonym Relevance Engine ─────────────────────────────────
const GYM_SYNONYMS: Record<string, string> = {
  db: 'dumbbell',
  bb: 'barbell',
  kb: 'kettlebell',
  rdl: 'romanian deadlift',
  rdls: 'romanian deadlift',
  ohp: 'overhead press',
  ghr: 'glute ham raise',
  flys: 'fly',
  flyes: 'fly',
  cables: 'cable',
  pulldowns: 'pulldown',
  pushdowns: 'pushdown',
  curls: 'curl',
  presses: 'press',
  rows: 'row',
  squats: 'squat',
  deadlifts: 'deadlift',
  raises: 'raise',
  shrugs: 'shrug',
  extensions: 'extension',
  crunches: 'crunch',
  pushups: 'pushup',
  pullups: 'pullup',
  dips: 'dip',
  'high-to-low': 'high to low',
  'low-to-high': 'low to high',
  'pec deck': 'pec deck fly',
};

// Pre-compile RegExp list once at module load — never re-compile inside hot search loops
const GYM_SYNONYM_REGEXES = Object.entries(GYM_SYNONYMS).map(([abbr, full]) => ({
  regex: new RegExp(`\\b${abbr}\\b`, 'gi'),
  full,
}));

function cleanSearchString(str: string): string {
  let cleaned = str.toLowerCase();
  for (let i = 0; i < GYM_SYNONYM_REGEXES.length; i++) {
    cleaned = cleaned.replace(GYM_SYNONYM_REGEXES[i].regex, GYM_SYNONYM_REGEXES[i].full);
  }
  return cleaned
    .replace(/[\(\)\/\,\-\–\—\.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getQueryTokens(str: string): string[] {
  return cleanSearchString(str)
    .split(' ')
    .filter(t => t.length > 0)
    .map(t => t.replace(/(s|es|ing)$/, ''));
}

// Token & normalized string cache for catalogue entries so we don't re-tokenize 1,600 entries on every keystroke
const entryMetaCache = new WeakMap<ExerciseCatalogEntry, {
  nameLower: string;
  normName: string;
  nameTokens: string[];
  aliasesLower: string[];
  normAliases: string[];
}>();

function getEntryMeta(entry: ExerciseCatalogEntry) {
  let meta = entryMetaCache.get(entry);
  if (!meta) {
    const nameLower = entry.name.toLowerCase();
    const normName = nameLower.replace(/[^a-z0-9]/g, '');
    const nameTokens = getQueryTokens(entry.name);
    const aliasesLower = (entry.aliases || []).map(a => a.toLowerCase());
    const normAliases = aliasesLower.map(a => a.replace(/[^a-z0-9]/g, ''));
    meta = { nameLower, normName, nameTokens, aliasesLower, normAliases };
    entryMetaCache.set(entry, meta);
  }
  return meta;
}

function scoreExerciseMatch(
  entry: ExerciseCatalogEntry,
  rawQuery: string,
  cleanedQuery: string,
  queryTokens: string[],
  normQuery: string,
  categoryFilter?: string | null
): number {
  const { nameLower, normName, nameTokens, aliasesLower: aliases, normAliases } = getEntryMeta(entry);

  let score = 0;

  // 1. Exact full name or alias match
  if (normName === normQuery) {
    score += 3000;
  } else if (normAliases.includes(normQuery)) {
    score += 2600;
  }

  // 2. Starts with query
  if (nameLower.startsWith(rawQuery) || normName.startsWith(normQuery)) {
    score += 1500;
  } else if (aliases.some(a => a.startsWith(rawQuery))) {
    score += 1200;
  }

  // 3. Substring match
  if (nameLower.includes(rawQuery) || normName.includes(normQuery)) {
    score += 1000;
  } else if (cleanedQuery !== rawQuery && nameLower.includes(cleanedQuery)) {
    score += 900;
  } else if (aliases.some(a => a.includes(rawQuery) || a.includes(cleanedQuery))) {
    score += 800;
  }

  // 4. Token-level matching & coverage
  if (queryTokens.length > 0) {
    let matchedTokenCount = 0;
    for (const qt of queryTokens) {
      if (nameTokens.includes(qt)) {
        matchedTokenCount += 1;
        score += 160;
      } else if (nameTokens.some(nt => nt.includes(qt) || qt.includes(nt))) {
        matchedTokenCount += 0.8;
        score += 100;
      } else if (aliases.some(a => a.includes(qt))) {
        matchedTokenCount += 0.6;
        score += 70;
      }
    }

    if (matchedTokenCount >= queryTokens.length) {
      score += 650;
    } else if (matchedTokenCount > 0) {
      score += (matchedTokenCount / queryTokens.length) * 300;
    }
  }

  // 5. Category boost if muscleSearchFilter is active
  if (categoryFilter) {
    if (checkCategoryMatch(entry.muscle, categoryFilter)) {
      score += 250;
    }
  }

  // 6. Tier weighting
  const tierWeights: Record<string, number> = {
    'S Tier': 50,
    'A+ Tier': 40,
    'A Tier': 30,
    'B Tier': 15,
    'C Tier': 5,
  };
  score += tierWeights[entry.tier || ''] || 0;

  return score;
}

export function AddExerciseModal({ visible, onClose, onAdd, planDay }: Props) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeAddExerciseStyles(colors, isDark), [colors, isDark]);
  const { userGymPlan, updateMasterPlan, gymLogs } = useWellnessData();

  // Ensure catalogue is built once and immediately ready
  const [catalogueReady, setCatalogueReady] = useState(!!_exerciseCatalogue);
  useEffect(() => {
    if (!_exerciseCatalogue) {
      getExerciseCatalogue(); // populates lazy singleton
      getCategoryMap();
      setCatalogueReady(true);
    }
  }, []);

  // Form state
  const [name, setName] = useState('');
  const [sets, setSets] = useState('3');
  const [reps, setReps] = useState('8-12');
  const [restTime, setRestTime] = useState('60');
  const [muscle, setMuscle] = useState('None');
  const [videoLink, setVideoLink] = useState('');
  const [savePermanently, setSavePermanently] = useState(false);
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [muscleSearchFilter, setMuscleSearchFilter] = useState<string | null>(null);

  // AI resolver state
  const [aiSuggestion, setAiSuggestion] = useState<AIExerciseInfo | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const aiDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 50ms snappy debounced search query
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => setDebouncedQuery(name.trim().toLowerCase()), 50);
    return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); };
  }, [name]);

  // 0ms Instant Search & Filter Memo (Closest Word & Relevance Ranking)
  const suggestions = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    const catalogue = getExerciseCatalogue();
    const categoryMap = getCategoryMap();

    // If no text query, show category filtered exercises
    if (!q) {
      if (muscleSearchFilter) {
        return categoryMap[muscleSearchFilter] || [];
      }
      return [];
    }

    const cleanedQuery = cleanSearchString(q);
    const queryTokens = getQueryTokens(q);
    const normQuery = q.replace(/[^a-z0-9]/g, '');

    const scored: { item: ExerciseCatalogEntry; score: number }[] = [];

    for (const entry of catalogue) {
      const score = scoreExerciseMatch(
        entry,
        q,
        cleanedQuery,
        queryTokens,
        normQuery,
        muscleSearchFilter
      );
      if (score > 0) {
        scored.push({ item: entry, score });
      }
    }

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.item.name.length !== b.item.name.length) {
        return a.item.name.length - b.item.name.length;
      }
      return a.item.name.localeCompare(b.item.name);
    });

    return scored.map(s => s.item);
  }, [debouncedQuery, muscleSearchFilter, catalogueReady]);

  const getLastSessionSets = (exerciseId: string, exerciseName: string) => {
    if (!gymLogs) return null;
    const targetKey = normalizeExerciseKey(exerciseName);
    const logsWithEx = [...gymLogs]
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      .filter(log => Array.isArray(log.exercises) && log.exercises.some((ex: any) =>
        (ex.exerciseId && ex.exerciseId === exerciseId) ||
        (ex.name && normalizeExerciseKey(ex.name) === targetKey)
      ));
    if (logsWithEx.length === 0) return null;
    const latestLog = logsWithEx[0];
    const ex = latestLog.exercises!.find((ex: any) =>
      (ex.exerciseId && ex.exerciseId === exerciseId) ||
      (ex.name && normalizeExerciseKey(ex.name) === targetKey)
    );
    return ex?.setsLog ?? null;
  };

  const handleSelectSuggestion = (entry: ExerciseCatalogEntry) => {
    setName(entry.name);
    setSets(String(entry.targetSets));
    setReps(entry.targetReps);
    setRestTime(String(entry.restTimeSecs));
    setMuscle(entry.muscle || 'None');
    setVideoLink(entry.videoId || '');
    setSelectedExerciseId(entry.id);
    setShowDropdown(false);
    setAiSuggestion(null);
  };

  const handleSelectAiSuggestion = async (ai: AIExerciseInfo) => {
    const stableId = `ai_${ai.canonicalName.replace(/\s+/g, '_').toLowerCase()}`;
    setName(ai.canonicalName);
    setSets(String(ai.targetSets));
    setReps(ai.targetReps);
    setRestTime(String(ai.restTimeSecs));
    setMuscle(ai.muscle || 'None');
    setSelectedExerciseId(stableId);
    setShowDropdown(false);
    setAiSuggestion(null);

    const catalogueEntry: ExerciseCatalogEntry = {
      id: stableId,
      name: ai.canonicalName,
      muscle: ai.muscle || 'Mixed',
      targetSets: ai.targetSets,
      targetReps: ai.targetReps,
      restTimeSecs: ai.restTimeSecs,
      videoId: '',
    };
    persistCustomExercise(catalogueEntry);
    const nameKey = ai.canonicalName.toLowerCase().trim();
    const catalogue = getExerciseCatalogue();
    if (!catalogue.some(e => e.name.toLowerCase().trim() === nameKey)) {
      catalogue.push(catalogueEntry);
    }

    // Resolve video in background without blocking selection UI
    autoResolveExerciseVideoId(ai.youtubeSearchQuery || ai.canonicalName).then(videoId => {
      if (videoId) {
        setVideoLink(videoId);
        persistCustomExercise({ ...catalogueEntry, videoId });
      }
    }).catch(() => {});
  };

  const executeAiSearch = useCallback(async (query: string) => {
    const trimmed = query.trim();
    if (!trimmed || trimmed.length < 2) return;

    setAiLoading(true);
    setAiSuggestion(null);

    try {
      const result = await aiResolveExercise(trimmed);
      if (result) {
        setAiSuggestion(result);
      } else {
        const fallbackMuscle = resolveExerciseTargetMuscle(trimmed).canonicalGroup || 'Mixed';
        setAiSuggestion({
          canonicalName: trimmed.charAt(0).toUpperCase() + trimmed.slice(1),
          muscle: fallbackMuscle,
          targetSets: 3,
          targetReps: '8–12',
          restTimeSecs: 60,
          youtubeSearchQuery: trimmed,
        });
      }
    } catch (_) {
      const fallbackMuscle = resolveExerciseTargetMuscle(trimmed).canonicalGroup || 'Mixed';
      setAiSuggestion({
        canonicalName: trimmed.charAt(0).toUpperCase() + trimmed.slice(1),
        muscle: fallbackMuscle,
        targetSets: 3,
        targetReps: '8–12',
        restTimeSecs: 60,
        youtubeSearchQuery: trimmed,
      });
    } finally {
      setAiLoading(false);
    }
  }, []);

  const handleNameChange = (text: string) => {
    setName(text);
    setSelectedExerciseId(null);
    setShowDropdown(true);
    setAiSuggestion(null);
    setAiLoading(false);

    if (aiDebounceRef.current) {
      clearTimeout(aiDebounceRef.current);
      aiDebounceRef.current = null;
    }
  };

  // Auto-identify with AI ONLY when there are genuinely ZERO matching exercises in the local database
  useEffect(() => {
    const q = debouncedQuery.trim();
    if (!q || q.length < 3 || suggestions.length > 0) {
      if (aiDebounceRef.current) {
        clearTimeout(aiDebounceRef.current);
        aiDebounceRef.current = null;
      }
      setAiLoading(false);
      return;
    }

    // Only if local database has 0 matches and user paused typing
    if (aiDebounceRef.current) clearTimeout(aiDebounceRef.current);
    aiDebounceRef.current = setTimeout(() => {
      executeAiSearch(q);
    }, 1200);

    return () => {
      if (aiDebounceRef.current) {
        clearTimeout(aiDebounceRef.current);
        aiDebounceRef.current = null;
      }
    };
  }, [debouncedQuery, suggestions.length, executeAiSearch]);

  const handleAddExercise = () => {
    if (!name.trim()) return;

    const parsedSets = parseInt(sets, 10) || 3;
    const parsedRest = parseInt(restTime, 10) || 60;
    let userVideoId = extractVideoId(videoLink.trim());

    // Instant 0ms dictionary lookup for 400+ known exercises
    if (!userVideoId) {
      const sanitized = sanitizeName(name.trim());
      if (KNOWN_EXERCISE_VIDEOS[sanitized]) {
        userVideoId = KNOWN_EXERCISE_VIDEOS[sanitized];
      }
    }

    const exId = selectedExerciseId ?? `custom_${Date.now()}`;
    const lastSets = getLastSessionSets(exId, name.trim());
    const rawMuscle = muscle === 'None' ? '' : muscle.trim();
    const resolvedMuscle = resolveExerciseTargetMuscle(name.trim(), rawMuscle).targetMuscle;

    const newEx: GymExerciseLog = {
      exerciseId: exId,
      name: name.trim(),
      muscle: resolvedMuscle || rawMuscle,
      targetSets: parsedSets,
      targetReps: reps.trim(),
      videoId: userVideoId || '',
      restTimeSecs: parsedRest,
      lastSessionSets: lastSets ?? undefined,
      setsLog: Array.from({ length: parsedSets }, (_, i) => {
        const prev = lastSets?.[i];
        return {
          setNumber: i + 1,
          reps: prev?.reps ?? null,
          weight: prev?.weight ?? null,
          completed: false,
        };
      }),
      isCustom: !selectedExerciseId || exId.startsWith('custom_'),
    };

    // Instant UI insertion without waiting for network
    onAdd(newEx);

    if (savePermanently && planDay) {
      const currentMasterDay = getCustomPlanDay(userGymPlan?.customDays, planDay.dayIndex) || planDay;
      const updatedExercises = [...currentMasterDay.exercises];
      if (!updatedExercises.some((e: any) => e.id === newEx.exerciseId)) {
        updatedExercises.push({
          id: newEx.exerciseId,
          name: newEx.name,
          muscle: newEx.muscle,
          targetSets: newEx.targetSets,
          targetReps: newEx.targetReps,
          videoId: newEx.videoId,
          restTimeSecs: newEx.restTimeSecs,
        });
        updateMasterPlan(planDay.dayIndex, { ...currentMasterDay, exercises: updatedExercises }).catch(handleSyncError);
      }
    }

    resetAndClose();
  };

  const resetAndClose = () => {
    setName('');
    setSets('3');
    setReps('8-12');
    setRestTime('60');
    setMuscle('None');
    setVideoLink('');
    setSavePermanently(false);
    setSelectedExerciseId(null);
    setShowDropdown(false);
    setAiSuggestion(null);
    setAiLoading(false);
    setMuscleSearchFilter(null);
    if (aiDebounceRef.current) clearTimeout(aiDebounceRef.current);
    onClose();
  };

  const hasLastSession = selectedExerciseId ? !!getLastSessionSets(selectedExerciseId, name) : false;

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent onRequestClose={resetAndClose}>
      <View style={styles.modalBg}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={resetAndClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalContent}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Add Exercise</Text>
            <TouchableOpacity onPress={resetAndClose} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scrollArea}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Filter by Muscle chips */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 6, paddingBottom: 8 }}
              style={{ marginBottom: 8 }}
            >
              {['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Abs'].map(m => {
                const isActive = muscleSearchFilter === m;
                return (
                  <TouchableOpacity
                    key={m}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 14,
                      borderWidth: 1,
                      backgroundColor: isActive ? 'rgba(165,153,255,0.18)' : 'rgba(255,255,255,0.05)',
                      borderColor: isActive ? 'rgba(165,153,255,0.6)' : 'rgba(255,255,255,0.1)',
                    }}
                    onPress={() => {
                      const next = muscleSearchFilter === m ? null : m;
                      setMuscleSearchFilter(next);
                      setShowDropdown(true);
                    }}
                  >
                    <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 11, color: isActive ? '#a599ff' : colors.textMuted }}>
                      {m}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Exercise Name with Inline Search Dropdown */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>EXERCISE NAME *</Text>
              <View style={{ position: 'relative' }}>
                <View style={styles.searchRow}>
                  <Ionicons name="search-outline" size={16} color={colors.textTertiary} style={{ marginRight: 8 }} />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search exercises..."
                    placeholderTextColor={colors.textTertiary}
                    value={name}
                    onChangeText={handleNameChange}
                    onFocus={() => setShowDropdown(true)}
                    autoCorrect={false}
                    autoCapitalize="words"
                    returnKeyType="done"
                  />
                  {name.length > 0 && (
                    <TouchableOpacity
                      onPress={() => { setName(''); setSelectedExerciseId(null); setShowDropdown(false); }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="close-circle" size={16} color={colors.textTertiary} />
                    </TouchableOpacity>
                  )}
                </View>

                {/* Dropdown component */}
                <ExerciseSearchDropdown
                  showDropdown={showDropdown}
                  suggestions={suggestions}
                  aiLoading={aiLoading}
                  aiSuggestion={aiSuggestion}
                  onSelectSuggestion={handleSelectSuggestion}
                  onSelectAiSuggestion={handleSelectAiSuggestion}
                  onTriggerAiSearch={() => executeAiSearch(name)}
                  searchQuery={name}
                  colors={colors}
                  styles={styles}
                />
              </View>

              {hasLastSession && (
                <View style={styles.lastSessionBadge}>
                  <Ionicons name="time-outline" size={11} color={colors.accentPrimary} />
                  <Text style={styles.lastSessionText}>Last session data pre-loaded</Text>
                </View>
              )}
            </View>

            {/* Custom fields: Sets/Reps/Rest, Muscle Pills, Video, Master Split */}
            <ExerciseCustomFields
              sets={sets}
              setSets={setSets}
              reps={reps}
              setReps={setReps}
              restTime={restTime}
              setRestTime={setRestTime}
              muscle={muscle}
              setMuscle={setMuscle}
              videoLink={videoLink}
              setVideoLink={setVideoLink}
              savePermanently={savePermanently}
              setSavePermanently={setSavePermanently}
              planDay={planDay}
              colors={colors}
              styles={styles}
            />

            {/* Submit CTA */}
            <TouchableOpacity
              style={[styles.submitBtn, !name.trim() && styles.submitBtnDisabled]}
              disabled={!name.trim()}
              onPress={handleAddExercise}
            >
              <Ionicons name="add" size={18} color={isDark ? '#000' : '#fff'} style={{ marginRight: 6 }} />
              <Text style={styles.submitBtnText}>Add Exercise</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

export default AddExerciseModal;
