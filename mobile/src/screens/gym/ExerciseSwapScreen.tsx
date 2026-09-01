import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, ScrollView, Platform,
  KeyboardAvoidingView, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

import { SPACE } from '../../theme/tokens';
import { useGymLog, todayStr, planDayIndexForDate, getCustomPlanDay } from '../../hooks/useGymLog';
import { useWellnessData } from '../../contexts/domains/WellnessContext';
import { GYM_PLAN, GYM_PLAN_PPL, GYM_PLAN_ARNOLD } from '../../data/gymPlan';
import { EXERCISE_DATABASE } from '../../data/exerciseDatabase';
import { resolveMuscleColor, hexToRgba, canonicalizeMuscle, resolveExerciseTargetMuscle, getExerciseSwapAlternatives, getPreviousExerciseSession } from '../../utils/gymUtils';
import { hapticMedium, hapticSuccess, hapticLight } from '../../utils/haptics';
import { callProxy } from '../../services/geminiProxy';
import { autoResolveExerciseVideoId } from '../../services/exerciseVideoResolver';
import { GymNavigationParamList } from '../../types/gym.types';
import { useTheme } from '../../contexts/ThemeContext';

// Extracted Sub-Components & Styles
import { makeExerciseSwapStyles } from './exerciseSwapStyles';
import TemplateSwapCard from '../../components/Gym/TemplateSwapCard';
import AiSwapCard from '../../components/Gym/AiSwapCard';

export interface AiSwapRecommendation {
  id: string;
  name: string;
  muscle: string;
  targetSets: number;
  targetReps: string;
  restTimeSecs: number;
  reason: string;
  videoId?: string;
  isFromTemplate?: boolean;
  dayName?: string;
}

export interface TemplateExerciseSwapItem {
  id: string;
  name: string;
  muscle: string;
  targetSets: number;
  targetReps: string;
  restTimeSecs: number;
  videoId?: string;
  dayIndex: number;
  dayName: string;
  routineName: string;
  isExactMuscleMatch: boolean;
  isFromTemplate: true;
}

// ─── Fast Sub-Muscle Index Dictionary for O(1) Matching ────────────────────────
const SUB_MUSCLE_TOKENS: string[] = [
  'long tricep', 'lat/med tricep', 'upper chest', 'mid chest', 'lower chest',
  'lat width', 'mid-back', 'rear delt', 'side delt', 'front delt',
  'short bicep', 'long bicep', 'brachialis', 'quad', 'hamstring',
  'soleus', 'gastrocnemius', 'upper abs', 'lower abs', 'forearm flexor', 'forearm extensor'
];

function isSubMuscleMatch(exactA: string, exactB: string): boolean {
  if (exactA === exactB) return true;
  for (let i = 0; i < SUB_MUSCLE_TOKENS.length; i++) {
    const tok = SUB_MUSCLE_TOKENS[i];
    if (exactA.includes(tok) && exactB.includes(tok)) return true;
  }
  return false;
}

