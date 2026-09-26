import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import BottomSheet from '../ui/BottomSheet';
import { useTheme } from '../../contexts/ThemeContext';
import { FONT_FAMILY, FONT_SIZE, RADIUS, SPACE } from '../../theme/tokens';
import { RecurrenceRule } from '../../contexts/MobileDataContext';
import UniversalCalendarModal from '../UniversalCalendarModal';
import { formatDateNumeric } from '../../utils/dateUtils';

interface RecurrencePickerModalProps {
  visible: boolean;
  onClose: () => void;
  initialRule?: RecurrenceRule | null;
  onSave: (rule: RecurrenceRule | null) => void;
}

const DAYS_OF_WEEK = [
  { id: 1, label: 'Mon', short: 'M' },
  { id: 2, label: 'Tue', short: 'T' },
  { id: 3, label: 'Wed', short: 'W' },
  { id: 4, label: 'Thu', short: 'T' },
  { id: 5, label: 'Fri', short: 'F' },
  { id: 6, label: 'Sat', short: 'S' },
  { id: 0, label: 'Sun', short: 'S' },
];

const RECURRENCE_OPTIONS = [
  {
    type: 'once' as const,
    label: 'Never',
    sublabel: 'Does not repeat',
    icon: 'close-circle-outline' as const,
    iconColor: '#9ca3af',
  },
  {
    type: 'daily' as const,
    label: 'Every Day',
    sublabel: 'Repeats daily at scheduled time',
    icon: 'sunny-outline' as const,
    iconColor: '#f59e0b',
  },
  {
    type: 'weekly' as const,
    label: 'Every Week',
    sublabel: 'Repeats on chosen days of week',
    icon: 'calendar-outline' as const,
    iconColor: '#60a5fa',
  },
  {
    type: 'monthly' as const,
    label: 'Every Month',
    sublabel: 'Repeats on this day every month',
    icon: 'calendar-number-outline' as const,
    iconColor: '#c084fc',
  },
  {
    type: 'custom' as const,
    label: 'Custom Interval',
    sublabel: 'Repeats every N days',
    icon: 'options-outline' as const,
    iconColor: '#34d399',
  },
];

