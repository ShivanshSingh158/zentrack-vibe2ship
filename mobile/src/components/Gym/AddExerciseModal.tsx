/**
 * AddExerciseModal GÇö ZenTrack Mobile (v2)
 *
 * UX: Type to search GåÆ compact inline dropdown (max 5 rows) GåÆ tap to auto-fill
 * all fields (sets, reps, rest, muscle, videoId) + last-session weight/reps.
 */

import React, { useState, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, TextInput,
  ScrollView, KeyboardAvoidingView, Platform, Switch, FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONT_FAMILY, SPACE, RADIUS, FONT_SIZE } from '../../theme/tokens';
import { GymExerciseLog, GymPlanDay, GymPlanExercise } from '../../types/gym.types';
import { useMobileData } from '../../contexts/MobileDataContext';
import { MUSCLE_COLORS, resolveMuscleColor, hexToRgba } from '../../utils/gymUtils';
import { useTheme } from '../../contexts/ThemeContext';
import { getCustomPlanDay } from '../../hooks/useGymLog';
import { autoResolveExerciseVideoId } from '../../services/exerciseVideoResolver';
import { aiResolveExercise, AIExerciseInfo } from '../../services/geminiProxy';
import { GYM_PLAN, EXERCISE_ALTERNATIVES } from '../../data/gymPlan';
import { handleSyncError } from '../../utils/errorUtils';


// GöÇGöÇ All exercises: flatten GYM_PLAN + EXERCISE_ALTERNATIVES into a deduplicated catalogue GöÇGöÇ

interface ExerciseCatalogEntry {
  id: string;
  name: string;
  muscle: string;
  targetSets: number;
  targetReps: string;
  restTimeSecs: number;
  videoId: string;
}

/** Build a full deduplicated exercise catalogue from our plan + alternatives. */
function buildCatalogue(): ExerciseCatalogEntry[] {
  const seen = new Set<string>();
  const result: ExerciseCatalogEntry[] = [];

  const add = (e: ExerciseCatalogEntry) => {
    const key = e.name.toLowerCase().trim();
    if (seen.has(key)) return;
    seen.add(key);
    result.push(e);
  };

  // GYM_PLAN exercises (highest priority GÇö have full metadata)
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

  // EXERCISE_ALTERNATIVES (may not have full metadata GÇö fill defaults)
  const MUSCLE_DEFAULTS: Record<string, { sets: number; reps: string; rest: number }> = {
    Chest: { sets: 3, reps: '8GÇô12', rest: 90 },
    Back: { sets: 3, reps: '8GÇô12', rest: 90 },
    Shoulders: { sets: 3, reps: '10GÇô15', rest: 75 },
    'Side Delts': { sets: 3, reps: '12GÇô15', rest: 60 },
    'Rear Delts': { sets: 3, reps: '12GÇô15', rest: 60 },
    Triceps: { sets: 3, reps: '10GÇô12', rest: 60 },
    Biceps: { sets: 3, reps: '10GÇô12', rest: 60 },
    Brachialis: { sets: 3, reps: '10GÇô12', rest: 60 },
    Quads: { sets: 3, reps: '8GÇô12', rest: 90 },
    'Quads/Glutes': { sets: 3, reps: '8GÇô12', rest: 90 },
    Hamstrings: { sets: 3, reps: '8GÇô12', rest: 90 },
    'Glutes/Hams': { sets: 3, reps: '10GÇô15', rest: 75 },
    Calves: { sets: 4, reps: '12GÇô15', rest: 45 },
    Soleus: { sets: 4, reps: '12GÇô15', rest: 45 },
    Abs: { sets: 3, reps: '12GÇô15', rest: 45 },
    Obliques: { sets: 3, reps: '12GÇô15', rest: 45 },
    Forearms: { sets: 3, reps: '15GÇô20', rest: 45 },
    Mixed: { sets: 3, reps: '8GÇô12', rest: 60 },
  };

  for (const [muscle, entries] of Object.entries(EXERCISE_ALTERNATIVES)) {
    const defaults = MUSCLE_DEFAULTS[muscle] ?? { sets: 3, reps: '8GÇô12', rest: 60 };
    for (const e of entries) {
      add({
        id: `alt_${e.name.replace(/\s+/g, '_').toLowerCase()}`,
        name: e.name,
        muscle,
        targetSets: defaults.sets,
        targetReps: defaults.reps,
        restTimeSecs: defaults.rest,
        videoId: e.videoId ?? '',
      });
    }
  }

  return result;
}

