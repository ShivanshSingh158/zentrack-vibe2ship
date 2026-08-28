import React, { memo } from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import BottomSheet from '../ui/BottomSheet';
import { FONT_FAMILY } from '../../theme/tokens';
import { hapticMedium } from '../../utils/haptics';
import { GymCardioLog, GymPlanDay } from '../../types/gym.types';
import { planDayIndexForDate, resolvePlanDay } from '../../hooks/useGymLog';

interface GymExerciseOptionsSheetProps {
  exerciseMenuFor: any | null;
  setExerciseMenuFor: (val: any | null) => void;
  supersetPickerFor: any | null;
  setSupersetPickerFor: (val: any | null) => void;
  cardioMenuFor: GymCardioLog | null;
  setCardioMenuFor: (val: GymCardioLog | null) => void;
  setLogCardioFor: (val: GymCardioLog | null) => void;
  deleteCardio: (id: string) => void;
  deleteExercise: (exerciseId: string) => void;
  reorderExercisesFull: (exercises: any[]) => void;
  log: any;
  selectedDate: string;
  userGymPlan: any;
  updateMasterPlan: (dayIndex: number, plan: GymPlanDay) => Promise<void>;
  navigation: any;
  colors: any;
  isDark: boolean;
  s: any;
}

export const GymExerciseOptionsSheet = memo(function GymExerciseOptionsSheet({
  exerciseMenuFor,
  setExerciseMenuFor,
  supersetPickerFor,
  setSupersetPickerFor,
  cardioMenuFor,
  setCardioMenuFor,
  setLogCardioFor,
  deleteCardio,
  deleteExercise,
  reorderExercisesFull,
  log,
  selectedDate,
  userGymPlan,
  updateMasterPlan,
  navigation,
  colors,
  isDark,
  s,
}: GymExerciseOptionsSheetProps) {
  return (
    <>
      {/* ─── Themed Exercise Options Bottom Sheet ──────────────────────────────── */}
      {!!exerciseMenuFor && (
        <BottomSheet visible={!!exerciseMenuFor} onClose={() => setExerciseMenuFor(null)}>
          <View style={{ gap: 8, paddingBottom: 16 }}>
            <Text style={{ fontSize: 18, fontFamily: FONT_FAMILY.bold, color: colors.textPrimary }}>
              {exerciseMenuFor?.name || 'Exercise Options'}
            </Text>
            <Text style={{ fontSize: 13, color: colors.textMuted, marginBottom: 8, fontFamily: FONT_FAMILY.medium }}>
              {exerciseMenuFor?.muscle ? `${exerciseMenuFor.muscle} • ` : ''}
              {exerciseMenuFor?.setsLog?.length || exerciseMenuFor?.targetSets || 3} sets, {exerciseMenuFor?.targetReps || '8–12'} reps
            </Text>

            {/* Option 1: Exercise Details & Guide */}
            <TouchableOpacity
              style={s.menuActionRow}
              activeOpacity={0.7}
              onPress={() => {
                const ex = exerciseMenuFor;
                setExerciseMenuFor(null);
                navigation.navigate('ExerciseDetail', { exerciseId: ex.exerciseId, date: log?.date ?? selectedDate });
              }}
            >
              <View style={[s.menuActionIcon, { backgroundColor: isDark ? 'rgba(165,153,255,0.12)' : 'rgba(108,92,231,0.08)' }]}>
                <Ionicons name="book-outline" size={18} color={colors.accentPrimary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.menuActionTitle}>Exercise Details & Guide</Text>
                <Text style={s.menuActionSub}>Instructions, muscle anatomy & video</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
            </TouchableOpacity>

            {/* Option 2: Swap Exercise */}
            <TouchableOpacity
              style={s.menuActionRow}
              activeOpacity={0.7}
              onPress={() => {
                const ex = exerciseMenuFor;
                setExerciseMenuFor(null);
                navigation.navigate('ExerciseSwap', { originalExerciseId: ex.exerciseId, date: log?.date ?? selectedDate });
              }}
            >
              <View style={[s.menuActionIcon, { backgroundColor: isDark ? 'rgba(56,189,248,0.12)' : 'rgba(2,132,199,0.08)' }]}>
                <Ionicons name="swap-horizontal" size={18} color={isDark ? '#38bdf8' : '#0284C7'} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.menuActionTitle}>Swap Exercise...</Text>
                <Text style={s.menuActionSub}>Choose alternative target movements</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
            </TouchableOpacity>

            {/* Option 3: Link/Unlink Superset */}
            {exerciseMenuFor?.supersetGroup ? (
              <TouchableOpacity
                style={s.menuActionRow}
                activeOpacity={0.7}
                onPress={() => {
                  const ex = exerciseMenuFor;
                  setExerciseMenuFor(null);
                  const updated = (log?.exercises || []).map((e: any) =>
                    e.exerciseId === ex.exerciseId ? { ...e, supersetGroup: undefined } : e
                  );
                  reorderExercisesFull(updated);
                }}
              >
                <View style={[s.menuActionIcon, { backgroundColor: 'rgba(255,105,97,0.12)' }]}>
                  <Ionicons name="link-outline" size={18} color="#ff6961" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.menuActionTitle, { color: '#ff6961' }]}>Remove from Superset ({exerciseMenuFor.supersetGroup})</Text>
                  <Text style={s.menuActionSub}>Unlink from paired exercise</Text>
                </View>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={s.menuActionRow}
                activeOpacity={0.7}
                onPress={() => {
                  const ex = exerciseMenuFor;
                  setExerciseMenuFor(null);
                  const availablePartners = (log?.exercises || []).filter((e: any) => !e.skipped && e.exerciseId !== ex.exerciseId);
                  if (availablePartners.length === 0) {
                    Alert.alert('Superset', 'Add at least 2 exercises to create a superset.', [{ text: 'OK' }]);
                    return;
                  }
                  setSupersetPickerFor(ex);
                }}
              >
                <View style={[s.menuActionIcon, { backgroundColor: isDark ? 'rgba(255,159,77,0.12)' : 'rgba(217,119,6,0.08)' }]}>
                  <Ionicons name="link-outline" size={18} color={isDark ? '#ff9f4d' : '#D97706'} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.menuActionTitle}>Link as Superset...</Text>
                  <Text style={s.menuActionSub}>Pair with another movement for back-to-back sets</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
              </TouchableOpacity>
            )}

            {/* Option 4: Delete Exercise */}
            <TouchableOpacity
              style={s.menuActionRow}
              activeOpacity={0.7}
              onPress={() => {
                const ex = exerciseMenuFor;
                setExerciseMenuFor(null);
                hapticMedium();
                Alert.alert(
                  'Delete Exercise',
                  `Remove "${ex?.name}" from your workout?`,
                  [
                    {
                      text: 'Today Only',
                      style: 'destructive',
                      onPress: () => {
                        deleteExercise(ex.exerciseId);
                      },
                    },
                    {
                      text: 'Remove from Plan',
                      style: 'destructive',
                      onPress: async () => {
                        deleteExercise(ex.exerciseId);
                        const planIdx = log?.dayPlanIndex ?? planDayIndexForDate(selectedDate);
                        const existing = resolvePlanDay(userGymPlan, planIdx);
                        if (existing && !existing.isRest) {
                          const updatedExercises = (existing.exercises || []).filter(
                            (e: any) => e.id !== ex.exerciseId && e.name !== ex.name
                          );
                          await updateMasterPlan(planIdx, { ...existing, exercises: updatedExercises });
                        }
                      },
                    },
                    { text: 'Cancel', style: 'cancel' },
                  ]
                );
              }}
            >
              <View style={[s.menuActionIcon, { backgroundColor: 'rgba(255,105,97,0.12)' }]}>
                <Ionicons name="trash-outline" size={18} color="#ff6961" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.menuActionTitle, { color: '#ff6961' }]}>Delete Exercise</Text>
                <Text style={s.menuActionSub}>Remove from today or from plan</Text>
              </View>
            </TouchableOpacity>

            {/* Cancel / Go Back Button */}
            <TouchableOpacity
              style={s.menuCancelBtn}
              activeOpacity={0.7}
              onPress={() => setExerciseMenuFor(null)}
            >
              <Text style={s.menuCancelText}>Go Back</Text>
            </TouchableOpacity>
          </View>
        </BottomSheet>
      )}

      {/* ─── Themed Superset Partner Picker Bottom Sheet ──────────────────── */}
      {!!supersetPickerFor && (
        <BottomSheet visible={!!supersetPickerFor} onClose={() => setSupersetPickerFor(null)}>
          <View style={{ gap: 8, paddingBottom: 16 }}>
            <Text style={{ fontSize: 18, fontFamily: FONT_FAMILY.bold, color: colors.textPrimary }}>
              Select Superset Partner
            </Text>
            <Text style={{ fontSize: 13, color: colors.textMuted, marginBottom: 8, fontFamily: FONT_FAMILY.medium }}>
              Pair "{supersetPickerFor?.name}" with:
            </Text>
            {(log?.exercises || [])
              .filter((e: any) => !e.skipped && e.exerciseId !== supersetPickerFor?.exerciseId)
              .map((partner: any) => (
                <TouchableOpacity
                  key={partner.exerciseId}
                  style={s.menuActionRow}
                  activeOpacity={0.7}
                  onPress={() => {
                    const ex = supersetPickerFor;
                    setSupersetPickerFor(null);
                    const groupLetter = partner.supersetGroup || String.fromCharCode(65 + Math.floor(Math.random() * 26));
                    const updated = (log?.exercises || []).map((e: any) => {
                      if (e.exerciseId === ex.exerciseId || e.exerciseId === partner.exerciseId) {
                        return { ...e, supersetGroup: groupLetter };
                      }
                      return e;
                    });
                    reorderExercisesFull(updated);
                  }}
                >
                  <View style={[s.menuActionIcon, { backgroundColor: isDark ? 'rgba(165,153,255,0.12)' : 'rgba(108,92,231,0.08)' }]}>
                    <Ionicons name="barbell-outline" size={18} color={colors.accentPrimary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.menuActionTitle}>{partner.name}</Text>
                    <Text style={s.menuActionSub}>{partner.muscle || 'Exercise'}</Text>
                  </View>
                  <Ionicons name="checkmark-circle-outline" size={18} color={colors.accentPrimary} />
                </TouchableOpacity>
              ))}
            <TouchableOpacity
              style={s.menuCancelBtn}
              activeOpacity={0.7}
              onPress={() => setSupersetPickerFor(null)}
            >
              <Text style={s.menuCancelText}>Go Back</Text>
            </TouchableOpacity>
          </View>
        </BottomSheet>
      )}

      {/* ─── Themed Cardio Options Bottom Sheet ───────────────────────────── */}
      {!!cardioMenuFor && (
        <BottomSheet visible={!!cardioMenuFor} onClose={() => setCardioMenuFor(null)}>
          <View style={{ gap: 8, paddingBottom: 16 }}>
            <Text style={{ fontSize: 18, fontFamily: FONT_FAMILY.bold, color: colors.textPrimary }}>
              {cardioMenuFor?.type || 'Cardio Options'}
            </Text>
            <TouchableOpacity
              style={s.menuActionRow}
              activeOpacity={0.7}
              onPress={() => {
                const c = cardioMenuFor;
                setCardioMenuFor(null);
                if (c) setLogCardioFor(c);
              }}
            >
              <View style={[s.menuActionIcon, { backgroundColor: isDark ? 'rgba(56,189,248,0.12)' : 'rgba(2,132,199,0.08)' }]}>
                <Ionicons name="create-outline" size={18} color={isDark ? '#38bdf8' : '#0284C7'} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.menuActionTitle}>Log / Edit Cardio</Text>
                <Text style={s.menuActionSub}>Update duration, distance, speed & pace</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
            </TouchableOpacity>

            <TouchableOpacity
              style={s.menuActionRow}
              activeOpacity={0.7}
              onPress={() => {
                const c = cardioMenuFor;
                setCardioMenuFor(null);
                if (c) deleteCardio(c.id);
              }}
            >
              <View style={[s.menuActionIcon, { backgroundColor: 'rgba(255,105,97,0.12)' }]}>
                <Ionicons name="trash-outline" size={18} color="#ff6961" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.menuActionTitle, { color: '#ff6961' }]}>Delete Cardio</Text>
                <Text style={s.menuActionSub}>Remove from today's workout</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={s.menuCancelBtn}
              activeOpacity={0.7}
              onPress={() => setCardioMenuFor(null)}
            >
              <Text style={s.menuCancelText}>Go Back</Text>
            </TouchableOpacity>
          </View>
        </BottomSheet>
      )}
    </>
  );
});

export default GymExerciseOptionsSheet;
