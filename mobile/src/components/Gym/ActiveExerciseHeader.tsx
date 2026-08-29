import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Reanimated, { FadeIn } from 'react-native-reanimated';
import { FONT_FAMILY, RADIUS } from '../../theme/tokens';
import { hexToRgba } from '../../utils/gymUtils';

export interface ActiveExerciseHeaderProps {
  exercise: any;
  partnerExercise: any | null;
  overloadSuggestion: any | null;
  lastTimeData: string | null;
  showVideo: boolean;
  colors: any;
  styles: any;
  onSwapPress: () => void;
  onSupersetPress: () => void;
  onVideoToggle: () => void;
  onSwitchToPartner: () => void;
}

export const ActiveExerciseHeader: React.FC<ActiveExerciseHeaderProps> = React.memo(({
  exercise,
  partnerExercise,
  overloadSuggestion,
  lastTimeData,
  showVideo,
  colors,
  styles,
  onSwapPress,
  onSupersetPress,
  onVideoToggle,
  onSwitchToPartner,
}) => {
  return (
    <View style={styles.titleArea}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <View style={[styles.musclePill, { backgroundColor: hexToRgba(colors.accentPrimary, 0.15), marginBottom: 0 }]}>
          <View style={[styles.muscleDot, { backgroundColor: colors.accentPrimary }]} />
          <Text style={[styles.muscleText, { color: colors.accentPrimary }]}>{exercise.muscle}</Text>
        </View>

        <TouchableOpacity
          onPress={onSwapPress}
          style={[styles.musclePill, { backgroundColor: 'rgba(255,255,255,0.1)', marginBottom: 0, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center' }]}
        >
          <Ionicons name="swap-horizontal" size={14} color={colors.textPrimary} />
          <Text style={[styles.muscleText, { color: colors.textPrimary, marginLeft: 4 }]}>SWAP</Text>
        </TouchableOpacity>

        {/* Superset badge/button */}
        <TouchableOpacity
          onPress={onSupersetPress}
          style={[styles.musclePill, {
            backgroundColor: exercise.supersetGroup
              ? 'rgba(255,159,77,0.18)' : 'rgba(255,255,255,0.07)',
            marginBottom: 0, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center',
            borderColor: exercise.supersetGroup ? 'rgba(255,159,77,0.4)' : 'rgba(255,255,255,0.1)',
            borderWidth: 1,
          }]}
        >
          <Ionicons name="git-merge-outline" size={13} color={exercise.supersetGroup ? '#ff9f4d' : colors.textMuted} />
          <Text style={[styles.muscleText, { color: exercise.supersetGroup ? '#ff9f4d' : colors.textMuted, marginLeft: 4 }]}>
            {exercise.supersetGroup ? `SUPER-${exercise.supersetGroup}` : 'SUPERSET'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16, width: '100%' }}>
        <Text style={styles.exerciseName} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.85}>
          {exercise.name}
        </Text>
        <TouchableOpacity
          activeOpacity={0.75}
          onPress={onVideoToggle}
          style={styles.videoBtn}
        >
          <Ionicons
            name={showVideo ? "close-circle" : "logo-youtube"}
            size={showVideo ? 24 : 28}
            color={showVideo ? colors.textMuted : "#FF0000"}
          />
        </TouchableOpacity>
      </View>

      {/* Shows last session data immediately, even before sets are completed */}
      <Text style={styles.lastTimeText}>
        {lastTimeData ?? `Goal: ${exercise.targetSets} sets × ${exercise.targetReps} reps`}
      </Text>

      {/* Superset Partner Companion Banner */}
      {exercise.supersetGroup && partnerExercise && (
        <TouchableOpacity
          activeOpacity={0.75}
          onPress={onSwitchToPartner}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'rgba(255,159,77,0.12)',
            borderWidth: 1,
            borderColor: 'rgba(255,159,77,0.35)',
            borderRadius: RADIUS.md,
            paddingHorizontal: 12,
            paddingVertical: 8,
            marginTop: 8,
            width: '92%',
            alignSelf: 'center',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, marginRight: 10, minWidth: 0 }}>
            <Ionicons name="git-merge" size={14} color="#ff9f4d" style={{ flexShrink: 0 }} />
            <View style={{
              backgroundColor: 'rgba(255,159,77,0.2)',
              paddingHorizontal: 6,
              paddingVertical: 2,
              borderRadius: 6,
              flexShrink: 0,
            }}>
              <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 10, color: '#ff9f4d', letterSpacing: 0.5 }}>
                SUPER-{exercise.supersetGroup}
              </Text>
            </View>
            <Text
              style={{
                fontFamily: FONT_FAMILY.medium,
                fontSize: 12,
                color: colors.textPrimary,
                flex: 1,
                flexShrink: 1,
              }}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {partnerExercise.name}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <Text style={{ fontSize: 11, color: '#ff9f4d', fontFamily: FONT_FAMILY.bold }}>Switch</Text>
            <Ionicons name="arrow-forward" size={12} color="#ff9f4d" />
          </View>
        </TouchableOpacity>
      )}

      {overloadSuggestion && overloadSuggestion.type !== 'maintain' && (
        <Reanimated.View entering={FadeIn.duration(400)} style={[
          styles.overloadChip,
          { backgroundColor: overloadSuggestion.type === 'increase' ? 'rgba(94,218,158,0.15)' : 'rgba(255,159,77,0.15)' }
        ]}>
          <Ionicons
            name={overloadSuggestion.type === 'increase' ? 'trending-up' : 'trending-down'}
            size={14}
            color={overloadSuggestion.type === 'increase' ? colors.accentGreen : colors.accentAmber}
          />
          <Text style={[styles.overloadChipText, {
            color: overloadSuggestion.type === 'increase' ? colors.accentGreen : colors.accentAmber
          }]}>
            {overloadSuggestion.type === 'increase' ? '📈' : '📉'} {overloadSuggestion.recommended}kg suggested • {overloadSuggestion.reason}
          </Text>
        </Reanimated.View>
      )}
    </View>
  );
});

export default ActiveExerciseHeader;
