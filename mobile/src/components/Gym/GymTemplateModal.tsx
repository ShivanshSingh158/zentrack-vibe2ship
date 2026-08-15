import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../theme/tokens';
import { hapticMedium, hapticLight } from '../../utils/haptics';

interface Props {
  visible: boolean;
  onClose: () => void;
  onApply: (templateId: 'arnold' | 'ppl', schedulePattern: 'mon_sun' | 'tue_mon' | 'wed_sun' | 'mon_fri') => void;
}

export const GymTemplateModal: React.FC<Props> = ({ visible, onClose, onApply }) => {
  const [selected, setSelected] = useState<'arnold' | 'ppl'>('ppl');
  const [schedulePattern, setSchedulePattern] = useState<'mon_sun' | 'tue_mon' | 'wed_sun' | 'mon_fri'>('mon_sun');

  const handleApply = () => {
    hapticMedium();
    onApply(selected, schedulePattern);
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
            Select your split and your weekly training schedule. Rest days will automatically display your weekly performance recap.
          </Text>

          <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>
            {/* Template Selection */}
            <Text style={s.sectionHeader}>1. SELECT SPLIT</Text>
            <TouchableOpacity 
              style={[s.optionCard, selected === 'ppl' && s.optionActive]} 
              activeOpacity={0.8}
              onPress={() => { hapticLight(); setSelected('ppl'); }}
            >
              <View style={s.cardHeader}>
                <Text style={[s.cardTitle, selected === 'ppl' && s.cardTitleActive]}>Push / Pull / Legs (PPL)</Text>
                {selected === 'ppl' && <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />}
              </View>
              <Text style={s.cardSub}>6 Days • Balanced 158 Sets • Maximum Hypertrophy</Text>
              <Text style={s.cardDetail}>A modernized PPL split perfectly balancing volume across all major and minor muscle heads, hitting everything 2x per week.</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[s.optionCard, selected === 'arnold' && s.optionActive]} 
              activeOpacity={0.8}
              onPress={() => { hapticLight(); setSelected('arnold'); }}
            >
              <View style={s.cardHeader}>
                <Text style={[s.cardTitle, selected === 'arnold' && s.cardTitleActive]}>Two Muscles / Day (Arnold)</Text>
                {selected === 'arnold' && <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />}
              </View>
              <Text style={s.cardSub}>6 Days • Classic Arnold Split</Text>
              <Text style={s.cardDetail}>Focuses heavily on Chest/Back, Shoulders/Arms, and Legs/Core. Great for intense isolation and superset opportunities.</Text>
            </TouchableOpacity>

            {/* Weekly Schedule Days Selection */}
            <Text style={[s.sectionHeader, { marginTop: 12 }]}>2. SELECT WEEKLY SCHEDULE</Text>

            <TouchableOpacity 
              style={[s.scheduleCard, schedulePattern === 'mon_sun' && s.scheduleCardActive]}
              onPress={() => { hapticLight(); setSchedulePattern('mon_sun'); }}
              activeOpacity={0.8}
            >
              <View style={s.scheduleHeader}>
                <Text style={s.scheduleTitle}>Monday – Saturday</Text>
                <View style={s.restPill}><Text style={s.restPillText}>Sunday Rest</Text></View>
              </View>
              <Text style={s.scheduleSub}>Standard 6-day split (Push/Pull/Legs x2, Sunday Recap)</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[s.scheduleCard, schedulePattern === 'tue_mon' && s.scheduleCardActive]}
              onPress={() => { hapticLight(); setSchedulePattern('tue_mon'); }}
              activeOpacity={0.8}
            >
              <View style={s.scheduleHeader}>
                <Text style={s.scheduleTitle}>Tuesday – Sunday</Text>
                <View style={s.restPill}><Text style={s.restPillText}>Monday Rest</Text></View>
              </View>
              <Text style={s.scheduleSub}>Starts on Tuesday, trains through Sunday, Monday Recap</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[s.scheduleCard, schedulePattern === 'wed_sun' && s.scheduleCardActive]}
              onPress={() => { hapticLight(); setSchedulePattern('wed_sun'); }}
              activeOpacity={0.8}
            >
              <View style={s.scheduleHeader}>
                <Text style={s.scheduleTitle}>Mid-Week Rest Split</Text>
                <View style={s.restPill}><Text style={s.restPillText}>Wed & Sun Rest</Text></View>
              </View>
              <Text style={s.scheduleSub}>Mon, Tue, Thu, Fri, Sat workout days (PPL + Upper/Lower)</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[s.scheduleCard, schedulePattern === 'mon_fri' && s.scheduleCardActive]}
              onPress={() => { hapticLight(); setSchedulePattern('mon_fri'); }}
              activeOpacity={0.8}
            >
              <View style={s.scheduleHeader}>
                <Text style={s.scheduleTitle}>Monday – Friday</Text>
                <View style={s.restPill}><Text style={s.restPillText}>Sat & Sun Rest</Text></View>
              </View>
              <Text style={s.scheduleSub}>5-day weekday routine with weekends off for full recovery</Text>
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
  content: { backgroundColor: '#000000', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 48, maxHeight: '85%', borderWidth: 1, borderColor: '#27272A' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  title: { fontSize: 20, fontWeight: '700', color: '#FFFFFF' },
  closeBtn: { padding: 4, margin: -4 },
  desc: { fontSize: 13, color: '#A1A1AA', marginBottom: 16, lineHeight: 18 },
  scroll: { marginBottom: 16 },
  sectionHeader: { fontSize: 11, fontWeight: '700', color: '#A1A1AA', letterSpacing: 1.2, marginBottom: 8 },
  
  optionCard: { backgroundColor: '#121214', borderRadius: 16, padding: 16, marginBottom: 10, borderWidth: 1.5, borderColor: '#27272A' },
  optionActive: { borderColor: '#FFFFFF', backgroundColor: 'rgba(255,255,255,0.06)' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  cardTitleActive: { color: '#FFFFFF' },
  cardSub: { fontSize: 12, fontWeight: '600', color: '#A1A1AA', marginBottom: 6 },
  cardDetail: { fontSize: 12, color: '#71717A', lineHeight: 17 },

  scheduleCard: { backgroundColor: '#121214', borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1.5, borderColor: '#27272A' },
  scheduleCardActive: { borderColor: '#a599ff', backgroundColor: 'rgba(165,153,255,0.08)' },
  scheduleHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  scheduleTitle: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  scheduleSub: { fontSize: 11, color: '#8E8E93' },
  restPill: { backgroundColor: 'rgba(255,159,77,0.12)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,159,77,0.25)' },
  restPillText: { fontSize: 10, fontWeight: '700', color: '#ff9f4d' },

  applyBtn: { backgroundColor: '#FFFFFF', paddingVertical: 16, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  applyBtnText: { color: '#000000', fontSize: 16, fontWeight: '700' },
});
