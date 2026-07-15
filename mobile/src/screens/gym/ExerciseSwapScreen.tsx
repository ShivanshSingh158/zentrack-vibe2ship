import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, TextInput, ScrollView, Platform, KeyboardAvoidingView } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONT_FAMILY, SPACE, RADIUS, SHADOW } from '../../theme/tokens';
import { useGymLog, todayStr } from '../../hooks/useGymLog';
import { GYM_PLAN } from '../../data/gymPlan';
import { resolveMuscleColor, hexToRgba } from '../../utils/gymUtils';
import { hapticMedium, hapticSuccess } from '../../utils/haptics';

export default function ExerciseSwapScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const originalExerciseId = route.params?.originalExerciseId;
  const date = route.params?.date || todayStr();

  const { log, updateExercise } = useGymLog(date);
  const [search, setSearch] = useState('');

  // Flatten all unique exercises from the plan
  const allExercises = useMemo(() => {
    const map = new Map<string, any>();
    Object.values(GYM_PLAN).forEach(day => {
      day.exercises.forEach(ex => {
        if (!map.has(ex.id)) {
          map.set(ex.id, ex);
        }
      });
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, []);

  const filteredExercises = useMemo(() => {
    if (!search.trim()) return allExercises;
    const lower = search.toLowerCase();
    return allExercises.filter(ex => ex.name.toLowerCase().includes(lower) || ex.muscle?.toLowerCase().includes(lower));
  }, [allExercises, search]);

  const handleSwap = (newExDef: any) => {
    if (!log || !originalExerciseId) return;

    const index = log.exercises.findIndex(e => e.exerciseId === originalExerciseId);
    if (index === -1) return;

    hapticSuccess();
    
    const existingLog = log.exercises[index];
    
    // Create new sets array based on target sets
    const newSetsLog = Array.from({ length: newExDef.targetSets }, (_, i) => ({
      setNumber: i + 1,
      reps: null,
      weight: null,
      completed: false,
    }));

    const updatedExercise = {
      ...existingLog,
      exerciseId: newExDef.id,
      name: newExDef.name,
      muscle: newExDef.muscle,
      videoId: newExDef.videoId,
      targetSets: newExDef.targetSets,
      targetReps: newExDef.targetReps,
      setsLog: newSetsLog,
      isCustom: false,
    };

    updateExercise(index, updatedExercise);
    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.root}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="chevron-down" size={24} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Swap Exercise</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color={COLORS.textMuted} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search exercises or muscles..."
            placeholderTextColor={COLORS.textMuted}
            value={search}
            onChangeText={setSearch}
            autoCorrect={false}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={20} color={COLORS.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        <ScrollView contentContainerStyle={styles.list}>
          {filteredExercises.map(ex => (
            <TouchableOpacity 
              key={ex.id} 
              style={styles.exerciseRow} 
              onPress={() => handleSwap(ex)}
              activeOpacity={0.7}
            >
              <View style={styles.exInfo}>
                <Text style={styles.exName}>{ex.name}</Text>
                <Text style={styles.exTarget}>{ex.targetSets} sets x {ex.targetReps} reps</Text>
              </View>
              <View style={[styles.musclePill, { backgroundColor: hexToRgba(resolveMuscleColor(ex.muscle), 0.1) }]}>
                <View style={[styles.muscleDot, { backgroundColor: resolveMuscleColor(ex.muscle) }]} />
                <Text style={[styles.muscleText, { color: resolveMuscleColor(ex.muscle) }]}>{ex.muscle}</Text>
              </View>
            </TouchableOpacity>
          ))}

          {filteredExercises.length === 0 && (
            <View style={styles.emptyState}>
              <Ionicons name="barbell-outline" size={32} color={COLORS.textMuted} />
              <Text style={styles.emptyText}>No exercises found.</Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0D0D0E' },
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
  
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#161618',
    margin: SPACE.xl,
    paddingHorizontal: SPACE.md,
    height: 44,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  searchIcon: { marginRight: SPACE.sm },
  searchInput: { flex: 1, fontFamily: FONT_FAMILY.body, fontSize: 16, color: COLORS.textPrimary, height: '100%' },
  
  list: { paddingHorizontal: SPACE.xl, paddingBottom: 100 },
  
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
  exName: { fontFamily: FONT_FAMILY.bold, fontSize: 16, color: COLORS.textPrimary, marginBottom: 4 },
  exTarget: { fontFamily: FONT_FAMILY.body, fontSize: 12, color: COLORS.textMuted },
  
  musclePill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  muscleDot: { width: 6, height: 6, borderRadius: 3, marginRight: 4 },
  muscleText: { fontFamily: FONT_FAMILY.bold, fontSize: 10, textTransform: 'uppercase' },

  emptyState: { alignItems: 'center', marginTop: 60, gap: SPACE.md },
  emptyText: { fontFamily: FONT_FAMILY.body, fontSize: 14, color: COLORS.textMuted },
});
