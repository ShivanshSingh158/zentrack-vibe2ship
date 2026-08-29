import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONT_FAMILY, RADIUS, SPACE } from '../../theme/tokens';
import { resolveExerciseTargetMuscle } from '../../utils/gymUtils';

export interface ActiveSwapModalProps {
  visible: boolean;
  exercise: any;
  aiSwapList: any[];
  isAiSwapLoading: boolean;
  colors: any;
  styles: any;
  onClose: () => void;
  onSelectSwap: (alt: any) => void;
}

export const ActiveSwapModal: React.FC<ActiveSwapModalProps> = React.memo(({
  visible,
  exercise,
  aiSwapList,
  isAiSwapLoading,
  colors,
  styles,
  onClose,
  onSelectSwap,
}) => {
  if (!visible || !exercise) return null;

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { maxHeight: '85%' }]}>
          <View style={styles.modalHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="sparkles" size={18} color="#a599ff" />
              <Text style={styles.modalTitle}>S.A.R.A AI Exercise Swap</Text>
            </View>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <Text style={styles.modalSubtitle}>
            Alternatives for {resolveExerciseTargetMuscle(exercise.name, exercise.muscle).targetMuscle}
          </Text>

          {isAiSwapLoading && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 8, paddingHorizontal: 4 }}>
              <ActivityIndicator size="small" color="#a599ff" />
              <Text style={{ fontSize: 12, color: '#a599ff', fontFamily: FONT_FAMILY.bold }}>Finding alternatives...</Text>
            </View>
          )}

          <ScrollView style={{ marginTop: 12 }} showsVerticalScrollIndicator={false}>
            {aiSwapList.map((alt: any, idx: number) => (
              <TouchableOpacity
                key={idx}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  backgroundColor: '#161618',
                  borderRadius: RADIUS.lg,
                  padding: SPACE.md,
                  marginBottom: SPACE.sm,
                  borderWidth: 1,
                  borderColor: alt.isFromTemplate ? 'rgba(165,153,255,0.25)' : 'rgba(255,255,255,0.06)',
                }}
                activeOpacity={0.75}
                onPress={() => onSelectSwap(alt)}
              >
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                    <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 15, color: '#ffffff' }}>
                      {alt.name}
                    </Text>
                    {alt.isFromTemplate && (
                      <View style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 4,
                        backgroundColor: 'rgba(165,153,255,0.12)',
                        paddingHorizontal: 6,
                        paddingVertical: 2,
                        borderRadius: 6,
                        borderWidth: 1,
                        borderColor: 'rgba(165,153,255,0.25)',
                      }}>
                        <Ionicons name="calendar-outline" size={10} color="#a599ff" />
                        <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 9.5, color: '#a599ff' }}>
                          {alt.dayName || 'Template'}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={{ fontFamily: FONT_FAMILY.body, fontSize: 12, color: colors.textMuted }}>
                    {alt.targetSets} Sets × {alt.targetReps} Reps  •  {alt.restTimeSecs}s Rest
                  </Text>
                </View>

                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
});

export default ActiveSwapModal;