const EXERCISE_CATALOGUE = buildCatalogue();

const MUSCLES_LIST = ['None', ...Object.keys(MUSCLE_COLORS)];

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

export function AddExerciseModal({ visible, onClose, onAdd, planDay, existingExerciseIds = [] }: Props) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const { userGymPlan, updateMasterPlan, gymLogs } = useMobileData();

  // GöÇGöÇ Form state GöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇ
  const [name, setName] = useState('');
  const [sets, setSets] = useState('3');
  const [reps, setReps] = useState('8-12');
  const [restTime, setRestTime] = useState('60');
  const [muscle, setMuscle] = useState('None');
  const [videoLink, setVideoLink] = useState('');
  const [savePermanently, setSavePermanently] = useState(false);
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  // G3: muscle search filter chips
  const [muscleSearchFilter, setMuscleSearchFilter] = useState<string | null>(null);

  // GöÇGöÇ AI resolver state GöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇ
  const [aiSuggestion, setAiSuggestion] = useState<AIExerciseInfo | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const aiDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // GöÇGöÇ Search & filter GöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇ
  const suggestions = useMemo(() => {
    const q = name.trim().toLowerCase();
    // G3: If muscle filter active, show all exercises for that muscle (up to 30)
    if (muscleSearchFilter && !q) {
      return EXERCISE_CATALOGUE
        .filter(e => e.muscle.toLowerCase().includes(muscleSearchFilter.toLowerCase()))
        .slice(0, 30);
    }
    if (!q || q.length < 1) return [];
    return EXERCISE_CATALOGUE
      .filter(e => {
        const nameMatch = e.name.toLowerCase().includes(q);
        const muscleMatch = !muscleSearchFilter || e.muscle.toLowerCase().includes(muscleSearchFilter.toLowerCase());
        return nameMatch && muscleMatch;
      })
      .slice(0, 30);
  }, [name, muscleSearchFilter]);

  // GöÇGöÇ Last-session lookup GöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇ
  const getLastSessionSets = (exerciseId: string, exerciseName: string) => {
    if (!gymLogs) return null;
    // Find all logs that have this exercise, sorted newest first
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

  // GöÇGöÇ Select from catalogue dropdown GåÆ auto-fill GöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇ
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

  // GöÇGöÇ Select from AI suggestion GåÆ auto-fill + video lookup GöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇ
  const handleSelectAiSuggestion = async (ai: AIExerciseInfo) => {
    setName(ai.canonicalName);
    setSets(String(ai.targetSets));
    setReps(ai.targetReps);
    setRestTime(String(ai.restTimeSecs));
    setMuscle(ai.muscle || 'None');
    setSelectedExerciseId(null); // custom ID will be generated on add
    setShowDropdown(false);
    setAiSuggestion(null);
    // Resolve YouTube video in background
    const videoId = await autoResolveExerciseVideoId(ai.youtubeSearchQuery || ai.canonicalName);
    if (videoId) setVideoLink(videoId);
  };

  const handleNameChange = (text: string) => {
    setName(text);
    setSelectedExerciseId(null);
    setShowDropdown(true);
    setAiSuggestion(null);

    // Cancel any pending AI call
    if (aiDebounceRef.current) clearTimeout(aiDebounceRef.current);

    // Only trigger AI when there's text and no catalogue match
    if (text.trim().length >= 3) {
      aiDebounceRef.current = setTimeout(async () => {
        // Check if catalogue already has matches GÇö if yes, no need for AI
        const q = text.trim().toLowerCase();
        const hasMatches = EXERCISE_CATALOGUE.some(e => e.name.toLowerCase().includes(q));
        if (!hasMatches) {
          setAiLoading(true);
          try {
            const result = await aiResolveExercise(text.trim());
            // Only show if user hasn't already selected or cleared the input
            setAiSuggestion(result);
          } catch (_) {
            // silently fail
          } finally {
            setAiLoading(false);
          }
        }
      }, 900); // 900ms debounce
    }
  };

  // GöÇGöÇ Add exercise GöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇ
  const handleAddExercise = async () => {
    if (!name.trim()) return;

    const parsedSets = parseInt(sets, 10) || 3;
    const parsedRest = parseInt(restTime, 10) || 60;

    let userVideoId = extractVideoId(videoLink.trim());
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
    setMuscleSearchFilter(null); // G3
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
          {/* GöÇGöÇ Header GöÇGöÇ */}
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
            {/* G3: Filter by Muscle chips */}
            <ScrollView
              horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 6, paddingBottom: 8 }}
              style={{ marginBottom: 8 }}
            >
              {['Chest','Back','Legs','Shoulders','Arms','Biceps','Triceps','Core','Abs'].map(m => {
                const isActive = muscleSearchFilter === m;
                return (
                  <TouchableOpacity
                    key={m}
                    style={{
                      paddingHorizontal: 12, paddingVertical: 6,
                      borderRadius: 14, borderWidth: 1,
                      backgroundColor: isActive ? 'rgba(165,153,255,0.18)' : 'rgba(255,255,255,0.05)',
                      borderColor: isActive ? 'rgba(165,153,255,0.6)' : 'rgba(255,255,255,0.1)',
                    }}
                    onPress={() => {
                      const next = muscleSearchFilter === m ? null : m;
                      setMuscleSearchFilter(next);
                      setShowDropdown(true);
                    }}
                  >
                    <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 11, color: isActive ? '#a599ff' : colors.textMuted }}>{m}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* GöÇGöÇ Exercise Name with Inline Search Dropdown GöÇGöÇ */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>EXERCISE NAME *</Text>
              <View style={{ position: 'relative' }}>
                <View style={styles.searchRow}>
                  <Ionicons name="search-outline" size={16} color={colors.textTertiary} style={{ marginRight: 8 }} />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search exercisesGÇª"
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

                {/* GöÇGöÇ Dropdown GöÇGöÇ */}
                {showDropdown && (suggestions.length > 0 || aiLoading || aiSuggestion) && (
                  <View style={styles.dropdown}>
                    {/* Catalogue suggestions */}
                    {suggestions.length > 0 && (
                      <FlatList
                        data={suggestions}
                        keyExtractor={item => item.id}
                        keyboardShouldPersistTaps="handled"
                        showsVerticalScrollIndicator={false}
                        nestedScrollEnabled
                        style={{ maxHeight: 220 }}
                        renderItem={({ item, index }) => {
                          const muscleColor = item.muscle && item.muscle !== 'None'
                            ? resolveMuscleColor(item.muscle)
                            : colors.textTertiary;
                          return (
                            <TouchableOpacity
                              style={[
                                styles.suggestionRow,
                                index !== 0 && styles.suggestionBorder,
                              ]}
                              onPress={() => handleSelectSuggestion(item)}
                              activeOpacity={0.7}
                            >
                              <View style={{ flex: 1 }}>
                                <Text style={styles.suggestionName} numberOfLines={1}>{item.name}</Text>
                                <Text style={[styles.suggestionMeta, { color: muscleColor }]}>
                                  {item.muscle}
                                </Text>
                              </View>
                              <View style={styles.suggestionRight}>
                                <Text style={styles.suggestionSets}>
                                  {item.targetSets}+ù{item.targetReps}
                                </Text>
                                <Ionicons name="return-down-back-outline" size={14} color={colors.textTertiary} />
                              </View>
                            </TouchableOpacity>
                          );
                        }}
                      />
                    )}

                    {/* AI loading shimmer */}
                    {aiLoading && suggestions.length === 0 && (
                      <View style={styles.aiLoadingRow}>
                        <Text style={styles.aiLoadingIcon}>G£¿</Text>
                        <Text style={styles.aiLoadingText}>AI is identifying exerciseGÇª</Text>
                      </View>
                    )}

                    {/* AI suggestion */}
                    {!aiLoading && aiSuggestion && suggestions.length === 0 && (
                      <TouchableOpacity
                        style={styles.aiSuggestionRow}
                        onPress={() => handleSelectAiSuggestion(aiSuggestion)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.aiSuggestionLeft}>
                          <Text style={styles.aiSparkle}>G£¿</Text>
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Text style={styles.aiSuggestionName} numberOfLines={1}>
                                {aiSuggestion.canonicalName}
                              </Text>
                              <View style={styles.aiBadge}>
                                <Text style={styles.aiBadgeText}>AI</Text>
                              </View>
                            </View>
                            <Text style={[styles.suggestionMeta, { color: resolveMuscleColor(aiSuggestion.muscle) }]}>
                              {aiSuggestion.muscle}  GÇó  {aiSuggestion.targetSets}+ù{aiSuggestion.targetReps}  GÇó  {aiSuggestion.restTimeSecs}s rest
                            </Text>
                          </View>
                        </View>
                        <Ionicons name="return-down-back-outline" size={14} color={colors.accentPrimary} />
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>

              {/* Last session badge */}
              {hasLastSession && (
                <View style={styles.lastSessionBadge}>
                  <Ionicons name="time-outline" size={11} color={colors.accentPrimary} />
                  <Text style={styles.lastSessionText}>Last session data pre-loaded</Text>
                </View>
              )}
            </View>

            {/* GöÇGöÇ Sets / Reps / Rest GÇö 3-column row GöÇGöÇ */}
            <View style={styles.metaRow}>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.inputLabel}>SETS</Text>
                <TextInput
                  style={styles.inputCompact}
                  keyboardType="numeric"
                  value={sets}
                  onChangeText={setSets}
                  textAlign="center"
                />
              </View>
              <View style={[styles.inputGroup, { flex: 1.6 }]}>
                <Text style={styles.inputLabel}>REPS</Text>
                <TextInput
                  style={styles.inputCompact}
                  value={reps}
                  onChangeText={setReps}
                  textAlign="center"
                />
              </View>
              <View style={[styles.inputGroup, { flex: 1.5 }]}>
                <Text style={styles.inputLabel}>REST (SEC)</Text>
                <TextInput
                  style={styles.inputCompact}
                  keyboardType="numeric"
                  value={restTime}
                  onChangeText={setRestTime}
                  textAlign="center"
                />
              </View>
            </View>

            {/* GöÇGöÇ Muscle Group pills GöÇGöÇ */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>MUSCLE GROUP</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: SPACE.sm, paddingVertical: 4 }}
              >
                {MUSCLES_LIST.map((m) => {
                  const isSelected = muscle === m;
                  const baseColor = m === 'None' ? colors.textSecondary : resolveMuscleColor(m);
                  return (
                    <TouchableOpacity
                      key={m}
                      style={[
                        styles.musclePill,
                        isSelected && { backgroundColor: hexToRgba(baseColor, 0.15), borderColor: baseColor },
                      ]}
                      onPress={() => setMuscle(m)}
                    >
                      <View style={[styles.muscleDot, { backgroundColor: baseColor }]} />
                      <Text style={[styles.muscleText, isSelected && { color: baseColor }]}>{m}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* GöÇGöÇ YouTube Link GöÇGöÇ */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>YOUTUBE LINK (OPTIONAL)</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. https://youtu.be/..."
                placeholderTextColor={colors.textTertiary}
                value={videoLink}
                onChangeText={setVideoLink}
                autoCapitalize="none"
              />
            </View>

            {/* GöÇGöÇ Save to Master Split GöÇGöÇ */}
            {planDay && (
              <View style={styles.masterSplitContainer}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.masterSplitTitle}>Save to Master Split</Text>
                  <Text style={styles.masterSplitDesc}>Add to all future {planDay.name} days.</Text>
                </View>
                <Switch
                  value={savePermanently}
                  onValueChange={setSavePermanently}
                  trackColor={{ false: 'rgba(255,255,255,0.1)', true: colors.accentPrimary }}
                  thumbColor={Platform.OS === 'ios' ? '#fff' : savePermanently ? '#fff' : '#f4f3f4'}
                />
              </View>
            )}

            {/* GöÇGöÇ Submit GöÇGöÇ */}
            <TouchableOpacity
              style={[styles.submitBtn, !name.trim() && styles.submitBtnDisabled]}
              disabled={!name.trim()}
              onPress={handleAddExercise}
            >
              <Ionicons name="add" size={18} color="#000" style={{ marginRight: 6 }} />
              <Text style={styles.submitBtnText}>Add Exercise</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// GöÇGöÇ Styles GöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇ

const makeStyles = (colors: any) => StyleSheet.create({
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#000000',
    borderTopLeftRadius: RADIUS.xxl,
    borderTopRightRadius: RADIUS.xxl,
    padding: SPACE.xl,
    paddingBottom: Platform.OS === 'ios' ? 40 : SPACE.xl,
    maxHeight: '90%',
    borderWidth: 1,
    borderColor: '#27272A',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACE.lg,
  },
  title: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 20,
    color: colors.textPrimary,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#2C2C2E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollArea: {
    flexGrow: 0,
  },

  // GöÇGöÇ Search Input GöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇ
  inputGroup: {
    gap: 6,
    marginBottom: SPACE.md,
  },
  inputLabel: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 10,
    color: colors.textTertiary,
    letterSpacing: 0.8,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACE.md,
    height: 48,
    borderWidth: 1,
    borderColor: 'rgba(165,153,255,0.2)',
  },
  searchInput: {
    flex: 1,
    fontFamily: FONT_FAMILY.body,
    fontSize: 14,
    color: colors.textPrimary,
    height: '100%',
  },

  // GöÇGöÇ Dropdown GöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇGöÇ
  dropdown: {
    marginTop: 4,
    backgroundColor: '#1C1C1E',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: 'rgba(165,153,255,0.15)',
    overflow: 'hidden',
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 11,
    gap: 10,
  },
  suggestionBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  suggestionName: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 13,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  suggestionMeta: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 11,
  },
  suggestionRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  suggestionSets: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 11,
    color: colors.textMuted,
  },

  // Last session badge
  lastSessionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
  },
  lastSessionText: {
    fontSize: 11,
    color: colors.accentPrimary,
    fontFamily: FONT_FAMILY.body,
  },

  // Sets / Reps / Rest row
  metaRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: SPACE.md,
  },
  inputCompact: {
    backgroundColor: '#1C1C1E',
    borderRadius: RADIUS.md,
    height: 48,
    fontFamily: FONT_FAMILY.body,
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },

  // AI loading row
  aiLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 10,
  },
  aiLoadingIcon: {
    fontSize: 16,
  },
  aiLoadingText: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 13,
    color: colors.textTertiary,
    fontStyle: 'italic',
  },

  // AI suggestion row
  aiSuggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 10,
    backgroundColor: 'rgba(165,153,255,0.06)',
  },
  aiSuggestionLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  aiSparkle: {
    fontSize: 18,
  },
  aiSuggestionName: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 13,
    color: colors.textPrimary,
    marginBottom: 2,
    flex: 1,
  },
  aiBadge: {
    backgroundColor: 'rgba(165,153,255,0.2)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderWidth: 1,
    borderColor: 'rgba(165,153,255,0.4)',
  },
  aiBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.accentPrimary,
    letterSpacing: 0.5,
  },

  // Regular input
  input: {
    backgroundColor: '#1C1C1E',
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACE.md,
    height: 48,
    fontFamily: FONT_FAMILY.body,
    fontSize: 14,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },

  // Muscle pills
  musclePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: SPACE.md,
    height: 34,
    borderRadius: 17,
    gap: SPACE.xs,
  },
  muscleDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  muscleText: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 12,
    color: colors.textMuted,
  },

  // Master split
  masterSplitContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACE.md,
    marginBottom: SPACE.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  masterSplitTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 14,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  masterSplitDesc: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 12,
    color: colors.textMuted,
  },

  // Submit
  submitBtn: {
    backgroundColor: '#a599ff',
    borderRadius: RADIUS.md,
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACE.sm,
  },
  submitBtnDisabled: {
    opacity: 0.4,
  },
  submitBtnText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 15,
    color: '#000',
  },
});
