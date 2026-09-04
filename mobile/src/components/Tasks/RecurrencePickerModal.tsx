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
  const { colors, isDark } = useTheme();
  const styles = makeStyles(colors, isDark);

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
      <BottomSheet visible={visible} onClose={onClose} avoidKeyboard={false}>
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
                          {d.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              <View style={[styles.optionRow, { marginTop: SPACE.lg, justifyContent: 'space-between' }]}>
                <Text style={styles.optionLabel}>Ends</Text>
                <TouchableOpacity 
                  style={[styles.endDateChip, endDate && styles.endDateChipActive]}
                  onPress={() => setIsCalendarOpen(true)}
                >
                  <Ionicons name="calendar-outline" size={16} color={endDate ? colors.accentPrimary : colors.textSecondary} />
                  <Text style={[styles.endDateText, endDate && styles.endDateTextActive]}>
                    {formatDisplayDate(endDate)}
                  </Text>
                  {endDate && (
                    <TouchableOpacity onPress={() => setEndDate(null)} style={{ padding: 2 }}>
                      <Ionicons name="close-circle" size={14} color={colors.accentPrimary} />
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={[styles.saveBtn, { marginTop: SPACE.xl }]} onPress={handleSave}>
                <Text style={styles.saveBtnText}>Save</Text>
              </TouchableOpacity>

            </View>
          )}

        </View>
      </BottomSheet>
      
      {isCalendarOpen && (
        <UniversalCalendarModal
          visible={isCalendarOpen}
          onClose={() => setIsCalendarOpen(false)}
          selectedDate={endDate || new Date().toISOString().slice(0, 10)}
          onDateSelect={(date) => {
            setEndDate(date);
            setIsCalendarOpen(false);
          }}
          title="Repeat End Date"
        />
      )}
    </>
  );
}

const makeStyles = (colors: any, isDark: boolean = true) => StyleSheet.create({
  container: {
    paddingHorizontal: SPACE.xl,
    paddingTop: SPACE.sm,
    paddingBottom: SPACE.xxl,
  },
  title: {
    fontFamily: FONT_FAMILY.title,
    fontSize: FONT_SIZE.xl,
    color: colors.textPrimary,
    marginBottom: SPACE.lg,
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
    borderWidth: 1,
    borderColor: colors.border,
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
    backgroundColor: colors.surface,
    borderRadius: RADIUS.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  stepperBtn: {
    padding: 8,
    backgroundColor: isDark ? colors.border : colors.surface2,
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
    backgroundColor: isDark ? colors.surfaceRaised : colors.surface2,
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
    color: isDark ? colors.background : '#FFFFFF',
    fontFamily: FONT_FAMILY.bold,
  },
  endDateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACE.md,
    paddingVertical: 8,
    borderRadius: RADIUS.md,
    backgroundColor: isDark ? colors.surfaceRaised : colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
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
    color: isDark ? colors.background : '#FFFFFF',
  },
});
