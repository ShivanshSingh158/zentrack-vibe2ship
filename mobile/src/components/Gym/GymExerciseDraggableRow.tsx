import React from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import { ScaleDecorator, RenderItemParams } from 'react-native-draggable-flatlist';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONT_FAMILY } from '../../theme/tokens';
import { hapticLight, hapticMedium } from '../../utils/haptics';

export interface GymExerciseDraggableRowProps {
  itemParams: RenderItemParams<any>;
  // Stable individual log fields — avoid passing full log object so React.memo
  // can bail out when unrelated log data (notes, timer, water) changes.
  logCompleted: boolean;
  logWorkoutStartTime: number | null;
  logExercises?: any[];
  s: any;
  selectedDate: string;
  navigation: any;
  onResumeWorkout: (originalIndex?: number) => void;
  onShowHistory: (ex: { id: string; name: string }) => void;
  onShowMenu: (ex: any) => void;
}

export const GymExerciseDraggableRow: React.FC<GymExerciseDraggableRowProps> = React.memo(({
  itemParams,
  logCompleted,
  logWorkoutStartTime,
  logExercises,
  s,
  selectedDate,
  navigation,
  onResumeWorkout,
  onShowHistory,
  onShowMenu,
}) => {
  const { item: ex, drag, isActive } = itemParams;
  const setsLog = ex.setsLog || [];
  const isDone = setsLog.length > 0 && setsLog.every((set: any) => set.completed);
  const totalSets = setsLog.length;
  const completedSets = setsLog.filter((s: any) => s.completed);

  let subText = '';
  if (completedSets.length > 0) {
    const avgReps = Math.round(completedSets.reduce((sum: number, s: any) => sum + (Number(s.reps) || 0), 0) / completedSets.length) || 0;
    const weights = completedSets.map((s: any) => Number(s.weight ?? s.weightKg) || 0);
    const maxWeight = weights.length > 0 ? Math.max(0, ...weights) : 0;
    subText = `${completedSets.length}/${totalSets} sets, ~${avgReps} reps ${maxWeight > 0 ? `@ ${maxWeight}kg` : ''}`;
  } else {
    subText = `${totalSets} sets, ${ex.targetReps || '0'} reps`;
  }

  let isPartnerWithPrevious = ex.isPartnerWithPrevious ?? false;
  if (!isPartnerWithPrevious && ex.supersetGroup && logExercises) {
    for (let i = ex.originalIndex - 1; i >= 0; i--) {
      const prev = logExercises[i];
      if (prev && !prev.skipped) {
        if (prev.supersetGroup === ex.supersetGroup) {
          isPartnerWithPrevious = true;
        }
        break;
      }
    }
  }

  return (
    <ScaleDecorator>
      <TouchableOpacity
          style={[
          s.row,
          { marginHorizontal: 8 },
          ex.supersetGroup && {
            backgroundColor: 'rgba(255,159,77,0.05)',
            borderColor: 'rgba(255,159,77,0.25)',
            borderWidth: 1,
          },
          isActive && {
            borderColor: '#a599ff',
            borderWidth: 1.5,
            backgroundColor: '#272338',
            shadowColor: '#a599ff',
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.4,
            shadowRadius: 10,
          },
        ]}
        activeOpacity={0.8}
        onPress={() => {
          if (isActive) return;
          hapticLight();
          onResumeWorkout(ex.originalIndex);
        }}
        onLongPress={() => {
          hapticMedium();
          drag();
        }}
        delayLongPress={200}
      >
        {isPartnerWithPrevious && (
          <View style={{
            position: 'absolute',
            top: -8,
            left: 25,
            width: 2,
            height: 8,
            backgroundColor: 'rgba(255,159,77,0.6)',
            zIndex: -1,
          }} />
        )}

        <View style={[s.checkboxCircle, isDone && s.checkboxCircleDone]}>
          {isDone && <Ionicons name="checkmark" size={14} color={COLORS.background} />}
        </View>

        <View style={s.rowTextCol}>
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, paddingRight: 4 }}>
            <Text style={[s.rowTitle, isDone && s.textStrikethrough, isActive && { color: '#a599ff', fontWeight: '700' }]}>
              {ex.name}
            </Text>
            {ex.supersetGroup && (
              <View style={{
                backgroundColor: 'rgba(255,159,77,0.12)',
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: 'rgba(255,159,77,0.25)',
                marginBottom: 4,
              }}>
                <Text style={{ fontSize: 9, fontFamily: FONT_FAMILY.bold, color: '#ff9f4d', letterSpacing: 0.5 }}>
                  SUPER-{ex.supersetGroup}
                </Text>
              </View>
            )}
          </View>
          <Text style={s.rowSubtitle}>{subText}</Text>
        </View>

        <View style={s.rowActions}>
          <TouchableOpacity
            style={s.actionBtn}
            onPress={() => onShowHistory({ id: ex.exerciseId, name: ex.name })}
          >
            <Ionicons name="time-outline" size={20} color={COLORS.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity
            style={s.actionBtn}
            onPress={() => {
              hapticMedium();
              onShowMenu(ex);
            }}
          >
            <Ionicons name="ellipsis-horizontal" size={20} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </ScaleDecorator>
  );
// Custom comparator: only re-render if the item's own sets, the exercise selection,
// or the critical log fields (completed, workoutStartTime) change.
}, (prev, next) =>
  prev.itemParams.item === next.itemParams.item &&
  prev.itemParams.isActive === next.itemParams.isActive &&
  prev.logCompleted === next.logCompleted &&
  prev.logWorkoutStartTime === next.logWorkoutStartTime &&
  prev.logExercises === next.logExercises &&
  prev.s === next.s &&
  prev.selectedDate === next.selectedDate &&
  prev.onResumeWorkout === next.onResumeWorkout &&
  prev.onShowHistory === next.onShowHistory &&
  prev.onShowMenu === next.onShowMenu
);

export default GymExerciseDraggableRow;
