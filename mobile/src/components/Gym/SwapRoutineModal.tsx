/**
 * SwapRoutineModal.tsx — ZenTrack Mobile
 * Allows user to swap the active workout routine for the selected day.
 */

import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS, COLORS } from '../../theme/tokens';
import { useTheme } from '../../contexts/ThemeContext';
import { GYM_PLAN } from '../../data/gymPlan';
import { useWellnessData } from '../../contexts/domains/WellnessContext';
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
  const { colors, isDark } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors, isDark), [colors, isDark]);
  const { userGymPlan } = useWellnessData();

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
              <Ionicons name="close" size={20} color={colors.textMuted} />
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
                        <Ionicons name="checkmark-circle" size={16} color="#ffffff" />
                        <Text style={styles.activeCheckText}>Active</Text>
                      </View>
                    ) : (
                      <Ionicons name="swap-horizontal" size={18} color={colors.textMuted} />
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

const makeStyles = (colors: any, isDark: boolean = true) =>
  StyleSheet.create({
    modalBg: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.65)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: RADIUS.xxl,
      borderTopRightRadius: RADIUS.xxl,
      padding: SPACE.xl,
      maxHeight: '80%',
      borderTopWidth: 1,
      borderTopColor: colors.border,
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
      color: colors.textPrimary,
    },
    subtitle: {
      fontFamily: FONT_FAMILY.body,
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 2,
    },
    closeBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.surface2 || colors.surface,
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
      backgroundColor: isDark ? '#000000' : '#F5F4FA',
      borderRadius: RADIUS.xl,
      padding: SPACE.md,
      marginBottom: SPACE.sm,
      borderWidth: 1.5,
      borderColor: colors.border,
    },
    dayCardActive: {
      borderColor: colors.accentPrimary,
      backgroundColor: isDark ? 'rgba(165,153,255,0.12)' : 'rgba(108,92,231,0.08)',
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
      backgroundColor: isDark ? '#27272A' : '#EAE9F2',
      alignItems: 'center',
      justifyContent: 'center',
    },
    restBadge: {
      backgroundColor: isDark ? '#27272A' : '#EAE9F2',
    },
    dayBadgeActive: {
      backgroundColor: colors.accentPrimary,
    },
    dayBadgeText: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 13,
      color: isDark ? '#FFFFFF' : '#1C1C1E',
    },
    dayBadgeTextActive: {
      color: '#FFFFFF',
    },
    dayInfo: {
      flex: 1,
    },
    dayName: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: FONT_SIZE.base,
      color: colors.textPrimary,
    },
    dayNameActive: {
      color: colors.textPrimary,
    },
    daySubtitle: {
      fontFamily: FONT_FAMILY.body,
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 2,
    },
    dayCardRight: {
      marginLeft: SPACE.sm,
    },
    activeCheckPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: colors.accentPrimary,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: RADIUS.full,
    },
    activeCheckText: {
      fontFamily: FONT_FAMILY.bold,
      fontSize: 11,
      color: '#FFFFFF',
    },
  });
