/**
 * AddExerciseModal • ZenTrack Mobile (v2)
 *
 * Fast exercise catalogue search, auto-fill, custom exercise creation,
 * and AI fallback integration.
 */
import React, { useState, useMemo, useRef, useEffect } from 'react';
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
    if (!key || seen.has(key)) return;
    seen.add(key);
    if (Array.isArray(e.aliases)) {
      for (const a of e.aliases) {
        const aKey = normalizeExerciseKey(a);
        if (aKey) seen.add(aKey);
      }
    }
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
      aliases: ex.secondaryMuscles,
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

async function loadCustomExercisesToCatalogue(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(CUSTOM_EXERCISES_KEY);
    if (!raw) return;
    const customs: ExerciseCatalogEntry[] = JSON.parse(raw);
    const catalogue = getExerciseCatalogue();
    for (const ex of customs) {
      const key = ex.name.toLowerCase().trim();
      if (!catalogue.some(e => e.name.toLowerCase().trim() === key)) {
        catalogue.push(ex);
      }
    }
  } catch (_) {}
}

async function persistCustomExercise(entry: ExerciseCatalogEntry): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(CUSTOM_EXERCISES_KEY);
    const existing: ExerciseCatalogEntry[] = raw ? JSON.parse(raw) : [];
    const key = entry.name.toLowerCase().trim();
    if (!existing.some(e => e.name.toLowerCase().trim() === key)) {
      existing.push(entry);
      await AsyncStorage.setItem(CUSTOM_EXERCISES_KEY, JSON.stringify(existing));
    }
  } catch (_) {}
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

export function AddExerciseModal({ visible, onClose, onAdd, planDay }: Props) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeAddExerciseStyles(colors, isDark), [colors, isDark]);
  const { userGymPlan, updateMasterPlan, gymLogs } = useWellnessData();

  // Ensure catalogue is built lazily on first open (off the module parse critical path)
  const [catalogueReady, setCatalogueReady] = useState(!!_exerciseCatalogue);
  useEffect(() => {
    if (!_exerciseCatalogue) {
      // Build off the interaction critical path so modal opens instantly
      const { InteractionManager } = require('react-native');
      const handle = InteractionManager.runAfterInteractions(() => {
        getExerciseCatalogue(); // populates lazy singleton
        getCategoryMap();
        setCatalogueReady(true);
      });
      return () => handle.cancel();
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

  // 150ms debounced search query — prevents the 1600-item filter from running
  // on every keystroke. Filter only fires when user pauses typing.
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => setDebouncedQuery(name.trim().toLowerCase()), 150);
    return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); };
  }, [name]);

  // 0ms Instant Search & Filter Memo (gated on debouncedQuery)
  const suggestions = useMemo(() => {
    const q = debouncedQuery;
    const catalogue = getExerciseCatalogue();
    const categoryMap = getCategoryMap();

    if (muscleSearchFilter && !q) {
      return categoryMap[muscleSearchFilter] || [];
    }
    if (!q || q.length < 1) return [];

    const baseList = muscleSearchFilter ? (categoryMap[muscleSearchFilter] || catalogue) : catalogue;
    const searchFiltered = baseList.filter(e => {
      return (
        e.name.toLowerCase().includes(q) ||
        (e.aliases && e.aliases.some(alias => alias.toLowerCase().includes(q)))
      );
    });
    return searchFiltered;
  }, [debouncedQuery, muscleSearchFilter]);

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

  const handleNameChange = (text: string) => {
    setName(text);
    setSelectedExerciseId(null);
    setShowDropdown(true);
    setAiSuggestion(null);

    if (aiDebounceRef.current) clearTimeout(aiDebounceRef.current);

    if (text.trim().length >= 3) {
      aiDebounceRef.current = setTimeout(async () => {
        const q = text.trim().toLowerCase();
        const cat = getExerciseCatalogue();
        const hasMatches = cat.some(e =>
          e.name.toLowerCase().includes(q) ||
          (e.aliases && e.aliases.some((a: string) => a.toLowerCase().includes(q)))
        );

        if (!hasMatches) {
          setAiLoading(true);
          try {
            const result = await aiResolveExercise(text.trim());
            if (result) {
              setAiSuggestion(result);
            } else {
              setAiSuggestion({
                canonicalName: text.trim(),
                muscle: 'Mixed',
                targetSets: 3,
                targetReps: '8-12',
                restTimeSecs: 60,
                youtubeSearchQuery: text.trim()
              });
            }
          } catch (_) {
            setAiSuggestion({
              canonicalName: text.trim(),
              muscle: 'Mixed',
              targetSets: 3,
              targetReps: '8-12',
              restTimeSecs: 60,
              youtubeSearchQuery: text.trim()
            });
          } finally {
            setAiLoading(false);
          }
        }
      }, 900);
    }
  };

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
