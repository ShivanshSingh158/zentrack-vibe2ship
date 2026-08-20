import React, { useState, useMemo, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, ScrollView, Platform, KeyboardAvoidingView, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { FONT_FAMILY, SPACE, RADIUS, SHADOW } from '../../theme/tokens';
import { useGymLog, todayStr, planDayIndexForDate, getCustomPlanDay } from '../../hooks/useGymLog';
import { useWellnessData } from '../../contexts/domains/WellnessContext';
import { GYM_PLAN, GYM_PLAN_PPL, GYM_PLAN_ARNOLD, EXERCISE_ALTERNATIVES } from '../../data/gymPlan';
import { EXERCISE_DATABASE } from '../../data/exerciseDatabase';
import { resolveMuscleColor, hexToRgba, canonicalizeMuscle, resolveExerciseTargetMuscle, getExerciseSwapAlternatives } from '../../utils/gymUtils';
import { hapticMedium, hapticSuccess, hapticLight } from '../../utils/haptics';
import { callProxy } from '../../services/geminiProxy';
import { autoResolveExerciseVideoId } from '../../services/exerciseVideoResolver';
import { GymNavigationParamList } from '../../types/gym.types';
import { useTheme } from '../../contexts/ThemeContext';
import { StatusBar } from 'expo-status-bar';

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

export default function ExerciseSwapScreen() {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const navigation = useNavigation<NativeStackNavigationProp<GymNavigationParamList>>();
  const route = useRoute<RouteProp<GymNavigationParamList, 'ExerciseSwap'>>();
  const originalExerciseId = route.params?.originalExerciseId;
  const date = route.params?.date || todayStr();

  const { log, updateExercise } = useGymLog(date);
  const { userGymPlan, updateMasterPlan } = useWellnessData();

  const [activeTab, setActiveTab] = useState<'ai' | 'all'>('ai');
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'template' | 'exact' | 'category'>('all');

  const [aiSwaps, setAiSwaps] = useState<AiSwapRecommendation[]>([]);
  const [isAiLoading, setIsAiLoading] = useState(true);

  // Find original exercise being swapped
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

  // ── Extract matching exercises from the gym template across all days ───────
  // (e.g. For Thursday's Long Tricep -> extracts Monday's Long Tricep exercise, Friday's, etc.)
  const templateExercises = useMemo(() => {
    if (!originalExercise) return [];

    const origNameLower = (originalExercise.name || '').toLowerCase().trim();
    const exactMuscleLower = origMuscle.toLowerCase();
    const canonicalMuscleLower = canonicalMuscle.toLowerCase();

    const results: TemplateExerciseSwapItem[] = [];
    const seenNames = new Set<string>();
    // Exclude the current exercise itself
    seenNames.add(origNameLower);

    const DAY_NAMES: Record<number, string> = {
      1: 'Monday',
      2: 'Tuesday',
      3: 'Wednesday',
      4: 'Thursday',
      5: 'Friday',
      6: 'Saturday',
      7: 'Sunday',
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

        // Exact sub-muscle match (e.g. Long Tricep === Long Tricep)
        const isExact = exExactLower === exactMuscleLower ||
          (exactMuscleLower.includes('long tricep') && exExactLower.includes('long tricep')) ||
          (exactMuscleLower.includes('lat/med tricep') && exExactLower.includes('lat/med tricep')) ||
          (exactMuscleLower.includes('upper chest') && exExactLower.includes('upper chest')) ||
          (exactMuscleLower.includes('mid chest') && exExactLower.includes('mid chest')) ||
          (exactMuscleLower.includes('lower chest') && exExactLower.includes('lower chest')) ||
          (exactMuscleLower.includes('lat width') && exExactLower.includes('lat width')) ||
          (exactMuscleLower.includes('mid-back') && exExactLower.includes('mid-back')) ||
          (exactMuscleLower.includes('rear delt') && exExactLower.includes('rear delt')) ||
          (exactMuscleLower.includes('side delt') && exExactLower.includes('side delt')) ||
          (exactMuscleLower.includes('front delt') && exExactLower.includes('front delt')) ||
          (exactMuscleLower.includes('short bicep') && exExactLower.includes('short bicep')) ||
          (exactMuscleLower.includes('long bicep') && exExactLower.includes('long bicep')) ||
          (exactMuscleLower.includes('brachialis') && exExactLower.includes('brachialis')) ||
          (exactMuscleLower.includes('quad') && exExactLower.includes('quad')) ||
          (exactMuscleLower.includes('hamstring') && exExactLower.includes('hamstring')) ||
          (exactMuscleLower.includes('soleus') && exExactLower.includes('soleus')) ||
          (exactMuscleLower.includes('gastrocnemius') && exExactLower.includes('gastrocnemius')) ||
          (exactMuscleLower.includes('upper abs') && exExactLower.includes('upper abs')) ||
          (exactMuscleLower.includes('lower abs') && exExactLower.includes('lower abs')) ||
          (exactMuscleLower.includes('forearm flexor') && exExactLower.includes('forearm flexor')) ||
          (exactMuscleLower.includes('forearm extensor') && exExactLower.includes('forearm extensor'));

        // Parent category match (e.g. Triceps === Triceps)
        const isCategory = isExact || exCanonicalLower === canonicalMuscleLower ||
          (canonicalMuscleLower === 'triceps' && (exExactLower.includes('tricep') || exCanonicalLower.includes('tricep'))) ||
          (canonicalMuscleLower === 'biceps' && (exExactLower.includes('bicep') || exExactLower.includes('brachialis') || exCanonicalLower.includes('bicep'))) ||
          (canonicalMuscleLower === 'chest' && (exExactLower.includes('chest') || exCanonicalLower.includes('chest'))) ||
          (canonicalMuscleLower === 'back' && (exExactLower.includes('back') || exExactLower.includes('lat') || exCanonicalLower.includes('back'))) ||
          (canonicalMuscleLower === 'shoulders' && (exExactLower.includes('delt') || exExactLower.includes('shoulder') || exCanonicalLower.includes('shoulders'))) ||
          (canonicalMuscleLower === 'quads' && (exExactLower.includes('quad') || exCanonicalLower.includes('quads'))) ||
          (canonicalMuscleLower === 'hamstrings' && (exExactLower.includes('ham') || exExactLower.includes('glute') || exCanonicalLower.includes('hamstrings'))) ||
          (canonicalMuscleLower === 'calves' && (exExactLower.includes('calv') || exExactLower.includes('soleus') || exCanonicalLower.includes('calves'))) ||
          (canonicalMuscleLower === 'abs' && (exExactLower.includes('ab') || exExactLower.includes('core') || exExactLower.includes('oblique') || exCanonicalLower.includes('abs'))) ||
          (canonicalMuscleLower === 'forearms' && (exExactLower.includes('forearm') || exExactLower.includes('wrist') || exExactLower.includes('brachio') || exCanonicalLower.includes('forearms')));

        if (isCategory) {
          seenNames.add(exNameLower);
          results.push({
            id: ex.id || `tpl_${day.dayIndex}_${Date.now()}_${results.length}`,
            name: exName,
            muscle: exMuscle || origMuscle,
            targetSets: ex.targetSets || 3,
            targetReps: ex.targetReps || '8–12',
            restTimeSecs: (ex as any).restTimeSecs || (ex.targetSets && ex.targetSets >= 4 ? 120 : 90),
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

    // 1. Scan active routine days only (avoids multi-plan clutter)
    if (userGymPlan?.customDays && Object.keys(userGymPlan.customDays).length > 0) {
      Object.values(userGymPlan.customDays).forEach((day: any) => processDay(day, 'My Routine'));
    } else {
      GYM_PLAN_ARNOLD.forEach(day => processDay(day, 'Arnold Routine'));
    }

    // Sort: Exact sub-muscle matches first (e.g. Long Tricep -> Long Tricep), then by day
    return results.sort((a, b) => {
      if (a.isExactMuscleMatch && !b.isExactMuscleMatch) return -1;
      if (!a.isExactMuscleMatch && b.isExactMuscleMatch) return 1;
      return a.dayIndex - b.dayIndex;
    });
  }, [originalExercise, origMuscle, canonicalMuscle, userGymPlan]);

  // ── Load AI recommendations & Instant Fallbacks ─────────────────────────────
  useEffect(() => {
    let isCancelled = false;

    // 1. Immediate Instant Fallback (0ms latency) using strict target muscle resolver
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

    // 2. Fetch Live AI Analysis from S.A.R.A.
    async function fetchAiSwaps() {
      try {
        const templateExerciseNames = templateExercises.map(t => t.name).slice(0, 5).join(', ');
        const prompt = `Exercise to swap: "${origName}" (Target Muscle: ${origMuscle}, Parent Group: ${canonicalMuscle}).
The user is working out and wants alternative exercises that hit the EXACT same movement plane and muscle fibers.
${templateExerciseNames ? `Note: User's workout routine already includes: [${templateExerciseNames}].` : ''}

Generate EXACTLY 6 biomechanically equivalent exercise alternatives for "${origName}".
For EACH alternative exercise, assign realistic specific targetSets (3 or 4), targetReps ('6-8' for heavy compound, '8-12' for press/pull, '12-15' for isolation, '15-20' or '30-45s' for forearms/grip/calves), and restTimeSecs (45, 60, 90, or 120) tailored to that specific exercise.

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
          systemInstruction: `You are S.A.R.A, ZenTrack's elite AI biomechanics coach. Output ONLY valid JSON arrays of 6 exercise recommendations with realistic sets, reps, and rest times. No markdown text.`,
          generationConfig: {
            temperature: 0.35,
            maxOutputTokens: 700,
          },
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

    return () => {
      isCancelled = true;
    };
  }, [originalExercise, origName, origMuscle, canonicalMuscle, templateExercises]);

  // ── Build Unified Catalogue for "All Exercises" Tab ─────────────────────────
  const allExercises = useMemo(() => {
    const map = new Map<string, any>();

    // 1. Add all template exercises first (with template metadata)
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
        if (!key) continue;
        if (!map.has(key)) {
          map.set(key, {
            id: ex.id || `tpl_${key}`,
            name: ex.name,
            muscle: ex.muscle || 'Mixed',
            targetSets: ex.targetSets || 3,
            targetReps: ex.targetReps || '8–12',
            restTimeSecs: (ex as any).restTimeSecs || 90,
            videoId: ex.videoId,
            isFromTemplate: true,
            templateDayName: dayTag,
            aliases: [],
          });
        }
      }
    }

    // 2. Add EXERCISE_DATABASE entries
    for (const db of EXERCISE_DATABASE) {
      const key = (db.name || '').toLowerCase().trim();
      if (!key) continue;
      if (!map.has(key)) {
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
    }

    return Array.from(map.values()).sort((a, b) => {
      // Prioritize template items
      if (a.isFromTemplate && !b.isFromTemplate) return -1;
      if (!a.isFromTemplate && b.isFromTemplate) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [userGymPlan]);

  const filteredExercises = useMemo(() => {
    let list = allExercises;
    const lowerSearch = search.trim().toLowerCase();

    // Filter by quick pill chip
    if (filterType === 'template') {
      list = list.filter(ex => ex.isFromTemplate);
    } else if (filterType === 'exact' && origMuscle) {
      const targetLower = origMuscle.toLowerCase();
      list = list.filter(ex =>
        (ex.muscle || '').toLowerCase().includes(targetLower) ||
        targetLower.includes((ex.muscle || '').toLowerCase())
      );
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

  // ── Handle Swap Execution with Optional Master Plan Update ───────────────────
  const handleSwap = async (newExDef: any) => {
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

    // Create new sets array preset by AI or exercise def
    const newSetsLog = Array.from({ length: targetSets }, (_, i) => ({
      setNumber: i + 1,
      reps: null,
      weight: null,
      completed: false,
    }));

    const updatedExercise = {
      ...existingLog,
      exerciseId: newExDef.id || `swap_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      name: newExDef.name,
      muscle: newExDef.muscle || existingLog.muscle,
      videoId: resolvedVideoId,
      targetSets,
      targetReps,
      restTimeSecs,
      setsLog: newSetsLog,
      isCustom: false,
    };

    updateExercise(index, updatedExercise);

    // Confirmation Alert with Master Split update option
    Alert.alert(
      'Exercise Swapped!',
      `Replaced "${oldName}" with "${newExDef.name}".\n\nDo you want to save "${newExDef.name}" permanently for all future workouts on this day?`,
      [
        {
          text: 'Today Only',
          style: 'cancel',
          onPress: () => navigation.goBack(),
        },
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
  };

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

        {/* Original Exercise Info Card */}
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

        {/* Tab Selection Bar */}
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
            {/* Search input for All tab */}
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

            {/* Filter Chips */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipRow}
            >
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
          /* S.A.R.A AI Recommendations Tab */
          <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
            {/* ── SECTION 1: Exercises from Workout Template (e.g. Monday's Long Tricep on Thursday) ── */}
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
                  <TouchableOpacity
                    key={tplEx.id || idx}
                    style={[
                      styles.templateSwapCard,
                      tplEx.isExactMuscleMatch && styles.templateSwapCardExact,
                    ]}
                    onPress={() => handleSwap(tplEx)}
                    activeOpacity={0.75}
                  >
                    <View style={styles.templateCardTop}>
                      <View style={styles.dayOriginPill}>
                        <Ionicons name="calendar-outline" size={11} color="#a599ff" />
                        <Text style={styles.dayOriginText}>{tplEx.dayName}</Text>
                      </View>
                      <View style={[styles.musclePill, { backgroundColor: hexToRgba(resolveMuscleColor(tplEx.muscle), 0.15) }]}>
                        <View style={[styles.muscleDot, { backgroundColor: resolveMuscleColor(tplEx.muscle) }]} />
                        <Text style={[styles.muscleText, { color: resolveMuscleColor(tplEx.muscle) }]}>{tplEx.muscle}</Text>
                      </View>
                    </View>

                    <View style={styles.templateCardBody}>
                      <Text style={styles.templateExName}>{tplEx.name}</Text>
                      <Text style={styles.templateExMeta}>
                        {tplEx.targetSets} Sets × {tplEx.targetReps} Reps  •  {tplEx.restTimeSecs}s Rest
                      </Text>
                    </View>

                    <View style={styles.templateCardFooter}>
                      <Text style={styles.templateTapHint}>Tap to Swap with {tplEx.name} →</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* ── SECTION 2: S.A.R.A AI Biomechanical Analysis ── */}
            <View style={styles.aiStatusBanner}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="sparkles" size={16} color="#a599ff" />
                <Text style={styles.aiStatusTitle}>S.A.R.A AI Biomechanical Swaps</Text>
              </View>
              {isAiLoading && <ActivityIndicator size="small" color="#a599ff" />}
            </View>

            {aiSwaps.map((item, idx) => (
              <TouchableOpacity
                key={item.id || idx}
                style={styles.exerciseRow}
                onPress={() => handleSwap(item)}
                activeOpacity={0.75}
              >
                <View style={styles.exInfo}>
                  <Text style={styles.exName}>{item.name}</Text>
                  <Text style={styles.exTarget}>
                    {item.targetSets} Sets × {item.targetReps} Reps  •  {item.restTimeSecs}s Rest
                  </Text>
                  {!!item.reason && (
                    <Text style={styles.exReason} numberOfLines={1}>{item.reason}</Text>
                  )}
                </View>
                <View style={[styles.musclePill, { backgroundColor: hexToRgba(resolveMuscleColor(item.muscle), 0.1) }]}>
                  <View style={[styles.muscleDot, { backgroundColor: resolveMuscleColor(item.muscle) }]} />
                  <Text style={[styles.muscleText, { color: resolveMuscleColor(item.muscle) }]}>{item.muscle}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: any, isDark: boolean = true) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: isDark ? '#000000' : colors.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SPACE.lg,
      paddingTop: Platform.OS === 'ios' ? 10 : 20,
      paddingBottom: SPACE.sm,
      borderBottomWidth: 1,
      borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : colors.border,
    },
    backBtn: { padding: SPACE.xs },
    headerTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 13, color: colors.textPrimary, letterSpacing: 1.5 },
    headerSub: { fontFamily: FONT_FAMILY.body, fontSize: 11, color: colors.textMuted, marginTop: 2 },

    originalCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: isDark ? '#1C1C1E' : colors.surface,
      marginHorizontal: SPACE.lg,
      marginTop: SPACE.md,
      marginBottom: SPACE.sm,
      padding: SPACE.md,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.05)' : colors.border,
    },
    originalCardLeft: { flex: 1, paddingRight: 8 },
    originalCardLabel: { fontFamily: FONT_FAMILY.bold, fontSize: 9, color: colors.textMuted, letterSpacing: 1.2, marginBottom: 2 },
    originalCardName: { fontFamily: FONT_FAMILY.bold, fontSize: 15, color: colors.textPrimary, textTransform: 'capitalize' },
    originalCardMeta: { fontFamily: FONT_FAMILY.body, fontSize: 11, color: colors.textMuted, marginTop: 2 },

    tabContainer: {
      flexDirection: 'row',
      marginHorizontal: SPACE.lg,
      marginVertical: SPACE.md,
      backgroundColor: isDark ? '#1C1C1E' : colors.surface,
      borderRadius: RADIUS.lg,
      padding: 3,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.05)' : colors.border,
    },
    tabBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 8,
      borderRadius: RADIUS.md,
    },
    tabBtnActive: {
      backgroundColor: colors.accentPrimary,
    },
    tabBtnText: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 12,
      color: colors.textMuted,
    },
    tabBtnTextActive: {
      color: '#ffffff',
    },

    searchContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? '#1C1C1E' : colors.surface,
      marginHorizontal: SPACE.lg,
      marginBottom: SPACE.sm,
      paddingHorizontal: SPACE.md,
      height: 42,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.05)' : colors.border,
    },
    searchIcon: { marginRight: SPACE.sm },
    searchInput: { flex: 1, fontFamily: FONT_FAMILY.body, fontSize: 14, color: colors.textPrimary, height: '100%' },

    chipRow: {
      paddingHorizontal: SPACE.lg,
      paddingBottom: SPACE.sm,
      gap: 8,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: RADIUS.full,
      backgroundColor: isDark ? '#1C1C1E' : colors.surface,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.05)' : colors.border,
    },
    chipActive: {
      backgroundColor: colors.accentPrimary,
      borderColor: colors.accentPrimary,
    },
    chipText: {
      fontFamily: FONT_FAMILY.medium,
      fontSize: 11,
      color: colors.textMuted,
    },
    chipTextActive: {
      color: '#ffffff',
      fontFamily: FONT_FAMILY.bold,
    },

    list: { paddingHorizontal: SPACE.lg, paddingBottom: 120 },

    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: SPACE.sm,
      paddingHorizontal: 2,
    },
    sectionHeaderTitle: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 12,
      color: colors.accentPrimary,
      letterSpacing: 0.5,
    },
    sectionHeaderSub: {
      fontFamily: FONT_FAMILY.body,
      fontSize: 10,
      color: colors.textMuted,
    },

    templateSwapCard: {
      backgroundColor: isDark ? '#1C1C1E' : colors.surface,
      borderRadius: RADIUS.lg,
      padding: SPACE.md,
      marginBottom: SPACE.sm,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(165,153,255,0.18)' : 'rgba(108,92,231,0.2)',
    },
    templateSwapCardExact: {
      borderColor: colors.accentPrimary,
      backgroundColor: isDark ? '#1A1824' : '#F0EFF7',
    },
    templateCardTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 6,
    },
    dayOriginPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: isDark ? 'rgba(165,153,255,0.12)' : 'rgba(108,92,231,0.1)',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: RADIUS.sm,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(165,153,255,0.2)' : 'rgba(108,92,231,0.2)',
    },
    dayOriginText: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 10,
      color: colors.accentPrimary,
    },
    templateCardBody: {
      marginVertical: 4,
    },
    templateExName: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 16,
      color: colors.textPrimary,
      marginBottom: 2,
      textTransform: 'capitalize',
    },
    templateExMeta: {
      fontFamily: FONT_FAMILY.body,
      fontSize: 12,
      color: colors.textMuted,
    },
    templateCardFooter: {
      marginTop: 6,
      paddingTop: 6,
      borderTopWidth: 1,
      borderTopColor: isDark ? 'rgba(255,255,255,0.05)' : colors.border,
      flexDirection: 'row',
      justifyContent: 'flex-end',
    },
    templateTapHint: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 11,
      color: colors.accentPrimary,
    },

    aiStatusBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: isDark ? 'rgba(165,153,255,0.08)' : 'rgba(108,92,231,0.08)',
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: RADIUS.md,
      marginBottom: SPACE.md,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(165,153,255,0.15)' : 'rgba(108,92,231,0.15)',
    },
    aiStatusTitle: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 12,
      color: colors.accentPrimary,
    },

    exerciseRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: isDark ? '#1C1C1E' : colors.surface,
      padding: SPACE.md,
      borderRadius: RADIUS.md,
      marginBottom: SPACE.sm,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.05)' : colors.border,
    },
    exInfo: { flex: 1, paddingRight: SPACE.sm },
    exName: { fontFamily: FONT_FAMILY.bold, fontSize: 15, color: colors.textPrimary, marginBottom: 2, textTransform: 'capitalize' },
    exTarget: { fontFamily: FONT_FAMILY.body, fontSize: 12, color: colors.textMuted },
    exReason: { fontFamily: FONT_FAMILY.body, fontSize: 11, color: colors.accentPrimary, marginTop: 2 },

    templateBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      backgroundColor: isDark ? 'rgba(165,153,255,0.1)' : 'rgba(108,92,231,0.1)',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: RADIUS.sm,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(165,153,255,0.2)' : 'rgba(108,92,231,0.2)',
    },
    templateBadgeText: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 9,
      color: colors.accentPrimary,
    },

    musclePill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
    muscleDot: { width: 6, height: 6, borderRadius: 3, marginRight: 4 },
    muscleText: { fontFamily: FONT_FAMILY.bold, fontSize: 10, textTransform: 'uppercase' },

    emptyState: { alignItems: 'center', marginTop: 60, gap: SPACE.md },
    emptyText: { fontFamily: FONT_FAMILY.body, fontSize: 14, color: colors.textMuted },
  });
