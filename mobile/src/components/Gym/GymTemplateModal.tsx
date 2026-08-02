import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../theme/tokens';
import { hapticMedium, hapticLight } from '../../utils/haptics';

interface Props {
  visible: boolean;
  onClose: () => void;
  onApply: (templateId: 'arnold' | 'ppl') => void;
}

export const GymTemplateModal: React.FC<Props> = ({ visible, onClose, onApply }) => {
  const [selected, setSelected] = useState<'arnold' | 'ppl'>('ppl');

  const handleApply = () => {
    hapticMedium();
    onApply(selected);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={s.content} activeOpacity={1} onPress={(e) => e.stopPropagation?.()}>
          <View style={s.header}>
            <Text style={s.title}>Workout Templates</Text>
            <TouchableOpacity onPress={onClose} style={s.closeBtn}>
              <Ionicons name="close" size={24} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>
          
          <Text style={s.desc}>
            Applying a template will overwrite your master plan for future days. Your past logged workouts will not be affected.
          </Text>

          <ScrollView style={s.scroll}>
            <TouchableOpacity 
              style={[s.optionCard, selected === 'ppl' && s.optionActive]} 
              activeOpacity={0.8}
              onPress={() => { hapticLight(); setSelected('ppl'); }}
            >
              <View style={s.cardHeader}>
                <Text style={[s.cardTitle, selected === 'ppl' && s.cardTitleActive]}>Push / Pull / Legs (PPL)</Text>
                {selected === 'ppl' && <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />}
              </View>
              <Text style={s.cardSub}>6 Days • High Volume • Maximum Hypertrophy</Text>
              <Text style={s.cardDetail}>A modernized PPL split perfectly balancing volume across all major and minor muscle heads, hitting everything 2x per week.</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[s.optionCard, selected === 'arnold' && s.optionActive]} 
              activeOpacity={0.8}
              onPress={() => { hapticLight(); setSelected('arnold'); }}
            >
              <View style={s.cardHeader}>
                <Text style={[s.cardTitle, selected === 'arnold' && s.cardTitleActive]}>Two Muscles / Day</Text>
                {selected === 'arnold' && <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />}
              </View>
              <Text style={s.cardSub}>6 Days • Classic Arnold Split</Text>
              <Text style={s.cardDetail}>Focuses heavily on Chest/Back, Shoulders/Arms, and Legs/Core. Great for intense isolation and superset opportunities.</Text>
            </TouchableOpacity>
          </ScrollView>

          <TouchableOpacity style={s.applyBtn} onPress={handleApply}>
            <Text style={s.applyBtnText}>Apply Selected Template</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  content: { backgroundColor: '#000000', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 48, maxHeight: '80%', borderWidth: 1, borderColor: '#27272A' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title: { fontSize: 20, fontWeight: '700', color: '#FFFFFF' },
  closeBtn: { padding: 4, margin: -4 },
  desc: { fontSize: 13, color: '#A1A1AA', marginBottom: 24, lineHeight: 18 },
  scroll: { marginBottom: 24 },
  
  optionCard: { backgroundColor: '#121214', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1.5, borderColor: '#27272A' },
  optionActive: { borderColor: '#FFFFFF', backgroundColor: 'rgba(255,255,255,0.06)' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  cardTitleActive: { color: '#FFFFFF' },
  cardSub: { fontSize: 13, fontWeight: '600', color: '#A1A1AA', marginBottom: 8 },
  cardDetail: { fontSize: 13, color: '#71717A', lineHeight: 18 },

  applyBtn: { backgroundColor: '#FFFFFF', paddingVertical: 16, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  applyBtnText: { color: '#000000', fontSize: 16, fontWeight: '700' },
});
