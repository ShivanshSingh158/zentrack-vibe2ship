import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, Alert, TextInput, Platform, KeyboardAvoidingView, ScrollView, Modal, ActivityIndicator } from 'react-native';
import Reanimated, { FadeIn, FadeOut } from 'react-native-reanimated';
import YoutubeIframe from 'react-native-youtube-iframe';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONT_FAMILY, SPACE, RADIUS, FONT_SIZE, SHADOW } from '../../theme/tokens';
import { useGymLog } from '../../hooks/useGymLog';
import { useMobileData } from '../../contexts/MobileDataContext';
import { resolveMuscleColor, hexToRgba } from '../../utils/gymUtils';
import { hapticLight, hapticMedium, hapticSuccess } from '../../utils/haptics';
import AnimatedRestTimer from '../../components/Gym/AnimatedRestTimer';
import { EXERCISE_ALTERNATIVES } from '../../data/gymPlan';

export default function ActiveLoggingScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const date = route.params?.date;

  const { log, updateExercise, startRestTimer, clearRestTimer, updateRestTimerDuration, restTimerRemaining, restTimerInitial, swapExercise, makeSwapPermanent, logSetAndStartTimer } = useGymLog(date);
  const [activeExIndex, setActiveExIndex] = useState(route.params?.initialIndex ?? 0);

  useEffect(() => {
    if (route.params?.initialIndex !== undefined) {
      setActiveExIndex(route.params.initialIndex);
    }
  }, [route.params?.initialIndex]);
  const [showVideo, setShowVideo] = useState(false);
  const [showSwapModal, setShowSwapModal] = useState(false);

  const { gymLogs } = useMobileData();

  const lastTimeData = useMemo(() => {
    if (!log || !log.exercises || !gymLogs) return null;
    const currentEx = log.exercises[activeExIndex];
    if (!currentEx) return null;

    const pastLogs = gymLogs
      .filter(l => l.date < date && l.exercises)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      
    for (const pLog of pastLogs) {
      const pastEx = pLog.exercises!.find(e => e.exerciseId === currentEx.exerciseId);
      if (pastEx && pastEx.setsLog && pastEx.setsLog.length > 0) {
        const completedSets = pastEx.setsLog.filter((s: any) => s.completed);
        if (completedSets.length === 0) continue;
        
        const avgReps = Math.round(completedSets.reduce((sum: number, s: any) => sum + (s.reps || 0), 0) / completedSets.length);
        const maxWeight = Math.max(...completedSets.map((s: any) => s.weight || 0));
        
        return `${completedSets.length} sets x ${avgReps} reps @ ${maxWeight}kg`;
      }
    }
    return null;
  }, [log, activeExIndex, gymLogs, date]);

  if (!log || !log.exercises) {
    return (
      <View style={[styles.root, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={COLORS.accentPrimary} />
      </View>
    );
  }

  const exercises = log.exercises.filter(ex => !ex.skipped);
  const safeIndex = Math.min(activeExIndex, Math.max(0, exercises.length - 1));
  const exercise = exercises[safeIndex];

  if (!exercise) {
    return (
      <View style={[styles.root, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: COLORS.textMuted }}>No exercises found.</Text>
      </View>
    );
  }

  const activeSetIndex = exercise.setsLog.findIndex(s => !s.completed);
  const isAllComplete = activeSetIndex === -1;

  const handleBack = () => {
    hapticMedium();
    navigation.goBack();
  };

  const handleTextChange = (setIdx: number, field: 'reps' | 'weight', text: string) => {
    const parsed = field === 'reps' ? parseInt(text, 10) : parseFloat(text);
    const newEx = { ...exercise };
    if (text === '') {
      newEx.setsLog[setIdx] = { ...newEx.setsLog[setIdx], [field]: null };
    } else if (!isNaN(parsed)) {
      newEx.setsLog[setIdx] = { ...newEx.setsLog[setIdx], [field]: parsed };
    }
    updateExercise(log.exercises.findIndex(e => e.id === exercise.id), newEx);
  };

  const handleLogSet = () => {
    if (activeSetIndex === -1) return;
    
    hapticMedium();
    const newEx = { ...exercise };
    newEx.setsLog[activeSetIndex].completed = true;
    logSetAndStartTimer(
      log.exercises.findIndex(e => e.id === exercise.id), 
      newEx, 
      exercise.restTimeSecs || 90, 
      exercise.name
    );
  };

  const handleNextExercise = () => {
    if (activeExIndex < exercises.length - 1) {
      hapticMedium();
      setActiveExIndex(activeExIndex + 1);
    } else {
      hapticSuccess();
      navigation.navigate('WorkoutSummary');
    }
  };

  const handleDeleteSet = (idx: number) => {
    hapticLight();
    const newEx = { ...exercise };
    newEx.setsLog.splice(idx, 1);
    updateExercise(log.exercises.findIndex(e => e.id === exercise.id), newEx);
  };

  const handleAddSet = () => {
    hapticLight();
    const newEx = { ...exercise };
    newEx.setsLog.push({
      setNumber: newEx.setsLog.length + 1,
      reps: null,
      weight: null,
      completed: false,
    });
    updateExercise(log.exercises.findIndex(e => e.id === exercise.id), newEx);
  };

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Exercise {activeExIndex + 1} of {exercises.length}</Text>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.navigate('ExerciseDetail', { exerciseId: exercise.exerciseId, date })}>
            <Ionicons name="ellipsis-horizontal" size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>
        </View>

        {/* Content */}
        <View style={styles.content}>
          <View style={{ paddingTop: 16, zIndex: 10 }}>
            {restTimerRemaining > 0 && (
              <AnimatedRestTimer
                remainingSeconds={restTimerRemaining}
                initialSeconds={restTimerInitial}
                onAdd={() => updateRestTimerDuration(restTimerInitial + 30)}
                onSubtract={() => updateRestTimerDuration(Math.max(10, restTimerInitial - 30))}
                onSkip={() => clearRestTimer()}
              />
            )}
          </View>
          <ScrollView contentContainerStyle={styles.scrollContent}>
            
            <View style={styles.titleArea}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 12 }}>
                <View style={[styles.musclePill, { backgroundColor: hexToRgba(COLORS.accentPrimary, 0.15), marginBottom: 0 }]}>
                  <View style={[styles.muscleDot, { backgroundColor: COLORS.accentPrimary }]} />
                  <Text style={[styles.muscleText, { color: COLORS.accentPrimary }]}>{exercise.muscle}</Text>
                </View>
                <TouchableOpacity 
                  onPress={() => { hapticMedium(); setShowSwapModal(true); }} 
                  style={[styles.musclePill, { backgroundColor: 'rgba(255,255,255,0.1)', marginBottom: 0, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center' }]}
                >
                  <Ionicons name="swap-horizontal" size={14} color={COLORS.textPrimary} />
                  <Text style={[styles.muscleText, { color: COLORS.textPrimary, marginLeft: 4 }]}>SWAP</Text>
                </TouchableOpacity>
              </View>
              
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                <Text style={styles.exerciseName}>{exercise.name}</Text>
                {exercise.videoId && (
                  <TouchableOpacity onPress={() => setShowVideo(!showVideo)} style={styles.videoBtn}>
                    <Ionicons name="play-circle" size={28} color={COLORS.accentPrimary} />
                  </TouchableOpacity>
                )}
              </View>

              <Text style={styles.lastTimeText}>
                {lastTimeData ? `Last time: ${lastTimeData}` : `Goal: ${exercise.targetSets} sets x ${exercise.targetReps} reps`}
              </Text>
            </View>

            {showVideo && exercise.videoId && (
              <Reanimated.View entering={FadeIn.duration(300)} exiting={FadeOut.duration(200)} style={styles.videoContainer}>
                <YoutubeIframe play={true} height={200} videoId={exercise.videoId} initialPlayerParams={{ modestbranding: true }} />
              </Reanimated.View>
            )}

            {exercise.setsLog.map((set, idx) => {
              const isActive = idx === activeSetIndex;
              return (
                <View key={idx} style={[styles.setRowWrapper, isActive && styles.setRowWrapperActive]}>
                  {isActive && (
                    <View style={styles.activeIndicator} />
                  )}
                  <View style={[styles.setRow, set.completed && styles.setRowCompleted, isActive && styles.setRowActive]}>
                    <TouchableOpacity onLongPress={() => handleDeleteSet(idx)} style={styles.setIndexArea}>
                      {set.completed ? (
                        <Ionicons name="checkmark-circle" size={20} color={COLORS.accentPrimary} />
                      ) : (
                        <Text style={[styles.setIndexText, isActive && { color: COLORS.accentPrimary }]}>{set.setNumber}</Text>
                      )}
                    </TouchableOpacity>

                    <View style={styles.inputGroup}>
                      {(set.weight === null || set.weight === undefined || String(set.weight) === '') && (
                        <View style={styles.fakePlaceholder} pointerEvents="none">
                          <Text style={styles.fakePlaceholderText}>kg</Text>
                        </View>
                      )}
                      <TextInput 
                        key={`weight-${exercise.id}-${idx}`}
                        style={[styles.textInput, set.completed && { opacity: 0.5, color: COLORS.textMuted }]} 
                        defaultValue={set.weight !== null && set.weight !== undefined ? String(set.weight) : ''}
                        keyboardType="numeric"
                        editable={!set.completed}
                        onChangeText={(text) => handleTextChange(idx, 'weight', text)}
                      />
                    </View>

                    <View style={styles.inputGroup}>
                      {(set.reps === null || set.reps === undefined || String(set.reps) === '') && (
                        <View style={styles.fakePlaceholder} pointerEvents="none">
                          <Text style={styles.fakePlaceholderText}>reps</Text>
                        </View>
                      )}
                      <TextInput 
                        key={`reps-${exercise.id}-${idx}`}
                        style={[styles.textInput, set.completed && { opacity: 0.5, color: COLORS.textMuted }]} 
                        defaultValue={set.reps !== null && set.reps !== undefined ? String(set.reps) : ''}
                        keyboardType="numeric"
                        editable={!set.completed}
                        onChangeText={(text) => handleTextChange(idx, 'reps', text)}
                      />
                    </View>
                    
                    <View style={{ width: 32 }} />
                  </View>
                </View>
              );
            })}

            <TouchableOpacity onPress={handleAddSet} style={styles.addSetBtn}>
              <Text style={styles.addSetBtnText}>+ Add Set</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.mainBtnWrapper}
              activeOpacity={0.8}
              onPress={isAllComplete ? handleNextExercise : handleLogSet}
            >
              <View style={[styles.mainBtn, isAllComplete ? {backgroundColor: '#34C759'} : {backgroundColor: '#1C1C1E', borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)'}]}>
                <Text style={styles.mainBtnText}>
                  {isAllComplete ? (activeExIndex === exercises.length - 1 ? "Finish Workout" : "It's done, let's go!") : "Log set & start rest"}
                </Text>
                <Ionicons name={isAllComplete ? "arrow-forward" : "stopwatch-outline"} size={20} color={isAllComplete ? COLORS.background : COLORS.textPrimary} style={{ marginLeft: 8 }} />
              </View>
            </TouchableOpacity>

          </ScrollView>
        </View>

        {/* Swap Modal */}
        {showSwapModal && (
          <Modal transparent animationType="slide" onRequestClose={() => setShowSwapModal(false)}>
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Swap Exercise</Text>
                  <TouchableOpacity onPress={() => setShowSwapModal(false)}>
                    <Ionicons name="close" size={24} color={COLORS.textPrimary} />
                  </TouchableOpacity>
                </View>
                <Text style={styles.modalSubtitle}>Alternatives for {exercise.muscle}</Text>
                <ScrollView style={{ marginTop: 16 }}>
                  {(EXERCISE_ALTERNATIVES[exercise.muscle] || []).map((alt, idx) => (
                    <TouchableOpacity 
                      key={idx} 
                      style={styles.altRow}
                      onPress={() => {
                        const oldName = exercise.name;
                        hapticSuccess();
                        swapExercise(activeExIndex, alt.name, alt.videoId);
                        setShowSwapModal(false);
                        Alert.alert(
                          'Keep Swap Permanent?',
                          `Do you want to use ${alt.name} for future workouts?`,
                          [
                            { text: 'No, just for today', style: 'cancel' },
                            { text: 'Yes, update plan', onPress: () => {
                              makeSwapPermanent(oldName, alt.name, alt.videoId);
                            }}
                          ]
                        );
                      }}
                    >
                      <Ionicons name="barbell-outline" size={20} color={COLORS.textPrimary} />
                      <Text style={styles.altText}>{alt.name}</Text>
                      <Ionicons name="chevron-forward" size={16} color={COLORS.textMuted} />
                    </TouchableOpacity>
                  ))}
                  {(!EXERCISE_ALTERNATIVES[exercise.muscle] || EXERCISE_ALTERNATIVES[exercise.muscle].length === 0) && (
                    <Text style={styles.modalSubtitle}>No curated alternatives found for this muscle group.</Text>
                  )}
                </ScrollView>
              </View>
            </View>
          </Modal>
        )}

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACE.xl,
    paddingTop: Platform.OS === 'ios' ? 50 : 40,
    paddingBottom: SPACE.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  backBtn: { padding: SPACE.xs },
  headerTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 13, color: COLORS.textMuted, letterSpacing: 1 },
  content: { flex: 1 },
  scrollContent: { padding: SPACE.xl, paddingBottom: 160 },
  
  titleArea: { marginBottom: SPACE.xl, alignItems: 'center' },
  musclePill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, marginBottom: 12 },
  muscleDot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  muscleText: { fontFamily: FONT_FAMILY.bold, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 },
  exerciseName: { fontFamily: FONT_FAMILY.bold, fontSize: 22, color: COLORS.textPrimary, marginBottom: 4, textAlign: 'center' },
  lastTimeText: { fontFamily: FONT_FAMILY.body, fontSize: 13, color: COLORS.textMuted },
  
  setRowWrapper: {
    marginBottom: 8,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
  },
  setRowWrapperActive: {
    paddingLeft: 4,
  },
  activeIndicator: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: COLORS.accentPrimary,
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: SPACE.md,
    backgroundColor: '#1C1C1E',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  setRowActive: {
    backgroundColor: '#2C2C2E',
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
  },
  setRowCompleted: { backgroundColor: 'transparent', borderColor: 'transparent' },
  setIndexArea: { width: 32, alignItems: 'center', justifyContent: 'center' },
  setIndexText: { fontFamily: FONT_FAMILY.bold, fontSize: 15, color: COLORS.textMuted },
  inputGroup: { flex: 1, marginHorizontal: 6, position: 'relative' },
  fakePlaceholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fakePlaceholderText: {
    color: COLORS.textMuted,
    fontFamily: FONT_FAMILY.bold,
    fontSize: 16,
  },
  textInput: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: RADIUS.sm,
    height: 44,
    paddingVertical: 0,
    fontFamily: FONT_FAMILY.bold,
    fontSize: 16,
    color: COLORS.textPrimary,
    textAlign: 'center',
  },
  
  addSetBtn: {
    alignSelf: 'center',
    paddingVertical: SPACE.md,
    paddingHorizontal: SPACE.xl,
    marginTop: SPACE.sm,
  },
  addSetBtnText: { fontFamily: FONT_FAMILY.bold, fontSize: 13, color: COLORS.textMuted },
  videoBtn: { padding: 4 },
  videoContainer: { borderRadius: RADIUS.md, overflow: 'hidden', marginBottom: SPACE.xl },

  mainBtnWrapper: { marginTop: SPACE.md, ...SHADOW.lg },
  mainBtn: {
    flexDirection: 'row',
    borderRadius: RADIUS.lg,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mainBtnText: { fontFamily: FONT_FAMILY.bold, fontSize: 15, color: COLORS.textPrimary },

  restTimerCard: {
    position: 'absolute',
    bottom: 110,
    alignSelf: 'center',
    backgroundColor: 'rgba(28, 28, 30, 0.85)',
    borderWidth: 1, borderColor: 'rgba(196, 144, 255, 0.4)',
    borderRadius: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 24,
    gap: 20,
  },
  restTimerLabel: { fontFamily: FONT_FAMILY.bold, fontSize: 10, color: '#C490FF', letterSpacing: 1, marginBottom: 2, textAlign: 'center' },
  restTimerText: { fontFamily: 'Courier', fontSize: 28, color: COLORS.textPrimary, fontWeight: 'bold' },
  skipBtn: { marginLeft: 8, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: RADIUS.sm },
  skipBtnText: { fontFamily: FONT_FAMILY.bold, fontSize: 12, color: COLORS.textPrimary },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#1C1C1E', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  modalTitle: { fontFamily: FONT_FAMILY.bold, fontSize: 20, color: COLORS.textPrimary },
  modalSubtitle: { fontFamily: FONT_FAMILY.body, fontSize: 13, color: COLORS.textMuted, marginTop: 4 },
  altRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#2C2C2E', padding: 16, borderRadius: 12, marginBottom: 12 },
  altText: { flex: 1, fontFamily: FONT_FAMILY.bold, fontSize: 16, color: COLORS.textPrimary, marginLeft: 12 },
});