export default function RecurrencePickerModal({ visible, onClose, initialRule, onSave }: RecurrencePickerModalProps) {
  const { colors, isDark } = useTheme();
  const styles = React.useMemo(() => makeStyles(colors, isDark), [colors, isDark]);

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
    Haptics.selectionAsync();
    setType(t);
    if (t === 'weekly' && selectedDays.length === 0) {
      // Default to today's day of week
      const currentDay = new Date().getDay();
      setSelectedDays([currentDay]);
    }
  };

  const toggleDay = (dayId: number) => {
    Haptics.selectionAsync();
    setSelectedDays(prev => {
      const next = prev.includes(dayId) ? prev.filter(d => d !== dayId) : [...prev, dayId].sort();
      return next;
    });
  };

  const selectWeekdays = () => {
    Haptics.selectionAsync();
    setSelectedDays([1, 2, 3, 4, 5]);
  };

  const selectWeekends = () => {
    Haptics.selectionAsync();
    setSelectedDays([0, 6]);
  };

  const selectAllDays = () => {
    Haptics.selectionAsync();
    setSelectedDays([0, 1, 2, 3, 4, 5, 6]);
  };

  const formatDisplayDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    return formatDateNumeric(dateStr);
  };

  const handleSave = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (type === 'once') {
      onSave(null);
    } else {
      const rule: RecurrenceRule = {
        type,
        interval: type === 'custom' ? interval : 1,
        ...(type === 'weekly' ? { daysOfWeek: selectedDays.length > 0 ? selectedDays : [new Date().getDay()] } : {}),
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
          {/* iOS-Style Navigation Bar */}
          <View style={styles.headerBar}>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Repeat</Text>
            <TouchableOpacity onPress={handleSave} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text style={styles.doneText}>Done</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            {/* ── CARD 1: REPEAT FREQUENCY (Full-width grouped iOS list) ── */}
            <View style={styles.groupedCard}>
              {RECURRENCE_OPTIONS.map((opt, idx) => {
                const isSelected = type === opt.type;
                const isLast = idx === RECURRENCE_OPTIONS.length - 1;
                return (
                  <React.Fragment key={opt.type}>
                    <TouchableOpacity
                      style={styles.optionRow}
                      onPress={() => handleTypeSelect(opt.type)}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.iconBadge, { backgroundColor: `${opt.iconColor}18` }]}>
                        <Ionicons name={opt.icon} size={18} color={opt.iconColor} />
                      </View>
                      <View style={styles.optionInfo}>
                        <Text style={[styles.optionLabel, isSelected && styles.optionLabelActive]}>
                          {opt.label}
                        </Text>
                        <Text style={styles.optionSublabel}>{opt.sublabel}</Text>
                      </View>
                      {isSelected ? (
                        <View style={styles.checkBadge}>
                          <Ionicons name="checkmark" size={16} color={colors.accentPrimary} />
                        </View>
                      ) : (
                        <View style={styles.uncheckBadge} />
                      )}
                    </TouchableOpacity>
                    {!isLast && <View style={styles.divider} />}
                  </React.Fragment>
                );
              })}
            </View>

            {/* ── CARD 2: WEEKDAY PICKER (If weekly selected) ── */}
            {type === 'weekly' && (
              <>
                <Text style={styles.sectionHeader}>ON DAYS</Text>
                <View style={styles.groupedCard}>
                  <View style={styles.daysRow}>
                    {DAYS_OF_WEEK.map(d => {
                      const isActive = selectedDays.includes(d.id);
                      return (
                        <TouchableOpacity
                          key={d.id}
                          style={[styles.dayCircle, isActive && styles.dayCircleActive]}
                          onPress={() => toggleDay(d.id)}
                          activeOpacity={0.75}
                        >
                          <Text style={[styles.dayCircleText, isActive && styles.dayCircleTextActive]}>
                            {d.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <View style={styles.divider} />

                  {/* Day shortcuts */}
                  <View style={styles.shortcutRow}>
                    <TouchableOpacity style={styles.shortcutBtn} onPress={selectWeekdays}>
                      <Text style={styles.shortcutBtnText}>Weekdays</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.shortcutBtn} onPress={selectWeekends}>
                      <Text style={styles.shortcutBtnText}>Weekends</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.shortcutBtn} onPress={selectAllDays}>
                      <Text style={styles.shortcutBtnText}>All 7 Days</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </>
            )}

            {/* ── CARD 3: CUSTOM INTERVAL (If custom selected) ── */}
            {type === 'custom' && (
              <>
                <Text style={styles.sectionHeader}>INTERVAL</Text>
                <View style={styles.groupedCard}>
                  <View style={styles.stepperRow}>
                    <View style={styles.stepperLeft}>
                      <Text style={styles.stepperTitle}>Repeat Every</Text>
                      <Text style={styles.stepperSubtitle}>
                        {interval === 1 ? 'Every single day' : `Every ${interval} days`}
                      </Text>
                    </View>
                    <View style={styles.stepperControls}>
                      <TouchableOpacity
                        onPress={() => {
                          Haptics.selectionAsync();
                          setInterval(Math.max(1, interval - 1));
                        }}
                        style={styles.stepperBtn}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="remove" size={18} color={colors.textPrimary} />
                      </TouchableOpacity>
                      <Text style={styles.stepperValue}>{interval}</Text>
                      <TouchableOpacity
                        onPress={() => {
                          Haptics.selectionAsync();
                          setInterval(interval + 1);
                        }}
                        style={styles.stepperBtn}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="add" size={18} color={colors.textPrimary} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </>
            )}

            {/* ── CARD 4: END DATE (If repeating) ── */}
            {type !== 'once' && (
              <>
                <Text style={styles.sectionHeader}>END REPEAT</Text>
                <View style={styles.groupedCard}>
                  <TouchableOpacity
                    style={styles.endDateRow}
                    onPress={() => setIsCalendarOpen(true)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.endDateLeft}>
                      <View style={[styles.iconBadge, { backgroundColor: 'rgba(239, 68, 68, 0.14)' }]}>
                        <Ionicons name="calendar-clear-outline" size={17} color="#ef4444" />
                      </View>
                      <Text style={styles.endDateTitle}>Ends</Text>
                    </View>
                    <View style={styles.endDateRight}>
                      <Text style={[styles.endDateValue, endDate && styles.endDateValueActive]}>
                        {formatDisplayDate(endDate)}
                      </Text>
                      {endDate ? (
                        <TouchableOpacity
                          onPress={() => {
                            Haptics.selectionAsync();
                            setEndDate(null);
                          }}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          style={{ marginLeft: 6 }}
                        >
                          <Ionicons name="close-circle" size={16} color={colors.textTertiary} />
                        </TouchableOpacity>
                      ) : (
                        <Ionicons name="chevron-forward" size={14} color={colors.textTertiary} style={{ marginLeft: 4 }} />
                      )}
                    </View>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {/* ── BOTTOM ACTION CTA ── */}
            <TouchableOpacity style={styles.applyBtn} onPress={handleSave} activeOpacity={0.8}>
              <Ionicons name="repeat" size={17} color={isDark ? '#000000' : '#ffffff'} style={{ marginRight: 6 }} />
              <Text style={styles.applyBtnText}>
                {type === 'once' ? 'Remove Repeat' : 'Apply Repeat Rule'}
              </Text>
            </TouchableOpacity>
          </ScrollView>
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
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: Platform.OS === 'ios' ? 24 : 16,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    marginBottom: 8,
  },
  cancelText: {
    fontFamily: FONT_FAMILY.regular,
    fontSize: 15,
    color: colors.textSecondary,
  },
  headerTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 17,
    color: colors.textPrimary,
  },
  doneText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: colors.accentPrimary,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  sectionHeader: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    color: colors.textTertiary,
    letterSpacing: 0.6,
    marginLeft: 6,
    marginTop: 18,
    marginBottom: 6,
  },
  groupedCard: {
    backgroundColor: isDark ? '#141417' : '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: isDark ? '#232328' : '#e5e7eb',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: isDark ? 0.35 : 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  iconBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  optionInfo: {
    flex: 1,
  },
  optionLabel: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  optionLabelActive: {
    color: colors.accentPrimary,
  },
  optionSublabel: {
    fontFamily: FONT_FAMILY.regular,
    fontSize: 12,
    color: colors.textTertiary,
  },
  checkBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.accentPrimary + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uncheckBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: isDark ? '#333338' : '#d1d5db',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: isDark ? '#232328' : '#e5e7eb',
    marginLeft: 44,
  },
  daysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  dayCircle: {
    flex: 1,
    height: 38,
    marginHorizontal: 3,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: isDark ? '#1c1c22' : '#f3f4f6',
    borderWidth: 1,
    borderColor: isDark ? '#2b2b32' : '#e5e7eb',
  },
  dayCircleActive: {
    backgroundColor: colors.accentPrimary,
    borderColor: colors.accentPrimary,
  },
  dayCircleText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 12,
    color: colors.textSecondary,
  },
  dayCircleTextActive: {
    color: isDark ? '#000000' : '#ffffff',
  },
  shortcutRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    gap: 8,
    paddingVertical: 10,
  },
  shortcutBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: isDark ? '#1e1e24' : '#f3f4f6',
  },
  shortcutBtnText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 12,
    color: colors.textSecondary,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  stepperLeft: {
    flex: 1,
  },
  stepperTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  stepperSubtitle: {
    fontFamily: FONT_FAMILY.regular,
    fontSize: 12,
    color: colors.textTertiary,
  },
  stepperControls: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: isDark ? '#1c1c22' : '#f3f4f6',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: isDark ? '#2b2b32' : '#e5e7eb',
    padding: 3,
  },
  stepperBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: isDark ? '#26262e' : '#ffffff',
  },
  stepperValue: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: colors.textPrimary,
    width: 36,
    textAlign: 'center',
  },
  endDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  endDateLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  endDateTitle: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: colors.textPrimary,
  },
  endDateRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  endDateValue: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 14,
    color: colors.textSecondary,
  },
  endDateValueActive: {
    color: colors.accentPrimary,
  },
  applyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accentPrimary,
    paddingVertical: 14,
    borderRadius: 14,
    marginTop: 20,
    shadowColor: colors.accentPrimary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  applyBtnText: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 15,
    color: isDark ? '#000000' : '#ffffff',
  },
});
