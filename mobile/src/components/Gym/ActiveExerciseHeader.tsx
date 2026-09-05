import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONT_FAMILY, RADIUS } from '../../theme/tokens';
import { hexToRgba, resolveExerciseTargetMuscle } from '../../utils/gymUtils';

export interface ActiveExerciseHeaderProps {
  exercise: any;
  partnerExercise: any | null;
  overloadSuggestion: any | null;
  lastTimeData: string | null;
  showVideo: boolean;
  activeSetIndex?: number;
  isAllComplete?: boolean;
  onRepeatPrevious?: () => void;
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
  activeSetIndex,
  isAllComplete,
  onRepeatPrevious,
  colors,
  styles,
  onSwapPress,
  onSupersetPress,
  onVideoToggle,
  onSwitchToPartner,
}) => {
  const rawMuscle = exercise.muscle;
  const resolved = resolveExerciseTargetMuscle(exercise.name, rawMuscle).targetMuscle;
  const muscleName = (resolved || rawMuscle || 'Mixed').toUpperCase();
  // Dynamic font sizing for long muscle group names (e.g., TRANSVERSE ABS, ANTERIOR DELTOID)
  const muscleFontSize = muscleName.length > 13 ? 9.5 : muscleName.length > 9 ? 10.5 : 11.5;

  const exNameStr = exercise.name || '';
  // Dynamic font sizing for exercise name to guarantee 1-line fit:
  // Short (<= 17 chars, e.g. "Barbell Curls", "Bench Press"): 20px (standard large size)
  // Medium (18-24 chars, e.g. "Incline Dumbbell Press"): 17.5px
  // Long (25+ chars, e.g. "Heel-Elevated Goblet Squats", "Romanian Deadlifts (RDLs)"): 15.5px
  const nameFontSize = exNameStr.length > 24 ? 15.5 : exNameStr.length > 17 ? 17.5 : 20;
  const youtubeIconSize = exNameStr.length > 24 ? 22 : 26;

  return (
    <View style={styles.titleArea}>
      {/* 3-Pill Header Row: Guaranteed 1 Line Always */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          marginBottom: 10,
          width: '100%',
          paddingHorizontal: 6,
          flexWrap: 'nowrap',
        }}
      >
        {/* Muscle Group Pill */}
        <View
          style={[
            styles.musclePill,
            {
              backgroundColor: hexToRgba(colors.accentPrimary, 0.15),
              marginBottom: 0,
              paddingHorizontal: 8,
              paddingVertical: 4,
              flexShrink: 1,
              maxWidth: '46%',
              flexDirection: 'row',
              alignItems: 'center',
            },
          ]}
        >
          <View style={[styles.muscleDot, { backgroundColor: colors.accentPrimary, marginRight: 4, flexShrink: 0 }]} />
          <Text
            style={[styles.muscleText, { color: colors.accentPrimary, fontSize: muscleFontSize }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
          >
            {muscleName}
          </Text>
        </View>

        {/* Swap Button */}
        <TouchableOpacity
          onPress={onSwapPress}
          style={[
            styles.musclePill,
            {
              backgroundColor: 'rgba(255,255,255,0.08)',
              marginBottom: 0,
              paddingHorizontal: 8,
              paddingVertical: 4,
              flexDirection: 'row',
              alignItems: 'center',
              flexShrink: 0,
            },
          ]}
        >
          <Ionicons name="swap-horizontal" size={13} color={colors.textPrimary} />
          <Text style={[styles.muscleText, { color: colors.textPrimary, marginLeft: 3, fontSize: 11 }]}>SWAP</Text>
        </TouchableOpacity>

        {/* Superset Button */}
        <TouchableOpacity
          onPress={onSupersetPress}
          style={[
            styles.musclePill,
            {
              backgroundColor: exercise.supersetGroup
                ? 'rgba(255,159,77,0.18)'
                : 'rgba(255,255,255,0.06)',
              marginBottom: 0,
              paddingHorizontal: 8,
              paddingVertical: 4,
              flexDirection: 'row',
              alignItems: 'center',
              borderColor: exercise.supersetGroup ? 'rgba(255,159,77,0.4)' : 'rgba(255,255,255,0.08)',
              borderWidth: 1,
              flexShrink: 0,
            },
          ]}
        >
          <Ionicons
            name="git-merge-outline"
            size={12}
            color={exercise.supersetGroup ? '#ff9f4d' : colors.textMuted}
          />
          <Text
            style={[
              styles.muscleText,
              {
                color: exercise.supersetGroup ? '#ff9f4d' : colors.textMuted,
                marginLeft: 3,
                fontSize: 11,
              },
            ]}
          >
            {exercise.supersetGroup ? `SUPER-${exercise.supersetGroup}` : 'SUPERSET'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Exercise Name & YouTube Form Button — Guaranteed 1 Line */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          paddingHorizontal: 12,
          width: '100%',
          flexWrap: 'nowrap',
        }}
      >
        <Text
          style={[
            styles.exerciseName,
            {
              fontSize: nameFontSize,
              marginBottom: 0,
              flexShrink: 1,
            },
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.78}
        >
          {exercise.name}
        </Text>
        <TouchableOpacity
          activeOpacity={0.75}
          onPress={onVideoToggle}
          style={[styles.videoBtn, { flexShrink: 0, padding: 2 }]}
        >
          <Ionicons
            name={showVideo ? "close-circle" : "logo-youtube"}
            size={showVideo ? 20 : youtubeIconSize}
            color={showVideo ? colors.textMuted : "#FF0000"}
          />
        </TouchableOpacity>
      </View>

      {/* Goal / Last Session Stats + Inline Match Target Action (Single Compact Row) */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          marginTop: 4,
          marginBottom: 0,
          width: '100%',
          paddingHorizontal: 8,
          flexWrap: 'nowrap',
        }}
      >
        <Text
          style={[
            styles.lastTimeText,
            { marginTop: 0, textAlign: 'center', flexShrink: 1, fontSize: 12 },
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.82}
        >
          {lastTimeData ?? `Goal: ${exercise.targetSets} sets × ${exercise.targetReps} reps`}
        </Text>

        {!isAllComplete && onRepeatPrevious && (
          <TouchableOpacity
            activeOpacity={0.75}
            style={[styles.quickChipRepeat, { paddingVertical: 4, paddingHorizontal: 8, flexShrink: 0 }]}
            onPress={onRepeatPrevious}
          >
            <Ionicons
              name={activeSetIndex && activeSetIndex > 0 ? "copy-outline" : "locate-outline"}
              size={11}
              color="#a599ff"
            />
            <Text style={[styles.quickChipTextHighlight, { fontSize: 11 }]}>
              {activeSetIndex && activeSetIndex > 0 ? `Same as Set ${activeSetIndex}` : 'Match Target'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Progression & Deload Intelligence Banner (Compact 1-Line) */}
      {overloadSuggestion && overloadSuggestion.reason && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            backgroundColor: overloadSuggestion.isDeload
              ? 'rgba(255, 127, 80, 0.12)'
              : overloadSuggestion.type === 'increase' || overloadSuggestion.reason.includes('🔥') || overloadSuggestion.reason.includes('⚡')
              ? 'rgba(94, 218, 158, 0.10)'
              : 'rgba(255, 255, 255, 0.04)',
            borderColor: overloadSuggestion.isDeload
              ? 'rgba(255, 127, 80, 0.30)'
              : overloadSuggestion.type === 'increase' || overloadSuggestion.reason.includes('🔥') || overloadSuggestion.reason.includes('⚡')
              ? 'rgba(94, 218, 158, 0.28)'
              : 'rgba(255, 255, 255, 0.08)',
            borderWidth: 1,
            borderRadius: RADIUS.full,
            paddingHorizontal: 12,
            paddingVertical: 5,
            marginTop: 6,
            width: '92%',
            alignSelf: 'center',
          }}
        >
          <Ionicons
            name={
              overloadSuggestion.isDeload
                ? 'warning-outline'
                : overloadSuggestion.type === 'increase' || overloadSuggestion.reason.includes('🔥')
                ? 'trending-up'
                : overloadSuggestion.reason.includes('⚡')
                ? 'flash-outline'
                : 'information-circle-outline'
            }
            size={13}
            color={
              overloadSuggestion.isDeload
                ? '#ff7f50'
                : overloadSuggestion.type === 'increase' || overloadSuggestion.reason.includes('🔥') || overloadSuggestion.reason.includes('⚡')
                ? '#5eda9e'
                : '#8e8e93'
            }
            style={{ flexShrink: 0 }}
          />
          <Text
            style={{
              fontFamily: FONT_FAMILY.medium,
              fontSize: 11.5,
              color: overloadSuggestion.isDeload
                ? '#ff7f50'
                : overloadSuggestion.type === 'increase' || overloadSuggestion.reason.includes('🔥') || overloadSuggestion.reason.includes('⚡')
                ? '#5eda9e'
                : '#9d9da5',
              flex: 1,
            }}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.85}
          >
            {overloadSuggestion.reason}
          </Text>
        </View>
      )}

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
                {exercise.supersetGroup}
              </Text>
            </View>
            <Text style={{ fontFamily: FONT_FAMILY.medium, fontSize: 12, color: '#ff9f4d', flex: 1 }} numberOfLines={1}>
              {partnerExercise.name}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, flexShrink: 0 }}>
            <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 11, color: '#ff9f4d' }}>SWITCH</Text>
            <Ionicons name="chevron-forward" size={12} color="#ff9f4d" />
          </View>
        </TouchableOpacity>
      )}
    </View>
  );
});

export default ActiveExerciseHeader;
