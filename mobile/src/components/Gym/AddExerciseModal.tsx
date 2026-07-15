/**
 * AddExerciseModal — ZenTrack Mobile
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, ScrollView, KeyboardAvoidingView, Platform, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONT_FAMILY, SPACE, RADIUS, FONT_SIZE } from '../../theme/tokens';
import { GymExerciseLog, GymPlanDay, GymPlanExercise } from '../../types/gym.types';
import { useMobileData } from '../../contexts/MobileDataContext';
import { MUSCLE_COLORS, resolveMuscleColor, hexToRgba } from '../../utils/gymUtils';

const MUSCLES_LIST = ['None', ...Object.keys(MUSCLE_COLORS)];

const extractVideoId = (urlOrId: string) => {
  if (!urlOrId) return '';
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = urlOrId.match(regExp);
  return (match && match[2].length === 11) ? match[2] : urlOrId;
};

interface Props {
  visible: boolean;
  onClose: () => void;
  onAdd: (ex: GymExerciseLog) => void;
  planDay?: GymPlanDay;
  existingExerciseIds?: string[];
}

export function AddExerciseModal({ visible, onClose, onAdd, planDay, existingExerciseIds = [] }: Props) {
  const [name, setName] = useState('');
  const [sets, setSets] = useState('3');
  const [reps, setReps] = useState('8-12');
  const [restTime, setRestTime] = useState('60');
  const [muscle, setMuscle] = useState('None');
  const [videoLink, setVideoLink] = useState('');
  const [savePermanently, setSavePermanently] = useState(false);

  const { userGymPlan, updateMasterPlan } = useMobileData();

  const handleAddCustom = () => {
    if (!name.trim()) return;
    
    const parsedSets = parseInt(sets, 10) || 3;
    const parsedRest = parseInt(restTime, 10) || 60;
    
    const newEx: GymExerciseLog = {
      exerciseId: `custom_${Date.now()}`,
      name: name.trim(),
      muscle: muscle.trim(),
      targetSets: parsedSets,
      targetReps: reps.trim(),
      videoId: extractVideoId(videoLink.trim()) || undefined,
      restTimeSecs: parsedRest,
      setsLog: Array.from({ length: parsedSets }, (_, i) => ({
        setNumber: i + 1,
        reps: null,
        weight: null,
        completed: false,
      })),
      isCustom: true,
    };
    onAdd(newEx);

    if (savePermanently && planDay) {
      const currentMasterDay = userGymPlan?.customDays?.[planDay.dayIndex] || planDay;
      const updatedExercises = [...currentMasterDay.exercises];
      updatedExercises.push({
        id: newEx.exerciseId,
        name: newEx.name,
        muscle: newEx.muscle,
        targetSets: newEx.targetSets,
        targetReps: newEx.targetReps,
        videoId: newEx.videoId,
        restTimeSecs: newEx.restTimeSecs
      });
      updateMasterPlan(planDay.dayIndex, { ...currentMasterDay, exercises: updatedExercises }).catch(console.error);
    }

    resetAndClose();
  };

  const handleAddFromPlan = (planEx: GymPlanExercise) => {
    const newEx: GymExerciseLog = {
      exerciseId: planEx.id,
      name: planEx.name,
      muscle: planEx.muscle,
      targetSets: planEx.targetSets,
      targetReps: planEx.targetReps,
      videoId: planEx.videoId,
      restTimeSecs: planEx.restTimeSecs || 60,
      setsLog: Array.from({ length: planEx.targetSets }, (_, i) => ({
        setNumber: i + 1,
        reps: null,
        weight: null,
        completed: false,
      })),
    };
    onAdd(newEx);

    if (savePermanently && planDay) {
      const currentMasterDay = userGymPlan?.customDays?.[planDay.dayIndex] || planDay;
      if (!currentMasterDay.exercises.some(e => e.id === newEx.exerciseId)) {
        const updatedExercises = [...currentMasterDay.exercises, planEx];
        updateMasterPlan(planDay.dayIndex, { ...currentMasterDay, exercises: updatedExercises }).catch(console.error);
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
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalBg}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Add Exercise</Text>
            <TouchableOpacity onPress={resetAndClose} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
            {planDay && planDay.exercises.filter(ex => !existingExerciseIds.includes(ex.id)).length > 0 && (
              <View style={styles.planSection}>
                <Text style={styles.sectionLabel}>FROM {planDay.name.toUpperCase()}</Text>
                {planDay.exercises.filter(ex => !existingExerciseIds.includes(ex.id)).map(ex => (
                  <TouchableOpacity 
                    key={ex.id} 
                    style={styles.planExItem}
                    onPress={() => handleAddFromPlan(ex)}
                  >
                    <Text style={styles.planExName} numberOfLines={1}>{ex.name}</Text>
                    <Text style={styles.planExDetails}>{ex.targetSets}×{ex.targetReps}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <View style={styles.customSection}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Exercise Name *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Cable Flyes"
                  placeholderTextColor={COLORS.textMuted}
                  value={name}
                  onChangeText={setName}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Sets</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={sets}
                  onChangeText={setSets}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Reps</Text>
                <TextInput
                  style={styles.input}
                  value={reps}
                  onChangeText={setReps}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Rest Timer (Seconds)</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={restTime}
                  onChangeText={setRestTime}
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Muscle Group</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: SPACE.sm, paddingVertical: 4 }}>
                  {MUSCLES_LIST.map((m) => {
                    const isSelected = muscle === m;
                    const baseColor = m === 'None' ? COLORS.textSecondary : resolveMuscleColor(m);
                    return (
                      <TouchableOpacity
                        key={m}
                        style={[
                          styles.musclePill,
                          isSelected && { backgroundColor: hexToRgba(baseColor, 0.15), borderColor: baseColor }
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

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>YouTube Link (Optional)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. https://youtu.be/..."
                  placeholderTextColor={COLORS.textMuted}
                  value={videoLink}
                  onChangeText={setVideoLink}
                  autoCapitalize="none"
                />
              </View>

              <View style={styles.masterSplitContainer}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.masterSplitTitle}>Save to Master Split</Text>
                  <Text style={styles.masterSplitDesc}>Add this exercise to all future workouts on this day.</Text>
                </View>
                <Switch
                  value={savePermanently}
                  onValueChange={setSavePermanently}
                  trackColor={{ false: 'rgba(255,255,255,0.1)', true: COLORS.accentPrimary }}
                  thumbColor={Platform.OS === 'ios' ? '#fff' : savePermanently ? '#fff' : '#f4f3f4'}
                />
              </View>

              <TouchableOpacity 
                style={[styles.submitBtn, !name.trim() && styles.submitBtnDisabled]}
                disabled={!name.trim()}
                onPress={handleAddCustom}
              >
                <Text style={styles.submitBtnText}>Add Exercise</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#161618',
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
    padding: SPACE.lg,
    paddingBottom: Platform.OS === 'ios' ? 40 : SPACE.xl,
    maxHeight: '90%',
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
    color: COLORS.textPrimary,
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
  planSection: {
    marginBottom: SPACE.xl,
  },
  sectionLabel: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 10,
    color: COLORS.textMuted,
    letterSpacing: 1,
    marginBottom: SPACE.sm,
  },
  planExItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1C1C1E',
    padding: SPACE.md,
    borderRadius: RADIUS.md,
    marginBottom: SPACE.xs,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  planExName: {
    flex: 1,
    fontFamily: FONT_FAMILY.body,
    fontSize: 14,
    color: COLORS.textPrimary,
    marginRight: SPACE.md,
  },
  planExDetails: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 12,
    color: COLORS.textMuted,
  },
  customSection: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
    paddingTop: SPACE.md,
    gap: SPACE.md,
  },
  inputGroup: {
    gap: SPACE.xs,
  },
  inputLabel: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 10,
    color: COLORS.textMuted,
  },
  input: {
    backgroundColor: '#1C1C1E',
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACE.md,
    height: 48,
    fontFamily: FONT_FAMILY.body,
    fontSize: 14,
    color: COLORS.textPrimary,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACE.xs,
    gap: SPACE.sm,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: COLORS.textMuted,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#C490FF',
    borderColor: '#C490FF',
  },
  checkboxLabel: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 12,
    color: COLORS.textPrimary,
  },
  musclePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: SPACE.md,
    height: 36,
    borderRadius: 18,
    gap: SPACE.xs,
  },
  muscleDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  muscleText: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 13,
    color: COLORS.textMuted,
  },
  submitBtn: {
    backgroundColor: '#C490FF',
    borderRadius: RADIUS.md,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: SPACE.md,
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitBtnText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 16,
    color: '#000',
  },
  masterSplitContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACE.md,
    marginTop: SPACE.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
  },
  masterSplitTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 14,
    color: COLORS.textPrimary,
    marginBottom: 2,
  },
  masterSplitDesc: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 12,
    color: COLORS.textMuted,
  },
});
