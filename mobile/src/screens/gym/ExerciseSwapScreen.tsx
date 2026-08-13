import React, { useState, useMemo, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, TextInput, ScrollView, Platform, KeyboardAvoidingView, ActivityIndicator } from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { FONT_FAMILY, SPACE, RADIUS, SHADOW } from '../../theme/tokens';
import { useGymLog, todayStr } from '../../hooks/useGymLog';
import { GYM_PLAN } from '../../data/gymPlan';
import { EXERCISE_DATABASE } from '../../data/exerciseDatabase';
import { resolveMuscleColor, hexToRgba } from '../../utils/gymUtils';
import { hapticMedium, hapticSuccess } from '../../utils/haptics';
import { callProxy } from '../../services/geminiProxy';
import { autoResolveExerciseVideoId } from '../../services/exerciseVideoResolver';
import { GymNavigationParamList } from '../../types/gym.types';
import { useTheme } from "../../contexts/ThemeContext";

export interface AiSwapRecommendation {
  id: string;
  name: string;
  muscle: string;
  targetSets: number;
  targetReps: string;
  restTimeSecs: number;
  reason: string;
  videoId?: string;
}

export default function ExerciseSwapScreen() {
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const navigation = useNavigation<NativeStackNavigationProp<GymNavigationParamList>>();
  const route = useRoute<RouteProp<GymNavigationParamList, 'ExerciseSwap'>>();
  const originalExerciseId = route.params?.originalExerciseId;
  const date = route.params?.date || todayStr();

  const { log, updateExercise } = useGymLog(date);
  const [activeTab, setActiveTab] = useState<'ai' | 'all'>('ai');
  const [search, setSearch] = useState('');

  const [aiSwaps, setAiSwaps] = useState<AiSwapRecommendation[]>([]);
  const [isAiLoading, setIsAiLoading] = useState(true);

  // Find original exercise being swapped
  const originalExercise = useMemo(() => {
    if (!log || !originalExerciseId) return null;
    return log.exercises.find(e => e.exerciseId === originalExerciseId || e.id === originalExerciseId);
  }, [log, originalExerciseId]);

  // Load AI recommendations
  useEffect(() => {
    let isCancelled = false;

    const origName = originalExercise?.name || 'Exercise';
    const rawMuscle = originalExercise?.muscle || 'Chest';
    const origMuscle = (rawMuscle === 'None' || !rawMuscle)
      ? (origName.toLowerCase().includes('bicep') ? 'Biceps' : origName.toLowerCase().includes('tricep') ? 'Triceps' : origName.toLowerCase().includes('row') || origName.toLowerCase().includes('pull') ? 'Back' : origName.toLowerCase().includes('press') || origName.toLowerCase().includes('dip') ? 'Chest' : origName.toLowerCase().includes('squat') || origName.toLowerCase().includes('leg') ? 'Quads' : origName.toLowerCase().includes('shoulder') || origName.toLowerCase().includes('raise') ? 'Shoulders' : 'Chest')
      : rawMuscle;

    const origSets = originalExercise?.targetSets || 3;
    const origReps = originalExercise?.targetReps || '8-12';
    const origRest = originalExercise?.restTimeSecs || 90;

    // 1. Immediate Instant Fallback (0ms latency)
    let alternativesList = EXERCISE_DATABASE.filter(db => db.muscle.toLowerCase() === origMuscle.toLowerCase());
    if (alternativesList.length === 0) {
      alternativesList = EXERCISE_DATABASE.filter(db => 
        db.muscle.toLowerCase().includes(origMuscle.toLowerCase()) || 
        origMuscle.toLowerCase().includes(db.muscle.toLowerCase())
      );
    }
    if (alternativesList.length === 0) {
      alternativesList = EXERCISE_DATABASE.filter(db => db.muscle.includes('Chest'));
    }

    const instantFallback: AiSwapRecommendation[] = alternativesList.slice(0, 6).map((alt, idx) => {
      const n = (alt.name || '').toLowerCase();
      const m = (origMuscle || '').toLowerCase();
      let targetSets = 3;
      let targetReps = '10–12';
      let restTimeSecs = 75;

      if (n.includes('farmer') || n.includes('hang') || n.includes('pinch') || n.includes('hold')) {
        targetSets = 3; targetReps = '30–45s hold'; restTimeSecs = 45;
      } else if (m.includes('forearm') || n.includes('wrist') || n.includes('reverse curl')) {
        targetSets = 3; targetReps = '15–20'; restTimeSecs = 45;
      } else if (m.includes('calf') || m.includes('calves') || n.includes('calf')) {
        targetSets = 4; targetReps = '15–20'; restTimeSecs = 60;
      } else if (m.includes('abs') || m.includes('core') || n.includes('crunch') || n.includes('plank')) {
        targetSets = 3; targetReps = '15–20'; restTimeSecs = 45;
      } else if (n.includes('deadlift') || n.includes('squat') || n.includes('barbell row') || n.includes('bench press') || n.includes('military press') || n.includes('t-bar') || n.includes('rdl')) {
        targetSets = 4; targetReps = '6–8'; restTimeSecs = 120;
      } else if (n.includes('press') || n.includes('pulldown') || n.includes('dips') || n.includes('row')) {
        targetSets = 3; targetReps = '8–12'; restTimeSecs = 90;
      } else if (n.includes('raise') || n.includes('fly') || n.includes('extension') || n.includes('curl')) {
        targetSets = 3; targetReps = '12–15'; restTimeSecs = 60;
      }

      return {
        id: `ai_fallback_${idx}_${Date.now()}`,
        name: alt.name,
        muscle: origMuscle,
        targetSets,
        targetReps,
        restTimeSecs,
        reason: '',
        videoId: alt.videoId && alt.videoId !== '1' ? alt.videoId : undefined,
      };
    });

    setAiSwaps(instantFallback);
    setIsAiLoading(true);

    // 2. Fetch Live AI Analysis from S.A.R.A.
    async function fetchAiSwaps() {
      try {
        const prompt = `Exercise to swap: "${origName}" (Muscle Group: ${origMuscle}).
Read the exercise name "${origName}" carefully to understand its exact movement mechanics, angle, equipment, and targeted muscle group (${origMuscle}).
Generate EXACTLY 6 non-repetitive, biomechanically equivalent exercise alternatives for "${origName}".
For EACH alternative exercise, assign realistic specific targetSets (3 or 4), targetReps ('6-8' for heavy compound, '8-12' for press/pull, '12-15' for isolation, '15-20' or '30-45s' for forearms/grip/calves), and restTimeSecs (45, 60, 90, or 120) tailored to that specific exercise.

Return ONLY a raw valid JSON array of 6 objects:
[
  {
    "name": "Exercise Name",
    "muscle": "${origMuscle}",
    "targetSets": 3,
    "targetReps": "8-12",
    "restTimeSecs": 90
  }
]`;

        const res = await callProxy({
          contents: [{ parts: [{ text: prompt }] }],
          systemInstruction: `You are S.A.R.A, ZenTrack's AI gym coach. Read exercise names carefully and output ONLY valid JSON arrays of 6 exercise recommendations with realistic sets, reps, and rest times. No markdown text.`,
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 600,
          }
        });

        if (isCancelled) return;

        const textResult = res?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (textResult) {
          const cleanJsonStr = textResult.replace(/```json/g, '').replace(/```/g, '').trim();
          const parsed = JSON.parse(cleanJsonStr);
          if (Array.isArray(parsed) && parsed.length >= 4) {
            const formattedPromises = parsed.slice(0, 6).map(async (item: any, i: number) => {
              const exName = item.name || instantFallback[i]?.name || 'Alternative Exercise';
              const vidId = (await autoResolveExerciseVideoId(exName)) || instantFallback[i]?.videoId || '';
              return {
                id: `sara_ai_${i}_${Date.now()}`,
                name: exName,
                muscle: item.muscle || origMuscle,
                targetSets: typeof item.targetSets === 'number' ? item.targetSets : instantFallback[i]?.targetSets || 3,
                targetReps: item.targetReps || instantFallback[i]?.targetReps || '8-12',
                restTimeSecs: typeof item.restTimeSecs === 'number' ? item.restTimeSecs : instantFallback[i]?.restTimeSecs || 60,
                reason: '',
                videoId: vidId,
              };
            });
            const formatted = await Promise.all(formattedPromises);
            setAiSwaps(formatted);
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
  }, [originalExercise]);

  // Flatten all unique exercises for 'All' tab from EXERCISE_DATABASE
  const allExercises = useMemo(() => {
    return EXERCISE_DATABASE.map(ex => ({
      id: ex.id,
      name: ex.name,
      muscle: ex.muscle,
      aliases: ex.aliases
    })).sort((a, b) => a.name.localeCompare(b.name));
  }, []);

  const filteredExercises = useMemo(() => {
    if (!search.trim()) return allExercises;
    const lower = search.toLowerCase();
    return allExercises.filter(ex => 
      ex.name.toLowerCase().includes(lower) || 
      ex.muscle?.toLowerCase().includes(lower) || 
      (ex.aliases && ex.aliases.some(alias => alias.toLowerCase().includes(lower)))
    );
  }, [allExercises, search]);

  const handleSwap = async (newExDef: any) => {
    if (!log || !originalExerciseId) return;

    const index = log.exercises.findIndex(e => e.exerciseId === originalExerciseId || e.id === originalExerciseId);
    if (index === -1) return;

    hapticSuccess();

    const existingLog = log.exercises[index];

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
    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.root}>
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

            <View style={[styles.musclePill, { backgroundColor: hexToRgba(resolveMuscleColor(originalExercise.muscle), 0.15) }]}>
              <View style={[styles.muscleDot, { backgroundColor: resolveMuscleColor(originalExercise.muscle) }]} />
              <Text style={[styles.muscleText, { color: resolveMuscleColor(originalExercise.muscle) }]}>{originalExercise.muscle}</Text>
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
            <Text style={[styles.tabBtnText, activeTab === 'ai' && styles.tabBtnTextActive]}>S.A.R.A AI Swaps (6)</Text>
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
                placeholder="Search exercise name or muscle group..."
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

            <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
              {filteredExercises.map(ex => (
                <TouchableOpacity
                  key={ex.id}
                  style={styles.exerciseRow}
                  onPress={() => handleSwap(ex)}
                  activeOpacity={0.7}
                >
                  <View style={styles.exInfo}>
                    <Text style={styles.exName}>{ex.name}</Text>
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
            <View style={styles.aiStatusBanner}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="sparkles" size={16} color="#a599ff" />
                <Text style={styles.aiStatusTitle}>S.A.R.A AI Biomechanical Analysis</Text>
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

const makeStyles = (colors: any) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: '#0D0D0E' },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: SPACE.lg,
      paddingTop: Platform.OS === 'ios' ? 44 : 20,
      paddingBottom: SPACE.sm,
      borderBottomWidth: 1,
      borderBottomColor: 'rgba(255,255,255,0.05)',
    },
    backBtn: { padding: SPACE.xs },
    headerTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 13, color: '#ffffff', letterSpacing: 1.5 },
    headerSub: { fontFamily: FONT_FAMILY.body, fontSize: 11, color: colors.textMuted, marginTop: 2 },

    originalCard: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: '#161618',
      marginHorizontal: SPACE.lg,
      marginTop: SPACE.md,
      marginBottom: SPACE.sm,
      padding: SPACE.md,
      borderRadius: RADIUS.lg,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.06)',
    },
    originalCardLeft: { flex: 1, paddingRight: 8 },
    originalCardLabel: { fontFamily: FONT_FAMILY.bold, fontSize: 9, color: colors.textMuted, letterSpacing: 1.2, marginBottom: 2 },
    originalCardName: { fontFamily: FONT_FAMILY.bold, fontSize: 15, color: '#ffffff', textTransform: 'capitalize' },
    originalCardMeta: { fontFamily: FONT_FAMILY.body, fontSize: 11, color: colors.textMuted, marginTop: 2 },

    tabContainer: {
      flexDirection: 'row',
      marginHorizontal: SPACE.lg,
      marginVertical: SPACE.md,
      backgroundColor: '#161618',
      borderRadius: RADIUS.lg,
      padding: 3,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.06)',
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
      backgroundColor: '#a599ff',
    },
    tabBtnText: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 12,
      color: colors.textMuted,
    },
    tabBtnTextActive: {
      color: '#000000',
    },

    searchContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#161618',
      marginHorizontal: SPACE.lg,
      marginBottom: SPACE.md,
      paddingHorizontal: SPACE.md,
      height: 42,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.05)',
    },
    searchIcon: { marginRight: SPACE.sm },
    searchInput: { flex: 1, fontFamily: FONT_FAMILY.body, fontSize: 14, color: colors.textPrimary, height: '100%' },

    list: { paddingHorizontal: SPACE.lg, paddingBottom: 120 },

    aiStatusBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: 'rgba(165,153,255,0.08)',
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: RADIUS.md,
      marginBottom: SPACE.md,
      borderWidth: 1,
      borderColor: 'rgba(165,153,255,0.15)',
    },
    aiStatusTitle: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 12,
      color: '#a599ff',
    },

    // AI Recommendation Cards
    aiSwapCard: {
      backgroundColor: '#161618',
      borderRadius: RADIUS.xl,
      padding: SPACE.md,
      marginBottom: SPACE.md,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.06)',
      ...SHADOW.sm,
    },
    aiCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: SPACE.sm,
    },
    aiCardTitleCol: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flex: 1,
      paddingRight: 8,
    },
    numBadge: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: 'rgba(165,153,255,0.15)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    numBadgeText: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 10,
      color: '#a599ff',
    },
    aiCardName: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 16,
      color: '#ffffff',
      flex: 1,
    },

    presetsRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: SPACE.sm,
    },
    presetChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: 'rgba(255,255,255,0.04)',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: RADIUS.sm,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.06)',
    },
    presetChipText: {
      fontFamily: FONT_FAMILY.mono,
      fontSize: 11,
      color: '#ffffff',
    },

    reasonBox: {
      flexDirection: 'row',
      gap: 6,
      backgroundColor: 'rgba(165,153,255,0.06)',
      padding: 10,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: 'rgba(165,153,255,0.12)',
      marginBottom: SPACE.sm,
    },
    reasonText: {
      flex: 1,
      fontFamily: FONT_FAMILY.body,
      fontSize: 12,
      color: '#a599ff',
      lineHeight: 16,
    },

    selectBtnRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 4,
      paddingTop: 4,
    },
    selectBtnText: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 12,
      color: '#a599ff',
    },

    exerciseRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: '#161618',
      padding: SPACE.md,
      borderRadius: RADIUS.md,
      marginBottom: SPACE.sm,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.02)',
    },
    exInfo: { flex: 1, paddingRight: SPACE.sm },
    exName: { fontFamily: FONT_FAMILY.bold, fontSize: 15, color: colors.textPrimary, marginBottom: 2, textTransform: 'capitalize' },
    exTarget: { fontFamily: FONT_FAMILY.body, fontSize: 12, color: colors.textMuted },

    musclePill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
    muscleDot: { width: 6, height: 6, borderRadius: 3, marginRight: 4 },
    muscleText: { fontFamily: FONT_FAMILY.bold, fontSize: 10, textTransform: 'uppercase' },

    emptyState: { alignItems: 'center', marginTop: 60, gap: SPACE.md },
    emptyText: { fontFamily: FONT_FAMILY.body, fontSize: 14, color: colors.textMuted },
  });

