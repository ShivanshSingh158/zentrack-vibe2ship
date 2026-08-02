/**
 * TimeSpentSheet.tsx — ZenTrack Mobile
 *
 * Analytics bottom sheet showing planned vs actual time per task.
 * Opens via the ⏱ button in the TasksScreen header.
 *
 * Features:
 * - Summary row: total planned, total actual, efficiency %
 * - Per-task dual bar: grey/purple = planned, green/red = actual
 * - Tasks with no time data grouped as "Untracked" at the bottom
 */

import React, { useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity
} from 'react-native';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Task } from '../../contexts/MobileDataContext';
import { FONT_FAMILY, FONT_SIZE, SPACE, RADIUS } from '../../theme/tokens';
import { useTheme } from '../../contexts/ThemeContext';
import BottomSheet from '../ui/BottomSheet';

interface TimeSpentSheetProps {
  visible: boolean;
  onClose: () => void;
  tasks: Task[];
  selectedDate: string;
}

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

function getPlannedMinutes(task: Task): number | null {
  if (task.estimatedMinutes) return task.estimatedMinutes;
  if (task.timeSlot) {
    const parts = task.timeSlot.split(/[-–]/).map(s => s.trim());
    const startMin = parseTimeStrMinutes(parts[0]);
    const endMin = parts.length > 1 ? parseTimeStrMinutes(parts[1]) : null;
    if (startMin !== null && endMin !== null) {
      let duration = endMin - startMin;
      if (duration < 0) duration += 24 * 60; // handle cross-midnight if it happens
      return duration > 0 ? duration : null;
    }
  }
  return null;
}

function formatMinutes(min: number): string {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function priorityColor(priority?: string): string {
  if (priority === 'high' || priority === 'P1') return '#ff6961';
  if (priority === 'medium' || priority === 'P2') return '#ff9f4d';
  return '#a599ff'; // low or unset
}

// ── Bar Component ─────────────────────────────────────────────────────────────

function DualBar({ planned, actual, colors }: {
  planned?: number | null;
  actual?: number | null;
  colors: any;
}) {
  const maxRef = Math.max(planned || 0, actual || 0, 30); // at least 30m to avoid zero width

  const plannedFrac = planned ? Math.min(planned / maxRef, 1) : 0;
  const actualFrac = actual ? Math.min(actual / maxRef, 1) : 0;
  const isOver = actual && planned && actual > planned;

  return (
    <View style={barStyles.container}>
      {/* Planned bar */}
      {planned ? (
        <View style={barStyles.row}>
          <Text style={[barStyles.label, { color: colors.textMuted }]}>Plan</Text>
          <View style={[barStyles.track, { backgroundColor: 'rgba(255,255,255,0.05)' }]}>
            <Animated.View
              entering={FadeInRight.delay(100).duration(500)}
              style={[barStyles.fill, { flex: plannedFrac, backgroundColor: 'rgba(165,153,255,0.4)' }]}
            />
          </View>
          <Text style={[barStyles.value, { color: '#a599ff' }]}>{formatMinutes(planned)}</Text>
        </View>
      ) : null}

      {/* Actual bar */}
      {actual ? (
        <View style={barStyles.row}>
          <Text style={[barStyles.label, { color: colors.textMuted }]}>Real</Text>
          <View style={[barStyles.track, { backgroundColor: 'rgba(255,255,255,0.05)' }]}>
            <Animated.View
              entering={FadeInRight.delay(200).duration(500)}
              style={[barStyles.fill, { flex: actualFrac, backgroundColor: isOver ? '#ff6961' : '#5eda9e' }]}
            />
          </View>
          <Text style={[barStyles.value, { color: isOver ? '#ff6961' : '#5eda9e' }]}>{formatMinutes(actual)}</Text>
        </View>
      ) : null}
    </View>
  );
}

const barStyles = StyleSheet.create({
  container: { marginTop: 10, gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center' },
  label: { fontFamily: FONT_FAMILY.medium, fontSize: 11, width: 36, textAlign: 'left' },
  track: { height: 8, borderRadius: 4, overflow: 'hidden', flexDirection: 'row', flex: 1, marginRight: 8 },
  fill: { height: '100%', borderRadius: 4 },
  value: { fontFamily: FONT_FAMILY.bold, fontSize: 12, width: 44, textAlign: 'right' },
});

// ── Task Row ──────────────────────────────────────────────────────────────────

function TaskTimeRow({ task, index, colors }: { task: Task; index: number; colors: any }) {
  const actual = task.actualMinutes;
  const planned = getPlannedMinutes(task);
  
  return (
    <Animated.View
      entering={FadeInDown.delay(index * 60).duration(400)}
      style={[taskRowStyles.card, { backgroundColor: colors.surface2, borderColor: colors.border }]}
    >
      {/* Priority stripe */}
      <View style={[taskRowStyles.stripe, { backgroundColor: priorityColor(task.priority) }]} />

      <View style={{ flex: 1 }}>
        <View style={taskRowStyles.titleRow}>
          <Text style={[taskRowStyles.title, { color: colors.textPrimary }]} numberOfLines={1}>
            {task.title}
          </Text>
          {task.status === 'completed' && (
            <Ionicons name="checkmark-circle" size={16} color="#5eda9e" style={{ marginLeft: 6 }} />
          )}
        </View>

        {(task.timeSlot || task.actualStartTime) && (
          <View style={taskRowStyles.timeRow}>
            {task.timeSlot && (
              <View style={taskRowStyles.timeSubBox}>
                <Ionicons name="calendar-outline" size={10} color={colors.textMuted} style={{ marginRight: 4 }} />
                <Text style={[taskRowStyles.timeText, { color: colors.textMuted }]}>{task.timeSlot}</Text>
              </View>
            )}
            
            {task.timeSlot && task.actualStartTime && (
              <Ionicons name="arrow-forward" size={10} color={colors.textMuted} style={{ marginHorizontal: 6 }} />
            )}
            
            {task.actualStartTime && (
              <View style={taskRowStyles.timeSubBox}>
                <Text style={[taskRowStyles.timeText, { color: colors.textMuted }]}>
                  Actually started: {task.actualStartTime}
                </Text>
              </View>
            )}
          </View>
        )}

        <DualBar planned={planned} actual={actual} colors={colors} />
      </View>
    </Animated.View>
  );
}

const taskRowStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    marginBottom: SPACE.md,
    overflow: 'hidden',
    padding: SPACE.md,
    paddingLeft: SPACE.md + 8,
  },
  stripe: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  title: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: FONT_SIZE.md,
    flex: 1,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 2,
  },
  timeSubBox: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  timeText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 11,
  },
});

