/**
 * AddExerciseModal • ZenTrack Mobile (v2)
 *
 * Fast exercise catalogue search, auto-fill, custom exercise creation,
 * and AI fallback integration.
 */
import React, { useState, useMemo, useRef } from 'react';
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
import { aiResolveExercise, AIExerciseInfo } from '../../services/geminiProxy';
import { GYM_PLAN } from '../../data/gymPlan';
import { EXERCISE_DATABASE } from '../../data/exerciseDatabase';
import { handleSyncError } from '../../utils/errorUtils';

// Extracted Subcomponents & Styles
import { makeAddExerciseStyles } from './addExerciseStyles';
import ExerciseSearchDropdown, { ExerciseCatalogEntry } from './ExerciseSearchDropdown';
import ExerciseCustomFields from './ExerciseCustomFields';

/** Build a full deduplicated exercise catalogue from our plan + database. */
function buildCatalogue(): ExerciseCatalogEntry[] {
  const seen = new Set<string>();
  const result: ExerciseCatalogEntry[] = [];

  const add = (e: ExerciseCatalogEntry) => {
    const key = e.name.toLowerCase().trim();
    if (seen.has(key)) return;
    seen.add(key);
    result.push(e);
  };

  // GYM_PLAN exercises (highest priority • have full metadata)
  for (const day of GYM_PLAN) {
    for (const ex of day.exercises) {
      add({
        id: ex.id,
        name: ex.name,
        muscle: ex.muscle ?? 'Mixed',
        targetSets: ex.targetSets ?? 3,
        targetReps: ex.targetReps ?? '8-12',
        restTimeSecs: (ex as any).restTimeSecs ?? 60,
        videoId: ex.videoId ?? '',
      });
    }
  }

  const MUSCLE_DEFAULTS: Record<string, { sets: number; reps: string; rest: number }> = {
    Chest: { sets: 3, reps: '8-12', rest: 90 },
    Back: { sets: 3, reps: '8-12', rest: 90 },
    Shoulders: { sets: 3, reps: '10-15', rest: 75 },
    'Side Delts': { sets: 3, reps: '12-15', rest: 60 },
    'Rear Delts': { sets: 3, reps: '12-15', rest: 60 },
    Triceps: { sets: 3, reps: '10-12', rest: 60 },
    Biceps: { sets: 3, reps: '10-12', rest: 60 },
    Brachialis: { sets: 3, reps: '10-12', rest: 60 },
    Quads: { sets: 3, reps: '8-12', rest: 90 },
    'Quads/Glutes': { sets: 3, reps: '8-12', rest: 90 },
    Hamstrings: { sets: 3, reps: '8-12', rest: 90 },
    'Glutes/Hams': { sets: 3, reps: '10-15', rest: 75 },
    Calves: { sets: 4, reps: '12-15', rest: 45 },
    Soleus: { sets: 4, reps: '12-15', rest: 45 },
    Abs: { sets: 3, reps: '12-15', rest: 45 },
    Obliques: { sets: 3, reps: '12-15', rest: 45 },
    Forearms: { sets: 3, reps: '15-20', rest: 45 },
    Mixed: { sets: 3, reps: '8-12', rest: 60 },
  };

  // EXERCISE_DATABASE integration
  for (const dbEntry of EXERCISE_DATABASE) {
    let defaults = MUSCLE_DEFAULTS[dbEntry.muscle];
    if (!defaults) {
      if (dbEntry.muscle.includes('Chest')) defaults = MUSCLE_DEFAULTS['Chest'];
      else if (dbEntry.muscle.includes('Back') || dbEntry.muscle.includes('Lats')) defaults = MUSCLE_DEFAULTS['Back'];
      else if (dbEntry.muscle.includes('Delt')) defaults = MUSCLE_DEFAULTS['Shoulders'];
      else if (dbEntry.muscle.includes('Tricep')) defaults = MUSCLE_DEFAULTS['Triceps'];
      else if (dbEntry.muscle.includes('Bicep')) defaults = MUSCLE_DEFAULTS['Biceps'];
      else if (dbEntry.muscle.includes('Quad')) defaults = MUSCLE_DEFAULTS['Quads'];
      else if (dbEntry.muscle.includes('Glute') || dbEntry.muscle.includes('Ham')) defaults = MUSCLE_DEFAULTS['Hamstrings'];
      else if (dbEntry.muscle.includes('Calf')) defaults = MUSCLE_DEFAULTS['Calves'];
      else if (dbEntry.muscle.includes('Abs') || dbEntry.muscle.includes('Oblique')) defaults = MUSCLE_DEFAULTS['Abs'];
      else if (dbEntry.muscle.includes('Forearm')) defaults = MUSCLE_DEFAULTS['Forearms'];
      else defaults = MUSCLE_DEFAULTS['Mixed'];
    }

    add({
      id: dbEntry.id,
      name: dbEntry.name,
      muscle: dbEntry.muscle,
      targetSets: defaults.sets,
      targetReps: defaults.reps,
      restTimeSecs: defaults.rest,
      videoId: (dbEntry as any).videoId || '',
      aliases: dbEntry.aliases,
    } as any);
  }

  return result;
}

const EXERCISE_CATALOGUE = buildCatalogue();
const CUSTOM_EXERCISES_KEY = '@zentrack_custom_exercises';

