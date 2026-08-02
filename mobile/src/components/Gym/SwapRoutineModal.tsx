/**
 * SwapRoutineModal.tsx — ZenTrack Mobile
 * Allows user to swap the active workout routine for the selected day.
 */

import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS, COLORS } from '../../theme/tokens';
import { GYM_PLAN } from '../../data/gymPlan';
import { useMobileData } from '../../contexts/MobileDataContext';
import { getCustomPlanDay } from '../../hooks/useGymLog';
import { hapticSuccess } from '../../utils/haptics';
import { formatIndianDate } from '../../utils/gymUtils';

interface Props {
  visible: boolean;
  selectedDate: string;
  currentPlanDayIndex?: number;
  onClose: () => void;
  onSelectDay: (dayIndex: number) => void;
}

export function SwapRoutineModal({ visible, selectedDate, currentPlanDayIndex, onClose, onSelectDay }: Props) {
  const { userGymPlan } = useMobileData();

  const days = Array.from({ length: 7 }, (_, i) => i + 1).map(idx => {
    const custom = getCustomPlanDay(userGymPlan?.customDays, idx);
    const fallback = GYM_PLAN.find(p => p.dayIndex === idx);
    return custom || fallback || { dayIndex: idx, name: `Day ${idx}`, subtitle: '', exercises: [] };
  });

  const handleSelect = (idx: number) => {
    hapticSuccess();
    onSelectDay(idx);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalBg} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity style={styles.sheet} activeOpacity={1} onPress={(e) => e.stopPropagation?.()}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Swap Day Routine</Text>
              <Text style={styles.subtitle}>Select a workout program for {formatIndianDate(selectedDate)}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
              <Ionicons name="close" size={20} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Routine List */}
          <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
            {days.map(d => {
              const isSelected = currentPlanDayIndex === d.dayIndex;
              const isRest = (d as any).isRest;

              return (
                <TouchableOpacity
                  key={d.dayIndex}
                  style={[styles.dayCard, isSelected && styles.dayCardActive]}
                  onPress={() => handleSelect(d.dayIndex)}
                  activeOpacity={0.7}
                >
                  <View style={styles.dayCardLeft}>
                    <View style={[styles.dayBadge, isRest && styles.restBadge, isSelected && styles.dayBadgeActive]}>
                      <Text style={[styles.dayBadgeText, isSelected && styles.dayBadgeTextActive]}>
                        {isRest ? 'REST' : `D${d.dayIndex}`}
                      </Text>
                    </View>

                    <View style={styles.dayInfo}>
                      <Text style={[styles.dayName, isSelected && styles.dayNameActive]}>{d.name}</Text>

                      {d.subtitle ? (
                        <Text style={styles.daySubtitle}>{d.subtitle}</Text>
                      ) : (
                        <Text style={styles.daySubtitle}>
                          {isRest ? 'Active recovery & rest' : `${d.exercises.length} Exercises`}
                        </Text>
                      )}
                    </View>
                  </View>

                  <View style={styles.dayCardRight}>
                    {isSelected ? (
                      <View style={styles.activeCheckPill}>
                        <Ionicons name="checkmark-circle" size={16} color="#000000" />
                        <Text style={styles.activeCheckText}>Active</Text>
                      </View>
                    ) : (
                      <Ionicons name="swap-horizontal" size={18} color="#71717A" />
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBg: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#000000',
    borderTopLeftRadius: RADIUS.xxl,
    borderTopRightRadius: RADIUS.xxl,
    padding: SPACE.xl,
    maxHeight: '80%',
    borderTopWidth: 1,
    borderTopColor: '#27272A',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACE.lg,
  },
  title: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 20,
    color: '#FFFFFF',
  },
  subtitle: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 12,
    color: '#A1A1AA',
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#18181B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollArea: {
    marginBottom: SPACE.md,
  },
  dayCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#141416',
    borderRadius: RADIUS.xl,
    padding: SPACE.md,
    marginBottom: SPACE.sm,
    borderWidth: 1.5,
    borderColor: '#27272A',
  },
  dayCardActive: {
    borderColor: '#FFFFFF',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  dayCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    flex: 1,
  },
  dayBadge: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.lg,
    backgroundColor: '#27272A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  restBadge: {
    backgroundColor: '#27272A',
  },
  dayBadgeActive: {
    backgroundColor: '#FFFFFF',
  },
  dayBadgeText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 13,
    color: '#FFFFFF',
  },
  dayBadgeTextActive: {
    color: '#000000',
  },
  dayInfo: {
    flex: 1,
  },
  dayName: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.base,
    color: '#FFFFFF',
  },
  dayNameActive: {
    color: '#FFFFFF',
  },
  daySubtitle: {
    fontFamily: FONT_FAMILY.body,
    fontSize: 12,
    color: '#A1A1AA',
    marginTop: 2,
  },
  dayCardRight: {
    marginLeft: SPACE.sm,
  },
  activeCheckPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: RADIUS.full,
  },
  activeCheckText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 11,
    color: '#000000',
  },
});
