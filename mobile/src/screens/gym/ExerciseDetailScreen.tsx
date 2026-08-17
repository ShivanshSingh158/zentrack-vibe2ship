import React, { useState, useEffect, useMemo } from 'react';
import { formatDateShort, parseLocalDate } from '../../utils/dateUtils';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Platform, TextInput, KeyboardAvoidingView, ScrollView, Switch, Alert, ActivityIndicator, AppState } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import YoutubeIframe from 'react-native-youtube-iframe';
import { FONT_FAMILY, SPACE, RADIUS, SHADOW } from '../../theme/tokens';
import { useWellnessData } from '../../contexts/domains/WellnessContext';
import { useGymLog, planDayIndexForDate, getCustomPlanDay } from '../../hooks/useGymLog';
import { GYM_PLAN } from '../../data/gymPlan';
import { resolveMuscleColor, hexToRgba, MUSCLE_CANONICAL } from '../../utils/gymUtils';
import { GymExerciseLog, GymNavigationParamList } from '../../types/gym.types';
import { hapticMedium, hapticLight, hapticSuccess } from '../../utils/haptics';
import { useTheme } from "../../contexts/ThemeContext";
import { StatusBar } from 'expo-status-bar';
import { autoResolveExerciseVideoId } from '../../services/exerciseVideoResolver';

const extractVideoId = (urlOrId: string) => {
  if (!urlOrId) return '';
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = urlOrId.match(regExp);
  return (match && match[2].length === 11) ? match[2] : urlOrId;
};

