import React, { useState, useEffect } from 'react';
import { formatDateNumeric } from '../../utils/dateUtils';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import BottomSheet from '../ui/BottomSheet';
import AnimatedPressable from '../AnimatedPressable';
import { useTheme } from '../../contexts/ThemeContext';
import { FONT_FAMILY, FONT_SIZE, RADIUS, SPACE } from '../../theme/tokens';
import { RecurrenceRule } from '../../contexts/MobileDataContext';
import UniversalCalendarModal from '../UniversalCalendarModal';

interface RecurrencePickerModalProps {
  visible: boolean;
  onClose: () => void;
  initialRule?: RecurrenceRule | null;
  onSave: (rule: RecurrenceRule | null) => void;
}

const DAYS_OF_WEEK = [
  { id: 1, label: 'Mon' },
  { id: 2, label: 'Tue' },
  { id: 3, label: 'Wed' },
  { id: 4, label: 'Thu' },
  { id: 5, label: 'Fri' },
  { id: 6, label: 'Sat' },
  { id: 0, label: 'Sun' },
];

export default function RecurrencePickerModal({ visible, onClose, initialRule, onSave }: RecurrencePickerModalProps) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const [type, setType] = useState<'once' | 'daily' | 'weekly' | 'monthly' | 'custom'>('once');
  const [interval, setInterval] = useState(1);
  const [selectedDays, setSelectedDays] = useState<number[]>([]);
  const [endDate, setEndDate] = useState<string | null>(null);
  
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);

  useEffect(() => {
    if (visible) {
      if (!initialRule) {
        setType('once');
        setInterval(1);
        setSelectedDays([]);
        setEndDate(null);
      } else {
        setType(initialRule.type);
        setInterval(initialRule.interval || 1);
        setSelectedDays(initialRule.daysOfWeek || []);
        setEndDate(initialRule.endDate || null);
      }
    }
  }, [visible, initialRule]);

  const handleTypeSelect = (t: 'once' | 'daily' | 'weekly' | 'monthly' | 'custom') => {
    setType(t);
    // Instant save+close for simple types — no extra "Save" tap needed.
    // Weekly stays open so the user can pick days.
    // Custom stays open so the user can set the interval.
    if (t === 'once') {
      onSave(null);
      onClose();
    } else if (t === 'daily' || t === 'monthly') {
      const rule: RecurrenceRule = {
        type: t,
        interval: 1,
        ...(endDate ? { endDate } : {}),
      };
      onSave(rule);
      onClose();
    }
    // 'weekly' and 'custom' fall through — user completes config then taps Save
  };

  const toggleDay = (dayId: number) => {
    setSelectedDays(prev =>
      prev.includes(dayId) ? prev.filter(d => d !== dayId) : [...prev, dayId].sort()
    );
  };

  const formatDisplayDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    return formatDateNumeric(dateStr);
  };

  const handleSave = () => {
    if (type === 'once') {
      onSave(null);
    } else {
      const rule: RecurrenceRule = {
        type,
        interval,
        ...(type === 'weekly' ? { daysOfWeek: selectedDays } : {}),
        ...(endDate ? { endDate } : {}),
      };
      onSave(rule);
    }
    onClose();
  };


  return (
    <>
      <BottomSheet visible={visible} onClose={onClose}>
        <View style={styles.container}>
          <Text style={styles.title}>Repeat</Text>

          <View style={styles.typeSelectorRow}>
            {['once', 'daily', 'weekly', 'monthly', 'custom'].map((t) => (
              <AnimatedPressable 
                key={t}
                style={[styles.typeChip, type === t && styles.typeChipActive]}
                onPress={() => handleTypeSelect(t as any)}
              >
                <Text style={[styles.typeChipText, type === t && styles.typeChipTextActive]}>
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </Text>
              </AnimatedPressable>
            ))}
          </View>

          {/* Show Save button only for weekly/custom — other types auto-save on selection */}
          {(type === 'weekly' || type === 'custom') && (

            <View style={styles.optionsContainer}>
              
              {type === 'custom' && (
                <View style={styles.optionRow}>
                  <Text style={styles.optionLabel}>Every</Text>
                  <View style={styles.stepper}>
                    <TouchableOpacity onPress={() => setInterval(Math.max(1, interval - 1))} style={styles.stepperBtn}>
                      <Ionicons name="remove" size={20} color={colors.textPrimary} />
                    </TouchableOpacity>
                    <Text style={styles.stepperValue}>{interval}</Text>
                    <TouchableOpacity onPress={() => setInterval(interval + 1)} style={styles.stepperBtn}>
                      <Ionicons name="add" size={20} color={colors.textPrimary} />
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.optionLabel}>days</Text>
                </View>
              )}

              {type === 'weekly' && (
                <View style={styles.daysRow}>
                  {DAYS_OF_WEEK.map(d => {
                    const isActive = selectedDays.includes(d.id);
                    return (
                      <TouchableOpacity 
                        key={d.id} 
                        style={[styles.dayPill, isActive && styles.dayPillActive]}
                        onPress={() => toggleDay(d.id)}
                      >
                        <Text style={[styles.dayPillText, isActive && styles.dayPillTextActive]}>
                          {d.label.slice(0, 1)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              <View style={[styles.optionRow, { marginTop: SPACE.lg }]}>
                <Text style={styles.optionLabel}>Ends on</Text>
                <AnimatedPressable 
                  style={[styles.endDateChip, endDate && styles.endDateChipActive]}
                  onPress={() => setIsCalendarOpen(true)}
                >
                  <Ionicons name={endDate ? "calendar" : "calendar-outline"} size={16} color={endDate ? colors.accentPrimary : colors.textMuted} />
                  <Text style={[styles.endDateText, endDate && styles.endDateTextActive]}>
                    {formatDisplayDate(endDate)}
                  </Text>
                  {endDate && (
                    <TouchableOpacity onPress={() => setEndDate(null)} style={{ marginLeft: 8 }}>
                      <Ionicons name="close-circle" size={16} color={colors.textMuted} />
                    </TouchableOpacity>
                  )}
                </AnimatedPressable>
              </View>

            </View>
          )}

          {(type === 'weekly' || type === 'custom') && (
            <AnimatedPressable style={styles.saveBtn} onPress={handleSave}>
              <Text style={styles.saveBtnText}>Save</Text>
            </AnimatedPressable>
          )}

        </View>
      </BottomSheet>
      
      <UniversalCalendarModal
        visible={isCalendarOpen}
        onClose={() => setIsCalendarOpen(false)}
        selectedDate={endDate || new Date().toISOString().slice(0,10)}
        onDateSelect={(d) => {
          setEndDate(d);
          setIsCalendarOpen(false);
        }}
        title="Select End Date"
      />
    </>
  );
}

const makeStyles = (colors: any) => StyleSheet.create({
  container: {
    paddingBottom: Platform.OS === 'ios' ? 20 : 0,
  },
  title: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.lg,
    color: colors.textPrimary,
    marginBottom: SPACE.lg,
    textAlign: 'center',
  },
  typeSelectorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACE.sm,
    marginBottom: SPACE.xl,
    justifyContent: 'center',
  },
  typeChip: {
    paddingHorizontal: SPACE.md,
    paddingVertical: 8,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  typeChipActive: {
    backgroundColor: colors.accentPrimary + '20',
    borderColor: colors.accentPrimary,
  },
  typeChipText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: FONT_SIZE.md,
    color: colors.textSecondary,
  },
  typeChipTextActive: {
    color: colors.accentPrimary,
  },
  optionsContainer: {
    backgroundColor: colors.surface,
    padding: SPACE.lg,
    borderRadius: RADIUS.lg,
    marginBottom: SPACE.xl,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
  },
  optionLabel: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: FONT_SIZE.md,
    color: colors.textSecondary,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceRaised,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
  },
  stepperBtn: {
    padding: 8,
    backgroundColor: colors.border,
  },
  stepperValue: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.md,
    color: colors.textPrimary,
    width: 40,
    textAlign: 'center',
  },
  daysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: SPACE.sm,
  },
  dayPill: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
  },
  dayPillActive: {
    backgroundColor: colors.accentPrimary,
    borderColor: colors.accentPrimary,
  },
  dayPillText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: FONT_SIZE.md,
    color: colors.textSecondary,
  },
  dayPillTextActive: {
    color: colors.background,
    fontFamily: FONT_FAMILY.bold,
  },
  endDateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACE.md,
    paddingVertical: 8,
    borderRadius: RADIUS.md,
    backgroundColor: colors.surfaceRaised,
    gap: 6,
  },
  endDateChipActive: {
    backgroundColor: colors.accentPrimary + '20',
    borderColor: colors.accentPrimary,
    borderWidth: 1,
  },
  endDateText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: FONT_SIZE.md,
    color: colors.textSecondary,
  },
  endDateTextActive: {
    color: colors.accentPrimary,
  },
  saveBtn: {
    backgroundColor: colors.accentPrimary,
    paddingVertical: 14,
    borderRadius: RADIUS.lg,
    alignItems: 'center',
  },
  saveBtnText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.md,
    color: colors.background,
  },
});