async function loadCustomExercisesToCatalogue(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(CUSTOM_EXERCISES_KEY);
    if (!raw) return;
    const customs: ExerciseCatalogEntry[] = JSON.parse(raw);
    for (const ex of customs) {
      const key = ex.name.toLowerCase().trim();
      if (!EXERCISE_CATALOGUE.some(e => e.name.toLowerCase().trim() === key)) {
        EXERCISE_CATALOGUE.push(ex);
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

loadCustomExercisesToCatalogue();

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

export function AddExerciseModal({ visible, onClose, onAdd, planDay }: Props) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeAddExerciseStyles(colors, isDark), [colors, isDark]);
  const { userGymPlan, updateMasterPlan, gymLogs } = useWellnessData();

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
  const [isAdding, setIsAdding] = useState(false);
  const aiDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Search & filter
  const suggestions = useMemo(() => {
    const q = name.trim().toLowerCase();

    const checkMuscleMatch = (exerciseMuscle: string, filterName: string | null) => {
      if (!filterName) return true;
      const t = exerciseMuscle.toLowerCase();
      const f = filterName.toLowerCase();
      if (f === 'legs') return t.includes('quad') || t.includes('glute') || t.includes('ham') || t.includes('calf') || t.includes('soleus');
      if (f === 'arms') return t.includes('bicep') || t.includes('tricep') || t.includes('brach') || t.includes('forearm');
      if (f === 'abs') return t.includes('abs') || t.includes('oblique') || t.includes('core');
      if (f === 'back') return t.includes('back') || t.includes('lat');
      if (f === 'shoulders') return t.includes('shoulder') || t.includes('delt');
      return t.includes(f);
    };

    if (muscleSearchFilter && !q) {
      return EXERCISE_CATALOGUE
        .filter(e => checkMuscleMatch(e.muscle, muscleSearchFilter))
        .slice(0, 30);
    }
    if (!q || q.length < 1) return [];

    return EXERCISE_CATALOGUE
      .filter(e => {
        const nameMatch = e.name.toLowerCase().includes(q) || (e.aliases && e.aliases.some(alias => alias.toLowerCase().includes(q)));
        const muscleMatch = checkMuscleMatch(e.muscle, muscleSearchFilter);
        return nameMatch && muscleMatch;
      })
      .slice(0, 30);
  }, [name, muscleSearchFilter]);

  const getLastSessionSets = (exerciseId: string, exerciseName: string) => {
    if (!gymLogs) return null;
    const logsWithEx = [...gymLogs]
      .sort((a, b) => b.date.localeCompare(a.date))
      .filter(log => log.exercises?.some((ex: any) =>
        ex.exerciseId === exerciseId || ex.name?.toLowerCase() === exerciseName.toLowerCase()
      ));
    if (logsWithEx.length === 0) return null;
    const latestLog = logsWithEx[0];
    const ex = latestLog.exercises!.find((ex: any) =>
      ex.exerciseId === exerciseId || ex.name?.toLowerCase() === exerciseName.toLowerCase()
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
    if (!EXERCISE_CATALOGUE.some(e => e.name.toLowerCase().trim() === nameKey)) {
      EXERCISE_CATALOGUE.push(catalogueEntry);
    }

    const videoId = await autoResolveExerciseVideoId(ai.youtubeSearchQuery || ai.canonicalName);
    if (videoId) {
      setVideoLink(videoId);
      persistCustomExercise({ ...catalogueEntry, videoId });
    }
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
        const hasMatches = EXERCISE_CATALOGUE.some(e =>
          e.name.toLowerCase().includes(q) ||
          (e.aliases && e.aliases.some(a => a.toLowerCase().includes(q)))
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

  const handleAddExercise = async () => {
    if (!name.trim()) return;

    const parsedSets = parseInt(sets, 10) || 3;
    const parsedRest = parseInt(restTime, 10) || 60;
    let userVideoId = extractVideoId(videoLink.trim());

    setIsAdding(true);
    try {
      if (!userVideoId) {
        userVideoId = (await autoResolveExerciseVideoId(name.trim())) || '';
      }

      const exId = selectedExerciseId ?? `custom_${Date.now()}`;
      const lastSets = getLastSessionSets(exId, name.trim());

      const newEx: GymExerciseLog = {
        exerciseId: exId,
        name: name.trim(),
        muscle: muscle === 'None' ? '' : muscle.trim(),
        targetSets: parsedSets,
        targetReps: reps.trim(),
        videoId: userVideoId,
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
          await updateMasterPlan(planDay.dayIndex, { ...currentMasterDay, exercises: updatedExercises }).catch(handleSyncError);
        }
      }

      resetAndClose();
    } catch (err) {
      console.error('Error adding exercise:', err);
    } finally {
      setIsAdding(false);
    }
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
    <Modal visible={visible} animationType="slide" transparent onRequestClose={resetAndClose}>
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
              style={[styles.submitBtn, (!name.trim() || isAdding) && styles.submitBtnDisabled]}
              disabled={!name.trim() || isAdding}
              onPress={handleAddExercise}
            >
              {isAdding ? (
                <ActivityIndicator color={isDark ? '#000' : '#fff'} size="small" />
              ) : (
                <>
                  <Ionicons name="add" size={18} color={isDark ? '#000' : '#fff'} style={{ marginRight: 6 }} />
                  <Text style={styles.submitBtnText}>Add Exercise</Text>
                </>
              )}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

export default AddExerciseModal;