// ── Main Component ────────────────────────────────────────────────────────────

export default function TimeSpentSheet({ visible, onClose, tasks, selectedDate }: TimeSpentSheetProps) {
  const { colors } = useTheme();

  // Only show tasks for the selected date
  const dateTasks = useMemo(() =>
    tasks.filter(t => t.date === selectedDate),
    [tasks, selectedDate]
  );

  // Separate tracked vs untracked
  const trackedTasks = useMemo(() =>
    dateTasks.filter(t => getPlannedMinutes(t) || t.actualMinutes),
    [dateTasks]
  );
  
  const untrackedTasks = useMemo(() =>
    dateTasks.filter(t => !getPlannedMinutes(t) && !t.actualMinutes),
    [dateTasks]
  );

  // Summary numbers
  const totalPlanned = useMemo(() =>
    trackedTasks.reduce((sum, t) => sum + (getPlannedMinutes(t) || 0), 0),
    [trackedTasks]
  );
  
  const totalActual = useMemo(() =>
    trackedTasks.reduce((sum, t) => sum + (t.actualMinutes || 0), 0),
    [trackedTasks]
  );

  const formattedDate = useMemo(() => {
    const d = new Date(selectedDate + 'T12:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }, [selectedDate]);

  const isOver = totalActual > totalPlanned;

  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <View style={{ paddingBottom: 40, maxHeight: 650, marginHorizontal: -20, marginTop: -10 }}>

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Ionicons name="timer-outline" size={24} color="#a599ff" />
            <View style={{ marginLeft: SPACE.md }}>
              <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>Time Spent</Text>
              <Text style={[styles.headerSub, { color: colors.textMuted }]}>{formattedDate}</Text>
            </View>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={24} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        <View style={[styles.divider, { backgroundColor: colors.border }]} />

        {/* Summary Boxes */}
        {(totalPlanned > 0 || totalActual > 0) && (
          <View style={styles.summaryRow}>
            <View style={[styles.summaryBox, { backgroundColor: 'rgba(165,153,255,0.06)', borderColor: 'rgba(165,153,255,0.15)' }]}>
              <Text style={[styles.summaryBoxLabel, { color: '#a599ff' }]}>PLANNED</Text>
              <Text style={[styles.summaryBoxValue, { color: '#a599ff' }]}>
                {totalPlanned > 0 ? formatMinutes(totalPlanned) : '–'}
              </Text>
            </View>
            <View style={[styles.summaryBox, { backgroundColor: isOver ? 'rgba(255,105,97,0.06)' : 'rgba(94,218,158,0.06)', borderColor: isOver ? 'rgba(255,105,97,0.15)' : 'rgba(94,218,158,0.15)' }]}>
              <Text style={[styles.summaryBoxLabel, { color: isOver ? '#ff6961' : '#5eda9e' }]}>ACTUAL</Text>
              <Text style={[styles.summaryBoxValue, { color: isOver ? '#ff6961' : '#5eda9e' }]}>
                {totalActual > 0 ? formatMinutes(totalActual) : '–'}
              </Text>
            </View>
          </View>
        )}

        <View style={[styles.divider, { backgroundColor: colors.border, marginTop: SPACE.md }]} />

        <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
          {/* Tracked tasks */}
          {trackedTasks.length > 0 && (
            <>
              <Text style={[styles.groupLabel, { color: colors.textMuted }]}>TRACKED</Text>
              {trackedTasks.map((t, i) => (
                <TaskTimeRow key={t.id} task={t} index={i} colors={colors} />
              ))}
            </>
          )}

          {/* Untracked tasks */}
          {untrackedTasks.length > 0 && (
            <>
              <Text style={[styles.groupLabel, { color: colors.textMuted, marginTop: SPACE.md }]}>UNTRACKED</Text>
              {untrackedTasks.map((t, i) => (
                <Animated.View
                  key={t.id}
                  entering={FadeInDown.delay((trackedTasks.length + i) * 60).duration(400)}
                  style={[styles.untrackedRow, { backgroundColor: colors.surface2, borderColor: colors.border }]}
                >
                  <View style={[styles.untrackedStripe, { backgroundColor: priorityColor(t.priority) }]} />
                  <Text style={[styles.untrackedTitle, { color: colors.textSecondary }]} numberOfLines={1}>
                    {t.title}
                  </Text>
                  <Text style={[styles.untrackedHint, { color: colors.textMuted }]}>No time logged</Text>
                </Animated.View>
              ))}
            </>
          )}

          {/* Empty */}
          {dateTasks.length === 0 && (
            <View style={styles.emptyContainer}>
              <Ionicons name="timer-outline" size={48} color={colors.border} />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>
                No tasks for this day yet.
              </Text>
            </View>
          )}
          
          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </BottomSheet>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 0,
    paddingBottom: SPACE.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 20,
  },
  headerSub: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: FONT_SIZE.sm,
    marginTop: 2,
  },
  closeBtn: {
    padding: SPACE.sm,
  },
  divider: {
    height: 1,
    marginHorizontal: 0,
  },
  summaryRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: SPACE.lg,
    gap: SPACE.md,
  },
  summaryBox: {
    flex: 1,
    paddingVertical: SPACE.lg,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryBoxLabel: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  summaryBoxValue: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 24,
  },
  list: {
    paddingHorizontal: 20,
    paddingTop: SPACE.lg,
  },
  groupLabel: {
    fontFamily: FONT_FAMILY.bold,
    fontSize: 11,
    letterSpacing: 1.2,
    marginBottom: SPACE.md,
  },
  untrackedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: RADIUS.md,
    borderWidth: 1,
    marginBottom: SPACE.sm,
    padding: SPACE.md,
    paddingLeft: SPACE.md + 8,
    gap: SPACE.md,
    overflow: 'hidden',
  },
  untrackedStripe: {
    position: 'absolute',
    left: 0, top: 0, bottom: 0,
    width: 4,
  },
  untrackedTitle: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: FONT_SIZE.md,
    flex: 1,
  },
  untrackedHint: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: 11,
    fontStyle: 'italic',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 80,
    gap: SPACE.md,
  },
  emptyText: {
    fontFamily: FONT_FAMILY.medium,
    fontSize: FONT_SIZE.md,
  },
});
