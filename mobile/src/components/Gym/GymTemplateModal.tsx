import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { hapticMedium, hapticLight } from '../../utils/haptics';
import { FONT_FAMILY } from '../../theme/tokens';

interface Props {
  visible: boolean;
  onClose: () => void;
  onApply: (templateId: 'arnold' | 'ppl', schedulePattern: 'mon_sun' | 'tue_mon' | 'wed_sun' | 'mon_fri') => void;
}

export const GymTemplateModal: React.FC<Props> = ({ visible, onClose, onApply }) => {
  const { colors, isDark } = useTheme();
  const s = useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

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
          {/* Header */}
          <View style={s.header}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={s.title}>Workout Templates</Text>
              <Text style={s.desc}>
                Select your split & schedule. Rest days show your weekly recap.
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={s.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
            {/* Section 1: Template Selection (Side-by-Side Grid) */}
            <Text style={s.sectionHeader}>1. SELECT SPLIT</Text>
            <View style={s.splitGrid}>
              <TouchableOpacity 
                style={[s.splitCard, selected === 'ppl' && s.splitCardActive]} 
                activeOpacity={0.8}
                onPress={() => { hapticLight(); setSelected('ppl'); }}
              >
                <View style={s.splitCardTop}>
                  <Text style={[s.splitCardTitle, selected === 'ppl' && s.splitCardTitleActive]}>Push / Pull / Legs</Text>
                  {selected === 'ppl' && <Ionicons name="checkmark-circle" size={16} color={colors.accentPrimary} />}
                </View>
                <Text style={s.splitCardBadge}>6 Days • 158 Sets</Text>
                <Text style={s.splitCardDetail} numberOfLines={2}>Modernized balanced hypertrophy hitting each muscle 2x/week.</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[s.splitCard, selected === 'arnold' && s.splitCardActive]} 
                activeOpacity={0.8}
                onPress={() => { hapticLight(); setSelected('arnold'); }}
              >
                <View style={s.splitCardTop}>
                  <Text style={[s.splitCardTitle, selected === 'arnold' && s.splitCardTitleActive]}>Arnold Split</Text>
                  {selected === 'arnold' && <Ionicons name="checkmark-circle" size={16} color={colors.accentPrimary} />}
                </View>
                <Text style={s.splitCardBadge}>6 Days • Antagonist</Text>
                <Text style={s.splitCardDetail} numberOfLines={2}>Chest/Back, Shoulders/Arms, Legs/Core isolation & supersets.</Text>
              </TouchableOpacity>
            </View>

            {/* Section 2: Weekly Schedule Selection */}
            <Text style={[s.sectionHeader, { marginTop: 14 }]}>2. SELECT WEEKLY SCHEDULE</Text>

            <TouchableOpacity 
              style={[s.scheduleCard, schedulePattern === 'mon_sun' && s.scheduleCardActive]}
              onPress={() => { hapticLight(); setSchedulePattern('mon_sun'); }}
              activeOpacity={0.8}
            >
              <View style={s.scheduleHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  {schedulePattern === 'mon_sun' && <Ionicons name="radio-button-on" size={16} color={colors.accentPrimary} />}
                  {schedulePattern !== 'mon_sun' && <Ionicons name="radio-button-off" size={16} color={colors.textTertiary} />}
                  <Text style={s.scheduleTitle}>Monday – Saturday</Text>
                </View>
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
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  {schedulePattern === 'tue_mon' && <Ionicons name="radio-button-on" size={16} color={colors.accentPrimary} />}
                  {schedulePattern !== 'tue_mon' && <Ionicons name="radio-button-off" size={16} color={colors.textTertiary} />}
                  <Text style={s.scheduleTitle}>Tuesday – Sunday</Text>
                </View>
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
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  {schedulePattern === 'wed_sun' && <Ionicons name="radio-button-on" size={16} color={colors.accentPrimary} />}
                  {schedulePattern !== 'wed_sun' && <Ionicons name="radio-button-off" size={16} color={colors.textTertiary} />}
                  <Text style={s.scheduleTitle}>Mid-Week Rest Split</Text>
                </View>
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
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  {schedulePattern === 'mon_fri' && <Ionicons name="radio-button-on" size={16} color={colors.accentPrimary} />}
                  {schedulePattern !== 'mon_fri' && <Ionicons name="radio-button-off" size={16} color={colors.textTertiary} />}
                  <Text style={s.scheduleTitle}>Monday – Friday</Text>
                </View>
                <View style={s.restPill}><Text style={s.restPillText}>Sat & Sun Rest</Text></View>
              </View>
              <Text style={s.scheduleSub}>5-day weekday routine with weekends off for full recovery</Text>
            </TouchableOpacity>
          </ScrollView>

          {/* Bottom Action Button */}
          <TouchableOpacity style={s.applyBtn} onPress={handleApply} activeOpacity={0.85}>
            <Text style={s.applyBtnText}>Apply Selected Template</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const makeStyles = (colors: any, isDark: boolean = true) =>
  StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
    content: {
      backgroundColor: isDark ? '#000000' : '#FFFFFF',
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: 18,
      paddingTop: 20,
      paddingBottom: 28,
      maxHeight: '88%',
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,255,255,0.10)' : '#E2E1EA',
    },
    header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 },
    title: { fontSize: 19, fontFamily: FONT_FAMILY.bold, color: isDark ? '#FFFFFF' : '#1C1C1E' },
    closeBtn: { padding: 4, margin: -4 },
    desc: { fontSize: 12, fontFamily: FONT_FAMILY.body, color: isDark ? '#A1A1AA' : '#636366', marginTop: 2, lineHeight: 16 },
    
    scroll: { flexGrow: 0 },
    scrollContent: { paddingBottom: 16 },
    sectionHeader: { fontSize: 10.5, fontFamily: FONT_FAMILY.bold, color: isDark ? 'rgba(255,255,255,0.45)' : '#8E8E93', letterSpacing: 1.2, marginBottom: 8 },
    
    splitGrid: {
      flexDirection: 'row',
      gap: 10,
      marginBottom: 4,
    },
    splitCard: {
      flex: 1,
      backgroundColor: isDark ? '#000000' : '#FFFFFF',
      borderRadius: 14,
      padding: 12,
      borderWidth: 1.5,
      borderColor: isDark ? 'rgba(255,255,255,0.12)' : '#E2E1EA',
      justifyContent: 'space-between',
    },
    splitCardActive: {
      borderColor: isDark ? '#a599ff' : colors.accentPrimary,
      backgroundColor: isDark ? 'rgba(165,153,255,0.06)' : 'rgba(108,92,231,0.06)',
    },
    splitCardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
    splitCardTitle: { fontSize: 13, fontFamily: FONT_FAMILY.bold, color: isDark ? '#FFFFFF' : '#1C1C1E', flex: 1 },
    splitCardTitleActive: { color: isDark ? '#FFFFFF' : '#1C1C1E' },
    splitCardBadge: { fontSize: 10.5, fontFamily: FONT_FAMILY.medium, color: isDark ? '#a599ff' : colors.accentPrimary, marginBottom: 4 },
    splitCardDetail: { fontSize: 11, fontFamily: FONT_FAMILY.body, color: isDark ? '#A1A1AA' : '#636366', lineHeight: 15 },

    scheduleCard: {
      backgroundColor: isDark ? '#000000' : '#FFFFFF',
      borderRadius: 12,
      paddingVertical: 11,
      paddingHorizontal: 12,
      marginBottom: 7,
      borderWidth: 1.5,
      borderColor: isDark ? 'rgba(255,255,255,0.12)' : '#E2E1EA',
    },
    scheduleCardActive: {
      borderColor: isDark ? '#a599ff' : colors.accentPrimary,
      backgroundColor: isDark ? 'rgba(165,153,255,0.06)' : 'rgba(108,92,231,0.06)',
    },
    scheduleHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
    scheduleTitle: { fontSize: 13, fontFamily: FONT_FAMILY.bold, color: isDark ? '#FFFFFF' : '#1C1C1E' },
    scheduleSub: { fontSize: 10.5, fontFamily: FONT_FAMILY.body, color: isDark ? '#A1A1AA' : '#636366', marginLeft: 22 },
    restPill: {
      backgroundColor: isDark ? 'rgba(255,159,77,0.12)' : 'rgba(217,119,6,0.10)',
      paddingHorizontal: 7,
      paddingVertical: 2,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255,159,77,0.25)' : 'rgba(217,119,6,0.25)',
    },
    restPillText: { fontSize: 9.5, fontFamily: FONT_FAMILY.bold, color: isDark ? '#FFAA55' : '#D97706' },

    applyBtn: {
      backgroundColor: isDark ? '#FFFFFF' : colors.accentPrimary,
      paddingVertical: 14,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 8,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isDark ? 0.2 : 0.15,
      shadowRadius: 6,
      elevation: 4,
    },
    applyBtnText: {
      color: isDark ? '#000000' : '#FFFFFF',
      fontSize: 15,
      fontFamily: FONT_FAMILY.bold,
    },
  });
