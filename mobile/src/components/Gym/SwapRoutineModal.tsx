/**
 * SwapRoutineModal.tsx — ZenTrack Mobile
 * Allows user to swap the active workout routine for the selected day.
 */
import React, { useMemo } from 'react';
import { View, Text, Modal, TouchableOpacity, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { GYM_PLAN } from '../../data/gymPlan';
import { useWellnessData } from '../../contexts/domains/WellnessContext';
import { getCustomPlanDay } from '../../hooks/useGymLog';
import { hapticSuccess } from '../../utils/haptics';
import { formatIndianDate } from '../../utils/gymUtils';

// Extracted Subcomponents & Styles
import { makeSwapRoutineStyles } from './swapRoutineStyles';
import RoutineSplitCard from './RoutineSplitCard';

interface Props {
  visible: boolean;
  selectedDate: string;
  currentPlanDayIndex?: number;
  onClose: () => void;
  onSelectDay: (dayIndex: number) => void;
}

export function SwapRoutineModal({
  visible,
  selectedDate,
  currentPlanDayIndex,
  onClose,
  onSelectDay,
}: Props) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => makeSwapRoutineStyles(colors, isDark), [colors, isDark]);
  const { userGymPlan } = useWellnessData();

  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => i + 1).map(idx => {
      const custom = getCustomPlanDay(userGymPlan?.customDays, idx);
      const fallback = GYM_PLAN.find(p => p.dayIndex === idx);
      return custom || fallback || { dayIndex: idx, name: `Day ${idx}`, subtitle: '', exercises: [], isRest: false };
    });
  }, [userGymPlan]);

  const handleSelect = (idx: number) => {
    hapticSuccess();
    onSelectDay(idx);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalBg} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={styles.sheet} activeOpacity={1} onPress={e => e.stopPropagation?.()}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Swap Day Routine</Text>
              <Text style={styles.subtitle}>Select a workout program for {formatIndianDate(selectedDate)}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Routine List */}
          <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
            {days.map(d => (
              <RoutineSplitCard
                key={d.dayIndex}
                day={d}
                isSelected={currentPlanDayIndex === d.dayIndex}
                onSelect={handleSelect}
                styles={styles}
                colors={colors}
              />
            ))}
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

export default SwapRoutineModal;
