import React from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, Switch, Platform } from 'react-native';
import { SPACE } from '../../theme/tokens';
import { MUSCLE_COLORS, resolveMuscleColor, hexToRgba } from '../../utils/gymUtils';
import { GymPlanDay } from '../../types/gym.types';

const MUSCLES_LIST = ['None', ...Object.keys(MUSCLE_COLORS)];

export interface ExerciseCustomFieldsProps {
  sets: string;
  setSets: (val: string) => void;
  reps: string;
  setReps: (val: string) => void;
  restTime: string;
  setRestTime: (val: string) => void;
  muscle: string;
  setMuscle: (val: string) => void;
  videoLink: string;
  setVideoLink: (val: string) => void;
  savePermanently: boolean;
  setSavePermanently: (val: boolean) => void;
  planDay?: GymPlanDay;
  colors: any;
  styles: any;
}

export const ExerciseCustomFields: React.FC<ExerciseCustomFieldsProps> = React.memo(({
  sets,
  setSets,
  reps,
  setReps,
  restTime,
  setRestTime,
  muscle,
  setMuscle,
  videoLink,
  setVideoLink,
  savePermanently,
  setSavePermanently,
  planDay,
  colors,
  styles,
}) => {
  return (
    <>
      {/* Sets / Reps / Rest • 3-column row */}
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

      {/* Muscle Group pills */}
      <View style={styles.inputGroup}>
        <Text style={styles.inputLabel}>MUSCLE GROUP</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: SPACE.sm, paddingVertical: 4 }}
        >
          {MUSCLES_LIST.map(m => {
            const isSelected = muscle === m;
            const baseColor = m === 'None' ? colors.textSecondary : resolveMuscleColor(m);

            return (
              <TouchableOpacity
                key={m}
                style={[
                  styles.musclePill,
                  isSelected && {
                    backgroundColor: hexToRgba(baseColor, 0.15),
                    borderColor: baseColor,
                  },
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

      {/* YouTube Link */}
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

      {/* Save to Master Split */}
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
    </>
  );
});

export default ExerciseCustomFields;
