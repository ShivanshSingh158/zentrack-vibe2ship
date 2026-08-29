import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONT_FAMILY, RADIUS, SPACE } from '../../theme/tokens';
import { hapticLight, hapticSuccess } from '../../utils/haptics';

export interface SupersetPickerModalProps {
  visible: boolean;
  exercise: any;
  exercises: any[];
  colors: any;
  styles: any;
  onClose: () => void;
  onRemoveSuperset: () => void;
  onSelectPartner: (altEx: any) => void;
}

export const SupersetPickerModal: React.FC<SupersetPickerModalProps> = React.memo(({
  visible,
  exercise,
  exercises,
  colors,
  styles,
  onClose,
  onRemoveSuperset,
  onSelectPartner,
}) => {
  if (!visible) return null;

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { maxHeight: '75%' }]}>
          <View style={styles.modalHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="git-merge-outline" size={20} color="#ff9f4d" />
              <Text style={styles.modalTitle}>Superset Grouping</Text>
            </View>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <Text style={styles.modalSubtitle}>Pair this exercise with another to use a fast 30s active rest timer.</Text>

          <ScrollView style={{ marginTop: 16 }} showsVerticalScrollIndicator={false}>
            {exercise.supersetGroup && (
              <TouchableOpacity
                style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                  backgroundColor: 'rgba(255,69,58,0.1)', padding: 16, borderRadius: RADIUS.lg,
                  borderWidth: 1, borderColor: 'rgba(255,69,58,0.3)', marginBottom: 12,
                }}
                onPress={() => {
                  hapticLight();
                  onRemoveSuperset();
                }}
              >
                <Ionicons name="unlink-outline" size={16} color="#FF453A" style={{ marginRight: 8 }} />
                <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 14, color: '#FF453A' }}>Remove from Superset</Text>
              </TouchableOpacity>
            )}

            {exercises.filter(e => e.exerciseId !== exercise.exerciseId).map((altEx, idx) => {
              const isPartner = altEx.supersetGroup && altEx.supersetGroup === exercise.supersetGroup;
              return (
                <TouchableOpacity
                  key={idx}
                  style={{
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                    backgroundColor: isPartner ? 'rgba(255,159,77,0.1)' : '#161618',
                    borderRadius: RADIUS.lg, padding: SPACE.md, marginBottom: SPACE.sm,
                    borderWidth: 1, borderColor: isPartner ? '#ff9f4d' : 'rgba(255,255,255,0.06)',
                  }}
                  activeOpacity={0.7}
                  onPress={() => {
                    hapticSuccess();
                    onSelectPartner(altEx);
                  }}
                >
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={{ fontFamily: FONT_FAMILY.bold, fontSize: 15, color: isPartner ? '#ff9f4d' : '#ffffff', marginBottom: 4 }}>
                      {altEx.name}
                    </Text>
                    <Text style={{ fontFamily: FONT_FAMILY.body, fontSize: 12, color: colors.textMuted }}>
                      {altEx.muscle}  •  {altEx.targetSets} Sets
                    </Text>
                  </View>
                  {isPartner && <Ionicons name="checkmark-circle" size={24} color="#ff9f4d" />}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
});

export default SupersetPickerModal;