export default function ExerciseDetailScreen() {
    const { colors, isDark } = useTheme();
    const styles = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const navigation = useNavigation<NativeStackNavigationProp<GymNavigationParamList>>();
  const route = useRoute<RouteProp<GymNavigationParamList, 'ExerciseDetail'>>();
  const exerciseId = route.params?.exerciseId;
  const date = route.params?.date || '';
  
  const { gymLogs, userGymPlan, updateMasterPlan } = useWellnessData();
  const { log, updateExercise, deleteExercise } = useGymLog(date); // Only works if date is passed

  const currentExercise = log?.exercises?.find(e => e.exerciseId === exerciseId);

  // Local state for the form
  const [name, setName] = useState('');
  const [muscle, setMuscle] = useState('');
  const [targetSets, setTargetSets] = useState('');
  const [targetReps, setTargetReps] = useState('');
  const [restTimeSecs, setRestTimeSecs] = useState('');
  const [videoLink, setVideoLink] = useState('');
  const [showVideo, setShowVideo] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [showMuscleDropdown, setShowMuscleDropdown] = useState(false);
  
  const [appState, setAppState] = useState(AppState.currentState);

  useEffect(() => {
    const sub = AppState.addEventListener('change', nextState => setAppState(nextState));
    return () => sub.remove();
  }, []);

  const muscleSuggestions = useMemo(() => {
    if (!muscle || !showMuscleDropdown) return [];
    const txt = muscle.toLowerCase();
    const suggestions: string[] = [];
    Object.keys(MUSCLE_CANONICAL).forEach(k => {
      if (k.includes(txt) || MUSCLE_CANONICAL[k].toLowerCase().includes(txt)) {
        if (!suggestions.includes(k)) suggestions.push(k);
      }
    });
    return suggestions.map(s => s.replace(/\b\w/g, c => c.toUpperCase()));
  }, [muscle, showMuscleDropdown]);

  useEffect(() => {
    setVideoReady(false);
  }, [showVideo]);

  const [saveGlobal, setSaveGlobal] = useState(false);
  const [isRefreshingVideo, setIsRefreshingVideo] = useState(false);

  // Initialize form
  useEffect(() => {
    if (currentExercise) {
      setName(currentExercise.name || '');
      setMuscle(currentExercise.muscle || 'General');
      setTargetSets(currentExercise.targetSets?.toString() || '');
      setTargetReps(currentExercise.targetReps || '');
      setRestTimeSecs(currentExercise.restTimeSecs?.toString() || '90');
      if (currentExercise.videoId) {
        setVideoLink(`https://youtube.com/watch?v=${currentExercise.videoId}`);
      }
    } else {
      // Fallback if accessed without a date
      let fallbackDef: any = null;
      Object.values(GYM_PLAN).forEach(day => {
        const found = day.exercises.find(e => e.id === exerciseId);
        if (found) fallbackDef = found;
      });
      if (fallbackDef) {
        setName(fallbackDef.name || '');
        setMuscle(fallbackDef.muscle || 'General');
        setTargetSets(fallbackDef.targetSets?.toString() || '');
        setTargetReps(fallbackDef.targetReps || '');
        setRestTimeSecs('90');
        if (fallbackDef.videoId) {
          setVideoLink(`https://youtube.com/watch?v=${fallbackDef.videoId}`);
        }
      }
    }
  }, [currentExercise, exerciseId]);

  // Auto-resolve form video link if missing
  useEffect(() => {
    if (!name || videoLink) return;
    let isCancelled = false;

    autoResolveExerciseVideoId(name).then(resolvedId => {
      if (isCancelled || !resolvedId) return;
      setVideoLink(`https://youtube.com/watch?v=${resolvedId}`);
    });

    return () => { isCancelled = true; };
  }, [name, videoLink]);

  // Find history
  const history = gymLogs
    .map(l => ({
      date: l.date,
      ex: l.exercises?.find(e => e.exerciseId === exerciseId) as GymExerciseLog | undefined
    }))
    .filter(item => item.ex)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5); // Last 5 times

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return formatDateShort(d.toISOString().slice(0,10)) + ' ' + d.getFullYear();
  };

  const handleDelete = () => {
    const exName = name || currentExercise?.name || 'this exercise';
    Alert.alert(
      "Remove Exercise",
      `How would you like to remove "${exName}"?`,
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Today Only", 
          onPress: () => {
            if (!log) return;
            const index = log.exercises.findIndex(e => e.exerciseId === exerciseId);
            if (index !== -1) {
              hapticMedium();
              deleteExercise(index);
              navigation.goBack();
            }
          } 
        },
        {
          text: "Today & All Future Days",
          style: "destructive",
          onPress: async () => {
            if (!log) return;
            const index = log.exercises.findIndex(e => e.exerciseId === exerciseId);
            if (index !== -1) {
              hapticMedium();
              deleteExercise(index);
              
              if (date) {
                const planIdx = planDayIndexForDate(date);
                const currentMasterDay = getCustomPlanDay(userGymPlan?.customDays, planIdx) || GYM_PLAN.find(d => d.dayIndex === planIdx);
                if (currentMasterDay) {
                  const targetName = (exName || '').toLowerCase().trim();
                  const updatedExercises = currentMasterDay.exercises.filter((e: any) => {
                    const isIdMatch = (e.id && e.id === exerciseId) || (e.exerciseId && e.exerciseId === exerciseId);
                    const isNameMatch = targetName && (e.name || '').toLowerCase().trim() === targetName;
                    return !(isIdMatch || isNameMatch);
                  });
                  await updateMasterPlan(planIdx, { ...currentMasterDay, exercises: updatedExercises });
                }
              }
              navigation.goBack();
            }
          }
        }
      ]
    );
  };

  const handleSave = async () => {
    if (!log || !currentExercise || !date) {
      navigation.goBack();
      return;
    }
    
    hapticMedium();
    const index = log.exercises.findIndex(e => e.exerciseId === exerciseId);
    if (index === -1) return;
    
    const parsedTargetSets = parseInt(targetSets, 10) || 1;
    
    const updated: GymExerciseLog = {
      ...currentExercise,
      name: name || 'Custom Exercise',
      muscle: muscle || 'General',
      targetSets: parsedTargetSets,
      targetReps: targetReps || '10',
      restTimeSecs: parseInt(restTimeSecs, 10) || 90,
      videoId: extractVideoId(videoLink)
    };
    
    // Adjust setsLog length if target sets increased
    if (parsedTargetSets > updated.setsLog.length) {
      for (let i = updated.setsLog.length; i < parsedTargetSets; i++) {
        updated.setsLog.push({ setNumber: i + 1, reps: null, weight: null, completed: false });
      }
    }
    
    updateExercise(index, updated);

    if (saveGlobal) {
      const planIdx = planDayIndexForDate(date);
      const currentMasterDay = getCustomPlanDay(userGymPlan?.customDays, planIdx) || GYM_PLAN.find(d => d.dayIndex === planIdx);
      if (currentMasterDay) {
        const exists = currentMasterDay.exercises.some((e: any) => e.id === exerciseId);
        let updatedExercises = [...currentMasterDay.exercises];
        if (exists) {
          updatedExercises = updatedExercises.map(e =>
            e.id === exerciseId
              ? { ...e, name: updated.name, muscle: updated.muscle, targetSets: updated.targetSets, targetReps: updated.targetReps, videoId: updated.videoId }
              : e
          );
        } else {
          updatedExercises.push({
            id: exerciseId,
            name: updated.name,
            muscle: updated.muscle,
            targetSets: updated.targetSets,
            targetReps: updated.targetReps,
            videoId: updated.videoId
          });
        }
        await updateMasterPlan(planIdx, { ...currentMasterDay, exercises: updatedExercises });
      }
    }

    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <StatusBar style={isDark ? 'light' : 'dark'} backgroundColor={colors.background} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="chevron-down" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit Exercise</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <TouchableOpacity onPress={handleDelete} style={{ padding: 6 }}>
              <Ionicons name="trash-outline" size={22} color="#FF453A" />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSave} style={styles.saveBtn}>
              <Text style={styles.saveBtnText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          
          {/* Header Preview */}
          <View style={styles.previewHeader}>
            <View style={[styles.musclePill, { backgroundColor: hexToRgba(colors.accentPrimary, 0.15) }]}>
              <View style={[styles.muscleDot, { backgroundColor: colors.accentPrimary }]} />
              <Text style={[styles.muscleText, { color: colors.accentPrimary }]}>{muscle || 'General'}</Text>
            </View>
          </View>

          {/* Form Fields */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Exercise Name</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Bulgarian Split Squats"
              placeholderTextColor={colors.textMuted}
            />
          </View>

          <View style={styles.rowForm}>
            <View style={[styles.formGroup, { flex: 1, zIndex: 10 }]}>
              <Text style={styles.label}>Muscle Focus</Text>
              <TextInput
                style={styles.input}
                value={muscle}
                onChangeText={(t) => { setMuscle(t); setShowMuscleDropdown(true); }}
                onFocus={() => setShowMuscleDropdown(true)}
                onBlur={() => setTimeout(() => setShowMuscleDropdown(false), 200)} // Delay so tap registers
                placeholder="e.g. Quads"
                placeholderTextColor={colors.textMuted}
              />
              {showMuscleDropdown && muscleSuggestions.length > 0 && (
                <View style={styles.dropdown}>
                  {muscleSuggestions.slice(0, 5).map(sug => (
                    <TouchableOpacity 
                      key={sug} 
                      style={styles.dropdownItem}
                      onPress={() => {
                        setMuscle(sug);
                        setShowMuscleDropdown(false);
                      }}
                    >
                      <Text style={styles.dropdownText}>{sug}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
            <View style={{ width: 16 }} />
            <View style={[styles.formGroup, { flex: 1, zIndex: 1 }]}>
              <Text style={styles.label}>Rest Time (sec)</Text>
              <TextInput
                style={styles.input}
                value={restTimeSecs}
                onChangeText={setRestTimeSecs}
                keyboardType="numeric"
                placeholder="e.g. 90"
                placeholderTextColor={colors.textMuted}
              />
            </View>
          </View>

          <View style={styles.rowForm}>
            <View style={[styles.formGroup, { flex: 1 }]}>
              <Text style={styles.label}>Target Sets</Text>
              <TextInput
                style={styles.input}
                value={targetSets}
                onChangeText={setTargetSets}
                keyboardType="numeric"
                placeholder="e.g. 3"
                placeholderTextColor={colors.textMuted}
              />
            </View>
            <View style={{ width: 16 }} />
            <View style={[styles.formGroup, { flex: 1 }]}>
              <Text style={styles.label}>Target Reps</Text>
              <TextInput
                style={styles.input}
                value={targetReps}
                onChangeText={setTargetReps}
                placeholder="e.g. 8-10"
                placeholderTextColor={colors.textMuted}
              />
            </View>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>YouTube Video Link</Text>
            <View style={styles.videoInputRow}>
              <TextInput
                style={[styles.input, { flex: 1, marginBottom: 0 }]}
                value={videoLink}
                onChangeText={setVideoLink}
                placeholder="https://youtube.com/..."
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
              />
              {!!videoLink && (
                <TouchableOpacity 
                  style={styles.previewVideoBtn} 
                  onPress={() => { hapticLight(); setShowVideo(!showVideo); }}
                >
                  <Ionicons name={showVideo ? "eye-off" : "play"} size={20} color={colors.background} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {showVideo && extractVideoId(videoLink) && (
            <View style={styles.videoContainer}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, paddingHorizontal: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="logo-youtube" size={16} color="#ff453a" />
                  <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 12, color: colors.textPrimary }}>Form Guide Demonstration</Text>
                </View>

                <TouchableOpacity
                  onPress={async () => {
                    if (isRefreshingVideo || !name) return;
                    hapticMedium();
                    setIsRefreshingVideo(true);
                    try {
                      const freshId = await autoResolveExerciseVideoId(name, true);
                      if (freshId) {
                        setVideoLink(`https://youtube.com/watch?v=${freshId}`);
                        hapticSuccess();
                      }
                    } catch (e) {
                      console.warn('[Refresh Video Detail] Error:', e);
                    } finally {
                      setIsRefreshingVideo(false);
                    }
                  }}
                  disabled={isRefreshingVideo}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 }}
                >
                  {isRefreshingVideo ? (
                    <ActivityIndicator size="small" color="#a599ff" />
                  ) : (
                    <Ionicons name="refresh" size={13} color="#a599ff" />
                  )}
                  <Text style={{ fontSize: 11, fontFamily: FONT_FAMILY.bold, color: '#a599ff' }}>
                    {isRefreshingVideo ? 'Refreshing...' : 'Refresh'}
                  </Text>
                </TouchableOpacity>
              </View>

              <YoutubeIframe 
                play={true} 
                height={200} 
                videoId={extractVideoId(videoLink)} 
                onError={async (err: any) => {
                  console.warn('[ExerciseDetail Error] Video unavailable:', name, err);
                  const freshId = await autoResolveExerciseVideoId(name, true);
                  if (freshId) {
                    setVideoLink(`https://youtube.com/watch?v=${freshId}`);
                  }
                }}
                initialPlayerParams={{ modestbranding: true, rel: false }} 
                webViewProps={{
                  androidLayerType: appState === 'active' ? 'hardware' : 'software',
                  domStorageEnabled: true,
                  javaScriptEnabled: true,
                }}
              />
            </View>
          )}

          <View style={styles.divider} />

          {/* Master Split Toggle */}
          <View style={styles.masterSplitContainer}>
            <View style={{ flex: 1 }}>
              <Text style={styles.masterSplitTitle}>Save to Master Split</Text>
              <Text style={styles.masterSplitDesc}>Update this exercise for all future workouts on this day.</Text>
            </View>
            <Switch
              value={saveGlobal}
              onValueChange={setSaveGlobal}
              trackColor={{ false: 'rgba(255,255,255,0.1)', true: colors.accentPrimary }}
              thumbColor={Platform.OS === 'ios' ? '#fff' : saveGlobal ? '#fff' : '#f4f3f4'}
            />
          </View>

          <View style={styles.divider} />

          {/* History */}
          <Text style={styles.sectionTitle}>Past 5 Sessions</Text>
          {history.length > 0 ? history.map((item, index) => {
            const ex = item.ex!;
            const maxWeight = Math.max(0, ...ex.setsLog.filter(s => s.completed && s.weight).map(s => s.weight as number));
            const completedSets = ex.setsLog.filter(s => s.completed).length;

            return (
              <View key={index} style={styles.historyItem}>
                <View style={styles.historyHeader}>
                  <Text style={styles.historyDate}>{formatDate(item.date)}</Text>
                  <Text style={styles.historySummary}>
                    {completedSets} sets {maxWeight > 0 ? `· Max ${maxWeight}kg` : ''}
                  </Text>
                </View>
                <View style={styles.setsList}>
                  {ex.setsLog.map((s, idx) => (
                    <View key={idx} style={[styles.setBubble, s.completed ? styles.setBubbleCompleted : styles.setBubbleMissed]}>
                      <Text style={[styles.setBubbleText, !s.completed && { opacity: 0.5 }]}>
                        {s.reps || '--'} {s.weight ? `@ ${s.weight}` : ''}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            );
          }) : (
            <View style={styles.emptyState}>
              <Ionicons name="time-outline" size={32} color={colors.textMuted} />
              <Text style={styles.emptyText}>No previous logs found for this exercise.</Text>
            </View>
          )}

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const makeStyles = (colors: any, isDark: boolean = true) => StyleSheet.create({
      root: { flex: 1, backgroundColor: isDark ? '#000000' : colors.background },
      header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: SPACE.xl,
        paddingTop: Platform.OS === 'ios' ? 10 : 20,
        paddingBottom: SPACE.md,
        borderBottomWidth: 1,
        borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : colors.border,
      },
      backBtn: { padding: SPACE.xs },
      headerTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 16, color: colors.textPrimary },
      saveBtn: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: isDark ? 'rgba(165,153,255,0.15)' : 'rgba(108,92,231,0.12)', borderRadius: RADIUS.sm },
      saveBtnText: { fontFamily: FONT_FAMILY.bold, fontSize: 14, color: colors.accentPrimary },
      
      scrollContent: { padding: SPACE.xl, paddingBottom: 100 },
      
      previewHeader: { alignItems: 'center', marginBottom: SPACE.lg },
      musclePill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
      muscleDot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
      muscleText: { fontFamily: FONT_FAMILY.bold, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 },
      formGroup: { marginBottom: SPACE.lg },
  dropdown: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    backgroundColor: isDark ? '#1C1C1E' : colors.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: isDark ? 'rgba(255,255,255,0.05)' : colors.border,
    zIndex: 999,
    elevation: 5,
    maxHeight: 180,
  },
  dropdownItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : colors.border,
  },
  dropdownText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontFamily: FONT_FAMILY.medium,
  },
  inputGroup: { marginBottom: SPACE.lg },
      rowForm: { flexDirection: 'row', justifyContent: 'space-between' },
      label: { fontFamily: FONT_FAMILY.bold, fontSize: 12, color: colors.textMuted, marginBottom: 8, letterSpacing: 0.5 },
      input: {
        backgroundColor: isDark ? '#1C1C1E' : colors.surface,
        borderRadius: RADIUS.md,
        paddingHorizontal: 16,
        height: 48,
        fontFamily: FONT_FAMILY.body,
        fontSize: 15,
        color: colors.textPrimary,
        borderWidth: 1,
        borderColor: isDark ? 'rgba(255,255,255,0.05)' : colors.border,
      },
      
      videoInputRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
      previewVideoBtn: {
        width: 48,
        height: 48,
        borderRadius: RADIUS.md,
        backgroundColor: colors.accentPrimary,
        alignItems: 'center',
        justifyContent: 'center',
      },
      videoContainer: { width: '100%', borderRadius: RADIUS.md, overflow: 'hidden', marginBottom: SPACE.xl, marginTop: SPACE.sm },
      
      masterSplitContainer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: SPACE.md },
      masterSplitTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 16, color: colors.textPrimary, marginBottom: 4 },
      masterSplitDesc: { fontFamily: FONT_FAMILY.body, fontSize: 12, color: colors.textMuted },

      divider: { height: 1, backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : colors.border, marginVertical: SPACE.xl },
      sectionTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 18, color: colors.textPrimary, marginBottom: SPACE.md },
      
      historyItem: {
        backgroundColor: isDark ? '#1C1C1E' : colors.surface,
        borderRadius: RADIUS.md,
        padding: SPACE.md,
        marginBottom: SPACE.md,
        borderWidth: 1,
        borderColor: isDark ? 'rgba(255,255,255,0.05)' : colors.border,
      },
      historyHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACE.md },
      historyDate: { fontFamily: FONT_FAMILY.bold, fontSize: 14, color: colors.textPrimary },
      historySummary: { fontFamily: FONT_FAMILY.body, fontSize: 12, color: colors.accentPrimary },
      
      setsList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
      setBubble: { backgroundColor: isDark ? '#2C2C2E' : colors.surface2, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
      setBubbleCompleted: { backgroundColor: isDark ? 'rgba(165,153,255, 0.15)' : 'rgba(108,92,231,0.12)' },
      setBubbleMissed: { backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.03)' },
      setBubbleText: { fontFamily: FONT_FAMILY.bold, fontSize: 12, color: colors.textPrimary },
      
      emptyState: { alignItems: 'center', marginTop: 20, gap: SPACE.md },
      emptyText: { fontFamily: FONT_FAMILY.body, fontSize: 14, color: colors.textMuted },
      
      deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16, backgroundColor: 'rgba(255, 69, 58, 0.1)', borderRadius: RADIUS.md },
      deleteBtnText: { fontFamily: FONT_FAMILY.bold, fontSize: 15, color: '#FF453A' },
    });