export default function ExerciseSwapScreen() {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeExerciseSwapStyles(colors, isDark), [colors, isDark]);
  const navigation = useNavigation<NativeStackNavigationProp<GymNavigationParamList>>();
  const route = useRoute<RouteProp<GymNavigationParamList, 'ExerciseSwap'>>();
  const originalExerciseId = route.params?.originalExerciseId;
  const date = route.params?.date || todayStr();

  const { log, updateExercise } = useGymLog(date);
  const { userGymPlan, updateMasterPlan, gymLogs } = useWellnessData();

  const [activeTab, setActiveTab] = useState<'ai' | 'all'>('ai');
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'template' | 'exact' | 'category'>('all');

  const [aiSwaps, setAiSwaps] = useState<AiSwapRecommendation[]>([]);
  const [isAiLoading, setIsAiLoading] = useState(true);

  // Original exercise
  const originalExercise = useMemo(() => {
    if (!log || !originalExerciseId) return null;
    return log.exercises.find(e => e.exerciseId === originalExerciseId || e.id === originalExerciseId);
  }, [log, originalExerciseId]);

  const origName = originalExercise?.name || 'Exercise';
  const rawMuscle = originalExercise?.muscle || '';
  const { targetMuscle: origMuscle, canonicalGroup: canonicalMuscle } = useMemo(
    () => resolveExerciseTargetMuscle(origName, rawMuscle),
    [origName, rawMuscle]
  );

  // ── Extract matching exercises from gym template ─────────────────────────────
  const templateExercises = useMemo(() => {
    if (!originalExercise) return [];

    const origNameLower = (originalExercise.name || '').toLowerCase().trim();
    const exactMuscleLower = origMuscle.toLowerCase();
    const canonicalMuscleLower = canonicalMuscle.toLowerCase();

    const results: TemplateExerciseSwapItem[] = [];
    const seenNames = new Set<string>();
    seenNames.add(origNameLower);

    const DAY_NAMES: Record<number, string> = {
      1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday', 6: 'Saturday', 7: 'Sunday'
    };

    const processDay = (day: any, routineLabel: string) => {
      if (!day || !day.exercises || day.isRest) return;
      const dayNameFormatted = DAY_NAMES[day.dayIndex]
        ? `${DAY_NAMES[day.dayIndex]} (${day.name || day.subtitle || ''})`
        : (day.name || 'Routine Day');

      for (const ex of day.exercises) {
        const exName = (ex.name || '').trim();
        const exNameLower = exName.toLowerCase();
        if (!exName || seenNames.has(exNameLower)) continue;

        const exMuscle = ex.muscle || '';
        const exExactLower = exMuscle.toLowerCase();
        const exCanonicalLower = canonicalizeMuscle(exMuscle).toLowerCase();

        const isExact = isSubMuscleMatch(exactMuscleLower, exExactLower);
        const isCategory = isExact || exCanonicalLower === canonicalMuscleLower;

        if (isCategory) {
          seenNames.add(exNameLower);
          results.push({
            id: ex.id || `tpl_${day.dayIndex}_${Date.now()}_${results.length}`,
            name: exName,
            muscle: exMuscle || origMuscle,
            targetSets: ex.targetSets || 3,
            targetReps: ex.targetReps || '8–12',
            restTimeSecs: ex.restTimeSecs || (ex.targetSets && ex.targetSets >= 4 ? 120 : 90),
            videoId: ex.videoId,
            dayIndex: day.dayIndex,
            dayName: dayNameFormatted,
            routineName: routineLabel,
            isExactMuscleMatch: isExact,
            isFromTemplate: true,
          });
        }
      }
    };

    if (userGymPlan?.customDays && Object.keys(userGymPlan.customDays).length > 0) {
      Object.values(userGymPlan.customDays).forEach((day: any) => processDay(day, 'My Routine'));
    } else {
      GYM_PLAN_ARNOLD.forEach(day => processDay(day, 'Arnold Routine'));
    }

    return results.sort((a, b) => {
      if (a.isExactMuscleMatch && !b.isExactMuscleMatch) return -1;
      if (!a.isExactMuscleMatch && b.isExactMuscleMatch) return 1;
      return a.dayIndex - b.dayIndex;
    });
  }, [originalExercise, origMuscle, canonicalMuscle, userGymPlan]);

  // ── Load AI recommendations & Instant Fallback ──────────────────────────────
  useEffect(() => {
    let isCancelled = false;

    const instantSwaps = getExerciseSwapAlternatives(origName, rawMuscle);
    const instantList: AiSwapRecommendation[] = instantSwaps.map((alt, idx) => ({
      id: alt.id || `curated_${idx}_${Date.now()}`,
      name: alt.name,
      muscle: alt.muscle,
      targetSets: alt.targetSets,
      targetReps: alt.targetReps,
      restTimeSecs: alt.restTimeSecs,
      reason: alt.reason || `Direct alternative targeting ${alt.muscle}`,
      videoId: alt.videoId,
    }));

    setAiSwaps(instantList);
    setIsAiLoading(true);

    async function fetchAiSwaps() {
      try {
        const templateExerciseNames = templateExercises.map(t => t.name).slice(0, 5).join(', ');
        const prompt = `Exercise to swap: "${origName}" (Target Muscle: ${origMuscle}, Parent Group: ${canonicalMuscle}).
The user is working out and wants alternative exercises that hit the EXACT same movement plane and muscle fibers.
${templateExerciseNames ? `Note: User's workout routine already includes: [${templateExerciseNames}].` : ''}

Generate EXACTLY 6 biomechanically equivalent exercise alternatives for "${origName}".
For EACH alternative exercise, assign realistic specific targetSets (3 or 4), targetReps ('6-8', '8-12', '12-15', '15-20'), and restTimeSecs (45, 60, 90, or 120).

Return ONLY a raw valid JSON array of 6 objects:
[
  {
    "name": "Exercise Name",
    "muscle": "${origMuscle}",
    "targetSets": 3,
    "targetReps": "8-12",
    "restTimeSecs": 90,
    "reason": "Biomechanical rationale"
  }
]`;

        const res = await callProxy({
          contents: [{ parts: [{ text: prompt }] }],
          systemInstruction: `You are S.A.R.A, ZenTrack's elite AI biomechanics coach. Output ONLY valid JSON arrays of 6 exercise recommendations. No markdown text.`,
          generationConfig: { temperature: 0.35, maxOutputTokens: 700 },
        });

        if (isCancelled) return;

        const textResult = res?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (textResult) {
          const cleanJsonStr = textResult.replace(/```json/g, '').replace(/```/g, '').trim();
          const parsed = JSON.parse(cleanJsonStr);
          if (Array.isArray(parsed) && parsed.length >= 3) {
            const formattedPromises = parsed.slice(0, 6).map(async (item: any, i: number) => {
              const exName = item.name || instantList[i]?.name || 'Alternative Exercise';
              const vidId = (await autoResolveExerciseVideoId(exName)) || instantList[i]?.videoId || '';
              return {
                id: `sara_ai_${i}_${Date.now()}`,
                name: exName,
                muscle: item.muscle || origMuscle,
                targetSets: typeof item.targetSets === 'number' ? item.targetSets : instantList[i]?.targetSets || 3,
                targetReps: item.targetReps || instantList[i]?.targetReps || '8-12',
                restTimeSecs: typeof item.restTimeSecs === 'number' ? item.restTimeSecs : instantList[i]?.restTimeSecs || 90,
                reason: item.reason || '',
                videoId: vidId,
              };
            });
            const formatted = await Promise.all(formattedPromises);
            if (!isCancelled) setAiSwaps(formatted);
          }
        }
      } catch (e) {
        console.warn('[SARA AI Swap] Using local fallback:', e);
      } finally {
        if (!isCancelled) setIsAiLoading(false);
      }
    }

    fetchAiSwaps();
    return () => { isCancelled = true; };
  }, [origName, origMuscle, canonicalMuscle, rawMuscle, templateExercises]);

  // ── Build Unified Catalogue for "All Exercises" Tab ─────────────────────────
  const allExercises = useMemo(() => {
    const map = new Map<string, any>();

    const allTemplateDays = [
      ...(userGymPlan?.customDays ? Object.values(userGymPlan.customDays) : []),
      ...GYM_PLAN_PPL,
      ...GYM_PLAN_ARNOLD,
      ...GYM_PLAN,
    ];

    const DAY_NAMES: Record<number, string> = {
      1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 7: 'Sun'
    };

    for (const day of allTemplateDays) {
      if (!day || !day.exercises || day.isRest) continue;
      const dayTag = DAY_NAMES[day.dayIndex] ? `${DAY_NAMES[day.dayIndex]} • ${day.name || day.subtitle || ''}` : (day.name || '');
      for (const ex of day.exercises) {
        const key = (ex.name || '').toLowerCase().trim();
        if (!key || map.has(key)) continue;
        map.set(key, {
          id: ex.id || `tpl_${key}`,
          name: ex.name,
          muscle: ex.muscle || 'Mixed',
          targetSets: ex.targetSets || 3,
          targetReps: ex.targetReps || '8–12',
          restTimeSecs: ex.restTimeSecs || 90,
          videoId: ex.videoId,
          isFromTemplate: true,
          templateDayName: dayTag,
          aliases: [],
        });
      }
    }

    for (const db of EXERCISE_DATABASE) {
      const key = (db.name || '').toLowerCase().trim();
      if (!key || map.has(key)) continue;
      map.set(key, {
        id: db.id || `db_${key}`,
        name: db.name,
        muscle: db.muscle || 'Mixed',
        targetSets: 3,
        targetReps: '8–12',
        restTimeSecs: 90,
        videoId: (db as any).videoId && (db as any).videoId !== '1' ? (db as any).videoId : undefined,
        isFromTemplate: false,
        aliases: db.aliases || [],
      });
    }

    return Array.from(map.values()).sort((a, b) => {
      if (a.isFromTemplate && !b.isFromTemplate) return -1;
      if (!a.isFromTemplate && b.isFromTemplate) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [userGymPlan]);

  const filteredExercises = useMemo(() => {
    let list = allExercises;
    const lowerSearch = search.trim().toLowerCase();

    if (filterType === 'template') {
      list = list.filter(ex => ex.isFromTemplate);
    } else if (filterType === 'exact' && origMuscle) {
      const targetLower = origMuscle.toLowerCase();
      list = list.filter(ex => (ex.muscle || '').toLowerCase().includes(targetLower) || targetLower.includes((ex.muscle || '').toLowerCase()));
    } else if (filterType === 'category' && canonicalMuscle) {
      list = list.filter(ex => canonicalizeMuscle(ex.muscle).toLowerCase() === canonicalMuscle.toLowerCase());
    }

    if (!lowerSearch) return list;

    return list.filter(ex =>
      ex.name.toLowerCase().includes(lowerSearch) ||
      (ex.muscle && ex.muscle.toLowerCase().includes(lowerSearch)) ||
      (ex.templateDayName && ex.templateDayName.toLowerCase().includes(lowerSearch)) ||
      (ex.aliases && ex.aliases.some((a: string) => a.toLowerCase().includes(lowerSearch)))
    );
  }, [allExercises, search, filterType, origMuscle, canonicalMuscle]);

  // ── Handle Swap Execution ───────────────────────────────────────────────────
  const handleSwap = useCallback(async (newExDef: any) => {
    if (!log || !originalExerciseId) return;

    const index = log.exercises.findIndex(e => e.exerciseId === originalExerciseId || e.id === originalExerciseId);
    if (index === -1) return;

    hapticSuccess();

    const existingLog = log.exercises[index];
    const oldName = existingLog.name;
    const targetSets = newExDef.targetSets || existingLog.targetSets || 3;
    const targetReps = newExDef.targetReps || existingLog.targetReps || '8-12';
    const restTimeSecs = newExDef.restTimeSecs || existingLog.restTimeSecs || 90;

    let resolvedVideoId = newExDef.videoId;
    if (!resolvedVideoId) {
      resolvedVideoId = (await autoResolveExerciseVideoId(newExDef.name)) || '';
    }

    const lastSession = getPreviousExerciseSession(newExDef.name, gymLogs);
    const lastSets = lastSession?.sets;

    const updatedExercise = {
      ...existingLog,
      exerciseId: newExDef.id || `swap_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: newExDef.name,
      muscle: newExDef.muscle || existingLog.muscle,
      videoId: resolvedVideoId,
      targetSets,
      targetReps,
      restTimeSecs,
      lastSessionSets: lastSets ?? undefined,
      setsLog: Array.from({ length: targetSets }, (_, i) => {
        const prev = lastSets?.[i];
        return {
          setNumber: i + 1,
          reps: prev?.reps ?? null,
          weight: prev?.weight ?? null,
          completed: false,
        };
      }),
      isCustom: false,
    };

    updateExercise(index, updatedExercise);

    Alert.alert(
      'Exercise Swapped!',
      `Replaced "${oldName}" with "${newExDef.name}".\n\nDo you want to save "${newExDef.name}" permanently for all future workouts on this day?`,
      [
        { text: 'Today Only', style: 'cancel', onPress: () => navigation.goBack() },
        {
          text: 'Save for Future Days',
          onPress: async () => {
            try {
              const planIdx = planDayIndexForDate(date);
              const currentMasterDay = getCustomPlanDay(userGymPlan?.customDays, planIdx) || GYM_PLAN.find(d => d.dayIndex === planIdx);
              if (currentMasterDay && updateMasterPlan) {
                const targetOldName = (oldName || '').toLowerCase().trim();
                let updatedExercises = [...currentMasterDay.exercises];
                const matchIndex = updatedExercises.findIndex((e: any) =>
                  (e.id && e.id === originalExerciseId) ||
                  (e.exerciseId && e.exerciseId === originalExerciseId) ||
                  (targetOldName && (e.name || '').toLowerCase().trim() === targetOldName)
                );

                if (matchIndex !== -1) {
                  updatedExercises[matchIndex] = {
                    ...updatedExercises[matchIndex],
                    name: newExDef.name,
                    muscle: newExDef.muscle || updatedExercises[matchIndex].muscle,
                    targetSets,
                    targetReps,
                    restTimeSecs,
                    videoId: resolvedVideoId,
                  };
                } else {
                  updatedExercises.push({
                    id: updatedExercise.exerciseId,
                    name: newExDef.name,
                    muscle: newExDef.muscle || updatedExercise.muscle,
                    targetSets,
                    targetReps,
                    restTimeSecs,
                    videoId: resolvedVideoId,
                  });
                }
                await updateMasterPlan(planIdx, { ...currentMasterDay, exercises: updatedExercises });
                hapticSuccess();
              }
            } catch (err) {
              console.warn('[ExerciseSwap] Master plan update error:', err);
            }
            navigation.goBack();
          },
        },
      ]
    );
  }, [log, originalExerciseId, date, userGymPlan, updateMasterPlan, updateExercise, navigation]);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <StatusBar style={isDark ? 'light' : 'dark'} backgroundColor={colors.background} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.7}>
            <Ionicons name="chevron-down" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <View style={{ alignItems: 'center' }}>
            <Text style={styles.headerTitle}>EXERCISE SWAP</Text>
            {originalExercise && (
              <Text style={styles.headerSub}>Swapping "{originalExercise.name}"</Text>
            )}
          </View>
          <View style={{ width: 32 }} />
        </View>

        {/* Current Exercise Card */}
        {originalExercise && (
          <View style={styles.originalCard}>
            <View style={styles.originalCardLeft}>
              <Text style={styles.originalCardLabel}>CURRENT EXERCISE</Text>
              <Text style={styles.originalCardName}>{originalExercise.name}</Text>
              <Text style={styles.originalCardMeta}>
                {originalExercise.targetSets} sets × {originalExercise.targetReps} reps • {originalExercise.restTimeSecs || 90}s rest
              </Text>
            </View>

            <View style={[styles.musclePill, { backgroundColor: hexToRgba(resolveMuscleColor(origMuscle), 0.15) }]}>
              <View style={[styles.muscleDot, { backgroundColor: resolveMuscleColor(origMuscle) }]} />
              <Text style={[styles.muscleText, { color: resolveMuscleColor(origMuscle) }]}>{origMuscle}</Text>
            </View>
          </View>
        )}

        {/* Tabs */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'ai' && styles.tabBtnActive]}
            onPress={() => { hapticMedium(); setActiveTab('ai'); }}
            activeOpacity={0.8}
          >
            <Ionicons name="sparkles" size={14} color={activeTab === 'ai' ? '#000000' : '#a599ff'} />
            <Text style={[styles.tabBtnText, activeTab === 'ai' && styles.tabBtnTextActive]}>
              S.A.R.A Swaps {templateExercises.length > 0 ? `(${templateExercises.length} Template)` : ''}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'all' && styles.tabBtnActive]}
            onPress={() => { hapticMedium(); setActiveTab('all'); }}
            activeOpacity={0.8}
          >
            <Ionicons name="search" size={14} color={activeTab === 'all' ? '#000000' : colors.textMuted} />
            <Text style={[styles.tabBtnText, activeTab === 'all' && styles.tabBtnTextActive]}>All Exercises</Text>
          </TouchableOpacity>
        </View>

        {activeTab === 'all' ? (
          <>
            {/* Search */}
            <View style={styles.searchContainer}>
              <Ionicons name="search" size={18} color={colors.textMuted} style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search exercise, muscle, or template day..."
                placeholderTextColor={colors.textMuted}
                value={search}
                onChangeText={setSearch}
                autoCorrect={false}
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => setSearch('')}>
                  <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>

            {/* Chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              <TouchableOpacity
                style={[styles.chip, filterType === 'all' && styles.chipActive]}
                onPress={() => { hapticLight(); setFilterType('all'); }}
              >
                <Text style={[styles.chipText, filterType === 'all' && styles.chipTextActive]}>All ({allExercises.length})</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.chip, filterType === 'template' && styles.chipActive]}
                onPress={() => { hapticLight(); setFilterType('template'); }}
              >
                <Ionicons name="calendar-outline" size={12} color={filterType === 'template' ? '#000000' : '#a599ff'} />
                <Text style={[styles.chipText, filterType === 'template' && styles.chipTextActive]}>In Template</Text>
              </TouchableOpacity>

              {origMuscle && (
                <TouchableOpacity
                  style={[styles.chip, filterType === 'exact' && styles.chipActive]}
                  onPress={() => { hapticLight(); setFilterType('exact'); }}
                >
                  <Text style={[styles.chipText, filterType === 'exact' && styles.chipTextActive]}>{origMuscle}</Text>
                </TouchableOpacity>
              )}

              {canonicalMuscle && canonicalMuscle !== origMuscle && (
                <TouchableOpacity
                  style={[styles.chip, filterType === 'category' && styles.chipActive]}
                  onPress={() => { hapticLight(); setFilterType('category'); }}
                >
                  <Text style={[styles.chipText, filterType === 'category' && styles.chipTextActive]}>{canonicalMuscle}</Text>
                </TouchableOpacity>
              )}
            </ScrollView>

            <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
              {filteredExercises.map(ex => (
                <TouchableOpacity
                  key={ex.id}
                  style={styles.exerciseRow}
                  onPress={() => handleSwap(ex)}
                  activeOpacity={0.7}
                >
                  <View style={styles.exInfo}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <Text style={styles.exName}>{ex.name}</Text>
                      {ex.isFromTemplate && (
                        <View style={styles.templateBadge}>
                          <Ionicons name="calendar-outline" size={10} color="#a599ff" />
                          <Text style={styles.templateBadgeText}>{ex.templateDayName || 'Template'}</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.exTarget}>{ex.targetSets} sets × {ex.targetReps} reps</Text>
                  </View>
                  <View style={[styles.musclePill, { backgroundColor: hexToRgba(resolveMuscleColor(ex.muscle), 0.1) }]}>
                    <View style={[styles.muscleDot, { backgroundColor: resolveMuscleColor(ex.muscle) }]} />
                    <Text style={[styles.muscleText, { color: resolveMuscleColor(ex.muscle) }]}>{ex.muscle}</Text>
                  </View>
                </TouchableOpacity>
              ))}

              {filteredExercises.length === 0 && (
                <View style={styles.emptyState}>
                  <Ionicons name="barbell-outline" size={32} color={colors.textMuted} />
                  <Text style={styles.emptyText}>No exercises found.</Text>
                </View>
              )}
            </ScrollView>
          </>
        ) : (
          <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
            {/* Template Exercises */}
            {templateExercises.length > 0 && (
              <View style={{ marginBottom: SPACE.lg }}>
                <View style={styles.sectionHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="calendar" size={15} color="#a599ff" />
                    <Text style={styles.sectionHeaderTitle}>From Workout Template ({templateExercises.length})</Text>
                  </View>
                  <Text style={styles.sectionHeaderSub}>Routine Matches</Text>
                </View>

                {templateExercises.map((tplEx, idx) => (
                  <TemplateSwapCard
                    key={tplEx.id || idx}
                    item={tplEx}
                    styles={styles}
                    onSwap={handleSwap}
                  />
                ))}
              </View>
            )}

            {/* SARA AI Swaps */}
            <View style={styles.aiStatusBanner}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="sparkles" size={16} color="#a599ff" />
                <Text style={styles.aiStatusTitle}>S.A.R.A AI Biomechanical Swaps</Text>
              </View>
              {isAiLoading && <ActivityIndicator size="small" color="#a599ff" />}
            </View>

            {aiSwaps.map((item, idx) => (
              <AiSwapCard
                key={item.id || idx}
                item={item}
                styles={styles}
                onSwap={handleSwap}
              />
            ))}
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
