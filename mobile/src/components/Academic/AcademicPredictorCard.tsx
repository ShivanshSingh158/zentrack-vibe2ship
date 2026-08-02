/**
 * ExerciseHistoryDrawer — ZenTrack Mobile
 */

import React from 'react';
import { formatDateShort } from '../../utils/dateUtils';
import { View, Text, StyleSheet, Modal, TouchableOpacity, FlatList, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS } from '../../theme/tokens';
import { useMobileData } from '../../contexts/MobileDataContext';
import { useTheme } from "../../contexts/ThemeContext";

interface Props {
  visible: boolean;
  exerciseName: string | null;
  exerciseId: string | null;
  onClose: () => void;
}

export function ExerciseHistoryDrawer({ visible, exerciseName, exerciseId, onClose }: Props) {
    const { colors, isDark } = useTheme();
    const styles = makeStyles(colors);
  const { gymLogs } = useMobileData();

  // Find history: either all workouts, or specific exercise
  const history: any[] = exerciseId === 'all'
    ? gymLogs
        .filter(log => log.exercises && log.exercises.length > 0)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .map(log => ({ date: log.date, logItem: log }))
    : gymLogs
        .map(log => ({
          date: log.date,
          ex: log.exercises?.find(e => e.exerciseId === exerciseId)
        }))
        .filter(item => item.ex)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .slice(0, 20);

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalBg}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={1}>{exerciseName} History</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <FlatList
            data={history}
            keyExtractor={item => item.date}
            renderItem={({ item }) => {
              if (exerciseId === 'all') {
                const log = (item as any).logItem;
                const totalExercises = log.exercises?.length || 0;
                const duration = log.workoutDurationMinutes ? `${log.workoutDurationMinutes} mins` : 'Completed';
                return (
                  <View style={styles.item}>
                    <Text style={styles.dateText}>{formatDateShort(item.date)}</Text>
                    <View style={styles.statsRow}>
                      <Text style={styles.stat}>{totalExercises} Exercises</Text>
                      <Text style={styles.stat}>{duration}</Text>
                    </View>
                  </View>
                );
              }

              const ex = (item as any).ex!;
              const completedSets = ex.setsLog.filter((s: any) => s.completed);
              const maxWeight = Math.max(0, ...completedSets.filter((s:any) => s.weight).map((s: any) => s.weight as number));
              const setsStr = completedSets.map((s: any) => `${s.reps || 0}×${s.weight || 0}kg`).join(', ');
              
              // Estimated 1RM using Epley formula on heaviest completed set
              const best1RMSet = completedSets.reduce((best: any, s: any) => {
                const rm = s.weight && s.reps ? s.weight * (1 + s.reps / 30) : 0;
                const bestRm = best?.weight && best?.reps ? best.weight * (1 + best.reps / 30) : 0;
                return rm > bestRm ? s : best;
              }, null);
              const est1RM = best1RMSet?.weight && best1RMSet?.reps
                ? Math.round(best1RMSet.weight * (1 + best1RMSet.reps / 30))
                : null;
              
              return (
                <View style={styles.item}>
                  <Text style={styles.dateText}>{formatDateShort(item.date)}</Text>
                  <View style={styles.statsRow}>
                    <Text style={styles.stat}>Max: {maxWeight > 0 ? maxWeight + 'kg' : '-'}</Text>
                    {est1RM && (
                      <View style={styles.oneRMBadge}>
                        <Text style={styles.oneRMText}>~{est1RM}kg 1RM</Text>
                      </View>
                    )}
                    <Text style={styles.stat} numberOfLines={1}>Sets: {setsStr || 'None'}</Text>
                  </View>
                </View>
              );

            }}
            ListEmptyComponent={
              <Text style={styles.emptyText}>No history found.</Text>
            }
          />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
      modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
      sheet: { backgroundColor: colors.background, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, height: '70%', padding: SPACE.xl },
      header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACE.xl },
      title: { flex: 1, fontFamily: FONT_FAMILY.title, fontSize: FONT_SIZE.lg, color: colors.textPrimary },
      closeBtn: { padding: SPACE.sm, backgroundColor: colors.surface, borderRadius: RADIUS.full },
      item: { paddingVertical: SPACE.md, borderBottomWidth: 1, borderBottomColor: colors.surface2 },
      dateText: { fontFamily: FONT_FAMILY.bold, fontSize: FONT_SIZE.base, color: colors.textPrimary, marginBottom: 4 },
      statsRow: { flexDirection: 'row', gap: SPACE.sm, alignItems: 'center', flexWrap: 'wrap' },
      stat: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.sm, color: colors.textMuted },
      oneRMBadge: { backgroundColor: '#f59e0b20', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 12 },
      oneRMText: { fontFamily: FONT_FAMILY.bold, fontSize: 11, color: '#f59e0b' },
      emptyText: { fontFamily: FONT_FAMILY.body, fontSize: FONT_SIZE.md, color: colors.textMuted, textAlign: 'center', marginTop: SPACE.xxl },
    });
