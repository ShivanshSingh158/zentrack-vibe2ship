import React, { useState, useMemo } from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { hapticMedium, hapticLight } from '../../utils/haptics';

// Extracted Subcomponents & Styles
import { makeGymTemplateStyles } from './gymTemplateStyles';
import SchedulePatternCard from './SchedulePatternCard';

interface Props {
  visible: boolean;
  onClose: () => void;
  onApply: (templateId: 'arnold' | 'ppl', schedulePattern: 'mon_sun' | 'tue_mon' | 'wed_sun' | 'mon_fri') => void;
}

export const GymTemplateModal: React.FC<Props> = ({ visible, onClose, onApply }) => {
  const { colors, isDark } = useTheme();
  const s = useMemo(() => makeGymTemplateStyles(colors, isDark), [colors, isDark]);

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
        <TouchableOpacity style={s.content} activeOpacity={1} onPress={e => e.stopPropagation?.()}>
          {/* Header */}
          <View style={s.header}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={s.title}>Workout Templates</Text>
              <Text style={s.desc}>Select your split & schedule. Rest days show your weekly recap.</Text>
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
                <Text style={s.splitCardBadge}>6 Days • 126 Sets (High Efficiency)</Text>
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

            <SchedulePatternCard
              patternId="mon_sun"
              selectedPattern={schedulePattern}
              onSelect={setSchedulePattern}
              title="Monday – Saturday"
              restLabel="Sunday Rest"
              subtitle="Standard 6-day split (Push/Pull/Legs x2, Sunday Recap)"
              styles={s}
              colors={colors}
            />

            <SchedulePatternCard
              patternId="tue_mon"
              selectedPattern={schedulePattern}
              onSelect={setSchedulePattern}
              title="Tuesday – Sunday"
              restLabel="Monday Rest"
              subtitle="Starts on Tuesday, trains through Sunday, Monday Recap"
              styles={s}
              colors={colors}
            />

            <SchedulePatternCard
              patternId="wed_sun"
              selectedPattern={schedulePattern}
              onSelect={setSchedulePattern}
              title="Mid-Week Rest Split"
              restLabel="Wed & Sun Rest"
              subtitle="Mon, Tue, Thu, Fri, Sat workout days (PPL + Upper/Lower)"
              styles={s}
              colors={colors}
            />

            <SchedulePatternCard
              patternId="mon_fri"
              selectedPattern={schedulePattern}
              onSelect={setSchedulePattern}
              title="Monday – Friday"
              restLabel="Sat & Sun Rest"
              subtitle="5-day weekday routine with weekends off for full recovery"
              styles={s}
              colors={colors}
            />
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

export default GymTemplateModal;
