/**
 * ExerciseList.tsx
 * Renders the exercises section with drag-and-drop reordering support.
 * Extracted from GymHomeScreen.tsx renderExercises().
 *
 * All drag state (draggingIdx, dragY, panResponder) is passed in as props
 * so this component stays fully controlled by the coordinator.
 */
import React, { memo } from 'react';
import { View, Text, TouchableOpacity, Animated, PanResponder } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { COLORS } from '../../theme/tokens';
import { gymHomeStyles as s } from '../../screens/gym/home/gymHomeStyles';
import { hapticMedium } from '../../utils/haptics';

interface ExerciseListProps {
  log: any;
  draggingIdx: number | null;
  dragY: Animated.Value;
  animList: Animated.Value;
  panResponder: any; // PanResponder instance — created in coordinator
  onResumeWorkout: (index?: number) => void;
  onSetDraggingIdx: (idx: number) => void;
  onSetHistoryFor: (item: { id: string; name: string } | null) => void;
}

export const ExerciseList = memo(function ExerciseList({
  log, draggingIdx, dragY, animList, panResponder,
  onResumeWorkout, onSetDraggingIdx, onSetHistoryFor,
}: ExerciseListProps) {
  const navigation = useNavigation<any>();

  if (!log?.exercises || log.exercises.length === 0) return null;

  return (
    <View style={s.section} {...panResponder.panHandlers}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <Text style={s.sectionLabel}>EXERCISES</Text>
      </View>

      {log.exercises.map((ex: any, i: number) => {
        if (ex.skipped) return null;

        const isDone         = ex.setsLog.length > 0 && ex.setsLog.every((set: any) => set.completed);
        const totalSets      = ex.setsLog.length;
        const completedSets  = ex.setsLog.filter((set: any) => set.completed);
        const isDragging     = draggingIdx === i;

        let subText = '';
        if (completedSets.length > 0) {
          const avgReps   = Math.round(completedSets.reduce((sum: number, set: any) => sum + (set.reps || 0), 0) / completedSets.length) || 0;
          const maxWeight = Math.max(...completedSets.map((set: any) => set.weight || 0));
          subText = `${completedSets.length}/${totalSets} sets, ~${avgReps} reps ${maxWeight > 0 ? `@ ${maxWeight}kg` : ''}`;
        } else {
          subText = `${totalSets} sets, ${ex.targetReps || '0'} reps`;
        }

        const activePrevExercises   = log.exercises.slice(0, i).filter((e: any) => !e.skipped);
        const prevEx                = activePrevExercises.length > 0 ? activePrevExercises[activePrevExercises.length - 1] : null;
        const isPartnerWithPrevious = ex.supersetGroup && prevEx && prevEx.supersetGroup === ex.supersetGroup;

        return (
          <Animated.View
            key={ex.id || i}
            style={[
              { opacity: animList },
              isDragging && { transform: [{ translateY: dragY }, { scale: 1.04 }], zIndex: 9999, elevation: 10 },
            ]}
          >
            {isPartnerWithPrevious && (
              <View style={{ position: 'absolute', top: -8, left: 25, width: 2, height: 8, backgroundColor: 'rgba(255,159,77,0.6)', zIndex: -1 }} />
            )}
            <TouchableOpacity
              style={[
                s.row,
                ex.supersetGroup && { backgroundColor: 'rgba(255,159,77,0.05)', borderColor: 'rgba(255,159,77,0.25)', borderWidth: 1 },
                isDragging && { borderColor: '#a599ff', borderWidth: 1.5, backgroundColor: '#272338', shadowColor: '#a599ff', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.4, shadowRadius: 10 },
              ]}
              activeOpacity={0.8}
              onPress={() => { if (draggingIdx === null) onResumeWorkout(i); }}
              onLongPress={() => { hapticMedium(); onSetDraggingIdx(i); }}
              delayLongPress={300}
            >
              <View style={[s.checkboxCircle, isDone && s.checkboxCircleDone]}>
                {isDone && <Ionicons name="checkmark" size={14} color={COLORS.background} />}
              </View>

              <View style={s.rowTextCol}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, paddingRight: 4 }}>
                  <Text style={[s.rowTitle, isDone && s.textStrikethrough, isDragging && { color: '#a599ff', fontWeight: '700' }]}>
                    {ex.name}
                  </Text>
                  {ex.supersetGroup && (
                    <View style={{ backgroundColor: 'rgba(255,159,77,0.12)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,159,77,0.25)', marginBottom: 4 }}>
                      <Text style={{ fontSize: 9, fontFamily: 'Inter-Bold', color: '#ff9f4d', letterSpacing: 0.5 }}>
                        SUPER-{ex.supersetGroup}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={s.rowSubtitle}>{subText}</Text>
              </View>

              <View style={s.rowActions}>
                <TouchableOpacity style={s.actionBtn} onPress={() => onSetHistoryFor({ id: ex.exerciseId, name: ex.name })}>
                  <Ionicons name="time-outline" size={20} color={COLORS.textMuted} />
                </TouchableOpacity>
                <TouchableOpacity style={s.actionBtn} onPress={() => navigation.navigate('ExerciseDetail', { exerciseId: ex.exerciseId, date: log.date })}>
                  <Ionicons name="ellipsis-horizontal" size={20} color={COLORS.textMuted} />
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </Animated.View>
        );
      })}
    </View>
  );
});
ExerciseList.displayName = 'ExerciseList';
