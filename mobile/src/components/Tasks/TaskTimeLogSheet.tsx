/**
 * TaskTimeLogSheet.tsx • ZenTrack Mobile
 *
 * Bottom sheet that pops up when completing a task to log:
 *   1. Actual start time (planned time slot offset, or relative/custom time)
 *   2. Actual duration worked (chips + custom)
 *
 * Uses the app's standard `BottomSheet` component and theme tokens.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Task } from '../../contexts/MobileDataContext';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS, SHADOW } from '../../theme/tokens';
import { useTheme } from '../../contexts/ThemeContext';
import BottomSheet from '../ui/BottomSheet';
import AnimatedPressable from '../../components/AnimatedPressable';

// •• Duration Chips ••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••

const DEFAULT_DURATION_CHIPS: { label: string; minutes: number }[] = [
  { label: '5m',   minutes: 5   },
  { label: '15m',  minutes: 15  },
  { label: '30m',  minutes: 30  },
  { label: '45m',  minutes: 45  },
  { label: '1h',   minutes: 60  },
  { label: '1.5h', minutes: 90  },
  { label: '2h',   minutes: 120 },
  { label: '2.5h', minutes: 150 },
  { label: '3h',   minutes: 180 },
];

// •• Helpers •••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••

function parseTimeStrMinutes(str?: string): number | null {
  if (!str) return null;
  const upper = str.trim().toUpperCase();
  const isPM = upper.includes('PM');
  const isAM = upper.includes('AM');
  const cleaned = upper.replace(/[APM\s]+$/i, '').trim();
  if (!cleaned) return null;
  const parts = cleaned.split(':');
  let h = parseInt(parts[0], 10);
  if (isNaN(h)) return null;
  const m = parts.length >= 2 ? (parseInt(parts[1], 10) || 0) : 0;
  if (isPM && h !== 12) h += 12;
  if (isAM && h === 12) h = 0;
  return h * 60 + m;
}

function minutesTo12HourStr(totalMin: number): string {
  const h24 = Math.floor(totalMin / 60) % 24;
  const m = Math.abs(totalMin % 60);
  const ampm = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

function formatMinDisplay(min: number): string {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

interface TaskTimeLogSheetProps {
  task: Task | null;
  visible: boolean;
  onSkip: () => void;
  onSave: (taskId: string, actualMinutes: number, actualStartTime: string) => void;
}

export default function TaskTimeLogSheet({ task, visible, onSkip, onSave }: TaskTimeLogSheetProps) {
  const { colors, isDark } = useTheme();
  const styles = makeStyles(colors, isDark);

  // Parse time slot details
  const timeSlotInfo = useMemo(() => {
    if (!task?.timeSlot) return null;
    const parts = task.timeSlot.split(/[-•]/).map(s => s.trim());
    const startMin = parseTimeStrMinutes(parts[0]);
    const endMin = parts.length > 1 ? parseTimeStrMinutes(parts[1]) : null;
    const durationMin = (startMin !== null && endMin !== null && endMin > startMin)
      ? (endMin - startMin)
      : null;
    return {
      startMin,
      endMin,
      durationMin,
      startStr: parts[0] || null,
      endStr: parts[1] || null,
      raw: task.timeSlot,
    };
  }, [task?.timeSlot]);

  // Determine effective planned minutes
  const plannedMinutes = useMemo(() => {
    return task?.estimatedMinutes || timeSlotInfo?.durationMin || null;
  }, [task?.estimatedMinutes, timeSlotInfo?.durationMin]);

  // State
  const [selectedDuration, setSelectedDuration] = useState<number>(30);
  const [startOption, setStartOption] = useState<string>('ontime'); // 'ontime' | '+15' | '+30' | '+60' | 'now' | 'custom'
  const [showAndroidPicker, setShowAndroidPicker] = useState(false);
  const [customTime, setCustomTime] = useState<Date>(new Date());

  // Dynamic start chips based on whether planned time slot exists
  const startChips = useMemo(() => {
    if (timeSlotInfo?.startMin !== null && timeSlotInfo?.startMin !== undefined) {
      const base = timeSlotInfo.startMin;
      return [
        { id: 'ontime', label: `On time (${minutesTo12HourStr(base)})`, offsetMin: 0 },
        { id: '+15', label: `+15m (${minutesTo12HourStr(base + 15)})`, offsetMin: 15 },
        { id: '+30', label: `+30m (${minutesTo12HourStr(base + 30)})`, offsetMin: 30 },
        { id: '+60', label: `+1h (${minutesTo12HourStr(base + 60)})`, offsetMin: 60 },
        { id: '-15', label: `-15m (${minutesTo12HourStr(base - 15)})`, offsetMin: -15 },
      ];
    } else {
      const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
      return [
        { id: 'now', label: `Just now (${minutesTo12HourStr(nowMin)})`, offsetMin: 0 },
        { id: '-15', label: `15m ago (${minutesTo12HourStr(nowMin - 15)})`, offsetMin: -15 },
        { id: '-30', label: `30m ago (${minutesTo12HourStr(nowMin - 30)})`, offsetMin: -30 },
        { id: '-60', label: `1h ago (${minutesTo12HourStr(nowMin - 60)})`, offsetMin: -60 },
      ];
    }
  }, [timeSlotInfo]);

  // Dynamic duration chips (includes planned duration if unique)
  const durationChips = useMemo(() => {
    const list = [...DEFAULT_DURATION_CHIPS];
    if (plannedMinutes && !list.some(c => c.minutes === plannedMinutes)) {
      list.push({ label: formatMinDisplay(plannedMinutes), minutes: plannedMinutes });
      list.sort((a, b) => a.minutes - b.minutes);
    }
    return list;
  }, [plannedMinutes]);

  // Reset state when modal opens for a task
  useEffect(() => {
    if (!visible || !task) return;
    const initialDur = plannedMinutes || 30;
    setSelectedDuration(initialDur);
    setStartOption(timeSlotInfo?.startMin !== null && timeSlotInfo?.startMin !== undefined ? 'ontime' : 'now');
    setShowAndroidPicker(false);

    const now = new Date();
    if (timeSlotInfo?.startMin !== null && timeSlotInfo?.startMin !== undefined) {
      now.setHours(Math.floor(timeSlotInfo.startMin / 60), timeSlotInfo.startMin % 60, 0, 0);
    }
    setCustomTime(now);
  }, [visible, task, timeSlotInfo, plannedMinutes]);

  // Handle Save
  const handleSave = useCallback(() => {
    if (!task?.id) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    let actualStart: string;
    if (startOption === 'custom') {
      const h = customTime.getHours();
      const m = customTime.getMinutes();
      actualStart = minutesTo12HourStr(h * 60 + m);
    } else {
      const selectedChip = startChips.find(c => c.id === startOption);
      if (timeSlotInfo?.startMin !== null && timeSlotInfo?.startMin !== undefined) {
        const offset = selectedChip ? selectedChip.offsetMin : 0;
        actualStart = minutesTo12HourStr(timeSlotInfo.startMin + offset);
      } else {
        const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
        const offset = selectedChip ? selectedChip.offsetMin : 0;
        actualStart = minutesTo12HourStr(nowMin + offset);
      }
    }

    onSave(task.id, selectedDuration, actualStart);
  }, [task, selectedDuration, startOption, customTime, startChips, timeSlotInfo, onSave]);

  const handleSkip = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSkip();
  }, [onSkip]);

  if (!task) return null;

  return (
    <BottomSheet visible={visible} onClose={handleSkip}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.iconBadge}>
            <Ionicons name="timer-outline" size={20} color={colors.accentPrimary} />
          </View>
          <View style={styles.headerTextContainer}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>How long did it take?</Text>
            <Text style={[styles.taskTitle, { color: colors.textSecondary }]} numberOfLines={1}>
              {task.title}
            </Text>
            {timeSlotInfo?.raw && (
              <View style={styles.plannedTimeBadge}>
                <Ionicons name="calendar-outline" size={12} color={colors.accentPrimary} style={{ marginRight: 4 }} />
                <Text style={styles.plannedTimeText}>
                  Planned: {timeSlotInfo.raw}
                  {plannedMinutes ? ` (${formatMinDisplay(plannedMinutes)})` : ''}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Scrollable Content */}
        <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
          {/* Section 1: Duration */}
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Duration</Text>
              {plannedMinutes && (
                <Text style={styles.plannedHint}>
                  Planned: {formatMinDisplay(plannedMinutes)}
                </Text>
              )}
            </View>
            <View style={styles.chipGrid}>
              {durationChips.map(chip => {
                const isSelected = selectedDuration === chip.minutes;
                const isPlanned = chip.minutes === plannedMinutes;
                return (
                  <TouchableOpacity
                    key={chip.minutes}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setSelectedDuration(chip.minutes);
                    }}
                    style={[
                      styles.chip,
                      { borderColor: colors.border, backgroundColor: colors.surface },
                      isPlanned && !isSelected && styles.chipPlannedBorder,
                      isSelected && styles.chipActiveGreen,
                    ]}
                    activeOpacity={0.7}
                  >
                    {isPlanned && !isSelected && <View style={styles.plannedDot} />}
                    <Text
                      style={[
                        styles.chipText,
                        { color: colors.textSecondary },
                        isSelected && styles.chipTextActiveGreen,
                      ]}
                    >
                      {chip.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Section 2: Start Time */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>When did you start?</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {startChips.map(chip => {
                const isSelected = startOption === chip.id;
                return (
                  <TouchableOpacity
                    key={chip.id}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setStartOption(chip.id);
                    }}
                    style={[
                      styles.chip,
                      { borderColor: colors.border, backgroundColor: colors.surface },
                      isSelected && styles.chipActive,
                    ]}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        { color: colors.textSecondary },
                        isSelected && styles.chipTextActive,
                      ]}
                    >
                      {chip.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}

              {/* Custom time button */}
              <TouchableOpacity
                onPress={() => {
                  Haptics.selectionAsync();
                  setStartOption('custom');
                  if (Platform.OS === 'android') {
                    setShowAndroidPicker(true);
                  }
                }}
                style={[
                  styles.chip,
                  { borderColor: colors.border, backgroundColor: colors.surface },
                  startOption === 'custom' && styles.chipActive,
                ]}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="time-outline"
                  size={14}
                  color={startOption === 'custom' ? colors.accentPrimary : colors.textSecondary}
                  style={{ marginRight: 4 }}
                />
                <Text
                  style={[
                    styles.chipText,
                    { color: colors.textSecondary },
                    startOption === 'custom' && styles.chipTextActive,
                  ]}
                >
                  {startOption === 'custom'
                    ? minutesTo12HourStr(customTime.getHours() * 60 + customTime.getMinutes())
                    : 'Custom...'}
                </Text>
              </TouchableOpacity>
            </ScrollView>

            {/* Inline iOS / Modal Android Time Picker */}
            {startOption === 'custom' && Platform.OS === 'ios' && (
              <View style={styles.pickerContainer}>
                <DateTimePicker
                  value={customTime}
                  mode="time"
                  display="spinner"
                  textColor={colors.textPrimary}
                  onChange={(_, date) => {
                    if (date) setCustomTime(date);
                  }}
                />
              </View>
            )}

            {startOption === 'custom' && Platform.OS === 'android' && showAndroidPicker && (
              <DateTimePicker
                value={customTime}
                mode="time"
                display="default"
                onChange={(_, date) => {
                  setShowAndroidPicker(false);
                  if (date) setCustomTime(date);
                }}
              />
            )}
          </View>
        </ScrollView>

        {/* Action Buttons */}
        <View style={[styles.footer, { borderTopColor: colors.border }]}>
          <AnimatedPressable
            onPress={handleSkip}
            style={[styles.btn, styles.btnSkip, { borderColor: colors.border }]}
          >
            <Text style={[styles.btnSkipText, { color: colors.textSecondary }]}>Skip</Text>
          </AnimatedPressable>

          <AnimatedPressable
            onPress={handleSave}
            style={[styles.btn, styles.btnSave, { backgroundColor: colors.accentGreen }]}
          >
            <Ionicons name="checkmark-circle" size={18} color={isDark ? '#000000' : '#FFFFFF'} style={{ marginRight: 6 }} />
            <Text style={[styles.btnSaveText, { color: isDark ? '#000000' : '#FFFFFF' }]}>
              Log {formatMinDisplay(selectedDuration)}
            </Text>
          </AnimatedPressable>
        </View>
      </View>
    </BottomSheet>
  );
}

const makeStyles = (colors: any, isDark: boolean = true) => StyleSheet.create({
  container: {
    paddingBottom: SPACE.md,
    flexShrink: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: SPACE.md,
  },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACE.md,
  },
  headerTextContainer: {
    flex: 1,
  },
  title: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.lg,
  },
  taskTitle: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: FONT_SIZE.sm,
    marginTop: 2,
  },
  plannedTimeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    backgroundColor: colors.accentDim,
    borderWidth: 1,
    borderColor: colors.accentPrimary + '25',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: RADIUS.md,
    alignSelf: 'flex-start',
  },
  plannedTimeText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 10,
    color: colors.accentPrimary,
  },
  scrollArea: {
    maxHeight: 280,
  },
  section: {
    marginBottom: SPACE.lg,
  },
  sectionTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.md,
    marginBottom: SPACE.sm,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACE.sm,
  },
  plannedHint: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: FONT_SIZE.xs,
    color: colors.accentPrimary,
  },
  chipRow: {
    flexDirection: 'row',
    gap: SPACE.sm,
    paddingVertical: 4,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACE.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: RADIUS.md,
    borderWidth: 1,
  },
  chipActive: {
    backgroundColor: colors.accentDim,
    borderColor: colors.accentPrimary,
  },
  chipActiveGreen: {
    backgroundColor: colors.accentGreenDim,
    borderColor: colors.accentGreen,
  },
  chipPlannedBorder: {
    borderColor: colors.accentPrimary + '50',
    backgroundColor: colors.accentDim,
  },
  chipText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: FONT_SIZE.sm,
  },
  chipTextActive: {
    color: colors.accentPrimary,
    fontFamily: FONT_FAMILY.bold,
  },
  chipTextActiveGreen: {
    color: colors.accentGreen,
    fontFamily: FONT_FAMILY.bold,
  },
  plannedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accentPrimary,
    marginRight: 6,
  },
  pickerContainer: {
    marginTop: SPACE.sm,
    alignItems: 'center',
  },
  footer: {
    flexDirection: 'row',
    gap: SPACE.md,
    paddingTop: SPACE.md,
    marginTop: SPACE.xs,
    borderTopWidth: 1,
  },
  btn: {
    height: 48,
    borderRadius: RADIUS.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSkip: {
    borderWidth: 1,
    flex: 0.35,
  },
  btnSave: {
    backgroundColor: colors.accentGreen,
    flex: 0.65,
    ...SHADOW.sm,
  },
  btnSkipText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.md,
  },
  btnSaveText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.md,
    color: '#000000',
  },
});
