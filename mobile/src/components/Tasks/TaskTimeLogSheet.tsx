/**
 * TaskTimeLogSheet.tsx — ZenTrack Mobile
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

// ── Duration Chips ────────────────────────────────────────────────────────────

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

// ── Helpers ───────────────────────────────────────────────────────────────────

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
  const { colors } = useTheme();

  // Parse time slot details
  const timeSlotInfo = useMemo(() => {
    if (!task?.timeSlot) return null;
    const parts = task.timeSlot.split(/[-–]/).map(s => s.trim());
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
  const [showCustomPicker, setShowCustomPicker] = useState(false);
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
    setShowCustomPicker(false);

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
    if (showCustomPicker) {
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
  }, [task, selectedDuration, startOption, showCustomPicker, customTime, startChips, timeSlotInfo, onSave]);

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
            <Ionicons name="timer-outline" size={20} color="#A599FF" />
          </View>
          <View style={styles.headerTextContainer}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>How long did it take?</Text>
            <Text style={[styles.taskTitle, { color: colors.textSecondary }]} numberOfLines={1}>
              {task.title}
            </Text>
            {timeSlotInfo?.raw && (
              <View style={styles.plannedTimeBadge}>
                <Ionicons name="calendar-outline" size={10} color="#A599FF" style={{ marginRight: 4 }} />
                <Text style={styles.plannedTimeText}>
                  Planned: {timeSlotInfo.raw} {plannedMinutes ? `(${formatMinDisplay(plannedMinutes)})` : ''}
                </Text>
              </View>
            )}
          </View>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} style={styles.scrollArea}>

          {/* SECTION 1: When did you start? */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              1. When did you start?
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {startChips.map((chip) => {
                const isSelected = !showCustomPicker && startOption === chip.id;
                return (
                  <TouchableOpacity
                    key={chip.id}
                    style={[
                      styles.chip,
                      { backgroundColor: colors.surface2, borderColor: colors.border },
                      isSelected && styles.chipActive,
                    ]}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setStartOption(chip.id);
                      setShowCustomPicker(false);
                    }}
                  >
                    <Text style={[
                      styles.chipText,
                      { color: colors.textSecondary },
                      isSelected && styles.chipTextActive,
                    ]}>
                      {chip.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}

              <TouchableOpacity
                style={[
                  styles.chip,
                  { backgroundColor: colors.surface2, borderColor: colors.border },
                  showCustomPicker && styles.chipActive,
                ]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setShowCustomPicker(true);
                }}
              >
                <Ionicons name="time-outline" size={14} color={showCustomPicker ? '#A599FF' : colors.textMuted} style={{ marginRight: 4 }} />
                <Text style={[
                  styles.chipText,
                  { color: colors.textSecondary },
                  showCustomPicker && styles.chipTextActive,
                ]}>
                  {showCustomPicker ? minutesTo12HourStr(customTime.getHours() * 60 + customTime.getMinutes()) : 'Custom'}
                </Text>
              </TouchableOpacity>
            </ScrollView>

            {showCustomPicker && (
              <View style={styles.pickerContainer}>
                <DateTimePicker
                  value={customTime}
                  mode="time"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(_, d) => { if (d) setCustomTime(d); }}
                  textColor={colors.textPrimary}
                />
              </View>
            )}
          </View>

          {/* SECTION 2: How long did you actually work? */}
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                2. How long did you actually work?
              </Text>
              {plannedMinutes ? (
                <Text style={styles.plannedHint}>
                  Planned: {formatMinDisplay(plannedMinutes)}
                </Text>
              ) : null}
            </View>

            <View style={styles.chipGrid}>
              {durationChips.map((chip) => {
                const isSelected = selectedDuration === chip.minutes;
                const isPlanned = plannedMinutes === chip.minutes;
                return (
                  <TouchableOpacity
                    key={chip.minutes}
                    style={[
                      styles.chip,
                      { backgroundColor: colors.surface2, borderColor: colors.border },
                      isSelected && styles.chipActiveGreen,
                      isPlanned && !isSelected && styles.chipPlannedBorder,
                    ]}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setSelectedDuration(chip.minutes);
                    }}
                  >
                    {isPlanned && !isSelected && (
                      <View style={styles.plannedDot} />
                    )}
                    <Text style={[
                      styles.chipText,
                      { color: colors.textSecondary },
                      isSelected && styles.chipTextActiveGreen,
                      isPlanned && !isSelected && { color: '#A599FF', fontFamily: FONT_FAMILY.bold },
                    ]}>
                      {chip.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </ScrollView>

        {/* Action Buttons */}
        <View style={[styles.footer, { borderTopColor: colors.border }]}>
          <TouchableOpacity
            style={[styles.btn, styles.btnSkip, { borderColor: colors.border, backgroundColor: colors.surface2 }]}
            onPress={handleSkip}
          >
            <Text style={[styles.btnSkipText, { color: colors.textSecondary }]}>Skip</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btn, styles.btnSave]}
            onPress={handleSave}
          >
            <Ionicons name="checkmark" size={16} color="#000000" style={{ marginRight: 6 }} />
            <Text style={styles.btnSaveText}>Save</Text>
          </TouchableOpacity>
        </View>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: SPACE.md,
    marginHorizontal: -20,
    marginTop: -10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    marginBottom: SPACE.md,
  },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(165, 153, 255, 0.12)',
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
    backgroundColor: 'rgba(165, 153, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(165, 153, 255, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: RADIUS.md,
    alignSelf: 'flex-start',
  },
  plannedTimeText: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 10,
    color: '#A599FF',
  },
  scrollArea: {
    maxHeight: 400,
  },
  section: {
    marginBottom: SPACE.lg,
    paddingHorizontal: 20,
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
    color: '#A599FF',
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
    backgroundColor: 'rgba(165, 153, 255, 0.12)',
    borderColor: 'rgba(165, 153, 255, 0.4)',
  },
  chipActiveGreen: {
    backgroundColor: 'rgba(94,218,158,0.12)',
    borderColor: '#5eda9e',
  },
  chipPlannedBorder: {
    borderColor: 'rgba(165, 153, 255, 0.3)',
    backgroundColor: 'rgba(165, 153, 255, 0.04)',
  },
  chipText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: FONT_SIZE.sm,
  },
  chipTextActive: {
    color: '#A599FF',
    fontFamily: FONT_FAMILY.bold,
  },
  chipTextActiveGreen: {
    color: '#5eda9e',
    fontFamily: FONT_FAMILY.bold,
  },
  plannedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#A599FF',
    marginRight: 6,
  },
  pickerContainer: {
    marginTop: SPACE.sm,
    alignItems: 'center',
  },
  footer: {
    flexDirection: 'row',
    gap: SPACE.md,
    paddingHorizontal: 20,
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
    backgroundColor: '#5eda9e',
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
